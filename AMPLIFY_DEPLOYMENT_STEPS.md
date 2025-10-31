# AWS Amplify Deployment - Step by Step Guide

Follow these steps to deploy your HemaScan frontend to AWS Amplify.

## 📋 Prerequisites Checklist

Before starting, make sure you have:

- [ ] AWS Account (if not, create one at https://aws.amazon.com/)
- [ ] Git repository (GitHub, GitLab, or Bitbucket) with your code pushed
- [ ] Backend deployed to Elastic Beanstalk (or at least have the backend URL ready)
- [ ] Node.js installed locally (for testing builds)

---

## 🚀 Step-by-Step Deployment

### Step 1: Prepare Your Git Repository

1. **Make sure your code is committed and pushed to Git**
   ```bash
   git add .
   git commit -m "Prepare for Amplify deployment"
   git push origin main  # or master, depending on your branch
   ```

2. **Verify these files exist in your repository:**
   - ✅ `amplify.yml` (build configuration)
   - ✅ `package.json` (dependencies)
   - ✅ `src/` folder (your React code)
   - ✅ `vite.config.ts` (Vite configuration)

---

### Step 2: Deploy Backend First (If Not Done)

**Important**: Deploy your backend BEFORE deploying the frontend, so you have the backend URL for the environment variable.

```bash
cd backend
pip install awsebcli
eb init -p python-3.9 hemascan-backend --region eu-north-1
eb create hemascan-prod --instance-type t3.medium
eb deploy
eb status  # Note the CNAME URL
```

Copy the backend URL (e.g., `https://hemascan-prod.eu-north-1.elasticbeanstalk.com`)

---

### Step 3: Create Amplify App

1. **Go to AWS Amplify Console**
   - Visit: https://console.aws.amazon.com/amplify/
   - Sign in with your AWS account

2. **Create New App**
   - Click **"New app"** button (top right)
   - Select **"Host web app"**

3. **Connect Repository**
   - Choose your Git provider (GitHub, GitLab, Bitbucket, or AWS CodeCommit)
   - Click **"Connect branch"**
   - Authorize AWS Amplify to access your repository
   - Select your repository: `Login Page Design` (or your repo name)
   - Select branch: `main` (or `master`)

4. **Configure Build Settings**
   - Amplify should auto-detect your `amplify.yml` file
   - If not detected, you can paste this configuration:
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

5. **Click "Save and deploy"**

---

### Step 4: Configure Environment Variables

**Before the first deployment completes**, add environment variables:

1. In the Amplify console, go to your app
2. Click **"Environment variables"** in the left sidebar
3. Click **"Manage variables"**
4. Add this variable:
   - **Key**: `VITE_API_URL`
   - **Value**: Your backend URL (e.g., `https://hemascan-prod.eu-north-1.elasticbeanstalk.com`)
   - **Environment**: Select "All environments" or specific environment

5. Click **"Save"**

**Important**: After adding environment variables, Amplify will automatically trigger a new build with the updated variables.

---

### Step 5: Wait for Deployment

1. **Monitor the build**
   - Watch the build logs in real-time
   - The first build usually takes 3-5 minutes

2. **Check for errors**
   - If build fails, check the logs
   - Common issues:
     - Missing dependencies → Check `package.json`
     - Build errors → Check your code
     - Environment variable issues → Verify `VITE_API_URL` is set

3. **Deployment successful**
   - You'll see a green checkmark ✅
   - Your app URL will be displayed (e.g., `https://main.d1234abcd.amplifyapp.com`)

---

### Step 6: Update Backend CORS

After getting your Amplify URL, update your backend CORS settings:

```bash
cd backend
eb setenv CORS_ORIGIN=https://your-amplify-url.amplifyapp.com
```

Or if you have multiple environments:
```bash
eb setenv CORS_ORIGIN="https://main.d1234abcd.amplifyapp.com,https://*.amplifyapp.com"
```

---

### Step 7: Test Your Deployment

1. **Visit your Amplify URL**
   - Click the app URL in Amplify console
   - Or use the URL format: `https://main.xxxxxxxx.amplifyapp.com`

2. **Test the application**
   - ✅ Login page loads
   - ✅ Can log in (test with `a/a` credentials)
   - ✅ Dashboard loads
   - ✅ Image upload works
   - ✅ API calls to backend work
   - ✅ Vital signs monitoring works

3. **Check browser console**
   - Open Developer Tools (F12)
   - Check for any CORS errors
   - Verify API calls are going to correct backend URL

---

## 🔄 Continuous Deployment

**Amplify automatically deploys on every Git push!**

1. Make changes to your code
2. Commit and push:
   ```bash
   git add .
   git commit -m "Update feature"
   git push origin main
   ```
3. Amplify automatically detects the push
4. New build starts automatically
5. Deploys when build completes

---

## 🌐 Custom Domain (Optional)

To use your own domain:

1. In Amplify console, go to **"Domain management"**
2. Click **"Add domain"**
3. Enter your domain name (e.g., `hemascan.com`)
4. Follow the DNS configuration steps
5. Amplify will automatically provision SSL certificate

---

## 🐛 Troubleshooting

### Build Fails

**Check:**
- Build logs in Amplify console
- Verify `package.json` has all dependencies
- Check `amplify.yml` syntax
- Ensure Node.js version is compatible (check in Amplify build settings)

**Common fixes:**
```bash
# Test build locally first
npm install
npm run build
```

### CORS Errors

**Symptom**: Browser console shows CORS errors

**Fix:**
1. Get your Amplify URL
2. Update backend CORS:
   ```bash
   eb setenv CORS_ORIGIN=https://your-amplify-url.amplifyapp.com
   ```
3. Wait for backend to restart
4. Refresh frontend

### API Calls Not Working

**Check:**
- Environment variable `VITE_API_URL` is set correctly
- Backend is running and accessible
- CORS is configured correctly
- Check browser Network tab for failed requests

### Page Shows 404 on Refresh

**This shouldn't happen with Amplify** - it handles React Router automatically. If it does:
- Check `amplify.yml` has correct `baseDirectory: build`
- Verify `index.html` is in the build folder

---

## 📊 Monitoring

### View Build History
- Go to Amplify console → Your app → "Build history"
- See all past deployments
- Click any build to see logs

### View App Metrics
- Go to "Monitoring" tab
- See request counts, response times
- Check error rates

---

## ✅ Post-Deployment Checklist

- [ ] Frontend deployed successfully
- [ ] Environment variable `VITE_API_URL` configured
- [ ] Backend CORS updated with Amplify URL
- [ ] Login page works
- [ ] Dashboard loads
- [ ] Image upload works
- [ ] Analysis API calls work
- [ ] Grad CAM generation works
- [ ] Chat functionality works
- [ ] Vital signs monitoring works
- [ ] No CORS errors in browser console
- [ ] Custom domain configured (if desired)

---

## 🎉 You're Done!

Your frontend is now live on AWS Amplify with:
- ✅ Automatic deployments on Git push
- ✅ HTTPS enabled
- ✅ Global CDN
- ✅ Auto-scaling
- ✅ Build logs and monitoring

**Your Amplify URL**: `https://main.xxxxxxxx.amplifyapp.com`

**Next Steps:**
- Share your app URL with users
- Monitor usage in Amplify console
- Continue developing - every push auto-deploys!

---

## 💡 Tips

1. **Branch deployments**: Create branches for staging/production
2. **Preview deployments**: Amplify creates preview URLs for pull requests
3. **Environment variables**: Different values for different branches
4. **Rollback**: Easy one-click rollback to previous deployment
5. **Notifications**: Set up email/Slack notifications for deployments

---

**Need Help?**
- AWS Amplify Documentation: https://docs.aws.amazon.com/amplify/
- Check build logs in Amplify console
- Verify environment variables are set correctly

