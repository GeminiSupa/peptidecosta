'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { Star } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { ANALYTICS_COLORS } from '@/lib/analyticsTheme.mjs';

/**
 * Review requests per day, by site.
 *
 * Self-contained — it fetches its own data — so it can sit on the Social
 * Reviews tab and on Analytics without either screen having to carry the other's
 * plumbing.
 *
 * A daily view rather than a total because the totals hid the thing that
 * mattered. Trustpilot ran at fifteen to twenty invitations a day until 5 Sep
 * 2026 and then stopped dead for twenty-two days; every summary on the screen
 * still read "718 requests sent" and looked perfectly healthy. A gap is only
 * visible against a calendar.
 */

const SERIES = [
  { key: 'trustpilot', label: 'Trustpilot', color: '#2dd4bf' },
  { key: 'google', label: 'Google', color: ANALYTICS_COLORS.positive },
  { key: 'facebook', label: 'Facebook', color: ANALYTICS_COLORS.accent },
];

const WINDOWS = [
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export default function ReviewRequestsChart({ defaultDays = 30, compact = false }) {
  const [days, setDays] = useState(defaultDays);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (windowDays) => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch(`/api/admin/reviews/stats?days=${windowDays}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Could not load the review chart');
      setData(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  const rows = data?.daily || [];
  const totals = SERIES.reduce((acc, s) => {
    acc[s.key] = rows.reduce((n, r) => n + (r[s.key] || 0), 0);
    return acc;
  }, {});
  const clickTotal = rows.reduce((n, r) => n + (r.clicks || 0), 0);
  const quietDays = rows.filter((r) => (r.asks || 0) === 0).length;

  // The longest run of days with nothing sent at all. This is the number that
  // would have caught the September outage on the day it started, and it is
  // stated in words rather than left for someone to spot in the bars.
  let longestGap = 0;
  let run = 0;
  for (const r of rows) {
    run = (r.asks || 0) === 0 ? run + 1 : 0;
    if (run > longestGap) longestGap = run;
  }

  const body = () => {
    if (loading) return <div style={{ color: 'var(--an-ink-muted, #94a3b8)', padding: '24px 0', fontSize: '0.88rem' }}>Loading…</div>;
    if (error) {
      return (
        <div style={{ color: '#fca5a5', padding: '16px 0', fontSize: '0.88rem' }}>
          {error}
          <button
            type="button" onClick={() => load(days)}
            style={{ marginLeft: 10, background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      );
    }
    if (!data?.available) {
      return <div style={{ color: '#fde68a', padding: '16px 0', fontSize: '0.88rem' }}>{data?.reason || 'The review history is not available yet.'}</div>;
    }

    return (
      <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '14px' }}>
          {SERIES.map((s) => (
            <div key={s.key} style={{ minWidth: '92px' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: s.color, lineHeight: 1.2 }}>{totals[s.key]}</div>
              <div style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 600 }}>{s.label} requests</div>
            </div>
          ))}
          <div style={{ minWidth: '92px' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: clickTotal ? ANALYTICS_COLORS.warning : '#64748b', lineHeight: 1.2 }}>{clickTotal}</div>
            <div style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 600 }}>Clicked through</div>
          </div>
        </div>

        <div style={{ width: '100%', height: compact ? '200px' : '260px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="label"
                tick={{ fill: ANALYTICS_COLORS.inkMuted, fontSize: 11 }}
                axisLine={false} tickLine={false} dy={6} minTickGap={22}
              />
              <YAxis tick={{ fill: ANALYTICS_COLORS.inkMuted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <RechartsTooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                contentStyle={{ borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#fff', fontSize: '12px' }}
              />
              <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: '11px' }} />
              {/* Stacked: the question is "how many requests went out that day",
                  and the split between sites is the second question, not the first. */}
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} stackId="asks" name={s.label} fill={s.color} radius={[2, 2, 0, 0]} />
              ))}
              <Line type="monotone" dataKey="clicks" name="Clicks" stroke={ANALYTICS_COLORS.warning} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.55, margin: '10px 0 0' }}>
          Costa Rica days. {quietDays === 0
            ? 'Something went out every day in this window.'
            : `${quietDays} day${quietDays === 1 ? '' : 's'} sent nothing at all${longestGap > 1 ? `, the longest run being ${longestGap} in a row` : ''}.`}
          {' '}A Trustpilot bar means the invitation was handed to Trustpilot — whether Trustpilot
          then sent it is only visible on Trustpilot&apos;s own Invitations screen.
        </p>
      </>
    );
  };

  return (
    <div className="dashboard-section-card" style={{ marginBottom: '16px' }}>
      <div className="section-card-title" style={{ marginBottom: '12px' }}>
        <Star size={16} style={{ color: '#2dd4bf' }} />
        <span>Review requests per day</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {WINDOWS.map((w) => {
            const on = w.days === days;
            return (
              <button
                key={w.days}
                type="button"
                onClick={(e) => { e.stopPropagation(); setDays(w.days); }}
                style={{
                  padding: '3px 10px', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                  background: on ? 'rgba(45,212,191,0.14)' : 'rgba(148,163,184,0.08)',
                  border: `1px solid ${on ? 'rgba(45,212,191,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: on ? '#2dd4bf' : '#94a3b8',
                }}
              >
                {w.label}
              </button>
            );
          })}
        </span>
      </div>
      {body()}
    </div>
  );
}
