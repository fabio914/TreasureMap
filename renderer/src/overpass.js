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
relation["landuse"~"^(forest|reservoir)$"];
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

/** Detail tiers, finest first. A tier is used when the view zoom is >= minZoom.
 *  Each cell is one request; coastCell is a coarser coastline-only layer that tells land
 *  from sea quickly (it's cheap) while the detail is still on its way. */
export const TIERS = [
  { key: 'detail', minZoom: 15.5, cell: 2048, coastCell: 16384, geom: DETAIL_GEOM, labels: LABELS },
  { key: 'regional', minZoom: 12.5, cell: 16384, coastCell: 131072, geom: REGIONAL_GEOM, labels: LABELS },
  { key: 'wide', minZoom: 0, cell: 131072, coastCell: 262144, geom: WIDE_GEOM, labels: WIDE_LABELS },
];
export const tierFor = (zoom) => TIERS.find((t) => zoom >= t.minZoom) || TIERS[TIERS.length - 1];

/** Public Overpass servers that allow requests from web pages (checked November 2026).
 *  Requests alternate between them, and a failed request is retried on the other one. */
export const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const CACHE_NAME = 'treasure-map-osm-v1';
const CACHE_DAYS = 30;

function cellsIn(cell, r) {
  const out = [];
  const i0 = Math.floor(r.minX / cell), i1 = Math.floor(r.maxX / cell);
  const j0 = Math.floor(r.minY / cell), j1 = Math.floor(r.maxY / cell);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j]);
  return out;
}
const host = (url) => { try { return new URL(url).host; } catch { return url; } };
const overlaps = (a, b) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

export class OverpassLoader {
  constructor(store, { endpoints = DEFAULT_ENDPOINTS, maxConcurrent = 2, cache = true, onData = () => {}, onStatus = () => {} } = {}) {
    this.store = store;
    this.endpoints = endpoints;
    this.maxConcurrent = maxConcurrent;
    this.useCache = cache && typeof caches !== 'undefined';
    this.onData = onData; this.onStatus = onStatus;
    this.layers = new Map();   // layerKey -> { cell, loaded: Set(cellKey), pending: Set(cellKey) }
    this.queue = [];
    this.active = 0;
    this.next = 0;             // round-robin over endpoints
    this.error = null;
    this.retryAt = 0;
    this.bytes = 0;
    this.focus = null;
  }

  _layer(l) {
    if (!this.layers.has(l.key)) this.layers.set(l.key, { cell: l.cell, loaded: new Set(), pending: new Set() });
    return this.layers.get(l.key);
  }

  /** Make sure everything needed to draw this view is loaded or on its way. */
  ensure(view) {
    const tier = tierFor(view.zoom);
    this.focus = view.bounds(Math.max(view.width, view.height));
    // the cheap coastline layer first, then the detail for this zoom
    this._need({ key: 'coast' + tier.coastCell, cell: tier.coastCell, geom: COAST_GEOM, labels: '', coast: true }, view.bounds(0));
    this._need({ key: tier.key, cell: tier.cell, geom: tier.geom, labels: tier.labels }, view.bounds(60));
    // forget queued requests for places we've left
    this.queue = this.queue.filter((job) => {
      const keep = overlaps(job.rect, this.focus);
      if (!keep) this._layer(job.layer).pending.delete(job.cellKey);
      return keep;
    });
    this._pump();
    this._status();
  }

  /**
   * The loaded cells covering rect, as disjoint world rectangles (coarsest first; a finer cell
   * inside a coarser loaded one is skipped). Every loaded layer includes the coastline, so land
   * and sea are known inside each of them.
   */
  surveyed(rect) {
    const layers = [...this.layers.values()].sort((a, b) => b.cell - a.cell);
    const out = [];
    for (const L of layers) {
      if (!L.loaded.size) continue;
      for (const [i, j] of cellsIn(L.cell, rect)) {
        if (!L.loaded.has(i + ',' + j)) continue;
        const r = { minX: i * L.cell, minY: j * L.cell, maxX: (i + 1) * L.cell, maxY: (j + 1) * L.cell };
        if (out.some((o) => r.minX >= o.minX && r.maxX <= o.maxX && r.minY >= o.minY && r.maxY <= o.maxY)) continue;
        out.push(r);
      }
    }
    return out;
  }

