"""
backfill_product_image_embeddings.py — Backfill OpenCLIP image embeddings for products

Purpose:
    Reads product image URLs from brand_content (type='product') where a
    product_embeddings row exists but the embedding was from text (not image),
    or from products that have an image_url but no image embedding. Calls
    Replicate andreasjansson/clip-features (OpenCLIP ViT-L/14) to generate
    768-dimensional image embeddings. Upserts into product_embeddings table.
    Idempotent: skips products that already have an image embedding (model
    column = 'openclip-vit-l-14').

    One-time cost estimate: 52k products × ~$0.00017/image ≈ $8.84 total.

Env vars required:
    REPLICATE_API_TOKEN        — Replicate API token
    SUPABASE_URL               — e.g. https://xxxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY  — service role key
    REPLICATE_CLIP_MODEL_VERSION — (optional) pinned Replicate model version

Example invocation:
    REPLICATE_API_TOKEN=r8_... SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... \\
        python code/scripts/backfill_product_image_embeddings.py

Expected output:
    Fetching products with image URLs...
    Total products with images: 48,231
    Already image-embedded: 0
    To embed: 48,231
    Processing batch 1/9647 (5 images)...
    ...
    Done. Embedded: 48,231, errors: 0.

Cron schedule: one-shot (run once; re-run is safe due to idempotency)
"""

from __future__ import annotations

import os
import sys
import time
from typing import Any

# ---------------------------------------------------------------------------
# Env validation
# ---------------------------------------------------------------------------

def assert_env() -> tuple[str, str, str]:
    """Validate required environment variables."""
    replicate_token = os.environ.get("REPLICATE_API_TOKEN", "").strip()
    supabase_url = os.environ.get("SUPABASE_URL", "").strip()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    errors: list[str] = []
    if not replicate_token:
        errors.append("REPLICATE_API_TOKEN is not set")
    if not supabase_url:
        errors.append("SUPABASE_URL is not set")
    if not service_key:
        errors.append("SUPABASE_SERVICE_ROLE_KEY is not set")

    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    return replicate_token, supabase_url, service_key


# ---------------------------------------------------------------------------
# Replicate CLIP embedding
# ---------------------------------------------------------------------------

CLIP_MODEL_VERSION = os.environ.get(
    "REPLICATE_CLIP_MODEL_VERSION",
    "75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
)
REPLICATE_API_BASE = "https://api.replicate.com/v1"
POLL_INTERVAL = 2.0   # seconds between status polls
PREDICTION_TIMEOUT = 120  # seconds


