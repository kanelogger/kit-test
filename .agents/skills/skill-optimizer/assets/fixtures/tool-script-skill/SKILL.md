---
name: tool-script-skill
description: Use when the user asks to normalize a CSV file into canonical JSON with deterministic validation. Do not use for spreadsheet analysis or chart creation.
---

# Tool Script Skill

Normalize CSV rows into canonical JSON.

Workflow:

1. Validate the input path.
2. Run `scripts/normalize.ts`.
3. Return the output path and validation summary.

Failure guard: if the CSV is missing required columns, stop and report recoverable next steps.
