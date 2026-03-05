# Feature Specification: Silver Tier Multi-Tool Assistant

**Feature Branch**: `002-silver-tier-assistant`
**Created**: 2026-02-16
**Status**: Draft
**Input**: User description: "Upgrade Bronze system into a multi-domain autonomous assistant with multi-watchers, MCP integration, human-in-the-loop approvals, scheduled automation, and LinkedIn sales posting."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Multi-Source Task Ingestion via Watchers (Priority: P1)

The system monitors multiple input sources simultaneously. Beyond the existing file-drop watcher (Bronze), three additional watchers — Gmail, LinkedIn, and WhatsApp — detect new inputs, convert them into structured task files with unified metadata, and place them in `/Needs_Action` for processing through the existing Bronze pipeline.

**Why this priority**: Multi-source ingestion is the foundational upgrade from Bronze. Without it, the system remains a single-channel file-drop tool. Every other Silver capability depends on tasks arriving from diverse sources.

**Independent Test**: Configure the Gmail, LinkedIn, and WhatsApp watchers. Send a test email, a test LinkedIn message, and a WhatsApp message. Verify that within the polling interval, all three inputs appear as structured task files in `/Needs_Action` with correct metadata (source, type, priority, timestamps).

**Acceptance Scenarios**:

1. **Given** a new email arrives in the monitored Gmail inbox, **When** the Gmail watcher polls and detects it, **Then** a task file is created in `/Needs_Action` with frontmatter fields: `type: email`, `source: gmail`, `priority: medium`, `status: pending`, `created: <timestamp>`, and the email subject/body in the markdown content.
2. **Given** a new LinkedIn message or notification arrives, **When** the LinkedIn watcher polls and detects it, **Then** a task file is created in `/Needs_Action` with frontmatter fields: `type: linkedin_message`, `source: linkedin`, `priority: medium`, `status: pending`, and message content in the body.
3. **Given** a new WhatsApp message arrives on the monitored number, **When** the WhatsApp watcher polls the Green API and detects it, **Then** a task file is created in `/Needs_Action` with frontmatter fields: `type: whatsapp_message`, `source: whatsapp`, `priority: high`, `status: pending`, `created: <timestamp>`, sender number, and message text in the body.
4. **Given** a WhatsApp message contains a keyword (e.g., "invoice", "urgent", "payment"), **When** the watcher detects it, **Then** the task file is created with `priority: high` and the keyword is flagged in the frontmatter.
5. **Given** multiple watchers detect new inputs at overlapping times, **When** all create task files, **Then** each task file has a unique slug and no data is lost or overwritten.
6. **Given** a watcher encounters a connection error (e.g., expired token, Green API unavailable), **When** the polling cycle fails, **Then** the error is logged to `/Logs/`, the watcher retries on the next cycle, and an alert file is created in the vault.

---

### User Story 2 — MCP-Powered External Action Execution (Priority: P2)

The system integrates with at least one MCP (Model Context Protocol) server to execute real external actions — sending emails, posting content, reading calendar events, etc. Claude reasons about the task, creates a plan, and when a step requires an external action, invokes the appropriate MCP tool. All MCP interactions are logged to the vault.

**Why this priority**: MCP integration transforms the system from a local reasoning engine into one that acts on the real world. Without it, plans can be created but never executed externally.

**Independent Test**: Create a task requesting "send a follow-up email to client X." Verify the system creates a plan, routes the send step through HITL approval, and upon approval, invokes the email MCP server to send the email. Confirm the MCP response is logged.

**Acceptance Scenarios**:

