"""
seed_companies_from_v9.py — Seed tracked_brands from companies_v9.json

Purpose:
    Reads /home/user/workspace/lenzy_v9/data/companies_v9.json, upserts each
    company into the tracked_brands table via Supabase Python SDK (supabase-py)
    using the service role key. Idempotent: dedupes by handle. Existing rows
    are updated if the JSON data is present.

Env vars required:
    SUPABASE_URL               — e.g. https://xxxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY  — service role key

Example invocation:
    SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... \\
        python code/scripts/seed_companies_from_v9.py

Expected output:
    Loading companies from data/companies_v9.json...
    Loaded 3068 companies
    After dedup: 3041 unique handles
    Upserting in batches of 100...
    Batch 1/31: 100 rows → 100 upserted
    ...
    Done. Total: 3041 upserted, 0 errors.

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
    """Validate required environment variables."""
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
# Slug helper
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    """Convert display name to URL-safe lowercase slug."""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "unknown"


# ---------------------------------------------------------------------------
# JSON to DB row mapping
# ---------------------------------------------------------------------------

def map_company_to_row(company: dict[str, Any]) -> dict[str, Any]:
    """
    Map a companies_v9.json object to a tracked_brands row.

    The companies_v9.json schema (from the clean v9 pass) includes:
        id, uuid, handle, name, aliases, country, iso_alpha2, region,
        category, tier, ownership, employee_count, founded_year, website,
        ig_handle, description, is_active, ...
    """
    name: str = company.get("name", "Unknown")
    handle: str = (company.get("handle") or company.get("ig_handle") or slugify(name)).lstrip("@")
    slug: str = company.get("slug") or slugify(name)

    # Sanitize numeric fields — v8 had some fabricated values marked as unverified
    employee_count: int | None = company.get("employee_count")
    if isinstance(employee_count, str):
        try:
            employee_count = int(employee_count.replace(",", ""))
        except (ValueError, AttributeError):
            employee_count = None

    founded_year: int | None = company.get("founded_year") or company.get("founded")
    if founded_year and (founded_year < 1800 or founded_year > 2030):
        founded_year = None

    return {
        "handle": handle,
        "slug": slug,
        "name": name,
        "aliases": company.get("aliases") or [],
        "category": company.get("category") or company.get("type"),
        "region": company.get("region"),
        "country": company.get("country"),
        "iso_alpha2": company.get("iso_alpha2"),
        "tier": company.get("tier") or 3,
        "ownership": company.get("ownership"),
        "employee_count": employee_count,
        "founded_year": founded_year,
        "website": company.get("website"),
        "ig_handle": company.get("ig_handle") or handle,
        "description": company.get("description"),
        "is_active": bool(company.get("is_active", True)),
        "scan_enabled": bool(company.get("scan_enabled", True)),
        "data": {
            "source": "companies_v9.json",
            "original_id": company.get("id"),
            "uuid": company.get("uuid"),
            "completeness_pct": company.get("completeness_pct"),
            # Preserve financials with verified flag — do NOT store unverified numbers as facts
            "financials_unverified": company.get("financials_unverified"),
        },
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    """Main entry point for company seeding."""
    url, key = assert_env()

    try:
        from supabase import create_client, Client  # type: ignore[import]
    except ImportError:
        print("ERROR: supabase-py is not installed. Run: pip install supabase", file=sys.stderr)
        sys.exit(1)

    # Resolve path to JSON
    script_dir = Path(__file__).parent
    json_path = script_dir.parent.parent / "data" / "companies_v9.json"

    if not json_path.exists():
        print(f"ERROR: JSON file not found at {json_path}", file=sys.stderr)
        print("Expected path: /home/user/workspace/lenzy_v9/data/companies_v9.json", file=sys.stderr)
        sys.exit(1)

    print(f"Loading companies from {json_path}...")

    with open(json_path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    # Support both flat list and { companies: [...] } wrapper
    if isinstance(raw, list):
        companies: list[dict[str, Any]] = raw
    elif isinstance(raw, dict) and "companies" in raw:
        companies = raw["companies"]
        print(f"Metadata: {raw.get('metadata', {})}")
    else:
        print("ERROR: Unexpected JSON structure.", file=sys.stderr)
        sys.exit(1)

    print(f"Loaded {len(companies)} companies")

    # Map to rows
    rows = [map_company_to_row(c) for c in companies]

    # Deduplicate by handle (last write wins within list)
    seen_handles: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for row in reversed(rows):
        h = row["handle"]
        if h and h not in seen_handles:
            seen_handles.add(h)
            deduped.append(row)
    deduped.reverse()
    print(f"After dedup: {len(deduped)} unique handles")

    # Create Supabase client
    db: Client = create_client(url, key)

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
                db.table("tracked_brands")
                .upsert(batch, on_conflict="handle")
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
