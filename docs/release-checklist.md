# RoboPilot — Release Checklist

Owner: Integration Lead (Adam). Update this before every deployment; keep a
copy of the completed checklist as submission evidence.

## Build & tests
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test` passes (unit + API tests)
- [ ] `npm run build` (Next.js production build) completes without errors
- [ ] No `console.log` of secrets anywhere in `src/`

## Security
- [ ] `GROQ_API_KEY` / `GEMINI_API_KEY` are set only in Vercel project
      settings, never committed to the repo
- [ ] `.env.local` is in `.gitignore`
- [ ] Request body size limit is enforced (`MAX_BODY_BYTES` in `route.ts`)
- [ ] Malformed / oversized / invalid requests return safe 4xx errors with
      no stack trace or provider error text
- [ ] Provider failure returns a generic 502 message — API key names never
      appear in a response body or log line reachable by the client

## Grounding & tools
- [ ] Every component the API can recommend traces to a real datasheet URL
      in `approved-components.json`
- [ ] `not_in_catalog` components are never priced or marked compatible
- [ ] `check_compatibility()` / `estimate_bom()` / `project_risk()` are
      covered by unit tests with both pass and fail cases

## Deployment
- [ ] Production environment variables confirmed in Vercel
- [ ] Preview deployment smoke-tested with a real request
- [ ] Production URL smoke-tested with a real request after deploy
- [ ] Rollback plan: previous Vercel deployment can be promoted back
      instantly from the dashboard if the new release fails smoke tests

## Documentation
- [ ] `README.md` setup steps work from a clean clone
- [ ] `docs/architecture.md` matches the actual deployed system
- [ ] Known limitations are documented and current
- [ ] `AI_USAGE.md` reflects what AI tools were used and how the output was
      verified

## Evaluation evidence
- [ ] 10-case evaluation matrix completed (`docs/evaluation.md`)
- [ ] Prompt-injection / adversarial cases included and passing
- [ ] Not-found / unresolved-component case demonstrated

---
**Last completed:** _(fill in date + who ran it)_
**Result:** _(pass / issues found — list them)_
