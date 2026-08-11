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
  getRosterGroupFilter, saveRosterGroupFilter,
  getRemoteRosterIds, saveRemoteRosterIds, getCachedIdentity,
  getActivePersonaId, saveActivePersonaId,
  remapAthleteId,
  clearLocalRosterData,
  findTodaysPractice, createPractice, endPractice, reopenPractice, savePractice,
  getPractices, toggleAttendance, getAttendance,
  exportAll, importAll, exportAttendance,
  gradeToCategory, categoryToGrade,
} from './storage.js';

const FEEDBACK_MODE = localStorage.getItem('mtb_feedback_mode') !== 'false';
import { SKILL_IDS } from './rubric.js';
import { loadRubricContent } from './rubric-content.js';
import { encodeCard, decodeCard, detectMerge } from './trading.js';
import { isAuthConfigured, signInWithGoogle, signOut, getUser, getAccessToken, onAuthChange } from './auth.js';
import { syncNow, api } from './sync.js';
import { resolveActivePersona, personaRoleLabel } from './reconcile.js';
import { BACKEND_URL } from './env.js';
import { parseCsv, mapRows, guessMapping, postImport } from './roster-import.js';
import { initPwaUpdate } from './pwa-update.js';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  viewRoster, viewCard, viewRubric, viewPractice, viewSettings, viewHcDashboard,
  modalAddPerson, modalAddAthlete, modalEditPerson,
  modalSafetyInfo, modalShareCard, modalScanCard, modalImportPreview,
  modalSettings, modalReflection, modalOnboarding, modalRosterImport,
  modalReconcile, modalAssignGroup, modalTeamSwitcher,
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
  roster_group_filter: getRosterGroupFilter(), // Phase 3.2 — ride-group filter, 'all' | '__unassigned__' | a ride_group_name
  taking_attendance: false,
  today_practice:  null,
  settingsQR:      null,
  feedbackQR:      null,
  authUser:        null,     // { email, name } | null — set from src/auth.js, additive to offline-first
  syncSummary:     null,     // { pulled, pushed, error? } | null — last syncNow() result
  syncAt:          null,     // ISO timestamp of last sync attempt
  syncing:         false,
};

// Phase 3.2 reconciliation sheet state — { athleteId, submitting: null|'add'|'match'|'delete', error } | null
let _reconcile = null;

// HC/TD-only "reassign ride group" sheet state — { athleteId, submitting: null|'save', error } | null
let _assignGroup = null;

// ── Camera / import state ─────────────────────────────────────────────────────
let _cameraStream = null;
let _scanFrame    = null;
let _pendingImport = null;
let _rosterImport  = null; // { step, fileName, columns, rows, mapping, importing, error, summary } | null

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

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
  window._mtbState = s;
}

// ── Navigation ────────────────────────────────────────────────────────────────
// D24: page_view fires here (once per actual tab change) rather than in
// draw() (which runs many times per interaction — every expand, every
// draft-level tap — and was firing a page_view analytics event on each one).
function switchTab(tab) {
  clearStack();
  s.tab = tab;
  if (tab === 'settings' && !s.settingsQR) _generateSettingsQR();
  if (FEEDBACK_MODE) window.MTB_TRACK?.('page_view', { page: s.tab });
  draw();
}

function goCard(athleteId) {
  ensureDraft(athleteId);
  s.athleteId = athleteId;
  pushLayer(() => viewCard(s));
}

function refreshCard() {
  const scrollEl = document.querySelector('.card-scroll');
  const scrollTop = scrollEl?.scrollTop ?? 0;
  refreshTopLayer(() => viewCard(s));
  if (scrollTop > 0) {
    requestAnimationFrame(() => {
      const el = document.querySelector('.card-scroll');
      if (el) el.scrollTop = scrollTop;
    });
  }
}

function _generateSettingsQR() {
  QRCode.toDataURL('https://ashaber.github.io/mtb-skills/', { width: 200, margin: 2 })
    .then(qr => { s.settingsQR = qr; if (s.tab === 'settings') draw(); })
    .catch(() => {});
  QRCode.toDataURL('https://ashaber.github.io/mtb-skills/?feedback=true', { width: 200, margin: 2 })
    .then(qr => { s.feedbackQR = qr; if (s.tab === 'settings') draw(); })
    .catch(() => {});
}

