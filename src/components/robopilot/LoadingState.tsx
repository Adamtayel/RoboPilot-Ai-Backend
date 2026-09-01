const STEPS = [
  "Validating request…",
  "Decomposing requirements…",
  "Checking approved catalog…",
  "Scoring project risk…",
];

export function LoadingState() {
  return (
    <div className="panel state-panel">
      <div className="scan" aria-hidden="true" />
      <p className="state-panel__title">Generating plan</p>
      <p className="state-panel__body">
        Requirements are being decomposed and checked against the approved component catalog.
        This usually takes a few seconds.
      </p>
      <div className="loading-log" role="status" aria-live="polite">
        {STEPS.map((s) => (
          <div key={s}>{s}</div>
        ))}
      </div>
    </div>
  );
}
