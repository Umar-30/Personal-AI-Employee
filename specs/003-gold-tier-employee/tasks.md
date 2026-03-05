# Tasks: Gold Tier Autonomous Business Employee

**Input**: Design documents from `/specs/003-gold-tier-employee/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/interfaces.ts

**Tests**: Not explicitly requested. Test tasks omitted. Manual verification via DRY_RUN mode and quickstart.md.

**Organization**: Tasks grouped by user story. Each story can be implemented and tested independently after foundational phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize Gold project structure, install dependencies, configure TypeScript paths

- [x] T001 Create Gold directory structure: `gold/src/{config,mcp-servers/odoo-mcp,social,skills,persistence,watchdog,logging,models,pipeline,scheduler}` and `gold/tests/fixtures`
- [x] T002 Update `tsconfig.json` to add `gold/src/**/*` to `include` array, keeping bronze and silver entries
- [x] T003 [P] Update `package.json` to add Gold scripts: `start:gold`, `dev:gold`, `watchdog`, `trigger:gold`, `setup-gold-scheduler`, `audit:verify`
- [x] T004 [P] Update `.env.example` with all Gold environment variables (ODOO_*, FACEBOOK_*, INSTAGRAM_*, TWITTER_*, WATCHDOG_*, PERSISTENCE_*, AUDIT_*) per `specs/003-gold-tier-employee/quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Gold infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create Gold config in `gold/src/config/gold-config.ts` — implement `GoldConfig` interface extending `SilverConfig` with `OdooConfig`, `SocialMediaCredentials`, `WatchdogConfig`, audit settings, and persistence settings. Load all from env vars via `loadGoldConfig()` per `contracts/interfaces.ts`
- [x] T006 [P] Create Gold frontmatter types in `gold/src/models/gold-frontmatter.ts` — add `GoldTaskType` (`odoo_invoice`, `odoo_journal`, `social_post`, `ceo_briefing`, `financial_report`), extend Silver's `applySilverDefaults()` and `validateSilverFrontmatter()` with Gold types per `contracts/interfaces.ts`
- [x] T007 [P] Create Gold executor in `gold/src/pipeline/gold-executor.ts` — define `GoldExecutionContext` extending `ExecutionContext` with `mcpManager`, `socialMediaManager`, `auditLogger` fields per contracts. Implement `executeGoldTaskPlan()` that wraps Silver's execution with audit logging on every action
- [x] T008 Create Odoo MCP server config in `gold/src/config/gold-config.ts` — add `MCPServerConfig` for the Odoo MCP server (command: `ts-node`, args: `gold/src/mcp-servers/odoo-mcp/index.ts`, env: Odoo credentials) alongside existing Gmail/LinkedIn configs

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Odoo Accounting Integration (Priority: P1)

**Goal**: Custom Odoo MCP server running, invoice creation/posting via HITL approval, read-only financial queries, full financial logging

**Independent Test**: Create a task requesting "create an invoice for Client X, $5,000 for consulting services." Verify the system drafts the invoice in Odoo (not posted), creates an approval request in `/Pending_Approval` with full invoice details, and upon approval posts the invoice to Odoo. Confirm all actions are logged.

### Odoo MCP Server

- [x] T009 [US1] Implement Odoo JSON-RPC client in `gold/src/mcp-servers/odoo-mcp/odoo-client.ts` — create `OdooClient` class with: `authenticate()` (JSON-RPC to `/jsonrpc` with `call` method for `common` service), `execute()` (calls `object.execute_kw` for CRUD on Odoo models), `searchRead()` helper for filtered queries. Use Node `http`/`https` module for HTTP requests. All methods accept database/uid/apiKey from config
- [x] T010 [US1] Implement Odoo MCP tool definitions in `gold/src/mcp-servers/odoo-mcp/tools.ts` — define 6 MCP tools per `contracts/interfaces.ts` `OdooMCPTools`: `create_invoice` (creates `account.move` with `move_type: out_invoice`), `post_invoice` (calls `action_post` on invoice), `list_invoices` (search_read on `account.move`), `get_invoice` (read single invoice with line items), `create_journal_entry` (creates `account.move` with journal lines), `list_journal_entries` (search_read filtered by journal/date). Each tool validates input with Zod schemas
- [x] T011 [US1] Implement Odoo MCP server entry point in `gold/src/mcp-servers/odoo-mcp/index.ts` — create MCP server using `@modelcontextprotocol/sdk` `Server` + `StdioServerTransport`, register all 6 tools from `tools.ts`, read Odoo credentials from env vars, initialize `OdooClient` on startup

