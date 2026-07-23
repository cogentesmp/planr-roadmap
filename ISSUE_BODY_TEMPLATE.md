# Canonical PLANR issue body

The roadmap app is generated **from** these issue bodies. Edit the issue → the app
follows on the next sync. Keep the headings exactly as written; the sync parses them.

```markdown
## Description
<Free prose. This is the authoritative task description shown in the app.>

## Completion criteria
<What "done" means for this task.>

## Risk
<Key risk / why the estimate could move.>

## External dependencies
<Who/what this waits on. Leave "None" if not applicable.>

<!-- PLANR:BEGIN machine-managed scheduling fields — edit the values, keep the fences -->
```planr
days: 10
allocation: 100
startDate: 2026-07-31   # or: none
dependsOn: [T1.1a]      # board IDs; [] if none
include: true
```
<!-- PLANR:END -->
```

Notes:
- **status, effort, priority** are NOT in the body — they come from the board
  (Status column, Effort field, Priority field). Change them on the board.
- **tier** comes from the `Tier N` label.
- `dependsOn` uses **board** task IDs (e.g. `T1.3a`), not the app's old numbering.
