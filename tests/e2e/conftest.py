import os
import subprocess
import threading
import time
import http.server
import pytest
from playwright.sync_api import Page, sync_playwright

# Repo root = directory containing pytest.ini; pytest sets config.rootpath to it automatically.
BROWSERS = [
    pytest.param({'name': 'chromium', 'vp': {'width': 412, 'height': 915}}, id='chromium'),
    pytest.param({'name': 'webkit',   'vp': {'width': 390, 'height': 844}}, id='webkit'),
]


def _repo_root(config: pytest.Config) -> str:
    return str(config.rootpath)


class _Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, root: str, **kwargs):
        super().__init__(*args, directory=os.path.join(root, 'dist'), **kwargs)

    def log_message(self, *args) -> None:
        pass


@pytest.fixture(scope='session')
def base_url(pytestconfig: pytest.Config) -> str:
    root = _repo_root(pytestconfig)
    dist = os.path.join(root, 'dist')
    subprocess.run(['npm', 'run', 'build'], cwd=root, check=True)

    def handler_factory(*args, **kwargs):
        return _Handler(*args, root=root, **kwargs)

    httpd = http.server.HTTPServer(('127.0.0.1', 0), handler_factory)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f'http://127.0.0.1:{port}'
    httpd.shutdown()


def reload_and_wait(pg: Page) -> None:
    """`page.reload()`, hardened against two real Playwright-WebKit-on-Linux-
    CI flake patterns (both observed repeatedly in CI, never on chromium):

    1. `reload()` itself occasionally throws "WebKit encountered an
       internal error" -- a driver-level hiccup, not a real navigation
       failure (retrying the exact same reload immediately succeeds).
       Playwright's WebKit build is a Linux-CI proxy for iOS Safari, not
       the shipped Apple binary, and is known to be less mature under
       automation than its Chromium build -- this is that surfacing, not
       evidence of a bug a real iOS user would hit.
    2. Even when `reload()` itself succeeds, the app can still be mid-boot
       when the next Playwright action fires -- trusting `reload()`'s
       return as "the app is ready" is the actual race. Wait for a
       concrete signal (the tab bar, always present post-boot regardless
       of which tab) instead of assuming.

    Used by the `page` fixture below for its own post-seed reload; call
    this directly (instead of a bare `page.reload()`) in any test that
    reloads mid-test, for the same protection.
    """
    for attempt in range(3):
        try:
            pg.reload()
            break
        except Exception as e:
            if attempt == 2 or 'internal error' not in str(e).lower():
                raise
            time.sleep(0.5)
    pg.wait_for_selector('[data-a="switch-tab"]', state='visible', timeout=15000)


@pytest.fixture(params=BROWSERS)
def page(request, base_url: str):
    cfg = request.param
    with sync_playwright() as pw:
        try:
            browser = getattr(pw, cfg['name']).launch()
        except Exception as e:
            pytest.skip(f'{cfg["name"]} unavailable in this environment: {e}')
        ctx = browser.new_context(viewport=cfg['vp'])
        pg = ctx.new_page()
        js_errors: list[str] = []
        pg.on('pageerror', lambda e: js_errors.append(str(e)))
        pg.goto(base_url)
        # Pre-seed a coach profile so the first-launch onboarding sheet never
        # appears and blocks pointer events in tests, then reload so the app
        # boots cleanly with the coach in storage (avoids add_init_script, which
        # breaks WebKit's dynamic module imports).
        pg.evaluate("""() => {
            localStorage.setItem('mtb_coach', JSON.stringify({
                id: 'test-coach', name: 'Test Coach',
                role: 'coach', team_id: 'test-team'
            }));
        }""")
        reload_and_wait(pg)
        try:
            yield pg
            # WebKit rejects SW/module loading on plain HTTP (expected in test
            # env; production is HTTPS). The vite-plugin-pwa `virtual:pwa-register`
            # path surfaces the same block under WebKit's "access control checks"
            # message, so it's filtered alongside the older SW-load wording.
            real_errors = [e for e in js_errors
                           if 'sw.js load failed' not in e
                           and 'Importing a module script failed' not in e
                           and 'due to access control checks' not in e]
            assert not real_errors, f'Uncaught JS errors: {real_errors}'
        finally:
            ctx.close()
            browser.close()
