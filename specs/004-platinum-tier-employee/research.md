# Research: Platinum Tier — Split-Brain Production AI Employee

**Feature**: 004-platinum-tier-employee
**Date**: 2026-02-17
**Status**: Complete

## Decision 1: Cloud/Local Daemon Split Strategy

**Decision**: Create a single `PlatinumDaemon` class with a `mode` parameter (`cloud` | `local`) that controls which components are initialized. Both modes share the same codebase but activate different skills, watchers, and services based on the mode.

**Rationale**: The existing tiered architecture (Bronze → Silver → Gold) uses composition-by-copy — each tier creates its own daemon class. For Platinum, we need two runtime configurations from the same codebase rather than two separate codebases. A mode flag is the simplest approach: `AGENT_MODE=cloud` on the VPS, `AGENT_MODE=local` on the owner's machine.

**Alternatives Considered**:
- **Two separate daemon classes** (`CloudDaemon` + `LocalDaemon`): Rejected because 80% of code would be duplicated. Maintenance burden doubles.
- **Inherit GoldDaemon and override**: Rejected because GoldDaemon's constructor hardcodes all service initialization. Would require invasive refactoring.
- **Plugin architecture**: Over-engineered for a two-mode split. Adds abstraction without proportional benefit.

## Decision 2: Vault Sync Mechanism

**Decision**: Use Git (push/pull) as the primary sync mechanism via automated sync scripts that run on a timer. A `vault-sync.ts` script handles `git pull --rebase`, `git add`, `git commit`, `git push` on a configurable interval (default 60 seconds).

**Rationale**: Git is already a project dependency (the repo uses Git). It provides built-in conflict detection, history, and works over SSH/HTTPS without additional infrastructure. The vault contains only Markdown and JSON files — Git handles these efficiently. Syncthing would require installing and configuring a separate daemon on both machines.

**Alternatives Considered**:
- **Syncthing**: Good for real-time sync but adds operational complexity (separate daemon, port forwarding, device pairing). No built-in conflict resolution for the claim-by-move model.
- **rsync over SSH**: One-directional, doesn't handle bidirectional sync natively. Would need wrapper scripts that are essentially reimplementing Git.
- **Cloud storage (S3/GCS)**: Adds cloud vendor dependency and latency. Not file-system native.

**Implementation Notes**:
- `.gitignore` in vault root excludes `.env*`, `*.key`, `*.pem`, `credentials.*`, `token.*`
- Sync script uses `--no-edit` for merge commits to avoid interactive prompts
- Conflict resolution: claim-by-move ownership rules encoded in a `SYNC_OWNERS.json` manifest

## Decision 3: Work-Zone Enforcement Model

**Decision**: Implement zone enforcement at two levels: (1) `ZoneGuard` middleware in the executor that checks folder ownership before writes, and (2) `AgentMode`-based skill filtering in the daemon that prevents registering send/execute skills on cloud and prevents registering draft-only skills on local.

**Rationale**: Defense in depth. The skill registry filtering prevents cloud from even having `SendEmailSkill` available. The `ZoneGuard` provides a runtime safety net if any code path attempts to write to a folder it doesn't own.

**Alternatives Considered**:
- **OS-level file permissions**: Linux file permissions could block writes, but this breaks the Git sync model (Git needs write access to all folders for pull operations).
- **Skill filtering only**: Single layer — if a bug routes to the wrong skill, there's no second check.
- **Zone guard only**: Reactive rather than preventive — better to not register dangerous skills at all.

## Decision 4: MCP Server Deployment on Cloud

**Decision**: MCP servers continue to run as local stdio child processes on the cloud VPS. The cloud server runs Gmail MCP, LinkedIn MCP, and Odoo MCP as child processes of the Cloud Agent — identical to current Gold architecture.

**Rationale**: MCP servers are spawned by `MCPManager` using `StdioClientTransport`. This works identically on Linux VPS as it does locally. The cloud VPS has Node.js installed and can run `npx` to spawn MCP servers. No architectural change needed — the existing pattern works as-is on Linux.