// ── Auth / sync (Phase 3.1) ───────────────────────────────────────────────────
// Strictly additive to the offline-first app: when auth isn't configured
// (the default), initAuthSync() is a no-op and nothing below ever runs.
async function runSync() {
  s.syncing = true;
  draw();
  const result = await syncNow();
  s.syncing = false;

  // Backend mode: the coach's identity IS the signed-in persona (GET /api/me),
  // not the Phase-1 onboarding profile. Mirror it into the local coach record
  // so getCoach() matches the backend — and any stray coach left by the
  // no-backend onboarding flow is overwritten in place rather than lingering
  // as a duplicate. A single persona is unambiguous (resolveActivePersona);
  // a multi-persona caller mirrors whichever one is currently active, if any
  // has been picked yet (see the `needsTeamSelection` branch below for the
  // "none picked yet" case).
  const personas = getCachedIdentity()?.personas || [];
  const active = resolveActivePersona(personas, getActivePersonaId());
  if (active) saveCoach({ id: active.person_id, name: active.name });

  if (result?.needsTeamSelection) {
    // D26: a caller with >1 persona and no team picked yet -- syncNow()
    // deliberately pulled nothing (never guesses, never merges every team
    // together). Show the "which hat" picker so the coach can choose;
    // selecting one (selectPersona() below) re-runs sync scoped to it.
    log.info('team_switch.required', { persona_count: personas.length });
    draw();
    openModal(modalTeamSwitcher());
    return;
  }

  if (result) {
    s.syncSummary = { pulled: result.pulled, pushed: result.pushed, skipped: result.skipped, error: result.error };
    s.syncAt = new Date().toISOString();
    // `skipped` = local-only athletes' records held back from push (they'd
    // 403) — not an error; a nudge to reconcile. Shown only when there was
    // no hard error and something was actually skipped.
    const skippedNote = result.skipped ? ` · ${result.skipped} pending (tap ⚠ local only)` : '';
    flash(result.error
      ? 'Sync finished with errors'
      : `Synced — ${result.pulled} pulled, ${result.pushed} pushed${skippedNote}`);
  }
  draw();
}

// ── Team switcher (D26) ───────────────────────────────────────────────────
// A coach with coaching duties on more than one team (backend/app/
// identity.py's MultiplePersonasError doc comment) picks which team's data
// to view via src/views.js's modalTeamSwitcher(); this applies that choice.
// Local roster/observations/practices/attendance are cached under GLOBAL
// localStorage keys (src/storage.js), not per-team, so switching TO a
// different team than the one currently active must wipe them first (same
// "clear & re-sync" pattern clearLocalData() already uses for a stale-data
// reset) — otherwise the previous team's records would just sit alongside
// the newly-pulled team's, recreating the exact merged-roster bug this
// increment fixes, just client-side instead of server-side.
async function selectPersona(personId) {
  const personas = getCachedIdentity()?.personas || [];
  const persona = personas.find(p => p.person_id === personId);
  if (!persona) return;

  const previousId = getActivePersonaId();
  const switching = previousId && previousId !== personId;

  if (switching) {
    clearLocalRosterData();
    s.expandedId = null;
    s.draft = {};
    s.today_practice = null;
    s.taking_attendance = false;
    s.roster_filter = getRosterFilter();
    s.roster_group_filter = getRosterGroupFilter();
  }

  // clearLocalRosterData() (above) wipes the cached identity + active-
  // persona keys too (src/storage.js's LOCAL_ROSTER_DATA_KEYS) -- restore
  // both immediately after, never before, so this selection isn't the very
  // thing that gets wiped.
  saveCachedIdentity(personas);
  saveActivePersonaId(personId);
  saveCoach({ id: persona.person_id, name: persona.name });
  log.info('team_switch.selected', { role: persona.role, switching });

  closeModal();
  flash(`Switched to ${persona.team_name || personaRoleLabel(persona.role)}`);

  await runSync();
  s.today_practice = findTodaysPractice();
  draw();
}

