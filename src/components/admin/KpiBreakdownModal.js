'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, Ban, RotateCcw, AlertTriangle } from 'lucide-react';

/**
 * What actually made a Today tile, and the ability to correct it.
 *
 * A test order flipped to Paid lands in Revenue Today and cannot be taken back
 * out without deleting the row. This lists every order inside the tile's window
 * — the ones counting and the ones not — so one can be held out or forced in.
 *
 * The change is not local: it writes orders.stats_override, which every screen
 * reporting money reads through src/lib/orderRevenue.mjs, agent commission
 * included. That is why applying costs a typed confirmation.
 */

const CONFIRM_WORD = 'confirm';

const money = (value) => `$${Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const shortDate = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
};

/** What this row should become, given its current state and a requested action. */
function nextOverrideFor(row, action) {
  if (action === 'reset') return null;
  return action;
}

export default function KpiBreakdownModal({
  open,
  title,
  subtitle,
  rows = [],
  canEdit = false,
  onClose,
  onApply,
}) {
  // orderId -> 'include' | 'exclude' | null, only for rows actually changed.
  const [pending, setPending] = useState({});
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef(null);

  // A fresh tile starts with a clean slate, so a change staged against one
  // tile can never be applied while looking at another.
  useEffect(() => {
    if (!open) return;
    setPending({});
    setConfirmText('');
    setReason('');
    setError('');
    setSaving(false);
    closeRef.current?.focus();
  }, [open, title]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape' && !saving) onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  const changes = useMemo(
    () => Object.entries(pending).map(([orderId, override]) => ({ orderId, override })),
    [pending],
  );

  // The tile as it would read once these changes are applied.
  const projected = useMemo(() => rows.reduce((sum, row) => {
    const override = Object.prototype.hasOwnProperty.call(pending, row.id)
      ? pending[row.id]
      : row.basis?.override ?? null;
    const counts = override === 'exclude' ? false
      : override === 'include' ? true
        : Boolean(row.basis?.counts);
    return counts ? sum + Number(row.amountUsd || 0) : sum;
  }, 0), [rows, pending]);

  const current = useMemo(
    () => rows.reduce((sum, row) => (row.basis?.counts ? sum + Number(row.amountUsd || 0) : sum), 0),
    [rows],
  );

  if (!open) return null;

  const confirmed = confirmText.trim().toLowerCase() === CONFIRM_WORD;
  const canSubmit = canEdit && changes.length > 0 && confirmed && !saving;

  const stage = (row, action) => {
    const target = nextOverrideFor(row, action);
    setPending((prev) => {
      const next = { ...prev };
      const original = row.basis?.override ?? null;
      // Staging a row back to how it already is is not a change.
      if (target === original) delete next[row.id];
      else next[row.id] = target;
      return next;
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      await onApply?.(changes, reason.trim());
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not save those changes.');
      setSaving(false);
    }
  };

  const stagedFor = (row) => (Object.prototype.hasOwnProperty.call(pending, row.id)
    ? pending[row.id]
    : row.basis?.override ?? null);

  return (
    <div
      className="kpi-breakdown-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} breakdown`}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose?.(); }}
    >
      <div className="kpi-breakdown-panel">
        <div className="kpi-breakdown-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button
            type="button"
            ref={closeRef}
            className="kpi-breakdown-close"
            onClick={() => !saving && onClose?.()}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="kpi-breakdown-totals">
          <div>
            <span>Counting now</span>
            <strong>{money(current)}</strong>
          </div>
          {changes.length > 0 ? (
            <div className="kpi-breakdown-projected">
              <span>After these changes</span>
              <strong>{money(projected)}</strong>
            </div>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <p className="kpi-breakdown-empty">Nothing made this number.</p>
        ) : (
          <div className="kpi-breakdown-list">
            {rows.map((row) => {
              const staged = stagedFor(row);
              const changed = Object.prototype.hasOwnProperty.call(pending, row.id);
              const counts = staged === 'exclude' ? false : staged === 'include' ? true : Boolean(row.basis?.counts);
              return (
                <div
                  key={row.id}
                  className={`kpi-breakdown-row${counts ? '' : ' is-muted'}${changed ? ' is-changed' : ''}`}
                >
                  <div className="kpi-breakdown-row-main">
                    <strong>{row.orderNumber || 'No number'}</strong>
                    <span>{row.customer || 'Unknown customer'}</span>
                  </div>
                  <div className="kpi-breakdown-row-meta">
                    <span>{shortDate(row.date)}</span>
                    <span className="kpi-breakdown-reason">{row.basis?.reason}</span>
                  </div>
                  <div className={`kpi-breakdown-amount${counts ? '' : ' is-muted'}`}>
                    {counts ? money(row.amountUsd) : `(${money(row.amountUsd)})`}
                  </div>
                  {canEdit ? (
                    <div className="kpi-breakdown-actions">
                      <button
                        type="button"
                        className={staged === 'exclude' ? 'is-active' : ''}
                        title="Never count this order"
                        onClick={() => stage(row, 'exclude')}
                      >
                        <Ban size={14} /> Exclude
                      </button>
                      <button
                        type="button"
                        className={staged === 'include' ? 'is-active' : ''}
                        title="Always count this order"
                        onClick={() => stage(row, 'include')}
                      >
                        <Check size={14} /> Include
                      </button>
                      <button
                        type="button"
                        className={staged === null ? 'is-active' : ''}
                        title="Follow the normal status rules"
                        onClick={() => stage(row, 'reset')}
                      >
                        <RotateCcw size={14} /> Auto
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {canEdit && changes.length > 0 ? (
          <div className="kpi-breakdown-confirm">
            <div className="kpi-breakdown-warning">
              <AlertTriangle size={15} />
              <span>
                {changes.length} order{changes.length === 1 ? '' : 's'} will change everywhere —
                the Today tiles, analytics, customer totals and agent commission.
              </span>
            </div>
            <label>
              <span>Why (optional, saved on the order)</span>
              <input
                type="text"
                value={reason}
                maxLength={200}
                placeholder="e.g. test order for the refund flow"
                onChange={(event) => setReason(event.target.value)}
                disabled={saving}
              />
            </label>
            <label>
              <span>Type <b>confirm</b> to apply</span>
              <input
                type="text"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder="confirm"
                autoComplete="off"
                disabled={saving}
              />
            </label>
            {error ? <p className="kpi-breakdown-error">{error}</p> : null}
            <div className="kpi-breakdown-buttons">
              <button type="button" onClick={() => !saving && onClose?.()} disabled={saving}>
                Cancel
              </button>
              <button
                type="button"
                className="kpi-breakdown-apply"
                onClick={submit}
                disabled={!canSubmit}
              >
                {saving ? 'Saving…' : `Apply ${changes.length} change${changes.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
