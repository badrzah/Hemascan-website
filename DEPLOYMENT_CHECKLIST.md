# AWS Deployment Checklist

Use this checklist to ensure all steps are completed for deploying HemaScan to AWS.

## Pre-Deployment

- [ ] AWS account created and configured
- [ ] AWS CLI installed and configured (`aws configure`)
- [ ] Git repository ready (for Amplify deployment)
- [ ] Domain name ready (optional, for custom domain)

## Backend Deployment

- [ ] Backend dependencies reviewed (`backend/requirements.txt`)
- [ ] Model files available (`backend/models/leukemia_best.pt`, `config.json`)
- [ ] Elastic Beanstalk CLI installed (`pip install awsebcli`)
- [ ] Backend initialized: `eb init`
- [ ] Environment created: `eb create`
- [ ] CORS_ORIGIN environment variable set with frontend URL
- [ ] Backend URL obtained and tested
- [ ] Health check endpoint working (`/` endpoint)

## Frontend Deployment

### Option A: AWS Amplify
- [ ] Repository connected to Amplify
- [ ] Build settings configured (`amplify.yml` present)
- [ ] Environment variable `VITE_API_URL` set to backend URL
- [ ] Build successful
- [ ] Frontend URL obtained

### Option B: S3 + CloudFront
- [ ] S3 bucket created
- [ ] Bucket configured for static website hosting
- [ ] Build files uploaded to S3
- [ ] CloudFront distribution created
- [ ] CloudFront cache invalidated
- [ ] Frontend URL obtained

## Configuration

- [ ] Frontend API endpoints updated to use environment variable
- [ ] Backend CORS configured for production frontend URL
- [ ] Environment variables set in both frontend and backend
- [ ] Vital Signs API endpoint verified (already configured)

## Testing

- [ ] Frontend loads correctly
- [ ] Login functionality works
- [ ] Image upload works
- [ ] Analysis endpoint responds correctly
- [ ] Grad CAM generation works
- [ ] Chat functionality works
- [ ] Vital signs monitoring works
- [ ] CORS errors resolved
- [ ] HTTPS working (both frontend and backend)

## Security

- [ ] HTTPS enabled (required for production)
- [ ] CORS restricted to frontend domain only
- [ ] Environment variables not exposed in client code
- [ ] Model files secured (not publicly accessible)
- [ ] API endpoints secured (if authentication added)

## Monitoring & Maintenance

- [ ] CloudWatch logs configured
- [ ] Health checks configured
- [ ] Alerts set up for errors
- [ ] Backup strategy in place
- [ ] Scaling configuration reviewed

## Post-Deployment

- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate installed
- [ ] DNS records updated
- [ ] Documentation updated with production URLs
- [ ] Team notified of deployment

## Rollback Plan

- [ ] Previous version tagged in Git
- [ ] Rollback procedure documented
- [ ] Test rollback process

## Cost Management

- [ ] AWS billing alerts configured
- [ ] Cost estimate reviewed (~$40-75/month)
- [ ] Auto-scaling limits set
- [ ] Unused resources identified

---

## Quick Commands Reference

### Backend
```bash
cd backend
eb init
eb create hemascan-prod
eb deploy
eb setenv CORS_ORIGIN=https://your-frontend-url.com
eb status
```

### Frontend (Amplify)
- Configure in AWS Console
- Add environment variable: `VITE_API_URL`

### Frontend (S3)
```bash
npm run build
aws s3 sync build/ s3://your-bucket-name --delete
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

---

## Troubleshooting

### CORS Errors
- Verify CORS_ORIGIN includes frontend URL
- Check that frontend is using HTTPS if backend expects HTTPS

### 502 Bad Gateway
- Check Elastic Beanstalk logs: `eb logs`
- Verify uvicorn is running on port 8000
- Check instance health in EB console

### Frontend Not Loading
- Verify S3 bucket permissions
- Check CloudFront distribution status
- Verify index.html is in root directory

### API Calls Failing
- Verify VITE_API_URL is set correctly
- Check browser console for errors
- Verify backend is accessible from frontend domain

---

**Last Updated**: [Date]
**Deployed By**: [Name]
**Environment**: Production

