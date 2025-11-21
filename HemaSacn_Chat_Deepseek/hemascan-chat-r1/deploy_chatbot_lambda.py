"""
Deploy HemaScan Chatbot to AWS Lambda
Creates deployment package and uploads to Lambda
"""

import zipfile
import os
import boto3
import json

LAMBDA_FUNCTION_NAME = 'hemascan-chatbot'
LAMBDA_ROLE_ARN = 'arn:aws:iam::433864969866:role/HemaScanLambdaRole'
REGION = 'eu-north-1'
TIMEOUT = 30  # seconds
MEMORY = 256  # MB (chatbot needs less memory)
RUNTIME = 'python3.12'

print("=" * 60)
print("HemaScan Chatbot Lambda Deployment")
print("=" * 60)
print()

# Get the directory where this script is located
script_dir = os.path.dirname(os.path.abspath(__file__))
lambda_function_path = os.path.join(script_dir, 'lambda_function.py')

if not os.path.exists(lambda_function_path):
    print(f"[ERROR] lambda_function.py not found at {lambda_function_path}")
    exit(1)

print(f"[OK] Found lambda_function.py at {lambda_function_path}")
print()

# Create deployment package
print("[STEP 1] Creating deployment package...")
deployment_dir = os.path.join(script_dir, 'deployment_package')
os.makedirs(deployment_dir, exist_ok=True)

# Copy lambda_function.py
import shutil
shutil.copy(lambda_function_path, deployment_dir)
print(f"   [OK] Copied lambda_function.py")

# Create zip file
zip_path = os.path.join(script_dir, 'chatbot_lambda_deployment.zip')
print(f"[STEP 2] Creating zip package...")
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    zipf.write(
        os.path.join(deployment_dir, 'lambda_function.py'),
        'lambda_function.py'
    )

file_size = os.path.getsize(zip_path) / 1024
print(f"   [OK] Package created: {zip_path}")
print(f"   [OK] Package size: {file_size:.2f} KB")
print()

# Deploy to Lambda
print("[STEP 3] Deploying to AWS Lambda...")
lambda_client = boto3.client('lambda', region_name=REGION)

try:
    # Check if function exists
    try:
        lambda_client.get_function(FunctionName=LAMBDA_FUNCTION_NAME)
        print(f"   [INFO] Function {LAMBDA_FUNCTION_NAME} exists, updating...")
        
        # Update function code
        with open(zip_path, 'rb') as f:
            update_response = lambda_client.update_function_code(
                FunctionName=LAMBDA_FUNCTION_NAME,
                ZipFile=f.read()
            )
        
        print(f"   [OK] Function code updated!")
        print(f"   [INFO] Waiting for update to complete...")
        
        # Wait for update to complete
        import time
        waiter = lambda_client.get_waiter('function_updated')
        waiter.wait(FunctionName=LAMBDA_FUNCTION_NAME)
        
        # Update configuration
        lambda_client.update_function_configuration(
            FunctionName=LAMBDA_FUNCTION_NAME,
            Runtime=RUNTIME,
            Timeout=TIMEOUT,
            MemorySize=MEMORY
        )
        
        print(f"   [OK] Function configuration updated!")
        
    except lambda_client.exceptions.ResourceNotFoundException:
        print(f"   [INFO] Function {LAMBDA_FUNCTION_NAME} does not exist, creating...")
        
        # Create function
        with open(zip_path, 'rb') as f:
            create_response = lambda_client.create_function(
                FunctionName=LAMBDA_FUNCTION_NAME,
                Runtime=RUNTIME,
                Role=LAMBDA_ROLE_ARN,
                Handler='lambda_function.lambda_handler',
                Code={'ZipFile': f.read()},
                Timeout=TIMEOUT,
                MemorySize=MEMORY,
                Description='HemaScan Chatbot - DeepSeek R1 via OpenRouter',
                Environment={
                    'Variables': {
                        'REGION': REGION
                    }
                }
            )
        
        print(f"   [OK] Function created!")
    
    # Get function details
    function_info = lambda_client.get_function(FunctionName=LAMBDA_FUNCTION_NAME)
    function_arn = function_info['Configuration']['FunctionArn']
    
    print()
    print("=" * 60)
    print("[SUCCESS] DEPLOYMENT SUCCESSFUL!")
    print("=" * 60)
    print(f"Function Name: {LAMBDA_FUNCTION_NAME}")
    print(f"Function ARN: {function_arn}")
    print(f"Region: {REGION}")
    print(f"Runtime: {RUNTIME}")
    print(f"Handler: lambda_function.lambda_handler")
    print()
    print("Next Steps:")
    print("1. Create or update API Gateway integration")
    print("2. Test the function:")
    print(f"   aws lambda invoke --function-name {LAMBDA_FUNCTION_NAME} \\")
    print(f"     --region {REGION} \\")
    print(f"     --payload '{{\"body\":\"{{\\\"message\\\":\\\"Hello\\\"}}\"}}' response.json")
    print()
    
except Exception as e:
    print()
    print("=" * 60)
    print("[ERROR] DEPLOYMENT FAILED!")
    print("=" * 60)
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

finally:
    # Cleanup
    if os.path.exists(deployment_dir):
        shutil.rmtree(deployment_dir)
        print(f"[CLEANUP] Removed temporary deployment directory")

