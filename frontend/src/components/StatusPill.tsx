const TONE_BY_STATUS: Record<string, { tone: "info" | "warn" | "good" | "bad"; label: string }> = {
  NEW: { tone: "info", label: "New" },
  ROUTED: { tone: "info", label: "Routed" },
  PRICING_REQUESTED: { tone: "info", label: "Pricing requested" },
  PRICED: { tone: "info", label: "Priced" },
  QUOTE_SENT: { tone: "info", label: "Quote sent" },
  NEEDS_HUMAN_REVIEW: { tone: "warn", label: "Needs review" },
  ACCEPTED: { tone: "good", label: "Accepted" },
  REJECTED: { tone: "bad", label: "Rejected" },
};

export default function StatusPill({ status }: { status: string }) {
  const entry = TONE_BY_STATUS[status] ?? { tone: "info" as const, label: status };
  return <span className={`pill pill--${entry.tone}`}>{entry.label}</span>;
}
