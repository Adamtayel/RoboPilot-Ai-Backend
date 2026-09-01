# RoboPilot — Architecture

Team 05. Owner of this document: Adam (Integration Lead / Solution Architect).

## 1. What RoboPilot does

RoboPilot turns a robotics team's requirements into a grounded engineering
plan: architecture blocks, a priced Bill of Materials, compatibility checks,
milestones, and project risk — without ever letting the AI invent a price,
a compatibility verdict, or a fabricated datasheet.

## 2. End-to-end data flow

```
┌──────────────┐        1. POST /api/robopilot
│   Browser    │  { projectName, requirements, constraints, budgetUsd }
│ (Product UI) │───────────────────────────────────────────────────────┐
└──────────────┘                                                       │
       ▲                                                                ▼
       │ 6. 200 RoboPilotPlan JSON                          ┌───────────────────┐
       │    (or safe 4xx/5xx error)                         │  route.ts          │
       │                                                     │  Next.js Route     │
       │                                                     │  Handler (server)  │
       │                                                     │  - size limit      │
       │                                                     │  - Zod validation  │
       │                                                     └─────────┬─────────┘
       │                                                               │ 2. validated input
       │                                                               ▼
       │                                                     ┌───────────────────┐
       │                                                     │  service.ts        │
       │                                                     │  orchestration     │
       │                                                     └──┬─────────────┬──┘
       │                                        3. decompose    │             │ 4. deterministic
       │                                        requirements    ▼             ▼    tools
       │                                              ┌─────────────────┐ ┌──────────────────┐
       │                                              │  providers.ts    │ │  tools.ts          │
       │                                              │  Groq → Gemini   │ │  estimate_bom()     │
       │                                              │  (structured     │ │  check_compatibility│
       │                                              │   JSON output)   │ │  project_risk()      │
       │                                              └────────┬─────────┘ └─────────┬────────┘
       │                                                       │ architecture_blocks   │ priced/checked
       │                                                       │ proposed_components   │ against catalog
       │                                                       ▼                        ▼
       │                                              ┌──────────────────────────────────────┐
       │                                              │  approved-components.json (12 parts)   │
       │                                              │  every price/voltage/interface claim   │
       │                                              │  traces back to this file's datasheet  │
       │                                              │  URL — nothing here is AI-generated.   │
       │                                              └──────────────────────────────────────┘
       │                                                               │ 5. assembled + re-validated
       └───────────────────────────────────────────────────────────────┘   against RoboPilotPlanSchema
```

## 3. Module boundaries (who owns what)

| Boundary | Lives in | Rule |
|---|---|---|
| Browser ↔ Server | `src/app/**/page.tsx` (UI) vs. `src/app/api/**/route.ts` | The UI never talks to Groq/Gemini directly. No API key ever ships to the client bundle. |
| Server ↔ AI provider | `src/lib/ai/providers.ts` | Only this file reads `GROQ_API_KEY` / `GEMINI_API_KEY`. Structured-output schema in, parsed JSON out — no free text ever reaches the rest of the app un-validated. |
| AI output ↔ deterministic logic | `src/lib/robopilot/service.ts` | The AI decomposition (`AIDecompositionSchema`) is the *only* AI-influenced data. Every price, compatibility verdict, milestone, and risk score is computed by `tools.ts`, which never calls a network request. |
| Data boundary | `src/lib/robopilot/data/approved-components.json` | The single trusted source for component prices/voltages/datasheets. Anything the AI proposes that isn't in here is flagged `not_in_catalog`, never priced or claimed compatible. |

## 4. Environment configuration

See [`.env.example`](../.env.example). Required for production:

| Variable | Purpose | Required? |
|---|---|---|
| `GROQ_API_KEY` | Primary AI provider | Yes (unless `ROBOPILOT_STUB_MODE=true`) |
| `GEMINI_API_KEY` | Fallback AI provider | Yes (unless `ROBOPILOT_STUB_MODE=true`) |
| `GROQ_MODEL` / `GEMINI_MODEL` | Model overrides | No — sane defaults are set in code |
| `ROBOPILOT_STUB_MODE` | Skip real provider calls, return deterministic sample data | No — `false` in production |

No secret is ever committed to the repository. `.env.local` is gitignored;
production values are set directly in the Vercel project settings.

## 5. Deployment plan (Vercel)

1. Connect the GitHub repository to a new Vercel project.
2. Set `GROQ_API_KEY`, `GEMINI_API_KEY` (and optional model overrides) in
   **Project Settings → Environment Variables** for the Production
   environment. Leave `ROBOPILOT_STUB_MODE` unset (defaults to off).
3. Every push to `main` triggers a production deployment; every PR gets a
   preview deployment — use the preview URL to smoke-test before merging.
4. Post-deploy smoke test: `POST` a real request to
   `https://<deployment>/api/robopilot` and confirm a `200` with a
   schema-valid body (see `docs/release-checklist.md`).

## 6. Known limitations

- The approved component catalog currently covers 12 common Arduino/ESP32
  hobbyist parts. Requirements that need parts outside that set will
  correctly come back as `not_in_catalog` rather than priced — see
  `docs/ai-backend-module.md` for how to extend the catalog safely.
- `check_compatibility()` checks logic-level voltage overlap only, not full
  electrical characteristics (current draw, pull-ups, timing).
- No persistence layer yet — every request is stateless; nothing is saved
  between calls. If "save this plan" becomes a requirement, it needs its own
  design pass (storage choice, auth boundary) before implementation.
- Single-owner project: normally this module boundary table maps to four
  different people; here Adam owns all four roles, so the "integration
  review" step described in `HOW TO WORK` is a self-review against this
  document and the release checklist rather than a peer PR review.
