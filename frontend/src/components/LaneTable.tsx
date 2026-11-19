import type { Lane } from "../domain/rfp";
import RequirementBadge from "./RequirementBadge";
import StatusPill from "./StatusPill";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function LaneTable({ lanes }: { lanes: Lane[] }) {
  return (
    <div>
      {lanes.map((lane) => (
        <article key={lane.lane_id} className="lane-card" aria-labelledby={`lane-${lane.lane_id}-heading`}>
          <div className="lane-card__head">
            <h3 id={`lane-${lane.lane_id}-heading`} className="lane-card__route">
              {lane.lane_id} · {lane.route_airports.length ? lane.route_airports.join(" → ") : `${lane.origin} → ${lane.destination}`}
            </h3>
            <StatusPill status={lane.status} />
          </div>
          <div className="lane-card__figures">
            <span>
              Tons: <strong>{lane.tons.toLocaleString()}</strong>
            </span>
            <span>
              Transit: <strong>{lane.route_transit_days || "—"}d</strong> (max {lane.max_transit_days}d)
            </span>
            <span>
              Price/ton: <strong>{lane.price_per_ton != null ? currency.format(lane.price_per_ton) : "pending"}</strong>
            </span>
          </div>
          <div className="lane-card__reqs">
            {lane.requirement_results.length === 0 && <span className="req-badge">Standard general cargo</span>}
            {lane.requirement_results.map((req) => (
              <RequirementBadge key={req.code} requirement={req} />
            ))}
          </div>
          {lane.review_reasons.length > 0 && (
            <ul className="lane-card__reasons">
              {lane.review_reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
