/**
 * src/feedback.js — Conference feedback & engagement tracking.
 * Only loaded when ?feedback=true is in the URL.
 * Exports initFeedback() — called once from main.js boot.
 *
 * Routing (Phase 3 feedback+engagement→db): `type:'feedback'` submissions
 * go to the backend's anonymous POST /api/feedback, and `type:'engagement'`
 * usage-tracking pings (_flushEngagement) go to the backend's anonymous
 * POST /api/engagement (see src/env.js's BACKEND_URL and
 * backend/app/routes.py) — both ONLY when a backend is configured. This is
 * the last stream that was still using the Google Sheet webhook
 * (CLAUDE.md's Phase 2 sheet path); once BACKEND_URL is set, the sheet is
 * unused entirely.
 *
 * Each stream gets its OWN offline queue (see `_makeBackendQueue` below):
 * feedback under `mtb_fb_pending_backend_*`, engagement under
 * `mtb_eng_pending_backend_*`. When BACKEND_URL is set but a POST fails
 * (offline, 5xx, etc.), the payload is queued under its stream's own key
 * and retried against the BACKEND on the next drain — never against the
 * sheet, and never cross-queued into the other stream's key. Both queues
 * are drained on `initFeedback()` (app boot) and after every subsequent
 * successful POST of their own type, so a coach who submits/pings offline
 * gets caught up automatically the next time the backend is reachable.
 *
 * If BACKEND_URL is empty entirely (a no-backend build, e.g. local/dev),
 * BOTH streams fall back to the legacy sheet POST/offline-queue path
 * (`_postToSheetOrQueue` / `mtb_pending_*`) — there is no backend to hold
 * either queue against in that configuration.
 */

import log from './log.js';
import { BACKEND_URL } from './env.js';

const SHEETS_KEY = 'mtb_sheets_url';
const SESSION_KEY = 'mtb_feedback_session';

let _session = null;
let _events = [];
const _sessionId = 'sess_' + Date.now();
const _sessionStart = Date.now();

const _esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Public API ────────────────────────────────────────────────────────────────

// Exported alongside initFeedback so tests/unit/feedback.test.js can drive
// the feedback→backend / offline-queue routing and the identity-prefill /
// anonymize behavior directly, without needing to puppet the full modal's
// screenshot-capture (html2canvas) + canvas-init (rAF) flow just to reach
// them.
export { _post, _showFeedbackModal, _submitFeedback };

export function initFeedback() {
  _injectCSS();
  _session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  _startEngagement();
  _addFeedbackButton();
  // Catch up anything left queued from a prior offline session, for BOTH
  // streams (see module docstring) -- a no-op per-queue if BACKEND_URL is
  // unset or that queue is empty.
  _feedbackBackendQueue.drain();
  _engagementBackendQueue.drain();
}

// ── Engagement tracker ────────────────────────────────────────────────────────

function _startEngagement() {
  window.MTB_TRACK = _trackEvent;
  setInterval(_flushEngagement, 60000);
  window.addEventListener('beforeunload', _flushEngagement);
}

function _trackEvent(type, props = {}) {
  _events.push({ type, ts: Date.now(), ...props });
  if (_events.length >= 15) _flushEngagement();
}

function _flushEngagement() {
  if (!_events.length) return;
  const payload = {
    type:          'engagement',
    sessionId:     _sessionId,
    sessionStart:  new Date(_sessionStart).toISOString(),
    durationSec:   Math.round((Date.now() - _sessionStart) / 1000),
    userName:      _session?.name || '',
    league:        _session?.league || '',
    team:          _session?.team || '',
    eventCount:    _events.length,
    events:        JSON.stringify(_events),
  };
  _events = [];
  _post(payload);
}

// ── Feedback button ───────────────────────────────────────────────────────────

