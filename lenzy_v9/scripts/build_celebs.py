#!/usr/bin/env python3
"""
Lenzy Celebrity Database Builder v9
Combines all regional data and emits celebrities_v9.json and celebrities_v9.csv
"""
import json, csv, os, secrets, re
from datetime import datetime, timezone

# ─────────────────────────────────────────────────────────────
# IMPORT ALL REGIONAL DATA
# ─────────────────────────────────────────────────────────────
import sys
sys.path.insert(0, os.path.dirname(__file__))

from part1_india import INDIA_ALL
from part2_sea   import SEA_ALL
from part3_me    import ME_ALL
from part4_us    import US_ALL
from part5_korea import KOREA_ALL
from part6_rest  import (UK_EUROPE, LATIN_AMERICA, AFRICA, OCEANIA, GLOBAL_ALL)
from part7_india_ext import INDIA_EXT_ALL
from part8_ext import (SEA_EXTRA, KOREA_EXTRA, UK_EU_EXTRA, US_EXTRA,
                        ME_EXTRA, AFRICA_EXTRA, OCEANIA_EXTRA, GLOBAL_EXTRA)
from part9_bulk import INDIA_BULK_ALL, LATAM_EXTRA_ALL
from part10_final import (INDIA_FINAL_ALL, SEA_FINAL_ALL, KOREA_FINAL_ALL,
                           US_FINAL_ALL, UKEU_FINAL_ALL, AFRICA_FINAL_ALL)
from part11_expand import (US_EXP_ALL, ME_EXP_ALL, SEA_EXP_ALL, UKEU_EXP_ALL,
                            LATAM_EXP_ALL as LATAM_EXP2_ALL, INDIA_EXP2_ALL, GLOBAL_EXP_ALL)
from part12_korea_more import KOREA_EXP2_ALL
from part13_final_push import (US_FINAL2_ALL, INDIA_EXTRA3_ALL, ME_EXTRA2_ALL,
                                SEA_EXTRA3_ALL, AFRICA_EXP3_ALL, GLOBAL_EXP2_ALL)
from part14_topup import (INDIA_TOPUP_ALL, US_TOPUP_ALL, LATAM_TOPUP_ALL,
                           KOREA_GLOBAL_TOPUP_ALL)
from part15_overflow import OVERFLOW_ALL
from part16_final250 import FINAL250_ALL
from part17_patch50 import PATCH50_ALL

# ─────────────────────────────────────────────────────────────
# REGION LABEL MAPPING  (country → canonical region)
# ─────────────────────────────────────────────────────────────

