"""
HemaScan Backend - Local Development
Integrates PyTorch model (leukemia_best.pt) with FastAPI
Run: uvicorn main.py --reload
Access: http://localhost:8000
"""

from fastapi import FastAPI, UploadFile, File, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
import torch.nn as nn
from torchvision import models
import json
from PIL import Image
import io
import numpy as np
from datetime import datetime
from pathlib import Path
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
from pytorch_grad_cam.utils.image import show_cam_on_image
import base64

# ==================== SETUP ====================
app = FastAPI(title="HemaScan Backend", version="0.1.0")

# CORS Configuration - Support both local development and production
import os
cors_origins = os.getenv("CORS_ORIGIN", "http://localhost:5173,http://localhost:3000").split(",")
# Clean up any whitespace
cors_origins = [origin.strip() for origin in cors_origins]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== REQUEST MODELS ====================
class ChatRequest(BaseModel):
    message: str
    analysis_context: dict = None
    vital_signs: dict = None

# ==================== LOAD MODEL ====================
print("🔄 Loading PyTorch model...")
try:
    with open("models/config.json", "r") as f:
        config = json.load(f)
    
    # Create model architecture (ResNet18)
    model = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
    
    # Modify final layer for binary classification
    num_classes = 2
    in_features = model.fc.in_features
    model.fc = nn.Linear(in_features, num_classes)
    
    # Load the trained weights
    model.load_state_dict(torch.load("models/leukemia_best.pt", map_location="cpu"))
    
    # Convert model to float32
    model = model.float()
    model.eval()
    
    IMG_SIZE = config["img_size"]
    MEAN = config["mean"]
    STD = config["std"]
    CLASSES = config["classes"]
    
    print(f"✅ Model loaded successfully!")
    print(f"   - Classes: {CLASSES}")
    print(f"   - Image size: {IMG_SIZE}x{IMG_SIZE}")
    
except Exception as e:
    print(f"❌ Error loading model: {e}")

# ==================== UTILITIES ====================

def preprocess_image(image_bytes):
    """Convert uploaded image to model input tensor"""
    try:
        if not image_bytes or len(image_bytes) == 0:
            print("❌ Preprocessing error: Empty image data")
            return None
        
        print(f"📸 Preprocessing image: {len(image_bytes)} bytes")
        
        # Load image
        try:
            img = Image.open(io.BytesIO(image_bytes))
            print(f"   Image format: {img.format}, Mode: {img.mode}, Size: {img.size}")
        except Exception as e:
            print(f"❌ Error opening image: {e}")
            return None
        
        # Convert to RGB if needed
        if img.mode != 'RGB':
            print(f"   Converting from {img.mode} to RGB")
            img = img.convert("RGB")
        
        # Resize
        img = img.resize((IMG_SIZE, IMG_SIZE))
        print(f"   Resized to: {IMG_SIZE}x{IMG_SIZE}")
        
        # Convert to numpy array
        img_array = np.array(img).astype(np.float32) / 255.0
        print(f"   Array shape: {img_array.shape}, Range: [{img_array.min():.3f}, {img_array.max():.3f}]")
        
        # Normalize using ImageNet statistics
        img_array = (img_array - np.array(MEAN)) / np.array(STD)
        print(f"   Normalized range: [{img_array.min():.3f}, {img_array.max():.3f}]")
        
        # Convert to tensor (NCHW format) with float32 dtype
        img_tensor = torch.from_numpy(img_array).permute(2, 0, 1).unsqueeze(0).float()
        print(f"✅ Preprocessing successful: tensor shape {img_tensor.shape}, dtype {img_tensor.dtype}")
        
        return img_tensor
    except Exception as e:
        print(f"❌ Preprocessing error: {e}")
        import traceback
        traceback.print_exc()
        return None

def save_report(diagnosis, confidence):
    """Save analysis report to file (or return in-memory for Lambda)"""
    timestamp = datetime.now().strftime("%Y_%m_%d_%H_%M_%S")
    
    # Create report
    report = {
        "diagnosis": diagnosis,
        "confidence": round(confidence, 2),
        "timestamp": timestamp
    }
    
    # For Lambda: don't save to disk, just return report
    # For EB/local: save to file
    if os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
        # Running on Lambda - don't save files
        print(f"✅ Report generated: {timestamp}")
    else:
        # Running on EB/local - save to file
        Path("results/analysis").mkdir(parents=True, exist_ok=True)
        filepath = f"results/analysis/report_{timestamp}.json"
        with open(filepath, "w") as f:
            json.dump(report, f, indent=2)
        print(f"✅ Report saved: {filepath}")
    
    return report

