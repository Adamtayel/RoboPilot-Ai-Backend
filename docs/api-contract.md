# RoboPilot — API Contract

`POST /api/robopilot` — the only endpoint. Source of truth for these shapes
is always `src/lib/robopilot/schema.ts`; this document is a human-readable
mirror of it.

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