**Alternatives Considered**:
- **Remote MCP over HTTP/SSE**: Would require rewriting all MCP server entry points to use HTTP transport. Adds network latency and auth complexity. Overkill when the MCP servers run on the same machine as the agent.
- **Shared remote MCP server**: Single MCP server serving both cloud and local. Introduces a shared dependency and network dependency for the local agent.

## Decision 5: Credential Isolation Model

**Decision**: Each agent mode has its own `.env` file. The cloud `.env.cloud` contains only non-sensitive credentials (Gmail read-only, LinkedIn read-only, Odoo). The local `.env.local` contains all credentials including sensitive ones (Gmail send, banking, WhatsApp, payment tokens). The `PlatinumConfig` loads the appropriate env file based on `AGENT_MODE`.

**Rationale**: Environment variable isolation is the simplest and most auditable approach. The cloud server physically cannot access banking credentials because they don't exist in its environment. No code-level enforcement needed — absence of credentials is the enforcement.

**Alternatives Considered**:
- **Encrypted secrets vault (HashiCorp Vault, AWS Secrets Manager)**: Adds infrastructure complexity. The threat model is "cloud server compromise" — if the cloud is compromised, it shouldn't have secrets to steal. Absence > encryption.
- **Single .env with role-based filtering**: Risk of accidentally loading sensitive vars on cloud. Physical separation is safer.

## Decision 6: Process Supervision on Cloud

**Decision**: Use `systemd` as the primary process supervisor on the cloud VPS, with PM2 as an alternative for non-systemd environments. Provide both a `systemd` unit file and a PM2 ecosystem config.

**Rationale**: systemd is the standard process manager on modern Linux (Ubuntu 22.04+, the assumed target). It provides automatic restart, logging via journald, boot-time startup, and resource limits. PM2 is a good alternative for environments where systemd isn't available or the user prefers Node.js-native process management.

**Alternatives Considered**:
- **Docker**: Adds container complexity. The app is a single Node.js process — Docker is overhead without proportional benefit for a single-process deployment.
- **Custom watchdog only (existing)**: The Gold watchdog already exists but is designed for OS scheduler invocation (cron/schtasks), not continuous supervision. systemd is purpose-built for this.

## Decision 7: Dashboard Single-Writer Enforcement

**Decision**: The `DashboardSkill` checks `AGENT_MODE` before writing. Only the `local` agent writes `Dashboard.md`. The cloud agent skips dashboard updates entirely (logs a debug message instead).

**Rationale**: The simplest enforcement — a single `if (mode !== 'local') return;` guard at the top of `DashboardSkill.execute()`. Since Dashboard.md aggregates vault folder counts and recent activity, it must be written by the agent that has the most complete view (the local agent, which also has access to all logs and approval state).

**Alternatives Considered**:
- **Both agents write to separate dashboard files**: Confusing for the user — which one is authoritative?
- **ZoneGuard blocks cloud writes to Dashboard.md**: Works but hides the issue. Better to skip the write explicitly with a clear log message.

## Decision 8: Sync Conflict Resolution

**Decision**: Implement claim-by-move ownership via a `SYNC_OWNERS.json` manifest file at the vault root. This file maps each vault folder to its owning agent mode. The sync script reads this manifest and, on conflict, the owning agent's version wins. Non-owner changes to owned folders are rejected (reverted on sync).

**Rationale**: The claim-by-move model from the spec requires a formalized ownership map. A JSON manifest is easy to audit, modify, and version control. The sync script can programmatically resolve conflicts without manual intervention.

**Manifest**:
```json
{
  "cloud": ["/Needs_Action", "/Plans", "/Updates", "/Logs"],
  "local": ["/Pending_Approval", "/Approved", "/Rejected", "/Done", "/Briefings"],
  "local_exclusive": ["Dashboard.md", "Company_Handbook.md", "Business_Goals.md"],
  "shared_read": ["/Inbox"]
}
```

**Notes**:
- `/Updates` folder will be created as a new vault folder for cloud-to-local status updates
- `/Inbox` is shared-read: either agent can read, but only InboxWatcher moves files out
- Conflict = same file modified on both sides since last sync. Resolution: owner's version wins, non-owner's changes are stashed in `/Sync_Conflicts/`
