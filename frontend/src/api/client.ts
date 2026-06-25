export const API_BASE = import.meta.env.VITE_API_URL ?? "";
export const api = (path: string) => `${API_BASE}/api/${path}`;

let accessToken: string | null = null;
let currentMemberId: string | null = null;
let onApiError: ((message: string) => void) | null = null;
let onUnauthorized: (() => void) | null = null;
let refreshSession: (() => Promise<void>) | null = null;
let refreshPromise: Promise<void> | null = null;
const inFlightGetRequests = new Map<string, Promise<unknown>>();

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

export function setRefreshSessionHandler(handler: () => Promise<void>) {
  refreshSession = handler;
}

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(currentMemberId ? { "x-member-id": currentMemberId } : {})
  };
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  skipUnauthorizedHandler = false
): Promise<T> {
  if (isDedupeableGet(options)) {
    const key = getRequestKey(path, skipUnauthorizedHandler);
    const existing = inFlightGetRequests.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const pending = performRequest<T>(path, options, skipUnauthorizedHandler).finally(() => {
      inFlightGetRequests.delete(key);
    });
    inFlightGetRequests.set(key, pending);
    return pending;
  }

  return performRequest<T>(path, options, skipUnauthorizedHandler);
}

function isDedupeableGet(options: RequestInit) {
  return !options.body && (!options.method || options.method.toUpperCase() === "GET");
}

function getRequestKey(path: string, skipUnauthorizedHandler: boolean) {
  return JSON.stringify({
    path,
    accessToken,
    currentMemberId,
    skipUnauthorizedHandler
  });
}

async function performRequest<T>(
  path: string,
  options: RequestInit,
  skipUnauthorizedHandler: boolean
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...options, headers: buildHeaders(), credentials: "include" });
  } catch {
    const message = "Servern är inte nåbar";
    onApiError?.(message);
    throw new Error(message);
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");

  if (response.status === 401) {
    if (!skipUnauthorizedHandler && refreshSession) {
      try {
        refreshPromise ??= refreshSession().finally(() => {
          refreshPromise = null;
        });
        await refreshPromise;
        response = await fetch(path, { ...options, headers: buildHeaders(), credentials: "include" });
        if (response.status !== 401) {
          return handleResponse<T>(response);
        }
      } catch {
        // Fall through to the explicit unauthorized handling below.
      }
    }
    if (!skipUnauthorizedHandler) {
      onApiError?.("Sessionen kunde inte förnyas");
    }
    throw new Error("Inte autentiserad");
  }

  return handleResponse<T>(response);
}

async function handleResponse<T>(response: Response): Promise<T> {
  const isJson = response.headers.get("content-type")?.includes("application/json");

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
