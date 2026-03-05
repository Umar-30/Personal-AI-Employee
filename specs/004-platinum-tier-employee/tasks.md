# Tasks: Platinum Tier — Split-Brain Production AI Employee

**Input**: Design documents from `/specs/004-platinum-tier-employee/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/interfaces.ts

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. US1-US4 are P1 (core architecture), US5-US6 are P2 (demo + hardening).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create platinum directory structure, config, and shared assets

- [x] T001 Create platinum/ directory structure with subdirectories: src/config, src/sync, src/zone, src/health, src/rate-limit, src/deploy, src/demo, tests/fixtures
- [x] T002 Add `simple-git` dependency to package.json (`npm install simple-git`)
- [x] T003 [P] Update tsconfig.json to include `platinum/src/**/*` in the include array
- [x] T004 [P] Add Platinum scripts to package.json: start:platinum, dev:platinum, vault:sync, health:check, backup:create, deploy:setup
- [x] T005 [P] Add Platinum env vars to .env.example: AGENT_MODE, VAULT_SYNC_*, HEALTH_*, BACKUP_*, RATE_LIMIT_*, DEPLOYMENT_*

**Checkpoint**: Directory exists, dependencies installed, scripts registered

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: PlatinumConfig and SYNC_OWNERS.json — required by ALL user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Create PlatinumConfig extending GoldConfig with agentMode, sync, zoneOwnership, deployment, healthCheck, rateLimit sections in platinum/src/config/platinum-config.ts (implement `loadPlatinumConfig()` reading all new env vars, with defaults for each field)
- [x] T007 [P] Create default SYNC_OWNERS.json at platinum/SYNC_OWNERS.json with cloud ownership of ["/Needs_Action", "/Plans", "/Updates", "/Logs"], local ownership of ["/Pending_Approval", "/Approved", "/Rejected", "/Done", "/Briefings"], local_exclusive ["Dashboard.md", "Company_Handbook.md", "Business_Goals.md"], shared_read ["/Inbox"]
- [x] T008 [P] Create sync-owners.ts at platinum/src/sync/sync-owners.ts — load and validate SYNC_OWNERS.json, export `loadZoneOwnership(vaultRoot)` function that reads the manifest and returns a typed `ZoneOwnership` object
- [x] T009 [P] Create test fixture SYNC_OWNERS.json at platinum/tests/fixtures/SYNC_OWNERS.json (copy of default manifest for testing)

**Checkpoint**: Config loads with all Platinum fields, zone ownership manifest loadable

---

## Phase 3: User Story 3 — Vault Sync (Priority: P1) 🎯

**Goal**: Bidirectional Git-based vault sync between cloud and local agents with conflict resolution

**Independent Test**: Create a file in vault, run sync, verify it appears in the remote and vice versa

**Why US3 first**: Vault sync is the communication backbone — US1 (Cloud Agent) and US2 (Work-Zone) both depend on sync being operational

### Implementation for User Story 3

- [x] T010 [US3] Implement VaultSync class in platinum/src/sync/vault-sync.ts — constructor takes SyncConfig + ZoneOwnership + Logger. Methods: `sync()` (git pull --rebase → detect conflicts → commit local changes → push), `startAutoSync()` (setInterval), `stopAutoSync()`, `getLastSyncTimestamp()`, `isSyncHealthy()`. Use `simple-git` library for all Git operations. Handle errors gracefully (network failures, auth issues).
- [x] T011 [US3] Implement ConflictResolver class in platinum/src/sync/conflict-resolver.ts — constructor takes ZoneOwnership + AgentMode + Logger. Method `resolve(conflictFiles: string[])`: for each conflicted file, determine owner from manifest, keep owner's version, stash loser's version in `/Sync_Conflicts/YYYY-MM-DD/`, return SyncConflictRecord[]. Log each resolution.
- [x] T012 [US3] Create vault .gitignore template at platinum/src/sync/vault-gitignore.template with exclusions: .env*, credentials.*, token.*, *.key, *.pem, *.p12, .DS_Store, Thumbs.db, *.sqlite, *.db. Export a function `ensureVaultGitignore(vaultRoot)` that writes the .gitignore if it doesn't exist.
- [x] T013 [US3] Add `/Updates` folder to vault init — update bronze/src/config/init-vault.ts to create `/Updates` and `/Sync_Conflicts` directories alongside existing vault folders
- [x] T014 [US3] Integrate VaultSync into PlatinumConfig — ensure `loadPlatinumConfig()` provides all SyncConfig fields from env vars (VAULT_SYNC_ENABLED, VAULT_SYNC_INTERVAL_MS, VAULT_SYNC_REMOTE_URL, VAULT_SYNC_BRANCH, VAULT_SYNC_SSH_KEY)

**Checkpoint**: `vault-sync.ts` can pull, commit, push, and resolve conflicts using ownership rules

---

## Phase 4: User Story 2 — Work-Zone Separation (Priority: P1)

**Goal**: Enforce strict cloud/local write boundaries with defense-in-depth (ZoneGuard + skill filtering)

**Independent Test**: Instantiate ZoneGuard in cloud mode, attempt to write to `/Approved` → should throw ZoneViolationError

### Implementation for User Story 2

- [x] T015 [US2] Implement ZoneGuard class in platinum/src/zone/zone-guard.ts — constructor takes AgentMode + ZoneOwnership + vaultRoot + Logger. Methods: `canWrite(vaultRelativePath)` checks ownership manifest and returns boolean, `assertWrite(vaultRelativePath)` throws ZoneViolationError if not allowed, `getOwner(vaultRelativePath)` returns AgentMode | 'shared'. Handle both folder paths ("/Approved/file.md") and root files ("Dashboard.md").
- [x] T016 [US2] Create PlatinumExecutor in platinum/src/pipeline/platinum-executor.ts — wraps Gold executor with ZoneGuard check before every file write. Define `PlatinumExecutionContext` extending GoldExecutionContext with `agentMode`, `zoneGuard`, `rateLimiter`, `healthMonitor`. Function `executePlatinumTaskPlan()` delegates to `executeGoldTaskPlan()` but first validates zone permissions.
- [x] T017 [US2] Create skill filtering utility in platinum/src/zone/skill-filter.ts — export `getSkillsForMode(mode: AgentMode)`: cloud mode excludes SendEmailSkill, LinkedInPostSkill, OdooInvoiceSkill (post action), SocialPostSkill (publish action). Local mode includes all skills. Return a list of skill class names to register.
- [x] T018 [US2] Add Dashboard single-writer guard — create a wrapper function `guardedDashboardUpdate(mode: AgentMode, dashboardSkill, task, context)` in platinum/src/zone/skill-filter.ts that skips DashboardSkill.execute() when mode is 'cloud' and logs a debug message instead.
- [x] T019 [P] [US2] Create .env.cloud template at platinum/deploy/.env.cloud.example — contains AGENT_MODE=cloud, all non-sensitive env vars (VAULT_PATH, Gmail read-only, LinkedIn read-only, Odoo, sync settings), with comments marking which vars are intentionally absent (banking, WhatsApp, payment tokens)
- [x] T020 [P] [US2] Create .env.local template at platinum/deploy/.env.local.example — contains AGENT_MODE=local, all env vars including sensitive ones (Gmail send, banking, WhatsApp, payment tokens), with comments explaining local-exclusive credentials

**Checkpoint**: ZoneGuard blocks unauthorized writes, cloud cannot register send skills, Dashboard guarded

---

## Phase 5: User Story 1 — Cloud Agent Deployment (Priority: P1)

**Goal**: PlatinumDaemon that runs in cloud mode on a Linux VPS with process supervision

**Independent Test**: Start daemon with AGENT_MODE=cloud, verify only draft/read skills registered, watchers active, MCP servers connected

**Depends on**: US3 (sync), US2 (zone guard)

### Implementation for User Story 1

- [x] T021 [US1] Create PlatinumDaemon class in platinum/src/index.ts — constructor reads PlatinumConfig, branches on `agentMode`: cloud mode registers only safe/draft skills (SummarizeSkill, DraftEmailSkill, DashboardSkill, GenericReasoningSkill, OdooReportSkill, CEOBriefingSkill, DailyBriefingSkill) and starts all watchers + VaultSync. Local mode registers ALL skills (including SendEmailSkill, LinkedInPostSkill, OdooInvoiceSkill, SocialPostSkill) and starts VaultSync + ApprovalWatcher. Both modes: write PID file, connect MCP servers (graceful degradation), build PlatinumExecutionContext, start periodic scan, graceful shutdown on SIGINT/SIGTERM.
- [x] T022 [US1] Wire VaultSync into PlatinumDaemon — on daemon start: call `vaultSync.startAutoSync()`. On shutdown: call `vaultSync.stopAutoSync()`. After each sync cycle: trigger `scanAndProcess()` to pick up newly synced files. Log sync results.
- [x] T023 [US1] Create systemd unit file at platinum/src/deploy/ai-employee-cloud.service — [Unit] Description, After=network.target; [Service] Type=simple, ExecStart=npx ts-node platinum/src/index.ts, WorkingDirectory, EnvironmentFile=.env.cloud, Restart=on-failure, RestartSec=10, User; [Install] WantedBy=multi-user.target
- [x] T024 [P] [US1] Create PM2 ecosystem config at platinum/src/deploy/ecosystem.config.js — module.exports with name, script, cwd, env_file, instances:1, autorestart:true, max_restarts, restart_delay, watch:false
- [x] T025 [US1] Create deployment setup script at platinum/src/deploy/setup-deployment.ts — reads PlatinumConfig.deployment, generates either systemd unit file or PM2 config based on `supervisor` setting, writes to appropriate location, prints setup instructions (systemctl enable/start or pm2 start/save/startup)
- [x] T026 [US1] Wire PID management — PlatinumDaemon writes PID file on start (using watchdog.pidFilePath from GoldConfig), removes on shutdown/exit, registers process.on('exit') cleanup handler

**Checkpoint**: PlatinumDaemon starts in cloud mode with watchers, sync, zone guard, process supervision config generated

---

## Phase 6: User Story 4 — Security Model (Priority: P1)

**Goal**: Verify and enforce zero sensitive credentials on cloud, secrets excluded from sync

**Independent Test**: Load PlatinumConfig in cloud mode, verify sensitive env vars are undefined, run sync and verify .gitignore excludes secrets

**Depends on**: US2 (zone guard), US3 (sync)

### Implementation for User Story 4

- [x] T027 [US4] Create credential audit utility at platinum/src/zone/credential-audit.ts — export `auditCloudCredentials(config: PlatinumConfig)`: checks that sensitive env vars (banking, WhatsApp, payment tokens) are NOT present when agentMode is 'cloud'. Returns `{ clean: boolean, violations: string[] }`. Called at daemon startup — logs a CRITICAL warning if violations found but does not crash (allows operator to fix).
- [x] T028 [US4] Integrate credential audit into PlatinumDaemon startup — call `auditCloudCredentials()` in cloud mode during `start()`. Log results via audit logger. If violations found: create an alert file in `/Logs` with severity 'critical'.
- [x] T029 [US4] Ensure vault sync .gitignore blocks secrets — call `ensureVaultGitignore()` during VaultSync initialization. Verify .gitignore includes all secret file patterns. Log a warning if .gitignore is missing or incomplete.
- [x] T030 [P] [US4] Add audit log entry for mode-specific startup — when PlatinumDaemon starts, log an audit entry with: agentMode, registered skills, connected MCP servers, credential audit result, sync config (enabled/disabled, remote URL).

**Checkpoint**: Cloud agent refuses to start with sensitive credentials, sync provably excludes secrets

---

## Phase 7: User Story 6 — Production Hardening (Priority: P2)

**Goal**: Health monitoring, rate limiting, automated backups, crash recovery

**Independent Test**: Start health monitor, simulate service failure, verify alert created; run backup, verify archive created

### Implementation for User Story 6

- [x] T031 [US6] Implement HealthMonitor class in platinum/src/health/health-monitor.ts — constructor takes HealthCheckConfig + AgentMode + Logger + AuditLogger. Methods: `start()` (setInterval for periodic checks), `stop()`, `getStatus()` returns HealthStatus snapshot, `registerService(name, checker)` adds a service check function, `isServiceHealthy(name)`. Checks: MCP server connectivity (process.kill(pid,0)), sync freshness (time since last sync), disk usage (check with fs.statfs or similar). On failure: create alert file in `/Logs`, log via audit logger.
- [x] T032 [US6] Implement RateLimiter class in platinum/src/rate-limit/rate-limiter.ts — token bucket algorithm. Constructor takes RateLimitConfig. Methods: `canProceed(serviceKey)` returns boolean, `recordRequest(serviceKey)` decrements tokens, `getWaitTime(serviceKey)` returns ms until next token available. Per-service tracking (separate buckets for gmail, linkedin, odoo, facebook, instagram, twitter). Tokens refill over time based on maxRequestsPerMinute.
- [x] T033 [US6] Implement BackupManager class in platinum/src/health/backup-manager.ts — constructor takes HealthCheckConfig + vaultRoot + Logger. Methods: `createBackup()` creates a tar.gz of the vault (excluding .git, node_modules, .env*), stores at backupPath with timestamp filename, returns BackupResult. `startScheduledBackups()` (setInterval), `stopScheduledBackups()`, `getLastBackupTimestamp()`, `listBackups()`. Rotate old backups (keep last 7).
- [x] T034 [US6] Integrate HealthMonitor into PlatinumDaemon — register service checkers for each connected MCP server, register sync health checker (calls vaultSync.isSyncHealthy()), register disk checker. Start monitor during daemon start, stop during shutdown. Expose via `getHealth()` method.
- [x] T035 [US6] Integrate RateLimiter into PlatinumExecutor — before each MCP tool call in `executePlatinumTaskPlan()`, check `rateLimiter.canProceed(serverName)`. If rate limited: wait `rateLimiter.getWaitTime()` ms before retrying. Record successful calls with `recordRequest()`. Log rate limit events.
- [x] T036 [US6] Integrate BackupManager into PlatinumDaemon — start scheduled backups during daemon start (cloud mode only), stop during shutdown. Log backup results via audit logger.
- [x] T037 [P] [US6] Ensure Odoo HTTPS — in PlatinumConfig loader, validate that ODOO_URL starts with `https://` when agentMode is 'cloud'. Log a warning if HTTP is used. Do not block (operator may be testing locally).

