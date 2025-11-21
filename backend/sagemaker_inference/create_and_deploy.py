"""
Create SageMaker Model and Deploy as Serverless Endpoint
Uses boto3 directly to avoid SDK version conflicts
"""

import boto3
import json
import time
from sagemaker import image_uris

REGION = 'eu-north-1'
MODEL_BUCKET = 'hemascan-models-eu-north-1-433864969866'
SAGEMAKER_ROLE_ARN = 'arn:aws:iam::433864969866:role/HemaScanSageMakerRole'
MODEL_NAME = 'hemascan-model'
ENDPOINT_CONFIG_NAME = 'hemascan-endpoint-config'
ENDPOINT_NAME = 'hemascan-endpoint'

sagemaker_client = boto3.client('sagemaker', region_name=REGION)

print("Creating SageMaker Model and Deploying Endpoint...")

# Get the correct PyTorch image URI for the region
print("Getting PyTorch image URI for region...")
image_uri = image_uris.retrieve(
    framework='pytorch',
    region=REGION,
    version='2.0',
    py_version='py310',
    instance_type='ml.m5.large',  # Used just to get image URI
    image_scope='inference'
)
print(f"Using image: {image_uri}")

# Step 1: Create Model
print("\nStep 1: Creating SageMaker Model...")
model_data_url = f's3://{MODEL_BUCKET}/sagemaker-model/model.tar.gz'

try:
    model_response = sagemaker_client.create_model(
        ModelName=MODEL_NAME,
        PrimaryContainer={
            'Image': image_uri,
            'ModelDataUrl': model_data_url,
            'Environment': {
                'SAGEMAKER_PROGRAM': 'inference.py',
                'SAGEMAKER_SUBMIT_DIRECTORY': '/opt/ml/model/code',
                'SAGEMAKER_REGION': REGION
            }
        },
        ExecutionRoleArn=SAGEMAKER_ROLE_ARN
    )
    print(f"Model created: {MODEL_NAME}")
except Exception as e:
    if 'AlreadyExistsException' in str(e):
        print(f"Model {MODEL_NAME} already exists, continuing...")
    else:
        print(f"Error creating model: {e}")
        raise

# Step 2: Create Serverless Endpoint Configuration
print("\nStep 2: Creating Serverless Endpoint Configuration...")
try:
    endpoint_config_response = sagemaker_client.create_endpoint_config(
        EndpointConfigName=ENDPOINT_CONFIG_NAME,
        ProductionVariants=[{
            'VariantName': 'AllTraffic',
            'ModelName': MODEL_NAME,
            'ServerlessConfig': {
                'MemorySizeInMB': 2048,
                'MaxConcurrency': 10
            }
        }]
    )
    print(f"Endpoint config created: {ENDPOINT_CONFIG_NAME}")
except Exception as e:
    if 'AlreadyExistsException' in str(e):
        print(f"Endpoint config {ENDPOINT_CONFIG_NAME} already exists, continuing...")
    else:
        print(f"Error creating endpoint config: {e}")
        raise

# Step 3: Create/Update Endpoint
print("\nStep 3: Creating/Updating Endpoint...")
try:
    endpoint_response = sagemaker_client.create_endpoint(
        EndpointName=ENDPOINT_NAME,
        EndpointConfigName=ENDPOINT_CONFIG_NAME
    )
    print(f"Endpoint creation initiated: {ENDPOINT_NAME}")
except Exception as e:
    if 'AlreadyExistsException' in str(e):
        print(f"Endpoint {ENDPOINT_NAME} already exists, updating...")
        endpoint_response = sagemaker_client.update_endpoint(
            EndpointName=ENDPOINT_NAME,
            EndpointConfigName=ENDPOINT_CONFIG_NAME
        )
        print(f"Endpoint update initiated: {ENDPOINT_NAME}")
    else:
        print(f"Error creating endpoint: {e}")
        raise

# Step 4: Wait for endpoint to be ready
print("\nStep 4: Waiting for endpoint to be ready...")
print("   This may take 5-10 minutes...")

while True:
    endpoint_status = sagemaker_client.describe_endpoint(EndpointName=ENDPOINT_NAME)
    status = endpoint_status['EndpointStatus']
    
    if status == 'InService':
        print(f"\nEndpoint is now IN SERVICE!")
        print(f"Endpoint Name: {ENDPOINT_NAME}")
        print(f"Endpoint ARN: {endpoint_status['EndpointArn']}")
        break
    elif status == 'Failed':
        print(f"\nEndpoint creation FAILED!")
        print(f"   Status: {status}")
        print(f"   Failure Reason: {endpoint_status.get('FailureReason', 'Unknown')}")
        break
    else:
        print(f"   Status: {status}... waiting...")
        time.sleep(30)

print("\nDeployment process complete!")

