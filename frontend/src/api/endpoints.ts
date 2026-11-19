const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const getAirportsEndpoint = () => `${BASE_URL}/api/airports`;

export const getRfpsEndpoint = () => `${BASE_URL}/api/rfps`;
export const createRfpEndpoint = () => `${BASE_URL}/api/rfps`;
export const getRfpByIdEndpoint = (rfpId: string) => `${BASE_URL}/api/rfps/${rfpId}`;
export const resumeRfpEndpoint = (rfpId: string) => `${BASE_URL}/api/rfps/${rfpId}/resume`;

export const getProposalsEndpoint = () => `${BASE_URL}/api/proposals`;
