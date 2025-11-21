"""
SageMaker Inference Script for HemaScan
Handles both prediction and Grad CAM generation
Runs inside SageMaker PyTorch container
"""

# CRITICAL: Install grad-cam FIRST before any other imports
# This ensures it's available when we need it
import subprocess
import sys
import os

print("=" * 80)
print("SCRIPT STARTUP - INSTALLING GRAD-CAM")
print("=" * 80)

# Check if grad-cam is already installed
try:
    import pytorch_grad_cam
    print("SUCCESS: pytorch_grad_cam already installed")
    GRAD_CAM_AVAILABLE = True
except ImportError:
    print("WARNING: pytorch_grad_cam not found. Installing NOW...")
    print(f"Python: {sys.executable}")
    print(f"Version: {sys.version}")
    
    try:
        # Install WITHOUT --user flag (install to system site-packages)
        # Also add user site-packages to path if --user was used before
        import site
        user_site = site.getusersitepackages()
        if user_site and user_site not in sys.path:
            sys.path.insert(0, user_site)
            print(f"Added user site-packages to path: {user_site}")
        
        # Install WITHOUT --force-reinstall (too slow, causes timeout)
        # Just install if not already present
        print("Installing grad-cam (without force-reinstall to avoid timeout)...")
        result = subprocess.run([
            sys.executable, "-m", "pip", "install", 
            "--no-cache-dir", "--quiet",
            "grad-cam==1.5.5"
        ], capture_output=True, text=True, timeout=60)
        
        print(f"Install return code: {result.returncode}")
        if result.stdout:
            print(f"STDOUT:\n{result.stdout}")
        if result.stderr:
            print(f"STDERR:\n{result.stderr}")
        
        # Check if grad-cam was actually installed
        check_result = subprocess.run([
            sys.executable, "-m", "pip", "show", "grad-cam"
        ], capture_output=True, text=True, timeout=10)
        
        if check_result.returncode == 0:
            print(f"Package info:\n{check_result.stdout[:500]}")
        else:
            print(f"WARNING: pip show failed: {check_result.stderr}")
        
        if result.returncode == 0:
            # Add user site-packages to path (where --user installs go)
            import site
            user_site = site.getusersitepackages()
            if user_site and user_site not in sys.path:
                sys.path.insert(0, user_site)
                print(f"Added user site-packages to path: {user_site}")
            
            # Force Python to reload import cache
            import importlib
            importlib.invalidate_caches()
            
            # Try importing immediately
            try:
                import pytorch_grad_cam
                print(f"SUCCESS: Import works! Location: {pytorch_grad_cam.__file__}")
                GRAD_CAM_AVAILABLE = True
                print("SUCCESS: grad-cam installed and verified")
            except ImportError as import_err:
                # If import fails, try adding all site-packages
                all_site_packages = site.getsitepackages()
                for site_pkg in all_site_packages:
                    if site_pkg not in sys.path:
                        sys.path.insert(0, site_pkg)
                
                # Try import again
                try:
                    import pytorch_grad_cam
                    print(f"SUCCESS: Import works after path fix! Location: {pytorch_grad_cam.__file__}")
                    GRAD_CAM_AVAILABLE = True
                except ImportError:
                    GRAD_CAM_AVAILABLE = False
                    print(f"ERROR: Import still fails: {import_err}")
                    print(f"Python path: {sys.path[:3]}")
        else:
            GRAD_CAM_AVAILABLE = False
            print(f"ERROR: Installation failed with code {result.returncode}")
    except Exception as e:
        GRAD_CAM_AVAILABLE = False
        print(f"ERROR: Installation exception: {e}")
        import traceback
        traceback.print_exc()

print(f"GRAD_CAM_AVAILABLE = {GRAD_CAM_AVAILABLE}")
print("=" * 80)

# Now do regular imports
import json
import base64
import io
import numpy as np
import torch
import torch.nn as nn
from torchvision import models
from PIL import Image
import cv2

# Import grad-cam if available (these will be used in generate_gradcam function)
# We import them here so they're available globally
GradCAM = None
ClassifierOutputTarget = None
show_cam_on_image = None

if GRAD_CAM_AVAILABLE:
    try:
        from pytorch_grad_cam import GradCAM as _GradCAM
        from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget as _ClassifierOutputTarget
        from pytorch_grad_cam.utils.image import show_cam_on_image as _show_cam_on_image
        GradCAM = _GradCAM
        ClassifierOutputTarget = _ClassifierOutputTarget
        show_cam_on_image = _show_cam_on_image
        print("SUCCESS: Grad CAM imports completed and assigned to globals")
    except Exception as e:
        print(f"ERROR: Failed to import Grad CAM classes: {e}")
        import traceback
        traceback.print_exc()
        GRAD_CAM_AVAILABLE = False
else:
    print("WARNING: Grad CAM not available - imports skipped")

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
    global model, config, IMG_SIZE, MEAN, STD, CLASSES, GRAD_CAM_AVAILABLE
    
    # Double-check Grad CAM availability (redundancy)
    print("=" * 60)
    print("MODEL_FN: Checking Grad CAM availability")
    print("=" * 60)
    print(f"GRAD_CAM_AVAILABLE from startup: {GRAD_CAM_AVAILABLE}")
    
    if not GRAD_CAM_AVAILABLE:
        print("WARNING: Grad CAM not available from startup. Trying import again...")
        try:
            from pytorch_grad_cam import GradCAM
            from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
            from pytorch_grad_cam.utils.image import show_cam_on_image
            GRAD_CAM_AVAILABLE = True
            print("SUCCESS: Grad CAM available in model_fn")
        except Exception as e:
            print(f"ERROR: Still not available: {e}")
            GRAD_CAM_AVAILABLE = False
    
    print(f"Final GRAD_CAM_AVAILABLE = {GRAD_CAM_AVAILABLE}")
    print("=" * 60)
    
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
    print("=" * 60)
    print("GENERATE_GRADCAM CALLED")
    print("=" * 60)
    print(f"GRAD_CAM_AVAILABLE = {GRAD_CAM_AVAILABLE}")
    print(f"GradCAM class available: {GradCAM is not None}")
    print(f"ClassifierOutputTarget available: {ClassifierOutputTarget is not None}")
    print(f"show_cam_on_image available: {show_cam_on_image is not None}")
    
    if not GRAD_CAM_AVAILABLE or GradCAM is None:
        error_msg = f"Grad CAM not available. GRAD_CAM_AVAILABLE={GRAD_CAM_AVAILABLE}, GradCAM={GradCAM is not None}"
        print(f"ERROR: {error_msg}")
        raise ImportError(error_msg)
    
    try:
        print("Starting Grad CAM generation...")
        
        target_layer = model.layer4[-1]
        print(f"Target layer: {target_layer}")
        
        with GradCAM(model=model, target_layers=[target_layer]) as cam:
            with torch.no_grad():
                logits = model(image_tensor)
            pred = int(torch.argmax(logits, dim=1).item())
            print(f"Predicted class: {pred}")
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
        
        print("SUCCESS: Grad CAM generated")
        print("=" * 60)
        
        return grayscale_cam, vis, rgb_img
    except Exception as e:
        print(f"ERROR: Grad CAM generation failed: {e}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        print("=" * 60)
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

