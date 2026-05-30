"""
seed_celebrities_from_json.py — Seed directory_celebrities from celebrities_v9.json

Purpose:
    Reads /home/user/workspace/lenzy_v9/data/celebrities_v9.json, upserts each
    celebrity into the directory_celebrities table via Supabase Python SDK
    (supabase-py) using the service role key. Idempotent: dedupes by slug.
    Existing rows are updated if the JSON is newer.

Env vars required:
    SUPABASE_URL               — e.g. https://xxxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY  — service role key (NOT the anon key)

Example invocation:
    SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... \\
        python code/scripts/seed_celebrities_from_json.py

Expected output:
    Loading celebrities from data/celebrities_v9.json...
    Loaded 500 celebrities
    Upserting in batches of 100...
    Batch 1/5: 100 rows → 100 upserted
    ...
    Done. Total: 500 upserted, 0 errors.

Cron schedule: one-shot (run once on initial deployment or data refresh)
"""

from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Env validation
# ---------------------------------------------------------------------------

def assert_env() -> tuple[str, str]:
    """Validate required environment variables. Exits with clear error if missing."""
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    if not url:
        print("ERROR: SUPABASE_URL is not set.", file=sys.stderr)
        sys.exit(1)
    if not url.startswith("https://"):
        print("ERROR: SUPABASE_URL must start with https://", file=sys.stderr)
        sys.exit(1)
    if not key:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY is not set.", file=sys.stderr)
        sys.exit(1)

    return url, key


# ---------------------------------------------------------------------------
# Slug helper (mirrors the slugify() SQL function)
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    """Convert a display name to a URL-safe lowercase slug."""
    # Normalize unicode → ASCII
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    # Replace non-alphanumeric chars with hyphen
    text = re.sub(r"[^a-z0-9]+", "-", text)
    # Strip leading/trailing hyphens
    text = text.strip("-")
    return text or "unknown"


# ---------------------------------------------------------------------------
# JSON to DB row mapping
# ---------------------------------------------------------------------------

def map_celeb_to_row(celeb: dict[str, Any]) -> dict[str, Any]:
    """
    Map a celebrities_v9.json object to a directory_celebrities row.

    Expected input fields (all optional except name and ig_handle):
        name, ig_handle, category, tier, bio, verified, follower_count,
        country, scan_enabled, scan_frequency_hours
    """
    name: str = celeb.get("name", "Unknown")
    ig_handle: str = (celeb.get("ig_handle") or celeb.get("instagram") or "").lstrip("@")
    slug: str = celeb.get("slug") or slugify(name)

    # Determine tier from follower count if not explicit
    follower_count: int = int(celeb.get("follower_count") or celeb.get("followers") or 0)
    tier: int = celeb.get("tier") or (
        1 if follower_count >= 10_000_000
        else 2 if follower_count >= 1_000_000
        else 3
    )

    # Default scan frequency by tier
    scan_frequency_hours: int = celeb.get("scan_frequency_hours") or (
        6 if tier == 1 else 24 if tier == 2 else 72
    )

    return {
        "name": name,
        "ig_handle": ig_handle if ig_handle else None,
        "slug": slug,
        "person_type": "celebrity",
        "tier": tier,
        "scan_enabled": bool(celeb.get("scan_enabled", True if ig_handle else False)),
        "scan_frequency_hours": scan_frequency_hours,
        "last_scanned_at": None,
        "scan_error_count": 0,
        "last_scan_error": None,
        "data": {
            "category": celeb.get("category"),
            "bio": celeb.get("bio"),
            "verified": celeb.get("verified", False),
            "follower_count": follower_count,
            "country": celeb.get("country"),
            "source": "celebrities_v9.json",
        },
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    """Main entry point for celebrity seeding."""
    url, key = assert_env()

    # Import here so the script fails clearly if supabase-py is not installed
    try:
        from supabase import create_client, Client  # type: ignore[import]
    except ImportError:
        print("ERROR: supabase-py is not installed. Run: pip install supabase", file=sys.stderr)
        sys.exit(1)

    # Resolve path to JSON
    script_dir = Path(__file__).parent
    json_path = script_dir.parent.parent / "data" / "celebrities_v9.json"

    if not json_path.exists():
        print(f"ERROR: JSON file not found at {json_path}", file=sys.stderr)
        print("Expected path: /home/user/workspace/lenzy_v9/data/celebrities_v9.json", file=sys.stderr)
        sys.exit(1)

    print(f"Loading celebrities from {json_path}...")

    with open(json_path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    # Support both flat list and { celebrities: [...] } wrapper
    if isinstance(raw, list):
        celebrities: list[dict[str, Any]] = raw
    elif isinstance(raw, dict) and "celebrities" in raw:
        celebrities = raw["celebrities"]
    else:
        print(f"ERROR: Unexpected JSON structure. Expected list or {{celebrities: [...]}}.", file=sys.stderr)
        sys.exit(1)

    print(f"Loaded {len(celebrities)} celebrities")

    # Map to DB rows
    rows = [map_celeb_to_row(c) for c in celebrities]

    # Deduplicate by slug (last write wins within the list)
    seen_slugs: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for row in reversed(rows):
        if row["slug"] not in seen_slugs:
            seen_slugs.add(row["slug"])
            deduped.append(row)
    deduped.reverse()
    print(f"After dedup: {len(deduped)} unique celebrities")

    # Create Supabase client
    db: Client = create_client(url, key)

    # Upsert in batches of 100
    BATCH_SIZE = 100
    total_upserted = 0
    total_errors = 0
    total_batches = (len(deduped) + BATCH_SIZE - 1) // BATCH_SIZE

    print(f"Upserting in batches of {BATCH_SIZE}...")

    for batch_num in range(total_batches):
        batch = deduped[batch_num * BATCH_SIZE : (batch_num + 1) * BATCH_SIZE]
        print(f"Batch {batch_num + 1}/{total_batches}: {len(batch)} rows...", end=" ", flush=True)

        try:
            result = (
                db.table("directory_celebrities")
                .upsert(batch, on_conflict="slug")
                .execute()
            )

            upserted = len(result.data) if result.data else len(batch)
            total_upserted += upserted
            print(f"→ {upserted} upserted")

        except Exception as exc:
            total_errors += len(batch)
            print(f"→ ERROR: {exc}", file=sys.stderr)

    print(f"\nDone. Total: {total_upserted} upserted, {total_errors} errors.")

    if total_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
