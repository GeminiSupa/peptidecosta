/**
 * What a catalog product photo has to look like.
 *
 * The catalog draws every product into a fixed, tall picture box and shrinks
 * the whole file until it fits. So a square file, or one with blank space
 * around the vial, is scaled down until that blank space fits too, and the
 * vial itself ends up far smaller than its neighbours. Six products reached
 * the live catalog that way - GHRP-6, SNAP-8, TB-500, VIP, AA Water and HMG -
 * each a square file whose vial covered about a third of the width.
 *
 * These numbers come from measuring all 80 live product images. The 74 that
 * render correctly sit between 0.433 and 0.450 wide-over-tall, and their vial
 * fills at least 90% of the width and 87% of the height. The limits below are
 * set outside that band so no existing-style photo is refused, while the
 * square files that caused the problem are.
 *
 * Only product photos are measured. Blog covers go through the same upload
 * route and are meant to be wide, so they are left alone.
 */

export const PRODUCT_IMAGE_RULES = {
  /** Smallest acceptable pixel size. The smallest good photo today is 335x745. */
  minWidth: 330,
  minHeight: 730,
  /**
   * Width divided by height. 0.40 is 2.5x taller than wide, 0.50 is 2x taller
   * than wide. Every good photo today is 0.433-0.450; a square is 1.0.
   */
  minRatio: 0.40,
  maxRatio: 0.50,
  /**
   * How much of the frame the product itself must cover, side to side and top
   * to bottom, once blank edges are discounted. Good photos manage 0.87+.
   */
  minFill: 0.80,
  /** The size to aim for, quoted back to whoever is uploading. */
  idealWidth: 450,
  idealHeight: 1000,
};

/** The rules, shown in the admin popup. Short on purpose. */
export function productImageRequirements(rules = PRODUCT_IMAGE_RULES) {
  return [
    `Best size: ${rules.idealWidth} x ${rules.idealHeight}`,
    `Minimum: ${rules.minWidth} x ${rules.minHeight}`,
    'Shape: 2 to 2.5x taller than wide',
    `Product fills ${Math.round(rules.minFill * 100)}%+ of the frame`,
  ];
}

/**
 * Reads the real pixels: the size of the file, and the size of the part that
 * is not blank edge. `trim` finds the blank border the same way a person would
 * crop it - by matching the colour of the corner, transparent or white alike.
 *
 * Throws if the file cannot be read as an image at all.
 */
export async function measureProductImage(buffer) {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buffer).metadata();
  const width = Number(meta.width) || 0;
  const height = Number(meta.height) || 0;
  if (!width || !height) throw new Error('The image size could not be read.');

  // A picture with no blank border to remove, or one that is a single flat
  // colour, makes trim throw. Neither is a reason to reject: fall back to
  // treating it as full, and let the shape and size rules speak.
  let fillWidth = 1;
  let fillHeight = 1;
  try {
    const trimmed = await sharp(buffer).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
    if (trimmed.info.width > 0 && trimmed.info.height > 0) {
      fillWidth = Math.min(1, trimmed.info.width / width);
      fillHeight = Math.min(1, trimmed.info.height / height);
    }
  } catch {
    /* nothing to trim */
  }

  return { width, height, ratio: width / height, fillWidth, fillHeight };
}

/**
 * What is wrong with the picture, one short line each. Empty list means it
 * passes. Every line names the number measured and the number required, so
 * nobody has to come back and ask what to change it to.
 */
export function checkProductImage(measured, rules = PRODUCT_IMAGE_RULES) {
  const { width, height, ratio, fillWidth, fillHeight } = measured;
  const problems = [];

  if (width < rules.minWidth || height < rules.minHeight) {
    problems.push(`Too small: ${width} x ${height}. Minimum is ${rules.minWidth} x ${rules.minHeight}.`);
  }

  if (ratio > rules.maxRatio || ratio < rules.minRatio) {
    const shape = ratio >= 0.95 && ratio <= 1.05 ? 'square' : ratio > rules.maxRatio ? 'too wide' : 'too thin';
    problems.push(`Wrong shape: ${width} x ${height} is ${shape}. Must be 2 to 2.5x taller than wide.`);
  }

  if (fillWidth < rules.minFill || fillHeight < rules.minFill) {
    problems.push(
      `Too much empty space: product fills only ${Math.round(fillWidth * 100)}% x ${Math.round(fillHeight * 100)}% `
      + `of the frame. Must be ${Math.round(rules.minFill * 100)}%+. Crop the blank edges off.`,
    );
  }

  return { ok: problems.length === 0, problems };
}
