// Downloads an Overpass response for a view, using the same queries as the live loader,
// so test/render.html can draw it offline.
// Usage: node test/make-fixture.mjs <name> <lon> <lat> <zoom> [width] [height]
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { project, unproject, resForZoom } from '../src/geo.js';
import { tierFor, DEFAULT_ENDPOINTS } from '../src/overpass.js';

const [name, lon, lat, zoom, width = 1400, height = 900] = process.argv.slice(2);
const tier = tierFor(+zoom);
const [cx, cy] = project(+lon, +lat), res = resForZoom(+zoom);
const m = (Math.max(+width, +height) / 2 + 200) * res;
const cell = tier.cell;
const r = { minX: Math.floor((cx - m) / cell) * cell, minY: Math.floor((cy - m) / cell) * cell, maxX: Math.ceil((cx + m) / cell) * cell, maxY: Math.ceil((cy + m) / cell) * cell };
const [w, s] = unproject(r.minX, r.minY), [e, n] = unproject(r.maxX, r.maxY);
const bb = [s, w, n, e].map((v) => v.toFixed(6)).join(',');
// the tier query plus the wider coastline-only context
const ctx = 4 * m;
const [w2, s2] = unproject(cx - ctx, cy - ctx), [e2, n2] = unproject(cx + ctx, cy + ctx);
const q = `[out:json][timeout:120];(${tier.geom.replace(/;/g, `(${bb});`)}way["natural"="coastline"](${[s2, w2, n2, e2].map((v) => v.toFixed(6)).join(',')}););out geom qt;(${tier.labels.replace(/;/g, `(${bb});`)});out bb tags qt;`;
const url = process.env.OVERPASS_URL || DEFAULT_ENDPOINTS[0];
let json;
for (let attempt = 1; ; attempt++) {
  const out = execFileSync('curl', ['-s', '-A', 'treasure-map-renderer-tests/0.1', '--data-urlencode', 'data=' + q, url], { maxBuffer: 1 << 30 }).toString();
  try { json = JSON.parse(out); break; } catch {
    if (attempt >= 5) { console.error('Overpass did not return JSON:', out.slice(0, 200)); process.exit(1); }
    console.error(`Overpass busy, retrying (${attempt})`);
    execFileSync('sleep', [String(attempt * 10)]);
  }
}
writeFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), JSON.stringify({ view: { lon: +lon, lat: +lat, zoom: +zoom }, elements: json.elements }));
console.log(`${name}: ${json.elements.length} elements (${tier.key} tier)`);
