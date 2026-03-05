# Tasks: Silver Tier Multi-Tool Assistant

**Input**: Design documents from `/specs/002-silver-tier-assistant/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/interfaces.ts

**Tests**: Not explicitly requested. Test tasks omitted. Manual verification via DRY_RUN mode and quickstart.md.

**Organization**: Tasks grouped by user story. Each story can be implemented and tested independently after foundational phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize Silver project structure, install dependencies, configure TypeScript paths

- [x] T001 Create Silver directory structure: `silver/src/{config,watchers,mcp,skills,scheduler,models,pipeline}` and `silver/tests/{unit,integration,fixtures}`
- [x] T002 Install Silver dependencies: `npm install @modelcontextprotocol/sdk zod linkedin-mcp-server`
- [x] T003 Update `tsconfig.json` to add path alias `@bronze/*` mapping to `./bronze/src/*`, and include `silver/src/**/*` in compilation
- [x] T004 [P] Create `.env.example` with all Silver environment variables (GMAIL_*, LINKEDIN_*, MCP_*) documented per `specs/002-silver-tier-assistant/quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Silver infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create extended frontmatter types in `silver/src/models/extended-frontmatter.ts` — add `SilverTaskType` (`linkedin_message`, `linkedin_post`, `scheduled`), `SilverTaskFrontmatter` with `source_id` field, extended `applyDefaults()` and `validateFrontmatter()` per `specs/002-silver-tier-assistant/data-model.md`
- [x] T006 [P] Create Silver config in `silver/src/config/silver-config.ts` — extend Bronze `AppConfig` with watcher configs (Gmail/LinkedIn poll intervals), MCP server configs (command, args, env), and scheduler settings. Load from env vars
- [x] T007 [P] Create abstract `BaseWatcher` class in `silver/src/watchers/base-watcher.ts` — implement `IWatcher` interface from `contracts/interfaces.ts` with: configurable poll interval, `start()`/`stop()` lifecycle, `poll()` abstract method, `WatcherState` tracking, error counting with alert file creation, deduplication via `source_id` check
- [x] T008 Create `MCPManager` class in `silver/src/mcp/mcp-manager.ts` — implement `IMCPManager` from `contracts/interfaces.ts` using `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`. Support: connect/disconnect servers, `callTool()` dispatch, DRY_RUN mode, retry logic (3 attempts, exponential backoff), connection health tracking
- [x] T009 [P] Create MCP logger helper in `silver/src/mcp/mcp-logger.ts` — extend Bronze `Logger` entries with MCP-specific fields (`mcpServer`, `mcpTool`, `mcpPayload`, `mcpResponseStatus`) per `data-model.md` MCP Action Log Entry
- [x] T010 [P] Create alert file module in `silver/src/models/alert-file.ts` — implement `AlertFrontmatter` from contracts, functions to create/read alert files in vault with types: `auth_failure`, `mcp_unreachable`, `rate_limit`, `content_rejected`
- [x] T011 [P] Create MCP server configurations in `silver/src/mcp/mcp-configs.ts` — define `MCPServerConfig` objects for Gmail (`@gongrzhe/server-gmail-mcp`) and LinkedIn (`linkedin-mcp-server`) servers with env-based configuration
- [x] T012 Create Silver executor in `silver/src/pipeline/silver-executor.ts` — extend Bronze `executeTaskPlan()` to inject `MCPManager` into `SilverExecutionContext`, dispatch MCP-aware skills, and log all MCP interactions. Reuse Bronze retry/approval logic

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Multi-Source Task Ingestion via Watchers (Priority: P1) MVP

**Goal**: Gmail and LinkedIn watchers running concurrently, each creating structured task files in `/Needs_Action` with unified metadata schema

**Independent Test**: Send a test email to Gmail and a test LinkedIn message. Verify both appear as task files in `/Needs_Action` within 60 seconds with correct frontmatter (`type`, `source`, `priority`, `status`, `created`, `source_id`)

### Implementation for User Story 1

