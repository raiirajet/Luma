"""Verify the CSP and normal website startup in the staged Pages build."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright


root = Path(__file__).resolve().parents[1]
config = json.loads((root / "firebase.json").read_text(encoding="utf-8"))
headers = {
    item["key"]: item["value"]
    for entry in config["hosting"]["headers"] if entry["source"] == "**"
    for item in entry["headers"]
}
policy = headers["Content-Security-Policy"]
assert "frame-ancestors 'none'" in policy
assert "'unsafe-inline'" not in policy
assert "'unsafe-eval'" not in policy
assert headers["X-Frame-Options"] == "DENY"

handler = partial(SimpleHTTPRequestHandler, directory=root / "dist" / "web")
with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server, sync_playwright() as playwright:
    threading.Thread(target=server.serve_forever, daemon=True).start()
    browser = playwright.chromium.launch()
    loading = browser.new_page()
    loading.route("**/app.js", lambda route: route.abort())
    loading.goto(f"http://127.0.0.1:{server.server_port}/", wait_until="domcontentloaded")
    assert loading.locator("#carGrid .car-skeleton").count() == 3
    assert loading.locator("#emptyResults").is_hidden()
    loading.close()
    page = browser.new_page()
    page.route("**/config.js", lambda route: route.fulfill(
        content_type="text/javascript", body="window.LIMBA_FIREBASE_CONFIG = null;"
    ))
    page.route("https://upload.wikimedia.org/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script("""
        window.violations = [];
        document.addEventListener('securitypolicyviolation', event => {
          window.violations.push(event.effectiveDirective);
        });
    """)
    page.goto(f"http://127.0.0.1:{server.server_port}/", wait_until="domcontentloaded")
    page.locator("#retryListings").wait_for(state="visible")
    assert page.locator("#emptyResults").is_hidden()
    page.locator("#loginBtn").click()
    page.locator("#accountOpenBtn").click()
    assert page.locator("#authEmail").get_attribute("type") == "email"
    assert page.locator("#demoQuick, [data-i18n='singleDemoNotice']").count() == 0
    assert not errors, errors
    assert page.evaluate("window.violations") == []
    page.evaluate("""
        const inline = document.createElement('script');
        inline.textContent = "document.body.dataset.inlineScriptRan = 'yes'";
        document.body.append(inline);
    """)
    page.wait_for_function("window.violations.includes('script-src-elem')")
    assert page.locator("body").get_attribute("data-inline-script-ran") is None
    browser.close()
    server.shutdown()

print("PASS: staged Limba site loads under CSP and blocks inline scripts")
