"""
HemaScan Backend - AWS Production Version
Uses SageMaker Serverless Inference endpoint
Run: uvicorn main:app --reload
Access: http://localhost:8000
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import base64
import os
from datetime import datetime
import boto3
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ==================== SETUP ====================
app = FastAPI(title="HemaScan Backend", version="0.1.0")

# CORS Configuration - Allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ==================== AWS CONFIGURATION ====================
# Get region from Lambda environment (AWS_REGION is automatically set by Lambda)
# For local development, fallback to REGION env var or default
REGION = os.environ.get('AWS_REGION') or os.environ.get('REGION') or 'eu-north-1'
SAGEMAKER_ENDPOINT = os.getenv('SAGEMAKER_ENDPOINT', 'hemascan-endpoint')
RESULTS_BUCKET = os.getenv('RESULTS_S3_BUCKET', 'hemascan-results-433864969866')

# Initialize AWS clients (lazy initialization)
sagemaker_runtime = None
s3_client = None

def get_sagemaker_client():
    global sagemaker_runtime
    if sagemaker_runtime is None:
        sagemaker_runtime = boto3.client('sagemaker-runtime', region_name=REGION)
    return sagemaker_runtime

def get_s3_client():
    global s3_client
    if s3_client is None:
        s3_client = boto3.client('s3', region_name=REGION)
    return s3_client

print("HemaScan Backend initialized with SageMaker")
print(f"   - SageMaker Endpoint: {SAGEMAKER_ENDPOINT}")
print(f"   - Region: {REGION}")
print(f"   - Results Bucket: {RESULTS_BUCKET}")

# ==================== REQUEST MODELS ====================
class ChatRequest(BaseModel):
    message: str
    analysis_context: dict = None
    vital_signs: dict = None

# ==================== UTILITIES ====================

def invoke_sagemaker_endpoint(image_bytes, action='predict'):
    """
    Invoke SageMaker endpoint with image data
    action: 'predict' or 'gradcam'
    """
    import time
    invoke_start = time.time()
    
    try:
        print(f"   Encoding image to base64...")
        encode_start = time.time()
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')
        encode_time = time.time() - encode_start
        print(f"   Encoded in {encode_time:.2f}s (size: {len(image_base64)} chars)")
    
        # Prepare request payload
        payload = {
            'action': action,
            'image': image_base64
        }
        payload_size = len(json.dumps(payload))
        print(f"   Payload size: {payload_size} bytes")
        
        # Invoke SageMaker endpoint
        print(f"   Invoking SageMaker endpoint...")
        sagemaker_client = get_sagemaker_client()
        
        invoke_call_start = time.time()
        try:
            response = sagemaker_client.invoke_endpoint(
                EndpointName=SAGEMAKER_ENDPOINT,
                ContentType='application/json',
                Body=json.dumps(payload)
            )
            invoke_call_time = time.time() - invoke_call_start
            print(f"   SageMaker API call completed in {invoke_call_time:.2f}s")
            
            # Check response status
            status_code = response.get('ResponseMetadata', {}).get('HTTPStatusCode', 'unknown')
            print(f"   Response status: {status_code}")
            
        except Exception as api_error:
            invoke_call_time = time.time() - invoke_call_start
            error_type = type(api_error).__name__
            error_msg = str(api_error)
            print(f"   [ERROR] SageMaker API call failed after {invoke_call_time:.2f}s")
            print(f"   Error type: {error_type}")
            print(f"   Error message: {error_msg}")
    
            # Re-raise with more context
            raise Exception(f"SageMaker API call failed ({error_type}): {error_msg}")

        # Parse response
        print(f"   Reading response body...")
        read_start = time.time()
        response_body = response['Body'].read().decode('utf-8')
        read_time = time.time() - read_start
        print(f"   Response body read in {read_time:.2f}s (size: {len(response_body)} chars)")
        
        parse_start = time.time()
        result = json.loads(response_body)
        parse_time = time.time() - parse_start
        print(f"   JSON parsed in {parse_time:.2f}s")
        
        total_time = time.time() - invoke_start
        print(f"   [SUCCESS] Total SageMaker invocation time: {total_time:.2f}s")
        
        return result
        
    except Exception as e:
        total_time = time.time() - invoke_start
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"[ERROR] SageMaker invocation failed after {total_time:.2f}s")
        print(f"   Error type: {error_type}")
        print(f"   Error message: {error_msg}")
        import traceback
        print("   Full traceback:")
        traceback.print_exc()
        raise


# ==================== ENDPOINTS ====================

@app.get("/")
async def root():
    """Health check"""
    return {
        "status": "HemaScan Backend Running (SageMaker)",
        "model": "SageMaker Serverless Inference",
        "endpoint": SAGEMAKER_ENDPOINT,
        "region": REGION,
        "endpoints": [
            "POST /api/auth/google",
            "POST /api/analyze",
            "POST /api/generate-gradcam",
            "POST /api/chat"
        ]
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "sagemaker_endpoint": SAGEMAKER_ENDPOINT
    }

@app.get("/test")
async def test():
    """Test endpoint to verify backend is working"""
    return {"status": "Backend is working with SageMaker!"}

# ==================== AUTHENTICATION ====================

class GoogleAuthRequest(BaseModel):
    credential: str  # JWT credential from GoogleLogin
    user_info: dict

@app.post("/api/auth/google")
async def google_auth(request: GoogleAuthRequest):
    """
    Verify Google OAuth credential (JWT) and authenticate user
    Returns user information and session token
    """
    import urllib.request
    import urllib.error
    import base64
    
    try:
        # Decode JWT credential to get user info
        if not request.credential:
            raise HTTPException(status_code=400, detail="No credential provided")
        
        try:
            # JWT format: header.payload.signature
            parts = request.credential.split('.')
            if len(parts) != 3:
                raise HTTPException(status_code=400, detail="Invalid credential format")
            
            # Decode payload (base64url)
            payload = parts[1]
            # Add padding if needed
            payload += '=' * (4 - len(payload) % 4)
            # Replace URL-safe characters
            payload = payload.replace('-', '+').replace('_', '/')
            # Decode
            decoded = base64.b64decode(payload)
            token_data = json.loads(decoded.decode('utf-8'))
            
            # Extract user information from JWT
            user_email = token_data.get("email", "")
            user_name = token_data.get("name", "")
            user_picture = token_data.get("picture", "")
            
            # Verify email is present
            if not user_email:
                raise HTTPException(status_code=400, detail="Email not found in credential")
            
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to decode credential: {str(e)}")
        
        # Determine user role based on email domain (optional - customize as needed)
        # For now, default to "doctor" role
        user_role = "doctor"
        
        # You can add domain restrictions here:
        # allowed_domains = ["hospital.com", "clinic.com", "medical.edu"]
        # if not any(user_email.endswith(f"@{domain}") for domain in allowed_domains):
        #     raise HTTPException(status_code=403, detail="Email domain not authorized")
        
        # Create session token
        session_token = f"session_{user_email}_{int(datetime.now().timestamp())}"
        
        # Log authentication (for audit trail)
        print(f"[SUCCESS] Google OAuth login: {user_email} ({user_name})")
        
        return {
            "success": True,
            "token": session_token,
            "user": {
                "email": user_email,
                "name": user_name,
                "picture": user_picture,
                "role": user_role
            }
        }
        
    except urllib.error.URLError as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify Google token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authentication error: {str(e)}")

# ==================== ANALYSIS ====================

@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Analyze blood smear image using SageMaker endpoint
    Returns: diagnosis + confidence score
    """
    import time
    start_time = time.time()
    try:
        if not file:
            print("ERROR: No file provided")
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="No file provided")
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [INFO] Starting analysis")
        print(f"   File: {file.filename}")
        print(f"   Type: {file.content_type}")
        # Read uploaded image
        read_start = time.time()
        image_data = await file.read()
        read_time = time.time() - read_start
        print(f"   File size: {len(image_data)} bytes (read in {read_time:.2f}s)")
        if len(image_data) == 0:
            print("ERROR: Empty file")
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="File is empty")
        # Call SageMaker endpoint for prediction
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [INFO] Calling SageMaker endpoint: {SAGEMAKER_ENDPOINT}")
        sagemaker_start = time.time()
        try:
            result = invoke_sagemaker_endpoint(image_data, action='predict')
            sagemaker_time = time.time() - sagemaker_start
            print(f"   SageMaker response received in {sagemaker_time:.2f}s")
        except Exception as e:
            sagemaker_time = time.time() - sagemaker_start
            error_msg = str(e)
            error_type = type(e).__name__
            print(f"[ERROR] SageMaker call failed after {sagemaker_time:.2f}s")
            print(f"   Error type: {error_type}")
            print(f"   Error message: {error_msg}")
            import traceback
            print("   Traceback:")
            traceback.print_exc()
            # Provide detailed error message
            detail_msg = f"SageMaker error ({error_type}): {error_msg}"
            if "ModelError" in error_type or "Worker died" in error_msg:
                detail_msg += "\n\nThis usually means:\n- Model container crashed\n- Check CloudWatch logs: /aws/sagemaker/Endpoints/hemascan-endpoint"
            elif "timeout" in error_msg.lower():
                detail_msg += "\n\nSageMaker request timed out. This can happen on cold starts."
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=detail_msg)
        if not result.get('success', False):
            error_detail = result.get('error', 'Prediction failed')
            print(f"[ERROR] Prediction failed: {error_detail}")
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=f"Prediction failed: {error_detail}")
        # Extract results
        diagnosis_text = result.get('diagnosis', 'Unknown')
        confidence = result.get('confidence', 0)
        total_time = time.time() - start_time
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [SUCCESS] Analysis complete in {total_time:.2f}s")
        print(f"   Diagnosis: {diagnosis_text}")
        print(f"   Confidence: {confidence}%")
        # Prepare response
        response = {
            "diagnosis": diagnosis_text,
            "confidence": confidence,
            "timestamp": datetime.now().strftime("%Y_%m_%d_%H_%M_%S") }
        return response
        
    except HTTPException:
        total_time = time.time() - start_time
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [ERROR] Request failed after {total_time:.2f}s")
        raise
    except Exception as e:
        total_time = time.time() - start_time
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [ERROR] Unexpected error after {total_time:.2f}s")
        print(f"   Error type: {error_type}")
        print(f"   Error message: {error_msg}")
        import traceback
        print("   Full traceback:")
        traceback.print_exc()
        
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Unexpected error ({error_type}): {error_msg}")