def embed_images_via_replicate(
    replicate_token: str,
    image_urls: list[str],
    max_retries: int = 3,
) -> list[list[float]] | None:
    """
    Call Replicate andreasjansson/clip-features for a batch of images.
    Returns list of 768-dim embeddings or None on failure.
    """
    import urllib.request
    import urllib.error
    import json

    headers = {
        "Authorization": f"Token {replicate_token}",
        "Content-Type": "application/json",
    }

    payload = json.dumps({
        "version": CLIP_MODEL_VERSION,
        "input": {
            "inputs": [{"image": url} for url in image_urls],
        },
    }).encode("utf-8")

    for attempt in range(1, max_retries + 1):
        try:
            # Create prediction
            req = urllib.request.Request(
                f"{REPLICATE_API_BASE}/predictions",
                data=payload,
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                prediction = json.loads(resp.read())

            prediction_id: str = prediction["id"]
            poll_url = f"{REPLICATE_API_BASE}/predictions/{prediction_id}"
            deadline = time.time() + PREDICTION_TIMEOUT

            # Poll until done
            while time.time() < deadline:
                time.sleep(POLL_INTERVAL)
                poll_req = urllib.request.Request(poll_url, headers=headers)
                with urllib.request.urlopen(poll_req, timeout=15) as resp:
                    status_data = json.loads(resp.read())

                status: str = status_data.get("status", "")

                if status == "succeeded":
                    output = status_data.get("output", [])
                    return [item["embedding"] for item in output]

                if status in ("failed", "canceled"):
                    error_msg = status_data.get("error", "unknown")
                    print(f"  Replicate prediction {status}: {error_msg}", flush=True)
                    if attempt < max_retries:
                        time.sleep(attempt * 3)
                    break

            if attempt == max_retries:
                print(f"  Replicate timeout after {PREDICTION_TIMEOUT}s", flush=True)
                return None

        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                print("ERROR: REPLICATE_API_TOKEN is invalid.", file=sys.stderr)
                sys.exit(1)
            print(f"  HTTP error {exc.code} (attempt {attempt}): {exc}", flush=True)
            if attempt < max_retries:
                time.sleep(attempt * 3)

        except Exception as exc:
            print(f"  Replicate error (attempt {attempt}): {exc}", flush=True)
            if attempt < max_retries:
                time.sleep(attempt * 3)

    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    """Main entry point for product image embedding backfill."""
    replicate_token, supabase_url, service_key = assert_env()

    try:
        from supabase import create_client, Client  # type: ignore[import]
    except ImportError:
        print("ERROR: supabase-py is not installed. Run: pip install supabase", file=sys.stderr)
        sys.exit(1)

    db: Client = create_client(supabase_url, service_key)

    # -------------------------------------------------------------------------
    # 1. Fetch products with image URLs
    # -------------------------------------------------------------------------
    print("Fetching products with image URLs...")

    PAGE_SIZE = 1000
    all_products: list[dict[str, Any]] = []
    page = 0

    while True:
        result = (
            db.table("brand_content")
            .select("id, brand_id, data")
            .eq("type", "product")
            .eq("is_active", True)
            .not_.is_("data->>image_url", "null")
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            .execute()
        )

        batch = result.data or []
        all_products.extend(batch)

        if len(batch) < PAGE_SIZE:
            break
        page += 1

    print(f"Total products with images: {len(all_products):,}")

    # -------------------------------------------------------------------------
    # 2. Find already-image-embedded products
    # -------------------------------------------------------------------------
    existing_result = (
        db.table("product_embeddings")
        .select("brand_content_id")
        .eq("model", "openclip-vit-l-14")
        .execute()
    )
    already_embedded: set[int] = {
        row["brand_content_id"] for row in (existing_result.data or [])
    }
    print(f"Already image-embedded: {len(already_embedded):,}")

    to_embed = [
        p for p in all_products
        if p["id"] not in already_embedded
        and (p.get("data") or {}).get("image_url")
    ]
    print(f"To embed: {len(to_embed):,}")

    if not to_embed:
        print("Nothing to do.")
        return

    # -------------------------------------------------------------------------
    # 3. Process in batches of 5 (Replicate batch size)
    # -------------------------------------------------------------------------
    BATCH_SIZE = 5
    total_batches = (len(to_embed) + BATCH_SIZE - 1) // BATCH_SIZE
    total_embedded = 0
    total_errors = 0

    for batch_num in range(total_batches):
        batch = to_embed[batch_num * BATCH_SIZE : (batch_num + 1) * BATCH_SIZE]
        image_urls = [(p.get("data") or {}).get("image_url", "") for p in batch]

        print(
            f"Processing batch {batch_num + 1}/{total_batches} ({len(batch)} images)...",
            end=" ",
            flush=True,
        )

        embeddings = embed_images_via_replicate(replicate_token, image_urls)

        if embeddings is None or len(embeddings) != len(batch):
            print(f"→ ERROR: embedding failed for batch {batch_num + 1}", file=sys.stderr)
            total_errors += len(batch)
            continue

        rows_to_upsert = [
            {
                "brand_content_id": product["id"],
                "brand_id": product.get("brand_id"),
                "product_name": (product.get("data") or {}).get("name", "")[:255],
                "product_image_url": (product.get("data") or {}).get("image_url"),
                "embedding": embedding,
                "model": "openclip-vit-l-14",
            }
            for product, embedding in zip(batch, embeddings)
        ]

        try:
            db.table("product_embeddings").upsert(
                rows_to_upsert,
                on_conflict="brand_content_id,model",
            ).execute()

            total_embedded += len(batch)
            print(f"→ {len(batch)} embedded")
        except Exception as exc:
            print(f"→ DB upsert error: {exc}", file=sys.stderr)
            total_errors += len(batch)

    print(f"\nDone. Embedded: {total_embedded:,}, errors: {total_errors:,}.")

    if total_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
