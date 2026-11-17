#!/usr/bin/env bash
# Download raw OpenStreetMap extracts for each island from the Overpass API.
# Usage: scripts/fetch_osm.sh [output-dir]   (default: osm/)
set -euo pipefail
OUT="${1:-osm}"
mkdir -p "$OUT"
ENDPOINT="${OVERPASS_URL:-https://overpass-api.de/api/interpreter}"

fetch() {
  local name=$1 bbox=$2
  local q="[out:json][timeout:60];(way[\"natural\"=\"coastline\"]($bbox);way[\"highway\"]($bbox);way[\"building\"]($bbox);way[\"natural\"~\"water|wood|beach|scrub|wetland|bare_rock|cliff\"]($bbox);way[\"landuse\"~\"forest|grass|meadow|farmland\"]($bbox);way[\"waterway\"]($bbox);node[\"name\"]($bbox);way[\"name\"]($bbox);relation[\"natural\"=\"water\"]($bbox);relation[\"place\"~\"island|islet\"]($bbox););out geom;"
  for i in 1 2 3 4 5; do
    curl -s -A "treasure-map-renderer/1.0" --data-urlencode "data=$q" "$ENDPOINT" -o "$OUT/$name.json"
    if head -c 5 "$OUT/$name.json" | grep -q "{"; then echo "$name: $(wc -c < "$OUT/$name.json") bytes"; return; fi
    echo "$name: Overpass busy, retrying in $((i * 10))s" >&2; sleep $((i * 10))
  done
  echo "$name: failed" >&2; exit 1
}

# bbox order is south,west,north,east (must match ISLANDS in process.py)
fetch oak       "44.503,-64.312,44.524,-64.278"
fetch gardiners "41.05,-72.13,41.13,-72.06"
fetch norman    "18.300,-64.645,18.335,-64.590"
fetch cocos     "5.49,-87.12,5.57,-87.02"
