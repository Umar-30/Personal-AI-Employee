# Research: Silver Tier Multi-Tool Assistant

**Date**: 2026-02-16 | **Branch**: `002-silver-tier-assistant`

## R1: Gmail MCP Server

**Decision**: Use `@gongrzhe/server-gmail-mcp` as the Gmail MCP server.

**Rationale**: Most mature option with auto-authentication support, comprehensive email operations (send, read, draft, search, labels, attachments), OAuth2 authentication, and npm availability. Supports both Desktop and Web application credentials.

**Alternatives considered**:
- `@shinzolabs/gmail-mcp` — solid but fewer features (no batch ops)
- `@pegasusheavy/google-mcp` — broader Google suite but heavier dependency
- `@monsoft/mcp-gmail` — batch operations support but less community adoption

**Authentication**: Google OAuth2 with `credentials.json` + auto-generated `token.json`. Requires a Google Cloud project with Gmail API enabled.

**Install**: `npx @gongrzhe/server-gmail-mcp` or add to MCP config.

## R2: LinkedIn MCP Server

**Decision**: Use `linkedin-mcp-server` npm package for LinkedIn posting and profile access.

**Rationale**: Purpose-built for LinkedIn with text post creation, image posts, and profile retrieval. Supports OAuth 2.0 with automatic token refresh. Enforces LinkedIn content policies (3000 char limit, 10 mentions max, rate limiting).

**Alternatives considered**:
- `@felipfr/linkedin-mcpserver` — GitHub-only, broader features but less stable
- `@lurenss/linkedin-mcp` — TypeScript/Node.js, supports Claude Desktop but newer/less tested
- Custom wrapper around LinkedIn REST API — more control but more work

**Authentication**: LinkedIn OAuth 2.0 with client ID + client secret. Requires LinkedIn Developer App with `w_member_social` scope for posting.

**Install**: `npm i linkedin-mcp-server` or run via npx.

**Constraints**: Rate limited to 1 post/minute, 100 posts/day.

## R3: MCP SDK for TypeScript Client

**Decision**: Use `@modelcontextprotocol/sdk` as the MCP client library.

**Rationale**: Official TypeScript SDK implementing full MCP specification. Provides `Client` class and `StdioClientTransport` for connecting to MCP servers as subprocesses. Required peer dependency on `zod` for schema validation.

**Install**: `npm install @modelcontextprotocol/sdk zod`

**Client pattern**:
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "npx", args: ["@gongrzhe/server-gmail-mcp"] });
const client = new Client({ name: "ai-employee", version: "1.0.0" });
await client.connect(transport);
const result = await client.callTool({ name: "send_email", arguments: { to, subject, body } });
```

## R4: Watcher Architecture for Gmail/LinkedIn

**Decision**: Create an abstract `BaseWatcher` class in Silver that both `GmailWatcher` and `LinkedInWatcher` extend. Each watcher polls its source at a configurable interval, converts inputs to task files, and places them in `/Needs_Action`.

**Rationale**: The Bronze `InboxWatcher` uses chokidar (filesystem events). Gmail and LinkedIn require API polling instead. A common `BaseWatcher` interface ensures all watchers share the same lifecycle (start/stop) and output contract (task files with unified frontmatter).

**Polling approach**: Gmail uses the Gmail API `messages.list` with `after:` timestamp filter. LinkedIn uses the LinkedIn messaging/notifications API. Both track `lastChecked` to avoid re-processing.

## R5: Scheduling Approach

**Decision**: Use Windows Task Scheduler (primary target) with a scheduler helper script that creates/manages scheduled tasks via `schtasks.exe`. Provide cron equivalent for Mac/Linux.

**Rationale**: OS-native schedulers are the most reliable for periodic execution. The AI Employee daemon itself doesn't need to stay running for scheduled jobs — the scheduler invokes a lightweight script that drops a task file into `/Inbox` (e.g., "generate daily briefing"), which the daemon then processes normally.

**Pattern**: Scheduled jobs create trigger files in `/Inbox` with frontmatter `type: scheduled`, `source: scheduler`. The daemon's existing pipeline handles them like any other task.

## R6: Silver/Bronze Code Relationship

**Decision**: Silver imports Bronze modules directly via relative paths (e.g., `../../bronze/src/models/task-file`). TypeScript path aliases configured in `tsconfig.json` to simplify imports.

**Rationale**: Avoids code duplication. Silver extends Bronze's `BaseSkill`, uses its `Logger`, `TaskFile`, `PlanFile` models, and `SkillRegistry`. The frontmatter types need extending (adding `linkedin_message`, `scheduled` etc.) — Silver exports extended types.