**Checkpoint**: Health monitor detects failures, rate limiter throttles requests, backups run on schedule

---

## Phase 8: User Story 5 — End-to-End Demo (Priority: P2)

**Goal**: Validate the complete split-brain workflow with a scripted demo

**Independent Test**: Run demo script, verify email draft created by cloud, synced, approved locally, sent, logged, and archived

**Depends on**: US1-US4, US6

### Implementation for User Story 5

- [x] T038 [US5] Create demo email task fixture at platinum/tests/fixtures/demo-email-task.md — frontmatter: type email, source gmail-watcher, priority medium, status pending. Body: "Reply to the following email from demo@example.com: 'Hi, I'd like to schedule a meeting next week to discuss our partnership.'" (simple draft-reply scenario)
- [x] T039 [US5] Create demo runner script at platinum/src/demo/demo-runner.ts — automated E2E test sequence: (1) Copy demo fixture to vault /Inbox, (2) Wait for cloud agent to process (poll /Pending_Approval for new file, timeout 120s), (3) Simulate approval by moving file from /Pending_Approval to /Approved, (4) Wait for local agent to detect approval and execute send (poll /Done, timeout 120s), (5) Verify audit trail: check /Logs for send entry, check /Done for task file, check Dashboard.md for update. Print PASS/FAIL for each step. Exit 0 on all pass, 1 on any fail.
- [x] T040 [US5] Add demo script to package.json — `"demo:platinum": "ts-node platinum/src/demo/demo-runner.ts"`

