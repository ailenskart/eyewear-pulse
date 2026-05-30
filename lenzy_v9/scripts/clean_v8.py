"""
Lenzy v9 — Clean & normalize the Manus v8 database.

Removes hallucinated fields, normalizes numeric types, dedupes on (handle, website, name),
and emits:
  - lenzy_v9/data/companies_v9.json       (cleaned, ready for SLM training + seeding)
  - lenzy_v9/data/companies_v9.jsonl      (one row per line for streaming)
  - lenzy_v9/data/companies_v9_tracked_brands.csv   (for SQL COPY into tracked_brands)
  - lenzy_v9/data/companies_v9_quarantine.json     (removed / merged rows with reasons)
  - lenzy_v9/data/companies_v9_report.json         (quality stats)

Rules
-----
Fabricated by Manus (must strip, NEVER ship to SLM):
  - digital_presence.instagram_stats.recent_posts[*] — templated fake IG URLs
  - digital_presence.instagram_stats.engagement_rate / avg_likes / avg_comments /
    posting_frequency / content_style — invented aggregates on brands Manus never scraped
  - financials.revenue_latest_usd when it's a "$50M" style string without a source — downgrade to null + flag
  - operations.employees_total / number_of_stores strings that are round ("100","500") without a source
  - digital_presence.instagram.followers string ("500K") — parse to bigint if clean, else null
Preserve:
  - Name, aliases, canonical_name, website, country, region, HQ city, founded year
  - IG handle, LinkedIn URL, Facebook/Twitter/YouTube/TikTok when format-valid
  - category, subcategory, business_type, ownership, public/private, parent_company
  - key_people (only if name is non-empty and title present)
  - sitemap data (has_sitemap, product_count, urls — these come from the real scraper)
  - tags, description
Normalize:
  - All numerics to integers (nullable)
  - ISO country codes → iso_alpha2 and iso_alpha3
  - Handles stripped of @, lowercased, instagram_url canonicalized
  - website canonicalized (https, no trailing slash, lowercase domain)
"""

from __future__ import annotations
import json, re, os, sys, hashlib
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path("/home/user/workspace")
SRC = ROOT / "Global_Eyewear_Database_v8_Final.json"
OUT_DIR = ROOT / "lenzy_v9" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Helpers ────────────────────────────────────────────────────────────

FAKE_IG_URL_RE = re.compile(r"https?://www\.instagram\.com/p/[A-Za-z0-9]{9,12}/?$")
# Manus templated all fake URLs with shortcodes starting with 'C' + 2 digits + letter + digit…
# We mark ALL recent_posts as fake because no evidence Manus ever really hit the IG API.
# They are removed in toto.

ISO2_TO_ISO3 = {
    # Minimal mapping covering everything we see in the data.
}