// "Clear local data & re-sync" (Settings → Local data). The wipe itself
// always runs; the re-sync half is gated on being signed in
// (isAuthConfigured() && s.authUser) — offline/signed-out there's nothing
// to re-pull yet, so it's just a clean local reset.
async function clearLocalData() {
  if (!confirm('Clear this device\'s roster and re-sync from the backend? Your coach profile and sign-in stay.')) return;

  clearLocalRosterData();
  // Local UI state referencing wiped roster data (expanded row, in-progress
  // draft levels, roster filters) must reset in step with the wipe, else a
  // stale athlete id/filter lingers in `s` after the underlying record is
  // gone.
  s.expandedId = null;
  s.draft = {};
  s.roster_filter = getRosterFilter();
  s.roster_group_filter = getRosterGroupFilter();
  log.info('settings.clear_local_data');

  if (isAuthConfigured() && s.authUser) {
    await runSync(); // re-pull — runSync() itself draw()s + flash()es its own summary
    draw();
    flash('Local data cleared — re-synced');
  } else {
    draw();
    flash('Local data cleared');
  }
}

async function initAuthSync() {
  if (!isAuthConfigured()) return;

  const user = await getUser();
  if (user) {
    s.authUser = user;
    draw();
    runSync();
  }

  onAuthChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      getUser().then(u => {
        s.authUser = u;
        draw();
        runSync();
      });
    } else if (event === 'SIGNED_OUT') {
      s.authUser = null;
      s.syncSummary = null;
      s.syncAt = null;
      draw();
    }
  });
}

// ── Roster import (HC/TD CSV column-mapping wizard, Phase 3.2) ───────────────
// Gating note: shown for any signed-in user (isAuthConfigured() && s.authUser)
// -- the app does not know client-side whether the caller is HC/TD, so we
// rely on the backend's own 403 (app/routes.py's import_roster: "roster
// import is head-coach/team-director only") to actually enforce it. Simpler
// than duplicating persona-role logic client-side, and the 403 surfaces as
// an inline error same as any other import failure.
function renderRosterImport() {
  const scroll = document.querySelector('#sheet .sheet-scroll');
  if (scroll) scroll.innerHTML = modalRosterImport(_rosterImport);
}

function onRosterImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const { columns, rows } = parseCsv(String(ev.target.result ?? ''));
      if (!rows.length) {
        _rosterImport.error = "Couldn't read the sheet. Make sure row 1 has column headers and there's at least one data row.";
        log.warn('roster_import.parse_empty', { file: file.name });
        renderRosterImport();
        return;
      }
      _rosterImport = {
        step: 'mapping',
        fileName: file.name,
        columns,
        rows,
        mapping: guessMapping(columns),
        importing: false,
        error: null,
        summary: null,
      };
      log.info('roster_import.parsed', { rows: rows.length, columns: columns.length });
      renderRosterImport();
    } catch (err) {
      _rosterImport.error = "Couldn't read the sheet. Make sure it's a valid CSV export.";
      log.error('roster_import.parse_failed', { error: String(err) });
      renderRosterImport();
    }
  };
  reader.onerror = () => {
    _rosterImport.error = 'Could not read that file.';
    log.error('roster_import.file_read_failed', { file: file.name });
    renderRosterImport();
  };
  reader.readAsText(file);
}

function submitRosterImport() {
  if (!_rosterImport || _rosterImport.importing) return;
  const mapped = mapRows(_rosterImport.rows, _rosterImport.mapping);
  if (!mapped.length) {
    _rosterImport.error = 'No rows have a name — check your First/Last name column mapping.';
    renderRosterImport();
    return;
  }

  _rosterImport.importing = true;
  _rosterImport.error = null;
  renderRosterImport();
  log.info('roster_import.submit', { rows: mapped.length });

  getAccessToken()
    .then(token => postImport(mapped, token, BACKEND_URL))
    .then(summary => {
      _rosterImport.step = 'summary';
      _rosterImport.summary = summary;
      _rosterImport.importing = false;
      log.info('roster_import.done', summary);
      renderRosterImport();
    })
    .catch(err => {
      _rosterImport.importing = false;
      _rosterImport.error = err?.message || String(err);
      log.error('roster_import.failed', { error: _rosterImport.error });
      renderRosterImport();
    });
}