**Checkpoint**: Demo runner validates full E2E flow

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, TypeScript compilation, cleanup

- [x] T041 Wire vault sync trigger script — create platinum/src/sync/manual-sync.ts as a standalone CLI (`npm run vault:sync`) that loads config and runs a single sync cycle, prints result, exits
- [x] T042 Wire health check script — create platinum/src/health/manual-health-check.ts as a standalone CLI (`npm run health:check`) that loads config, runs all health checks, prints status, exits with 0 (healthy) or 1 (unhealthy)
- [x] T043 [P] Update .env.example with all new Platinum tier env vars (consolidate from T005 + T014 + T037)
- [x] T044 TypeScript compilation check — run `npx tsc --noEmit` and fix all errors across bronze, silver, gold, and platinum tiers. Zero errors required.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US3 Vault Sync (Phase 3)**: Depends on Phase 2 — BLOCKS US1, US2, US4
- **US2 Work-Zone (Phase 4)**: Depends on Phase 2 — can parallel with US3
- **US1 Cloud Agent (Phase 5)**: Depends on US3 + US2
- **US4 Security (Phase 6)**: Depends on US2 + US3
- **US6 Hardening (Phase 7)**: Depends on Phase 2 — can start after foundational
- **US5 Demo (Phase 8)**: Depends on US1 + US2 + US3 + US4 + US6
- **Polish (Phase 9)**: Depends on all previous phases

