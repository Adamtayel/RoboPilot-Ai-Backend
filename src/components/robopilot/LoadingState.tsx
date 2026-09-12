import { RobotLogo } from "./RobotLogo";

export function LoadingState() {
  return (
    <div className="panel state-panel">
      <RobotLogo size={96} state="thinking" />
      <h2 className="state-panel__title">Thinking…</h2>
      <p className="state-panel__body">
        Decomposing the requirements, checking the approved catalog, and
        pricing components live. This usually takes a few seconds.
      </p>
    </div>
  );
}
