# Quickstart: Silver Tier Multi-Tool Assistant

## Prerequisites

1. **Bronze tier running** — `bronze/src/` must compile and the daemon must work
2. **Node.js 18+** with npm
3. **Google Cloud Project** — Gmail API enabled, OAuth2 credentials (`credentials.json`)
4. **LinkedIn Developer App** — with `w_member_social` scope, client ID + secret

## Install Dependencies

```bash
# From project root
npm install @modelcontextprotocol/sdk zod
npm install linkedin-mcp-server
```

Gmail MCP server runs via npx (no install needed):
```bash
npx @gongrzhe/server-gmail-mcp
```

## Environment Variables

Add to `.env`:
```env
# Existing Bronze vars
VAULT_PATH=/path/to/obsidian/vault
DRY_RUN=false
POLL_INTERVAL_MS=2000

# Gmail watcher
GMAIL_CREDENTIALS_PATH=./credentials.json
GMAIL_TOKEN_PATH=./token.json
GMAIL_POLL_INTERVAL_MS=30000

# LinkedIn watcher
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
LINKEDIN_ACCESS_TOKEN=your_access_token
LINKEDIN_POLL_INTERVAL_MS=60000

# MCP servers
MCP_GMAIL_COMMAND=npx
MCP_GMAIL_ARGS=@gongrzhe/server-gmail-mcp
MCP_LINKEDIN_COMMAND=npx
MCP_LINKEDIN_ARGS=linkedin-mcp-server
```

## TypeScript Config

The `tsconfig.json` needs path aliases for cross-tier imports:
```json
{
  "compilerOptions": {
    "paths": {
      "@bronze/*": ["./bronze/src/*"]
    }
  },
  "include": ["bronze/src/**/*", "silver/src/**/*"]
}
```

## Run

```bash
# Start Silver daemon (extends Bronze)
npx ts-node silver/src/index.ts
```

## Setup Scheduled Jobs (Windows)

```powershell
# Daily briefing at 7:00 AM
schtasks /create /tn "AI-Employee-DailyBriefing" /tr "npx ts-node silver/src/scheduler/trigger.ts --job daily-briefing" /sc daily /st 07:00

# LinkedIn post at 9:00 AM weekdays
schtasks /create /tn "AI-Employee-LinkedInPost" /tr "npx ts-node silver/src/scheduler/trigger.ts --job linkedin-post" /sc weekly /d MON,TUE,WED,THU,FRI /st 09:00
```

## Verify

1. **Watchers**: Send a test email → check `/Needs_Action` for task file
2. **MCP**: Set `DRY_RUN=true`, trigger an email task → check logs for MCP call intent
3. **HITL**: Trigger a LinkedIn post → check `/Pending_Approval` for approval file
4. **Scheduler**: Run trigger script manually → check `/Inbox` for scheduled task file
