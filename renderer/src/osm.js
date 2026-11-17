// Turns Overpass JSON into a deduplicated store of projected map features.
import { project } from './geo.js';
import { mergeCoast } from './coast.js';

export function areaClass(t) {
  if (t.building && t.building !== 'no') return 'building';
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.waterway === 'dock' || t.landuse === 'reservoir' || t.landuse === 'basin') return 'water';
  if (t.natural === 'glacier') return 'glacier';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'wood';
  if (t.natural === 'scrub' || t.natural === 'heath') return 'scrub';
  if (t.natural === 'wetland') return 'wetland';
  if (t.natural === 'beach' || t.natural === 'sand') return 'beach';
  if (t.natural === 'bare_rock' || t.natural === 'scree') return 'rock';
  if (t.landuse === 'cemetery') return 'cemetery';
  if (t.landuse === 'orchard' || t.landuse === 'vineyard') return 'orchard';
  if (t.landuse === 'residential') return 'residential';
  if (t.man_made && /^(pier|breakwater|groyne|quay)$/.test(t.man_made)) return 'pier';
  return null;
}

export function lineClass(t) {
  const hw = t.highway;
  if (hw) {
    if (/^(motorway|trunk|primary)(_link)?$/.test(hw)) return 'road1';
    if (/^(secondary|tertiary)(_link)?$/.test(hw)) return 'road2';
    if (/^(unclassified|residential|living_street|service|road|pedestrian)$/.test(hw)) return 'road3';
    if (/^(track|path|footway|bridleway|cycleway|steps)$/.test(hw)) return 'trail';
    return null;
  }
  if (t.railway && /^(rail|narrow_gauge|light_rail)$/.test(t.railway)) return 'rail';
  if (t.waterway === 'river' || t.waterway === 'canal') return 'river';
  if (t.waterway && /^(stream|ditch|drain)$/.test(t.waterway)) return 'stream';
  if (t.waterway === 'dam' || t.waterway === 'weir') return 'dam';
  if (t.natural === 'cliff') return 'cliff';
  if (t.man_made && /^(pier|breakwater|groyne|quay)$/.test(t.man_made)) return 'pier';
  if (t.natural === 'tree_row') return 'treerow';
  return null;
}

export function pointClass(t) {
  const p = t.place;
  if (p) return /^(city|town|village|hamlet|isolated_dwelling|locality|island|islet|archipelago|sea|ocean)$/.test(p) ? p : null;
  const n = t.natural;
  if (n) {
    // canals and rivers mapped as areas get no lake label (Venice has hundreds)
    if (n === 'water') return /^(canal|river|stream|ditch|drain|moat|lock|wastewater|fishpass)$/.test(t.water || '') ? null : 'lake';
    if (/^(peak|volcano|cave_entrance|spring|bay|cape|rock|strait|peninsula)$/.test(n)) return n;
  }
  const mm = t.man_made;
  if (mm && /^(lighthouse|windmill|watermill|tower)$/.test(mm)) return mm === 'watermill' ? 'windmill' : mm;
  const h = t.historic;
  if (h) {
    if (h === 'archaeological_site') return 'ruins';
    if (h === 'memorial') return 'monument';
    if (/^(castle|fort|wreck|ruins|monument)$/.test(h)) return h === 'fort' ? 'castle' : h;
  }
  if (t.amenity === 'place_of_worship') return 'worship';
  if (t.tourism === 'viewpoint') return 'viewpoint';
  return null;
}

const KEEP_TAGS = ['name', 'name:en', 'ele', 'wikipedia', 'place', 'natural', 'water', 'historic', 'man_made', 'highway', 'waterway', 'landuse', 'amenity', 'religion', 'population', 'operator'];
function pickTags(t) {
  const o = {};
  for (const k of KEEP_TAGS) if (t[k] != null) o[k] = t[k];
  return o;
}

function flatGeom(geometry) {
  const out = new Float64Array(geometry.length * 2);
  let n = 0;
  for (const g of geometry) {
    if (!g) continue;
    const [x, y] = project(g.lon, g.lat);
    out[n++] = x; out[n++] = y;
  }
  return n === out.length ? out : out.slice(0, n);
}

