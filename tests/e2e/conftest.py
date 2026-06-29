import os
import subprocess
import threading
import http.server
import pytest
from playwright.sync_api import sync_playwright

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
            # WebKit rejects SW registration on plain HTTP (expected in test env)
            real_errors = [e for e in js_errors if 'sw.js load failed' not in e]
            assert not real_errors, f'Uncaught JS errors: {real_errors}'
        finally:
            ctx.close()
            browser.close()
