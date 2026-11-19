#!/usr/bin/env python3
"""Compare currently active Limba rules with this checkout, without printing rule contents."""

import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
PROJECT = "limba-auto"
ORIGIN = "https://firebaserules.googleapis.com/v1"
RELEASES = {
    "firestore.rules": "cloud.firestore",
    "storage.rules": "firebase.storage/limba-auto.firebasestorage.app",
}


def get_resource(path, token):
    request = Request(ORIGIN + "/" + path, headers={"Authorization": "Bearer " + token})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-drift", action="store_true", help="Report differences without failing.")
    parser.add_argument("--service", choices=("all", "firestore", "storage"), default="all")
    args = parser.parse_args()
    token = os.environ.get("GOOGLE_OAUTH_ACCESS_TOKEN", "")
    if not token:
        parser.error("Set GOOGLE_OAUTH_ACCESS_TOKEN through the authenticated Google CLI or workflow.")

    matched = True
    for filename, service in RELEASES.items():
        if args.service != "all" and filename != args.service + ".rules":
            continue
        release_path = f"projects/{PROJECT}/releases/{service}"
        try:
            release = get_resource(release_path, token)
            ruleset_path = release["rulesetName"]
            if not ruleset_path.startswith(f"projects/{PROJECT}/rulesets/"):
                raise ValueError("Unexpected ruleset project")
            files = get_resource(ruleset_path, token)["source"]["files"]
            local_hash = sha256((ROOT / filename).read_bytes()).hexdigest()
            # A differently named single-file ruleset can still have identical source text.
            same = len(files) == 1 and sha256(files[0]["content"].encode()).hexdigest() == local_hash
            matched &= same
            print(f"{filename} {'matches' if same else 'differs'} ({ruleset_path})")
        except HTTPError as error:
            raise SystemExit(f"{filename} could not be compared (HTTP {error.code}).") from None
        except (URLError, KeyError, ValueError):
            raise SystemExit(f"{filename} could not be compared.") from None
    return 0 if matched or args.allow_drift else 1


if __name__ == "__main__":
    raise SystemExit(main())
