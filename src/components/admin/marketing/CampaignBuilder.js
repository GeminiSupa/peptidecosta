"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EmailEditor from 'react-email-editor';
import { LIVE_SITE_URL } from '@/lib/publicUrl';
import {
  AlertTriangle, CheckCircle2, Eye, Loader2, Save, Send,
  Users, ChevronDown, ChevronUp, Smartphone, LayoutTemplate,
  Tag, Layers, Monitor, X, Clock, Trash2, Mail, AtSign, SendHorizonal,
  CalendarClock, TestTube2, CopyPlus, Sparkles
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { MARKETING_FOOTER_MARKER, buildMarketingEmailFooterTemplateHtml } from '@/lib/marketingEmailFooter';
import { normalizeAudienceScope } from '@/lib/campaignAudience.mjs';
import { BEHAVIOR_FILTERS, behaviorFilterLabel, matchesBehaviorFilter, normalizeBehaviorFilter, signalsFor } from '@/lib/campaignBehavior.mjs';

const LOCAL_DRAFT_KEY = 'marketing_studio_local_email_draft_v1';

// Autosave cadence. The editor fires a change event per keystroke and per drag,
// so the server save waits for a lull; the browser snapshot is cheap and runs
// sooner, because a crashed tab is the case it exists for.
const AUTOSAVE_SERVER_MS = 4000;
const AUTOSAVE_LOCAL_MS = 1200;

// The three recipient groups. "Everyone" is subscribers + leads deduplicated by
// address, which is why it is not simply the two counts added together.
const AUDIENCE_CHOICES = [
  {
    id: 'subscribers',
    label: 'Newsletter subscribers only',
    accent: '#10b981',
    activeBorder: 'rgba(52,211,153,0.55)',
    activeBackground: 'rgba(16,185,129,0.09)',
    hint: 'signed up through a form',
  },
  {
    id: 'non_subscribers',
    label: 'Non-subscribers only',
    accent: '#fbbf24',
    activeBorder: 'rgba(251,191,36,0.55)',
    activeBackground: 'rgba(245,158,11,0.09)',
    hint: 'never signed up through a form',
  },
  {
    id: 'leads',
    label: 'CRM leads only',
    accent: '#a78bfa',
    activeBorder: 'rgba(167,139,250,0.55)',
    activeBackground: 'rgba(139,92,246,0.09)',
    hint: 'every lead, including those who also subscribed',
  },
  {
    id: 'all',
    label: 'Everyone with an email',
    accent: '#38bdf8',
    activeBorder: 'rgba(56,189,248,0.55)',
    activeBackground: 'rgba(14,165,233,0.09)',
    hint: 'subscribers and leads, deduplicated',
  },
];
const ACTUAL_SMTP_SENDER = 'info@peptidescostarica.net';
const EMAIL_TEMPLATE_WIDTH = 600;
const MOBILE_PREVIEW_WIDTH = 375;
const MOBILE_PREVIEW_HEIGHT = 667;

// ── Template Library ─────────────────────────────────────────────────
const brandButton = {
  href: { name: 'web', values: { href: `${LIVE_SITE_URL}/catalog`, target: '_blank' } },
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

const buttonBlock = (text, href = `${LIVE_SITE_URL}/catalog`) => ({
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

const emailFooterBlock = () => textBlock(buildMarketingEmailFooterTemplateHtml(), {
  containerPadding: '0px',
  fontSize: '13px',
  lineHeight: '150%',
  textAlign: 'center',
  color: '#3f4f46',
});

const emailFooterRow = () => ({
  cells: [1],
  columns: [
    {
      contents: [emailFooterBlock()],
      values: { backgroundColor: '#f4f4f5', padding: '0px' },
    },
  ],
  values: { backgroundColor: '#f4f4f5', padding: '0px' },
});

function designHasMarketingFooter(design) {
  return JSON.stringify(design || {}).includes(MARKETING_FOOTER_MARKER);
}

function appendMarketingFooterToDesign(design) {
  const nextDesign = JSON.parse(JSON.stringify(design || createBlankDesign()));
  if (designHasMarketingFooter(nextDesign)) return { design: nextDesign, added: false };

  nextDesign.body = nextDesign.body || {};
  nextDesign.body.rows = Array.isArray(nextDesign.body.rows) ? nextDesign.body.rows : [];
  nextDesign.body.rows.push(emailFooterRow());
  nextDesign.body.values = nextDesign.body.values || {};
  nextDesign.body.values.backgroundColor = nextDesign.body.values.backgroundColor || '#f3f4f6';
  nextDesign.body.values.contentWidth = nextDesign.body.values.contentWidth || '600px';
  nextDesign.schemaVersion = nextDesign.schemaVersion || 21;
  nextDesign.counters = nextDesign.counters || {};
  nextDesign.counters.u_row = Number(nextDesign.counters.u_row || nextDesign.body.rows.length) + 1;
  nextDesign.counters.u_column = Number(nextDesign.counters.u_column || nextDesign.body.rows.length) + 1;
  nextDesign.counters.u_content_text = Number(nextDesign.counters.u_content_text || 0) + 1;
  return { design: nextDesign, added: true };
}

const createTemplateDesign = ({ headline, eyebrow, body, cta, footerNote, accent = '#10b981' }) => ({
  counters: { u_row: 6, u_column: 6, u_content_text: 10, u_content_button: 1, u_content_divider: 1 },
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
      {
        ...emailFooterRow(),
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

const createBlankDesign = () => ({
  counters: { u_row: 3, u_column: 3, u_content_text: 3 },
  body: {
    rows: [
      {
        cells: [1],
        columns: [
          {
            contents: [
              textBlock('<p>Start writing your email here...</p>', {
                containerPadding: '28px 24px',
              }),
            ],
            values: { backgroundColor: '#ffffff', padding: '0px' },
          },
        ],
        values: { backgroundColor: '#ffffff', padding: '0px' },
      },
      {
        ...emailFooterRow(),
      },
    ],
    values: {
      backgroundColor: '#f3f4f6',
      contentWidth: '600px',
      fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
      preheaderText: '',
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

<p>You can view all our products and place your order directly on our <a href="${LIVE_SITE_URL}/catalog" style="color: #059669; font-weight: bold; text-decoration: underline;">online catalog here</a>.</p>`,
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
    design: createBlankDesign(),
  },
];

// Collapsible section component
function Section({ title, icon: Icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`mkt-builder-section ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="mkt-builder-section-toggle"
        aria-expanded={open}
      >
        <span>
          {Icon && <Icon size={16} />}
          {title}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="mkt-builder-section-body">{children}</div>}
    </section>
  );
}

export default function CampaignBuilder({ editingCampaignId, onDirtyChange, notify, confirm }) {
  const emailEditorRef      = useRef(null);
  const [isReady,           setIsReady]           = useState(false);
  const [isSaving,          setIsSaving]          = useState(false);
  const [isSending,         setIsSending]         = useState(false);
  const [campaigns,         setCampaigns]         = useState([]);
  const [subscribers,       setSubscribers]       = useState([]);
  const [leadCandidates,    setLeadCandidates]    = useState([]);
  const [leadEmailTotal,    setLeadEmailTotal]    = useState(0);
  const [selectedCampaignId, setSelectedCampaignId] = useState(editingCampaignId || '');
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [subject,           setSubject]           = useState('');
  const [previewText,       setPreviewText]       = useState('');
  const [campaignName,      setCampaignName]      = useState('New Campaign ' + new Date().toLocaleDateString());
  const [selectedTemplate,  setSelectedTemplate]  = useState('blank');
  const [showTemplates,     setShowTemplates]     = useState(true);
  const [pendingDesign,     setPendingDesign]     = useState(null);
  const [aiPrompt,          setAiPrompt]          = useState('');
  const [isGeneratingAI,    setIsGeneratingAI]    = useState(false);
  const [showAiAssistant,   setShowAiAssistant]   = useState(false);

  // A/B test
  const [isABTest,    setIsABTest]    = useState(false);
  const [subjectB,    setSubjectB]    = useState('');
  const [targetSegment, setTargetSegment] = useState('');
  const [audienceScope, setAudienceScope] = useState('subscribers');
  const [behaviorFilter, setBehaviorFilter] = useState('none');
  const [behaviorSignals, setBehaviorSignals] = useState(null);
  const [behaviorEstimateApproximate, setBehaviorEstimateApproximate] = useState(false);
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
  // Fallback used for name merge tags when a contact has no name on file.
  const [defaultFirstName, setDefaultFirstName] = useState('');
  const [autosaveStatus, setAutosaveStatus] = useState('idle');
  const [lastSavedAt,    setLastSavedAt]    = useState(null);
  const [statusDetail,   setStatusDetail]   = useState('');
  const [lastTestedSignature, setLastTestedSignature] = useState('');
  const [lastTestSentAt, setLastTestSentAt] = useState(null);
  const saveInFlightRef  = useRef(false);
  const pendingSaveRef   = useRef(false);
  const recoveryCheckedRef = useRef(false);
  const selectedCampaignIdRef = useRef(editingCampaignId || '');
  const hydratedCampaignIdRef = useRef('');
  const suppressEditorUpdatesRef = useRef(false);
  const seededBlankRef = useRef(false);

  const buildCampaignSignature = useCallback((html = '') => JSON.stringify({
    title: campaignName,
    subject,
    subjectB: isABTest ? subjectB : '',
    isABTest,
    targetSegment,
    audienceScope,
    behaviorFilter,
    previewText,
    replyTo,
    scheduleMode,
    scheduledAt,
    html
  }), [audienceScope, behaviorFilter, campaignName, isABTest, previewText, replyTo, scheduleMode, scheduledAt, subject, subjectB, targetSegment]);

  const hasUnsavedChanges = ['pending', 'error', 'recovered'].includes(autosaveStatus);
  const saveStatusText = useMemo(() => {
    if (autosaveStatus === 'saving' || isSaving) return 'Saving changes...';
    if (autosaveStatus === 'error') return 'Save failed';
    if (autosaveStatus === 'recovered') return 'Recovered local draft';
    if (autosaveStatus === 'pending') return 'Unsaved changes';
    if (lastSavedAt) return `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return 'Manual save mode';
  }, [autosaveStatus, isSaving, lastSavedAt]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const writeLocalSnapshot = useCallback(async ({ unsaved = true, source = 'local' } = {}) => {
    const editor = emailEditorRef.current?.editor;
    if (typeof window === 'undefined' || !editor || !isReady) return false;

    try {
      const exported = await new Promise((resolve, reject) => {
        try {
          editor.exportHtml(resolve);
        } catch (error) {
          reject(error);
        }
      });
      const snapshot = {
        version: 1,
        source,
        unsaved,
        savedAt: new Date().toISOString(),
        selectedCampaignId: selectedCampaignIdRef.current,
        campaignName,
        subject,
        subjectB,
        isABTest,
        targetSegment,
        audienceScope,
        behaviorFilter,
        previewText,
        fromName,
        fromEmail,
        replyTo,
        scheduleMode,
        scheduledAt,
        design: exported.design,
        html: exported.html,
        signature: buildCampaignSignature(exported.html),
      };
      window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(snapshot));
      return true;
    } catch (error) {
      console.warn('Local campaign draft snapshot failed:', error);
      return false;
    }
  }, [audienceScope, behaviorFilter, buildCampaignSignature, campaignName, fromEmail, fromName, isABTest, isReady, previewText, replyTo, scheduleMode, scheduledAt, subject, subjectB, targetSegment]);

  useEffect(() => {
    selectedCampaignIdRef.current = selectedCampaignId;
  }, [selectedCampaignId]);

  const markDraftDirty = () => {
    setAutosaveStatus('pending');
    setStatusDetail('Unsaved changes. Autosaving shortly — or press Cmd/Ctrl+S to save now.');
    setLastTestedSignature('');
    setLastTestSentAt(null);
  };

  const updateDraftField = (setter, value) => {
    setter(value);
    markDraftDirty();
  };

  const generateAITemplate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGeneratingAI(true);
    try {
      const res = await adminFetch('/api/ai', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'generate_email_template',
          context: { prompt: aiPrompt }
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to generate');
      
      const parsed = JSON.parse(data.text);
      
      setPreviewText(parsed.previewText || '');
      
      const newDesign = createTemplateDesign({
        headline: parsed.headline || 'New Campaign',
        eyebrow: parsed.eyebrow || '',
        body: parsed.body || '<p>Start typing here...</p>',
        cta: parsed.cta || 'Click Here',
        footerNote: parsed.footerNote || '',
        accent: '#8b5cf6'
      });
      
      applyTemplate({ id: 'ai-generated', name: 'AI Template', design: newDesign, subject: parsed.subject });
      setAiPrompt('');
      notify('AI template generated. Every block is still editable.', 'success');
    } catch (err) {
      console.error(err);
      notify(`AI could not generate that template: ${err.message}`, 'error');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    fetchSubscribers();
    fetchSavedTemplates();
    fetchBehaviorSignals();
  }, []);

  const loadEditorDesign = useCallback((design) => {
    const editor = emailEditorRef.current?.editor;
    if (!editor || !isReady || !design) return false;

    const parsedDesign = typeof design === 'string' ? JSON.parse(design) : design;
    suppressEditorUpdatesRef.current = true;
    editor.loadDesign(parsedDesign);
    setTimeout(() => { suppressEditorUpdatesRef.current = false; }, 800);
    
    if (parsedDesign?.body?.values?.preheaderText) {
      setPreviewText(parsedDesign.body.values.preheaderText);
    } else {
      setPreviewText('');
    }
    
    return true;
  }, [isReady]);

  const restoreLocalSnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    selectedCampaignIdRef.current = snapshot.selectedCampaignId || '';
    hydratedCampaignIdRef.current = snapshot.selectedCampaignId || '';
    setSelectedCampaignId(snapshot.selectedCampaignId || '');
    setCampaignName(snapshot.campaignName || 'Recovered Campaign');
    setSubject(snapshot.subject || '');
    setSubjectB(snapshot.subjectB || '');
    setIsABTest(Boolean(snapshot.isABTest));
    setTargetSegment(snapshot.targetSegment || '');
    setAudienceScope(normalizeAudienceScope(snapshot.audienceScope, snapshot.includeLeads));
    setBehaviorFilter(normalizeBehaviorFilter(snapshot.behaviorFilter));
    setPreviewText(snapshot.previewText || '');
    setFromName(snapshot.fromName || 'Costa Peptides');
    setFromEmail(snapshot.fromEmail || '');
    setReplyTo(snapshot.replyTo || '');
    setScheduleMode(snapshot.scheduleMode || 'now');
    setScheduledAt(snapshot.scheduledAt || '');
    setLastTestedSignature('');
    setLastTestSentAt(null);
    if (snapshot.design) {
      try {
        if (!loadEditorDesign(snapshot.design)) setPendingDesign(snapshot.design);
      } catch (error) {
        console.error('Failed to restore local email draft:', error);
      }
    }
    setAutosaveStatus('recovered');
    setStatusDetail(`Recovered local draft from ${new Date(snapshot.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Save it to store it on the server.`);
  }, [loadEditorDesign]);

  const applyTemplate = async (tpl) => {
    if (hasUnsavedChanges && !(await confirm({
      title: 'Replace your unsaved design?',
      message: 'Applying a template overwrites the email you have been editing.',
      detail: 'Changes that were never saved to the server cannot be recovered.',
      confirmLabel: 'Apply template',
      tone: 'danger',
    }))) return;
    setSelectedTemplate(tpl.id);
    setShowTemplates(false);
    selectedCampaignIdRef.current = '';
    hydratedCampaignIdRef.current = '';
    setSelectedCampaignId('');

    if (tpl.subject) setSubject(tpl.subject);
    if (tpl.id !== 'blank') setCampaignName(`${tpl.name} Campaign ${new Date().toLocaleDateString()}`);
    markDraftDirty();

    if (!tpl.design) {
      emailEditorRef.current?.editor?.loadBlank?.();
      return;
    }

    try {
      if (!loadEditorDesign(tpl.design)) setPendingDesign(tpl.design);
    } catch (err) {
      console.error('Failed to load template design:', err);
      notify('Could not load that template. Please try again.', 'error');
    }
  };

  const fetchBehaviorSignals = async () => {
    try {
      const res = await adminFetch('/api/admin/marketing-segments');
      const data = await res.json();
      setBehaviorSignals(data.signals || {});
      setBehaviorEstimateApproximate(Boolean(data.truncated));
    } catch (err) {
      // Without these the estimate falls back to the whole scope and says so;
      // the send still applies the filter server-side either way.
      console.warn('Could not load behavioural segments:', err);
    }
  };

  const fetchSavedTemplates = async () => {
    try {
      const res = await adminFetch('/api/admin/campaign-templates');
      const data = await res.json();
      setSavedTemplates(data.templates || []);
    } catch (err) {
      // The built-in templates still work without these; no need to shout.
      console.warn('Could not load saved templates:', err);
    }
  };

  // A template is a layout, not a campaign: the design and a subject pattern
  // travel, the audience, tags and schedule deliberately do not. Duplicating a
  // campaign was the only way to reuse a design before this, and it dragged all
  // of those along with it.
  const saveAsTemplate = async () => {
    const editor = emailEditorRef.current?.editor;
    if (!isReady || !editor) {
      notify('The editor is still loading. Try again in a moment.', 'warning');
      return;
    }

    const name = templateName.trim();
    if (!name) {
      notify('Give the template a name to save it.', 'warning');
      return;
    }

    setIsSavingTemplate(true);
    try {
      const exported = await new Promise((resolve, reject) => {
        try {
          editor.exportHtml(resolve);
        } catch (error) {
          reject(error);
        }
      });
      const res = await adminFetch('/api/admin/campaign-templates', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: subject.trim() ? `Subject: ${subject.trim()}` : 'Saved from the campaign builder',
          subject_line: subject.trim() || null,
          design_json: exported.design,
          html_content: exported.html,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to save template');
      await fetchSavedTemplates();
      setTemplateName('');
      setShowTemplateSave(false);
      notify(`Saved "${name}" to your templates.`, 'success');
    } catch (err) {
      notify(`Could not save the template: ${err.message}`, 'error');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const deleteSavedTemplate = async (template) => {
    const confirmed = await confirm({
      title: 'Delete this template?',
      message: template.name,
      detail: 'Campaigns already built from it are untouched.',
      confirmLabel: 'Delete template',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const res = await adminFetch(`/api/admin/campaign-templates?id=${template.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to delete template');
      setSavedTemplates(current => current.filter(item => item.id !== template.id));
      notify(`Deleted "${template.name}".`, 'success');
    } catch (err) {
      notify(`Could not delete the template: ${err.message}`, 'error');
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
      const res  = await adminFetch('/api/admin/subscribers?include_leads=true');
      const data = await res.json();
      if (data.subscribers) setSubscribers(data.subscribers);
      if (data.lead_candidates) setLeadCandidates(data.lead_candidates);
      setLeadEmailTotal(Number(data.lead_email_total) || 0);
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
    if (hydratedCampaignIdRef.current === selectedCampaign.id) return;
    hydratedCampaignIdRef.current = selectedCampaign.id;

    setCampaignName(selectedCampaign.title || '');
    setSubject(selectedCampaign.subject_line || '');
    setSubjectB(selectedCampaign.subject_line_b || '');
    setIsABTest(Boolean(selectedCampaign.is_ab_test));
    setTargetSegment(selectedCampaign.target_tags?.[0] || '');
    setAudienceScope(normalizeAudienceScope(selectedCampaign.audience_scope, selectedCampaign.include_leads));
    setBehaviorFilter(normalizeBehaviorFilter(selectedCampaign.behavior_filter));
    setFromName(selectedCampaign.from_name || 'Costa Peptides');
    setFromEmail(selectedCampaign.from_email || '');
    setReplyTo(selectedCampaign.reply_to || '');
    setPreviewText(selectedCampaign.preview_text || '');
    if (selectedCampaign.scheduled_for) {
      setScheduleMode('scheduled');
      setScheduledAt(new Date(selectedCampaign.scheduled_for).toISOString().slice(0, 16));
    } else {
      setScheduleMode('now');
      setScheduledAt('');
    }

    if (selectedCampaign.design_json) {
      try {
        loadEditorDesign(selectedCampaign.design_json);
      } catch (err) {
        console.error('Failed to load saved campaign design:', err);
        notify('Could not load the saved email design for this campaign.', 'error');
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

  // Unlayer's own built-in blank design is 500px wide, so anything built from
  // scratch shipped narrower than the 600px Mailchimp and our own templates use.
  // Nothing was loading a design when the editor mounts with no campaign
  // selected, which left that 500px default in place. Seed our blank instead.
  useEffect(() => {
    if (!isReady || seededBlankRef.current) return;
    // A campaign or template already owns the canvas. Mark it handled so that
    // clearing pendingDesign after it loads cannot seed a blank over the top.
    if (selectedCampaignId || pendingDesign) {
      seededBlankRef.current = true;
      return;
    }
    seededBlankRef.current = true;
    loadEditorDesign(createBlankDesign());
  }, [isReady, selectedCampaignId, pendingDesign, loadEditorDesign]);

  useEffect(() => {
    if (!isReady || recoveryCheckedRef.current || typeof window === 'undefined') return;
    recoveryCheckedRef.current = true;

    const offerRecovery = async () => {
      try {
        const raw = window.localStorage.getItem(LOCAL_DRAFT_KEY);
        if (!raw) return;
        const snapshot = JSON.parse(raw);
        if (!snapshot?.unsaved || !snapshot.design) return;
        const savedLabel = snapshot.savedAt
          ? new Date(snapshot.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : 'recently';
        const restore = await confirm({
          title: 'Restore your recovered draft?',
          message: `An unsaved Marketing Studio draft from ${savedLabel} is still in this browser.`,
          detail: 'Restoring replaces whatever is currently on the canvas.',
          confirmLabel: 'Restore draft',
          cancelLabel: 'Keep editing',
        });
        if (restore) {
          restoreLocalSnapshot(snapshot);
        } else {
          setStatusDetail('Local recovery draft kept in this browser until your next successful save.');
        }
      } catch (error) {
        console.warn('Unable to inspect local campaign draft recovery:', error);
      }
    };

    offerRecovery();
  }, [confirm, isReady, restoreLocalSnapshot]);

  const eligibleSubscribers = useMemo(() => {
    const tags = targetSegment ? [targetSegment] : [];
    return subscribers.filter(sub => {
      if (sub.status !== 'subscribed') return false;
      // Rows copied in from the lead table are not newsletter signups.
      if (String(sub.source || '').toLowerCase() === 'crm_lead') return false;
      if (!tags.length) return true;
      return Array.isArray(sub.tags) && sub.tags.includes(tags[0]);
    });
  }, [subscribers, targetSegment]);

  const eligibleLeads = useMemo(() => {
    const tags = targetSegment ? [targetSegment] : [];
    return leadCandidates.filter(lead => {
      if (!tags.length) return true;
      return Array.isArray(lead.tags) && lead.tags.includes(tags[0]);
    });
  }, [leadCandidates, targetSegment]);

  // "CRM leads only" counts every lead address, including people who ALSO
  // signed up, so it is larger than the not-yet-a-subscriber list the API
  // returns. Only the server can enumerate that overlap, hence lead_email_total.
  const allLeadCount = Math.max(leadEmailTotal, eligibleLeads.length);

  const audienceCounts = useMemo(() => ({
    subscribers: eligibleSubscribers.length,
    non_subscribers: eligibleLeads.length,
    leads: allLeadCount,
    all: eligibleSubscribers.length + eligibleLeads.length,
  }), [allLeadCount, eligibleLeads.length, eligibleSubscribers.length]);

  const scopedAudience = useMemo(() => {
    if (audienceScope === 'non_subscribers') return eligibleLeads;
    if (audienceScope === 'leads') return new Array(allLeadCount).fill(null);
    if (audienceScope === 'all') return [...eligibleSubscribers, ...eligibleLeads];
    return eligibleSubscribers;
  }, [allLeadCount, audienceScope, eligibleLeads, eligibleSubscribers]);

  // The behaviour filter narrows the scope, never widens it. "CRM leads only"
  // is a bare count rather than rows — the overlap only the server can
  // enumerate — so it cannot be filtered here; the send still applies it.
  const estimatedAudience = useMemo(() => {
    if (behaviorFilter === 'none' || !behaviorSignals) return scopedAudience;
    if (audienceScope === 'leads') return scopedAudience;
    const signalMap = new Map(Object.entries(behaviorSignals));
    return scopedAudience.filter(person => matchesBehaviorFilter(behaviorFilter, signalsFor(signalMap, person?.email)));
  }, [audienceScope, behaviorFilter, behaviorSignals, scopedAudience]);

  const behaviorEstimateUnavailable = behaviorFilter !== 'none'
    && (audienceScope === 'leads' || !behaviorSignals);

  const preflightItems = useMemo(() => {
    const activeSubject = selectedCampaign?.subject_line || subject;
    const activeTitle   = selectedCampaign?.title || campaignName;
    return [
      { label: 'Campaign name set',              errorLabel: 'Missing campaign name', ok: Boolean(activeTitle?.trim()) },
      { label: 'Subject line ready',             errorLabel: 'Missing subject line', ok: Boolean(activeSubject?.trim()) },
      { label: 'Audience has recipients',        errorLabel: 'Audience has no recipients', ok: estimatedAudience.length > 0 },
      { label: 'Sender credentials configured',  errorLabel: 'Sender credentials not configured', ok: true, note: 'Verified at send time.' },
      { label: 'Unsubscribe footer auto-added',  errorLabel: 'Unsubscribe footer missing', ok: true },
      { label: 'Tracking enabled',               errorLabel: 'Tracking not enabled', ok: true },
      { label: 'Saved campaign selected',        errorLabel: 'No saved campaign selected', ok: Boolean(selectedCampaignId) },
      { label: 'Email body saved',               errorLabel: 'Email body not saved', ok: Boolean(selectedCampaign?.html_content || selectedCampaignId) },
      { label: 'Current version test email sent', errorLabel: 'Current version test email not sent', ok: Boolean(lastTestedSignature && lastTestSentAt) },
    ];
  }, [campaignName, estimatedAudience.length, lastTestSentAt, lastTestedSignature, selectedCampaign, selectedCampaignId, subject]);

  const canSend = preflightItems.every(item => item.ok);
  const activeCampaignIsABTest = Boolean(selectedCampaign?.is_ab_test || isABTest);
  const selectedCampaignSentCount = selectedCampaign?.campaign_sends?.[0]?.count || 0;

  const persistCampaign = async ({ silent = false } = {}) => {
    if (!isReady || !emailEditorRef.current?.editor || !campaignName.trim() || !subject.trim() || (isABTest && !subjectB.trim())) return false;
    if (scheduleMode === 'scheduled' && !scheduledAt) return false;
    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return false;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);
    setAutosaveStatus('saving');

    try {
      const exported = await new Promise((resolve, reject) => {
        try {
          emailEditorRef.current.editor.exportHtml(resolve);
        } catch (error) {
          reject(error);
        }
      });
      const { design, html } = exported;
      if (design?.body) {
        design.body.values = design.body.values || {};
        if (previewText) design.body.values.preheaderText = previewText;
      }

      let finalHtml = html;
      if (previewText) {
        const hiddenPreview = `<div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>`;
        finalHtml = finalHtml.replace(/<body[^>]*>/i, `$&${hiddenPreview}`);
      }

        const payload = {
          ...(selectedCampaignIdRef.current ? { id: selectedCampaignIdRef.current } : {}),
          title: campaignName, subject_line: subject,
          subject_line_b: isABTest ? subjectB : null,
          is_ab_test: isABTest,
          target_tags: targetSegment ? [targetSegment] : null,
          include_leads: audienceScope !== 'subscribers',
          audience_scope: audienceScope,
          behavior_filter: behaviorFilter,
          design_json: design, html_content: finalHtml,
          from_name: fromName || null,
          from_email: fromEmail || null,
          reply_to: replyTo || null,
          preview_text: previewText || null,
          scheduled_at: scheduleMode === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        };
        const res  = await adminFetch('/api/admin/campaigns', {
          method: selectedCampaignId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to save campaign');
        selectedCampaignIdRef.current = data.campaign.id;
        hydratedCampaignIdRef.current = data.campaign.id;
        setSelectedCampaignId(data.campaign.id);
        setAutosaveStatus('saved');
        setLastSavedAt(new Date());
        setStatusDetail(`${silent ? 'Autosaved' : 'Saved'} to server at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
        writeLocalSnapshot({ unsaved: false, source: silent ? 'autosave' : 'server-save' });
        // An autosave fires every few seconds while someone designs; refreshing
        // the whole campaign list each time would be a request per lull.
        if (!silent) fetchCampaigns();
        return true;
    } catch (err) {
      setAutosaveStatus('error');
      setStatusDetail(silent
        ? `Autosave failed: ${err.message}. Your draft is backed up in this browser — click Save draft to retry.`
        : `Save failed: ${err.message}. Your draft is still backed up in this browser; click Save draft to try again.`);
      writeLocalSnapshot({ unsaved: true, source: 'server-save-failed' });
      return false;
    } finally {
      setIsSaving(false);
      saveInFlightRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setAutosaveStatus('pending');
      }
    }
  };

  const saveCampaign = useCallback(async () => {
    if (!subject || (isABTest && !subjectB)) { notify('Enter the subject line before saving.', 'warning'); return; }
    if (scheduleMode === 'scheduled' && !scheduledAt) { notify('Pick a date and time for the scheduled send.', 'warning'); return; }
    await persistCampaign({ silent: false });
  }, [isABTest, notify, persistCampaign, scheduleMode, scheduledAt, subject, subjectB]);

  // The debounce timers fire long after the render that armed them, so they
  // read the current save through a ref rather than closing over a stale one.
  const persistCampaignRef = useRef(persistCampaign);
  const writeLocalSnapshotRef = useRef(writeLocalSnapshot);
  useEffect(() => {
    persistCampaignRef.current = persistCampaign;
    writeLocalSnapshotRef.current = writeLocalSnapshot;
  });

  /**
   * Autosave.
   *
   * The status indicator has said "Unsaved changes" since the builder shipped
   * and nothing ever acted on it: the only path to the server was the Save
   * draft button, and the local snapshot was only written on a manual save —
   * so the "your draft is backed up in this browser" reassurance was only true
   * after you had already saved. A closed tab lost the work.
   *
   * Two cadences. The browser snapshot is cheap and runs first, because a
   * crashed tab is what it is for. The server save waits for a real lull, and
   * only once the campaign has the fields the API demands — autosaving a
   * nameless draft would litter the campaign list.
   */
  useEffect(() => {
    if (autosaveStatus !== 'pending' || !isReady) return undefined;

    const localTimer = setTimeout(() => {
      writeLocalSnapshotRef.current?.({ unsaved: true, source: 'autosave' });
    }, AUTOSAVE_LOCAL_MS);

    const readyToPersist = campaignName.trim() && subject.trim()
      && (!isABTest || subjectB.trim())
      && (scheduleMode !== 'scheduled' || scheduledAt);

    const serverTimer = readyToPersist
      ? setTimeout(() => { persistCampaignRef.current?.({ silent: true }); }, AUTOSAVE_SERVER_MS)
      : null;

    return () => {
      clearTimeout(localTimer);
      if (serverTimer) clearTimeout(serverTimer);
    };
  }, [autosaveStatus, campaignName, isABTest, isReady, scheduleMode, scheduledAt, subject, subjectB]);

  // A tab closed mid-edit still leaves the browser copy behind to recover from.
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const persistBeforeUnload = () => { writeLocalSnapshotRef.current?.({ unsaved: true, source: 'unload' }); };
    window.addEventListener('pagehide', persistBeforeUnload);
    return () => window.removeEventListener('pagehide', persistBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      if (!isReady || isSaving) return;
      saveCampaign();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReady, isSaving, saveCampaign]);

  const handleEditorReady = (editor) => {
    setIsReady(true);
    editor.addEventListener('design:updated', () => {
      if (!suppressEditorUpdatesRef.current) markDraftDirty();
    });
  };

  const addDefaultFooterToCurrentDesign = () => {
    const editor = emailEditorRef.current?.editor;
    if (!editor || !isReady) return;

    editor.exportHtml(({ design }) => {
      const { design: designWithFooter, added } = appendMarketingFooterToDesign(design);
      if (!added) {
        setStatusDetail('This campaign already has the default footer. Click the footer block in the editor to edit it.');
        return;
      }

      suppressEditorUpdatesRef.current = true;
      editor.loadDesign(designWithFooter);
      setTimeout(() => { suppressEditorUpdatesRef.current = false; }, 800);
      markDraftDirty();
      setStatusDetail('Default footer added. Click the footer block in the editor if you want to edit the text or links.');
    });
  };

  const sendCampaign = async (isTestBatch = false) => {
    if (!selectedCampaignId) {
      const message = 'Cannot send yet: save this campaign as a draft first.';
      setStatusDetail(message);
      notify(message, 'warning');
      return;
    }
    if (!canSend) {
      const blockers = preflightItems.filter(item => !item.ok).map(item => item.errorLabel || item.label);
      const message = `Cannot send yet: ${blockers.join(', ')}.`;
      setStatusDetail(message);
      notify(message, 'warning');
      return;
    }

    try {
      const currentHtml = await new Promise((resolve, reject) => {
        try {
          const editor = emailEditorRef.current?.editor;
          if (!editor) throw new Error('The email editor is not ready. Reload the page and try again.');
          editor.exportHtml(({ html }) => resolve(html));
        } catch (error) {
          reject(error);
        }
      });
      const currentSignature = buildCampaignSignature(currentHtml);
      if (!lastTestedSignature || currentSignature !== lastTestedSignature) {
        const message = 'Cannot send yet: send a test email for this exact version first. The campaign changed after the last test.';
        setAutosaveStatus('pending');
        setStatusDetail(message);
        notify(message, 'warning');
        return;
      }

      const label = isTestBatch ? 'A/B test batch' : 'full campaign';
      const chosen = AUDIENCE_CHOICES.find((choice) => choice.id === audienceScope);
      const recipients = estimatedAudience.length;
      const confirmed = await confirm({
        title: `Send the ${label} to ${recipients.toLocaleString()} recipient${recipients === 1 ? '' : 's'}?`,
        message: behaviorFilter === 'none'
          ? (chosen?.label || audienceScope)
          : `${chosen?.label || audienceScope} — ${behaviorFilterLabel(behaviorFilter).toLowerCase()}`,
        detail: chosen?.hint ? `${chosen.hint}. Email cannot be recalled once the batch starts.` : 'Email cannot be recalled once the batch starts.',
        confirmLabel: isTestBatch ? 'Send test batch' : 'Send campaign',
        tone: 'danger',
      });
      if (!confirmed) return;

      setIsSending(true);
      setStatusDetail(`Sending ${label}... Keep this page open until the first batch is confirmed.`);
      const res  = await adminFetch('/api/admin/campaigns/send', {
        method: 'POST',
        body: JSON.stringify({
          campaign_id: selectedCampaignId,
          is_test_batch: isTestBatch,
          // The audience radio and tag live in local state until "Save draft".
          // Send them with the request so delivery targets exactly the audience
          // this dialog just promised, saved or not.
          audience_scope: audienceScope,
          include_leads: audienceScope !== 'subscribers',
          behavior_filter: behaviorFilter,
          target_tags: targetSegment ? [targetSegment] : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send');
      const progressText = data.remaining > 0
        ? `${data.message} The cron job will continue the remaining batches.`
        : data.message || 'Campaign sending complete.';
      notify(progressText, 'success');
      setStatusDetail(progressText);
      fetchCampaigns();
    } catch (err) {
      const message = `Failed to send: ${err.message}`;
      setStatusDetail(message);
      notify(message, 'error');
    } finally {
      setIsSending(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail.trim()) {
      setStatusDetail('Enter a test email address before sending a private preview.');
      return;
    }
    setIsSendingTest(true);
    emailEditorRef.current.editor.exportHtml(async ({ html }) => {
      try {
        const signature = buildCampaignSignature(html);
        const res = await adminFetch('/api/admin/send-email', {
          method: 'POST',
          body: JSON.stringify({
            to: testEmail.trim(),
            subject: subject || 'Test Campaign',
            html_content: html,
            test_mode: true,
            default_first_name: defaultFirstName.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.details || data.error || 'Failed to send test');
        setLastTestedSignature(signature);
        setLastTestSentAt(new Date());
        setStatusDetail(`Test email sent to ${testEmail.trim()} at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Full send is now unlocked for this version.`);
      } catch (err) {
        setStatusDetail(`Test email failed: ${err.message}`);
      } finally {
        setIsSendingTest(false);
      }
    });
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
          <strong>Mobile setup mode</strong>
          <span>Choose a template and prepare the campaign here. Use a larger screen for drag-and-drop design.</span>
        </div>
      </div>

      <div className="mkt-builder-savebar" role="region" aria-label="Campaign save controls">
        <div className="mkt-builder-savebar-status">
          <span className={`mkt-autosave-status ${autosaveStatus}`} role="status" aria-live="polite">
            {autosaveStatus === 'saving' || isSaving ? <Loader2 size={13} className="animate-spin" /> : autosaveStatus === 'error' ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
            {saveStatusText}
          </span>
          <small>{hasUnsavedChanges ? 'Autosaving as you work. Cmd/Ctrl+S saves immediately.' : 'Use Cmd/Ctrl+S to save without leaving the editor.'}</small>
        </div>
        <div className="mkt-builder-savebar-actions">
          <button onClick={openPreview} disabled={!isReady} className="mkt-btn">
            <Eye size={14} /> Preview
          </button>
          <button onClick={saveCampaign} disabled={!isReady || isSaving} className="mkt-btn mkt-btn-primary">
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save draft <kbd>⌘S</kbd>
          </button>
        </div>
      </div>

      {/* ══ CONFIG PANEL ══ */}
      <div className="mkt-builder-config">

        {/* Keep test sending obvious without duplicating the save/preview actions below. */}
        <div className="mkt-builder-quick-actions">
          <div className="mkt-builder-quick-copy">
            <span className="mkt-builder-quick-kicker"><TestTube2 size={13} /> Test before sending</span>
            <strong>Send a private preview</strong>
            <small>Check the real inbox layout before sending to subscribers.</small>
            <span className={`mkt-autosave-status ${autosaveStatus}`} role="status" aria-live="polite">
              {autosaveStatus === 'saving' || isSaving ? <Loader2 size={12} className="animate-spin" /> : autosaveStatus === 'error' ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
              {saveStatusText}
            </span>
            {statusDetail && <small>{statusDetail}</small>}
            {lastTestSentAt && (
              <small style={{ color: '#34d399' }}>
                Current version tested {lastTestSentAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </small>
            )}
          </div>

          <div className="mkt-builder-quick-controls">
            <div className="mkt-quick-test">
              <Mail size={15} aria-hidden="true" />
              <input
                type="text"
                inputMode="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && isReady && testEmail.trim() && !isSendingTest) sendTestEmail();
                }}
                placeholder="name@example.com"
                aria-label="Test email recipients"
              />
              <input
                type="text"
                value={defaultFirstName}
                onChange={e => setDefaultFirstName(e.target.value)}
                placeholder="Default name (e.g. Cliente)"
                aria-label="Default first name when a contact has no name on file"
                title="Used to fill the name merge tag when a contact has no name. Leave empty to show no name."
                style={{ maxWidth: '190px' }}
              />
              <button
                type="button"
                onClick={sendTestEmail}
                disabled={isSendingTest || !isReady || !testEmail.trim()}
              >
                {isSendingTest ? <Loader2 size={15} className="animate-spin" /> : <SendHorizonal size={15} />}
                {isSendingTest ? 'Sending…' : 'Send test email'}
              </button>
            </div>
          </div>

          <p className="mkt-builder-quick-help">
            Sent immediately with <strong>[TEST]</strong> in the subject. Separate multiple addresses with commas.
          </p>
        </div>

        {/* Template picker */}
        <Section title="1. Choose a Template" icon={LayoutTemplate} defaultOpen={showTemplates}>
          <div className="mkt-template-toolbar">
            <div>
              <strong>Start with a proven layout</strong>
              <span>You can change every block in the editor.</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" className="mkt-ai-toggle" onClick={() => setShowAiAssistant(value => !value)} aria-expanded={showAiAssistant}>
                <Sparkles size={15} /> {showAiAssistant ? 'Hide AI writer' : 'Create with AI'}
              </button>
              <button
                type="button"
                className="mkt-ai-toggle"
                onClick={() => { setShowTemplateSave(value => !value); setTemplateName(current => current || campaignName.trim()); }}
                aria-expanded={showTemplateSave}
                disabled={!isReady}
                title="Keep this design as a reusable starting point"
              >
                <Save size={15} /> Save as template
              </button>
            </div>
          </div>

          {showTemplateSave && (
            <div className="mkt-ai-assistant">
              <label className="mkt-label" htmlFor="mkt-template-name">
                <Save size={15} /> Name this template
              </label>
              <div className="mkt-ai-assistant-controls">
                <input
                  id="mkt-template-name"
                  className="mkt-input"
                  value={templateName}
                  onChange={event => setTemplateName(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter' && !isSavingTemplate) saveAsTemplate(); }}
                  placeholder="Monthly restock announcement"
                  maxLength={80}
                />
                <button
                  type="button"
                  className="mkt-btn mkt-btn-primary"
                  onClick={saveAsTemplate}
                  disabled={isSavingTemplate || !templateName.trim()}
                >
                  {isSavingTemplate ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {isSavingTemplate ? 'Saving…' : 'Save template'}
                </button>
              </div>
              <small className="mkt-text-xs mkt-text-muted">
                The design and subject line are kept. Audience, tags and schedule are not — those belong to a campaign, not a layout.
              </small>
            </div>
          )}

          {showAiAssistant && (
          <div className="mkt-ai-assistant">
            <label className="mkt-label">
              <Sparkles size={15} /> Describe the email you want
            </label>
            <div className="mkt-ai-assistant-controls">
              <textarea 
                className="mkt-input"
                placeholder="Example: A friendly BPC-157 promotion focused on recovery, with one clear catalog button."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <button 
                className="mkt-btn" 
                onClick={generateAITemplate}
                disabled={isGeneratingAI || !aiPrompt.trim()}
              >
                {isGeneratingAI ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isGeneratingAI ? 'Creating…' : 'Create template'}
              </button>
            </div>
          </div>
          )}

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

          {savedTemplates.length > 0 && (
            <>
              <div className="mkt-template-toolbar" style={{ marginTop: '18px' }}>
                <div>
                  <strong>Your saved templates</strong>
                  <span>Designs you kept from an earlier campaign.</span>
                </div>
              </div>
              <div className="mkt-template-grid">
                {savedTemplates.map(tpl => (
                  <div key={tpl.id} className={`mkt-template-card mkt-template-saved ${selectedTemplate === tpl.id ? 'selected' : ''}`}>
                    <button
                      type="button"
                      onClick={() => applyTemplate({
                        id: tpl.id,
                        name: tpl.name,
                        subject: tpl.subject_line || '',
                        design: tpl.design_json,
                      })}
                    >
                      <div className="mkt-template-icon">{tpl.icon || '💾'}</div>
                      <div className="mkt-template-name">{tpl.name}</div>
                      <div className="mkt-template-desc">{tpl.description || 'Saved design'}</div>
                    </button>
                    <button
                      type="button"
                      className="mkt-template-delete"
                      onClick={() => deleteSavedTemplate(tpl)}
                      aria-label={`Delete template ${tpl.name}`}
                      title="Delete this template"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>

        {/* Campaign settings */}
        <Section title="2. Content Settings" icon={Layers} defaultOpen>
          <div className="mkt-content-grid">
            <div className="mkt-input-group">
              <label className="mkt-label">Campaign name <span>Only your team sees this</span></label>
              <input type="text" value={campaignName} onChange={e => updateDraftField(setCampaignName, e.target.value)} className="mkt-input" />
            </div>
            <div className="mkt-input-group">
              <label className="mkt-label">Audience tag <span>Optional · blank sends to everyone selected below</span></label>
              <div style={{ position: 'relative' }}>
                <Tag size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                <input type="text" value={targetSegment} onChange={e => updateDraftField(setTargetSegment, e.target.value)} placeholder="All selected recipients" className="mkt-input" style={{ paddingLeft: '32px' }} />
              </div>
            </div>
          </div>

          <fieldset style={{ margin: '4px 0 18px', padding: '14px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', background: 'rgba(255,255,255,0.025)' }}>
            <legend className="mkt-label" style={{ padding: '0 6px' }}>Campaign recipients</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {AUDIENCE_CHOICES.map((choice) => {
                const active = audienceScope === choice.id;
                return (
                  <label
                    key={choice.id}
                    style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px', border: `1px solid ${active ? choice.activeBorder : 'rgba(255,255,255,0.08)'}`, borderRadius: '8px', cursor: 'pointer', background: active ? choice.activeBackground : 'transparent' }}
                  >
                    <input
                      type="radio"
                      name="campaignAudience"
                      checked={active}
                      onChange={() => updateDraftField(setAudienceScope, choice.id)}
                      style={{ marginTop: '3px', accentColor: choice.accent }}
                    />
                    <span>
                      <strong style={{ display: 'block', color: '#f8fafc', fontSize: '13px' }}>{choice.label}</strong>
                      <small style={{ color: '#94a3b8' }}>{audienceCounts[choice.id]} recipient{audienceCounts[choice.id] === 1 ? '' : 's'} &middot; {choice.hint}</small>
                    </span>
                  </label>
                );
              })}
            </div>
            <p style={{ margin: '10px 0 0', color: '#94a3b8', fontSize: '11px', lineHeight: 1.5 }}>
              Lead emails are added to Subscribers with the <code>crm_lead</code> tag when the campaign sends. Existing unsubscribes, duplicate emails, and globally blocked addresses are skipped.
            </p>

            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <label className="mkt-label" htmlFor="mkt-behavior-filter" style={{ marginBottom: '8px' }}>
                Narrow by behaviour <span style={{ fontWeight: 'normal', opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </label>
              <select
                id="mkt-behavior-filter"
                className="mkt-input"
                value={behaviorFilter}
                onChange={e => updateDraftField(setBehaviorFilter, e.target.value)}
                style={{ maxWidth: '340px', margin: 0 }}
              >
                {BEHAVIOR_FILTERS.map(filter => (
                  <option key={filter.id} value={filter.id}>{filter.label} — {filter.hint}</option>
                ))}
              </select>
              <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '11px', lineHeight: 1.5 }}>
                {behaviorFilter === 'none'
                  ? 'Everybody in the group above receives this campaign.'
                  : behaviorEstimateUnavailable
                    ? 'This filter is applied when the campaign sends. The count above cannot preview it for this group.'
                    : `${estimatedAudience.length.toLocaleString()} of ${scopedAudience.length.toLocaleString()} in the group above match.${behaviorEstimateApproximate ? ' Approximate — history was read in part. The send applies the filter in full.' : ''}`}
              </p>
            </div>
          </fieldset>

          {/* Subject lines */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' }}>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px', marginBottom: 0 }}>
              <label className="mkt-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Email subject {isABTest ? '(version A) *' : '*'}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'normal', fontSize: '11px', color: '#34d399', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
                  <input type="checkbox" checked={isABTest} onChange={e => updateDraftField(setIsABTest, e.target.checked)} style={{ accentColor: '#10b981' }} />
                  Test two subjects
                </label>
              </label>
              <input type="text" value={subject} onChange={e => updateDraftField(setSubject, e.target.value)} placeholder="Hi [FIRST_NAME], big news…" className="mkt-input" />
            </div>
            {isABTest && (
              <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px', marginBottom: 0 }}>
                <label className="mkt-label">Subject Line B *</label>
                <input type="text" value={subjectB} onChange={e => updateDraftField(setSubjectB, e.target.value)} placeholder="Don't miss this, [FIRST_NAME]!" className="mkt-input" />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px' }}>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '280px', marginBottom: 0 }}>
              <label className="mkt-label">Inbox preview text <span style={{ fontWeight: 'normal', opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(appears beside the subject)</span></label>
              <input type="text" value={previewText} onChange={e => updateDraftField(setPreviewText, e.target.value)} placeholder="A short preheader summary that appears in the inbox…" className="mkt-input" />
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
              <label className="mkt-label">Display name <span style={{ fontWeight: 'normal', opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(shown to subscribers)</span></label>
              <input type="text" value={fromName} onChange={e => updateDraftField(setFromName, e.target.value)} placeholder="Costa Peptides" className="mkt-input" />
            </div>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px' }}>
              <label className="mkt-label">Actual SMTP sender <span style={{ fontWeight: 'normal', opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(verified)</span></label>
              <div style={{ position: 'relative' }}>
                <AtSign size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                <input type="text" value={ACTUAL_SMTP_SENDER} disabled className="mkt-input" style={{ paddingLeft: '32px', opacity: 0.65 }} />
              </div>
            </div>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px' }}>
              <label className="mkt-label">Reply-To Email <span style={{ fontWeight: 'normal', opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <div style={{ position: 'relative' }}>
                <AtSign size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                <input type="email" value={replyTo} onChange={e => updateDraftField(setReplyTo, e.target.value)} placeholder="Same as from email" className="mkt-input" style={{ paddingLeft: '32px' }} />
              </div>
            </div>
          </div>
          <div className="mkt-sender-clarity" style={{ marginTop: '12px', padding: '12px 14px', border: '1px solid rgba(56,189,248,0.18)', borderRadius: '8px', background: 'rgba(56,189,248,0.06)', color: '#cbd5e1', fontSize: '12px', lineHeight: 1.6 }}>
            <div><strong style={{ color: '#fff' }}>Display name:</strong> {fromName || 'Costa Peptides'}</div>
            <div><strong style={{ color: '#fff' }}>Reply-to:</strong> {replyTo || ACTUAL_SMTP_SENDER}</div>
            <div><strong style={{ color: '#fff' }}>Actual SMTP sender:</strong> {ACTUAL_SMTP_SENDER}</div>
          </div>

          {/* Schedule */}
          <div style={{ marginTop: '16px', padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <label className="mkt-label" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CalendarClock size={14} style={{ color: '#34d399' }} /> Send Timing
            </label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: scheduleMode === 'now' ? '#34d399' : 'rgba(255,255,255,0.5)' }}>
                <input type="radio" name="scheduleMode" value="now" checked={scheduleMode === 'now'} onChange={() => updateDraftField(setScheduleMode, 'now')} style={{ accentColor: '#10b981' }} />
                Send immediately
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: scheduleMode === 'scheduled' ? '#38bdf8' : 'rgba(255,255,255,0.5)' }}>
                <input type="radio" name="scheduleMode" value="scheduled" checked={scheduleMode === 'scheduled'} onChange={() => updateDraftField(setScheduleMode, 'scheduled')} style={{ accentColor: '#38bdf8' }} />
                Schedule for later
              </label>
              {scheduleMode === 'scheduled' && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => updateDraftField(setScheduledAt, e.target.value)}
                  className="mkt-input"
                  style={{ maxWidth: '240px', margin: 0 }}
                  min={new Date().toISOString().slice(0, 16)}
                />
              )}
            </div>
          </div>

        </Section>

        {/* Preflight + actions */}
        <div className="mkt-command-grid mkt-builder-preflight" style={{ marginBottom: 0 }}>
          {/* Removed Library Panel */}

          {/* Preflight */}
          <div className="mkt-panel">
            <div className="mkt-panel-header">
              <div>
                <div className="mkt-panel-kicker">Final check</div>
                <h3 className="mkt-panel-title">
                  <span className="mkt-audience-count" style={{ marginBottom: 0 }}>
                    <span>{estimatedAudience.length}</span> eligible recipient{estimatedAudience.length === 1 ? '' : 's'}
                  </span>
                </h3>
                {selectedCampaignId && (
                  <div className="mkt-text-xs mkt-text-muted" style={{ marginTop: '6px' }}>
                    Sent counter: {selectedCampaignSentCount.toLocaleString()} / {estimatedAudience.length.toLocaleString()}
                  </div>
                )}
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
            <div className="mkt-preflight-actions">
              <button type="button" onClick={openPreview} disabled={!isReady} className="mkt-btn mkt-review-action" style={{ flex: '1 1 auto' }}>
                <Eye size={14} /> Review email
              </button>
              <button type="button" onClick={saveCampaign} disabled={!isReady || isSaving} className="mkt-btn mkt-btn-primary mkt-save-action" style={{ flex: '1 1 auto' }}>
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save draft
              </button>
              {activeCampaignIsABTest && (
                <button type="button" onClick={() => sendCampaign(true)} disabled={!isReady || isSending || !selectedCampaign?.is_ab_test} className="mkt-btn mkt-btn-warning" style={{ flex: '1 1 auto' }}>
                  <Send size={14} /> Test 20%
                </button>
              )}
              <button
                type="button"
                onClick={() => sendCampaign(false)}
                disabled={!isReady || isSending || !selectedCampaignId || selectedCampaign?.status === 'testing'}
                className="mkt-btn mkt-btn-danger"
                style={{ flex: '1 1 auto' }}
                title={selectedCampaign?.status === 'testing' ? 'Pick A/B winner from Analytics first.' : 'Send to full list'}
              >
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send campaign
              </button>
            </div>
            {statusDetail && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  marginTop: '10px',
                  padding: '10px 12px',
                  border: `1px solid ${statusDetail.toLowerCase().includes('fail') || statusDetail.toLowerCase().includes('cannot') || statusDetail.toLowerCase().includes('blocked') ? 'rgba(248,113,113,0.35)' : 'rgba(52,211,153,0.3)'}`,
                  background: statusDetail.toLowerCase().includes('fail') || statusDetail.toLowerCase().includes('cannot') || statusDetail.toLowerCase().includes('blocked') ? 'rgba(127,29,29,0.16)' : 'rgba(6,78,59,0.16)',
                  color: '#e2e8f0',
                  borderRadius: '6px',
                  fontSize: '12px',
                  lineHeight: 1.5,
                }}
              >
                {statusDetail}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ EMAIL EDITOR ══ */}
      <div className="mkt-editor-heading">
        <div><span>4</span><div><strong>Design your email</strong><small>Drag blocks into the canvas and edit the content directly.</small></div></div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" onClick={addDefaultFooterToCurrentDesign} disabled={!isReady} className="mkt-btn">
            <CopyPlus size={14} /> Add default footer
          </button>
          <button type="button" onClick={openPreview} disabled={!isReady} className="mkt-btn"><Eye size={14} /> Preview</button>
        </div>
      </div>
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
            onReady={handleEditorReady}
            minHeight="640px"
            options={{ 
              devices: ['desktop', 'mobile'],
              features: { 
                preheaderText: true, 
                colorPicker: true,
                textEditor: { backgroundColor: true, textColor: true },
              } 
            }}
          />
        </div>
      </div>

      <div className="mkt-mobile-actions" aria-label="Campaign actions">
        <button onClick={openPreview} disabled={!isReady} className="mkt-btn"><Eye size={15} /> Preview</button>
        <button onClick={saveCampaign} disabled={!isReady || isSaving} className="mkt-btn mkt-btn-primary">
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save draft
        </button>
      </div>

      {/* ══ PREVIEW MODAL ══ */}
      {previewHtml && (
        <div className="mkt-preview-modal">
          <div className="mkt-preview-toolbar">
            <span className="mkt-preview-label">Preview</span>
            <button 
              type="button"
              onClick={() => setDeviceMode('desktop')}
              className={`mkt-preview-mode${deviceMode === 'desktop' ? ' active' : ''}`}
              aria-pressed={deviceMode === 'desktop'}
            >
              <Monitor size={16} /> Desktop
            </button>
            <button 
              type="button"
              onClick={() => setDeviceMode('mobile')}
              className={`mkt-preview-mode${deviceMode === 'mobile' ? ' active' : ''}`}
              aria-pressed={deviceMode === 'mobile'}
            >
              <Smartphone size={16} /> Mobile
            </button>
            <span className="mkt-preview-size">
              {deviceMode === 'mobile'
                ? `${MOBILE_PREVIEW_WIDTH} x ${MOBILE_PREVIEW_HEIGHT} viewport`
                : `${EMAIL_TEMPLATE_WIDTH}px template width`}
            </span>
            <button 
              type="button"
              onClick={() => setPreviewHtml(null)}
              className="mkt-preview-close"
              aria-label="Close preview"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mkt-preview-stage">
            <div className={`mkt-preview-device is-${deviceMode}`}>
              {deviceMode === 'mobile' && <div className="mkt-preview-notch" />}
              <iframe
                title="Email Preview"
                srcDoc={previewHtml}
                className="mkt-preview-iframe"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
