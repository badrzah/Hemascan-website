#!/bin/bash

# HemaScan Backend Deployment Script for AWS Elastic Beanstalk
# Usage: ./deploy-backend.sh [environment-name]

set -e

ENVIRONMENT=${1:-hemascan-prod}
REGION=${AWS_REGION:-eu-north-1}

echo "🚀 Deploying HemaScan Backend to AWS Elastic Beanstalk"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo ""

# Check if EB CLI is installed
if ! command -v eb &> /dev/null; then
    echo "❌ AWS EB CLI not found. Installing..."
    pip install awsebcli
fi

# Navigate to backend directory
cd backend

# Check if EB is initialized
if [ ! -d ".elasticbeanstalk" ]; then
    echo "📦 Initializing Elastic Beanstalk application..."
    eb init -p python-3.9 hemascan-backend --region $REGION
fi

# Check if environment exists
if eb list | grep -q "$ENVIRONMENT"; then
    echo "✅ Environment $ENVIRONMENT exists. Deploying..."
    eb deploy $ENVIRONMENT
else
    echo "📝 Creating new environment: $ENVIRONMENT"
    echo "⚠️  You'll need to configure CORS_ORIGIN after creation."
    eb create $ENVIRONMENT \
        --instance-type t3.medium \
        --platform "Python 3.9 running on 64bit Amazon Linux 2" \
        --envvars CORS_ORIGIN="https://your-frontend-domain.com",ENVIRONMENT=production
fi

# Get the backend URL
echo ""
echo "✅ Deployment complete!"
echo "📋 Backend URL:"
eb status | grep "CNAME" || eb status

echo ""
echo "⚠️  Don't forget to:"
echo "1. Update CORS_ORIGIN environment variable with your frontend URL"
echo "2. Update frontend .env.production with the backend URL above"
echo ""
echo "To update CORS:"
echo "  eb setenv CORS_ORIGIN=https://your-frontend-domain.com"

cd ..

