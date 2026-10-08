# RoboPilot — API Contract

Two endpoints:

- `POST /api/robopilot` — produces a plan. Shapes in
  `src/lib/robopilot/schema.ts`.
- `POST /api/robopilot/chat` — conversational intake that fills the plan
  request. Shapes in `src/lib/robopilot/chat-schema.ts`. It does **not**
  produce a plan; it produces the input for one.

Those schema files are the source of truth; this document mirrors them for
humans.

## Request

```http
POST /api/robopilot
Content-Type: application/json
```

```json
{
  "projectName": "Line-following rover",
  "requirements": [
    "Detect obstacles within 30cm",
    "Follow a black line on a white floor"
  ],
  "constraints": ["Budget under $80"],
  "budgetUsd": 80,
  "targetPlatform": "esp32"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectName` | string (3–120 chars) | Yes | |
| `requirements` | string[] (1–20 items, 3–500 chars each) | Yes | Must have at least one |
| `constraints` | string[] (0–20 items) | No | Defaults to `[]` |
| `budgetUsd` | number (0–100000) | No | Enables the budget risk check when present |
| `targetPlatform` | `"arduino" \| "esp32" \| "unspecified"` | No | Defaults to `"unspecified"` |

## Success response — `200`

```json
{
  "requirements": [ "..." ],
  "constraints": [ "..." ],
  "architecture_blocks": [
    { "name": "Sensing", "purpose": "...", "inputs": ["..."], "outputs": ["..."] }
  ],
  "components": [
    {
      "role": "microcontroller",
      "name": "ESP32-WROOM-32 DevKit",
      "quantity": 1,
      "unitPriceUsd": 9.5,
      "totalPriceUsd": 9.5,
      "datasheetUrl": "https://docs.espressif.com/...",
      "status": "approved"
    }
  ],
  "compatibility_checks": [
    {
      "componentA": "ESP32-WROOM-32 DevKit",
      "componentB": "HC-SR04",
      "interface": "GPIO",
      "compatible": false,
      "reason": "HC-SR04 operates at 5V logic but ESP32-WROOM-32 DevKit only supports 3.3V — a logic-level shifter is required on GPIO."
    }
  ],
  "bom_items": [ "... same shape as components ..." ],
  "bom_total_usd": 17.5,
  "milestones": [
    { "name": "Build: Sensing", "description": "...", "dependsOn": [], "estimatedDays": 3 }
  ],
  "risks": [
    {
      "category": "technical",
      "description": "...",
      "likelihood": "medium",
      "impact": "high",
      "score": 6,
      "mitigation": "..."
    }
  ],
  "tests": [
    { "target": "Sensing", "description": "...", "expectedResult": "..." }
  ],
  "assumptions": [
    { "statement": "...", "reason": "..." }
  ],
  "meta": {
    "provider_used": "groq",
    "generated_at": "2026-08-29T12:00:00.000Z",
    "warnings": []
  }
}
```

## Error responses

| Status | When | Body shape |
|---|---|---|
| `400` | Malformed JSON, or fails `RequirementInputSchema` | `{ "error": string, "issues"?: [{ "path": string, "message": string }] }` |
| `405` | Any method other than `POST` | `{ "error": "Method not allowed. Use POST." }` |
| `413` | Body exceeds 20,000 bytes | `{ "error": "Request body is too large." }` |
| `502` | Both AI providers failed, or the AI response didn't match its schema | `{ "error": string, "code": "PROVIDER_UNAVAILABLE" \| "AI_SCHEMA_MISMATCH" }` |
| `500` | Unexpected server error | `{ "error": "An unexpected error occurred." }` |

Frontend integration guidance: treat `warnings` in `meta` as non-fatal —
render them (e.g. "2 components could not be matched to the approved
catalog") without blocking the rest of the plan from displaying.


---

# `POST /api/robopilot/chat`

Collects the four things a plan needs — `projectName`, `requirements`,
`constraints` and a budget — through conversation, then hands them to the
plan endpoint above. The model powering it is given an output schema with no
price, compatibility or risk field, for the same reason the plan model is.

## Request

```json
{
  "messages": [
    { "role": "user", "content": "A small rover that avoids obstacles" },
    { "role": "assistant", "content": "What does it have to do?" },
    { "role": "user", "content": "Detect obstacles within 30cm and stop" }
  ],
  "collected": {
    "projectName": "Obstacle rover",
    "requirements": [],
    "constraints": [],
    "budgetAmount": null,
    "budgetCurrency": null,
    "targetPlatform": "unspecified"
  },
  "priceRegion": "egypt"
}
```

`messages` must end with a `user` turn, 1–40 entries, each ≤ 2000 chars.
`collected` is the state returned by the previous turn; omit it on the first
message. The conversation is stateless on the server — the client carries the
slots, exactly as it carries the transcript.

## Success response — `200`

```json
{
  "reply": "Anything it has to work within — size, power, a deadline?",
  "collected": { "...": "the full accumulated slot state" },
  "missing": ["constraints", "budget"],
  "ready": false,
  "meta": { "provider_used": "groq", "priceClaimRedacted": false }
}
```

| Field | Meaning |
|---|---|
| `reply` | The message to show the user. |
| `collected` | Full slot state after this turn. Slots only ever grow: a value the model omits is carried forward from the previous state, so a forgetful turn cannot erase an answer the user already gave. |
| `missing` | Which of the four are still outstanding. Computed from the slots by `missingSlots()` — **the model's own `readyToPlan` is discarded**, so an over-eager model cannot push a half-filled brief into the planner. |
| `ready` | `missing.length === 0`. |
| `meta.priceClaimRedacted` | `true` when the model's reply contained something shaped like money and was replaced wholesale. See below. |

## The price guard

`redactPriceClaims()` in `chat-service.ts` inspects every reply before it
leaves the server. If it matches a money-shaped pattern — a currency symbol
and a figure, a figure and a currency word in English, Arabic or Franco
transliteration — the entire reply is replaced with a refusal rather than
patched, because a sentence built around a figure stops making sense once the
figure is cut out of it.

The system prompt already forbids quoting prices. This exists because a prompt
is a request, not a guarantee, and "roughly how much will this cost?" is both
the most natural question a user can ask and the most natural thing for a
model to answer. Regression tests in `tests/unit/chat-service.test.ts` and
`tests/api/chat.test.ts` cover it, including a model that insists.

A false positive costs one stiff reply. A false negative costs the one
property the whole product is built on.

## Error responses

| Status | When | Body shape |
|---|---|---|
| `400` | Malformed JSON, fails `ChatRequestSchema`, or no user message | `{ "error": string, "issues"?: [...] }` |
| `405` | Any method other than `POST` | `{ "error": "Method not allowed. Use POST." }` |
| `413` | Body exceeds 40,000 bytes | `{ "error": "Conversation is too long." }` |
| `502` | Both providers failed, or the reply didn't match its schema | `{ "error": string, "code": "PROVIDER_UNAVAILABLE" \| "AI_SCHEMA_MISMATCH" }` |

A `502` here is not fatal to the product: the form is always available and
the client is expected to say so, which is what `ChatPanel` does.
