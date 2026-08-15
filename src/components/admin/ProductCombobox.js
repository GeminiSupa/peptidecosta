'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { sortProductsAlphabetically } from '@/lib/productOptions.mjs';

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

  useEffect(() => setQuery(value || ''), [value]);
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const sorted = useMemo(() => sortProductsAlphabetically(products), [products]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sorted.slice(0, 30);
    return sorted.filter((product) => String(product.product || '').toLowerCase().includes(needle)).slice(0, 30);
  }, [query, sorted]);

  const choose = (product) => {
    if (!product) return;
    setQuery(product.product);
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
      setQuery(value || '');
    }
  };

  return (
    <div className={`product-combobox ${className}`}>
      <Search size={14} className="product-combobox-icon" aria-hidden="true" />
      <input
        id={inputId}
        className="admin-input product-combobox-input"
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
      {open && !disabled && (
        <div id={listId} role="listbox" className="product-combobox-list">
          {filtered.length === 0 ? (
            <div className="product-combobox-empty">No matching products</div>
          ) : filtered.map((product, index) => (
            <button
              id={`${inputId}-option-${index}`}
              key={product.id || product.product}
              type="button"
              role="option"
              aria-selected={product.product === value}
              className={`product-combobox-option ${index === activeIndex ? 'active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(product)}
            >
              <span>{product.product}</span>
              <small>{product.status || 'Product'}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
