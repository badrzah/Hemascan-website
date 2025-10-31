#!/bin/bash

# HemaScan Frontend Deployment Script for AWS S3 + CloudFront
# Usage: ./deploy-frontend.sh [bucket-name] [cloudfront-distribution-id]

set -e

BUCKET_NAME=${1:-hemascan-frontend-prod}
DISTRIBUTION_ID=${2:-""}
REGION=${AWS_REGION:-eu-north-1}

echo "🚀 Deploying HemaScan Frontend to AWS S3"
echo "Bucket: $BUCKET_NAME"
echo "Region: $REGION"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install AWS CLI first."
    exit 1
fi

# Build the frontend
echo "📦 Building frontend..."
npm install
npm run build

# Check if bucket exists, create if not
if ! aws s3 ls "s3://$BUCKET_NAME" 2>&1 | grep -q 'NoSuchBucket'; then
    echo "📝 Creating S3 bucket: $BUCKET_NAME"
    aws s3 mb "s3://$BUCKET_NAME" --region $REGION
    
    # Configure bucket for static website hosting
    aws s3 website "s3://$BUCKET_NAME" \
        --index-document index.html \
        --error-document index.html
    
    # Set bucket policy for public read (if needed)
    echo "⚠️  Configure bucket policy for CloudFront or public access as needed"
fi

# Upload build files
echo "📤 Uploading files to S3..."
aws s3 sync build/ "s3://$BUCKET_NAME" --delete --region $REGION

echo "✅ Frontend deployed to S3!"

# Invalidate CloudFront cache if distribution ID provided
if [ ! -z "$DISTRIBUTION_ID" ]; then
    echo "🔄 Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id "$DISTRIBUTION_ID" \
        --paths "/*"
    echo "✅ CloudFront cache invalidated!"
fi

echo ""
echo "🌐 Frontend URL:"
echo "   S3 Website: http://$BUCKET_NAME.s3-website-$REGION.amazonaws.com"
if [ ! -z "$DISTRIBUTION_ID" ]; then
    echo "   CloudFront: https://$(aws cloudfront get-distribution --id $DISTRIBUTION_ID --query 'Distribution.DomainName' --output text)"
fi

