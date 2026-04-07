#!/bin/bash
TOKEN="$APIFY_TOKEN"
BLOB_TOKEN="$BLOB_READ_WRITE_TOKEN"
FEED="/home/user/eyewear-pulse/src/data/scraped-feed.json"
HANDLES_FILE="/home/user/eyewear-pulse/scripts/handles.txt"

echo '[]' > "$FEED"

mapfile -t HANDLES < "$HANDLES_FILE"
TOTAL=${#HANDLES[@]}
BATCH=5

echo "Scraping $TOTAL accounts, batch=$BATCH, 10 posts each"

for ((i=0; i<TOTAL; i+=BATCH)); do
  BH=("${HANDLES[@]:i:BATCH}")
  URLS=""
  for h in "${BH[@]}"; do
    h=$(echo "$h" | tr -d '\r\n ')
    [ -z "$h" ] && continue
    [ -n "$URLS" ] && URLS="$URLS,"
    URLS="$URLS\"https://www.instagram.com/$h/\""
  done

  BN=$((i/BATCH+1))
  BT=$(((TOTAL+BATCH-1)/BATCH))
  echo -n "[$BN/$BT] "

  R=$(curl -s -X POST "https://api.apify.com/v2/acts/shu8hvrXbJbY3Eb9W/runs?waitForFinish=300" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"directUrls\":[$URLS],\"resultsType\":\"posts\",\"resultsLimit\":10}" 2>/dev/null)

  S=$(echo "$R"|python3 -c "import json,sys;print(json.load(sys.stdin)['data']['status'])" 2>/dev/null)
  D=$(echo "$R"|python3 -c "import json,sys;print(json.load(sys.stdin)['data']['defaultDatasetId'])" 2>/dev/null)

  if [ "$S" != "SUCCEEDED" ]; then echo "SKIP($S)"; continue; fi

  curl -s "https://api.apify.com/v2/datasets/$D/items?limit=200" -H "Authorization: Bearer $TOKEN" -o "/home/user/eyewear-pulse/scripts/_batch.json"

  python3 /home/user/eyewear-pulse/scripts/upload_media.py "$D"
  sleep 1
done

echo ""
echo "========================================"
python3 -c "
import json
p=json.load(open('$FEED'))
print(f'Posts:{len(p)} Accts:{len(set(x.get(\"ownerUsername\",\"\") for x in p if x.get(\"ownerUsername\")))} Img:{sum(1 for x in p if x.get(\"blobUrl\"))} Vid:{sum(1 for x in p if x.get(\"videoBlobUrl\"))} Slides:{sum(len(x.get(\"carouselSlides\",[])) for x in p)}')"