- [x] T013 [US1] Implement `GmailWatcher` in `silver/src/watchers/gmail-watcher.ts` — extend `BaseWatcher`, use Gmail MCP server's read/list tools to poll for new emails since `lastChecked`, convert each email to a task file with frontmatter `type: email, source: gmail, source_id: <gmail_message_id>`, write to `/Needs_Action`
- [x] T014 [US1] Implement `LinkedInWatcher` in `silver/src/watchers/linkedin-watcher.ts` — extend `BaseWatcher`, poll LinkedIn for new messages/notifications, convert each to a task file with frontmatter `type: linkedin_message, source: linkedin, source_id: <linkedin_notif_id>`, write to `/Needs_Action`
- [x] T015 [US1] Create watcher state persistence in `silver/src/watchers/base-watcher.ts` — save/load `WatcherState` JSON to `/Logs/watcher-state.json` for crash recovery, track `lastChecked` per source
- [x] T016 [US1] Create test fixture files: `silver/tests/fixtures/gmail-task.md` (sample Gmail-sourced task with email frontmatter) and `silver/tests/fixtures/linkedin-task.md` (sample LinkedIn-sourced task)
- [x] T017 [US1] Wire watchers into Silver daemon entry point `silver/src/index.ts` — import Bronze `AIDaemon` components, start Bronze `InboxWatcher` + Silver `GmailWatcher` + `LinkedInWatcher` concurrently, handle graceful shutdown for all watchers

**Checkpoint**: Two external watchers + Bronze file-drop watcher all running. Tasks from Gmail and LinkedIn appear in `/Needs_Action`. Deduplication via `source_id` prevents re-processing.

---

## Phase 4: User Story 2 — MCP-Powered External Action Execution (Priority: P2)

**Goal**: At least one MCP server integrated and executing real external actions. Gmail MCP sends emails, all calls logged with full metadata

**Independent Test**: Create a task requesting "send a follow-up email to client X." Verify the system creates a plan, routes the send step through HITL approval, invokes Gmail MCP `send_email` on approval, and logs the MCP response

### Implementation for User Story 2

- [x] T018 [US2] Implement `SendEmailSkill` in `silver/src/skills/send-email.skill.ts` — implement Bronze `BaseSkill` interface, `canHandle()` matches `type: email` tasks with send intent, `execute()` calls Gmail MCP `send_email` via `MCPManager`, always returns `requiresApproval: true` for send actions, logs MCP response
- [x] T019 [US2] Integrate `MCPManager` lifecycle into Silver daemon `silver/src/index.ts` — connect Gmail and LinkedIn MCP servers on startup, disconnect on shutdown, handle connection errors with alert files
- [x] T020 [US2] Register `SendEmailSkill` in Silver daemon's `SkillRegistry` — add to registry with appropriate priority (after Bronze skills, before generic reasoning)
- [x] T021 [US2] Implement DRY_RUN support in `MCPManager` — when `dryRun: true`, log the intended MCP call (server, tool, args) without executing, return mock success response
- [x] T022 [US2] Verify end-to-end email flow: task file with email content → planner creates plan → executor dispatches to SendEmailSkill → approval requested → approved → MCP call → logged → task completed

**Checkpoint**: Gmail MCP integrated. Email tasks route through plan→approve→MCP send→log pipeline. DRY_RUN mode works for safe testing.

---

## Phase 5: User Story 3 — Scheduled Automation and Daily Briefing (Priority: P3)

**Goal**: OS-native scheduled jobs trigger task files. Daily briefing auto-generated at scheduled time

**Independent Test**: Run trigger script manually with `--job daily-briefing`. Verify a task file appears in `/Inbox`, gets processed through pipeline, and generates `/Briefings/YYYY-MM-DD_Daily_Briefing.md`

### Implementation for User Story 3

