/**
 * src/ui.js — visual building-block helpers.
 * Pure functions returning HTML/SVG strings. No side-effects.
 */

import { SKILL_IDS, TRAIL_LABELS, TRAIL_MINIMUMS } from './rubric.js';
import { SKILLS } from './rubric-content.js';

// ── Level colours (functional — kept from existing app) ───────────────────
export const LV = { 0:'#b3aea3', 1:'#dc2626', 2:'#ea580c', 3:'#2563eb', 4:'#16a34a', 5:'#7c3aed' };

// ── Name abbreviation ─────────────────────────────────────────────────────
export function pName(name) {
  if (!name || name.length <= 12) return name;
  const parts = name.trim().split(/\s+/);
  const last  = parts.pop() || '';
  return parts.join(' ') + ' ' + last[0].toUpperCase() + '.';
}

// ── Initials ──────────────────────────────────────────────────────────────
export function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
}

// ── Trail readiness ───────────────────────────────────────────────────────
export function readyTrails(conf) {
  return Object.entries(TRAIL_MINIMUMS)
    .filter(([, mins]) =>
      Object.entries(mins).every(([sk, min]) => (conf[sk] ?? 0) >= min))
    .map(([key]) => key);
}

// ── Trend / suggestion ────────────────────────────────────────────────────
/** history: Observation[] most-recent-first */
export function suggestLevel(history, confirmed) {
  if (!history?.length) return null;
  const recent = history.slice(0, 5).map(o => o.level_observed);
  const counts = {};
  recent.forEach(l => { counts[l] = (counts[l] || 0) + 1; });
  let best = confirmed, bestC = 0;
  Object.entries(counts).forEach(([l, c]) => { if (+c > bestC) { bestC = +c; best = +l; } });
  return (best !== confirmed && bestC >= 3) ? best : null;
}

// ── Trail-shape SVG (officially recognised difficulty symbols) ────────────
// ONLY used for trail readiness — never for skill level itself.
const T_GREEN = '#1a9d4e', T_BLUE = '#1f6feb', T_BLACK = '#16181d';
export const TRAIL_META = {
  green:        { label: 'Green',     kind: 'circle',  color: T_GREEN },
  blue:         { label: 'Blue',      kind: 'square',  color: T_BLUE  },
  black:        { label: 'Black',     kind: 'diamond', color: T_BLACK },
  double_black: { label: 'Dbl Black', kind: 'double',  color: T_BLACK },
};
// Decorative — always used inside a wrapper that already carries the
// accessible name (title/aria-label on the parent <span>, e.g. readyRowHTML
// / readyRowDetailHTML), so the mark itself is hidden from assistive tech
// to avoid a redundant, unlabeled announcement.
export function trailMarkSVG(kind, size = 20, color) {
  const s = size;
  const c = color || (kind === 'circle' ? T_GREEN : kind === 'square' ? T_BLUE : T_BLACK);
  const hidden = 'aria-hidden="true" focusable="false"';
  if (kind === 'circle')
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${hidden}><circle cx="12" cy="12" r="9" fill="${c}"/></svg>`;
  if (kind === 'square')
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${hidden}><rect x="4" y="4" width="16" height="16" rx="2" fill="${c}"/></svg>`;
  if (kind === 'diamond')
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${hidden}><rect x="5.5" y="5.5" width="13" height="13" rx="1.5" transform="rotate(45 12 12)" fill="${c}"/></svg>`;
  if (kind === 'double')
    return `<svg width="${Math.round(s * 1.45)}" height="${s}" viewBox="0 0 35 24" ${hidden}><rect x="3" y="6" width="11" height="11" rx="1.3" transform="rotate(45 8.5 11.5)" fill="${c}"/><rect x="21" y="6" width="11" height="11" rx="1.3" transform="rotate(45 26.5 11.5)" fill="${c}"/></svg>`;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${hidden}><rect x="3" y="10.5" width="18" height="3" rx="1.5" fill="${c}"/></svg>`;
}

// level → trail kind (for the posture-level infographic scale legend)
const LEVEL_MARK = { 1:'flat', 2:'circle', 3:'square', 4:'diamond', 5:'double' };

const SKILL_ABBR = { body_position: 'BP', braking: 'BRK', cornering: 'CRN' };

