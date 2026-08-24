'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

export default function ManualCustomerCombobox({
  customers = [],
  value = '',
  onChange,
  onSelect,
}) {
  const inputId = 'manual-order-customer-search';
  const generatedId = useId();
  const listId = `${generatedId}-customer-listbox`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef(null);

  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const filtered = useMemo(() => {
    const needle = String(value || '').trim().toLowerCase();
    if (!needle) return customers.slice(0, 30);
    return customers
      .filter((customer) => String(customer.searchLabel || '').toLowerCase().includes(needle))
      .slice(0, 30);
  }, [customers, value]);

  const choose = (customer) => {
    if (!customer) return;
    onChange?.(customer.searchLabel || '');
    onSelect?.(customer);
    setOpen(false);
    setActiveIndex(0);
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
    }
  };

  return (
    <div className="product-combobox manual-customer-combobox">
      <Search size={14} className="product-combobox-icon" aria-hidden="true" />
      <input
        id={inputId}
        className="admin-input product-combobox-input"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && filtered[activeIndex] ? `${generatedId}-customer-${activeIndex}` : undefined}
        autoComplete="off"
        value={value}
        placeholder="Type a name, email, or phone…"
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120); }}
        onChange={(event) => {
          onChange?.(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <div id={listId} role="listbox" className="product-combobox-list manual-customer-combobox-list">
          {filtered.length === 0 ? (
            <div className="product-combobox-empty">No matching customers</div>
          ) : filtered.map((customer, index) => (
            <button
              id={`${generatedId}-customer-${index}`}
              key={customer.id}
              type="button"
              role="option"
              aria-selected={customer.searchLabel === value}
              className={`product-combobox-option manual-customer-combobox-option ${index === activeIndex ? 'active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(customer)}
            >
              <span>{customer.name || 'Customer'}</span>
              <small>{[customer.email, customer.phone].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
