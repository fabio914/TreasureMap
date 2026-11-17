// Hand-drawn map symbols. All sizes are CSS pixels.
export const INK = '#2a190b';
export const PAPER = '#e7d09f';
const FILL = 'rgba(222,196,140,0.96)';

export function tree(c, x, y, r, ph) {
  c.strokeStyle = INK; c.lineWidth = 1.1;
  c.beginPath(); c.moveTo(x, y + r * 0.5); c.lineTo(x, y + r * 1.45); c.stroke();
  c.beginPath();
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 + ph;
    const rr = r * (0.95 + 0.12 * Math.sin(i * 2.7 + ph));
    const px = x + Math.cos(a) * rr, py = y - r * 0.15 + Math.sin(a) * rr * 0.9;
    if (i === 0) c.moveTo(px, py);
    else {
      const am = a - Math.PI / n, rm = rr * 1.18;
      c.quadraticCurveTo(x + Math.cos(am) * rm, y - r * 0.15 + Math.sin(am) * rm * 0.9, px, py);
    }
  }
  c.closePath();
  c.fillStyle = FILL; c.fill(); c.stroke();
  c.lineWidth = 0.8; c.strokeStyle = 'rgba(42,25,11,0.7)';
  c.beginPath();
  for (let k = 0; k < 3; k++) {
    const ox = x + r * (0.15 + k * 0.22), oy = y + r * (0.05 + k * 0.08);
    c.moveTo(ox, oy - r * 0.35); c.lineTo(ox - r * 0.2, oy + r * 0.3);
  }
  c.stroke();
}

export function tuft(c, x, y, r) {
  c.beginPath();
  c.moveTo(x - r, y); c.quadraticCurveTo(x - r * 0.8, y - r * 0.8, x - r * 0.3, y - r * 1.1);
  c.moveTo(x, y); c.lineTo(x, y - r * 1.3);
  c.moveTo(x + r, y); c.quadraticCurveTo(x + r * 0.8, y - r * 0.8, x + r * 0.3, y - r * 1.1);
  c.stroke();
}

export function marsh(c, x, y, r) {
  c.beginPath(); c.moveTo(x - r * 1.3, y); c.lineTo(x + r * 1.3, y);
  for (const dx of [-0.6, 0, 0.6]) { c.moveTo(x + dx * r, y); c.lineTo(x + dx * r * 1.2, y - r * (dx === 0 ? 1.2 : 0.8)); }
  c.stroke();
}

export function rock(c, x, y, r) {
  c.beginPath(); c.moveTo(x - r, y + 2); c.lineTo(x - r * 0.2, y - r); c.lineTo(x + r * 0.3, y - r * 0.5); c.lineTo(x + r, y + 2); c.stroke();
}

export function cross(c, x, y, r) {
  c.beginPath(); c.moveTo(x, y - r); c.lineTo(x, y + r); c.moveTo(x - r * 0.6, y - r * 0.35); c.lineTo(x + r * 0.6, y - r * 0.35); c.stroke();
}

export function wave(c, x, y, sz) {
  c.moveTo(x - sz, y);
  c.quadraticCurveTo(x - sz * 0.5, y - sz * 0.55, x, y);
  c.quadraticCurveTo(x + sz * 0.5, y + sz * 0.55, x + sz, y);
}

export function peak(c, x, y, sz) {
  const w = sz, h = sz * 0.85;
  c.beginPath(); c.moveTo(x - w, y); c.lineTo(x - w * 0.1, y - h); c.lineTo(x + w * 0.15, y - h * 0.82); c.lineTo(x + w, y);
  c.fillStyle = FILL; c.fill();
  c.strokeStyle = INK; c.lineWidth = 1.4; c.stroke();
  c.lineWidth = 0.8; c.beginPath();
  for (let k = 1; k < 5; k++) {
    const f = k / 5, tx = x - w * 0.1 + w * 1.1 * f, ty = y - h + h * f;
    c.moveTo(tx - 0.5, ty + 1.5); c.lineTo(tx - w * 0.25, y - 0.5);
  }
  c.stroke();
}

