/**
 * src/auth.js — Supabase Auth (Google sign-in), Phase 3.1.
 *
 * Offline-first constraint: this file must NEVER throw at import time, and
 * every export must degrade to a safe no-op when Supabase isn't configured.
 * `isAuthConfigured()` is the gate the rest of the app checks before
 * showing any sign-in UI or attempting a sync — the default (no env vars
 * set, e.g. local dev or a coach who never signs in) leaves auth simply
 * UNAVAILABLE and the app keeps working fully offline/signed-out.
 *
 * The Supabase client is created lazily (on first use, not on import) so
 * importing this module is always cheap and side-effect free.
 */

import { createClient } from '@supabase/supabase-js';
import log from './log.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env.js';

let _client = null;
let _clientInitAttempted = false;

/**
 * @returns {boolean} true when Supabase URL + anon key are both present.
 */
export function isAuthConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function getClient() {
  if (!isAuthConfigured()) return null;
  if (!_clientInitAttempted) {
    _clientInitAttempted = true;
    try {
      _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
      log.error('auth.client.init.failed', { error: String(e) });
      _client = null;
    }
  }
  return _client;
}

/**
 * Kicks off the Google OAuth redirect flow. No-ops (with a warn log) when
 * auth isn't configured — callers should gate the sign-in button on
 * isAuthConfigured() so this path is only hit in genuinely broken states.
 */
export async function signInWithGoogle() {
  const client = getClient();
  if (!client) {
    log.warn('auth.signin.unavailable');
    return { error: 'Auth not configured' };
  }
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      log.error('auth.signin.failed', { error: error.message });
      return { error: error.message };
    }
    log.info('auth.signin.started');
    return { data };
  } catch (e) {
    log.error('auth.signin.failed', { error: String(e) });
    return { error: String(e) };
  }
}

export async function signOut() {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.auth.signOut();
    if (error) {
      log.error('auth.signout.failed', { error: error.message });
      return;
    }
    log.info('auth.signout');
  } catch (e) {
    log.error('auth.signout.failed', { error: String(e) });
  }
}

/**
 * @returns {Promise<object|null>} the current Supabase session, or null
 *   when signed out / unconfigured / on error.
 */
export async function getSession() {
  const client = getClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getSession();
    if (error) {
      log.error('auth.session.failed', { error: error.message });
      return null;
    }
    return data?.session ?? null;
  } catch (e) {
    log.error('auth.session.failed', { error: String(e) });
    return null;
  }
}

/**
 * @returns {Promise<string|null>} current access token for the
 *   `Authorization: Bearer <token>` header, or null when signed out.
 */
export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token ?? null;
}

/**
 * @returns {Promise<{email: string|null, name: string|null}|null>}
 */
export async function getUser() {
  const session = await getSession();
  const user = session?.user;
  if (!user) return null;
  return {
    email: user.email ?? null,
    name:  user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
  };
}

/**
 * Subscribes to Supabase auth state changes (sign-in, sign-out, token
 * refresh). Returns an unsubscribe function; when auth isn't configured
 * returns a no-op unsubscribe so callers don't need to branch.
 * @param {(event: string, session: object|null) => void} cb
 * @returns {() => void}
 */
export function onAuthChange(cb) {
  const client = getClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((event, session) => {
    try {
      cb(event, session);
    } catch (e) {
      log.error('auth.onchange.callback.failed', { error: String(e) });
    }
  });
  return () => data?.subscription?.unsubscribe();
}
