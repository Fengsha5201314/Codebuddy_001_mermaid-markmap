# `fengsha.plan/v1`

Use this strict JSON format for ordinary business workflows and swimlanes. IDs start with a letter and contain only letters, numbers, `.`, `_`, or `-`.

```json
{
  "schemaVersion": "fengsha.plan/v1",
  "diagramType": "workflow",
  "title": "采购审批",
  "direction": "LR",
  "lanes": [
    { "id": "requester", "label": "申请人" },
    { "id": "approver", "label": "审批人" }
  ],
  "nodes": [
    { "id": "start", "type": "start", "label": "开始", "lane": "requester", "column": 0 },
    { "id": "submit", "type": "process", "label": "提交申请", "lane": "requester", "column": 1 },
    { "id": "approve", "type": "decision", "label": "审批通过？", "lane": "approver", "column": 2 },
    { "id": "done", "type": "end", "label": "完成", "lane": "requester", "column": 3 }
  ],
  "edges": [
    { "id": "e1", "source": "start", "target": "submit", "kind": "normal" },
    { "id": "e2", "source": "submit", "target": "approve", "kind": "normal" },
    { "id": "e3", "source": "approve", "target": "done", "label": "通过", "kind": "yes" },
    { "id": "e4", "source": "approve", "target": "submit", "label": "退回", "kind": "return" }
  ]
}
```

Supported node types: `start`, `end`, `process`, `decision`, `document`, `data`, `system`, `manual`, `note`. Supported edge kinds: `normal`, `yes`, `no`, `return`, `exception`.

Do not add unknown fields. Keep business text in `label`; use `column` only as a deterministic ordering/layout hint.
