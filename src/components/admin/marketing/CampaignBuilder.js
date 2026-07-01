"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EmailEditor from 'react-email-editor';
import {
  AlertTriangle, CheckCircle2, Copy, Eye, Loader2, Save, Send,
  Users, ChevronDown, ChevronUp, Smartphone, LayoutTemplate,
  Tag, Layers, Monitor, X, Clock, Trash2, Mail, AtSign, SendHorizonal,
  CalendarClock, TestTube2, CopyPlus
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

// ── Template Library ─────────────────────────────────────────────────
const brandButton = {
  href: { name: 'web', values: { href: 'https://www.costapeptides.com/catalog', target: '_blank' } },
  buttonColors: { color: '#ffffff', backgroundColor: '#10b981', hoverColor: '#ffffff', hoverBackgroundColor: '#059669' },
  border: {},
  borderRadius: '6px',
  padding: '14px 28px',
  textAlign: 'center',
  lineHeight: '120%',
  fontSize: '15px',
  fontWeight: 700,
};

const textBlock = (text, overrides = {}) => ({
  type: 'text',
  values: {
    containerPadding: '10px 20px',
    fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
    lineHeight: '150%',
    color: '#1f2937',
    fontSize: '16px',
    text,
    ...overrides,
  },
});

const buttonBlock = (text, href = 'https://www.costapeptides.com/catalog') => ({
  type: 'button',
  values: {
    ...brandButton,
    href: { name: 'web', values: { href, target: '_blank' } },
    text,
    containerPadding: '16px 20px 24px',
  },
});

const dividerBlock = () => ({
  type: 'divider',
  values: {
    containerPadding: '10px 20px',
    border: { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: '#d1fae5' },
  },
});

const createTemplateDesign = ({ headline, eyebrow, body, cta, footerNote, accent = '#10b981' }) => ({
  counters: { u_row: 5, u_column: 5, u_content_text: 8, u_content_button: 1, u_content_divider: 1 },
  body: {
    rows: [
      {
        cells: [1],
        columns: [
          {
            contents: [
              textBlock('Costa Peptides', {
                containerPadding: '26px 20px 6px',
                textAlign: 'center',
                color: accent,
                fontSize: '15px',
                fontWeight: 700,
              }),
              textBlock(headline, {
                containerPadding: '4px 28px 10px',
                textAlign: 'center',
                color: '#111827',
                fontSize: '30px',
                lineHeight: '120%',
                fontWeight: 700,
              }),
              textBlock(eyebrow, {
                containerPadding: '0 34px 18px',
                textAlign: 'center',
                color: '#4b5563',
                fontSize: '15px',
              }),
            ],
            values: { backgroundColor: '#ecfdf5', padding: '0px' },
          },
        ],
        values: { backgroundColor: '#ecfdf5', padding: '0px' },
      },
      {
        cells: [1],
        columns: [
          {
            contents: [
              textBlock(body),
              buttonBlock(cta),
              dividerBlock(),
              textBlock(footerNote, {
                color: '#6b7280',
                fontSize: '13px',
                lineHeight: '145%',
              }),
            ],
            values: { backgroundColor: '#ffffff', padding: '0px' },
          },
        ],
        values: { backgroundColor: '#ffffff', padding: '0px' },
      },
    ],
    values: {
      backgroundColor: '#f3f4f6',
      contentWidth: '600px',
      fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
      preheaderText: eyebrow,
    },
  },
  schemaVersion: 21,
});

const TEMPLATES = [
  {
    id: 'newsletter',
    icon: '📰',
    name: 'Newsletter',
    desc: 'Regular content digest',
    subject: 'Costa Peptides update for [FIRST_NAME]',
    design: createTemplateDesign({
      headline: 'This week from Costa Peptides',
      eyebrow: 'A quick digest of product updates, education, and customer support notes.',
      body: '<p>Hi [FIRST_NAME],</p><p>Here is your latest Costa Peptides digest. Add your featured article, product note, or customer story here, then keep the message focused on one clear next step.</p><ul><li>New educational resource or protocol reminder</li><li>Featured peptide category or restock note</li><li>Customer service update or ordering tip</li></ul>',
      cta: 'Browse the catalog',
      footerNote: '<p>Have a question before ordering? Reply to this email and our team will help.</p>',
    }),
  },
  {
    id: 'promo',
    icon: '🏷️',
    name: 'Promotion',
    desc: 'Sale or discount offer',
    subject: 'A Costa Peptides offer for [FIRST_NAME]',
    design: createTemplateDesign({
      headline: 'Limited-time peptide offer',
      eyebrow: 'Highlight your promotion, discount code, or bundle here.',
      body: '<p>Hi [FIRST_NAME],</p><p>Your promotion details go here. Keep the discount, deadline, and qualifying products easy to scan.</p><p><strong>Offer:</strong> Add discount or bundle details<br><strong>Ends:</strong> Add deadline<br><strong>Code:</strong> Add promo code</p>',
      cta: 'Shop the offer',
      footerNote: '<p>Promo availability may vary by inventory. Replace this line with the terms that apply to the campaign.</p>',
      accent: '#f59e0b',
    }),
  },
  {
    id: 'welcome',
    icon: '👋',
    name: 'Welcome',
    desc: 'Greet new subscribers',
    subject: 'Welcome to Costa Peptides, [FIRST_NAME]',
    design: createTemplateDesign({
      headline: 'Welcome to Costa Peptides',
      eyebrow: 'A warm first email for new subscribers and leads.',
      body: '<p>Hi [FIRST_NAME],</p><p>Thanks for joining Costa Peptides. We are glad you are here.</p><p>Use this email to introduce your standards, ordering process, support channels, and the easiest first action for a new subscriber.</p>',
      cta: 'Explore products',
      footerNote: '<p>Need help finding the right product information? Reply to this email and our team will point you in the right direction.</p>',
    }),
  },
  {
    id: 'product',
    icon: '🧪',
    name: 'Product Spotlight',
    desc: 'Feature a peptide',
    subject: 'Product spotlight: featured peptide update',
    design: createTemplateDesign({
      headline: 'Product spotlight',
      eyebrow: 'Feature one peptide with benefits, specs, and a single call to action.',
      body: '<p>Hi [FIRST_NAME],</p><p>This week we are spotlighting <strong>[PRODUCT_NAME]</strong>. Replace this section with product-specific details, storage notes, availability, and what makes it worth attention.</p><p><strong>Key details:</strong></p><ul><li>Purity or testing note</li><li>Format and size</li><li>Inventory or shipping note</li></ul>',
      cta: 'View product details',
      footerNote: '<p>Swap [PRODUCT_NAME] for the peptide you want to promote before saving.</p>',
      accent: '#3b82f6',
    }),
  },
  {
    id: 'winback',
    icon: '🔄',
    name: 'Win-Back',
    desc: 'Re-engage inactive leads',
    subject: 'Still interested, [FIRST_NAME]?',
    design: createTemplateDesign({
      headline: 'Still thinking it over?',
      eyebrow: 'A re-engagement email for inactive leads or older subscribers.',
      body: '<p>Hi [FIRST_NAME],</p><p>It has been a little while, so we wanted to check in. If you are still comparing options or waiting on a restock, our team can help you find current availability.</p><p>You can update this section with a reason to return, such as a new product, improved shipping, or a personal support offer.</p>',
      cta: 'Return to Costa Peptides',
      footerNote: '<p>If now is not the right time, no worries. You can keep receiving useful updates or unsubscribe below.</p>',
      accent: '#8b5cf6',
    }),
  },
  {
    id: 'launch',
    icon: '🚀',
    name: 'New Products',
    desc: 'Announce new arrivals',
    subject: '🚀 New Products Just Landed — Check What\'s In Stock, [FIRST_NAME]!',
    design: createTemplateDesign({
      headline: '🚀 New Products Just Landed!',
      eyebrow: 'We have been expanding our catalog — here is what just arrived.',
      body: `<p>Hi [FIRST_NAME],</p>
<p>Exciting news! We just stocked up on <strong>brand new products</strong> that our community has been asking for. These are now available and ready to ship:</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0;">
  <tr><td style="padding: 10px 16px; background: #ecfdf5; border-radius: 8px 8px 0 0; border-bottom: 1px solid #d1fae5;"><strong style="color: #059669;">✅ Glutathione 1500mg</strong></td></tr>
  <tr><td style="padding: 10px 16px; background: #ffffff; border-bottom: 1px solid #f0fdf4;"><strong style="color: #059669;">✅ Cartalax 20mg</strong></td></tr>
  <tr><td style="padding: 10px 16px; background: #ecfdf5; border-bottom: 1px solid #d1fae5;"><strong style="color: #059669;">✅ Fat Blaster Aminos 10ml</strong></td></tr>
  <tr><td style="padding: 10px 16px; background: #ffffff; border-bottom: 1px solid #f0fdf4;"><strong style="color: #059669;">✅ CJC-1295 with DAC</strong></td></tr>
  <tr><td style="padding: 10px 16px; background: #ecfdf5; border-bottom: 1px solid #d1fae5;"><strong style="color: #059669;">✅ Epithalon 50mg</strong></td></tr>
  <tr><td style="padding: 10px 16px; background: #ffffff; border-bottom: 1px solid #f0fdf4;"><strong style="color: #059669;">✅ DSIP 10mg</strong></td></tr>
  <tr><td style="padding: 10px 16px; background: #ecfdf5; border-bottom: 1px solid #d1fae5;"><strong style="color: #059669;">✅ Tesamorelin 10mg</strong></td></tr>
  <tr><td style="padding: 10px 16px; background: #ffffff; border-bottom: 1px solid #f0fdf4;"><strong style="color: #059669;">✅ Thymalin 10mg</strong></td></tr>
  <tr><td style="padding: 10px 16px; background: #ecfdf5; border-bottom: 1px solid #d1fae5;"><strong style="color: #059669;">✅ Mots-C 40mg</strong></td></tr>
  <tr><td style="padding: 10px 16px; background: #ffffff; border-radius: 0 0 8px 8px;"><strong style="color: #059669;">✅ NAD+ 1000mg</strong></td></tr>
</table>

<p>All products are <strong>third-party tested</strong> and ship directly from Costa Rica. Stock is limited on first batches — grab yours before they run out!</p>

<p>You can view all our products and place your order directly on our <a href="https://www.costapeptides.com/catalog" style="color: #059669; font-weight: bold; text-decoration: underline;">online catalog here</a>.</p>`,
      cta: 'Shop New Arrivals →',
      footerNote: '<p>Want more info on any of these products? Just reply to this email and our team will send you everything you need.</p>',
      accent: '#059669',
    }),
  },
  {
    id: 'blank',
    icon: '✏️',
    name: 'Blank Canvas',
    desc: 'Start from scratch',
    design: null,
  },
];

// Collapsible section component
function Section({ title, icon: Icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', gap: '10px' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.7)' }}>
          {Icon && <Icon size={14} style={{ color: '#34d399' }} />}
          {title}
        </span>
        {open ? <ChevronUp size={15} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} /> : <ChevronDown size={15} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />}
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  );
}