export function settlement(c, x, y, size) {
  c.strokeStyle = INK; c.fillStyle = INK;
  if (size === 3) {
    c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(x, y, 3.6, 0, Math.PI * 2); c.fill();
  } else if (size === 2) {
    c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill();
  } else {
    c.beginPath(); c.arc(x, y, size === 1 ? 2.6 : 1.8, 0, Math.PI * 2); c.fill();
  }
}

export function marker(c, x, y) {
  c.strokeStyle = INK; c.lineWidth = 1.3;
  c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.stroke();
  c.fillStyle = INK; c.beginPath(); c.arc(x, y, 1.6, 0, Math.PI * 2); c.fill();
}

export function lighthouse(c, x, y) {
  c.strokeStyle = INK; c.lineWidth = 1;
  c.beginPath();
  for (const a of [-160, -125, -90, -55, -20]) {
    const r = a * Math.PI / 180;
    c.moveTo(x + Math.cos(r) * 5, y - 6 + Math.sin(r) * 5); c.lineTo(x + Math.cos(r) * 10, y - 6 + Math.sin(r) * 10);
  }
  c.stroke();
  c.beginPath(); c.moveTo(x - 3.2, y + 5); c.lineTo(x - 1.8, y - 5); c.lineTo(x + 1.8, y - 5); c.lineTo(x + 3.2, y + 5); c.closePath();
  c.fillStyle = PAPER; c.fill(); c.lineWidth = 1.2; c.stroke();
  c.fillStyle = '#a3241a'; c.fillRect(x - 2.3, y - 1, 4.6, 2.4);
  c.fillStyle = INK; c.beginPath(); c.arc(x, y - 6.2, 1.6, 0, Math.PI * 2); c.fill();
}

export function castle(c, x, y) {
  c.beginPath();
  c.moveTo(x - 6, y + 5); c.lineTo(x - 6, y - 4); c.lineTo(x - 4, y - 4); c.lineTo(x - 4, y - 2); c.lineTo(x - 1, y - 2); c.lineTo(x - 1, y - 6);
  c.lineTo(x + 1, y - 6); c.lineTo(x + 1, y - 2); c.lineTo(x + 4, y - 2); c.lineTo(x + 4, y - 4); c.lineTo(x + 6, y - 4); c.lineTo(x + 6, y + 5); c.closePath();
  c.fillStyle = PAPER; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
  c.fillStyle = INK; c.fillRect(x - 1.3, y + 1.5, 2.6, 3.5);
}

export function wreck(c, x, y) {
  c.strokeStyle = INK; c.lineWidth = 1.2;
  c.save(); c.translate(x, y); c.rotate(-0.25);
  c.beginPath(); c.moveTo(-7, -1); c.quadraticCurveTo(0, 5, 7, -1); c.closePath(); c.fillStyle = PAPER; c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-1, 0); c.lineTo(-3, -9); c.moveTo(3, 0); c.lineTo(4, -6); c.stroke();
  c.restore();
  c.lineWidth = 0.9; c.beginPath(); wave(c, x - 4, y + 5, 4); wave(c, x + 4, y + 5, 4); c.stroke();
}

export function church(c, x, y) { c.strokeStyle = INK; c.lineWidth = 1.4; cross(c, x, y, 5); }

export function windmill(c, x, y) {
  c.strokeStyle = INK; c.lineWidth = 1.1;
  c.beginPath(); c.moveTo(x - 5, y - 8); c.lineTo(x + 5, y + 2); c.moveTo(x + 5, y - 8); c.lineTo(x - 5, y + 2); c.stroke();
  c.beginPath(); c.moveTo(x - 2.5, y + 5); c.lineTo(x - 1.5, y - 3); c.lineTo(x + 1.5, y - 3); c.lineTo(x + 2.5, y + 5); c.closePath();
  c.fillStyle = PAPER; c.fill(); c.stroke();
}