// ── Reconciliation (Phase 3.2) ────────────────────────────────────────────────
// Opened by tapping a "⚠ local only" badge on the roster (src/views.js's
// viewRoster, gated on isAuthConfigured() && s.authUser — invisible
// otherwise). Add/Match re-point the local id to the backend one via
// storage.js's remapAthleteId so observations/confirmed-levels/photo all
// carry over; Delete just drops the local-only record.
function renderReconcile() {
  const scroll = document.querySelector('#sheet .sheet-scroll');
  if (scroll) scroll.innerHTML = modalReconcile(_reconcile);
}

/**
 * Shared finish for Add/Match: makes `remotePerson` the local record for
 * `remotePerson.id` (upserting any roster fields it carries), remaps every
 * local reference from `localId` to it, and optimistically folds the new id
 * into the cached remote-roster-id set so the "local only" badge clears
 * immediately rather than waiting for the next sync pull.
 */
function _finishReconcile(localId, remotePerson) {
  savePerson({
    id:              remotePerson.id,
    name:            remotePerson.name,
    role:            remotePerson.role || 'athlete',
    ride_group_id:   remotePerson.ride_group_id ?? null,
    ride_group_name: remotePerson.ride_group_name ?? null,
    tags:            remotePerson.tags ?? [],
    external_id:     remotePerson.external_id ?? null,
    grade:           remotePerson.grade ?? null,
    category:        remotePerson.category ?? null,
  });
  remapAthleteId(localId, remotePerson.id);

  const cachedIds = getRemoteRosterIds() || [];
  if (!cachedIds.includes(remotePerson.id)) saveRemoteRosterIds([...cachedIds, remotePerson.id]);

  if (s.expandedId === localId) s.expandedId = null;
  delete s.draft[localId];

  _reconcile = null;
  closeModal();
  draw();
}

function submitReconcileAdd(localId) {
  if (!_reconcile || _reconcile.submitting) return;
  const local = getPeople().find(p => p.id === localId);
  if (!local) return;
  const groupId = document.getElementById('reconcile-add-group')?.value || '';
  if (!groupId) {
    _reconcile.error = 'Select a ride group first.';
    renderReconcile();
    return;
  }

  _reconcile.submitting = 'add';
  _reconcile.error = null;
  renderReconcile();

  api('/api/athletes', {
    method: 'POST',
    body: { name: local.name, ride_group_id: groupId, grade: local.grade ?? null, category: local.category ?? null },
  })
    .then(created => {
      log.info('reconcile.add', { local_id: localId, backend_id: created.id });
      flash(`${created.name} added to your team roster`);
      _finishReconcile(localId, created);
    })
    .catch(err => {
      _reconcile.submitting = null;
      _reconcile.error = err?.message || 'Could not add athlete.';
      log.error('reconcile.add.failed', { athlete_id: localId, error: _reconcile.error });
      renderReconcile();
    });
}

function submitReconcileMatch(localId) {
  if (!_reconcile || _reconcile.submitting) return;
  const local = getPeople().find(p => p.id === localId);
  if (!local) return;
  const matchId = document.getElementById('reconcile-match-select')?.value || '';
  if (!matchId) {
    _reconcile.error = 'Choose an athlete to match to first.';
    renderReconcile();
    return;
  }
  const matched = getPeople().find(p => p.id === matchId);
  if (!matched) return;

  // Matching is entirely local (the target person was already synced down
  // by a prior pull) — no network round trip needed.
  log.info('reconcile.match', { local_id: localId, backend_id: matched.id });
  flash(`Linked to ${matched.name}`);
  _finishReconcile(localId, matched);
}

function submitReconcileDelete(localId) {
  if (!_reconcile || _reconcile.submitting) return;
  const local = getPeople().find(p => p.id === localId);
  if (!local) return;
  if (!confirm(`Delete ${local.name}? This removes it and its observations from this device only.`)) return;

  deleteAthlete(localId);
  if (s.expandedId === localId) s.expandedId = null;
  delete s.draft[localId];
  log.info('reconcile.delete', { athlete_id: localId });
  flash(`${local.name} removed`);
  _reconcile = null;
  closeModal();
  draw();
}

