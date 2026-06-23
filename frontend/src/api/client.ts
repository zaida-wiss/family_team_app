export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
export const api = (path: string) => `${API_BASE}/api/${path}`;

let accessToken: string | null = null;
let currentMemberId: string | null = null;
let onApiError: ((message: string) => void) | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setApiMemberId(memberId: string | null) {
  currentMemberId = memberId;
}

export function setApiErrorHandler(handler: (message: string) => void) {
  onApiError = handler;
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  skipUnauthorizedHandler = false
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(currentMemberId ? { "x-member-id": currentMemberId } : {})
  };

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers, credentials: "include" });
  } catch {
    const message = "Servern är inte nåbar";
    onApiError?.(message);
    throw new Error(message);
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");

  if (response.status === 401) {
    if (!skipUnauthorizedHandler) onUnauthorized?.();
    throw new Error("Inte autentiserad");
  }

  if (!response.ok) {
    const body = isJson ? await response.json().catch(() => ({})) : {};
    const message = (body as { error?: string }).error ?? `HTTP ${response.status}`;
    onApiError?.(message);
    throw new Error(message);
  }

  if (!isJson) {
    const message = "Oväntat svar från servern";
    onApiError?.(message);
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