  get busy() { return this.active > 0 || this.queue.length > 0 || [...this.layers.values()].some((L) => L.pending.size); }

  _need(layer, rect) {
    const L = this._layer(layer);
    let cells = cellsIn(layer.cell, rect);
    if (cells.length > 40) return; // far too much for one view; the controller's zoom limit should prevent this
    for (const [i, j] of cells) {
      const k = i + ',' + j;
      if (L.loaded.has(k) || L.pending.has(k)) continue;
      L.pending.add(k);
      const r = { minX: i * layer.cell, maxX: (i + 1) * layer.cell, minY: j * layer.cell, maxY: (j + 1) * layer.cell };
      this.queue.push({ layer, cellKey: k, rect: r, tries: 0 });
    }
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
    if (!this.focus) return;
    const fx = (this.focus.minX + this.focus.maxX) / 2, fy = (this.focus.minY + this.focus.maxY) / 2;
    // coastline cells first (they decide land and sea), then nearest to the centre of the view
    this.queue.sort((a, b) => (a.layer.coast ? 0 : 1) - (b.layer.coast ? 0 : 1) || dist(a.rect, fx, fy) - dist(b.rect, fx, fy));
    while (this.active < this.maxConcurrent && this.queue.length) this._run(this.queue.shift());
  }

  _cacheKey(job) { return `${location.origin}/__treasure-map-cache/${job.layer.key}/${job.cellKey}`; }

  async _fromCache(job) {
    if (!this.useCache) return null;
    // a cache that is slow to answer must never hold up the survey
    return Promise.race([this._readCache(job), new Promise((r) => setTimeout(() => r(null), 1500))]);
  }

  async _readCache(job) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(this._cacheKey(job));
      if (!hit) return null;
      const saved = +hit.headers.get('x-saved') || 0;
      if (Date.now() - saved > CACHE_DAYS * 864e5) return null;
      return await hit.text();
    } catch { return null; }
  }

  async _toCache(job, text) {
    if (!this.useCache) return;
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(this._cacheKey(job), new Response(text, { headers: { 'content-type': 'application/json', 'x-saved': String(Date.now()) } }));
    } catch { /* storage full or unavailable: carry on without it */ }
  }

  async _run(job) {
    this.active++; this._status();
    const L = this._layer(job.layer);
    const ep = job.ep ?? this.next++ % this.endpoints.length;
    const url = this.endpoints[ep % this.endpoints.length];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      let text = await this._fromCache(job), fresh = false;
      if (text == null) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(this._query(job)),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`${host(url)} answered ${res.status}${res.status === 429 ? ' (too many requests)' : res.status >= 502 ? ' (busy)' : ''}`);
        text = await res.text();
        fresh = true;
      }
      const json = JSON.parse(text);
      if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) throw new Error(`${host(url)}: ${json.remark}`);
      this.store.ingest(json.elements || []);
      if (fresh) { this.bytes += text.length; this._toCache(job, text); }
      L.pending.delete(job.cellKey); L.loaded.add(job.cellKey);
      this.error = null;
      this.onData(job);
    } catch (err) {
      // keep trying, on the other server, backing off up to 30 s
      job.tries++;
      job.ep = ep + 1;
      this.error = err.name === 'AbortError' ? `${host(url)} took too long to answer` : (err.message || String(err));
      const wait = Math.min(30000, 2000 * 2 ** Math.min(job.tries, 4)) * (0.75 + Math.random() * 0.5);
      this.retryAt = Date.now() + wait;
      setTimeout(() => {
        if (this.focus && overlaps(job.rect, this.focus)) this.queue.push(job);
        else L.pending.delete(job.cellKey);
        this._pump(); this._status();
      }, wait);
    } finally {
      clearTimeout(timer);
      this.active--;
      this._pump();
      this._status();
    }
  }

  _status() {
    const waiting = [...this.layers.values()].reduce((n, L) => n + L.pending.size, 0);
    this.onStatus({
      active: this.active, queued: this.queue.length, waiting,
      error: this.error, retryIn: this.error ? Math.max(0, Math.round((this.retryAt - Date.now()) / 1000)) : 0,
      bytes: this.bytes, features: this.store.items.size + this.store.coast.size,
    });
  }
}

function dist(r, x, y) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX), dy = Math.max(r.minY - y, 0, y - r.maxY);
  return dx * dx + dy * dy;
}
