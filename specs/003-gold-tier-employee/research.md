# Research: Gold Tier Autonomous Business Employee

**Feature**: 003-gold-tier-employee
**Date**: 2026-02-16

## Decision 1: Odoo Integration Protocol

**Decision**: Use Odoo's JSON-RPC API via `xmlrpc` / raw HTTP calls wrapped in a custom MCP server.

**Rationale**: Odoo Community v19+ exposes its full API via JSON-RPC at `/jsonrpc`. This is the standard external integration method. No official MCP server exists for Odoo, so a custom one must be built. The MCP server will be a Node.js subprocess (consistent with Silver's MCP pattern) that translates MCP tool calls into Odoo JSON-RPC requests.

**Alternatives Considered**:
- XML-RPC: Legacy protocol, still supported but JSON-RPC is preferred for new integrations.
- Direct REST API: Odoo's REST API is limited in Community edition; JSON-RPC covers all models.
- ORM bridge: Would require Python runtime — adds complexity, inconsistent with TypeScript stack.

## Decision 2: Odoo MCP Server Architecture

**Decision**: Build a standalone Node.js MCP server at `gold/src/mcp-servers/odoo-mcp/` using `@modelcontextprotocol/sdk` with `StdioServerTransport`.

**Rationale**: Follows the same pattern as Gmail and LinkedIn MCP servers in Silver tier. The Odoo MCP server exposes tools: `create_invoice`, `post_invoice`, `list_invoices`, `get_invoice`, `create_journal_entry`, `list_journal_entries`. Each tool maps to Odoo JSON-RPC calls against `account.move` and `account.move.line` models.

**Alternatives Considered**:
- Inline Odoo client in Gold skills: Violates Silver's "all MCP calls go through MCPManager" pattern.
- Python MCP server: Would work but adds a Python dependency; keeping everything in Node.js is simpler.
- Third-party Odoo connector: None exist for MCP; building custom is the only option.

## Decision 3: Social Media Integration Strategy

**Decision**: Use platform-specific REST API wrappers (not MCP servers) for Facebook, Instagram, and Twitter/X, accessed through a unified `SocialMediaManager` class.

**Rationale**: Unlike Gmail/LinkedIn where MCP servers exist, no reliable MCP servers exist for Facebook/Instagram/Twitter. Building 3 separate MCP servers is excessive overhead. Instead, a `SocialMediaManager` class wraps the REST APIs directly and is injected into the execution context alongside `MCPManager`. This keeps the architecture clean while avoiding unnecessary subprocess overhead.

**Alternatives Considered**:
- Build 3 MCP servers: Too much overhead for straightforward REST API calls. MCP adds value when the server is reusable across projects; social media posting is specific to this system.
- Use a unified social media library (e.g., `social-post-api`): Adds an opaque dependency; direct API calls give more control over content formatting.
- MCP server per platform: 3 subprocesses for simple REST calls is wasteful.

## Decision 4: Gold Daemon Architecture

**Decision**: Create `GoldDaemon` class following the composition-by-copy pattern established by Silver, extending Silver's internals.

**Rationale**: Bronze and Silver already follow this pattern (Silver copies Bronze's daemon structure and adds its own concerns). Refactoring into a proper inheritance hierarchy would touch Bronze and Silver code, violating the "Bronze code is READ-ONLY" and "Silver code is stable" constraints. Gold follows the same proven pattern.

**Alternatives Considered**:
- Inherit from a `BaseDaemon` class: Would require refactoring Bronze/Silver — out of scope and risky.
- Compose Silver daemon as a dependency: Silver's daemon isn't designed for composition (no clean plugin interface).
- Monorepo with shared daemon package: Over-engineering for 3 tiers.

## Decision 5: Audit Log Immutability Strategy

**Decision**: Implement append-only JSON-lines files with SHA-256 hash chaining. Each entry includes a hash of the previous entry, creating a tamper-evident chain.

**Rationale**: True immutability on a local filesystem is impossible without OS-level controls. Hash chaining provides tamper detection: if any entry is modified, subsequent hash verification fails. This satisfies the spec's "immutable log design preferred" requirement pragmatically. Bronze's existing `Logger` already writes JSON-lines files daily — Gold extends this with hash chaining and richer schema.

**Alternatives Considered**:
- OS-level file permissions (read-only after close): Fragile, easily bypassed by admin.
- Blockchain/merkle tree: Over-engineering for a local system.
- Append-only database (e.g., SQLite WAL): Adds a database dependency; file-based is consistent with vault-first principle.
- Simple append-only without hashing: Meets basic requirement but provides no tamper detection.

## Decision 6: Weekly CEO Briefing Data Pipeline

**Decision**: Extend Silver's `DailyBriefingSkill` into a `WeeklyCEOBriefingSkill` that aggregates data from vault files, Odoo (via MCP), and social media analytics into a structured Claude prompt.

**Rationale**: The Silver daily briefing already scans vault folders and generates summaries via Claude. The Gold weekly briefing extends this pattern by: (1) adding Odoo financial data as an input source, (2) parsing `Bank_Transactions.md` for revenue analysis, (3) including social media engagement data, and (4) structuring the output into 5 required sections (revenue, bottlenecks, subscriptions, risks, recommendations).

**Alternatives Considered**:
- Separate data aggregation service: Over-engineering; the skill can gather data inline.
- Pre-computed data warehouse: Adds complexity; real-time querying at briefing time is sufficient for weekly cadence.
- Multiple specialized briefing skills: One per data domain, then a composer. Too fragmented for 5 sections.

## Decision 7: Ralph Wiggum Persistence Loop Implementation

**Decision**: Implement as a `PersistenceLoop` class that wraps task execution with retry logic, plan re-evaluation, and file-based completion detection. Integrates with the existing executor rather than replacing it.

**Rationale**: The persistence loop is a cross-cutting concern that wraps the existing execution pipeline. It monitors plan file checkboxes, detects completion signals (files moved to `/Done`), and continues iterating until all conditions are met. It uses a configurable stall timeout to detect stuck tasks (creates alert, does NOT terminate). This aligns with Constitution Principle V (Ralph Wiggum Rule).

**Alternatives Considered**:
- Replace executor with a persistent executor: Too invasive; existing executor works fine for single-step tasks.
- External process manager (PM2, systemd): Handles process restarts but not plan-level persistence.
- Event-driven completion: Requires a pub/sub system; file-based detection is simpler and vault-first.

## Decision 8: Watchdog Process Design

**Decision**: Implement as a standalone TypeScript script (`gold/src/watchdog/watchdog.ts`) that reads the daemon's PID file, checks process liveness, and restarts on failure. Started by OS scheduler independently of the daemon.

**Rationale**: The watchdog must be independent of the daemon it monitors (if they share a process, a crash kills both). A standalone script started by `schtasks` (Windows) or `cron` (Linux) every 30 seconds checks the PID file, verifies the process is running, and spawns a new daemon if needed. This follows the spec's "OS watches watchdog" layered supervision model.

**Alternatives Considered**:
- PM2 or forever: External dependency; the custom watchdog is trivial and doesn't add a dependency.
- Windows Service: Platform-specific, harder to develop/debug.
- Docker with restart policy: Adds containerization overhead for a local-first system.
