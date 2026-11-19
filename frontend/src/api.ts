import type { LaneDraft, Proposal, Rfp } from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(response.status, body.detail ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

export function listRfps(): Promise<Rfp[]> {
  return request("/api/rfps");
}

export function listAirports(): Promise<string[]> {
  return request("/api/airports");
}

export function getRfp(rfpId: string): Promise<Rfp> {
  return request(`/api/rfps/${rfpId}`);
}

export function createRfp(input: { customer_name: string; customer_email: string; lanes: LaneDraft[] }): Promise<Rfp> {
  return request("/api/rfps", { method: "POST", body: JSON.stringify(input) });
}

export function resumeRfp(rfpId: string, payload: Record<string, unknown>): Promise<Rfp> {
  return request(`/api/rfps/${rfpId}/resume`, { method: "POST", body: JSON.stringify({ payload }) });
}

export function listProposals(): Promise<Proposal[]> {
  return request("/api/proposals");
}
