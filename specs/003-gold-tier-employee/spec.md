# Feature Specification: Gold Tier Autonomous Business Employee

**Feature Branch**: `003-gold-tier-employee`
**Created**: 2026-02-16
**Status**: Draft
**Input**: User description: "Upgrade Silver system into a cross-domain autonomous business employee with accounting intelligence, weekly executive briefing, and production-grade reliability."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Odoo Accounting Integration (Priority: P1)

The system connects to a self-hosted Odoo Community instance to read financial data, create draft invoices, and draft accounting entries. All financial write actions require human approval before posting. The system logs every financial interaction for audit compliance.

**Why this priority**: Accounting intelligence is the core differentiator of the Gold tier. It transforms the system from a communications assistant into a business operations partner. Financial data feeds directly into the CEO briefing (US3).

**Independent Test**: Create a task requesting "create an invoice for Client X, $5,000 for consulting services." Verify the system drafts the invoice in Odoo (not posted), creates an approval request in `/Pending_Approval` with full invoice details, and upon approval posts the invoice to Odoo. Confirm all actions are logged.

**Acceptance Scenarios**:

1. **Given** a task requesting invoice creation, **When** the system processes it, **Then** it creates a draft invoice in Odoo via the Odoo MCP server, saves the invoice details in the plan file, and creates an approval request in `/Pending_Approval` with: invoice number, customer, line items, total amount, and tax breakdown.
2. **Given** an approved invoice posting request, **When** the user moves the approval file to `/Approved`, **Then** the system posts the invoice in Odoo, logs the posting result (invoice ID, status), and moves the task to `/Done`.
3. **Given** a task requesting "show outstanding invoices," **When** the system processes it, **Then** it queries Odoo for unpaid invoices and generates a summary report in the vault without requiring approval (read-only action).
4. **Given** a financial write action fails in Odoo (e.g., validation error), **When** the error is returned, **Then** the system logs the full error, creates an alert file, and does not retry financial writes automatically (requires human review).

---

### User Story 2 — Multi-Platform Social Media Posting and Monitoring (Priority: P2)

The system generates and publishes content across Facebook, Instagram, and Twitter/X in addition to the existing LinkedIn capability. Each platform has tailored content formatting. All social posts require human approval. The system also monitors Facebook for incoming messages and comments via a Facebook Watcher, converting them into actionable tasks in `/Needs_Action`. The system can generate engagement summaries from platform analytics.

**Why this priority**: Expands the Silver LinkedIn-only posting to a full social media management capability, increasing the system's value as a business operations tool. The Facebook Watcher closes the feedback loop — publish content AND monitor responses.

**Independent Test 1 (Posting)**: Create a task requesting "post about our new product launch across all social platforms." Verify the system generates platform-specific drafts (Facebook long-form, Instagram visual caption, Twitter concise), creates approval requests for each, and upon approval publishes via respective platform integrations.

**Independent Test 2 (Facebook Watcher)**: Send a message to the monitored Facebook Page. Verify the Facebook Watcher detects it within the polling interval and creates a task file in `/Needs_Action` with `source: facebook`, `type: facebook_message`, and message content.

**Acceptance Scenarios**:

1. **Given** a social media posting task, **When** the system processes it, **Then** it generates platform-specific content for each target platform (respecting character limits: Twitter 280 chars, Instagram 2200 chars, Facebook 63,206 chars), saves drafts in the plan file, and creates one approval request per platform.
2. **Given** an approved social media post, **When** the system publishes it, **Then** it calls the appropriate platform integration, logs the post URL/ID, and moves the task to `/Done`.
3. **Given** a new message or comment arrives on the monitored Facebook Page, **When** the Facebook Watcher polls the Graph API and detects it, **Then** a task file is created in `/Needs_Action` with frontmatter: `type: facebook_message`, `source: facebook`, `priority: medium`, `status: pending`, `created: <timestamp>`, sender ID, and message text.
4. **Given** a Facebook message contains a business keyword (e.g., "price", "order", "inquiry"), **When** detected by the watcher, **Then** the task priority is elevated to `high`.
5. **Given** a request for engagement summaries, **When** the system processes it, **Then** it retrieves analytics from each platform and generates a consolidated summary report in the vault.
6. **Given** a platform rejects a post (content policy, rate limit), **When** the error occurs, **Then** the system logs the rejection reason, creates an alert file, and keeps the draft for user revision.

