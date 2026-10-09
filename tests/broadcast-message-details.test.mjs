import test from 'node:test';
import assert from 'node:assert/strict';

import {
  broadcastListPreview,
  broadcastMessageDetails,
  fillWhatsAppTemplate,
  whatsappTemplateBodyFromDetails,
} from '../src/lib/broadcastMessageDetails.mjs';

test('HTML-only email broadcasts get a useful list preview and complete details', () => {
  const broadcast = {
    message: '',
    channels: {
      email: true,
      emailSubject: 'October offer',
      emailHtmlContent: '<html><body><h1>Private sale</h1><p>Today only</p></body></html>',
    },
  };
  assert.equal(broadcastListPreview(broadcast), 'October offer');
  assert.deepEqual(broadcastMessageDetails(broadcast).email, {
    subject: 'October offer',
    html: broadcast.channels.emailHtmlContent,
    imageUrl: null,
  });
});

test('WhatsApp history retains template metadata and fills its visible preview', () => {
  const details = broadcastMessageDetails({
    message: '',
    channels: {
      whatsapp: true,
      whatsappTemplateName: 'offer_v1',
      whatsappTemplateLanguage: 'es',
      whatsappTemplateParamMode: 'custom',
      whatsappTemplateParameters: ['Semaglutida', '20%'],
    },
  });
  const meta = [{
    name: 'offer_v1',
    language: 'es',
    components: [{ type: 'BODY', text: '{{1}} ahora con {{2}} de descuento.' }],
  }];
  const body = whatsappTemplateBodyFromDetails(meta, details.whatsapp.templateName, details.whatsapp.language);
  assert.equal(fillWhatsAppTemplate(body, details.whatsapp.parameters), 'Semaglutida ahora con 20% de descuento.');
});

test('saved WhatsApp template wording is returned for an immutable audit trail', () => {
  const details = broadcastMessageDetails({
    message: 'News',
    channels: {
      whatsapp: true,
      whatsappTemplateName: 'announcement',
      whatsappTemplateBody: 'Update: {{1}}',
      whatsappTemplateParamMode: 'message',
    },
  });
  assert.equal(details.whatsapp.templateBody, 'Update: {{1}}');
  assert.equal(details.message, 'News');
});
