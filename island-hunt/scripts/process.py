import json, math, sys, os

OSM = sys.argv[1]
OUT = sys.argv[2]

ISLANDS = [
    # key, file, bbox (S, W, N, E), display name, main-island name used to skip duplicate label
    ("oak", "oak.json", (44.503, -64.312, 44.524, -64.278), "Oak Island", "Oak Island"),
    ("gardiners", "gardiners.json", (41.05, -72.13, 41.13, -72.06), "Gardiners Island", "Gardiners Island"),
    ("norman", "norman.json", (18.300, -64.645, 18.335, -64.590), "Norman Island", "Norman Island"),
    ("cocos", "cocos.json", (5.49, -87.12, 5.57, -87.02), "Isla del Coco", "Isla del Coco"),
]

SKIP_NAME_SUBSTR = ["territorial waters", "Hannah Bay, Tortola", "Underground Drainage", "Compostera", "Bodega", "COVI",
                    "Estación de Bomberos", "Plaza Deportes", "Puente", "Represa", "Villa Beatriz", "Nolan Cottage",
                    "Blankenship", "Research Center", "Resort and Conference", "Inn and Conference", "Chester Islands",
                    "women of Oak", "Southernmost point", "Bell Aliant", "Proyecto Hidro", "Oak Island memorial", "Estación de Guardaparques", "Coffers Dam (remains)"]


