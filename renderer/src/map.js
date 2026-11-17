// TreasureMap: an interactive, pannable and zoomable treasure-chart view of
// live OpenStreetMap data.
//
//   const map = new TreasureMap(document.getElementById('map'), { center: [-64.29, 44.51], zoom: 15.5 });
//   map.addEventListener('select', (e) => console.log(e.detail));
//
// Events (CustomEvent, data in e.detail): 'status' (loader progress), 'render',
// 'moveend' ({ lon, lat, zoom }), 'select' ({ item, lon, lat } or { item: null }).
import { View, project, unproject, resForZoom, zoomForRes } from './geo.js';
import { OsmStore } from './osm.js';
import { OverpassLoader, DEFAULT_ENDPOINTS } from './overpass.js';
import { TreasureRenderer } from './renderer.js';
import { hudLayout, drawHud } from './hud.js';
import { clamp } from './util.js';

const KIND_NAMES = {
  city: 'City', town: 'Town', village: 'Village', hamlet: 'Hamlet', isolated_dwelling: 'Dwelling', locality: 'Locality',
  island: 'Island', islet: 'Islet', archipelago: 'Archipelago', sea: 'Sea', ocean: 'Ocean', bay: 'Bay', strait: 'Strait',
  lake: 'Water', peninsula: 'Peninsula', peak: 'Peak', volcano: 'Volcano', cape: 'Cape', lighthouse: 'Lighthouse',
  castle: 'Castle or fort', wreck: 'Shipwreck', ruins: 'Ruins', monument: 'Monument', windmill: 'Mill', tower: 'Tower',
  worship: 'Place of worship', viewpoint: 'Viewpoint', cave_entrance: 'Cave', spring: 'Spring', rock: 'Rock',
  water: 'Water', wood: 'Woods', scrub: 'Scrubland', wetland: 'Marsh', beach: 'Beach', glacier: 'Glacier', building: 'Building',
  residential: 'Settlement', cemetery: 'Cemetery', orchard: 'Orchard', pier: 'Pier', road1: 'Highway', road2: 'Road', road3: 'Street',
  trail: 'Trail', rail: 'Railway', river: 'River', stream: 'Stream', cliff: 'Cliff', dam: 'Dam',
};
export const kindName = (cls) => KIND_NAMES[cls] || cls;

export class TreasureMap extends EventTarget {
  constructor(container, opts = {}) {
    super();
    this.opts = { center: [-64.2935, 44.5135], zoom: 15.5, minZoom: 10, maxZoom: 19, endpoints: DEFAULT_ENDPOINTS, backdrop: '#0f1d1c', popup: true, ...opts };
    this.container = container;
    container.classList.add('tm-root');
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    Object.assign(container.style, { overflow: 'hidden', touchAction: 'none' });
    this.canvas = document.createElement('canvas');
    this.hud = document.createElement('canvas');
    for (const cv of [this.canvas, this.hud]) Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    this.hud.style.pointerEvents = 'none';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Treasure chart. Drag to pan, scroll or pinch to zoom, click a feature for details.');
    container.append(this.canvas, this.hud);
    this.ctx = this.canvas.getContext('2d');
    this.hudCtx = this.hud.getContext('2d');
    this.frame = document.createElement('canvas');
    this.frameCtx = this.frame.getContext('2d');
    if (this.opts.popup) {
      this.popup = document.createElement('div');
      this.popup.className = 'tm-popup'; this.popup.hidden = true;
      container.append(this.popup);
    }

    const [cx, cy] = project(...this.opts.center);
    this.cx = cx; this.cy = cy; this.res = resForZoom(clamp(this.opts.zoom, this.opts.minZoom, this.opts.maxZoom));
    this.store = new OsmStore();
    this.loader = new OverpassLoader(this.store, {
      endpoints: this.opts.endpoints,
      onData: () => this._dataArrived(),
      onStatus: (s) => this._emit('status', s),
    });
    this.renderer = new TreasureRenderer();
    this.frameView = null;
    this.last = null;
    this._bind();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(container);
    this._resize();
  }

  // ---- public API ----
  get view() { return new View({ width: this.w, height: this.h, cx: this.cx, cy: this.cy, res: this.res }); }
  getCenter() { return unproject(this.cx, this.cy); }
  getZoom() { return zoomForRes(this.res); }
  setView(lon, lat, zoom = this.getZoom()) {
    [this.cx, this.cy] = project(lon, lat);
    this.res = resForZoom(clamp(zoom, this.opts.minZoom, this.opts.maxZoom));
    this._closePopup();
    this._renderNow();
  }
  zoomBy(factor, sx = this.w / 2, sy = this.h / 2) {
    const v = this.view;
    const [wx, wy] = v.world(sx, sy);
    const z = clamp(zoomForRes(this.res / factor), this.opts.minZoom, this.opts.maxZoom);
    this.res = resForZoom(z);
    this.cx = wx - (sx - this.w / 2) * this.res;
    this.cy = wy + (sy - this.h / 2) * this.res;
    this._moved();
  }
  panBy(dx, dy) { this.cx -= dx * this.res; this.cy += dy * this.res; this._moved(); }
  destroy() { this._ro.disconnect(); this.container.replaceChildren(); }

