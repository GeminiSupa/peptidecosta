export const DEFAULT_BROADCAST_EMAIL_SUBJECT = 'Flash Sale! Exclusive Offer Inside';

function channelsOf(broadcast) {
  return broadcast?.channels && typeof broadcast.channels === 'object'
    ? broadcast.channels
    : {};
}

function plainTextFromHtml(html) {
  return String(html || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** A useful one-line label without shipping full HTML in the polling response. */
export function broadcastListPreview(broadcast) {
  const channels = channelsOf(broadcast);
  const message = String(broadcast?.message || '').trim();
  const subject = String(channels.emailSubject || '').trim();
  const htmlText = plainTextFromHtml(channels.emailHtmlContent);
  const templateName = String(channels.whatsappTemplateName || '').trim();
  return (message || subject || htmlText || templateName || '').slice(0, 120);
}

/** The content needed by an admin to audit what a broadcast sent. */
export function broadcastMessageDetails(broadcast) {
  const channels = channelsOf(broadcast);
  const message = String(broadcast?.message || '');
  return {
    message,
    email: channels.email ? {
      subject: String(channels.emailSubject || DEFAULT_BROADCAST_EMAIL_SUBJECT),
      html: channels.emailHtmlContent ? String(channels.emailHtmlContent) : null,
      imageUrl: channels.emailImageUrl ? String(channels.emailImageUrl) : null,
    } : null,
    whatsapp: channels.whatsapp ? {
      templateName: channels.whatsappTemplateName ? String(channels.whatsappTemplateName) : null,
      language: String(channels.whatsappTemplateLanguage || 'es'),
      templateBody: channels.whatsappTemplateBody ? String(channels.whatsappTemplateBody) : null,
      parameterMode: channels.whatsappTemplateParamMode || null,
      parameters: Array.isArray(channels.whatsappTemplateParameters)
        ? channels.whatsappTemplateParameters.map((value) => String(value || ''))
        : [],
      greetingVariable: Boolean(channels.whatsappGreetingVariable),
    } : null,
  };
}

/** Find the wording of a historical template in Meta's already-loaded definitions. */
export function whatsappTemplateBodyFromDetails(details, name, language) {
  if (!name) return '';
  const wanted = String(language || 'es').toLowerCase();
  const sameName = (details || []).filter((template) => template?.name === name);
  const chosen = sameName.find((template) => String(template.language || '').toLowerCase() === wanted)
    || sameName.find((template) => String(template.language || '').toLowerCase().startsWith(wanted.slice(0, 2)))
    || sameName[0];
  return chosen?.components?.find((component) => component?.type === 'BODY')?.text || '';
}

export function fillWhatsAppTemplate(body, values = []) {
  return String(body || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (placeholder, index) => {
    const value = values[Number(index) - 1];
    return value === undefined || value === null || value === '' ? placeholder : String(value);
  });
}
