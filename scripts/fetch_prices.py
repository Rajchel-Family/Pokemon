#!/usr/bin/env python3
"""Fetch Base Set card prices from pkmnprices and write prices.json."""
import json, os, time, urllib.request, urllib.error
from datetime import datetime, timezone

API_KEY = os.environ["PKMN_API_KEY"]
BASE_URL = "https://api.pkmnprices.com/v1"
SET_ID = 463  # Base Set
TOTAL_CARDS = 102
COND_MAP = {
    "Near Mint": "nm",
    "Lightly Played": "lp",
    "Moderately Played": "mp",
}


def get(path):
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        headers={"X-API-Key": API_KEY, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def fetch_all():
    prices = {}
    for num in range(1, TOTAL_CARDS + 1):
        try:
            # Step 1: resolve card ID
            data = get(f"/cards?set_id={SET_ID}&number={num}&per_page=1")
            if not data.get("data"):
                print(f"  #{num}: not found in set, skipping")
                prices[str(num)] = {}
                continue
            card_id = data["data"][0]["id"]

            # Step 2: fetch prices
            detail = get(f"/cards/{card_id}")
            p = {}
            for entry in detail.get("prices", []):
                key = COND_MAP.get(entry["condition"])
                if key and key not in p and entry.get("market_price") is not None:
                    p[key] = entry["market_price"]
            prices[str(num)] = p
            print(f"  #{num} ({detail['name']}): {p}")
        except urllib.error.URLError as e:
            print(f"  #{num}: network error — {e}")
            prices[str(num)] = {}
        except Exception as e:
            print(f"  #{num}: error — {e}")
            prices[str(num)] = {}

        time.sleep(0.15)  # stay well under 60 req/min rate limit

    return prices


def main():
    print("Fetching Base Set prices…")
    prices = fetch_all()
    output = {
        "updated": datetime.now(timezone.utc).isoformat(),
        "set": "Base Set",
        "cards": prices,
    }
    out_path = os.path.join(os.path.dirname(__file__), "..", "prices.json")
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