### User Story Dependencies

- **US3 (Vault Sync)**: After Foundational — no other story deps (this is the backbone)
- **US2 (Work-Zone)**: After Foundational — can parallel with US3
- **US1 (Cloud Agent)**: After US3 + US2 (needs sync + zone guard)
- **US4 (Security)**: After US2 + US3 (needs zone guard + sync gitignore)
- **US6 (Hardening)**: After Foundational — can parallel with US3/US2 (health/rate-limit are independent)
- **US5 (Demo)**: After ALL others (integration test)

### Within Each User Story

- Config/manifest before implementation
- Core classes before integration
- Standalone utilities before daemon wiring

### Parallel Opportunities

- T003, T004, T005 can run in parallel (Setup phase)
- T007, T008, T009 can run in parallel (Foundational phase)
- T019, T020 can run in parallel (env templates)
- T024 can parallel with T023 (systemd + PM2)
- US2 and US3 can run in parallel after Foundational
- US6 (Hardening) can start as soon as Foundational is done (independent of sync/zone)

---

## Parallel Example: After Foundational

```text
# These can start simultaneously after Phase 2:
Stream A (US3 - Vault Sync):  T010 → T011 → T012 → T013 → T014
Stream B (US2 - Work-Zone):   T015 → T016 → T017 → T018, T019 ∥ T020
Stream C (US6 - Hardening):   T031 → T032 → T033 → T034 → T035 → T036, T037

# After US3 + US2 complete:
Stream D (US1 - Cloud Agent): T021 → T022 → T023, T024 → T025 → T026
Stream E (US4 - Security):    T027 → T028 → T029, T030

# After ALL complete:
Stream F (US5 - Demo):        T038 → T039 → T040
Stream G (Polish):            T041 ∥ T042 ∥ T043 → T044
```

---

## Implementation Strategy

### MVP First (US3 + US2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US3 Vault Sync
4. Complete Phase 4: US2 Work-Zone
5. **STOP and VALIDATE**: Verify sync works bidirectionally, zone guard blocks unauthorized writes
6. This gives you a working sync backbone + security enforcement — the minimum viable split-brain

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. US3 Vault Sync → Test sync independently → Communication backbone
3. US2 Work-Zone → Test zone guard → Security enforcement
4. US1 Cloud Agent → Test daemon in cloud mode → 24/7 capability
5. US4 Security → Audit credentials → Security verified
6. US6 Hardening → Test health/backups → Production resilience
7. US5 Demo → Run E2E → Full validation

---

## Notes

- Total tasks: 44
- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- US3 (Vault Sync) is implemented before US1 (Cloud Agent) because the daemon depends on sync
- US2 (Work-Zone) can parallel with US3 since ZoneGuard only needs the ownership manifest (Phase 2)
- US6 (Hardening) components are independent of sync/zone — only need PlatinumConfig
- TypeScript compilation is the final gate (T044) — zero errors across all 4 tiers