// Returns skill abbreviations that are below minimum for a given trail key.
export function bottleneckSkills(conf, trailKey) {
  const mins = TRAIL_MINIMUMS[trailKey];
  if (!mins) return [];
  return Object.entries(mins)
    .filter(([sk, min]) => (conf[sk] ?? 0) < min)
    .map(([sk]) => SKILL_ABBR[sk]);
}

// ── Trail readiness row HTML (compact — roster row) ───────────────────────
export function readyRowHTML(conf, size = 18) {
  const ready = readyTrails(conf);
  return Object.entries(TRAIL_META).map(([key, t]) => {
    const on = ready.includes(key);
    const col = (key === 'black' || key === 'double_black') ? (on ? '#16181d' : '#a0a09a') : t.color;
    // aria-label mirrors `title` — `title` alone isn't reliably announced by
    // mobile screen readers (no hover state to trigger it on a touch UI).
    const label = `${t.label}${on ? ' ready' : ' not ready'}`;
    return `<span title="${t.label}" aria-label="${label}" style="display:inline-flex;align-items:center;opacity:${on ? 1 : 0.25};filter:${on ? 'none' : 'grayscale(1)'}">${trailMarkSVG(t.kind, size, col)}</span>`;
  }).join('');
}

// ── Trail readiness row HTML (detail — athlete card) ──────────────────────
// Shows blocked skill abbreviations per tier instead of just opacity.
export function readyRowDetailHTML(conf, size = 20) {
  return Object.entries(TRAIL_META).map(([key, t]) => {
    const blockers = bottleneckSkills(conf, key);
    const ready = blockers.length === 0;
    const isDark = key === 'black' || key === 'double_black';
    const col = isDark ? (ready ? '#16181d' : '#a0a09a') : t.color;
    const mark = `<span style="opacity:${ready ? 1 : 0.3}">${trailMarkSVG(t.kind, size, col)}</span>`;
    const status = ready
      ? `<span class="rdt-check" aria-hidden="true">✓</span>`
      : `<span class="rdt-fail" aria-hidden="true">${blockers.join(' · ')}</span>`;
    // aria-label mirrors `title` (unreliable on mobile screen readers) and
    // replaces the raw ✓ / abbreviation-list content, which reads poorly
    // on its own without the visual context.
    const label = `${t.label}: ${ready ? 'ready' : 'blocked by ' + blockers.join(', ')}`;
    return `<span class="rdt" title="${t.label}" aria-label="${label}">${mark}${status}</span>`;
  }).join('');
}

// ── Posture infographic SVG ───────────────────────────────────────────────
// viewBox 0 0 150 108. Bike is fixed; rider morphs across levels.
const BIKE = {
  rearHub:[42,80], frontHub:[116,80], bb:[70,80],
  seat:[58,50], headTop:[104,50], hand:[106,47], foot:[70,92],
};
const BP_POSES = {
  1:{ hip:[60,54], sho:[63,35], head:[65,25,6], elb:[85,42], knee:[66,70] },
  2:{ hip:[62,50], sho:[66,33], head:[68,23,6], elb:[86,41], knee:[68,68] },
  3:{ hip:[56,50], sho:[70,37], head:[74,28,6], elb:[88,47], knee:[64,68] },
  4:{ hip:[50,56], sho:[73,41], head:[78,32,6], elb:[91,50], knee:[61,70] },
  5:{ hip:[45,60], sho:[75,43], head:[81,35,6], elb:[93,52], knee:[58,72] },
};
function poseFor(skill, level) {
  const p = JSON.parse(JSON.stringify(BP_POSES[level]));
  if (skill === 'braking') {
    const k = (level - 1) / 4;
    p.hip[0] -= 6 * k; p.hip[1] += 3 * k; p.knee[0] += 3 * k;
  }
  return p;
}
const pts = arr => arr.map(p => p.join(',')).join(' ');
export function postureSVG(skill, level, color, size = 120) {
  const p  = poseFor(skill, level);
  const { rearHub, frontHub, bb, seat, headTop, hand, foot } = BIKE;
  const lean = skill === 'cornering' ? (level - 1) * 2.2 : 0;
  const W = size, H = Math.round(size * (108 / 150));
  const bc = '#c9ccd2';
  const skillLabel = skill === 'body_position' ? 'Body position' : skill === 'braking' ? 'Braking' : skill === 'cornering' ? 'Cornering' : skill;
  return `<svg width="${W}" height="${H}" viewBox="0 0 150 108" fill="none" role="img" aria-label="${skillLabel} posture at level ${level}">
  <line x1="8" y1="99" x2="142" y2="99" stroke="#e6e3dc" stroke-width="2.5" stroke-linecap="round"/>
  <g transform="rotate(${lean} 79 97)">
    <g stroke="${bc}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="${rearHub[0]}" cy="${rearHub[1]}" r="17"/>
      <circle cx="${frontHub[0]}" cy="${frontHub[1]}" r="17"/>
      <polyline points="${pts([rearHub,bb,seat,rearHub])}"/>
      <polyline points="${pts([bb,headTop,seat])}"/>
      <line x1="${headTop[0]}" y1="${headTop[1]}" x2="${frontHub[0]}" y2="${frontHub[1]}"/>
      <line x1="${seat[0]-5}" y1="${seat[1]}" x2="${seat[0]+5}" y2="${seat[1]-1}" stroke-width="4"/>
      <line x1="${headTop[0]-1}" y1="${headTop[1]-1}" x2="${hand[0]+2}" y2="${hand[1]-2}" stroke-width="4"/>
      <line x1="${bb[0]}" y1="${bb[1]}" x2="${foot[0]}" y2="${foot[1]}"/>
    </g>
    <g stroke="${color}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <line x1="${p.hip[0]}" y1="${p.hip[1]}" x2="${p.sho[0]}" y2="${p.sho[1]}"/>
      <polyline points="${pts([p.sho,p.elb,hand])}"/>
      <polyline points="${pts([p.hip,p.knee,foot])}"/>
    </g>
    <circle cx="${p.head[0]}" cy="${p.head[1]}" r="${p.head[2]}" fill="${color}"/>
  </g></svg>`;
}

