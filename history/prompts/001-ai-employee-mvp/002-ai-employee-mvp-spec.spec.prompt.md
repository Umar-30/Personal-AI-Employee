---
id: 002
title: AI Employee MVP Spec
stage: spec
date: 2026-02-15
surface: agent
model: claude-opus-4-6
feature: 001-ai-employee-mvp
branch: 001-ai-employee-mvp
user: user
command: /sp.specify
labels: ["spec", "ai-employee", "mvp", "bronze-tier"]
links:
  spec: specs/001-ai-employee-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-ai-employee-mvp/spec.md
  - specs/001-ai-employee-mvp/checklists/requirements.md
tests:
  - N/A
---

## Prompt

/sp.specify — Bronze Tier Local AI Employee MVP. Build a local-first autonomous AI Employee using Claude Code + Obsidian vault. File System Drop Folder watcher selected. Core requirements: read/write vault files, scan /Needs_Action, create plans, execute tasks, move to /Done, update Dashboard.md, implement as reusable Agent Skills.

## Response snapshot

Spec written with 4 user stories (P1-P4): File Drop Intake, Task Planning/Execution Loop, Dashboard Tracking, Human Approval Workflow. 10 functional requirements, 5 key entities, 7 measurable success criteria. Quality checklist passed all items. No clarifications needed.

## Outcome

- ✅ Impact: Feature spec established — ready for /sp.plan
- 🧪 Tests: N/A (specification phase)
- 📁 Files: spec.md, checklists/requirements.md
- 🔁 Next prompts: `/sp.plan` to design architecture, `/sp.clarify` if refinements needed
- 🧠 Reflection: User input was detailed enough to resolve watcher choice as only clarification needed

## Evaluation notes (flywheel)

- Failure modes observed: None
- Graders run and results (PASS/FAIL): Quality checklist PASS (all items)
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): N/A
