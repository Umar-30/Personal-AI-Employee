---
id: 021
title: WhatsApp Watcher and Facebook Watcher Clarification
stage: spec
date: 2026-02-19
surface: agent
model: claude-sonnet-4-6
feature: 002-silver-tier-assistant
branch: 004-platinum-tier-employee
user: M Umar
command: /sp.clarify - WhatsApp Watcher missing, FB integration fix
labels: ["clarification","whatsapp","facebook","silver","gold","watcher"]
links:
  spec: specs/002-silver-tier-assistant/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/002-silver-tier-assistant/spec.md
  - specs/003-gold-tier-employee/spec.md
tests:
  - none (no tests implemented yet)
---

## Prompt

project main fb or   5. WhatsApp Watcher Missing
Silver requirement specifically WhatsApp manga tha. LinkedIn bana hai. is ko fix kro

## Response snapshot

Ran sp.clarify workflow. Asked 3 targeted questions:
1. WhatsApp replace LinkedIn or add alongside? → A: Add (3 watchers: Gmail+LinkedIn+WhatsApp)
2. WhatsApp integration approach? → A: Green API (REST-based)
3. Facebook: Gold Watcher or Silver or ignore? → A: Gold Watcher via Graph API

Updated both specs:
- Silver spec: Added WhatsApp Watcher (Green API), FR-003a/003b, updated SC-001
- Gold spec: Added Facebook Watcher (Graph API), FR-004a/004b/004c, new Key Entity

## Outcome

- ✅ Impact: Silver now has 3 watchers (Gmail+LinkedIn+WhatsApp), Gold has FB Watcher
- 🧪 Tests: No tests updated (implementation pending)
- 📁 Files: specs/002-silver-tier-assistant/spec.md, specs/003-gold-tier-employee/spec.md
- 🔁 Next prompts: /sp.implement to add WhatsApp watcher code to silver/src/, FB watcher to gold/src/
- 🧠 Reflection: Green API is correct choice - avoids Playwright fragility and WhatsApp ToS issues

## Evaluation notes (flywheel)

- Failure modes observed: Original spec had LinkedIn where WhatsApp was required per hackathon doc
- Graders run and results (PASS/FAIL): N/A
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Implement WhatsApp watcher in silver/src/watchers/whatsapp-watcher.ts
