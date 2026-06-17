/**
 * src/views.js — HTML-string view functions.
 * Every function returns a string set to #app.innerHTML (or a modal sheet).
 * Takes state object `s` as first argument.
 */

import log from './log.js';
import { SKILLS, SKILL_IDS } from './rubric.js';
import {
  getAthletes, getAthleteConfirmedLevels, getObservations,
  getCoach, getPhoto, getTeamSettings, exportAll,
} from './storage.js';
import {
  LV, pName, initials, readyRowHTML, trendSVG, postureSVG,
  levelSelectorHTML, scoreChip, suggestLevel, TRAIL_META, trailMarkSVG, readyTrails,
} from './ui.js';

const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = iso => iso ? new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : '';

// SVG icons
const BACK  = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M13 5l-6 6 6 6"/></svg>`;
const TRASH = `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;

// ── Roster view ─────────────────────────────────────────────────────────────
export function viewRoster(s) {
  const athletes = getAthletes().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const { name: teamName = 'Idaho League' } = getTeamSettings();

  if (!athletes.length) return viewEmpty();

  const rows = athletes.map(a => {
    const conf = getAthleteConfirmedLevels(a.id);
    const open = s.expandedId === a.id;
    const draft = s.draft[a.id] || { body_position: conf.body_position || 1, braking: conf.braking || 1, cornering: conf.cornering || 1 };
    const isNew = !conf.body_position && !conf.braking && !conf.cornering;

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
          <button class="btn btn-primary" data-a="log-session" data-id="${a.id}">
            ${isNew ? 'Set Initial Levels' : 'Log Observation'}
          </button>
          <button class="btn btn-ghost" data-a="go-card" data-id="${a.id}">Open full rider card →</button>
        </div>
      </div>` : '';

    const photo = getPhoto(a.id);
    const mono = photo
      ? `<img src="${photo}" class="mono-photo" alt="${esc(a.name)}">`
      : `<div class="mono">${esc(initials(a.name))}<span class="mono-cam">📷</span></div>`;

    return `<div class="row-card${open ? ' row-card--open' : ''}">
      <div class="row-main">
        <button class="mono-btn" data-a="go-card" data-id="${a.id}" aria-label="Open ${esc(a.name)}'s card">${mono}</button>
        <button class="row-body" data-a="toggle-expand" data-id="${a.id}">
          <div class="row-name">${esc(pName(a.name))}</div>
          <div class="row-meta">
            <span class="row-grade">GR ${esc(String(a.grade || '—'))}</span>
            <span class="sep">·</span>
            <span class="ready-row">${readyRowHTML(conf, 14)}</span>
          </div>
        </button>
        <button class="chips-caret" data-a="toggle-expand" data-id="${a.id}">
          ${chips}
          <svg class="caret${open?' caret--open':''}" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--dim)" stroke-width="2.4" stroke-linecap="round"><path d="M5 8l5 5 5-5"/></svg>
        </button>
      </div>
      ${expandPanel}
    </div>`;
  }).join('');

  return `
    <div class="hdr" id="hdr">
      <div class="hdr-top">
        <span class="hdr-kicker">${esc(teamName)}</span>
        <button class="ico-btn" data-a="open-settings" aria-label="Settings">
          <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>
        </button>
      </div>
      <div class="hdr-title-row">
        <h1 class="hdr-title">Team Roster</h1>
        <span class="hdr-count">${athletes.length} riders</span>
      </div>
    </div>
    <div class="list" id="list">${rows}</div>
    <div class="ph"></div>
    <button class="fab" data-a="open-add">+ Rider</button>`;
}

