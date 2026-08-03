import { describe, it, expect } from 'vitest';
import { SUPABASE_URL, SUPABASE_ANON_KEY, BACKEND_URL, GOOGLE_CLIENT_ID } from '../../src/env.js';

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
