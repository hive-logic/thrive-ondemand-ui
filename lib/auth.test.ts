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
