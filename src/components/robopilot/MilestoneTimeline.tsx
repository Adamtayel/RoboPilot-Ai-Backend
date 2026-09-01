import type { Milestone } from "@/lib/robopilot/schema";

export function MilestoneTimeline({ milestones }: { milestones: Milestone[] }) {
  const maxDays = Math.max(...milestones.map((m) => m.estimatedDays), 1);

  return (
    <div>
      {milestones.map((m) => (
        <div className="timeline-row" key={m.name}>
          <div>
            <span className="timeline-row__name">{m.name}</span>
            {m.dependsOn.length > 0 && (
              <span className="timeline-row__deps">after {m.dependsOn.join(", ")}</span>
            )}
          </div>
          <div className="timeline-bar-track">
            <div
              className="timeline-bar-fill"
              style={{ width: `${(m.estimatedDays / maxDays) * 100}%` }}
            />
          </div>
          <span className="timeline-row__days">{m.estimatedDays}d</span>
        </div>
      ))}
    </div>
  );
}
