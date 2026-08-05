import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/mtb-skills/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
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
