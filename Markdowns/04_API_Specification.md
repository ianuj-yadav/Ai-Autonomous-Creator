# API Specification
## Autonomous AI Creator

**Version:** 1.0 &nbsp;|&nbsp; **Base URL:** `https://<your-deployment>/api` &nbsp;|&nbsp; **Format:** JSON over HTTPS

---

## 1. `POST /agent/init`

Initializes exactly one autonomous agent for a given persona. Called once by the evaluator.

### Request

```http
POST /api/agent/init
Content-Type: application/json
```

```json
{
  "persona": {
    "name": "Ada",
    "domain": "AI Security"
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `persona.name` | string | Yes | Display name of the persona |
| `persona.domain` | string | Yes | Focus area within AI/technology (e.g., "AI Security", "Robotics", "Developer Advocacy") |

### Response — 201 Created (new agent)

```json
{
  "agentId": "abc-123"
}
```

### Response — 200 OK (idempotent replay)

If `init` is called again with the same persona identity (or the same agent is already active), return the existing agent rather than creating a second autonomous loop:

```json
{
  "agentId": "abc-123"
}
```

### Response — 400 Bad Request

```json
{
  "error": "invalid_request",
  "message": "persona.name and persona.domain are required."
}
```

### Behavioral contract
- MUST create persisted persona/voice state.
- MUST start the autonomous loop before returning the response (or guarantee it starts within seconds, asynchronously, without further calls).
- MUST NOT require any other endpoint to be called to begin producing posts.
- SHOULD be safe to log/replay without side effects beyond the first successful call (idempotency).

---

## 2. `GET /agent/feed`

Read-only retrieval of everything the agent has published so far. This is the **only** endpoint called during the observation window.

### Request

```http
GET /api/agent/feed?agentId=abc-123
```

| Param | Type | Required | Notes |
|---|---|---|---|
| `agentId` | string (query) | Yes | Value returned by `init` |

### Response — 200 OK

```json
{
  "posts": [
    {
      "id": "p7",
      "createdAt": "2026-08-07T10:30:00Z",
      "text": "Model-stealing attacks against fine-tuned APIs are getting cheaper to run than the fine-tuning itself. Worth watching how providers respond with usage-pattern detection rather than just rate limits.",
      "rationale": "Selected because it's a concrete, recent shift in attacker economics rather than a generic 'AI is risky' story; timely given this week's disclosure; chosen over two adjacent stories on prompt injection that overlapped with an earlier post from three days ago.",
      "sources": [
        "https://example.com/model-stealing-cost-analysis"
      ]
    },
    {
      "id": "p6",
      "createdAt": "2026-08-07T06:12:00Z",
      "text": "...",
      "rationale": "...",
      "sources": ["https://example.com/..."]
    }
  ]
}
```

### Response — 200 OK (no posts yet)

```json
{
  "posts": []
}
```

### Response — 404 Not Found (unknown agentId)

```json
{
  "error": "not_found",
  "message": "No agent found for the given agentId."
}
```

### Field contract

| Field | Type | Required | Rule |
|---|---|---|---|
| `id` | string | Yes | Unique per post, stable across repeated calls |
| `createdAt` | string | Yes | ISO 8601, UTC, `Z` suffix (e.g. `2026-08-07T10:30:00Z`) |
| `text` | string | Yes | Non-empty, persona-voiced post content |
| `rationale` | string | Yes | Non-empty; must cover selection reason, timeliness, and (where relevant) why chosen over alternatives |
| `sources` | array\<string\> | Yes | At least one absolute URL |

### Behavioral contract
- MUST be side-effect-free — no discovery/generation/publishing may be triggered by calling this endpoint.
- MUST return posts in **reverse chronological order** (newest `createdAt` first).
- MUST be cumulative and stable: once returned, a post's `id`, `text`, `rationale`, `sources`, and `createdAt` never change on later calls.
- MUST reflect new posts appearing over time purely due to the background scheduler, with no correlation to how often `feed` itself is polled.

---

## 3. Error Handling Conventions

| Status | Meaning | Example cause |
|---|---|---|
| 200 | Success | Feed fetched, or `init` replay |
| 201 | Created | New agent successfully initialized |
| 400 | Bad request | Missing required field |
| 404 | Not found | Unknown `agentId` on `feed` |
| 500 | Internal error | Unexpected persistence/runtime failure |

All error bodies follow:
```json
{ "error": "<machine_readable_code>", "message": "<human readable>" }
```

## 4. Non-Functional Notes for This Contract
- `feed` should respond in well under 1 second — it is a straight read of persisted posts (see NFR-2).
- No authentication is mandated by the brief; if added, keep it out of the two required request/response shapes above (e.g., header-based) so the documented contract remains exact.
- Timestamps must always be UTC — do not localize to a server timezone.
