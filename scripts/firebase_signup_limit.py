#!/usr/bin/env python3
"""Read or set the temporary per-IP signup quota of Limba Firebase Authentication."""

import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


CONFIG_URL = "https://identitytoolkit.googleapis.com/admin/v2/projects/limba-auto/config"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rate", type=int, help="Signups per hour per IP.")
    parser.add_argument("--hours", type=int, help="Duration of the temporary override.")
    args = parser.parse_args()
    if (args.rate is None) != (args.hours is None):
        parser.error("Set both --rate and --hours to update the quota.")
    if args.rate is not None and (not 1 <= args.rate <= 100 or args.hours < 1):
        parser.error("Set a rate from 1 to 100 and a positive duration.")
    token = os.environ.get("GOOGLE_OAUTH_ACCESS_TOKEN", "")
    if not token:
        parser.error("Set GOOGLE_OAUTH_ACCESS_TOKEN through the authenticated Google CLI.")

    headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
    url, payload, method = CONFIG_URL, None, "GET"
    if args.rate is not None:
        method = "PATCH"
        url += "?updateMask=quota.signUpQuotaConfig"
        start = (datetime.now(timezone.utc) + timedelta(minutes=2)).replace(microsecond=0)
        payload = json.dumps({"quota": {"signUpQuotaConfig": {
            "quota": str(args.rate),
            "startTime": start.isoformat().replace("+00:00", "Z"),
            "quotaDuration": f"{args.hours * 3600}s",
        }}}).encode()
    request = Request(url, data=payload, method=method, headers=headers)
    try:
        with urlopen(request, timeout=30) as response:
            config = json.load(response)
    except HTTPError as error:
        raise SystemExit(f"Signup quota request failed (HTTP {error.code}).") from None
    except URLError:
        raise SystemExit("The Google Identity Toolkit API could not be reached.") from None
    quota = config.get("quota", {}).get("signUpQuotaConfig")
    print(json.dumps(quota or {"temporaryOverride": None}, indent=2))


if __name__ == "__main__":
    main()
