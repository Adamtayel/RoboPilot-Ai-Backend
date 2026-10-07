/**
 * "For teams" — but written as the integration surface, since that is the
 * only thing a team actually needs from this: one endpoint, one contract,
 * and a way to run it without spending provider credit.
 */

const REQUEST = `{
  "projectName": "Obstacle-avoiding rover",
  "requirements": ["Detect obstacles within 30cm"],
  "constraints": ["Budget under $80"],
  "budgetUsd": 80,
  "targetPlatform": "esp32",
  "priceRegion": "egypt"
}`;

const FACTS: { term: string; def: string }[] = [
  {
    term: "One endpoint",
    def: "POST /api/robopilot. JSON in, a validated plan out. No SDK, no client library, no auth to wire up.",
  },
  {
    term: "Validated at both ends",
    def: "The request is parsed against a Zod schema before anything is spent, and the assembled plan is parsed again before it is returned. A malformed plan fails loudly rather than reaching your UI.",
  },
  {
    term: "Runs without provider keys",
    def: "Set ROBOPILOT_STUB_MODE=true and the route returns a canned decomposition with the real deterministic pipeline behind it. The test suite runs this way; so can your CI.",
  },
  {
    term: "Fails to a known state",
    def: "Both providers down returns 502 with a code and no internals. Live pricing failing anywhere keeps catalog prices. An oversized body is refused at 20,000 bytes.",
  },
];

export function Toolchain() {
  return (
    <section className="lp-section" id="toolchain">
      <div className="lp-section__head">
        <h2>Wire it into whatever you already use</h2>
        <p>
          The web app is one client of the API, not the product boundary. If
          your team keeps its BOM in a sheet or a tracker, the plan is JSON on
          the way there.
        </p>
      </div>

      <div className="toolchain">
        <pre className="code-block mono" aria-label="Example request body">
          <code>{REQUEST}</code>
        </pre>

        <dl className="facts">
          {FACTS.map((f) => (
            <div className="fact" key={f.term}>
              <dt>{f.term}</dt>
              <dd>{f.def}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
