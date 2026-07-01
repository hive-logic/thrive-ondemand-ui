# TOTP / 2FA Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TOTP/2FA verification to the Directus login flow — when a user has TFA enabled, reveal a 6-digit OTP field after the password step and complete login with `{ email, password, otp }`.

**Architecture:** Progressive reveal. `lib/auth.ts` gains a typed `AuthApiError` (carries Directus `extensions.code`) and an `isOtpRequiredError` helper; `login()` takes an optional `otp`. `AuthContext` passes `otp` through. `LoginModal` sends password-only first, and on a `401 INVALID_OTP` reveals an OTP input and resubmits. `mode` stays `json` (default) so the raw `access_token` remains readable for the WebSocket auth on `AGENT_HOST`.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript (strict), Tailwind. New: vitest (unit tests for the pure auth logic only). Directus v12.0.2 backend.

**Spec:** `docs/superpowers/specs/2026-07-01-totp-login-design.md`

---

## File Structure

- `package.json` — add `vitest` devDep + `test` script (modify).
- `vitest.config.ts` — new; node environment + `@` alias.
- `lib/auth.ts` — add `AuthApiError`, `isOtpRequiredError`; extend `login(email, password, otp?)` (modify).
- `lib/auth.test.ts` — new; unit tests for the pure logic + error mapping.
- `components/AuthContext.tsx` — extend `login` signature to accept `otp?` (modify).
- `components/LoginModal.tsx` — two-step OTP UX (modify).

---

### Task 1: Vitest tooling setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Add the test script to `package.json`**

In the `"scripts"` block, add a `test` entry:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 2: Install vitest as a dev dependency**

Run: `npm install -D vitest`
Expected: `vitest` appears under `devDependencies`; `package-lock.json` updates; no errors.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Verify the runner is installed**