def denorm(batch):
    """Denormalize image tensor back to 0-1 range (from hemascanmodel.py)"""
    mean = torch.tensor([0.485, 0.456, 0.406], device=batch.device).view(1, 3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225], device=batch.device).view(1, 3, 1, 1)
    return torch.clamp(batch * std + mean, 0, 1)

def generate_gradcam(image_tensor, model_output_idx):
    """Generate Grad CAM visualization - Medical Imaging Best Practices"""
    try:
        target_layer = model.layer4[-1]
        
        with GradCAM(model=model, target_layers=[target_layer]) as cam:
            with torch.no_grad():
                logits = model(image_tensor)
            pred = int(torch.argmax(logits, dim=1).item())
            grayscale_cam = cam(input_tensor=image_tensor, targets=[ClassifierOutputTarget(pred)])[0]
        
        # Proper normalization: ensure values are in [0,1] range
        # Medical imaging standard: normalize to full range for better visibility
        cam_min = grayscale_cam.min()
        cam_max = grayscale_cam.max()
        
        if cam_max > cam_min:
            grayscale_cam = (grayscale_cam - cam_min) / (cam_max - cam_min)
        else:
            grayscale_cam = np.ones_like(grayscale_cam) * 0.5
        
        # Denormalize original image
        rgb_img = denorm(image_tensor).squeeze(0).permute(1, 2, 0).cpu().numpy()
        rgb_img = np.clip(rgb_img, 0, 1)
        
        # Create overlay using medical imaging standard colormap
        # The show_cam_on_image function uses a fixed blend ratio internally
        vis = show_cam_on_image(rgb_img, grayscale_cam, use_rgb=True)
        
        print(f"✅ Grad CAM generated - original range: [{cam_min:.3f}, {cam_max:.3f}], normalized: [{grayscale_cam.min():.3f}, {grayscale_cam.max():.3f}]")
        
        return grayscale_cam, vis, rgb_img
    except Exception as e:
        print(f"❌ Grad CAM error: {e}")
        import traceback
        traceback.print_exc()
        return None, None, None