// ── Reassign ride group (HC/TD-only) ──────────────────────────────────────────
// Opened by tapping the "⋯ Group" affordance on a roster row (src/views.js's
// athleteRowHTML, gated on isHcOrTd(getCachedIdentity()?.personas) — a plain
// ride-group coach never sees this control). POSTs POST /api/roster/assign;
// the backend's RLS person_update policy is the actual authorization
// boundary, this is purely a client-side UI gate.
function renderAssignGroup() {
  const scroll = document.querySelector('#sheet .sheet-scroll');
  if (scroll) scroll.innerHTML = modalAssignGroup(_assignGroup);
}

function submitAssignGroup(athleteId) {
  if (!_assignGroup || _assignGroup.submitting) return;
  const local = getPeople().find(p => p.id === athleteId);
  if (!local) return;

  const selectEl = document.getElementById('assign-group-select');
  const rideGroupId = selectEl?.value || null; // '' (the "Unassigned" option) -> null

  _assignGroup.submitting = 'save';
  _assignGroup.error = null;
  renderAssignGroup();

  api('/api/roster/assign', {
    method: 'POST',
    body: { person_id: athleteId, ride_group_id: rideGroupId },
  })
    .then(updated => {
      log.info('assign_group.save', { athlete_id: athleteId, ride_group_id: updated.ride_group_id });
      // Apply the server's response locally immediately, rather than
      // waiting for the next syncNow() pull — savePerson merge-preserves
      // every other field (see its doc comment in src/storage.js).
      savePerson({
        id:              updated.id,
        ride_group_id:   updated.ride_group_id,
        ride_group_name: updated.ride_group_name,
      });
      flash(`${updated.name} moved to ${updated.ride_group_name || 'Unassigned'}`);
      _assignGroup = null;
      closeModal();
      draw();
    })
    .catch(err => {
      _assignGroup.submitting = null;
      _assignGroup.error = err?.message || 'Could not reassign group.';
      log.error('assign_group.save.failed', { athlete_id: athleteId, error: _assignGroup.error });
      renderAssignGroup();
    });
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
  window.MTB_TRACK?.('log_obs', { athlete_id: athleteId });
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
  window.MTB_TRACK?.('confirm_level', { athlete_id: athleteId });
  flash('Confirmed levels updated');
  refreshCard();
}

function confirmOneSkill(athleteId, skill, level) {
  setConfirmedLevel({ athlete_id: athleteId, skill, level });
  s.draft[athleteId] = { ...s.draft[athleteId], [skill]: level };
  log.info('skill.confirm', { athlete_id: athleteId, skill, level });
  window.MTB_TRACK?.('confirm_level', { athlete_id: athleteId, skill });
  flash(`${skill.replace('_', ' ')} confirmed at Lv ${level}`);
  refreshCard();
}