export default function CampaignBuilder() {
  const emailEditorRef      = useRef(null);
  const [isReady,           setIsReady]           = useState(false);
  const [isSaving,          setIsSaving]          = useState(false);
  const [isSending,         setIsSending]         = useState(false);
  const [campaigns,         setCampaigns]         = useState([]);
  const [subscribers,       setSubscribers]       = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [subject,           setSubject]           = useState('');
  const [previewText,       setPreviewText]       = useState('');
  const [campaignName,      setCampaignName]      = useState('New Campaign ' + new Date().toLocaleDateString());
  const [selectedTemplate,  setSelectedTemplate]  = useState('blank');
  const [showTemplates,     setShowTemplates]     = useState(true);
  const [pendingDesign,     setPendingDesign]     = useState(null);

  // A/B test
  const [isABTest,    setIsABTest]    = useState(false);
  const [subjectB,    setSubjectB]    = useState('');
  const [targetSegment, setTargetSegment] = useState('');
  const [deviceMode,  setDeviceMode]  = useState('desktop');
  const [previewHtml, setPreviewHtml] = useState(null);

  // Sender settings (Mailchimp-style)
  const [fromName,    setFromName]    = useState('Costa Peptides');
  const [fromEmail,   setFromEmail]   = useState('');
  const [replyTo,     setReplyTo]     = useState('');

  // Schedule
  const [scheduleMode, setScheduleMode] = useState('now'); // 'now' | 'scheduled'
  const [scheduledAt,  setScheduledAt]  = useState('');

  // Test email
  const [testEmail,      setTestEmail]      = useState('');
  const [isSendingTest,  setIsSendingTest]  = useState(false);

  useEffect(() => {
    fetchCampaigns();
    fetchSubscribers();
  }, []);

  const loadEditorDesign = useCallback((design) => {
    const editor = emailEditorRef.current?.editor;
    if (!editor || !isReady || !design) return false;

    const parsedDesign = typeof design === 'string' ? JSON.parse(design) : design;
    editor.loadDesign(parsedDesign);
    
    if (parsedDesign?.body?.values?.preheaderText) {
      setPreviewText(parsedDesign.body.values.preheaderText);
    } else {
      setPreviewText('');
    }
    
    return true;
  }, [isReady]);

  const applyTemplate = (tpl) => {
    setSelectedTemplate(tpl.id);
    setShowTemplates(false);
    setSelectedCampaignId('');

    if (tpl.subject) setSubject(tpl.subject);
    if (tpl.id !== 'blank') setCampaignName(`${tpl.name} Campaign ${new Date().toLocaleDateString()}`);

    if (!tpl.design) {
      emailEditorRef.current?.editor?.loadBlank?.();
      return;
    }

    try {
      if (!loadEditorDesign(tpl.design)) setPendingDesign(tpl.design);
    } catch (err) {
      console.error('Failed to load template design:', err);
      alert('Could not load that template. Please try again.');
    }
  };

  const fetchCampaigns = async () => {
    try {
      const res  = await adminFetch('/api/admin/campaigns');
      const data = await res.json();
      if (data.campaigns) setCampaigns(data.campaigns);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    }
  };

  const fetchSubscribers = async () => {
    try {
      const res  = await adminFetch('/api/admin/subscribers');
      const data = await res.json();
      if (data.subscribers) setSubscribers(data.subscribers);
    } catch (err) {
      console.error('Failed to fetch subscribers:', err);
    }
  };

  const selectedCampaign = useMemo(
    () => campaigns.find(c => c.id === selectedCampaignId),
    [campaigns, selectedCampaignId]
  );

  useEffect(() => {
    if (!selectedCampaign || !isReady) return;

    setCampaignName(selectedCampaign.title || '');
    setSubject(selectedCampaign.subject_line || '');
    setSubjectB(selectedCampaign.subject_line_b || '');
    setIsABTest(Boolean(selectedCampaign.is_ab_test));
    setTargetSegment(selectedCampaign.target_tags?.[0] || '');
    setFromName(selectedCampaign.from_name || 'Costa Peptides');
    setFromEmail(selectedCampaign.from_email || '');
    setReplyTo(selectedCampaign.reply_to || '');
    setPreviewText(selectedCampaign.preview_text || '');
    if (selectedCampaign.scheduled_at) {
      setScheduleMode('scheduled');
      setScheduledAt(new Date(selectedCampaign.scheduled_at).toISOString().slice(0, 16));
    } else {
      setScheduleMode('now');
      setScheduledAt('');
    }

    if (selectedCampaign.design_json) {
      try {
        loadEditorDesign(selectedCampaign.design_json);
      } catch (err) {
        console.error('Failed to load saved campaign design:', err);
        alert('Could not load the saved email design for this campaign.');
      }
    }
  }, [loadEditorDesign, selectedCampaign, isReady]);

  useEffect(() => {
    if (!pendingDesign || !isReady) return;

    try {
      if (loadEditorDesign(pendingDesign)) setPendingDesign(null);
    } catch (err) {
      console.error('Failed to load pending template design:', err);
      setPendingDesign(null);
    }
  }, [loadEditorDesign, pendingDesign, isReady]);

  const estimatedAudience = useMemo(() => {
    const tags = selectedCampaign?.target_tags || (targetSegment ? [targetSegment] : []);
    return subscribers.filter(sub => {
      if (sub.status !== 'subscribed') return false;
      if (!tags.length) return true;
      return Array.isArray(sub.tags) && sub.tags.includes(tags[0]);
    });
  }, [selectedCampaign, subscribers, targetSegment]);

  const preflightItems = useMemo(() => {
    const activeSubject = selectedCampaign?.subject_line || subject;
    const activeTitle   = selectedCampaign?.title || campaignName;
    return [
      { label: 'Campaign name set',              ok: Boolean(activeTitle?.trim()) },
      { label: 'Subject line ready',             ok: Boolean(activeSubject?.trim()) },
      { label: 'Audience has subscribers',       ok: estimatedAudience.length > 0 },
      { label: 'Sender credentials configured',  ok: true, note: 'Verified at send time.' },
      { label: 'Unsubscribe footer auto-added',  ok: true },
      { label: 'Tracking enabled',               ok: true },
      { label: 'Saved campaign selected',        ok: Boolean(selectedCampaignId) },
      { label: 'Email body saved',               ok: Boolean(selectedCampaign?.html_content || selectedCampaignId) },
    ];
  }, [campaignName, estimatedAudience.length, selectedCampaign, selectedCampaignId, subject]);

  const canSend = preflightItems.every(item => item.ok);
  const activeCampaignIsABTest = Boolean(selectedCampaign?.is_ab_test || isABTest);

  const saveCampaign = async () => {
    if (!subject || (isABTest && !subjectB)) { alert('Please enter subject line(s).'); return; }
    if (scheduleMode === 'scheduled' && !scheduledAt) { alert('Please pick a scheduled date/time.'); return; }
    setIsSaving(true);
    emailEditorRef.current.editor.exportHtml(async ({ design, html }) => {
      if (design && design.body) {
        design.body.values = design.body.values || {};
        if (previewText) design.body.values.preheaderText = previewText;
      }
      
      let finalHtml = html;
      if (previewText) {
        const hiddenPreview = `<div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>`;
        finalHtml = finalHtml.replace(/<body[^>]*>/i, `$&${hiddenPreview}`);
      }
      
      try {
        const payload = {
          title: campaignName, subject_line: subject,
          subject_line_b: isABTest ? subjectB : null,
          is_ab_test: isABTest,
          target_tags: targetSegment ? [targetSegment] : null,
          design_json: design, html_content: finalHtml,
          from_name: fromName || null,
          from_email: fromEmail || null,
          reply_to: replyTo || null,
          preview_text: previewText || null,
          scheduled_at: scheduleMode === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        };
        const res  = await adminFetch('/api/admin/campaigns', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to save campaign');
        setSelectedCampaignId(data.campaign.id);
        fetchCampaigns();
      } catch (err) {
        alert('Failed to save campaign: ' + err.message);
      } finally {
        setIsSaving(false);
      }
    });
  };

  const sendCampaign = async (isTestBatch = false) => {
    if (!selectedCampaignId) { alert('Select a saved campaign first.'); return; }
    if (!canSend) { alert('Resolve the preflight checks before sending.'); return; }
    const label = isTestBatch ? 'A/B test batch' : 'full campaign';
    if (!confirm(`Send ${label} to ${estimatedAudience.length} subscriber${estimatedAudience.length === 1 ? '' : 's'}?`)) return;
    try {
      setIsSending(true);
      const res  = await adminFetch('/api/admin/campaigns/send', {
        method: 'POST',
        body: JSON.stringify({ campaign_id: selectedCampaignId, is_test_batch: isTestBatch }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send');
      alert('Campaign sending initiated! Emails are dispatching in the background.');
      fetchCampaigns();
    } catch (err) {
      alert('Failed to send: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail.trim()) { alert('Enter a test email address.'); return; }
    setIsSendingTest(true);
    emailEditorRef.current.editor.exportHtml(async ({ html }) => {
      try {
        const res = await adminFetch('/api/admin/campaigns/test', {
          method: 'POST',
          body: JSON.stringify({
            email: testEmail.trim(),
            subject: subject || 'Test Campaign',
            html_content: html,
            from_name: fromName,
            from_email: fromEmail,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to send test');
        alert(`✅ Test email sent to ${testEmail}!`);
      } catch (err) {
        alert('Failed to send test: ' + err.message);
      } finally {
        setIsSendingTest(false);
      }
    });
  };

  const duplicateCampaign = async () => {
    if (!selectedCampaign) return;
    try {
      const res = await adminFetch('/api/admin/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          title: selectedCampaign.title + ' (Copy)',
          subject_line: selectedCampaign.subject_line,
          subject_line_b: selectedCampaign.subject_line_b,
          is_ab_test: selectedCampaign.is_ab_test,
          target_tags: selectedCampaign.target_tags,
          design_json: selectedCampaign.design_json,
          html_content: selectedCampaign.html_content,
          from_name: selectedCampaign.from_name,
          from_email: selectedCampaign.from_email,
          reply_to: selectedCampaign.reply_to,
          preview_text: selectedCampaign.preview_text,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to duplicate');
      setSelectedCampaignId(data.campaign.id);
      fetchCampaigns();
      alert('✅ Campaign duplicated!');
    } catch (err) {
      alert('Failed to duplicate: ' + err.message);
    }
  };

  const deleteCampaign = async () => {
    if (!selectedCampaignId) return;
    if (!confirm('Are you sure you want to delete this campaign? This cannot be undone.')) return;
    try {
      const res = await adminFetch(`/api/admin/campaigns?id=${selectedCampaignId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to delete');
      setSelectedCampaignId('');
      fetchCampaigns();
      alert('Campaign deleted.');
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const openPreview = () => {
    emailEditorRef.current.editor.exportHtml(({ html }) => {
      setPreviewHtml(html);
      setDeviceMode('desktop');
    });
  };

  return (
    <div className="mkt-builder-shell">
      {/* ── Mobile notice ── */}
      <div className="mkt-mobile-editor-notice">
        <Smartphone size={18} />
        <div>
          <strong>Tip for mobile:</strong> The drag &amp; drop builder works best on a tablet or desktop.
          On mobile, configure your campaign settings below and use "Save Draft" — then open on a larger screen to design the email body.
        </div>
      </div>

      {/* ══ CONFIG PANEL ══ */}
      <div className="mkt-builder-config">

        {/* Template picker */}
        <Section title="1. Choose a Template" icon={LayoutTemplate} defaultOpen={showTemplates}>
          <div className="mkt-template-grid">
            {TEMPLATES.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className={`mkt-template-card ${selectedTemplate === tpl.id ? 'selected' : ''}`}
              >
                <div className="mkt-template-icon">{tpl.icon}</div>
                <div className="mkt-template-name">{tpl.name}</div>
                <div className="mkt-template-desc">{tpl.desc}</div>
              </button>
            ))}
          </div>
        </Section>

        {/* Campaign settings */}
        <Section title="2. Content Settings" icon={Layers} defaultOpen>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px' }}>
              <label className="mkt-label">Campaign Name (Internal)</label>
              <input type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)} className="mkt-input" />
            </div>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px' }}>
              <label className="mkt-label">Audience Segment Tag</label>
              <div style={{ position: 'relative' }}>
                <Tag size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                <input type="text" value={targetSegment} onChange={e => setTargetSegment(e.target.value)} placeholder="Leave blank for all" className="mkt-input" style={{ paddingLeft: '32px' }} />
              </div>
            </div>
          </div>

          {/* Subject lines */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' }}>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px', marginBottom: 0 }}>
              <label className="mkt-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Subject Line {isABTest ? '(A) *' : '*'}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'normal', fontSize: '11px', color: '#34d399', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
                  <input type="checkbox" checked={isABTest} onChange={e => setIsABTest(e.target.checked)} style={{ accentColor: '#10b981' }} />
                  A/B Test
                </label>
              </label>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Hi [FIRST_NAME], big news…" className="mkt-input" />
            </div>
            {isABTest && (
              <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px', marginBottom: 0 }}>
                <label className="mkt-label">Subject Line B *</label>
                <input type="text" value={subjectB} onChange={e => setSubjectB(e.target.value)} placeholder="Don't miss this, [FIRST_NAME]!" className="mkt-input" />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px' }}>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '280px', marginBottom: 0 }}>
              <label className="mkt-label">📧 Preview Text <span style={{ fontWeight: 'normal', opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(shown next to subject in inbox)</span></label>
              <input type="text" value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="A short preheader summary that appears in the inbox…" className="mkt-input" />
            </div>
          </div>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '8px', marginBottom: 0 }}>
            Tip: Use <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>[FIRST_NAME]</code> for personalisation.
          </p>
        </Section>

        {/* Sender & Delivery settings (Mailchimp-style) */}
        <Section title="3. Sender & Delivery" icon={Mail} defaultOpen={false}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px' }}>
              <label className="mkt-label">From Name</label>
              <input type="text" value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Costa Peptides" className="mkt-input" />
            </div>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px' }}>
              <label className="mkt-label">From Email <span style={{ fontWeight: 'normal', opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <div style={{ position: 'relative' }}>
                <AtSign size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                <input type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="Uses default sender" className="mkt-input" style={{ paddingLeft: '32px' }} />
              </div>
            </div>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px' }}>
              <label className="mkt-label">Reply-To Email <span style={{ fontWeight: 'normal', opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <div style={{ position: 'relative' }}>
                <AtSign size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                <input type="email" value={replyTo} onChange={e => setReplyTo(e.target.value)} placeholder="Same as from email" className="mkt-input" style={{ paddingLeft: '32px' }} />
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div style={{ marginTop: '16px', padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <label className="mkt-label" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CalendarClock size={14} style={{ color: '#34d399' }} /> Send Timing
            </label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: scheduleMode === 'now' ? '#34d399' : 'rgba(255,255,255,0.5)' }}>
                <input type="radio" name="scheduleMode" value="now" checked={scheduleMode === 'now'} onChange={() => setScheduleMode('now')} style={{ accentColor: '#10b981' }} />
                Send immediately
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: scheduleMode === 'scheduled' ? '#38bdf8' : 'rgba(255,255,255,0.5)' }}>
                <input type="radio" name="scheduleMode" value="scheduled" checked={scheduleMode === 'scheduled'} onChange={() => setScheduleMode('scheduled')} style={{ accentColor: '#38bdf8' }} />
                Schedule for later
              </label>
              {scheduleMode === 'scheduled' && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="mkt-input"
                  style={{ maxWidth: '240px', margin: 0 }}
                  min={new Date().toISOString().slice(0, 16)}
                />
              )}
            </div>
          </div>

          {/* Send Test Email */}
          <div style={{ marginTop: '16px', padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <label className="mkt-label" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TestTube2 size={14} style={{ color: '#f59e0b' }} /> Send Test Email
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
              <input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="your@email.com"
                className="mkt-input"
                style={{ flex: 1, margin: 0 }}
              />
              <button
                onClick={sendTestEmail}
                disabled={isSendingTest || !isReady || !testEmail.trim()}
                className="mkt-btn mkt-btn-warning"
                style={{ whiteSpace: 'nowrap', margin: 0 }}
              >
                {isSendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send Test
              </button>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', margin: '8px 0 0' }}>
              Sends a preview with [TEST] prefix. Use commas for multiple addresses.
            </p>
          </div>
        </Section>

        {/* Preflight + actions */}
        <div className="mkt-command-grid" style={{ marginBottom: 0 }}>
          {/* Library */}
          <div className="mkt-panel">
            <div className="mkt-panel-header">
              <div>
                <div className="mkt-panel-kicker">Campaign Library</div>
                <h3 className="mkt-panel-title">Select a saved campaign</h3>
              </div>
              <Copy size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
            </div>
            <select className="mkt-input" value={selectedCampaignId} onChange={e => setSelectedCampaignId(e.target.value)}>
              <option value="">Choose draft or sent campaign…</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.title} · {c.status}</option>
              ))}
            </select>
            {selectedCampaign && (
              <div className="mkt-selected-campaign">
                <div style={{ fontWeight: '700', fontSize: '13px', color: '#fff', marginBottom: '4px' }}>{selectedCampaign.subject_line}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginBottom: '8px' }}>
                  {selectedCampaign.target_tags?.length ? `Segment: ${selectedCampaign.target_tags.join(', ')}` : 'Audience: all subscribers'}
                  {selectedCampaign.scheduled_at && (
                    <span style={{ marginLeft: '8px', color: '#38bdf8' }}>
                      📅 Scheduled: {new Date(selectedCampaign.scheduled_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={duplicateCampaign} className="mkt-btn" style={{ flex: '1 1 auto', padding: '6px 10px', fontSize: '11px' }}>
                    <CopyPlus size={12} /> Duplicate
                  </button>
                  <button onClick={deleteCampaign} className="mkt-btn" style={{ flex: '1 1 auto', padding: '6px 10px', fontSize: '11px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Preflight */}
          <div className="mkt-panel">
            <div className="mkt-panel-header">
              <div>
                <div className="mkt-panel-kicker">Preflight</div>
                <h3 className="mkt-panel-title">
                  <span className="mkt-audience-count" style={{ marginBottom: 0 }}>
                    <span>{estimatedAudience.length}</span> eligible
                  </span>
                </h3>
              </div>
              <Users size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
            </div>
            <div className="mkt-checklist">
              {preflightItems.map(item => (
                <div key={item.label} className={`mkt-check ${item.ok ? 'ok' : 'warn'}`}>
                  {item.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
              <button onClick={openPreview} disabled={!isReady} className="mkt-btn" style={{ flex: '1 1 auto' }}>
                <Eye size={14} /> Preview
              </button>
              <button onClick={saveCampaign} disabled={!isReady || isSaving} className="mkt-btn mkt-btn-primary" style={{ flex: '1 1 auto' }}>
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Draft
              </button>
              {activeCampaignIsABTest && (
                <button onClick={() => sendCampaign(true)} disabled={!isReady || isSending || !selectedCampaign?.is_ab_test} className="mkt-btn mkt-btn-warning" style={{ flex: '1 1 auto' }}>
                  <Send size={14} /> Test 20%
                </button>
              )}
              <button
                onClick={() => sendCampaign(false)}
                disabled={!isReady || isSending || !selectedCampaignId || selectedCampaign?.status === 'testing'}
                className="mkt-btn mkt-btn-danger"
                style={{ flex: '1 1 auto' }}
                title={selectedCampaign?.status === 'testing' ? 'Pick A/B winner from Analytics first.' : 'Send to full list'}
              >
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══ EMAIL EDITOR ══ */}
      <div className="mkt-email-editor-frame">
        {!isReady && (
          <div className="mkt-email-editor-loading">
            <Loader2 className="animate-spin" size={30} style={{ color: '#34d399' }} />
            <p style={{ margin: 0, fontSize: '14px' }}>Loading Email Editor…</p>
          </div>
        )}
        <div className="mkt-email-editor">
          <EmailEditor
            ref={emailEditorRef}
            onReady={() => setIsReady(true)}
            minHeight="640px"
            options={{ 
              devices: ['desktop', 'mobile'],
              appearance: { theme: 'dark' },
              features: { 
                preheaderText: true, 
                textEditor: { backgroundColor: true, textColor: true },
              } 
            }}
          />
        </div>
      </div>

      {/* ══ PREVIEW MODAL ══ */}
      {previewHtml && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Header bar */}
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '16px 24px', background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Preview:</span>
            <button 
              type="button"
              onClick={() => setDeviceMode('desktop')}
              style={{ 
                background: deviceMode === 'desktop' ? 'rgba(56, 189, 248, 0.15)' : 'transparent', 
                border: deviceMode === 'desktop' ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(255,255,255,0.1)',
                color: deviceMode === 'desktop' ? '#38bdf8' : '#94a3b8', 
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '8px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.85rem', transition: 'all 0.2s'
              }}>
              <Monitor size={16} /> Desktop
            </button>
            <button 
              type="button"
              onClick={() => setDeviceMode('mobile')}
              style={{ 
                background: deviceMode === 'mobile' ? 'rgba(56, 189, 248, 0.15)' : 'transparent', 
                border: deviceMode === 'mobile' ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(255,255,255,0.1)',
                color: deviceMode === 'mobile' ? '#38bdf8' : '#94a3b8', 
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '8px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.85rem', transition: 'all 0.2s'
              }}>
              <Smartphone size={16} /> Mobile
            </button>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: '0.75rem', color: '#475569' }}>{deviceMode === 'mobile' ? '375 × 667 px' : '600 px wide'}</span>
            <button 
              type="button"
              onClick={() => setPreviewHtml(null)}
              style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}
            >
              <X size={18} />
            </button>
          </div>
          {/* Preview iframe */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '32px 16px', overflow: 'auto', width: '100%' }}>
            <div style={{
              width: deviceMode === 'mobile' ? '375px' : '600px',
              height: deviceMode === 'mobile' ? '667px' : '80vh',
              border: deviceMode === 'mobile' ? '12px solid #1e293b' : '2px solid #1e293b',
              borderRadius: deviceMode === 'mobile' ? '40px' : '12px',
              overflow: 'hidden',
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.6)',
              background: '#fff',
              transition: 'all 0.3s ease',
              position: 'relative',
              flexShrink: 0,
            }}>
              {/* Phone notch */}
              {deviceMode === 'mobile' && (
                <div style={{ position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)', width: '120px', height: '24px', background: '#1e293b', borderRadius: '0 0 16px 16px', zIndex: 2 }} />
              )}
              <iframe
                title="Email Preview"
                srcDoc={previewHtml}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
