# Feature Specification: Platinum Tier — Split-Brain Production AI Employee

**Feature Branch**: `004-platinum-tier-employee`
**Created**: 2026-02-17
**Status**: Draft
**Input**: User description: "Build a split-brain production AI Employee: Cloud Agent (24/7 execution) + Local Agent (Executive authority). All Gold features remain required."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cloud Agent Deployment (Priority: P1)

The business owner deploys the AI Employee's Cloud Agent on a Linux VPS (Oracle VM, AWS, or similar) so that watchers, orchestration, draft generation, and health monitoring run 24/7 without depending on the local machine being online. The Cloud Agent handles email triage, social media draft creation, task ingestion from the vault, and scheduling — all in draft-only mode (no final sends). It survives server restarts via process supervision and automatically recovers from crashes.

**Why this priority**: Without the Cloud Agent running 24/7, the system cannot process incoming work while the owner is offline. This is the foundational capability that makes the entire Platinum tier viable.

**Independent Test**: Can be tested by deploying the Cloud Agent on a VPS, sending an email, and confirming the agent creates a draft task file in the vault within the expected polling interval — even when the local machine is powered off.

**Acceptance Scenarios**:

1. **Given** a configured Linux VPS with the Cloud Agent installed, **When** the VPS boots or restarts, **Then** the Cloud Agent starts automatically under process supervision and begins polling all configured watchers within 60 seconds.
2. **Given** the Cloud Agent is running and the local machine is offline, **When** a new email arrives, **Then** the Cloud Agent triages the email and creates a draft response file in `/Needs_Action` within the configured polling interval.
3. **Given** the Cloud Agent process crashes unexpectedly, **When** the process supervisor detects the crash, **Then** the Cloud Agent is restarted automatically and resumes operation from the last known state.
4. **Given** the Cloud Agent is running, **When** a social media post is scheduled, **Then** the Cloud Agent generates draft content and places it in `/Pending_Approval` — it does NOT publish directly.

---

### User Story 2 — Work-Zone Separation (Priority: P1)

The system enforces a strict separation between Cloud-zone and Local-zone responsibilities. The Cloud Agent handles read-only and draft-only operations (email triage, social drafts, scheduling drafts, task ingestion). The Local Agent retains executive authority over all sensitive operations (approvals, WhatsApp sessions, banking, final sends/posts, Dashboard.md ownership). No credentials for sensitive services exist on the cloud server.

**Why this priority**: Security and control separation are fundamental to the architecture. Without clear zone boundaries, the system cannot safely operate with cloud components.

**Independent Test**: Can be tested by verifying that the Cloud Agent's environment has no access to banking credentials, WhatsApp session tokens, or approval secrets — and that attempting a final send from the Cloud Agent fails gracefully.

**Acceptance Scenarios**:

1. **Given** the Cloud Agent is running, **When** it attempts to access banking credentials or WhatsApp session data, **Then** the operation fails because those credentials do not exist in the cloud environment.
2. **Given** the Cloud Agent generates a draft email, **When** the draft requires sending, **Then** the Cloud Agent places it in `/Pending_Approval` and does NOT attempt to send it directly.
3. **Given** the Local Agent is running, **When** an approved task file appears in `/Approved`, **Then** the Local Agent executes the final action (send email, publish post, process payment) using locally-stored credentials.
4. **Given** Dashboard.md exists in the vault, **When** both agents are running, **Then** only the Local Agent writes to Dashboard.md (single-writer guarantee).

---

### User Story 3 — Vault Sync (Priority: P1)

The Cloud and Local agents share state through a synchronized Obsidian vault using Git (preferred) or Syncthing. The sync model uses claim-by-move ownership: the Cloud Agent writes to `/Needs_Action`, `/Plans`, and `/Updates`; the Local Agent owns `Dashboard.md` and `/Approved`. Sync includes only Markdown and state files — never `.env` files, secrets, or binary blobs.

**Why this priority**: Without reliable sync, the two agents cannot collaborate. This is the communication backbone of the split-brain architecture.

