# TOTP / 2FA support in the Directus login flow

**Date:** 2026-07-01
**Status:** Approved (design)
**Scope:** `thrive-ondemand-ui`

## Goal

Add TOTP (2FA) verification to the login flow for **Directus-authenticated users**
(users who log in with email/password via `LoginModal`). Anonymous on-demand users,
who never authenticate, are unaffected.

Enforcement lives in Directus (v12.0.2): when a user has TFA enabled, `/auth/login`
rejects a password-only attempt and requires a one-time password (OTP). This project
only needs to *ask for* the OTP during login — not to enroll/manage TFA (that is done
in the Directus admin).

## Non-goals (out of scope)

- Switching to Directus `mode: "session"` / cookie auth. The app reads the raw
  `access_token` in JavaScript to authenticate the chat WebSocket on a **separate host**
  (`AGENT_HOST`, `lib/auth-ws.ts:121` → `?token=<access_token>`). A `directus_session_token`
  httpOnly cookie is unreadable by JS and is never sent to `AGENT_HOST`, so session mode
  would break the socket. We keep the default `mode: "json"` (tokens in the response body).
- TFA enrollment / setup UI (generating secrets, showing QR codes).
- Recovery / backup codes.

## Directus behaviour (verified against app.dev.thrivelogic.ai, v12.0.2)

`POST /auth/login`, body `{ email, password, otp? }` (no `mode` → defaults to `json`).

| Situation | HTTP | `errors[0].extensions.code` |
|---|---|---|
| Wrong email/password | 401 | `INVALID_CREDENTIALS` |
| Correct password, TFA enabled, OTP missing or wrong | 401 | `INVALID_OTP` |
| Correct password, no TFA (or correct OTP) | 200 | — (tokens in `data`) |

Confirmed live: invalid credentials return
`{"errors":[{"message":"Invalid user credentials.","extensions":{"code":"INVALID_CREDENTIALS"}}]}`.
The `INVALID_OTP` code is verified against a TFA-enabled test account as the first
implementation step (see Verification).

## User flow — progressive reveal

1. User enters email + password, presses **Sign in**.
2. Client `POST /auth/login` with `{ email, password }` (OTP field **omitted entirely** —
   never sent as `otp: ""`, which Directus may treat differently).
3. Response handling:
   - **200** → no TFA: succeed exactly as today (store tokens, fetch profile).
   - **401 `INVALID_CREDENTIALS`** → show credential error, stay on step 1.
   - **401 `INVALID_OTP`** → credentials are valid but TFA is required: reveal the OTP
     field, keep the entered email/password, focus the OTP input.
4. User enters the 6-digit OTP, presses **Verify**.
5. Client `POST /auth/login` with `{ email, password, otp }`.
   - **200** → success.
   - **401 `INVALID_OTP`** → "Invalid or expired code", let the user retry the OTP.
   - **401 `INVALID_CREDENTIALS`** (edge, e.g. password changed mid-flow) → return to step 1.

## Components & changes

### 1. `lib/auth.ts` — propagate the error code (the hinge)

The entire "reveal OTP field" decision depends on distinguishing `INVALID_OTP` from
`INVALID_CREDENTIALS`. Today `login()` throws `new Error(message)` and drops the code
(line ~53). We must carry the code through.

- Add a typed error:
  ```ts
  export class AuthApiError extends Error {
    code?: string;   // errors[0].extensions.code
    status?: number; // HTTP status
    constructor(message: string, code?: string, status?: number) { ... }
  }
  ```
- Change the signature to `login(email: string, password: string, otp?: string)`:
  - Build body `{ email, password }`; add `otp` only when it is a non-empty string.
  - On `!response.ok`, parse `errors[0]` and throw `new AuthApiError(message, code, status)`.
  - Success path unchanged (store tokens, `getMe`, store user).
- Add a helper:
  ```ts
  export function isOtpRequiredError(err: unknown): boolean {
    if (err instanceof AuthApiError && err.code === 'INVALID_OTP') return true;
    const msg = err instanceof Error ? err.message : '';
    return /otp|2fa|two-factor|tfa/i.test(msg); // robust fallback
  }
  ```

### 2. `components/AuthContext.tsx` — thread `otp` through

- `AuthContextType.login`: `(email: string, password: string, otp?: string) => Promise<void>`.
- Implementation passes `otp` to `authLogin`. No other behaviour change.

### 3. `components/LoginModal.tsx` — two-step UX

- New state: `otp: string`, `otpRequired: boolean`. Reuse `error`, `submitting`.
- Rendering:
  - `otpRequired === false`: email + password inputs + **Sign in** (as today).
  - `otpRequired === true`: email/password shown read-only/dimmed with a
    "← use a different account" link that resets the flow; a 6-digit OTP input;
    button label **Verify**.
- `handleSubmit`:
  - Call `login(email, password, otpRequired ? otp : undefined)`.
  - On success → `onSuccess?.()`, `onClose()`, reset local state.
  - On error:
    - if `isOtpRequiredError(err)` **and** `!otpRequired` → set `otpRequired = true`,
      clear the error (optionally show a hint), focus the OTP field.
    - if `otpRequired` and OTP rejected → set error "Invalid or expired code".
    - otherwise → show `err.message`.
- OTP input details: `inputMode="numeric"`, `autoComplete="one-time-code"`,
  `pattern="[0-9]*"`, `maxLength={6}`, strip non-digits on change, submit disabled
  until 6 digits. Autofocus when the field is revealed.
- Reset `otp` / `otpRequired` / `error` whenever the modal closes.

## Isolation / interfaces

- `lib/auth.ts` remains the only module that talks to Directus auth; it now also owns the
  error taxonomy (`AuthApiError`, `isOtpRequiredError`). Consumers depend on the typed
  error, not on parsing message strings.
- `LoginModal` owns all OTP UX/state; `AuthContext` is a thin pass-through. No other
  component learns about OTP.
- Token storage, refresh, WS auth, and `AuthenticatedChatWindow` are untouched — they keep
  reading `access_token` from `localStorage` exactly as before.

## Error handling

- Distinguish `INVALID_CREDENTIALS` vs `INVALID_OTP` by code, with a message-substring
  fallback so a Directus wording/version change doesn't silently break the reveal.
- Network/parse failures → generic user-facing message; no raw exception text surfaced.
- Do not reveal whether an email exists (Directus already returns generic
  `INVALID_CREDENTIALS`).

## Verification

1. **Linchpin (no live OTP needed):** with the provided TFA test account's email+password,
   send a password-only login and confirm the response code is `INVALID_OTP`. Adjust the
   trigger only if the real code differs (fallback already covers wording).
2. **Happy path:** with a fresh OTP from the account's authenticator, complete
   step 1 → reveal → step 2 → 200, tokens stored, profile loaded.
3. **Regression:** a non-TFA user still logs in in one step (no OTP field).
4. **Wrong OTP:** shows retryable error, stays on the OTP step.
5. `tsc --noEmit` / `next build` passes.

## Rollback

Pure client change confined to three files; revert the commit to restore the
password-only flow. No backend, schema, or storage changes.
