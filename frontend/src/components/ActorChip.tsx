import type { Actor } from "../domain/rfp";

const LABEL: Record<Actor, string> = {
  claude: "Claude",
  human: "Human",
  system: "System",
};

export default function ActorChip({ actor }: { actor: Actor }) {
  return <span className={`actor-chip actor-chip--${actor}`}>{LABEL[actor]}</span>;
}
