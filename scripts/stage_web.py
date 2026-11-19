#!/usr/bin/env python3
"""Build the public Limba static site for GitHub Pages and Firebase Hosting."""

import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "dist" / "web"
PUBLIC_FILES = (
    "index.html",
    "styles.css",
    "config.js",
    "app.js",
    "car-brands.js",
    "cars-i18n.js",
    "feature-i18n.js",
    "i18n.js",
    "icons.js",
    "limba-lux.js",
    "limba-lux-ui.js",
    "limba-market-ui.js",
    "limba-dealer-ui.js",
    "mvp-i18n.js",
    "release-i18n.js",
    "search-filters-i18n.js",
    "translations-extra.js",
    "apple-touch-icon.png",
    "favicon.png",
    "favicon.svg",
)
PUBLIC_CONFIG_KEYS = (
    "apiKey",
    "authDomain",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId",
)


def apply_public_config(output_dir: Path) -> None:
    payload = os.environ.get("LIMBA_WEB_CONFIG_B64")
    recaptcha_key = os.environ.get("LIMBA_RECAPTCHA_ENTERPRISE_SITE_KEY", "").strip()
    config_path = output_dir / "config.js"
    if payload:
        try:
            config = json.loads(base64.b64decode("".join(payload.split()), validate=True))
        except (ValueError, UnicodeError):
            raise SystemExit("Invalid Limba web client configuration") from None
        if not isinstance(config, dict) or not all(
            isinstance(config.get(key), str) and config[key].strip()
            for key in PUBLIC_CONFIG_KEYS
        ):
            raise SystemExit("Invalid Limba web client configuration")

        public_config = {key: config[key] for key in PUBLIC_CONFIG_KEYS}
        config_path.write_text(
            "window.LIMBA_FIREBASE_CONFIG = " + json.dumps(public_config) + ";\n"
            "window.LUMA_FIREBASE_CONFIG = window.LIMBA_FIREBASE_CONFIG;\n",
            encoding="utf-8",
        )
    if recaptcha_key:
        with config_path.open("a", encoding="utf-8") as file:
            file.write(
                "window.LIMBA_FIREBASE_CONFIG.recaptchaEnterpriseSiteKey = "
                + json.dumps(recaptcha_key) + ";\n"
            )


def main() -> None:
    OUTPUT_DIR.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="web-", dir=OUTPUT_DIR.parent) as temp:
        staged = Path(temp) / "web"
        staged.mkdir()
        for filename in PUBLIC_FILES:
            destination = staged / filename
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / filename, destination)
        for source in sorted((ROOT / "assets" / "limba").rglob("*.png")):
            destination = staged / source.relative_to(ROOT)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)

        apply_public_config(staged)
        preview_builder = staged / "build_preview.py"
        shutil.copyfile(ROOT / preview_builder.name, preview_builder)
        subprocess.run([sys.executable, str(preview_builder)], check=True, cwd=staged)
        preview_builder.unlink()
        config = json.loads((ROOT / "firebase.json").read_text(encoding="utf-8"))
        headers = next(entry["headers"] for entry in config["hosting"]["headers"] if entry["source"] == "**")
        policy = next(header["value"] for header in headers if header["key"] == "Content-Security-Policy")
        meta_policy = policy.partition("; frame-ancestors")[0]
        index = staged / "index.html"
        html = index.read_text(encoding="utf-8")
        index.write_text(html.replace(
            '<meta charset="utf-8">',
            '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="' + meta_policy + '">',
            1,
        ), encoding="utf-8")
        (staged / "_preview_combo.js").unlink(missing_ok=True)

        if OUTPUT_DIR.exists():
            shutil.rmtree(OUTPUT_DIR)
        staged.rename(OUTPUT_DIR)
    print(f"Staged Limba web files in {OUTPUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