export function tower(c, x, y) {
  c.strokeStyle = INK; c.lineWidth = 1.1; c.fillStyle = PAPER;
  c.beginPath(); c.rect(x - 2, y - 7, 4, 12); c.fill(); c.stroke();
}

export function ruins(c, x, y) {
  c.strokeStyle = INK; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(x - 6, y + 4); c.lineTo(x + 6, y + 4);
  c.moveTo(x - 4, y + 4); c.lineTo(x - 4, y - 5); c.lineTo(x - 2, y - 3);
  c.moveTo(x + 2, y + 4); c.lineTo(x + 2, y - 2); c.lineTo(x + 4, y - 4); c.stroke();
}

export function monument(c, x, y) {
  c.strokeStyle = INK; c.lineWidth = 1.1; c.fillStyle = PAPER;
  c.beginPath(); c.moveTo(x - 2.5, y + 5); c.lineTo(x - 1.2, y - 6); c.lineTo(x, y - 8); c.lineTo(x + 1.2, y - 6); c.lineTo(x + 2.5, y + 5); c.closePath(); c.fill(); c.stroke();
}

export function viewpoint(c, x, y) {
  c.strokeStyle = INK; c.lineWidth = 1;
  c.beginPath(); c.arc(x, y + 2, 4, Math.PI, 0); c.stroke();
  c.beginPath(); for (const a of [-150, -90, -30]) { const r = a * Math.PI / 180; c.moveTo(x + Math.cos(r) * 5.5, y + 2 + Math.sin(r) * 5.5); c.lineTo(x + Math.cos(r) * 8.5, y + 2 + Math.sin(r) * 8.5); } c.stroke();
}

export function cave(c, x, y) {
  c.fillStyle = INK; c.beginPath(); c.arc(x, y + 3, 4.5, Math.PI, 0); c.closePath(); c.fill();
}

export function spring(c, x, y) {
  c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.stroke();
  c.beginPath(); wave(c, x + 6, y + 1, 3); c.stroke();
}

export function serpent(c, x, y, k) {
  c.save(); c.translate(x, y); c.scale(k, k);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const body = (draw) => {
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(10 + i * 46, 0, 17 - i * 2, Math.PI, 0); draw(); }
    c.beginPath(); c.moveTo(-14, 0); c.bezierCurveTo(-18, -30, -10, -52, -30, -62); draw();
  };
  c.strokeStyle = INK; c.lineWidth = 12; body(() => c.stroke());
  c.strokeStyle = '#dcc28c'; c.lineWidth = 8; body(() => c.stroke());
  c.strokeStyle = 'rgba(42,25,11,0.6)'; c.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const cx = 10 + i * 46, r = 17 - i * 2;
    for (let a = 0.3; a < 2.9; a += 0.45) { c.beginPath(); c.moveTo(cx - Math.cos(a) * (r - 3), -Math.sin(a) * (r - 3)); c.lineTo(cx - Math.cos(a) * (r + 3), -Math.sin(a) * (r + 3)); c.stroke(); }
  }
  c.beginPath(); c.moveTo(-26, -70); c.quadraticCurveTo(-48, -78, -62, -66); c.lineTo(-50, -62); c.quadraticCurveTo(-40, -58, -34, -56); c.closePath();
  c.fillStyle = '#dcc28c'; c.fill(); c.strokeStyle = INK; c.lineWidth = 2.2; c.stroke();
  c.fillStyle = INK; c.beginPath(); c.arc(-40, -68, 2.6, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(-60, -64); c.lineTo(-72, -60); c.moveTo(-60, -64); c.lineTo(-71, -66); c.lineWidth = 1.4; c.stroke();
  c.beginPath(); c.moveTo(118, 0); c.quadraticCurveTo(132, -6, 140, -22); c.quadraticCurveTo(136, -6, 150, -4); c.quadraticCurveTo(136, 0, 118, 0);
  c.fillStyle = '#dcc28c'; c.fill(); c.lineWidth = 2; c.stroke();
  c.strokeStyle = 'rgba(42,25,11,0.55)'; c.lineWidth = 1.5;
  c.beginPath(); for (let i = -1; i < 4; i++) wave(c, i * 40 + 20, 10, 14); c.stroke();
  c.restore();
}