- [x] T023 [P] [US3] Create scheduled job definitions in `silver/src/scheduler/job-definitions.ts` — define `ScheduledJobConfig` objects for `daily-briefing` (daily 7AM, `type: scheduled`) and `linkedin-post` (weekdays 9AM, `type: linkedin_post`) with task file templates per `data-model.md`
- [x] T024 [US3] Create trigger CLI script in `silver/src/scheduler/trigger.ts` — accept `--job <name>` argument, look up job definition, create task file from template with frontmatter `type: scheduled, source: scheduler`, write to vault `/Inbox` directory, exit
- [x] T025 [US3] Implement `DailyBriefingSkill` in `silver/src/skills/daily-briefing.skill.ts` — implement `BaseSkill`, `canHandle()` matches scheduled briefing tasks, `execute()` scans all vault folders (`/Needs_Action`, `/Plans`, `/Pending_Approval`, `/Done`), uses `ClaudeClient` to generate executive summary, writes to `/Briefings/YYYY-MM-DD_Daily_Briefing.md`, updates `Dashboard.md`
- [x] T026 [US3] Register `DailyBriefingSkill` in Silver daemon's `SkillRegistry` with appropriate priority
- [x] T027 [US3] Create scheduler setup helper in `silver/src/scheduler/setup-scheduler.ts` — generate `schtasks` commands (Windows) or crontab entries (Linux/Mac) for each enabled job, provide install/uninstall functions
- [x] T028 [US3] Create test fixture `silver/tests/fixtures/scheduled-task.md` — sample scheduled trigger task file

**Checkpoint**: Trigger script creates valid task files. Daily briefing generates vault summary. Scheduler setup helper produces correct OS commands.

---

## Phase 6: User Story 4 — LinkedIn Sales Content Generation and Posting (Priority: P4)

**Goal**: System generates sales-oriented LinkedIn content, routes through HITL, publishes via LinkedIn MCP

**Independent Test**: Create a task requesting "generate a LinkedIn post about Q1 results." Verify draft is created in plan, approval file contains full post text, and upon approval the LinkedIn MCP `create_post` tool is invoked

### Implementation for User Story 4

- [x] T029 [US4] Implement `LinkedInPostSkill` in `silver/src/skills/linkedin-post.skill.ts` — implement `BaseSkill`, `canHandle()` matches `type: linkedin_post` tasks, `execute()` reads `Business_Goals.md` + `Company_Handbook.md`, uses `ClaudeClient` to generate sales post (≤3000 chars), returns `requiresApproval: true` with full post text as approval reason
- [x] T030 [US4] Add LinkedIn MCP publishing to Silver executor in `silver/src/pipeline/silver-executor.ts` — after approval of a LinkedIn post step, invoke LinkedIn MCP `create_post` tool with post text, log publish result (post URL/ID)
- [x] T031 [US4] Register `LinkedInPostSkill` in Silver daemon's `SkillRegistry` — add with priority between email and generic reasoning
- [x] T032 [US4] Verify end-to-end LinkedIn flow: scheduled trigger → task file → planner → LinkedInPostSkill generates draft → approval requested with full text → approved → LinkedIn MCP publish → logged → `/Done`

**Checkpoint**: LinkedIn posts can be generated, reviewed, approved, and published. Rejection archives draft without publishing.

---

## Phase 7: User Story 5 — Enhanced HITL for Multi-Domain Actions (Priority: P5)

**Goal**: All MCP-mediated external actions classified and routed through approval. Fail-safe default to approval for unknown actions

**Independent Test**: Trigger tasks across email, LinkedIn, and scheduled domains. Verify every external MCP action generates an approval request. Confirm no MCP write action executes without approval file

### Implementation for User Story 5

- [x] T033 [US5] Create sensitivity classification module in `silver/src/pipeline/silver-executor.ts` — add function `classifySensitivity(mcpServer, toolName)` that returns `sensitive` for all MCP write/send/post actions, `safe` for read-only MCP tools, and defaults to `sensitive` for unknown actions (fail-safe)
- [x] T034 [US5] Enhance approval file metadata in `silver/src/pipeline/silver-executor.ts` — when creating approval requests for MCP actions, include: MCP server name, tool name, payload summary, risk level, estimated impact in the approval file body
- [x] T035 [US5] Verify multi-domain HITL: trigger an email send, LinkedIn post, and unknown MCP action. Confirm all three generate approval files in `/Pending_Approval`. Confirm read-only MCP actions (e.g., Gmail list) do NOT require approval

