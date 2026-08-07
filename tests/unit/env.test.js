import { describe, it, expect } from 'vitest';
import { SUPABASE_URL, SUPABASE_ANON_KEY, BACKEND_URL, GOOGLE_CLIENT_ID, envLabel } from '../../src/env.js';

describe('env.js', () => {
  it('exposes all four vars as strings', () => {
    expect(typeof SUPABASE_URL).toBe('string');
    expect(typeof SUPABASE_ANON_KEY).toBe('string');
    expect(typeof BACKEND_URL).toBe('string');
    expect(typeof GOOGLE_CLIENT_ID).toBe('string');
  });

  it('defaults to empty string when the underlying Vite env vars are unset', () => {
    // In the test/build env none of these VITE_* vars are defined, so every
    // export must default safely to '' rather than undefined or throwing.
    expect(SUPABASE_URL).toBe('');
    expect(SUPABASE_ANON_KEY).toBe('');
    expect(BACKEND_URL).toBe('');
    expect(GOOGLE_CLIENT_ID).toBe('');
  });
});

describe('envLabel()', () => {
  it('returns ITG for a backend URL containing mtb-api-itg', () => {
    expect(envLabel('https://mtb-api-itg-abc123.a.run.app')).toBe('ITG');
  });

  it('returns PROD for a backend URL containing mtb-api-prod', () => {
    expect(envLabel('https://mtb-api-prod-abc123.a.run.app')).toBe('PROD');
  });

  it('returns local for an empty URL', () => {
    expect(envLabel('')).toBe('local');
    expect(envLabel(undefined)).toBe('local');
  });

  it('returns local for a localhost URL', () => {
    expect(envLabel('http://localhost:8000')).toBe('local');
    expect(envLabel('http://127.0.0.1:8000')).toBe('local');
  });
});
