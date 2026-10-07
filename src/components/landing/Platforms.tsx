/**
 * The compatibility strip — what the catalog can actually reason about.
 *
 * Built from the catalog file itself, so it cannot overstate coverage: the
 * controllers listed are the ones compatibility checks can run against, with
 * their real logic levels. The "not yet" line is here on purpose. A strip of
 * logos a product does not support is the easiest lie on a landing page, and
 * the first thing an engineer checks.
 */

import approvedComponentsRaw from "@/lib/robopilot/data/approved-components.json";

interface CatalogEntry {
  name: string;
  category: string;
  logicLevelV: number[];
  interface: string;
}

const catalog = approvedComponentsRaw as CatalogEntry[];

const NOT_SUPPORTED_YET = ["STM32", "Jetson", "ROS 2", "BMP280", "coreless motors"];

export function Platforms() {
  const controllers = catalog.filter((c) => c.category === "microcontroller");
  const byCategory = catalog.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1;
    return acc;
  }, {});

  const categoryOrder = ["microcontroller", "sensor", "actuator", "actuator_driver", "power"];

  return (
    <section className="lp-section" id="platforms">
      <div className="lp-section__head">
        <h2>Boards it can check a signal against</h2>
        <p>
          Compatibility is only as real as the specs behind it. These are the
          controllers in the catalog today, with the logic levels every check
          is computed from. Each entry has a datasheet recorded in{" "}
          <code className="mono">docs/source-register.md</code>.
        </p>
      </div>

      <ul className="boards">
        {controllers.map((c) => (
          <li className="board" key={c.name}>
            <span className="board__name">{c.name}</span>
            <span className="board__logic mono">
              {c.logicLevelV.join(" / ")} V
            </span>
          </li>
        ))}
      </ul>

      <div className="coverage">
        <div className="coverage__bars">
          {categoryOrder
            .map((cat) => ({ cat, count: byCategory[cat] ?? 0 }))
            .filter(({ count }) => count > 0)
            .map(({ cat, count }) => (
              <div className="coverage__row" key={cat}>
                <span className="coverage__label">{cat.replace(/_/g, " ")}</span>
                <span className="coverage__track" aria-hidden="true">
                  <span
                    className="coverage__fill"
                    style={{ width: `${(count / catalog.length) * 100}%` }}
                  />
                </span>
                <span className="coverage__count mono">{count}</span>
              </div>
            ))}
        </div>

        <p className="coverage__gap">
          <span>Not in the catalog yet</span>
          <span className="coverage__gap-list mono">{NOT_SUPPORTED_YET.join("  ")}</span>
          Propose one of these and the plan will say it could not verify the
          part, which is the honest answer until someone adds it with a real
          datasheet.
        </p>
      </div>
    </section>
  );
}
