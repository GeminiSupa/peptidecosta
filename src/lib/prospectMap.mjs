/**
 * Web Mercator arithmetic for the Prospector map.
 *
 * The map used to be an OpenStreetMap embed iframe, which can show exactly one
 * marker and cannot be asked where it is looking. A search returns up to eighty
 * businesses whose spread across a city is the most useful thing about them, so
 * the panel is now drawn from raster tiles directly — which needs projection,
 * and projection is arithmetic, so it lives here where it can be tested without
 * a browser.
 *
 * A "view" throughout this module is `{ latitude, longitude, zoom, width,
 * height }`: the geographic point at the centre of the panel, the zoom level,
 * and the panel's size in CSS pixels.
 */

export const TILE_SIZE = 256;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 18;

/** The latitude where Mercator runs to infinity; every tile scheme stops here. */
export const MAX_LATITUDE = 85.05112878;

export const clampLatitude = (latitude) => Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, Number(latitude) || 0));
export const clampZoom = (zoom) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(Number(zoom) || MIN_ZOOM)));

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;

/** Longitude as a fraction of the world, 0 at the antimeridian going west. */
export function lonToUnitX(longitude) {
  return (Number(longitude) + 180) / 360;
}

/** Latitude as a fraction of the world, 0 at the north edge. */
export function latToUnitY(latitude) {
  const rad = toRadians(clampLatitude(latitude));
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

export const unitXToLon = (x) => x * 360 - 180;
export const unitYToLat = (y) => toDegrees(Math.atan(Math.sinh(Math.PI * (1 - 2 * y))));

/** World pixel size at a zoom level: 256 at z0, doubling each level. */
export const worldSize = (zoom) => TILE_SIZE * 2 ** zoom;

export const lonToWorldX = (longitude, zoom) => lonToUnitX(longitude) * worldSize(zoom);
export const latToWorldY = (latitude, zoom) => latToUnitY(latitude) * worldSize(zoom);
export const worldXToLon = (x, zoom) => unitXToLon(x / worldSize(zoom));
export const worldYToLat = (y, zoom) => unitYToLat(y / worldSize(zoom));

/**
 * Where a coordinate sits inside the panel, in CSS pixels from its top-left.
 *
 * Values outside `0..width` / `0..height` are off-screen and expected — the
 * caller decides whether to clip them or let them hang over the edge.
 */
export function projectPoint({ latitude, longitude }, view) {
  const centerX = lonToWorldX(view.longitude, view.zoom);
  const centerY = latToWorldY(view.latitude, view.zoom);
  return {
    x: lonToWorldX(longitude, view.zoom) - centerX + view.width / 2,
    y: latToWorldY(latitude, view.zoom) - centerY + view.height / 2,
  };
}

/** The geographic rectangle currently on screen. */
export function viewportBounds(view) {
  const centerX = lonToWorldX(view.longitude, view.zoom);
  const centerY = latToWorldY(view.latitude, view.zoom);
  const size = worldSize(view.zoom);
  const left = centerX - view.width / 2;
  const right = centerX + view.width / 2;
  const top = Math.max(0, centerY - view.height / 2);
  const bottom = Math.min(size, centerY + view.height / 2);
  return {
    north: worldYToLat(top, view.zoom),
    south: worldYToLat(bottom, view.zoom),
    west: Math.max(-180, worldXToLon(left, view.zoom)),
    east: Math.min(180, worldXToLon(right, view.zoom)),
  };
}

/** Which coordinate a click at a panel pixel landed on. */
export function unprojectPoint({ x, y }, view) {
  const centerX = lonToWorldX(view.longitude, view.zoom);
  const centerY = latToWorldY(view.latitude, view.zoom);
  return {
    longitude: worldXToLon(centerX + x - view.width / 2, view.zoom),
    latitude: worldYToLat(centerY + y - view.height / 2, view.zoom),
  };
}

/**
 * The tiles covering the panel, each with the offset to position it at.
 *
 * X wraps around the world so panning past the antimeridian keeps painting;
 * Y does not, because there is nothing above the north pole.
 */
export function visibleTiles(view) {
  const scale = 2 ** view.zoom;
  const centerX = lonToWorldX(view.longitude, view.zoom);
  const centerY = latToWorldY(view.latitude, view.zoom);
  const left = centerX - view.width / 2;
  const top = centerY - view.height / 2;

  const firstX = Math.floor(left / TILE_SIZE);
  const lastX = Math.floor((left + view.width) / TILE_SIZE);
  const firstY = Math.floor(top / TILE_SIZE);
  const lastY = Math.floor((top + view.height) / TILE_SIZE);

  const tiles = [];
  for (let y = firstY; y <= lastY; y += 1) {
    if (y < 0 || y >= scale) continue;
    for (let x = firstX; x <= lastX; x += 1) {
      const wrappedX = ((x % scale) + scale) % scale;
      tiles.push({
        key: `${view.zoom}/${x}/${y}`,
        x: wrappedX,
        y,
        z: view.zoom,
        left: x * TILE_SIZE - left,
        top: y * TILE_SIZE - top,
      });
    }
  }
  return tiles;
}

/**
 * Where raster tiles come from.
 *
 * Defaults to OpenStreetMap's own servers, whose usage policy asks that
 * applications not treat them as a free CDN. An internal tab a handful of reps
 * use is well inside that, but the moment it is not, this is the one thing to
 * change — point NEXT_PUBLIC_MAP_TILE_URL at a paid provider and nothing else
 * moves. The template takes {z}, {x} and {y}.
 */
const TILE_URL_TEMPLATE = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_MAP_TILE_URL)
  || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function tileUrl(tile) {
  return TILE_URL_TEMPLATE
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));
}