# ==================== GRAD CAM (SEPARATE ENDPOINT) ====================

@app.post("/api/generate-gradcam")
async def generate_gradcam_endpoint(file: UploadFile = File(...)):
    """
    Generate Grad CAM visualization using SageMaker endpoint
    Call this AFTER analyze to get overlay image showing diagnostic attention regions
    """
    import time
    start_time = time.time()
    try:
        if not file:
            print("ERROR: No file provided for Grad CAM")
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="No file provided")
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [INFO] Starting Grad CAM generation")
        print(f"   File: {file.filename}")
        print(f"   Type: {file.content_type}")
        # Read uploaded image
        read_start = time.time()
        image_data = await file.read()
        read_time = time.time() - read_start
        print(f"   File size: {len(image_data)} bytes (read in {read_time:.2f}s)")
        if len(image_data) == 0:
            print("ERROR: Empty file")
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="File is empty")
        # Call SageMaker endpoint for Grad CAM
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [INFO] Calling SageMaker endpoint for Grad CAM: {SAGEMAKER_ENDPOINT}")
        sagemaker_start = time.time()
        try:
            result = invoke_sagemaker_endpoint(image_data, action='gradcam')
            sagemaker_time = time.time() - sagemaker_start
            print(f"   SageMaker Grad CAM response received in {sagemaker_time:.2f}s")
        except Exception as e:
            sagemaker_time = time.time() - sagemaker_start
            error_msg = str(e)
            error_type = type(e).__name__
            print(f"[ERROR] SageMaker Grad CAM call failed after {sagemaker_time:.2f}s")
            print(f"   Error type: {error_type}")
            print(f"   Error message: {error_msg}")
            import traceback
            print("   Traceback:")
            traceback.print_exc()
            detail_msg = f"SageMaker Grad CAM error ({error_type}): {error_msg}"
            if "Grad CAM functionality not available" in error_msg or "pytorch_grad_cam" in error_msg:
                detail_msg += "\n\nGrad CAM module not installed. Regular prediction works, but Grad CAM visualization is disabled."
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=detail_msg)
        if not result.get('success', False):
            error_detail = result.get('error', 'Grad CAM generation failed')
            print(f"[ERROR] Grad CAM generation failed: {error_detail}")
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=f"Grad CAM generation failed: {error_detail}")
        # Get overlay image URL
        overlay_url = result.get('overlayImageUrl')
        if not overlay_url:
            print("[ERROR] No overlay image returned from SageMaker")
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail="No overlay image returned from SageMaker")
        timestamp = datetime.now().strftime("%Y_%m_%d_%H_%M_%S")
        total_time = time.time() - start_time
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [SUCCESS] Grad CAM generation complete in {total_time:.2f}s")
        print(f"   Overlay URL length: {len(overlay_url)} chars")
        
        # Prepare response
        response = {
            "timestamp": timestamp,
            "overlayImageUrl": overlay_url,
            "success": True
        }
        print(f"[SUCCESS] Returning Grad CAM response with overlayImageUrl")
        return response
    except HTTPException:
        total_time = time.time() - start_time
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [ERROR] Grad CAM request failed after {total_time:.2f}s")
        raise
    except Exception as e:
        total_time = time.time() - start_time
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [ERROR] Unexpected Grad CAM error after {total_time:.2f}s")
        print(f"   Error type: {error_type}")
        print(f"   Error message: {error_msg}")
        import traceback
        print("   Full traceback:")
        traceback.print_exc()
        
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Unexpected Grad CAM error ({error_type}): {error_msg}")

