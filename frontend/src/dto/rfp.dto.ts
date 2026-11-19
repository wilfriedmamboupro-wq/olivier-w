/** Request-side shapes: what the UI sends, not what it displays (see domain/rfp.ts for that). */

export interface LaneDraftDto {
  origin: string;
  destination: string;
  tons: number;
  max_transit_days: number;
  shipper_note: string;
}

export interface CreateRfpRequestDto {
  customer_name: string;
  customer_email: string;
  lanes: LaneDraftDto[];
}

export interface ResumeRequestDto {
  payload: Record<string, unknown>;
}
