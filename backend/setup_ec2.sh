#!/bin/bash
# EC2 Setup Script - Run this on your EC2 instance

echo "Setting up HemaScan Backend on EC2..."

# Update system
sudo yum update -y

# Install Python 3.11
sudo yum install -y python3.11 python3.11-pip git

# Create application directory
mkdir -p /home/ec2-user/hemascan-backend
cd /home/ec2-user/hemascan-backend

# Clone or upload your code here
# git clone <your-repo> .

# Install dependencies
pip3.11 install -r requirements.txt

# Create systemd service
sudo tee /etc/systemd/system/hemascan-backend.service > /dev/null <<EOF
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

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable hemascan-backend
sudo systemctl start hemascan-backend

# Check status
sudo systemctl status hemascan-backend

echo "Setup complete! Backend should be running on port 8000"

