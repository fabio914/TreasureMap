// The chart furniture that stays fixed to the screen: frame with graticule,
// compass rose, title cartouche with a scale bar, attribution and burnt edges.
import { INK, FONTS, rose as drawRose } from './glyphs.js';
import { clamp, niceStep, mulberry32 } from './util.js';
import { project, unproject } from './geo.js';

const PACE = 1.524, CABLE = 185.2, LEAGUE = 5556;

export function hudLayout(w, h) {
  const F = w < 560 ? 18 : 26;
  const band = 9;
  const R = clamp(Math.min(w, h) * 0.075, 32, 68);
  const rose = { x: F + 22 + R * 1.2, y: h - F - 24 - R * 1.25, R };
  const cw = Math.round(clamp(w * 0.24, 180, 290)), ch = Math.round(cw * 0.52);
  const cart = { x: w - F - 12 - cw, y: F + 12, w: cw, h: ch };
  const boxes = [
    { x: 0, y: 0, w, h: F + 16 }, { x: 0, y: h - F - 16, w, h: F + 16 },
    { x: 0, y: 0, w: F + 16, h }, { x: w - F - 16, y: 0, w: F + 16, h },
    { x: rose.x - R * 1.4, y: rose.y - R * 1.5, w: R * 2.8, h: R * 2.8 },
    { x: cart.x - 6, y: cart.y - 6, w: cw + 12, h: ch + 12 },
    { x: w - F - 250, y: h - F - 24, w: 250, h: 24 },
  ];
  return { w, h, F, band, rose, cart, boxes };
}

function fmtDeg(v, pos, neg, step) {
  const hemi = v >= 0 ? pos : neg;
  const a = Math.abs(v);
  let d = Math.floor(a + 1e-9), m = (a - d) * 60;
  if (m > 59.9999) { d += 1; m = 0; }
  if (step >= 1 - 1e-9) return `${d}°${hemi}`;
  if (step >= 1 / 60 - 1e-9) return `${d}°${String(Math.round(m)).padStart(2, '0')}′${hemi}`;
  const mi = Math.floor(m + 1e-9), s = Math.round((m - mi) * 60);
  return `${d}°${String(mi).padStart(2, '0')}′${String(s).padStart(2, '0')}″${hemi}`;
}
const STEPS = [15 / 3600, 30 / 3600, 1 / 60, 2 / 60, 5 / 60, 10 / 60, 15 / 60, 30 / 60, 1, 2, 5, 10];
const pickStep = (span) => STEPS.find((s) => span / s <= 6) || 10;