function _addFeedbackButton() {
  if (document.getElementById('fb-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'fb-btn';
  btn.textContent = '💬 Feedback';
  btn.addEventListener('click', _openFeedbackModal);
  document.body.appendChild(btn);
}

let _screenshotCanvas = null;
let _drawHistory = [];
let _drawMode = 'pen';
let _drawColor = '#d94626';
let _drawCtx = null;
let _drawingActive = false;
let _penPath = [];
let _circleStart = null;

// ── Modal open: capture screenshot FIRST, then show modal ────────────────────

function _openFeedbackModal() {
  if (document.getElementById('fb-modal-wrap')) return;

  // Capture the current screen before any modal DOM is created (D8 issue 2)
  import('html2canvas').then(m => {
    return m.default(document.body, {
      useCORS: true, scale: 1,
      x: 0, y: 0,
      width: window.innerWidth, height: window.innerHeight,
      windowWidth: window.innerWidth, windowHeight: window.innerHeight,
    }).catch(() => null);
  }).catch(() => null).then(shot => {
    _screenshotCanvas = shot || null;
    _showFeedbackModal();
  });
}

function _showFeedbackModal() {
  const needsProfile = !_session;

  // Pre-fill identity from the signed-in user when available (main.js
  // exposes `window._mtbState.authUser = { email, name } | null`), else
  // fall back to the locally-stored coach profile (D13). Both `fb-name`
  // and `fb-email` stay ordinary, fully editable/clearable text inputs --
  // a coach can wipe either (or both) before submitting to go anonymous;
  // that's a supported, still-sends case (see _submitFeedback below). Only
  // ever applies when `needsProfile` (no saved `_session` yet) -- an
  // already-saved session, or anything the user typed this session, is
  // never overwritten here.
  const authUser = needsProfile ? window._mtbState?.authUser : null;
  const coach = needsProfile ? JSON.parse(localStorage.getItem('mtb_coach') || 'null') : null;
  const teamSettings = needsProfile ? JSON.parse(localStorage.getItem('mtb_team') || 'null') : null;
  const prefillName = authUser?.name || coach?.name || '';
  const prefillEmail = authUser?.email || '';
  const prefillTeam = teamSettings?.name || '';
  const hasCoachProfile = !!(coach?.name || authUser?.name);

  const modal = document.createElement('div');
  modal.id = 'fb-modal-wrap';
  modal.innerHTML = `
    <div class="fb-modal">
      <div class="fb-modal-head">
        <span class="fb-modal-title">Feedback — <span id="fb-page-label"></span></span>
        <button class="fb-close" id="fb-close">✕</button>
      </div>
      <div class="fb-modal-scroll">
        ${needsProfile ? `
        <div class="fb-profile-section" id="fb-profile">
          <p class="fb-profile-label">Tell us about yourself (optional except role)</p>
          <input class="fb-input" id="fb-name" type="text" placeholder="Your name (optional)" autocomplete="name" value="${_esc(prefillName)}">
          <input class="fb-input" id="fb-email" type="email" placeholder="Email (optional — for follow-up)" autocomplete="email" value="${_esc(prefillEmail)}">
          <input class="fb-input" id="fb-league" type="text" placeholder="NICA League (optional)">
          <input class="fb-input" id="fb-team" type="text" placeholder="Team (optional)" autocomplete="organization" value="${_esc(prefillTeam)}">
          <div class="fb-role-row">
            <button class="fb-role-btn${hasCoachProfile ? ' fb-role-btn--active' : ''}" data-role="Coach">Coach</button>
            <button class="fb-role-btn" data-role="Athlete">Athlete</button>
          </div>
          <input type="hidden" id="fb-role" value="${hasCoachProfile ? 'Coach' : ''}">
        </div>` : ''}
        <div class="fb-canvas-wrap">
          <canvas id="fb-canvas"></canvas>
          <div class="fb-canvas-tools">
            <button class="fb-tool fb-tool--active" id="fb-pen" title="Pen">✏️</button>
            <button class="fb-tool" id="fb-circle" title="Circle">⭕</button>
            <div class="fb-colors">
              ${['#d94626','#2563eb','#16a34a','#000000'].map(c =>
                `<button class="fb-color${c === '#d94626' ? ' fb-color--active' : ''}" style="background:${c}" data-color="${c}"></button>`
              ).join('')}
            </div>
            <button class="fb-tool" id="fb-undo" title="Undo">↩</button>
            <button class="fb-tool" id="fb-clear" title="Clear">🗑</button>
          </div>
        </div>
        <div class="fb-modal-body">
          <textarea class="fb-comment" id="fb-comment" placeholder="What do you think? What's confusing? What's missing?" rows="3"></textarea>
        </div>
        <div class="fb-modal-foot">
          <button class="fb-submit" id="fb-submit" disabled>Submit feedback</button>
          <button class="fb-cancel" id="fb-cancel">Cancel</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('fb-page-label').textContent = window._mtbState?.tab || 'app';

  // D13: wire up role buttons with Coach pre-selected when profile exists
  if (needsProfile) {
    modal.querySelectorAll('.fb-role-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.fb-role-btn').forEach(b => b.classList.remove('fb-role-btn--active'));
        btn.classList.add('fb-role-btn--active');
        document.getElementById('fb-role').value = btn.dataset.role;
        _checkSubmitReady();
      });
    });
  }

  _drawHistory = [];
  _drawMode = 'pen';
  _drawColor = '#d94626';
  _penPath = [];
  _circleStart = null;

  // D8 issues 1 & 4: initialize canvas after layout settles with correct pixel dimensions
  requestAnimationFrame(() => _initCanvas());

  // Tool buttons
  document.getElementById('fb-pen').addEventListener('click', () => { _drawMode = 'pen'; _updateToolUI(); });
  document.getElementById('fb-circle').addEventListener('click', () => { _drawMode = 'circle'; _updateToolUI(); });
  document.getElementById('fb-undo').addEventListener('click', _undo);
  document.getElementById('fb-clear').addEventListener('click', _clearDraw);
  modal.querySelectorAll('.fb-color').forEach(btn => {
    btn.addEventListener('click', () => {
      _drawColor = btn.dataset.color;
      modal.querySelectorAll('.fb-color').forEach(b => b.classList.remove('fb-color--active'));
      btn.classList.add('fb-color--active');
    });
  });

  const canvas = document.getElementById('fb-canvas');
  canvas.addEventListener('pointerdown', _onDrawStart);
  canvas.addEventListener('pointermove', _onDrawMove);
  canvas.addEventListener('pointerup', _onDrawEnd);
  canvas.addEventListener('pointercancel', _onDrawEnd);

  const comment = document.getElementById('fb-comment');
  const submit  = document.getElementById('fb-submit');
  comment.addEventListener('input', _checkSubmitReady);

  document.getElementById('fb-close').addEventListener('click', _closeFeedbackModal);
  document.getElementById('fb-cancel').addEventListener('click', _closeFeedbackModal);
  document.getElementById('fb-submit').addEventListener('click', _submitFeedback);

  function _checkSubmitReady() {
    const hasComment = comment.value.trim().length > 0;
    const hasDrawing = _drawHistory.length > 1; // >1 because initial screenshot state is [0]
    const hasRole = !needsProfile || !!document.getElementById('fb-role')?.value;
    submit.disabled = (!hasComment && !hasDrawing) || !hasRole;
  }
  modal._checkSubmitReady = _checkSubmitReady;
}

// D8 issues 1 & 4: set canvas pixel dimensions from CSS layout, scale ctx by dpr
function _initCanvas() {
  const canvas = document.getElementById('fb-canvas');
  if (!canvas) return;

  const dpr  = window.devicePixelRatio || 1;
  const cssW = canvas.offsetWidth;
  const cssH = canvas.offsetHeight;

  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  _drawCtx = canvas.getContext('2d');
  _drawCtx.scale(dpr, dpr);

  if (_screenshotCanvas) {
    _drawCtx.drawImage(_screenshotCanvas, 0, 0, cssW, cssH);
  } else {
    _drawCtx.fillStyle = '#f4f2ec';
    _drawCtx.fillRect(0, 0, cssW, cssH);
  }
  _saveDrawState();
}

function _updateToolUI() {
  document.getElementById('fb-pen')?.classList.toggle('fb-tool--active', _drawMode === 'pen');
  document.getElementById('fb-circle')?.classList.toggle('fb-tool--active', _drawMode === 'circle');
}

function _saveDrawState() {
  if (!_drawCtx) return;
  const canvas = _drawCtx.canvas;
  _drawHistory.push(_drawCtx.getImageData(0, 0, canvas.width, canvas.height));
  document.getElementById('fb-modal-wrap')?._checkSubmitReady?.();
}

function _undo() {
  if (_drawHistory.length <= 1) return;
  _drawHistory.pop();
  _drawCtx.putImageData(_drawHistory[_drawHistory.length - 1], 0, 0);
  document.getElementById('fb-modal-wrap')?._checkSubmitReady?.();
}

function _clearDraw() {
  if (!_drawCtx) return;
  const canvas = _drawCtx.canvas;
  const dpr  = window.devicePixelRatio || 1;
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;
  if (_screenshotCanvas) {
    _drawCtx.drawImage(_screenshotCanvas, 0, 0, cssW, cssH);
  } else {
    _drawCtx.fillStyle = '#f4f2ec';
    _drawCtx.fillRect(0, 0, cssW, cssH);
  }
  _drawHistory = [_drawCtx.getImageData(0, 0, canvas.width, canvas.height)];
  document.getElementById('fb-modal-wrap')?._checkSubmitReady?.();
}

function _onDrawStart(e) {
  e.preventDefault();
  _drawingActive = true;
  const { x, y } = _canvasXY(e);
  if (_drawMode === 'pen') {
    _penPath = [{ x, y }];
    _drawCtx.beginPath();
    _drawCtx.moveTo(x, y);
    _drawCtx.strokeStyle = _drawColor;
    _drawCtx.lineWidth = 3;
    _drawCtx.lineCap = 'round';
    _drawCtx.lineJoin = 'round';
  } else {
    _circleStart = { x, y };
  }
}

function _onDrawMove(e) {
  if (!_drawingActive) return;
  e.preventDefault();
  const { x, y } = _canvasXY(e);
  if (_drawMode === 'pen') {
    _penPath.push({ x, y });
    _drawCtx.lineTo(x, y);
    _drawCtx.stroke();
  } else if (_circleStart) {
    if (_drawHistory.length) _drawCtx.putImageData(_drawHistory[_drawHistory.length - 1], 0, 0);
    const r = Math.sqrt((x - _circleStart.x) ** 2 + (y - _circleStart.y) ** 2);
    _drawCtx.beginPath();
    _drawCtx.arc(_circleStart.x, _circleStart.y, r, 0, Math.PI * 2);
    _drawCtx.strokeStyle = _drawColor;
    _drawCtx.lineWidth = 3;
    _drawCtx.stroke();
  }
}

function _onDrawEnd(e) {
  if (!_drawingActive) return;
  _drawingActive = false;
  const { x, y } = _canvasXY(e);
  if (_drawMode === 'circle' && _circleStart) {
    const r = Math.sqrt((x - _circleStart.x) ** 2 + (y - _circleStart.y) ** 2);
    if (_drawHistory.length) _drawCtx.putImageData(_drawHistory[_drawHistory.length - 1], 0, 0);
    _drawCtx.beginPath();
    _drawCtx.arc(_circleStart.x, _circleStart.y, r, 0, Math.PI * 2);
    _drawCtx.strokeStyle = _drawColor;
    _drawCtx.lineWidth = 3;
    _drawCtx.stroke();
    _circleStart = null;
  }
  _saveDrawState();
}

// D8 issue 4: coordinates in CSS pixels — ctx is already scaled by dpr via ctx.scale()
function _canvasXY(e) {
  const rect = _drawCtx.canvas.getBoundingClientRect();
  const src = e.touches?.[0] ?? e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

function _closeFeedbackModal() {
  document.getElementById('fb-modal-wrap')?.remove();
  _drawCtx = null;
  _drawHistory = [];
}

function _submitFeedback() {
  // Capture session from inline profile fields on first submit (D10: include email)
  if (!_session) {
    _session = {
      name:   document.getElementById('fb-name')?.value.trim()   || '',
      email:  document.getElementById('fb-email')?.value.trim()  || '',
      league: document.getElementById('fb-league')?.value.trim() || '',
      team:   document.getElementById('fb-team')?.value.trim()   || '',
      role:   document.getElementById('fb-role')?.value          || '',
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(_session));
  }

  const comment = document.getElementById('fb-comment')?.value.trim() || '';
  const canvas  = document.getElementById('fb-canvas');
  const hasDrawing = _drawHistory.length > 1;
  const drawingDataUrl = hasDrawing ? canvas.toDataURL('image/png') : null;
  const screenshotDataUrl = _screenshotCanvas ? _screenshotCanvas.toDataURL('image/png') : null;

  const payload = {
    type:          'feedback',
    timestamp:     new Date().toISOString(),
    page:          window._mtbState?.tab || '',
    role:          _session?.role   || '',
    userName:      _session?.name   || '',
    email:         _session?.email  || '',
    league:        _session?.league || '',
    team:          _session?.team   || '',
    comment,
    hasDrawing,
    drawingUrl:    drawingDataUrl,
    screenshotUrl: screenshotDataUrl,
  };

  _post(payload);
  _trackEvent('feedback', { page: payload.page });

  const submit = document.getElementById('fb-submit');
  if (submit) {
    submit.textContent = '✓ Feedback sent!';
    submit.disabled = true;
  }
  setTimeout(_closeFeedbackModal, 1600);
}

// ── Post routing: backend (feedback + engagement, each with its own queue)
// / sheet (only when BACKEND_URL is unset — a no-backend build) ──────────────

/**
 * Builds the backend-post + offline-queue trio for one `type` stream
 * (feedback, engagement). Both streams need the exact same three
 * behaviors — POST to their own endpoint, queue under their own
 * localStorage-key prefix on failure, drain that queue back to the same
 * endpoint — so this factory keeps that logic in one place rather than
 * duplicating it per stream (the feedback build introduced the pattern
 * with `_postFeedbackToBackend`/`_queueFeedbackForBackend`/
 * `_drainFeedbackBackendQueue`; engagement reuses it instead of copy-
 * pasting a second near-identical trio).
 *
 * @param {string} endpointPath - e.g. '/api/feedback'
 * @param {string} queuePrefix  - localStorage key prefix for this stream's
 *   own offline queue, e.g. 'mtb_fb_pending_backend_'
 */
function _makeBackendQueue(endpointPath, queuePrefix) {
  function post(payload) {
    return fetch(`${BACKEND_URL}${endpointPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(res => {
      if (!res.ok) throw new Error(endpointPath + ' backend responded ' + res.status);
    });
  }

  function enqueue(payload) {
    localStorage.setItem(queuePrefix + Date.now(), JSON.stringify(payload));
  }

  function drain() {
    if (!BACKEND_URL) return; // nothing to drain against
    Object.keys(localStorage)
      .filter(k => k.startsWith(queuePrefix))
      .forEach(k => {
        let payload;
        try {
          payload = JSON.parse(localStorage.getItem(k));
        } catch {
          localStorage.removeItem(k); // corrupt entry -- drop rather than retry forever
          return;
        }
        post(payload)
          .then(() => localStorage.removeItem(k))
          .catch(() => { /* still unreachable -- leave queued, retry on next drain */ });
      });
  }

  return { post, enqueue, drain };
}

const _feedbackBackendQueue = _makeBackendQueue('/api/feedback', 'mtb_fb_pending_backend_');
const _engagementBackendQueue = _makeBackendQueue('/api/engagement', 'mtb_eng_pending_backend_');

function _post(payload) {
  const backendQueue =
    payload.type === 'feedback' ? _feedbackBackendQueue :
    payload.type === 'engagement' ? _engagementBackendQueue :
    null;

  if (backendQueue && BACKEND_URL) {
    backendQueue.post(payload)
      .then(() => {
        // A successful post is also a good moment to catch up anything
        // still stuck from an earlier offline attempt, for this stream.
        backendQueue.drain();
      })
      .catch(err => {
        log.warn(payload.type + '.backend_post_failed', { error: String(err) });
        backendQueue.enqueue(payload);
      });
    return;
  }
  // Either an unrecognized `type`, or BACKEND_URL is empty entirely
  // (no-backend build) -- there's no backend queue to hold this against,
  // so it uses the legacy sheet path, same as before BACKEND_URL existed.
  _postToSheetOrQueue(payload);
}

// ── Sheets POST / offline queue (fallback for both streams, only used in a
// no-backend build — see module docstring) ────────────────────────────────────

function _postToSheetOrQueue(payload) {
  const url = window.MTB_SHEETS_URL || localStorage.getItem(SHEETS_KEY);
  if (!url) { _queue(payload); return; }
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    mode: 'no-cors',
  }).catch(() => _queue(payload));
  _drainQueue(url);
}

