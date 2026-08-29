# Diagnostic handling

Quality failures use stable fields:

- `code`: machine-readable rule, such as `layout/text-overflow`.
- `subject`: the node, edge, lane, source, or artifact that failed.
- `evidence`: measured width, height, overlap, reference, or other facts.
- `supportedFixes`: operations the local tool understands.

Common local repairs:

| Code | Preferred repair |
|---|---|
| `layout/text-overflow` | Wrap the named label, grow only that node, or shorten that label without changing meaning. |
| `layout/node-overlap` | Increase spacing or move one named node. |
| `layout/lane-overflow` | Grow the named lane or reflow its nodes. |
| `structure/missing-reference` | Correct the named edge reference; do not regenerate unrelated nodes. |
| `artifact/canvas-clipped` | Move negative-coordinate content or expand the canvas. |
| `artifact/canvas-too-large` | Split the diagram or change direction/spacing. |

Stop after two repair attempts and report the remaining diagnostic codes. Never hide a failed check by switching to `standard` unless the user requests a draft-quality output.
