// Coastline assembly. OSM stores coastlines as lines with land on the left.
// For each view we clip the merged coastline to a rectangle and close the
// pieces along the rectangle edge (walking counter-clockwise), which yields
// land polygons for that rectangle.
import { rectsIntersect, rectInside } from './geo.js';

function bboxOf(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Join coastline ways end-to-start by node id. */
export function mergeCoast(ways) {
  const byStart = new Map(), byEnd = new Map();
  for (const w of ways) { if (!byStart.has(w.a)) byStart.set(w.a, w); if (!byEnd.has(w.b)) byEnd.set(w.b, w); }
  const used = new Set();
  const chains = [];
  for (const w of ways) {
    if (used.has(w.id)) continue;
    let head = w; const seen = new Set([w.id]);
    for (;;) {
      const p = byEnd.get(head.a);
      if (!p || used.has(p.id) || seen.has(p.id)) break;
      seen.add(p.id); head = p;
    }
    const parts = []; let cur = head;
    while (cur && !used.has(cur.id)) { used.add(cur.id); parts.push(cur); cur = byStart.get(cur.b); }
    let len = 0; for (const p of parts) len += p.pts.length;
    const pts = new Float64Array(len - 2 * (parts.length - 1));
    let n = 0;
    parts.forEach((p, i) => { const src = i ? p.pts.subarray(2) : p.pts; pts.set(src, n); n += src.length; });
    chains.push({ pts, closed: parts[0].a === parts[parts.length - 1].b, bbox: bboxOf(pts) });
  }
  return chains;
}

function liangBarsky(x0, y0, x1, y1, r) {
  const dx = x1 - x0, dy = y1 - y0;
  let t0 = 0, t1 = 1;
  const pq = [[-dx, x0 - r.minX], [dx, r.maxX - x0], [-dy, y0 - r.minY], [dy, r.maxY - y0]];
  for (const [p, q] of pq) {
    if (p === 0) { if (q < 0) return null; }
    else {
      const t = q / p;
      if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  return [t0, t1];
}

function onEdge(x, y, r) {
  const eps = 1e-6 * Math.max(r.maxX - r.minX, r.maxY - r.minY);
  return Math.abs(x - r.minX) < eps || Math.abs(x - r.maxX) < eps || Math.abs(y - r.minY) < eps || Math.abs(y - r.maxY) < eps;
}

/** Split a polyline into the pieces inside r. Each piece notes whether it starts/ends on the edge. */
export function clipPolyline(pts, r) {
  const out = [];
  let cur = null, curStart = false;
  const n = pts.length / 2;
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[2 * i], y0 = pts[2 * i + 1], x1 = pts[2 * i + 2], y1 = pts[2 * i + 3];
    const res = liangBarsky(x0, y0, x1, y1, r);
    if (!res) continue;
    const [t0, t1] = res;
    const ax = x0 + (x1 - x0) * t0, ay = y0 + (y1 - y0) * t0;
    const bx = x0 + (x1 - x0) * t1, by = y0 + (y1 - y0) * t1;
    if (!cur) { cur = [ax, ay]; curStart = t0 > 0 || onEdge(ax, ay, r); }
    cur.push(bx, by);
    if (t1 < 1) { out.push({ pts: cur, s: curStart, e: true }); cur = null; }
  }
  if (cur) out.push({ pts: cur, s: curStart, e: onEdge(cur[cur.length - 2], cur[cur.length - 1], r) });
  return out;
}

// Perimeter parameter, counter-clockwise from the bottom-left corner: bottom 0-1, right 1-2, top 2-3, left 3-4.
function perimT(x, y, r) {
  const W = r.maxX - r.minX, H = r.maxY - r.minY;
  const dB = Math.abs(y - r.minY), dR = Math.abs(x - r.maxX), dT = Math.abs(y - r.maxY), dL = Math.abs(x - r.minX);
  const m = Math.min(dB, dR, dT, dL);
  if (m === dB) return (x - r.minX) / W;
  if (m === dR) return 1 + (y - r.minY) / H;
  if (m === dT) return 2 + (r.maxX - x) / W;
  return 3 + (r.maxY - y) / H;
}
function corner(k, r) {
  switch (((k % 4) + 4) % 4) {
    case 0: return [r.maxX, r.minY];
    case 1: return [r.maxX, r.maxY];
    case 2: return [r.minX, r.maxY];
    default: return [r.minX, r.minY];
  }
}

export function closeWithRect(pieces, r) {
  const P = pieces.map((pts) => ({ pts, te: perimT(pts[0], pts[1], r), tx: perimT(pts[pts.length - 2], pts[pts.length - 1], r), used: false }));
  const rings = [];
  for (const start of P) {
    if (start.used) continue;
    const ring = [];
    let cur = start, guard = 0;
    while (guard++ < 100000) {
      cur.used = true;
      for (let i = 0; i < cur.pts.length; i++) ring.push(cur.pts[i]);
      const tx = cur.tx;
      let best = null, bd = Infinity;
      for (const c of P) {
        if (c.used && c !== start) continue;
        let d = c.te - tx; d = ((d % 4) + 4) % 4;
        if (d < bd) { bd = d; best = c; }
      }
      const target = tx + bd;
      for (let k = Math.floor(tx) + 1; k < target; k++) { const [x, y] = corner(k - 1, r); ring.push(x, y); }
      if (!best || best === start) break;
      cur = best;
    }
    ring.push(ring[0], ring[1]);
    rings.push(Float64Array.from(ring));
  }
  return rings;
}

function rotateToOutside(pts, r) {
  const n = pts.length / 2 - 1; // closed: last point repeats the first
  let start = -1;
  for (let i = 0; i < n; i++) {
    const x = pts[2 * i], y = pts[2 * i + 1];
    if (x < r.minX || x > r.maxX || y < r.minY || y > r.maxY) { start = i; break; }
  }
  if (start < 0) return null;
  const out = new Float64Array(pts.length);
  for (let k = 0; k < n; k++) { const i = (start + k) % n; out[2 * k] = pts[2 * i]; out[2 * k + 1] = pts[2 * i + 1]; }
  out[2 * n] = out[0]; out[2 * n + 1] = out[1];
  return out;
}

export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length - 2; i += 2) a += pts[i] * pts[i + 3] - pts[i + 2] * pts[i + 1];
  return a / 2;
}

