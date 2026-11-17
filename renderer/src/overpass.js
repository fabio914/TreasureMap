// Loads OpenStreetMap data from the Overpass API for the area in view.
// Space is divided into square cells (in Mercator metres); each detail tier
// has its own cell size and query. Missing cells around the view are fetched
// together in one request, at most `maxConcurrent` requests at a time.
import { unproject } from './geo.js';

const DETAIL_GEOM = `
way["natural"="coastline"];
way["highway"];
way["railway"~"^(rail|narrow_gauge|light_rail)$"];
way["building"];
way["natural"~"^(water|wood|scrub|heath|wetland|beach|sand|bare_rock|scree|cliff|glacier|tree_row)$"];
way["landuse"~"^(forest|reservoir|basin|cemetery|orchard|vineyard)$"];
way["waterway"~"^(river|canal|stream|ditch|drain|riverbank|dock|dam|weir)$"];
way["man_made"~"^(pier|breakwater|groyne|quay)$"];
relation["natural"~"^(water|wood|scrub|heath|wetland|beach|sand|bare_rock|glacier)$"];
relation["landuse"~"^(forest|reservoir|basin)$"];
relation["waterway"="riverbank"];
node["place"];
node["natural"~"^(peak|volcano|cave_entrance|spring|bay|cape|rock|strait)$"];
node["man_made"~"^(lighthouse|windmill|watermill)$"];
node["man_made"="tower"]["name"];
node["historic"~"^(castle|fort|wreck|ruins|monument|archaeological_site)$"];
node["historic"="memorial"]["name"];
node["amenity"="place_of_worship"];
node["tourism"="viewpoint"];`;

const REGIONAL_GEOM = `
way["natural"="coastline"];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"];
way["railway"="rail"];
way["natural"~"^(water|wood|scrub|heath|wetland|beach|sand|bare_rock|glacier|cliff)$"];
way["landuse"~"^(forest|reservoir|residential)$"];
way["waterway"~"^(river|canal|riverbank)$"];
relation["natural"~"^(water|wood|scrub|heath|wetland|glacier)$"];
relation["landuse"~"^(forest|reservoir|residential)$"];
relation["waterway"="riverbank"];
node["place"~"^(city|town|village|hamlet|island|islet|archipelago|sea|ocean)$"];
node["natural"~"^(peak|volcano|bay|cape|strait)$"]["name"];
node["man_made"="lighthouse"];
node["historic"~"^(castle|fort|wreck)$"];`;

const WIDE_GEOM = `
way["natural"="coastline"];
way["highway"~"^(motorway|trunk)$"];
way["waterway"="river"];
way["natural"~"^(water|glacier)$"]["name"];
relation["natural"~"^(water|glacier)$"]["name"];
node["place"~"^(city|town|village|island|archipelago|sea|ocean)$"];
node["natural"~"^(peak|volcano)$"]["name"]["ele"];
node["man_made"="lighthouse"];`;

const COAST_GEOM = `way["natural"="coastline"];`;

// Named things fetched as bounding boxes only (`out bb`): the box gives a label
// position and a size, so large islands or lakes cost a few bytes instead of their outline.
const LABELS = `
way["place"~"^(island|islet|archipelago)$"]["name"];
relation["place"~"^(island|islet|archipelago)$"]["name"];
way["natural"~"^(bay|cape|peninsula|strait|water)$"]["name"];
relation["natural"~"^(bay|strait|peninsula|water)$"]["name"];
way["historic"~"^(castle|fort)$"]["name"];`;

const WIDE_LABELS = `
relation["place"~"^(island|archipelago)$"]["name"];
way["place"="island"]["name"];
relation["natural"~"^(bay|strait)$"]["name"];
way["natural"~"^(bay|strait)$"]["name"];`;

/** Detail tiers, finest first. A tier is used when the view zoom is >= minZoom. */
export const TIERS = [
  { key: 'detail', minZoom: 15.5, cell: 1024, coastCell: 16384, geom: DETAIL_GEOM, labels: LABELS },
  { key: 'regional', minZoom: 12.5, cell: 8192, coastCell: 131072, geom: REGIONAL_GEOM, labels: LABELS },
  { key: 'wide', minZoom: 0, cell: 65536, coastCell: 262144, geom: WIDE_GEOM, labels: WIDE_LABELS },
];
export const tierFor = (zoom) => TIERS.find((t) => zoom >= t.minZoom) || TIERS[TIERS.length - 1];

export const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function cellsIn(cell, r) {
  const out = [];
  const i0 = Math.floor(r.minX / cell), i1 = Math.floor(r.maxX / cell);
  const j0 = Math.floor(r.minY / cell), j1 = Math.floor(r.maxY / cell);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j]);
  return out;
}

export class OverpassLoader {
  constructor(store, { endpoints = DEFAULT_ENDPOINTS, maxConcurrent = 2, onData = () => {}, onStatus = () => {} } = {}) {
    this.store = store;
    this.endpoints = endpoints;
    this.maxConcurrent = maxConcurrent;
    this.onData = onData; this.onStatus = onStatus;
    this.loaded = new Map();   // layerKey -> Set(cellKey)
    this.pending = new Map();  // layerKey -> Set(cellKey)
    this.queue = [];
    this.active = 0;
    this.endpointIndex = 0;
    this.error = null;
    this.bytes = 0;
  }

