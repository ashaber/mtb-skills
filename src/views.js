/**
 * src/views.js — HTML-string view functions.
 * Every function returns a string set to #app.innerHTML (or a modal sheet).
 * Takes state object `s` as first argument.
 */

import log from './log.js';
import { SKILLS, SKILL_IDS, TRAIL_GUIDE, COACH_NOTES, TRAIL_MINIMUMS, TRAIL_LABELS } from './rubric.js';
import {
  getAthletes, getAthleteConfirmedLevels, getObservations,
  getCoach, getPhoto, getTeamSettings, exportAll,
} from './storage.js';
import {
  LV, pName, initials, readyRowHTML, readyRowDetailHTML, trendSVG, postureSVG,
  levelSelectorHTML, scoreChip, suggestLevel, TRAIL_META, trailMarkSVG, readyTrails,
} from './ui.js';

const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = iso => iso ? new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : '';

// SVG icons
const BACK  = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M13 5l-6 6 6 6"/></svg>`;
const TRASH = `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;
const BOOK  = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/></svg>`;
const SHARE = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 101.061-1.757l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/></svg>`;
const SCAN  = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm9-1a1 1 0 000 2h2v2a1 1 0 002 0V4a1 1 0 00-1-1h-3zM3 13a1 1 0 011 1v2h2a1 1 0 010 2H4a1 1 0 01-1-1v-3a1 1 0 011-1zm13 1a1 1 0 10-2 0v2h-2a1 1 0 000 2h3a1 1 0 001-1v-3z" clip-rule="evenodd"/><path d="M3 9a1 1 0 000 2h14a1 1 0 000-2H3z"/></svg>`;
const WARN  = `<svg width="13" height="13" viewBox="0 0 20 20" fill="#d97706"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;

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
          <div class="row-name">
            ${esc(pName(a.name))}
            ${(a.medical_notes || a.emergency_contact_name || a.emergency_contact_phone) ? `<span class="safety-flag" title="Has safety info">${WARN}</span>` : ''}
          </div>
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
        <div class="hdr-actions">
          <button class="ico-btn" data-a="scan-card" aria-label="Scan athlete card">${SCAN}</button>
          <button class="ico-btn" data-a="go-rubric" aria-label="Field Guide">${BOOK}</button>
          <button class="ico-btn" data-a="open-settings" aria-label="Settings">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>
          </button>
        </div>
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

    const failureItems = SKILLS[sk].levels[lv].failure_modes
      .map(f => `<li class="sb-fail-item">${esc(f)}</li>`).join('');

    return `<div class="skill-block">
      <div class="skill-block-head">
        <span class="skill-block-name">${SKILLS[sk].name.toUpperCase()}</span>
        <span class="skill-block-lv" style="color:${LV[lv]}">LEVEL ${lv}</span>
      </div>
      ${levelSelectorHTML(sk, lv, a.id, 'full')}
      <div class="sb-rubric-row">
        <div class="sb-col">
          <span class="sb-col-hdr">WHEN IT BREAKS</span>
          <p class="sb-when">${esc(SKILLS[sk].levels[lv].when_breaks)}</p>
        </div>
        <div class="sb-col sb-col-right">
          <span class="sb-col-hdr">WHAT BREAKS — ANY OF:</span>
          <ul class="sb-fail-list">${failureItems}</ul>
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
      <button class="sb-guide-link" data-a="go-rubric-skill" data-sk="${sk}">Full rubric in Field Guide →</button>
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
        <button class="ico-btn" data-a="share-card" data-id="${a.id}" aria-label="Share card">${SHARE}</button>
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
        <div class="hdr-actions">
          <button class="ico-btn" data-a="go-rubric" aria-label="Field Guide">${BOOK}</button>
          <button class="ico-btn" data-a="open-settings" aria-label="Settings">⚙</button>
        </div>
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

