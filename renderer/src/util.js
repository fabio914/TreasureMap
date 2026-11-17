export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable pseudo-random value in [0, 1) for an integer grid cell. */
export function hash2(i, j, s = 0) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function niceStep(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function dms(v, pos, neg) {
  const h = v >= 0 ? pos : neg; v = Math.abs(v);
  let d = Math.floor(v), m = Math.floor((v - d) * 60), s = Math.round(((v - d) * 60 - m) * 60);
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) { m = 0; d += 1; }
  return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″${h}`;
}

export function spacedWidth(ctx, text, spacing) {
  if (!spacing) return ctx.measureText(text).width;
  let w = 0; const chars = [...text];
  for (const ch of chars) w += ctx.measureText(ch).width;
  return w + spacing * (chars.length - 1);
}

/** Draw text with optional letter spacing and a paper-coloured halo, left-aligned at x. */
export function drawText(ctx, text, x, y, spacing = 0, halo = null) {
  if (!spacing) {
    if (halo) { ctx.strokeText(text, x, y); }
    ctx.fillText(text, x, y);
    return;
  }
  let cx = x;
  for (const ch of text) {
    if (halo) ctx.strokeText(ch, cx, y);
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}
