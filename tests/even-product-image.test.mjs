import test from 'node:test';
import assert from 'node:assert/strict';

import { fitVisibleBox } from '../src/lib/evenProductImage.mjs';

const num = (value) => Number.parseFloat(value);

test('a vial that fills its photo is drawn full height, centred', () => {
  const placed = fitVisibleBox({ naturalWidth: 450, naturalHeight: 1000, x: 0, y: 0, w: 1, h: 1 });
  assert.equal(placed.height, '100%');
  assert.equal(placed.top, '0%');
  assert.equal(num(placed.width), 45);
  assert.equal(num(placed.left), 27.5);
});

test('a vial with empty space around it is enlarged to the same height', () => {
  // Vial fills 90% of the photo height, starting 5% down.
  const placed = fitVisibleBox({ naturalWidth: 660, naturalHeight: 1467, x: 0.035, y: 0.05, w: 0.93, h: 0.9 });
  // The photo is drawn taller than the frame so the vial itself is 100%.
  assert.ok(Math.abs(num(placed.height) * 0.9 - 100) < 0.1);
  // ...and the vial's top edge lands on the frame's top edge.
  assert.ok(Math.abs(num(placed.top) + num(placed.height) * 0.05) < 0.1);
});

test('two differently framed photos give vials of equal drawn height', () => {
  const tight = fitVisibleBox({ naturalWidth: 449, naturalHeight: 1000, x: 0, y: 0, w: 1, h: 1 });
  const loose = fitVisibleBox({ naturalWidth: 660, naturalHeight: 1467, x: 0.01, y: 0.035, w: 0.98, h: 0.93 });
  assert.ok(Math.abs(num(tight.height) * 1 - num(loose.height) * 0.93) < 0.1);
});

test('nothing visible gives no placement, so the photo is shown plainly', () => {
  assert.equal(fitVisibleBox({ naturalWidth: 100, naturalHeight: 100, x: 0, y: 0, w: 0, h: 0 }), null);
});
