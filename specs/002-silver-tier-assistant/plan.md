# Implementation Plan: Silver Tier Multi-Tool Assistant

**Branch**: `002-silver-tier-assistant` | **Date**: 2026-02-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-silver-tier-assistant/spec.md`

## Summary

Upgrade the Bronze single-watcher, local-only AI Employee into a Silver multi-domain assistant. Silver adds Gmail and LinkedIn watchers, MCP server integration (Gmail primary, LinkedIn secondary), OS-native scheduling (daily briefing + LinkedIn posting), and extends the existing HITL workflow to cover all new external actions. Silver code lives in `silver/src/` and imports/extends Bronze modules from `bronze/src/`.

## Technical Context

**Language/Version**: TypeScript 5.9+ (same as Bronze)
**Primary Dependencies**: `@modelcontextprotocol/sdk` + `zod` (MCP client), `@gongrzhe/server-gmail-mcp` (Gmail MCP), `linkedin-mcp-server` (LinkedIn MCP), existing Bronze deps (chokidar, gray-matter, execa, glob)
**Storage**: File-based (Markdown + JSON in Obsidian vault) — inherited from Bronze
**Testing**: Jest (unit + integration), manual E2E with DRY_RUN mode
**Target Platform**: Windows 11 (primary), Mac/Linux (secondary via cron)
**Project Type**: Single project with tiered folder structure (`bronze/`, `silver/`)
**Performance Goals**: Watcher polling ≤60s latency, MCP calls ≤10s per action
**Constraints**: Single instance, file-based state, no database, HITL mandatory for all external actions
**Scale/Scope**: Single user, 2 watchers, 2 MCP servers, 2 scheduled jobs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Core Identity | PASS | Silver remains a reasoning engine in Obsidian vault, acting via MCP servers |
| II. Vault-First | PASS | All state, plans, approvals, logs remain in vault. New watchers feed into existing vault folders |
| III. Execution Loop | PASS | READ→THINK→PLAN→ACT→LOG→COMPLETE loop preserved. MCP is the ACT mechanism |
| IV. HITL Law | PASS | All MCP actions classified as sensitive require approval. No bypass. Fail-safe default to approval for unknown actions |
| V. Persistence | PASS | Watcher state persisted. Incomplete plans still resume on restart |
| VI. Security First | PASS | Secrets in env vars only. DRY_RUN respected for all MCP actions. All actions logged |
| VII. Autonomy Boundaries | PASS | Drafts autonomous. Sends/posts/payments require approval. LinkedIn posts always through HITL |
| VIII. Quality Standard | PASS | All outputs structured, logged, auditable, reproducible |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-silver-tier-assistant/
├── plan.md              # This file
├── research.md          # Phase 0 output — MCP server research
├── data-model.md        # Phase 1 output — entity definitions
├── quickstart.md        # Phase 1 output — setup guide
├── contracts/           # Phase 1 output — TypeScript interfaces
│   └── interfaces.ts
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/sp.tasks)
```

### Source Code (Silver Tier — `silver/`)