// ── Rider card view (replaces athlete + skill views) ─────────────────────────
export function viewCard(s) {
  const a = getAthletes().find(x => x.id === s.athleteId);
  if (!a) return viewRoster(s);

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

  // Skill blocks
  const skillBlocks = SKILL_IDS.map(sk => {
    const lv      = draft[sk] || 1;
    const confirmedLv = conf[sk] || 0;
    const history = getObservations({ athlete_id: a.id, skill: sk })
      .sort((a, b) => b.session_date.localeCompare(a.session_date));
    const sugg    = suggestLevel(history, confirmedLv);
    const trend   = trendSVG(history, confirmedLv, 160, 44);
    const hasObs  = history.length > 0;

    return `<div class="skill-block">
      <div class="skill-block-main">
        <div class="posture-box">${postureSVG(sk, lv, LV[lv], 116)}</div>
        <div class="skill-block-right">
          <div class="skill-block-head">
            <span class="skill-block-name">${SKILLS[sk].name.toUpperCase()}</span>
            <span class="skill-block-lv" style="color:${LV[lv]}">LEVEL ${lv}</span>
          </div>
          <p class="skill-cue">${esc(SKILLS[sk].levels[lv].when_breaks)}</p>
          ${levelSelectorHTML(sk, lv, a.id, 'full')}
          <p class="skill-rubric-line"><span class="rubric-x">✕</span><em>${esc(SKILLS[sk].levels[lv].failure_modes.slice(0,2).join(' · '))}</em></p>
        </div>
      </div>
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
      <div class="rubric-links">
        <button class="rubric-link-btn" data-a="open-rubric-doc" data-sk="${sk}" data-lv="${lv}">📄 FULL RUBRIC</button>
        <button class="rubric-link-btn" data-a="open-rubric-video" data-sk="${sk}" data-lv="${lv}">▶ VIDEO</button>
      </div>
    </div>`;
  }).join('');

  // Observation timeline (all skills merged, reverse-chron)
  const allObs = getObservations({ athlete_id: a.id })
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
    .slice(0, 12);
  const SHORT_SK = { body_position:'BP', braking:'BRK', cornering:'CRN' };
  const timelineRows = allObs.length
    ? allObs.map(o => `
        <div class="tl-row">
          <span class="tl-lv" style="background:${LV[o.level_observed]}">${o.level_observed}</span>
          <span class="tl-skill">${SKILLS[o.skill].name}</span>
          <span class="tl-date">${fmt(o.session_date)}</span>
        </div>`).join('')
    : `<p class="empty-micro">No observations logged yet.</p>`;

  return `
    <div class="card-view" id="card-view">
      <div class="card-topbar">
        <button class="ico-btn" data-a="go-roster">${BACK} ROSTER</button>
        <span class="card-obs-count">${totalObs} obs</span>
        <button class="ico-btn" data-a="del-athlete" data-id="${a.id}" aria-label="Delete">${TRASH}</button>
      </div>
      <div class="card-scroll">
        <div class="card-hero">
          <div class="card-hero-photo">${photoEl}</div>
          <div class="card-hero-info">
            <h2 class="card-name">${esc(a.name)}</h2>
            <div class="card-hero-meta">
              ${a.plate ? `<span class="plate-pill">#${esc(String(a.plate))}</span>` : ''}
              <span class="card-grade">GRADE ${esc(String(a.grade || '—'))}</span>
            </div>
            <div class="trail-ready-section">
              <span class="section-micro">TRAIL READY</span>
              <div class="ready-row">${readyRowHTML(conf, 18)}</div>
            </div>
          </div>
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
        </div>

        ${(a.medical?.length || a.allergies || a.parent) ? `
        <div class="card-section">
          <h3 class="card-section-label">MEDICAL & SAFETY</h3>
          <div class="medical-card">
            ${(a.medical || []).map(m => `
              <div class="medical-row${m.critical ? ' medical-row--critical' : ''}">
                <span class="medical-icon">${m.critical ? '⚕' : 'ℹ'}</span>
                <span class="medical-text">${esc(m.t)}</span>
              </div>`).join('')}
            ${a.allergies ? `<div class="medical-row"><span class="medical-label">Allergies</span><span class="medical-text">${esc(a.allergies)}</span></div>` : ''}
          </div>
        </div>
        <div class="card-section">
          <h3 class="card-section-label">EMERGENCY CONTACT</h3>
          <div class="contact-card">
            <div><div class="contact-name">${esc(a.parent || '—')}</div><div class="contact-role">Parent / Guardian</div></div>
            ${a.phone ? `<a class="contact-call" href="tel:${esc(a.phone)}">📞 ${esc(a.phone)}</a>` : ''}
          </div>
        </div>` : ''}
        <div class="ph"></div>
      </div>
    </div>`;
}

// ── Empty state ──────────────────────────────────────────────────────────────
function viewEmpty() {
  const { name: teamName = 'Idaho League' } = getTeamSettings();
  const marks = Object.values(TRAIL_META).map(t => trailMarkSVG(t.kind, 26, t.color)).join('');
  return `
    <div class="hdr">
      <div class="hdr-top">
        <span class="hdr-kicker">${esc(teamName)}</span>
        <button class="ico-btn" data-a="open-settings" aria-label="Settings">⚙</button>
      </div>
      <div class="hdr-title-row">
        <h1 class="hdr-title">Team Roster</h1>
        <span class="hdr-count">0 riders</span>
      </div>
    </div>
    <div class="empty-state">
      <div class="empty-marks">${marks}</div>
      <h2 class="empty-title">Build your roster</h2>
      <p class="empty-desc">Add your athletes, then assess Body Position, Braking, and Cornering to see which trails each rider is ready for.</p>
      <div class="empty-steps">
        <div class="empty-step"><span class="step-n">1</span><div><b>Observe</b> — watch a rider and log what you see.</div></div>
        <div class="empty-step"><span class="step-n">2</span><div><b>Confirm</b> — set their level when it's consistent.</div></div>
        <div class="empty-step"><span class="step-n">3</span><div><b>Ride ready</b> — trail readiness computes automatically.</div></div>
      </div>
      <button class="btn btn-primary btn-lg" data-a="open-add">+ Add your first rider</button>
    </div>`;
}

// ── Modal: add athlete ────────────────────────────────────────────────────────
export function modalAddAthlete() {
  return `
    <div class="modal-head">
      <span>Add Rider</span>
      <button class="ico-btn" data-m="close">✕</button>
    </div>
    <div class="fg">
      <label class="fl" for="inp-name">Name</label>
      <input class="fi" id="inp-name" type="text" placeholder="Rider name" autocapitalize="words">
      <div style="display:flex;gap:12px;margin-top:4px">
        <div style="flex:1">
          <label class="fl" for="inp-grade">Grade</label>
          <input class="fi" id="inp-grade" type="number" min="6" max="12" placeholder="9">
        </div>
        <div style="flex:1">
          <label class="fl" for="inp-plate">Plate #</label>
          <input class="fi" id="inp-plate" type="number" placeholder="00">
        </div>
      </div>
      <p class="modal-hint">Skill levels set on first assessment.</p>
    </div>
    <div class="fg" style="padding-top:0">
      <button class="btn btn-primary" data-m="save-athlete">Add Rider</button>
    </div>
    <div style="height:12px"></div>`;
}

// ── Modal: settings ───────────────────────────────────────────────────────────
export function modalSettings() {
  const { name: teamName = 'Idaho League', coachName = '' } = getTeamSettings();
  const coach = getCoach();
  return `
    <div class="modal-head">
      <span>Settings</span>
      <button class="ico-btn" data-m="close">✕</button>
    </div>
    <div class="fg">
      <label class="fl" for="inp-team">League / Team name</label>
      <input class="fi" id="inp-team" type="text" value="${esc(teamName)}" placeholder="Idaho League">
      <label class="fl" for="inp-coach" style="margin-top:8px">Coach name</label>
      <input class="fi" id="inp-coach" type="text" value="${esc(coach?.name ?? coachName)}" placeholder="Your name">
    </div>
    <div class="fg" style="padding-top:0">
      <button class="btn btn-primary" data-m="save-settings">Save</button>
    </div>
    <div class="modal-divider"></div>
    <div class="fg">
      <span class="fl">Data</span>
      <button class="btn btn-outline" data-m="export">Export JSON backup</button>
      <label class="btn btn-outline" style="cursor:pointer;text-align:center">
        Import JSON backup
        <input id="imp-file" type="file" accept=".json" style="display:none">
      </label>
    </div>
    <div style="height:16px"></div>`;
}
