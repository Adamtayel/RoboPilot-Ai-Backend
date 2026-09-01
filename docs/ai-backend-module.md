# AI & Backend Module

> This document covers the AI/Backend module specifically. For the whole
> RoboPilot project (setup, all four modules, deployment), see the
> [top-level README](../README.md) and [docs/architecture.md](./architecture.md).

Owner: **Youssef Mashhour** — AI & Backend Engineer, Team 05 (RoboPilot)
Scope: everything behind `POST /api/robopilot` — validation, AI decomposition,
provider fallback, and the three deterministic tools.

## 1. What this module does

```
Client (Product UI)
   │  POST /api/robopilot  { projectName, requirements, constraints, budgetUsd, targetPlatform }
   ▼
route.ts            — parses + size-limits the body, validates with Zod, maps errors to safe HTTP codes
   ▼
service.ts           — orchestrates the whole request
   ▼
providers.ts         — asks Groq (fallback: Gemini) for a STRICT-schema decomposition:
                        architecture_blocks + proposed_components + assumptions ONLY
   ▼
tools.ts              — deterministic, AI-free:
                        estimate_bom()        → priced components, traceable to the approved catalog
                        check_compatibility()  → logic-level checks between MCU and peripherals
                        project_risk()          → schedule / component / technical / budget risk, scored
   ▼
service.ts            — assembles + re-validates the final RoboPilotPlan against schema.ts
   ▼
route.ts              — returns 200 with the typed plan, or a safe error
```

**Design rule this module enforces end-to-end:** the language model never
computes a price, a compatibility verdict, a milestone date, or a risk score.
It only proposes *what* to build; every number in the response comes from
`tools.ts` and the approved component catalog. This is what the workbook's
acceptance criterion means by *"Every recommended component must be
traceable to an approved datasheet and pass documented voltage/interface
compatibility rules."*

## 2. File map

| File | Responsibility |
|---|---|
| `src/lib/robopilot/schema.ts` | All Zod contracts: input, AI-decomposition, tool outputs, final response |
| `src/lib/robopilot/prompt.ts` | System/user prompt + the strict JSON Schema sent to the providers |
| `src/lib/ai/providers.ts` | Provider-agnostic `generateStructured()`: Groq → Gemini fallback, timeouts, typed `ProviderError` |
| `src/lib/robopilot/tools.ts` | `estimate_bom()`, `check_compatibility()`, `project_risk()` — pure, deterministic, unit-tested |
| `src/lib/robopilot/data/approved-components.json` | The trusted starting dataset (12 components with datasheet URLs) |
| `src/lib/robopilot/service.ts` | Orchestration: calls AI, runs tools, assembles + re-validates the final plan |
| `src/app/api/robopilot/route.ts` | Next.js Route Handler — the only place that talks HTTP |
| `tests/unit/tools.test.ts` | 14 tests on the deterministic tools (no network) |
| `tests/api/robopilot.test.ts` | 7 tests on the route: happy path, invalid, malformed, oversized, method-not-allowed, provider-failure |

## 3. How to wire this into the team's Next.js repo

1. Copy `src/app/api/robopilot/`, `src/lib/ai/`, `src/lib/robopilot/` into the
   team repository at the same paths (adjust `@/*` in `tsconfig.json` if the
   team's alias differs).
2. Copy `tests/` alongside the team's existing test folder, and merge the
   `dependencies`/`devDependencies` from this `package.json` into the team's.
3. Add the environment variables from `.env.example` to the team's `.env.local`
   and to the Vercel project settings (**never commit real keys**).
4. Give the Product UI engineer (Hassan) the input/output shapes from
   `schema.ts` — `RequirementInputSchema` is what he needs to POST, and
   `RoboPilotPlanSchema` is exactly what comes back.
5. Give the Knowledge/Tools engineer (Mina) `data/approved-components.json` —
   she owns growing this catalog; every new component needs a real datasheet
   URL before it's added.

## 4. Running it

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test             # vitest run — 21 tests, no network required (stub mode)
```

To try a real request once `GROQ_API_KEY` / `GEMINI_API_KEY` are set:

```bash
curl -X POST http://localhost:3000/api/robopilot \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "Line-following rover",
    "requirements": ["Detect obstacles within 30cm", "Follow a black line on a white floor"],
    "constraints": ["Budget under $80"],
    "budgetUsd": 80,
    "targetPlatform": "esp32"
  }'
```

Set `ROBOPILOT_STUB_MODE=true` to get deterministic sample data with zero
provider calls — this is what Session 1's "stub Route Handler" step asks for,
and what the UI engineer should build against before real keys exist.

## 5. How this maps to your personal acceptance criteria

- [x] Valid input → response conforms to the documented typed schema (`RoboPilotPlanSchema`, checked twice: once on assembly, once before returning).
- [x] Invalid/malformed input → safe 4xx, provider is never called (see `route.ts`, tested in `robopilot.test.ts`).
- [x] Secrets stay server-side (`route.ts` runs `runtime = "nodejs"`; keys are only read via `process.env` inside `providers.ts`, which is never imported by client code).
- [x] Groq→Gemini fallback is implemented and tested (`generateStructured`, provider-failure test returns a safe 502 with no leaked key names).
- [x] Tool arguments are validated before use — component names are resolved against the approved catalog; unresolved ones are flagged, never guessed.
- [x] Normal, not-found (`not_in_catalog`), timeout, and provider-error paths all have tests.
- [x] Server logs (`console.warn`/`console.error`) never print API keys.
- [x] Every recommended component is traceable to `approved-components.json` and passes the logic-level compatibility rule.

## 6. Known limitations (be ready to defend these)

- The approved catalog currently has 12 components. Anything the model
  proposes outside that list is correctly flagged `not_in_catalog` rather
  than priced — this is intentional, not a bug, but it means the demo should
  stick to requirements that map to common Arduino/ESP32 peripherals.
- `check_compatibility()` only checks logic-level voltage overlap, not full
  electrical characteristics (current draw, pull-up requirements, etc.) —
  documented here so it isn't mistaken for a complete electrical review.
- Milestone estimates are a flat 3 days per architecture block. This is a
  deliberately simple, transparent placeholder — swap in a real estimation
  rule with Mina/Hassan if the team wants something more nuanced before
  Session 4.
