let socket: WebSocket | null = null;
let retries = 0;
let cachedClientId: string | null = null;
type Subscriber = {
  onOpen?: () => void;
  onClose?: (ev: CloseEvent) => void;
  onError?: (ev: Event) => void;
  onMessage?: (ev: MessageEvent) => void;
};
const subscribers = new Set<Subscriber>();

// Base domain for the agent/WS server and HTTP APIs, configurable via env.
// Set NEXT_PUBLIC_AGENT_HOST in .env to control which server to connect to.
export const AGENT_HOST =
  (typeof process !== "undefined" &&
    (process as any).env?.NEXT_PUBLIC_AGENT_HOST) ||
  "";

function getUrl(): string {
  const base = `wss://${AGENT_HOST}/ws/ondemand`;
  return `${base}/${getClientId()}`;
}

function connect(): WebSocket {
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    return socket;
  }
  try {
    const url = getUrl();
    // eslint-disable-next-line no-console
    console.log("WS connecting to:", url, "clientId:", getClientId());
    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      retries = 0;
      // eslint-disable-next-line no-console
      console.log("WS connected with clientId:", getClientId());
      // Notify subscribers
      subscribers.forEach((s) => s.onOpen?.());
    });
    socket.addEventListener("close", (ev: CloseEvent) => {
      // eslint-disable-next-line no-console
      console.log("WS disconnected", {
        code: ev.code,
        reason: ev.reason,
        wasClean: ev.wasClean,
        clientId: getClientId(),
      });
      subscribers.forEach((s) => s.onClose?.(ev));
      retryConnect();
    });
    socket.addEventListener("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("WS error event:", err);
      subscribers.forEach((s) => s.onError?.(err));
      // allow onclose to schedule retry
    });
    socket.addEventListener("message", (ev) => {
      subscribers.forEach((s) => s.onMessage?.(ev));
    });
  } catch {
    retryConnect();
  }
  return socket!;
}

function getClientId(): string {
  if (cachedClientId) return cachedClientId;
  if (typeof window === "undefined") {
    cachedClientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return cachedClientId!;
  }
  try {
    const key = "ws_client_id";
    const fromStore = window.localStorage.getItem(key);
    if (fromStore && fromStore.trim()) {
      cachedClientId = fromStore;
      return cachedClientId!;
    }
    const generated =
      (self as any).crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, generated);
    cachedClientId = generated;
    return cachedClientId!;
  } catch {
    cachedClientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return cachedClientId!;
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

function retryConnect() {
  // Clear any pending retry
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }

  // Exponential backoff: 1s, 2s, 4s, 8s, 15s, 30s, 30s…
  const backoff = Math.min(1000 * Math.pow(2, retries), 30000);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = backoff * (0.75 + Math.random() * 0.5);
  retries++;

  // eslint-disable-next-line no-console
  console.log(`WS retry #${retries} in ${Math.round(jitter)}ms`);
  retryTimer = setTimeout(connect, jitter);
}

// Reconnect when user returns to the tab (phone wake, tab switch)
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        retries = 0;
        connect();
      }
    }
  });
}

export function getWS(): WebSocket {
  return connect();
}

export function isWSOpen(): boolean {
  return !!socket && socket.readyState === WebSocket.OPEN;
}

export function subscribeWS(sub: Subscriber): () => void {
  subscribers.add(sub);
  // If already open, emit a synthetic open so UI can sync state
  if (isWSOpen()) {
    try {
      sub.onOpen?.();
    } catch {
      // ignore
    }
  }
  return () => {
    subscribers.delete(sub);
  };
}

export function getActivityIdFromUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("activity");
    if (fromUrl && fromUrl.trim()) {
      try {
        window.localStorage.setItem("activity_id", fromUrl);
      } catch { }
      return fromUrl;
    }
    const stored = window.localStorage.getItem("activity_id");
    if (stored && stored.trim()) {
      return stored;
    }
  } catch {
    return "";
  }
  return "";
}

export function loadOrCreateChatSessionId(): string {
  if (typeof window === "undefined") {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  try {
    const key = "chat_session_id";
    const fromStore = window.localStorage.getItem(key);
    if (fromStore) return fromStore;
    const s =
      (self as any).crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, s);
    return s;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Clear all public user data from localStorage and reset WebSocket connection
 * Used for "logout" functionality for public users
 */
export function clearPublicUserData(): void {
  // Close existing WebSocket connection
  if (socket) {
    try {
      socket.close();
    } catch {
      // ignore
    }
    socket = null;
  }

  // Reset cached values
  cachedClientId = null;
  retries = 0;
  subscribers.clear();

  // Clear localStorage if available
  if (typeof window !== "undefined") {
    try {
      // Public user keys to clear
      const keysToRemove = [
        "ws_client_id",           // WebSocket client ID
        "activity_id",            // Activity ID
        "chat_session_id",        // Chat session ID
        "chat_session",           // Legacy session key
        "chat_history",           // Chat history if stored
        "user_name",              // User display name
        "user_email",             // User email
      ];

      keysToRemove.forEach((key) => {
        window.localStorage.removeItem(key);
      });

      // Also clear any keys that start with "chat_session_" (dynamic session keys)
      const allKeys = Object.keys(window.localStorage);
      allKeys.forEach((key) => {
        if (key.startsWith("chat_session_")) {
          window.localStorage.removeItem(key);
        }
      });

      // eslint-disable-next-line no-console
      console.log("Public user data cleared");
    } catch {
      // ignore localStorage errors
    }
  }
}

/**
 * Disconnect WebSocket without clearing user data
 */
export function disconnectWS(): void {
  if (socket) {
    try {
      socket.close();
    } catch {
      // ignore
    }
    socket = null;
  }
}
