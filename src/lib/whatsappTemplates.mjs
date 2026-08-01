export const APPROVED_WHATSAPP_AGENT_TEMPLATES = [
  {
    id: 'lead_contact_confirmation_v1:es',
    name: 'lead_contact_confirmation_v1',
    language: 'es',
    category: 'UTILITY',
    label: 'Confirmar solicitud',
    use: 'Lead nuevo',
    description: 'Confirma que recibimos su consulta y que un asesor respondera pronto.',
    body: 'Hola {{1}}, confirmamos que hemos recibido tu solicitud de informacion en Peptides Costa Rica. Estaremos en contacto contigo a la brevedad para brindarte asesoria.',
    variables: [
      { key: 'customerName', label: 'Nombre', fallback: 'Cliente' },
    ],
  },
  {
    id: 'abandoned_cart_recovery_v1:es',
    name: 'abandoned_cart_recovery_v1',
    language: 'es',
    category: 'MARKETING',
    label: 'Recuperar carrito',
    use: 'Carrito',
    description: 'Envio con nombre y link directo para completar el pedido.',
    body: 'Hola {{1}}, dejaste algunos productos en tu carrito en Peptides Costa Rica.\n\nTus productos seleccionados aun estan disponibles. Puedes completar tu pedido aqui:\n{{2}}\n\nSi tienes alguna pregunta antes de ordenar, nuestro equipo con gusto te ayuda.',
    variables: [
      { key: 'customerName', label: 'Nombre', fallback: 'Cliente' },
      { key: 'checkoutUrl', label: 'Link de carrito', fallback: 'https://catalog.peptidescostarica.net/catalog' },
    ],
  },
  {
    id: 'cart_recovery:es',
    name: 'cart_recovery',
    language: 'es',
    category: 'MARKETING',
    label: 'Carrito simple',
    use: 'Carrito',
    description: 'Recordatorio corto con link de checkout.',
    body: 'Hola! Notamos que dejaste algunos articulos en tu carrito en Peptides Costa Rica. Tuviste algun problema al completar tu pedido? Usa este enlace para finalizar tu compra: {{1}} Gracias!',
    variables: [
      { key: 'checkoutUrl', label: 'Link de checkout', fallback: 'https://catalog.peptidescostarica.net/catalog' },
    ],
  },
  {
    id: 'cart_recovery:en_US',
    name: 'cart_recovery',
    language: 'en_US',
    category: 'MARKETING',
    label: 'Cart recovery EN',
    use: 'Cart',
    description: 'Short English cart reminder with checkout link.',
    body: 'Hi! We noticed you left some items in your cart at Peptides Costa Rica. Did you have any issues completing your order? Use this link to complete your checkout: {{1}} Thanks!',
    variables: [
      { key: 'checkoutUrl', label: 'Checkout link', fallback: 'https://catalog.peptidescostarica.net/catalog' },
    ],
  },
  {
    id: 'catalog_welcome:es',
    name: 'catalog_welcome',
    language: 'es',
    category: 'MARKETING',
    label: 'Bienvenida catalogo',
    use: 'Catalogo',
    description: 'Invitacion simple al catalogo cuando no hay pedido o carrito.',
    body: 'Bienvenido a Peptides Costa Rica! Explora nuestro catalogo y descubre productos de investigacion premium.',
    variables: [],
  },
  {
    id: 'catalog_welcome:en_US',
    name: 'catalog_welcome',
    language: 'en_US',
    category: 'MARKETING',
    label: 'Catalog welcome EN',
    use: 'Catalog',
    description: 'Simple English catalog welcome.',
    body: 'Welcome to Peptides Costa Rica! Explore our catalog and discover premium research products.',
    variables: [],
  },
  {
    id: 'confirmacion_pedido_cliente_v2:es',
    name: 'confirmacion_pedido_cliente_v2',
    language: 'es',
    category: 'UTILITY',
    label: 'Confirmar pedido',
    use: 'Pedido',
    description: 'Confirmacion de pedido con detalle y total.',
    body: 'Hola {{1}},\n\nGracias por tu compra en Peptides Costa Rica.\n\nTu pedido {{2}} ha sido recibido correctamente.\nDetalles: {{3}}\nTotal: {{4}}\n\nPor favor, contacta a nuestro equipo al +50684046973 para mas detalles o si tienes alguna pregunta.\n\nNota: Este numero (+1) es un sistema automatizado y no recibe mensajes.',
    variables: [
      { key: 'customerName', label: 'Nombre', fallback: 'Cliente' },
      { key: 'orderNumber', label: 'Orden', fallback: 'WPCR' },
      { key: 'orderDetails', label: 'Detalles', fallback: 'Productos Peptides Costa Rica' },
      { key: 'orderTotal', label: 'Total', fallback: 'Por confirmar' },
    ],
  },
  {
    id: 'confirmacion_pedido_cliente_v2:en',
    name: 'confirmacion_pedido_cliente_v2',
    language: 'en',
    category: 'UTILITY',
    label: 'Order confirmation EN',
    use: 'Order',
    description: 'English order confirmation with details and total.',
    body: 'Hello {{1}},\n\nThank you for your purchase from Peptides Costa Rica.\n\nYour order {{2}} has been successfully received.\nDetails: {{3}}\nTotal: {{4}}\n\nPlease contact our team at +50684046973 for details or if you have any questions.\n\nNote: This number (+1) is an automated system and does not receive messages.',
    variables: [
      { key: 'customerName', label: 'Name', fallback: 'Customer' },
      { key: 'orderNumber', label: 'Order', fallback: 'WPCR' },
      { key: 'orderDetails', label: 'Details', fallback: 'Peptides Costa Rica products' },
      { key: 'orderTotal', label: 'Total', fallback: 'To confirm' },
    ],
  },
  {
    id: 'review_request_5_day:en',
    name: 'review_request_5_day',
    language: 'en',
    category: 'UTILITY',
    label: 'Review request EN',
    use: 'After order',
    description: 'English review request after a completed order.',
    body: "Hi {{1}}! It's been a few days since your Peptides Costa Rica order. We hope your research is going perfectly!\n\nIf you have a moment, we would greatly appreciate a review: {{2}}\n\nThanks!",
    variables: [
      { key: 'customerName', label: 'Name', fallback: 'Customer' },
      { key: 'reviewUrl', label: 'Review link', fallback: '' },
    ],
  },
];

export function getWhatsAppTemplateDefinition(templateId) {
  return APPROVED_WHATSAPP_AGENT_TEMPLATES.find((template) => template.id === templateId) || null;
}

export function buildWhatsAppTemplateComponents(template, values = {}) {
  const variables = Array.isArray(template?.variables) ? template.variables : [];
  if (!variables.length) return [];

  return [
    {
      type: 'body',
      parameters: variables.map((variable) => ({
        type: 'text',
        text: sanitizeTemplateParameter(values[variable.key] || variable.fallback),
      })),
    },
  ];
}

export function renderWhatsAppTemplateBody(template, values = {}) {
  if (!template?.body) return '';
  const variables = Array.isArray(template.variables) ? template.variables : [];
  return variables.reduce((body, variable, index) => {
    const token = new RegExp(`\\{\\{${index + 1}\\}\\}`, 'g');
    return body.replace(token, sanitizeTemplateParameter(values[variable.key] || variable.fallback));
  }, template.body);
}

export function sanitizeTemplateParameter(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
}
