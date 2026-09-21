'use client';

import { useCallback, useEffect, useState } from 'react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import { mapDbProduct } from '@/lib/catalogProducts';
import { catalogNameKey } from '@/lib/catalogFilters.mjs';

/**
 * The catalog's own cart, used from another page.
 *
 * The catalog keeps its cart in localStorage['cart'] as catalog product objects
 * plus a qty, and reloads it from there on every visit. Writing the same key in
 * the same shape (mapDbProduct, the mapper the catalog's server load also uses)
 * means an item added on /deal-of-the-week is simply in the cart when the
 * customer reaches checkout — no handoff step, no second cart to reconcile.
 *
 * Prices here are display only. Checkout re-prices every line on the server.
 */
export const CART_STORAGE_KEY = 'cart';
// Same-tab signal: the 'storage' event only fires in other tabs, so the site
// header's cart count listens for this too.
export const CART_CHANGED_EVENT = 'pcr-cart-changed';

function readCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.product && Number(item.qty) > 0) : [];
  } catch {
    return [];
  }
}

export function useSharedCart() {
  const [cart, setCart] = useState([]);

  useEffect(() => {
    setCart(readCart());
    // Another tab (the catalog) changed the cart.
    const onStorage = (event) => { if (event.key === CART_STORAGE_KEY) setCart(readCart()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const save = useCallback((next) => {
    setCart(next);
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    } catch {
      // Storage blocked: the page still shows the cart, checkout will not.
    }
  }, []);

  const qtyOf = useCallback(
    (name) => cart.find((item) => catalogNameKey(item.product) === catalogNameKey(name))?.qty || 0,
    [cart],
  );

  /**
   * Set a product's quantity from its database row. 0 removes it. Returns
   * false when stock does not allow that many.
   */
  const setQty = useCallback((row, qty) => {
    const wanted = Math.max(0, Math.floor(Number(qty) || 0));
    const current = readCart();
    const index = current.findIndex((item) => catalogNameKey(item.product) === catalogNameKey(row?.product));
    const stock = row?.inventory_count ?? current[index]?.inventoryCount ?? null;
    if (wanted > 0 && stock !== null && stock !== undefined && wanted > Number(stock)) return false;

    let next;
    if (wanted === 0) next = current.filter((_, i) => i !== index);
    else if (index >= 0) next = current.map((item, i) => (i === index ? { ...item, qty: wanted } : item));
    else next = [...current, { ...mapDbProduct(row), qty: wanted }];
    save(next);
    return true;
  }, [save]);

  const removeItem = useCallback((name) => {
    save(readCart().filter((item) => catalogNameKey(item.product) !== catalogNameKey(name)));
  }, [save]);

  return { cart, qtyOf, setQty, removeItem };
}