**Independent Test**: Can be tested by having the Cloud Agent create a file in `/Needs_Action`, syncing, and confirming the Local Agent sees the file within the sync interval — and vice versa for approval files.

**Acceptance Scenarios**:

1. **Given** the Cloud Agent creates a file in `/Needs_Action`, **When** the sync cycle completes, **Then** the Local Agent sees the file in its local vault copy within 2 minutes.
2. **Given** the Local Agent moves a file from `/Pending_Approval` to `/Approved`, **When** the sync cycle completes, **Then** the Cloud Agent detects the approval and updates the task status.
3. **Given** a `.env` file or credentials file exists locally, **When** a sync cycle runs, **Then** the file is excluded from sync (via `.gitignore` or sync exclusion rules).
4. **Given** both agents attempt to modify the same file simultaneously, **When** a sync conflict occurs, **Then** the system resolves conflicts using claim-by-move ownership rules (the agent that owns the target folder wins).

---

### User Story 4 — Security Model (Priority: P1)

The Cloud Agent operates in a restricted security context. It never stores, accesses, or transmits: banking credentials, WhatsApp session tokens, payment processing tokens, or approval secrets. All sensitive credentials remain exclusively on the local machine. Communication between agents happens only through vault file sync — never through direct network connections or shared credential stores.

**Why this priority**: A cloud-deployed agent with access to banking or payment credentials represents an unacceptable security risk. The security model must be designed before any deployment.

**Independent Test**: Can be tested by auditing the Cloud Agent's environment variables, configuration files, and runtime memory to confirm zero sensitive credentials are present.

**Acceptance Scenarios**:

1. **Given** the Cloud Agent is deployed, **When** an auditor inspects the cloud server's environment variables and configuration, **Then** no banking credentials, WhatsApp tokens, payment tokens, or approval secrets are found.
2. **Given** the Cloud Agent receives a task that requires banking access, **When** it processes the task, **Then** it creates a delegation request in `/Pending_Approval` for the Local Agent to handle.
3. **Given** a vault sync is in progress, **When** files are transferred between cloud and local, **Then** no file containing credentials or secrets is included in the sync payload.

---

### User Story 5 — End-to-End Demo (Priority: P2)

The business owner can demonstrate the full split-brain workflow: An email arrives while the local machine is offline. The Cloud Agent triages the email, drafts a reply, and places it in `/Pending_Approval`. When the local machine comes online and syncs, the owner reviews and approves the draft. The Local Agent detects the approval, executes the send via locally-stored Gmail credentials, logs the action, and moves the task to `/Done`. The entire flow is visible in the vault file trail.

**Why this priority**: The demo validates that all components work together. It is the integration test for the entire Platinum architecture — but it depends on US1-US4 being implemented first.

**Independent Test**: Can be tested end-to-end by sending an email to the monitored inbox, waiting for the Cloud Agent to draft a reply, approving locally, and confirming the email was sent and logged.

**Acceptance Scenarios**:

1. **Given** the local machine is offline and the Cloud Agent is running, **When** an email arrives at the monitored inbox, **Then** the Cloud Agent creates a task file with a drafted reply in `/Pending_Approval` within the polling interval.
2. **Given** a draft reply exists in `/Pending_Approval`, **When** the local machine comes online and syncs, **Then** the draft appears in the local vault and the owner can review it.
3. **Given** the owner moves the draft from `/Pending_Approval` to `/Approved`, **When** the Local Agent detects the approval (after sync), **Then** the Local Agent sends the email using local credentials and moves the task to `/Done`.
4. **Given** the email was sent, **When** the task reaches `/Done`, **Then** a complete audit trail exists: task file, plan file, approval record, send log entry, and Dashboard.md update.

---

### User Story 6 — Production Hardening (Priority: P2)

The deployed system includes production-grade reliability features: HTTPS for all external service communication (especially Odoo), automated backups of the vault, health monitoring with alerting, crash recovery with automatic restart, rate limiting for external API calls, credential rotation support, and process supervision. The system can survive and recover from common failure modes without manual intervention.

**Why this priority**: Production hardening ensures the system is reliable enough for real business use. It builds on the working split-brain architecture (US1-US5) by adding resilience.