// ── Trend sparkline SVG ───────────────────────────────────────────────────
export function trendSVG(history, confirmed, width = 160, height = 46) {
  if (!history?.length)
    return `<span style="font:500 12px/1 var(--font-body);color:var(--dim)">No observations yet</span>`;
  const data = history.slice().map(o => o.level_observed).reverse(); // oldest→newest
  const n = data.length;
  const padX = 10, padY = 7;
  const xi = i => n === 1 ? width / 2 : padX + (i * (width - padX * 2)) / (n - 1);
  const yi = lv => height - padY - ((lv - 1) / 4) * (height - padY * 2);
  const confY = confirmed ? yi(confirmed) : null;
  const polyPts = data.map((lv, i) => `${xi(i)},${yi(lv)}`).join(' ');
  const dots = data.map((lv, i) => {
    const r = i === n - 1 ? 5 : 3.5;
    const sw = i === n - 1 ? 2 : 1.2;
    return `<circle cx="${xi(i)}" cy="${yi(lv)}" r="${r}" fill="${LV[lv]}" stroke="#fff" stroke-width="${sw}"/>`;
  }).join('');
  // The sparkline shows a pattern (trend over time) that the adjacent
  // text summary doesn't fully capture, so it gets a real accessible name
  // rather than aria-hidden — oldest-to-newest observed levels.
  const trendLabel = `Observation trend, oldest to newest: ${data.join(' → ')}`;
  return `<svg width="${width}" height="${height}" style="display:block" role="img" aria-label="${trendLabel}">
  ${confY !== null ? `<line x1="2" y1="${confY}" x2="${width-2}" y2="${confY}" stroke="${LV[confirmed]}" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.5"/>` : ''}
  <polyline points="${polyPts}" fill="none" stroke="#cdc8bd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  ${dots}</svg>`;
}

// ── Segmented level selector (5 tappable stops) ───────────────────────────
// Replaces drag-slider; renders cleanly in vanilla JS with event delegation.
export function levelSelectorHTML(skill, draftLevel, athleteId, size = 'compact') {
  const action = size === 'full' ? 'preview-level' : 'draft-level';
  const segs = [1, 2, 3, 4, 5].map(n => {
    const sel = n === draftLevel;
    const style = sel
      ? `background:${LV[n]};border-color:${LV[n]};color:#fff`
      : `color:${LV[n]};border-color:var(--border)`;
    return `<button class="lv-seg${sel ? ' sel' : ''}" style="${style}"
      data-a="${action}" data-sk="${skill}" data-n="${n}" data-aid="${athleteId}"
      aria-pressed="${sel}" aria-label="Level ${n}">
      <span class="lv-seg-n">${n}</span>
    </button>`;
  }).join('');
  return `<div class="lv-selector" role="group" aria-label="Level">${segs}</div>`;
}

