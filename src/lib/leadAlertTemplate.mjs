/**
 * The body variables for the `alerta_nuevo_lead` WhatsApp template.
 *
 * Kept apart from the sending code so it can be tested without a Supabase client
 * or a Meta token. The order matters: Meta approved the template with six
 * numbered slots and matches them positionally, so a reordering here silently
 * relabels every field in the message an agent reads.
 */

/** Meta rejects a template whose variable resolves to empty, so nothing is blank. */
const fill = (value) => String(value ?? '').trim() || '-';

export const LEAD_ALERT_TEMPLATE_NAME = 'alerta_nuevo_lead';
export const LEAD_ALERT_TEMPLATE_LANGUAGE = 'es';
export const LEAD_ALERT_VARIABLE_COUNT = 6;

export function buildLeadAlertParameters({ name, qualification = {}, phone, dueAt } = {}) {
  // A deadline the agent can act on beats a timestamp: it is the whole reason
  // the alert is urgent. Without one, say so rather than printing a bare dash.
  const due = dueAt
    ? new Date(dueAt).toLocaleTimeString('en-US', {
      timeZone: 'America/Costa_Rica', hour: 'numeric', minute: '2-digit',
    })
    : 'lo antes posible';

  return [
    fill(name),                    // {{1}} Nombre
    fill(qualification.category),  // {{2}} Interes
    fill(qualification.location),  // {{3}} Entrega en
    fill(qualification.volume),    // {{4}} Volumen
    fill(phone),                   // {{5}} Telefono
    fill(due),                     // {{6}} Hora limite de respuesta
  ];
}
