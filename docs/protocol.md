# Workflow Engine Protocol v1

The Workflow Agent extension communicates with the Python engine through
newline-delimited JSON (NDJSON). Each message is encoded as a single JSON object
followed by `\n`. The engine processes messages sequentially and emits responses
in the same format.

## Transport Guarantees

- UTF-8 encoded text, newline-terminated (`\n`).
- No frames or binary payloads.
- Messages that cannot be parsed as JSON objects yield an `ERROR` notification.

## Message Catalogue

### Engine → Extension

| Type      | Description                                                                                  |
|-----------|----------------------------------------------------------------------------------------------|
| `READY`   | Engine announces it is ready to receive commands.                                            |
| `PONG`    | Response to a `PING`.                                                                        |
| `LOG`     | Human-readable log entry. Includes optional `level` (`debug` | `info` | `warn` | `error`).   |
| `PROGRESS`| Long-running operation update with `step` (string) and `pct` (0-100).                        |
| `COMPLETE`| Workflow run finished. Carries generated `files[]`, optional `warnings[]`, and `cancelled`.  |
| `ERROR`   | Non-recoverable failure. May include optional `correlationId` to associate with a run.       |
| `ASK_USER`| Placeholder for future human-in-the-loop prompts (not acted upon in sprint 4).               |
| `CHAT_RESPONSE` | Result of a chat prompt. Includes assistant `reply[]`, tool `actions[]`, and hints.    |

### Extension → Engine

| Type           | Description                                                                |
|----------------|----------------------------------------------------------------------------|
| `PING`         | Liveness probe. Engine must respond with `PONG`.                           |
| `RUN_WORKFLOW` | Starts code generation. Carries workflow snapshot and settings.            |
| `CANCEL`       | Requests cancellation for an in-flight run by `correlationId`.             |
| `CHAT_REQUEST` | Natural-language prompt for the chat agent.                                |

## RUN_WORKFLOW Payload

```jsonc
{
  "type": "RUN_WORKFLOW",
  "correlationId": "uuid-v4",
  "yaml": "<stringified workflow>",
  "document": {
    "version": 1,
    "nodes": [
      {
        "id": "LoginForm1",
        "type": "LoginFormComponent",
        "props": {
          "fields": [
            { "name": "username", "type": "string", "required": true },
            { "name": "password", "type": "password", "required": true }
          ],
          "ui": {
            "styleLibrary": "MaterialUI",
            "validation": "basic"
          }
        },
        "position": { "x": 200, "y": 180 }
      },
      {
        "id": "LoginAPI1",
        "type": "LoginAPIEndpoint",
        "props": {
          "method": "POST",
          "path": "/login",
          "auth": "none",
          "formFields": [
            { "name": "username", "type": "string", "required": true },
            { "name": "password", "type": "password", "required": true }
          ],
          "formSourceIds": ["LoginForm1"]
        },
        "position": { "x": 600, "y": 180 }
      }
    ],
    "connections": [{ "from": "LoginForm1", "to": "LoginAPI1" }],
    "rules": {
      "frontend": { "framework": "React", "language": "TS" },
      "backend": { "framework": "NodeExpress", "language": "TS" },
      "coding": { "formatter": "prettier", "style": "airbnb" }
    }
  },
  "settings": {
    "rules": {
      "frontend": { "framework": "React", "language": "TS" },
      "backend": { "framework": "NodeExpress", "language": "TS" },
      "coding": { "formatter": "prettier", "style": "airbnb" }
    }
  }
}
```

Notes:

- `formFields` and `formSourceIds` on API nodes are derived from canvas connections.
- Positions are included for future layout-sensitive processing.
- The `yaml` string mirrors the document for audit/debugging.

## CHAT_REQUEST Payload

```jsonc
{
  "type": "CHAT_REQUEST",
  "correlationId": "uuid-v4",
  "prompt": "login form ekle ve api ile bağla",
  "workflow": {
    "document": { "...": "current engine workflow document" },
    "yaml": "version: 1\nnodes: []\nconnections: []\n"
  }
}
```

