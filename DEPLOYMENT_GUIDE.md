# DigitalOcean Deployment Guide

This guide will help you deploy your Vite React app to DigitalOcean App Platform.

## Prerequisites

1. **DigitalOcean Account**: Sign up at https://www.digitalocean.com/ (if you don't have one)
2. **GitHub Repository**: Your project should be pushed to GitHub
3. **AfterShip API Key**: If your app uses AfterShip API

## Step-by-Step Setup

### 1. Create DigitalOcean API Token

1. Go to https://cloud.digitalocean.com/account/api/tokens
2. Click **"Generate New Token"**
3. Give it a name (e.g., "Deployment Token")
4. Select **"Write"** scope
5. Click **"Generate Token"**
6. **Copy the token immediately** (you won't be able to see it again!)

### 2. Get Your GitHub Repository Information

Your repository should be in the format: `username/repo-name`

For example:
- If your repo URL is `https://github.com/john/my-app`, then use `john/my-app`
- If your repo URL is `https://github.com/john/my-app.git`, still use `john/my-app`

### 3. Create Deployment Configuration File

1. Navigate to `deployments/digitalocean/` folder
2. Copy the example file:
   ```powershell
   Copy-Item .env.deploy.example .env.deploy
   ```
3. Open `.env.deploy` in your editor
4. Fill in all the required values:
   - `DO_ACCESS_TOKEN`: Your DigitalOcean API token from step 1
   - `VITE_AFTERSHIP_API_KEY`: Your AfterShip API key (if needed)
   - `DO_GITHUB_REPO`: Your GitHub repo in `username/repo` format
   - Optionally adjust `DO_APP_NAME`, `DO_REGION`, and `DO_GITHUB_BRANCH`

### 4. Enable PowerShell Script Execution (One-time setup)

Open PowerShell as Administrator and run:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

This allows PowerShell to run local scripts.

### 5. Deploy Your App

From the project root directory, run:
```powershell
powershell -ExecutionPolicy Bypass -File deployments/digitalocean/deploy.ps1
```

**What happens:**
- The script downloads `doctl` (DigitalOcean CLI) if needed
- Installs npm dependencies
- Builds your app
- Creates or updates your DigitalOcean App
- Waits for deployment to complete
- Shows you the live URL

### 6. First Deployment

On the first run:
- The script creates a new App on DigitalOcean
- It stores the App ID in `deployments/digitalocean/.do-app-id`
- You'll see a URL like: `https://your-app-name-xxxxx.ondigitalocean.app`

### 7. Subsequent Deployments

Just run the same command again:
```powershell
powershell -ExecutionPolicy Bypass -File deployments/digitalocean/deploy.ps1
```

The script will detect your existing app and update it.

## Optional: Set Up Auto-Deploy

1. Go to https://cloud.digitalocean.com/apps
2. Click on your app
3. Go to **Settings** → **Deployments**
4. Enable **"Auto Deploy on Push"**
5. Connect your GitHub repository if prompted

Now, every time you push to your main branch, DigitalOcean will automatically deploy!

## Optional: Custom Domain

1. Go to your app in DigitalOcean dashboard
2. Click **Settings** → **Domains**
3. Click **"Add Domain"**
4. Enter your domain name
5. Follow the DNS configuration instructions

## Troubleshooting

### Script fails with "Missing required setting"
- Make sure `.env.deploy` exists in `deployments/digitalocean/`
- Check that all required values are filled in

### Build fails
- Check that your `package.json` has a `build` script
- Make sure all dependencies are listed in `package.json`
- Review build logs: `doctl apps logs APP_ID --type build`

### Deployment takes too long
- First deployment can take 5-10 minutes
- Check the DigitalOcean dashboard for progress

### Want to start fresh
- Delete `deployments/digitalocean/.do-app-id`
- Run the deploy script again to create a new app

### View logs
```powershell
$appId = Get-Content deployments/digitalocean/.do-app-id
doctl apps logs $appId --type build
doctl apps logs $appId --type run
```

## Cost Information

DigitalOcean App Platform pricing:
- **Free tier**: Not available (minimum is $5/month)
- **Basic plan**: Starts at $5/month for static sites
- Check current pricing at: https://www.digitalocean.com/pricing/app-platform

## Need Help?

- DigitalOcean Docs: https://docs.digitalocean.com/products/app-platform/
- DigitalOcean Support: https://www.digitalocean.com/support/

