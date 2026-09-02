# RoboPilot — Robotics & Embedded Project Engineering Copilot

Team 05 · AI in Applications program (supervised by Dr. Ahmed Métwalli)

> A robotics project engineering copilot that converts requirements into
> architecture, components, BOM estimates, risks, milestones, and grounded
> component guidance — for robotics clubs, embedded-systems teams, and
> capstone groups.

## Status

| Module | Owner | Status |
|---|---|---|
| AI & Backend (API, schemas, providers, deterministic tools) | Adam Tayel | ✅ Done — see `docs/ai-backend-module.md` |
| Integration / Architecture / Deployment | Adam Tayel | 🟡 In progress — architecture docs done, deployment pending |
| Product UI & Workflow | Youssef Mashhour | ✅ Done — intake form + results view, see §"Product UI" below |
| Knowledge, Tools & Quality | Mina rimon | ⬜ Not started |

*(Team composition changed after the initial assignment — Adam is currently
covering all four roles. See `AI_USAGE.md` for how AI assistance was used
and verified across each module.)*

## Problem

Student robotics teams often begin with exciting ideas but lack structured
requirements, component decisions, risk tracking, and an achievable build
plan.

## Main workflow

Team enters robotics requirements and constraints → system decomposes
requirements → proposes architecture → retrieves approved component
information → checks compatibility/BOM → produces milestones and project
risks.

## Tech stack

- **Next.js** (App Router, Route Handlers) — server boundary
- **TypeScript** + **Zod** — end-to-end typed validation
- **Groq** (primary) → **Gemini** (fallback) — structured-output AI providers
- **Vitest** — unit + API tests
- **Vercel** — deployment target

## Product UI

`src/app/page.tsx` is a client-rendered page with two panels: the intake
form on the left (`IntakeForm.tsx`) and the result panel on the right, which
switches between four explicit states — `idle` (`EmptyState.tsx`),
`loading` (`LoadingState.tsx`), `error` (`ErrorState.tsx`, with a retry
button that resubmits the last request), and `success`
(`PlanResults.tsx`, which composes `ArchitectureFlow`, `BomTable`,
`CompatibilityList`, `MilestoneTimeline`, `RiskList`, `TestPlanList` and
`AssumptionsList`).

Verified end-to-end: `npm run build` compiles both the page and the API
route; `next start` with `ROBOPILOT_STUB_MODE=true` was smoke-tested with a
real HTTP request and the page was confirmed to render.

## Getting started

```bash
git clone <repo-url>
cd robopilot
npm install
cp .env.example .env.local   # fill in GROQ_API_KEY / GEMINI_API_KEY, or set ROBOPILOT_STUB_MODE=true
npm run typecheck
npm test
npm run dev                   # once the Next.js app pages exist
```

## Documentation map

| Doc | What's in it |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | System diagram, module boundaries, deployment plan, known limitations |
| [`docs/ai-backend-module.md`](docs/ai-backend-module.md) | Deep dive on the AI/Backend module specifically |
| [`docs/api-contract.md`](docs/api-contract.md) | Exact request/response shapes for `POST /api/robopilot` |
| [`docs/release-checklist.md`](docs/release-checklist.md) | Pre-deployment checklist, owned by the Integration Lead |
| [`docs/evaluation.md`](docs/evaluation.md) | 10-case evaluation matrix *(to be added in the Knowledge/Quality phase)* |
| [`AI_USAGE.md`](AI_USAGE.md) | AI tools used, what was delegated, and how it was verified |

## Mandatory production features (from the project brief)

- [x] Project intake / requirement decomposition
- [x] Architecture plan (AI-proposed, schema-validated)
- [x] Component knowledge base (approved catalog, 12 parts)
- [x] BOM estimator (`estimate_bom`)
- [x] Compatibility checker (`check_compatibility`)
- [x] Risk register (`project_risk`)
- [x] Milestone plan
- [x] Project wizard UI (`src/app/page.tsx` + `src/components/robopilot/`)
- [ ] Troubleshooting knowledge assistant / expanded catalog
- [ ] Public deployment

## Out of scope (by design)

Safety-critical design approval, automatic purchasing, unsupported
components, or claiming physical testing that was not performed.

## Known limitations

See `docs/architecture.md` §6 — most notably: the approved catalog covers 12
common hobbyist components today, and this is currently a single-owner
project rather than a four-person team, which changes how the "integration
review" step in the program's `HOW TO WORK` sheet is satisfied (self-review
against the architecture doc and release checklist, documented here for
transparency).

## License / academic context

Built as part of the "AI in Applications" training program. Not for
production/commercial use without further hardening (see limitations above).