### Odoo Skills

- [x] T012 [US1] Implement `OdooInvoiceSkill` in `gold/src/skills/odoo-invoice.skill.ts` — implement `BaseSkill`, `canHandle()` matches `type: odoo_invoice` or body keywords (invoice, billing, payment). `execute()`: parse invoice request from task body using ClaudeClient, call Odoo MCP `create_invoice`, return `makeApprovalResult()` with full invoice details (number, customer, items, total, tax). Add `executeMCPAction()` method for post-approval: calls `post_invoice` via MCPManager. On Odoo error: return `makeErrorResult()`, do NOT auto-retry financial writes
- [x] T013 [US1] Implement `OdooReportSkill` in `gold/src/skills/odoo-report.skill.ts` — implement `BaseSkill`, `canHandle()` matches `type: financial_report` or body keywords (outstanding invoices, financial summary, accounting report). `execute()`: calls Odoo MCP `list_invoices`/`list_journal_entries` (read-only, no approval needed), formats results into a markdown report, writes to vault, returns `makeSuccessResult()`. Log all Odoo queries
- [x] T014 [US1] Register Odoo skills and MCP server in Gold daemon — add Odoo MCP server to `connectMCPServers()`, register `OdooInvoiceSkill` and `OdooReportSkill` in `SkillRegistry` with appropriate priorities
- [x] T015 [P] [US1] Create test fixture `gold/tests/fixtures/odoo-invoice-task.md` — sample task file with frontmatter `type: odoo_invoice, source: file_drop, priority: high` and body requesting invoice creation

**Checkpoint**: Odoo MCP server connects, invoices can be drafted/approved/posted, financial queries return reports. All financial actions logged.

---

## Phase 4: User Story 2 — Multi-Platform Social Media Posting (Priority: P2)

**Goal**: Facebook, Instagram, Twitter clients operational, platform-specific content generation, per-platform HITL approval, engagement summaries

**Independent Test**: Create a task requesting "post about our new product launch across all social platforms." Verify the system generates platform-specific drafts, creates approval requests for each, and upon approval publishes via respective integrations.

### Social Media Platform Clients

- [x] T016 [P] [US2] Implement Facebook client in `gold/src/social/facebook-client.ts` — create `FacebookClient` class with: `publish(text, mediaUrls?)` using Facebook Graph API POST to `/{pageId}/feed`, `getEngagement(postId)` using GET `/{postId}?fields=likes.summary(true),comments.summary(true),shares`, `isConfigured()` checks env vars. All methods use `fetch` or Node `https`. DRY_RUN support: log intended call without executing
- [x] T017 [P] [US2] Implement Instagram client in `gold/src/social/instagram-client.ts` — create `InstagramClient` class with: `publish(text, mediaUrls?)` using Instagram Graph API (create media container then publish), `getEngagement(postId)` using media insights endpoint, `isConfigured()` checks env vars. DRY_RUN support
- [x] T018 [P] [US2] Implement Twitter client in `gold/src/social/twitter-client.ts` — create `TwitterClient` class with: `publish(text)` using Twitter API v2 POST `/2/tweets` with OAuth 1.0a signing, `getEngagement(postId)` using GET `/2/tweets/{id}?tweet.fields=public_metrics`, `isConfigured()` checks env vars. DRY_RUN support
- [x] T019 [US2] Implement `SocialMediaManager` in `gold/src/social/social-media-manager.ts` — implement `ISocialMediaManager` from contracts. Compose `FacebookClient`, `InstagramClient`, `TwitterClient`, and delegate to Silver's `LinkedInPostSkill` for LinkedIn. Methods: `publish(platform, text, mediaUrls?)`, `getEngagement(platform, postId)`, `isConfigured(platform)`, `getConfiguredPlatforms()`. Log all operations

