"""Verify the CSP and normal website startup in the staged Pages build."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.parse import urlsplit

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
    site = f"http://127.0.0.1:{server.server_port}/"
    browser = playwright.chromium.launch()
    loading = browser.new_page()
    loading.route("**/app.js", lambda route: route.abort())
    loading.goto(site, wait_until="domcontentloaded")
    assert loading.locator("#carGrid .car-skeleton").count() == 3
    assert loading.locator("#emptyResults").is_hidden()
    loading.close()
    page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    requests = []
    page.on("request", lambda request: requests.append(urlsplit(request.url).path))
    # Model a browser holding incompatible responses at the former stable URLs.
    for asset in ("app.js", "styles.css", "release-i18n.js"):
        page.route(site + asset, lambda route: route.abort())
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
    page.goto(site, wait_until="domcontentloaded")
    page.locator("#retryListings").wait_for(state="visible")
    assert page.locator("#emptyResults").is_hidden()

    release_paths = []
    for asset in ("app.js", "styles.css", "release-i18n.js"):
        assert f"/{asset}" not in requests, requests
        loaded = [path for path in requests if path.endswith(f"/{asset}")]
        assert len(loaded) == 1 and loaded[0].startswith("/web-assets/"), loaded
        release_paths.append(loaded[0].rsplit("/", 1)[0])
    assert len(set(release_paths)) == 1, release_paths

    advanced = page.locator("#advancedFilters")
    page.locator("#advancedToggle").tap()
    assert advanced.is_visible()
    page.locator("#advancedToggle").tap()
    assert advanced.is_hidden()
    page.locator("#resultFilter").tap()
    assert advanced.is_visible()
    page.locator("#fuel").select_option("electric")
    assert page.locator("#activeFilters [data-filter-remove=fuel]").is_visible()
    page.locator("#clearAll").tap()
    assert page.locator("#fuel").input_value() == ""
    assert page.locator("#activeFilters").is_hidden()
    page.locator("#keyword").fill("Golf")
    page.locator("#saveSearchBtn").tap()
    page.locator("#savedSearchesList [data-apply]").wait_for(state="attached")
    sort = page.locator("#sort")
    assert sort.locator("option").count() >= 2
    sort.select_option("priceLow")
    assert sort.input_value() == "priceLow"

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
