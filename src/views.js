/**
 * src/views.js — HTML-string view functions.
 * Tab views return strings set to #app.innerHTML.
 * Layer content (viewCard) is set by nav.js into a .layer div.
 * Sheet content (viewRubric sheet:true, modals) is set by nav.js into #sheet.
 */


export function modalSettings(s) {
  return `<div class="modal-sheet">${viewSettings(s)}</div>`;
}
import { SKILL_IDS, TRAIL_MINIMUMS, TRAIL_LABELS } from './rubric.js';
import { SKILLS, TRAIL_GUIDE, COACH_NOTES } from './rubric-content.js';

import {
  getPeople, getAthletes, getAthleteConfirmedLevels, getObservations,
  getCoach, getPhoto, getTeamSettings, exportAll,
  getAttendance, getAttendanceStatus, getPractices, getAllAttendance,
  getConfirmedLevels,
  CATEGORIES,
  getRosterGroupFilter, getRemoteRosterIds, getCachedIdentity,
} from './storage.js';
import { buildHcDashboardRows, DEFAULT_WINDOW_SIZE } from './hc-dashboard.js';
import {
  LV, pName, initials, readyRowHTML, readyRowDetailHTML, trendSVG, postureSVG,
  levelSelectorHTML, scoreChip, suggestLevel, TRAIL_META, trailMarkSVG, readyTrails,
  progressionStripHTML,
} from './ui.js';
import { isAuthConfigured } from './auth.js';
import { mapRows } from './roster-import.js';
import { detectLocalOnly, autoMatchByName, resolveMyGroups, isHcOrTd } from './reconcile.js';
import { BACKEND_URL, envLabel } from './env.js';

const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = iso => iso ? new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : '';
const localDateStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

