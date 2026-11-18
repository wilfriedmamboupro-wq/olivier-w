import type { TraceEvent } from "../types";
import ActorChip from "./ActorChip";

export default function OrchestrationTrace({ trace }: { trace: TraceEvent[] }) {
  if (trace.length === 0) {
    return <p className="panel__hint">No orchestration steps yet.</p>;
  }

  return (
    <ol className="trace-list">
      {trace.map((event, i) => (
        <li key={i} className="trace-item">
          <div className="trace-item__rail">
            <span className={`trace-item__dot trace-item__dot--${event.status}`} aria-hidden="true" />
          </div>
          <div className="trace-item__body">
            <div className="trace-item__top">
              <span className="trace-item__step">{event.step}</span>
              <ActorChip actor={event.actor} />
            </div>
            <p className="trace-item__summary">{event.summary}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
