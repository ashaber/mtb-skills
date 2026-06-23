/**
 * src/feedback.js — Conference feedback & engagement tracking.
 * Only loaded when ?feedback=true is in the URL.
 * Exports initFeedback() — called once from main.js boot.
 */

const SHEETS_KEY = 'mtb_sheets_url';
const SESSION_KEY = 'mtb_feedback_session';

let _session = null;
let _events = [];
const _sessionId = 'sess_' + Date.now();
const _sessionStart = Date.now();

// ── Public API ────────────────────────────────────────────────────────────────

export function initFeedback() {
  _injectCSS();
  _session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  _startEngagement();
  _addFeedbackButton();
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

function _openFeedbackModal() {
  const needsProfile = !_session;
  const modal = document.createElement('div');
  modal.id = 'fb-modal-wrap';
  modal.innerHTML = `
    <div class="fb-modal">
      <div class="fb-modal-head">
        <span class="fb-modal-title">Feedback — <span id="fb-page-label"></span></span>
        <button class="fb-close" id="fb-close">✕</button>
      </div>
      ${needsProfile ? `
      <div class="fb-profile-section" id="fb-profile">
        <p class="fb-profile-label">Tell us about yourself (optional except role)</p>
        <input class="fb-input" id="fb-name" type="text" placeholder="Your name (optional)" autocomplete="name">
        <input class="fb-input" id="fb-league" type="text" placeholder="NICA League (optional)">
        <div class="fb-role-row">
          <button class="fb-role-btn" data-role="Coach">Coach</button>
          <button class="fb-role-btn" data-role="Athlete">Athlete</button>
        </div>
        <input type="hidden" id="fb-role">
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
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('fb-page-label').textContent = window._mtbState?.tab || 'app';

  // Profile section: role buttons (shown on first open only)
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

  const canvas = document.getElementById('fb-canvas');
  _drawCtx = canvas.getContext('2d');
  _drawHistory = [];
  _drawMode = 'pen';
  _drawColor = '#d94626';
  _penPath = [];
  _circleStart = null;

  import('html2canvas').then(m => {
    return m.default(document.getElementById('app'), { useCORS: true, scale: 1 }).catch(() => null);
  }).catch(() => null).then(shot => {
    if (shot) {
      canvas.width  = shot.width;
      canvas.height = shot.height;
      _drawCtx.drawImage(shot, 0, 0);
      _screenshotCanvas = shot;
    } else {
      canvas.width  = 300;
      canvas.height = 200;
      _drawCtx.fillStyle = '#f4f2ec';
      _drawCtx.fillRect(0, 0, 300, 200);
      _screenshotCanvas = null;
    }
    _saveDrawState();
  });

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

  // Draw events
  canvas.addEventListener('pointerdown', _onDrawStart);
  canvas.addEventListener('pointermove', _onDrawMove);
  canvas.addEventListener('pointerup', _onDrawEnd);

  // Submit enable/disable
  const comment = document.getElementById('fb-comment');
  const submit  = document.getElementById('fb-submit');
  comment.addEventListener('input', _checkSubmitReady);

  document.getElementById('fb-close').addEventListener('click', _closeFeedbackModal);
  document.getElementById('fb-cancel').addEventListener('click', _closeFeedbackModal);
  document.getElementById('fb-submit').addEventListener('click', _submitFeedback);

  function _checkSubmitReady() {
    const hasComment = comment.value.trim().length > 0;
    const hasDrawing = _drawHistory.length > 0;
    const hasRole = !needsProfile || !!document.getElementById('fb-role')?.value;
    submit.disabled = (!hasComment && !hasDrawing) || !hasRole;
  }
  modal._checkSubmitReady = _checkSubmitReady;
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
  if (!_drawCtx || !_screenshotCanvas) return;
  _drawCtx.drawImage(_screenshotCanvas, 0, 0);
  _drawHistory = [_drawCtx.getImageData(0, 0, _drawCtx.canvas.width, _drawCtx.canvas.height)];
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
    // Preview: restore last saved state, draw circle
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

function _canvasXY(e) {
  const rect = _drawCtx.canvas.getBoundingClientRect();
  const scaleX = _drawCtx.canvas.width  / rect.width;
  const scaleY = _drawCtx.canvas.height / rect.height;
  const src = e.touches?.[0] ?? e;
  return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
}

function _closeFeedbackModal() {
  document.getElementById('fb-modal-wrap')?.remove();
  _drawCtx = null;
  _drawHistory = [];
}

function _submitFeedback() {
  // Capture session from inline profile fields if this is first submit
  if (!_session) {
    _session = {
      name:   document.getElementById('fb-name')?.value.trim()   || '',
      league: document.getElementById('fb-league')?.value.trim() || '',
      team:   '',
      role:   document.getElementById('fb-role')?.value          || '',
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(_session));
  }

  const comment = document.getElementById('fb-comment')?.value.trim() || '';
  const canvas  = document.getElementById('fb-canvas');
  const hasDrawing = _drawHistory.length > 0;
  const drawingDataUrl = hasDrawing ? canvas.toDataURL('image/png') : null;
  const screenshotDataUrl = _screenshotCanvas ? _screenshotCanvas.toDataURL('image/png') : null;

  const payload = {
    type:          'feedback',
    timestamp:     new Date().toISOString(),
    page:          window._mtbState?.tab || '',
    role:          _session?.role   || '',
    userName:      _session?.name   || '',
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

// ── Sheets POST / offline queue ───────────────────────────────────────────────

function _post(payload) {
  const url = window.MTB_SHEETS_URL || localStorage.getItem(SHEETS_KEY);
  if (!url) { _queue(payload); return; }
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
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
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(p) })
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

    #fb-btn { position:fixed; bottom:88px; left:16px; z-index:8000; background:#d94626; color:#fff; border:none; border-radius:20px; padding:10px 16px; font:700 13px/1 -apple-system,sans-serif; cursor:pointer; box-shadow:0 4px 12px rgba(217,70,38,.4); }
    #fb-btn:active { opacity:.85; }

    #fb-modal-wrap { position:fixed; inset:0; z-index:8500; background:rgba(0,0,0,.5); display:flex; align-items:flex-end; justify-content:center; }
    .fb-modal { background:#fff; border-radius:20px 20px 0 0; width:100%; max-width:412px; max-height:92dvh; display:flex; flex-direction:column; }
    .fb-modal-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #e9e5dc; flex-shrink:0; }
    .fb-modal-title { font:700 15px/1 -apple-system,sans-serif; text-transform:uppercase; letter-spacing:.06em; }
    .fb-close { background:none; border:none; font-size:18px; cursor:pointer; color:#8d877a; padding:4px; }
    .fb-canvas-wrap { flex-shrink:0; position:relative; }
    #fb-canvas { width:100%; max-height:220px; display:block; object-fit:contain; touch-action:none; }
    .fb-canvas-tools { display:flex; align-items:center; gap:8px; padding:8px 12px; background:#f4f2ec; border-bottom:1px solid #e9e5dc; flex-wrap:wrap; }
    .fb-tool { width:32px; height:32px; border:1.5px solid #e9e5dc; border-radius:8px; background:#fff; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .fb-tool--active { border-color:#d94626; background:#fdf0ed; }
    .fb-colors { display:flex; gap:5px; }
    .fb-color { width:24px; height:24px; border-radius:50%; border:2px solid transparent; cursor:pointer; }
    .fb-color--active { border-color:#1c1b18; }
    .fb-modal-body { padding:12px 16px; flex:1; min-height:0; }
    .fb-comment { width:100%; padding:12px 14px; border:2px solid #e9e5dc; border-radius:10px; font:400 14px/1.5 -apple-system,sans-serif; resize:none; }
    .fb-comment:focus { outline:none; border-color:#d94626; }
    .fb-modal-foot { padding:12px 16px 24px; display:flex; flex-direction:column; gap:8px; flex-shrink:0; }
    .fb-submit { padding:13px; border-radius:11px; background:#d94626; color:#fff; border:none; font:700 15px/1 -apple-system,sans-serif; cursor:pointer; }
    .fb-submit:disabled { background:#e9e5dc; color:#8d877a; cursor:default; }
    .fb-cancel { background:none; border:none; font:600 13px/1 -apple-system,sans-serif; color:#8d877a; cursor:pointer; padding:4px; }
  `;
  document.head.appendChild(style);
}
