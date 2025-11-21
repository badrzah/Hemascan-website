"""
SageMaker Deployment Script
Packages model and deploys as Serverless Inference endpoint
"""

import boto3
import sagemaker
import tarfile
import os
import json
from pathlib import Path

# Configuration
REGION = 'eu-north-1'
MODEL_BUCKET = 'hemascan-models-433864969866'
SAGEMAKER_ROLE_ARN = 'arn:aws:iam::433864969866:role/HemaScanSageMakerRole'
ENDPOINT_NAME = 'hemascan-endpoint'

# Initialize SageMaker
sagemaker_session = sagemaker.Session()
s3_client = boto3.client('s3', region_name=REGION)
sagemaker_client = boto3.client('sagemaker', region_name=REGION)

print("🚀 Starting SageMaker deployment...")

# Step 1: Download model files from S3 to local temp directory
print("\n📥 Step 1: Downloading model files from S3...")
os.makedirs('model_package', exist_ok=True)

# Download model and config
s3_client.download_file(MODEL_BUCKET, 'leukemia_best.pt', 'model_package/leukemia_best.pt')
s3_client.download_file(MODEL_BUCKET, 'config.json', 'model_package/config.json')
print("✅ Model files downloaded")

# Step 2: Copy inference script
print("\n📋 Step 2: Copying inference script...")
import shutil
shutil.copy('inference.py', 'model_package/')
shutil.copy('requirements.txt', 'model_package/')
print("✅ Inference script copied")

# Step 3: Create tar.gz package
print("\n📦 Step 3: Creating model package...")
tar_path = 'model.tar.gz'
with tarfile.open(tar_path, 'w:gz') as tar:
    tar.add('model_package', arcname='.')
print(f"✅ Package created: {tar_path}")

# Step 4: Upload to S3
print("\n☁️  Step 4: Uploading package to S3...")
s3_model_path = f's3://{MODEL_BUCKET}/sagemaker-model/model.tar.gz'
s3_client.upload_file(tar_path, MODEL_BUCKET, 'sagemaker-model/model.tar.gz')
print(f"✅ Package uploaded to {s3_model_path}")

# Step 5: Create SageMaker Model
print("\n🤖 Step 5: Creating SageMaker Model...")
from sagemaker.pytorch import PyTorchModel

pytorch_model = PyTorchModel(
    model_data=s3_model_path,
    role=SAGEMAKER_ROLE_ARN,
    entry_point='inference.py',
    framework_version='2.0.0',
    py_version='py310',
    name=ENDPOINT_NAME + '-model'
)

print("✅ SageMaker Model object created")

# Step 6: Deploy as Serverless Inference endpoint
print("\n🚀 Step 6: Deploying Serverless Inference endpoint...")
print("⏳ This may take 5-10 minutes...")

predictor = pytorch_model.deploy(
    initial_serverless_config={
        'MaxConcurrency': 10,
        'MemorySizeInMB': 2048,  # 2GB for PyTorch + model
        'ProvisionedConcurrency': 0  # Scale to zero
    },
    endpoint_name=ENDPOINT_NAME,
    wait=True
)

print(f"\n✅ Deployment complete!")
print(f"📍 Endpoint Name: {ENDPOINT_NAME}")
print(f"📍 Endpoint ARN: {predictor.endpoint_name}")
print(f"\n💡 Save this endpoint name for your backend configuration!")

