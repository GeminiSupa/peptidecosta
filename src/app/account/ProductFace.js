'use client';

import { useEffect, useState } from 'react';

import { getCustomerSupabase } from '@/lib/customerSupabase';
import { findCatalogProduct, indexCatalogImages } from '@/lib/accountProductImages.mjs';
import { getProductFallbackImage } from '@/lib/catalogProducts';

let cached = null;
let inflight = null;

function loadCatalogImages() {
  if (cached) return Promise.resolve(cached);
  const supabase = getCustomerSupabase();
  if (!supabase) return Promise.resolve([]);
  if (!inflight) {
    inflight = supabase
      .from('products')
      .select('product, image_url, category')
      .then(({ data }) => {
        cached = indexCatalogImages(data || []);
        return cached;
      })
      .catch(() => []);
  }
  return inflight;
}

/** The catalog photo for one product, or the first letter until the photo arrives. */
export default function ProductFace({ name }) {
  const [catalog, setCatalog] = useState(cached || []);

  useEffect(() => {
    let active = true;
    loadCatalogImages().then((rows) => {
      if (active) setCatalog(rows);
    });
    return () => { active = false; };
  }, []);

  const match = catalog.length ? findCatalogProduct(name, catalog) : null;
  const src = catalog.length
    ? (match?.imageUrl || getProductFallbackImage(match?.product || name, match?.category || ''))
    : '';
  if (!src) {
    const letter = String(name || '').trim().charAt(0).toUpperCase() || '•';
    return <span className="shop-thumb">{letter}</span>;
  }

  return <img className="shop-photo" src={src} alt="" />;
}