1. **Given** a plan step requires sending an email, **When** the step is approved and executed, **Then** the system calls the email MCP server with the correct recipient, subject, and body, and logs the MCP response (success/failure, message ID) to `/Logs/`.
2. **Given** an MCP server is unreachable, **When** the system attempts to call it, **Then** it retries with exponential backoff (max 3 attempts), logs the failure, and marks the plan step as `failed` with an error description.
3. **Given** an MCP call returns an error response, **When** the system processes the error, **Then** it logs the full error details, does not retry for non-transient errors, and surfaces the failure in `Dashboard.md`.
4. **Given** DRY_RUN mode is active, **When** the system would invoke an MCP action, **Then** it logs the intended action without executing it and marks the step as `dry_run_skipped`.

---

### User Story 3 — Scheduled Automation and Daily Briefing (Priority: P3)

The system supports scheduled jobs that run at defined intervals. At minimum: a daily briefing that summarizes pending tasks, completed work, and upcoming priorities; and a scheduled LinkedIn posting workflow. Scheduling uses the OS-native scheduler (Task Scheduler on Windows, cron on Mac/Linux).

**Why this priority**: Scheduling elevates the system from reactive (wait for file drops) to proactive (initiate work autonomously). The daily briefing delivers immediate, recurring value.

**Independent Test**: Configure a daily briefing schedule. Wait for the scheduled trigger. Verify a briefing file is generated at `/Briefings/YYYY-MM-DD_Daily_Briefing.md` with accurate task counts, highlights from `/Done`, and pending items from `/Needs_Action`.

**Acceptance Scenarios**:

1. **Given** the daily briefing schedule triggers, **When** the system executes, **Then** it scans all vault folders, generates a structured briefing at `/Briefings/YYYY-MM-DD_Daily_Briefing.md`, and updates `Dashboard.md`.
2. **Given** a LinkedIn post is scheduled for a specific time, **When** the schedule triggers, **Then** the system generates the post content, saves a draft to `/Plans/`, routes it through HITL approval, and upon approval publishes via MCP.
3. **Given** a scheduled job fails (e.g., system was offline at trigger time), **When** the system next starts, **Then** it detects the missed schedule and runs the overdue job immediately.

---

### User Story 4 — LinkedIn Sales Content Generation and Posting (Priority: P4)

The system generates sales-oriented LinkedIn content based on business goals, recent achievements, and industry context. It creates draft posts, saves them for review, and publishes approved posts via MCP or the automation layer. Posts follow a consistent brand voice defined in `Company_Handbook.md`.

**Why this priority**: LinkedIn posting is a specific, high-value use case that demonstrates the full Silver pipeline: scheduled trigger → content generation → HITL approval → MCP execution.

**Independent Test**: Create a task requesting "generate a LinkedIn post about our Q1 results." Verify a draft post is created in `/Plans/`, an approval request is generated in `/Pending_Approval/`, and upon approval the post is published via the LinkedIn MCP integration.

**Acceptance Scenarios**:

1. **Given** a LinkedIn post task is created (manually or via schedule), **When** the system processes it, **Then** it reads `Business_Goals.md` and `Company_Handbook.md`, generates a sales-oriented post draft, and saves it as a plan step in `/Plans/`.
2. **Given** a LinkedIn post draft is generated, **When** it enters the approval workflow, **Then** the approval file in `/Pending_Approval/` contains the full post text, target audience context, and suggested posting time.
3. **Given** a LinkedIn post is approved, **When** the system executes the publish step, **Then** it calls the LinkedIn MCP server, logs the post URL/ID, and moves the task to `/Done`.
4. **Given** a LinkedIn post is rejected, **When** the user moves the approval file to `/Rejected/`, **Then** the system logs the rejection reason (if provided) and archives the draft without publishing.

---

### User Story 5 — Enhanced Human-in-the-Loop for Multi-Domain Actions (Priority: P5)

The existing Bronze HITL workflow is extended to cover all new action types introduced in Silver: email sending, LinkedIn posting, calendar modifications, and any other MCP-mediated external actions. The approval flow remains file-based (`/Pending_Approval → /Approved → Execute → /Done`) with no bypass allowed.

**Why this priority**: HITL is already implemented in Bronze. Silver extends its coverage to new domains but the mechanism is the same, making this lower risk.

