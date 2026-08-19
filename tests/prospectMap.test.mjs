import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  boundsToSearchArea,
  clampLatitude,
  clampZoom,
  fitView,
  hasCoordinates,
  MAX_ZOOM,
  MIN_ZOOM,
  normalizeSearchBbox,
  panView,
  projectPoint,
  searchAreaTooLarge,
  tileUrl,
  unprojectPoint,
  viewportBounds,
  visibleTiles,
  zoomView,
} from '../src/lib/prospectMap.mjs';

const VIEW = { latitude: 9.9281, longitude: -84.0907, zoom: 13, width: 600, height: 520 };

test('the centre of the view projects to the centre of the panel', () => {
  const point = projectPoint({ latitude: VIEW.latitude, longitude: VIEW.longitude }, VIEW);
  assert.ok(Math.abs(point.x - VIEW.width / 2) < 1e-9);
  assert.ok(Math.abs(point.y - VIEW.height / 2) < 1e-9);
});

test('projecting and unprojecting a pixel returns the same pixel', () => {
  for (const pixel of [{ x: 0, y: 0 }, { x: 137, y: 412 }, { x: 600, y: 520 }]) {
    const point = projectPoint(unprojectPoint(pixel, VIEW), VIEW);
    assert.ok(Math.abs(point.x - pixel.x) < 1e-6, `x drifted at ${pixel.x}`);
    assert.ok(Math.abs(point.y - pixel.y) < 1e-6, `y drifted at ${pixel.y}`);
  }
});

test('north is above south and east is right of west', () => {
  const bounds = viewportBounds(VIEW);
  assert.ok(bounds.north > bounds.south);
  assert.ok(bounds.east > bounds.west);
  // The centre has to be inside its own viewport.
  assert.ok(VIEW.latitude > bounds.south && VIEW.latitude < bounds.north);
  assert.ok(VIEW.longitude > bounds.west && VIEW.longitude < bounds.east);
});

test('a pan of one panel width moves the view by one panel width', () => {
  const panned = panView(VIEW, -VIEW.width, 0);
  const point = projectPoint({ latitude: VIEW.latitude, longitude: VIEW.longitude }, panned);
  assert.ok(Math.abs(point.x - (VIEW.width / 2 - VIEW.width)) < 1e-6);
});

test('panning cannot push the view past the poles', () => {
  const panned = panView(VIEW, 0, -10_000_000);
  assert.ok(Number.isFinite(panned.latitude));
  assert.ok(panned.latitude <= 85.06);
});

test('zooming holds the anchored pixel still', () => {
  const anchor = { x: 40, y: 470 };
  const before = unprojectPoint(anchor, VIEW);
  const zoomed = zoomView(VIEW, VIEW.zoom + 2, anchor);
  const after = projectPoint(before, zoomed);
  assert.ok(Math.abs(after.x - anchor.x) < 1e-6);
  assert.ok(Math.abs(after.y - anchor.y) < 1e-6);
});

test('zoom stays inside the levels the tile server serves', () => {
  assert.equal(zoomView(VIEW, 99).zoom, MAX_ZOOM);
  assert.equal(zoomView(VIEW, -99).zoom, MIN_ZOOM);
  assert.equal(clampZoom(4.4), 4);
  assert.equal(clampLatitude(120), 85.05112878);
});

