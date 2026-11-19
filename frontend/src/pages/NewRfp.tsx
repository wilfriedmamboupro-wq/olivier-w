import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, createRfp, listAirports } from "../api";
import type { LaneDraft } from "../types";

const EMPTY_LANE: LaneDraft = { origin: "", destination: "", tons: 0, max_transit_days: 0, shipper_note: "" };

export default function NewRfp() {
  const navigate = useNavigate();
  const nameId = useId();
  const emailId = useId();
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [lanes, setLanes] = useState<LaneDraft[]>([{ ...EMPTY_LANE }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [airports, setAirports] = useState<string[]>([]);

  useEffect(() => {
    listAirports()
      .then(setAirports)
      .catch(() => setError("Could not load the airport list from the Transit Table."));
  }, []);

  function updateLane(index: number, patch: Partial<LaneDraft>) {
    setLanes((prev) => prev.map((lane, i) => (i === index ? { ...lane, ...patch } : lane)));
  }

  function removeLane(index: number) {
    setLanes((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const rfp = await createRfp({
        customer_name: customerName,
        customer_email: customerEmail,
        lanes: lanes.map((lane) => ({ ...lane, tons: Number(lane.tons), max_transit_days: Number(lane.max_transit_days) })),
      });
      navigate(`/rfps/${rfp.rfp_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the RFP.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>New RFP</h1>
      <p className="page-intro">
        Lanebook will extract special requirements, route each lane against the Transit Table, and flag anything that
        needs a human decision.
      </p>

      {error && (
        <div className="status-banner status-banner--error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="panel">
          <div className="panel__head">
            <h2>Customer</h2>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={nameId}>Customer name</label>
              <input id={nameId} value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor={emailId}>Customer email</label>
              <input
                id={emailId}
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <h2>Lanes</h2>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setLanes((prev) => [...prev, { ...EMPTY_LANE }])}
            >
              + Add lane
            </button>
          </div>

          {lanes.map((lane, index) => (
            <LaneFields
              key={index}
              lane={lane}
              index={index}
              airports={airports}
              onChange={updateLane}
              onRemove={removeLane}
              removable={lanes.length > 1}
            />
          ))}
        </div>

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? "Creating…" : "Create RFP"}
        </button>
      </form>
    </>
  );
}

function LaneFields({
  lane,
  index,
  airports,
  onChange,
  onRemove,
  removable,
}: {
  lane: LaneDraft;
  index: number;
  airports: string[];
  onChange: (index: number, patch: Partial<LaneDraft>) => void;
  onRemove: (index: number) => void;
  removable: boolean;
}) {
  const originId = useId();
  const destId = useId();
  const tonsId = useId();
  const daysId = useId();
  const noteId = useId();

  return (
    <div className="lane-row">
      {removable && (
        <button type="button" className="btn btn--secondary lane-row__remove" onClick={() => onRemove(index)} aria-label={`Remove lane ${index + 1}`}>
          Remove
        </button>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor={originId}>Origin airport</label>
          <select id={originId} value={lane.origin} onChange={(e) => onChange(index, { origin: e.target.value })} required>
            <option value="" disabled>
              {airports.length ? "Select an airport…" : "Loading airports…"}
            </option>
            {airports.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={destId}>Destination airport</label>
          <select id={destId} value={lane.destination} onChange={(e) => onChange(index, { destination: e.target.value })} required>
            <option value="" disabled>
              {airports.length ? "Select an airport…" : "Loading airports…"}
            </option>
            {airports.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={tonsId}>Tons</label>
          <input
            id={tonsId}
            type="number"
            min="0"
            step="0.1"
            value={lane.tons || ""}
            onChange={(e) => onChange(index, { tons: Number(e.target.value) })}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={daysId}>Max transit days</label>
          <input
            id={daysId}
            type="number"
            min="0"
            step="0.5"
            value={lane.max_transit_days || ""}
            onChange={(e) => onChange(index, { max_transit_days: Number(e.target.value) })}
            required
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor={noteId}>Shipper note (free text — special requirements go here)</label>
        <textarea
          id={noteId}
          value={lane.shipper_note}
          onChange={(e) => onChange(index, { shipper_note: e.target.value })}
          placeholder="Dangerous goods, must stay under cold chain 2-8C..."
        />
      </div>
    </div>
  );
}
