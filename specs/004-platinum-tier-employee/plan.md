# Implementation Plan: Platinum Tier — Split-Brain Production AI Employee

**Branch**: `004-platinum-tier-employee` | **Date**: 2026-02-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-platinum-tier-employee/spec.md`

## Summary

Split the AI Employee into a Cloud Agent (24/7 on Linux VPS, draft-only) and a Local Agent (executive authority, credential holder) sharing state through Git-synced Obsidian vault. Builds on all Gold tier features. Key components: mode-driven daemon, vault sync via Git, zone guard for write enforcement, health monitoring, rate limiting, automated backups, and process supervision via systemd/PM2.

## Technical Context

**Language/Version**: TypeScript 5.x (consistent with Bronze/Silver/Gold)
**Primary Dependencies**: Existing stack (`@modelcontextprotocol/sdk`, `chokidar`, `gray-matter`, `zod`) + `simple-git` (for vault sync)
**Storage**: File-based (Markdown + JSON in Obsidian vault, synced via Git)
**Testing**: TypeScript compilation check (`tsc --noEmit`), manual integration testing
**Target Platform**: Cloud Agent: Linux VPS (Ubuntu 22.04+, systemd). Local Agent: Windows 11 / macOS / Linux.
**Project Type**: Single project, tiered structure (`platinum/src/`)
**Performance Goals**: Vault sync < 2 minutes, crash recovery < 60 seconds, health check interval 60 seconds
**Constraints**: Zero sensitive credentials on cloud, no direct network connection between agents, Markdown/JSON files only in sync
**Scale/Scope**: Single user (business owner), single cloud VPS, single local machine

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Core Identity | ✅ PASS | Cloud Agent operates as autonomous consultant (draft mode). Local Agent retains executive authority. Both produce executive-level reasoning. |
| II | Vault-First Workflow | ✅ PASS | Vault remains single source of truth. All state lives in vault. Sync mechanism (Git) transfers vault state between agents. No external state stores introduced. |
| III | Execution Loop | ✅ PASS | Both agents follow READ → THINK → PLAN → ACT → LOG → COMPLETE. Cloud agent stops at PLAN/draft (never executes sensitive ACT). Local agent completes full loop. |
| IV | HITL Law | ✅ PASS | Strengthened — Cloud agent is physically incapable of final execution (no credentials). All sensitive actions route through `/Pending_Approval` → local approval → local execution. |
| V | Persistence (Ralph Wiggum) | ✅ PASS | Both agents resume from plan checkpoints. Vault sync ensures state is shared. Process supervision ensures cloud agent survives crashes. |
| VI | Security First | ✅ PASS | Enhanced — credential isolation by physical absence (cloud has no sensitive creds). Secrets never synced. `.env` excluded from Git. Two-layer enforcement (skill filtering + zone guard). |
| VII | Autonomy Boundaries | ✅ PASS | Cloud agent: draft-only (allowed autonomous). Local agent: approval-gated execution (always requires approval for sends/payments). Zone enforcement adds a new layer. |
| VIII | Quality Standard | ✅ PASS | Audit logging continues across both agents. Hash-chained logs maintained independently per agent. Health monitoring adds observability. |

**Gate result**: PASS — all 8 principles satisfied. No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/004-platinum-tier-employee/
├── plan.md              # This file
├── research.md          # 8 research decisions
├── data-model.md        # 7 entities + state transitions
├── quickstart.md        # Deployment guide
├── contracts/
│   └── interfaces.ts    # TypeScript contracts
└── checklists/
    └── requirements.md  # Spec quality (16/16 pass)
```

### Source Code (repository root)

```text
platinum/
├── src/
│   ├── index.ts                    # PlatinumDaemon entry point (mode-driven)
│   ├── config/
│   │   └── platinum-config.ts      # PlatinumConfig extends GoldConfig
│   ├── sync/
│   │   ├── vault-sync.ts           # Git-based vault sync (pull/commit/push)
│   │   ├── sync-owners.ts          # Zone ownership manifest loader
│   │   └── conflict-resolver.ts    # Claim-by-move conflict resolution
│   ├── zone/
│   │   └── zone-guard.ts           # Write permission enforcement
│   ├── health/
│   │   ├── health-monitor.ts       # Periodic health checks + alerting
│   │   └── backup-manager.ts       # Automated vault backups
│   ├── rate-limit/
│   │   └── rate-limiter.ts         # Token bucket rate limiter
│   ├── deploy/
│   │   ├── setup-deployment.ts     # Generate systemd/PM2 configs
│   │   ├── ai-employee-cloud.service  # systemd unit template
│   │   └── ecosystem.config.js     # PM2 ecosystem template
│   └── demo/
│       └── demo-runner.ts          # End-to-end demo script
├── tests/
│   └── fixtures/
│       ├── demo-email-task.md      # Demo fixture
│       └── SYNC_OWNERS.json        # Test ownership manifest
└── SYNC_OWNERS.json                # Default vault ownership manifest
```