```text
silver/
├── src/
│   ├── index.ts                    # Silver daemon entry point (extends Bronze AIDaemon)
│   ├── config/
│   │   └── silver-config.ts        # Extended config with watcher/MCP/scheduler settings
│   ├── watchers/
│   │   ├── base-watcher.ts         # Abstract BaseWatcher (poll-based lifecycle)
│   │   ├── gmail-watcher.ts        # Gmail inbox polling → task file creation
│   │   └── linkedin-watcher.ts     # LinkedIn notifications polling → task file creation
│   ├── mcp/
│   │   ├── mcp-manager.ts          # MCP client manager (connect/call/disconnect servers)
│   │   ├── mcp-logger.ts           # MCP-specific log entries with server/tool metadata
│   │   └── mcp-configs.ts          # Gmail + LinkedIn MCP server configurations
│   ├── skills/
│   │   ├── send-email.skill.ts     # Email sending via Gmail MCP (sensitive → HITL)
│   │   ├── linkedin-post.skill.ts  # LinkedIn posting via LinkedIn MCP (sensitive → HITL)
│   │   └── daily-briefing.skill.ts # Vault summary briefing generation (safe)
│   ├── scheduler/
│   │   ├── trigger.ts              # CLI entry point for scheduled job triggers
│   │   ├── job-definitions.ts      # Scheduled job configs (briefing, LinkedIn)
│   │   └── setup-scheduler.ts      # OS scheduler setup helper (schtasks/cron)
│   ├── models/
│   │   ├── extended-frontmatter.ts # Extended TaskType, SilverTaskFrontmatter
│   │   └── alert-file.ts           # Alert file creation and management
│   └── pipeline/
│       └── silver-executor.ts      # Extended executor with MCP dispatch capability
└── tests/
    ├── unit/
    │   ├── base-watcher.test.ts
    │   ├── gmail-watcher.test.ts
    │   ├── linkedin-watcher.test.ts
    │   ├── mcp-manager.test.ts
    │   ├── send-email.skill.test.ts
    │   ├── linkedin-post.skill.test.ts
    │   └── daily-briefing.skill.test.ts
    ├── integration/
    │   ├── watcher-to-pipeline.test.ts
    │   └── mcp-execution.test.ts
    └── fixtures/
        ├── gmail-task.md
        ├── linkedin-task.md
        └── scheduled-task.md
```

### Bronze (existing — unchanged)

```text
bronze/
├── src/                  # Unchanged — Silver imports from here
│   ├── index.ts
│   ├── watcher/inbox-watcher.ts
│   ├── pipeline/{intake,planner,executor,completer}.ts
│   ├── skills/{base-skill,skill-registry,summarize.skill,draft-email.skill,generic-reasoning.skill,dashboard.skill}.ts
│   ├── approval/{approval-gate,approval-watcher}.ts
│   ├── logging/{logger,types}.ts
│   ├── models/{task-file,plan-file,frontmatter,approval-request}.ts
│   ├── claude/claude-client.ts
│   └── config/config.ts
└── tests/
```

**Structure Decision**: Silver lives in a parallel `silver/` folder and imports Bronze via TypeScript path aliases (`@bronze/*`). This preserves Bronze stability while allowing Silver to extend its classes and interfaces. The Silver daemon replaces the Bronze daemon at runtime (it starts Bronze's watchers + Silver's watchers together).

## Architecture: Phase-by-Phase Design

### Phase 1 — Multi-Watcher (FR-001, FR-002, FR-011, FR-013)

**Approach**: Create `BaseWatcher` abstract class that all poll-based watchers extend. Each watcher has a `poll()` method that checks its source, creates task files, and tracks state.

**Key decisions**:
- Bronze `InboxWatcher` stays as-is (filesystem, chokidar-based) — not refactored into BaseWatcher since it uses events, not polling
- `GmailWatcher` polls Gmail API via the Gmail MCP server's read tools
- `LinkedInWatcher` polls LinkedIn API for new messages/notifications
- Watcher state persisted to `/Logs/watcher-state.json` for crash recovery
- Deduplication via `source_id` field in frontmatter (checked before creating task file)

**Bronze extension points**:
- `TaskFrontmatter` type extended in `silver/src/models/extended-frontmatter.ts` to add `linkedin_message`, `linkedin_post`, `scheduled` types and `source_id` field
- Bronze `applyDefaults()` still works for unknown types (defaults to `file_drop`)

### Phase 2 — Planning Engine (Already exists in Bronze)

Bronze already implements plan-based reasoning (planner.ts → PlanFile with checkbox steps → executor.ts). Silver reuses this entirely. The only change is that Silver's executor needs to dispatch MCP actions for certain plan steps (Phase 3).

**No new code needed** — Bronze pipeline handles this.