  _set(map, key) { if (!map.has(key)) map.set(key, new Set()); return map.get(key); }

  /** Make sure everything needed to draw this view is loaded or on its way. */
  ensure(view) {
    const tier = tierFor(view.zoom);
    const margin = Math.max(view.width * 0.12, 160);
    this.focus = view.bounds(margin * 3);
    this._need({ key: tier.key, cell: tier.cell, geom: tier.geom, labels: tier.labels }, view.bounds(margin), view.bounds(0));
    // a coarse coastline-only layer tells land from sea when no coast crosses the view
    this._need({ key: 'coast' + tier.coastCell, cell: tier.coastCell, geom: COAST_GEOM, labels: '' }, view.bounds(0), view.bounds(0));
    // forget queued requests for places we've left
    this.queue = this.queue.filter((job) => {
      const keep = job.rect.minX <= this.focus.maxX && this.focus.minX <= job.rect.maxX && job.rect.minY <= this.focus.maxY && this.focus.minY <= job.rect.maxY;
      if (!keep) { const p = this._set(this.pending, job.layer.key); job.cells.forEach((c) => p.delete(c)); }
      return keep;
    });
    this._pump();
    this._status();
  }

  /** True when the coastline for rect has been loaded (so land and sea can be drawn correctly). */
  coastReady(view, marginPx = 130) {
    const tier = tierFor(view.zoom);
    return this._covered(tier.key, tier.cell, view.bounds(marginPx)) || this._covered('coast' + tier.coastCell, tier.coastCell, view.bounds(marginPx));
  }

  get busy() { return this.active > 0 || this.queue.length > 0; }

  _covered(key, cell, r) {
    const done = this.loaded.get(key); if (!done) return false;
    return cellsIn(cell, r).every(([i, j]) => done.has(i + ',' + j));
  }

  _need(layer, rect, core) {
    const done = this._set(this.loaded, layer.key), pend = this._set(this.pending, layer.key);
    let cells = cellsIn(layer.cell, rect).filter(([i, j]) => !done.has(i + ',' + j) && !pend.has(i + ',' + j));
    if (cells.length > 30) cells = cellsIn(layer.cell, core).filter(([i, j]) => !done.has(i + ',' + j) && !pend.has(i + ',' + j));
    if (!cells.length) return;
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
    for (const [i, j] of cells) { i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
    const keys = cells.map(([i, j]) => i + ',' + j);
    keys.forEach((k) => pend.add(k));
    const r = { minX: i0 * layer.cell, maxX: (i1 + 1) * layer.cell, minY: j0 * layer.cell, maxY: (j1 + 1) * layer.cell };
    this.queue.push({ layer, cells: keys, rect: r, tries: 0 });
  }

  _query(job) {
    const [w, s] = unproject(job.rect.minX, job.rect.minY);
    const [e, n] = unproject(job.rect.maxX, job.rect.maxY);
    const bb = [s, w, n, e].map((v) => v.toFixed(6)).join(',');
    let q = `[out:json][timeout:90][bbox:${bb}];(${job.layer.geom});out geom qt;`;
    if (job.layer.labels) q += `(${job.layer.labels});out bb tags qt;`;
    return q;
  }

  _pump() {
    while (this.active < this.maxConcurrent && this.queue.length) {
      // nearest job to the view first
      const fx = (this.focus.minX + this.focus.maxX) / 2, fy = (this.focus.minY + this.focus.maxY) / 2;
      this.queue.sort((a, b) => dist(a.rect, fx, fy) - dist(b.rect, fx, fy));
      this._run(this.queue.shift());
    }
  }

  async _run(job) {
    this.active++; this._status();
    const url = this.endpoints[this.endpointIndex % this.endpoints.length];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(this._query(job)),
        signal: ctrl.signal,
      });
      if (!res.ok) throw Object.assign(new Error(`Overpass answered ${res.status}`), { status: res.status });
      const text = await res.text();
      this.bytes += text.length;
      const json = JSON.parse(text);
      if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) throw new Error('Overpass: ' + json.remark);
      this.store.ingest(json.elements || []);
      const done = this._set(this.loaded, job.layer.key), pend = this._set(this.pending, job.layer.key);
      job.cells.forEach((c) => { pend.delete(c); done.add(c); });
      this.error = null;
      this.onData(job);
    } catch (err) {
      const pend = this._set(this.pending, job.layer.key);
      job.tries++;
      this.endpointIndex++;
      this.error = err.name === 'AbortError' ? 'Overpass took too long to answer' : err.message || String(err);
      if (job.tries < 5) {
        const wait = Math.min(30000, 2000 * 2 ** job.tries);
        setTimeout(() => { this.queue.push(job); this._pump(); this._status(); }, wait);
      } else {
        job.cells.forEach((c) => pend.delete(c));
      }
    } finally {
      clearTimeout(timer);
      this.active--;
      this._pump();
      this._status();
    }
  }

  _status() {
    this.onStatus({ active: this.active, queued: this.queue.length, error: this.error, bytes: this.bytes, features: this.store.items.size + this.store.coast.size });
  }
}

function dist(r, x, y) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX), dy = Math.max(r.minY - y, 0, y - r.maxY);
  return dx * dx + dy * dy;
}
