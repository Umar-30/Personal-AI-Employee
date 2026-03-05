# Feature Specification: Local AI Employee MVP (Bronze Tier)

**Feature Branch**: `001-ai-employee-mvp`
**Created**: 2026-02-15
**Status**: Draft
**Input**: User description: "Bronze Tier Local AI Employee — local-first autonomous AI Employee using Claude Code + Obsidian vault"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — File Drop Triggers Task Processing (Priority: P1)

The user drops a markdown file into the `/Inbox` folder. The system detects the new file, validates its frontmatter schema, moves it to `/Needs_Action`, and logs the intake event.

**Why this priority**: Without a working watcher and intake pipeline, no other functionality can operate. This is the entry point for all tasks.

**Independent Test**: Drop a `.md` file with valid frontmatter into `/Inbox`. Verify it appears in `/Needs_Action` within 5 seconds and an intake log entry exists in `/Logs/`.

**Acceptance Scenarios**:

1. **Given** a valid `.md` file is placed in `/Inbox`, **When** the watcher detects it, **Then** the file is moved to `/Needs_Action` with `status: pending` in frontmatter and a log entry is written to `/Logs/YYYY-MM-DD.json`.
2. **Given** a file with missing or invalid frontmatter is placed in `/Inbox`, **When** the watcher detects it, **Then** the system creates a corrected version with default frontmatter values (`type: file_drop`, `priority: medium`, `status: pending`, `created: <now>`) and moves it to `/Needs_Action`.
3. **Given** a non-markdown file is placed in `/Inbox`, **When** the watcher detects it, **Then** the file is ignored and a warning is logged.

---

### User Story 2 — Task Planning and Execution Loop (Priority: P2)

The system scans `/Needs_Action`, reads each task file, reasons about the objective and risk level, creates a plan in `/Plans/`, executes safe actions, and moves completed tasks to `/Done`.

**Why this priority**: The execution loop is the core intelligence of the system. Without it, tasks sit unprocessed.

**Independent Test**: Place a task file in `/Needs_Action` requesting a simple action (e.g., "summarize this text"). Verify a plan file is created in `/Plans/`, the action is executed, the result is recorded, and the task file moves to `/Done`.

**Acceptance Scenarios**:

1. **Given** a task file exists in `/Needs_Action`, **When** the execution loop runs, **Then** a plan file `PLAN_<task-slug>.md` is created in `/Plans/` with explicit checkbox steps.
2. **Given** a plan with all safe (non-sensitive) actions, **When** the system executes the plan, **Then** each step is completed, checkboxes are marked, the task file is moved to `/Done`, and `Dashboard.md` is updated.
3. **Given** a plan with a sensitive action (e.g., sending an email), **When** the system reaches that step, **Then** it creates an approval request file in `/Pending_Approval/` and halts execution of that step until the file is moved to `/Approved/`.
4. **Given** an execution error occurs mid-task, **When** the error is transient, **Then** the system retries with exponential backoff (max 3 retries) before logging the failure.

---

### User Story 3 — Dashboard Status Tracking (Priority: P3)

The system maintains a live `Dashboard.md` file that reflects the current state of all folders — how many tasks are pending, in progress, awaiting approval, and completed.

**Why this priority**: The dashboard provides visibility into the system's state, but the system can function without it.

**Independent Test**: Process 3 task files through the full lifecycle. Open `Dashboard.md` and verify it accurately reflects counts for each folder and lists recent activity.

**Acceptance Scenarios**:

1. **Given** tasks exist across multiple folders, **When** `Dashboard.md` is generated or updated, **Then** it displays accurate counts for `/Needs_Action`, `/Plans`, `/Pending_Approval`, `/Approved`, `/Done`.
2. **Given** a task completes or a new task arrives, **When** the system finishes that operation, **Then** `Dashboard.md` is updated within the same execution cycle.
3. **Given** no tasks exist in any folder, **When** `Dashboard.md` is rendered, **Then** it displays zero counts and a "No active tasks" message.

---

### User Story 4 — Human Approval Workflow (Priority: P4)

