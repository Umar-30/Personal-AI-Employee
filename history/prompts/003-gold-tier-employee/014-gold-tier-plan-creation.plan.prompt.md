---
id: 014
title: Gold Tier Plan Creation
stage: plan
date: 2026-02-16
surface: agent
model: claude-opus-4-6
feature: 003-gold-tier-employee
branch: 003-gold-tier-employee
user: M Umar
command: /sp.plan
labels: ["gold-tier", "plan", "odoo", "social-media", "ceo-briefing", "watchdog", "audit-logging", "persistence"]
links:
  spec: specs/003-gold-tier-employee/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/003-gold-tier-employee/plan.md
  - specs/003-gold-tier-employee/research.md
  - specs/003-gold-tier-employee/data-model.md
  - specs/003-gold-tier-employee/contracts/interfaces.ts
  - specs/003-gold-tier-employee/quickstart.md
tests:
  - Constitution check — all 8 principles PASS (pre-design and post-design)
---

## Prompt

/sp.plan # SP.Plan — Gold Tier

## Phase 1 — Odoo Accounting Layer
- [ ] Install Odoo v19+
- [ ] Configure local instance
- [ ] Build Odoo MCP server (JSON-RPC)
- [ ] Implement invoice creation
- [ ] Add approval before posting entries
- [ ] Log financial actions

## Phase 2 — Social Media Engine
- [ ] Integrate Facebook API
- [ ] Integrate Instagram API
- [ ] Integrate Twitter (X) API
- [ ] Create social posting skill
- [ ] Log engagement metrics

## Phase 3 — Weekly CEO Briefing
- [ ] Sunday scheduler
- [ ] Read Business_Goals.md
- [ ] Parse Bank_Transactions.md
- [ ] Analyze /Done
- [ ] Generate structured briefing
- [ ] Save to /Briefings/

## Phase 4 — Ralph Loop Integration
- [ ] Implement /ralph-loop
- [ ] Add completion condition detection
- [ ] Prevent premature exit
- [ ] Support multi-step execution

## Phase 5 — Reliability Layer
- [ ] Implement retry logic
- [ ] Add watchdog process
- [ ] PID monitoring
- [ ] Graceful degradation paths

## Phase 6 — Audit Logging
- [ ] Define JSON schema
- [ ] Daily log file creation
- [ ] Log all actions
- [ ] Log approval state
- [ ] Log MCP results

## Response snapshot

Generated 5 plan artifacts for Gold Tier:

1. **plan.md** — 9-phase implementation plan with constitution check (all 8 principles PASS), project structure (20+ source files across gold/src/), and 7 key architecture decisions.

2. **research.md** — 8 research decisions:
   - D1: Odoo JSON-RPC protocol (over XML-RPC, REST, ORM bridge)
   - D2: Custom Node.js MCP server for Odoo (consistent with Silver pattern)
   - D3: Direct REST API wrappers for social media (not MCP servers)
   - D4: Composition-by-copy daemon pattern (same as Silver)
   - D5: SHA-256 hash chaining for audit immutability
   - D6: Extend Silver daily briefing pattern for CEO briefing
   - D7: PersistenceLoop wrapper around existing executor
   - D8: Standalone watchdog script + OS scheduler

3. **data-model.md** — 7 entities: Odoo Invoice (with line items, state transitions), Odoo Accounting Entry, Social Media Post (with platform drafts, character limits), CEO Briefing (5 sections), Watchdog State, Audit Log Entry (with hash chaining), Persistence Loop State.

4. **contracts/interfaces.ts** — TypeScript contracts: GoldConfig, GoldExecutionContext, OdooMCPTools (6 tools), ISocialMediaManager, IAuditLogger, IPersistenceLoop, IWatchdog, GoldTaskType.

5. **quickstart.md** — Setup guide with env vars, Odoo/social media configuration steps, verification checklist, troubleshooting table.

## Outcome

- ✅ Impact: Complete Gold tier architecture designed with 9 implementation phases, 8 research decisions, 7 data entities, and full TypeScript contracts
- 🧪 Tests: Constitution check PASS on all 8 principles (pre-design + post-design)
- 📁 Files: 5 files created (plan.md, research.md, data-model.md, contracts/interfaces.ts, quickstart.md)
- 🔁 Next prompts: /sp.tasks → /sp.implement
- 🧠 Reflection: Gold follows established Silver patterns (composition-by-copy daemon, MCP for external services, skills implementing BaseSkill). Key novelty: custom Odoo MCP server, social media direct API wrappers, hash-chained audit logs, persistence loop.

## Evaluation notes (flywheel)

- Failure modes observed: None — all artifacts generated cleanly
- Graders run and results (PASS/FAIL): Constitution check PASS (8/8)
- Prompt variant (if applicable): Standard /sp.plan workflow with user-provided phase structure
- Next experiment (smallest change to try): None — proceed to /sp.tasks
