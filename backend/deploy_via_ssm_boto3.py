"""
Deploy updated backend code to EC2 using AWS Systems Manager (boto3)
"""

import boto3
import json
import sys
from pathlib import Path

# Set UTF-8 encoding for stdout
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

REGION = 'eu-north-1'
INSTANCE_ID = 'i-0bf6e8f6bda76ede1'
BACKEND_DIR = "/home/ec2-user/hemascan-backend"

def deploy_via_ssm():
    """Deploy main.py to EC2 using AWS Systems Manager"""
    print("=" * 60)
    print("Deploying Updated Backend Code to EC2")
    print("=" * 60)
    print()
    
    # Read the main.py file
    backend_dir = Path(__file__).parent
    main_py_path = backend_dir / "main.py"
    
    if not main_py_path.exists():
        print(f"[ERROR] main.py not found at {main_py_path}")
        return False
    
    print(f"[OK] Found main.py at {main_py_path}")
    
    with open(main_py_path, 'r', encoding='utf-8') as f:
        file_content = f.read()
    
    # Escape the content for bash heredoc
    # Replace $ with \$ to prevent variable expansion
    escaped_content = file_content.replace('$', '\\$').replace('`', '\\`')
    
    # Create deployment script
    deploy_script = f"""#!/bin/bash
set -e
cd {BACKEND_DIR}
cat > main.py << 'EOFFILE'
{file_content}
EOFFILE
echo "[OK] File uploaded successfully"
sudo systemctl restart hemascan-backend
sleep 2
sudo systemctl status hemascan-backend --no-pager | head -15
echo "[OK] Service restarted successfully"
"""
    
    try:
        print(f"[DEPLOY] Uploading and deploying via SSM...")
        print(f"   Instance: {INSTANCE_ID}")
        print(f"   Region: {REGION}")
        print()
        
        # Use boto3 SSM client
        ssm_client = boto3.client('ssm', region_name=REGION)
        
        # Send command
        response = ssm_client.send_command(
            InstanceIds=[INSTANCE_ID],
            DocumentName='AWS-RunShellScript',
            Parameters={
                'commands': [deploy_script]
            }
        )
        
        command_id = response['Command']['CommandId']
        print(f"[OK] Command sent successfully!")
        print(f"   Command ID: {command_id}")
        print()
        print("[INFO] Waiting for command to complete (10 seconds)...")
        
        import time
        time.sleep(10)
        
        # Get command output
        output_response = ssm_client.get_command_invocation(
            CommandId=command_id,
            InstanceId=INSTANCE_ID
        )
        
        status = output_response['Status']
        stdout = output_response.get('StandardOutputContent', '')
        stderr = output_response.get('StandardErrorContent', '')
        
        print()
        print(f"Status: {status}")
        print()
        if stdout:
            print("Output:")
            try:
                print(stdout)
            except UnicodeEncodeError:
                print(stdout.encode('utf-8', errors='replace').decode('utf-8', errors='replace'))
        if stderr:
            print("Errors:")
            try:
                print(stderr)
            except UnicodeEncodeError:
                print(stderr.encode('utf-8', errors='replace').decode('utf-8', errors='replace'))
        
        if status == 'Success':
            print()
            print("[SUCCESS] Deployment completed!")
            print()
            print("[TEST] Test the endpoint:")
            print("   curl http://13.49.57.101:8000/health")
            print()
            return True
        else:
            print()
            print(f"[WARNING] Command status: {status}")
            print("Check the output above for details.")
            return False
            
    except Exception as e:
        print(f"[ERROR] Deployment error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = deploy_via_ssm()
    exit(0 if success else 1)

