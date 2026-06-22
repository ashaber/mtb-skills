/**
 * src/main.js — state machine, event handlers, boot.
 * Navigation: Tier 1 tabs in #app · Tier 2 layers in #stack · Tier 3 sheets in #sheet
 */

import './components.css';
import log from './log.js';
import {
  getPeople, getAthletes, savePerson, saveAthlete, deleteAthlete,
  saveObservation, getObservations,
  setConfirmedLevel, getAthleteConfirmedLevels,
  getCoach, saveCoach,
  getPhoto, savePhoto,
  getTeamSettings, saveTeamSettings,
  getRosterFilter, saveRosterFilter,
  getTodaysPractice, toggleAttendance, getAttendance,
  exportAll, importAll, exportAttendance,
  gradeToCategory, categoryToGrade,
} from './storage.js';
import { SKILL_IDS } from './rubric.js';
import { encodeCard, decodeCard, detectMerge } from './trading.js';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  viewRoster, viewCard, viewRubric, viewPractice, viewSettings,
  modalAddPerson, modalAddAthlete, modalEditPerson,
  modalSafetyInfo, modalShareCard, modalScanCard, modalImportPreview,
  modalSettings,
} from './views.js';
import {
  pushLayer, pushSheet, pop, clearStack, stackDepth, refreshTopLayer,
} from './nav.js';

// ── State ─────────────────────────────────────────────────────────────────────
const s = {
  tab:             'roster',     // 'roster' | 'practice' | 'guide' | 'settings'
  athleteId:       null,
  expandedId:      null,
  draft:           {},
  rubricSkill:     SKILL_IDS[0],
  roster_filter:   getRosterFilter(),
  taking_attendance: false,
  today_practice:  null,
  settingsQR:      null,
};

// ── Camera / import state ─────────────────────────────────────────────────────
let _cameraStream = null;
let _scanFrame    = null;
let _pendingImport = null;

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

// ── Tab bar ───────────────────────────────────────────────────────────────────
const TAB_ICONS = {
  roster: `<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
  practice: `<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="M9 12h6M9 16h4"/></svg>`,
  guide: `<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`,
  settings: `<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
};

function drawTabBar() {
  const practice  = s.today_practice;
  const attending = practice
    ? getAttendance(practice.id).filter(a => a.status === 'attending').length
    : 0;

  const tabs = ['roster', 'practice', 'guide', 'settings'].map(tab => {
    const active = s.tab === tab;
    const labels = { roster: 'ROSTER', practice: 'PRACTICE', guide: 'GUIDE', settings: 'SETTINGS' };
    const badge = (tab === 'practice' && attending > 0)
      ? `<span class="tab-badge">${attending}</span>` : '';
    return `<button class="tab${active ? ' tab--active' : ''}" data-a="switch-tab" data-tab="${tab}" role="tab" aria-selected="${active}">
      ${TAB_ICONS[tab]}${badge}
      <span class="tab-label">${labels[tab]}</span>
    </button>`;
  }).join('');

  document.getElementById('tabbar').innerHTML = tabs;
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function draw() {
  const tabContent =
    s.tab === 'practice' ? viewPractice(s) :
    s.tab === 'guide'    ? viewRubric(s)   :
    s.tab === 'settings' ? viewSettings(s) :
    viewRoster(s);

  document.getElementById('app').innerHTML = tabContent;
  drawTabBar();
  window.scrollTo(0, 0);
}

// ── Navigation ────────────────────────────────────────────────────────────────
function switchTab(tab) {
  clearStack();
  s.tab = tab;
  if (tab === 'settings' && !s.settingsQR) _generateSettingsQR();
  draw();
}

function goCard(athleteId) {
  ensureDraft(athleteId);
  s.athleteId = athleteId;
  pushLayer(() => viewCard(s));
}

function refreshCard() {
  refreshTopLayer(() => viewCard(s));
}

function _generateSettingsQR() {
  QRCode.toDataURL('https://ashaber.github.io/mtb-skills/', { width: 200, margin: 2 })
    .then(qr => { s.settingsQR = qr; if (s.tab === 'settings') draw(); })
    .catch(() => {});
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
    if (!conf[sk]) setConfirmedLevel({ athlete_id: athleteId, skill: sk, level: lv });
  });

  log.info('session.log', { athlete_id: athleteId, bp: d.body_position, brk: d.braking, crn: d.cornering });
  flash(`${conf.body_position ? 'Observation' : 'Initial levels'} saved`);
  refreshCard();
}