**Independent Test**: Can be tested by simulating failures (process kill, network interruption, disk full) and confirming the system recovers automatically and alerts the owner.

**Acceptance Scenarios**:

1. **Given** the Cloud Agent is running under process supervision, **When** the agent process is killed, **Then** the supervisor restarts it within 30 seconds and the agent resumes from its last state.
2. **Given** the vault contains business data, **When** a scheduled backup runs, **Then** a complete vault backup is created and stored in a configured backup location.
3. **Given** external API rate limits are configured, **When** the system approaches a rate limit, **Then** it throttles requests to stay within limits rather than failing.
4. **Given** Odoo is configured, **When** the Cloud Agent communicates with Odoo, **Then** all communication uses HTTPS with valid certificates.
5. **Given** the health monitor detects a service outage, **When** a configured service becomes unreachable, **Then** an alert is created in `/Logs` and the system continues operating with degraded capabilities.

---

### Edge Cases

- What happens when both agents attempt to write to the same vault file simultaneously? → Claim-by-move ownership resolves conflicts; the owning zone's write takes precedence.
- What happens when vault sync fails or is delayed beyond the expected interval? → The system continues operating independently; a stale-sync alert is generated after the configured timeout.
- What happens when the Cloud Agent's VPS runs out of disk space? → Health monitoring detects low disk and creates an alert before reaching critical levels; the agent enters a read-only degraded mode.
- What happens when the local machine is offline for an extended period (days)? → The Cloud Agent continues drafting and queuing; sync resolves when local comes online; no data is lost.
- What happens when credentials are rotated on the local machine? → The Local Agent picks up new credentials from `.env` on next restart; the Cloud Agent is unaffected (it has no sensitive credentials).
- What happens when the VPS IP changes or connectivity is interrupted? → The sync mechanism (Git push/pull) resumes automatically when connectivity returns; no manual intervention needed.

## Requirements *(mandatory)*

### Functional Requirements

**Cloud Agent:**

- **FR-001**: System MUST deploy the Cloud Agent as a supervised process on a Linux VPS that starts automatically on boot.
- **FR-002**: System MUST run all watchers (email, LinkedIn) on the Cloud Agent for 24/7 monitoring.
- **FR-003**: System MUST run the orchestration loop (task ingestion, planning, draft generation) on the Cloud Agent.
- **FR-004**: Cloud Agent MUST operate in draft-only mode — it creates files in `/Needs_Action`, `/Plans`, and `/Pending_Approval` but never executes final sends, posts, or payments.
- **FR-005**: Cloud Agent MUST support health self-monitoring and create alert files when services become unavailable.
- **FR-006**: Cloud Agent MUST survive restarts and resume from the last known state using existing persistence mechanisms (plan checkpoints, file-based completion detection).

**Local Agent:**

- **FR-007**: Local Agent MUST retain exclusive authority over all approval processing (moving files from `/Pending_Approval` to `/Approved`).
- **FR-008**: Local Agent MUST execute all final external actions (email sends, social media posts, payments) using locally-stored credentials.
- **FR-009**: Local Agent MUST be the single writer for `Dashboard.md`.
- **FR-010**: Local Agent MUST handle WhatsApp sessions, banking operations, and any action requiring sensitive credentials.

**Vault Sync:**

- **FR-011**: System MUST synchronize the vault between Cloud and Local agents using Git (preferred) or Syncthing.
- **FR-012**: Sync MUST use claim-by-move ownership to prevent write conflicts: Cloud writes to `/Needs_Action`, `/Plans`, `/Updates`; Local owns `Dashboard.md`, `/Approved`, `/Done`.
- **FR-013**: Sync MUST exclude `.env` files, credential files, and any files containing secrets.
- **FR-014**: Sync MUST include only Markdown files and JSON state files.
- **FR-015**: Sync MUST complete within 2 minutes under normal network conditions.

**Security:**

