import type { Risk } from "@/lib/robopilot/schema";

function severityClass(risk: Risk): string {
  if (risk.likelihood === "high" || risk.impact === "high") return "risk-item risk-item--high";
  if (risk.likelihood === "medium" || risk.impact === "medium") return "risk-item risk-item--medium";
  return "risk-item risk-item--low";
}

export function RiskList({ risks }: { risks: Risk[] }) {
  if (risks.length === 0) {
    return <p style={{ color: "var(--ink-dim)", fontSize: 13.5 }}>No material risks identified.</p>;
  }

  return (
    <div>
      {risks.map((risk, i) => (
        <div className={severityClass(risk)} key={i}>
          <span className="risk-item__score" aria-hidden="true">
            {risk.score}
          </span>
          <div>
            <p className="risk-item__category">
              <span className="risk-item__name">{risk.category.replace("_", " ")}</span>
              <span className="risk-item__levels mono">
                likelihood {risk.likelihood}
                <span className="risk-item__levels-sep" aria-hidden="true" />
                impact {risk.impact}
              </span>
            </p>
            <p className="risk-item__desc">{risk.description}</p>
            <p className="risk-item__mitigation">{risk.mitigation}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
