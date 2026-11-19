import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/ApiError";
import { getRfpById, resumeRfp } from "../api/rfpApi";
import ApprovalCard from "../components/ApprovalCard";
import LaneTable from "../components/LaneTable";
import MessageThread from "../components/MessageThread";
import OrchestrationTrace from "../components/OrchestrationTrace";
import StatusPill from "../components/StatusPill";
import type { Rfp } from "../domain/rfp";

export default function RfpDetail() {
  const { rfpId } = useParams<{ rfpId: string }>();
  const [rfp, setRfp] = useState<Rfp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const refresh = useCallback(() => {
    if (!rfpId) return;
    getRfpById(rfpId)
      .then(setRfp)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this RFP."));
  }, [rfpId]);

  useEffect(refresh, [refresh]);

  async function handleResume(payload: Record<string, unknown>) {
    if (!rfpId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await resumeRfp(rfpId, payload);
      setRfp(updated);
      setAnnouncement(`Status updated: ${updated.status.replace(/_/g, " ").toLowerCase()}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record that decision.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !rfp) {
    return (
      <div className="status-banner status-banner--error" role="alert">
        {error}
      </div>
    );
  }

  if (!rfp) {
    return <p>Loading…</p>;
  }

  return (
    <>
      <Link to="/" className="nav-back">
        ← Back to manifest
      </Link>

      <div aria-live="polite" className="visually-hidden">
        {announcement}
      </div>

      <div className="page-head">
        <div>
          <h1>{rfp.customer_name}</h1>
          <p className="page-head__meta">{rfp.customer_email}</p>
        </div>
        <StatusPill status={rfp.status} />
      </div>

      {error && (
        <div className="status-banner status-banner--error" role="alert">
          {error}
        </div>
      )}

      <div className="detail-grid">
        <div>
          <section className="panel" aria-labelledby="lanes-heading">
            <div className="panel__head">
              <h2 id="lanes-heading">Lanes</h2>
            </div>
            <LaneTable lanes={rfp.lanes} />
          </section>

          <section className="panel" aria-labelledby="messages-heading">
            <div className="panel__head">
              <h2 id="messages-heading">Messages</h2>
            </div>
            <MessageThread messages={rfp.messages} />
          </section>
        </div>

        <div>
          {rfp.is_paused && rfp.pending_interrupt && (
            <ApprovalCard pendingInterrupt={rfp.pending_interrupt} busy={busy} onResume={handleResume} />
          )}

          <section className="panel" aria-labelledby="trace-heading">
            <div className="panel__head">
              <h2 id="trace-heading">Agent orchestration</h2>
            </div>
            <OrchestrationTrace trace={rfp.trace} />
          </section>
        </div>
      </div>
    </>
  );
}
