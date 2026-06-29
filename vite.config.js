import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/mtb-skills/' : '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'rubric.json', 'about.html'],
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
  },
});
