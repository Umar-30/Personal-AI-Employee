# Data Model: Silver Tier Multi-Tool Assistant

**Date**: 2026-02-16 | **Branch**: `002-silver-tier-assistant`

## Entity: Extended Task Frontmatter

Extends Bronze `TaskFrontmatter` with new types and source tracking.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `TaskType` | yes | `file_drop` \| `email` \| `linkedin_message` \| `linkedin_post` \| `scheduled` |
| source | string | yes | Origin identifier: `local`, `gmail`, `linkedin`, `scheduler` |
| priority | `Priority` | yes | `low` \| `medium` \| `high` |
| status | `TaskStatus` | yes | `pending` \| `in_progress` \| `done` \| `failed` |
| created | string (ISO) | yes | Creation timestamp |
| source_id | string \| null | no | External dedup ID (Gmail message ID, LinkedIn notification ID) |

**State transitions**: `pending` → `in_progress` → `done` \| `failed`

## Entity: MCP Action Log Entry

Extends Bronze `LogEntry` with MCP-specific fields.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| timestamp | string (ISO) | yes | When the action occurred |
| level | `LogLevel` | yes | `info` \| `warn` \| `error` |
| action | string | yes | Action identifier (e.g., `mcp_call`, `mcp_response`) |
| taskRef | string \| null | no | Associated task filename |
| detail | string | yes | Human-readable description |
| outcome | `LogOutcome` | yes | `success` \| `failure` \| `skipped` |
| error | string \| null | no | Error message if failed |
| mcpServer | string \| null | no | MCP server name (e.g., `gmail`, `linkedin`) |
| mcpTool | string \| null | no | MCP tool called (e.g., `send_email`, `create_post`) |
| mcpPayload | string \| null | no | Summarized request payload |
| mcpResponseStatus | string \| null | no | MCP response status |

## Entity: Watcher State

Tracks polling state for each external watcher.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| source | string | yes | `gmail` \| `linkedin` |
| lastChecked | string (ISO) | yes | Timestamp of last successful poll |
| status | string | yes | `active` \| `error` \| `stopped` |
| errorCount | number | yes | Consecutive error count (resets on success) |
| lastError | string \| null | no | Most recent error message |

**Persistence**: Stored as JSON in vault at `/Logs/watcher-state.json`.

## Entity: Scheduled Job Definition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Job identifier (e.g., `daily-briefing`, `linkedin-post`) |
| schedule | string | yes | OS scheduler expression |
| taskTemplate | object | yes | Frontmatter + body template for the task file dropped into `/Inbox` |
| enabled | boolean | yes | Whether the job is active |

**Persistence**: Defined in config (env vars or config file). The OS scheduler triggers a script that creates the task file.

## Entity: LinkedIn Post Draft

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| postText | string | yes | The post content (max 3000 chars) |
| targetAudience | string | no | Audience description for context |
| suggestedTime | string (ISO) | no | Recommended posting time |
| businessContext | string | no | Which business goal this supports |
| approvalStatus | string | yes | `draft` \| `pending_approval` \| `approved` \| `rejected` \| `published` |
| publishResult | object \| null | no | MCP response after publishing (post URL, ID) |

**Persistence**: Embedded in plan file steps. Draft text included in approval request file.

## Entity: Alert File

| Field (frontmatter) | Type | Required | Description |
|---------------------|------|----------|-------------|
| type | string | yes | `auth_failure` \| `mcp_unreachable` \| `rate_limit` \| `content_rejected` |
| source | string | yes | Which service triggered the alert |
| created | string (ISO) | yes | When the alert was created |
| resolved | boolean | yes | Whether the issue has been addressed |

**Body**: Human-readable description of the issue, recommended action.

**Location**: Vault root or `/Logs/alerts/`.

## Relationships

```
Watcher (Gmail/LinkedIn) → creates → TaskFile (in /Needs_Action)
TaskFile → processed by → Planner → creates → PlanFile (in /Plans)
PlanFile step → may invoke → MCP Server (via MCP Client)
PlanFile sensitive step → creates → ApprovalRequest (in /Pending_Approval)
MCP call → logged as → MCP Action Log Entry (in /Logs)
Watcher error → creates → Alert File
Scheduled Job → creates → TaskFile (in /Inbox, via OS scheduler script)
```
