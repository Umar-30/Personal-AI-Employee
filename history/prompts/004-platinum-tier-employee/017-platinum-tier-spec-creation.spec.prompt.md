---
id: 017
title: Platinum Tier Spec Creation
stage: spec
date: 2026-02-17
surface: agent
model: claude-opus-4-6
feature: 004-platinum-tier-employee
branch: 004-platinum-tier-employee
user: M Umar
command: /sp.specify
labels: ["platinum-tier", "spec", "split-brain", "cloud-agent", "local-agent", "vault-sync", "security", "production-hardening"]
links:
  spec: specs/004-platinum-tier-employee/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/004-platinum-tier-employee/spec.md
  - specs/004-platinum-tier-employee/checklists/requirements.md
tests:
  - Specification quality checklist — 16/16 items PASS
---

## Prompt

/sp.specify

# SP.Specify — Platinum Tier (Concise)

## Objective
Build a split-brain production AI Employee:

- Cloud Agent (24/7 execution)
- Local Agent (Executive authority)

All Gold features remain required.

---

## 1. Cloud Deployment

Platform:
- Oracle VM / AWS / Linux VPS

Cloud runs:
- All watchers
- Orchestrator loop
- Odoo server
- Draft generation
- Health monitoring

Must support restart resilience and supervision.

---

## 2. Work-Zone Separation

Cloud:
- Email triage
- Social drafts
- Scheduling (draft-only)
- Task ingestion

Local:
- Approvals
- WhatsApp sessions
- Banking
- Final sends/posts
- Dashboard (single writer)

No credential crossover.

---

## 3. Vault Sync Model

Sync:
- Git (preferred) or Syncthing

Rules:
- Claim-by-move ownership
- Cloud writes: `/Needs_Action`, `/Plans`, `/Updates`
- Local owns `Dashboard.md`
- `.env` excluded
- Secrets never synced
- Markdown + state files only

---

## 4. Security Constraints

Cloud must never store:
- Banking credentials
- WhatsApp sessions
- Payment tokens
- Approval secrets

Local retains all sensitive secrets.

---

## 5. Mandatory Demo

1. Email arrives (Local offline)
2. Cloud drafts reply
3. File → `/Pending_Approval`
4. Local approves → `/Approved`
5. Local executes send
6. Logs written
7. Task → `/Done`

End-to-end required.

---

## 6. Production Hardening

- HTTPS for Odoo
- Backups
- Health monitoring
- Crash recovery
- Rate limiting
- Credential rotation
- Process supervision

---

## Completion Criteria

✔ 24/7 cloud runtime
✔ Executive control local
✔ Secure sync
✔ Demo validated
✔ Production resilience

Return:
1. Text architecture diagram
2. Sync design
3. Security model
4. Cloud stack
5. Local stack
6. Demo walkthrough

## Response snapshot

Created the Platinum Tier specification with 6 user stories across 2 priority levels:

**P1 (Critical path):**
- US1 — Cloud Agent Deployment: 24/7 VPS with process supervision, restart resilience, draft-only mode
- US2 — Work-Zone Separation: Cloud handles triage/drafts, Local handles approvals/sends/banking, no credential crossover
- US3 — Vault Sync: Git-based sync with claim-by-move ownership, 2-minute sync target, secrets excluded
- US4 — Security Model: Cloud has zero sensitive credentials, all inter-agent communication via vault files only

**P2 (Depends on P1):**
- US5 — End-to-End Demo: Email → Cloud draft → Sync → Local approve → Local send → Logs → Done
- US6 — Production Hardening: HTTPS, backups, health monitoring, crash recovery, rate limiting, credential rotation

**Requirements**: 24 functional requirements across 6 categories (Cloud Agent, Local Agent, Vault Sync, Security, Production Hardening, Demo)

**Success Criteria**: 9 measurable outcomes (7-day uptime, 10-min E2E demo, 2-min sync, zero cloud credentials, Gold feature parity, 60s failure recovery, backup restoration, rate limiting, 24h offline tolerance)

**Quality Checklist**: 16/16 items pass — no [NEEDS CLARIFICATION] markers, no implementation details in spec.

## Outcome

- ✅ Impact: Platinum tier fully specified with split-brain cloud/local architecture, vault sync, security model, and production hardening
- 🧪 Tests: Quality checklist PASS (16/16)
- 📁 Files: 2 files created (spec.md, checklists/requirements.md)
- 🔁 Next prompts: /sp.clarify or /sp.plan to proceed with architecture planning
- 🧠 Reflection: The user's input was concise but comprehensive — all 6 sections mapped cleanly to user stories. Made informed assumptions about sync timing (2-min target), VPS platform (Linux with systemd), and failure recovery targets (60s). No clarifications needed since the user specified clear boundaries for cloud vs local responsibilities.

## Evaluation notes (flywheel)

- Failure modes observed: PowerShell create-new-feature.ps1 errored on positional parameter (known recurring issue from Gold tier) — branch was still created successfully.
- Graders run and results (PASS/FAIL): Quality checklist PASS (16/16)
- Prompt variant (if applicable): Standard /sp.specify workflow
- Next experiment (smallest change to try): Consider adding a "Deployment Architecture" section to the spec template for features that involve multi-machine deployments.
