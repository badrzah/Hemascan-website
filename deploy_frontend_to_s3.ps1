# Deploy Frontend to S3
$BUCKET_NAME = "hemascan-frontend-433864969866"
$REGION = "eu-north-1"
$BUILD_DIR = "build"

Write-Host "=========================================="
Write-Host "Deploying Frontend to S3"
Write-Host "=========================================="
Write-Host ""

# Check if build directory exists
if (-not (Test-Path $BUILD_DIR)) {
    Write-Host "[ERROR] Build directory not found: $BUILD_DIR"
    Write-Host "Please run 'npm run build' first"
    exit 1
}

Write-Host "[OK] Build directory found"
Write-Host ""

# Sync files to S3
Write-Host "[DEPLOY] Uploading files to S3..."
Write-Host "   Bucket: $BUCKET_NAME"
Write-Host "   Region: $REGION"
Write-Host ""

try {
    # Use AWS CLI to sync files
    aws s3 sync $BUILD_DIR s3://$BUCKET_NAME/ --region $REGION --delete
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "[SUCCESS] Frontend deployed successfully!"
        Write-Host ""
        Write-Host "Frontend URL:"
        Write-Host "  http://$BUCKET_NAME.s3-website.$REGION.amazonaws.com"
        Write-Host ""
    } else {
        Write-Host "[ERROR] Deployment failed"
        exit 1
    }
} catch {
    Write-Host "[ERROR] Deployment error: $_"
    exit 1
}