- **FR-016**: Cloud Agent MUST NOT store, access, or have available in its environment: banking credentials, WhatsApp session tokens, payment processing tokens, or approval secrets.
- **FR-017**: All inter-agent communication MUST happen exclusively through vault file sync — no direct network connections between agents.
- **FR-018**: All external API communication from the Cloud Agent MUST use HTTPS.

**Production Hardening:**

- **FR-019**: System MUST include process supervision for the Cloud Agent with automatic restart on crash (maximum restart limit with alerting).
- **FR-020**: System MUST include automated vault backups on a configurable schedule.
- **FR-021**: System MUST include health monitoring that tracks service availability and creates alerts for failures.
- **FR-022**: System MUST include rate limiting for all external API calls to prevent quota exhaustion.
- **FR-023**: System MUST support credential rotation without requiring code changes (environment variable-based configuration).

**Demo:**

- **FR-024**: System MUST support an end-to-end demo flow: email arrives → Cloud drafts reply → file syncs to `/Pending_Approval` → Local approves → Local sends → logs written → task to `/Done`.

### Key Entities

- **Cloud Agent**: The always-on process running on a VPS; handles watchers, orchestration, draft generation, and health monitoring. Has no access to sensitive credentials.
- **Local Agent**: The executive-authority process running on the owner's machine; handles approvals, final sends, banking, WhatsApp, and Dashboard.md updates. Holds all sensitive credentials.
- **Vault Sync Layer**: The synchronization mechanism (Git or Syncthing) that transfers Markdown/JSON state files between Cloud and Local agents while excluding secrets.
- **Work Zone**: A defined scope of responsibility (Cloud-zone or Local-zone) that determines which agent can write to which vault folders.
- **Claim-by-Move Ownership**: The conflict resolution model where the agent that "owns" a target folder has write authority; files are transferred between zones by moving them to the other zone's folders.
- **Process Supervisor**: The system service (systemd, PM2, or similar) that ensures the Cloud Agent stays running and recovers from crashes.
- **Health Monitor**: A component that tracks the availability of external services (Odoo, Gmail MCP, LinkedIn MCP) and internal system health (disk, memory, sync freshness).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Cloud Agent runs continuously for 7 days on a VPS without manual intervention, surviving at least 2 simulated crashes with automatic recovery.
- **SC-002**: End-to-end demo completes successfully: email arrival to final send in under 10 minutes (excluding human approval time) with full audit trail.
- **SC-003**: Vault sync completes within 2 minutes of a file change under normal network conditions.
- **SC-004**: Zero sensitive credentials are present on the cloud server — verified by environment and filesystem audit.
- **SC-005**: All Gold tier features (Odoo accounting, social media, CEO briefing, persistence loop, watchdog, audit logging) continue to function in the split-brain architecture.
- **SC-006**: System recovers from common failure modes (process crash, network interruption, sync failure, external service outage) without data loss and within 60 seconds.
- **SC-007**: Vault backup runs on schedule and a backup can be restored to a working state within 15 minutes.
- **SC-008**: Rate limiting prevents API quota exhaustion — system stays within configured limits during sustained operation.
- **SC-009**: The owner can go offline for 24 hours, come back online, sync, review drafts, approve actions, and all queued work completes correctly.

## Assumptions

- The target VPS runs a modern Linux distribution (Ubuntu 22.04+ or similar) with systemd available.
- Git is available on both cloud and local machines and SSH keys or HTTPS tokens are configured for vault repository access.
- The business owner has an existing VPS or cloud account (Oracle Cloud, AWS, DigitalOcean, etc.) — provisioning the VM itself is out of scope.
- All Gold tier features are fully implemented and working before Platinum work begins.
- Network connectivity between cloud and local is not guaranteed to be always-on — the system must tolerate intermittent connectivity.
- The vault repository is small enough for Git to handle efficiently (under 1GB of Markdown/JSON files).

## Dependencies

- **Gold Tier (003)**: All Gold features must be complete — Odoo accounting, social media, CEO briefing, persistence loop, watchdog, audit logging.
- **Git**: Used as the primary sync mechanism between cloud and local vaults.
- **Linux VPS**: A production server with systemd process supervision.
- **SSH/HTTPS access**: For Git push/pull between cloud and local.