export function rose(c, x, y, R, fontDisplay, fontSc) {
  c.save();
  c.fillStyle = 'rgba(232,212,164,0.78)';
  c.beginPath(); c.arc(x, y, R * 1.02, 0, Math.PI * 2); c.fill();
  c.strokeStyle = INK; c.lineWidth = 1.8; c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 0.9; c.beginPath(); c.arc(x, y, R * 0.9, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2, r1 = R * 0.9, r2 = i % 4 === 0 ? R : R * 0.95;
    c.lineWidth = i % 16 === 0 ? 1.5 : 0.7;
    c.beginPath(); c.moveTo(x + Math.sin(a) * r1, y - Math.cos(a) * r1); c.lineTo(x + Math.sin(a) * r2, y - Math.cos(a) * r2); c.stroke();
  }
  c.lineWidth = 0.8; c.beginPath(); c.arc(x, y, R * 0.42, 0, Math.PI * 2); c.stroke();
  const rank = (i) => (i % 8 === 0 ? 3 : i % 4 === 0 ? 2 : i % 2 === 0 ? 1 : 0);
  const order = Array.from({ length: 32 }, (_, i) => i).sort((a, b) => rank(a) - rank(b));
  for (const i of order) {
    const rk = rank(i);
    const L = [R * 0.5, R * 0.62, R * 0.74, R * 0.88][rk], hw = [R * 0.045, R * 0.06, R * 0.08, R * 0.11][rk];
    const a = (i * 11.25 * Math.PI) / 180;
    const tx = x + Math.sin(a) * L, ty = y - Math.cos(a) * L;
    const lx = x + Math.sin(a - Math.PI / 2) * hw, ly = y - Math.cos(a - Math.PI / 2) * hw;
    const rx = x + Math.sin(a + Math.PI / 2) * hw, ry = y - Math.cos(a + Math.PI / 2) * hw;
    c.lineWidth = 1; c.strokeStyle = INK;
    c.beginPath(); c.moveTo(x, y); c.lineTo(lx, ly); c.lineTo(tx, ty); c.closePath(); c.fillStyle = rk >= 2 ? INK : '#6b4a26'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x, y); c.lineTo(rx, ry); c.lineTo(tx, ty); c.closePath(); c.fillStyle = '#ead7a8'; c.fill(); c.stroke();
  }
  c.fillStyle = '#ead7a8'; c.beginPath(); c.arc(x, y, R * 0.06, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `${Math.round(R * 0.38)}px ${fontDisplay}`; c.fillText('N', x, y - R * 1.22);
  c.font = `${Math.round(R * 0.22)}px ${fontSc}`;
  c.fillText('E', x + R * 1.15, y); c.fillText('S', x, y + R * 1.16); c.fillText('W', x - R * 1.17, y);
  c.restore();
}

/** Symbol painters for point classes; each returns nothing and draws centred on (x, y). */
export const POINT_GLYPHS = {
  lighthouse, castle, wreck, worship: church, windmill, tower, ruins, monument, viewpoint, cave_entrance: cave, spring,
  rock: (c, x, y) => { c.strokeStyle = INK; c.lineWidth = 1.2; rock(c, x, y + 2, 5); },
};

export const FONTS = {
  body: '"IM Fell English", Georgia, serif',
  sc: '"IM Fell English SC", "IM Fell English", Georgia, serif',
  display: '"Pirata One", Georgia, serif',
};