/**
 * Land polygons for rectangle r.
 * rings: closed rings to fill with the even-odd rule (plus r itself when the base is land).
 * lines: the real coastline inside r, for stroking.
 * crossed: whether any coastline crosses r; if not, the caller decides whether r is land or sea.
 */
export function buildLand(chains, r) {
  const rings = [], lines = [], pieces = [];
  for (const ch of chains) {
    if (!rectsIntersect(ch.bbox, r)) continue;
    if (rectInside(ch.bbox, r)) {
      lines.push({ pts: ch.pts, closed: ch.closed });
      if (ch.closed) rings.push(ch.pts);
      continue;
    }
    let pts = ch.pts;
    if (ch.closed) {
      pts = rotateToOutside(pts, r);
      if (!pts) { lines.push({ pts: ch.pts, closed: true }); rings.push(ch.pts); continue; }
    }
    for (const pc of clipPolyline(pts, r)) {
      const arr = Float64Array.from(pc.pts);
      lines.push({ pts: arr, closed: false });
      if (pc.s && pc.e) pieces.push(arr);
    }
  }
  return { rings: closeWithRect(pieces, r).concat(rings), lines, crossed: pieces.length > 0 };
}

/**
 * Is (x, y) on land, judged by the nearest coastline segment within maxDist?
 * Returns 'land', 'sea', or null when no coastline is close enough.
 */
export function landAt(chains, x, y, maxDist) {
  let best = null, bd = maxDist * maxDist;
  for (const ch of chains) {
    const b = ch.bbox;
    if (x < b.minX - maxDist || x > b.maxX + maxDist || y < b.minY - maxDist || y > b.maxY + maxDist) continue;
    const p = ch.pts;
    for (let i = 0; i < p.length - 2; i += 2) {
      const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - x, qy = ay + dy * t - y, d = qx * qx + qy * qy;
      if (d < bd) { bd = d; best = { ch, i, t }; }
    }
  }
  if (!best) return null;
  const p = best.ch.pts, i = best.i, n = p.length;
  const cross = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
  const s1 = cross(ax, ay, bx, by, x, y);
  let left = s1 > 0;
  if (best.t <= 0 && (i > 0 || best.ch.closed)) {
    const j = i > 0 ? i - 2 : n - 4;
    const px = p[j], py = p[j + 1];
    const s0 = cross(px, py, ax, ay, x, y), turn = cross(px, py, ax, ay, bx, by);
    left = turn > 0 ? s0 > 0 && s1 > 0 : s0 > 0 || s1 > 0;
  } else if (best.t >= 1 && (i + 4 < n || best.ch.closed)) {
    const j = i + 4 < n ? i + 4 : 2;
    const cx = p[j], cy = p[j + 1];
    const s2 = cross(bx, by, cx, cy, x, y), turn = cross(ax, ay, bx, by, cx, cy);
    left = turn > 0 ? s1 > 0 && s2 > 0 : s1 > 0 || s2 > 0;
  }
  return left ? 'land' : 'sea';
}