**Independent Test**: Trigger tasks across all Silver domains (email, LinkedIn, scheduled actions). Verify every external action generates an approval request before execution. Confirm that no MCP action executes without a corresponding approved file.

**Acceptance Scenarios**:

1. **Given** any MCP action is about to execute, **When** the action is classified as sensitive, **Then** an approval file is created containing: action type, MCP server target, payload summary, risk level, and estimated impact.
2. **Given** the system encounters a new action type not in the sensitivity classification, **When** it cannot determine risk, **Then** it defaults to requiring approval (fail-safe).
3. **Given** multiple approval requests are pending simultaneously, **When** the user approves them in any order, **Then** the system processes each approval independently and executes actions in approval order.

---

### Edge Cases

- What happens when a watcher's authentication token expires mid-operation? The system MUST log the failure, create an alert file, and continue operating other watchers.
- What happens when an MCP server returns a rate-limit response? The system MUST respect the rate limit, log the event, and retry after the specified cooldown period.
- What happens when a scheduled job and a manual task trigger the same MCP action simultaneously? The system MUST process them sequentially to prevent duplicate external actions.
- What happens when LinkedIn's API rejects a post (content policy, length, etc.)? The system MUST log the rejection reason, notify via an alert file, and keep the draft for user revision.
- What happens when multiple watchers produce conflicting tasks from the same source event? The system MUST deduplicate based on source ID and timestamp.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support three active watchers — Gmail, LinkedIn, and WhatsApp — running concurrently alongside the existing Bronze file-drop watcher.
- **FR-002**: Each watcher MUST produce task files with a unified metadata schema: `type`, `source`, `priority`, `status`, `created`, `source_id` (for deduplication).
- **FR-003**: System MUST integrate with Gmail MCP as the primary server for email send/read actions, LinkedIn MCP as secondary for post publishing, and Green API as the WhatsApp integration layer.
- **FR-003a**: WhatsApp watcher MUST use Green API (REST-based) to poll for new messages — no Playwright/browser automation.
- **FR-003b**: WhatsApp keyword detection MUST elevate task priority to `high` for messages containing: "invoice", "urgent", "payment", "asap", "help".
- **FR-004**: All MCP calls MUST be logged to `/Logs/` with: server name, action type, payload summary, response status, and timestamp.
- **FR-005**: System MUST route ALL sensitive MCP actions through the HITL approval workflow with no bypass mechanism.
- **FR-006**: System MUST support OS-native scheduled job triggers for recurring tasks (daily briefing, LinkedIn posting).
- **FR-007**: System MUST generate daily briefing files at `/Briefings/YYYY-MM-DD_Daily_Briefing.md` summarizing vault state.
- **FR-008**: System MUST generate sales-oriented LinkedIn post drafts based on business goals and company handbook context.
- **FR-009**: System MUST save LinkedIn drafts for human review before publishing via MCP.
- **FR-010**: System MUST handle MCP server errors gracefully: retry transient errors (max 3 attempts, exponential backoff), log non-transient errors, and surface failures in `Dashboard.md`.
- **FR-011**: System MUST deduplicate incoming tasks from watchers using source-specific identifiers to prevent processing the same input twice.
- **FR-012**: System MUST respect `DRY_RUN` mode for all MCP actions, logging intended actions without executing them.
- **FR-013**: System MUST create alert files in the vault when watcher authentication fails or MCP servers become unreachable.
- **FR-014**: All Bronze functionality (file-drop watcher, vault workflow, plan execution, dashboard, logging) MUST remain fully operational.
- **FR-015**: Silver MUST import and extend Bronze base classes (watchers, skills, pipeline) rather than duplicating code.

### Key Entities

