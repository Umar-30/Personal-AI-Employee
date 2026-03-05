# Research: Local AI Employee MVP (Bronze Tier)

**Branch**: `001-ai-employee-mvp` | **Date**: 2026-02-15

## R1: File Watching on Windows (Node.js)

**Decision**: Use `chokidar` v4.x for cross-platform file watching.

**Rationale**: Native `fs.watch` on Windows has known issues with duplicate events and missing rename tracking. chokidar normalizes behavior across platforms, supports polling fallback, and handles atomic writes gracefully. It is the most battle-tested Node.js file watcher.

**Alternatives considered**:
- `fs.watch` (native) — unreliable on Windows, no recursive watching guarantees
- `@parcel/watcher` — faster but less mature, C++ addon complicates builds
- Polling with `setInterval` + `fs.readdir` — simplest but wastes CPU, misses rapid changes

## R2: YAML Frontmatter Parsing

**Decision**: Use `gray-matter` for parsing Markdown files with YAML frontmatter.

**Rationale**: De facto standard in the Node.js ecosystem for frontmatter extraction. Handles edge cases (empty body, malformed YAML) gracefully. Used by Obsidian ecosystem tools.

**Alternatives considered**:
- Manual regex parsing — error-prone with multiline YAML
- `js-yaml` + manual splitting — more code, same result
- `remark-frontmatter` — heavier, pulls in full remark AST pipeline

## R3: Claude Code CLI Invocation

**Decision**: Invoke Claude Code via CLI subprocess using `execa` with structured prompts piped via stdin.

**Rationale**: Claude Code exposes a CLI interface that accepts prompts. The daemon sends the task context (file content, handbook rules) as a structured prompt and captures the response. This keeps the daemon lightweight — it handles orchestration while Claude Code handles reasoning.

**Invocation pattern**:
```text
echo "<structured-prompt>" | claude --print --output-format json
```

**Alternatives considered**:
- Anthropic API directly — bypasses Claude Code's tool/file access capabilities
- Claude Code as a library — not officially supported as an importable module
- MCP server protocol — adds complexity; save for Silver tier

## R4: Approval Workflow Mechanism

**Decision**: File-based polling. The daemon watches `/Pending_Approval`, `/Approved`, and `/Rejected` directories using chokidar.

**Rationale**: Aligns with the vault-first principle. The user moves files between folders using Obsidian or a file manager. The daemon detects the move event and resumes execution. No external approval UI needed for Bronze tier.

**Workflow**:
1. Daemon creates `APPROVAL_<slug>.md` in `/Pending_Approval/`
2. Daemon watches `/Approved/` and `/Rejected/` for matching filename
3. On detection in `/Approved/` → execute the action
4. On detection in `/Rejected/` → skip and log

**Alternatives considered**:
- Obsidian plugin with approve/reject buttons — requires plugin development, out of scope for MVP
- CLI confirmation prompt — blocks the daemon, defeats 24/7 purpose
- Web UI — over-engineered for Bronze tier

## R5: Logging Strategy

**Decision**: Append-only JSON lines (JSONL) format in daily log files at `/Logs/YYYY-MM-DD.json`.

**Rationale**: Each line is a self-contained JSON object. Easy to parse, grep, and tail. Daily rotation prevents unbounded file growth. Compatible with Obsidian (viewable as raw text) and jq for querying.

**Log entry schema**:
```json
{
  "timestamp": "2026-02-15T10:30:00.000Z",
  "level": "info",
  "action": "task_intake",
  "taskRef": "meeting-notes-summary",
  "detail": "Moved to /Needs_Action with priority: high",
  "outcome": "success",
  "error": null
}
```

**Alternatives considered**:
- Single log file — grows unbounded
- SQLite — not vault-native, not viewable in Obsidian
- Structured Markdown logs — harder to parse programmatically

## R6: Skill Architecture

**Decision**: Each skill is a TypeScript class implementing a `BaseSkill` interface with `canHandle(task)` and `execute(task, context)` methods. Skills are registered in a `SkillRegistry` that dispatches tasks by matching.

**Rationale**: Modular and extensible. Adding a new skill means adding one file and registering it. The registry pattern allows dynamic dispatch based on task content. Aligns with FR-007 (reusable Agent Skills).

**Alternatives considered**:
- Function-based skills — simpler but no lifecycle hooks or metadata
- Plugin system with dynamic imports — over-engineered for MVP
- Hardcoded switch/case — not extensible, violates FR-007

## R7: Dashboard Generation

**Decision**: Dashboard is regenerated on every state change by counting files in each folder and writing a formatted Markdown file.

**Rationale**: Simple, deterministic, always consistent. No incremental state tracking needed. Cost is negligible (a few `readdir` calls).

**Template**:
```markdown
# Dashboard
**Updated**: <ISO timestamp>

| Folder | Count |
|--------|-------|
| Inbox | N |
| Needs Action | N |
| Plans | N |
| Pending Approval | N |
| Approved | N |
| Done | N |

## Recent Activity
- <timestamp> — <action summary>
```
