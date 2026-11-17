// Seamless parchment texture tiles.
import { mulberry32, clamp } from './util.js';

/** A size x size (CSS px) seamless parchment tile rendered at device-pixel ratio dpr. */
export function makeParchmentTile(size = 512, dpr = 1, seed = 7) {
  const S = Math.round(size * dpr);
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const c = cv.getContext('2d');
  const rnd = mulberry32(seed);
  c.fillStyle = '#e7d09f';
  c.fillRect(0, 0, S, S);
  const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = (60 + rnd() * 200) * dpr;
    const dark = rnd() < 0.6, a = dark ? 0.03 + rnd() * 0.05 : 0.05 + rnd() * 0.07;
    wrap((ox, oy) => {
      const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, dark ? `rgba(140,90,35,${a})` : `rgba(255,246,218,${a})`);
      g.addColorStop(1, dark ? 'rgba(140,90,35,0)' : 'rgba(255,246,218,0)');
      c.fillStyle = g; c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  c.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S, y = rnd() * S, L = (14 + rnd() * 60) * dpr, ang = rnd() * Math.PI;
    const col = rnd() < 0.5 ? 'rgba(120,80,30,0.07)' : 'rgba(255,250,230,0.10)', lw = (0.5 + rnd()) * dpr;
    const bx = (rnd() - 0.5) * 10 * dpr, by = (rnd() - 0.5) * 10 * dpr;
    wrap((ox, oy) => {
      c.strokeStyle = col; c.lineWidth = lw;
      c.beginPath(); c.moveTo(x + ox, y + oy);
      c.quadraticCurveTo(x + ox + Math.cos(ang) * L * 0.5 + bx, y + oy + Math.sin(ang) * L * 0.5 + by, x + ox + Math.cos(ang) * L, y + oy + Math.sin(ang) * L);
      c.stroke();
    });
  }
  const id = c.getImageData(0, 0, S, S), d = id.data;
  let s = (rnd() * 4294967296) >>> 0;
  for (let i = 0; i < d.length; i += 4) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    const n = ((s >>> 0) / 4294967296 - 0.5) * 18;
    d[i] = clamp(d[i] + n, 0, 255); d[i + 1] = clamp(d[i + 1] + n * 0.92, 0, 255); d[i + 2] = clamp(d[i + 2] + n * 0.8, 0, 255);
  }
  c.putImageData(id, 0, 0);
  return cv;
}

/** Diagonal hatching used for built-up areas when buildings are not drawn. */
export function makeHatchTile(dpr = 1) {
  const S = Math.round(8 * dpr);
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const c = cv.getContext('2d');
  c.strokeStyle = 'rgba(42,25,11,0.32)'; c.lineWidth = 0.9 * dpr;
  for (const o of [-S, 0, S]) { c.beginPath(); c.moveTo(o, S); c.lineTo(o + S, 0); c.stroke(); }
  return cv;
}
