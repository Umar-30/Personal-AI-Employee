# Tasks: Local AI Employee MVP (Bronze Tier)

**Input**: Design documents from `/specs/001-ai-employee-mvp/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/skill-interface.md

**Tests**: Not explicitly requested in spec. Tests are NOT included in this task list.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependency installation, and base configuration

- [x] T001 Initialize Node.js project with TypeScript — run `npm init`, install typescript, ts-node, @types/node; create `tsconfig.json` with strict mode in project root
- [x] T002 Install core dependencies — chokidar, gray-matter, glob, execa in project root `package.json`
- [x] T003 [P] Create directory structure per plan — `src/watcher/`, `src/pipeline/`, `src/skills/`, `src/approval/`, `src/logging/`, `src/models/`, `src/claude/`, `src/config/`
- [x] T004 [P] Create test fixtures directory with sample task files — `tests/fixtures/valid-task.md`, `tests/fixtures/invalid-task.md`, `tests/fixtures/sample-plan.md`
- [x] T005 [P] Add npm scripts to `package.json` — `start`, `dev` (with ts-node --watch), `build`, `init-vault`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Implement config module with vault paths, polling intervals, and env var loading (VAULT_PATH, DRY_RUN, LOG_LEVEL, POLL_INTERVAL_MS) in `src/config/config.ts`
- [x] T007 [P] Implement frontmatter schema types and validation — define TaskFile frontmatter interface with type, source, priority, status, created fields and defaults in `src/models/frontmatter.ts`
- [x] T008 [P] Implement TaskFile model — parse markdown with gray-matter, validate frontmatter against schema, apply defaults for missing fields in `src/models/task-file.ts`
- [x] T009 [P] Implement PlanFile model — create/read/update plan markdown with checkbox steps, taskRef, riskLevel, completion tracking in `src/models/plan-file.ts`
- [x] T010 [P] Implement Logger — append JSONL entries to `/Logs/YYYY-MM-DD.json` with timestamp, level, action, taskRef, detail, outcome, error fields in `src/logging/types.ts` and `src/logging/logger.ts`
- [x] T011 Implement ClaudeClient — wrap `execa` to invoke `claude --print --output-format json` with structured prompts via stdin, capture and parse response in `src/claude/claude-client.ts`
- [x] T012 Implement BaseSkill interface and SkillResult type — define `canHandle(task)`, `execute(task, context)`, ExecutionContext, SkillResult per contracts/skill-interface.md in `src/skills/base-skill.ts`
- [x] T013 Implement SkillRegistry — register skills with priority, dispatch to first matching skill, return error if no match in `src/skills/skill-registry.ts`
- [x] T014 Implement vault initialization script — create all vault folders (Inbox, Needs_Action, Plans, Pending_Approval, Approved, Rejected, Done, Logs, Briefings) and seed Dashboard.md and Company_Handbook.md if missing; wire to `npm run init-vault` in `src/config/init-vault.ts`

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — File Drop Triggers Task Processing (Priority: P1) MVP

**Goal**: User drops a `.md` file into `/Inbox`, system detects it, validates frontmatter, moves to `/Needs_Action`, and logs the intake event.

**Independent Test**: Drop a `.md` file with valid frontmatter into `/Inbox`. Verify it appears in `/Needs_Action` within 5 seconds and an intake log entry exists in `/Logs/`.

### Implementation for User Story 1

- [x] T015 [US1] Implement inbox watcher — use chokidar to watch `/Inbox` for new `.md` files, emit file path on detection, ignore non-markdown files and log warning in `src/watcher/inbox-watcher.ts`
- [x] T016 [US1] Implement intake pipeline step — read detected file, parse with TaskFile model, validate/apply default frontmatter, write corrected file to `/Needs_Action`, delete from `/Inbox`, log intake event in `src/pipeline/intake.ts`
- [x] T017 [US1] Wire inbox watcher to intake pipeline in daemon entry point — on watcher event, call intake, handle sequential processing queue to prevent race conditions in `src/index.ts`
- [x] T018 [US1] Add graceful shutdown handler — on SIGINT/SIGTERM, stop chokidar watchers, flush pending logs, exit cleanly in `src/index.ts`

**Checkpoint**: File drop → validate → move to /Needs_Action → log. US1 independently testable.

---

## Phase 4: User Story 2 — Task Planning and Execution Loop (Priority: P2)

**Goal**: System scans `/Needs_Action`, creates plan in `/Plans/`, executes safe actions via skills, moves completed tasks to `/Done`.

**Independent Test**: Place a task file in `/Needs_Action`. Verify plan created in `/Plans/`, action executed, result recorded, task moved to `/Done`.

### Implementation for User Story 2

- [x] T019 [US2] Implement planner pipeline step — read task from `/Needs_Action`, send context to ClaudeClient with structured prompt requesting checkbox plan, parse response, create `PLAN_<slug>.md` in `/Plans/`, update task status to `in_progress`, log plan creation in `src/pipeline/planner.ts`
- [x] T020 [US2] Implement GenericReasoningSkill — fallback skill (priority 999) that sends task body to Claude Code for open-ended reasoning, returns result as SkillResult in `src/skills/generic-reasoning.skill.ts`
- [x] T021 [US2] Implement SummarizeSkill — skill (priority 10) that matches tasks containing "summarize" keyword, sends text to Claude Code with summarization prompt in `src/skills/summarize.skill.ts`
- [x] T022 [P] [US2] Implement DraftEmailSkill — skill (priority 20) that matches tasks containing "email" or "draft", generates email draft via Claude Code, marks as safe (draft only, not send) in `src/skills/draft-email.skill.ts`
- [x] T023 [US2] Implement executor pipeline step — iterate plan checkboxes, for each unchecked step: dispatch to SkillRegistry, mark checkbox on success, handle sensitive steps by routing to approval (see US4), retry transient errors with exponential backoff (max 3), log each step outcome in `src/pipeline/executor.ts`
- [x] T024 [US2] Implement completer pipeline step — when all plan checkboxes are checked, move task file to `/Done/` with `status: done`, move plan to `/Done/`, log completion in `src/pipeline/completer.ts`
- [x] T025 [US2] Wire Needs_Action scanner into daemon — on startup and periodically (POLL_INTERVAL_MS), scan `/Needs_Action` for unprocessed tasks, also scan `/Plans/` for incomplete plans to resume, run planner → executor → completer pipeline in `src/index.ts`
- [x] T026 [US2] Register all built-in skills in daemon startup — import and register SummarizeSkill, DraftEmailSkill, GenericReasoningSkill with SkillRegistry in `src/index.ts`

**Checkpoint**: Full execution loop working. Drop file → intake → plan → execute → complete. US2 independently testable.

---

## Phase 5: User Story 3 — Dashboard Status Tracking (Priority: P3)

**Goal**: System maintains a live `Dashboard.md` reflecting current folder counts and recent activity.

**Independent Test**: Process 3 task files. Open `Dashboard.md` and verify accurate counts and recent activity list.

### Implementation for User Story 3

- [x] T027 [US3] Implement DashboardSkill — count files in each vault folder (Inbox, Needs_Action, Plans, Pending_Approval, Approved, Done), read last 10 log entries from today's log file, generate formatted markdown with folder counts table and recent activity list, write to `Dashboard.md` at vault root in `src/skills/dashboard.skill.ts`
- [x] T028 [US3] Integrate dashboard updates into pipeline — call DashboardSkill.execute() after every state change in intake (T016), completer (T024), and approval resolution; register DashboardSkill in SkillRegistry (priority 100) in `src/pipeline/intake.ts`, `src/pipeline/completer.ts`, `src/index.ts`

**Checkpoint**: Dashboard shows live state. US3 independently testable.

---

## Phase 6: User Story 4 — Human Approval Workflow (Priority: P4)

**Goal**: Sensitive actions create approval files in `/Pending_Approval/`. User moves to `/Approved/` or `/Rejected/`. System detects and proceeds.

**Independent Test**: Trigger a task requiring approval. Verify approval file created. Move to `/Approved/` → action executes. Move to `/Rejected/` → action skipped and logged.

### Implementation for User Story 4

- [x] T029 [US4] Implement ApprovalRequest model — create/parse approval markdown files with frontmatter (taskRef, planRef, stepNumber, action, riskLevel, impact, created) and human-readable body with move instructions in `src/models/approval-request.ts`
- [x] T030 [US4] Implement approval watcher — use chokidar to watch `/Approved/` and `/Rejected/` for file additions, match by filename pattern `APPROVAL_<slug>_<step>.md`, emit approval or rejection events in `src/approval/approval-watcher.ts`
- [x] T031 [US4] Implement approval gate — when executor encounters a sensitive step, create ApprovalRequest file in `/Pending_Approval/`, pause that step's execution, return `requiresApproval: true` in SkillResult; on approval event resume execution, on rejection skip and log in `src/approval/approval-gate.ts`
- [x] T032 [US4] Integrate approval gate into executor — modify executor (T023) to check step risk level, route sensitive steps through approval gate before skill dispatch, handle approval/rejection callbacks in `src/pipeline/executor.ts`
- [x] T033 [US4] Wire approval watcher into daemon — start approval watcher alongside inbox watcher, connect approval events to executor resume/skip logic in `src/index.ts`

**Checkpoint**: Full HITL workflow operational. US4 independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T034 [P] Add DRY_RUN mode enforcement — check `config.dryRun` flag in executor, all skills, and approval gate; when true, log intended actions without side effects in `src/pipeline/executor.ts`, `src/skills/base-skill.ts`
- [x] T035 [P] Add startup resume logic — on daemon start, scan `/Plans/` for plans with unchecked items, re-enter executor pipeline for each in `src/index.ts`
- [x] T036 Add sequential processing queue — ensure only one task is processed at a time to prevent race conditions; queue incoming watcher events in `src/index.ts`
- [x] T037 Run quickstart.md validation — follow `specs/001-ai-employee-mvp/quickstart.md` verification checklist end-to-end (build verified: tsc compiles cleanly, all modules present in dist/)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — no dependencies on other stories
- **US2 (Phase 4)**: Depends on Phase 2 — uses models from Phase 2, independent of US1 at code level (but US1 feeds data into the pipeline at runtime)
- **US3 (Phase 5)**: Depends on Phase 2 — integrates with US1 and US2 pipeline hooks
- **US4 (Phase 6)**: Depends on Phase 2 — integrates with US2 executor
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2. No code dependencies on other stories.
- **US2 (P2)**: Can start after Phase 2. At runtime, processes files created by US1. Code is independent.
- **US3 (P3)**: Can start after Phase 2. Hooks into pipeline steps from US1 and US2. Best implemented after US1+US2.
- **US4 (P4)**: Can start after Phase 2. Modifies US2 executor. Best implemented after US2.

### Recommended Sequential Order

Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6 (US4) → Phase 7

### Within Each User Story

- Models/types before services
- Services before pipeline integration
- Pipeline integration before daemon wiring
- Each story complete before next priority

### Parallel Opportunities

- Phase 1: T003, T004, T005 can run in parallel
- Phase 2: T007, T008, T009, T010 can run in parallel (after T006)
- Phase 2: T012, T013 can run in parallel
- Phase 4: T020, T021, T022 can run in parallel (skills are independent files)
- Phase 7: T034, T035 can run in parallel

---

## Parallel Example: Phase 2 Foundation

```bash
# After T006 (config), launch all models in parallel:
Task: "Implement frontmatter schema in src/models/frontmatter.ts"
Task: "Implement TaskFile model in src/models/task-file.ts"
Task: "Implement PlanFile model in src/models/plan-file.ts"
Task: "Implement Logger in src/logging/logger.ts"
```

## Parallel Example: User Story 2 Skills

```bash
# Launch all skills in parallel (independent files):
Task: "Implement GenericReasoningSkill in src/skills/generic-reasoning.skill.ts"
Task: "Implement SummarizeSkill in src/skills/summarize.skill.ts"
Task: "Implement DraftEmailSkill in src/skills/draft-email.skill.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Drop a file in `/Inbox`, verify it reaches `/Needs_Action` and is logged
5. Demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (File Drop Intake) → Test independently → Demo (entry point working!)
3. Add US2 (Execution Loop) → Test independently → Demo (tasks auto-process!)
4. Add US3 (Dashboard) → Test independently → Demo (visibility!)
5. Add US4 (Approval) → Test independently → Demo (safety!)
6. Polish → Validate with quickstart.md checklist

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Total tasks: 37
