---
id: 018
title: Platinum Tier Plan Creation
stage: plan
date: 2026-02-17
surface: agent
model: claude-opus-4-6
feature: 004-platinum-tier-employee
branch: 004-platinum-tier-employee
user: M Umar
command: /sp.plan
labels: ["platinum-tier", "plan", "split-brain", "cloud-agent", "local-agent", "vault-sync", "zone-guard", "deployment"]
links:
  spec: specs/004-platinum-tier-employee/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/004-platinum-tier-employee/plan.md
  - specs/004-platinum-tier-employee/research.md
  - specs/004-platinum-tier-employee/data-model.md
  - specs/004-platinum-tier-employee/contracts/interfaces.ts
  - specs/004-platinum-tier-employee/quickstart.md
tests:
  - Constitution check — 8/8 principles PASS
---

## Prompt

/sp.plan

# SP.Plan — Platinum Tier

## Phase 1 — Cloud Deployment
- [ ] Provision Linux VM
- [ ] Install runtime (Claude CLI, MCP, Odoo)
- [ ] Deploy watchers
- [ ] Implement supervisor (systemd/pm2)
- [ ] Enable health monitoring

Deliverable:
Cloud agent running continuously.

---

## Phase 2 — Vault Sync Architecture
- [ ] Configure Git or Syncthing
- [ ] Implement claim-by-move rule
- [ ] Restrict sync to markdown/state
- [ ] Exclude `.env` and secrets
- [ ] Test bidirectional sync

Deliverable:
Secure, conflict-free vault sync.

---

## Phase 3 — Work-Zone Enforcement
- [ ] Restrict cloud to draft-only actions
- [ ] Block financial execution on cloud
- [ ] Enforce approval gating locally
- [ ] Ensure single-writer Dashboard rule

Deliverable:
Clear authority separation.

---

## Phase 4 — Platinum Demo Implementation
- [ ] Simulate email arrival
- [ ] Cloud drafts + moves to `/Pending_Approval`
- [ ] Local approval workflow
- [ ] Local executes final send
- [ ] Log entire flow
- [ ] Move task to `/Done`

Deliverable:
Validated end-to-end scenario.

---

## Phase 5 — Production Hardening
- [ ] HTTPS for Odoo
- [ ] Automated backups
- [ ] Crash recovery
- [ ] Rate limiting
- [ ] Credential rotation schedule
- [ ] Monitoring alerts

Deliverable:
Production-grade resilience.

---

## Final Validation
- [ ] 24/7 cloud worker operational
- [ ] Local executive authority enforced
- [ ] Secure sync confirmed
- [ ] Demo scenario passes
- [ ] System survives restart without data loss

## Response snapshot

Created 5 planning artifacts for Platinum Tier:

**plan.md** — 6-phase implementation plan:
- Phase 1: Setup & Config (T001–T005)
- Phase 2: Vault Sync (T006–T012) — Git push/pull, claim-by-move conflicts
- Phase 3: Zone Guard & Work-Zone Enforcement (T013–T018) — skill filtering + ZoneGuard
- Phase 4: Health, Rate Limiting & Backups (T019–T026) — monitoring, token bucket, archives
- Phase 5: PlatinumDaemon & Deployment (T027–T035) — mode-driven daemon, systemd/PM2
- Phase 6: Demo & Validation (T036–T042) — E2E demo, TS compilation

**research.md** — 8 key decisions:
1. Single daemon with mode parameter (not two classes)
2. Git push/pull for vault sync (not Syncthing)
3. Two-layer zone enforcement (skill filtering + ZoneGuard)
4. MCP servers as local stdio on cloud (no arch change)
5. Separate .env files for credential isolation
6. systemd primary + PM2 alternative for supervision
7. Mode check in DashboardSkill for single-writer
8. SYNC_OWNERS.json manifest for conflict resolution

**data-model.md** — 7 entities:
AgentMode, PlatinumConfig, ZoneOwnership Manifest, VaultSyncState, HealthStatus, DeploymentManifest, SyncConflictRecord

**contracts/interfaces.ts** — Full TypeScript contracts:
PlatinumConfig, IZoneGuard, IVaultSync, IHealthMonitor, IRateLimiter, IBackupManager, PlatinumExecutionContext, IPlatinumDaemon, SystemdUnitConfig, PM2EcosystemConfig

**quickstart.md** — Deployment guide with vault setup, cloud/local config, startup commands, env var reference

**Constitution Check**: 8/8 principles PASS (HITL Law strengthened by physical credential absence)

## Outcome

- ✅ Impact: Platinum tier fully planned with split-brain architecture, vault sync, zone enforcement, health monitoring, and deployment strategy
- 🧪 Tests: Constitution check PASS (8/8 principles)
- 📁 Files: 5 artifacts created (plan.md, research.md, data-model.md, contracts/interfaces.ts, quickstart.md)
- 🔁 Next prompts: /sp.tasks to generate task breakdown, then /sp.implement
- 🧠 Reflection: Codebase research revealed important gaps — ApprovalWatcher has no registered callbacks, PersistenceLoop is defined but not wired up, serviceHealth is tracked but never consumed, and no /Updates folder exists. These are pre-existing Gold tier gaps that Platinum planning accounts for. The key architectural decision (single daemon with mode flag) avoids the composition-by-copy pattern that created duplication across Bronze/Silver/Gold.

## Evaluation notes (flywheel)

- Failure modes observed: None — all scripts ran successfully, all artifacts generated without errors.
- Graders run and results (PASS/FAIL): Constitution check PASS (8/8)
- Prompt variant (if applicable): Standard /sp.plan workflow with codebase research via Explore agent
- Next experiment (smallest change to try): Wire up the ApprovalWatcher callbacks in the daemon before Platinum implementation — this is a Gold-tier gap that Platinum depends on.