- `workflow` is optional; when present it gives the engine context to derive IDs and rules.
- The extension forwards the most recent canvas snapshot (if any).

## CHAT_RESPONSE Payload

```jsonc
{
  "type": "CHAT_RESPONSE",
  "correlationId": "uuid-v4",
  "reply": [
    "LoginForm2 form düğümünü ekliyorum.",
    "LoginForm2 düğümünü LoginAPI1 düğümüne bağlıyorum."
  ],
  "actions": [
    { "type": "add_node", "nodeType": "LoginFormComponent", "nodeId": "LoginForm2" },
    { "type": "connect", "from": "LoginForm2", "to": "LoginAPI1" }
  ],
  "followUps": ["Workflow'u çalıştırmak için `/run` yazabilirsin."]
}
```

Action semantics:

- `new_workflow` → extension clears canvas/yaml.
- `add_node` → new node is appended (ID optional; otherwise extension generates one).
- `connect` → create an edge between two nodes.
- `set_rules` → replace workflow rules object.
- `run_workflow` → extension invokes the existing run command after mutations settle.

## PROGRESS Payload

```jsonc
{
  "type": "PROGRESS",
  "correlationId": "uuid-v4",
  "step": "Compiling generation templates",
  "pct": 55
}
```

The extension maps `pct` to incremental progress and surfaces `step` in the UI.

## COMPLETE Payload

```jsonc
{
  "type": "COMPLETE",
  "correlationId": "uuid-v4",
  "files": [
    { "path": "frontend/LoginForm1.tsx", "content": "// stub..." },
    { "path": "backend/LoginAPI1.ts", "content": "// stub..." }
  ],
  "warnings": ["LoginAPI1 has no form inputs connected."],
  "cancelled": false
}
```

- `warnings` is optional and omitted when empty.
- `cancelled: true` indicates the run stopped after a `CANCEL` request.

## Cancellation

- The extension initiates cancellation by issuing `{"type": "CANCEL", "correlationId": "<id>"}`.
- The engine sets an internal flag and, once safe, responds with `COMPLETE` including `cancelled: true`.

## Error Handling

- Invalid JSON → `ERROR` without `correlationId`.
- Validation errors on a specific run → `ERROR` with matching `correlationId`.
- Concurrent `RUN_WORKFLOW` requests are rejected with an `ERROR` referencing the new `correlationId`.

## Example Exchange

```
Extension → {"type":"PING"}
Engine     → {"type":"PONG"}
Extension → {RUN_WORKFLOW payload}
Engine     → {"type":"LOG","message":"Received workflow with 2 node(s).","correlationId":"..."}
Engine     → {"type":"PROGRESS","step":"Pre-processing workflow graph","pct":10,"correlationId":"..."}
Engine     → {"type":"PROGRESS","step":"Compiling generation templates","pct":55,"correlationId":"..."}
Engine     → {"type":"PROGRESS","step":"Assembling output artifacts","pct":85,"correlationId":"..."}
Engine     → {"type":"PROGRESS","step":"Finalising results","pct":100,"correlationId":"..."}
Engine     → {"type":"COMPLETE","files":[...],"correlationId":"..."}
```

### Chat Example

```
Extension → {"type":"CHAT_REQUEST","correlationId":"1","prompt":"login form ekle ve api ile bağla","workflow":{...}}
Engine     → {"type":"CHAT_RESPONSE","correlationId":"1","reply":["LoginForm2 form düğümünü ekliyorum.","LoginForm2 düğümünü LoginAPI1 düğümüne bağlıyorum."],"actions":[{"type":"add_node","nodeType":"LoginFormComponent","nodeId":"LoginForm2"},{"type":"connect","from":"LoginForm2","to":"LoginAPI1"}]}
Extension → {applies commands to canvas, then optionally `{"type":"RUN_WORKFLOW", ...}`}
```

This document captures the sprint 5 protocol surface shared between the
extension and the Python engine. Later sprints will extend it with interactive
ask-user loops and real file system actions.
