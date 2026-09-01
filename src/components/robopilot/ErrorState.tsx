interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="panel state-panel">
      <p className="state-panel__title">Plan generation failed</p>
      <p className="state-panel__body">{message}</p>
      <button type="button" className="btn-secondary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
