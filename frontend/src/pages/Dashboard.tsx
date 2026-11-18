import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, listRfps } from "../api";
import StatusPill from "../components/StatusPill";
import type { Rfp } from "../types";

export default function Dashboard() {
  const [rfps, setRfps] = useState<Rfp[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRfps()
      .then(setRfps)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not reach the RFP service."));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>RFP manifest</h1>
          <p className="page-head__meta">Every request for proposal routed through Lanebook, newest first.</p>
        </div>
        <Link to="/new" className="btn btn--primary">
          + New RFP
        </Link>
      </div>

      {error && (
        <div className="status-banner status-banner--error" role="alert">
          <strong>Couldn't load the manifest.</strong> {error}
        </div>
      )}

      {rfps && rfps.length === 0 && (
        <div className="manifest">
          <div className="empty-state">
            <h2>No RFPs yet</h2>
            <p>Create one to see Lanebook route lanes, request pricing, and draft a customer quote.</p>
          </div>
        </div>
      )}

      {rfps && rfps.length > 0 && (
        <div className="manifest" role="region" aria-label="RFP manifest">
          <table>
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Lanes</th>
                <th scope="col">Status</th>
                <th scope="col">Awaiting</th>
              </tr>
            </thead>
            <tbody>
              {rfps.map((rfp) => (
                <tr key={rfp.rfp_id}>
                  <td>
                    <Link to={`/rfps/${rfp.rfp_id}`} className="manifest-row-link">
                      {rfp.customer_name}
                    </Link>
                    <div className="panel__hint">{rfp.customer_email}</div>
                  </td>
                  <td>{rfp.lanes.length}</td>
                  <td>
                    <StatusPill status={rfp.status} />
                  </td>
                  <td>{rfp.is_paused ? rfp.pending_interrupt?.action.replace(/_/g, " ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
