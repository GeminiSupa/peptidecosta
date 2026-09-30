// Matching an order line to the picture shown on the catalog.
//
// Orders store the product name and the quantity. They do not store the photo,
// so the account looks the name up in the catalog. A gift tag on the name is
// ignored, because the picture belongs to the product underneath it.

import { stripGiftSuffix } from './bacWater.mjs';

export function indexCatalogImages(rows = []) {
  return (rows || []).map((row) => ({
    product: String(row?.product || '').trim(),
    imageUrl: String(row?.image_url || row?.imageUrl || '').trim(),
    category: row?.category || '',
  })).filter((row) => row.product);
}

export function findCatalogProduct(name, catalog = []) {
  const key = stripGiftSuffix(name).trim().toLowerCase();
  if (!key) return null;
  return (catalog || []).find((row) => row.product.trim().toLowerCase() === key) || null;
}
