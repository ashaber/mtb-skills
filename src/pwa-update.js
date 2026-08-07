/**
 * src/pwa-update.js — user-visible "new version available" nudge.
 *
 * VitePWA is `registerType: 'autoUpdate'` (vite.config.js), which already
 * swaps in a new service worker silently in the background. This module adds
 * a small, non-blocking toast on top of that so a coach mid-practice isn't
 * silently running stale JS for the rest of the session without knowing a
 * reload would pick up the update.
 *
 * Strictly additive and defensive:
 * - No-ops entirely outside a production build (`import.meta.env.PROD`) —
 *   never runs under `npm run dev` or Vitest.
 * - The `virtual:pwa-register` import is dynamic and wrapped in try/catch —
 *   if it doesn't exist (no PWA plugin transform, e.g. a non-Vite test
 *   runner) or registration throws for any reason, this is a logged no-op,
 *   never a boot crash.
 */
import log from './log.js';

let _updateSW = null;

function showUpdateToast() {
  if (document.getElementById('pwa-update-toast')) return; // already showing
  const el = document.createElement('div');
  el.id = 'pwa-update-toast';
  el.className = 'pwa-update-toast';
  el.textContent = 'New version available — tap to reload';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.addEventListener('click', () => _updateSW?.(true));
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') _updateSW?.(true);
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('pwa-update-toast--show'));
}

export async function initPwaUpdate() {
  if (!import.meta.env.PROD) return;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    _updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        log.info('pwa.update_available');
        showUpdateToast();
      },
      onOfflineReady() {
        log.info('pwa.offline_ready');
      },
      onRegisterError(err) {
        log.warn('pwa.register_error', { error: String(err) });
      },
    });
  } catch (err) {
    // 'virtual:pwa-register' not resolvable, or registration threw —
    // the app must still boot normally either way.
    log.warn('pwa.register_failed', { error: String(err) });
  }
}
