# Data Model: Platinum Tier — Split-Brain Production AI Employee

**Feature**: 004-platinum-tier-employee
**Date**: 2026-02-17

## Entities

### 1. Agent Mode

Represents the operational mode of a running daemon instance.

- **mode**: `cloud` | `local` — determines which skills, watchers, and write permissions are active
- **relationships**: Determines which PlatinumConfig section is loaded, which skills are registered, which folders are writable

### 2. Platinum Config

Extends GoldConfig with split-brain deployment settings.

- **agentMode**: The active agent mode (`cloud` or `local`)
- **sync**: Vault sync configuration (interval, remote URL, branch, auto-commit)
- **zoneOwnership**: Map of vault folders to owning agent mode
- **cloudRestrictions**: List of skill names and folder paths blocked on cloud
- **localExclusives**: List of resources only available to local agent (credentials, Dashboard)
- **deployment**: Process supervision settings (systemd unit name, PM2 app name, restart policy)
- **healthCheck**: Health monitoring configuration (check interval, alert thresholds, backup schedule)
- **relationships**: Inherits from GoldConfig, consumed by PlatinumDaemon

### 3. Zone Ownership Manifest (SYNC_OWNERS.json)

Defines which agent mode owns which vault folders for conflict resolution.

- **cloud**: Folders the cloud agent owns (writes freely, wins conflicts)
- **local**: Folders the local agent owns
- **local_exclusive**: Root-level files owned exclusively by local agent
- **shared_read**: Folders both agents can read but neither exclusively owns
- **validation**: No folder can appear in more than one ownership category
- **relationships**: Read by vault-sync script, read by ZoneGuard middleware

### 4. Vault Sync State

Tracks the state of the last sync cycle between cloud and local.

- **lastSyncTimestamp**: ISO timestamp of last successful sync
- **lastSyncDirection**: `push` | `pull` | `both`
- **pendingChanges**: Count of uncommitted local changes
- **conflictsDetected**: Count of conflicts in last sync
- **conflictsResolved**: Count of auto-resolved conflicts
- **syncHealthy**: Boolean — whether last sync completed without errors
- **relationships**: Written by vault-sync script, read by health monitor

### 5. Health Status

Tracks the health of all system components for monitoring and alerting.

- **services**: Map of service name → { available: boolean, lastCheck: timestamp, consecutiveFailures: number }
- **syncFreshness**: Time since last successful vault sync
- **diskUsage**: Percentage of disk used on cloud VPS
- **uptimeSeconds**: Time since daemon started
- **lastBackupTimestamp**: When the last vault backup completed
- **relationships**: Updated by health monitor, written to `/Logs/health-status.json`, used by alerting

### 6. Deployment Manifest

Describes the cloud deployment configuration for setup and recovery.

- **platform**: Target platform identifier (e.g., `oracle-vm`, `aws-ec2`, `generic-linux`)
- **supervisor**: Process supervision type (`systemd` | `pm2`)
- **nodeVersion**: Required Node.js version
- **envFile**: Path to the cloud environment file
- **vaultRepo**: Git remote URL for vault sync
- **sshKeyPath**: Path to SSH key for Git operations
- **backupPath**: Path for automated vault backups
- **relationships**: Read by deployment scripts, referenced by process supervisor config

### 7. Sync Conflict Record

Records a conflict that occurred during vault sync for audit purposes.

- **timestamp**: When the conflict was detected
- **filePath**: The vault-relative path of the conflicted file
- **cloudVersion**: Hash of the cloud agent's version
- **localVersion**: Hash of the local agent's version
- **resolution**: `cloud_wins` | `local_wins` (based on ownership manifest)
- **stashedPath**: Path where the losing version was saved (in `/Sync_Conflicts/`)
- **relationships**: Created by vault-sync script, logged to audit logger

## State Transitions

### Agent Lifecycle (Cloud)
```
STARTING → CONNECTING_MCP → SYNCING → RUNNING → DEGRADED → SHUTTING_DOWN → STOPPED
                                         ↑         ↓
                                         └─────────┘ (service recovery)
```

### Vault Sync Cycle
```
IDLE → PULLING → RESOLVING_CONFLICTS → COMMITTING → PUSHING → IDLE
                      ↓                                 ↓
                 CONFLICT_STASHED                  PUSH_FAILED → RETRY
```

### Task Flow (Split-Brain)
```
[Cloud] Email arrives → Task created in /Needs_Action → Plan generated in /Plans
→ Draft created → Moved to /Pending_Approval
--- SYNC ---
[Local] Sees /Pending_Approval file → Owner reviews → Moves to /Approved
--- SYNC ---
[Cloud or Local] Detects /Approved → Local Agent executes final action
→ Logs written → Task moved to /Done
--- SYNC ---
[Both] /Done file visible to both agents
```
