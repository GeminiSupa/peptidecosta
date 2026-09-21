'use client';

import React from 'react';
import { Target } from 'lucide-react';
import { formatPrice } from '@/lib/money.mjs';

const percent = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;
const usd = (value) => formatPrice(value, 'USD');

const ROWS = [
  { key: 'visitors', label: 'Unique visitors', format: (v) => v.visitors.toLocaleString('en-US') },
  { key: 'views', label: 'Page views', format: (v) => v.views.toLocaleString('en-US') },
  { key: 'clickRate', label: 'Clicked a shop button', format: (v) => `${v.clickVisitors.toLocaleString('en-US')} (${percent(v.clickRate)})` },
  { key: 'orders', label: 'Orders placed', format: (v) => v.orders.toLocaleString('en-US') },
  { key: 'paidOrders', label: 'Paid orders', format: (v) => v.paidOrders.toLocaleString('en-US') },
  { key: 'conversionRate', label: 'Conversion (paid orders ÷ visitors)', format: (v) => percent(v.conversionRate) },
  { key: 'revenueUsd', label: 'Revenue (paid)', format: (v) => usd(v.revenueUsd) },
  { key: 'revenuePerVisitor', label: 'Revenue per visitor', format: (v) => usd(v.revenuePerVisitor) },
];

function verdictText(summary) {
  const verdict = summary?.verdict;
  const [a, b] = summary?.variants || [];
  if (!verdict || !a || !b) return '';
  if (verdict.status === 'too_early') {
    return `Too early to call. Each version needs at least ${verdict.minVisitors} visitors (A has ${a.visitors}, B has ${b.visitors}). Keep the test running.`;
  }
  if (verdict.status === 'winner') {
    return `Version ${verdict.winner.toUpperCase()} is converting better, with ${Math.round(verdict.confidence * 100)}% confidence.`;
  }
  return `No clear winner yet (${Math.round((verdict.confidence || 0) * 100)}% confidence, 95% needed). Keep the test running.`;
}

/** A vs B scorecard for the Deal of the Week page. */
export default function DealPageExperimentCard({ experiment }) {
  const summary = experiment?.summary;
  const winner = summary?.verdict?.status === 'winner' ? summary.verdict.winner : null;

  return (
    <div className="dashboard-section-card" style={{ marginBottom: '16px', overflowX: 'auto' }}>
      <div className="section-card-title">
        <Target size={16} style={{ color: 'var(--an-warning)' }} />
        <span>A/B test — Deal of the Week page</span>
      </div>

      {experiment?.migrationMissing ? (
        <p style={{ margin: 0, color: 'var(--an-warning)', fontSize: '0.85rem' }}>
          Not recording yet. Run add-deal-page-ab-test.sql in Supabase to start the test.
        </p>
      ) : experiment?.error ? (
        <p role="alert" style={{ margin: 0, color: '#f87171', fontSize: '0.85rem' }}>Could not load the test: {experiment.error}</p>
      ) : !summary ? (
        <p style={{ margin: 0, color: 'var(--an-ink-muted)', fontSize: '0.85rem' }}>Loading…</p>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', color: 'var(--an-ink-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>
            Visitors to /deal-of-the-week are split 50/50. An order counts for a version when the shopper saw that version within 14 days.
            Only paid orders decide the winner. Numbers follow the date range picked above.
          </p>
          <p style={{ margin: '0 0 14px', fontWeight: 700, color: winner ? '#34d399' : 'var(--an-ink)', fontSize: '0.9rem' }}>
            {verdictText(summary)}
          </p>
          <table style={{ width: '100%', minWidth: '420px', borderCollapse: 'collapse', fontSize: '0.84rem', color: 'var(--an-ink)' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--an-ink-muted)', fontSize: '0.76rem' }}>
                <th scope="col" style={{ padding: '6px 8px 6px 0' }}>Metric</th>
                {summary.variants.map((variant) => (
                  <th key={variant.variant} scope="col" style={{ padding: '6px 8px', textAlign: 'right' }}>
                    {variant.label}{winner === variant.variant ? ' ★' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <th scope="row" style={{ padding: '8px 8px 8px 0', textAlign: 'left', fontWeight: 500, color: 'var(--an-ink-muted)' }}>{row.label}</th>
                  {summary.variants.map((variant) => (
                    <td key={variant.variant} style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {row.format(variant)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {experiment.sampled && (
            <p style={{ margin: '10px 0 0', color: 'var(--an-ink-muted)', fontSize: '0.76rem' }}>
              Showing the most recent 10,000 events. Pick a shorter date range for exact figures.
            </p>
          )}
        </>
      )}
    </div>
  );
}
