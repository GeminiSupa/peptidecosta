/**
 * Where to draw a photo so its visible part fills a frame, centred.
 *
 * `box` is the visible (opaque) area of the photo as fractions of its size:
 * { naturalWidth, naturalHeight, x, y, w, h }. `frameAspect` is the frame's
 * width / height (the product cards use a square, 1).
 *
 * Returns CSS for an absolutely positioned <img>: width, height, left, top as
 * percentages of the frame. The visible part is scaled until it touches the
 * frame on its longer side, so two vials of different framing come out the
 * same height. Pure, so tests/ can check it.
 */
export function fitVisibleBox(box, frameAspect = 1) {
  const visibleWidth = box.w * box.naturalWidth;
  const visibleHeight = box.h * box.naturalHeight;
  if (!(visibleWidth > 0) || !(visibleHeight > 0) || !(frameAspect > 0)) return null;

  // Frame measured as width = frameAspect, height = 1.
  const scale = Math.min(frameAspect / visibleWidth, 1 / visibleHeight);
  const imageWidth = box.naturalWidth * scale; // in frame-height units
  const imageHeight = box.naturalHeight * scale;
  const centreX = (box.x + box.w / 2) * imageWidth;
  const centreY = (box.y + box.h / 2) * imageHeight;
  const left = frameAspect / 2 - centreX;
  const top = 0.5 - centreY;

  const pct = (value) => `${Math.round(value * 10000) / 100}%`;
  return {
    width: pct(imageWidth / frameAspect),
    height: pct(imageHeight),
    left: pct(left / frameAspect),
    top: pct(top),
  };
}