# ==================== CHAT ====================

# DeepSeek R1 Chatbot Integration
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL_ID = "deepseek/deepseek-r1"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "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")

SYSTEM_PROMPT = """
You are HemaScan Clinical Assistant, an AI-powered clinical decision support tool designed to assist healthcare professionals, particularly doctors, in leukemia detection and diagnosis using the HemaScan medical imaging analysis system.

## Your Role & Expertise
- **Primary Function**: Provide clinical decision support to doctors analyzing blood smear images for leukemia detection
- **Technical Knowledge**: Expert understanding of ResNet18 deep learning models, Grad-CAM visualization, and medical image classification
- **Medical Expertise**: Knowledgeable about hematology, blood cell morphology, leukemia types, diagnostic criteria, and treatment approaches
- **Clinical Support**: Assist doctors in interpreting AI analysis results, making diagnostic decisions, and considering treatment options

## Core Responsibilities
1. **Diagnostic Support**: Help doctors interpret analysis results and make informed diagnostic decisions
2. **Clinical Interpretation**: Explain what AI predictions mean in clinical context and how to integrate them with patient presentation
3. **Treatment Guidance**: Provide evidence-based treatment recommendations and considerations for leukemia cases
4. **Result Analysis**: Help doctors understand confidence scores, Grad-CAM visualizations, and their clinical significance
5. **Context Integration**: Use provided analysis results, vital signs, and clinical context to provide relevant recommendations

## Clinical Guidelines

### YOU CAN AND SHOULD:
- Provide medical diagnoses based on analysis results and clinical context
- Recommend treatment approaches and considerations
- Interpret AI model predictions in clinical terms
- Explain diagnostic criteria and differential diagnoses
- Discuss treatment options, protocols, and considerations
- Help integrate AI results with patient vital signs and clinical presentation
- Provide guidance on next steps in patient care
- Discuss prognosis considerations when relevant

### Clinical Decision Support:
- **When Analysis Shows Leukemia**: Provide diagnostic confirmation, discuss types of leukemia, and recommend appropriate diagnostic workup (blood tests, bone marrow biopsy, etc.)
- **When Analysis Shows Normal**: Help confirm normal findings, but remind to consider clinical context
- **Confidence Levels**: Explain what confidence scores mean clinically and when to trust or verify results
- **Grad-CAM Visualizations**: Help interpret which areas of the image influenced the diagnosis and what this means clinically

### Treatment Recommendations:
- Provide evidence-based treatment considerations
- Discuss standard treatment protocols for different leukemia types
- Consider patient factors (vital signs, age, etc.) when relevant
- Recommend appropriate referrals or specialist consultations when needed

## Response Guidelines

### Structure Your Responses (ALWAYS follow this format):

**1. Clinical Summary**
- AI Diagnosis: [diagnosis if available]
- Model Confidence: [confidence]% (if available)
- Note: Only include vital signs if they are valid (non-zero values). If heart rate is 0 or SpO₂ is 0, DO NOT mention vital signs at all.

**2. Diagnostic Assessment**
- Clear clinical interpretation of the findings
- What the results mean in clinical context

**3. Treatment Recommendations**
- Specific diagnostic workup recommendations
- Treatment considerations and protocols
- Urgency assessment if applicable

**4. Next Steps**
- Actionable follow-up recommendations
- Specific tests or consultations needed

### Formatting Rules:
- Use clear section headers with **bold** text
- Use bullet points for lists
- Keep each section concise and focused
- Maintain professional clinical tone
- DO NOT use excessive dashes or formatting that makes text hard to read

### Handling Different Scenarios:

**High Confidence Leukemia Detection**:
- Confirm the diagnosis
- Discuss type of leukemia (if determinable from context)
- Recommend diagnostic workup (CBC, peripheral smear review, bone marrow biopsy)
- Discuss treatment considerations and urgency
- Consider patient vital signs in treatment planning

**Normal/Negative Results**:
- Confirm normal findings
- Discuss when to still consider leukemia (clinical suspicion, follow-up needed)
- Recommend appropriate follow-up if clinical concern persists

**Low Confidence Results**:
- Discuss uncertainty and need for additional testing
- Recommend repeat imaging or alternative diagnostic approaches
- Emphasize importance of clinical correlation

**With Vital Signs Context**:
- **CRITICAL RULE**: Only mention vital signs if BOTH heart rate AND SpO₂ are valid (non-zero) values
- If heart rate is 0 or SpO₂ is 0, treat it as if no vital signs were provided - DO NOT mention them at all
- If vital signs are valid (non-zero): Integrate heart rate and SpO₂ into clinical assessment
- If vital signs are valid (non-zero): Discuss how vital signs relate to diagnosis and treatment urgency
- If vital signs are valid (non-zero): Consider patient stability in treatment recommendations
- **NEVER mention vital signs if they are 0/0 or invalid - silently ignore them**

## Tone & Style
- **Professional & Clinical**: Use appropriate medical terminology
- **Confident but Collaborative**: Provide clear recommendations while acknowledging you're an AI assistant
- **Evidence-Based**: Reference standard clinical practices and guidelines
- **Structured**: Use clear formatting (sections, bullets) for clinical information
- **Actionable**: Provide specific, actionable recommendations
- **Concise**: Keep responses focused and clear

## Important Notes
- You are a clinical decision support tool assisting doctors, not replacing their judgment
- **CRITICAL: Always use the HemaScan AI Diagnosis provided in the context. This is the actual result from the analysis - do NOT contradict it or ignore it.**
- Always integrate AI results with clinical context
- **CRITICAL: Only mention vital signs (heart rate, SpO₂) if BOTH values are valid (non-zero). If heart rate is 0 or SpO₂ is 0, DO NOT mention vital signs at all - treat as if they were not provided.**
- When valid vital signs are provided, use them to inform recommendations
- If no clinical context is provided, provide general guidance but note the importance of clinical correlation
- Be clear about limitations and when additional testing or specialist consultation is needed
- If user asks about outside the scope of the project, politely redirect to HemaScan-related topics
- **Always use structured, professional formatting - avoid excessive dashes or messy formatting**

## Example Response Structure

**Example 1: With valid vital signs:**
```
**Clinical Summary**
- AI Diagnosis: Acute Lymphoblastic Leukemia
- Model Confidence: 87.5%
- Patient Vital Signs: HR 95 BPM, SpO₂ 98%

**Diagnostic Assessment**
[Clinical interpretation]

**Treatment Recommendations**
[Specific recommendations]

**Next Steps**
[Actionable steps]
```

**Example 2: Without vital signs or with 0/0 values:**
```
**Clinical Summary**
- AI Diagnosis: Normal blood smear
- Model Confidence: 92.3%

**Diagnostic Assessment**
[Clinical interpretation - NO mention of vital signs]

**Treatment Recommendations**
[Specific recommendations]

**Next Steps**
[Actionable steps]
```

**CRITICAL**: If heart rate is 0 or SpO₂ is 0, do NOT include a "Patient Vital Signs" line in the Clinical Summary. Only include vital signs when both values are valid (non-zero).

Remember: You are assisting doctors in making clinical decisions. Be thorough, evidence-based, and provide actionable recommendations while maintaining professional clinical standards.
"""

