#!/usr/bin/env python3
"""Prepare PUBLIC Limba client configuration; never accepts service-account keys."""
import argparse
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def create_configs(web_path: Path, android_path: Path):
    web = json.loads(web_path.read_text(encoding="utf-8"))
    required = ("apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId")
    if not all(isinstance(web.get(k), str) and web[k].strip() for k in required):
        raise SystemExit("Web JSON needs: " + ", ".join(required))
    if "private_key" in web or "client_email" in web:
        raise SystemExit("Service-account JSON must never be used here.")
    web = {k: web[k] for k in required}
    android = json.loads(android_path.read_text(encoding="utf-8"))
    if "project_info" in android:
        info = android["project_info"]
        clients = android.get("client", [])
        apps = [c for c in clients if c.get("client_info", {})
                .get("android_client_info", {}).get("package_name") == "ch.luma.auto"]
        if not apps:
            raise SystemExit("Android app 'ch.luma.auto' is missing in google-services.json")
        client = apps[0]
        android = {
            "apiKey": client["api_key"][0]["current_key"],
            "appId": client["client_info"]["mobilesdk_app_id"],
            "projectId": info["project_id"],
            "storageBucket": info.get("storage_bucket", ""),
            "messagingSenderId": info.get("project_number", ""),
        }
    if not all(android.get(k) for k in ("apiKey", "appId", "projectId")):
        raise SystemExit("Android JSON must contain apiKey, appId, projectId.")
    if web["projectId"] != android["projectId"]:
        raise SystemExit("Web and Android must belong to the same Firebase project.")
    if "private_key" in android:
        raise SystemExit("Service-account JSON must never be used here.")
    android = {k: android.get(k, "") for k in ("apiKey", "appId", "projectId", "storageBucket", "messagingSenderId")}
    (ROOT / "config.js").write_text(
        "/* PUBLIC Limba Firebase client configuration */\n"
        "window.LIMBA_FIREBASE_CONFIG = " + json.dumps(web, ensure_ascii=False, indent=2) + ";\n"
        "window.LUMA_FIREBASE_CONFIG = window.LIMBA_FIREBASE_CONFIG;\n",
        encoding="utf-8",
    )
    (ROOT / "android/app/src/main/assets/firebase-config.json").write_text(
        json.dumps(android, indent=2) + "\n", encoding="utf-8"
    )
    print("Configured Limba Web and Android locally.")
    print("GitHub Actions > Settings > Secrets and variables > Actions > New repository secret:")
    for name, conf in (("LIMBA_WEB_CONFIG_B64", web), ("LIMBA_ANDROID_CONFIG_B64", android)):
        raw = json.dumps(conf, separators=(",", ":")).encode()
        print(name + " = " + base64.b64encode(raw).decode())
    print("No service-account key or administrator token is required.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("web", type=Path, help="Web firebaseConfig object saved as JSON")
    parser.add_argument("android", type=Path, help="Downloaded Android google-services.json")
    opts = parser.parse_args()
    create_configs(opts.web, opts.android)