function _queue(payload) {
  localStorage.setItem('mtb_pending_' + Date.now(), JSON.stringify(payload));
}

function _drainQueue(url) {
  Object.keys(localStorage)
    .filter(k => k.startsWith('mtb_pending_'))
    .forEach(k => {
      try {
        const p = JSON.parse(localStorage.getItem(k));
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(p), mode: 'no-cors' })
          .then(() => localStorage.removeItem(k))
          .catch(() => {});
      } catch { /* ignore */ }
    });
}

// ── CSS injection ─────────────────────────────────────────────────────────────

function _injectCSS() {
  const style = document.createElement('style');
  style.textContent = `
    .fb-input { padding:12px 14px; border:2px solid #e9e5dc; border-radius:10px; font:500 15px/1 -apple-system,sans-serif; width:100%; }
    .fb-input:focus { outline:none; border-color:#d94626; }
    .fb-role-row { display:flex; gap:8px; }
    .fb-role-btn { flex:1; padding:12px; border:2px solid #e9e5dc; border-radius:10px; font:700 14px/1 -apple-system,sans-serif; background:#fff; cursor:pointer; text-transform:uppercase; letter-spacing:.04em; color:#8d877a; }
    .fb-role-btn--active { background:#1c1b18; border-color:#1c1b18; color:#fff; }
    .fb-profile-section { display:flex; flex-direction:column; gap:8px; padding:12px 16px; border-bottom:1px solid #e9e5dc; background:#fafaf8; }
    .fb-profile-label { font:600 11px/1 -apple-system,sans-serif; letter-spacing:.06em; text-transform:uppercase; color:#8d877a; margin-bottom:2px; }

    #fb-btn { position:fixed; bottom:88px; right:16px; z-index:8000; background:#d94626; color:#fff; border:none; border-radius:20px; padding:10px 16px; font:700 13px/1 -apple-system,sans-serif; cursor:pointer; box-shadow:0 4px 12px rgba(217,70,38,.4); }
    #fb-btn:active { opacity:.85; }

    #fb-modal-wrap { position:fixed; inset:0; z-index:8500; background:rgba(0,0,0,.5); display:flex; align-items:flex-end; justify-content:center; }
    .fb-modal { background:#fff; border-radius:20px 20px 0 0; width:100%; max-width:412px; max-height:92dvh; display:flex; flex-direction:column; }
    .fb-modal-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #e9e5dc; flex-shrink:0; }
    .fb-modal-title { font:700 15px/1 -apple-system,sans-serif; text-transform:uppercase; letter-spacing:.06em; }
    .fb-close { background:none; border:none; font-size:18px; cursor:pointer; color:#8d877a; padding:4px; }
    .fb-canvas-wrap { flex-shrink:0; position:relative; }
    #fb-canvas { width:100%; height:180px; display:block; touch-action:none; }
    .fb-canvas-tools { display:flex; align-items:center; gap:8px; padding:8px 12px; background:#f4f2ec; border-bottom:1px solid #e9e5dc; flex-wrap:wrap; }
    .fb-tool { width:32px; height:32px; border:1.5px solid #e9e5dc; border-radius:8px; background:#fff; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .fb-tool--active { border-color:#d94626; background:#fdf0ed; }
    .fb-colors { display:flex; gap:5px; }
    .fb-color { width:24px; height:24px; border-radius:50%; border:2px solid transparent; cursor:pointer; }
    .fb-color--active { border-color:#1c1b18; }
    .fb-modal-scroll { flex:1; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; }
    .fb-modal-body { padding:12px 16px; }
    .fb-comment { width:100%; padding:12px 14px; border:2px solid #e9e5dc; border-radius:10px; font:400 14px/1.5 -apple-system,sans-serif; resize:none; }
    .fb-comment:focus { outline:none; border-color:#d94626; }
    .fb-modal-foot { position:sticky; bottom:0; padding:12px 16px 24px; display:flex; flex-direction:column; gap:8px; border-top:1px solid #e9e5dc; background:#fff; }
    .fb-submit { padding:13px; border-radius:11px; background:#d94626; color:#fff; border:none; font:700 15px/1 -apple-system,sans-serif; cursor:pointer; }
    .fb-submit:disabled { background:#e9e5dc; color:#8d877a; cursor:default; }
    .fb-cancel { background:none; border:none; font:600 13px/1 -apple-system,sans-serif; color:#8d877a; cursor:pointer; padding:4px; }
  `;
  document.head.appendChild(style);
}