function graticule(c, view, L) {
  const { w, h, F, band } = L;
  const [lonL, latB] = unproject(...view.world(F, h - F));
  const [lonR, latT] = unproject(...view.world(w - F, F));
  const xOf = (lon) => view.sx(project(lon, 0)[0]);
  const yOf = (lat) => view.sy(project(0, lat)[1]);
  const strip = 5;
  c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = 0.8;
  c.font = `italic 11px ${FONTS.body}`;
  const halo = (t, x, y) => { c.strokeStyle = 'rgba(231,210,162,0.9)'; c.lineWidth = 3; c.strokeText(t, x, y); c.fillStyle = INK; c.fillText(t, x, y); };

  // longitude along top and bottom
  const sl = pickStep(lonR - lonL);
  const edgesX = [lonL];
  for (let v = Math.ceil(lonL / sl) * sl; v < lonR; v += sl) if (v > lonL) edgesX.push(v);
  edgesX.push(lonR);
  for (let i = 0; i < edgesX.length - 1; i++) {
    const x1 = xOf(edgesX[i]), x2 = xOf(edgesX[i + 1]);
    const odd = ((Math.floor(edgesX[i] / sl + 1e-6) % 2) + 2) % 2 === 0;
    c.strokeStyle = INK; c.lineWidth = 0.8;
    for (const y of [F - strip, h - F]) { if (odd) c.fillRect(x1, y, x2 - x1, strip); c.strokeRect(x1, y, x2 - x1, strip); }
  }
  c.textAlign = 'center'; c.textBaseline = 'top';
  for (const v of edgesX.slice(1, -1)) {
    const x = xOf(v); c.strokeStyle = INK; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, F - band); c.lineTo(x, F + 5); c.moveTo(x, h - F - 5); c.lineTo(x, h - F + band); c.stroke();
    if (x > F + 40 && x < w - F - 40) halo(fmtDeg(v, 'E', 'W', sl), x, F + 7);
  }
  // latitude along left and right
  const sa = pickStep(latT - latB);
  const edgesY = [latB];
  for (let v = Math.ceil(latB / sa) * sa; v < latT; v += sa) if (v > latB) edgesY.push(v);
  edgesY.push(latT);
  for (let i = 0; i < edgesY.length - 1; i++) {
    const y1 = yOf(edgesY[i + 1]), y2 = yOf(edgesY[i]);
    const odd = ((Math.floor(edgesY[i] / sa + 1e-6) % 2) + 2) % 2 === 0;
    c.strokeStyle = INK; c.lineWidth = 0.8;
    for (const x of [F - strip, w - F]) { if (odd) c.fillRect(x, y1, strip, y2 - y1); c.strokeRect(x, y1, strip, y2 - y1); }
  }
  for (const v of edgesY.slice(1, -1)) {
    const y = yOf(v); c.strokeStyle = INK; c.lineWidth = 1;
    c.beginPath(); c.moveTo(F - band, y); c.lineTo(F + 5, y); c.moveTo(w - F - 5, y); c.lineTo(w - F + band, y); c.stroke();
    if (y > F + 40 && y < h - F - 40) {
      c.save(); c.translate(F + 8, y); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.textBaseline = 'top'; halo(fmtDeg(v, 'N', 'S', sa), 0, 0); c.restore();
    }
  }
}

