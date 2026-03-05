# Skill Interface Contract

**Branch**: `001-ai-employee-mvp` | **Date**: 2026-02-15

## BaseSkill Interface

Every Agent Skill MUST implement this interface.

### Methods

#### `canHandle(task: TaskFile): boolean`

Determines if this skill can process the given task.

**Input**: A parsed TaskFile object (frontmatter + body).
**Output**: `true` if this skill should handle the task, `false` otherwise.
**Rules**:
- MUST be pure (no side effects).
- MUST return in < 10ms.
- Multiple skills may return `true` — the registry uses priority ordering.

#### `execute(task: TaskFile, context: ExecutionContext): Promise<SkillResult>`

Executes the skill's logic for the given task.

**Input**:
- `task` — Parsed TaskFile
- `context` — Execution context containing vault paths, logger, Claude client, dry-run flag

**Output**: `SkillResult` object:

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether execution succeeded |
| output | string | Result summary (written to plan step) |
| filesCreated | string[] | Paths of any new files created |
| filesModified | string[] | Paths of any modified files |
| requiresApproval | boolean | If true, execution halts for approval |
| approvalReason | string or null | Why approval is needed |
| error | string or null | Error message if failed |

**Rules**:
- MUST respect `context.dryRun` — if true, simulate without side effects.
- MUST log actions via `context.logger`.
- MUST NOT throw unhandled exceptions — return `{ success: false, error }` instead.
- MUST NOT access files outside the vault.

### ExecutionContext

| Field | Type | Description |
|-------|------|-------------|
| vaultRoot | string | Absolute path to vault root |
| logger | Logger | Structured logger instance |
| claudeClient | ClaudeClient | Claude Code CLI wrapper |
| dryRun | boolean | If true, simulate only |
| handbook | string or null | Contents of Company_Handbook.md if exists |
| goals | string or null | Contents of Business_Goals.md if exists |

## SkillRegistry

### `register(skill: BaseSkill, priority: number): void`

Registers a skill with a numeric priority (lower = higher priority).

### `dispatch(task: TaskFile, context: ExecutionContext): Promise<SkillResult>`

Finds the first matching skill (by priority order) and executes it.

**Rules**:
- If no skill matches → returns `{ success: false, error: "No skill found for task" }`.
- Only one skill executes per task dispatch.

## Built-in Skills (MVP)

| Skill | Priority | Handles | Safe/Sensitive |
|-------|----------|---------|----------------|
| SummarizeSkill | 10 | Tasks requesting text summarization | Safe |
| DraftEmailSkill | 20 | Tasks requesting email drafts | Safe (drafts only) |
| DashboardSkill | 100 | Internal dashboard regeneration | Safe |
| GenericReasoningSkill | 999 | Fallback — sends task to Claude Code for open-ended reasoning | Safe |
