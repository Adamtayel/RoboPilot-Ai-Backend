/**
 * Capabilities, stated as the specific thing each step actually does.
 *
 * Laid out as a numbered sequence with a signal rail down the side rather
 * than as a grid of equal cards — the steps are ordered and dependent, and a
 * card grid would claim they are interchangeable.
 */

const STEPS: { n: string; title: string; body: string; detail: string }[] = [
  {
    n: "01",
    title: "Decomposes the brief into blocks",
    body:
      "Requirements and constraints go in; architecture blocks come out, each with its inputs and outputs named. This is the one step the language model owns.",
    detail: "groq, gemini on failure",
  },
  {
    n: "02",
    title: "Resolves part names against a verified catalog",
    body:
      "A proposed name is matched to a catalog entry by name or alias, then by substring, so \"DHT22 (AM2302) temperature sensor\" still resolves. What does not resolve is labelled not in catalog and priced at nothing — never guessed.",
    detail: "26 parts, each with a datasheet",
  },
  {
    n: "03",
    title: "Checks logic levels, pair by pair",
    body:
      "Every peripheral is compared against every microcontroller in the plan for a logic-level overlap, and the verdict comes with the voltages it was based on. It never claims a pair was physically tested.",
    detail: "I2C, SPI, UART, GPIO, PWM, analog",
  },
  {
    n: "04",
    title: "Fetches real prices, then distrusts them",
    body:
      "Store search pages are fetched at request time and read for a price. A figure outside 0.15× to 6× of the catalog reference is rejected and the catalog price stands — a scraped $0.15 for a $9.50 board is a bug, not a bargain.",
    detail: "egypt and international storefronts",
  },
  {
    n: "05",
    title: "Scores risk from things it can measure",
    body:
      "Dependency depth, unresolved parts, failed pairs and BOM-versus-budget. When nothing is priced it says the budget cannot be assessed, instead of reporting $0.00 as low risk.",
    detail: "schedule, availability, technical, budget",
  },
];

export function Capabilities() {
  return (
    <section className="lp-section" id="capabilities">
      <div className="lp-section__head">
        <h2>Five steps, and only the first one is the model</h2>
        <p>
          A plan is assembled in a fixed order, and each step either produces
          something traceable or says it could not. The division of labour is
          the product.
        </p>
      </div>

      <ol className="steps">
        {STEPS.map((step) => (
          <li className="step" key={step.n}>
            <span className="step__n mono" aria-hidden="true">
              {step.n}
            </span>
            <div className="step__text">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
            <span className="step__detail mono">{step.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
