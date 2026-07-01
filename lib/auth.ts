/**
 * Directus Authentication Library
 * Handles login, logout, token refresh, and user profile fetching
 */

// Backend URL from environment variable
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://app.dev.thrivelogic.ai';

// Storage keys
const ACCESS_TOKEN_KEY = 'directus_access_token';
const REFRESH_TOKEN_KEY = 'directus_refresh_token';
const TOKEN_EXPIRY_KEY = 'directus_token_expiry';
const USER_KEY = 'directus_user';

export interface DirectusUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  role?: string;
  customer?: {
    id: string;
    name?: string;
  };
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires: number; // milliseconds until expiry
}

export interface AuthError {
  message: string;
  code?: string;
}

/**
 * Typed error for Directus auth API failures.
 * Carries the Directus error code (errors[0].extensions.code) so callers
 * can distinguish INVALID_OTP (2FA required) from INVALID_CREDENTIALS.
 */
export class AuthApiError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'AuthApiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * True when a login failure means "TFA is enabled, provide an OTP".
 * Primary signal is the INVALID_OTP code; a message match is a robust
 * fallback in case Directus wording/codes change across versions.
 */
export function isOtpRequiredError(err: unknown): boolean {
  if (err instanceof AuthApiError && err.code === 'INVALID_OTP') return true;
  const msg = err instanceof Error ? err.message : '';
  return /otp|2fa|two-factor|tfa/i.test(msg);
}

/**
 * Login with email and password (and OTP if the account has TFA enabled).
 * On the first attempt omit `otp`; if Directus returns INVALID_OTP, retry
 * with the 6-digit code.
 */
export async function login(
  email: string,
  password: string,
  otp?: string,
): Promise<{ user: DirectusUser; auth: AuthResponse }> {
  const body: { email: string; password: string; otp?: string } = { email, password };
  if (otp) body.otp = otp; // never send otp:"" — Directus may treat it differently

  const response = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const parsed = await response.json().catch(() => ({}));
    const first = parsed?.errors?.[0];
    throw new AuthApiError(
      first?.message || 'Login failed. Please check your credentials.',
      first?.extensions?.code,
      response.status,
    );
  }

  const data = await response.json();
  const auth: AuthResponse = data.data;

  // Store tokens
  storeTokens(auth);

  // Fetch user profile
  const user = await getMe(auth.access_token);
  storeUser(user);

  return { user, auth };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshToken(): Promise<AuthResponse | null> {
  const storedRefreshToken = getStoredRefreshToken();
  if (!storedRefreshToken) return null;

  try {
    const response = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: storedRefreshToken }),
    });

    if (!response.ok) {
      clearTokens();
      return null;
    }

    const data = await response.json();
    const auth: AuthResponse = data.data;
    storeTokens(auth);
    return auth;
  } catch {
    clearTokens();
    return null;
  }
}

/**
 * Logout - clear tokens and optionally revoke on server
 */
export async function logout(): Promise<void> {
  const token = getStoredRefreshToken();
  
  // Attempt server-side logout
  if (token) {
    try {
      await fetch(`${BACKEND_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: token }),
      });
    } catch {
      // Ignore errors, still clear local tokens
    }
  }

  clearTokens();
}

/**
 * Get current user profile
 */
export async function getMe(accessToken?: string): Promise<DirectusUser> {
  const token = accessToken || getStoredAccessToken();
  if (!token) {
    throw new Error('No access token available');
  }

  const response = await fetch(`${BACKEND_URL}/users/me?fields=id,email,first_name,last_name,avatar,role,customer.*`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Try to refresh token
      const refreshed = await refreshToken();
      if (refreshed) {
        return getMe(refreshed.access_token);
      }
    }
    throw new Error('Failed to fetch user profile');
  }

  const data = await response.json();
  return data.data;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const token = getStoredAccessToken();
  const expiry = getStoredExpiry();
  
  if (!token) return false;
  if (expiry && Date.now() >= expiry) {
    // Token expired, but might be refreshable
    return !!getStoredRefreshToken();
  }
  
  return true;
}

/**
 * Get valid access token (refreshes if needed)
 */
export async function getValidAccessToken(): Promise<string | null> {
  const token = getStoredAccessToken();
  const expiry = getStoredExpiry();
  
  // If token exists and not expired (with 5 min buffer), return it
  if (token && expiry && Date.now() < expiry - 5 * 60 * 1000) {
    return token;
  }
  
  // Try to refresh
  const refreshed = await refreshToken();
  return refreshed?.access_token || null;
}

// Storage helpers
function storeTokens(auth: AuthResponse): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, auth.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, auth.refresh_token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + auth.expires));
}

function storeUser(user: DirectusUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function getStoredExpiry(): number | null {
  if (typeof window === 'undefined') return null;
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  return expiry ? parseInt(expiry, 10) : null;
}

export function getStoredUser(): DirectusUser | null {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
}

function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  localStorage.removeItem(USER_KEY);
}
