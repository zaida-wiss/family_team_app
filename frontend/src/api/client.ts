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

function fetchWithAuth(path: string, options: RequestInit = {}) {
  return fetch(path, { ...options, headers: buildHeaders(), credentials: "include" });
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

const SSE_BASE_DELAY_MS = 3000;
const SSE_MAX_DELAY_MS = 60_000;

export function subscribeToServerEvents(
  path: string,
  onEvent: (eventName: string) => void
) {
  let cancelled = false;
  let abortController: AbortController | null = null;
  // Exponentiell backoff — utan den hamrar en trasig anslutning (t.ex. ihållande
  // 401/429) servern var 3:e sekund i all evighet, vilket i sig triggar rate
  // limiten och håller den låst även efter att grundorsaken är åtgärdad.
  let failureCount = 0;

  async function attemptConnection() {
    abortController = new AbortController();
    const response = await fetchEventStream(path, abortController.signal);

    if (!response.ok || !response.body) {
      throw new Error(`Eventströmmen svarade med HTTP ${response.status}`);
    }

    failureCount = 0;
    await readEventStream(response.body, onEvent, () => cancelled);
  }

  async function connect() {
    while (!cancelled) {
      try {
        await attemptConnection();
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          failureCount++;
        }
      }

      if (!cancelled) {
        const delayMs = Math.min(
          SSE_BASE_DELAY_MS * 2 ** Math.max(0, failureCount - 1),
          SSE_MAX_DELAY_MS
        );
        await delay(delayMs);
      }
    }
  }

  void connect();

  return () => {
    cancelled = true;
    abortController?.abort();
  };
}

async function fetchEventStream(path: string, signal: AbortSignal) {
  const response = await fetch(path, { headers: buildHeaders(), credentials: "include", signal });
  if (response.status !== 401 || !refreshSession) {
    return response;
  }

  await refreshSession();
  return fetch(path, { headers: buildHeaders(), credentials: "include", signal });
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

// Deduplicerar samtidiga refresh-anrop — flera 401:or i rad ska bara trigga en enda
// riktig refreshSession(), inte en per request.
function refreshSessionOnce() {
  refreshPromise ??= refreshSession!().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function retryAfterRefresh(path: string, options: RequestInit): Promise<Response | null> {
  try {
    await refreshSessionOnce();
    const response = await fetchWithAuth(path, options);
    return response.status === 401 ? null : response;
  } catch {
    return null;
  }
}

async function handleUnauthorized<T>(
  path: string,
  options: RequestInit,
  skipUnauthorizedHandler: boolean
): Promise<T> {
  if (!skipUnauthorizedHandler && refreshSession) {
    const retried = await retryAfterRefresh(path, options);
    if (retried) {
      return handleResponse<T>(retried);
    }
  }

  if (!skipUnauthorizedHandler) {
    onApiError?.("Sessionen kunde inte förnyas");
  }
  throw new Error("Inte autentiserad");
}

async function performRequest<T>(
  path: string,
  options: RequestInit,
  skipUnauthorizedHandler: boolean
): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithAuth(path, options);
  } catch {
    const message = "Servern är inte nåbar";
    onApiError?.(message);
    throw new Error(message);
  }

  return response.status === 401
    ? handleUnauthorized<T>(path, options, skipUnauthorizedHandler)
    : handleResponse<T>(response);
}

function extractEventName(chunk: string): string | undefined {
  return chunk
    .split("\n")
    .find((line) => line.startsWith("event:"))
    ?.slice("event:".length)
    .trim();
}

// Delar upp bufferten i kompletta SSE-meddelanden ("\n\n"-separerade) och skickar ut
// eventnamnet för varje. Returnerar den ofärdiga resten som ska sparas till nästa läsning.
function emitCompleteEvents(
  buffer: string,
  onEvent: (eventName: string) => void
): string {
  const chunks = buffer.split("\n\n");
  const rest = chunks.pop() ?? "";

  for (const chunk of chunks) {
    const eventName = extractEventName(chunk);
    if (eventName) {
      onEvent(eventName);
    }
  }

  return rest;
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (eventName: string) => void,
  isCancelled: () => boolean
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!isCancelled()) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer = emitCompleteEvents(buffer + decoder.decode(value, { stream: true }), onEvent);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function parseErrorMessage(response: Response, isJson: boolean): Promise<string> {
  const body = isJson ? await response.json().catch(() => ({})) : {};
  return (body as { error?: string }).error ?? `HTTP ${response.status}`;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const isJson = response.headers.get("content-type")?.includes("application/json") ?? false;

  if (!response.ok) {
    const message = await parseErrorMessage(response, isJson);
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
