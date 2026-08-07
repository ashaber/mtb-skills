// Bundled fallback content — inlined from public/rubric.json at build time via
// the __RUBRIC_DEFAULT_JSON__ define in vite.config.js (fs.readFileSync at
// config-load, not an ES import), so the two can never drift while working
// fully offline before the service worker has installed. A plain
// `import data from '../public/rubric.json'` resolves to a dev-server URL
// under /public/... and trips Vite's "assets in public dir cannot be
// imported from JS" warning — reading the file in vite.config.js instead
// sidesteps that.
//
// public/rubric.json is the single source of truth. Edit it and nothing else.
const data = JSON.parse(__RUBRIC_DEFAULT_JSON__);

export default data;
