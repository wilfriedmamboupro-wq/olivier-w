import { useId, useState } from "react";
import type { ReactNode } from "react";
import type { PendingInterrupt } from "../domain/rfp";

interface Props {
  pendingInterrupt: PendingInterrupt;
  busy: boolean;
  onResume: (payload: Record<string, unknown>) => void;
}

const KICKER: Record<PendingInterrupt["action"], string> = {
  approve_pricing_send: "Human approval needed",
  approve_quote_send: "Human approval needed",
  customer_response_needed: "Waiting on the customer",
};

const TITLE: Record<PendingInterrupt["action"], string> = {
  approve_pricing_send: "Send this pricing request?",
  approve_quote_send: "Send this quote to the customer?",
  customer_response_needed: "Record the customer's reply",
};

function RadioOption({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} /> {children}
    </label>
  );
}

function EmailApprovalForm({ pendingInterrupt, busy, onResume }: Props) {
  const subjectId = useId();
  const bodyId = useId();
  const [subject, setSubject] = useState(pendingInterrupt.subject ?? "");
  const [body, setBody] = useState(pendingInterrupt.body ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onResume({ approve: true, subject, body });
      }}
    >
      <div className="field">
        <label htmlFor={subjectId}>Subject</label>
        <input id={subjectId} value={subject} onChange={(e) => setSubject(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor={bodyId}>Email body — Claude's draft, edit freely before sending</label>
        <textarea id={bodyId} value={body} onChange={(e) => setBody(e.target.value)} required />
      </div>
      <div className="approval-card__actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Sending…" : "Approve & send"}
        </button>
        <button type="button" className="btn btn--danger" disabled={busy} onClick={() => onResume({ approve: false })}>
          Cancel this step
        </button>
      </div>
    </form>
  );
}

function CustomerResponseForm({ busy, onResume }: Omit<Props, "pendingInterrupt">) {
  const [mode, setMode] = useState<"simulate" | "real">("simulate");
  const [decision, setDecision] = useState<"accepted" | "rejected">("accepted");
  const [replyBody, setReplyBody] = useState("");
  const replyId = useId();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "simulate") {
          onResume({ mode: "simulate", decision });
        } else {
          onResume({ mode: "real", body: replyBody });
        }
      }}
    >
      <fieldset className="fieldset-reset">
        <legend>How did the customer respond?</legend>
        <div className="decision-choices">
          <RadioOption name="mode" value="simulate" checked={mode === "simulate"} onChange={() => setMode("simulate")}>
            Simulate a reply (demo)
          </RadioOption>
          <RadioOption name="mode" value="real" checked={mode === "real"} onChange={() => setMode("real")}>
            I have a real reply
          </RadioOption>
        </div>
      </fieldset>

      {mode === "simulate" ? (
        <fieldset className="fieldset-reset">
          <legend>Simulated decision</legend>
          <div className="decision-choices">
            <RadioOption name="decision" value="accepted" checked={decision === "accepted"} onChange={() => setDecision("accepted")}>
              Accepted
            </RadioOption>
            <RadioOption name="decision" value="rejected" checked={decision === "rejected"} onChange={() => setDecision("rejected")}>
              Rejected
            </RadioOption>
          </div>
        </fieldset>
      ) : (
        <div className="field">
          <label htmlFor={replyId}>Paste the customer's reply email</label>
          <textarea
            id={replyId}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            required
            placeholder="Thanks for the quote, this works for us..."
          />
        </div>
      )}

      <div className="approval-card__actions">
        <button type="submit" className="btn btn--primary" disabled={busy || (mode === "real" && !replyBody.trim())}>
          {busy ? "Recording…" : "Record reply"}
        </button>
      </div>
    </form>
  );
}

export default function ApprovalCard({ pendingInterrupt, busy, onResume }: Props) {
  return (
    <section className="approval-card" aria-labelledby="approval-card-heading">
      <p className="approval-card__kicker">{KICKER[pendingInterrupt.action]}</p>
      <h2 id="approval-card-heading">{TITLE[pendingInterrupt.action]}</h2>
      {pendingInterrupt.action === "customer_response_needed" ? (
        <CustomerResponseForm busy={busy} onResume={onResume} />
      ) : (
        <EmailApprovalForm pendingInterrupt={pendingInterrupt} busy={busy} onResume={onResume} />
      )}
    </section>
  );
}