**Structure Decision**: New `platinum/` directory following the existing tiered pattern (`bronze/`, `silver/`, `gold/`). Each tier has its own `src/` and `tests/` directories. Platinum imports from all three lower tiers.

## Implementation Phases

### Phase 1 — Setup & Config (T001–T005)

Create `platinum/` directory structure, `PlatinumConfig` extending `GoldConfig`, `SYNC_OWNERS.json` manifest, new env vars, package.json scripts, tsconfig update.

**Depends on**: Gold tier complete (all 45 tasks)
**Deliverable**: Config loads, directory exists, scripts runnable

### Phase 2 — Vault Sync (T006–T012)

Implement `vault-sync.ts` (Git pull/commit/push cycle), `sync-owners.ts` (manifest loader), `conflict-resolver.ts` (claim-by-move logic), auto-sync loop, `.gitignore` for vault secrets.

**Depends on**: Phase 1
**Deliverable**: Bidirectional Git sync working with conflict resolution

### Phase 3 — Zone Guard & Work-Zone Enforcement (T013–T018)

Implement `ZoneGuard` middleware, integrate with executor, mode-based skill filtering in daemon, Dashboard single-writer guard, cloud draft-only enforcement.

**Depends on**: Phase 2 (needs ownership manifest)
**Deliverable**: Cloud agent cannot write to local-owned folders, cannot execute final sends

### Phase 4 — Health, Rate Limiting & Backups (T019–T026)

Implement `HealthMonitor` (service checks, disk, sync freshness), `RateLimiter` (token bucket), `BackupManager` (compressed archives), integrate into daemon lifecycle.

**Depends on**: Phase 1
**Deliverable**: Health monitoring active, rate limits enforced, backups running

### Phase 5 — PlatinumDaemon & Deployment (T027–T035)

Create `PlatinumDaemon` entry point (mode-driven), systemd unit file, PM2 config, deployment setup script, cloud `.env.cloud` template, PID management, graceful shutdown.

**Depends on**: Phases 2, 3, 4
**Deliverable**: Daemon starts in cloud or local mode, process supervision working

### Phase 6 — Demo & Validation (T036–T042)

Create demo runner script, demo fixtures, end-to-end validation (email → cloud draft → sync → local approve → local send → done), TypeScript compilation check.

**Depends on**: Phase 5
**Deliverable**: Full demo passing, zero TS errors

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Daemon split | Single class with `mode` param | Avoids 80% code duplication vs two classes |
| Vault sync | Git push/pull | Already a dependency, handles conflicts, auditable history |
| Zone enforcement | Skill filtering + ZoneGuard | Defense in depth — prevent at registration + block at runtime |
| MCP on cloud | Local stdio (same as Gold) | No arch change needed — stdio works on Linux identically |
| Credential isolation | Separate .env files | Physical absence > code enforcement |
| Process supervisor | systemd (primary) + PM2 (alt) | systemd is Linux standard; PM2 for flexibility |
| Dashboard writer | Mode check in DashboardSkill | Simplest enforcement — one guard clause |
| Conflict resolution | SYNC_OWNERS.json manifest | Auditable, versionable, programmatic |

## Complexity Tracking

> No violations detected. All 8 constitution principles pass without justification needed.

## Risks

1. **Git merge conflicts on binary-like files**: Mitigated by restricting sync to Markdown/JSON only. No binary files in vault.
2. **Clock skew between cloud and local**: Could cause confusing log timestamps. Mitigated by using NTP on both machines and logging in UTC.
3. **Sync delay during high activity**: If many files change rapidly, 60-second sync interval may cause stale reads. Mitigated by manual sync trigger option and configurable interval.