// SVG icons
const BACK  = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M13 5l-6 6 6 6"/></svg>`;
const TRASH = `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;
const BOOK  = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/></svg>`;
const SHARE = `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 101.061-1.757l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/></svg>`;
const SCAN  = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm9-1a1 1 0 000 2h2v2a1 1 0 002 0V4a1 1 0 00-1-1h-3zM3 13a1 1 0 011 1v2h2a1 1 0 010 2H4a1 1 0 01-1-1v-3a1 1 0 011-1zm13 1a1 1 0 10-2 0v2h-2a1 1 0 000 2h3a1 1 0 001-1v-3z" clip-rule="evenodd"/><path d="M3 9a1 1 0 000 2h14a1 1 0 000-2H3z"/></svg>`;
const WARN  = `<svg width="13" height="13" viewBox="0 0 20 20" fill="#d97706"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;
const EDIT  = `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>`;
const MORE  = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/></svg>`;
const DOWNLOAD = `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`;
const CHECK_CIRCLE = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>`;
// HC/TD-only "reassign ride group" affordance icon — small people glyph,
// swapped in for the old "⋯ Group" text pill (read badly as dashes + all
// caps). Tooltip carries the verb ("Reassign ride group"); the icon just
// signals "group".
const GROUP_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`;
const EMPTY_CIRCLE = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/></svg>`;

// ── Ride-group UI + reconciliation (Phase 3.2) ────────────────────────────────
// Everything here degrades to "nothing shown" when auth isn't configured or
// the coach isn't signed in — see docs/PHASE3_RECONCILIATION_PLAN.md Part 2
// and CLAUDE.md's offline-first constraint. `s.authUser` is only ever
// non-null when isAuthConfigured() is also true (src/main.js's
// initAuthSync), but both are checked for clarity at each call site.
const UNASSIGNED_GROUP = '__unassigned__';

function _rideGroupUIActive(s) {
  return Boolean(isAuthConfigured() && s.authUser);
}

// HC/TD-only: gates the roster row's "reassign group" affordance (opens
// modalAssignGroup) and modalAssignGroup itself. A plain ride-group coach
// never sees this at all -- the backend's RLS `person_update` policy is
// still the actual authorization boundary (POST /api/roster/assign), this
// is purely a client-side UI gate so a non-HC coach isn't shown a control
// that would just 403.
function _hcAssignGroupActive(s) {
  return Boolean(_rideGroupUIActive(s) && isHcOrTd(getCachedIdentity()?.personas));
}

/** Unique ride_group_name values present in the local roster, sorted. */
function _rosterGroupNames(people) {
  const names = new Set(people.filter(p => p.ride_group_name).map(p => p.ride_group_name));
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

// ── Roster tab ───────────────────────────────────────────────────────────────
export function viewRoster(s) {
  const filter = s.roster_filter || 'all';
  const takingAttendance = s.taking_attendance || false;
  const practice = s.today_practice;
  const rideGroupUI = _rideGroupUIActive(s);

  let people;
  if (filter === 'athletes') people = getPeople({ role: 'athlete' });
  else if (filter === 'coaches') people = getPeople({ role: 'coach' });
  else people = getPeople();

  const { name: teamName = 'Idaho League' } = getTeamSettings();

  if (!people.length && !getPeople().length) return viewEmpty(s);

  // ── Ride-group filter (Phase 3.2) — applied on top of the role filter,
  //    only ever surfaced when there's ride-group data to filter by. ──────
  const groupNames = rideGroupUI ? _rosterGroupNames(getPeople()) : [];
  const groupFilter = s.roster_group_filter || 'all';
  if (rideGroupUI && groupFilter !== 'all' && groupNames.length) {
    people = people.filter(p =>
      groupFilter === UNASSIGNED_GROUP ? !p.ride_group_name : p.ride_group_name === groupFilter
    );
  }

  // ── "Local only" detection (Phase 3.2) — only computed once the coach
  //    has synced at least once (getRemoteRosterIds() is non-null); never
  //    blocks render on a network call (reads localStorage caches only). ──
  const localOnlyIds = rideGroupUI && getRemoteRosterIds() !== null
    ? new Set(detectLocalOnly(getPeople({ role: 'athlete' }), getRemoteRosterIds()).map(a => a.id))
    : new Set();

  // ── "Your group(s)" banner (Phase 3.2) ───────────────────────────────────
  const myGroups = rideGroupUI
    ? resolveMyGroups(getCachedIdentity()?.personas, getPeople()).filter(g => g.ride_group_name)
    : [];
  const myGroupBanner = myGroups.length
    ? `<span class="hdr-mygroup">${myGroups.length > 1 ? 'Your groups' : 'Your group'}: ${myGroups.map(g => esc(g.ride_group_name)).join(', ')}</span>`
    : '';

  const attendingIds = (practice && practice.status !== 'ended') ? new Set(
    getAttendance(practice.id).filter(a => a.status === 'attending').map(a => a.person_id)
  ) : new Set();

  const sorted = [...people].sort((a, b) => {
    const aAtt = attendingIds.has(a.id) ? 0 : 1;
    const bAtt = attendingIds.has(b.id) ? 0 : 1;
    if (aAtt !== bAtt) return aAtt - bAtt;
    return (a.name || '').localeCompare(b.name || '');
  });

  const canAssignGroup = _hcAssignGroupActive(s);

  const rows = sorted.map(person => {
    if (person.role === 'coach') return coachRowHTML(person, s, practice, attendingIds, takingAttendance, rideGroupUI);
    return athleteRowHTML(person, s, practice, attendingIds, takingAttendance, rideGroupUI, localOnlyIds.has(person.id), canAssignGroup);
  }).join('');

  const filterChips = ['all', 'athletes', 'coaches'].map(f => {
    const labels = { all: 'All', athletes: 'Athletes', coaches: 'Coaches' };
    return `<button class="filter-chip${filter === f ? ' filter-chip--active' : ''}" data-a="filter-roster" data-f="${f}">${labels[f]}</button>`;
  }).join('');

  const groupFilterChips = (rideGroupUI && groupNames.length) ? `
    <div class="roster-filters roster-filters--group">
      <button class="filter-chip${groupFilter === 'all' ? ' filter-chip--active' : ''}" data-a="filter-roster-group" data-f="all">All groups</button>
      ${groupNames.map(name => `<button class="filter-chip${groupFilter === name ? ' filter-chip--active' : ''}" data-a="filter-roster-group" data-f="${esc(name)}">${esc(name)}</button>`).join('')}
      <button class="filter-chip${groupFilter === UNASSIGNED_GROUP ? ' filter-chip--active' : ''}" data-a="filter-roster-group" data-f="${UNASSIGNED_GROUP}">Unassigned</button>
    </div>` : '';

  const rosterCount = people.length;
  const countLabel = `${rosterCount} ${filter === 'coaches' ? 'coaches' : filter === 'athletes' ? 'athletes' : 'people'}`;
  const defaultRole = filter === 'coaches' ? 'coach' : 'athlete';

  const attendBar = takingAttendance && practice ? `
    <div class="attend-bar">
      <div>
        <span class="attend-bar-label">ATTENDANCE</span>
        <span class="attend-count"> · ${attendingIds.size} attending</span>
      </div>
      <button class="attend-done" data-a="exit-attendance">Done</button>
    </div>` : '';

  const headerTitle = takingAttendance ? 'Attendance' : 'Roster';

  return `
    <div class="hdr" id="hdr">
      <div class="hdr-top">
        <span class="hdr-kicker">${esc(teamName)}</span>
        <div class="hdr-actions">
          <button class="ico-btn" data-a="scan-card" aria-label="Scan athlete card">${SCAN}</button>
          <button class="btn btn-primary btn-sm" data-a="open-add" data-role="${defaultRole}" aria-label="Add person">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Add
          </button>
        </div>
      </div>
      ${myGroupBanner ? `<div class="hdr-mygroup-row">${myGroupBanner}</div>` : ''}
      <div class="hdr-title-row">
        <h1 class="hdr-title">${headerTitle}</h1>
        <span class="hdr-count">${countLabel}</span>
      </div>
      <div class="roster-filters">${filterChips}</div>
      ${groupFilterChips}
    </div>
    ${attendBar}
    <div class="list" id="list">${rows}</div>
    <div class="ph"></div>`;
}

function athleteRowHTML(a, s, practice, attendingIds, attendanceMode, rideGroupUI = false, isLocalOnly = false, canAssignGroup = false) {
  const conf = getAthleteConfirmedLevels(a.id);
  const open = s.expandedId === a.id;
  const draft = s.draft[a.id] || { body_position: conf.body_position || 1, braking: conf.braking || 1, cornering: conf.cornering || 1 };

  const chips = SKILL_IDS.map(sk => {
    const short = {body_position:'BP', braking:'BRK', cornering:'CRN'}[sk];
    return scoreChip(short, conf[sk]);
  }).join('');

  const expandPanel = open ? `
    <div class="row-expand">
      ${SKILL_IDS.map(sk => {
        const lv = draft[sk] || 1;
        return `<div class="skill-compact-row">
          <div class="posture-box-sm">${postureSVG(sk, lv, LV[lv], 80)}</div>
          <div class="skill-compact-right">
            <div class="skill-compact-head">
              <span class="skill-compact-name">${SKILLS[sk].name.toUpperCase()}</span>
              <span class="skill-compact-lv" style="color:${LV[lv]}">LV ${lv}</span>
            </div>
            ${levelSelectorHTML(sk, lv, a.id, 'compact')}
          </div>
        </div>`;
      }).join('')}
      <div class="expand-actions">
        <button class="btn btn-outline" data-a="go-card" data-id="${a.id}">Open full rider card →</button>
      </div>
    </div>` : '';

  const photo = getPhoto(a.id);
  const mono = photo
    ? `<img src="${photo}" class="mono-photo" alt="${esc(a.name)}">`
    : `<div class="mono">${esc(initials(a.name))}<span class="mono-cam">📷</span></div>`;

  const metaLabel = a.category ? esc(a.category) : (a.grade ? `GR ${esc(String(a.grade))}` : '—');
  const isAttending = practice && attendingIds.has(a.id);
  const groupLabel = rideGroupUI ? (a.ride_group_name ? esc(a.ride_group_name) : 'Unassigned') : null;

  const attendBtn = attendanceMode ? `
    <button class="attend-toggle${isAttending ? ' attend-toggle--on' : ''}" data-a="toggle-attendance" data-id="${a.id}" aria-label="${isAttending ? 'Mark absent' : 'Mark attending'}">
      ${isAttending ? CHECK_CIRCLE : EMPTY_CIRCLE}
    </button>` : '';

  return `<div class="row-card${open ? ' row-card--open' : ''}${isAttending && !attendanceMode ? ' row-card--attending' : ''}${isAttending && attendanceMode ? ' row-card--present' : ''}">
    <div class="row-main">
      ${attendBtn}
      <button class="mono-btn" data-a="go-card" data-id="${a.id}" aria-label="Open ${esc(a.name)}'s card">${mono}</button>
      <button class="row-body${attendanceMode ? ' row-body--attendance' : ''}" data-a="${attendanceMode ? 'toggle-attendance' : 'toggle-expand'}" data-id="${a.id}">
        <div class="row-name">
          ${esc(pName(a.name))}
          ${(a.medical_notes || a.emergency_contact_name || a.emergency_contact_phone) ? `<span class="safety-flag" title="Has safety info">${WARN}</span>` : ''}
        </div>
        <div class="row-meta">
          <span class="row-grade">${metaLabel}</span>
          ${groupLabel ? `<span class="sep">·</span><span class="row-group">${groupLabel}</span>` : ''}
          ${!attendanceMode ? `<span class="sep">·</span><span class="ready-row">${readyRowHTML(conf, 14)}</span>` : ''}
        </div>
      </button>
      ${isLocalOnly && !attendanceMode ? `<button class="local-only-badge" data-a="open-reconcile" data-id="${a.id}" title="Not synced to your team's backend roster yet — tap to Add, Match, or Delete">${WARN} local only</button>` : ''}
      ${canAssignGroup && !attendanceMode ? `<button class="group-assign-btn" data-a="open-assign-group" data-id="${a.id}" title="Reassign ride group" aria-label="Reassign ride group">${GROUP_ICON}</button>` : ''}
      ${!attendanceMode ? `<button class="chips-caret" data-a="toggle-expand" data-id="${a.id}">
        ${chips}
        <svg class="caret${open?' caret--open':''}" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--dim)" stroke-width="2.4" stroke-linecap="round"><path d="M5 8l5 5 5-5"/></svg>
      </button>` : ''}
    </div>
    ${expandPanel}
  </div>`;
}

function coachRowHTML(coach, s, practice, attendingIds, attendanceMode, rideGroupUI = false) {
  const levelLabel = coach.level ? `L${coach.level}` : '—';
  const isAttending = practice && attendingIds.has(coach.id);
  const groupLabel = rideGroupUI ? (coach.ride_group_name ? esc(coach.ride_group_name) : null) : null;
  const open = !attendanceMode && s.expandedId === coach.id;
  const conf = getAthleteConfirmedLevels(coach.id);
  const draft = s.draft[coach.id] || { body_position: conf.body_position || 1, braking: conf.braking || 1, cornering: conf.cornering || 1 };

  const chips = SKILL_IDS.map(sk => {
    const short = {body_position:'BP', braking:'BRK', cornering:'CRN'}[sk];
    return scoreChip(short, conf[sk]);
  }).join('');

  const attendBtn = attendanceMode ? `
    <button class="attend-toggle${isAttending ? ' attend-toggle--on' : ''}" data-a="toggle-attendance" data-id="${coach.id}" aria-label="${isAttending ? 'Mark absent' : 'Mark attending'}">
      ${isAttending ? CHECK_CIRCLE : EMPTY_CIRCLE}
    </button>` : '';

  const expandPanel = open ? `
    <div class="row-expand">
      ${SKILL_IDS.map(sk => {
        const lv = draft[sk] || 1;
        return `<div class="skill-compact-row">
          <div class="posture-box-sm">${postureSVG(sk, lv, LV[lv], 80)}</div>
          <div class="skill-compact-right">
            <div class="skill-compact-head">
              <span class="skill-compact-name">${SKILLS[sk].name.toUpperCase()}</span>
              <span class="skill-compact-lv" style="color:${LV[lv]}">LV ${lv}</span>
            </div>
            ${levelSelectorHTML(sk, lv, coach.id, 'compact')}
          </div>
        </div>`;
      }).join('')}
      <div class="expand-actions">
        <button class="btn btn-outline" data-a="go-card" data-id="${coach.id}">Open full card →</button>
      </div>
    </div>` : '';

  return `<div class="row-card row-card--coach${isAttending && !attendanceMode ? ' row-card--attending' : ''}${isAttending && attendanceMode ? ' row-card--present' : ''}">
    <div class="row-main">
      ${attendBtn}
      <div class="mono mono--coach">${esc(initials(coach.name))}</div>
      <button class="row-body${attendanceMode ? ' row-body--attendance' : ''}" data-a="${attendanceMode ? 'toggle-attendance' : 'toggle-expand'}" data-id="${coach.id}">
        <div class="row-name">${esc(pName(coach.name))}</div>
        <div class="row-meta">
          <span class="row-grade">${esc(levelLabel)}</span>
          ${groupLabel ? `<span class="sep">·</span><span class="row-group">${groupLabel}</span>` : ''}
          ${!attendanceMode ? `<span class="sep">·</span><span class="ready-row">${readyRowHTML(conf, 14)}</span>` : ''}
        </div>
      </button>
      ${!attendanceMode ? `<button class="chips-caret" data-a="toggle-expand" data-id="${coach.id}">
        ${chips}
        <svg class="caret${open?' caret--open':''}" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--dim)" stroke-width="2.4" stroke-linecap="round"><path d="M5 8l5 5 5-5"/></svg>
      </button>` : ''}
    </div>
    ${expandPanel}
  </div>`;
}

// ── Practice tab ─────────────────────────────────────────────────────────────
export function viewPractice(s) {
  const todayStr = localDateStr();
  const practice = s.today_practice;
  const isEnded  = practice?.status === 'ended';
  const isInAttendance = s.taking_attendance && !isEnded;
  const { allow_multi_practice: multiPrac = true } = getTeamSettings();

  const todayCard = practice ? _practiceCardToday(practice, isEnded, isInAttendance, multiPrac) : _practiceCardEmpty();

  const allPractices = getPractices()
    .filter(p => p.id !== practice?.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 20);

  const historyRows = allPractices.length
    ? allPractices.map(p => {
        const count = getAttendance(p.id).filter(a => a.status === 'attending').length;
        const ended = p.status === 'ended';
        const sameDay = p.date === todayStr;
        const dateDisplay = sameDay ? 'Today (earlier)' : fmt(p.date + 'T00:00:00');
        return `<div class="practice-history-row">
          <div class="practice-history-left">
            <span class="practice-history-date">${esc(dateDisplay)}</span>
            <span class="practice-history-status${ended ? '' : ' practice-history-status--active'}">${ended ? 'ended' : 'active'}</span>
          </div>
          <div class="practice-history-right">
            <span class="practice-history-count">${count} attended</span>
            ${count > 0 ? `<button class="btn-link" data-a="export-attendance" data-pid="${esc(p.id)}" data-date="${esc(p.date)}">${DOWNLOAD}</button>` : ''}
          </div>
        </div>`;
      }).join('')
    : `<p class="practice-history-empty">No earlier practices recorded.</p>`;

  return `
    <div class="hdr" id="hdr">
      <div class="hdr-top">
        <span class="hdr-kicker">Today</span>
      </div>
      <div class="hdr-title-row">
        <h1 class="hdr-title">Practice</h1>
      </div>
    </div>
    <div style="padding:14px">
      ${todayCard}
      <div class="practice-history">
        <span class="practice-history-label">PRACTICE HISTORY</span>
        ${historyRows}
      </div>
    </div>`;
}

function _practiceCardEmpty() {
  return `
    <div class="practice-card">
      <div class="practice-date">No practice started today</div>
      <span class="practice-meta">Tap below to begin — this creates today's session and opens attendance in the Roster.</span>
      <div class="practice-actions">
        <button class="btn btn-primary" data-a="start-attendance">Start Practice</button>
      </div>
    </div>`;
}

function _practiceCardToday(practice, isEnded, isInAttendance, multiPrac) {
  const attending = getAttendance(practice.id).filter(a => a.status === 'attending');
  const count = attending.length;
  const dateLabel = fmt(practice.date + 'T00:00:00');
  const exportBtn = count > 0
    ? `<button class="btn btn-outline" data-a="export-attendance" data-pid="${esc(practice.id)}" data-date="${esc(practice.date)}">${DOWNLOAD} Export Attendance</button>`
    : '';

  if (isEnded) {
    const newPracBtn = multiPrac
      ? `<button class="btn btn-primary" data-a="start-new-practice">Start New Practice</button>`
      : '';
    const moodEmoji = practice.mood ? ['','😞','🙁','😐','🙂','😊'][practice.mood] : null;
    const reflectionBtn = `<button class="btn btn-outline" data-a="view-reflection">${practice.reflection || practice.mood || practice.incidents ? '✏ View / edit reflection' : '+ Add reflection'}</button>`;
    return `
      <div class="practice-card">
        <div class="practice-date">${esc(dateLabel)}</div>
        <span class="practice-meta practice-meta--ended">Practice complete · ${count} attended${moodEmoji ? ' · ' + moodEmoji : ''}</span>
        <div class="practice-actions">
          ${newPracBtn}
          ${exportBtn}
          ${reflectionBtn}
          <button class="btn btn-outline" data-a="reopen-practice">Reopen Practice</button>
        </div>
      </div>`;
  }

  const attendBtn = isInAttendance
    ? `<button class="btn btn-primary" data-a="resume-attendance">Resume Attendance →</button>`
    : count > 0
      ? `<button class="btn btn-outline" data-a="start-attendance">Update Attendance</button>`
      : `<button class="btn btn-primary" data-a="start-attendance">Take Attendance</button>`;

  const statusLabel = count > 0 ? `${count} attending` : 'No attendance taken yet';
  const notesPreview = (practice.reflection || practice.mood || practice.incidents)
    ? `<div class="practice-notes-preview">${['😞','🙁','😐','🙂','😊'][practice.mood - 1] || ''} ${esc((practice.reflection || '').slice(0, 60))}${(practice.reflection || '').length > 60 ? '…' : ''}</div>`
    : '';

  return `
    <div class="practice-card practice-card--active">
      <div class="practice-session-badge">● IN SESSION</div>
      <div class="practice-date">${esc(dateLabel)}</div>
      <span class="practice-meta">${esc(statusLabel)}</span>
      ${notesPreview}
      <div class="practice-actions">
        ${attendBtn}
        ${exportBtn}
        <button class="btn btn-outline" data-a="practice-notes">Practice Notes</button>
        <button class="btn btn-outline btn-danger" data-a="end-practice">End Practice</button>
      </div>
    </div>`;
}

// ── Settings tab ─────────────────────────────────────────────────────────────
export function viewSettings(s) {
  const { name: teamName = '', coachName = '', allow_multi_practice: multiPrac = true } = getTeamSettings();
  const feedbackOn = localStorage.getItem('mtb_feedback_mode') !== 'false';
  const feedbackDismissed = localStorage.getItem('mtb_feedback_dismissed') === 'true';
  const coach = getCoach();

  const qrSection = s.settingsQR
    ? `<div class="settings-qr-wrap">
      <img class="settings-qr" src="${s.settingsQR}" alt="App QR code">
      <span class="settings-qr-url">ashaber.github.io/mtb-skills</span>
       </div>`
    : `<p class="settings-about" style="text-align:center;color:var(--dim)">Generating QR…</p>`;

  return `
    <div class="hdr" id="hdr">
      <div class="hdr-top">
        <span class="hdr-kicker">Configuration</span>
      </div>
      <div class="hdr-title-row">
        <h1 class="hdr-title">Settings</h1>
      </div>
    </div>
    <div>
      <div class="settings-section">
        <span class="settings-section-label">Team</span>
        <div class="fg" style="padding:0 0 8px">
          <label class="fl" for="inp-team">League / Team name</label>
          <input class="fi" id="inp-team" type="text" value="${esc(teamName)}" placeholder="Idaho League">
          <label class="fl" for="inp-coach" style="margin-top:8px">Coach name</label>
          <input class="fi" id="inp-coach" type="text" value="${esc(coach?.name ?? coachName)}" placeholder="Your name">
        </div>
        <label class="settings-toggle-row">
          <span class="settings-toggle-label">
            Allow multiple practices per day
            <span class="settings-toggle-hint">For demos — lets you run the full practice lifecycle more than once in a day.</span>
          </span>
          <input type="checkbox" id="inp-multi-practice" class="settings-toggle-cb" ${multiPrac ? 'checked' : ''}>
        </label>
        <button class="btn btn-primary" data-a="save-settings" data-m="save-settings">Save</button>
      </div>

      <div class="settings-section">
        <span class="settings-section-label">Data</span>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-outline" data-a="export-data">${DOWNLOAD} Export JSON backup</button>
          <label class="btn btn-outline" style="cursor:pointer;text-align:center">
            Import JSON backup
            <input id="imp-file" type="file" accept=".json" style="display:none">
          </label>
        </div>
      </div>

      <div class="settings-section">
        <span class="settings-section-label">Local data</span>
        <p class="settings-about" style="margin-bottom:10px">Wipes this device's roster and re-pulls it from the backend. Keeps your coach profile and sign-in.</p>
        <button class="btn btn-outline" style="color:#dc2626;border-color:#dc2626" data-a="clear-local-data">Clear local data &amp; re-sync</button>
      </div>

      ${isAuthConfigured() ? `<div class="settings-section">
        <span class="settings-section-label">Account</span>
        ${s.authUser ? `
          <div style="display:flex;flex-direction:column;gap:2px;margin-bottom:12px">
            <span class="settings-about" style="color:var(--dim)">Signed in as</span>
            <span style="font:700 15px/1.3 var(--font-body)">${esc(s.authUser.name || s.authUser.email || 'Coach')}</span>
            ${s.authUser.name && s.authUser.email ? `<span class="settings-about">${esc(s.authUser.email)}</span>` : ''}
          </div>
          <p class="settings-about" style="margin-bottom:10px">${
            s.syncing
              ? 'Syncing…'
              : s.syncSummary
                ? `Last synced ${s.syncAt ? new Date(s.syncAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''} — ${s.syncSummary.pulled} pulled, ${s.syncSummary.pushed} pushed${s.syncSummary.error ? ' (with errors)' : ''}`
                : 'Not synced yet.'
          }</p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-outline" data-a="sync-now"${s.syncing ? ' disabled' : ''}>${s.syncing ? 'Syncing…' : 'Sync now'}</button>
            <button class="btn btn-outline" data-a="sign-out">Sign out</button>
          </div>
        ` : `
          <p class="settings-about" style="margin-bottom:10px">Sign in to sync your roster and observations with your team.</p>
          <button class="btn btn-primary" data-a="sign-in-google">Sign in with Google</button>
        `}
      </div>` : ''}

      ${isAuthConfigured() && s.authUser ? `<div class="settings-section">
        <span class="settings-section-label">Roster Import</span>
        <p class="settings-about" style="margin-bottom:10px">Head coaches and team directors can bulk-import a roster from a NICA PitZone CSV export (coach or athlete file). Requires head-coach/team-director access on the backend.</p>
        <button class="btn btn-outline" data-a="open-roster-import">Import roster from CSV</button>
      </div>` : ''}

      ${isAuthConfigured() && s.authUser && isHcOrTd(getCachedIdentity()?.personas) ? `<div class="settings-section">
        <span class="settings-section-label">Team</span>
        <p class="settings-about" style="margin-bottom:10px">See every athlete's ride group, recent attendance, and current confirmed level per skill in one table. Head-coach/team-director only.</p>
        <button class="btn btn-outline" data-a="open-hc-dashboard">Team dashboard</button>
      </div>` : ''}

      <div class="settings-section">
        <span class="settings-section-label">Share App</span>
        <p class="settings-about" style="margin-bottom:10px">Scan to open on another device — works offline after first load.</p>
        ${s.feedbackQR
          ? `<div class="settings-qr-wrap">
              <img class="settings-qr" src="${s.feedbackQR}" alt="App QR code">
              <span class="settings-qr-url">ashaber.github.io/mtb-skills</span>
             </div>`
          : `<p class="settings-about" style="text-align:center;color:var(--dim)">Generating QR…</p>`}
      </div>

      ${!feedbackDismissed ? `<div class="settings-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="settings-section-label" style="margin-bottom:0">Feedback</span>
          <button data-a="dismiss-feedback" style="background:none;border:none;color:var(--dim);cursor:pointer;font:500 12px/1 var(--font-body);padding:2px 0">Don't show</button>
        </div>
        <label class="settings-toggle-row">
          <span class="settings-toggle-label">
            Feedback mode
            <span class="settings-toggle-hint">Shows a 💬 button on every screen for collecting coach feedback.</span>
          </span>
          <input type="checkbox" id="inp-feedback-mode" class="settings-toggle-cb" data-a="toggle-feedback" ${feedbackOn ? 'checked' : ''}>
        </label>
      </div>` : ''}

      <div class="settings-section">
        <span class="settings-section-label">About</span>
        <p class="settings-about">A rubric-based skill assessment tool for NICA MTB coaches — three foundational skills across five levels defined by what breaks, when, and at what threshold. Log observations, confirm levels, and see trail readiness at a glance. Works fully offline. No login required.</p>
        <p class="settings-about" style="margin-top:8px">Want this for your team or league? <a href="mailto:andrewshaber@gmail.com" style="color:var(--accent)">andrewshaber@gmail.com</a></p>
        <p class="settings-about" style="margin-top:8px;color:var(--dim);font-size:12px">© 2026 Andrew Shaber, Renee Kline &amp; Tim Curry</p>
        <a href="https://ashaber.github.io/mtb-skills/about.html" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;font:600 13px/1 var(--font-body);color:var(--accent);text-decoration:underline;text-underline-offset:2px">Learn more →</a>
        <p class="settings-about" style="margin-top:10px;color:var(--dim);font-size:11px">v${__APP_VERSION__} · ${__GIT_SHA__} · ${envLabel(BACKEND_URL)}</p>
      </div>
    </div>`;
}

// ── HC/TD Team Dashboard (Phase 3.4 MVP — layer content, drill-in from
// Settings) ─────────────────────────────────────────────────────────────────
// Read-only current-state snapshot: name, ride group, attendance over the
// last DEFAULT_WINDOW_SIZE practices, and current confirmed level per
// skill. Deliberately does NOT include a "falling behind" flag, ride-
// group-move tooling, or a progress-over-time chart — see
// src/hc-dashboard.js's module docstring for why (both are still-open
// product questions in docs/PHASE3_TEAM_VISIBILITY_PLAN.md, not something
// this build should invent). Reads from the local store only — the same
// roster/attendance/confirmed-level data already pulled by src/sync.js's
// GET /api/roster, /api/attendance, /api/confirmed-levels — so this view
// makes no network calls of its own and stays offline-first like the rest
// of the app.
//
// Entry point (Settings) already gates on isHcOrTd(); this view repeats
// the check as defense-in-depth (mirrors _hcAssignGroupActive's posture)
// so a direct pushLayer() call can never render team-wide data to a
// caller whose cached persona isn't HC/TD. This is a client-side UI gate
// only, same posture as isHcOrTd()'s own docstring: RLS on the backend is
// the actual authorization boundary for every row this table displays.
export function viewHcDashboard(s) {
  const backBtn = `<div class="topbar"><button class="topbar-back" data-a="go-settings">${BACK} Settings</button><span class="topbar-title">TEAM DASHBOARD</span><div></div></div>`;

  if (!isHcOrTd(getCachedIdentity()?.personas)) {
    return `${backBtn}<div class="card-scroll"><p class="empty-micro" style="padding:16px">Head-coach or team-director access required.</p></div>`;
  }

  const rows = buildHcDashboardRows({
    people:          getPeople({ role: 'athlete' }),
    practices:       getPractices(),
    attendance:      getAllAttendance(),
    confirmedLevels: getConfirmedLevels(),
  });

  const tableRows = rows.length
    ? rows.map(r => `
        <tr>
          <td class="hc-dash-name">${esc(r.name)}</td>
          <td class="hc-dash-group">${r.ride_group_name ? esc(r.ride_group_name) : '—'}</td>
          <td class="hc-dash-attend">${r.attended}/${r.total}</td>
          ${SKILL_IDS.map(sk => `<td><span class="hc-dash-lv" style="background:${LV[r.levels[sk]]}">${r.levels[sk] || '—'}</span></td>`).join('')}
        </tr>`).join('')
    : `<tr><td colspan="${3 + SKILL_IDS.length}"><p class="empty-micro" style="padding:16px">No athletes on the roster yet.</p></td></tr>`;

  return `
    ${backBtn}
    <div class="card-scroll">
      <div class="hdr" style="padding:16px 16px 8px">
        <p class="settings-about">One row per athlete. Attendance = last ${DEFAULT_WINDOW_SIZE} practices. Levels are the currently confirmed level per skill (— = unset).</p>
      </div>
      <div class="hc-dash-table-wrap">
        <table class="hc-dash-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Ride group</th>
              <th>Attendance</th>
              ${SKILL_IDS.map(sk => `<th>${SKILLS[sk].name}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Rider / Coach card (returned as layer content, not a fixed wrapper) ───────
export function viewCard(s) {
  const a = getPeople().find(x => x.id === s.athleteId);
  if (!a) return `<div class="topbar"><button class="topbar-back" data-a="go-roster">${BACK} Roster</button><span class="topbar-title"></span><div></div></div>`;

  const conf  = getAthleteConfirmedLevels(a.id);
  const draft = s.draft[a.id] || { body_position: conf.body_position || 1, braking: conf.braking || 1, cornering: conf.cornering || 1 };
  const draftChanged = SKILL_IDS.some(sk => draft[sk] !== (conf[sk] || 0));
  const isNew = !conf.body_position && !conf.braking && !conf.cornering;
  const photo = getPhoto(a.id);
  const totalObs = getObservations({ athlete_id: a.id }).length;

  const photoEl = photo
    ? `<img src="${photo}" class="card-photo" alt="${esc(a.name)}">`
    : `<label class="card-photo-empty" for="photo-upload" title="Add photo">
        <span class="photo-cam">📷</span>
        <span class="photo-hint">Add photo</span>
       </label>
       <input id="photo-upload" type="file" accept="image/*" style="display:none" data-aid="${a.id}">`;

  const qrDataUrl = s.cardQR?.[a.id];

  const skillBlocks = SKILL_IDS.map(sk => {
    const lv         = draft[sk] || 1;
    const confirmedLv = conf[sk] || 0;
    const history    = getObservations({ athlete_id: a.id, skill: sk })
      .sort((a, b) => b.session_date.localeCompare(a.session_date));
    const sugg       = suggestLevel(history, confirmedLv);
    const trend      = trendSVG(history, confirmedLv, 160, 44);
    const hasObs     = history.length > 0;

    // IDEA-015: what changed vs the level below. Level 1 is the baseline.
    // This replaces the old consistency/failure columns — those live in the
    // Field Guide now, one tap away via "More info".
    const prog = SKILLS[sk].levels[lv].progression;
    const progBlock = prog
      ? `<div class="sb-prog">
          <span class="sb-col-hdr">WHAT IMPROVES AT LEVEL ${lv}</span>
          ${progressionStripHTML(prog)}
          <button class="sb-prog-more" data-a="go-rubric-level" data-sk="${sk}" data-n="${lv}">More info →</button>
        </div>`
      : `<button class="sb-guide-link" data-a="go-rubric-level" data-sk="${sk}" data-n="${lv}">Level ${lv} in the Field Guide →</button>`;

    return `<div class="skill-block">
      <div class="skill-block-head">
        <span class="skill-block-name">${SKILLS[sk].name.toUpperCase()}</span>
        <span class="skill-block-lv" style="color:${LV[lv]}">LEVEL ${lv}</span>
      </div>
      ${levelSelectorHTML(sk, lv, a.id, 'full')}
      ${progBlock}
      <div class="trend-row">
        <div class="trend-spark-wrap">
          <span class="section-micro">RECENT TREND</span>
          ${trend}
        </div>
        <div class="trend-right">
          <p class="trend-summary">${hasObs ? `${history.length} obs · confirmed ` : 'No observations — '}${confirmedLv ? `<b style="color:${LV[confirmedLv]}">Lv ${confirmedLv}</b>` : '<b>unset</b>'}</p>
          ${sugg
            ? `<button class="btn-suggest" data-a="confirm-skill" data-sk="${sk}" data-n="${sugg}" data-id="${a.id}" style="background:${LV[sugg]}">↑ Confirm Lv ${sugg}</button>`
            : `<span class="trend-stable">● Holding at level</span>`}
        </div>
      </div>
    </div>`;
  }).join('');

  const allObs = getObservations({ athlete_id: a.id })
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
    .slice(0, 12);
  const timelineRows = allObs.length
    ? allObs.map(o => `
        <div class="tl-row">
          <span class="tl-lv" style="background:${LV[o.level_observed]}">${o.level_observed}</span>
          <span class="tl-skill">${SKILLS[o.skill].name}</span>
          <span class="tl-date">${fmt(o.session_date)}</span>
        </div>`).join('')
    : `<p class="empty-micro">No observations logged yet.</p>`;

  const metaLabel = a.role === 'coach'
    ? (a.level ? `NICA L${a.level}` : 'Coach')
    : (a.category ? esc(a.category) : (a.grade ? `GRADE ${esc(String(a.grade))}` : ''));

  const contextLabel = a.role === 'coach' ? 'COACH' : 'RIDER';

  return `
    <div class="card-view">
      <div class="topbar">
        <button class="topbar-back" data-a="go-roster">${BACK} Roster</button>
        <span class="topbar-title">${contextLabel}</span>
        <div class="topbar-actions">
          <div class="overflow-wrap">
            <button class="topbar-ico" data-a="toggle-overflow" aria-label="More options">${MORE}</button>
            <div class="overflow-menu" id="overflow-menu" style="display:none">
              <button class="overflow-item" data-a="edit-person" data-id="${a.id}">${EDIT} Edit profile</button>
              <button class="overflow-item" data-a="share-card" data-id="${a.id}">${SHARE} Share card</button>
              <button class="overflow-item overflow-item--danger" data-a="del-athlete" data-id="${a.id}">${TRASH} Delete</button>
            </div>
          </div>
        </div>
      </div>
      <div class="card-scroll">
      <div class="card-hero">
        <div class="card-hero-photo">${photoEl}</div>
        <div class="card-hero-info">
          <h2 class="card-name">${esc(a.name)}</h2>
          <div class="card-hero-meta">
            ${a.plate ? `<span class="plate-pill">#${esc(String(a.plate))}</span>` : ''}
            ${metaLabel ? `<span class="card-grade">${metaLabel}</span>` : ''}
            <span class="card-grade" style="margin-left:auto;color:var(--dim)">${totalObs} obs</span>
          </div>
          ${qrDataUrl ? `<img class="card-hero-qr" src="${qrDataUrl}" alt="Athlete QR code" title="Scan to share">` : ''}
        </div>
      </div>
      ${(a.medical_notes || a.emergency_contact_name || a.emergency_contact_phone) ? `
      <details class="safety-details" open>
        <summary class="safety-summary-bar">
          <span class="safety-summary-label">${WARN} SAFETY INFO</span>
          <span class="safety-summary-hint">tap to collapse</span>
        </summary>
        <div class="safety-detail-body">
          <div class="safety-card">
            ${a.medical_notes ? `<div class="safety-row"><span class="safety-lbl">Medical</span><span class="safety-val">${esc(a.medical_notes)}</span></div>` : ''}
            ${a.emergency_contact_name ? `<div class="safety-row"><span class="safety-lbl">Contact</span><span class="safety-val">${esc(a.emergency_contact_name)}</span></div>` : ''}
            ${a.emergency_contact_phone ? `<div class="safety-row"><span class="safety-lbl">Phone</span><span class="safety-val"><a href="tel:${esc(a.emergency_contact_phone)}" class="safety-phone">${esc(a.emergency_contact_phone)}</a></span></div>` : ''}
          </div>
          <button class="safety-edit-link" data-a="edit-safety" data-id="${a.id}">Edit safety info</button>
        </div>
      </details>` : ''}
      <div class="trail-ready-band">
        <span class="trail-ready-label">TRAIL READY</span>
        <div class="ready-detail-row">${readyRowDetailHTML(conf, 20)}</div>
      </div>

      <div class="card-section">
        <h3 class="card-section-label">SKILL ASSESSMENT</h3>
        ${skillBlocks}
        <div class="session-actions">
          <button class="btn btn-outline" data-a="log-session" data-id="${a.id}">${isNew ? 'Set Initial Levels' : 'Log Observation'}</button>
          <button class="btn btn-primary${draftChanged ? '' : ' btn-disabled'}" data-a="confirm-session" data-id="${a.id}" ${draftChanged ? '' : 'disabled'}>Update Confirmed</button>
        </div>
      </div>

      <div class="card-section">
        <h3 class="card-section-label">OBSERVATION TIMELINE</h3>
        <div class="tl-list">${timelineRows}</div>
      </div>

      <div class="card-section">
        <h3 class="card-section-label">COACH NOTES</h3>
        <textarea class="notes-area" data-a="save-notes" data-id="${a.id}" placeholder="Coaching observations, cues, goals…">${esc(a.notes || '')}</textarea>
        ${!(a.medical_notes || a.emergency_contact_name || a.emergency_contact_phone) ? `
        <button class="safety-edit-link" data-a="edit-safety" data-id="${a.id}">+ Add safety info</button>` : ''}
      </div>
      </div>
    </div>`;
}

// ── Empty state ──────────────────────────────────────────────────────────────
function viewEmpty(s) {
  const filter = s?.roster_filter || 'all';
  const { name: teamName = 'Idaho League' } = getTeamSettings();
  const marks = Object.values(TRAIL_META).map(t => trailMarkSVG(t.kind, 26, t.color)).join('');

  const filterChips = ['all', 'athletes', 'coaches'].map(f => {
    const labels = { all: 'All', athletes: 'Athletes', coaches: 'Coaches' };
    return `<button class="filter-chip${filter === f ? ' filter-chip--active' : ''}" data-a="filter-roster" data-f="${f}">${labels[f]}</button>`;
  }).join('');

  return `
    <div class="hdr">
      <div class="hdr-top">
        <span class="hdr-kicker">${esc(teamName)}</span>
        <div class="hdr-actions">
          <button class="ico-btn" data-a="scan-card" aria-label="Scan athlete card">${SCAN}</button>
          <button class="btn btn-primary btn-sm" data-a="open-add" aria-label="Add person">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Add
          </button>
        </div>
      </div>
      <div class="hdr-title-row">
        <h1 class="hdr-title">Roster</h1>
        <span class="hdr-count">0 people</span>
      </div>
      <div class="roster-filters">${filterChips}</div>
    </div>
    <div class="empty-state">
      <div class="empty-marks">${marks}</div>
      <h2 class="empty-title">Build your roster</h2>
      <p class="empty-desc">Add athletes and coaches, then assess Body Position, Braking, and Cornering to see which trails each rider is ready for.</p>
      <div class="empty-steps">
        <div class="empty-step"><span class="step-n">1</span><div><b>Observe</b> — watch a rider and log what you see.</div></div>
        <div class="empty-step"><span class="step-n">2</span><div><b>Confirm</b> — set their level when it's consistent.</div></div>
        <div class="empty-step"><span class="step-n">3</span><div><b>Ride ready</b> — trail readiness computes automatically.</div></div>
      </div>
      <button class="btn btn-primary btn-lg" data-a="open-add">+ Add your first rider</button>
    </div>`;
}

// ── Field Guide / Rubric ─────────────────────────────────────────────────────
// sheet:false → Guide tab content (inline in #app)
// sheet:true  → sheet body content (opened from skill block on card)
export function viewRubric(s, { sheet = false } = {}) {
  const activeTab = s.rubricSkill || SKILL_IDS[0];
  const allTabs = [...SKILL_IDS, 'guide'];
  const tabLabels = { body_position: 'Body Position', braking: 'Braking', cornering: 'Cornering', guide: 'Guide' };

  const tabs = allTabs.map(id => {
    const active = id === activeTab;
    return `<button class="rubric-tab${active ? ' rubric-tab--active' : ''}" data-a="rubric-tab" data-id="${id}">${tabLabels[id]}</button>`;
  }).join('');

  const tabBar = `<div class="rubric-tabs" role="tablist">${tabs}</div>`;
  const body   = activeTab === 'guide' ? rubricGuideBody() : rubricSkillBody(activeTab);

  if (sheet) {
    return `
      <div class="sheet-rubric-head">
        <div class="sheet-head" style="border-bottom:none;padding-bottom:4px">
          <div></div>
          <div class="sheet-title">FIELD GUIDE</div>
          <button class="sheet-x" data-m="close">✕</button>
        </div>
        ${tabBar}
      </div>
      <div class="sheet-rubric-body">
        ${body}
        <div style="height:20px"></div>
      </div>`;
  }

  // Guide tab — non-fixed, scrolls within #app
  return `
    <div class="guide-sticky">
      <div class="hdr" style="position:static">
        <div class="hdr-top">
          <span class="hdr-kicker">SKILLS REFERENCE</span>
        </div>
        <div class="hdr-title-row">
          <h1 class="hdr-title">Field Guide</h1>
        </div>
      </div>
      ${tabBar}
    </div>
    <div class="guide-scroll">
      ${body}
      <div class="ph"></div>
    </div>`;
}

function rubricSkillBody(skillId) {
  const skill = SKILLS[skillId];

  const notes = (skill.notes || [])
    .map(n => `<p class="rc-note">${esc(n)}</p>`)
    .join('');

  const cards = [1, 2, 3, 4, 5].map(lv => {
    const lvData = skill.levels[lv];
    const color  = LV[lv];

    const dimRows = skill.dimensions.map(dim => {
      const label = dim.sublabel
        ? `${esc(dim.label)} <span class="rc-dim-sub">${esc(dim.sublabel)}</span>`
        : esc(dim.label);
      return `<div class="rc-dim">
        <span class="rc-dim-label">${label}</span>
        <span class="rc-dim-text">${esc(dim.levels[lv])}</span>
      </div>`;
    }).join('');

    const videoLink = lvData.video_url
      ? `<a class="rc-video-link" href="${esc(lvData.video_url)}" target="_blank" rel="noopener">▶ Video</a>`
      : '';

    // IDEA-015: what changed vs the level below (level 1 is the baseline).
    const progBlock = lvData.progression
      ? `<div class="rc-prog">
          <span class="rc-prog-hdr">What improves at Level ${lv}</span>
          ${progressionStripHTML(lvData.progression)}
        </div>`
      : '';

    // Forward-looking: the drills that develop a rider INTO the next level.
    const nextHow = skill.levels[lv + 1]?.progression?.how_to || [];
    const howTo = nextHow.length
      ? `<details class="progress-details">
          <summary class="progress-summary">
            <span>How to progress to Level ${lv + 1}</span>
            <span class="progress-chevron">▾</span>
          </summary>
          <ul class="progress-list">${nextHow.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
        </details>`
      : '';

    // Disqualifier list — moved here from the rider card so the card can stay
    // scannable. Any single item means the rider has not earned this level.
    const failList = (lvData.failure_modes || [])
      .map(f => `<li class="rc-fail-item">${esc(f)}</li>`).join('');
    const failBlock = failList
      ? `<div class="rc-fails">
          <span class="rc-fails-hdr">Any one of these = not this level</span>
          <ul class="rc-fail-list">${failList}</ul>
        </div>`
      : '';

    return `<div class="rubric-card" data-lv="${lv}">
      <div class="rc-head">
        <div class="rc-badge" style="background:${color}">${lv}</div>
        <div class="rc-head-info">
          <div class="rc-gate">${esc(lvData.consistency)}</div>
        </div>
      </div>
      <div class="rc-dims">${dimRows}</div>
      ${failBlock}
      ${progBlock}
      ${howTo}
      ${videoLink}
    </div>`;
  }).join('');

  return `
    <p class="rubric-skill-desc">${esc(skill.description)}</p>
    <p class="rc-calibration">${esc(skill.calibration_note)}</p>
    ${notes}
    <div class="rubric-cards">${cards}</div>
    <a class="rc-reference-link" href="rubric-reference.md" target="_blank" rel="noopener">Full written reference →</a>`;
}

function rubricGuideBody() {
  const g = TRAIL_GUIDE;
  const cn = COACH_NOTES;

  const minimumRows = Object.entries(TRAIL_MINIMUMS).map(([key, mins]) => {
    const label = TRAIL_LABELS[key];
    return `<tr class="rc-trail-row">
      <td class="rc-trail-name">${esc(label)}</td>
      <td class="rc-trail-cell">${mins.body_position}</td>
      <td class="rc-trail-cell">${mins.braking}</td>
      <td class="rc-trail-cell">${mins.cornering}</td>
    </tr>`;
  }).join('');

  const assessRules = g.assessment_rules.map(r => `<li class="rc-guide-li">${esc(r)}</li>`).join('');
  const scoreExamples = g.score_examples.map(e => `<li class="rc-guide-li">${esc(e)}</li>`).join('');
  const commonErrors = cn.common_errors.map(e => `<li class="rc-guide-li">${esc(e)}</li>`).join('');
  const interdeps = cn.interdependencies.map(i => `<li class="rc-guide-li">${esc(i)}</li>`).join('');
  const essentials = cn.key_essentials.map(e => `<li class="rc-guide-li">${esc(e)}</li>`).join('');

  return `
    <div class="rc-section">
      <h2 class="rc-section-title">Trail Selection</h2>
      <p class="rc-body">${esc(g.intro)}</p>

      <h3 class="rc-sub-title">Minimum skill levels</h3>
      <p class="rc-body-sm">${esc(g.minimums_note)}</p>
      <table class="rc-trail-mins">
        <thead><tr>
          <th class="rc-trail-name"></th>
          <th class="rc-trail-cell">BP</th>
          <th class="rc-trail-cell">BRK</th>
          <th class="rc-trail-cell">CRN</th>
        </tr></thead>
        <tbody>${minimumRows}</tbody>
      </table>

      <h3 class="rc-sub-title">Trail ratings reflect the hardest feature</h3>
      <p class="rc-body">${esc(g.trail_ratings_note)}</p>

      <h3 class="rc-sub-title">How to assess</h3>
      <ul class="rc-guide-list">${assessRules}</ul>

      <h3 class="rc-sub-title">A real example</h3>
      <p class="rc-body rc-example">${esc(g.real_example)}</p>

      <h3 class="rc-sub-title">Score notation</h3>
      <p class="rc-body">${esc(g.score_notation)}</p>
      <ul class="rc-guide-list">${scoreExamples}</ul>
      <p class="rc-body-sm">Reassessment cadence: ${esc(g.reassessment)}</p>
    </div>

    <div class="rc-section">
      <h2 class="rc-section-title">Coach Notes</h2>

      <h3 class="rc-sub-title">Fitts &amp; Posner — motor learning stages</h3>
      <p class="rc-body">${esc(cn.fitts_posner)}</p>

      <h3 class="rc-sub-title">Calibration — expected skill distribution</h3>
      <p class="rc-body">${esc(cn.calibration)}</p>

      <h3 class="rc-sub-title">Common assessment errors</h3>
      <ul class="rc-guide-list">${commonErrors}</ul>

      <h3 class="rc-sub-title">Skill interdependencies</h3>
      <ul class="rc-guide-list">${interdeps}</ul>

      <h3 class="rc-sub-title">3 Key Essentials — always present above Level 1</h3>
      <ul class="rc-guide-list">${essentials}</ul>
    </div>`;
}

// ── Modal: add person ─────────────────────────────────────────────────────────
export function modalAddPerson(defaultRole = 'athlete') {
  const categoryOptions = CATEGORIES.map(c =>
    `<option value="${esc(c)}">${esc(c)}</option>`
  ).join('');

  const athleteActive = defaultRole === 'athlete';

  return `
    <div class="modal-head">
      <span>Add Person</span>
      <button class="ico-btn" data-m="close">✕</button>
    </div>
    <div class="fg">
      <label class="fl" for="inp-name">Name</label>
      <input class="fi" id="inp-name" type="text" placeholder="Full name" autocapitalize="words">

      <div class="role-tabs" style="margin-top:12px">
        <button class="role-tab${athleteActive ? ' role-tab--active' : ''}" data-m="role-tab" data-role="athlete">Athlete</button>
        <button class="role-tab${!athleteActive ? ' role-tab--active' : ''}" data-m="role-tab" data-role="coach">Coach</button>
      </div>
      <input type="hidden" id="inp-role" value="${defaultRole}">

      <div id="athlete-fields" style="display:${athleteActive ? 'block' : 'none'};margin-top:8px">
        <label class="fl" for="inp-grade">Grade (5–12, auto-fills category)</label>
        <input class="fi" id="inp-grade" type="number" min="5" max="12" placeholder="e.g. 7">
        <label class="fl" for="inp-category" style="margin-top:8px">Category</label>
        <select class="fi" id="inp-category">
          <option value="">— select —</option>
          ${categoryOptions}
        </select>
        <label class="fl" for="inp-plate" style="margin-top:8px">Plate # (optional)</label>
        <input class="fi" id="inp-plate" type="number" placeholder="00">
      </div>

      <div id="coach-fields" style="display:${!athleteActive ? 'block' : 'none'};margin-top:8px">
        <label class="fl">NICA Level</label>
        <div class="coach-level-selector">
          <button class="coach-lv-btn" data-m="coach-level-btn" data-n="1">
            <span class="clv-n">L1</span>
            <span class="clv-label">Sweep</span>
          </button>
          <button class="coach-lv-btn" data-m="coach-level-btn" data-n="2">
            <span class="clv-n">L2</span>
            <span class="clv-label">Coach</span>
          </button>
          <button class="coach-lv-btn" data-m="coach-level-btn" data-n="3">
            <span class="clv-n">L3</span>
            <span class="clv-label">Head Coach</span>
          </button>
        </div>
        <input type="hidden" id="inp-coach-level" value="">
        <p class="modal-hint">NICA L1 = sweep / front of group. L2 = can lead a pod. L3 = runs practice.</p>
      </div>
    </div>
    <div class="fg" style="padding-top:0">
      <button class="btn btn-primary" data-m="save-person">Add</button>
    </div>
    <div style="height:12px"></div>`;
}

export function modalAddAthlete() { return modalAddPerson('athlete'); }

export function modalEditPerson(person) {
  const categoryOptions = CATEGORIES.map(c =>
    `<option value="${esc(c)}"${person.category === c ? ' selected' : ''}>${esc(c)}</option>`
  ).join('');

  const isAthlete = !person.role || person.role === 'athlete';
  const coachLevel = person.level ? String(person.level) : '';

  return `
    <div class="modal-head">
      <span>Edit ${isAthlete ? 'Athlete' : 'Coach'}</span>
      <button class="ico-btn" data-m="close">✕</button>
    </div>
    <div class="fg">
      <input type="hidden" id="inp-person-id" value="${esc(person.id)}">
      <label class="fl" for="inp-name">Name</label>
      <input class="fi" id="inp-name" type="text" value="${esc(person.name || '')}" autocapitalize="words">

      <div class="role-tabs" style="margin-top:12px">
        <button class="role-tab${isAthlete ? ' role-tab--active' : ''}" data-m="role-tab" data-role="athlete">Athlete</button>
        <button class="role-tab${!isAthlete ? ' role-tab--active' : ''}" data-m="role-tab" data-role="coach">Coach</button>
      </div>
      <input type="hidden" id="inp-role" value="${isAthlete ? 'athlete' : 'coach'}">

      <div id="athlete-fields" style="display:${isAthlete ? 'block' : 'none'};margin-top:8px">
        <label class="fl" for="inp-grade">Grade (5–12, auto-fills category)</label>
        <input class="fi" id="inp-grade" type="number" min="5" max="12" placeholder="e.g. 7" value="${esc(String(person.grade ?? ''))}">
        <label class="fl" for="inp-category" style="margin-top:8px">Category</label>
        <select class="fi" id="inp-category">
          <option value="">— select —</option>
          ${categoryOptions}
        </select>
        <label class="fl" for="inp-plate" style="margin-top:8px">Plate # (optional)</label>
        <input class="fi" id="inp-plate" type="number" placeholder="00" value="${esc(person.plate ?? '')}">
      </div>

      <div id="coach-fields" style="display:${!isAthlete ? 'block' : 'none'};margin-top:8px">
        <label class="fl">NICA Level</label>
        <div class="coach-level-selector">
          <button class="coach-lv-btn${coachLevel === '1' ? ' coach-lv-btn--active' : ''}" data-m="coach-level-btn" data-n="1">
            <span class="clv-n">L1</span>
            <span class="clv-label">Sweep</span>
          </button>
          <button class="coach-lv-btn${coachLevel === '2' ? ' coach-lv-btn--active' : ''}" data-m="coach-level-btn" data-n="2">
            <span class="clv-n">L2</span>
            <span class="clv-label">Coach</span>
          </button>
          <button class="coach-lv-btn${coachLevel === '3' ? ' coach-lv-btn--active' : ''}" data-m="coach-level-btn" data-n="3">
            <span class="clv-n">L3</span>
            <span class="clv-label">Head Coach</span>
          </button>
        </div>
        <input type="hidden" id="inp-coach-level" value="${esc(coachLevel)}">
        <p class="modal-hint">NICA L1 = sweep / front of group. L2 = can lead a pod. L3 = runs practice.</p>
      </div>
    </div>
    <div class="fg" style="padding-top:0">
      <button class="btn btn-primary" data-m="save-person">Save</button>
    </div>
    <div style="height:12px"></div>`;
}

export function modalSafetyInfo(a) {
  return `
    <div class="modal-head">
      <span>Safety Info</span>
      <button class="ico-btn" data-m="close">✕</button>
    </div>
    <div class="fg">
      <label class="fl" for="inp-medical">Medical notes</label>
      <input class="fi" id="inp-medical" type="text" value="${esc(a.medical_notes || '')}" placeholder="e.g. Epi pen, insulin">
      <label class="fl" for="inp-ec-name" style="margin-top:8px">Emergency contact name</label>
      <input class="fi" id="inp-ec-name" type="text" value="${esc(a.emergency_contact_name || '')}" placeholder="Parent / Guardian name">
      <label class="fl" for="inp-ec-phone" style="margin-top:8px">Emergency contact phone</label>
      <input class="fi" id="inp-ec-phone" type="tel" value="${esc(a.emergency_contact_phone || '')}" placeholder="208-555-1234">
      <p class="modal-hint">Stored on this device only. Included in trading card and JSON export.</p>
    </div>
    <div class="fg" style="padding-top:0">
      <button class="btn btn-primary" data-m="save-safety" data-id="${a.id}">Save</button>
    </div>
    <div style="height:12px"></div>`;
}

// ── Reconciliation sheet (Phase 3.2) ─────────────────────────────────────────
// Opened by tapping the "⚠ local only" badge on a roster row (see
// src/main.js's `open-reconcile` handler). Offers Add / Match / Delete for
// an athlete that exists on this device but has never synced to the
// backend. `state` is main.js's module-level `_reconcile`:
// { athleteId, submitting: null|'add'|'match'|'delete', error }.
export function modalReconcile(state) {
  if (!state?.athleteId) return '';
  const closeBtn = `<button class="ico-btn" data-m="close">✕</button>`;
  const athlete = getPeople().find(p => p.id === state.athleteId);
  if (!athlete) {
    return `<div class="modal-head"><span>Local Only</span>${closeBtn}</div>
      <div class="fg"><p class="modal-hint">That athlete no longer exists locally.</p></div>`;
  }

  const identity = getCachedIdentity();
  const remoteIds = new Set(getRemoteRosterIds() || []);
  // Candidates for "Match": local athletes that ARE on the backend roster
  // (synced down by a prior pull — see src/sync.js's roster loop), i.e.
  // everything BUT the local-only ones. This reuses the local store as the
  // remote-roster source of truth rather than caching a second copy.
  const candidates = getPeople({ role: 'athlete' })
    .filter(p => p.id !== athlete.id && remoteIds.has(p.id))
    .sort((x, y) => (x.name || '').localeCompare(y.name || ''));
  const suggestion = autoMatchByName(athlete, candidates);

  const myGroups = resolveMyGroups(identity?.personas, getPeople()).filter(g => g.ride_group_id);
  const canAdd = myGroups.length > 0;
  const groupPicker = myGroups.length > 1
    ? `<select class="fi" id="reconcile-add-group" style="margin-top:8px">
        ${myGroups.map(g => `<option value="${esc(g.ride_group_id)}">${esc(g.ride_group_name || 'Unnamed group')}</option>`).join('')}
       </select>`
    : (myGroups.length === 1
        ? `<p class="modal-hint">Will be added to <b>${esc(myGroups[0].ride_group_name || 'your group')}</b>.</p>
           <input type="hidden" id="reconcile-add-group" value="${esc(myGroups[0].ride_group_id)}">`
        : '');

  const matchOptions = candidates
    .map(c => `<option value="${esc(c.id)}"${suggestion?.id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`)
    .join('');

  return `
    <div class="modal-head"><span>Local Only</span>${closeBtn}</div>
    <div class="fg" style="padding-top:0">
      <p class="modal-hint">
        <b>${esc(athlete.name)}</b> isn't on your team's synced roster yet — it only exists on this device.
        Add it to the backend, match it to an existing roster athlete, or delete it.
      </p>
      ${state.error ? `<p class="modal-hint" style="color:#dc2626">${esc(state.error)}</p>` : ''}
    </div>

    <div class="settings-section" style="padding:0 16px 16px">
      <span class="settings-section-label">Add as a new athlete</span>
      ${canAdd
        ? `${groupPicker}
           <button class="btn btn-primary" data-m="reconcile-add" data-id="${esc(athlete.id)}" ${state.submitting ? 'disabled' : ''} style="margin-top:10px">${state.submitting === 'add' ? 'Adding…' : 'Add to backend'}</button>`
        : `<p class="modal-hint">You don't coach a ride group, so you can't add a new athlete directly. Ask your head coach to add them, then Match once they appear.</p>`}
    </div>

    <div class="settings-section" style="padding:16px">
      <span class="settings-section-label">Match to an existing athlete</span>
      ${candidates.length
        ? `<select class="fi" id="reconcile-match-select">
             <option value="">— Choose an athlete —</option>
             ${matchOptions}
           </select>
           <button class="btn btn-outline" data-m="reconcile-match" data-id="${esc(athlete.id)}" ${state.submitting ? 'disabled' : ''} style="margin-top:10px">${state.submitting === 'match' ? 'Matching…' : 'Match'}</button>`
        : `<p class="modal-hint">No synced athletes to match against yet.</p>`}
    </div>

    <div class="settings-section" style="padding:16px">
      <span class="settings-section-label">Delete</span>
      <p class="modal-hint">Removes this athlete and its observations from this device only.</p>
      <button class="btn btn-outline" style="color:#dc2626;border-color:#dc2626" data-m="reconcile-delete" data-id="${esc(athlete.id)}" ${state.submitting ? 'disabled' : ''}>Delete local record</button>
    </div>
    <div style="height:12px"></div>`;
}

// ── Reassign ride group (HC/TD-only, Phase 3.x) ───────────────────────────────
// Opened by tapping the "⋯ Group" affordance on a roster row (src/views.js's
// athleteRowHTML, gated on `_hcAssignGroupActive` -- never shown to a plain
// ride-group coach). `state` is main.js's module-level `_assignGroup`:
// { athleteId, submitting: null|'save', error } | null.

/** Unique {id, name} ride-group pairs present in the local roster, sorted
 * by name. Derived from the roster rather than a second cached copy -- the
 * same posture as modalReconcile's `candidates` above. */
function _teamGroupOptions(people) {
  const byId = new Map();
  (people || []).forEach(p => {
    if (p.ride_group_id && p.ride_group_name && !byId.has(p.ride_group_id)) {
      byId.set(p.ride_group_id, p.ride_group_name);
    }
  });
  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function modalAssignGroup(state) {
  if (!state?.athleteId) return '';
  const closeBtn = `<button class="ico-btn" data-m="close">✕</button>`;
  const athlete = getPeople().find(p => p.id === state.athleteId);
  if (!athlete) {
    return `<div class="modal-head"><span>Reassign Group</span>${closeBtn}</div>
      <div class="fg"><p class="modal-hint">That athlete no longer exists locally.</p></div>`;
  }

  const groups = _teamGroupOptions(getPeople());
  const options = [`<option value=""${!athlete.ride_group_id ? ' selected' : ''}>Unassigned</option>`]
    .concat(groups.map(g =>
      `<option value="${esc(g.id)}"${athlete.ride_group_id === g.id ? ' selected' : ''}>${esc(g.name)}</option>`
    ))
    .join('');

  return `
    <div class="modal-head"><span>Reassign Ride Group</span>${closeBtn}</div>
    <div class="fg" style="padding-top:0">
      <p class="modal-hint">Move <b>${esc(athlete.name)}</b> to a different ride group, or unassign them.</p>
      ${state.error ? `<p class="modal-hint" style="color:#dc2626">${esc(state.error)}</p>` : ''}
    </div>
    <div class="fg" style="padding-top:0">
      <label class="fl" for="assign-group-select">Ride group</label>
      <select class="fi" id="assign-group-select">${options}</select>
    </div>
    <div class="fg" style="padding-top:0">
      <button class="btn btn-primary" data-m="save-assign-group" data-id="${esc(athlete.id)}" ${state.submitting ? 'disabled' : ''}>${state.submitting === 'save' ? 'Saving…' : 'Save'}</button>
    </div>
    <div style="height:12px"></div>`;
}

export function modalShareCard(a, conf, qrDataUrl) {
  const lvLine = [
    `BP ${conf.body_position || '—'}`,
    `BRK ${conf.braking || '—'}`,
    `CRN ${conf.cornering || '—'}`,
  ].join(' · ');
  const hasSafety = a.medical_notes || a.emergency_contact_name || a.emergency_contact_phone;
  return `
    <div class="modal-head">
      <span>Share Card</span>
      <button class="ico-btn" data-m="close">✕</button>
    </div>
    <div class="share-card-body">
      <img class="share-qr" src="${qrDataUrl}" alt="Athlete QR code">
      <div class="share-card-summary">
        <div class="share-card-name">${esc(a.name)}</div>
        ${a.category ? `<div class="share-card-meta">${esc(a.category)}</div>` : a.grade ? `<div class="share-card-meta">Grade ${esc(String(a.grade))}</div>` : ''}
        <div class="share-card-levels">${esc(lvLine)}</div>
        ${hasSafety ? `<div class="share-card-safety">⚕ Safety info included</div>` : ''}
      </div>
      <p class="share-hint">Show this QR to another coach to scan on their device.</p>
    </div>
    <div style="height:12px"></div>`;
}

export function modalScanCard() {
  return `
    <div class="modal-head">
      <span>Scan Athlete Card</span>
      <button class="ico-btn" data-m="close">✕</button>
    </div>
    <div class="scan-card-body">
      <video id="scan-video" class="scan-video" playsinline muted autoplay></video>
      <canvas id="scan-canvas" style="display:none"></canvas>
      <p class="scan-hint" id="scan-hint">Point camera at a QR code from another coach's device. If scan isn't working, check that your camera app isn't set to portrait or face-blur mode.</p>
    </div>
    <div style="height:12px"></div>`;
}

export function modalReflection(practice, { ending = false } = {}) {
  const MOODS = [
    { n: 1, emoji: '😞' }, { n: 2, emoji: '🙁' }, { n: 3, emoji: '😐' },
    { n: 4, emoji: '🙂' }, { n: 5, emoji: '😊' },
  ];
  const currentMood = practice?.mood ?? null;
  const moodBtns = MOODS.map(m =>
    `<button class="mood-btn${currentMood === m.n ? ' mood-btn--active' : ''}" data-m="mood-select" data-n="${m.n}">${m.emoji}</button>`
  ).join('');

  const isEnded = practice?.status === 'ended';
  const saveLabel = (ending || isEnded) ? 'Save & close' : 'Save notes';

  return `
    <div class="modal-head">
      <span>${ending ? 'End Practice' : 'Practice Notes'}</span>
      <button class="ico-btn" data-m="close">✕</button>
    </div>
    <input type="hidden" id="inp-practice-id" value="${esc(practice?.id ?? '')}">
    <input type="hidden" id="inp-ending" value="${ending ? '1' : '0'}">
    <div class="fg">
      <label class="fl">How was practice?</label>
      <div class="mood-selector">
        ${moodBtns}
      </div>
      <input type="hidden" id="inp-mood" value="${currentMood ?? ''}">
      <label class="fl" for="inp-reflection" style="margin-top:4px">Reflection</label>
      <textarea class="fi" id="inp-reflection" rows="3" placeholder="What went well? What would you change?">${esc(practice?.reflection ?? '')}</textarea>
      <label class="fl" for="inp-incidents" style="margin-top:4px">Issues or incidents</label>
      <textarea class="fi" id="inp-incidents" rows="2" placeholder="Any incidents, injuries, or safety concerns to note">${esc(practice?.incidents ?? '')}</textarea>
    </div>
    <div class="fg" style="padding-top:0">
      <button class="btn btn-primary" data-m="save-reflection">${saveLabel}</button>
      ${ending ? `<button class="btn btn-ghost" data-m="skip-end-practice">Skip</button>` : ''}
    </div>
    <div style="height:12px"></div>`;
}

export function modalOnboarding() {
  return `
    <div class="modal-head">
      <span>Welcome</span>
    </div>
    <div class="fg">
      <p style="font:500 14px/1.5 var(--font-body);color:var(--dim);margin-bottom:4px">Add yourself to get started. You'll appear on the roster as a coach.</p>
      <label class="fl" for="inp-ob-name">Your name</label>
      <input class="fi" id="inp-ob-name" type="text" placeholder="Your name" autocapitalize="words">
      <label class="fl" for="inp-ob-team" style="margin-top:8px">Team name <span style="font-weight:400;color:var(--dim)">(optional)</span></label>
      <input class="fi" id="inp-ob-team" type="text" placeholder="e.g. Idaho League">
    </div>
    <div class="fg" style="padding-top:0">
      <button class="btn btn-primary" data-m="save-onboarding">Get started →</button>
    </div>
    <div style="height:12px"></div>`;
}

export function modalImportPreview(payload, existingAthlete) {
  const conf = payload.confirmed_levels || {};
  const lvLine = [
    `BP ${conf.body_position || '—'}`,
    `BRK ${conf.braking || '—'}`,
    `CRN ${conf.cornering || '—'}`,
  ].join(' · ');
  const hasSafety = payload.medical_notes || payload.emergency_contact_name || payload.emergency_contact_phone;

  const mergeWarning = existingAthlete ? `
    <div class="import-merge-warn">
      <strong>Already on your roster</strong> — ${esc(existingAthlete.name)} is already here. Choose below.
    </div>` : '';

  return `
    <div class="modal-head">
      <span>${existingAthlete ? 'Athlete Match Found' : 'Add Athlete'}</span>
      <button class="ico-btn" data-m="close">✕</button>
    </div>
    <div class="fg">
      ${mergeWarning}
      <div class="import-preview">
        <div class="import-preview-name">${esc(payload.name)}</div>
        ${payload.category ? `<div class="import-preview-meta">${esc(payload.category)}</div>` : payload.grade ? `<div class="import-preview-meta">Grade ${esc(String(payload.grade))}</div>` : ''}
        <div class="import-preview-levels">${esc(lvLine)}</div>
        ${hasSafety ? `<div class="import-preview-safety">
          ${payload.medical_notes ? `<div class="safety-row"><span class="safety-lbl">Medical</span><span class="safety-val">${esc(payload.medical_notes)}</span></div>` : ''}
          ${payload.emergency_contact_name ? `<div class="safety-row"><span class="safety-lbl">Contact</span><span class="safety-val">${esc(payload.emergency_contact_name)}</span></div>` : ''}
          ${payload.emergency_contact_phone ? `<div class="safety-row"><span class="safety-lbl">Phone</span><span class="safety-val">${esc(payload.emergency_contact_phone)}</span></div>` : ''}
        </div>` : ''}
      </div>
    </div>
    <div class="fg" style="padding-top:0;gap:8px">
      ${existingAthlete
        ? `<button class="btn btn-primary" data-m="confirm-merge">Update existing roster entry</button>
           <button class="btn btn-outline" data-m="confirm-import">Add as separate athlete</button>`
        : `<button class="btn btn-primary" data-m="confirm-import">Add to roster</button>`}
      <button class="btn btn-ghost" data-m="close">Cancel</button>
    </div>
    <div style="height:12px"></div>`;
}

// ── Roster import (HC/TD, column-mapping CSV wizard, Phase 3.2) ──────────────
// `state` (module-level `_rosterImport` in main.js) drives which step
// renders: 'upload' (pick a file) -> 'mapping' (column-mapping form +
// live preview, src/roster-import.js's mapRows) -> 'summary' (POST
// /api/roster/import's result). See src/roster-import.js for the parsing/
// mapping logic this view only renders.
const RI_FIELDS = [
  ['firstNameCol', 'First name'],
  ['lastNameCol', 'Last name'],
  ['emailCol', 'Email'],
  ['roleCol', 'Coach role (leave unmapped for an athlete-only file)'],
  ['rideGroupCol', 'Ride group'],
  ['gradeCol', 'Grade'],
  ['categoryCol', 'Racing category'],
];

export function modalRosterImport(state) {
  if (!state) return '';
  const closeBtn = `<button class="ico-btn" data-m="close">✕</button>`;

  if (state.step === 'summary' && state.summary) {
    const sum = state.summary;
    const skipped = sum.skipped || [];
    const skippedList = skipped.length
      ? `<div class="import-preview-safety" style="margin-top:10px">
          ${skipped.map(sk => `<div class="safety-row"><span class="safety-lbl">${esc(sk.name || '—')}</span><span class="safety-val">${esc(sk.reason || '')}</span></div>`).join('')}
        </div>`
      : '';
    return `
      <div class="modal-head"><span>Import Complete</span>${closeBtn}</div>
      <div class="fg">
        <div class="import-preview">
          <div class="import-preview-name">${sum.people_created} added · ${sum.people_updated} updated</div>
          <div class="import-preview-meta">${sum.groups_created} ride group${sum.groups_created === 1 ? '' : 's'} created${skipped.length ? ` · ${skipped.length} skipped` : ''}</div>
          ${skippedList}
        </div>
      </div>
      <div class="fg" style="padding-top:0">
        <button class="btn btn-primary" data-m="close">Done</button>
      </div>
      <div style="height:12px"></div>`;
  }

  const errorBanner = state.error
    ? `<div class="import-merge-warn"><strong>Couldn't import</strong> — ${esc(state.error)}</div>`
    : '';

  if (state.step !== 'mapping') {
    return `
      <div class="modal-head"><span>Import Roster</span>${closeBtn}</div>
      <div class="fg">
        ${errorBanner}
        <p class="settings-about" style="margin-bottom:10px">Choose a NICA PitZone CSV export (coach roster or athlete roster). You'll map columns and preview before anything is imported.</p>
        <label class="btn btn-outline" style="cursor:pointer;text-align:center">
          Choose CSV file
          <input id="roster-import-file" type="file" accept=".csv,text/csv" style="display:none">
        </label>
      </div>
      <div style="height:12px"></div>`;
  }

  // 'mapping' step
  const columnOptions = state.columns || [];
  const selects = RI_FIELDS.map(([field, label]) => `
    <label class="fl" for="ri-map-${field}" style="margin-top:8px">${esc(label)}</label>
    <select class="fi ri-map-select" id="ri-map-${field}" data-field="${field}">
      <option value="">— not mapped —</option>
      ${columnOptions.map(c => `<option value="${esc(c)}"${state.mapping?.[field] === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
    </select>`).join('');

  const mapped = mapRows(state.rows || [], state.mapping || {});
  const previewRows = mapped.slice(0, 5);
  const previewTable = previewRows.length
    ? `<div class="import-preview" style="margin-top:12px">
        ${previewRows.map(r => `
          <div class="safety-row">
            <span class="safety-lbl">${esc(r.name)}</span>
            <span class="safety-val">${esc(r.role)}${r.ride_group ? ' · ' + esc(r.ride_group) : ''}${r.grade ? ' · Gr ' + esc(r.grade) : ''}${r.category ? ' · ' + esc(r.category) : ''}</span>
          </div>`).join('')}
       </div>`
    : `<p class="settings-about" style="margin-top:10px;color:var(--dim)">No rows have a name yet — map at least First name (or Last name).</p>`;

  return `
    <div class="modal-head"><span>Map Columns</span>${closeBtn}</div>
    <div class="fg">
      ${errorBanner}
      <p class="settings-about">${esc(state.fileName || 'CSV')} — ${state.rows?.length ?? 0} row${state.rows?.length === 1 ? '' : 's'} found. Confirm which column is which.</p>
      ${selects}
      <p class="fl" style="margin-top:14px">Preview (${mapped.length} row${mapped.length === 1 ? '' : 's'} will import)</p>
      ${previewTable}
    </div>
    <div class="fg" style="padding-top:0;gap:8px">
      <button class="btn btn-primary" data-m="roster-import-confirm"${state.importing || !mapped.length ? ' disabled' : ''}>${state.importing ? 'Importing…' : `Import ${mapped.length} row${mapped.length === 1 ? '' : 's'}`}</button>
      <button class="btn btn-ghost" data-m="close">Cancel</button>
    </div>
    <div style="height:12px"></div>`;
}