  // ---- rendering ----
  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  _resize() {
    const r = this.container.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.round(r.width)); this.h = Math.max(1, Math.round(r.height));
    for (const cv of [this.canvas, this.hud, this.frame]) { cv.width = Math.round(this.w * this.dpr); cv.height = Math.round(this.h * this.dpr); }
    this._renderNow();
  }

  _renderNow() {
    clearTimeout(this._settleTimer); clearTimeout(this._dataTimer);
    const v = this.view;
    this.loader.ensure(v);
    const layout = hudLayout(this.w, this.h);
    let res;
    try {
      res = this.renderer.render(this.frameCtx, v, this.store, { dpr: this.dpr, hud: layout, coastReady: this.loader.coastReady(v) });
    } catch (err) {
      console.error(err);
      return;
    }
    this.frameView = v; this.last = res;
    this._blit();
    drawHud(this.hudCtx, v, layout, { dpr: this.dpr, title: res.title || (res.base === 'sea' ? 'Mare Incognitum' : 'Terra Incognita'), paperTile: this.renderer.paperTile, backdrop: this.opts.backdrop });
    const [lon, lat] = this.getCenter();
    this._emit('render', res);
    this._emit('moveend', { lon, lat, zoom: this.getZoom() });
  }

  /** Show the last full frame, moved and scaled to the current view (used while gesturing). */
  _blit() {
    const c = this.ctx, f = this.frameView;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#d9c08a'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!f) return;
    const k = f.res / this.res;
    const dx = this.w / 2 - (this.w / 2) * k + (f.cx - this.cx) / this.res;
    const dy = this.h / 2 - (this.h / 2) * k - (f.cy - this.cy) / this.res;
    const d = this.dpr;
    c.imageSmoothingEnabled = true;
    c.drawImage(this.frame, dx * d, dy * d, this.w * k * d, this.h * k * d);
  }

  _moved() {
    this._closePopup();
    if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this._blit(); });
    clearTimeout(this._settleTimer);
    this._settleTimer = setTimeout(() => { if (!this._gesturing) this._renderNow(); }, 160);
  }

  _dataArrived() {
    clearTimeout(this._dataTimer);
    this._dataTimer = setTimeout(() => { if (!this._gesturing) this._renderNow(); }, 200);
  }

  // ---- hit testing ----
  hitTest(sx, sy) {
    const r = this.last, v = this.frameView;
    if (!r || !v) return null;
    let best = null, bd = 14 * 14;
    for (const s of r.symbols) {
      if (s.box && sx >= s.box.x && sx <= s.box.x + s.box.w && sy >= s.box.y && sy <= s.box.y + s.box.h) return s.item;
      const d = (s.x - sx) ** 2 + (s.y - sy) ** 2;
      if (d < bd) { bd = d; best = s.item; }
    }
    if (best) return best;
    // named lines within 6 px
    let lineBest = null, ld = 36;
    for (const it of r.named) {
      if (it.kind !== 'line') continue;
      const p = it.pts;
      for (let i = 0; i < p.length - 2; i += 2) {
        const x1 = v.sx(p[i]), y1 = v.sy(p[i + 1]), x2 = v.sx(p[i + 2]), y2 = v.sy(p[i + 3]);
        const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
        let t = L2 ? ((sx - x1) * dx + (sy - y1) * dy) / L2 : 0; t = clamp(t, 0, 1);
        const d = (x1 + dx * t - sx) ** 2 + (y1 + dy * t - sy) ** 2;
        if (d < ld) { ld = d; lineBest = it; }
      }
    }
    if (lineBest) return lineBest;
    // smallest named area containing the point
    const [wx, wy] = v.world(sx, sy);
    let areaBest = null, aSize = Infinity;
    for (const it of r.named) {
      if (it.kind !== 'area') continue;
      const b = it.bbox; if (wx < b.minX || wx > b.maxX || wy < b.minY || wy > b.maxY) continue;
      let inside = false;
      for (const ring of it.rings) for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const yi = ring[i + 1], yj = ring[j + 1];
        if ((yi > wy) !== (yj > wy) && wx < ((ring[j] - ring[i]) * (wy - yi)) / (yj - yi) + ring[i]) inside = !inside;
      }
      const size = (b.maxX - b.minX) * (b.maxY - b.minY);
      if (inside && size < aSize) { aSize = size; areaBest = it; }
    }
    return areaBest;
  }

  _closePopup() { if (this.popup && !this.popup.hidden) { this.popup.hidden = true; } }

  _select(sx, sy) {
    const item = this.hitTest(sx, sy);
    const [lon, lat] = unproject(...this.view.world(sx, sy));
    this._emit('select', { item, lon, lat, x: sx, y: sy });
    if (!this.popup) return;
    if (!item) { this._closePopup(); return; }
    const t = item.tags || {};
    const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const rows = [];
    if (t['name:en'] && t['name:en'] !== item.name) rows.push(esc(t['name:en']));
    if (t.ele) rows.push(`Height ${esc(Math.round(+t.ele) || t.ele)} m`);
    if (t.population) rows.push(`Population ${(+t.population || 0).toLocaleString('en-US')}`);
    if (t.religion) rows.push(esc(t.religion.replace(/_/g, ' ')));
    let wiki = '';
    if (t.wikipedia && /^[a-z-]+:/.test(t.wikipedia)) {
      const [lang, ...title] = t.wikipedia.split(':');
      wiki = `<a href="https://${esc(lang)}.wikipedia.org/wiki/${encodeURIComponent(title.join(':').replace(/ /g, '_'))}" target="_blank" rel="noopener">Wikipedia</a>`;
    }
    const osmType = { n: 'node', w: 'way', r: 'relation', c: null }[item.key[0]];
    const osmId = item.key[0] === 'c' ? null : item.key.slice(1);
    const osmLink = osmType && osmId ? `<a href="https://www.openstreetmap.org/${osmType}/${osmId}" target="_blank" rel="noopener">OpenStreetMap</a>` : '';
    this.popup.innerHTML = `<div class="tm-popup-kind">${esc(kindName(item.cls))}</div>` +
      `<div class="tm-popup-name">${esc(item.name || 'Unnamed')}</div>` +
      rows.map((r) => `<div class="tm-popup-row">${r}</div>`).join('') +
      `<div class="tm-popup-links">${[wiki, osmLink].filter(Boolean).join(' · ')}</div>`;
    this.popup.hidden = false;
    const pw = this.popup.offsetWidth, ph = this.popup.offsetHeight;
    this.popup.style.left = clamp(sx - pw / 2, 8, this.w - pw - 8) + 'px';
    this.popup.style.top = (sy - ph - 14 > 8 ? sy - ph - 14 : sy + 14) + 'px';
  }

  // ---- input ----
  _bind() {
    const cv = this.canvas, ptrs = new Map();
    let g = null;
    const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      cv.focus({ preventScroll: true });
      ptrs.set(e.pointerId, local(e));
      this._gesturing = true;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        g = { pinch: true, d: Math.hypot(a[0] - b[0], a[1] - b[1]), res: this.res, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      } else g = { start: local(e), last: local(e), moved: false };
    });
    cv.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) {
        if (this.last) cv.style.cursor = this.last.symbols.some((s) => (s.x - local(e)[0]) ** 2 + (s.y - local(e)[1]) ** 2 < 120) ? 'pointer' : 'grab';
        return;
      }
      const p = local(e); ptrs.set(e.pointerId, p);
      if (g && g.pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const target = g.res * g.d / d;
        this.panBy(mid[0] - g.mid[0], mid[1] - g.mid[1]); g.mid = mid;
        this.zoomBy(this.res / target, mid[0], mid[1]);
        return;
      }
      if (!g || g.pinch) return;
      if (!g.moved && Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) > 4) { g.moved = true; cv.style.cursor = 'grabbing'; }
      if (g.moved) { this.panBy(p[0] - g.last[0], p[1] - g.last[1]); g.last = p; }
    });
    const end = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      const tap = g && !g.pinch && !g.moved && e.type === 'pointerup';
      if (ptrs.size === 0) {
        const changed = g && (g.pinch || g.moved);
        g = null; this._gesturing = false; cv.style.cursor = 'grab';
        if (changed) this._moved();
      }
      if (tap) this._select(...local(e));
      else if (g && g.pinch) g = { start: [...ptrs.values()][0], last: [...ptrs.values()][0], moved: true, pinch: false, wasPinch: true };
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [sx, sy] = local(e);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.zoomBy(Math.exp(-dy * 0.0022), sx, sy);
    }, { passive: false });
    cv.addEventListener('dblclick', (e) => { const [sx, sy] = local(e); this.zoomBy(2, sx, sy); });
    cv.addEventListener('keydown', (e) => {
      const step = 80;
      const keys = { ArrowLeft: () => this.panBy(step, 0), ArrowRight: () => this.panBy(-step, 0), ArrowUp: () => this.panBy(0, step), ArrowDown: () => this.panBy(0, -step), '+': () => this.zoomBy(1.6), '=': () => this.zoomBy(1.6), '-': () => this.zoomBy(1 / 1.6), Escape: () => this._closePopup() };
      if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
    });
    cv.style.cursor = 'grab';
  }
}
