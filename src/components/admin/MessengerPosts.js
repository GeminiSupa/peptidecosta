'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, CheckCircle2, Copy, ExternalLink, Flame, Image as ImageIcon,
  Link as LinkIcon, Mail, Megaphone, MessageSquare, Phone, RefreshCw, Send,
  Share2, Target, ThumbsUp, UserPlus,
} from 'lucide-react';
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

const POST_TEMPLATES = [
  {
    id: 'inventory',
    label: 'Inventory Push',
    icon: Megaphone,
    message: 'Inventario local disponible en Costa Rica. Consulta el catálogo actualizado, precios CRC en vivo y documentación por lote.',
    link: 'https://peptidescostarica.net/catalog?lang=es',
  },
  {
    id: 'coa',
    label: 'COA Trust',
    icon: CheckCircle2,
    message: 'Antes de ordenar, revisa la documentación disponible por lote. Transparencia, stock local y coordinación directa en Costa Rica.',
    link: 'https://peptidescostarica.net/coa-database?lang=es',
  },
  {
    id: 'whatsapp',
    label: 'Ask Expert',
    icon: MessageSquare,
    message: '¿Tienes preguntas sobre disponibilidad, documentación o entrega local? Escríbenos y te ayudamos en español o inglés.',
    link: 'https://peptidescostarica.net/contact?lang=es',
  },
];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'facebook-post';
}

function defaultCampaign() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `fb-${yyyy}${mm}${dd}`;
}

