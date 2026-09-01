# AI_USAGE.md

Required by the program's Submission Checklist. Updated as each module is
built — keep entries honest and specific; "AI wrote it" is not acceptable
without the verification column filled in.

| Module | AI tool used | What was delegated | How it was verified |
|---|---|---|---|
| AI & Backend (`schema.ts`, `providers.ts`, `tools.ts`, `service.ts`, `route.ts`) | Claude (Anthropic) | Full implementation drafted from the module's acceptance criteria and required field list in the workbook | `npm run typecheck` (0 errors) and `npm test` (21/21 passing, including provider-failure and malformed-input paths) run and confirmed working before delivery. Every deterministic function (`estimate_bom`, `check_compatibility`, `project_risk`) has dedicated unit tests with concrete inputs/outputs I can walk through and explain. |
| Integration / Architecture docs (`docs/architecture.md`, `docs/release-checklist.md`, `docs/api-contract.md`, README) | Claude (Anthropic) | Drafted from the actual code structure already built and tested | Cross-checked against the real file paths and schemas in the repo — the diagram and contract doc describe the code as it exists, not an aspirational design. |
| Product UI (`src/app/page.tsx`, `src/components/robopilot/*`, `globals.css`) | Claude (Anthropic) | Full implementation: intake form, idle/loading/error/success states, and result display components, plus a PCB/schematic-inspired design system | `npm run typecheck` passed, `npm run build` (real Next.js production build) compiled the page and API route together, and the built app was started with `ROBOPILOT_STUB_MODE=true` and hit with a real HTTP request — confirmed the page renders and the API returns a correct, schema-shaped plan. |
| Knowledge & Quality (catalog, evaluation matrix) | *(not started)* | | |

## Rules I'm following

- Every deterministic claim (price, compatibility, risk score) traces to
  code in `tools.ts` and data in `approved-components.json` — never to
  something the AI provider generated at request time.
- Before accepting any AI-generated code into the repo, I run the
  typecheck and test suite myself and read through the diff.
- I did not paste any API key, credential, or private data into an AI
  tool at any point.
- Datasheet URLs in the approved catalog were checked against the
  official vendor documentation (Arduino, Espressif, ST, TDK/InvenSense,
  u-blox) rather than accepted as given.

## Remaining questions / things to double check before defense

- Confirm current pricing on the 12 approved components is still roughly
  accurate at demo time (component prices drift).
- Decide whether `check_compatibility()`'s logic-level-only check is
  sufficient for the demo scope, or whether a note about its limitation
  needs to be said out loud during the defense.