def save_gradcam_overlay(timestamp, overlay_image):
    """Save only Grad CAM overlay - Medical Imaging Best Practice"""
    try:
        import cv2
        
        # Convert overlay from RGB to BGR for cv2 (overlay_image is already in [0,1] range)
        overlay_bgr = cv2.cvtColor((overlay_image * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
        
        # For Lambda: encode directly to base64 without saving
        # For EB/local: save to file then encode
        if os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
            # Lambda: encode directly from memory
            _, buffer = cv2.imencode('.png', overlay_bgr)
            overlay_base64 = base64.b64encode(buffer).decode('utf-8')
            overlay_url = f"data:image/png;base64,{overlay_base64}"
            print(f"✅ Grad CAM overlay encoded")
        else:
            # EB/local: save to file then encode
            Path("results/overlays").mkdir(parents=True, exist_ok=True)
            overlay_path = f"results/overlays/overlay_{timestamp}.png"
            cv2.imwrite(overlay_path, overlay_bgr)
            with open(overlay_path, 'rb') as f:
                overlay_base64 = base64.b64encode(f.read()).decode('utf-8')
            overlay_url = f"data:image/png;base64,{overlay_base64}"
            print(f"✅ Grad CAM overlay saved: {overlay_path}")
        
        return overlay_url
    except Exception as e:
        print(f"❌ Error saving Grad CAM: {e}")
        import traceback
        traceback.print_exc()
        return None

# ==================== ENDPOINTS ====================

@app.get("/")
async def root():
    """Health check"""
    return {
        "status": "🟢 HemaScan Backend Running",
        "model": "ResNet18",
        "endpoints": [
            "POST /api/auth/login",
            "POST /api/analyze",
            "POST /api/chat"
        ]
    }

@app.get("/docs")
async def docs():
    """API documentation"""
    return {
        "title": "HemaScan API",
        "description": "Blood smear analysis with PyTorch",
        "swagger": "http://localhost:8000/docs"
    }

@app.get("/test")
async def test():
    """Test endpoint to verify backend is working"""
    return {"status": "Backend is working!"}

# ==================== AUTHENTICATION ====================

@app.post("/api/auth/login")
async def login(username: str, password: str):
    """
    Mock authentication for local testing
    Accepts any username/password combination
    Returns JWT-like token
    """
    token = f"mock_token_{username}_{int(datetime.now().timestamp())}"
    
    return {
        "success": True,
        "token": token,
        "user": {
            "username": username,
            "role": "doctor"
        }
    }

# ==================== ANALYSIS ====================

@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Analyze blood smear image with PyTorch model
    Returns: diagnosis + confidence score + Grad CAM visualizations
    Saves report and images to results/
    """
    try:
        if not file:
            return {"error": "No file provided"}
        
        print(f"📸 Processing image: {file.filename}")
        print(f"   File type: {file.content_type}")
        
        # Read uploaded image
        image_data = await file.read()
        print(f"   File size: {len(image_data)} bytes")
        
        # Preprocess
        image_tensor = preprocess_image(image_data)
        if image_tensor is None:
            return {"error": "Failed to preprocess image"}
        
        # Run inference
        with torch.no_grad():
            logits = model(image_tensor)
            probs = torch.softmax(logits, dim=1)[0]
            
            confidence = probs.max().item() * 100
            pred_idx = probs.argmax().item()
            diagnosis = CLASSES[pred_idx]
        
        # Format diagnosis nicely
        if diagnosis.lower() == "leukemia":
            diagnosis_text = "🔴 Leukemia Detected"
        else:
            diagnosis_text = "🟢 Normal Blood Smear"
        
        print(f"✅ Analysis complete: {diagnosis_text} ({confidence:.1f}%)")
        
        # Initialize response (NO GRAD CAM HERE - just diagnosis)
        result = {
            "diagnosis": diagnosis_text,
            "confidence": round(confidence, 2),
            "timestamp": datetime.now().strftime("%Y_%m_%d_%H_%M_%S")
        }
        
        # Save report
        save_report(diagnosis_text, confidence)
        
        return result
        
    except Exception as e:
        print(f"❌ Analysis error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

# ==================== GRAD CAM (SEPARATE ENDPOINT) ====================

@app.post("/api/generate-gradcam")
async def generate_gradcam_endpoint(file: UploadFile = File(...)):
    """
    Generate Grad CAM visualization - SEPARATE API CALL
    Call this AFTER analyze to get heatmap + overlay
    """
    try:
        print(f"🎯 Generating Grad CAM for: {file.filename}")
        
        # Read uploaded image
        image_data = await file.read()
        
        # Preprocess
        image_tensor = preprocess_image(image_data)
        if image_tensor is None:
            return {"error": "Failed to preprocess image"}
        
        # Get prediction
        with torch.no_grad():
            logits = model(image_tensor)
            pred_idx = logits.argmax(dim=1).item()
        
        # Generate Grad CAM
        print(f"🎯 Generating Grad CAM visualization...")
        timestamp = datetime.now().strftime("%Y_%m_%d_%H_%M_%S")
        grayscale_cam, overlay_image, rgb_img = generate_gradcam(image_tensor, pred_idx)
        
        # Initialize response
        result = {
            "timestamp": timestamp
        }
        
        # Save only overlay (best practice for medical imaging)
        if overlay_image is not None:
            overlay_url = save_gradcam_overlay(timestamp, overlay_image)
            if overlay_url:
                result["overlayImageUrl"] = overlay_url
                # For backward compatibility, set heatmapImageUrl to same as overlay
                result["heatmapImageUrl"] = overlay_url
        
        return result
        
    except Exception as e:
        print(f"❌ Grad CAM error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

# ==================== CHAT ====================

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Mock AI chat for local testing
    In production: integrate with OpenAI/Claude
    """
    try:
        # For local testing: return smart mock response
        message = request.message
        analysis_context = request.analysis_context or {}
        vital_signs = request.vital_signs or {}
        
        diagnosis = analysis_context.get("diagnosis", "Unknown")
        confidence = analysis_context.get("confidence", 0)
        heart_rate = vital_signs.get("heartRate", "--")
        spo2 = vital_signs.get("spO2", "--")
        
        response_text = f"""🤖 AI Assistant (Local Mock Mode):

📊 Analysis Summary:
- Diagnosis: {diagnosis}
- Confidence: {confidence}%
- Heart Rate: {heart_rate} BPM
- Blood Oxygen: {spo2}%

❓ Your Question: "{message}"

⚠️ Note: This is a mock response. In production, real AI (OpenAI/Claude) will provide medical insights based on the diagnosis and vital signs.

💡 Connected Features:
✅ Blood smear analysis with PyTorch
✅ Vital signs monitoring from AWS
✅ Report generation
⏳ Real AI integration (coming in production)"""
        
        return {
            "message": response_text,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"❌ Chat error: {e}")
        return {"error": str(e)}

# ==================== RUN ====================
if __name__ == "__main__":
    print("\n" + "="*50)
    print("🚀 HemaScan Backend Starting...")
    print("="*50)
    print("\n📍 Access at: http://localhost:8000")
    print("📚 Docs at: http://localhost:8000/docs")
    print("📡 Frontend at: http://localhost:5173")
    print("\n" + "="*50 + "\n")
    
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
