/**
 * Authenticated WebSocket module for connected users
 * Connects to /ws/chat/{client_id} for Router agent access
 */

import { getStoredAccessToken, getStoredUser } from "./auth";

// Base domain for the agent/WS server, from env
const AGENT_HOST =
    (typeof process !== "undefined" &&
        (process as any).env?.NEXT_PUBLIC_AGENT_HOST) ||
    "agent.thrivelogic.ai";

let authSocket: WebSocket | null = null;
let retries = 0;
let cachedClientId: string | null = null;
let pingIntervalId: ReturnType<typeof setInterval> | null = null;

// Ping interval in ms - 20 seconds (most load balancers have 30-60s timeout)
const PING_INTERVAL = 20000;

// Session ID storage key - persistent across component mounts
const SESSION_ID_KEY = "auth_chat_session_id";

type Subscriber = {
    onOpen?: () => void;
    onClose?: (ev: CloseEvent) => void;
    onError?: (ev: Event) => void;
    onMessage?: (ev: MessageEvent) => void;
};
const subscribers = new Set<Subscriber>();

/**
 * Get or create session ID for chat history continuity
 * Generates a new UUID4 if none exists (on first call after login)
 */
export function getOrCreateSessionId(): string {
    if (typeof window === "undefined") {
        // Server-side fallback
        return crypto.randomUUID();
    }

    try {
        const existing = window.localStorage.getItem(SESSION_ID_KEY);
        if (existing && existing.trim()) {
            return existing;
        }

        // Generate new UUID4 session ID
        const newSessionId = crypto.randomUUID();
        window.localStorage.setItem(SESSION_ID_KEY, newSessionId);
        // eslint-disable-next-line no-console
        console.log("New chat session created:", newSessionId);
        return newSessionId;
    } catch {
        // Fallback if localStorage fails
        return crypto.randomUUID();
    }
}

/**
 * Clear stored session ID (for logout or new conversation)
 */
export function clearSessionId(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(SESSION_ID_KEY);
        // eslint-disable-next-line no-console
        console.log("Chat session cleared");
    } catch {
        // ignore
    }
}

/**
 * Get the client ID for authenticated WebSocket
 * Uses Directus user ID if available, falls back to local storage
 */
function getAuthClientId(): string {
    if (cachedClientId) return cachedClientId;

    // Try to use Directus user ID
    const user = getStoredUser();
    if (user?.id) {
        cachedClientId = user.id;
        return user.id;
    }

    // Fallback to generated ID
    if (typeof window === "undefined") {
        const serverId = `auth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        cachedClientId = serverId;
        return serverId;
    }

    try {
        const key = "auth_ws_client_id";
        const fromStore = window.localStorage.getItem(key);
        if (fromStore && fromStore.trim()) {
            cachedClientId = fromStore;
            return fromStore;
        }
        const generated =
            (self as any).crypto?.randomUUID?.() ||
            `auth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        window.localStorage.setItem(key, generated);
        cachedClientId = generated;
        return generated;
    } catch {
        const fallback = `auth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        cachedClientId = fallback;
        return fallback;
    }
}

function getAuthWsUrl(): string {
    const clientId = getAuthClientId();
    const token = getStoredAccessToken();
    const base = `wss://${AGENT_HOST}/ws/chat/${clientId}`;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

function connectAuth(): WebSocket {
    if (authSocket && authSocket.readyState !== WebSocket.CLOSED) {
        return authSocket;
    }

    // Stop any existing ping interval
    stopPing();

    try {
        const url = getAuthWsUrl();
        // eslint-disable-next-line no-console
        console.log("Auth WS connecting to:", url, "clientId:", getAuthClientId());
        authSocket = new WebSocket(url);

        authSocket.addEventListener("open", () => {
            retries = 0;
            // eslint-disable-next-line no-console
            console.log("Auth WS connected with clientId:", getAuthClientId());
            subscribers.forEach((s) => s.onOpen?.());
            // Start keepalive ping
            startPing();
        });

        authSocket.addEventListener("close", (ev: CloseEvent) => {
            // Stop ping on close
            stopPing();
            // eslint-disable-next-line no-console
            console.log("Auth WS disconnected", {
                code: ev.code,
                reason: ev.reason,
                wasClean: ev.wasClean,
            });
            subscribers.forEach((s) => s.onClose?.(ev));
            retryAuthConnect();
        });

        authSocket.addEventListener("error", (err) => {
            // eslint-disable-next-line no-console
            console.error("Auth WS error:", err);
            subscribers.forEach((s) => s.onError?.(err));
        });

        authSocket.addEventListener("message", (ev) => {
            subscribers.forEach((s) => s.onMessage?.(ev));
        });
    } catch {
        retryAuthConnect();
    }

    return authSocket!;
}

/**
 * Start periodic ping to keep connection alive
 */
function startPing(): void {
    if (pingIntervalId) return;

    pingIntervalId = setInterval(() => {
        if (authSocket && authSocket.readyState === WebSocket.OPEN) {
            try {
                // Send a minimal ping — just an empty JSON object
                // The backend should see no "message" field and skip processing
                authSocket.send("ping");
            } catch {
                // ignore errors during ping
            }
        }
    }, PING_INTERVAL);
}

/**
 * Stop the ping interval
 */
function stopPing(): void {
    if (pingIntervalId) {
        clearInterval(pingIntervalId);
        pingIntervalId = null;
    }
}

function retryAuthConnect() {
    if (retries > 6) return;
    const backoff = Math.min(1000 * Math.pow(2, retries++), 8000);
    setTimeout(connectAuth, backoff);
}

export function getAuthWS(): WebSocket {
    return connectAuth();
}

export function isAuthWSOpen(): boolean {
    return !!authSocket && authSocket.readyState === WebSocket.OPEN;
}

export function subscribeAuthWS(sub: Subscriber): () => void {
    subscribers.add(sub);
    // If already open, emit synthetic open
    if (isAuthWSOpen()) {
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

export function disconnectAuthWS(): void {
    if (authSocket) {
        try {
            authSocket.close();
        } catch {
            // ignore
        }
        authSocket = null;
    }
    cachedClientId = null;
    retries = 0;
    subscribers.clear();
}

/**
 * Get user UUID for authenticated messages
 */
export function getUserUUID(): string | null {
    const user = getStoredUser();
    return user?.id || null;
}

/**
 * Get user metadata for authenticated messages
 */
export function getAuthUserMeta(): { id: string; email: string; name?: string } | null {
    const user = getStoredUser();
    if (!user) return null;
    return {
        id: user.id,
        email: user.email,
        name: user.first_name
            ? `${user.first_name}${user.last_name ? ` ${user.last_name}` : ""}`
            : undefined,
    };
}