Run: `npx vitest --version`
Expected: prints a version number (e.g. `3.x.x`). (Running `npm test` now would report "No test files found" — that's fine; the first test arrives in Task 2.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `AuthApiError` + `isOtpRequiredError` (TDD)

**Files:**
- Create: `lib/auth.test.ts`
- Modify: `lib/auth.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AuthApiError, isOtpRequiredError } from './auth';

describe('AuthApiError', () => {
  it('carries message, code, and status', () => {
    const err = new AuthApiError('Invalid user OTP.', 'INVALID_OTP', 401);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Invalid user OTP.');
    expect(err.code).toBe('INVALID_OTP');
    expect(err.status).toBe(401);
  });
});

describe('isOtpRequiredError', () => {
  it('is true when the code is INVALID_OTP', () => {
    expect(isOtpRequiredError(new AuthApiError('x', 'INVALID_OTP', 401))).toBe(true);
  });

  it('is false for INVALID_CREDENTIALS', () => {
    expect(isOtpRequiredError(new AuthApiError('x', 'INVALID_CREDENTIALS', 401))).toBe(false);
  });

  it('falls back to matching otp/2fa wording when code is absent', () => {
    expect(isOtpRequiredError(new Error('One-time password (OTP) is required'))).toBe(true);
    expect(isOtpRequiredError(new Error('Please enter your 2FA code'))).toBe(true);
  });

  it('is false for unrelated errors and non-errors', () => {
    expect(isOtpRequiredError(new Error('Network request failed'))).toBe(false);
    expect(isOtpRequiredError(null)).toBe(false);
    expect(isOtpRequiredError(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `AuthApiError`/`isOtpRequiredError` are not exported from `./auth`.

- [ ] **Step 3: Implement `AuthApiError` and `isOtpRequiredError`**

In `lib/auth.ts`, add after the existing `AuthError` interface (around line 37):

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all cases in both `describe` blocks green.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/auth.test.ts
git commit -m "feat(auth): typed AuthApiError + isOtpRequiredError helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `login(email, password, otp?)` — body + error mapping (TDD)

**Files:**
- Modify: `lib/auth.test.ts`
- Modify: `lib/auth.ts:42-67` (the `login` function)

- [ ] **Step 1: Write the failing tests**

First, update the import block at the top of `lib/auth.test.ts` to add `vi`, `afterEach`, and `login`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthApiError, isOtpRequiredError, login } from './auth';
```

Then append these blocks to `lib/auth.test.ts` (`_url`/`_opts` are typed explicitly so
`mock.calls[0][1]` is well-typed under `tsc --noEmit`, and underscore-prefixed so lint
doesn't flag them as unused):

```ts
function mock401(code: string) {
  return vi.fn((_url: string, _opts: any) =>
    Promise.resolve({
      ok: false,
      status: 401,
      json: async () => ({ errors: [{ message: `msg:${code}`, extensions: { code } }] }),
    }),
  );
}

describe('login request body', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('omits otp entirely when not provided', async () => {
    const fetchMock = mock401('INVALID_CREDENTIALS');
    vi.stubGlobal('fetch', fetchMock);

    await expect(login('a@b.com', 'pw')).rejects.toBeInstanceOf(AuthApiError);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ email: 'a@b.com', password: 'pw' });
    expect('otp' in body).toBe(false);
  });

  it('includes otp when provided', async () => {
    const fetchMock = mock401('INVALID_OTP');
    vi.stubGlobal('fetch', fetchMock);

    await expect(login('a@b.com', 'pw', '123456')).rejects.toBeInstanceOf(AuthApiError);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.otp).toBe('123456');
  });

  it('omits otp when passed an empty string', async () => {
    const fetchMock = mock401('INVALID_CREDENTIALS');
    vi.stubGlobal('fetch', fetchMock);

    await expect(login('a@b.com', 'pw', '')).rejects.toBeInstanceOf(AuthApiError);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect('otp' in body).toBe(false);
  });
});

describe('login error mapping', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws AuthApiError with code + status from the response', async () => {
    vi.stubGlobal('fetch', mock401('INVALID_OTP'));

    const err = await login('a@b.com', 'pw').catch((e) => e);
    expect(err).toBeInstanceOf(AuthApiError);
    expect(err.code).toBe('INVALID_OTP');
    expect(err.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — current `login` throws a plain `Error` (not `AuthApiError`) and does not accept a third `otp` argument, so `toBeInstanceOf(AuthApiError)` and the `code`/`status` assertions fail.

- [ ] **Step 3: Update `login` in `lib/auth.ts`**

Replace the existing `login` function (lines ~42-67) with:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all `login` tests green, plus the Task 2 tests still green.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/auth.test.ts
git commit -m "feat(auth): accept optional otp and throw typed AuthApiError

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Thread `otp` through `AuthContext`

**Files:**
- Modify: `components/AuthContext.tsx:18` (interface) and `:54-57` (impl)

- [ ] **Step 1: Update the context type**

Change the `login` type in `AuthContextType` (line ~18) from:

```ts
    login: (email: string, password: string) => Promise<void>;
```

to:

```ts
    login: (email: string, password: string, otp?: string) => Promise<void>;
```

- [ ] **Step 2: Pass `otp` through in the implementation**

Change the `login` callback (lines ~54-57) from:

```ts
    const login = useCallback(async (email: string, password: string) => {
        const result = await authLogin(email, password);
        setUser(result.user);
    }, []);
```

to:

```ts
    const login = useCallback(async (email: string, password: string, otp?: string) => {
        const result = await authLogin(email, password, otp);
        setUser(result.user);
    }, []);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/AuthContext.tsx
git commit -m "feat(auth): thread otp through AuthContext.login

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Two-step OTP UX in `LoginModal`

**Files:**
- Modify: `components/LoginModal.tsx` (full component rewrite below)

- [ ] **Step 1: Replace `components/LoginModal.tsx` with the two-step version**

```tsx
"use client";

import React, { useState, useId, useRef, useEffect } from "react";
import Image from "next/image";
import { useAuth } from "./AuthContext";
import { isOtpRequiredError } from "@/lib/auth";

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
    const { login } = useAuth();
    const emailId = useId();
    const passwordId = useId();
    const otpId = useId();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [otpRequired, setOtpRequired] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const otpInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (otpRequired) otpInputRef.current?.focus();
    }, [otpRequired]);

    if (!isOpen) return null;

    const resetAndClose = () => {
        setEmail("");
        setPassword("");
        setOtp("");
        setOtpRequired(false);
        setError(null);
        setSubmitting(false);
        onClose();
    };

    const backToCredentials = () => {
        setOtpRequired(false);
        setOtp("");
        setError(null);
    };

    const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
    };

    const canSubmit =
        !!email && !!password && !submitting && (!otpRequired || otp.length === 6);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;

        setSubmitting(true);
        setError(null);

        try {
            await login(email, password, otpRequired ? otp : undefined);
            onSuccess?.();
            resetAndClose();
        } catch (err) {
            if (isOtpRequiredError(err)) {
                if (!otpRequired) {
                    // Credentials OK, TFA required — reveal the OTP step.
                    setOtpRequired(true);
                    setError(null);
                } else {
                    // Wrong/expired code — let the user retry.
                    setOtp("");
                    setError("Invalid or expired code. Try again.");
                }
            } else {
                // Credential or network error — return to the password step.
                setError(err instanceof Error ? err.message : "Login failed");
                if (otpRequired) {
                    setOtpRequired(false);
                    setOtp("");
                }
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            resetAndClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={handleBackdropClick}
        >
            <div className="card w-full max-w-md p-6 md:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-center mb-6">
                    <Image
                        src="/thrive_logo.png"
                        alt="ThriveLogic"
                        width={140}
                        height={42}
                        className="object-contain"
                    />
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {!otpRequired ? (
                        <>
                            <div className="space-y-2">
                                <label className="text-xs text-white/70" htmlFor={emailId}>
                                    Email
                                </label>
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                                            <path
                                                d="M3 7.5a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9Z"
                                                stroke="currentColor"
                                                strokeWidth="1.5"
                                            />
                                            <path
                                                d="M4 7l8 6 8-6"
                                                stroke="currentColor"
                                                strokeWidth="1.5"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    </span>
                                    <input
                                        id={emailId}
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@thrivelogic.ai"
                                        autoComplete="email"
                                        autoFocus
                                        className="w-full rounded-xl bg-[#141415] border border-white/10 pl-11 pr-4 py-3 outline-none focus:ring-2 focus:ring-primary/40 caret-primary text-[16px] leading-6 appearance-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs text-white/70" htmlFor={passwordId}>
                                    Password
                                </label>
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                                            <rect
                                                x="5"
                                                y="11"
                                                width="14"
                                                height="10"
                                                rx="2"
                                                stroke="currentColor"
                                                strokeWidth="1.5"
                                            />
                                            <path
                                                d="M8 11V7a4 4 0 1 1 8 0v4"
                                                stroke="currentColor"
                                                strokeWidth="1.5"
                                                strokeLinecap="round"
                                            />
                                            <circle cx="12" cy="16" r="1.5" fill="currentColor" />
                                        </svg>
                                    </span>
                                    <input
                                        id={passwordId}
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        autoComplete="current-password"
                                        className="w-full rounded-xl bg-[#141415] border border-white/10 pl-11 pr-4 py-3 outline-none focus:ring-2 focus:ring-accent/40 caret-accent text-[16px] leading-6 appearance-none"
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Locked account row */}
                            <div className="flex items-center gap-2 rounded-xl bg-[#141415] border border-white/10 px-4 py-2.5 opacity-70">
                                <span className="text-white/50">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                                        <path
                                            d="M3 7.5a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9Z"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                        />
                                        <path
                                            d="M4 7l8 6 8-6"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </span>
                                <span className="text-sm text-white/80 truncate">{email}</span>
                            </div>
                            <div className="text-right -mt-2">
                                <button
                                    type="button"
                                    onClick={backToCredentials}
                                    className="text-xs text-primary hover:brightness-110"
                                >
                                    ← Use a different account
                                </button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs text-white/70" htmlFor={otpId}>
                                    Authentication code
                                </label>
                                <input
                                    id={otpId}
                                    ref={otpInputRef}
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    value={otp}
                                    onChange={handleOtpChange}
                                    placeholder="123456"
                                    className="w-full text-center tracking-[0.5em] rounded-xl bg-[#141415] border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-primary/40 caret-primary text-[20px] leading-6 appearance-none"
                                />
                                <p className="text-xs text-white/45">
                                    Enter the 6-digit code from your authenticator app.
                                </p>
                            </div>
                        </>
                    )}

                    {error && (
                        <p className="text-xs text-red-400 text-center">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all bg-gradient-to-tr from-primary to-accent hover:brightness-110 shadow-[0_10px_25px_rgba(233,66,108,0.25)]"
                    >
                        {submitting
                            ? otpRequired
                                ? "Verifying…"
                                : "Signing in…"
                            : otpRequired
                                ? "Verify"
                                : "Sign in"}
                    </button>
                </form>

                {/* Close button */}
                <button
                    onClick={resetAndClose}
                    className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
                    aria-label="Close"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path
                            d="M18 6L6 18M6 6l12 12"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                    </svg>
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors for `components/LoginModal.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/LoginModal.tsx
git commit -m "feat(login): two-step TOTP/2FA flow in LoginModal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only). Uses the user-provided TFA test account.

- [ ] **Step 1: Confirm the live INVALID_OTP code (linchpin)**

Using the 2FA test account's real email/password (provided by the user at execution time), run:

```bash
curl -s -X POST https://app.dev.thrivelogic.ai/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<TFA_ACCOUNT_EMAIL>","password":"<TFA_ACCOUNT_PASSWORD>"}'
```

Expected: `401` body containing `"code":"INVALID_OTP"`.
If the real code differs, keep the message fallback in `isOtpRequiredError` (already present) and add the observed code to the primary check.

- [ ] **Step 2: Full run of the test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 4: Manual browser check**

Run: `npm run dev`, open the app, click Sign in.
- Enter the TFA account email/password → **Sign in** → the OTP field appears (no credential error).
- Enter a fresh 6-digit code from the authenticator → **Verify** → login succeeds, chat WebSocket connects (token present).
- Wrong code → "Invalid or expired code", stays on the OTP step.
- "← Use a different account" → returns to the email/password step.

- [ ] **Step 5: Regression — non-TFA user**

With a Directus user that has TFA disabled, sign in with email/password → logs in in a single step, no OTP field shown.

---

## Notes for the implementer

- Do **not** add `mode` to the login body — the default (`json`) returns `access_token` in the body, which the chat WebSocket needs (`lib/auth-ws.ts`). See the spec's Non-goals.
- The unit tests deliberately cover only the pure logic + error mapping. UI behaviour is verified manually (Task 6) — no React component test framework is added.