// ── Education / Field guide view ─────────────────────────────────────────────
export function viewRubric(s) {
  const activeTab = s.rubricSkill || SKILL_IDS[0];

  const allTabs = [...SKILL_IDS, 'guide'];
  const tabLabels = { body_position: 'Body Position', braking: 'Braking', cornering: 'Cornering', guide: 'Guide' };

  const tabs = allTabs.map(id => {
    const active = id === activeTab;
    return `<button class="rubric-tab${active ? ' rubric-tab--active' : ''}"
      data-a="rubric-tab" data-id="${id}">${tabLabels[id]}</button>`;
  }).join('');

  const body = activeTab === 'guide' ? rubricGuideBody() : rubricSkillBody(activeTab);

  return `
    <div class="rubric-view" id="rubric-view">
      <div class="rubric-topbar">
        <button class="ico-btn" data-a="go-roster">${BACK} ROSTER</button>
        <span class="rubric-view-title">FIELD GUIDE</span>
        <span style="width:88px"></span>
      </div>
      <div class="rubric-tabs" role="tablist">${tabs}</div>
      <div class="rubric-scroll">
        ${body}
        <div class="ph"></div>
      </div>
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

    return `<div class="rubric-card" data-lv="${lv}">
      <div class="rc-head">
        <div class="rc-badge" style="background:${color}">${lv}</div>
        <div class="rc-head-info">
          <div class="rc-gate">${esc(lvData.when_breaks)}</div>
        </div>
      </div>
      <div class="rc-dims">${dimRows}</div>
      ${videoLink}
    </div>`;
  }).join('');

  return `
    <p class="rubric-skill-desc">${esc(skill.description)}</p>
    <p class="rc-calibration">${esc(skill.calibration_note)}</p>
    ${notes}
    <div class="rubric-cards">${cards}</div>`;
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

  const assessRules = g.assessment_rules
    .map(r => `<li class="rc-guide-li">${esc(r)}</li>`).join('');
  const scoreExamples = g.score_examples
    .map(e => `<li class="rc-guide-li">${esc(e)}</li>`).join('');
  const commonErrors = cn.common_errors
    .map(e => `<li class="rc-guide-li">${esc(e)}</li>`).join('');
  const interdeps = cn.interdependencies
    .map(i => `<li class="rc-guide-li">${esc(i)}</li>`).join('');
  const essentials = cn.key_essentials
    .map(e => `<li class="rc-guide-li">${esc(e)}</li>`).join('');

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

// ── Modal: safety info edit ───────────────────────────────────────────────────
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

// ── Modal: share card (QR code) ───────────────────────────────────────────────
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
        ${a.grade ? `<div class="share-card-meta">Grade ${esc(String(a.grade))}</div>` : ''}
        <div class="share-card-levels">${esc(lvLine)}</div>
        ${hasSafety ? `<div class="share-card-safety">⚕ Safety info included</div>` : ''}
      </div>
      <p class="share-hint">Show this QR to another coach to scan on their device.</p>
    </div>
    <div style="height:12px"></div>`;
}

// ── Modal: scan card (camera) ─────────────────────────────────────────────────
export function modalScanCard() {
  return `
    <div class="modal-head">
      <span>Scan Athlete Card</span>
      <button class="ico-btn" data-m="close">✕</button>
    </div>
    <div class="scan-card-body">
      <video id="scan-video" class="scan-video" playsinline muted autoplay></video>
      <canvas id="scan-canvas" style="display:none"></canvas>
      <p class="scan-hint" id="scan-hint">Point camera at a QR code from another coach's device.</p>
    </div>
    <div style="height:12px"></div>`;
}

// ── Modal: import preview ─────────────────────────────────────────────────────
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
      <strong>Already on your roster</strong> — this athlete (${esc(existingAthlete.name)}) is already on your roster. Choose below.
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
        ${payload.grade ? `<div class="import-preview-meta">Grade ${esc(String(payload.grade))}</div>` : ''}
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