def hemascan_chat(message, accuracy=None, heart_rate=None, spo2=None, diagnosis=None):
    """
    Main function to chat with the model.
    Sends user text + diagnosis, accuracy, heart_rate, spo2
    Returns the response in English.
    """
    import urllib.request
    
    if not OPENROUTER_API_KEY.startswith("sk-or-"):
        raise ValueError("OpenRouter API key is invalid or missing.")
    
    # Add values to the context - CRITICAL: Include diagnosis first
    ctx = []
    if diagnosis:
        ctx.append(f"HemaScan AI Diagnosis: {diagnosis}.")
    if isinstance(accuracy, (int, float)):
        acc_pct = accuracy * 100 if accuracy <= 1 else accuracy
        ctx.append(f"Model confidence: {acc_pct:.1f}%.")
    if isinstance(heart_rate, (int, float)) and heart_rate > 0:
        ctx.append(f"Heart rate: {float(heart_rate):.0f} BPM.")
    if isinstance(spo2, (int, float)) and spo2 > 0:
        ctx.append(f"Blood oxygen saturation (SpO₂): {float(spo2):.0f}%.")
    
    # Combine values with user message
    full_msg = (" ".join(ctx) + " " + message).strip()
    
    # Prepare request
    payload = json.dumps({
        "model": MODEL_ID,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": full_msg}
        ],
        "temperature": 0.2,
        "max_tokens": 500  # Reduced from 700 for faster responses
    }).encode("utf-8")
    
    # Execute request with timeout
    req = urllib.request.Request(
        OPENROUTER_API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
    )
    
    # Receive response with timeout (30 seconds)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            reply = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return reply.strip() or "No response from assistant."
    except urllib.error.URLError as e:
        if "timeout" in str(e).lower():
            raise Exception("Chat API request timed out. Please try again.")
        raise Exception(f"Chat API connection error: {str(e)}")

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    AI chat endpoint using DeepSeek R1 (via OpenRouter)
    Provides educational medical insights based on analysis results
    """
    import time
    start_time = time.time()
    
    try:
        message = request.message
        analysis_context = request.analysis_context or {}
        vital_signs = request.vital_signs or {}
        
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [INFO] Chat request received")
        print(f"   Message: {message[:100]}...")
        
        # Extract values from context
        confidence = analysis_context.get("confidence", None)
        diagnosis = analysis_context.get("diagnosis", None)
        
        # Convert confidence percentage to decimal if needed
        accuracy = None
        if confidence is not None:
            # If confidence is already 0-1, use as is; if 0-100, convert
            accuracy = confidence / 100.0 if confidence > 1 else confidence
        
        heart_rate = vital_signs.get("heartRate", None)
        spo2 = vital_signs.get("spO2", None)
        
        print(f"   Context - Diagnosis: {diagnosis}, Confidence: {confidence}%, HR: {heart_rate}, SpO2: {spo2}")
        
        # Call DeepSeek chatbot
        chat_start = time.time()
        try:
            response_text = hemascan_chat(
                message=message,
                diagnosis=diagnosis,
                accuracy=accuracy,
                heart_rate=heart_rate,
                spo2=spo2
            )
            chat_time = time.time() - chat_start
            print(f"   [SUCCESS] Chat response received in {chat_time:.2f}s")
        except Exception as chat_error:
            chat_time = time.time() - chat_start
            error_type = type(chat_error).__name__
            error_msg = str(chat_error)
            print(f"   [ERROR] Chat API call failed after {chat_time:.2f}s")
            print(f"   Error type: {error_type}")
            print(f"   Error message: {error_msg}")
            import traceback
            traceback.print_exc()
            
            # Return user-friendly error message
            response_text = f"I apologize, but I encountered an error connecting to the AI service. Please try again in a moment.\n\nError: {error_msg}"
        
        total_time = time.time() - start_time
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [SUCCESS] Chat request completed in {total_time:.2f}s")
        
        return {
            "message": response_text,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        total_time = time.time() - start_time
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [ERROR] Chat error after {total_time:.2f}s")
        print(f"   Error type: {error_type}")
        print(f"   Error message: {error_msg}")
        import traceback
        traceback.print_exc()
        
        return {
            "error": str(e),
            "message": "I apologize, but I encountered an error. Please try again.",
            "timestamp": datetime.now().isoformat()
        }

# ==================== RUN ====================
if __name__ == "__main__":
    print("\n" + "="*50)
    print("HemaScan Backend Starting (SageMaker)...")
    print("="*50)
    print(f"\nAccess at: http://localhost:8000")
    print(f"Docs at: http://localhost:8000/docs")
    print(f"SageMaker Endpoint: {SAGEMAKER_ENDPOINT}")
    print(f"Results Bucket: {RESULTS_BUCKET}")
    print("\n" + "="*50 + "\n")
    
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)