---

### User Story 3 — Weekly CEO Briefing (Priority: P3)

Every Sunday, the system autonomously generates a comprehensive Monday Morning CEO Briefing. The briefing analyzes business goals, bank transactions, completed work, and accounting data to provide revenue summaries, bottleneck identification, subscription audits, risk assessments, and proactive recommendations.

**Why this priority**: The CEO briefing is the flagship autonomous feature of the Gold tier. It synthesizes data from all integrated systems (vault, Odoo, social media) into executive-level intelligence.

**Independent Test**: Trigger the Sunday scheduler. Verify a briefing file is generated at `/Briefings/YYYY-MM-DD_Monday_Briefing.md` containing all required sections with data sourced from `Business_Goals.md`, `Bank_Transactions.md`, `/Done`, and Odoo financial data.

**Acceptance Scenarios**:

1. **Given** the Sunday scheduled trigger fires, **When** the system generates the briefing, **Then** the output file at `/Briefings/YYYY-MM-DD_Monday_Briefing.md` contains: revenue summary (from Odoo/bank data), bottleneck analysis (from pending tasks), subscription audit (from recurring transactions), risk assessment, and at least 3 proactive recommendations.
2. **Given** `Bank_Transactions.md` has new entries since the last briefing, **When** the system processes them, **Then** the revenue summary accurately reflects income vs. expenses for the week.
3. **Given** Odoo is temporarily unreachable during briefing generation, **When** the system encounters the error, **Then** it generates the briefing with available data, marks the Odoo section as "Data unavailable — Odoo offline", and logs the issue.
4. **Given** no tasks were completed during the week, **When** the briefing generates, **Then** it flags low productivity as a bottleneck and recommends reviewing task priorities.

---

### User Story 4 — Ralph Wiggum Persistence Loop (Priority: P4)

The system implements a persistence mechanism that prevents premature task termination. Once a task enters execution, the system continues iterating until a defined completion condition is met (all plan checkboxes resolved, files moved to `/Done`, completion promise emitted). The loop detects file-based completion signals and supports the Ralph Wiggum plugin pattern.

**Why this priority**: Persistence is a cross-cutting reliability concern. Without it, complex multi-step tasks (like generating briefings or processing financial data) may fail silently mid-execution.

**Independent Test**: Start a multi-step task with 5 plan steps. Simulate a transient failure on step 3. Verify the system retries, continues past step 3, and completes all 5 steps without human intervention.

**Acceptance Scenarios**:

1. **Given** a task with an incomplete plan (unchecked steps), **When** the execution loop runs, **Then** it continues processing until all steps are completed, approved, or explicitly failed.
2. **Given** a transient error occurs mid-task, **When** the error is detected, **Then** the system retries with backoff, re-evaluates the plan, and adjusts steps if needed before continuing.
3. **Given** a task has been running for an extended period without progress, **When** the watchdog detects no state change for a configurable timeout, **Then** it creates an alert file and logs the stall, but does NOT terminate the task.
4. **Given** a completion signal file is detected (e.g., task file moved to `/Done`), **When** the loop checks, **Then** it recognizes the completion and cleanly exits the persistence loop.

---

### User Story 5 — Production-Grade Error Handling and Recovery (Priority: P5)

The system provides production-grade reliability with structured retry logic, graceful degradation when external services fail, a watchdog process for daemon health monitoring, PID file management, and structured logging. No action fails silently.

**Why this priority**: Reliability is essential for a system managing financial data and business communications. Silent failures in accounting or social media could have real business consequences.

**Independent Test**: Kill the daemon process mid-execution. Verify the watchdog detects the failure, restarts the daemon, and the daemon resumes incomplete tasks from the last checkpoint.

**Acceptance Scenarios**:

1. **Given** the daemon starts, **When** it initializes, **Then** it writes a PID file and the watchdog begins monitoring the process at regular intervals.
2. **Given** the daemon crashes unexpectedly, **When** the watchdog detects the PID is no longer running, **Then** it restarts the daemon process and logs the restart event.
3. **Given** an external service (Odoo, Gmail, LinkedIn, social platforms) becomes unreachable, **When** the system detects the failure, **Then** it continues operating other services (graceful degradation), creates an alert file, and retries the failed service on the next cycle.
4. **Given** any action occurs in the system, **When** it completes (success or failure), **Then** a structured log entry is written with: timestamp, actor, action, parameters, approval status, and result.

