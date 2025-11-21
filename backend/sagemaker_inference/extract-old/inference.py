"""
SageMaker Inference Script for HemaScan
Handles both prediction and Grad CAM generation
Runs inside SageMaker PyTorch container
"""

import json
import os
import base64
import io
import numpy as np
import torch
import torch.nn as nn
from torchvision import models
from PIL import Image
import cv2

# Optional Grad CAM imports (only needed for gradcam action)
try:
    from pytorch_grad_cam import GradCAM
    from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
    from pytorch_grad_cam.utils.image import show_cam_on_image
    GRAD_CAM_AVAILABLE = True
except ImportError:
    GRAD_CAM_AVAILABLE = False
    print("WARNING: pytorch_grad_cam not available. Grad CAM functionality disabled.")

# Global variables for model and config
model = None
config = None
IMG_SIZE = None
MEAN = None
STD = None
CLASSES = None


def model_fn(model_dir):
    """
    Load the model when the container starts
    Called once when the endpoint is created
    """
    global model, config, IMG_SIZE, MEAN, STD, CLASSES
    
    print("🔄 Loading PyTorch model from SageMaker...")
    
    try:
        # Load config - MUST be in model package
        config_path = os.path.join(model_dir, "config.json")
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"config.json not found in {model_dir}. Model package must include config.json file.")
        
        with open(config_path, "r") as f:
            config = json.load(f)
        
        # Load model weights - MUST be in model package
        model_path = os.path.join(model_dir, "leukemia_best.pt")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"leukemia_best.pt not found in {model_dir}. Model package must include leukemia_best.pt file.")
        
        # Create model architecture (ResNet18)
        model = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
        
        # Modify final layer for binary classification
        num_classes = 2
        in_features = model.fc.in_features
        model.fc = nn.Linear(in_features, num_classes)
        
        # Load the trained weights
        model.load_state_dict(torch.load(model_path, map_location="cpu"))
        
        # Convert model to float32
        model = model.float()
        model.eval()
        
        # Set config values
        IMG_SIZE = config["img_size"]
        MEAN = np.array(config["mean"])
        STD = np.array(config["std"])
        CLASSES = config["classes"]
        
        print(f"✅ Model loaded successfully!")
        print(f"   - Classes: {CLASSES}")
        print(f"   - Image size: {IMG_SIZE}x{IMG_SIZE}")
        
        return model
        
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        import traceback
        traceback.print_exc()
        raise


def input_fn(request_body, request_content_type):
    """
    Parse incoming request
    Accepts JSON with base64-encoded image
    """
    global IMG_SIZE, MEAN, STD
    
    try:
        # Validate globals are initialized
        if IMG_SIZE is None or MEAN is None or STD is None:
            raise ValueError("Preprocessing parameters not initialized. Model may not have loaded correctly.")
        
        if request_content_type == 'application/json':
            data = json.loads(request_body)
            
            # Get action type (predict or gradcam)
            action = data.get('action', 'predict')
            
            # Decode base64 image
            image_base64 = data.get('image', '')
            if not image_base64:
                raise ValueError("No image data provided in request")
            
            image_bytes = base64.b64decode(image_base64)
            
            if len(image_bytes) == 0:
                raise ValueError("Decoded image bytes are empty")
            
            # Preprocess image
            image_tensor = preprocess_image(image_bytes)
            
            return {
                'action': action,
                'image_tensor': image_tensor,
                'original_data': data
            }
        else:
            raise ValueError(f"Unsupported content type: {request_content_type}")
    except Exception as e:
        print(f"ERROR in input_fn: {e}")
        import traceback
        traceback.print_exc()
        raise


def preprocess_image(image_bytes):
    """Convert image bytes to model input tensor"""
    try:
        # Load image
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = img.resize((IMG_SIZE, IMG_SIZE))
        
        # Convert to numpy array
        img_array = np.array(img).astype(np.float32) / 255.0
        
        # Normalize using ImageNet statistics
        img_array = (img_array - MEAN) / STD
        
        # Convert to tensor (NCHW format) with float32 dtype
        img_tensor = torch.from_numpy(img_array).permute(2, 0, 1).unsqueeze(0).float()
        
        return img_tensor
    except Exception as e:
        print(f"❌ Preprocessing error: {e}")
        raise