### Social Post Skill

- [x] T020 [US2] Implement `SocialPostSkill` in `gold/src/skills/social-post.skill.ts` — implement `BaseSkill`, `canHandle()` matches `type: social_post` or body keywords (social media, post across, facebook, instagram, twitter). `execute()`: use ClaudeClient to generate platform-specific content respecting character limits (Twitter 280, Instagram 2200, LinkedIn 3000, Facebook 63206), create ONE approval request PER platform with full draft text, return `makeApprovalResult()` with all drafts. Add `publishToplatform()` method for post-approval execution via `SocialMediaManager`
- [x] T021 [US2] Register `SocialPostSkill` in Gold daemon's `SkillRegistry` with appropriate priority (after Odoo skills, before generic reasoning)
- [x] T022 [P] [US2] Create test fixture `gold/tests/fixtures/social-post-task.md` — sample task file with frontmatter `type: social_post, source: file_drop, priority: medium` and body requesting multi-platform posting

**Checkpoint**: Social media posts can be generated, reviewed per-platform, approved, and published. Platform rejections create alert files.

---

## Phase 5: User Story 3 — Weekly CEO Briefing (Priority: P3)

**Goal**: Sunday-triggered autonomous briefing with 5 required sections sourced from Odoo, bank data, vault, and social metrics. Graceful degradation when data sources unavailable.

**Independent Test**: Trigger the Sunday scheduler. Verify a briefing file is generated at `/Briefings/YYYY-MM-DD_Monday_Briefing.md` containing all required sections with data sourced from `Business_Goals.md`, `Bank_Transactions.md`, `/Done`, and Odoo financial data.

