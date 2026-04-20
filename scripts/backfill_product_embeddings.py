"""
backfill_product_embeddings.py — Backfill text embeddings for all products

Purpose:
    Reads products from the Supabase products table (or brand_content rows
    with type='product'), generates text embeddings using OpenAI
    text-embedding-3-small on (name + description + tags), and upserts
    vectors into the product_embeddings table. Idempotent: skips rows
    already present in product_embeddings. Processes in batches of 100.

    One-time cost estimate: 52k products × ~500 tokens avg = 26M tokens
    At $0.02/1M tokens (text-embedding-3-small) ≈ $0.52 total.

Env vars required:
    OPENAI_API_KEY             — OpenAI API key
    SUPABASE_URL               — e.g. https://xxxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY  — service role key

Example invocation:
    OPENAI_API_KEY=sk-... SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... \\
        python code/scripts/backfill_product_embeddings.py

Expected output:
    Fetching products from Supabase...
    Total products: 52,143
    Already embedded: 0
    To embed: 52,143
    Processing batch 1/522 (100 products)...
    ...
    Done. Embedded: 52,143, errors: 0, skipped: 0.

Cron schedule: one-shot (run once; re-run is safe due to idempotency)
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Env validation
# ---------------------------------------------------------------------------

def assert_env() -> tuple[str, str, str]:
    """Validate required environment variables."""
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    supabase_url = os.environ.get("SUPABASE_URL", "").strip()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    errors: list[str] = []
    if not openai_key:
        errors.append("OPENAI_API_KEY is not set")
    if not supabase_url:
        errors.append("SUPABASE_URL is not set")
    if not service_key:
        errors.append("SUPABASE_SERVICE_ROLE_KEY is not set")

    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    return openai_key, supabase_url, service_key


# ---------------------------------------------------------------------------
# Text preparation
# ---------------------------------------------------------------------------

def prepare_product_text(product: dict[str, Any]) -> str:
    """
    Build the text string to embed for a product.
    Concatenates name + description + tags for rich semantic representation.
    """
    parts: list[str] = []

    name = (product.get("name") or product.get("product_name") or "").strip()
    if name:
        parts.append(name)

    description = (product.get("description") or product.get("body_html") or "").strip()
    if description:
        # Truncate very long descriptions to avoid token waste
        parts.append(description[:500])

    tags = product.get("tags")
    if isinstance(tags, list):
        parts.append(" ".join(str(t) for t in tags[:20]))
    elif isinstance(tags, str):
        parts.append(tags[:200])

    product_type = (product.get("product_type") or product.get("category") or "").strip()
    if product_type:
        parts.append(product_type)

    return " | ".join(p for p in parts if p) or name or "eyewear product"


# ---------------------------------------------------------------------------
# OpenAI embeddings with retry
# ---------------------------------------------------------------------------

def get_embeddings_with_retry(
    client: Any,
    texts: list[str],
    model: str = "text-embedding-3-small",
    max_retries: int = 3,
) -> list[list[float]]:
    """
    Generate embeddings for a batch of texts with exponential backoff retry.

    Returns a list of 1536-dimensional float arrays.
    """
    for attempt in range(1, max_retries + 1):
        try:
            response = client.embeddings.create(input=texts, model=model)
            return [item.embedding for item in response.data]
        except Exception as exc:
            error_str = str(exc)
            if "rate_limit" in error_str.lower() or "429" in error_str:
                wait = 2 ** attempt
                print(f"  Rate limited, waiting {wait}s before retry {attempt}/{max_retries}...", flush=True)
                time.sleep(wait)
            elif attempt == max_retries:
                raise
            else:
                print(f"  OpenAI error (attempt {attempt}): {exc}", flush=True)
                time.sleep(attempt * 2)

    raise RuntimeError("get_embeddings_with_retry: exhausted retries")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    """Main entry point for product text embedding backfill."""
    openai_key, supabase_url, service_key = assert_env()

    try:
        from supabase import create_client, Client  # type: ignore[import]
    except ImportError:
        print("ERROR: supabase-py is not installed. Run: pip install supabase", file=sys.stderr)
        sys.exit(1)

    try:
        from openai import OpenAI  # type: ignore[import]
    except ImportError:
        print("ERROR: openai is not installed. Run: pip install openai", file=sys.stderr)
        sys.exit(1)

    db: Client = create_client(supabase_url, service_key)
    openai_client = OpenAI(api_key=openai_key)

    # -------------------------------------------------------------------------
    # 1. Fetch all products
    # -------------------------------------------------------------------------
    print("Fetching products from Supabase...")

    PAGE_SIZE = 1000
    all_products: list[dict[str, Any]] = []
    page = 0

    while True:
        result = (
            db.table("brand_content")
            .select("id, data, brand_id")
            .eq("type", "product")
            .eq("is_active", True)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            .execute()
        )

        batch = result.data or []
        all_products.extend(batch)

        if len(batch) < PAGE_SIZE:
            break
        page += 1

    print(f"Total products: {len(all_products):,}")

    # -------------------------------------------------------------------------
    # 2. Find already-embedded products
    # -------------------------------------------------------------------------
    existing_result = db.table("product_embeddings").select("brand_content_id").execute()
    already_embedded: set[int] = {
        row["brand_content_id"] for row in (existing_result.data or [])
    }
    print(f"Already embedded: {len(already_embedded):,}")

    to_embed = [p for p in all_products if p["id"] not in already_embedded]
    print(f"To embed: {len(to_embed):,}")

    if not to_embed:
        print("Nothing to do.")
        return

    # -------------------------------------------------------------------------
    # 3. Process in batches of 100
    # -------------------------------------------------------------------------
    BATCH_SIZE = 100
    total_batches = (len(to_embed) + BATCH_SIZE - 1) // BATCH_SIZE
    total_embedded = 0
    total_errors = 0

    for batch_num in range(total_batches):
        batch = to_embed[batch_num * BATCH_SIZE : (batch_num + 1) * BATCH_SIZE]
        print(f"Processing batch {batch_num + 1}/{total_batches} ({len(batch)} products)...", end=" ", flush=True)

        texts = [prepare_product_text(p.get("data") or p) for p in batch]

        try:
            embeddings = get_embeddings_with_retry(openai_client, texts)

            if len(embeddings) != len(batch):
                print(f"→ ERROR: expected {len(batch)} embeddings, got {len(embeddings)}", file=sys.stderr)
                total_errors += len(batch)
                continue

            rows_to_upsert = [
                {
                    "brand_content_id": product["id"],
                    "brand_id": product.get("brand_id"),
                    "product_name": prepare_product_text(product.get("data") or product)[:255],
                    "product_image_url": (product.get("data") or {}).get("image_url"),
                    "embedding": embedding,
                    "model": "text-embedding-3-small",
                }
                for product, embedding in zip(batch, embeddings)
            ]

            db.table("product_embeddings").upsert(
                rows_to_upsert,
                on_conflict="brand_content_id",
            ).execute()

            total_embedded += len(batch)
            print(f"→ {len(batch)} embedded")

        except Exception as exc:
            total_errors += len(batch)
            print(f"→ ERROR: {exc}", file=sys.stderr)

        # Small delay between batches to avoid rate limits
        if batch_num < total_batches - 1:
            time.sleep(0.1)

    print(f"\nDone. Embedded: {total_embedded:,}, errors: {total_errors:,}, skipped: {len(already_embedded):,}.")

    if total_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
