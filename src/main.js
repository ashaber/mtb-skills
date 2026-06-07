import log from './log.js';
import { SKILLS, SKILL_IDS, TRAIL_LABELS, trailReadiness } from './rubric.js';
import {
  getAthletes, saveAthlete, deleteAthlete,
  saveObservation, getObservations,
  setConfirmedLevel, getAthleteConfirmedLevels,
  getCoach, saveCoach,
  exportAll, importAll,
} from './storage.js';

// ── State ─────────────────────────────────────────────────────────────────────

const s = {
  view:      'roster',  // 'roster' | 'athlete' | 'skill'
  athleteId: null,
  skill:     null,
  picked:    null,      // level selected in picker (1–5 or null)
  rubricOpen: false,
};

// ── Navigation ────────────────────────────────────────────────────────────────

function go(view, patch = {}) {
  s.view       = view;
  s.picked     = null;
  s.rubricOpen = false;
  Object.assign(s, patch);
  draw();
  window.scrollTo(0, 0);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function draw() {
  document.getElementById('app').innerHTML =
    s.view === 'roster'  ? viewRoster()  :
    s.view === 'athlete' ? viewAthlete() :
    s.view === 'skill'   ? viewSkill()   : '';
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function badge(level, size = 36) {
  const n = level || 0;
  return `<span class="lv lv${n}" style="--sz:${size}px">${n || '—'}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

const SHORT = { body_position: 'BP', braking: 'Brk', cornering: 'Crn' };

const CHEVRON = `<svg class="chevron" width="18" height="18" viewBox="0 0 18 18"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <path d="M7 4l5 5-5 5"/></svg>`;

const BACK = `<svg width="20" height="20" viewBox="0 0 20 20"
  fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
  <path d="M13 5l-6 6 6 6"/></svg>`;

const GEAR = `<svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor">
  <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0
    01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947
    2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836
    1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6
    1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734
    2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6
    0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532
    1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
</svg>`;

const TRASH = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000
    2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0
    0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0
    102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
</svg>`;

// ── Roster view ───────────────────────────────────────────────────────────────

function viewRoster() {
  const athletes = getAthletes().sort((a, b) => a.name.localeCompare(b.name));

  const list = athletes.length === 0
    ? `<div class="empty">
        <h2>No athletes yet</h2>
        Tap + to add your first athlete.
       </div>`
    : athletes.map(a => {
        const c = getAthleteConfirmedLevels(a.id);
        const chips = SKILL_IDS.map(sk =>
          `<span class="chip">${badge(c[sk], 24)}<span>${SHORT[sk]}</span></span>`
        ).join('');
        return `<button class="row" data-a="go-athlete" data-id="${a.id}">
          <div class="row-body">
            <div class="row-title">${esc(a.name)}</div>
            <div class="chips">${chips}</div>
          </div>
          ${CHEVRON}
        </button>`;
      }).join('');

  return `
    <div class="hdr">
      <span class="hdr-title">MTB Skills</span>
      <button class="ico-btn" data-a="open-settings" aria-label="Settings">${GEAR}</button>
    </div>
    <div class="list">${list}</div>
    <div class="ph"></div>
    <button class="fab" data-a="add-athlete" aria-label="Add athlete">+</button>`;
}

// ── Athlete view ──────────────────────────────────────────────────────────────

function viewAthlete() {
  const a = getAthletes().find(x => x.id === s.athleteId);
  if (!a) { go('roster'); return ''; }

  const conf = getAthleteConfirmedLevels(a.id);
  const ready = trailReadiness(conf);

  const pills = Object.keys(TRAIL_LABELS).map(t =>
    `<span class="pill ${ready.includes(t) ? 'pill-yes' : 'pill-no'}">${esc(TRAIL_LABELS[t])}</span>`
  ).join('');

  const skills = SKILL_IDS.map(sk => {
    const obs = getObservations({ athlete_id: a.id, skill: sk });
    const last = obs.length ? obs[obs.length - 1] : null;
    const sub = last
      ? `Last seen ${fmtDate(last.session_date)} · Level ${last.level_observed}`
      : 'No observations yet';
    return `<button class="row" data-a="go-skill" data-skill="${sk}">
      ${badge(conf[sk], 44)}
      <div class="row-body">
        <div class="row-title">${esc(SKILLS[sk].name)}</div>
        <div class="row-sub">${sub}</div>
      </div>
      ${CHEVRON}
    </button>`;
  }).join('');

  return `
    <div class="hdr">
      <button class="ico-btn" data-a="go-roster" aria-label="Back">${BACK}</button>
      <span class="hdr-title">${esc(a.name)}</span>
      <button class="ico-btn" data-a="del-athlete" data-id="${a.id}" aria-label="Delete">${TRASH}</button>
    </div>
    <div class="sec">Trail Readiness</div>
    <div class="trail-row">${pills}</div>
    <div class="sec">Skills</div>
    <div class="list" style="padding-top:4px">${skills}</div>
    <div class="ph"></div>`;
}

// ── Skill view ────────────────────────────────────────────────────────────────

function viewSkill() {
  const a = getAthletes().find(x => x.id === s.athleteId);
  if (!a) { go('roster'); return ''; }

  const sk   = s.skill;
  const def  = SKILLS[sk];
  const conf = getAthleteConfirmedLevels(a.id)[sk];

  const pickerBtns = [1,2,3,4,5].map(n =>
    `<button class="lv-btn${s.picked === n ? ' sel' : ''}"
      data-a="pick" data-n="${n}">${n}</button>`
  ).join('');

  const desc = s.picked
    ? def.levels[s.picked].when_breaks
    : conf ? `Confirmed: Level ${conf}` : 'No confirmed level yet';

  const actions = s.picked
    ? `<div class="actions">
        <button class="btn btn-primary" data-a="log-obs">Log Observation</button>
        <button class="btn btn-outline" data-a="confirm-lv">
          Confirm Level ${s.picked}${conf ? ` (currently ${conf})` : ''}
        </button>
       </div>`
    : `<div class="hint">Select a level to log or confirm</div>`;

  const rubricLevel = s.picked || conf || 1;
  const rubricDef   = def.levels[rubricLevel];
  const rubric = `
    <div class="card">
      <button class="rubric-toggle" data-a="toggle-rubric">
        <span>Rubric · Level ${rubricLevel}: ${esc(rubricDef.when_breaks)}</span>
        <span>${s.rubricOpen ? '▲' : '▼'}</span>
      </button>
      ${s.rubricOpen
        ? `<ul class="fail-list">${rubricDef.failure_modes.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`
        : ''}
    </div>`;

  const observations = getObservations({ athlete_id: a.id, skill: sk }).slice().reverse();
  const history = observations.length
    ? observations.map(o => `
        <div class="obs-row">
          ${badge(o.level_observed, 32)}
          <span class="obs-meta">${fmtDate(o.session_date)}</span>
          ${o.notes ? `<span class="obs-note">${esc(o.notes)}</span>` : ''}
        </div>`).join('')
    : `<div style="padding:16px;font-size:14px;color:var(--text2)">No observations logged yet</div>`;

  return `
    <div class="hdr">
      <button class="ico-btn" data-a="go-athlete" aria-label="Back">${BACK}</button>
      <span class="hdr-title" style="font-size:15px">${esc(a.name)} · ${esc(def.name)}</span>
      ${badge(conf, 34)}
    </div>
    <div class="sec">Select Level Observed</div>
    <div class="picker">${pickerBtns}</div>
    <div class="lv-desc">${esc(desc)}</div>
    ${actions}
    ${rubric}
    <div class="card">
      <div class="card-head">Observation History</div>
      ${history}
    </div>
    <div style="height:24px"></div>`;
}

// ── Modals ────────────────────────────────────────────────────────────────────

function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal').classList.remove('hidden');
  const imp = document.getElementById('imp-file');
  if (imp) imp.addEventListener('change', onImport);
  setTimeout(() => document.querySelector('#modal-content .fi')?.focus(), 60);
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

function modalAddAthlete() {
  return `
    <div class="modal-head">
      Add Athlete
      <button class="ico-btn" data-m="close">✕</button>
    </div>
    <div class="fg">
      <label class="fl" for="inp-name">Name</label>
      <input class="fi" id="inp-name" type="text" placeholder="Athlete name" autocapitalize="words">
      <label class="fl" for="inp-grade" style="margin-top:4px">Grade (optional)</label>
      <input class="fi" id="inp-grade" type="number" min="6" max="12" placeholder="e.g. 9" autocomplete="off">
    </div>
    <div class="fg" style="padding-top:0">
      <button class="btn btn-primary" data-m="save-athlete">Add Athlete</button>
    </div>
    <div style="height:12px"></div>`;
}

function modalSettings() {
  const coach = getCoach();
  return `
    <div class="modal-head">
      Settings
      <button class="ico-btn" data-m="close">✕</button>
    </div>
    <div class="fg">
      <label class="fl" for="inp-coach">Coach Name</label>
      <input class="fi" id="inp-coach" type="text" value="${esc(coach?.name ?? '')}" placeholder="Your name">
    </div>
    <div class="fg" style="padding-top:0">
      <button class="btn btn-primary" data-m="save-coach">Save</button>
    </div>
    <div style="border-top:1px solid var(--border);padding:16px;display:flex;flex-direction:column;gap:8px">
      <div class="fl" style="padding-bottom:4px">Data</div>
      <button class="btn btn-outline" data-m="export">Export JSON Backup</button>
      <label class="btn btn-outline" style="cursor:pointer">
        Import JSON Backup
        <input id="imp-file" type="file" accept=".json" style="display:none">
      </label>
    </div>
    <div style="height:16px"></div>`;
}

// ── Event handlers ────────────────────────────────────────────────────────────

function onAppClick(e) {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const { a: action, id, skill, n } = el.dataset;

  if (action === 'go-roster')   return go('roster');
  if (action === 'go-athlete')  return id ? go('athlete', { athleteId: id }) : go('athlete');
  if (action === 'go-skill')    return go('skill', { skill });

  if (action === 'open-settings') return openModal(modalSettings());
  if (action === 'add-athlete')   return openModal(modalAddAthlete());

  if (action === 'del-athlete') {
    const a = getAthletes().find(x => x.id === id);
    if (a && confirm(`Delete ${a.name}? All observations will be removed.`)) {
      deleteAthlete(id);
      log.info('athlete.delete', { athlete_id: id });
      go('roster');
    }
    return;
  }

  if (action === 'pick') {
    s.picked = s.picked === Number(n) ? null : Number(n);
    draw();
    return;
  }

  if (action === 'toggle-rubric') {
    s.rubricOpen = !s.rubricOpen;
    draw();
    return;
  }

  if (action === 'log-obs') {
    if (!s.picked) return;
    saveObservation({ athlete_id: s.athleteId, skill: s.skill, level_observed: s.picked });
    log.info('observation.log', { athlete_id: s.athleteId, skill: s.skill, level: s.picked });
    s.picked = null;
    draw();
    return;
  }

  if (action === 'confirm-lv') {
    if (!s.picked) return;
    setConfirmedLevel({ athlete_id: s.athleteId, skill: s.skill, level: s.picked });
    log.info('level.confirm', { athlete_id: s.athleteId, skill: s.skill, level: s.picked });
    s.picked = null;
    draw();
    return;
  }
}

function onModalClick(e) {
  if (e.target === document.getElementById('modal')) return closeModal();

  const el = e.target.closest('[data-m]');
  if (!el) return;
  const action = el.dataset.m;

  if (action === 'close') return closeModal();

  if (action === 'save-athlete') {
    const name = document.getElementById('inp-name')?.value?.trim();
    if (!name) { document.getElementById('inp-name')?.focus(); return; }
    const grade = document.getElementById('inp-grade')?.value;
    const athlete = saveAthlete({ name, grade: grade ? Number(grade) : null });
    log.info('athlete.add', { athlete_id: athlete.id });
    closeModal();
    draw();
    return;
  }

  if (action === 'save-coach') {
    const name = document.getElementById('inp-coach')?.value?.trim();
    if (name) saveCoach({ name });
    closeModal();
    return;
  }

  if (action === 'export') {
    log.info('data.export');
    const blob = new Blob([exportAll()], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mtb-skills-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
}

function onModalKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    document.querySelector('#modal-content button[data-m^="save"]')?.click();
  }
  if (e.key === 'Escape') closeModal();
}

function onImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      importAll(ev.target.result);
      log.info('data.import.success', { athletes: getAthletes().length });
      closeModal();
      go('roster');
    } catch (e) {
      log.error('data.import.failed', { error: e.message });
      alert('Could not import — check that this is a valid MTB Skills backup file.');
    }
  };
  reader.readAsText(file);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.getElementById('app').addEventListener('click', onAppClick);
document.getElementById('modal').addEventListener('click', onModalClick);
document.getElementById('modal').addEventListener('keydown', onModalKeydown);

log.info('app.init', { athletes: getAthletes().length, observations: getObservations().length });
draw();