test('the visible tiles cover the panel and stay on the board', () => {
  const tiles = visibleTiles(VIEW);
  assert.ok(tiles.length >= Math.ceil(VIEW.width / 256) * Math.ceil(VIEW.height / 256));
  const scale = 2 ** VIEW.zoom;
  for (const tile of tiles) {
    assert.ok(tile.x >= 0 && tile.x < scale, 'tile x wrapped into range');
    assert.ok(tile.y >= 0 && tile.y < scale, 'tile y stayed on the board');
    assert.match(tileUrl(tile), /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
  }
});

test('tiles wrap around the antimeridian rather than vanishing', () => {
  const tiles = visibleTiles({ ...VIEW, longitude: 179.98, zoom: 6 });
  assert.ok(tiles.length > 0);
  assert.ok(tiles.some((tile) => tile.x === 0), 'the far side of the world is drawn');
});

test('fitting a spread of prospects shows all of them', () => {
  const points = [
    { latitude: 9.90, longitude: -84.15 },
    { latitude: 10.02, longitude: -84.00 },
    { latitude: 9.95, longitude: -84.08 },
  ];
  const fitted = fitView(points, { width: 600, height: 520 });
  const bounds = viewportBounds(fitted);
  for (const point of points) {
    assert.ok(point.latitude > bounds.south && point.latitude < bounds.north, 'latitude inside view');
    assert.ok(point.longitude > bounds.west && point.longitude < bounds.east, 'longitude inside view');
  }
});

test('a single prospect gets a readable street zoom, not maximum zoom', () => {
  const fitted = fitView([{ latitude: 9.9, longitude: -84.1 }], { width: 600, height: 520 });
  assert.equal(fitted.zoom, 14);
  // The centre is round-tripped through the Mercator projection, so it comes
  // back within a rounding error rather than bit-identical.
  assert.ok(Math.abs(fitted.latitude - 9.9) < 1e-9);
  assert.equal(fitted.longitude, -84.1);
});

test('prospects with no coordinates are not plotted', () => {
  assert.equal(hasCoordinates({ latitude: 9.9, longitude: -84 }), true);
  assert.equal(hasCoordinates({ latitude: null, longitude: -84 }), false);
  assert.equal(hasCoordinates({ latitude: '', longitude: '' }), false);
  assert.equal(hasCoordinates({ latitude: 0, longitude: 0 }), true, 'a real 0,0 is still a place');
  assert.equal(hasCoordinates({}), false);
  assert.equal(fitView([{ latitude: null, longitude: null }], { width: 600, height: 520 }), null);
  assert.equal(fitView([], { width: 600, height: 520 }), null);
});

test('the search area matches the ceiling the search route enforces', () => {
  assert.equal(searchAreaTooLarge(viewportBounds(VIEW)), false);
  assert.equal(searchAreaTooLarge({ north: 20, south: 0, east: 20, west: 0 }), true);
  const area = boundsToSearchArea(viewportBounds(VIEW));
  assert.deepEqual(Object.keys(area).sort(), ['east', 'north', 'south', 'west']);
  for (const value of Object.values(area)) assert.ok(Number.isFinite(value));
});

test('the server rejects exactly the rectangles the map refuses to offer', () => {
  const good = boundsToSearchArea(viewportBounds(VIEW));
  assert.deepEqual(normalizeSearchBbox(good), good);

  // Inverted, off the world, malformed, and simply too big.
  assert.equal(normalizeSearchBbox({ south: 10, north: 9, west: -84, east: -83 }), null);
  assert.equal(normalizeSearchBbox({ south: 9, north: 10, west: -83, east: -84 }), null);
  assert.equal(normalizeSearchBbox({ south: -95, north: 10, west: -84, east: -83 }), null);
  assert.equal(normalizeSearchBbox({ south: 9, north: 10, west: -84, east: 200 }), null);
  assert.equal(normalizeSearchBbox({ south: 'a', north: 10, west: -84, east: -83 }), null);
  assert.equal(normalizeSearchBbox(null), null);
  assert.equal(normalizeSearchBbox({ south: 0, north: 20, west: 0, east: 20 }), null);

  // The button and the route have to agree on the boundary case, or the map
  // offers a search the server will refuse.
  const wide = { south: 0, north: 3, west: 0, east: 4.0001 };
  assert.equal(searchAreaTooLarge(wide), true);
  assert.equal(normalizeSearchBbox(wide), null);
  const justFits = { south: 0, north: 3, west: 0, east: 3.9 };
  assert.equal(searchAreaTooLarge(justFits), false);
  assert.deepEqual(normalizeSearchBbox(justFits), justFits);
});