def dp(points, tol):
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]; bx, by = points[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-12
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L if (dx or dy) else math.hypot(px - ax, py - ay)
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack.append((a, bi)); stack.append((bi, b))
    return [p for p, k in zip(points, keep) if k]


def merge_chains(chains):
    """chains: list of lists of hashable-point tuples; join end-to-start."""
    chains = [list(c) for c in chains if len(c) >= 2]
    changed = True
    while changed:
        changed = False
        starts = {}
        for i, c in enumerate(chains):
            if c[0] != c[-1]:
                starts.setdefault(c[0], i)
        for i, c in enumerate(chains):
            if c is None or c[0] == c[-1]:
                continue
            j = starts.get(c[-1])
            if j is not None and j != i and chains[j] is not None and chains[j][0] == c[-1]:
                chains[i] = c + chains[j][1:]
                chains[j] = None
                changed = True
                break
        chains = [c for c in chains if c is not None]
    return chains


def merge_any_direction(chains):
    """For relation members whose direction is arbitrary."""
    chains = [list(c) for c in chains if len(c) >= 2]
    out = []
    while chains:
        cur = chains.pop()
        grew = True
        while grew and cur[0] != cur[-1]:
            grew = False
            for i, c in enumerate(chains):
                if c[0] == cur[-1]: cur = cur + c[1:]
                elif c[-1] == cur[-1]: cur = cur + c[::-1][1:]
                elif c[-1] == cur[0]: cur = c + cur[1:]
                elif c[0] == cur[0]: cur = c[::-1] + cur[1:]
                else: continue
                chains.pop(i); grew = True; break
        out.append(cur)
    return out


def clip_polyline(pts, S, W, N, E):
    """Split a polyline into pieces inside bbox; returns list of (points, starts_on_edge, ends_on_edge)."""
    def inside(p): return W <= p[0] <= E and S <= p[1] <= N

    def seg_clip(p, q):
        # Liang-Barsky, returns (t0, t1) or None
        x0, y0 = p; dx, dy = q[0] - x0, q[1] - y0
        t0, t1 = 0.0, 1.0
        for pp, qq in ((-dx, x0 - W), (dx, E - x0), (-dy, y0 - S), (dy, N - y0)):
            if pp == 0:
                if qq < 0: return None
            else:
                r = qq / pp
                if pp < 0:
                    if r > t1: return None
                    t0 = max(t0, r)
                else:
                    if r < t0: return None
                    t1 = min(t1, r)
        return t0, t1

    pieces = []
    cur = None
    for i in range(len(pts) - 1):
        p, q = pts[i], pts[i + 1]
        r = seg_clip(p, q)
        if r is None:
            if cur: pieces.append(cur); cur = None
            continue
        t0, t1 = r
        a = (p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0)
        b = (p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1)
        if cur is None:
            cur = [a]
        cur.append(b)
        if t1 < 1.0:
            pieces.append(cur); cur = None
    if cur: pieces.append(cur)
    return pieces


def perim_t(p, S, W, N, E):
    x, y = p; eps = 1e-9
    if abs(y - S) < eps: return 0 + (x - W) / (E - W)
    if abs(x - E) < eps: return 1 + (y - S) / (N - S)
    if abs(y - N) < eps: return 2 + (E - x) / (E - W)
    if abs(x - W) < eps: return 3 + (N - y) / (N - S)
    return None


def corner(k, S, W, N, E):
    return [(E, S), (E, N), (W, N), (W, S)][k % 4]  # corner reached at t = 1,2,3,4


def close_with_bbox(pieces, S, W, N, E):
    pcs = []
    loose = []
    for pts in pieces:
        te, tx = perim_t(pts[0], S, W, N, E), perim_t(pts[-1], S, W, N, E)
        if te is None or tx is None:
            loose.append(pts)
        else:
            pcs.append({"pts": pts, "te": te, "tx": tx, "used": False})
    rings = []
    for start in pcs:
        if start["used"]: continue
        ring = []
        cur = start
        guard = 0
        while True:
            guard += 1
            if guard > 500: break
            cur["used"] = True
            ring.extend(cur["pts"])
            tx = cur["tx"]
            # next entry going CCW from tx
            best, bd = None, 9
            for c in pcs:
                if c["used"] and c is not start: continue
                d = (c["te"] - tx) % 4
                if d < 1e-12 and c is start and len(pcs) > 1 and not all(o["used"] for o in pcs if o is not start):
                    pass
                if d < bd: bd, best = d, c
            # add corners between tx and best.te
            t = tx; target = tx + bd
            k = math.floor(t) + 1
            while k < target:
                ring.append(corner(k - 1, S, W, N, E))
                k += 1
            if best is start or best is None:
                ring.append(ring[0])
                break
            cur = best
        rings.append(ring)
    return rings, loose


def ring_area(r):
    a = 0
    for i in range(len(r) - 1):
        a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return a / 2


def process(key, fname, bbox, title, mainname):
    S, W, N, E = bbox
    data = json.load(open(os.path.join(OSM, fname)))
    lat0 = (S + N) / 2
    kx = math.cos(math.radians(lat0)) * 111320.0
    ky = 110574.0
    width_m = (E - W) * kx
    height_m = (N - S) * ky
    tol = width_m / 2500

    def proj(lon, lat):
        return ((lon - W) * kx, (N - lat) * ky)

    def P(pts, closed=False, t=tol):
        q = [proj(x, y) for x, y in pts]
        q = dp(q, t)
        return [[round(x, 1), round(y, 1)] for x, y in q]

    coast = []
    out = {"key": key, "title": title, "bbox": [S, W, N, E], "w": round(width_m, 1), "h": round(height_m, 1),
           "land": [], "coastLoose": [], "water": [], "wood": [], "scrub": [], "wetland": [], "beach": [], "rock": [],
           "cliff": [], "streams": [], "roads": [], "trails": [], "buildings": [], "labels": []}

    seen_label = set()
    for el in data["elements"]:
        t = el.get("tags", {})
        geom = el.get("geometry")
        if el["type"] == "way" and geom:
            pts = [(g["lon"], g["lat"]) for g in geom]
            closed = el["nodes"][0] == el["nodes"][-1]
            nat, lu, hw, ww = t.get("natural"), t.get("landuse"), t.get("highway"), t.get("waterway")
            if nat == "coastline":
                coast.append([(g["lon"], g["lat"]) for g in geom])
            elif "building" in t:
                out["buildings"].append(P(pts, t=tol * 0.3))
            elif hw:
                if hw in ("track", "path", "footway", "bridleway", "steps", "cycleway", "pedestrian"):
                    out["trails"].append(P(pts))
                else:
                    out["roads"].append({"c": 1 if hw in ("primary", "secondary", "trunk", "tertiary") else 0, "p": P(pts)})
            elif nat == "water" and closed:
                out["water"].append(P(pts, t=tol * 0.6))
            elif (nat == "wood" or lu == "forest") and closed:
                out["wood"].append(P(pts))
            elif nat == "scrub" and closed:
                out["scrub"].append(P(pts))
            elif nat == "wetland" and closed:
                out["wetland"].append(P(pts))
            elif nat in ("beach",) and closed:
                out["beach"].append(P(pts, t=tol * 0.6))
            elif nat == "bare_rock" and closed:
                out["rock"].append(P(pts))
            elif nat == "cliff":
                out["cliff"].append(P(pts))
            elif ww in ("stream", "river", "canal", "ditch", "drain"):
                out["streams"].append({"r": 1 if ww == "river" else 0, "p": P(pts)})
        elif el["type"] == "relation" and t.get("natural") == "water":
            outers = [[(g["lon"], g["lat"]) for g in m["geometry"]] for m in el.get("members", [])
                      if m.get("role") == "outer" and m.get("geometry")]
            for r in merge_any_direction(outers):
                if r[0] == r[-1]:
                    out["water"].append(P(r, t=tol * 0.6))

        # labels
        name = t.get("name")
        if not name or any(s in name for s in SKIP_NAME_SUBSTR): continue
        if "highway" in t or t.get("waterway") in ("stream", "canal", "ditch", "drain"): continue
        if name == mainname or name == title: continue
        if t.get("place") == "island" and el["type"] == "relation": continue
        nat = t.get("natural"); place = t.get("place")
        if nat in ("peak", "volcano", "hill"): kind = "peak"
        elif nat == "bay": kind = "bay"
        elif nat == "cape": kind = "cape"
        elif place in ("islet", "island") or name.startswith(("Isla ", "Round Island")): kind = "isle"
        elif nat == "water": kind = "lake"
        elif t.get("waterway") == "river": kind = "river"
        elif nat == "shoal": kind = "shoal"
        elif place in ("village", "hamlet", "town", "locality"): kind = "place"
        elif nat in ("bare_rock",): kind = "rock"
        else: kind = "poi"
        if el["type"] == "node":
            lon, lat = el["lon"], el["lat"]
        elif geom:
            if kind == "river":
                g = geom[len(geom) // 2]; lon, lat = g["lon"], g["lat"]
            else:
                lon = sum(g["lon"] for g in geom) / len(geom); lat = sum(g["lat"] for g in geom) / len(geom)
        elif "bounds" in el:
            b = el["bounds"]; lon = (b["minlon"] + b["maxlon"]) / 2; lat = (b["minlat"] + b["maxlat"]) / 2
        else:
            continue
        if not (S <= lat <= N and W <= lon <= E): continue
        name = name.replace("Gardiners Island Two ", "").replace("Gardiners Island ", "").replace("Oak Island Interpretive Center", "Interpretive Centre")
        if name in seen_label: continue
        seen_label.add(name)
        x, y = proj(lon, lat)
        sub = t.get("man_made") or t.get("historic") or t.get("amenity") or t.get("tourism") or ""
        out["labels"].append({"n": name, "k": kind, "s": sub, "x": round(x, 1), "y": round(y, 1)})

    # coastline -> land polygons
    chains = merge_chains([[tuple(p) for p in c] for c in coast])
    pieces = []
    for c in chains:
        if c[0] == c[-1]:
            if ring_area(c) < 0:  # clockwise in lon/lat => water ring (shouldn't happen for islands)
                out["coastLoose"].append(P(c))
            else:
                out["land"].append(P(c, t=tol * 0.6))
        else:
            pieces.extend(clip_polyline(c, S, W, N, E))
    rings, loose = close_with_bbox(pieces, S, W, N, E)
    for r in rings:
        out["land"].append(P(r, t=tol * 0.6))
    for l in loose:
        out["coastLoose"].append(P(l))
    # keep only lakes whose centre is on land (OSM tags tidal water as natural=water too)
    def pip(pt, ring):
        x, y = pt; inside = False
        for i in range(len(ring) - 1):
            (x1, y1), (x2, y2) = ring[i], ring[i + 1]
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): inside = not inside
        return inside
    def on_land(r):
        cx = sum(p[0] for p in r) / len(r); cy = sum(p[1] for p in r) / len(r)
        return any(pip((cx, cy), L) for L in out["land"])
    out["water"] = [r for r in out["water"] if on_land(r)]
    # drop degenerate
    for k in ("land", "water", "wood", "scrub", "wetland", "beach", "rock", "buildings"):
        out[k] = [r for r in out[k] if len(r) >= 3]
    return out


result = {}
for key, fname, bbox, title, mainname in ISLANDS:
    o = process(key, fname, bbox, title, mainname)
    result[key] = o
    print(key, {k: (len(v) if isinstance(v, list) else v) for k, v in o.items() if k not in ("key", "title")}, file=sys.stderr)
    print("   labels:", [(l["n"], l["k"]) for l in o["labels"]], file=sys.stderr)
    areas = sorted([abs(ring_area(r)) for r in o["land"]], reverse=True)[:5]
    print("   land areas m2:", [round(a) for a in areas], file=sys.stderr)

with open(OUT, "w") as f:
    json.dump(result, f, separators=(",", ":"), ensure_ascii=False)
print("bytes", os.path.getsize(OUT), file=sys.stderr)
