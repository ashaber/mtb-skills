/**
 * src/main.js — state machine, event handlers, boot.
 * Two views: 'roster' | 'card'. Card replaces the old athlete + skill views.
 */

import log from './log.js';
import {
  getAthletes, saveAthlete, deleteAthlete,
  saveObservation, getObservations,
  setConfirmedLevel, getAthleteConfirmedLevels,
  getCoach, saveCoach,
  getPhoto, savePhoto,
  getTeamSettings, saveTeamSettings,
  exportAll, importAll,
} from './storage.js';
import { SKILL_IDS } from './rubric.js';
import { viewRoster, viewCard, modalAddAthlete, modalSettings } from './views.js';

// ── State ─────────────────────────────────────────────────────────────────────
const s = {
  view:       'roster',   // 'roster' | 'card'
  athleteId:  null,
  expandedId: null,       // which roster row has inline accordion open
  draft:      {},         // { [athleteId]: { body_position, braking, cornering } }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }

function ensureDraft(athleteId) {
  if (!s.draft[athleteId]) {
    const conf = getAthleteConfirmedLevels(athleteId);
    s.draft[athleteId] = {
      body_position: conf.body_position || 1,
      braking:       conf.braking       || 1,
      cornering:     conf.cornering     || 1,
    };
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function go(view, patch = {}) {
  s.view = view;
  Object.assign(s, patch);
  draw();
  window.scrollTo(0, 0);
}

function goCard(athleteId) {
  ensureDraft(athleteId);
  go('card', { athleteId });
}

function goRoster() {
  go('roster');
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function draw() {
  document.getElementById('app').innerHTML =
    s.view === 'card' ? viewCard(s) : viewRoster(s);

  // Wire photo upload (can't use event delegation for file inputs)
  const photoInput = document.getElementById('photo-upload');
  if (photoInput) {
    photoInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const aid = photoInput.dataset.aid;
        savePhoto(aid, ev.target.result);
        log.info('photo.save', { athlete_id: aid });
        draw();
      };
      reader.readAsDataURL(file);
    });
  }

  // Wire notes textarea (auto-save on blur)
  const notesArea = document.querySelector('.notes-area');
  if (notesArea) {
    notesArea.addEventListener('blur', e => {
      const aid = e.target.dataset.id;
      const a = getAthletes().find(x => x.id === aid);
      if (a) { saveAthlete({ ...a, notes: e.target.value }); }
    });
  }
}

// ── Log / Confirm helpers ─────────────────────────────────────────────────────
function logSession(athleteId) {
  const d = s.draft[athleteId];
  if (!d) return;
  const conf = getAthleteConfirmedLevels(athleteId);
  const sessionDate = today();

  SKILL_IDS.forEach(sk => {
    const lv = d[sk];
    saveObservation({ athlete_id: athleteId, skill: sk, level_observed: lv, session_date: sessionDate });
    // Initial level: if no confirmed level yet, this first observation sets it.
    if (!conf[sk]) setConfirmedLevel({ athlete_id: athleteId, skill: sk, level: lv });
  });

  log.info('session.log', { athlete_id: athleteId, bp: d.body_position, brk: d.braking, crn: d.cornering });
  flash(`${conf.body_position ? 'Observation' : 'Initial levels'} saved`);
  draw();
}

function confirmSession(athleteId) {
  const d = s.draft[athleteId];
  if (!d) return;
  SKILL_IDS.forEach(sk => {
    setConfirmedLevel({ athlete_id: athleteId, skill: sk, level: d[sk] });
  });
  log.info('session.confirm', { athlete_id: athleteId });
  flash('Confirmed levels updated');
  draw();
}

function confirmOneSkill(athleteId, skill, level) {
  setConfirmedLevel({ athlete_id: athleteId, skill, level });
  s.draft[athleteId] = { ...s.draft[athleteId], [skill]: level };
  log.info('skill.confirm', { athlete_id: athleteId, skill, level });
  flash(`${skill.replace('_', ' ')} confirmed at Lv ${level}`);
  draw();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer;
function flash(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('toast--show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('toast--show'), 2000);
}

// ── App events ────────────────────────────────────────────────────────────────
function onAppClick(e) {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const { a: action, id, sk, n, aid, lv } = el.dataset;

  if (action === 'go-roster') return goRoster();
  if (action === 'go-card')   return goCard(id);

  if (action === 'toggle-expand') {
    s.expandedId = (s.expandedId === id) ? null : id;
    ensureDraft(id);
    draw();
    return;
  }

  if (action === 'draft-level') {
    s.draft[aid] = s.draft[aid] || {};
    s.draft[aid][sk] = +n;
    draw();
    return;
  }

  if (action === 'log-session')     return logSession(id);
  if (action === 'confirm-session') return confirmSession(id);
  if (action === 'confirm-skill')   return confirmOneSkill(id, sk, +n);

  if (action === 'del-athlete') {
    const a = getAthletes().find(x => x.id === id);
    if (a && confirm(`Delete ${a.name}? All observations will be removed.`)) {
      deleteAthlete(id);
      delete s.draft[id];
      log.info('athlete.delete', { athlete_id: id });
      goRoster();
    }
    return;
  }

  if (action === 'open-add')      return openModal(modalAddAthlete());
  if (action === 'open-settings') return openModal(modalSettings());

  if (action === 'open-rubric-doc') {
    // Placeholder — wire to the real long-form doc URL per skill/level
    alert(`Full rubric: ${sk.replace('_', ' ')} › Level ${lv}\n(Connect to long-form reference document URL)`);
    return;
  }
  if (action === 'open-rubric-video') {
    alert(`Video: ${sk.replace('_', ' ')} › Level ${lv}\n(Connect to Tim's technique clip URL)`);
    return;
  }

  if (action === 'save-notes') return; // handled via blur on textarea
}

// ── Modal events ──────────────────────────────────────────────────────────────
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

function onModalClick(e) {
  if (e.target === document.getElementById('modal')) return closeModal();
  const el = e.target.closest('[data-m]');
  if (!el) return;
  const action = el.dataset.m;

  if (action === 'close') return closeModal();

  if (action === 'save-athlete') {
    const name  = document.getElementById('inp-name')?.value?.trim();
    if (!name) { document.getElementById('inp-name')?.focus(); return; }
    const grade = document.getElementById('inp-grade')?.value;
    const plate = document.getElementById('inp-plate')?.value;
    const a = saveAthlete({ name, grade: grade ? +grade : null, plate: plate ? +plate : null });
    ensureDraft(a.id);
    s.expandedId = a.id;
    log.info('athlete.add', { athlete_id: a.id });
    closeModal();
    draw();
    return;
  }

  if (action === 'save-settings') {
    const teamName  = document.getElementById('inp-team')?.value?.trim();
    const coachName = document.getElementById('inp-coach')?.value?.trim();
    if (teamName)  saveTeamSettings({ name: teamName });
    if (coachName) { saveCoach({ name: coachName }); saveTeamSettings({ coachName }); }
    log.info('settings.save', {});
    closeModal();
    draw();
    return;
  }

  if (action === 'export') {
    log.info('data.export');
    const blob = new Blob([exportAll()], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mtb-skills-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
}

function onModalKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey)
    document.querySelector('#modal-content button[data-m^="save"]')?.click();
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
      goRoster();
    } catch (err) {
      log.error('data.import.failed', { error: err.message });
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