---

### User Story 6 — Enhanced Audit Logging (Priority: P6)

The system maintains immutable daily JSON audit logs at `/Logs/YYYY-MM-DD.json`. Every action — including financial operations, social media posts, approval decisions, watcher events, and MCP calls — is logged with a standardized schema. Logs support compliance auditing and incident investigation.

**Why this priority**: With financial data and social media access, audit logging is a compliance necessity. It builds on Bronze/Silver logging but adds immutability and a richer schema.

**Independent Test**: Process 10 different tasks across all domains (email, LinkedIn, Odoo, social, scheduled). Open the daily log file and verify each action has a complete audit entry with all required fields. Verify the log file cannot be silently modified (append-only pattern).

**Acceptance Scenarios**:

1. **Given** any action is taken by the system, **When** it is logged, **Then** the log entry contains: timestamp (ISO 8601), actor (system component or user), action type, input parameters summary, approval status (approved/rejected/not_required), and result (success/failure with details).
2. **Given** a financial action occurs, **When** it is logged, **Then** the entry includes additional fields: Odoo record ID, amount, currency, and approval chain reference.
3. **Given** the system starts a new day, **When** the first action occurs, **Then** a new daily log file is created (previous day's file is finalized).
4. **Given** an attempt to modify a past log entry, **When** the system detects it, **Then** it logs a tampering alert and preserves the original entry.

---

### Edge Cases

- What happens when Odoo is down during invoice creation? The system MUST queue the action, create an alert, and retry when Odoo becomes available (up to configurable max wait).
- What happens when a social media platform changes its content policy? The system MUST log the rejection, notify via alert, and preserve the draft for manual revision.
- What happens when the briefing scheduler triggers but no financial data is available? The system MUST generate a partial briefing with available data and flag missing sections.
- What happens when the watchdog and the daemon both crash? The OS scheduler MUST detect the watchdog failure and restart it (watchdog watches daemon, OS watches watchdog).
- What happens when the audit log file becomes very large? The system MUST create new files daily and never modify closed log files.
- What happens when multiple financial approval requests are pending? Each MUST be processed independently — approving one does not auto-approve others.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST integrate with a self-hosted Odoo Community instance for accounting operations (read invoices, create draft invoices, draft accounting entries).
- **FR-002**: All financial write operations in Odoo MUST require human approval before posting — no automatic financial posting.
- **FR-003**: System MUST log every financial action with: operation type, Odoo record ID, amount, currency, approval status, and result.
- **FR-004**: System MUST generate and publish content across Facebook, Instagram, and Twitter/X, in addition to the existing LinkedIn capability.
- **FR-004a**: System MUST include a Facebook Watcher that polls the Facebook Graph API for new Page messages and comments and creates task files in `/Needs_Action`.
- **FR-004b**: Facebook Watcher MUST use the Facebook Graph API (`/me/conversations`, `/me/feed`) with a Page Access Token stored in environment variables.
- **FR-004c**: Facebook Watcher MUST deduplicate messages using the Facebook message ID to prevent duplicate task files.
- **FR-005**: Each social media platform MUST receive platform-specific content formatted to its constraints (character limits, media requirements).
- **FR-006**: All social media posts MUST require human approval before publishing — one approval per platform per post.
- **FR-007**: System MUST autonomously generate a weekly CEO briefing every Sunday, output to `/Briefings/YYYY-MM-DD_Monday_Briefing.md`.
- **FR-008**: The CEO briefing MUST include: revenue summary, bottleneck analysis, subscription audit, risk assessment, and proactive recommendations.
- **FR-009**: The CEO briefing MUST source data from `Business_Goals.md`, `Bank_Transactions.md`, `/Done` folder, and Odoo financial data.
- **FR-010**: System MUST implement a persistence loop that prevents premature task termination — tasks continue until all completion conditions are met.
- **FR-011**: System MUST include a watchdog process that monitors daemon health via PID file and restarts the daemon on failure.
- **FR-012**: System MUST gracefully degrade when external services fail — continue operating available services while alerting about failed ones.
- **FR-013**: System MUST write immutable daily audit logs to `/Logs/YYYY-MM-DD.json` with standardized schema for every action.
- **FR-014**: Each audit log entry MUST contain: timestamp, actor, action, parameters, approval status, and result.
- **FR-015**: System MUST implement structured retry logic with exponential backoff for all external service calls (max configurable attempts).
- **FR-016**: All Silver functionality (Gmail/LinkedIn watchers, MCP integration, scheduling, HITL) MUST remain fully operational.
- **FR-017**: All Bronze functionality (file-drop watcher, vault workflow, plan execution, dashboard) MUST remain fully operational.

### Key Entities

- **Odoo Invoice**: A financial document created/read via the Odoo integration. Key attributes: invoice number, customer, line items, total amount, tax, currency, status (draft/posted/paid), Odoo record ID.
- **Odoo Accounting Entry**: A journal entry drafted via the Odoo integration. Key attributes: journal, date, debit/credit lines, reference, approval status.
- **Social Media Post**: A content artifact targeted at one or more platforms. Key attributes: platform, post text, media attachments, character count, approval status, publish result.
- **Facebook Watcher**: A polling module that monitors a Facebook Page for incoming messages and post comments via the Graph API. Key attributes: Page Access Token, polling interval (default 60s), processed message ID set (deduplication), keyword filter list.
- **CEO Briefing**: A weekly executive report synthesizing financial, operational, and strategic data. Key attributes: report date, revenue summary, bottleneck list, risk list, recommendations.
- **Watchdog**: A supervisor process that monitors daemon health. Key attributes: PID file path, check interval, restart count, last check timestamp.
- **Audit Log Entry**: A structured record of every system action. Key attributes: timestamp, actor, action, parameters, approval status, result, optional financial metadata.

## Clarifications

### Session 2026-02-19

- Q: Should Facebook Watcher (incoming messages/comments) be added to Gold? → A: Yes — Gold adds Facebook Watcher via Graph API to monitor Page messages and comments, creating tasks in `/Needs_Action`

## Assumptions

- Odoo Community v19+ is installed and accessible locally (same machine or LAN) with the accounting modules enabled.
- Odoo credentials (database, username, API key) are stored securely in environment variables.
- A custom MCP server for Odoo will be built (no off-the-shelf Odoo MCP exists) using JSON-RPC to communicate with Odoo's API.
- Social media platform credentials (Facebook Page Access Token, Facebook App ID/Secret, Instagram Business API token, Twitter/X OAuth tokens) are stored in environment variables — never in vault files.
- The Facebook Watcher uses the Facebook Graph API with a long-lived Page Access Token; the token must be renewed by the user before expiry (60-day token lifecycle).
- Social media integrations may use existing MCP servers or custom wrappers, depending on platform API availability.
- The `Bank_Transactions.md` file is manually maintained or imported from bank exports — the system reads but does not write to it.
- All Gold source code lives under `gold/src/` and tests under `gold/tests/`, parallel to `bronze/` and `silver/` folder structures.
- Gold imports and extends both Bronze and Silver modules — no code duplication between tiers.
- The watchdog process is a separate script that runs independently of the main daemon, started by the OS scheduler.
- Audit log immutability is implemented via append-only file writes — no in-place modification of closed log entries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Draft invoices can be created in Odoo and posted after approval within a single workflow cycle.
- **SC-002**: 100% of financial write operations are routed through HITL approval — zero unauthorized Odoo postings.
- **SC-003**: Content can be generated, approved, and published to at least 3 social media platforms (Facebook, Instagram, Twitter/X) through the full pipeline.
- **SC-004**: The weekly CEO briefing is autonomously generated every Sunday with all 5 required sections populated from live data sources.
- **SC-005**: Tasks started by the system run to completion — no premature termination for multi-step workflows.
- **SC-006**: When the daemon crashes, it is automatically restarted by the watchdog within 30 seconds with incomplete tasks resumed.
- **SC-007**: When an external service fails, the system continues operating other services with degraded functionality rather than stopping entirely.
- **SC-008**: Every system action produces an audit log entry with all required fields — zero unlogged actions.
- **SC-009**: All Bronze and Silver functionality continues to operate correctly with no regressions.
