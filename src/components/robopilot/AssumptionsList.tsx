import type { Assumption, TestPlanItem } from "@/lib/robopilot/schema";

export function TestPlanList({ tests }: { tests: TestPlanItem[] }) {
  return (
    <ul className="simple-list">
      {tests.map((t, i) => (
        <li key={i}>
          <span className="label">{t.target}</span>
          {t.description}
          <span className="sub">Expected: {t.expectedResult}</span>
        </li>
      ))}
    </ul>
  );
}

export function AssumptionsList({ assumptions }: { assumptions: Assumption[] }) {
  if (assumptions.length === 0) {
    return <p style={{ color: "var(--ink-dim)", fontSize: 13.5 }}>No assumptions were recorded.</p>;
  }

  return (
    <ul className="simple-list">
      {assumptions.map((a, i) => (
        <li key={i}>
          {a.statement}
          <span className="sub">{a.reason}</span>
        </li>
      ))}
    </ul>
  );
}
