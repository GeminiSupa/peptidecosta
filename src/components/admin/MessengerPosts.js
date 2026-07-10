'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, MessageSquare, ThumbsUp, Share2, Send, ExternalLink, CheckCircle2 } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

function initials(name) {
  const w = String(name || 'FB').trim().split(/\s+/).filter(Boolean);
  return (w.slice(0, 2).map((x) => x[0]).join('') || 'FB').toUpperCase();
}
function fmtDate(v) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Stat({ label, value, tint }) {
  return (
    <div style={{ flex: '1 1 130px', background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: tint || '#f8fafc', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}

export default function MessengerPosts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [openPost, setOpenPost] = useState(null);
  const [dmFor, setDmFor] = useState(null); // comment id being DM'd
  const [dmText, setDmText] = useState('');
  const [dmSending, setDmSending] = useState(false);
  const [dmDone, setDmDone] = useState({}); // comment id -> true after DM sent

  const fetchPosts = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await adminFetch('/api/messenger/posts', { cache: 'no-store' });
      const json = await res.json();
      if (json.error) setError(json.error);
      else { setError(''); setData(json); }
    } catch (e) {
      setError(e.message || 'Failed to load posts');
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const summary = data?.summary;
  const posts = useMemo(() => data?.posts || [], [data]);

  const sendDm = async (comment) => {
    const text = dmText.trim();
    if (!text || dmSending) return;
    setDmSending(true);
    try {
      const res = await adminFetch('/api/facebook/private-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // created_time lets the server enforce Meta's 7-day private-reply limit cleanly.
        body: JSON.stringify({ commentId: comment.id, message: text, commentCreatedAt: comment.createdTime || comment.created_time }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setDmDone((p) => ({ ...p, [comment.id]: true }));
        setDmFor(null);
        setDmText('');
      } else {
        alert('DM failed: ' + (json.error || 'Unknown error') + '\n\n(Note: Facebook allows one private reply per comment, and the commenter must allow messages.)');
      }
    } catch (e) {
      alert('DM error: ' + e.message);
    } finally {
      setDmSending(false);
    }
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem', fontWeight: 700 }}>Post Comments</h3>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>Comments on your Facebook posts. DM any commenter directly.</p>
        </div>
        <button
          type="button"
          onClick={() => fetchPosts(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#e2e8f0', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
        >
          <RefreshCw size={14} className={refreshing ? 'spinner' : ''} /> Refresh
        </button>
      </div>

      {/* Analytics */}
      {summary && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <Stat label="Posts" value={summary.posts} />
          <Stat label="Comments received" value={summary.totalComments} tint="#38bdf8" />
          <Stat label="Publicly replied" value={summary.totalReplied} tint="#4ade80" />
          <Stat label="Reply rate" value={`${summary.replyRate}%`} tint={summary.replyRate >= 60 ? '#4ade80' : summary.replyRate >= 30 ? '#fbbf24' : '#f87171'} />
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading posts…</div>
      ) : error ? (
        <div style={{ padding: 20, borderRadius: 12, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#fca5a5' }}>
          {error}
        </div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', background: '#0e1626', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
          No posts found on your Page yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {posts.map((post) => {
            const isOpen = openPost === post.id;
            return (
              <div key={post.id} style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => { setOpenPost(isOpen ? null : post.id); setDmFor(null); }}
                  style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '16px 18px', color: 'inherit' }}
                >
                  <div style={{ color: '#e2e8f0', fontSize: '0.92rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {post.message}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10, fontSize: '0.78rem', color: '#94a3b8', alignItems: 'center' }}>
                    <span>{fmtDate(post.createdTime)}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><ThumbsUp size={13} /> {post.reactions}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MessageSquare size={13} /> {post.commentCount}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Share2 size={13} /> {post.shares}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#4ade80' }}><CheckCircle2 size={13} /> {post.repliedCount} replied</span>
                    <span style={{ marginLeft: 'auto', color: '#38bdf8', fontWeight: 600 }}>{isOpen ? 'Hide comments ▲' : 'View comments ▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 14px 14px' }}>
                    {post.permalink && (
                      <a href={post.permalink} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', color: '#38bdf8', margin: '8px 4px', textDecoration: 'none' }}>
                        <ExternalLink size={12} /> Open post on Facebook
                      </a>
                    )}
                    {post.comments.length === 0 ? (
                      <div style={{ color: '#64748b', fontSize: '0.82rem', padding: '10px 4px' }}>No comments on this post.</div>
                    ) : (
                      post.comments.map((c) => (
                        <div key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 4px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <span style={{ flex: 'none', width: 34, height: 34, borderRadius: '50%', background: '#1e293b', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700 }}>{initials(c.from)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.85rem' }}>{c.from}</span>
                              <span style={{ color: '#64748b', fontSize: '0.72rem' }}>{fmtDate(c.createdTime)}</span>
                              {c.pageReplied && (
                                <span style={{ color: '#4ade80', background: 'rgba(74,222,128,0.12)', borderRadius: 10, padding: '1px 8px', fontSize: '0.68rem', fontWeight: 700 }}>Replied</span>
                              )}
                            </div>
                            <div style={{ color: '#cbd5e1', fontSize: '0.86rem', margin: '3px 0 6px', whiteSpace: 'pre-wrap' }}>{c.message || '(no text)'}</div>

                            {dmDone[c.id] ? (
                              <span style={{ color: '#4ade80', fontSize: '0.76rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={13} /> DM sent</span>
                            ) : dmFor === c.id ? (
                              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                <input
                                  type="text"
                                  value={dmText}
                                  onChange={(e) => setDmText(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') sendDm(c); }}
                                  placeholder="Type a private message…"
                                  autoFocus
                                  style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#1e293b', color: '#f8fafc', fontSize: '0.84rem' }}
                                />
                                <button type="button" onClick={() => sendDm(c)} disabled={dmSending || !dmText.trim()} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: dmSending || !dmText.trim() ? '#475569' : '#2563eb', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: dmSending || !dmText.trim() ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                  <Send size={14} /> {dmSending ? '…' : 'Send'}
                                </button>
                                <button type="button" onClick={() => { setDmFor(null); setDmText(''); }} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => { setDmFor(c.id); setDmText(''); }} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.12)', color: '#60a5fa', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
                                Send DM
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
