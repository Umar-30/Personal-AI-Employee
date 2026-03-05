# Implementation Plan: Gold Tier Autonomous Business Employee

**Branch**: `003-gold-tier-employee` | **Date**: 2026-02-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-gold-tier-employee/spec.md`

## Summary

Upgrade the Silver tier system into a cross-domain autonomous business employee with: Odoo accounting integration via custom MCP server, multi-platform social media posting (Facebook/Instagram/Twitter), autonomous weekly CEO briefing, Ralph Wiggum persistence loop, production-grade watchdog/retry/graceful degradation, and immutable audit logging with hash chaining. Gold extends Silver (which extends Bronze) following the composition-by-copy daemon pattern.

## Technical Context

**Language/Version**: TypeScript 5.x (ES2022 target), Node.js 18+
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `gray-matter`, `chokidar`, `zod` (existing); new: `crypto` (Node built-in for SHA-256)
**Storage**: File-based (Markdown + JSON in Obsidian vault), Odoo via JSON-RPC
**Testing**: Manual verification via DRY_RUN mode and quickstart.md
**Target Platform**: Windows 11 (primary), Linux/Mac (secondary)
**Project Type**: Single project — tiered folder structure (bronze/silver/gold)
**Performance Goals**: Process tasks within vault scan cycle (5s default), watchdog restart within 30s
**Constraints**: All financial writes require HITL approval, vault-first (no external databases), Bronze/Silver code read-only
**Scale/Scope**: Single-user local-first system, 1 Odoo instance, 4 social platforms

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pre-Design | Post-Design | Notes |
|-----------|-----------|------------|-------|
| I. Core Identity | PASS | PASS | Gold adds accounting + social intelligence, remains reasoning engine |
| II. Vault-First | PASS | PASS | All state in vault; Odoo data flows through vault files |
| III. Execution Loop | PASS | PASS | 6-step loop preserved; new skills slot into ACT step |
| IV. HITL Law | PASS | PASS | FR-002/FR-006: financial writes + social posts require approval |
| V. Persistence (Ralph Wiggum) | PASS | PASS | US4 explicitly implements persistence loop with stall detection |
| VI. Security First | PASS | PASS | All credentials in env vars; DRY_RUN respected; audit trail |
| VII. Autonomy Boundaries | PASS | PASS | Read-only Odoo queries autonomous; writes gated by approval |
| VIII. Quality Standard | PASS | PASS | US6 audit logging ensures every action is logged and auditable |

## Project Structure

### Documentation (this feature)

```text
specs/003-gold-tier-employee/
├── plan.md              # This file
├── research.md          # Phase 0 output — 8 research decisions
├── data-model.md        # Phase 1 output — 7 entities
├── quickstart.md        # Phase 1 output — setup guide
├── contracts/
│   └── interfaces.ts    # Phase 1 output — TypeScript contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /sp.tasks)
```

### Source Code (repository root)

```text
gold/
├── src/
│   ├── index.ts                    # GoldDaemon entry point
│   ├── config/
│   │   └── gold-config.ts          # GoldConfig extends SilverConfig
│   ├── mcp-servers/
│   │   └── odoo-mcp/
│   │       ├── index.ts            # Odoo MCP server entry point
│   │       ├── odoo-client.ts      # JSON-RPC client for Odoo API
│   │       └── tools.ts            # MCP tool definitions (6 tools)
│   ├── social/
│   │   ├── social-media-manager.ts # ISocialMediaManager implementation
│   │   ├── facebook-client.ts      # Facebook Graph API wrapper
│   │   ├── instagram-client.ts     # Instagram Graph API wrapper
│   │   └── twitter-client.ts       # Twitter API v2 wrapper
│   ├── skills/
│   │   ├── odoo-invoice.skill.ts   # Invoice creation/posting skill
│   │   ├── odoo-report.skill.ts    # Financial reporting skill (read-only)
│   │   ├── social-post.skill.ts    # Multi-platform social posting
│   │   └── ceo-briefing.skill.ts   # Weekly CEO briefing (extends Silver daily)
│   ├── persistence/
│   │   └── persistence-loop.ts     # Ralph Wiggum persistence loop
│   ├── watchdog/
│   │   └── watchdog.ts             # Standalone watchdog process
│   ├── logging/
│   │   └── audit-logger.ts         # IAuditLogger with hash chaining
│   ├── models/
│   │   └── gold-frontmatter.ts     # Gold task types extension
│   ├── pipeline/
│   │   └── gold-executor.ts        # GoldExecutionContext + executor
│   └── scheduler/
│       ├── gold-job-definitions.ts  # Sunday CEO briefing job
│       └── setup-gold-scheduler.ts  # OS scheduler setup for Gold jobs
└── tests/
    └── fixtures/
        ├── odoo-invoice-task.md
        ├── social-post-task.md
        └── ceo-briefing-task.md
