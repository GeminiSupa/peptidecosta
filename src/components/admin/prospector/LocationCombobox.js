import React, { useId, useMemo, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { suggestCostaRicaLocations } from '@/lib/costaRicaLocations.mjs';

export default function LocationCombobox({ value, onChange }) {
  const listId = useId();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = useMemo(() => suggestCostaRicaLocations(value), [value]);
  const activeSuggestion = open ? suggestions[activeIndex] : null;

  const choose = (suggestion) => {
    onChange(suggestion.value);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const onInputChange = (event) => {
    onChange(event.target.value);
    setActiveIndex(-1);
    setOpen(true);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => suggestions.length ? (current + 1) % suggestions.length : -1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => suggestions.length ? (current - 1 + suggestions.length) % suggestions.length : -1);
    } else if (event.key === 'Enter' && open && activeSuggestion) {
      event.preventDefault();
      choose(activeSuggestion);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      className="prospector-location-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <input
        ref={inputRef}
        className="prospector-input"
        role="combobox"
        aria-label="City, canton, province, or country"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={activeSuggestion ? `${listId}-${activeSuggestion.id}` : undefined}
        autoComplete="off"
        value={value}
        onChange={onInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="City, canton, province, or country (optional)"
      />
      {open && suggestions.length > 0 && (
        <div id={listId} className="prospector-location-menu" role="listbox" aria-label="Costa Rica location suggestions">
          {suggestions.map((suggestion, index) => (
            <button
              id={`${listId}-${suggestion.id}`}
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`prospector-location-option${index === activeIndex ? ' active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(suggestion)}
            >
              <MapPin size={14} />
              <span><strong>{suggestion.label}</strong><small>{suggestion.detail}</small></span>
            </button>
          ))}
          <div className="prospector-location-freeform">Keep typing to use any location.</div>
        </div>
      )}
    </div>
  );
}
