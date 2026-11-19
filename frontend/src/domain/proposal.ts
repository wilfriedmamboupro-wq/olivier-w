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
