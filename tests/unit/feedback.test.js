import { describe, it, expect, vi, beforeEach } from 'vitest';

// src/feedback.js imports BACKEND_URL from './env.js' at module scope --
// mock the SAME resolved file (relative from src/, not from tests/unit/) so
// feedback.js sees a configured backend for the "routes to backend" tests.
vi.mock('../../src/env.js', () => ({ BACKEND_URL: 'https://api.example.com' }));

const { _post, _showFeedbackModal, _submitFeedback, initFeedback } = await import('../../src/feedback.js');

// A handful of microtask ticks plus one macrotask turn -- enough for the
// nested `fetch().then().then()`/`.catch()` chains in _post /
// _postFeedbackToBackend / _drainFeedbackBackendQueue to fully settle.
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
};

const sheetPendingKeys = () => Object.keys(localStorage).filter(k => k.startsWith('mtb_pending_'));
const backendPendingKeys = () => Object.keys(localStorage).filter(k => k.startsWith('mtb_fb_pending_backend_'));

describe('feedback.js', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
    delete window.MTB_SHEETS_URL;
    delete window._mtbState;
    // jsdom has no real canvas 2D context (the optional `canvas` npm
    // package isn't installed) -- _initCanvas would throw once its
    // requestAnimationFrame callback actually runs. None of these tests
    // exercise drawing, so stub rAF to a no-op rather than let that fire.
    window.requestAnimationFrame = () => 0;
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    // Re-syncs the module's internal `_session` from (now-empty)
    // sessionStorage -- gives every test a clean, deterministic
    // "no saved session yet" starting point, mirroring a fresh app boot.
    initFeedback();
  });

  describe('_post routing (Phase 3 feedback -> db)', () => {
    it('routes a type:feedback payload to the backend POST /api/feedback when BACKEND_URL is set', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 201 });

      _post({ type: 'feedback', comment: 'love the app' });
      await flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.example.com/api/feedback');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(opts.body)).toMatchObject({ type: 'feedback', comment: 'love the app' });

      // Success -> nothing queued anywhere.
      expect(sheetPendingKeys()).toEqual([]);
      expect(backendPendingKeys()).toEqual([]);
    });

    it('type:engagement is routed straight to the sheet/queue path, ignoring BACKEND_URL entirely', async () => {
      _post({ type: 'engagement', sessionId: 'sess_1', events: '[]' });
      await flush();

      // No configured sheet URL -> queued locally under the SHEET's key;
      // the backend was never called at all (engagement stays on the
      // sheet, per scope).
      expect(fetchMock).not.toHaveBeenCalled();
      expect(sheetPendingKeys().length).toBe(1);
      const queued = JSON.parse(localStorage.getItem(sheetPendingKeys()[0]));
      expect(queued.type).toBe('engagement');
      expect(backendPendingKeys()).toEqual([]);
    });
  });

  describe('offline feedback queues to the backend, never the sheet', () => {
    it('a rejected backend POST queues under the backend-specific key, not the sheet queue', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'));

      _post({ type: 'feedback', comment: 'offline submit' });
      await flush();

      expect(backendPendingKeys().length).toBe(1);
      expect(sheetPendingKeys()).toEqual([]);
      const queued = JSON.parse(localStorage.getItem(backendPendingKeys()[0]));
      expect(queued).toMatchObject({ type: 'feedback', comment: 'offline submit' });
    });

    it('a non-2xx backend response also queues under the backend-specific key, not the sheet', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

      _post({ type: 'feedback', comment: 'server error case' });
      await flush();

      expect(backendPendingKeys().length).toBe(1);
      expect(sheetPendingKeys()).toEqual([]);
    });

    it('a later successful feedback POST drains the backend queue back to the backend endpoint (not the sheet)', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline'));
      _post({ type: 'feedback', comment: 'queued while offline' });
      await flush();
      expect(backendPendingKeys().length).toBe(1);

      fetchMock.mockResolvedValue({ ok: true, status: 201 });
      _post({ type: 'feedback', comment: 'back online' });
      await flush();

      const backendCalls = fetchMock.mock.calls.filter(([url]) => url === 'https://api.example.com/api/feedback');
      // 3 total: the initial (rejected) offline attempt, the "back online"
      // submit itself, and the drain of the queued item that submit's
      // success triggers.
      expect(backendCalls.length).toBe(3);
      expect(backendPendingKeys()).toEqual([]);
      expect(sheetPendingKeys()).toEqual([]); // never touched the sheet at any point
    });

    it('initFeedback() drains anything left queued from a prior offline session', async () => {
      localStorage.setItem(
        'mtb_fb_pending_backend_1',
        JSON.stringify({ type: 'feedback', comment: 'queued earlier' })
      );
      fetchMock.mockResolvedValue({ ok: true, status: 201 });

      initFeedback();
      await flush();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/api/feedback',
        expect.objectContaining({ method: 'POST' })
      );
      expect(backendPendingKeys()).toEqual([]);
      expect(sheetPendingKeys()).toEqual([]);
    });
  });

  describe('identity pre-fill from the signed-in user, with anonymize support', () => {
    it('pre-fills fb-name/fb-email from window._mtbState.authUser when no session exists yet', () => {
      window._mtbState = { tab: 'roster', authUser: { name: 'Andrew Shaber', email: 'andrew@example.com' } };

      _showFeedbackModal();

      expect(document.getElementById('fb-name').value).toBe('Andrew Shaber');
      expect(document.getElementById('fb-email').value).toBe('andrew@example.com');
    });

    it('falls back to the locally-stored coach profile name when signed out (no authUser)', () => {
      localStorage.setItem('mtb_coach', JSON.stringify({ name: 'Local Coach' }));

      _showFeedbackModal();

      expect(document.getElementById('fb-name').value).toBe('Local Coach');
      expect(document.getElementById('fb-email').value).toBe('');
    });

    it('submitting without editing the pre-filled fields sends the signed-in name/email by default', async () => {
      window._mtbState = { tab: 'practice', authUser: { name: 'Andrew Shaber', email: 'andrew@example.com' } };
      fetchMock.mockResolvedValue({ ok: true, status: 201 });

      _showFeedbackModal();
      document.getElementById('fb-comment').value = 'great app';
      document.getElementById('fb-role').value = 'Coach';

      _submitFeedback();
      await flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, opts] = fetchMock.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.userName).toBe('Andrew Shaber');
      expect(body.email).toBe('andrew@example.com');
    });

    it('clearing the pre-filled name/email before submit still sends, anonymously (empty name/email)', async () => {
      window._mtbState = { tab: 'practice', authUser: { name: 'Andrew Shaber', email: 'andrew@example.com' } };
      fetchMock.mockResolvedValue({ ok: true, status: 201 });

      _showFeedbackModal();
      document.getElementById('fb-name').value = '';
      document.getElementById('fb-email').value = '';
      document.getElementById('fb-comment').value = 'anonymous feedback';
      document.getElementById('fb-role').value = 'Coach';

      _submitFeedback();
      await flush();

      // Clearing identity must never block the submit.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, opts] = fetchMock.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.userName).toBe('');
      expect(body.email).toBe('');
    });

    it('never overwrites an already-saved session (or what the user typed) on re-open', () => {
      sessionStorage.setItem(
        'mtb_feedback_session',
        JSON.stringify({ name: 'Saved Name', email: 'saved@example.com', league: '', team: '', role: 'Coach' })
      );
      initFeedback(); // re-sync _session from the seeded sessionStorage, mirrors app boot
      window._mtbState = { tab: 'roster', authUser: { name: 'Someone Else', email: 'else@example.com' } };

      _showFeedbackModal();

      // needsProfile is false once a session is saved -- no #fb-name/
      // #fb-email are even rendered, so the signed-in user can never
      // clobber a saved session's identity.
      expect(document.getElementById('fb-name')).toBeNull();
      expect(document.getElementById('fb-email')).toBeNull();
    });
  });
});
