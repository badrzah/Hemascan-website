# Deploy backend/main.py to EC2 via S3
$INSTANCE_ID = "i-0bf6e8f6bda76ede1"
$REGION = "eu-north-1"
$S3_PATH = "s3://hemascan-results-eu-north-1-433864969866/temp/main.py"
$SERVICE_NAME = "hemascan-backend"

Write-Host "=== Deploying Backend Update ===" -ForegroundColor Cyan

# Step 1: Download from S3 and restart service
$commands = @(
    "cd /home/ec2-user/hemascan-backend",
    "aws s3 cp $S3_PATH main.py --region $REGION",
    "sudo systemctl restart $SERVICE_NAME",
    "sleep 2",
    "sudo systemctl status $SERVICE_NAME --no-pager -l | head -20"
)

$commandsJson = $commands | ConvertTo-Json -Compress

Write-Host "`n[1/2] Deploying updated main.py..." -ForegroundColor Yellow

$commandId = aws ssm send-command `
    --instance-ids $INSTANCE_ID `
    --region $REGION `
    --document-name "AWS-RunShellScript" `
    --parameters "commands=$commandsJson" `
    --output text `
    --query "Command.CommandId"

if ($commandId) {
    Write-Host "[OK] Command sent: $commandId" -ForegroundColor Green
    Write-Host "`nWaiting for completion..." -ForegroundColor Yellow
    Start-Sleep -Seconds 8
    
    # Get command output
    Write-Host "`n[2/2] Checking deployment status..." -ForegroundColor Yellow
    $output = aws ssm get-command-invocation `
        --command-id $commandId `
        --instance-id $INSTANCE_ID `
        --region $REGION `
        --query "StandardOutputContent" `
        --output text
    
    if ($output) {
        Write-Host $output -ForegroundColor Gray
    }
    
    $status = aws ssm get-command-invocation `
        --command-id $commandId `
        --instance-id $INSTANCE_ID `
        --region $REGION `
        --query "Status" `
        --output text
    
    if ($status -eq "Success") {
        Write-Host "`n[SUCCESS] Backend updated and restarted!" -ForegroundColor Green
    } else {
        Write-Host "`n[WARN] Status: $status - Check logs manually" -ForegroundColor Yellow
    }
} else {
    Write-Host "[ERROR] Failed to send command" -ForegroundColor Red
}

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Cyan
Write-Host "Backend URL: http://13.49.57.101:8000" -ForegroundColor Green









