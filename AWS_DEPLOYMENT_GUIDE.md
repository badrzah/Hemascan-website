# AWS Deployment Guide for HemaScan

This guide walks you through deploying the HemaScan application to AWS.

## Architecture Overview

- **Frontend**: React/Vite app → AWS S3 + CloudFront or AWS Amplify
- **Backend**: FastAPI + PyTorch → AWS Elastic Beanstalk
- **Model Files**: Stored with backend or in S3 (accessed by backend)

## Prerequisites

1. AWS Account with appropriate permissions
2. AWS CLI installed and configured (`aws configure`)
3. Python 3.9+ installed
4. Node.js 18+ installed
5. ~~Docker~~ **NOT REQUIRED** - Elastic Beanstalk handles everything automatically!

---

## Part 1: Backend Deployment (Elastic Beanstalk)

### ✅ Recommended: Elastic Beanstalk (No Docker Required!)

**Elastic Beanstalk automatically handles:**
- Python environment setup
- Dependency installation
- Process management
- Health monitoring
- Auto-scaling

**You just need:** Your Python code and `requirements.txt` - that's it!

#### Step 1: Prepare Backend Files

1. Ensure your backend structure:
```
backend/
├── main.py
├── requirements.txt
├── models/
│   ├── config.json
│   └── leukemia_best.pt
└── .ebextensions/
    └── python.config
```

#### Step 2: Create Elastic Beanstalk Application

```bash
# Install EB CLI if not installed
pip install awsebcli

# Initialize EB application
cd backend
eb init -p python-3.9 hemascan-backend --region eu-north-1

# Create environment
eb create hemascan-prod --instance-type t3.medium --envvars CORS_ORIGIN=https://your-frontend-domain.com

# Deploy
eb deploy
```

#### Step 3: Update CORS in main.py

The backend needs to allow your frontend domain. Update `main.py`:

```python
# Replace localhost origins with your production frontend URL
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://your-frontend-domain.com",
        "https://*.cloudfront.net",  # If using CloudFront
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### Step 4: Get Backend URL

After deployment, get your backend URL:
```bash
eb status
# Note the CNAME URL, e.g., hemascan-prod.eu-north-1.elasticbeanstalk.com
```

---

## Part 2: Frontend Deployment

### Option A: AWS Amplify (Easiest)

#### Step 1: Connect Repository

1. Go to AWS Amplify Console
2. Click "New app" → "Host web app"
3. Connect your Git repository (GitHub, GitLab, etc.)
4. Configure build settings:

**Build specification** (`amplify.yml`):
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm install
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: build
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

#### Step 2: Environment Variables

Add environment variables in Amplify Console:
- `VITE_API_URL`: Your backend URL (e.g., `https://hemascan-prod.eu-north-1.elasticbeanstalk.com`)

#### Step 3: Update Frontend API Calls

Update `src/components/Dashboard.tsx` to use environment variable:

```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
```

Then replace all `http://localhost:8000` with `${API_URL}`.

---

### Option B: S3 + CloudFront (More Control)

#### Step 1: Build Frontend

```bash
npm install
npm run build
```

#### Step 2: Create S3 Bucket

```bash
aws s3 mb s3://hemascan-frontend-prod --region eu-north-1
aws s3 website s3://hemascan-frontend-prod --index-document index.html --error-document index.html
```

#### Step 3: Upload Build Files

```bash
aws s3 sync build/ s3://hemascan-frontend-prod --delete
```

#### Step 4: Configure CloudFront

1. Create CloudFront distribution
2. Origin: S3 bucket (hemascan-frontend-prod)
3. Default root object: `index.html`
4. Add error pages: 403 → 200 → `/index.html` (for React Router)

#### Step 5: Update CORS Policy

Add bucket policy for CloudFront access.

---

## Part 3: Environment Configuration

### Backend Environment Variables

Create `.ebextensions/environment.config`:

```yaml
option_settings:
  aws:elasticbeanstalk:application:environment:
    CORS_ORIGIN: "https://your-frontend-domain.com"
    ENVIRONMENT: "production"
```

### Frontend Environment Variables

Create `.env.production`:

```env
VITE_API_URL=https://your-backend-url.elasticbeanstalk.com
```

---

## Part 4: Security Considerations

1. **HTTPS**: Ensure both frontend and backend use HTTPS
2. **CORS**: Restrict CORS to your frontend domain only
3. **API Keys**: Store sensitive keys in AWS Secrets Manager or Parameter Store
4. **Model Files**: Consider storing large model files in S3 and loading at runtime

---

## Part 5: Monitoring & Logging

### CloudWatch Logs

Backend logs are automatically sent to CloudWatch:
```bash
eb logs
```

### Application Monitoring

- Set up CloudWatch alarms for backend health
- Monitor API Gateway metrics (if using API Gateway)
- Track frontend errors with CloudWatch RUM or Sentry

---

## Part 6: Scaling

### Backend Scaling

Elastic Beanstalk auto-scaling:
```bash
eb scale 2  # Scale to 2 instances
```

Or configure in EB Console:
- Min instances: 1
- Max instances: 5
- Scaling triggers: CPU > 70%

### Frontend Scaling

- CloudFront automatically handles global distribution
- S3 provides unlimited scalability

---

## Part 7: Cost Optimization

1. **Backend**: Use EC2 Spot Instances for non-critical environments
2. **Storage**: Use S3 Intelligent-Tiering for model files
3. **CDN**: CloudFront pricing is pay-per-use
4. **Monitoring**: Set up billing alerts

---

## Troubleshooting

### Backend Issues

```bash
# Check logs
eb logs

# SSH into instance
eb ssh

# Check environment health
eb health
```

### Frontend Issues

- Check CloudFront cache invalidation
- Verify S3 bucket permissions
- Check browser console for CORS errors

---

## Quick Deployment Checklist

- [ ] Backend deployed to Elastic Beanstalk
- [ ] Backend URL obtained and tested
- [ ] Frontend environment variables configured
- [ ] Frontend deployed to Amplify or S3+CloudFront
- [ ] CORS configured correctly
- [ ] HTTPS enabled for both frontend and backend
- [ ] Domain names configured (optional)
- [ ] Monitoring and alerts set up
- [ ] Backups configured

---

## Support

For issues, check:
- AWS Elastic Beanstalk documentation
- AWS Amplify documentation
- AWS CloudFront documentation

