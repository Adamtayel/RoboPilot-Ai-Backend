import type { RoboPilotPlan } from "@/lib/robopilot/schema";
import { ArchitectureFlow } from "./ArchitectureFlow";
import { BomTable } from "./BomTable";
import { CompatibilityList } from "./CompatibilityList";
import { MilestoneTimeline } from "./MilestoneTimeline";
import { RiskList } from "./RiskList";
import { TestPlanList, AssumptionsList } from "./AssumptionsList";

export function PlanResults({ plan }: { plan: RoboPilotPlan }) {
  return (
    <div>
      <div className="panel" style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-dim)" }}>
          generated {new Date(plan.meta.generated_at).toLocaleString()}
        </span>
        <span className="header__badge">provider: {plan.meta.provider_used}</span>
      </div>

      {plan.meta.warnings.length > 0 && (
        <div className="warnings" style={{ marginTop: 16 }}>
          <p className="warnings__title">Warnings</p>
          <ul>
            {plan.meta.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="section">
        <div className="section__head">
          <h2 className="section__title">Architecture</h2>
          <span className="section__meta">{plan.architecture_blocks.length} blocks</span>
        </div>
        <ArchitectureFlow blocks={plan.architecture_blocks} />
      </div>

      <div className="section">
        <div className="section__head">
          <h2 className="section__title">Bill of materials</h2>
          <span className="section__meta">{plan.components.length} items</span>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <BomTable lines={plan.components} totalUsd={plan.bom_total_usd} />
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2 className="section__title">Compatibility</h2>
          <span className="section__meta">{plan.compatibility_checks.length} pairs checked</span>
        </div>
        <div className="panel" style={{ padding: "4px 20px" }}>
          <CompatibilityList checks={plan.compatibility_checks} />
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2 className="section__title">Milestones</h2>
          <span className="section__meta">
            {plan.milestones.reduce((s, m) => s + m.estimatedDays, 0)}d total
          </span>
        </div>
        <div className="panel" style={{ padding: "4px 20px" }}>
          <MilestoneTimeline milestones={plan.milestones} />
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2 className="section__title">Risks</h2>
          <span className="section__meta">{plan.risks.length} identified</span>
        </div>
        <div className="panel" style={{ padding: "4px 20px" }}>
          <RiskList risks={plan.risks} />
        </div>
      </div>

      <div className="grid-2">
        <div className="section">
          <div className="section__head">
            <h2 className="section__title">Test plan</h2>
          </div>
          <div className="panel" style={{ padding: "4px 20px" }}>
            <TestPlanList tests={plan.tests} />
          </div>
        </div>

        <div className="section">
          <div className="section__head">
            <h2 className="section__title">Assumptions</h2>
          </div>
          <div className="panel" style={{ padding: "4px 20px" }}>
            <AssumptionsList assumptions={plan.assumptions} />
          </div>
        </div>
      </div>
    </div>
  );
}
