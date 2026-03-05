# Implementation Plan: Local AI Employee MVP (Bronze Tier)

**Branch**: `001-ai-employee-mvp` | **Date**: 2026-02-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-ai-employee-mvp/spec.md`

## Summary

Build a local-first autonomous AI Employee as a persistent Node.js daemon that watches an Obsidian vault's `/Inbox` folder, processes tasks through a six-step execution loop (READ → THINK → PLAN → ACT → LOG → COMPLETE), enforces human-in-the-loop approval for sensitive actions, and maintains a live dashboard. All processing logic is implemented as reusable Agent Skills (modular TypeScript modules). Claude Code is invoked via CLI for reasoning steps.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20 LTS
**Primary Dependencies**: chokidar (file watching), gray-matter (YAML frontmatter parsing), glob (file discovery), execa (Claude Code CLI invocation)
**Storage**: File-based — Markdown files with YAML frontmatter + JSON log files in the Obsidian vault
**Testing**: vitest
**Target Platform**: Windows 11 (local-first, single machine)
**Project Type**: Single project (daemon process)
**Performance Goals**: Task intake within 5 seconds of file drop; dashboard update within 10 seconds of state change
**Constraints**: Single-instance only (no concurrency); local filesystem only; must not write secrets to vault
**Scale/Scope**: Single user, single vault, tens of tasks per day

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Gate | Status |
|---|-----------|------|--------|
| I | Core Identity | System acts as reasoning engine via Claude Code, not chatbot | PASS |
| II | Vault-First Workflow | All state lives in vault folders; no external database | PASS |
| III | Execution Loop | Six-step loop (READ→THINK→PLAN→ACT→LOG→COMPLETE) implemented as core pipeline | PASS |
| IV | HITL Law | Sensitive actions routed through `/Pending_Approval` → `/Approved` | PASS |
| V | Persistence | Daemon runs continuously; incomplete plans resume on restart | PASS |
| VI | Security First | Secrets in env vars only; DRY_RUN mode supported; all actions logged | PASS |
| VII | Autonomy Boundaries | Safe actions auto-execute; sensitive actions require approval file | PASS |
| VIII | Quality Standard | Structured output, JSON logs, auditable file trail | PASS |

All gates PASS. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-employee-mvp/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── skill-interface.md
└── tasks.md             # Phase 2 output (/sp.tasks)
```

### Source Code (Bronze Tier — `bronze/`)

```text
bronze/
├── src/
│   ├── index.ts             # Daemon entry point
│   ├── watcher/
│   │   └── inbox-watcher.ts # chokidar file watcher for /Inbox
│   ├── pipeline/
│   │   ├── intake.ts        # Validate frontmatter, move to /Needs_Action
│   │   ├── planner.ts       # Create plan file in /Plans via Claude Code
│   │   ├── executor.ts      # Execute plan steps, handle approval routing
│   │   └── completer.ts     # Move to /Done, update Dashboard
│   ├── skills/
│   │   ├── skill-registry.ts    # Skill discovery and dispatch
│   │   ├── base-skill.ts        # Abstract skill interface
│   │   ├── summarize.skill.ts   # Example: text summarization
│   │   ├── draft-email.skill.ts # Example: draft email (safe)
│   │   └── dashboard.skill.ts   # Dashboard generation
│   ├── approval/
│   │   ├── approval-watcher.ts  # Watch /Pending_Approval and /Approved
│   │   └── approval-gate.ts     # Block execution until approval
│   ├── logging/
│   │   ├── logger.ts        # JSON log writer to /Logs/YYYY-MM-DD.json
│   │   └── types.ts         # Log entry types
│   ├── models/
│   │   ├── task-file.ts     # Task file parsing and validation
│   │   ├── plan-file.ts     # Plan file creation and management
│   │   └── frontmatter.ts   # YAML frontmatter schema
│   ├── claude/
│   │   └── claude-client.ts # Claude Code CLI invocation wrapper
│   └── config/
│       └── config.ts        # Vault paths, polling intervals, env config
└── tests/
    ├── unit/
    │   ├── intake.test.ts
    │   ├── task-file.test.ts
    │   ├── logger.test.ts
    │   └── skill-registry.test.ts
    ├── integration/
    │   ├── watcher-pipeline.test.ts
    │   └── approval-flow.test.ts
    └── fixtures/
        ├── valid-task.md
        ├── invalid-task.md
        └── sample-plan.md
```

**Structure Decision**: Single project with a daemon process. The `bronze/src/` directory is organized by domain concern (watcher, pipeline, skills, approval, logging) rather than by layer, reflecting the file-driven workflow architecture. Each domain maps directly to a constitution principle.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