COUNTRY_TO_ISO = {
    "USA": ("US","USA","North America"),
    "United States": ("US","USA","North America"),
    "UK": ("GB","GBR","Europe"),
    "United Kingdom": ("GB","GBR","Europe"),
    "China": ("CN","CHN","East Asia"),
    "Hong Kong": ("HK","HKG","East Asia"),
    "Taiwan": ("TW","TWN","East Asia"),
    "Japan": ("JP","JPN","East Asia"),
    "South Korea": ("KR","KOR","East Asia"),
    "India": ("IN","IND","South Asia"),
    "Pakistan": ("PK","PAK","South Asia"),
    "Bangladesh": ("BD","BGD","South Asia"),
    "Sri Lanka": ("LK","LKA","South Asia"),
    "Nepal": ("NP","NPL","South Asia"),
    "France": ("FR","FRA","Europe"),
    "Italy": ("IT","ITA","Europe"),
    "Germany": ("DE","DEU","Europe"),
    "Spain": ("ES","ESP","Europe"),
    "Portugal": ("PT","PRT","Europe"),
    "Netherlands": ("NL","NLD","Europe"),
    "Belgium": ("BE","BEL","Europe"),
    "Switzerland": ("CH","CHE","Europe"),
    "Austria": ("AT","AUT","Europe"),
    "Denmark": ("DK","DNK","Europe"),
    "Sweden": ("SE","SWE","Europe"),
    "Norway": ("NO","NOR","Europe"),
    "Finland": ("FI","FIN","Europe"),
    "Poland": ("PL","POL","Europe"),
    "Czech Republic": ("CZ","CZE","Europe"),
    "Hungary": ("HU","HUN","Europe"),
    "Romania": ("RO","ROU","Europe"),
    "Russia": ("RU","RUS","Europe"),
    "Ukraine": ("UA","UKR","Europe"),
    "Turkey": ("TR","TUR","Middle East"),
    "Greece": ("GR","GRC","Europe"),
    "Ireland": ("IE","IRL","Europe"),
    "Iceland": ("IS","ISL","Europe"),
    "UAE": ("AE","ARE","Middle East"),
    "United Arab Emirates": ("AE","ARE","Middle East"),
    "Saudi Arabia": ("SA","SAU","Middle East"),
    "Qatar": ("QA","QAT","Middle East"),
    "Kuwait": ("KW","KWT","Middle East"),
    "Bahrain": ("BH","BHR","Middle East"),
    "Oman": ("OM","OMN","Middle East"),
    "Jordan": ("JO","JOR","Middle East"),
    "Lebanon": ("LB","LBN","Middle East"),
    "Israel": ("IL","ISR","Middle East"),
    "Egypt": ("EG","EGY","Middle East"),
    "Morocco": ("MA","MAR","Africa"),
    "Tunisia": ("TN","TUN","Africa"),
    "Algeria": ("DZ","DZA","Africa"),
    "Nigeria": ("NG","NGA","Africa"),
    "South Africa": ("ZA","ZAF","Africa"),
    "Kenya": ("KE","KEN","Africa"),
    "Tanzania": ("TZ","TZA","Africa"),
    "Ghana": ("GH","GHA","Africa"),
    "Ethiopia": ("ET","ETH","Africa"),
    "Uganda": ("UG","UGA","Africa"),
    "Rwanda": ("RW","RWA","Africa"),
    "Senegal": ("SN","SEN","Africa"),
    "Ivory Coast": ("CI","CIV","Africa"),
    "Australia": ("AU","AUS","Oceania"),
    "New Zealand": ("NZ","NZL","Oceania"),
    "Canada": ("CA","CAN","North America"),
    "Mexico": ("MX","MEX","Latin America"),
    "Brazil": ("BR","BRA","Latin America"),
    "Argentina": ("AR","ARG","Latin America"),
    "Chile": ("CL","CHL","Latin America"),
    "Colombia": ("CO","COL","Latin America"),
    "Peru": ("PE","PER","Latin America"),
    "Uruguay": ("UY","URY","Latin America"),
    "Ecuador": ("EC","ECU","Latin America"),
    "Venezuela": ("VE","VEN","Latin America"),
    "Singapore": ("SG","SGP","Southeast Asia"),
    "Malaysia": ("MY","MYS","Southeast Asia"),
    "Thailand": ("TH","THA","Southeast Asia"),
    "Indonesia": ("ID","IDN","Southeast Asia"),
    "Vietnam": ("VN","VNM","Southeast Asia"),
    "Philippines": ("PH","PHL","Southeast Asia"),
    "Cambodia": ("KH","KHM","Southeast Asia"),
    "Myanmar": ("MM","MMR","Southeast Asia"),
    "Laos": ("LA","LAO","Southeast Asia"),
}

def _log(*a): print(*a, file=sys.stderr, flush=True)

def normalize_handle(raw):
    if not raw or not isinstance(raw, str): return None
    h = raw.strip().lstrip("@").lower()
    h = re.split(r"[\s?]", h)[0]
    h = h.replace("instagram.com/", "").replace("https://", "").replace("http://","")
    h = h.strip("/").split("/")[0]
    if not re.match(r"^[a-z0-9_.]{2,30}$", h): return None
    return h

