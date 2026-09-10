/**
 * The {{1}} value for a broadcast WhatsApp template.
 *
 * Meta rejects a template send whose parameter count does not match the approved
 * template, so a nameless contact still needs *something* readable in that slot.
 *
 * greetingVariable=true is for templates whose {{1}} carries the whole greeting
 * (e.g. "👋 {{1}} ¡GLP-1...") — a nameless contact then reads "¡Buenas!"
 * rather than an English "Customer" stranded in a Spanish message.
 * greetingVariable=false is the classic shape, where {{1}} is a bare first name
 * and the greeting is baked into the template (e.g. "¡Hola {{1}}!").
 *
 * This lived inside the scheduled-broadcast cron, while the send-now route kept
 * its own `firstName || 'Customer'`. The two drifted, so the panel's greeting
 * tickbox worked on a scheduled send and did nothing on an immediate one —
 * every nameless contact got the word "Customer" mid-Spanish. One copy now.
 */
export function buildTemplateParam(firstName, languageCode, greetingVariable, message = '', parameterMode = null) {
  const isEn = String(languageCode || 'es').toLowerCase().startsWith('en');
  // Meta rejects parameters containing newlines/tabs, so flatten defensively.
  const name = String(firstName || '').replace(/\s+/g, ' ').trim();
  const mode = ['name', 'greeting', 'message'].includes(parameterMode)
    ? parameterMode
    : (greetingVariable ? 'greeting' : 'name');

  if (mode === 'message') {
    const fallbackName = isEn ? 'Customer' : 'Cliente';
    return String(message || '')
      .replace(/\{\{\s*name\s*\}\}/gi, name || fallbackName)
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (mode === 'greeting') {
    if (name) return isEn ? `Hi ${name}` : `Hola ${name}`;
    return isEn ? 'Hello!' : '¡Buenas!';
  }
  return name || (isEn ? 'Customer' : 'Cliente');
}

/**
 * Body parameters in the exact order Meta approved them.
 *
 * Most legacy broadcast templates have one personalized field, which continues
 * to use buildTemplateParam above. Flexible offer templates can provide an
 * explicit ordered list instead (product, offer, end date, URL, etc.). Keeping
 * both shapes here prevents the send-now and scheduled processors drifting.
 */
export function buildTemplateParameters(
  firstName,
  languageCode,
  greetingVariable,
  message = '',
  parameterMode = null,
  explicitParameters = null,
) {
  if (parameterMode === 'custom' && Array.isArray(explicitParameters)) {
    return explicitParameters.map((value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 900));
  }

  return [buildTemplateParam(firstName, languageCode, greetingVariable, message, parameterMode)];
}
