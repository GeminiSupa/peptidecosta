'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { productPickerName, sortProductsAlphabetically, storedOrderProductName, vialSizeOf } from '@/lib/productOptions.mjs';

export default function ProductCombobox({
  products = [],
  value = '',
  onSelect,
  onClear,
  placeholder = 'Search products…',
  disabled = false,
  className = '',
}) {
  const inputId = useId();
  const listId = `${inputId}-listbox`;
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef(null);

  useEffect(() => {
    if (!value) return;
    const match = products.find((product) => storedOrderProductName(product) === value);
    setQuery(match ? productPickerName(match) : value);
  }, [value, products]);
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const sorted = useMemo(() => sortProductsAlphabetically(products), [products]);
  const selected = useMemo(
    () => (value ? products.find((product) => storedOrderProductName(product) === value) || null : null),
    [products, value],
  );
  const selectedSize = selected ? vialSizeOf(selected) : '';
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sorted.slice(0, 30);
    return sorted.filter((product) => {
      const haystack = `${storedOrderProductName(product)} ${productPickerName(product)} ${vialSizeOf(product)}`.toLowerCase();
      return haystack.includes(needle);
    }).slice(0, 30);
  }, [query, sorted]);

  const choose = (product) => {
    if (!product) return;
    setQuery(productPickerName(product));
    setOpen(false);
    setActiveIndex(0);
    onSelect?.(product);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && open && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      const match = products.find((product) => storedOrderProductName(product) === value);
      setQuery(match ? productPickerName(match) : (value || ''));
    }
  };

  return (
    <div className={`product-combobox ${selectedSize && !open ? 'has-size' : ''} ${className}`}>
      <Search size={14} className="product-combobox-icon" aria-hidden="true" />
      <input
        id={inputId}
        className="admin-input product-combobox-input"
        aria-label={selectedSize ? `${query}, ${selectedSize}` : undefined}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && filtered[activeIndex] ? `${inputId}-option-${activeIndex}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120); }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
          if (value) onClear?.();
        }}
        onKeyDown={handleKeyDown}
      />
      {selectedSize && !open && (
        <span className="product-combobox-size product-combobox-selected-size">{selectedSize}</span>
      )}
      {open && !disabled && (
        <div id={listId} role="listbox" className="product-combobox-list">
          {filtered.length === 0 ? (
            <div className="product-combobox-empty">No matching products</div>
          ) : filtered.map((product, index) => (
            <button
              id={`${inputId}-option-${index}`}
              key={product.id || storedOrderProductName(product)}
              type="button"
              role="option"
              aria-selected={storedOrderProductName(product) === value}
              className={`product-combobox-option ${index === activeIndex ? 'active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(product)}
            >
              <span className="product-combobox-option-name">{productPickerName(product)}</span>
              {vialSizeOf(product) ? <span className="product-combobox-size">{vialSizeOf(product)}</span> : null}
              <small>{product.status || 'Product'}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
