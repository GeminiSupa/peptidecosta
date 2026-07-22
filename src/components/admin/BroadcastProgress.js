import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, CheckCircle2, XCircle, ShieldOff, Clock, ChevronDown, ChevronUp, Loader } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

const POLL_MS = 5000;

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'under a minute';
  if (mins === 1) return 'about 1 minute';
  if (mins < 60) return `about ${mins} minutes`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `about ${hours}h ${rest}m` : `about ${hours}h`;
}

const STAT_STYLE = { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: 600 };

export default function BroadcastProgress() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [stoppingId, setStoppingId] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/broadcasts/progress');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setBroadcasts(data.broadcasts || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => clearTimeout(timerRef.current);
  }, [load]);

  // Poll only while something is actually moving, so an idle panel is not
  // hitting the API every few seconds forever.
  useEffect(() => {
    const active = broadcasts.some((b) => !b.progress?.isComplete);
    clearTimeout(timerRef.current);
    if (active) timerRef.current = setTimeout(load, POLL_MS);
    return () => clearTimeout(timerRef.current);
  }, [broadcasts, load]);

  const handleStop = async (broadcast) => {
    if (!broadcast?.id || stoppingId) return;
    if (!confirm('Stop this broadcast? No more queued recipients will be sent.')) return;

    setStoppingId(broadcast.id);
    try {
      const res = await adminFetch('/api/admin/broadcasts/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: broadcast.id, action: 'cancel' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Stop failed (${res.status})`);
      await load();
    } catch (err) {
      alert(`Could not stop broadcast: ${err.message}`);
    } finally {
      setStoppingId(null);
    }
  };

  const visible = broadcasts.filter((b) => b.progress?.total > 0 || !b.progress?.isComplete);

  if (loading) {
    return (
      <div style={{ marginTop: '32px', padding: '24px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '16px', border: '1px solid rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8' }}>
        <Loader size={16} className="sync-spinner" /> Loading broadcast progress…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ marginTop: '32px', padding: '16px 20px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#fca5a5', fontSize: '0.85rem' }}>
        Couldn&apos;t load broadcast progress: {error}
      </div>
    );
  }

  if (!visible.length) return null;

  return (
    <div style={{ marginTop: '32px', padding: '24px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '16px', border: '1px solid rgba(56, 189, 248, 0.15)' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Activity size={18} color="#38bdf8" /> Broadcast Progress
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {visible.map((b) => {
          const p = b.progress || {};
          const done = p.isComplete;
          const isStopped = b.status === 'cancelled';
          const canStop = !done && ['pending', 'processing'].includes(String(b.status || '').toLowerCase());
          const barColor = isStopped ? '#f59e0b' : done ? '#10b981' : '#38bdf8';
          const isOpen = !!expanded[b.id];
          const eta = b.estimate ? formatDuration(b.estimate.remainingMs) : null;

          return (
            <div key={b.id} style={{ background: '#0f172a', padding: '16px', borderRadius: '10px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#f8fafc', fontSize: '0.9rem', fontWeight: 700, textTransform: 'capitalize' }}>
                    {String(b.audience || '').replace(/_/g, ' ')}
                    {b.channels?.whatsapp ? ' · WhatsApp' : ''}
                    {b.channels?.email ? ' · Email' : ''}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                    {b.preview || '—'}
                  </div>
                  {p.startedAt && (
                    <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '3px' }}>
                      {new Date(p.startedAt).toLocaleString()}
                      {done && p.lastActivityAt && p.lastActivityAt !== p.startedAt
                        ? ` → ${done ? 'finished ' : ''}${new Date(p.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {canStop && (
                    <button
                      type="button"
                      onClick={() => handleStop(b)}
                      disabled={stoppingId === b.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', borderRadius: '999px', padding: '4px 9px', fontSize: '0.72rem', fontWeight: 800, cursor: stoppingId === b.id ? 'wait' : 'pointer' }}
                    >
                      <XCircle size={12} /> {stoppingId === b.id ? 'Stopping' : 'Stop'}
                    </button>
                  )}
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 9px', borderRadius: '999px', whiteSpace: 'nowrap', color: isStopped ? '#fbbf24' : done ? '#10b981' : '#38bdf8', background: isStopped ? 'rgba(251,191,36,0.12)' : done ? 'rgba(16,185,129,0.12)' : 'rgba(56,189,248,0.12)', border: `1px solid ${isStopped ? 'rgba(251,191,36,0.25)' : done ? 'rgba(16,185,129,0.25)' : 'rgba(56,189,248,0.25)'}` }}>
                    {isStopped ? 'Stopped' : done ? 'Finished' : 'Sending'}
                  </span>
                </div>
              </div>

              <div style={{ height: '8px', background: '#1e293b', borderRadius: '999px', overflow: 'hidden', marginBottom: '8px' }}>
                <div style={{ width: `${Math.min(100, Math.max(0, p.percent || 0))}%`, height: '100%', background: barColor, transition: 'width 0.4s ease' }} />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', color: '#cbd5e1' }}>
                <span style={{ ...STAT_STYLE, color: '#f8fafc' }}>
                  {p.attempted} of {p.total} <span style={{ color: '#64748b', fontWeight: 500 }}>({p.percent}%)</span>
                </span>
                <span style={{ ...STAT_STYLE, color: '#10b981' }}>
                  <CheckCircle2 size={13} /> {p.reached} reached
                </span>
                {p.failed > 0 && (
                  <span style={{ ...STAT_STYLE, color: '#f87171' }}>
                    <XCircle size={13} /> {p.failed} failed
                  </span>
                )}
                {p.suppressed > 0 && (
                  <span style={{ ...STAT_STYLE, color: '#fbbf24' }}>
                    <ShieldOff size={13} /> {p.suppressed} skipped
                  </span>
                )}
                {!done && eta && (
                  <span style={{ ...STAT_STYLE, color: '#94a3b8', fontWeight: 500 }}>
                    <Clock size={13} /> {eta} left
                  </span>
                )}
              </div>

              {b.problems?.length > 0 && (
                <>
                  <button
                    onClick={() => setExpanded((prev) => ({ ...prev, [b.id]: !prev[b.id] }))}
                    style={{ marginTop: '12px', background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 0, fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {isOpen ? 'Hide' : 'Show'} {b.problems.length} that didn&apos;t go through
                  </button>

                  {isOpen && (
                    <div style={{ marginTop: '10px', maxHeight: '220px', overflowY: 'auto', border: '1px solid #1e293b', borderRadius: '8px' }}>
                      {b.problems.map((problem, idx) => (
                        <div key={`${problem.contact}-${problem.channel}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '8px 12px', borderBottom: idx < b.problems.length - 1 ? '1px solid #1e293b' : 'none', fontSize: '0.78rem' }}>
                          <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{problem.contact}</span>
                          <span style={{ color: problem.status === 'suppressed' || problem.status === 'skipped' ? '#fbbf24' : '#f87171', textAlign: 'right', minWidth: 0 }}>
                            {problem.reason || problem.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
