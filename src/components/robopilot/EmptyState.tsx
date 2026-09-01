export function EmptyState() {
  return (
    <div className="panel state-panel">
      <p className="state-panel__title">No plan generated yet</p>
      <p className="state-panel__body">
        Fill in the project requirements on the left and generate a plan. The result will show
        the proposed architecture, a priced bill of materials, compatibility checks, a milestone
        timeline and project risks.
      </p>
    </div>
  );
}
