# DigitalOcean Deployment

These helper scripts deploy the Vite app to DigitalOcean App Platform with a single command.  
Choose the PowerShell script on Windows or the Bash script on macOS/Linux. Both install `doctl` locally, build the app, create/update the App Platform resource, wait for completion, and print the live URL.

## One-time setup

1. **Create a DigitalOcean API token**
   - Go to https://cloud.digitalocean.com/account/api/tokens
   - Generate a **Personal access token** with _Write_ scope.

2. **Create `deployments/digitalocean/.env.deploy`**
   ```
   DO_ACCESS_TOKEN=pat_XXXXXXXXXXXXXXXXXXXXXXXX
   VITE_AFTERSHIP_API_KEY=your-aftership-key
    DO_GITHUB_REPO=your-github-username/your-repo
    DO_GITHUB_BRANCH=main                  # optional (default shown)
   DO_APP_NAME=cursor-test-project        # optional (default shown)
   DO_REGION=nyc                          # optional (default shown)
   ```
   - This file is gitignored and read automatically by the script.

3. **Ensure PowerShell can run local scripts** (Windows only)
   ```
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```

## Deploy

Run from anywhere (Windows):
```
powershell -ExecutionPolicy Bypass -File deployments/digitalocean/deploy.ps1
```

macOS/Linux:
```
bash deployments/digitalocean/deploy.sh
```

The script will:
- install `doctl` locally (if needed)
- build a fresh spec from the template and inject your secrets
- create the App on first run and store its ID in `.do-app-id`
- wait for the deployment to finish and print the live URL

## Updating

Just rerun the same command. The script detects the app ID and performs an `apps update`, then waits for completion.

## Troubleshooting

- Remove `.do-app-id` if you want to recreate the App from scratch.
- Override any value using environment variables (e.g. `DO_REGION`) if you don’t want it in `.env.deploy`.
- To view logs for the latest deployment:
  ```
  doctl apps logs $(Get-Content deployments/digitalocean/.do-app-id) --type build
  ```
## Step-by-step in the DigitalOcean UI (first time)

1. **Create a Personal Access Token** (Account → API → Tokens → Generate New Token) with write scope.  
   This becomes `DO_ACCESS_TOKEN` in `.env.deploy`.
2. **Provision App Platform** by running either deploy script once.  
   On first run the script creates the App, prints the default URL, and stores the App ID in `.do-app-id`.
3. **Review the app** at https://cloud.digitalocean.com/apps/ — you should see the new app with recent deployment history.
4. **Configure a custom domain** (optional): App → Settings → Domains → Add Domain. Update DNS records per DigitalOcean’s instructions.
5. **Set up auto-deploy (optional)**: App → Settings → Deployments → Auto Deploy on Push. Connect your Git repo if prompted.
6. **Monitor builds/logs** directly from the App dashboard, or via `doctl apps logs APP_ID --type build/run`.

Subsequent deployments are just a single script run; everything else stays in sync automatically.

