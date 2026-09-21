'use client';

import { useEffect, useState } from 'react';
import { fitVisibleBox } from '@/lib/evenProductImage.mjs';

/**
 * A product photo drawn so the vial itself, not the photo, fills the frame.
 *
 * The product photos are transparent PNG/WebP files, but the vial fills a
 * different share of each one (90% of the height in some, 100% in others), so
 * side by side some vials looked shorter. This measures the visible (opaque)
 * part of each photo once and scales it to the same height as every other.
 *
 * Measuring needs the image server to allow it (Supabase storage sends
 * Access-Control-Allow-Origin: *). If it cannot be measured, the photo is shown
 * the ordinary way, so nothing ever disappears.
 */

const boxCache = new Map();

function measureVisibleBox(src) {
  if (boxCache.has(src)) return boxCache.get(src);
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        // A small copy is plenty to find the edges and keeps this cheap.
        const scale = Math.min(1, 160 / img.naturalHeight);
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(img, 0, 0, width, height);
        const { data } = context.getImageData(0, 0, width, height);
        let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            if (data[(y * width + x) * 4 + 3] > 24) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) { resolve(null); return; }
        resolve({
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          x: x0 / width,
          y: y0 / height,
          w: (x1 - x0 + 1) / width,
          h: (y1 - y0 + 1) / height,
        });
      } catch {
        resolve(null); // Not allowed to read the pixels: show it plainly.
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  boxCache.set(src, promise);
  return promise;
}

export default function EvenProductImage({ src, alt, className = '' }) {
  const [placement, setPlacement] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setPlacement(null);
    if (!src) return undefined;
    measureVisibleBox(src).then((box) => {
      if (!cancelled && box) setPlacement(fitVisibleBox(box));
    });
    return () => { cancelled = true; };
  }, [src]);

  return (
    <span className={className} style={{ position: 'relative', display: 'block', width: '100%', height: '100%', overflow: 'hidden' }}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        width="320"
        height="320"
        style={placement
          ? { position: 'absolute', maxWidth: 'none', ...placement }
          : { width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </span>
  );
}
