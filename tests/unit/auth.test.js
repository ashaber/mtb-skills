import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted keeps these mock fns available inside the (hoisted) vi.mock
// factory below — plain module-scope consts would be hoisted-above by
// vitest's own transform and read as undefined at mock-eval time.
const {
  mockSignInWithOAuth, mockSignInWithOtp, mockSignOut, mockGetSession, mockOnAuthStateChange, mockCreateClient,
} = vi.hoisted(() => ({
  mockSignInWithOAuth:  vi.fn(async () => ({ data: { provider: 'google', url: 'https://redirect' }, error: null })),
  mockSignInWithOtp:    vi.fn(async () => ({ data: {}, error: null })),
  mockSignOut:          vi.fn(async () => ({ error: null })),
  mockGetSession:       vi.fn(async () => ({ data: { session: null }, error: null })),
  mockOnAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  mockCreateClient:     vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => {
    mockCreateClient(...args);
    return {
      auth: {
        signInWithOAuth:    mockSignInWithOAuth,
        signInWithOtp:      mockSignInWithOtp,
        signOut:            mockSignOut,
        getSession:         mockGetSession,
        onAuthStateChange:  mockOnAuthStateChange,
      },
    };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth.js — unconfigured (default empty env, matches env.test.js)', () => {
  it('isAuthConfigured() is false, and importing the module does not throw', async () => {
    vi.resetModules();
    const auth = await import('../../src/auth.js');
    expect(auth.isAuthConfigured()).toBe(false);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('signInWithGoogle does not call supabase and resolves with an error', async () => {
    vi.resetModules();
    const auth = await import('../../src/auth.js');
    const result = await auth.signInWithGoogle();
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it('signInWithMagicLink does not call supabase and resolves with an error', async () => {
    vi.resetModules();
    const auth = await import('../../src/auth.js');
    const result = await auth.signInWithMagicLink('coach@example.com');
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it('getSession / getAccessToken / getUser all resolve to null', async () => {
    vi.resetModules();
    const auth = await import('../../src/auth.js');
    expect(await auth.getSession()).toBeNull();
    expect(await auth.getAccessToken()).toBeNull();
    expect(await auth.getUser()).toBeNull();
  });

  it('onAuthChange returns a no-op unsubscribe without subscribing', async () => {
    vi.resetModules();
    const auth = await import('../../src/auth.js');
    const unsub = auth.onAuthChange(vi.fn());
    expect(mockOnAuthStateChange).not.toHaveBeenCalled();
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  it('signOut is a safe no-op', async () => {
    vi.resetModules();
    const auth = await import('../../src/auth.js');
    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe('auth.js — configured (env vars present)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../../src/env.js', () => ({
      SUPABASE_URL:      'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      BACKEND_URL:       '',
      GOOGLE_CLIENT_ID:  '',
    }));
  });

  afterEach(() => {
    vi.doUnmock('../../src/env.js');
  });

  it('isAuthConfigured() is true when both env vars are set', async () => {
    const auth = await import('../../src/auth.js');
    expect(auth.isAuthConfigured()).toBe(true);
  });

  it('signInWithGoogle calls supabase signInWithOAuth with the google provider', async () => {
    const auth = await import('../../src/auth.js');
    await auth.signInWithGoogle();
    expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1);
    expect(mockSignInWithOAuth.mock.calls[0][0]).toMatchObject({ provider: 'google' });
  });

  it('signInWithMagicLink calls supabase signInWithOtp with the given email', async () => {
    const auth = await import('../../src/auth.js');
    await auth.signInWithMagicLink('coach@example.com');
    expect(mockSignInWithOtp).toHaveBeenCalledTimes(1);
    expect(mockSignInWithOtp.mock.calls[0][0]).toMatchObject({ email: 'coach@example.com' });
  });

  it('signInWithMagicLink surfaces a supabase error without throwing', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ data: null, error: { message: 'rate limited' } });
    const auth = await import('../../src/auth.js');
    const result = await auth.signInWithMagicLink('coach@example.com');
    expect(result.error).toBe('rate limited');
  });

  it('getAccessToken returns the current session access token', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok-123', user: {} } },
      error: null,
    });
    const auth = await import('../../src/auth.js');
    expect(await auth.getAccessToken()).toBe('tok-123');
  });

  it('getUser reads email/name from the session user', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 't', user: { email: 'coach@example.com', user_metadata: { full_name: 'Coach Example' } } } },
      error: null,
    });
    const auth = await import('../../src/auth.js');
    expect(await auth.getUser()).toEqual({ email: 'coach@example.com', name: 'Coach Example' });
  });

  it('onAuthChange subscribes via supabase and returns a real unsubscribe function', async () => {
    const auth = await import('../../src/auth.js');
    const unsub = auth.onAuthChange(vi.fn());
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
    expect(typeof unsub).toBe('function');
  });

  it('signOut calls supabase signOut', async () => {
    const auth = await import('../../src/auth.js');
    await auth.signOut();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
