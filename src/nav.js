/**
 * src/nav.js — three-tier navigation stack.
 * Tier 2: layers (drill-in, slide from right) → #stack
 * Tier 3: sheets (bottom sheets) → #scrim + #sheet
 * history.pushState tracks depth; browser/hardware back unwinds one level.
 */

const _stack = [];
let _sheetGen = 0;

const _app    = () => document.getElementById('app');
const _stackEl = () => document.getElementById('stack');
const _scrim  = () => document.getElementById('scrim');
const _sheetEl = () => document.getElementById('sheet');

export function pushLayer(render) {
  const entry = { type: 'layer', render };
  _stack.push(entry);
  history.pushState({ depth: _stack.length }, '');
  _mountLayer(entry);
}

export function pushSheet(render) {
  const entry = { type: 'sheet', render };
  _stack.push(entry);
  history.pushState({ depth: _stack.length }, '');
  _mountSheet(entry);
}

export function pop() {
  if (!_stack.length) return false;
  const entry = _stack.pop();
  if (entry.type === 'layer') _unmountLayer(entry);
  else _unmountSheet();
  return true;
}

export function clearStack() {
  _stack.length = 0;
  _stackEl().innerHTML = '';
  const sheet = _sheetEl();
  sheet.classList.remove('sheet--in');
  sheet.innerHTML = '';
  _scrim().classList.remove('scrim--in');
  _app().classList.remove('is-pushed');
}

export function stackDepth() { return _stack.length; }

export function refreshTopLayer(render) {
  const top = _stackEl().lastElementChild;
  if (top) top.innerHTML = render();
}

function _mountLayer(entry) {
  const el = document.createElement('div');
  el.className = 'layer';
  el.innerHTML = entry.render();
  entry.el = el;
  _stackEl().appendChild(el);
  requestAnimationFrame(() => el.classList.add('layer--in'));
  _app().classList.add('is-pushed');
}

function _unmountLayer(entry) {
  const el = entry.el;
  el.classList.remove('layer--in');
  if (!_stack.some(e => e.type === 'layer')) {
    _app().classList.remove('is-pushed');
  }
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

function _mountSheet(entry) {
  _sheetGen++;  // cancel any pending cleanup from a previous unmount
  const sheet = _sheetEl();
  const scrim = _scrim();
  sheet.innerHTML = `<div class="sheet-grip"></div><div class="sheet-scroll">${entry.render()}</div>`;
  scrim.classList.add('scrim--in');
  requestAnimationFrame(() => sheet.classList.add('sheet--in'));
}

function _unmountSheet() {
  const gen   = ++_sheetGen;
  const sheet = _sheetEl();
  const scrim = _scrim();
  sheet.classList.remove('sheet--in');
  scrim.classList.remove('scrim--in');
  sheet.addEventListener('transitionend', () => {
    if (_sheetGen === gen) sheet.innerHTML = '';
  }, { once: true });
}

window.addEventListener('popstate', () => {
  if (_stack.length) pop();
});
