import { describe, it, expect, vi, beforeEach } from 'vitest';

// src/feedback.js imports BACKEND_URL from './env.js' at module scope --
// mock the SAME resolved file (relative from src/, not from tests/unit/) so
// feedback.js sees a configured backend for the "routes to backend" tests.
vi.mock('../../src/env.js', () => ({ BACKEND_URL: 'https://api.example.com' }));

const { _post } = await import('../../src/feedback.js');

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const pendingKeys = () => Object.keys(localStorage).filter(k => k.startsWith('mtb_pending_'));

describe('feedback.js _post routing (Phase 3 feedback -> db)', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    delete window.MTB_SHEETS_URL;
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

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

    // Success -> no sheet/queue fallback triggered.
    expect(pendingKeys()).toEqual([]);
  });

  it('falls back to the sheet/queue path when the backend POST rejects (network failure)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    _post({ type: 'feedback', comment: 'offline submit' });
    await flush();

    // No MTB_SHEETS_URL configured -> the fallback queues locally rather
    // than losing the feedback.
    expect(pendingKeys().length).toBe(1);
    const queued = JSON.parse(localStorage.getItem(pendingKeys()[0]));
    expect(queued).toMatchObject({ type: 'feedback', comment: 'offline submit' });
  });

  it('falls back to the sheet/queue path when the backend responds non-2xx', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    _post({ type: 'feedback', comment: 'server error case' });
    await flush();

    expect(pendingKeys().length).toBe(1);
  });

  it('queues (does not lose) feedback when a configured sheet URL POST also fails after a backend failure', async () => {
    window.MTB_SHEETS_URL = 'https://sheets.example.com/exec';
    fetchMock
      .mockRejectedValueOnce(new Error('backend down')) // backend attempt
      .mockRejectedValueOnce(new Error('sheet down')); // sheet fallback attempt

    _post({ type: 'feedback', comment: 'double failure' });
    await flush();

    expect(pendingKeys().length).toBe(1);
  });

  it('type:engagement is routed straight to the sheet/queue path, ignoring BACKEND_URL entirely', async () => {
    _post({ type: 'engagement', sessionId: 'sess_1', events: '[]' });
    await flush();

    // No configured sheet URL -> queued locally; the backend was never
    // called at all (engagement stays on the sheet, per scope).
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pendingKeys().length).toBe(1);
    const queued = JSON.parse(localStorage.getItem(pendingKeys()[0]));
    expect(queued.type).toBe('engagement');
  });
});
