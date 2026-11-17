// Draws a view of the OSM store as an old treasure chart.
// Everything is drawn in CSS pixels; layer canvases are device-pixel sized.
import { hash2, drawText, spacedWidth } from './util.js';
import { buildLand, landAt, signedArea } from './coast.js';
import * as G from './glyphs.js';
import { INK, FONTS } from './glyphs.js';
import { makeParchmentTile, makeHatchTile } from './parchment.js';

/** Lowest zoom at which each feature class is drawn (matches what each data tier loads). */
const MIN_ZOOM = {
  building: 15.5, road3: 15.5, trail: 15.5, stream: 15.5, pier: 15.5, dam: 15.5, cemetery: 15.5, orchard: 15.5, treerow: 16,
  rail: 12.5, cliff: 12.5, road2: 12.5, wood: 12.5, scrub: 12.5, wetland: 12.5, beach: 12.5, rock: 12.5, glacier: 12.5, residential: 12.5,
  road1: 0, river: 0, water: 0,
};

const F = FONTS.body, SC = FONTS.sc;
/** Label and symbol styles for point classes. */
const POINTS = {
  city: { font: `22px ${SC}`, sp: 2.5, prio: 100, minZ: 0, mark: 'city' },
  town: { font: `17px ${SC}`, sp: 1.5, prio: 80, minZ: 9.5, mark: 'town' },
  village: { font: `14px ${SC}`, sp: 1, prio: 60, minZ: 11.5, mark: 'village' },
  hamlet: { font: `italic 12.5px ${F}`, sp: 0.4, prio: 30, minZ: 14, mark: 'hamlet' },
  isolated_dwelling: { font: `italic 11.5px ${F}`, sp: 0.2, prio: 8, minZ: 16.5, mark: 'hamlet' },
  locality: { font: `italic 12px ${F}`, sp: 0.4, prio: 14, minZ: 15, center: true },
  archipelago: { font: `17px ${SC}`, sp: 4, prio: 76, minZ: 0, center: true },
  island: { font: `15px ${SC}`, sp: 2, prio: 70, minZ: 0, center: true },
  islet: { font: `italic 12px ${F}`, sp: 0.5, prio: 34, minZ: 13.5, center: true },
  ocean: { font: `italic 26px ${F}`, sp: 8, prio: 96, minZ: 0, center: true, water: true },
  sea: { font: `italic 22px ${F}`, sp: 6, prio: 93, minZ: 0, center: true, water: true },
  bay: { font: `italic 16px ${F}`, sp: 3, prio: 55, minZ: 10, center: true, water: true },
  strait: { font: `italic 15px ${F}`, sp: 3, prio: 52, minZ: 10, center: true, water: true },
  lake: { font: `italic 13px ${F}`, sp: 1.5, prio: 45, minZ: 11, center: true, water: true },
  peninsula: { font: `italic 13px ${F}`, sp: 2, prio: 40, minZ: 11, center: true },
  peak: { font: `italic 12.5px ${F}`, sp: 0.3, prio: 50, minZ: 11, mark: 'peak' },
  volcano: { font: `italic 12.5px ${F}`, sp: 0.3, prio: 53, minZ: 10, mark: 'peak' },
  cape: { font: `italic 12.5px ${F}`, sp: 0.3, prio: 40, minZ: 12, mark: 'dot' },
  lighthouse: { font: `italic 11.5px ${F}`, sp: 0.2, prio: 46, minZ: 11, mark: 'lighthouse' },
  castle: { font: `italic 12px ${F}`, sp: 0.2, prio: 48, minZ: 12, mark: 'castle' },
  wreck: { font: `italic 11.5px ${F}`, sp: 0.2, prio: 44, minZ: 12, mark: 'wreck' },
  ruins: { font: `italic 11.5px ${F}`, sp: 0.2, prio: 24, minZ: 15.5, mark: 'ruins' },
  monument: { font: `italic 11px ${F}`, sp: 0.2, prio: 14, minZ: 16.5, mark: 'monument' },
  windmill: { font: `italic 11px ${F}`, sp: 0.2, prio: 22, minZ: 15.5, mark: 'windmill' },
  tower: { font: `italic 11px ${F}`, sp: 0.2, prio: 12, minZ: 16.5, mark: 'tower' },
  worship: { font: `italic 11px ${F}`, sp: 0.2, prio: 18, minZ: 16, mark: 'worship' },
  viewpoint: { font: `italic 11px ${F}`, sp: 0.2, prio: 10, minZ: 16.5, mark: 'viewpoint' },
  cave_entrance: { font: `italic 11px ${F}`, sp: 0.2, prio: 18, minZ: 15.5, mark: 'cave_entrance' },
  spring: { font: `italic 11px ${F}`, sp: 0.2, prio: 9, minZ: 16.5, mark: 'spring' },
  rock: { font: `italic 11px ${F}`, sp: 0.2, prio: 11, minZ: 15.5, mark: 'rock' },
};
// How strongly a place competes for the cartouche title, close in and zoomed out.
const TITLE_NEAR = { city: 100, town: 80, archipelago: 78, island: 74, village: 58, sea: 50, ocean: 48, bay: 40, hamlet: 25, islet: 22, locality: 10 };
const TITLE_FAR = { city: 100, sea: 95, ocean: 92, town: 85, archipelago: 84, bay: 80, strait: 70, island: 60, village: 45 };

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export class TreasureRenderer {
  constructor({ tileSize = 512 } = {}) {
    this.tileSize = tileSize;
    this.dpr = 0;
    this._pats = new WeakMap();
    this.q = 0.25; // resolution of the sampling masks
  }

  get paperTile() { return this.tile; }

  _prepare(dpr, w, h) {
    if (this.dpr !== dpr) {
      this.dpr = dpr;
      this.tile = makeParchmentTile(this.tileSize, dpr);
      this.hatch = makeHatchTile(dpr);
      this._pats = new WeakMap();
    }
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    const mk = (name, cw, ch) => {
      let l = this[name];
      if (!l) { const cv = document.createElement('canvas'); l = this[name] = { canvas: cv, ctx: cv.getContext('2d', name === 'mask' ? { willReadFrequently: true } : undefined) }; }
      if (l.canvas.width !== cw || l.canvas.height !== ch) { l.canvas.width = cw; l.canvas.height = ch; }
      l.ctx.setTransform(1, 0, 0, 1, 0, 0); l.ctx.globalCompositeOperation = 'source-over'; l.ctx.clearRect(0, 0, cw, ch);
      return l;
    };
    mk('ripple', W, H); mk('land', W, H); mk('landMask', W, H);
    this.mw = Math.max(1, Math.ceil(w * this.q)); this.mh = Math.max(1, Math.ceil(h * this.q));
    mk('mask', this.mw, this.mh);
  }

  _pattern(c, kind, view) {
    let m = this._pats.get(c);
    if (!m) { m = {}; this._pats.set(c, m); }
    if (!m[kind]) m[kind] = c.createPattern(kind === 'paper' ? this.tile : this.hatch, 'repeat');
    const T = kind === 'paper' ? this.tileSize : 8;
    const ox = (((view.width / 2 - view.cx / view.res) % T) + T) % T;
    const oy = (((view.height / 2 + view.cy / view.res) % T) + T) % T;
    m[kind].setTransform(new DOMMatrix([1 / this.dpr, 0, 0, 1 / this.dpr, ox, oy]));
    return m[kind];
  }

  // ---- geometry to screen paths ----
  _wob(sx, sy, A) {
    const ux = sx + this.wox, uy = sy + this.woy;
    return [
      sx + A * (Math.sin(ux * 0.051 + uy * 0.023) * 0.6 + Math.sin(ux * 0.137 - uy * 0.093 + 1.3) * 0.4),
      sy + A * (Math.sin(uy * 0.047 - ux * 0.029 + 2.1) * 0.6 + Math.sin(uy * 0.121 + ux * 0.083) * 0.4),
    ];
  }

  _add(path, pts, closed, wob = 0, orient = 0) {
    const n = pts.length >> 1;
    if (n < 2) return;
    let rev = false;
    if (orient) { const a = signedArea(pts); rev = orient > 0 ? a < 0 : a > 0; }
    const v = this.v, cx = v.cx, cy = v.cy, res = v.res, w2 = v.width / 2, h2 = v.height / 2, W = v.width, H = v.height;
    let lx = 0, ly = 0, started = false;
    for (let k = 0; k < n; k++) {
      const i = rev ? n - 1 - k : k;
      const sx = (pts[2 * i] - cx) / res + w2, sy = h2 - (pts[2 * i + 1] - cy) / res;
      if (started && k < n - 1) { const dx = sx - lx, dy = sy - ly; if (dx * dx + dy * dy < 0.6) continue; }
      if (!started) {
        if (wob) { const p = this._wob(sx, sy, wob); path.moveTo(p[0], p[1]); } else path.moveTo(sx, sy);
        started = true;
      } else if (wob) {
        const dx = sx - lx, dy = sy - ly, d = Math.hypot(dx, dy);
        // add intermediate points (only near the screen) so the wobble shows on long straight runs
        if (d > 9 && Math.max(lx, sx) > -60 && Math.min(lx, sx) < W + 60 && Math.max(ly, sy) > -60 && Math.min(ly, sy) < H + 60) {
          const m = Math.min(400, Math.ceil(d / 7));
          for (let s = 1; s < m; s++) { const p = this._wob(lx + (dx * s) / m, ly + (dy * s) / m, wob); path.lineTo(p[0], p[1]); }
        }
        const p = this._wob(sx, sy, wob); path.lineTo(p[0], p[1]);
      } else path.lineTo(sx, sy);
      lx = sx; ly = sy;
    }
    if (closed) path.closePath();
  }

  _screenPts(pts) {
    const v = this.v, out = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i += 2) { out[i] = (pts[i] - v.cx) / v.res + v.width / 2; out[i + 1] = v.height / 2 - (pts[i + 1] - v.cy) / v.res; }
    return out;
  }

  // ---- sampling masks (quarter resolution) ----
  _mask(fn) {
    const m = this.mask.ctx;
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, this.mw, this.mh);
    m.setTransform(this.q, 0, 0, this.q, 0, 0); m.fillStyle = '#000'; m.strokeStyle = '#000'; m.lineJoin = 'round'; m.lineCap = 'round';
    fn(m);
    m.globalCompositeOperation = 'source-over';
    return m.getImageData(0, 0, this.mw, this.mh).data;
  }
  _at(data, sx, sy) {
    const ix = (sx * this.q) | 0, iy = (sy * this.q) | 0;
    if (ix < 0 || iy < 0 || ix >= this.mw || iy >= this.mh) return false;
    return data[(iy * this.mw + ix) * 4 + 3] > 110;
  }

  /** World-anchored jittered grid, so decoration stays put while panning. */
  _scatter(view, spacing, seed, fn) {
    const lvl = Math.round(Math.log2(view.res));
    const cell = spacing * Math.pow(2, lvl);
    const b = view.bounds(spacing);
    const i0 = Math.floor(b.minX / cell), i1 = Math.floor(b.maxX / cell), j0 = Math.floor(b.minY / cell), j1 = Math.floor(b.maxY / cell);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 60000) return;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const hx = hash2(i, j, seed), hy = hash2(i, j, seed + 101), hv = hash2(i, j, seed + 202);
      fn(view.sx((i + 0.12 + 0.76 * hx) * cell), view.sy((j + 0.12 + 0.76 * hy) * cell), hv);
    }
  }

  // ---- labels ----
  _markBox(mark, sx, sy) {
    if (mark === 'peak') return { x: sx - 9, y: sy - 11, w: 18, h: 13 };
    if (mark === 'city') return { x: sx - 8, y: sy - 8, w: 16, h: 16 };
    if (mark === 'town') return { x: sx - 6, y: sy - 6, w: 12, h: 12 };
    if (mark === 'village' || mark === 'hamlet' || mark === 'dot') return { x: sx - 4, y: sy - 4, w: 8, h: 8 };
    return { x: sx - 8, y: sy - 10, w: 16, h: 18 };
  }

  _fitLabel(c, text, st, sx, sy, gb, occ, w, h) {
    c.font = st.font;
    let lines = [text];
    if (text.length > 20 && text.includes(' ')) {
      const words = text.split(' '); let best = 1, bd = 1e9;
      for (let i = 1; i < words.length; i++) { const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length); if (d < bd) { bd = d; best = i; } }
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }
    const fs = parseFloat(st.font.match(/([\d.]+)px/)[1]);
    const lh = fs * 1.12;
    const tw = Math.max(...lines.map((t) => spacedWidth(c, t, st.sp)));
    const th = lh * lines.length;
    const g = gb ? 4 : 0;
    const cands = st.center
      ? [[sx - tw / 2, sy - th / 2], [sx - tw / 2, sy - th / 2 - th], [sx - tw / 2, sy + th / 2]]
      : [[gb.x + gb.w + g, sy - th / 2], [gb.x - g - tw, sy - th / 2], [sx - tw / 2, gb.y - th - 1], [sx - tw / 2, gb.y + gb.h + 1],
        [gb.x + gb.w, gb.y - th + 2], [gb.x - tw, gb.y + gb.h - 2]];
    for (const [bx, by] of cands) {
      const box = { x: bx - 2, y: by - 1, w: tw + 4, h: th + 2 };
      if (box.x < 0 || box.y < 0 || box.x + box.w > w || box.y + box.h > h) continue;
      if (occ.some((o) => overlap(o, box))) continue;
      return { box, bx, by, lines, lh, tw, st };
    }
    return null;
  }

  /** Style for a label, with lettering scaled up for features that span much of the view. */
  _styleFor(p, st, view) {
    if (!st.center || !p.size) return st;
    const k = Math.max(0, Math.min(2, Math.log2(p.size / view.res / 220)));
    if (k <= 0) return st;
    const fs = parseFloat(st.font.match(/([\d.]+)px/)[1]);
    return { ...st, font: st.font.replace(/[\d.]+px/, `${(fs * (1 + 0.3 * k)).toFixed(1)}px`), sp: st.sp * (1 + 0.6 * k) };
  }

  /** Screen anchors for a centred label, nearest first. A water body larger than the view whose
   *  centre is off-screen is labelled on open water near the edge closest to its centre. */
  _anchors(p, st, view) {
    const w = view.width, h = view.height, sx = view.sx(p.x), sy = view.sy(p.y);
    const onScreen = sx > 0 && sy > 0 && sx < w && sy < h;
    if (onScreen) return [[sx, sy]];
    const big = st.water && p.size && p.size / view.res > Math.min(w, h) * 0.6;
    if (!big) return [];
    const out = [];
    for (let j = 1; j <= 5; j++) for (let i = 1; i <= 7; i++) out.push([(w * i) / 8, (h * j) / 6]);
    out.sort((a, b) => (a[0] - sx) ** 2 + (a[1] - sy) ** 2 - ((b[0] - sx) ** 2 + (b[1] - sy) ** 2));
    return out.slice(0, 10);
  }

  /** True when every sample point of the box is water (or land, if wantLand). */
  _boxOn(box, landOnly, wantLand) {
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) {
      if (this._at(landOnly, box.x + (box.w * i) / 4, box.y + (box.h * j) / 2) !== wantLand) return false;
    }
    return true;
  }

  _placeLabels(c, view, points, occ, landOnly) {
    const z = view.zoom, w = view.width, h = view.height;
    const cands = [];
    for (const p of points) {
      const st = POINTS[p.cls];
      if (!st || z < st.minZ) continue;
      if (!p.name && !st.mark) continue;
      if (!st.mark && !p.name) continue;
      let prio = st.prio;
      if (p.tags.population) prio += Math.min(12, Math.log10(+p.tags.population || 1) * 2);
      if (p.tags.ele) prio += Math.min(6, (+p.tags.ele || 0) / 800);
      if (p.size) prio += Math.max(0, Math.min(15, 5 * Math.log10(p.size / view.res / 40)));
      if (!p.name) prio -= 20;
      cands.push({ p, st, prio });
    }
    cands.sort((a, b) => b.prio - a.prio || (a.p.key < b.p.key ? -1 : 1));
    const labels = [], marks = [], labelBoxes = [], placedNames = [];
    for (const { p, st: base } of cands) {
      const st = this._styleFor(p, base, view);
      if (p.name && placedNames.some((q) => q.name === p.name && Math.hypot(q.x - view.sx(p.x), q.y - view.sy(p.y)) < 300)) continue;
      if (st.center) {
        for (const [ax, ay] of this._anchors(p, st, view)) {
          const lb = this._fitLabel(c, p.name, st, ax, ay, null, occ, w, h);
          // water names stay on water; a bay or sea label must not spill across the land
          if (lb && (!st.water || this._boxOn(lb.box, landOnly, false))) {
            occ.push(lb.box); labelBoxes.push(lb.box); labels.push({ ...lb, p, sx: ax, sy: ay });
            placedNames.push({ name: p.name, x: ax, y: ay });
            break;
          }
        }
        continue;
      }
      const sx = view.sx(p.x), sy = view.sy(p.y);
      if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
      let gb = null;
      if (st.mark) { gb = this._markBox(st.mark, sx, sy); if (occ.some((o) => overlap(o, gb))) continue; }
      let lb = null;
      if (p.name) {
        lb = this._fitLabel(c, p.name, st, sx, sy, gb, occ, w, h);
        if (!lb && !st.mark) continue;
        if (!lb && /^(city|town|village)$/.test(p.cls)) continue;
      }
      if (gb) { occ.push(gb); marks.push({ p, st, sx, sy }); }
      if (lb) { occ.push(lb.box); labelBoxes.push(lb.box); labels.push({ ...lb, p, sx, sy }); placedNames.push({ name: p.name, x: sx, y: sy }); }
    }
    return { labels, marks, labelBoxes };
  }

  _title(view, points) {
    const cx = view.width / 2, cy = view.height / 2, diag = Math.hypot(view.width, view.height), far = view.zoom < 14;
    let best = null;
    for (const p of points) {
      const base = (far ? TITLE_FAR : TITLE_NEAR)[p.cls];
      if (!base || !p.name) continue;
      const sx = view.sx(p.x), sy = view.sy(p.y);
      if (sx < 0 || sy < 0 || sx > view.width || sy > view.height) continue;
      const pop = p.tags.population ? Math.min(15, Math.log10(+p.tags.population || 1) * 2.5) : 0;
      // features that span much of the view (a bay, an island) make the best titles
      const span = p.size ? Math.max(-10, Math.min(25, 12 * Math.log10(p.size / view.res / (view.width * 0.25)))) : 0;
      const score = base + pop + span - ((far ? 30 : 60) * Math.hypot(sx - cx, sy - cy)) / diag;
      if (!best || score > best.score) best = { score, name: p.name };
    }
    return best ? best.name : null;
  }

  /**
   * Render a view of the store into ctx (a device-pixel canvas).
   * opts: { dpr, hud (from hudLayout), coastReady }
   * Returns what was drawn, for titles and hit testing.
   */
  render(ctx, view, store, opts = {}) {
    const dpr = opts.dpr || 1, w = view.width, h = view.height, z = view.zoom;
    const hud = opts.hud || { boxes: [], rose: { x: 60, y: h - 60 } };
    this._prepare(dpr, w, h);
    this.v = view;
    this.wox = view.cx / view.res - w / 2;
    this.woy = -view.cy / view.res - h / 2;

    // 1. gather what's in view
    const areas = {}, lines = {}, points = [];
    store.forEachIn(view.bounds(60), (it) => {
      if (it.kind === 'point') { points.push(it); return; }
      if (z < (MIN_ZOOM[it.cls] ?? 0)) return;
      if (it.cls === 'residential' && z >= 15.5) return;
      const bucket = it.kind === 'area' ? areas : lines;
      (bucket[it.cls] ||= []).push(it);
    });

    // 2. land and sea
    const chains = store.coastChains();
    const land = buildLand(chains, view.bounds(130));
    let base = null;
    if (!land.crossed) {
      base = landAt(chains, view.cx, view.cy, Math.max(w, h) * view.res * 6);
      if (!base) {
        const landish = points.some((p) => /^(city|town|village|hamlet)$/.test(p.cls)) ||
          ['road1', 'road2', 'road3', 'trail', 'rail'].some((k) => lines[k]?.length) || areas.building?.length || areas.wood?.length || areas.residential?.length;
        base = landish ? 'land' : 'sea';
      }
    }
    const landPath = new Path2D();
    if (base === 'land') landPath.rect(-400, -400, w + 800, h + 800);
    for (const r of land.rings) this._add(landPath, r, true, 1.1);
    const coastPath = new Path2D();
    for (const l of land.lines) this._add(coastPath, l.pts, l.closed, 1.1);

    const P = {};
    for (const cls of Object.keys(areas)) {
      const p = new Path2D();
      for (const it of areas[cls]) it.rings.forEach((r, k) => this._add(p, r, true, cls === 'water' ? 0.8 : 0, it.inner[k] ? -1 : 1));
      P[cls] = p;
    }
    const linePath = (cls, wob = 0) => { const p = new Path2D(); for (const it of lines[cls] || []) this._add(p, it.pts, false, wob); return p; };

    // 3. labels first, so decoration can keep clear of them
    const landOnly = this._mask((m) => { m.fill(landPath, 'evenodd'); if (P.water) { m.globalCompositeOperation = 'destination-out'; m.fill(P.water); } });
    const occ = hud.boxes.slice();
    const lab = this._placeLabels(ctx, view, points, occ, landOnly);
    const inLabel = (sx, sy) => lab.labelBoxes.some((b) => sx > b.x && sx < b.x + b.w && sy > b.y && sy < b.y + b.h);

    const c = ctx;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = 'source-over';

    // 4. paper and sea
    c.fillStyle = this._pattern(c, 'paper', view); c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgba(190,204,188,0.6)'; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    // rhumb lines from the compass rose
    const diag = Math.hypot(w, h) * 2;
    for (let i = 0; i < 32; i++) {
      const a = (i * 11.25 * Math.PI) / 180;
      c.strokeStyle = i % 4 === 0 ? 'rgba(60,35,15,0.2)' : 'rgba(60,35,15,0.1)'; c.lineWidth = i % 4 === 0 ? 1.1 : 0.8;
      c.beginPath(); c.moveTo(hud.rose.x, hud.rose.y); c.lineTo(hud.rose.x + Math.sin(a) * diag, hud.rose.y - Math.cos(a) * diag); c.stroke();
    }

    // 5. ripple lines off the coast and lake shores
    {
      const rc = this.ripple.ctx; rc.setTransform(dpr, 0, 0, dpr, 0, 0); rc.lineJoin = 'round'; rc.lineCap = 'round';
      const ring = (path, d, a) => {
        rc.globalCompositeOperation = 'source-over'; rc.strokeStyle = `rgba(42,25,11,${a})`; rc.lineWidth = 2 * d + 1.3; rc.stroke(path);
        rc.globalCompositeOperation = 'destination-out'; rc.lineWidth = 2 * d - 1.3; rc.stroke(path);
      };
      // rings tighten as you zoom out so neighbouring islands don't drown in them
      const k = z >= 15 ? 1 : z >= 12.5 ? 0.7 : 0.5;
      for (const [d, a] of [[40, 0.14], [27, 0.22], [16, 0.32], [7, 0.44]]) ring(coastPath, d * k, a);
      if (P.water) for (const [d, a] of [[11, 0.2], [5, 0.3]]) ring(P.water, d, a);
      rc.globalCompositeOperation = 'source-over';
      c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(this.ripple.canvas, 0, 0); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // 6. open-sea decoration: serpents, then little waves
    const seaBlock = this._mask((m) => {
      m.fill(landPath, 'evenodd');
      if (P.water) { m.fill(P.water); m.lineWidth = 28; m.stroke(P.water); }
      m.lineWidth = 92; m.stroke(coastPath);
    });
    const deco = [];
    if (z >= 9) {
      this._scatter(view, 540, 23, (sx, sy, hv) => {
        if (hv > 0.45) return;
        const k = 0.6, box = { x: sx - 50 * k, y: sy - 85 * k, w: 210 * k, h: 105 * k };
        const fm = hud.F ? hud.F + 16 : 0;
        if (box.x < fm || box.y < fm || box.x + box.w > w - fm || box.y + box.h > h - fm) return;
        if (occ.some((o) => overlap(o, box)) || deco.some((o) => overlap(o, box))) return;
        for (let i = 0; i <= 6; i++) for (let j = 0; j <= 4; j++) if (this._at(seaBlock, box.x + (box.w * i) / 6, box.y + (box.h * j) / 4)) return;
        deco.push(box);
        G.serpent(c, sx, sy, k);
      });
    }
    c.strokeStyle = 'rgba(42,25,11,0.4)'; c.lineWidth = 1.2; c.lineCap = 'round';
    c.beginPath();
    this._scatter(view, 58, 11, (sx, sy, hv) => {
      if (hv < 0.3) return;
      if (this._at(seaBlock, sx, sy) || this._at(seaBlock, sx - 14, sy) || this._at(seaBlock, sx + 14, sy)) return;
      const box = { x: sx - 15, y: sy - 6, w: 30, h: 12 };
      if (occ.some((o) => overlap(o, box)) || deco.some((o) => overlap(o, box))) return;
      G.wave(c, sx - 6.5, sy, 6.5); G.wave(c, sx + 6.5, sy, 6.5);
    });
    c.stroke();

    // 7. the land layer: textured paper, shading and vegetation, masked to land
    {
      const lc = this.land.ctx; lc.setTransform(dpr, 0, 0, dpr, 0, 0);
      lc.fillStyle = this._pattern(lc, 'paper', view); lc.fillRect(0, 0, w, h);
      lc.globalCompositeOperation = 'multiply'; lc.fillStyle = 'rgba(240,214,160,0.6)'; lc.fillRect(0, 0, w, h);
      lc.globalCompositeOperation = 'source-over';
      if (P.residential) { lc.save(); lc.clip(P.residential); lc.fillStyle = this._pattern(lc, 'hatch', view); lc.fillRect(0, 0, w, h); lc.restore(); }
      if (P.glacier) { lc.fillStyle = 'rgba(250,248,240,0.55)'; lc.fill(P.glacier); }
      lc.lineJoin = 'round';
      for (const [lw, a] of [[84, 0.05], [52, 0.06], [28, 0.08], [12, 0.11]]) { lc.strokeStyle = `rgba(120,72,24,${a})`; lc.lineWidth = lw; lc.stroke(coastPath); }
      if (P.water) for (const [lw, a] of [[22, 0.07], [9, 0.1]]) { lc.strokeStyle = `rgba(120,72,24,${a})`; lc.lineWidth = lw; lc.stroke(P.water); }

      const M = {};
      for (const cls of ['wood', 'scrub', 'wetland', 'beach', 'rock', 'orchard', 'cemetery']) if (P[cls]) M[cls] = this._mask((m) => m.fill(P[cls]));
      if (Object.keys(M).length) {
        const ok = (data, sx, sy) => this._at(data, sx, sy) && this._at(landOnly, sx, sy) && !inLabel(sx, sy);
        if (M.beach) {
          lc.fillStyle = 'rgba(42,25,11,0.5)'; lc.beginPath();
          this._scatter(view, 5.5, 31, (sx, sy, hv) => { if (hv > 0.4 && ok(M.beach, sx, sy)) { lc.moveTo(sx + 0.75, sy); lc.arc(sx, sy, 0.75, 0, Math.PI * 2); } });
          lc.fill();
        }
        if (M.orchard) {
          lc.strokeStyle = 'rgba(42,25,11,0.6)'; lc.lineWidth = 0.9; lc.beginPath();
          this._scatter(view, 10, 61, (sx, sy) => { if (ok(M.orchard, sx, sy)) { lc.moveTo(sx + 2, sy); lc.arc(sx, sy, 2, 0, Math.PI * 2); } });
          lc.stroke();
        }
        if (M.cemetery) {
          lc.strokeStyle = 'rgba(42,25,11,0.75)'; lc.lineWidth = 1;
          this._scatter(view, 13, 67, (sx, sy) => { if (ok(M.cemetery, sx, sy)) G.cross(lc, sx, sy, 3.2); });
        }
        const glyphs = [];
        if (M.wood) this._scatter(view, 13, 41, (sx, sy, hv) => { if (ok(M.wood, sx, sy + 4)) glyphs.push([0, sx, sy, 5 + hv * 2.4, hv * 6.28]); });
        if (M.scrub) this._scatter(view, 18, 43, (sx, sy, hv) => { if (ok(M.scrub, sx, sy)) glyphs.push([1, sx, sy, 3.5 + hv * 1.5]); });
        if (M.wetland) this._scatter(view, 18, 47, (sx, sy, hv) => { if (ok(M.wetland, sx, sy)) glyphs.push([2, sx, sy, 3.8 + hv]); });
        if (M.rock) this._scatter(view, 16, 53, (sx, sy, hv) => { if (ok(M.rock, sx, sy)) glyphs.push([3, sx, sy, 3.5 + hv * 1.5]); });
        glyphs.sort((a, b) => a[2] - b[2]);
        for (const g of glyphs) {
          if (g[0] === 0) G.tree(lc, g[1], g[2], g[3], g[4]);
          else {
            lc.strokeStyle = 'rgba(42,25,11,0.72)'; lc.lineWidth = 0.9; lc.beginPath();
            if (g[0] === 1) G.tuft(lc, g[1], g[2], g[3]); else if (g[0] === 2) G.marsh(lc, g[1], g[2], g[3]); else G.rock(lc, g[1], g[2], g[3]);
            lc.stroke();
          }
        }
      }
      // rivers on the land layer, so lines mapped through lakes and lagoons are masked away
      lc.lineJoin = 'round'; lc.lineCap = 'round'; lc.strokeStyle = INK;
      if (lines.river) { lc.lineWidth = z >= 15 ? 2.3 : z >= 12 ? 1.7 : 1.2; lc.stroke(linePath('river', 0.7)); }
      if (lines.stream) { lc.strokeStyle = 'rgba(42,25,11,0.75)'; lc.lineWidth = 0.9; lc.stroke(linePath('stream', 0.8)); }

      const mk = this.landMask.ctx; mk.setTransform(dpr, 0, 0, dpr, 0, 0); mk.fillStyle = '#000';
      mk.fill(landPath, 'evenodd');
      if (P.water) { mk.globalCompositeOperation = 'destination-out'; mk.fill(P.water); mk.globalCompositeOperation = 'source-over'; }
      lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'destination-in'; lc.drawImage(this.landMask.canvas, 0, 0); lc.globalCompositeOperation = 'source-over';
      c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(this.land.canvas, 0, 0); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // 8. ink work
    c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.setLineDash([]);
    if (P.water) { c.lineWidth = z >= 14 ? 1.3 : 1; c.stroke(P.water); }
    if (lines.cliff) {
      c.lineWidth = 1.3; const p = linePath('cliff'); c.stroke(p);
      c.lineWidth = 0.8; c.beginPath();
      for (const it of lines.cliff) {
        const s = this._screenPts(it.pts);
        for (let i = 0; i < s.length - 2; i += 2) {
          const x1 = s[i], y1 = s[i + 1], x2 = s[i + 2], y2 = s[i + 3], L = Math.hypot(x2 - x1, y2 - y1);
          if (!L || Math.max(x1, x2) < -10 || Math.min(x1, x2) > w + 10 || Math.max(y1, y2) < -10 || Math.min(y1, y2) > h + 10) continue;
          const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
          for (let t = 2; t < L; t += 5) { const x = x1 + ux * t, y = y1 + uy * t; c.moveTo(x, y); c.lineTo(x - uy * 6, y + ux * 6); }
        }
      }
      c.stroke();
    }
    if (P.pier) { c.fillStyle = '#e3cb98'; c.fill(P.pier); c.lineWidth = 1; c.stroke(P.pier); }
    if (lines.pier) { const p = linePath('pier'); c.lineWidth = 3.4; c.stroke(p); c.strokeStyle = '#e3cb98'; c.lineWidth = 1.4; c.stroke(p); c.strokeStyle = INK; }
    if (lines.dam) { c.lineWidth = 3; c.stroke(linePath('dam')); }
    const cased = (cls, outer, inner) => { const p = linePath(cls); c.strokeStyle = INK; c.lineWidth = outer; c.stroke(p); c.strokeStyle = '#ead6a6'; c.lineWidth = inner; c.stroke(p); c.strokeStyle = INK; };
    if (lines.trail) { c.lineWidth = 1; c.setLineDash([4, 3.2]); c.strokeStyle = 'rgba(42,25,11,0.85)'; c.stroke(linePath('trail')); c.setLineDash([]); c.strokeStyle = INK; }
    if (lines.treerow) { c.lineWidth = 2.6; c.setLineDash([0.1, 4]); c.stroke(linePath('treerow')); c.setLineDash([]); }
    if (lines.road3) { if (z >= 17) cased('road3', 3.2, 1.6); else { c.lineWidth = 1; c.stroke(linePath('road3')); } }
    if (lines.rail) { const p = linePath('rail'); c.lineWidth = 1.1; c.stroke(p); c.lineWidth = 4.5; c.lineCap = 'butt'; c.setLineDash([1, 7]); c.stroke(p); c.setLineDash([]); c.lineCap = 'round'; }
    if (lines.road2) { if (z >= 14) cased('road2', 3, 1.2); else { c.lineWidth = 1.1; c.stroke(linePath('road2')); } }
    if (lines.road1) { if (z >= 12) cased('road1', 4.2, 2); else { c.lineWidth = 1.6; c.stroke(linePath('road1')); } }
    if (P.building) { c.fillStyle = 'rgba(42,25,11,0.72)'; c.fill(P.building); }
    c.strokeStyle = INK; c.lineWidth = z >= 14 ? 2.1 : 1.7; c.stroke(coastPath);

    // 9. symbols and lettering
    for (const m of lab.marks) {
      const { sx, sy } = m, mark = m.st.mark;
      if (mark === 'peak') G.peak(c, sx, sy + 1, 8);
      else if (mark === 'city') G.settlement(c, sx, sy, 3);
      else if (mark === 'town') G.settlement(c, sx, sy, 2);
      else if (mark === 'village') G.settlement(c, sx, sy, 1);
      else if (mark === 'hamlet') G.settlement(c, sx, sy, 0);
      else if (mark === 'dot') G.marker(c, sx, sy);
      else if (G.POINT_GLYPHS[mark]) G.POINT_GLYPHS[mark](c, sx, sy);
    }
    c.textBaseline = 'top'; c.textAlign = 'left'; c.lineJoin = 'round';
    for (const L of lab.labels) {
      c.font = L.st.font;
      c.strokeStyle = 'rgba(231,210,162,0.92)'; c.lineWidth = 3.2;
      c.fillStyle = L.st.water ? 'rgba(42,25,11,0.82)' : INK;
      L.lines.forEach((t, i) => {
        const lw = spacedWidth(c, t, L.st.sp);
        drawText(c, t, L.bx + (L.tw - lw) / 2, L.by + i * L.lh, L.st.sp, true);
      });
    }
    c.restore();

    const named = [];
    for (const k in lines) for (const it of lines[k]) if (it.name) named.push(it);
    for (const k in areas) for (const it of areas[k]) if (it.name) named.push(it);
    return {
      title: this._title(view, points),
      symbols: lab.marks.map((m) => ({ item: m.p, x: m.sx, y: m.sy })).concat(lab.labels.map((l) => ({ item: l.p, x: l.sx, y: l.sy, box: l.box }))),
      named,
      base: land.crossed ? 'mixed' : base,
    };
  }
}