```

**Structure Decision**: Gold follows the established tiered pattern (`bronze/` → `silver/` → `gold/`). Each tier has its own `src/` and `tests/` directories. Gold imports from both Bronze and Silver via relative paths. The Odoo MCP server lives inside `gold/src/mcp-servers/` as a standalone subprocess entry point.

## Phase Implementation Overview

### Phase 1 — Setup & Foundation
- Create `gold/` directory structure
- Install new dependencies (if any)
- Update `tsconfig.json` to include `gold/src/**/*`
- Create `GoldConfig`, `gold-frontmatter.ts`, `GoldExecutionContext`

### Phase 2 — Odoo MCP Server (US1)
- Build custom Odoo MCP server with JSON-RPC client
- 6 tools: `create_invoice`, `post_invoice`, `list_invoices`, `get_invoice`, `create_journal_entry`, `list_journal_entries`
- Register Odoo MCP server config in Gold config

### Phase 3 — Odoo Skills (US1)
- `OdooInvoiceSkill` — create draft invoices, request approval, post on approval
- `OdooReportSkill` — read-only financial queries (no approval needed)
- Wire into skill registry

### Phase 4 — Social Media Engine (US2)
- `SocialMediaManager` with platform clients (Facebook, Instagram, Twitter)
- `SocialPostSkill` — generate platform-specific content, per-platform approval
- Wire into execution context and skill registry

### Phase 5 — Weekly CEO Briefing (US3)
- `CEOBriefingSkill` — extends Silver daily briefing with Odoo + bank data
- Sunday scheduled job definition
- Graceful degradation when data sources unavailable

### Phase 6 — Ralph Wiggum Persistence Loop (US4)
- `PersistenceLoop` class wrapping task execution
- Plan checkpoint tracking, stall detection, completion signals
- Integrate into Gold executor

### Phase 7 — Reliability Layer (US5)
- Watchdog process (standalone script with PID monitoring)
- Enhanced retry logic in Gold executor
- Graceful degradation for all external services
- PID file management in GoldDaemon

### Phase 8 — Audit Logging (US6)
- `AuditLogger` with SHA-256 hash chaining
- Financial metadata extension for Odoo actions
- Daily file rotation, tamper detection
- Integrate into all Gold actions

### Phase 9 — Integration & Polish
- GoldDaemon entry point wiring everything together
- Scheduler setup for watchdog + CEO briefing
- Bronze/Silver regression verification
- TypeScript compilation check
- DRY_RUN end-to-end validation

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Odoo integration | Custom MCP server via JSON-RPC | No existing Odoo MCP; JSON-RPC is Odoo's standard API |
| Social media | Direct REST API wrappers, not MCP | No reliable MCP servers exist; 3 subprocesses wasteful |
| Daemon pattern | Composition-by-copy (same as Silver) | Avoids touching Bronze/Silver code |
| Audit immutability | SHA-256 hash chaining | Tamper-evident without OS-level controls |
| Persistence loop | Wrapper around existing executor | Non-invasive; existing executor handles single steps fine |
| Watchdog | Standalone script + OS scheduler | Must be independent of daemon process |
| CEO briefing | Extend Silver daily briefing pattern | Reuses proven skill pattern, adds data sources |

## Complexity Tracking

No constitution violations — no complexity justifications needed.