def denorm(batch):
    """Denormalize image tensor back to 0-1 range"""
    mean = torch.tensor([0.485, 0.456, 0.406], device=batch.device).view(1, 3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225], device=batch.device).view(1, 3, 1, 1)
    return torch.clamp(batch * std + mean, 0, 1)


def generate_gradcam(image_tensor, model):
    """Generate Grad CAM visualization"""
    try:
        target_layer = model.layer4[-1]
        
        with GradCAM(model=model, target_layers=[target_layer]) as cam:
            with torch.no_grad():
                logits = model(image_tensor)
            pred = int(torch.argmax(logits, dim=1).item())
            grayscale_cam = cam(input_tensor=image_tensor, targets=[ClassifierOutputTarget(pred)])[0]
        
        # Proper normalization
        cam_min = grayscale_cam.min()
        cam_max = grayscale_cam.max()
        
        if cam_max > cam_min:
            grayscale_cam = (grayscale_cam - cam_min) / (cam_max - cam_min)
        else:
            grayscale_cam = np.ones_like(grayscale_cam) * 0.5
        
        # Denormalize original image
        rgb_img = denorm(image_tensor).squeeze(0).permute(1, 2, 0).cpu().numpy()
        rgb_img = np.clip(rgb_img, 0, 1)
        
        # Create overlay
        vis = show_cam_on_image(rgb_img, grayscale_cam, use_rgb=True)
        
        print(f"✅ Grad CAM generated")
        
        return grayscale_cam, vis, rgb_img
    except Exception as e:
        print(f"❌ Grad CAM error: {e}")
        import traceback
        traceback.print_exc()
        raise


def predict_fn(input_data, model):
    """
    Run inference based on action type
    Returns prediction or Grad CAM result
    """
    global CLASSES
    
    try:
        # Validate globals are initialized
        if CLASSES is None:
            raise ValueError("CLASSES not initialized. Model may not have loaded correctly.")
        if model is None:
            raise ValueError("Model not initialized.")
        
        action = input_data.get('action', 'predict')
        image_tensor = input_data.get('image_tensor')
        
        if image_tensor is None:
            raise ValueError("image_tensor is None in input_data")
        
        if action == 'gradcam':
            # Generate Grad CAM
            if not GRAD_CAM_AVAILABLE:
                return {
                    'error': 'Grad CAM functionality not available. pytorch_grad_cam module not installed.',
                    'success': False
                }
            grayscale_cam, overlay_image, rgb_img = generate_gradcam(image_tensor, model)
            
            if overlay_image is not None:
                # Convert overlay to base64
                overlay_bgr = cv2.cvtColor((overlay_image * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
                
                # Encode to base64
                _, buffer = cv2.imencode('.png', overlay_bgr)
                overlay_base64 = base64.b64encode(buffer).decode('utf-8')
                overlay_url = f"data:image/png;base64,{overlay_base64}"
                
                return {
                    'overlayImageUrl': overlay_url,
                    'heatmapImageUrl': overlay_url,  # For backward compatibility
                    'success': True
                }
            else:
                return {
                    'error': 'Failed to generate Grad CAM',
                    'success': False
                }
        
        else:
            # Regular prediction
            with torch.no_grad():
                logits = model(image_tensor)
                probs = torch.softmax(logits, dim=1)[0]
                
                confidence = probs.max().item() * 100
                pred_idx = probs.argmax().item()
                
                if pred_idx >= len(CLASSES):
                    raise ValueError(f"Prediction index {pred_idx} out of range for CLASSES length {len(CLASSES)}")
                
                diagnosis = CLASSES[pred_idx]
            
            # Format diagnosis
            if diagnosis.lower() == "leukemia":
                diagnosis_text = "Leukemia Detected"
            else:
                diagnosis_text = "Normal Blood Smear"
            
            return {
                'diagnosis': diagnosis_text,
                'confidence': round(confidence, 2),
                'class': diagnosis,
                'probabilities': {
                    CLASSES[0]: round(probs[0].item() * 100, 2),
                    CLASSES[1]: round(probs[1].item() * 100, 2)
                },
                'success': True
            }
    except Exception as e:
        print(f"ERROR in predict_fn: {e}")
        import traceback
        traceback.print_exc()
        return {
            'error': str(e),
            'success': False
        }


def output_fn(prediction, accept):
    """
    Format the prediction response
    """
    if accept == 'application/json':
        return json.dumps(prediction), accept
    else:
        return json.dumps(prediction), 'application/json'

