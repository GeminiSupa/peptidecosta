"use client";
/* eslint-disable @next/next/no-img-element -- map tiles are third-party raster
   images fetched by z/x/y; next/image cannot optimize them and would only add
   a proxy hop in front of every one of the dozen tiles a pan repaints. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Loader2, MapPin, Maximize2, Minus, Plus, Search } from 'lucide-react';
import {
  boundsToSearchArea,
  fitView,
  hasCoordinates,
  MAX_ZOOM,
  MIN_ZOOM,
  panView,
  projectPoint,
  searchAreaTooLarge,
  tileUrl,
  viewportBounds,
  visibleTiles,
  zoomView,
} from '@/lib/prospectMap.mjs';

/** Below this a pointer gesture was a click on a pin, above it a pan. */
const DRAG_SLOP_PX = 4;

const DEFAULT_VIEW = { latitude: 9.9281, longitude: -84.0907, zoom: 12, width: 640, height: 520 };

/**
 * The prospect map.
 *
 * Draws OpenStreetMap raster tiles and one pin per result. The embed iframe it
 * replaces could only ever show the single selected business, which made the
 * largest panel on the screen the least informative one — the geography of a
 * result set (three gyms on one street, the rest an hour away) is a
 * qualification signal that was simply not being shown.
 */
