# AWS Deployment Quick Start

This document provides a quick start guide for deploying HemaScan to AWS.

**✅ No Docker Required!** The recommended deployment uses AWS Elastic Beanstalk, which handles everything automatically without Docker.

## Quick Deploy (Recommended - No Docker Needed)

### 1. Backend Deployment (Elastic Beanstalk - No Docker)

AWS Elastic Beanstalk automatically handles Python environments, dependencies, and deployment. You don't need Docker at all!

```bash
cd backend
pip install awsebcli
eb init -p python-3.9 hemascan-backend --region eu-north-1
eb create hemascan-prod --instance-type t3.medium
eb deploy
```

After deployment, get your backend URL:
```bash
eb status
```

Update CORS with your frontend URL:
```bash
eb setenv CORS_ORIGIN=https://your-frontend-domain.com
```

### 2. Frontend Deployment (AWS Amplify - Recommended)

**Why Amplify?** It's the easiest option with automatic CI/CD, SSL, and React Router support. See `FRONTEND_DEPLOYMENT_COMPARISON.md` for details.

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Click "New app" → "Host web app"
3. Connect your Git repository
4. Build settings will be auto-detected from `amplify.yml`
5. Add environment variable: `VITE_API_URL` = your backend URL
6. Deploy!

**Alternative**: If you prefer S3 + CloudFront, see `AWS_DEPLOYMENT_GUIDE.md` for instructions.

### 3. Update Frontend API Configuration

Update `src/components/Dashboard.tsx` to use environment variable:

```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
```

Replace all `http://localhost:8000` with `${API_URL}`.

## Alternative: Manual Deployment Scripts

### Backend
```bash
chmod +x deploy-backend.sh
./deploy-backend.sh hemascan-prod
```

### Frontend
```bash
chmod +x deploy-frontend.sh
./deploy-frontend.sh hemascan-frontend-prod
```

## Environment Variables

### Backend (.ebextensions/environment.config)
```yaml
CORS_ORIGIN: "https://your-frontend-domain.com"
ENVIRONMENT: "production"
```

### Frontend (.env.production)
```env
VITE_API_URL=https://your-backend-url.elasticbeanstalk.com
```

## Architecture

```
Frontend (React/Vite)
    ↓ HTTPS
AWS Amplify / S3 + CloudFront
    ↓ API Calls
Backend (FastAPI + PyTorch)
    ↓
AWS Elastic Beanstalk (No Docker needed!)
```


## Cost Estimate (Monthly)

- **Elastic Beanstalk**: ~$30-50/month (t3.medium instance)
- **S3**: ~$1-5/month (depending on traffic)
- **CloudFront**: ~$5-20/month (depending on traffic)
- **Amplify**: Free tier includes 1000 build minutes/month

**Total**: ~$40-75/month for low-medium traffic

## Next Steps

1. ✅ Deploy backend to Elastic Beanstalk
2. ✅ Deploy frontend to Amplify (recommended) or S3+CloudFront
3. ✅ Configure CORS
4. ✅ Set up custom domain (optional)
5. ✅ Configure SSL certificates (automatic with Amplify)
6. ✅ Set up monitoring and alerts

**Need help choosing?** See [FRONTEND_DEPLOYMENT_COMPARISON.md](./FRONTEND_DEPLOYMENT_COMPARISON.md) for Amplify vs S3+CloudFront comparison.

For detailed instructions, see [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md)

