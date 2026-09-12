import { RobotLogo } from "./RobotLogo";

export function EmptyState() {
  return (
    <div className="panel state-panel">
      <RobotLogo size={88} state="idle" />
      <h2 className="state-panel__title">Create your first robot</h2>
      <p className="state-panel__body">
        Fill in the project requirements on the left and generate a plan. The
        result will show the proposed architecture, a priced bill of
        materials, compatibility checks, a milestone timeline and project
        risks.
      </p>
    </div>
  );
}