function scrollExpandedIntoView() {
  requestAnimationFrame(() => {
    const el = document.querySelector('.row-card--open');
    if (el) el.scrollIntoView({ block: 'nearest' });
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer;
function flash(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    // WCAG 4.1.3 (Status Messages): announce toast text to screen readers
    // without moving focus — role="status" implies aria-live="polite".
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
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
      document.querySelector('[data-a="toggle-overflow"]')?.setAttribute('aria-expanded', 'false');
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

  // Back button for layers opened from the Settings tab (Team Dashboard) —
  // same pop-then-redraw as go-roster, just labeled for its origin tab per
  // docs/NAV_FLOW_SPEC.md's "topbar: back · title · ⋯" convention.
  if (action === 'go-settings') { pop(); draw(); return; }

  if (action === 'go-card') {
    goCard(id);
    return;
  }

  if (action === 'toggle-overflow') {
    const m = document.getElementById('overflow-menu');
    if (m) {
      const opening = m.style.display === 'none';
      m.style.display = opening ? 'block' : 'none';
      el.setAttribute('aria-expanded', String(opening));
    }
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
    if (s.expandedId) scrollExpandedIntoView();
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
    if (s.expandedId) scrollExpandedIntoView();
    return;
  }

  if (action === 'preview-level') {
    s.draft[aid] = s.draft[aid] || {};
    s.draft[aid][sk] = +n;
    refreshCard();
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

  // Deep-link into the Field Guide at a specific skill AND level, so "More
  // info" on a rider card lands on the level the coach is looking at.
  if (action === 'go-rubric-level') {
    s.rubricSkill = sk;
    log.info('nav.rubric', { skill: sk, level: +n });
    pushSheet(() => viewRubric(s, { sheet: true }));
    requestAnimationFrame(() => {
      const target = document.querySelector(`#sheet .rubric-card[data-lv="${n}"]`);
      if (target) target.scrollIntoView({ block: 'start' });
    });
    return;
  }

  if (action === 'filter-roster') {
    s.roster_filter = f;
    saveRosterFilter(f);
    log.info('roster.filter', { filter: f });
    draw();
    return;
  }

  if (action === 'filter-roster-group') {
    s.roster_group_filter = f;
    saveRosterGroupFilter(f);
    log.info('roster.filter_group', { filter: f });
    draw();
    return;
  }

  if (action === 'open-reconcile') {
    _reconcile = { athleteId: id, submitting: null, error: null };
    log.info('reconcile.open', { athlete_id: id });
    openModal(modalReconcile(_reconcile));
    return;
  }

  if (action === 'open-assign-group') {
    _assignGroup = { athleteId: id, submitting: null, error: null };
    log.info('assign_group.open', { athlete_id: id });
    openModal(modalAssignGroup(_assignGroup));
    return;
  }

  if (action === 'start-attendance') {
    s.today_practice = s.today_practice || createPractice();
    s.taking_attendance = true;
    s.expandedId = null;
    log.info('attendance.start', { practice_id: s.today_practice.id });
    switchTab('roster');
    return;
  }

  if (action === 'end-practice') {
    if (!s.today_practice) return;
    openModal(modalReflection(s.today_practice, { ending: true }));
    return;
  }

  if (action === 'practice-notes') {
    if (!s.today_practice) return;
    openModal(modalReflection(s.today_practice, { ending: false }));
    return;
  }

  if (action === 'view-reflection') {
    if (!s.today_practice) return;
    openModal(modalReflection(s.today_practice));
    return;
  }

  if (action === 'reopen-practice') {
    if (!s.today_practice) return;
    s.today_practice = reopenPractice(s.today_practice.id);
    log.info('practice.reopen', { practice_id: s.today_practice.id });
    draw();
    return;
  }

  if (action === 'start-new-practice') {
    s.today_practice = createPractice({ force: true });
    s.taking_attendance = true;
    s.expandedId = null;
    log.info('practice.new', { practice_id: s.today_practice.id });
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
    const practiceId = el.dataset.pid || s.today_practice?.id;
    if (!practiceId) return;
    const practiceDate = el.dataset.date || today();
    const json = exportAttendance(practiceId);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `practice-report-${practiceDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
    log.info('attendance.export', { practice_id: practiceId });
    window.MTB_TRACK?.('export', { type: 'attendance' });
    return;
  }

  if (action === 'export-data') {
    log.info('data.export');
    window.MTB_TRACK?.('export', { type: 'data' });
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
    const teamName   = document.getElementById('inp-team')?.value?.trim();
    const coachName  = document.getElementById('inp-coach')?.value?.trim();
    const multiPrac  = document.getElementById('inp-multi-practice')?.checked ?? false;
    if (teamName)  saveTeamSettings({ name: teamName });
    if (coachName) { saveCoach({ name: coachName }); saveTeamSettings({ coachName }); }
    saveTeamSettings({ allow_multi_practice: multiPrac });
    log.info('settings.save', {});
    flash('Settings saved');
    return;
  }

  if (action === 'toggle-feedback') {
    const on = document.getElementById('inp-feedback-mode')?.checked ?? true;
    localStorage.setItem('mtb_feedback_mode', on ? 'true' : 'false');
    location.reload();
    return;
  }

  if (action === 'dismiss-feedback') {
    localStorage.setItem('mtb_feedback_dismissed', 'true');
    draw();
    return;
  }

  if (action === 'sign-in-google') {
    log.info('auth.signin.click');
    signInWithGoogle();
    return;
  }

  if (action === 'sync-now') {
    if (s.syncing) return;
    log.info('sync.manual.click');
    runSync();
    return;
  }

  if (action === 'sign-out') {
    log.info('auth.signout.click');
    signOut().then(() => {
      s.authUser = null;
      s.syncSummary = null;
      s.syncAt = null;
      flash('Signed out');
      draw();
    });
    return;
  }

  if (action === 'clear-local-data') {
    clearLocalData();
    return;
  }

  if (action === 'open-team-switcher') {
    log.info('team_switch.open');
    openModal(modalTeamSwitcher());
    return;
  }

  if (action === 'open-roster-import') {
    _rosterImport = { step: 'upload', fileName: null, columns: [], rows: [], mapping: {}, importing: false, error: null, summary: null };
    log.info('roster_import.open');
    openModal(modalRosterImport(_rosterImport));
    return;
  }

  // Phase 3.4 MVP — HC/TD-only team snapshot (viewHcDashboard in views.js).
  // Settings already gates this button's visibility on isHcOrTd(); the view
  // itself re-checks (defense-in-depth), so opening it never depends on
  // trusting the click alone.
  if (action === 'open-hc-dashboard') {
    log.info('hc_dashboard.open');
    pushLayer(() => viewHcDashboard(s));
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

  if (action === 'save-team-switch') {
    const personId = document.getElementById('team-switch-select')?.value;
    if (personId) selectPersona(personId);
    return;
  }

  if (action === 'save-onboarding') {
    const name = document.getElementById('inp-ob-name')?.value?.trim();
    if (!name) { document.getElementById('inp-ob-name')?.focus(); return; }
    const team = document.getElementById('inp-ob-team')?.value?.trim();
    saveCoach({ name });
    if (team) saveTeamSettings({ name: team });
    savePerson({ name, role: 'coach', level: 3 });
    log.info('onboarding.complete', {});
    closeModal();
    draw();
    return;
  }

  if (action === 'role-tab') {
    const role = el.dataset.role;
    document.getElementById('inp-role').value = role;
    document.querySelectorAll('.role-tab').forEach(btn => {
      const active = btn.dataset.role === role;
      btn.classList.toggle('role-tab--active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    document.getElementById('athlete-fields').style.display = role === 'athlete' ? 'block' : 'none';
    document.getElementById('coach-fields').style.display   = role === 'coach'   ? 'block' : 'none';
    return;
  }

  if (action === 'save-settings') {
    const teamName   = document.getElementById('inp-team')?.value?.trim();
    const coachName  = document.getElementById('inp-coach')?.value?.trim();
    const multiPrac  = document.getElementById('inp-multi-practice')?.checked ?? false;
    if (teamName)  saveTeamSettings({ name: teamName });
    if (coachName) { saveCoach({ name: coachName }); saveTeamSettings({ coachName }); }
    saveTeamSettings({ allow_multi_practice: multiPrac });
    log.info('settings.save', {});
    flash('Settings saved');
    closeModal();
    draw();
    return;
  }

  if (action === 'mood-select') {
    const n = +el.dataset.n;
    const hidden = document.getElementById('inp-mood');
    if (hidden) {
      const current = +hidden.value || 0;
      hidden.value = (current === n) ? '' : n;
    }
    document.querySelectorAll('.mood-btn').forEach(btn => {
      const active = +btn.dataset.n === n && (+hidden?.value || 0) === n;
      btn.classList.toggle('mood-btn--active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    return;
  }

  if (action === 'save-reflection') {
    const practiceId = document.getElementById('inp-practice-id')?.value;
    if (!practiceId) return;
    const moodRaw = document.getElementById('inp-mood')?.value;
    const mood = moodRaw ? +moodRaw : null;
    const reflection = document.getElementById('inp-reflection')?.value.trim() || null;
    const incidents  = document.getElementById('inp-incidents')?.value.trim()  || null;
    const ending  = document.getElementById('inp-ending')?.value === '1';
    const isEnded = s.today_practice?.status === 'ended';
    const fields = { reflection, mood, incidents };
    if (ending && !isEnded) fields.status = 'ended';
    s.today_practice = savePractice(practiceId, fields);
    if (ending && !isEnded) {
      s.taking_attendance = false;
      log.info('practice.end', { practice_id: practiceId });
    }
    log.info('practice.reflection.save', { practice_id: practiceId });
    closeModal();
    draw();
    return;
  }

  if (action === 'skip-end-practice') {
    const practiceId = document.getElementById('inp-practice-id')?.value;
    if (!practiceId) return;
    s.today_practice = endPractice(practiceId);
    s.taking_attendance = false;
    log.info('practice.end.skip', { practice_id: practiceId });
    closeModal();
    draw();
    return;
  }

  if (action === 'coach-level-btn') {
    const n = el.dataset.n;
    document.getElementById('inp-coach-level').value = n;
    document.querySelectorAll('.coach-lv-btn').forEach(btn => {
      const active = btn.dataset.n === n;
      btn.classList.toggle('coach-lv-btn--active', active);
      btn.setAttribute('aria-pressed', String(active));
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
    if (!isEdit) window.MTB_TRACK?.('add_person', { role });
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

  if (action === 'roster-import-confirm') {
    submitRosterImport();
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

  if (action === 'reconcile-add')    { submitReconcileAdd(el.dataset.id);    return; }
  if (action === 'reconcile-match')  { submitReconcileMatch(el.dataset.id);  return; }
  if (action === 'reconcile-delete') { submitReconcileDelete(el.dataset.id); return; }

  if (action === 'save-assign-group') { submitAssignGroup(el.dataset.id); return; }
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
  } else if (e.target.id === 'roster-import-file') {
    onRosterImportFile(e);
  } else if (e.target.classList.contains('ri-map-select')) {
    if (_rosterImport) {
      _rosterImport.mapping = { ..._rosterImport.mapping, [e.target.dataset.field]: e.target.value || null };
      _rosterImport.error = null;
      renderRosterImport();
    }
  } else if (e.target.id === 'inp-feedback-mode') {
    localStorage.setItem('mtb_feedback_mode', e.target.checked ? 'true' : 'false');
    location.reload();
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
      setScanHint('Camera access is blocked. To re-enable: tap the lock icon in your browser\'s address bar → Camera → Allow, then try again.');
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

// ── Swipe gestures ────────────────────────────────────────────────────────────
// Swipe right on a drill-in card layer → pop back to roster.
(function () {
  let _tx = 0, _ty = 0;
  document.body.addEventListener('touchstart', e => {
    _tx = e.touches[0].clientX;
    _ty = e.touches[0].clientY;
  }, { passive: true });
  document.body.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - _tx;
    const dy = e.changedTouches[0].clientY - _ty;
    if (dx > 60 && Math.abs(dy) < Math.abs(dx) * 0.6 && stackDepth() > 0) {
      pop();
      draw();
    }
  }, { passive: true });
}());

window.__test_onQRDetected = onQRDetected;

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  // Fetch rubric content before first draw; falls back to bundled defaults on failure.
  await loadRubricContent(import.meta.env.BASE_URL.replace(/\/$/, ''));

  // Close any active practices from previous days (stale sessions)
  getPractices()
    .filter(p => p.date < today() && p.status !== 'ended')
    .forEach(p => { endPractice(p.id); log.info('practice.stale.closed', { practice_id: p.id }); });

  s.today_practice = findTodaysPractice();
  _generateSettingsQR();
  log.info('app.init', { people: getPeople().length, observations: getObservations().length });
  draw();
  // Manual name/league onboarding is a no-backend vestige: in backend mode
  // (auth configured) the coach's identity comes from Google sign-in + their
  // GET /api/me persona (mirrored into getCoach() by runSync), so prompting
  // for a name here just creates a second, unlinked coach. Only show it in
  // the pure offline/no-backend build.
  if (!isAuthConfigured() && !getCoach() && getPeople().length === 0) {
    openModal(modalOnboarding());
    setTimeout(() => document.getElementById('inp-ob-name')?.focus(), 80);
  }
  if (FEEDBACK_MODE) {
    import('./feedback.js').then(m => m.initFeedback());
  }
  // Additive, offline-first: no-ops entirely when auth isn't configured.
  initAuthSync();
  // Additive: no-ops entirely outside a production build. See src/pwa-update.js.
  initPwaUpdate();
})();