When the system encounters a sensitive action, it creates a structured approval file in `/Pending_Approval/`. The user reviews and moves the file to `/Approved/` or `/Rejected/`. The system detects the decision and proceeds accordingly.

**Why this priority**: Critical for safety, but only relevant once the execution loop (US2) is working.

**Independent Test**: Trigger a task requiring approval. Verify the approval file is created with clear action description. Move it to `/Approved/` and verify the action executes. Repeat with `/Rejected/` and verify the action is skipped and logged.

**Acceptance Scenarios**:

1. **Given** a sensitive action is identified during planning, **When** the system creates an approval file, **Then** the file contains: action description, risk level, estimated impact, and a clear approve/reject instruction.
2. **Given** an approval file is moved to `/Approved/`, **When** the system detects it, **Then** the pending action is executed and logged.
3. **Given** an approval file is moved to `/Rejected/`, **When** the system detects it, **Then** the action is skipped, the rejection is logged, and the task continues with remaining non-sensitive steps.

---

### Edge Cases

- What happens when two files are dropped into `/Inbox` simultaneously? System MUST process them sequentially to avoid race conditions.
- What happens when a task file references a non-existent `Company_Handbook.md`? System MUST log a warning and proceed without handbook constraints.
- What happens when `/Done` folder grows very large? System MUST NOT scan `/Done` during normal operations; it is archive-only.
- What happens when the system crashes mid-execution? On restart, the system MUST detect incomplete plans (unchecked items) and resume from the last completed step.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST watch the `/Inbox` folder for new `.md` files and process them within 5 seconds of detection.
- **FR-002**: System MUST validate task file frontmatter against the defined schema (`type`, `source`, `priority`, `status`, `created`).
- **FR-003**: System MUST create a plan file in `/Plans/` for every task, with explicit checkbox steps before executing any action.
- **FR-004**: System MUST classify actions as safe or sensitive and route sensitive actions through `/Pending_Approval/`.
- **FR-005**: System MUST move completed task files to `/Done/` and update `Dashboard.md` after every state change.
- **FR-006**: System MUST write structured JSON logs to `/Logs/YYYY-MM-DD.json` for every action taken.
- **FR-007**: System MUST implement all processing logic as reusable Agent Skills (modular, composable functions).
- **FR-008**: System MUST retry transient errors with exponential backoff (max 3 attempts) before marking a step as failed.
- **FR-009**: System MUST resume incomplete tasks on restart by scanning `/Plans/` for plans with unchecked items.
- **FR-010**: System MUST never execute irreversible external actions without explicit human approval.

### Key Entities

- **Task File**: A markdown file with YAML frontmatter representing a unit of work. Key attributes: type, source, priority, status, created timestamp, body content.
- **Plan File**: A markdown file in `/Plans/` containing checkbox steps derived from a task. Key attributes: task reference, steps with completion status, risk assessment.
- **Approval Request**: A structured markdown file in `/Pending_Approval/` describing a sensitive action awaiting human decision.
- **Log Entry**: A JSON object within a daily log file recording action type, timestamp, task reference, outcome, and any errors.
- **Dashboard**: A single markdown file providing a real-time summary of system state across all folders.

## Assumptions

- The Obsidian vault is a local directory on the same machine running Claude Code.
- File system events (create, move, delete) are reliably detectable via polling or native file watchers.
- Claude Code has read/write access to all vault folders.
- Only one instance of the AI Employee runs at a time (no multi-agent concurrency).
- The user interacts with the approval workflow by manually moving files between folders using Obsidian or a file manager.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A file dropped into `/Inbox` is detected and moved to `/Needs_Action` within 5 seconds.
- **SC-002**: Every processed task has a corresponding plan file with at least one checkbox step.
- **SC-003**: 100% of sensitive actions are routed through the approval workflow — zero unauthorized executions.
- **SC-004**: `Dashboard.md` reflects accurate folder counts within 10 seconds of any state change.
- **SC-005**: Every action taken by the system has a corresponding entry in `/Logs/YYYY-MM-DD.json`.
- **SC-006**: The system resumes incomplete tasks on restart without user intervention.
- **SC-007**: All processing logic is implemented as discrete, reusable Agent Skills — no monolithic scripts.
