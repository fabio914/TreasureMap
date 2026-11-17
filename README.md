# Treasure Map

OpenStreetMap data drawn as old pirate treasure charts.

## island-hunt — *Paces to the Gold*

A treasure-hunt game on four real islands with treasure legends (Oak Island, Gardiners Island,
Norman Island, Cocos Island). Each chart is drawn on a canvas: parchment, ink coastlines with ripple
lines, hand-drawn trees, a 32-point compass rose with rhumb lines, a cartouche with a scale of paces,
a graticule border and burnt edges. You get an order such as *"Begin at Martins Point. From thence
walk 370 paces north by west, and there dig"*, measure it out with the dividers, and dig.

The map data is embedded in the page, so `island-hunt/index.html` opens directly in a browser.

Rebuilding the data:

```sh
cd island-hunt
scripts/fetch_osm.sh osm                       # download raw extracts from Overpass
python3 scripts/process.py osm data/maps.json  # coastline -> land polygons, simplify, labels
python3 scripts/build.py                       # embed data into src/template.html -> index.html
```

To add an island, add its bounding box to `scripts/fetch_osm.sh` and to `ISLANDS` in
`scripts/process.py`, and its name and story to `INFO` in `src/template.html`.

## Map data

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the
Open Database License (ODbL). `island-hunt/data/maps.json` is a derived database of that data and is
covered by the ODbL.
