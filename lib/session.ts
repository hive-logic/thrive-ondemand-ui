export type UserSession = {
  session_id: string;
  name: string;
  email: string;
  createdAt: number;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp: number;
    formatted?: string;
  };
};

const PREFIX = 'qrSession:';

// Prefer a stable key derived from activity id so / and /chat share the same storage
function getStableActivityKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const activity =
      params.get('activity') ||
      // fallback to previously cached activity id if present
      window.localStorage.getItem('activity_id');
    if (!activity) return null;
    return `${PREFIX}activity:${activity}`;
  } catch {
    return null;
  }
}

// Legacy key used earlier: based on full path + search
function getLegacyPathKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const linkPart = `${url.pathname}?${url.searchParams.toString()}`;
    return PREFIX + btoa(encodeURIComponent(linkPart)).replace(/=+$/, '');
  } catch {
    return null;
  }
}

export function getCurrentLinkKey(): string | null {
  return getStableActivityKey() ?? getLegacyPathKey();
}

export function loadSession(): UserSession | null {
  if (typeof window === 'undefined') return null;
  const stableKey = getStableActivityKey();
  const legacyKey = getLegacyPathKey();
  const tryKeys = [stableKey, legacyKey].filter(Boolean) as string[];
  if (tryKeys.length === 0) return null;
  try {
    for (const key of tryKeys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as UserSession;

      // Ensure session_id exists (migration for existing users)
      if (!parsed.session_id) {
        parsed.session_id = crypto.randomUUID();
        // We will save this updated version back below
      }

      // Migrate legacy to stable if needed, or just update if session_id was added
      if (stableKey && key !== stableKey) {
        window.localStorage.setItem(stableKey, JSON.stringify(parsed));
      } else if (!JSON.parse(raw).session_id) {
        // If we strictly just added session_id in place
        window.localStorage.setItem(key, JSON.stringify(parsed));
      }
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSession(session: UserSession): void {
  if (typeof window === 'undefined') return;
  const key = getCurrentLinkKey();
  if (!key) return;
  window.localStorage.setItem(key, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  const stableKey = getStableActivityKey();
  const legacyKey = getLegacyPathKey();
  if (stableKey) window.localStorage.removeItem(stableKey);
  if (legacyKey) window.localStorage.removeItem(legacyKey);
}



