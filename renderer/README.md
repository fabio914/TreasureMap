# Treasure Chart renderer

A JavaScript renderer that draws live OpenStreetMap data as an old pirate treasure chart, in the
browser, for any place on Earth. Pan, zoom and pinch the chart; it fetches what it needs from the
Overpass API as you move and redraws in the same ink-and-parchment style as the island game.

No build step and no dependencies: plain ES modules and Canvas 2D.

## Run it

```sh
cd renderer
python3 -m http.server 8000     # or: npm start
# open http://localhost:8000/
```

ES modules need a web server; opening `index.html` from disk won't work. The page remembers the view
in the address bar (`#map=15.60/44.51350/-64.29350`), so a link opens the same stretch of coast.
Add `?overpass=<url>` to use a different Overpass server.

## Use it in your own page

```js
import { TreasureMap } from './src/map.js';

const map = new TreasureMap(document.getElementById('chart'), {
  center: [-64.2935, 44.5135],   // lon, lat
  zoom: 15.5,                    // slippy-map zoom, 10 to 19
});
map.addEventListener('select', (e) => console.log(e.detail.item));   // a clicked feature, or null
map.addEventListener('status', (e) => console.log(e.detail));        // loader progress
map.setView(12.3326, 45.4371, 14.2);
```

The container needs a size. The map adds two canvases and a popup element to it; the popup is
unstyled apart from its position (see `.tm-popup` in `index.html`). Pass `popup: false` to handle
`select` events yourself.

The renderer also works without the map controller, for a still image or a different interaction
model: fill an `OsmStore` with Overpass JSON and call `TreasureRenderer.render(ctx, view, store)`.
`test/render.html` does exactly that.

## How it works

| File | Job |
| --- | --- |
| `src/geo.js` | Web Mercator projection and the `View` (centre, metres per pixel, screen size). |
| `src/overpass.js` | Loads data by grid cell. Three detail tiers (detail from zoom 15.5, regional from 12.5, wide below), each with its own cell size and query. Missing cells around the view are fetched in one request, nearest first, two at a time, with retries and endpoint fallback. A coarser coastline-only layer is loaded too. |
| `src/osm.js` | Turns Overpass JSON into a deduplicated store of areas, lines and points with projected coordinates. Joins multipolygon members into rings. |
| `src/coast.js` | Builds land for each view. OSM maps coastlines as lines with land on the left, so the merged coastline is clipped to the view and the pieces are closed by walking counter-clockwise along the view edge. When no coastline crosses the view, the nearest coastline segment decides land or sea. |
| `src/renderer.js` | The style: parchment, sea tint, rhumb lines, coastal ripple lines, waves and sea serpents in open water, textured land with coastal shading, trees, scrub, marsh and beach stipple, ink roads, rails, rivers, cliffs and buildings, symbols, and collision-free lettering. |
| `src/hud.js` | Screen-fixed furniture: frame with a graticule of real latitudes and longitudes, compass rose, cartouche with the area's name and a scale in paces, cables or leagues, attribution and the burnt edge. |
| `src/map.js` | The interactive controller: gestures, wheel and keyboard, data requests, hit testing and the popup. |
| `src/glyphs.js`, `src/parchment.js` | Hand-drawn symbols and the seamless paper texture. |

Decoration (trees, waves, serpents, paper grain) is placed on a grid fixed to the ground, so it stays
put while you pan. While a gesture is under way the last frame is moved and scaled; a full redraw
follows once the gesture settles.

## Tests

```sh
npm test                                   # coastline assembly unit tests (Node)
node test/make-fixture.mjs oak -64.2935 44.5135 15.6   # save an Overpass response for a view
python3 test/mock_overpass.py 8766 oak     # static server + fake Overpass answering with that fixture
# then open:
#   http://127.0.0.1:8766/test/render.html?f=oak        offline render of the fixture
#   http://127.0.0.1:8766/test/interaction.html?overpass=http://127.0.0.1:8766/interpreter
#                                                       drag, wheel, pinch, click and popup checks
```

Fixtures are not committed (`test/fixtures/` is ignored); make them with `make-fixture.mjs`.

## Limits

- **Overpass is a shared, free service.** It is sometimes busy (the loader retries and falls back to a
  second server), and dense cities at the detail tier can mean several megabytes per view. For heavy
  use, run your own Overpass instance and pass it with `?overpass=` or the `endpoints` option.
- Woods and other land cover appear from zoom 12.5; wider views show coast, rivers, big roads, lakes
  and places only, to keep downloads small.
- Road names are not lettered along the roads yet.
- Below zoom 10 nothing more is loaded.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. Place search
uses [Nominatim](https://nominatim.org/), one request per search.