def infer_region(country: str) -> str:
    m = {
        # India
        "India": "India",
        # Southeast Asia
        "Thailand": "Southeast Asia", "Indonesia": "Southeast Asia",
        "Philippines": "Southeast Asia", "Malaysia": "Southeast Asia",
        "Vietnam": "Southeast Asia", "Singapore": "Southeast Asia",
        "Myanmar": "Southeast Asia", "Cambodia": "Southeast Asia",
        # Middle East
        "UAE": "Middle East", "Saudi Arabia": "Middle East", "Kuwait": "Middle East",
        "Egypt": "Middle East", "Turkey": "Middle East", "Lebanon": "Middle East",
        "Jordan": "Middle East", "UAE/Kuwait": "Middle East", "Egypt/Lebanon": "Middle East",
        "Tunisia/Egypt": "Middle East", "Morocco": "Middle East", "Algeria": "Middle East",
        "Qatar": "Middle East", "Bahrain": "Middle East", "Oman": "Middle East",
        "Iraq": "Middle East", "Iran": "Middle East", "Israel": "Middle East",
        "Palestine": "Middle East", "Libya": "Middle East", "Tunisia": "Middle East",
        "Sudan": "Middle East", "UK/Egypt": "Middle East",
        # Korea
        "South Korea": "East Asia (Korea)",
        # East Asia other
        "China": "East Asia (Other)", "Japan": "East Asia (Other)",
        "Taiwan": "East Asia (Other)", "Hong Kong": "East Asia (Other)",
        "Mongolia": "East Asia (Other)",
        # US
        "USA": "US", "Puerto Rico": "US",
        # UK/Europe
        "UK": "UK/Europe", "Ireland": "UK/Europe", "France": "UK/Europe",
        "Germany": "UK/Europe", "Italy": "UK/Europe", "Spain": "UK/Europe",
        "Sweden": "UK/Europe", "Norway": "UK/Europe", "Denmark": "UK/Europe",
        "Belgium": "UK/Europe", "Netherlands": "UK/Europe", "Portugal": "UK/Europe",
        "Croatia": "UK/Europe", "Poland": "UK/Europe", "Austria": "UK/Europe",
        "Switzerland": "UK/Europe", "Russia": "UK/Europe", "Greece": "UK/Europe",
        "Iceland": "UK/Europe", "Monaco": "UK/Europe", "Scotland": "UK/Europe",
        "Albania": "UK/Europe", "UK/Albania": "UK/Europe", "UK/Argentina": "UK/Europe",
        "UK/Japan": "UK/Europe", "Cuba/Spain": "UK/Europe",
        # Latin America
        "Colombia": "Latin America", "Brazil": "Latin America", "Mexico": "Latin America",
        "Argentina": "Latin America", "Chile": "Latin America", "Peru": "Latin America",
        "Venezuela": "Latin America", "Uruguay": "Latin America", "Paraguay": "Latin America",
        "Bolivia": "Latin America", "Ecuador": "Latin America", "Cuba": "Latin America",
        "Dominican Republic": "Latin America", "Panama": "Latin America",
        "Costa Rica": "Latin America", "Guatemala": "Latin America",
        # Africa
        "Nigeria": "Africa", "South Africa": "Africa", "Ghana": "Africa",
        "Kenya": "Africa", "Ethiopia": "Africa", "Senegal": "Africa",
        "Tanzania": "Africa", "Cameroon": "Africa", "Zimbabwe": "Africa",
        "Uganda": "Africa", "Sudan/UK": "Africa",
        # Oceania
        "Australia": "Australia", "New Zealand": "New Zealand",
        # Global fallbacks
        "USA/Mexico": "US", "Canada": "US", "Slovakia/USA": "US",
        "Philippines/USA": "Southeast Asia", "Barbados": "Latin America",
        "Trinidad": "Latin America", "Jamaica": "Latin America",
        "Cuba/USA": "US", "Mexico/USA": "Latin America",
    }
    return m.get(country, "Global")

# Override for items that should be Global or Oceania
OCEANIA_COUNTRIES = {"Australia", "New Zealand"}

# ─────────────────────────────────────────────────────────────
# BUILD THE MASTER LIST
# ─────────────────────────────────────────────────────────────

REGION_ASSIGNMENTS = {
    "India": INDIA_ALL + INDIA_EXT_ALL + INDIA_BULK_ALL + INDIA_FINAL_ALL + INDIA_EXP2_ALL + INDIA_EXTRA3_ALL + INDIA_TOPUP_ALL,
    "Southeast Asia": SEA_ALL + SEA_EXTRA + SEA_FINAL_ALL + SEA_EXP_ALL + SEA_EXTRA3_ALL,
    "Middle East": ME_ALL + ME_EXTRA + ME_EXP_ALL + ME_EXTRA2_ALL,
    "US": US_ALL + US_EXTRA + US_FINAL_ALL + US_EXP_ALL + US_FINAL2_ALL + US_TOPUP_ALL,
    "East Asia (Korea)": KOREA_ALL + KOREA_EXTRA + KOREA_FINAL_ALL + KOREA_EXP2_ALL + KOREA_GLOBAL_TOPUP_ALL,
    "UK/Europe": UK_EUROPE + UK_EU_EXTRA + UKEU_FINAL_ALL + UKEU_EXP_ALL,
    "Latin America": LATIN_AMERICA + LATAM_EXTRA_ALL + LATAM_EXP2_ALL + LATAM_TOPUP_ALL,
    "Africa": AFRICA + AFRICA_EXTRA + AFRICA_FINAL_ALL + AFRICA_EXP3_ALL,
    "Oceania": OCEANIA + OCEANIA_EXTRA,
    "Global": GLOBAL_ALL + GLOBAL_EXTRA + GLOBAL_EXP_ALL + GLOBAL_EXP2_ALL + OVERFLOW_ALL + FINAL250_ALL + PATCH50_ALL,
}

