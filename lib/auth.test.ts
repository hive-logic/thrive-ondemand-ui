import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthApiError, isOtpRequiredError, login } from './auth';

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
