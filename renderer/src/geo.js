// Web Mercator projection and the screen view.
// World coordinates are EPSG:3857 metres with y pointing north.

export const EARTH_R = 6378137;
export const MAX_LAT = 85.0511287798;
const D2R = Math.PI / 180;

export function project(lon, lat) {
  const la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * D2R;
  return [EARTH_R * lon * D2R, EARTH_R * Math.log(Math.tan(Math.PI / 4 + la / 2))];
}

export function unproject(x, y) {
  return [x / EARTH_R / D2R, (2 * Math.atan(Math.exp(y / EARTH_R)) - Math.PI / 2) / D2R];
}

/** Metres (Mercator) per CSS pixel at a slippy-map zoom level. */
export const resForZoom = (z) => (2 * Math.PI * EARTH_R) / 256 / Math.pow(2, z);
export const zoomForRes = (r) => Math.log2((2 * Math.PI * EARTH_R) / 256 / r);

export class View {
  constructor({ width, height, cx, cy, res }) {
    this.width = width; this.height = height;
    this.cx = cx; this.cy = cy; this.res = res;
  }
  sx(x) { return (x - this.cx) / this.res + this.width / 2; }
  sy(y) { return this.height / 2 - (y - this.cy) / this.res; }
  world(sx, sy) { return [this.cx + (sx - this.width / 2) * this.res, this.cy - (sy - this.height / 2) * this.res]; }
  bounds(marginPx = 0) {
    const hw = (this.width / 2 + marginPx) * this.res, hh = (this.height / 2 + marginPx) * this.res;
    return { minX: this.cx - hw, minY: this.cy - hh, maxX: this.cx + hw, maxY: this.cy + hh };
  }
  get zoom() { return zoomForRes(this.res); }
  get center() { return unproject(this.cx, this.cy); }
  /** Ground metres per CSS pixel at the view centre. */
  groundRes() { return this.res * Math.cos(this.center[1] * D2R); }
}

export function rectsIntersect(a, b) {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}
export function rectInside(inner, outer) {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}