- [x] T023 [US3] Implement `CEOBriefingSkill` in `gold/src/skills/ceo-briefing.skill.ts` — implement `BaseSkill`, `canHandle()` matches `type: ceo_briefing` or body keywords (ceo briefing, monday briefing, weekly briefing, executive summary). `execute()`: (1) read `Business_Goals.md` from vault, (2) parse `Bank_Transactions.md` for income/expenses since last briefing, (3) scan `/Done` for completed tasks this week, (4) query Odoo MCP `list_invoices` for paid/outstanding invoices (gracefully handle Odoo offline — mark section "Data unavailable"), (5) build structured prompt with all 5 sections (revenue summary, bottleneck analysis, subscription audit, risk assessment, recommendations), (6) call ClaudeClient to generate briefing, (7) write to `/Briefings/YYYY-MM-DD_Monday_Briefing.md`, (8) return `makeSuccessResult()`. No approval needed (autonomous generation per spec)
- [x] T024 [P] [US3] Create Gold scheduled job definitions in `gold/src/scheduler/gold-job-definitions.ts` — define `ScheduledJobConfig` for `weekly-ceo-briefing` (Sunday 7AM, `type: ceo_briefing`) with task template including frontmatter and body. Import Silver's existing job definitions and merge with Gold jobs
- [x] T025 [US3] Create Gold scheduler setup in `gold/src/scheduler/setup-gold-scheduler.ts` — extend Silver's scheduler setup to include Gold-specific jobs (weekly CEO briefing, watchdog). Generate `schtasks` (Windows) or crontab entries for each Gold job
- [x] T026 [US3] Register `CEOBriefingSkill` in Gold daemon's `SkillRegistry` with priority higher than Silver's `DailyBriefingSkill` (Gold's weekly briefing should take precedence for matching keywords)
- [x] T027 [P] [US3] Create test fixture `gold/tests/fixtures/ceo-briefing-task.md` — sample task file with frontmatter `type: ceo_briefing, source: scheduler, priority: high` and body requesting weekly CEO briefing

**Checkpoint**: CEO briefing generates autonomously with all 5 sections. Missing data sources flagged gracefully. Scheduler triggers correctly.

---

## Phase 6: User Story 4 — Ralph Wiggum Persistence Loop (Priority: P4)

**Goal**: Tasks run to completion with retry on transient failures, stall detection, and file-based completion signals. No premature termination.

**Independent Test**: Start a multi-step task with 5 plan steps. Simulate a transient failure on step 3. Verify the system retries, continues past step 3, and completes all 5 steps without human intervention.

- [x] T028 [US4] Implement `PersistenceLoop` in `gold/src/persistence/persistence-loop.ts` — implement `IPersistenceLoop` from contracts. Constructor takes `stallTimeoutMs`, `maxRetries`, `retryBackoffMs` from `GoldConfig.persistence`. `start(taskRef, planRef)`: read plan file, parse checkboxes, enter loop that (a) finds next unchecked step, (b) dispatches to executor, (c) on transient error retries with exponential backoff, (d) on success marks step complete and writes plan, (e) checks completion conditions (all steps done OR file moved to `/Done` OR promise emitted), (f) if stalled (no progress within `stallTimeoutMs`), creates alert file but does NOT terminate. `isComplete()`: checks all `CompletionCondition`s. `signalCompletion()`: sets external condition satisfied
- [x] T029 [US4] Integrate `PersistenceLoop` into Gold executor in `gold/src/pipeline/gold-executor.ts` — wrap `executeGoldTaskPlan()` with persistence loop for multi-step tasks (tasks with >1 plan step). Single-step tasks bypass the loop. The loop calls the executor for each individual step
- [x] T030 [US4] Add completion signal detection to `PersistenceLoop` — monitor `/Done` folder for task file arrival (file-based completion), check plan file for all checkboxes resolved, support explicit `signalCompletion('promise_emitted')` call from skills

**Checkpoint**: Multi-step tasks survive transient failures. Stalled tasks generate alerts. Completion detected via plan checkboxes or file movement.

---

## Phase 7: User Story 5 — Production-Grade Error Handling and Recovery (Priority: P5)

**Goal**: Watchdog monitors daemon via PID, restarts on crash, graceful degradation for all external services, structured retry logic everywhere.

**Independent Test**: Kill the daemon process mid-execution. Verify the watchdog detects the failure, restarts the daemon, and the daemon resumes incomplete tasks from the last checkpoint.

- [x] T031 [US5] Implement PID file management in `gold/src/index.ts` (GoldDaemon) — on startup: write `process.pid` to `gold/gold-daemon.pid`, register cleanup on SIGINT/SIGTERM/exit to remove PID file. On startup: check for stale PID file (process no longer running) and clean up
- [x] T032 [US5] Implement watchdog process in `gold/src/watchdog/watchdog.ts` — standalone script implementing `IWatchdog` from contracts. Reads PID from `gold/gold-daemon.pid`, checks process liveness via `process.kill(pid, 0)` (signal 0 = existence check), if dead: spawns new daemon process using `child_process.spawn()` with detached mode, logs restart event, increments `restartCount`. If `restartCount > maxRestarts`: creates critical alert file, stops restarting. Runs on configurable interval (default 30s). Can be started via `npm run watchdog` or OS scheduler
- [x] T033 [US5] Add graceful degradation to GoldDaemon in `gold/src/index.ts` — on MCP connection failure (Odoo, Gmail, LinkedIn): log warning, mark service as unavailable in config, continue running with available services. On each scan cycle: attempt to reconnect failed services. Track service health status for Dashboard.md updates
- [x] T034 [US5] Add enhanced retry logic to Gold executor in `gold/src/pipeline/gold-executor.ts` — for all external service calls (MCP, social media): wrap with configurable retry (max attempts from `GoldConfig.persistence.maxRetries`, exponential backoff from `retryBackoffMs`). Distinguish transient errors (network, timeout) from permanent errors (validation, auth). Only retry transient errors. Log all retry attempts

**Checkpoint**: Watchdog restarts crashed daemon within 30s. Graceful degradation keeps system running when services fail. Retry logic handles transient errors.

---

## Phase 8: User Story 6 — Enhanced Audit Logging (Priority: P6)

**Goal**: Immutable daily JSON audit logs with SHA-256 hash chaining, financial metadata, tamper detection, daily rotation.

**Independent Test**: Process 10 different tasks across all domains. Verify each action has a complete audit entry. Verify hash chain integrity.

- [x] T035 [US6] Implement `AuditLogger` in `gold/src/logging/audit-logger.ts` — implement `IAuditLogger` from contracts. Constructor takes `logsDir` and `enableHashChaining`. `log()`: creates `AuditEntry` with ISO 8601 timestamp, computes SHA-256 hash of entry JSON + `previousHash` (first entry of day uses "GENESIS" as previous), appends JSON-line to `/Logs/YYYY-MM-DD.json`. `logFinancial()`: calls `log()` with `financial` metadata populated. `getTodayEntries()`: reads today's log file, parses JSON-lines. `verifyIntegrity(date)`: reads log file, recomputes hash chain, returns `{ valid, brokenAt }` if any hash doesn't match
- [x] T036 [US6] Integrate `AuditLogger` into Gold executor and all Gold skills — pass `auditLogger` via `GoldExecutionContext`. In executor: log every step execution (start, success, failure, approval request). In Odoo skills: call `logFinancial()` for all Odoo operations. In social skills: call `log()` for all publish operations. In CEO briefing: call `log()` for briefing generation
- [x] T037 [US6] Add daily rotation and finalization to `AuditLogger` — on first log entry of a new day: create new file, write header entry with date and reference to previous day's file. Never modify previous day's file after the new day starts. Add `finalizePreviousDay()` helper that writes a closing hash entry to the previous day's log if it exists
- [x] T038 [P] [US6] Add audit verification CLI command — create script at `gold/src/logging/verify-audit.ts` that accepts `--date YYYY-MM-DD`, reads the log file, verifies hash chain, and reports integrity status. Wire to `npm run audit:verify`

**Checkpoint**: Every system action produces an audit entry. Hash chain is verifiable. Financial actions include Odoo metadata. Daily rotation works.

---

## Phase 9: Integration & Polish

**Purpose**: Wire everything together in GoldDaemon, scheduler setup, regression testing, compilation check

- [x] T039 Create GoldDaemon entry point in `gold/src/index.ts` — create `GoldDaemon` class that: (1) loads `GoldConfig`, (2) initializes `AuditLogger`, (3) starts Bronze `InboxWatcher` + Silver `GmailWatcher`/`LinkedInWatcher` concurrently, (4) connects Odoo + Gmail + LinkedIn MCP servers, (5) initializes `SocialMediaManager`, (6) registers all Bronze + Silver + Gold skills in `SkillRegistry`, (7) creates `GoldExecutionContext` with all managers, (8) wraps task execution with `PersistenceLoop` for multi-step tasks, (9) writes PID file, (10) handles graceful shutdown (disconnect MCP, stop watchers, remove PID, finalize audit log)
- [x] T040 Create Gold trigger script in `gold/src/scheduler/trigger.ts` — extend Silver's trigger script to support Gold job definitions (accepts `--job weekly-ceo-briefing`), creates task file in `/Inbox` from Gold job template
- [x] T041 [P] Verify Bronze regression: run Bronze daemon standalone (`npx ts-node bronze/src/index.ts`), drop a file into `/Inbox`, confirm full Bronze pipeline still works unchanged
- [x] T042 [P] Verify Silver regression: run Silver daemon standalone (`npx ts-node silver/src/index.ts`), confirm all Silver watchers and MCP connections still work unchanged
- [x] T043 Verify TypeScript compilation: run `npx tsc --noEmit` from project root — zero errors for bronze, silver, and gold
- [x] T044 Validate DRY_RUN mode end-to-end: set `DRY_RUN=true`, trigger Odoo invoice task, social post task, CEO briefing task — confirm all log intended actions without executing external calls
- [x] T045 [P] Update `Dashboard.md` skill to reflect Gold state: include Odoo connection status, social media platform status, watchdog health, audit log status, persistence loop active tasks

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — needs GoldConfig, GoldExecutionContext, Odoo MCP config
- **US2 (Phase 4)**: Depends on Foundational — needs GoldConfig, GoldExecutionContext
- **US3 (Phase 5)**: Depends on US1 (Phase 3) — needs Odoo MCP for financial data in briefing
- **US4 (Phase 6)**: Depends on Foundational — needs Gold executor to wrap with persistence
- **US5 (Phase 7)**: Depends on Foundational — needs GoldDaemon structure for PID/watchdog
- **US6 (Phase 8)**: Depends on Foundational — needs GoldExecutionContext for audit logger injection
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Odoo Accounting)**: Independent after Foundational
- **US2 (Social Media)**: Independent after Foundational — no dependency on US1
- **US3 (CEO Briefing)**: Depends on US1 (needs Odoo MCP for financial data queries)
- **US4 (Persistence Loop)**: Independent after Foundational — no dependency on US1/US2
- **US5 (Error Handling)**: Independent after Foundational — no dependency on US1/US2
- **US6 (Audit Logging)**: Independent after Foundational — integrated into all skills during Polish

