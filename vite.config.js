import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the single source of truth (public/rubric.json) at config-load time and
// inline its text via `define`, rather than `import`-ing it from src/rubric-default.js.
// A direct `import data from '../public/rubric.json'` resolves to a dev-server
// URL under /public/... which trips Vite's "assets in public dir cannot be
// imported from JS" warning (see src/rubric-default.js). Reading it here with
// fs avoids that entirely while keeping public/rubric.json as the only place
// content is edited — both the runtime fetch (rubric-content.js -> /rubric.json)
// and this bundled fallback read the same file.
const rubricDefaultJson = fs.readFileSync(path.resolve(__dirname, 'public/rubric.json'), 'utf-8');

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/mtb-skills/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    // CI sets GIT_SHA; local dev/build without it falls back to 'dev' so
    // Settings can always show *something* distinguishing a build.
    __GIT_SHA__: JSON.stringify((process.env.GIT_SHA || 'dev').slice(0, 7)),
    __RUBRIC_DEFAULT_JSON__: JSON.stringify(rubricDefaultJson),
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'rubric.json', 'about.html', 'rubric-reference.md'],
      manifest: {
        name: 'MTB Skills Assessment',
        short_name: 'MTB Skills',
        description: 'Rubric-based skill assessment tool for NICA MTB coaches.',
        display: 'standalone',
        theme_color: '#d94626',
        background_color: '#f4f2ec',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/about\.html$/],
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    // Run unit tests against a controlled, EMPTY VITE_ env so they never
    // depend on a developer's local .env.local (which carries real Supabase
    // creds for the interactive login test). Tests exercising the
    // "configured" path stub these explicitly. Without this, a present
    // .env.local makes the "env unset -> unconfigured" tests (env/auth) fail
    // locally; CI has no .env.local so it was green regardless.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_BACKEND_URL: '',
      VITE_GOOGLE_CLIENT_ID: '',
    },
  },
});
