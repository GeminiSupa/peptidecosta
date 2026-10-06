import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  PRODUCT_IMAGE_RULES,
  checkProductImage,
  measureProductImage,
  productImageRequirements,
} from '../src/lib/productImageRules.mjs';

/**
 * Builds a PNG of `width` x `height` with a solid block in the middle covering
 * `fill` of each side, and transparent everywhere else - the same shape as a
 * vial photo with blank space around it.
 */
async function makeImage(width, height, fill = 1) {
  const blockW = Math.max(1, Math.round(width * fill));
  const blockH = Math.max(1, Math.round(height * fill));
  const block = await sharp({
    create: { width: blockW, height: blockH, channels: 4, background: { r: 180, g: 60, b: 60, alpha: 1 } },
  }).png().toBuffer();

  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: block, left: Math.round((width - blockW) / 2), top: Math.round((height - blockH) / 2) }])
    .png()
    .toBuffer();
}

async function verdictFor(width, height, fill = 1) {
  return checkProductImage(await measureProductImage(await makeImage(width, height, fill)));
}

test('a normal catalog photo is accepted', async () => {
  const v = await verdictFor(450, 1000, 0.98);
  assert.equal(v.ok, true, v.problems.join(' | '));
});

test('the real shapes already in the catalog are all accepted', async () => {
  // 449x1000, 660x1467, 335x745, 654x1512 and 651x1502 are the sizes the 74
  // good product photos actually use. None of them may start being refused.
  for (const [w, h] of [[449, 1000], [660, 1467], [335, 745], [654, 1512], [651, 1502]]) {
    const v = await verdictFor(w, h, 0.9);
    assert.equal(v.ok, true, `${w}x${h} was refused: ${v.problems.join(' | ')}`);
  }
});

test('a square photo is refused, and the message says so', async () => {
  const v = await verdictFor(1254, 1254, 0.72);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /is square/);
});

test('blank space around the product is refused on its own', async () => {
  // Right shape, right size - only the blank space is wrong, which is the
  // case a width-and-height check alone would wave through.
  const v = await verdictFor(450, 1000, 0.5);
  assert.equal(v.ok, false);
  assert.equal(v.problems.length, 1);
  assert.match(v.problems[0], /empty space/);
});

test('a photo too small to be sharp is refused', async () => {
  const v = await verdictFor(200, 445, 0.98);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /Too small/);
});

test('a wide photo is refused', async () => {
  const v = await verdictFor(1000, 450, 0.98);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /too wide/);
});

test('an over-tall sliver is refused', async () => {
  const v = await verdictFor(400, 1400, 0.98);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /too thin/);
});

test('every refusal is short, numeric and free of jargon', async () => {
  const v = await verdictFor(1254, 1254, 0.72);
  for (const problem of v.problems) {
    // Short on purpose, but it must still name the measurement and the target.
    assert.ok(problem.length < 140, 'a refusal has to stay short');
    assert.match(problem, /\d/, 'a refusal has to quote real numbers');
    assert.doesNotMatch(problem, /aspect ratio|ratio of/i);
  }
});

test('the requirements list is populated and quotes the ideal size', () => {
  const reqs = productImageRequirements();
  assert.ok(reqs.length >= 3);
  assert.match(reqs.join(' '), new RegExp(`${PRODUCT_IMAGE_RULES.idealWidth} x ${PRODUCT_IMAGE_RULES.idealHeight}`));
  assert.match(reqs.join(' '), new RegExp(`${PRODUCT_IMAGE_RULES.minWidth} x ${PRODUCT_IMAGE_RULES.minHeight}`));
});

test('the limits still sit outside the band the good photos occupy', () => {
  // Measured across all 80 live product images: the 74 that render correctly
  // span 0.433-0.450 wide-over-tall and fill at least 0.866 of the frame.
  assert.ok(PRODUCT_IMAGE_RULES.minRatio < 0.433, 'would refuse an existing photo');
  assert.ok(PRODUCT_IMAGE_RULES.maxRatio > 0.450, 'would refuse an existing photo');
  assert.ok(PRODUCT_IMAGE_RULES.minFill < 0.866, 'would refuse an existing photo');
  assert.ok(PRODUCT_IMAGE_RULES.minWidth <= 335 && PRODUCT_IMAGE_RULES.minHeight <= 745);
});