### Within Each User Story

- Config/models before clients/services
- Clients/services before skills
- Skills before daemon wiring/registration
- Daemon wiring before E2E verification

### Parallel Opportunities

**After Foundational completes, these can run in parallel:**
- US1 (Odoo) || US2 (Social Media) || US4 (Persistence) || US5 (Error Handling) || US6 (Audit Logging)

**Then sequentially:**
- US3 after US1 completes (needs Odoo data)

**Within phases, parallel tasks marked [P]:**
- T003 || T004 (Setup)
- T006 || T007 (Foundational)
- T016 || T017 || T018 (Social media clients)
- T024 || T027 (CEO briefing fixtures/jobs)
- T041 || T042 || T045 (Polish regression)

---

## Parallel Examples

### Foundational Phase — Parallel Tasks

```
T006 Gold frontmatter  || T007 Gold executor
```

### After Foundational — Parallel User Stories

```
US1 (T009-T015 Odoo)  || US2 (T016-T022 Social)  || US4 (T028-T030 Persistence)  || US5 (T031-T034 Reliability)  || US6 (T035-T038 Audit)
```

### After US1 — Sequential

```
US3 (T023-T027 CEO Briefing) — needs Odoo MCP from US1
```

### Within US2 — Parallel Clients

```
T016 Facebook client  || T017 Instagram client  || T018 Twitter client
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 (Odoo Accounting)
4. **STOP and VALIDATE**: Create invoice task → verify draft in Odoo, approval flow, post on approval
5. Demo: "System creates, approves, and posts invoices in Odoo"

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Odoo) → Test independently → "Accounting intelligence operational"
3. US2 (Social Media) → Test independently → "Multi-platform social posting works"
4. US3 (CEO Briefing) → Test independently → "Weekly briefing auto-generates with financial data"
5. US4 (Persistence) → Test independently → "Multi-step tasks run to completion"
6. US5 (Reliability) → Test independently → "Watchdog + graceful degradation operational"
7. US6 (Audit Logging) → Test independently → "Immutable audit trail with hash verification"
8. Polish → Validation → "Gold tier complete"

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All Gold skills implement Bronze `BaseSkill` interface — no new skill interfaces
- All MCP calls go through `MCPManager` — never call MCP SDK directly from skills
- Social media calls go through `SocialMediaManager` — never call platform APIs directly from skills
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Bronze code is READ-ONLY — Gold extends, never modifies Bronze files
- Silver code is READ-ONLY — Gold extends, never modifies Silver files
- Odoo MCP server is a standalone subprocess — it has its own entry point at `gold/src/mcp-servers/odoo-mcp/index.ts`
