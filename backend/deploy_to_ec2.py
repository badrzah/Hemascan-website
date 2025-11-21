"""
Deploy HemaScan Backend to EC2
This script helps set up EC2 instance and deploy the backend
"""

import boto3
import time

REGION = 'eu-north-1'
INSTANCE_TYPE = 't2.micro'  # Free tier eligible
KEY_PAIR_NAME = 'hemascan-keypair'  # You'll need to create this
SECURITY_GROUP_NAME = 'hemascan-backend-sg'

print("EC2 Deployment Helper")
print("=" * 60)

ec2 = boto3.client('ec2', region_name=REGION)

# Step 1: Create Security Group
print("\n1. Creating Security Group...")
try:
    sg_response = ec2.create_security_group(
        GroupName=SECURITY_GROUP_NAME,
        Description='HemaScan Backend API Security Group'
    )
    security_group_id = sg_response['GroupId']
    print(f"   Security Group created: {security_group_id}")
    
    # Add inbound rules
    ec2.authorize_security_group_ingress(
        GroupId=security_group_id,
        IpPermissions=[
            {
                'IpProtocol': 'tcp',
                'FromPort': 8000,
                'ToPort': 8000,
                'IpRanges': [{'CidrIp': '0.0.0.0/0', 'Description': 'Backend API'}]
            },
            {
                'IpProtocol': 'tcp',
                'FromPort': 22,
                'ToPort': 22,
                'IpRanges': [{'CidrIp': '0.0.0.0/0', 'Description': 'SSH'}]
            }
        ]
    )
    print("   Security Group rules added")
except ec2.exceptions.ClientError as e:
    if 'InvalidGroup.Duplicate' in str(e):
        print("   Security Group already exists, fetching...")
        sgs = ec2.describe_security_groups(GroupNames=[SECURITY_GROUP_NAME])
        security_group_id = sgs['SecurityGroups'][0]['GroupId']
    else:
        raise

# Step 2: Get latest Amazon Linux 2023 AMI
print("\n2. Finding Amazon Linux 2023 AMI...")
ami_response = ec2.describe_images(
    Owners=['amazon'],
    Filters=[
        {'Name': 'name', 'Values': ['al2023-ami-*-x86_64']},
        {'Name': 'state', 'Values': ['available']}
    ]
)
# Sort by creation date and get most recent
images = sorted(ami_response['Images'], key=lambda x: x['CreationDate'], reverse=True)
ami_id = images[0]['ImageId'] if images else None
if ami_id:
    print(f"   Using AMI: {ami_id}")
else:
    print("   Could not find AMI, use AWS Console to select")
    ami_id = "ami-xxx"  # Placeholder

# Step 3: User data script (runs on instance startup)
user_data = """#!/bin/bash
# Install Python 3.11
sudo dnf install -y python3.11 python3.11-pip git

# Create app directory
mkdir -p /home/ec2-user/hemascan-backend
cd /home/ec2-user/hemascan-backend

# Note: You'll need to upload your code or clone from repo
# For now, this is a template

# Install dependencies (when code is uploaded)
# pip3.11 install -r requirements.txt

# Create systemd service
sudo tee /etc/systemd/system/hemascan-backend.service > /dev/null <<'EOF'
[Unit]
Description=HemaScan Backend API
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/hemascan-backend
Environment="AWS_REGION=eu-north-1"
Environment="SAGEMAKER_ENDPOINT=hemascan-endpoint"
Environment="RESULTS_S3_BUCKET=hemascan-results-433864969866"
Environment="CORS_ORIGINS=*"
ExecStart=/usr/bin/python3.11 -m uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable hemascan-backend
# Don't start yet - wait for code to be uploaded
"""

print("\n3. EC2 Instance Configuration:")
print(f"   Instance Type: {INSTANCE_TYPE} (Free Tier)")
print(f"   Security Group: {security_group_id}")
print(f"   AMI: {ami_id}")

print("\n" + "=" * 60)
print("MANUAL STEPS REQUIRED:")
print("=" * 60)
print("1. Create Key Pair:")
print(f"   aws ec2 create-key-pair --key-name {KEY_PAIR_NAME} --region {REGION}")
print("")
print("2. Launch EC2 Instance:")
print(f"   aws ec2 run-instances \\")
print(f"     --image-id {ami_id} \\")
print(f"     --instance-type {INSTANCE_TYPE} \\")
print(f"     --key-name {KEY_PAIR_NAME} \\")
print(f"     --security-group-ids {security_group_id} \\")
print(f"     --region {REGION} \\")
print(f"     --user-data file://setup_ec2.sh")
print("")
print("3. Upload backend code to instance:")
print("   scp -r backend/* ec2-user@<instance-ip>:/home/ec2-user/hemascan-backend/")
print("")
print("4. SSH and start service:")
print("   ssh ec2-user@<instance-ip>")
print("   sudo systemctl start hemascan-backend")
print("")
print("5. Test:")
print("   curl http://<instance-ip>:8000/health")
print("=" * 60)