function cartouche(c, view, L, title, paperPattern) {
  const { x, y, w, h } = L.cart;
  c.save();
  c.fillStyle = paperPattern; c.fillRect(x, y, w, h);
  c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgba(236,214,166,0.6)'; c.fillRect(x, y, w, h);
  c.restore();
  c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(x, y, w, h);
  c.lineWidth = 0.9; c.strokeRect(x + 5, y + 5, w - 10, h - 10);
  for (const [cx, cy] of [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]]) {
    c.fillStyle = '#e8d4a4'; c.beginPath(); c.arc(cx, cy, 5, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(cx, cy, 1.7, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  let fs = Math.round(h * 0.3);
  c.font = `${fs}px ${FONTS.display}`;
  while (c.measureText(title).width > w - 30 && fs > 12) { fs -= 1; c.font = `${fs}px ${FONTS.display}`; }
  const ty = y + 12 + fs * 0.9;
  c.fillText(title, x + w / 2, ty);
  const [lon, lat] = view.center;
  c.font = `italic 11.5px ${FONTS.body}`;
  c.fillText(`${fmtDeg(lat, 'N', 'S', 1 / 60)}  ·  ${fmtDeg(lon, 'E', 'W', 1 / 60)}`, x + w / 2, ty + 16);
  const fy = ty + 25;
  c.lineWidth = 1; c.beginPath();
  c.moveTo(x + w * 0.24, fy); c.bezierCurveTo(x + w * 0.38, fy - 5, x + w * 0.42, fy + 5, x + w / 2, fy);
  c.bezierCurveTo(x + w * 0.58, fy - 5, x + w * 0.62, fy + 5, x + w * 0.76, fy); c.stroke();
  c.beginPath(); c.arc(x + w / 2, fy, 2.2, 0, Math.PI * 2); c.fill();

  // scale bar in paces, cables or leagues
  const gr = view.groundRes();
  const span = view.width * gr;
  const [unit, label] = span < 3500 ? [PACE, 'Paces'] : span < 60000 ? [CABLE, 'Cables'] : [LEAGUE, 'Leagues'];
  const target = (w * 0.7 * gr) / unit;
  const step = niceStep(target / 4);
  const segs = clamp(Math.floor(target / step), 2, 5);
  const segPx = (step * unit) / gr, barW = segPx * segs;
  const bx = x + (w - barW) / 2, by = y + h - 30;
  c.lineWidth = 0.9;
  for (let i = 0; i < segs; i++) {
    c.fillStyle = i % 2 ? '#e8d4a4' : INK;
    c.fillRect(bx + i * segPx, by, segPx, 5); c.strokeRect(bx + i * segPx, by, segPx, 5);
  }
  c.fillStyle = INK; c.font = `10.5px ${FONTS.body}`;
  for (let i = 0; i <= segs; i++) c.fillText((step * i).toLocaleString('en-US'), bx + i * segPx, by - 4);
  c.font = `10.5px ${FONTS.sc}`;
  c.fillText(`A Scale of ${label}`, x + w / 2, by + 17);
}

const edgeCache = new Map();
function burntEdge(w, h) {
  const key = w + 'x' + h;
  if (edgeCache.has(key)) return edgeCache.get(key);
  const rnd = mulberry32(w * 31 + h);
  const per = 2 * (w + h), a1 = rnd() * 50, a2 = rnd() * 50;
  const inset = (t) => 7 + 4 * Math.sin(t * 0.013 + a1) + 3 * Math.sin(t * 0.051 + a2) + 1.5 * Math.sin(t * 0.19) + rnd() * 1.6;
  const p = new Path2D();
  for (let t = 0; t < per; t += 6) {
    const d = inset(t);
    let x, y;
    if (t < w) { x = t; y = d; } else if (t < w + h) { x = w - d; y = t - w; } else if (t < 2 * w + h) { x = w - (t - w - h); y = h - d; } else { x = d; y = h - (t - 2 * w - h); }
    x = clamp(x, d, w - d); y = clamp(y, d, h - d);
    if (t === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  p.closePath();
  edgeCache.set(key, p);
  return p;
}

/** Draw the screen-fixed chart furniture onto ctx (a transparent overlay canvas). */
export function drawHud(c, view, L, { dpr = 1, title = 'Terra Incognita', paperTile, backdrop = '#0f1d1c' } = {}) {
  const { w, h, F, band } = L;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, c.canvas.width, c.canvas.height);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pat = c.createPattern(paperTile, 'repeat');
  pat.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));

  // parchment border around the inner frame
  const border = new Path2D(); border.rect(0, 0, w, h); border.rect(F, F, w - 2 * F, h - 2 * F);
  c.fillStyle = pat; c.fill(border, 'evenodd');
  c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgba(214,186,128,0.35)'; c.fill(border, 'evenodd'); c.restore();
  c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(F, F, w - 2 * F, h - 2 * F);
  c.lineWidth = 1; c.strokeRect(F - band, F - band, w - 2 * F + 2 * band, h - 2 * F + 2 * band);

  c.save(); c.beginPath(); c.rect(F - band, F - band, w - 2 * (F - band), h - 2 * (F - band)); c.clip();
  graticule(c, view, L);
  c.restore();

  drawRose(c, L.rose.x, L.rose.y, L.rose.R, FONTS.display, FONTS.sc);
  cartouche(c, view, L, title, pat);

  c.font = `italic 11px ${FONTS.body}`; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
  c.strokeStyle = 'rgba(231,210,162,0.9)'; c.lineWidth = 3;
  const attr = 'Map data © OpenStreetMap contributors';
  c.strokeText(attr, w - F - 8, h - F - 8); c.fillStyle = INK; c.fillText(attr, w - F - 8, h - F - 8);

  // scorched, torn edge
  const edge = burntEdge(w, h);
  c.save(); c.clip(edge);
  c.lineJoin = 'round';
  for (const [lw, a] of [[60, 0.06], [34, 0.1], [18, 0.16], [8, 0.3], [3, 0.55]]) { c.strokeStyle = `rgba(78,42,12,${a})`; c.lineWidth = lw; c.stroke(edge); }
  c.restore();
  const outside = new Path2D(); outside.rect(-4, -4, w + 8, h + 8); outside.addPath(edge);
  c.fillStyle = backdrop; c.fill(outside, 'evenodd');
}
