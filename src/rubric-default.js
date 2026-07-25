// Bundled fallback content — imported straight from public/rubric.json so the
// two can never drift. Vite inlines the JSON at build time, which is what lets
// the app work offline before the service worker has installed.
//
// public/rubric.json is the single source of truth. Edit it and nothing else.
import data from '../public/rubric.json';

export default data;