/** Moving the map by a pixel drag is a move of the centre in the other direction. */
export function panView(view, deltaX, deltaY) {
  const centerX = lonToWorldX(view.longitude, view.zoom);
  const centerY = latToWorldY(view.latitude, view.zoom);
  const size = worldSize(view.zoom);
  return {
    ...view,
    longitude: worldXToLon(centerX - deltaX, view.zoom),
    latitude: worldYToLat(Math.max(0, Math.min(size, centerY - deltaY)), view.zoom),
  };
}

/**
 * Zooms while holding one panel pixel still.
 *
 * Without the anchor, zooming with the wheel walks the map away from whatever
 * the pointer was over, which is the difference between a map you can explore
 * and one you have to keep re-centring.
 */
export function zoomView(view, nextZoom, anchor) {
  const zoom = clampZoom(nextZoom);
  if (zoom === view.zoom) return view;
  const point = anchor
    ? unprojectPoint(anchor, view)
    : { latitude: view.latitude, longitude: view.longitude };
  const zoomed = { ...view, zoom };
  if (!anchor) return zoomed;

  const after = projectPoint(point, zoomed);
  return panView(zoomed, anchor.x - after.x, anchor.y - after.y);
}

/**
 * A coordinate, or null.
 *
 * The emptiness check is not redundant: `Number(null)` and `Number('')` are
 * both `0`, so a prospect the directory had no position for would otherwise
 * pass `Number.isFinite` and get pinned to 0°N 0°E in the Gulf of Guinea.
 */
const finiteCoordinate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const coordinatesOf = (item) => {
  const latitude = finiteCoordinate(item?.latitude);
  const longitude = finiteCoordinate(item?.longitude);
  return latitude === null || longitude === null ? null : { latitude, longitude };
};

export const hasCoordinates = (item) => coordinatesOf(item) !== null;

/**
 * A view that shows every one of these prospects at once.
 *
 * Falls back to a readable street-level zoom for a single pin, where the
 * bounding box has no extent to fit and the fitted zoom would be MAX_ZOOM.
 */
export function fitView(items, { width, height, padding = 48, fallbackZoom = 14 } = {}) {
  const points = (Array.isArray(items) ? items : []).map(coordinatesOf).filter(Boolean);
  if (!points.length) return null;

  let west = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  let south = Infinity;
  for (const point of points) {
    west = Math.min(west, point.longitude);
    east = Math.max(east, point.longitude);
    north = Math.max(north, clampLatitude(point.latitude));
    south = Math.min(south, clampLatitude(point.latitude));
  }

  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  const spanX = lonToUnitX(east) - lonToUnitX(west);
  const spanY = latToUnitY(south) - latToUnitY(north);

  const zoomX = spanX > 0 ? Math.log2(usableWidth / (TILE_SIZE * spanX)) : Infinity;
  const zoomY = spanY > 0 ? Math.log2(usableHeight / (TILE_SIZE * spanY)) : Infinity;
  const fitted = Math.min(zoomX, zoomY);

  return {
    latitude: unitYToLat((latToUnitY(north) + latToUnitY(south)) / 2),
    longitude: (west + east) / 2,
    zoom: clampZoom(Number.isFinite(fitted) ? Math.floor(fitted) : fallbackZoom),
    width,
    height,
  };
}

/** The bbox the search route wants, from the rectangle now on screen. */
export function boundsToSearchArea(bounds) {
  return {
    south: Number(bounds.south.toFixed(6)),
    west: Number(bounds.west.toFixed(6)),
    north: Number(bounds.north.toFixed(6)),
    east: Number(bounds.east.toFixed(6)),
  };
}

/**
 * The largest rectangle a map-area search may cover, in square degrees.
 *
 * Above this the query stops being "what is on my screen" and becomes the
 * country-wide scan the Overpass mirrors already refuse. Both sides import it
 * from here: the map disables the button with an explanation, and the search
 * route rejects the request — two copies of this number would eventually
 * disagree, and the failure mode is a button that promises a search the server
 * will not run.
 */
export const MAX_SEARCH_AREA_DEGREES = 12;

export function searchAreaTooLarge(bounds) {
  return (bounds.north - bounds.south) * (bounds.east - bounds.west) > MAX_SEARCH_AREA_DEGREES;
}

/**
 * Validates a rectangle the map asked the server to search.
 *
 * @returns {{south:number,west:number,north:number,east:number}|null} null when
 *   the rectangle is malformed, inverted, off the world, or too large to serve.
 */
export function normalizeSearchBbox(input) {
  if (!input || typeof input !== 'object') return null;
  const south = Number(input.south);
  const west = Number(input.west);
  const north = Number(input.north);
  const east = Number(input.east);
  if (![south, west, north, east].every(Number.isFinite)) return null;
  if (south >= north || west >= east) return null;
  if (south < -MAX_LATITUDE || north > MAX_LATITUDE || west < -180 || east > 180) return null;
  if (searchAreaTooLarge({ south, west, north, east })) return null;
  return { south, west, north, east };
}