export default function ProspectMap({
  prospects = [],
  selectedKey = null,
  keyOf,
  onSelect,
  onSearchArea = null,
  searching = false,
  toneOf = () => 'low',
}) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const lastDragRef = useRef(null);
  const fittedRef = useRef({ signature: '', size: '' });
  const [view, setView] = useState(DEFAULT_VIEW);
  const [dragging, setDragging] = useState(false);
  const [userMoved, setUserMoved] = useState(false);

  const plotted = useMemo(() => prospects.filter(hasCoordinates), [prospects]);

  // Identity of the *set of places*, not of the array. Re-fitting on every
  // parent render would fight the operator for control of the map; re-fitting
  // when a different set of businesses arrives is exactly what they want.
  const plotSignature = useMemo(
    () => plotted.map((item) => `${Number(item.latitude).toFixed(5)},${Number(item.longitude).toFixed(5)}`).sort().join('|'),
    [plotted],
  );

  const measure = useCallback(() => {
    const element = containerRef.current;
    if (!element) return null;
    const { width, height } = element.getBoundingClientRect();
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const size = measure();
      if (size) setView((current) => (current.width === size.width && current.height === size.height ? current : { ...current, ...size }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  /**
   * Fits the view to the results, and re-fits when the panel is finally
   * measured.
   *
   * The first render happens before layout, so the panel is zero pixels tall
   * and a fit computed against it collapses to the minimum zoom — the whole of
   * Central America for four gyms in one city. Recording the size each fit was
   * computed at means the fit is redone once the real size arrives, and only
   * then.
   */
  useEffect(() => {
    if (!plotSignature || view.width < 80 || view.height < 80) return;
    const sizeKey = `${view.width}x${view.height}`;
    const newResults = fittedRef.current.signature !== plotSignature;
    // A new result set is a new map. A resize only re-fits if the operator has
    // not taken control of the view themselves.
    if (!newResults && (userMoved || fittedRef.current.size === sizeKey)) return;

    const fitted = fitView(plotted, { width: view.width, height: view.height });
    if (!fitted) return;
    fittedRef.current = { signature: plotSignature, size: sizeKey };
    setView(fitted);
    setUserMoved(false);
  }, [plotSignature, plotted, view.width, view.height, userMoved]);

  // Selecting a business from the list should bring it into view without
  // throwing away the zoom the operator chose.
  useEffect(() => {
    if (!selectedKey) return;
    const target = plotted.find((item) => keyOf(item) === selectedKey);
    if (!target) return;
    setView((current) => {
      const point = projectPoint({ latitude: Number(target.latitude), longitude: Number(target.longitude) }, current);
      const margin = 56;
      const inside = point.x >= margin && point.x <= current.width - margin
        && point.y >= margin && point.y <= current.height - margin;
      if (inside) return current;
      return { ...current, latitude: Number(target.latitude), longitude: Number(target.longitude) };
    });
  }, [selectedKey, plotted, keyOf]);

  // Attached natively because a passive React wheel listener cannot call
  // preventDefault, and without that the whole admin page scrolls instead.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const onWheel = (event) => {
      // A plain wheel gesture belongs to the page. Requiring a modifier keeps
      // the map from trapping someone halfway down a long admin screen.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setView((current) => zoomView(current, current.zoom + (event.deltaY > 0 ? -1 : 1), anchor));
      setUserMoved(true);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  // Dragging is tracked on the window rather than with pointer capture: a drag
  // often starts on a pin, and capturing the pointer to the container is what
  // stops that pin's click from ever arriving.
  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      drag.moved += Math.abs(deltaX) + Math.abs(deltaY);
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (drag.moved > DRAG_SLOP_PX) setUserMoved(true);
      setView((current) => panView(current, deltaX, deltaY));
    };
    const onUp = () => {
      lastDragRef.current = dragRef.current;
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging]);

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.pmap-controls, .pmap-area, .pmap-attribution')) return;
    dragRef.current = { x: event.clientX, y: event.clientY, moved: 0 };
    setDragging(true);
  };

  /** A pointer gesture that moved is a pan, and must not also select a pin. */
  const wasDrag = () => (lastDragRef.current?.moved || 0) > DRAG_SLOP_PX;

  const tiles = useMemo(() => visibleTiles(view), [view]);
  const bounds = useMemo(() => viewportBounds(view), [view]);
  const areaTooLarge = searchAreaTooLarge(bounds);

  const pins = useMemo(() => plotted.map((item) => {
    const key = keyOf(item);
    const point = projectPoint({ latitude: Number(item.latitude), longitude: Number(item.longitude) }, view);
    return { key, item, point, selected: key === selectedKey };
  // Off-screen pins are dropped rather than rendered and clipped, so a
  // country-wide result set does not put eighty invisible buttons in the DOM.
  }).filter(({ point }) => point.x > -40 && point.y > -40 && point.x < view.width + 40 && point.y < view.height + 40),
  [plotted, view, selectedKey, keyOf]);

  const recenter = () => {
    const fitted = fitView(plotted, measure() || { width: view.width, height: view.height });
    if (fitted) {
      setView(fitted);
      setUserMoved(false);
    }
  };

  return (
    <div
      className={`pmap${dragging ? ' dragging' : ''}`}
      ref={containerRef}
      onPointerDown={handlePointerDown}
      role="region"
      aria-label={`Prospect map with ${plotted.length} mapped businesses`}
    >
      <div className="pmap-tiles" aria-hidden="true">
        {tiles.map((tile) => (
          <img
            key={tile.key}
            className="pmap-tile"
            src={tileUrl(tile)}
            alt=""
            draggable={false}
            style={{ transform: `translate3d(${tile.left}px, ${tile.top}px, 0)` }}
          />
        ))}
      </div>

      {pins.map(({ key, item, point, selected }) => (
        <button
          key={key}
          type="button"
          className={`pmap-pin ${toneOf(item.fit_score || 0)}${selected ? ' selected' : ''}`}
          style={{ transform: `translate3d(${point.x}px, ${point.y}px, 0)` }}
          onClick={() => { if (!wasDrag()) onSelect?.(item); }}
          title={`${item.organization_name} · fit ${item.fit_score || 0}`}
          aria-label={`${item.organization_name}, fit score ${item.fit_score || 0}`}
          aria-pressed={selected}
        >
          <span className="pmap-pin-dot" />
          {selected && <span className="pmap-pin-label">{item.organization_name}</span>}
        </button>
      ))}

      {!plotted.length && (
        <div className="pmap-empty">
          <div>
            <MapPin size={40} />
            <strong>No mapped businesses yet</strong>
            <p>Results with coordinates appear here as pins you can click.</p>
          </div>
        </div>
      )}

      <div className="pmap-controls">
        <button type="button" className="pmap-btn" onClick={() => { setView((c) => zoomView(c, c.zoom + 1)); setUserMoved(true); }} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in"><Plus size={15} /></button>
        <button type="button" className="pmap-btn" onClick={() => { setView((c) => zoomView(c, c.zoom - 1)); setUserMoved(true); }} disabled={view.zoom <= MIN_ZOOM} aria-label="Zoom out"><Minus size={15} /></button>
        <button type="button" className="pmap-btn" onClick={recenter} disabled={!plotted.length} aria-label="Fit all results"><Maximize2 size={14} /></button>
      </div>

      {plotted.length > 0 && (
        <div className="pmap-count"><Crosshair size={12} /> {plotted.length} mapped</div>
      )}

      <div className="pmap-wheel-hint">Ctrl/⌘ + scroll to zoom</div>

      {onSearchArea && (
        <div className="pmap-area">
          <button
            type="button"
            className="pmap-area-btn"
            onClick={() => onSearchArea(boundsToSearchArea(bounds))}
            disabled={searching || areaTooLarge}
            title={areaTooLarge ? 'Zoom in to search this area' : 'Search the businesses inside the visible rectangle'}
          >
            {searching ? <Loader2 size={13} className="mkt-spin" /> : <Search size={13} />}
            {areaTooLarge ? 'Zoom in to search here' : 'Search this area'}
          </button>
          {userMoved && !areaTooLarge && <span className="pmap-area-hint">Map moved — results are from the previous area</span>}
        </div>
      )}

      <a className="pmap-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
    </div>
  );
}
