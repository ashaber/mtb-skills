import { defineConfig } from 'vite';

export default defineConfig({
  // Use /mtb-skills/ base only for GitHub Pages deployment; '/' everywhere else.
  base: process.env.GITHUB_PAGES ? '/mtb-skills/' : '/',
  test: {
    environment: 'jsdom',
  },
});
