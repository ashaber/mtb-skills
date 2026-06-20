/**
 * src/main.js — state machine, event handlers, boot.
 * Views: 'roster' | 'card' | 'rubric'
 */

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
  viewRoster, viewCard, viewRubric,
  modalAddPerson, modalAddAthlete, modalEditPerson, modalSettings,
  modalSafetyInfo, modalShareCard, modalScanCard, modalImportPreview,
} from './views.js';

// ── State ─────────────────────────────────────────────────────────────────────
const s = {
  view:            'roster',       // 'roster' | 'card' | 'rubric'
  athleteId:       null,
  expandedId:      null,           // which roster row has inline accordion open
  draft:           {},             // { [athleteId]: { body_position, braking, cornering } }
  rubricSkill:     SKILL_IDS[0],   // active tab in education screen
  roster_filter:   getRosterFilter(),
  attendance_mode: false,
  today_practice:  null,           // set on boot, passed to views
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
    s.view === 'card'   ? viewCard(s)   :
    s.view === 'rubric' ? viewRubric(s) :
    viewRoster(s);

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
  const { a: action, id, sk, n, aid, lv, f } = el.dataset;

  if (action === 'go-roster') return goRoster();
  if (action === 'go-card')   return goCard(id);

  if (action === 'go-rubric') {
    log.info('nav.rubric', {});
    go('rubric');
    return;
  }

  if (action === 'rubric-tab') {
    s.rubricSkill = el.dataset.id;
    draw();
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
    draw();
    return;
  }

  if (action === 'log-session')     return logSession(id);
  if (action === 'confirm-session') return confirmSession(id);
  if (action === 'confirm-skill')   return confirmOneSkill(id, sk, +n);

  if (action === 'edit-safety') {
    const a = getAthletes().find(x => x.id === id);
    if (a) openModal(modalSafetyInfo(a));
    return;
  }

  if (action === 'share-card') {
    const a = getAthletes().find(x => x.id === id);
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
    const a = getAthletes().find(x => x.id === id);
    if (a && confirm(`Delete ${a.name}? All observations will be removed.`)) {
      deleteAthlete(id);
      delete s.draft[id];
      log.info('athlete.delete', { athlete_id: id });
      goRoster();
    }
    return;
  }

  if (action === 'open-add') {
    const defaultRole = s.roster_filter === 'coaches' ? 'coach' : 'athlete';
    return openModal(modalAddPerson(defaultRole));
  }
  if (action === 'edit-person') {
    const person = getPeople().find(p => p.id === id);
    if (!person) return;
    log.info('person.edit.open', { person_id: id });
    return openModal(modalEditPerson(person));
  }
  if (action === 'open-settings') return openModal(modalSettings());

  if (action === 'go-rubric-skill') {
    s.rubricSkill = sk;
    log.info('nav.rubric', { skill: sk });
    go('rubric');
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
    s.attendance_mode = true;
    s.today_practice = getTodaysPractice();
    log.info('attendance.start', { practice_id: s.today_practice.id });
    draw();
    return;
  }

  if (action === 'exit-attendance') {
    s.attendance_mode = false;
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

  if (action === 'save-notes') return;
}

// ── Modal events ──────────────────────────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal').classList.remove('hidden');
  const imp = document.getElementById('imp-file');
  if (imp) imp.addEventListener('change', onImport);

  const gradeInp = document.getElementById('inp-grade');
  const catSel   = document.getElementById('inp-category');
  if (gradeInp && catSel) {
    gradeInp.addEventListener('input', () => {
      const cat = gradeToCategory(parseInt(gradeInp.value, 10));
      if (cat) catSel.value = cat;
    });
    catSel.addEventListener('change', () => {
      const g = categoryToGrade(catSel.value);
      gradeInp.value = (g !== null && g !== undefined) ? g : '';
    });
  }

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

  if (action === 'close') { stopCamera(); return closeModal(); }

  // Role tab switching (add person modal)
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

  // Coach level buttons
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
      if (!level) {
        flash('Select a NICA level');
        return;
      }
      personData = { ...personData, level: +level };
    }

    const p = savePerson(personData);
    if (role === 'athlete' && !isEdit) {
      ensureDraft(p.id);
      s.expandedId = p.id;
    }
    log.info(isEdit ? 'person.update' : 'person.add', { person_id: p.id, role });
    closeModal();
    draw();
    return;
  }

  // Backward-compat: old save-athlete action (may appear from cached modal HTML)
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

  if (action === 'save-safety') {
    const athlete = getAthletes().find(x => x.id === el.dataset.id);
    if (!athlete) return;
    const medical = document.getElementById('inp-medical')?.value.trim() || null;
    const ecName  = document.getElementById('inp-ec-name')?.value.trim()  || null;
    const ecPhone = document.getElementById('inp-ec-phone')?.value.trim() || null;
    saveAthlete({ ...athlete, medical_notes: medical, emergency_contact_name: ecName, emergency_contact_phone: ecPhone });
    log.info('safety.save', { athlete_id: athlete.id });
    closeModal();
    draw();
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

// ── Boot ──────────────────────────────────────────────────────────────────────
document.getElementById('app').addEventListener('click', onAppClick);
document.getElementById('modal').addEventListener('click', onModalClick);
document.getElementById('modal').addEventListener('keydown', onModalKeydown);

window.__test_onQRDetected = onQRDetected;

// Auto-create today's practice on app open
s.today_practice = getTodaysPractice();

log.info('app.init', { people: getPeople().length, observations: getObservations().length });
draw();
