import { TreasureMap } from './src/map.js';

const PORTS = [
  { name: 'Oak Island', lon: -64.2935, lat: 44.5135, zoom: 15.6 },
  { name: 'Port Royal', lon: -76.8405, lat: 17.9375, zoom: 15.8 },
  { name: 'Nassau', lon: -77.335, lat: 25.075, zoom: 13.6 },
  { name: 'Tortuga', lon: -72.78, lat: 20.04, zoom: 12.6 },
  { name: 'Mont-Saint-Michel', lon: -1.5115, lat: 48.6361, zoom: 15.6 },
  { name: 'Valletta', lon: 14.5146, lat: 35.8989, zoom: 15.6 },
  { name: 'Venice', lon: 12.3326, lat: 45.4371, zoom: 14.2 },
  { name: 'Isles of Scilly', lon: -6.32, lat: 49.93, zoom: 12.8 },
  { name: 'Cocos Island', lon: -87.06, lat: 5.53, zoom: 13.2 },
  { name: 'St. George’s', lon: -64.677, lat: 32.381, zoom: 15.6 },
];

// Restore the view from the address bar: #map=zoom/lat/lon
function fromHash() {
  const m = location.hash.match(/map=([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)/);
  return m ? { zoom: +m[1], lat: +m[2], lon: +m[3] } : null;
}
const start = fromHash() || PORTS[0];

// ?overpass=<url> points the chart at another Overpass server (your own instance, or a test double)
const custom = new URLSearchParams(location.search).get('overpass');
const map = new TreasureMap(document.getElementById('map'), {
  center: [start.lon, start.lat], zoom: start.zoom,
  ...(custom ? { endpoints: [custom] } : {}),
});

map.addEventListener('moveend', (e) => {
  const { lon, lat, zoom } = e.detail;
  history.replaceState(null, '', `#map=${zoom.toFixed(2)}/${lat.toFixed(5)}/${lon.toFixed(5)}`);
});
window.addEventListener('hashchange', () => { const v = fromHash(); if (v) map.setView(v.lon, v.lat, v.zoom); });

const statusEl = document.getElementById('status'), statusText = document.getElementById('status-text');
map.addEventListener('status', (e) => {
  const s = e.detail;
  const busy = s.active + s.queued > 0;
  statusEl.classList.toggle('busy', busy);
  statusEl.classList.toggle('err', !!s.error);
  const mb = (s.bytes / 1e6).toFixed(1);
  if (s.error) statusText.textContent = `${s.error}. Retrying…`;
  else if (busy) statusText.textContent = `Surveying ${s.active + s.queued} stretch${s.active + s.queued === 1 ? '' : 'es'} of coast…`;
  else statusText.textContent = `Chart up to date · ${s.features.toLocaleString('en-US')} features · ${mb} MB`;
});

const ports = document.getElementById('ports');
for (const p of PORTS) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = p.name;
  b.addEventListener('click', () => map.setView(p.lon, p.lat, p.zoom));
  ports.append(b);
}

document.getElementById('zin').addEventListener('click', () => map.zoomBy(2));
document.getElementById('zout').addEventListener('click', () => map.zoomBy(0.5));

const toggle = document.getElementById('toggle'), body = document.getElementById('body');
toggle.addEventListener('click', () => {
  const open = body.hidden;
  body.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Hide the logbook' : 'Show the logbook';
});
if (window.innerWidth < 600) toggle.click();

// Place search through Nominatim (one request per submit, as its usage policy asks).
const results = document.getElementById('results');
document.getElementById('search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = document.getElementById('q').value.trim();
  if (!q) return;
  results.hidden = false;
  results.innerHTML = '<li class="status">Consulting the gazetteer…</li>';
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`The gazetteer answered ${res.status}`);
    const rows = await res.json();
    results.innerHTML = '';
    if (!rows.length) { results.innerHTML = '<li class="status">No place by that name. Try a town, island or bay.</li>'; return; }
    for (const r of rows) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = r.display_name;
      b.addEventListener('click', () => {
        const [s, n, w, e2] = r.boundingbox.map(Number);
        // fit the place's extent, but no wider than the widest tier and no closer than street level
        const span = Math.max(n - s, (e2 - w) * Math.cos(((s + n) / 2) * Math.PI / 180), 0.002);
        const zoom = Math.min(16, Math.max(10, Math.log2(360 / span) - 0.6));
        map.setView(+r.lon, +r.lat, zoom);
        results.hidden = true;
      });
      li.append(b); results.append(li);
    }
  } catch (err) {
    results.innerHTML = '';
    const li = document.createElement('li'); li.className = 'status'; li.textContent = `${err.message || err}. Check the connection and try again.`;
    results.append(li);
  }
});

window.treasureMap = map;
