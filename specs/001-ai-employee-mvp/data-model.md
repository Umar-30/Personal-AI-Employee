# Data Model: Local AI Employee MVP (Bronze Tier)

**Branch**: `001-ai-employee-mvp` | **Date**: 2026-02-15

## Entities

### 1. TaskFile

A markdown file with YAML frontmatter representing a unit of work.

**Location**: `/Inbox` → `/Needs_Action` → `/Done`

**Frontmatter schema**:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| type | enum: `file_drop`, `email`, `whatsapp` | yes | `file_drop` | Source channel |
| source | string | yes | `"local"` | Origin identifier |
| priority | enum: `low`, `medium`, `high` | yes | `medium` | Processing priority |
| status | enum: `pending`, `in_progress`, `done`, `failed` | yes | `pending` | Current state |
| created | ISO 8601 datetime | yes | (auto) | Creation timestamp |

**Body**: Free-form markdown describing the task objective.

**Filename convention**: `<slug>.md` — e.g., `summarize-meeting-notes.md`

**State transitions**:
```
[created in /Inbox]
    → (watcher validates) → /Needs_Action (status: pending)
    → (planner reads) → status: in_progress
    → (executor completes) → /Done (status: done)
    → (executor fails) → /Done (status: failed)
```

### 2. PlanFile

A markdown file containing checkbox steps for executing a task.

**Location**: `/Plans/`

**Filename convention**: `PLAN_<task-slug>.md`

**Structure**:

| Field | Type | Description |
|-------|------|-------------|
| title | string | Plan title (matches task) |
| taskRef | string | Filename of originating task |
| riskLevel | enum: `safe`, `sensitive` | Overall risk assessment |
| created | ISO 8601 datetime | Plan creation timestamp |
| steps | checkbox list | Ordered execution steps |

**Step format**:
```markdown
- [ ] Step 1: <description> [safe]
- [ ] Step 2: <description> [sensitive → approval required]
- [x] Step 3: <description> [safe] ✅ completed 2026-02-15T10:30:00Z
```

**State**: A plan is complete when all checkboxes are checked.

### 3. ApprovalRequest

A structured markdown file describing a sensitive action awaiting human decision.

**Location**: `/Pending_Approval/` → `/Approved/` or `/Rejected/`

**Filename convention**: `APPROVAL_<task-slug>_<step-number>.md`

**Structure**:

| Field | Type | Description |
|-------|------|-------------|
| taskRef | string | Originating task filename |
| planRef | string | Originating plan filename |
| stepNumber | number | Which step requires approval |
| action | string | Description of the action |
| riskLevel | string | Why this is sensitive |
| impact | string | Expected impact of execution |
| created | ISO 8601 datetime | Request timestamp |

**Body**: Clear human-readable description with "Move this file to /Approved to proceed or /Rejected to skip."

### 4. LogEntry

A JSON object appended as one line in a daily JSONL file.

**Location**: `/Logs/YYYY-MM-DD.json`

**Schema**:

| Field | Type | Description |
|-------|------|-------------|
| timestamp | ISO 8601 datetime | When the action occurred |
| level | enum: `info`, `warn`, `error` | Log severity |
| action | string | Action identifier (e.g., `task_intake`, `plan_created`, `step_executed`) |
| taskRef | string or null | Related task filename |
| detail | string | Human-readable description |
| outcome | enum: `success`, `failure`, `skipped` | Action result |
| error | string or null | Error message if failure |

### 5. Dashboard

A single markdown file showing system state.

**Location**: `/Dashboard.md` (vault root)

**Regenerated**: On every state change (not incremental — full rewrite).

**Sections**: Folder counts table, recent activity list (last 10 entries from today's log).

## Relationships

```
TaskFile (1) ──creates──> (1) PlanFile
PlanFile (1) ──may create──> (0..N) ApprovalRequest
TaskFile (1) ──logs──> (1..N) LogEntry
PlanFile (1) ──logs──> (1..N) LogEntry
ApprovalRequest (1) ──logs──> (1..N) LogEntry
All entities ──update──> (1) Dashboard
```

## Validation Rules

- TaskFile frontmatter MUST contain all required fields or defaults are applied.
- PlanFile MUST reference an existing TaskFile by filename.
- ApprovalRequest MUST reference both a TaskFile and PlanFile.
- LogEntry `taskRef` MAY be null for system-level events (startup, shutdown).
- Dashboard MUST NOT be manually edited — it is always overwritten by the system.
