import os
import subprocess
import threading
import http.server
import pytest
from playwright.sync_api import sync_playwright

# tests/e2e/conftest.py → tests/e2e → tests → repo root
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = 8765

BROWSERS = [
    pytest.param({'name': 'chromium', 'vp': {'width': 412, 'height': 915}}, id='chromium'),
    pytest.param({'name': 'webkit',   'vp': {'width': 390, 'height': 844}}, id='webkit'),
]


class _Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.join(REPO_ROOT, 'dist'), **kwargs)

    def log_message(self, *args):
        pass  # suppress access log noise


@pytest.fixture(scope='session')
def base_url():
    dist = os.path.join(REPO_ROOT, 'dist')
    if not os.path.exists(os.path.join(dist, 'index.html')):
        subprocess.run(['npm', 'run', 'build'], cwd=REPO_ROOT, check=True)
    httpd = http.server.HTTPServer(('127.0.0.1', PORT), _Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f'http://127.0.0.1:{PORT}'
    httpd.shutdown()


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
        try:
            yield pg
            assert not js_errors, f'Uncaught JS errors: {js_errors}'
        finally:
            ctx.close()
            browser.close()
