# Quickstart: Gold Tier Autonomous Business Employee

## Prerequisites

1. **Bronze Tier** fully operational (file-drop watcher, vault workflow, dashboard)
2. **Silver Tier** fully operational (Gmail/LinkedIn watchers, MCP integration, scheduler)
3. **Odoo Community v19+** installed and running (same machine or LAN)
4. **Social media accounts** with API access configured

## Environment Variables

Add these to your `.env` file (in addition to Bronze + Silver vars):

```bash
# ─── Odoo Configuration ───────────────────────────────────
ODOO_URL=http://localhost:8069          # Odoo instance URL
ODOO_DATABASE=mycompany                 # Odoo database name
ODOO_USERNAME=admin                     # Odoo login username
ODOO_API_KEY=your-odoo-api-key          # Odoo API key (Settings → Users → API Keys)

# ─── Facebook ─────────────────────────────────────────────
FACEBOOK_PAGE_ID=your-page-id
FACEBOOK_PAGE_ACCESS_TOKEN=your-long-lived-page-token

# ─── Instagram (via Facebook Graph API) ───────────────────
INSTAGRAM_BUSINESS_ACCOUNT_ID=your-ig-business-id
INSTAGRAM_ACCESS_TOKEN=your-ig-access-token

# ─── Twitter/X ────────────────────────────────────────────
TWITTER_API_KEY=your-api-key
TWITTER_API_SECRET=your-api-secret
TWITTER_ACCESS_TOKEN=your-access-token
TWITTER_ACCESS_TOKEN_SECRET=your-access-token-secret

# ─── Watchdog ─────────────────────────────────────────────
WATCHDOG_CHECK_INTERVAL_MS=30000        # Health check interval (default: 30s)
WATCHDOG_MAX_RESTARTS=10                # Max restarts before alerting

# ─── Persistence Loop ────────────────────────────────────
PERSISTENCE_STALL_TIMEOUT_MS=300000     # 5 minutes without progress = stall alert
PERSISTENCE_MAX_RETRIES=3               # Retries per failed step
PERSISTENCE_RETRY_BACKOFF_MS=5000       # Initial backoff between retries

# ─── Audit Logging ───────────────────────────────────────
AUDIT_ENABLE_HASH_CHAINING=true         # Enable tamper-evident hash chain
```

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Odoo

1. Ensure Odoo v19+ is running and accessible at `ODOO_URL`
2. Enable the Accounting module in Odoo
3. Create an API key: Settings → Users → Your User → API Keys → New
4. Set `ODOO_DATABASE`, `ODOO_USERNAME`, `ODOO_API_KEY` in `.env`

### 3. Configure Social Media

**Facebook:**
1. Create a Facebook App at developers.facebook.com
2. Get a long-lived Page Access Token
3. Set `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_ACCESS_TOKEN`

**Instagram:**
1. Connect Instagram Business Account to Facebook Page
2. Use the same Facebook Graph API token
3. Set `INSTAGRAM_BUSINESS_ACCOUNT_ID` and `INSTAGRAM_ACCESS_TOKEN`

**Twitter/X:**
1. Create a Twitter Developer App at developer.twitter.com
2. Generate OAuth 1.0a credentials
3. Set all four `TWITTER_*` variables

### 4. Initialize Vault Extensions

The Gold daemon auto-creates these vault folders if missing:
- `/Briefings` — Weekly CEO briefings
- `/Logs` — Enhanced audit logs (JSON with hash chaining)

### 5. Start Gold Daemon

```bash
# Normal mode
npm run start:gold

# Dry-run mode (no external actions)
DRY_RUN=true npm run start:gold
```

### 6. Start Watchdog (Separate Process)

```bash
# Manual start
npm run watchdog

# Install as scheduled task (Windows)
npm run setup-gold-scheduler
```

### 7. Setup Scheduled Jobs

```bash
# Install OS-level scheduled jobs (Sunday CEO briefing, watchdog)
npm run setup-gold-scheduler

# Manually trigger a scheduled job
npm run trigger:gold -- --job weekly-ceo-briefing
```

## Verification Checklist

- [ ] Odoo MCP server connects successfully (`gold_odoo_connected` in logs)
- [ ] `DRY_RUN=true` — create invoice task → draft created, approval requested, no Odoo posting
- [ ] Social media platforms report as configured in startup logs
- [ ] Watchdog detects daemon PID and reports "running"
- [ ] Audit log file created at `/Logs/YYYY-MM-DD.json` with hash chain entries
- [ ] Trigger `weekly-ceo-briefing` → briefing generated at `/Briefings/`
- [ ] All Bronze watchers (file-drop) still operational
- [ ] All Silver watchers (Gmail, LinkedIn) still operational

## Troubleshooting

| Issue | Check |
|-------|-------|
| Odoo connection fails | Verify `ODOO_URL` is reachable, API key is valid |
| Social post rejected | Check platform-specific error in alert file |
| Watchdog can't find PID | Verify `gold/gold-daemon.pid` exists after daemon start |
| Hash chain broken | Run audit integrity check: `npm run audit:verify -- --date YYYY-MM-DD` |
| Briefing missing sections | Check if Odoo was reachable during generation (see log) |