def make_entry(i, tup, region_override=None):
    name, country, category, ig_handle, followers, gender, eyewear, lenskart, brands, aliases, notes = tup
    if isinstance(followers, str):
        try: followers = int(followers)
        except: followers = None

    ig_url = f"https://instagram.com/{ig_handle}" if ig_handle else None
    region = region_override or infer_region(country)
    # Fix Oceania
    if country in OCEANIA_COUNTRIES:
        region = "Oceania"

    return {
        "id": i,
        "uuid": secrets.token_hex(8),
        "name": name,
        "aliases": aliases,
        "region": region,
        "country": country,
        "category": category,
        "instagram_handle": ig_handle,
        "instagram_url": ig_url,
        "instagram_followers_estimate": followers,
        "twitter_handle": None,
        "youtube_handle": None,
        "tiktok_handle": None,
        "gender": gender,
        "eyewear_affinity": eyewear,
        "known_eyewear_brands": brands,
        "glasses_notes": notes,
        "lenskart_relevance": lenskart,
        "source": "curated_seed",
    }

all_entries = []
seen = set()   # (name.lower(), country.lower())
id_counter = 1

for region, lst in REGION_ASSIGNMENTS.items():
    for tup in lst:
        name = tup[0]
        country = tup[1]
        key = (name.lower().strip(), country.lower().strip())
        if key in seen:
            continue
        seen.add(key)
        entry = make_entry(id_counter, tup, region_override=region)
        all_entries.append(entry)
        id_counter += 1

print(f"Total entries before write: {len(all_entries)}")

# ─────────────────────────────────────────────────────────────
# METADATA
# ─────────────────────────────────────────────────────────────

region_counts = {}
cat_counts = {}
eyewear_counts = {}

for e in all_entries:
    r = e["region"]
    c = e["category"]
    ew = e["eyewear_affinity"]
    region_counts[r] = region_counts.get(r, 0) + 1
    cat_counts[c] = cat_counts.get(c, 0) + 1
    eyewear_counts[ew] = eyewear_counts.get(ew, 0) + 1

output = {
    "metadata": {
        "version": "9.0",
        "total": len(all_entries),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "regions": region_counts,
        "categories": cat_counts,
    },
    "celebrities": all_entries
}

# ─────────────────────────────────────────────────────────────
# WRITE JSON
# ─────────────────────────────────────────────────────────────

out_dir = "/home/user/workspace/lenzy_v9/data"
os.makedirs(out_dir, exist_ok=True)

json_path = os.path.join(out_dir, "celebrities_v9.json")
with open(json_path, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"JSON written to: {json_path}")

# ─────────────────────────────────────────────────────────────
# WRITE CSV
# ─────────────────────────────────────────────────────────────

csv_path = os.path.join(out_dir, "celebrities_v9.csv")
csv_fields = ["id","name","region","country","category","instagram_handle",
              "instagram_followers_estimate","gender","eyewear_affinity",
              "lenskart_relevance","notes"]

with open(csv_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=csv_fields, extrasaction="ignore")
    writer.writeheader()
    for e in all_entries:
        row = {k: e.get(k) for k in csv_fields}
        row["notes"] = e.get("glasses_notes", "")
        writer.writerow(row)

print(f"CSV written to: {csv_path}")

# ─────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────

print("\n=== REGION COUNTS ===")
for r, cnt in sorted(region_counts.items(), key=lambda x: -x[1]):
    print(f"  {r:<30} {cnt:>5}")

print("\n=== EYEWEAR AFFINITY ===")
for ew, cnt in sorted(eyewear_counts.items(), key=lambda x: -x[1]):
    print(f"  {ew:<15} {cnt:>5}")

print("\n=== TOP CATEGORIES ===")
for cat, cnt in sorted(cat_counts.items(), key=lambda x: -x[1])[:20]:
    print(f"  {cat:<35} {cnt:>5}")

print(f"\nTOTAL: {len(all_entries)} celebrities")