### Phase 3 — MCP Integration (FR-003, FR-004, FR-010, FR-012)

**Approach**: Create `MCPManager` class that manages MCP server connections via `@modelcontextprotocol/sdk`. The manager:
1. Starts MCP servers as subprocesses via `StdioClientTransport`
2. Maintains a registry of connected servers
3. Exposes `callTool(serverName, toolName, args)` for skills to invoke
4. Handles connection lifecycle (connect on demand, disconnect on shutdown)

**Key decisions**:
- MCP servers run as child processes (stdio transport) — no HTTP needed
- `MCPManager` injected into `SilverExecutionContext` so skills can access it
- All MCP calls logged with server name, tool name, payload summary, and response
- DRY_RUN mode logs the intended call without executing
- Retry logic (3 attempts, exponential backoff) for transient MCP errors

**Skills that use MCP**:
- `SendEmailSkill` → calls Gmail MCP `send_email` tool
- `LinkedInPostSkill` → calls LinkedIn MCP `create_post` tool

### Phase 4 — Human-in-the-Loop Extension (FR-005)

**Approach**: Reuse Bronze's approval workflow entirely. The key extension is in the **sensitivity classification**:

- Bronze classifies steps as `safe` or `sensitive` based on Claude's plan output
- Silver adds explicit classification rules: ALL MCP actions that modify external state are `sensitive`
- Unknown/new action types default to `sensitive` (fail-safe)
- The approval file now includes MCP-specific metadata (server, tool, payload summary)

**Bronze extension points**:
- `ApprovalGate.requestApproval()` already supports arbitrary action descriptions
- `ApprovalWatcher` already watches `/Approved` and `/Rejected`
- Silver executor checks approval before invoking MCP

### Phase 5 — Scheduling (FR-006, FR-007)

**Approach**: Scheduled jobs are simple — the OS scheduler runs a trigger script that drops a task file into `/Inbox`. The existing daemon pipeline handles the rest.

**Components**:
- `trigger.ts` — CLI script invoked by OS scheduler. Accepts `--job <name>`, creates a task file in `/Inbox` with appropriate frontmatter
- `job-definitions.ts` — defines available jobs (daily-briefing, linkedin-post) with their task templates
- `setup-scheduler.ts` — helper that creates/removes OS scheduled tasks via `schtasks` (Windows) or `crontab` (Linux/Mac)

**Scheduled jobs**:
1. **Daily Briefing** (7:00 AM daily): Drops task `type: scheduled, source: scheduler, body: "Generate daily briefing"` → `DailyBriefingSkill` processes it
2. **LinkedIn Post** (9:00 AM weekdays): Drops task `type: linkedin_post, source: scheduler, body: "Generate and post LinkedIn sales content"` → `LinkedInPostSkill` processes it (through HITL)

### Phase 6 — LinkedIn Sales Posting (FR-008, FR-009)

**Approach**: `LinkedInPostSkill` is a Silver skill that:
1. Reads `Business_Goals.md` and `Company_Handbook.md` for context
2. Uses Claude (via `ClaudeClient`) to generate sales-oriented post content
3. Saves draft in the plan file
4. Returns `requiresApproval: true` with the full post text in the approval reason
5. After approval, executor invokes LinkedIn MCP `create_post` tool
6. Logs the publish result (post URL/ID)

**Content generation**: Claude prompt includes business goals, brand voice from handbook, and any specific topic from the task body. Output constrained to ≤3000 chars (LinkedIn limit).

## Complexity Tracking

No constitution violations. No complexity justifications needed.

All Silver components extend Bronze patterns:
- Watchers extend a new `BaseWatcher` (Bronze `InboxWatcher` is event-based, not poll-based, so no forced abstraction)
- Skills implement Bronze `BaseSkill` interface
- Executor extends Bronze executor with MCP dispatch
- Logging uses Bronze `Logger` with extended entry metadata
