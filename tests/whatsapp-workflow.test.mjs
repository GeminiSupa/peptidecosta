import assert from 'node:assert/strict';
import test from 'node:test';

import {
  conversationNeedsHumanReply,
  extractWhatsAppAdAttribution,
  mergeWhatsAppLeadQualification,
  sanitizeWhatsAppLabels,
  sanitizeWhatsAppPriority,
  viewerHasUnread,
} from '../src/lib/whatsappWorkflow.mjs';

test('click-to-WhatsApp referral metadata becomes CRM attribution', () => {
  const result = extractWhatsAppAdAttribution({
    referral: {
      source_id: '120123456',
      source_url: 'https://facebook.com/ads/example',
      source_type: 'ad',
      headline: 'Peptide offer',
      ctwa_clid: 'click-123',
    },
  });

  assert.equal(result.leadSource, 'whatsapp_ad');
  assert.equal(result.utmSource, 'meta');
  assert.equal(result.utmMedium, 'paid_social');
  assert.equal(result.details.source_id, '120123456');
  assert.equal(result.details.ctwa_clid, 'click-123');
});

test('ordinary WhatsApp messages do not invent ad attribution', () => {
  assert.equal(extractWhatsAppAdAttribution({ text: { body: 'hello' } }), null);
});

test('ad details merge without deleting existing qualification answers', () => {
  const merged = mergeWhatsAppLeadQualification(
    { language: 'es', whatsapp_ad: { source_id: 'old' } },
    { details: { source_id: 'new', headline: 'Offer' } },
  );
  assert.deepEqual(merged, {
    language: 'es',
    whatsapp_ad: { source_id: 'new', headline: 'Offer' },
  });
});

test('workflow labels and priority only accept supported values', () => {
  assert.deepEqual(
    sanitizeWhatsAppLabels(['important', 'Follow Up', 'Follow Up', 'made up']),
    ['Important', 'Follow Up'],
  );
  assert.equal(sanitizeWhatsAppPriority('URGENT'), 'urgent');
  assert.equal(sanitizeWhatsAppPriority('made up'), 'normal');
});

test('AI or other outbound activity cannot clear human attention', () => {
  assert.equal(conversationNeedsHumanReply({ needs_human_reply: true, last_outbound_at: '2026-08-20T10:05:00Z' }), true);
  assert.equal(conversationNeedsHumanReply({ status: 'resolved', needs_human_reply: true }), false);
  assert.equal(conversationNeedsHumanReply({
    last_inbound_at: '2026-08-20T10:00:00Z',
    last_human_outbound_at: '2026-08-20T09:00:00Z',
  }), true);
});

test('unread is per viewer and manual unread wins', () => {
  assert.equal(viewerHasUnread({
    last_inbound_at: '2026-08-20T10:00:00Z',
    viewer_last_seen_at: '2026-08-20T10:01:00Z',
  }), false);
  assert.equal(viewerHasUnread({
    last_inbound_at: '2026-08-20T10:00:00Z',
    viewer_last_seen_at: '2026-08-20T10:01:00Z',
    viewer_manually_unread: true,
  }), true);
});