- **Watcher**: A polling or event-driven module that monitors an external source and produces task files. Key attributes: source type, polling interval, authentication state, last-checked timestamp.
- **WhatsApp Watcher**: Polls the Green API REST endpoint at configurable intervals to detect new incoming messages. Key attributes: Green API instance ID, API token, polling interval (default 30s), processed message ID set (deduplication), keyword filter list.
- **MCP Server**: An external service endpoint accessed via the Model Context Protocol. Key attributes: server name, supported actions, connection configuration, health status.
- **Scheduled Job**: A recurring task triggered by the OS scheduler. Key attributes: job name, schedule expression, target action, last-run timestamp, next-run timestamp.
- **LinkedIn Post Draft**: A content artifact generated for LinkedIn publishing. Key attributes: post text, target audience, suggested posting time, approval status, publish result.
- **Alert File**: A vault file created when the system encounters an operational issue requiring user attention (e.g., expired tokens, unreachable services, Green API down).

## Clarifications

### Session 2026-02-16

- Q: Which two specific watchers should Silver implement? → A: Gmail + LinkedIn
- Q: Project structure for Silver code? → A: All Silver source code lives under `silver/src/`, tests under `silver/tests/` (parallel to `bronze/`)
- Q: How should Silver relate to Bronze code? → A: Silver imports and extends Bronze base classes (shared code, no duplication)
- Q: Which MCP server should be the primary integration? → A: Gmail MCP as primary (email send/read); LinkedIn MCP as secondary for posting

### Session 2026-02-19

- Q: Should WhatsApp replace LinkedIn or be added alongside Gmail + LinkedIn? → A: Add WhatsApp alongside — Gmail + LinkedIn + WhatsApp (3 watchers total in Silver)
- Q: Which WhatsApp integration approach? → A: Green API (REST-based) — no Playwright/browser automation, stable production approach

## Assumptions

- The user has valid credentials (API keys, OAuth tokens) for all external services (Gmail, LinkedIn, WhatsApp via Green API, etc.) stored securely in environment variables.
- Gmail MCP server is the primary integration; LinkedIn MCP server is secondary; Green API is used for WhatsApp (REST-based, requires a registered Green API instance with an active WhatsApp session).
- Green API credentials (`GREEN_API_INSTANCE_ID`, `GREEN_API_TOKEN`) are stored in environment variables — never in vault files.
- The OS scheduler (Windows Task Scheduler or cron) is accessible and the user has permissions to create scheduled tasks.
- LinkedIn's content policies and API rate limits are respected; the system does not attempt to circumvent platform restrictions.
- The Bronze tier codebase (`bronze/src/`) is stable and its interfaces (watcher base class, skill registry, pipeline stages) are extensible without modification.
- All Silver source code lives under `silver/src/` and tests under `silver/tests/`, parallel to the `bronze/` folder structure.
- Silver imports and extends Bronze modules directly (e.g., `BaseSkill`, watcher patterns, pipeline stages) — no code duplication between tiers.
- Only one instance of the AI Employee runs at a time (inherited from Bronze — no multi-agent concurrency).
- The `Company_Handbook.md` contains brand voice guidelines that inform LinkedIn content generation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tasks from at least three distinct external sources (Gmail, LinkedIn, WhatsApp — beyond file-drop) appear in `/Needs_Action` within 60 seconds of the source event.
- **SC-002**: At least one MCP server is integrated and successfully executes real external actions (e.g., email sent, post published) end-to-end.
- **SC-003**: 100% of sensitive external actions are routed through HITL approval — zero unauthorized MCP executions.
- **SC-004**: A daily briefing file is automatically generated at the scheduled time with accurate vault state summaries.
- **SC-005**: A LinkedIn sales post can be generated, reviewed, approved, and published through the full pipeline within a single workflow cycle.
- **SC-006**: All MCP interactions (success and failure) are logged with sufficient detail for audit and debugging.
- **SC-007**: Watcher failures (auth expiry, network errors) are detected, logged, and surfaced to the user within one polling cycle.
- **SC-008**: All Bronze functionality continues to operate correctly with no regressions.
