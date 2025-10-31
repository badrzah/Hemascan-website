# How to Push Your Files to GitHub

Follow these steps to push your HemaScan project to GitHub.

## 📋 Prerequisites

- [ ] GitHub account (create at https://github.com if you don't have one)
- [ ] Git installed on your computer
- [ ] Your project files ready

---

## 🚀 Step-by-Step Guide

### Step 1: Check if Git is Initialized

Open PowerShell or Command Prompt in your project folder and check:

```powershell
cd "c:\Users\Admin\Desktop\Login Page Design"
git status
```

**If you see**: "fatal: not a git repository"
→ You need to initialize Git (go to Step 2)

**If you see**: File list or "nothing to commit"
→ Git is already initialized (skip to Step 4)

---

### Step 2: Initialize Git Repository

```powershell
cd "c:\Users\Admin\Desktop\Login Page Design"
git init
```

This creates a new Git repository in your folder.

---

### Step 3: Add All Files

```powershell
git add .
```

This stages all your files for commit.

**Note**: Files in `.gitignore` will be excluded automatically (like `node_modules/`, `build/`, etc.)

---

### Step 4: Create First Commit

```powershell
git commit -m "Initial commit: HemaScan project ready for AWS deployment"
```

This saves your files to the local Git repository.

---

### Step 5: Create GitHub Repository

1. **Go to GitHub**: https://github.com
2. **Sign in** to your account
3. **Click the "+" icon** (top right) → **"New repository"**
4. **Repository name**: `hemascan` (or any name you like)
5. **Description**: "HemaScan - Leukemia Detection and Diagnosis System"
6. **Visibility**: Choose **Public** or **Private**
   - Public: Anyone can see your code
   - Private: Only you (and collaborators) can see
7. **DO NOT** check "Initialize with README" (you already have files)
8. **Click "Create repository"**

---

### Step 6: Connect Local Repository to GitHub

After creating the repository, GitHub will show you commands. Use these:

**Replace `YOUR_USERNAME` with your GitHub username:**

```powershell
git remote add origin https://github.com/YOUR_USERNAME/hemascan.git
```

**Example:**
```powershell
git remote add origin https://github.com/johndoe/hemascan.git
```

---

### Step 7: Push Files to GitHub

```powershell
git branch -M main
git push -u origin main
```

**If prompted for credentials:**
- **Username**: Your GitHub username
- **Password**: Use a **Personal Access Token** (not your GitHub password)
  - See "Personal Access Token Setup" below if needed

---

## 🔑 Personal Access Token Setup

GitHub requires a Personal Access Token instead of password:

### Create Token:

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. **Note name**: "HemaScan Deployment"
4. **Expiration**: Choose expiration (90 days recommended)
5. **Select scopes**: Check **"repo"** (all repo permissions)
6. Click **"Generate token"**
7. **Copy the token immediately** (you won't see it again!)

### Use Token:

When Git asks for password, paste your **Personal Access Token** instead.

---

## ✅ Verify Upload

1. Go to your GitHub repository: `https://github.com/YOUR_USERNAME/hemascan`
2. You should see all your files:
   - ✅ `src/` folder
   - ✅ `backend/` folder
   - ✅ `package.json`
   - ✅ `amplify.yml`
   - ✅ All other project files

---

## 🔄 Future Updates

After making changes, push updates with:

```powershell
git add .
git commit -m "Description of your changes"
git push
```

---

## 📝 Quick Command Reference

```powershell
# Navigate to project
cd "c:\Users\Admin\Desktop\Login Page Design"

# Check status
git status

# Add all files
git add .

# Commit changes
git commit -m "Your commit message"

# Push to GitHub
git push

# Pull latest changes (if working from multiple computers)
git pull
```

---

## 🐛 Troubleshooting

### "remote origin already exists"

**Fix:**
```powershell
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/hemascan.git
```

### "fatal: could not read Username"

**Fix:**
- Make sure you're using Personal Access Token, not password
- Or use GitHub Desktop app (easier)

### "fatal: not a git repository"

**Fix:**
```powershell
git init
```

### Large Files Error

If you get errors about large files (like model files):

**Option 1: Use Git LFS** (for large files)
```powershell
git lfs install
git lfs track "*.pt"
git add .gitattributes
git add .
git commit -m "Add large files with Git LFS"
```

**Option 2: Exclude large files** (recommended)
- Make sure `.gitignore` excludes `*.pt` files
- Model files will be uploaded separately to AWS

---

## 🎯 Important Files to Push

Make sure these are in your repository:

- ✅ `amplify.yml` (needed for Amplify)
- ✅ `package.json` (dependencies)
- ✅ `src/` folder (your React code)
- ✅ `backend/` folder (your Python backend)
- ✅ `vite.config.ts` (Vite configuration)
- ✅ All configuration files

---

## ⚠️ Files NOT to Push (Already in .gitignore)

These are automatically excluded:
- ❌ `node_modules/` (too large)
- ❌ `build/` (generated files)
- ❌ `.env` files (sensitive data)
- ❌ `backend/results/` (generated files)
- ❌ `*.pt` files (model files - too large for GitHub)

---

## 🚀 After Pushing to GitHub

Once your code is on GitHub:

1. ✅ Your code is backed up
2. ✅ Ready to connect to AWS Amplify
3. ✅ Can collaborate with others
4. ✅ Version control for your project

**Next Step**: Connect GitHub to AWS Amplify (see `AMPLIFY_DEPLOYMENT_STEPS.md`)

---

## 💡 Pro Tips

1. **Commit often**: Small, frequent commits are better than one big commit
2. **Good commit messages**: Describe what changed, e.g., "Add API configuration for AWS"
3. **Branch strategy**: Create branches for features (optional for solo projects)
4. **README**: Update `README.md` with project description

---

**Need Help?**
- GitHub Docs: https://docs.github.com
- Git Tutorial: https://git-scm.com/docs
- GitHub Desktop: https://desktop.github.com (easier GUI option)

