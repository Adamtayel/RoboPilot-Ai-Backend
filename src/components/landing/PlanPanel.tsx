/**
 * A worked example of what the tool returns — computed, not transcribed.
 *
 * This is a server component, and it calls the same three deterministic
 * functions the API route calls (`tools.ts` makes no network or AI calls, so
 * it is safe to run at build time). Nothing on this panel is a number a
 * designer typed in: the prices are the catalog's, the compatibility verdicts
 * and their wording are whatever check_compatibility() returns for this
 * parts list, and the risks are project_risk()'s own output and scores.
 *
 * The point of doing it this way: a marketing panel with hand-written
 * figures could drift from the product, or flatter it. This one cannot — if
 * a catalog price changes, this section changes with it, and if the risk
 * wording regresses, it regresses here in public.
 *
 * Live store prices are deliberately NOT fetched here. They would make the
 * page slow and non-reproducible, and a stale scraped figure printed as
 * fact is the exact failure mode the product refuses. The copy says so.
 */

import {
  check_compatibility,
  estimate_bom,
  project_risk,
  type ComponentSelection,
} from "@/lib/robopilot/tools";

const EXAMPLE_BRIEF = "Obstacle-avoiding rover, 3.3 V ESP32, budget $80";
const EXAMPLE_BUDGET_USD = 80;

const SELECTIONS: ComponentSelection[] = [
  { role: "microcontroller", candidateName: "ESP32-WROOM-32 DevKit", quantity: 1 },
  { role: "distance sensor", candidateName: "HC-SR04", quantity: 1 },
  { role: "motor driver", candidateName: "L298N", quantity: 1 },
  { role: "steering servo", candidateName: "MG996R", quantity: 2 },
];

const MILESTONES = ["Sensing", "Control", "Actuation"].map((name, i, all) => ({
  name: `Build: ${name}`,
  description: `Implement, wire and validate the ${name} block.`,
  dependsOn: i === 0 ? [] : [`Build: ${all[i - 1]}`],
  estimatedDays: 3,
}));

export function PlanPanel() {
  const bom = estimate_bom(SELECTIONS);
  const checks = check_compatibility(SELECTIONS);
  const risks = project_risk(MILESTONES, {
    unresolvedComponentCount: bom.unresolvedCount,
    totalComponentCount: SELECTIONS.length,
    incompatiblePairCount: checks.filter((c) => !c.compatible).length,
    totalEstimatedDays: MILESTONES.reduce((s, m) => s + m.estimatedDays, 0),
    budgetUsd: EXAMPLE_BUDGET_USD,
    bomTotalUsd: bom.totalUsd,
  });

  const failed = checks.filter((c) => !c.compatible);
  const passed = checks.filter((c) => c.compatible);

  return (
    <section className="lp-section" id="how-it-works">
      <div className="lp-section__head">
        <h2>Every number here was computed, not written</h2>
        <p>
          The model decomposes the brief and names candidate parts. From there
          the application takes over: prices come from the verified catalog,
          compatibility from datasheet logic levels, risk from measurable
          inputs. Ask the model for a price and it has nowhere to put one —
          the schema it answers in has no price field at all.
        </p>
      </div>

      <div className="plan-panel">
        <div className="plan-panel__bar">
          <span className="plan-panel__route mono">POST /api/robopilot</span>
          <span className="plan-panel__brief">{EXAMPLE_BRIEF}</span>
        </div>

        <div className="plan-panel__grid">
          <div className="plan-block">
            <h3>Bill of materials</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit</th>
                    <th className="num">Line</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.lines.map((line) => (
                    <tr key={line.name}>
                      <td>{line.name}</td>
                      <td className="num mono">{line.quantity}</td>
                      <td className="num mono">${line.unitPriceUsd.toFixed(2)}</td>
                      <td className="num mono">${line.totalPriceUsd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="plan-total">
              <span>
                Catalog total <strong className="mono">${bom.totalUsd.toFixed(2)}</strong>
              </span>
              <span className="plan-total__note">
                In the live tool, a real store price replaces a unit price when
                a store responds and the figure survives a plausibility check.
                Catalog figures are shown here so this example stays
                reproducible.
              </span>
            </p>
          </div>

          <div className="plan-block">
            <h3>What the checks caught</h3>

            {failed.map((check) => (
              <div className="check check--fail" key={`${check.componentA}-${check.componentB}`}>
                <p className="check__verdict">
                  <span className="check__tag">incompatible</span>
                  <span className="check__iface mono">{check.interface}</span>
                </p>
                <p className="check__body">{check.reason}</p>
              </div>
            ))}

            {passed.slice(0, 1).map((check) => (
              <div className="check check--pass" key={`${check.componentA}-${check.componentB}`}>
                <p className="check__verdict">
                  <span className="check__tag">compatible</span>
                  <span className="check__iface mono">{check.interface}</span>
                </p>
                <p className="check__body">{check.reason}</p>
              </div>
            ))}

            {risks.slice(0, 2).map((risk) => (
              <div className="check check--risk" key={risk.category}>
                <p className="check__verdict">
                  <span className="check__tag">{risk.category.replace(/_/g, " ")} risk</span>
                  <span className="check__iface mono">score {risk.score}/9</span>
                </p>
                <p className="check__body">{risk.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
