import { ApiError } from "./ApiError";

const API_KEY = import.meta.env.VITE_API_KEY;

class HttpClient {
  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
      },
      ...init,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      throw new ApiError(response.status, body.detail ?? "Request failed");
    }
    return response.json() as Promise<T>;
  }

  get<T>(url: string): Promise<T> {
    return this.request<T>(url);
  }

  post<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>(url, {
      method: "POST",
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  }
}

let instance: HttpClient | null = null;

export function getGlobalHttpInstance(): HttpClient {
  if (!instance) {
    instance = new HttpClient();
  }
  return instance;
}
