# Navigation & Flow Spec — implementation

> Redesign goal: one consistent navigation system, mapped to the practice-day
> usage model. Visual language (Barlow Condensed + warm paper + functional level
> colors) is unchanged — only the chrome and motion are new.
> Companion CSS: `components.css` (drop into `index.html` <style> or import).
> Human reference (mockups + rationale): `Flow Spec.html`.

## The model — three tiers, three gestures

Every screen is one of three things. Each tier has ONE entrance animation and ONE
fixed place for its controls.

| Tier | What | Enter | Controls |
|---|---|---|---|
| **1 · Tabs** | Roster · Practice · Guide · Settings (peers) | fade 180ms | fixed bottom bar |
| **2 · Drill-in** | rider / coach card | slide from right 280ms (roster parallaxes left) | topbar: `← · title · ⋯` |
| **3 · Sheet** | rubric-from-card, add/edit, settings, share, scan, safety | slide up 300ms | grip + `✕` |

Render each tier into its own container so they coexist during transitions:
- `#app` → active tab screen
- `#stack` → drill-in layers
- `#scrim` + `#sheet` → sheets

Today `draw()` overwrites `#app.innerHTML` for all three views — that is why
transitions are impossible. Splitting the containers is the key change.

## Usage model (why the tabs are what they are)

Practice flow → surface:
- **Plan** (before) → Practice tab
- **Gather** (attendance, trades) → Roster tab, check-mode
- **Ride** (assess) → Roster row quick-record + Rider card + Guide
- **Reflect** (after) → Card notes + Practice tab

## Where today's controls move

| Today | Becomes |
|---|---|
| Book icon → Field Guide | **Guide** tab |
| Gear icon → Settings | **Settings** tab |
| Clipboard → attendance | **Practice** tab + roster check-mode |
| Scan icon → trade-in | roster header action (roster-contextual) |
| `+ Add` FAB | roster header action (top-right) |
| Card topbar: obs count, edit, share, delete | obs count → hero; edit/share/delete → `⋯` overflow |

## Motion — CSS (in components.css)

```css
/* TIER 2 — drill-in card lives in #stack, starts off-screen right */
.layer   { position:fixed; inset:0; max-width:412px; margin:0 auto;
           background:var(--bg); z-index:30; display:flex; flex-direction:column;
           transform:translateX(100%);
           transition:transform .28s cubic-bezier(.32,.72,0,1); }
.layer--in { transform:translateX(0); }          /* add next frame to animate in */
#app.is-pushed { transform:translateX(-18%);     /* roster parallax beneath */
           transition:transform .28s cubic-bezier(.32,.72,0,1); }

/* TIER 3 — sheet lifts from bottom, scrim fades */
.sheet     { transform:translateX(-50%) translateY(100%);
             transition:transform .3s cubic-bezier(.32,.72,0,1); }
.sheet--in { transform:translateX(-50%) translateY(0); }
.scrim     { opacity:0; transition:opacity .3s ease; }
.scrim--in { opacity:1; }
```

Honor `prefers-reduced-motion`: skip the `--in` delay, present final state.

## Nav stack — new file `src/nav.js`

History-aware so the hardware/browser back button unwinds one layer at a time.

```js
// One source of truth for what's stacked over the active tab.
// stack entries: { type:'layer'|'sheet', render, onClose }
const stack = [];

export function pushLayer(render) { _push({ type:'layer', render }); }
export function pushSheet(render) { _push({ type:'sheet', render }); }

function _push(entry) {
  stack.push(entry);
  history.pushState({ depth: stack.length }, '');   // one history entry per layer
  _mount(entry);                                    // render + animate --in next frame
}

export function pop() {                             // back btn, ✕, ‹ Roster, scrim tap
  if (!stack.length) return false;
  const entry = stack.pop();
  _unmount(entry);                                  // remove --in → transitionend → detach
  return true;
}

// hardware/browser back: unwind exactly one layer, else let tab nav handle it
window.addEventListener('popstate', () => { if (stack.length) pop(); });
```

`_mount` / `_unmount`: create the `.layer` / `.scrim`+`.sheet` nodes, set
`innerHTML` from `render()`, add `--in` on `requestAnimationFrame`, and on close
remove `--in` then detach on `transitionend`. Toggle `#app.is-pushed` when a
layer is the top entry.

Routing:
- `go-card` → `pushLayer(() => viewCard(s))`
- skill-block rubric link → `pushSheet(() => viewRubric(s, { sheet:true }))`
- `go-roster` / topbar back / modal `✕` / scrim tap → `pop()`
- tab taps → `draw()` on `#app` directly (base, not stacked)
- remove the `'card'` / `'rubric'` branches from the old `s.view` switch

## Implementation order (app stays runnable after each step)

1. **Paste `components.css`** into `index.html` <style>. Add `<div id="stack">`,
   `<div id="scrim">`, `<div id="sheet">` to body. Set `#app{padding-bottom:76px}`.
2. **Tab bar**: mount once outside the per-view render. New `s.tab` =
   `roster|practice|guide|settings`; `draw()` renders active tab into `#app`.
   Move `go-rubric` + `open-settings` off the roster header.
3. **Add `src/nav.js`**; route handlers as above; delete `card`/`rubric` from the
   `s.view` switch.
4. **Card topbar** → `.topbar` + `.overflow-menu` in `viewCard()`. Move
   `${totalObs} obs` into `.card-hero-meta`. Keep all existing `data-a` actions —
   only their position changes.
5. **Dual-mode rubric**: `viewRubric(s, {sheet})` — full screen for Guide tab,
   sheet body when opened from a skill block (open at `s.rubricSkill`).
6. **Attendance in place**: replace `attendance_mode` full-screen header with
   `s.taking_attendance` on the roster — render the check column + `.attend-bar`,
   add `.row-card--present`, keep the present-sort. Enter from Practice tab;
   surface the day's count as the Practice `.tab-badge`.
7. **Convert remaining modals** (add/edit, settings, share, scan, safety) to the
   shared `.sheet` shell via `pushSheet`. Inner markup unchanged.

## The one test

A coach should answer "where is X?" the same way every time:
**destinations are on the bottom bar, a rider is a slide-in, a lookup or form is a
sheet, and back always means back.** If a new feature can't be placed by that
sentence, the placement is wrong — not the sentence.