// ── Score chip (roster row) ───────────────────────────────────────────────
// ── Skill bullet icons ────────────────────────────────────────────────────
// viewBox 26×18: symbol left 0–16 (currentColor), directional arrow right 18–26.
// Recommended size: width="28" height="16" inline; width="35" height="20" for labels.
// Color via className or wrap in <span style="color:var(--l3)">.
//
// Usage:
//   <span class="skill-line">
//     <span style="color:var(--l3)">${ICON_TERRAIN_INCREASE}</span>
//     Loose over hardpack, rutted corners
//   </span>

export const ICON_FAIL_DECREASE = `
<svg viewBox="0 0 26 18" fill="none" stroke="currentColor" aria-hidden="true" focusable="false"
     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M7 1.5 L1.5 3.8 V8.4 C1.5 12.2 4 14.9 7 16.2
           C10 14.9 12.5 12.2 12.5 8.4 V3.8 Z"/>
  <polyline points="4.5,7.2 7,10.2 9.5,7.2"/>
  <line x1="21" y1="3" x2="21" y2="11.5"/>
  <polygon points="18.5,10 21,14.5 23.5,10" fill="currentColor" stroke="none"/>
</svg>`;

export const ICON_TERRAIN_INCREASE = `
<svg viewBox="0 0 26 18" fill="none" stroke="currentColor" aria-hidden="true" focusable="false"
     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="1,16 4.5,8.5 7.5,11.5 11,4 16,16"/>
  <line x1="1" y1="16" x2="16" y2="16" stroke-opacity=".3"/>
  <line x1="21" y1="15" x2="21" y2="6.5"/>
  <polygon points="18.5,8.5 21,3.5 23.5,8.5" fill="currentColor" stroke="none"/>
</svg>`;

export const ICON_SKILL_INCREASE = `
<svg viewBox="0 0 26 18" fill="none" stroke="currentColor" aria-hidden="true" focusable="false"
     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="1.5,16 1.5,13 6,13 6,9.5 10.5,9.5 10.5,6 16,6"/>
  <line x1="6"    y1="13"  x2="6"    y2="16" stroke-opacity=".25"/>
  <line x1="10.5" y1="9.5" x2="10.5" y2="16" stroke-opacity=".25"/>
  <line x1="16"   y1="6"   x2="16"   y2="16" stroke-opacity=".25"/>
  <line x1="21" y1="15" x2="21" y2="6.5"/>
  <polygon points="18.5,8.5 21,3.5 23.5,8.5" fill="currentColor" stroke="none"/>
</svg>`;

// ── Level progression strip (IDEA-015) ────────────────────────────────────
// Renders what changed at a level vs the level below, in three categories:
//   adds     → skill gained            (green ↑)
//   resolves → failure modes dropped   (red ↓)
//   terrain  → trail class unlocked    (green ↑)
// One icon per category. `how_to` is deliberately not rendered here — it
// belongs to the Guide's "How to progress" expander.
const escProg = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function progressionStripHTML(prog) {
  if (!prog) return '';

  const row = (kind, icon, color, label, items) => {
    const list = (items || []).filter(Boolean);
    if (!list.length) return '';
    const text = list.map(t => `<span class="prog-item">${escProg(t)}</span>`).join('');
    return `<li class="prog-line prog-line--${kind}">
      <span class="prog-icon" style="color:${color}">${icon}</span>
      <span class="prog-body">
        <span class="prog-label">${label}</span>
        <span class="prog-items">${text}</span>
      </span>
    </li>`;
  };

  const rows = [
    row('adds',     ICON_SKILL_INCREASE,   LV[4], 'Adds',           prog.adds),
    row('resolves', ICON_FAIL_DECREASE,    LV[1], 'Fewer failures', prog.resolves),
    row('terrain',  ICON_TERRAIN_INCREASE, LV[4], 'Terrain',        prog.terrain ? [prog.terrain] : []),
  ].join('');

  if (!rows) return '';
  return `<ul class="prog-strip">${rows}</ul>`;
}

export function scoreChip(label, lv) {
  const unset = !lv;
  const bg = unset ? 'var(--border)' : LV[lv];
  const col = unset ? 'var(--dim)' : '#fff';
  return `<div class="score-chip-wrap">
    <div class="score-chip" style="background:${bg};color:${col}">${unset ? '—' : lv}</div>
    <span class="score-chip-label">${label}</span>
  </div>`;
}
