// Checks coastline-to-land assembly. Run: node test/coast.test.mjs
import assert from 'node:assert/strict';
import { buildLand, landAt, mergeCoast, signedArea, closeWithRect, clipPolyline } from '../src/coast.js';

const sq = (r) => { // even-odd area of rings
  return Math.round(r.reduce((s, ring) => s + Math.abs(signedArea(ring)), 0) * 1e6) / 1e6;
};

// 1. An island (counter-clockwise square) fully inside the view.
{
  const island = { id: 1, a: 1, b: 1, pts: Float64Array.from([0, 0, 10, 0, 10, 10, 0, 10, 0, 0]) };
  const chains = mergeCoast([island]);
  assert.equal(chains.length, 1); assert.ok(chains[0].closed);
  const res = buildLand(chains, { minX: -5, minY: -5, maxX: 15, maxY: 15 });
  assert.equal(res.crossed, false);
  assert.equal(res.rings.length, 1);
  assert.equal(sq(res.rings), 100);
  assert.equal(landAt(chains, 5, 5, 100), 'land');
  assert.equal(landAt(chains, -3, 5, 100), 'sea');
  assert.equal(landAt(chains, 12, 12, 100), 'sea'); // near a convex corner
}

// 2. A straight mainland coast split over two ways, running west -> east: land to the north (left).
{
  const w1 = { id: 1, a: 1, b: 2, pts: Float64Array.from([-100, 0, 0, 0]) };
  const w2 = { id: 2, a: 2, b: 3, pts: Float64Array.from([0, 0, 100, 0]) };
  const chains = mergeCoast([w2, w1]);
  assert.equal(chains.length, 1); assert.equal(chains[0].closed, false);
  const r = { minX: -10, minY: -10, maxX: 10, maxY: 10 };
  const res = buildLand(chains, r);
  assert.equal(res.crossed, true);
  assert.equal(res.rings.length, 1);
  assert.equal(sq(res.rings), 200); // northern half of the 20x20 view
  assert.equal(landAt(chains, 0, 5, 50), 'land');
  assert.equal(landAt(chains, 0, -5, 50), 'sea');
}

// 3. A bay: coastline enters from the west, dips south, leaves to the east. Land to the north.
{
  const pts = Float64Array.from([-100, 0, -5, 0, -5, -8, 5, -8, 5, 0, 100, 0]);
  const chains = mergeCoast([{ id: 1, a: 1, b: 2, pts }]);
  const res = buildLand(chains, { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  assert.equal(sq(res.rings), 200 + 80); // northern half plus the 10x8 tongue of land
}

// 4. Two separate headlands crossing the view need two closures that walk corners.
{
  const a = { id: 1, a: 1, b: 2, pts: Float64Array.from([-100, 5, 100, 5]) }; // land north of y=5
  const b = { id: 2, a: 3, b: 4, pts: Float64Array.from([100, -5, -100, -5]) }; // land south of y=-5
  const res = buildLand(mergeCoast([a, b]), { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  assert.equal(res.rings.length, 2);
  assert.equal(sq(res.rings), 100 + 100);
}

// 5. Real data, when the raw island extracts are available.
import { readFileSync, existsSync } from 'node:fs';
import { OsmStore } from '../src/osm.js';
import { project } from '../src/geo.js';
const dir = process.argv[2];
if (dir && existsSync(`${dir}/oak.json`)) {
  const boxes = { oak: [44.503, -64.312, 44.524, -64.278], gardiners: [41.05, -72.13, 41.13, -72.06], norman: [18.3, -64.645, 18.335, -64.59], cocos: [5.49, -87.12, 5.57, -87.02] };
  // largest land area in m^2 from the Python pipeline (equirectangular metres)
  const expect = { oak: 1140468, gardiners: 13342553, norman: 2521433, cocos: 22945910 };
  for (const [k, [S, W, N, E]] of Object.entries(boxes)) {
    const store = new OsmStore();
    store.ingest(JSON.parse(readFileSync(`${dir}/${k}.json`, 'utf8')).elements);
    const [x0, y0] = project(W, S), [x1, y1] = project(E, N);
    // Python kept closed islands whole even where they ran past the frame (Gardiners' north spit),
    // so for that island compare against a rectangle that contains all of it.
    const pad = k === 'gardiners' ? (x1 - x0) : 0;
    const res = buildLand(store.coastChains(), { minX: x0 - pad, minY: y0 - pad, maxX: x1 + pad, maxY: y1 + pad });
    const lat = ((S + N) / 2) * Math.PI / 180, k2 = Math.cos(lat) ** 2; // mercator -> ground area
    const biggest = Math.max(...res.rings.map((r) => Math.abs(signedArea(r)) * k2));
    const ratio = biggest / expect[k];
    console.log(`${k}: ${res.rings.length} rings, largest ${Math.round(biggest)} m2 (python ${expect[k]}, ratio ${ratio.toFixed(3)})`);
    assert.ok(ratio > 0.97 && ratio < 1.03, `${k} land area differs from the Python result`);
  }
}
console.log('coast tests passed');