function confirmSession(athleteId) {
  const d = s.draft[athleteId];
  if (!d) return;
  SKILL_IDS.forEach(sk => {
    setConfirmedLevel({ athlete_id: athleteId, skill: sk, level: d[sk] });
  });
  log.info('session.confirm', { athlete_id: athleteId });
  flash('Confirmed levels updated');
  refreshCard();
}

function confirmOneSkill(athleteId, skill, level) {
  setConfirmedLevel({ athlete_id: athleteId, skill, level });
  s.draft[athleteId] = { ...s.draft[athleteId], [skill]: level };
  log.info('skill.confirm', { athlete_id: athleteId, skill, level });
  flash(`${skill.replace('_', ' ')} confirmed at Lv ${level}`);
  refreshCard();
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

// ── Sheet (modal) helpers ─────────────────────────────────────────────────────
function openModal(html) {
  pushSheet(() => html);
  setTimeout(() => document.getElementById('sheet')?.querySelector('.fi')?.focus(), 80);
}

function closeModal() {
  stopCamera();
  pop();
}

// ── App click handler (delegated from document.body) ─────────────────────────
function onAppClick(e) {
  // Close overflow menu when clicking outside it
  const menu = document.getElementById('overflow-menu');
  if (menu && menu.style.display !== 'none') {
    const el = e.target.closest('[data-a]');
    if (!el || el.dataset.a !== 'toggle-overflow') {
      menu.style.display = 'none';
    }
  }

  const el = e.target.closest('[data-a]');
  if (!el) return;
  const { a: action, id, sk, n, aid, lv, f, tab, role } = el.dataset;

  if (action === 'switch-tab') {
    if (tab !== s.tab) switchTab(tab);
    return;
  }

  if (action === 'go-roster') { pop(); draw(); return; }

  if (action === 'go-card') {
    goCard(id);
    return;
  }

  if (action === 'toggle-overflow') {
    const m = document.getElementById('overflow-menu');
    if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
    return;
  }

  if (action === 'rubric-tab') {
    s.rubricSkill = el.dataset.id;
    if (s.tab === 'guide') {
      draw();
    } else {
      // rubric is in a sheet — re-render the sheet content
      const sheetScroll = document.querySelector('#sheet .sheet-scroll');
      if (sheetScroll) sheetScroll.innerHTML = viewRubric(s, { sheet: true });
    }
    return;
  }

  if (action === 'toggle-expand') {
    s.expandedId = (s.expandedId === id) ? null : id;
    ensureDraft(id);
    draw();
    return;
  }

  if (action === 'draft-level') {
    s.draft[aid] = s.draft[aid] || {};
    s.draft[aid][sk] = +n;
    if (s.tab === 'roster') {
      const level = +n;
      saveObservation({ athlete_id: aid, skill: sk, level_observed: level, session_date: today() });
      const conf = getAthleteConfirmedLevels(aid);
      if (!conf[sk]) setConfirmedLevel({ athlete_id: aid, skill: sk, level });
      log.info('obs.quick', { athlete_id: aid, skill: sk, level });
      flash(`${sk.replace(/_/g, ' ')} Lv ${level} recorded`);
    }
    draw();
    return;
  }

  if (action === 'log-session')     { logSession(id); return; }
  if (action === 'confirm-session') { confirmSession(id); return; }
  if (action === 'confirm-skill')   { confirmOneSkill(id, sk, +n); return; }

  if (action === 'edit-safety') {
    const a = getPeople().find(x => x.id === id);
    if (a) openModal(modalSafetyInfo(a));
    return;
  }

  if (action === 'share-card') {
    const a = getPeople().find(x => x.id === id);
    if (!a) return;
    const conf = getAthleteConfirmedLevels(id);
    const payload = encodeCard(a, conf);
    QRCode.toDataURL(payload, { width: 260, margin: 2, errorCorrectionLevel: 'Q' })
      .then(dataUrl => openModal(modalShareCard(a, conf, dataUrl)))
      .catch(err => log.error('qr.generate.failed', { error: err.message }));
    log.info('card.share', { athlete_id: id });
    return;
  }

  if (action === 'scan-card') {
    openModal(modalScanCard());
    startCameraScan();
    return;
  }

  if (action === 'del-athlete') {
    const a = getPeople().find(x => x.id === id);
    if (a && confirm(`Delete ${a.name}? All observations will be removed.`)) {
      deleteAthlete(id);
      delete s.draft[id];
      log.info('athlete.delete', { athlete_id: id });
      pop(); // close card layer
      draw();
    }
    return;
  }

  if (action === 'open-add') {
    const defaultRole = (role === 'coach') || (s.roster_filter === 'coaches') ? 'coach' : 'athlete';
    openModal(modalAddPerson(defaultRole));
    return;
  }

  if (action === 'open-settings') {
    openModal(modalSettings(s));
    return;
  }

  if (action === 'edit-person') {
    const person = getPeople().find(p => p.id === id);
    if (!person) return;
    log.info('person.edit.open', { person_id: id });
    openModal(modalEditPerson(person));
    return;
  }

  if (action === 'go-rubric-skill') {
    s.rubricSkill = sk;
    log.info('nav.rubric', { skill: sk });
    pushSheet(() => viewRubric(s, { sheet: true }));
    return;
  }

  if (action === 'filter-roster') {
    s.roster_filter = f;
    saveRosterFilter(f);
    log.info('roster.filter', { filter: f });
    draw();
    return;
  }

  if (action === 'start-attendance') {
    s.taking_attendance = true;
    s.today_practice = getTodaysPractice();
    log.info('attendance.start', { practice_id: s.today_practice.id });
    switchTab('roster');
    return;
  }

  if (action === 'resume-attendance') {
    switchTab('roster');
    return;
  }

  if (action === 'exit-attendance') {
    s.taking_attendance = false;
    draw();
    return;
  }

  if (action === 'toggle-attendance') {
    if (!s.today_practice) return;
    toggleAttendance(s.today_practice.id, id);
    log.info('attendance.toggle', { person_id: id, practice_id: s.today_practice.id });
    draw();
    return;
  }

  if (action === 'set-coach-level') {
    const coach = getPeople().find(p => p.id === id);
    if (!coach) return;
    savePerson({ ...coach, level: +n });
    log.info('coach.level.set', { person_id: id, level: +n });
    draw();
    return;
  }

  if (action === 'export-attendance') {
    if (!s.today_practice) return;
    const json = exportAttendance(s.today_practice.id);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `attendance-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    log.info('attendance.export', { practice_id: s.today_practice.id });
    return;
  }

  if (action === 'export-data') {
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

  if (action === 'save-settings') {
    const teamName  = document.getElementById('inp-team')?.value?.trim();
    const coachName = document.getElementById('inp-coach')?.value?.trim();
    if (teamName)  saveTeamSettings({ name: teamName });
    if (coachName) { saveCoach({ name: coachName }); saveTeamSettings({ coachName }); }
    log.info('settings.save', {});
    flash('Settings saved');
    return;
  }

  if (action === 'save-notes') return;
}

// ── Sheet (modal) click handler ───────────────────────────────────────────────
function onSheetClick(e) {
  const el = e.target.closest('[data-m]');
  if (!el) return;
  const action = el.dataset.m;

  if (action === 'close') { closeModal(); return; }

  if (action === 'role-tab') {
    const role = el.dataset.role;
    document.getElementById('inp-role').value = role;
    document.querySelectorAll('.role-tab').forEach(btn => {
      btn.classList.toggle('role-tab--active', btn.dataset.role === role);
    });
    document.getElementById('athlete-fields').style.display = role === 'athlete' ? 'block' : 'none';
    document.getElementById('coach-fields').style.display   = role === 'coach'   ? 'block' : 'none';
    return;
  }

  if (action === 'save-settings') {
    const teamName  = document.getElementById('inp-team')?.value?.trim();
    const coachName = document.getElementById('inp-coach')?.value?.trim();
    if (teamName)  saveTeamSettings({ name: teamName });
    if (coachName) { saveCoach({ name: coachName }); saveTeamSettings({ coachName }); }
    log.info('settings.save', {});
    flash('Settings saved');
    closeModal();
    return;
  }

  if (action === 'coach-level-btn') {
    const n = el.dataset.n;
    document.getElementById('inp-coach-level').value = n;
    document.querySelectorAll('.coach-lv-btn').forEach(btn => {
      btn.classList.toggle('coach-lv-btn--active', btn.dataset.n === n);
    });
    return;
  }

  if (action === 'save-person') {
    const name = document.getElementById('inp-name')?.value?.trim();
    if (!name) { document.getElementById('inp-name')?.focus(); return; }
    const role     = document.getElementById('inp-role')?.value || 'athlete';
    const personId = document.getElementById('inp-person-id')?.value || null;
    const isEdit   = !!personId;

    let personData = { name, role };
    if (personId) personData.id = personId;

    if (role === 'athlete') {
      const category = document.getElementById('inp-category')?.value || null;
      const gradeRaw = document.getElementById('inp-grade')?.value;
      const grade    = gradeRaw ? +gradeRaw : null;
      const plate    = document.getElementById('inp-plate')?.value;
      personData = { ...personData, category: category || null, grade, plate: plate ? +plate : null };
    } else {
      const level = document.getElementById('inp-coach-level')?.value;
      if (!level) { flash('Select a NICA level'); return; }
      personData = { ...personData, level: +level };
    }

    const p = savePerson(personData);
    if (role === 'athlete' && !isEdit) {
      ensureDraft(p.id);
      s.expandedId = p.id;
    }
    log.info(isEdit ? 'person.update' : 'person.add', { person_id: p.id, role });
    closeModal();
    if (stackDepth() > 0) refreshCard(); else draw();
    return;
  }

  if (action === 'save-safety') {
    const athlete = getPeople().find(x => x.id === el.dataset.id);
    if (!athlete) return;
    const medical = document.getElementById('inp-medical')?.value.trim() || null;
    const ecName  = document.getElementById('inp-ec-name')?.value.trim()  || null;
    const ecPhone = document.getElementById('inp-ec-phone')?.value.trim() || null;
    saveAthlete({ ...athlete, medical_notes: medical, emergency_contact_name: ecName, emergency_contact_phone: ecPhone });
    log.info('safety.save', { athlete_id: athlete.id });
    closeModal();
    if (stackDepth() > 0) refreshCard(); else draw();
    return;
  }

  if (action === 'confirm-import') {
    if (!_pendingImport) return;
    const { payload } = _pendingImport;
    const athlete = saveAthlete({
      id:                      payload.source_athlete_id ?? undefined,
      name:                    payload.name,
      grade:                   payload.grade ?? null,
      medical_notes:           payload.medical_notes ?? null,
      emergency_contact_name:  payload.emergency_contact_name ?? null,
      emergency_contact_phone: payload.emergency_contact_phone ?? null,
    });
    const conf = payload.confirmed_levels || {};
    SKILL_IDS.forEach(sk => {
      if (conf[sk]) setConfirmedLevel({ athlete_id: athlete.id, skill: sk, level: conf[sk] });
    });
    _pendingImport = null;
    log.info('card.import', { athlete_id: athlete.id });
    flash(`${payload.name} added to roster`);
    closeModal();
    draw();
    return;
  }

  if (action === 'confirm-merge') {
    if (!_pendingImport?.existingAthlete) return;
    const { payload, existingAthlete } = _pendingImport;
    saveAthlete({
      ...existingAthlete,
      grade:                   payload.grade ?? existingAthlete.grade,
      medical_notes:           payload.medical_notes ?? existingAthlete.medical_notes,
      emergency_contact_name:  payload.emergency_contact_name ?? existingAthlete.emergency_contact_name,
      emergency_contact_phone: payload.emergency_contact_phone ?? existingAthlete.emergency_contact_phone,
    });
    const conf = payload.confirmed_levels || {};
    SKILL_IDS.forEach(sk => {
      if (conf[sk]) setConfirmedLevel({ athlete_id: existingAthlete.id, skill: sk, level: conf[sk] });
    });
    _pendingImport = null;
    log.info('card.merge', { athlete_id: existingAthlete.id });
    flash(`${existingAthlete.name} updated`);
    closeModal();
    draw();
    return;
  }
}

// ── Delegated input listeners ─────────────────────────────────────────────────
document.body.addEventListener('change', e => {
  if (e.target.id === 'photo-upload') {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const aid = e.target.dataset.aid;
      const ok = savePhoto(aid, ev.target.result);
      if (ok) log.info('photo.save', { athlete_id: aid });
      else flash('Photo too large to save. Try a smaller image.');
      refreshCard();
    };
    reader.readAsDataURL(file);
  } else if (e.target.id === 'imp-file') {
    onImport(e);
  } else if (e.target.id === 'inp-category') {
    const gradeInp = document.getElementById('inp-grade');
    if (gradeInp) {
      const g = categoryToGrade(e.target.value);
      gradeInp.value = (g !== null && g !== undefined) ? g : '';
    }
  }
});

document.body.addEventListener('input', e => {
  if (e.target.id === 'inp-grade') {
    const catSel = document.getElementById('inp-category');
    if (catSel) {
      const cat = gradeToCategory(parseInt(e.target.value, 10));
      if (cat) catSel.value = cat;
    }
  }
});

document.body.addEventListener('focusout', e => {
  if (e.target.classList.contains('notes-area')) {
    const aid = e.target.dataset.id;
    const a = getPeople().find(x => x.id === aid);
    if (a) savePerson({ ...a, notes: e.target.value });
  }
});

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && stackDepth() > 0) { stopCamera(); pop(); }
  if (e.key === 'Enter' && !e.shiftKey) {
    document.getElementById('sheet')?.querySelector('button[data-m^="save"]')?.click();
  }
});

// ── Import handler ────────────────────────────────────────────────────────────
function onImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      importAll(ev.target.result);
      log.info('data.import.success', { athletes: getAthletes().length });
      closeModal();
      draw();
    } catch (err) {
      log.error('data.import.failed', { error: err.message });
      alert('Could not import — check that this is a valid MTB Skills backup file.');
    }
  };
  reader.readAsText(file);
}

// ── Camera scan ───────────────────────────────────────────────────────────────
function startCameraScan() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setScanHint('Camera not available on this device or connection.');
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      _cameraStream = stream;
      const video = document.getElementById('scan-video');
      if (!video) { stopCamera(); return; }
      video.srcObject = stream;
      video.play();
      video.addEventListener('loadedmetadata', () => { _scanFrame = requestAnimationFrame(scanTick); });
    })
    .catch(err => {
      log.error('camera.access.failed', { error: err.message });
      setScanHint('Camera permission denied. Allow camera access and try again.');
    });
}

function scanTick() {
  const video  = document.getElementById('scan-video');
  const canvas = document.getElementById('scan-canvas');
  if (!video || !canvas || !_cameraStream) return;
  if (video.readyState < video.HAVE_ENOUGH_DATA) {
    _scanFrame = requestAnimationFrame(scanTick);
    return;
  }
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(img.data, img.width, img.height);
  if (code) {
    stopCamera();
    onQRDetected(code.data);
  } else {
    _scanFrame = requestAnimationFrame(scanTick);
  }
}

function stopCamera() {
  if (_scanFrame) { cancelAnimationFrame(_scanFrame); _scanFrame = null; }
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
}

function setScanHint(msg) {
  const el = document.getElementById('scan-hint');
  if (el) el.textContent = msg;
}

function onQRDetected(rawData) {
  let payload;
  try {
    payload = decodeCard(rawData);
  } catch (err) {
    log.warn('qr.decode.failed', { error: err.message });
    // If a scan sheet is already visible, don't push another one — update hint and ensure camera is running.
    const alreadyScanning = document.getElementById('scan-video') || document.querySelector('.modal-sheet .scan-video');
    if (alreadyScanning) {
      setScanHint('QR code not recognized as an athlete card. Try again.');
      if (!_cameraStream) startCameraScan();
      return;
    }
    openModal(modalScanCard());
    startCameraScan();
    setScanHint('QR code not recognized as an athlete card. Try again.');
    return;
  }
  const existing = detectMerge(getAthletes(), payload.source_athlete_id);
  _pendingImport = { payload, existingAthlete: existing };
  log.info('qr.detected', { name: payload.name, merge: !!existing });
  closeModal();
  openModal(modalImportPreview(payload, existing));
}

// ── Wire up listeners ─────────────────────────────────────────────────────────
document.body.addEventListener('click', onAppClick);
document.getElementById('sheet').addEventListener('click', onSheetClick);
document.getElementById('scrim').addEventListener('click', () => { stopCamera(); pop(); });

window.__test_onQRDetected = onQRDetected;

// ── Boot ──────────────────────────────────────────────────────────────────────
s.today_practice = getTodaysPractice();
_generateSettingsQR();
log.info('app.init', { people: getPeople().length, observations: getObservations().length });
draw();