def normalize_website(raw):
    if not raw or not isinstance(raw,str): return None
    w = raw.strip().lower()
    if not w: return None
    w = re.sub(r"^https?://", "", w)
    w = re.sub(r"^www\.", "", w)
    w = w.rstrip("/").split("?")[0].split("#")[0]
    if not re.match(r"^[a-z0-9.\-]+\.[a-z]{2,}(/.*)?$", w): return None
    return "https://" + w

def canonical_domain(url):
    if not url: return None
    u = url.lower().replace("https://","").replace("http://","").replace("www.","")
    return u.split("/")[0].strip()

def parse_followers(raw):
    """'500K' -> 500000, '1.2M' -> 1200000, 12345 -> 12345, bad -> None"""
    if raw is None: return None
    if isinstance(raw,(int,float)): return int(raw) if raw>=0 else None
    if not isinstance(raw,str): return None
    s = raw.strip().replace(",","").replace("+","")
    if not s: return None
    m = re.match(r"^(\d+(?:\.\d+)?)\s*([KMB])?$", s, re.I)
    if not m: 
        # Plain integer string?
        if s.isdigit(): return int(s)
        return None
    n = float(m.group(1))
    mul = {"K":1_000,"M":1_000_000,"B":1_000_000_000}.get((m.group(2) or "").upper(), 1)
    return int(n * mul)

def parse_count(raw):
    if raw is None: return None
    if isinstance(raw,(int,float)): return int(raw) if raw>=0 else None
    if not isinstance(raw,str): return None
    s = raw.strip().replace(",","").replace("+","")
    if not s: return None
    if s.isdigit(): return int(s)
    m = re.match(r"^(\d+(?:\.\d+)?)\s*([KMB])?$", s, re.I)
    if m:
        n = float(m.group(1))
        mul = {"K":1_000,"M":1_000_000,"B":1_000_000_000}.get((m.group(2) or "").upper(), 1)
        return int(n * mul)
    return None

def parse_revenue(raw):
    """Returns (usd_int or None, is_unverified bool, raw_label or None)."""
    if raw is None: return (None, False, None)
    if isinstance(raw,(int,float)): return (int(raw), False, None)
    if not isinstance(raw,str): return (None, False, None)
    s = raw.strip()
    if not s: return (None, False, None)
    # Known Manus pattern: "$50M", "$1B+", "$2.2B"
    m = re.match(r"^\$?\s*(\d+(?:\.\d+)?)\s*([MBT])\+?$", s, re.I)
    if not m:
        return (None, True, s)
    n = float(m.group(1))
    mul = {"M":1_000_000,"B":1_000_000_000,"T":1_000_000_000_000}[m.group(2).upper()]
    # Mark unverified because Manus invented most of these.
    return (int(n*mul), True, s)

def strip_hallucinated_ig_stats(igs):
    """Keep only fields that came from the real scraper; drop Manus fantasies."""
    if not isinstance(igs, dict): return {}
    out = {}
    # Real: verified (bool), followers (int if present & parseable)
    if "verified" in igs and isinstance(igs["verified"], bool):
        out["verified"] = igs["verified"]
    f = parse_followers(igs.get("followers"))
    if f is not None: out["followers"] = f
    # Everything else (engagement_rate, avg_likes, avg_comments, recent_posts,
    # bio, posting_frequency, content_style) was invented. Drop.
    return out

def slugify(name):
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+","-", s)
    return s.strip("-")

# ── Load & process ─────────────────────────────────────────────────────

