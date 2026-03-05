# Quickstart: Platinum Tier — Split-Brain Production AI Employee

## Prerequisites

- All Gold tier features working locally (`npm run start:gold` runs without errors)
- A Linux VPS (Ubuntu 22.04+ recommended) with Node.js 18+ and Git installed
- SSH access to the VPS
- Git remote repository for vault sync (GitHub, GitLab, or self-hosted)

## 1. Vault Repository Setup

```bash
# On local machine — initialize vault as a Git repo
cd /path/to/obsidian/vault
git init
echo ".env*" >> .gitignore
echo "credentials.*" >> .gitignore
echo "token.*" >> .gitignore
echo "*.key" >> .gitignore
echo "*.pem" >> .gitignore
git add .
git commit -m "Initial vault commit"
git remote add origin <your-vault-repo-url>
git push -u origin main
```

## 2. Cloud Server Setup

```bash
# On VPS
git clone <your-project-repo-url> ~/ai-employee
cd ~/ai-employee
npm install

# Clone vault repo
git clone <your-vault-repo-url> ~/vault

# Create cloud environment file
cp .env.example .env.cloud
# Edit .env.cloud — set AGENT_MODE=cloud, VAULT_PATH=~/vault
# Include: Gmail (read), LinkedIn (read), Odoo credentials
# EXCLUDE: Banking, WhatsApp, payment tokens
```

## 3. Local Machine Setup

```bash
# Create local environment file
cp .env.example .env.local
# Edit .env.local — set AGENT_MODE=local, VAULT_PATH=/path/to/vault
# Include ALL credentials (Gmail send, banking, WhatsApp, payments, etc.)
```

## 4. Start Cloud Agent

```bash
# Option A: systemd (recommended)
sudo cp platinum/deploy/ai-employee-cloud.service /etc/systemd/system/
sudo systemctl enable ai-employee-cloud
sudo systemctl start ai-employee-cloud

# Option B: PM2
pm2 start platinum/deploy/ecosystem.config.js
pm2 save
pm2 startup
```

## 5. Start Local Agent

```bash
# On local machine
npm run start:platinum
# or
AGENT_MODE=local npx ts-node platinum/src/index.ts
```

## 6. Verify

1. Check cloud agent status: `sudo systemctl status ai-employee-cloud` or `pm2 status`
2. Send a test email to your monitored inbox
3. Wait for cloud agent to create a draft in `/Pending_Approval`
4. Pull vault changes locally: `cd /path/to/vault && git pull`
5. Review and approve the draft (move to `/Approved`)
6. Commit and push: `git add . && git commit -m "Approved draft" && git push`
7. Cloud agent syncs → Local agent detects approval → executes send
8. Verify task moved to `/Done` and logs written

## Environment Variables (New for Platinum)

| Variable | Cloud | Local | Description |
|----------|-------|-------|-------------|
| `AGENT_MODE` | `cloud` | `local` | Which agent mode to run |
| `VAULT_SYNC_ENABLED` | `true` | `true` | Enable vault Git sync |
| `VAULT_SYNC_INTERVAL_MS` | `60000` | `60000` | Sync interval (default 60s) |
| `VAULT_SYNC_REMOTE_URL` | `<git-url>` | `<git-url>` | Vault Git remote |
| `VAULT_SYNC_BRANCH` | `main` | `main` | Vault Git branch |
| `VAULT_SYNC_SSH_KEY` | `~/.ssh/id_rsa` | `~/.ssh/id_rsa` | SSH key for Git |
| `HEALTH_CHECK_INTERVAL_MS` | `60000` | `0` (disabled) | Health check interval |
| `HEALTH_DISK_THRESHOLD_PCT` | `90` | `0` | Disk usage alert threshold |
| `BACKUP_ENABLED` | `true` | `false` | Enable vault backups |
| `BACKUP_INTERVAL_MS` | `86400000` | — | Backup interval (24h) |
| `BACKUP_PATH` | `~/backups` | — | Backup storage path |
| `RATE_LIMIT_PER_MINUTE` | `30` | `60` | API rate limit per minute |
| `RATE_LIMIT_PER_HOUR` | `500` | `1000` | API rate limit per hour |

## Scripts (New for Platinum)

| Script | Description |
|--------|-------------|
| `npm run start:platinum` | Start daemon (reads AGENT_MODE from env) |
| `npm run dev:platinum` | Dev mode with watch |
| `npm run vault:sync` | Manual vault sync |
| `npm run health:check` | One-shot health check |
| `npm run backup:create` | Manual vault backup |
| `npm run deploy:setup` | Generate systemd/PM2 config |