function addUtm(link, campaign) {
  const clean = String(link || '').trim();
  if (!clean) return '';
  try {
    const url = new URL(clean, 'https://peptidescostarica.net');
    url.searchParams.set('utm_source', 'facebook');
    url.searchParams.set('utm_medium', 'social');
    url.searchParams.set('utm_campaign', slugify(campaign || defaultCampaign()));
    return url.toString();
  } catch {
    return clean;
  }
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
  const [publicFor, setPublicFor] = useState(null); // comment id being publicly replied to
  const [publicText, setPublicText] = useState('');
  const [publicSending, setPublicSending] = useState(false);
  const [publicDone, setPublicDone] = useState({});
  const [draftMessage, setDraftMessage] = useState('');
  const [draftLink, setDraftLink] = useState('');
  const [draftImageUrl, setDraftImageUrl] = useState('');
  const [draftScheduledAt, setDraftScheduledAt] = useState('');
  const [draftCampaign, setDraftCampaign] = useState(defaultCampaign);
  const [posting, setPosting] = useState(false);
  const [postStatus, setPostStatus] = useState('');
  const [hotLeadDone, setHotLeadDone] = useState({});
  const [hotLeadSaving, setHotLeadSaving] = useState('');
  const [copiedTrackedLink, setCopiedTrackedLink] = useState(false);

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
  const scheduledPosts = useMemo(() => data?.scheduledPosts || [], [data]);
  const leadAds = useMemo(() => data?.leadAds || [], [data]);
  const topPosts = useMemo(() => data?.topPosts || [], [data]);
  const trackedLink = useMemo(() => addUtm(draftLink, draftCampaign), [draftLink, draftCampaign]);

  const applyTemplate = (template) => {
    setDraftMessage(template.message);
    setDraftLink(template.link);
    setDraftCampaign(`${defaultCampaign()}-${template.id}`);
    setPostStatus('');
  };

  const sendDm = async (comment) => {
    const text = dmText.trim();
    if (!text || dmSending) return;
    if (!confirm(`Send this private DM to ${comment.from || 'this commenter'}?\n\n${text}`)) return;
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

  const sendPublicReply = async (comment) => {
    const text = publicText.trim();
    if (!text || publicSending) return;
    if (!confirm(`Post this public reply to ${comment.from || 'this commenter'}?\n\n${text}`)) return;
    setPublicSending(true);
    try {
      const res = await adminFetch('/api/facebook/comment-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: comment.id, message: text }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setPublicDone((p) => ({ ...p, [comment.id]: true }));
        setPublicFor(null);
        setPublicText('');
        fetchPosts(true);
      } else {
        alert('Public reply failed: ' + (json.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Public reply error: ' + e.message);
    } finally {
      setPublicSending(false);
    }
  };

  const publishPost = async () => {
    if (posting) return;
    const payload = {
      message: draftMessage.trim(),
      link: trackedLink || draftLink.trim(),
      imageUrl: draftImageUrl.trim(),
      scheduledAt: draftScheduledAt,
    };
    if (!payload.message && !payload.link && !payload.imageUrl) {
      setPostStatus('Add a caption, catalog link, or image URL first.');
      return;
    }
    const publishLabel = payload.scheduledAt ? 'schedule this Facebook post' : 'publish this Facebook post now';
    const postPreview = [payload.message, payload.link, payload.imageUrl].filter(Boolean).join('\n\n');
    if (!confirm(`Confirm you want to ${publishLabel}:\n\n${postPreview}`)) return;

    setPosting(true);
    setPostStatus('');
    try {
      const res = await adminFetch('/api/messenger/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setPostStatus(json.error || 'Post failed.');
        return;
      }
      setPostStatus(json.scheduled ? 'Post scheduled on Facebook.' : 'Post published on Facebook.');
      setDraftMessage('');
      setDraftLink('');
      setDraftImageUrl('');
      setDraftScheduledAt('');
      setDraftCampaign(defaultCampaign());
      fetchPosts(true);
    } catch (e) {
      setPostStatus(e.message || 'Post failed.');
    } finally {
      setPosting(false);
    }
  };

  const copyTrackedLink = async () => {
    if (!trackedLink) return;
    try {
      await navigator.clipboard.writeText(trackedLink);
      setCopiedTrackedLink(true);
      setTimeout(() => setCopiedTrackedLink(false), 1400);
    } catch {
      setPostStatus('Could not copy tracked link.');
    }
  };

  const markHotLead = async (comment, post) => {
    if (!comment?.id || hotLeadSaving) return;
    setHotLeadSaving(comment.id);
    try {
      const res = await adminFetch('/api/facebook/comment-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: comment.id,
          postId: post.id,
          commenterName: comment.from,
          commentText: comment.message,
          postPermalink: post.permalink,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert('Lead save failed: ' + (json.error || 'Unknown error'));
        return;
      }
      setHotLeadDone((p) => ({ ...p, [comment.id]: true }));
    } catch (e) {
      alert('Lead save error: ' + e.message);
    } finally {
      setHotLeadSaving('');
    }
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem', fontWeight: 700 }}>Content & Engagement</h3>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>Publish posts, watch comments, and reply from the Page.</p>
        </div>
        <button
          type="button"
          onClick={() => fetchPosts(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#e2e8f0', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
        >
          <RefreshCw size={14} className={refreshing ? 'spinner' : ''} /> Refresh
        </button>
      </div>

      <div style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Send size={16} style={{ color: '#38bdf8' }} />
          <div>
            <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: '0.95rem' }}>Create Facebook Post</div>
            <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Use a catalog link with UTM tracking when you want to measure sales impact.</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {POST_TEMPLATES.map((template) => {
            const Icon = template.icon;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 999, border: '1px solid rgba(56,189,248,0.24)', background: 'rgba(56,189,248,0.08)', color: '#7dd3fc', fontSize: '0.76rem', fontWeight: 800, cursor: 'pointer' }}
              >
                <Icon size={13} /> {template.label}
              </button>
            );
          })}
        </div>

        <textarea
          value={draftMessage}
          onChange={(e) => setDraftMessage(e.target.value)}
          placeholder="Write a caption for the Page..."
          rows={4}
          style={{ width: '100%', resize: 'vertical', minHeight: 92, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: '#111c31', color: '#f8fafc', fontSize: '0.9rem', lineHeight: 1.5, outline: 'none' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111c31', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0 10px', minHeight: 40 }}>
            <LinkIcon size={14} style={{ color: '#94a3b8', flex: 'none' }} />
            <input
              value={draftLink}
              onChange={(e) => setDraftLink(e.target.value)}
              placeholder="Catalog or blog link"
              style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: '#e2e8f0', fontSize: '0.82rem' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111c31', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0 10px', minHeight: 40 }}>
            <ImageIcon size={14} style={{ color: '#94a3b8', flex: 'none' }} />
            <input
              value={draftImageUrl}
              onChange={(e) => setDraftImageUrl(e.target.value)}
              placeholder="Image URL"
              style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: '#e2e8f0', fontSize: '0.82rem' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111c31', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0 10px', minHeight: 40 }}>
            <Target size={14} style={{ color: '#94a3b8', flex: 'none' }} />
            <input
              value={draftCampaign}
              onChange={(e) => setDraftCampaign(e.target.value)}
              placeholder="UTM campaign"
              style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: '#e2e8f0', fontSize: '0.82rem' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111c31', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0 10px', minHeight: 40 }}>
            <CalendarClock size={14} style={{ color: '#94a3b8', flex: 'none' }} />
            <input
              type="datetime-local"
              value={draftScheduledAt}
              onChange={(e) => setDraftScheduledAt(e.target.value)}
              title="Optional schedule time"
              style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: '#e2e8f0', fontSize: '0.78rem' }}
            />
          </label>
        </div>

        {trackedLink && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(34,197,94,0.16)', background: 'rgba(34,197,94,0.08)', color: '#bbf7d0', fontSize: '0.74rem', minWidth: 0 }}>
            <Target size={13} style={{ flex: 'none', color: '#4ade80' }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trackedLink}</span>
            <button
              type="button"
              onClick={copyTrackedLink}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flex: 'none', border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.12)', color: '#86efac', borderRadius: 8, padding: '5px 8px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer' }}
            >
              <Copy size={12} /> {copiedTrackedLink ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ color: postStatus.includes('failed') || postStatus.includes('Add ') ? '#fca5a5' : '#94a3b8', fontSize: '0.78rem' }}>
            {postStatus || 'Emails are only available from Lead Ads or forms where the person submits one.'}
          </div>
          <button
            type="button"
            onClick={publishPost}
            disabled={posting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: 0, background: posting ? '#475569' : '#1877f2', color: '#fff', fontSize: '0.83rem', fontWeight: 800, cursor: posting ? 'not-allowed' : 'pointer' }}
          >
            <Send size={14} /> {posting ? 'Sending...' : draftScheduledAt ? 'Schedule Post' : 'Publish Post'}
          </button>
        </div>
      </div>

      {/* Analytics */}
      {summary && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <Stat label="Posts" value={summary.posts} />
          <Stat label="Scheduled" value={summary.scheduled || 0} tint="#fbbf24" />
          <Stat label="Lead Ads" value={summary.leadAds || 0} tint="#a78bfa" />
          <Stat label="Comments received" value={summary.totalComments} tint="#38bdf8" />
          <Stat label="Publicly replied" value={summary.totalReplied} tint="#4ade80" />
          <Stat label="Need reply" value={Math.max((summary.totalComments || 0) - (summary.totalReplied || 0), 0)} tint="#f97316" />
          <Stat label="Reply rate" value={`${summary.replyRate}%`} tint={summary.replyRate >= 60 ? '#4ade80' : summary.replyRate >= 30 ? '#fbbf24' : '#f87171'} />
        </div>
      )}

      {(topPosts.length > 0 || leadAds.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 18 }}>
          {topPosts.length > 0 && (
            <div style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc', fontWeight: 800, marginBottom: 10 }}>
                <Flame size={16} style={{ color: '#f97316' }} /> Best Performing Posts
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {topPosts.map((post) => (
                  <a
                    key={post.id}
                    href={post.permalink || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'grid', gap: 5, padding: '10px', borderRadius: 10, background: '#111c31', border: '1px solid rgba(255,255,255,0.05)', color: 'inherit', textDecoration: 'none' }}
                  >
                    <span style={{ color: '#e2e8f0', fontSize: '0.82rem', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.message}</span>
                    <span style={{ display: 'flex', gap: 12, color: '#94a3b8', fontSize: '0.72rem', flexWrap: 'wrap' }}>
                      <span><ThumbsUp size={11} /> {post.reactions}</span>
                      <span><MessageSquare size={11} /> {post.comments}</span>
                      <span><Share2 size={11} /> {post.shares}</span>
                      <strong style={{ color: '#f97316' }}>Score {post.score}</strong>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {leadAds.length > 0 && (
            <div style={{ background: '#0e1626', border: '1px solid rgba(167,139,250,0.16)', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc', fontWeight: 800, marginBottom: 10 }}>
                <UserPlus size={16} style={{ color: '#a78bfa' }} /> Lead Ads Inbox
              </div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 330, overflow: 'auto' }}>
                {leadAds.map((lead) => (
                  <div key={lead.id} style={{ display: 'grid', gap: 5, padding: '10px', borderRadius: 10, background: '#111c31', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <strong style={{ color: '#f8fafc', fontSize: '0.84rem' }}>{lead.name}</strong>
                      <span style={{ color: lead.status === 'unread' ? '#fbbf24' : '#64748b', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase' }}>{lead.status}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: '#94a3b8', fontSize: '0.74rem' }}>
                      {lead.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={11} /> {lead.email}</span>}
                      {lead.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {lead.phone}</span>}
                      {!lead.email && !lead.phone && <span>No email/phone returned by Meta</span>}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
                      {[lead.source, lead.campaign, fmtDate(lead.createdAt)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {scheduledPosts.length > 0 && (
        <div style={{ background: '#0e1626', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 14, padding: 14, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc', fontWeight: 800, marginBottom: 10 }}>
            <CalendarClock size={16} style={{ color: '#fbbf24' }} /> Scheduled Posts
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {scheduledPosts.map((post) => (
              <div key={post.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 10px', borderRadius: 10, background: '#111c31', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: '#cbd5e1', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.message}</span>
                <span style={{ color: '#fbbf24', fontSize: '0.76rem', fontWeight: 800, flex: 'none' }}>{fmtDate(post.scheduledTime || post.createdTime)}</span>
              </div>
            ))}
          </div>
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

                            {hotLeadDone[c.id] ? (
                              <span style={{ color: '#fbbf24', fontSize: '0.76rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 8 }}><Flame size={13} /> Hot lead saved</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => markHotLead(c, post)}
                                disabled={hotLeadSaving === c.id}
                                style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(251,146,60,0.35)', background: 'rgba(251,146,60,0.12)', color: '#fb923c', fontSize: '0.76rem', fontWeight: 800, cursor: hotLeadSaving === c.id ? 'wait' : 'pointer', marginRight: 8 }}
                              >
                                {hotLeadSaving === c.id ? 'Saving...' : 'Mark hot lead'}
                              </button>
                            )}

                            {publicDone[c.id] ? (
                              <span style={{ color: '#4ade80', fontSize: '0.76rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 8 }}><CheckCircle2 size={13} /> Public reply sent</span>
                            ) : publicFor === c.id ? (
                              <div style={{ display: 'flex', gap: 8, margin: '6px 0 8px' }}>
                                <input
                                  type="text"
                                  value={publicText}
                                  onChange={(e) => setPublicText(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') sendPublicReply(c); }}
                                  placeholder="Public reply on this comment..."
                                  autoFocus
                                  style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#1e293b', color: '#f8fafc', fontSize: '0.84rem' }}
                                />
                                <button type="button" onClick={() => sendPublicReply(c)} disabled={publicSending || !publicText.trim()} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: publicSending || !publicText.trim() ? '#475569' : '#16a34a', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: publicSending || !publicText.trim() ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                  <Send size={14} /> {publicSending ? '...' : 'Reply'}
                                </button>
                                <button type="button" onClick={() => { setPublicFor(null); setPublicText(''); }} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => { setPublicFor(c.id); setPublicText(''); setDmFor(null); }} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.12)', color: '#4ade80', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', marginRight: 8 }}>
                                Public reply
                              </button>
                            )}

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
                              <button type="button" onClick={() => { setDmFor(c.id); setDmText(''); setPublicFor(null); }} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.12)', color: '#60a5fa', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
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