def main():
    with open(SRC,"r",encoding="utf-8") as f:
        src = json.load(f)
    cos = src["companies"]
    _log(f"Loaded {len(cos)} companies")

    quarantine = []
    cleaned = []
    seen_handle = {}
    seen_domain = {}
    seen_name_country = {}

    stats = Counter()

    for c in cos:
        raw_name = (c.get("identity",{}).get("canonical_name") or c.get("company_name") or "").strip()
        if not raw_name:
            quarantine.append({"reason":"empty_name","row":c})
            stats["quarantined_empty_name"] += 1
            continue

        country = (c.get("basic_info",{}).get("country") or "").strip()
        iso2 = iso3 = region = None
        if country in COUNTRY_TO_ISO:
            iso2, iso3, region = COUNTRY_TO_ISO[country]
        else:
            region = c.get("basic_info",{}).get("region") or None

        website = normalize_website(c.get("digital_presence",{}).get("website"))
        domain = canonical_domain(website) if website else None

        ig_handle = normalize_handle(c.get("digital_presence",{}).get("instagram",{}).get("handle"))

        # ---- Dedupe keys ----
        name_key = slugify(raw_name)
        nc_key = f"{name_key}|{(iso2 or '')}"

        # Merge dupes by handle first (strongest key), then domain, then (name,country)
        dup_idx = None
        merge_reason = None
        if ig_handle and ig_handle in seen_handle:
            dup_idx = seen_handle[ig_handle]; merge_reason = f"dup_handle:{ig_handle}"
        elif domain and domain in seen_domain:
            dup_idx = seen_domain[domain]; merge_reason = f"dup_domain:{domain}"
        elif nc_key in seen_name_country:
            dup_idx = seen_name_country[nc_key]; merge_reason = f"dup_name_country:{nc_key}"

        # ---- Parse numerics ----
        ig_followers = None
        for cand in [
            c.get("digital_presence",{}).get("instagram_stats",{}).get("followers"),
            c.get("digital_presence",{}).get("instagram",{}).get("followers"),
        ]:
            ig_followers = parse_followers(cand)
            if ig_followers is not None: break

        employees = parse_count(c.get("operations",{}).get("employees_total"))
        stores = parse_count(c.get("operations",{}).get("number_of_stores"))
        revenue_usd, revenue_unverified, revenue_raw = parse_revenue(c.get("financials",{}).get("revenue_latest_usd"))

        founded = c.get("basic_info",{}).get("year_founded")
        if isinstance(founded,str) and founded.isdigit(): founded = int(founded)
        if not (isinstance(founded,int) and 1700 <= founded <= 2030): founded = None

        # ---- Classification & flags ----
        classification = c.get("classification",{})
        cats = classification.get("product_categories",{}) or {}

        # ---- Key people (drop empties) ----
        kp = []
        for p in c.get("key_people", []) or []:
            nm = (p.get("name") or "").strip()
            ti = (p.get("title") or "").strip()
            li = (p.get("linkedin") or "").strip() or None
            if nm and ti:
                kp.append({"name":nm,"title":ti,"linkedin_url":li})

        # Also leadership.ceo
        ceo = (c.get("leadership",{}).get("ceo",{}) or {}).get("name") or ""
        if ceo and not any(p["title"].lower().startswith("ceo") for p in kp):
            kp.append({"name":ceo.strip(),"title":"CEO","linkedin_url":None})

        ig_stats_clean = strip_hallucinated_ig_stats(c.get("digital_presence",{}).get("instagram_stats",{}) or {})

        # ---- Provenance flags per field (what we trust) ----
        provenance = {
            "name": "source_v8",
            "website": "source_v8" if website else "missing",
            "ig_handle": "source_v8" if ig_handle else "missing",
            "ig_followers": "source_v8" if ig_followers is not None else "missing",
            "country": "source_v8" if country else "missing",
            "founded_year": "source_v8" if founded else "missing",
            "revenue_usd": "unverified_llm_estimate" if revenue_usd is not None else "missing",
            "employees": "unverified_llm_estimate" if employees is not None else "missing",
            "stores": "unverified_llm_estimate" if stores is not None else "missing",
            "description": "unverified_llm_summary",
            "ig_stats_aggregates": "removed_fabricated",
            "recent_posts": "removed_fabricated",
        }

        # Build cleaned row with Lenzy schema-ready shape
        cleaned_row = {
            "id": c.get("id"),
            "uuid": c.get("company_uuid") or hashlib.sha1(name_key.encode()).hexdigest()[:16],
            "handle": ig_handle or slugify(raw_name),
            "name": raw_name,
            "aliases": [a for a in (c.get("identity",{}).get("aliases") or []) if a],

            "country": country or None,
            "iso_alpha2": iso2,
            "iso_alpha3": iso3,
            "region": region,
            "hq_city": (c.get("basic_info",{}).get("hq_city") or "").strip() or None,

            "category": classification.get("primary_category") or None,
            "subcategory": (
                "Sunglasses" if cats.get("sunglasses") and not cats.get("prescription_glasses")
                else "Optical" if cats.get("prescription_glasses") and not cats.get("sunglasses")
                else "Both" if cats.get("prescription_glasses") and cats.get("sunglasses")
                else None
            ),
            "business_type": classification.get("business_type") or None,
            "business_model": classification.get("business_model") or None,
            "distribution_channel": classification.get("distribution_channel") or None,
            "price_tier": classification.get("price_tier") or None,
            "product_focus": classification.get("product_focus") or None,
            "founded_year": founded,
            "parent_company": c.get("ownership_and_corporate",{}).get("brand_portfolio") and None or (c.get("basic_info",{}).get("parent_company") or None),
            "ownership_type": c.get("ownership_and_corporate",{}).get("ownership_type") or None,
            "is_public": bool(c.get("basic_info",{}).get("publicly_traded")),
            "stock_ticker": c.get("basic_info",{}).get("stock_ticker") or None,

            # Flags
            "flags": {
                "is_d2c": classification.get("business_model") in ("D2C","Direct-to-consumer","Direct-to-Consumer"),
                "is_manufacturer": classification.get("business_type") in ("Manufacturer","OEM"),
                "is_retailer": classification.get("business_type") in ("Retailer","Online Retailer"),
                "is_luxury": (classification.get("price_tier") or "").lower() in ("luxury","prestige"),
                "is_smart_eyewear": bool(cats.get("smart_eyewear")),
                "has_manufacturing": bool(c.get("manufacturing",{}).get("has_own_manufacturing")),
                "sustainability_focus": bool(c.get("sustainability_and_esg",{}).get("sustainability_focus")),
            },

            # Unverified financials (flagged, kept for LLM but never used in dashboards)
            "financials_unverified": {
                "revenue_usd_estimate": revenue_usd,
                "revenue_raw_label": revenue_raw,
                "employees_estimate": employees,
                "stores_estimate": stores,
            },

            # Digital presence — ONLY canonicalized URLs & handles.
            "digital": {
                "website": website,
                "domain": domain,
                "instagram_handle": ig_handle,
                "instagram_followers": ig_followers,
                "instagram_verified": ig_stats_clean.get("verified"),
                "linkedin_url": c.get("digital_presence",{}).get("linkedin_url") or c.get("digital_presence",{}).get("linkedin",{}).get("url") or None,
                "facebook_url": c.get("digital_presence",{}).get("facebook",{}).get("url") or None,
                "twitter_handle": normalize_handle(c.get("digital_presence",{}).get("twitter_x",{}).get("handle")),
                "youtube_url": c.get("digital_presence",{}).get("youtube",{}).get("channel") or None,
                "tiktok_handle": normalize_handle(c.get("digital_presence",{}).get("tiktok",{}).get("handle")),
            },

            # Industry codes
            "naics_code": c.get("industry_codes",{}).get("naics_code") or None,
            "sic_code": c.get("industry_codes",{}).get("sic_code") or None,

            # People
            "key_people": kp,

            # Sitemap (real scraper output)
            "sitemap": {
                "has_sitemap": bool(c.get("sitemap_data",{}).get("has_sitemap")),
                "total_urls": c.get("sitemap_data",{}).get("total_urls") or 0,
                "product_count": c.get("sitemap_data",{}).get("product_count") or 0,
            },

            # Descriptions / tags (LLM summary — kept but flagged)
            "description": c.get("description") or None,
            "tags": c.get("tags") or [],

            # Provenance + quality
            "data_quality": {
                "completeness_score": c.get("data_quality",{}).get("completeness_score") or 0,
                "confidence_score": c.get("data_quality",{}).get("confidence_score") or 0,
                "first_added_at": c.get("data_quality",{}).get("first_added_at"),
                "last_verified_at": c.get("data_quality",{}).get("last_verified_at"),
                "provenance": provenance,
                "sources": [],   # to be filled by live-web re-verification pass
                "needs_reverification": True,
            },
        }

        if dup_idx is not None:
            # Merge into the existing row
            existing = cleaned[dup_idx]
            merge_fields(existing, cleaned_row)
            existing.setdefault("data_quality",{}).setdefault("merged_from",[]).append({
                "id": cleaned_row["id"], "reason": merge_reason
            })
            stats["merged_duplicates"] += 1
            continue

        idx = len(cleaned)
        cleaned.append(cleaned_row)
        if ig_handle: seen_handle[ig_handle] = idx
        if domain: seen_domain[domain] = idx
        seen_name_country[nc_key] = idx
        stats["kept"] += 1

    # ── Emit outputs ────────────────────────────────────────────────────
    # 1) JSON
    with open(OUT_DIR/"companies_v9.json","w",encoding="utf-8") as f:
        json.dump({
            "metadata":{
                "version":"9.0",
                "source":"Global_Eyewear_Database_v8_Final.json (Manus) — cleaned",
                "total_companies": len(cleaned),
                "stats": dict(stats),
                "note":"Fabricated aggregates (engagement_rate, recent_posts, avg_likes, etc.) stripped. "
                       "Financials marked unverified. Re-verification pass pending."
            },
            "companies": cleaned
        }, f, ensure_ascii=False, indent=1)

    # 2) JSONL
    with open(OUT_DIR/"companies_v9.jsonl","w",encoding="utf-8") as f:
        for row in cleaned:
            f.write(json.dumps(row, ensure_ascii=False)+"\n")

    # 3) Quarantine
    with open(OUT_DIR/"companies_v9_quarantine.json","w",encoding="utf-8") as f:
        json.dump(quarantine, f, ensure_ascii=False, indent=1)

    # 4) CSV for SQL COPY into tracked_brands
    import csv
    with open(OUT_DIR/"companies_v9_tracked_brands.csv","w",encoding="utf-8",newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "handle","name","country","iso_alpha2","iso_alpha3","region","hq_city",
            "category","subcategory","business_type","business_model","price_tier",
            "founded_year","ownership_type","is_public","stock_ticker",
            "website","domain","instagram_url","linkedin_url","facebook_url","youtube_url","tiktok_handle",
            "instagram_followers","employee_estimate","store_estimate","revenue_usd_estimate",
            "naics_code","sic_code",
            "is_d2c","is_manufacturer","is_retailer","is_luxury","is_smart_eyewear","has_manufacturing","sustainability_focus",
            "description","tags","completeness_pct","confidence_pct",
            "needs_reverification"
        ])
        for r in cleaned:
            d = r["digital"]; fl = r["flags"]; fin = r["financials_unverified"]
            w.writerow([
                r["handle"], r["name"], r.get("country"), r.get("iso_alpha2"), r.get("iso_alpha3"),
                r.get("region"), r.get("hq_city"),
                r.get("category"), r.get("subcategory"), r.get("business_type"),
                r.get("business_model"), r.get("price_tier"),
                r.get("founded_year"), r.get("ownership_type"), r.get("is_public"),
                r.get("stock_ticker"),
                d.get("website"), d.get("domain"),
                f"https://instagram.com/{d['instagram_handle']}" if d.get("instagram_handle") else "",
                d.get("linkedin_url"), d.get("facebook_url"), d.get("youtube_url"), d.get("tiktok_handle"),
                d.get("instagram_followers"),
                fin.get("employees_estimate"), fin.get("stores_estimate"), fin.get("revenue_usd_estimate"),
                r.get("naics_code"), r.get("sic_code"),
                fl.get("is_d2c"), fl.get("is_manufacturer"), fl.get("is_retailer"), fl.get("is_luxury"),
                fl.get("is_smart_eyewear"), fl.get("has_manufacturing"), fl.get("sustainability_focus"),
                (r.get("description") or "").replace("\n"," ").strip()[:1000],
                "|".join(r.get("tags") or []),
                r["data_quality"]["completeness_score"], r["data_quality"]["confidence_score"],
                r["data_quality"]["needs_reverification"],
            ])

    # 5) Report
    report = {
        "source_total": len(cos),
        "cleaned_total": len(cleaned),
        "quarantined": len(quarantine),
        "merged_duplicates": stats["merged_duplicates"],
        "by_region": Counter(r.get("region") or "Unknown" for r in cleaned).most_common(20),
        "by_country_top30": Counter(r.get("country") or "Unknown" for r in cleaned).most_common(30),
        "with_website": sum(1 for r in cleaned if r["digital"].get("website")),
        "with_ig_handle": sum(1 for r in cleaned if r["digital"].get("instagram_handle")),
        "with_linkedin": sum(1 for r in cleaned if r["digital"].get("linkedin_url")),
        "with_people": sum(1 for r in cleaned if r.get("key_people")),
        "with_sitemap": sum(1 for r in cleaned if r["sitemap"].get("has_sitemap")),
        "with_product_urls": sum(1 for r in cleaned if r["sitemap"].get("product_count",0) > 0),
        "total_product_urls": sum(r["sitemap"].get("product_count",0) for r in cleaned),
        "needs_reverification": sum(1 for r in cleaned if r["data_quality"]["needs_reverification"]),
        "stripped_fabrications": {
            "recent_posts": sum(1 for c in cos if (c.get("digital_presence",{}).get("instagram_stats",{}) or {}).get("recent_posts")),
            "engagement_rate": sum(1 for c in cos if (c.get("digital_presence",{}).get("instagram_stats",{}) or {}).get("engagement_rate")),
            "avg_likes": sum(1 for c in cos if (c.get("digital_presence",{}).get("instagram_stats",{}) or {}).get("avg_likes")),
        },
    }
    with open(OUT_DIR/"companies_v9_report.json","w",encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    _log(json.dumps(report, indent=2))
    _log("DONE.")

def merge_fields(existing, new):
    """Prefer non-empty values from whichever row has them."""
    def pick(a,b):
        if a in (None,"",[],{}): return b
        if b in (None,"",[],{}): return a
        return a  # keep first-seen on ties
    # Top-level scalars
    for k in ["country","iso_alpha2","iso_alpha3","region","hq_city","category","subcategory",
              "business_type","business_model","price_tier","founded_year","ownership_type",
              "stock_ticker","description","naics_code","sic_code"]:
        existing[k] = pick(existing.get(k), new.get(k))
    # Digital
    for k in ["website","domain","instagram_handle","instagram_followers","instagram_verified",
              "linkedin_url","facebook_url","twitter_handle","youtube_url","tiktok_handle"]:
        existing["digital"][k] = pick(existing["digital"].get(k), new["digital"].get(k))
    # Merge arrays
    existing["aliases"] = list(set((existing.get("aliases") or []) + (new.get("aliases") or []) + [new.get("name")]))
    existing["tags"] = list(set((existing.get("tags") or []) + (new.get("tags") or [])))
    # People: dedupe by name
    seen = {p["name"].lower() for p in existing.get("key_people") or []}
    for p in new.get("key_people") or []:
        if p["name"].lower() not in seen:
            existing.setdefault("key_people",[]).append(p); seen.add(p["name"].lower())
    # Sitemap: take richer
    if (new.get("sitemap",{}).get("product_count") or 0) > (existing.get("sitemap",{}).get("product_count") or 0):
        existing["sitemap"] = new["sitemap"]


if __name__=="__main__":
    main()