function bboxOf(arrs) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const a of arrs) for (let i = 0; i < a.length; i += 2) {
    const x = a[i], y = a[i + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Join relation member ways (arbitrary direction) into rings. */
export function joinRings(parts) {
  const key = (a, i) => `${Math.round(a[i] * 10)},${Math.round(a[i + 1] * 10)}`;
  const open = parts.filter((p) => p.length >= 4).map((p) => Array.from(p));
  const rings = [];
  while (open.length) {
    let cur = open.pop();
    let guard = 0;
    while (key(cur, 0) !== key(cur, cur.length - 2) && guard++ < 10000) {
      const head = key(cur, 0), tail = key(cur, cur.length - 2);
      let found = false;
      for (let i = 0; i < open.length; i++) {
        const c = open[i]; const cs = key(c, 0), ce = key(c, c.length - 2);
        const rev = (a) => { const r = []; for (let k = a.length - 2; k >= 0; k -= 2) r.push(a[k], a[k + 1]); return r; };
        if (cs === tail) cur = cur.concat(c.slice(2));
        else if (ce === tail) cur = cur.concat(rev(c).slice(2));
        else if (ce === head) cur = c.concat(cur.slice(2));
        else if (cs === head) cur = rev(c).concat(cur.slice(2));
        else continue;
        open.splice(i, 1); found = true; break;
      }
      if (!found) break;
    }
    if (key(cur, 0) === key(cur, cur.length - 2) && cur.length >= 8) rings.push(Float64Array.from(cur));
  }
  return rings;
}

export class OsmStore {
  constructor() {
    this.items = new Map();
    this.coast = new Map();
    this.version = 0;
    this._chains = null; this._chainsV = -1;
  }

  ingest(elements) {
    let changed = 0;
    for (const el of elements) {
      const t = el.tags || {};
      if (el.type !== 'node' && el.bounds && !el.geometry && !el.members) {
        // label output (`out bb`): a point for a named island, bay, lake... sized by its bounding box
        const cls = pointClass(t);
        if (!cls || !t.name) continue;
        const key = 'c' + el.type[0] + el.id;
        if (this.items.has(key)) continue;
        const b = el.bounds;
        const [x0, y0] = project(b.minlon, b.minlat), [x1, y1] = project(b.maxlon, b.maxlat);
        this.items.set(key, { key, kind: 'point', cls, name: t.name, tags: pickTags(t), x: (x0 + x1) / 2, y: (y0 + y1) / 2, size: Math.hypot(x1 - x0, y1 - y0), label: true });
        changed++;
        continue;
      }
      if (el.type === 'node') {
        if (el.lat == null) continue;
        const cls = pointClass(t); if (!cls) continue;
        const key = 'n' + el.id; if (this.items.has(key)) continue;
        const [x, y] = project(el.lon, el.lat);
        this.items.set(key, { key, kind: 'point', cls, name: t.name || null, tags: pickTags(t), x, y });
        changed++;
      } else if (el.type === 'way') {
        if (!el.geometry || el.geometry.length < 2) continue;
        if (t.natural === 'coastline') {
          if (!this.coast.has(el.id)) {
            const pts = flatGeom(el.geometry);
            this.coast.set(el.id, { id: el.id, a: el.nodes[0], b: el.nodes[el.nodes.length - 1], pts, bbox: bboxOf([pts]) });
            changed++;
          }
          continue;
        }
        const key = 'w' + el.id; if (this.items.has(key)) continue;
        const closed = el.nodes && el.nodes.length > 3 && el.nodes[0] === el.nodes[el.nodes.length - 1];
        const ac = closed ? areaClass(t) : null;
        const pts = flatGeom(el.geometry);
        if (ac) {
          this.items.set(key, { key, kind: 'area', cls: ac, name: t.name || null, tags: pickTags(t), rings: [pts], inner: [false], bbox: bboxOf([pts]) });
          changed++;
        } else {
          const lc = lineClass(t);
          if (!lc) continue;
          this.items.set(key, { key, kind: 'line', cls: lc, name: t.name || null, tags: pickTags(t), pts, bbox: bboxOf([pts]) });
          changed++;
        }
      } else if (el.type === 'relation') {
        if (!el.members) continue;
        const key = 'r' + el.id; if (this.items.has(key)) continue;
        const ac = areaClass(t); if (!ac) continue;
        const outer = [], inner = [];
        for (const m of el.members) {
          if (m.type !== 'way' || !m.geometry) continue;
          (m.role === 'inner' ? inner : outer).push(flatGeom(m.geometry));
        }
        const o = joinRings(outer), i = joinRings(inner);
        if (!o.length) continue;
        const rings = o.concat(i);
        this.items.set(key, { key, kind: 'area', cls: ac, name: t.name || null, tags: pickTags(t), rings, inner: rings.map((_, k) => k >= o.length), bbox: bboxOf(o) });
        changed++;
      }
    }
    if (changed) this.version++;
    return changed;
  }

  /** Call fn(item) for every feature whose bounds touch rect. */
  forEachIn(rect, fn) {
    for (const it of this.items.values()) {
      if (it.kind === 'point') {
        const r = it.size ? it.size / 2 : 0; // labelled features (bays, lakes...) count by their extent
        if (it.x + r >= rect.minX && it.x - r <= rect.maxX && it.y + r >= rect.minY && it.y - r <= rect.maxY) fn(it);
      } else {
        const b = it.bbox;
        if (b.minX <= rect.maxX && rect.minX <= b.maxX && b.minY <= rect.maxY && rect.minY <= b.maxY) fn(it);
      }
    }
  }

  coastChains() {
    if (this._chainsV !== this.version) {
      this._chains = mergeCoast([...this.coast.values()]);
      this._chainsV = this.version;
    }
    return this._chains;
  }
}
