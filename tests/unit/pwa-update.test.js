import { describe, it, expect } from 'vitest';
import { initPwaUpdate } from '../../src/pwa-update.js';

// Vitest runs with import.meta.env.PROD === false (mode 'test'), and the
// 'virtual:pwa-register' module only exists under the VitePWA plugin
// transform — neither is present here. This proves the guard: no throw,
// no boot crash, no toast rendered.
describe('initPwaUpdate() — dev/test guard', () => {
  it('resolves without throwing and renders no toast outside a production build', async () => {
    await expect(initPwaUpdate()).resolves.toBeUndefined();
    expect(document.getElementById('pwa-update-toast')).toBeNull();
  });
});
