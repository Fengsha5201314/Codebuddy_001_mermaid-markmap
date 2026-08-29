---
name: fengsha-diagram
description: Generate, validate, repair, and deliver professional Mermaid or draw.io workflow diagrams through the local fengsha-diagram CLI when a user asks for a flowchart, swimlane diagram, or high-resolution diagram artifact.
---

# Fengsha Diagram

Use the installed `fengsha-diagram` command. The desktop window does not need to be open; every call starts an isolated hidden renderer and exits after completion.

## Reliable workflow

1. For a new business workflow, prefer `fengsha.plan/v1`; for non-workflow Mermaid types, author Mermaid directly. Read [references/fengsha-plan-v1.md](references/fengsha-plan-v1.md) only when creating a plan.
2. Deliver with one command:

   ```powershell
   fengsha-diagram deliver input.mmd -o output.png --quality professional --receipt output.receipt.json --json
   ```

3. Parse the final JSON line. Treat `acceptance: provisional` and `visualReview: pending` honestly: automated geometry passed, but aesthetics and business meaning were not human-approved.
4. If exit code `6` is returned, read the receipt/diagnostics, change only the named `subject`, and use only a listed `supportedFixes` action. Retry at most twice. Read [references/diagnostics.md](references/diagnostics.md) when a quality failure occurs.
5. Do not use `--force` unless the user explicitly permits replacing the named artifact. A failed delivery must leave the previous artifact untouched.
6. Keep input, output, and receipt on three distinct paths. When several agents may target the same file, treat exit code `2` as a safe lock conflict and retry with a different output name or after the other task finishes.

Do not claim that automated checks prove the process is factually correct. Ask the user or a vision-capable reviewer to approve semantics and aesthetics when final publication requires it.

## Useful commands

```powershell
fengsha-diagram visual-check input.mmd --quality professional --json
fengsha-diagram compile plan.json --target mermaid -o process.mmd --json
fengsha-diagram compile plan.json --target drawio -o process.drawio --json
fengsha-diagram deliver process.drawio -o process.png --quality professional --receipt process.receipt.json --json
fengsha-diagram render input.mmd -o draft.svg --quality standard --json
```

Use `deliver` for final artifacts, `visual-check` for read-only inspection, `compile` for editable sources, and `render` only for drafts.
