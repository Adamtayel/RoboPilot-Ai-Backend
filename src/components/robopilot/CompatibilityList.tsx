import type { CompatibilityCheck } from "@/lib/robopilot/schema";

export function CompatibilityList({ checks }: { checks: CompatibilityCheck[] }) {
  if (checks.length === 0) {
    return (
      <p style={{ color: "var(--ink-dim)", fontSize: 13.5 }}>
        No compatibility pairs to check — select at least one microcontroller and one peripheral.
      </p>
    );
  }

  return (
    <div>
      {checks.map((check, i) => (
        <div className="compat-item" key={i}>
          <span
            className={check.compatible ? "compat-mark compat-mark--ok" : "compat-mark compat-mark--bad"}
            aria-hidden="true"
          >
            {check.compatible ? "✓" : "✕"}
          </span>
          <div>
            <p className="compat-pair">
              {check.componentA} ↔ {check.componentB} ({check.interface})
            </p>
            <p className="compat-reason">{check.reason}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
