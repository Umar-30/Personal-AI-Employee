# Quickstart: Local AI Employee MVP

**Branch**: `001-ai-employee-mvp` | **Date**: 2026-02-15

## Prerequisites

- Node.js 20 LTS installed
- Claude Code CLI installed and authenticated (`claude --version` works)
- An Obsidian vault directory (or any folder you want to use as the vault)

## Setup

1. **Clone and install**:
   ```bash
   cd "D:/Hackathon Q4/AI Employee"
   npm install
   ```

2. **Configure vault path** — create a `.env` file in the project root:
   ```env
   VAULT_PATH=C:/Users/<you>/Documents/AI_Employee_Vault
   DRY_RUN=false
   LOG_LEVEL=info
   POLL_INTERVAL_MS=2000
   ```

3. **Initialize vault folders** (if not already created):
   ```bash
   npm run init-vault
   ```
   This creates: `/Inbox`, `/Needs_Action`, `/Plans`, `/Pending_Approval`, `/Approved`, `/Rejected`, `/Done`, `/Logs`, `/Briefings` and initializes `Dashboard.md` and `Company_Handbook.md`.

## Running

**Start the daemon**:
```bash
npm run start
```

**Start in dry-run mode** (logs actions but doesn't execute):
```bash
DRY_RUN=true npm run start
```

**Start in development mode** (auto-restart on code changes):
```bash
npm run dev
```

## Usage

### 1. Drop a task file

Create a markdown file in the vault's `/Inbox` folder:

```markdown
---
type: file_drop
source: local
priority: high
status: pending
created: 2026-02-15T10:00:00Z
---

Summarize the key action items from this meeting transcript:

[paste transcript here]
```

### 2. Watch it process

The daemon will:
1. Detect the file (within 5 seconds)
2. Validate frontmatter and move to `/Needs_Action`
3. Create a plan in `/Plans/PLAN_<slug>.md`
4. Execute safe steps automatically
5. Move completed task to `/Done`
6. Update `Dashboard.md`

### 3. Handle approvals

If a task requires a sensitive action, the daemon creates a file in `/Pending_Approval/`.

- **To approve**: Move the file to `/Approved/`
- **To reject**: Move the file to `/Rejected/`

The daemon detects the move and proceeds accordingly.

### 4. Check the dashboard

Open `Dashboard.md` in Obsidian to see:
- Current folder counts
- Recent activity log

## Verification Checklist

- [ ] Daemon starts without errors
- [ ] File dropped in `/Inbox` is moved to `/Needs_Action` within 5 seconds
- [ ] Plan file appears in `/Plans/`
- [ ] Safe task completes and moves to `/Done`
- [ ] `Dashboard.md` shows updated counts
- [ ] Log entry exists in `/Logs/YYYY-MM-DD.json`
- [ ] Sensitive task creates approval file in `/Pending_Approval/`
- [ ] Moving approval file to `/Approved/` triggers execution
- [ ] Moving approval file to `/Rejected/` skips and logs

## Stopping

Press `Ctrl+C` to gracefully stop the daemon. On restart, it will scan `/Plans/` for incomplete plans and resume execution.
