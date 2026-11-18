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
    if not payload:
        return

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
    (output_dir / "config.js").write_text(
        "window.LIMBA_FIREBASE_CONFIG = " + json.dumps(public_config) + ";\n"
        "window.LUMA_FIREBASE_CONFIG = window.LIMBA_FIREBASE_CONFIG;\n",
        encoding="utf-8",
    )


def main() -> None:
    OUTPUT_DIR.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="web-", dir=OUTPUT_DIR.parent) as temp:
        staged = Path(temp) / "web"
        staged.mkdir()
        for filename in PUBLIC_FILES:
            shutil.copyfile(ROOT / filename, staged / filename)
        for source in sorted((ROOT / "assets" / "limba").rglob("*.png")):
            destination = staged / source.relative_to(ROOT)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)

        apply_public_config(staged)
        preview_builder = staged / "build_preview.py"
        shutil.copyfile(ROOT / preview_builder.name, preview_builder)
        subprocess.run([sys.executable, str(preview_builder)], check=True, cwd=staged)
        preview_builder.unlink()
        (staged / "_preview_combo.js").unlink(missing_ok=True)

        if OUTPUT_DIR.exists():
            shutil.rmtree(OUTPUT_DIR)
        staged.rename(OUTPUT_DIR)
    print(f"Staged Limba web files in {OUTPUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
