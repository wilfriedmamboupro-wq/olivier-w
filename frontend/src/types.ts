export type Actor = "claude" | "human" | "system";
export type TraceStatus = "running" | "done" | "needs_human" | "error";

export interface RequirementResult {
  code: string;
  label: string;
  fulfilled: boolean;
  unsupported_legs: string[];
}

export interface Lane {
  lane_id: string;
  origin: string;
  destination: string;
  tons: number;
  max_transit_days: number;
  shipper_note: string;
  requirements_requested: string[];
  route_airports: string[];
  route_transit_days: number;
  requirement_results: RequirementResult[];
  price_per_ton: number | null;
  status: string;
  needs_human_review: boolean;
  review_reasons: string[];
}

export interface Message {
  thread: "PRICING" | "CUSTOMER";
  direction: "outbound" | "inbound";
  subject: string;
  body: string;
}

export interface TraceEvent {
  step: string;
  status: TraceStatus;
  summary: string;
  actor: Actor;
}

export interface PendingInterrupt {
  action: "approve_pricing_send" | "approve_quote_send" | "customer_response_needed";
  subject?: string;
  body?: string;
}

export interface Rfp {
  rfp_id: string;
  customer_name: string;
  customer_email: string;
  lanes: Lane[];
  messages: Message[];
  trace: TraceEvent[];
  status: string;
  is_paused: boolean;
  pending_interrupt: PendingInterrupt | null;
}

export interface LaneDraft {
  origin: string;
  destination: string;
  tons: number;
  max_transit_days: number;
  shipper_note: string;
}

export interface Proposal {
  id: number;
  rfp_id: string;
  lane_id: string;
  origin: string;
  destination: string;
  tons: number;
  route_airports: string;
  transit_days: number;
  requirements_requested: string;
  requirements_fulfilled: string;
  price_per_ton: number;
  total_price: number;
  customer_email: string;
  accepted_at: string;
}
