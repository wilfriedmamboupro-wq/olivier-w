import type { RequirementResult } from "../domain/rfp";

export default function RequirementBadge({ requirement }: { requirement: RequirementResult }) {
  const className = requirement.fulfilled ? "req-badge req-badge--ok" : "req-badge req-badge--blocked";
  const icon = requirement.fulfilled ? "✓" : "✕";
  const detail = requirement.fulfilled
    ? `${requirement.label}: available on the chosen route`
    : `${requirement.label}: not available on leg(s) ${requirement.unsupported_legs.join(", ")}`;

  return (
    <span className={className} title={detail}>
      <span className="req-badge__icon" aria-hidden="true">
        {icon}
      </span>
      {requirement.label}
      <span className="visually-hidden">{requirement.fulfilled ? "fulfilled" : "not fulfilled"}</span>
    </span>
  );
}