**Checkpoint**: Complete HITL coverage for all Silver domains. No MCP write action can bypass approval. Unknown actions default to requiring approval.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Integration testing, validation, documentation

- [x] T036 [P] Verify Bronze regression: run Bronze daemon standalone (`npx ts-node bronze/src/index.ts`), drop a file into `/Inbox`, confirm full Bronze pipeline still works unchanged
- [x] T037 [P] Verify TypeScript compilation: run `npx tsc --noEmit` from project root — zero errors for both `bronze/` and `silver/`
- [x] T038 Validate DRY_RUN mode end-to-end: set `DRY_RUN=true`, trigger Gmail task, LinkedIn task, scheduled task — confirm all log intended actions without executing MCP calls
- [x] T039 Validate quickstart.md: follow setup steps in `specs/002-silver-tier-assistant/quickstart.md` on a clean environment — confirm daemon starts with all watchers and MCP connections
- [x] T040 [P] Update `Dashboard.md` skill to reflect Silver state: include watcher health status, MCP server connection status, and scheduled job last-run times

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — needs BaseWatcher, extended frontmatter, alert files
- **US2 (Phase 4)**: Depends on Foundational — needs MCPManager, Silver executor, MCP configs
- **US3 (Phase 5)**: Depends on Foundational — needs Silver config, skill registry wiring
- **US4 (Phase 6)**: Depends on US2 (Phase 4) — needs working MCP execution pipeline for LinkedIn MCP
- **US5 (Phase 7)**: Depends on US2 (Phase 4) — needs MCP actions to exist before classifying sensitivity
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Multi-Watcher)**: Independent after Foundational — no dependency on other stories
- **US2 (MCP Execution)**: Independent after Foundational — no dependency on US1
- **US3 (Scheduling)**: Independent after Foundational — no dependency on US1/US2
- **US4 (LinkedIn Posting)**: Depends on US2 (needs MCP execution pipeline working)
- **US5 (Enhanced HITL)**: Depends on US2 (needs MCP actions to classify)

### Within Each User Story

- Models/configs before services/skills
- Skills before executor integration
- Executor integration before daemon wiring
- Daemon wiring before E2E verification

### Parallel Opportunities

**After Foundational completes, these can run in parallel:**
- US1 (watchers) || US2 (MCP execution) || US3 (scheduling)

**Then sequentially:**
- US4 after US2 completes
- US5 after US2 completes (US4 || US5 can be parallel)

---

## Parallel Examples

### Foundational Phase — Parallel Tasks

```
T006 Silver config     || T007 BaseWatcher    || T009 MCP logger
T010 Alert file        || T011 MCP configs
```

### After Foundational — Parallel User Stories

```
US1 (T013-T017 watchers) || US2 (T018-T022 MCP) || US3 (T023-T028 scheduling)
```

### After US2 — Parallel

```
US4 (T029-T032 LinkedIn) || US5 (T033-T035 HITL)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 (Multi-Watcher)
4. **STOP and VALIDATE**: Send test email + LinkedIn message → verify task files in `/Needs_Action`
5. Demo: "System ingests tasks from 3 sources (file drop + Gmail + LinkedIn)"

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (watchers) → Test independently → "Multi-source ingestion works"
3. US2 (MCP) → Test independently → "System can send emails via MCP"
4. US3 (scheduling) → Test independently → "Daily briefing auto-generates"
5. US4 (LinkedIn) → Test independently → "LinkedIn posts can be published"
6. US5 (HITL) → Test independently → "All external actions require approval"
7. Polish → Validation → "Silver tier complete"

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All Silver skills implement Bronze `BaseSkill` interface — no new skill interfaces
- All MCP calls go through `MCPManager` — never call MCP SDK directly from skills
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Bronze code is READ-ONLY — Silver extends, never modifies Bronze files
