const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

async function submitTemplate(name, category, language, components) {
  const url = `https://graph.facebook.com/v25.0/${WABA_ID}/message_templates`;
  const payload = {
    name,
    category,
    language,
    components,
  };
  console.log(`Submitting template: ${name} (${language})`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  console.log(data);
}

async function main() {
  // 3. Cart Recovery - EN
  await submitTemplate('cart_recovery', 'MARKETING', 'en_US', [
    { type: 'BODY', text: 'Hi! We noticed you left some items in your cart at Peptides Costa Rica 🧪. Did you have any issues completing your order? Use this link to complete your checkout: {{1}} Thanks!', example: { body_text: [['https://catalog.peptidescostarica.net/checkout?session_id=123']] } }
  ]);
  // 4. Cart Recovery - ES
  await submitTemplate('cart_recovery', 'MARKETING', 'es', [
    { type: 'BODY', text: '¡Hola! Notamos que dejaste algunos artículos en tu carrito en Peptides Costa Rica 🧪. ¿Tuviste algún problema al completar tu pedido? Usa este enlace para finalizar tu compra: {{1}} ¡Gracias!', example: { body_text: [['https://catalog.peptidescostarica.net/checkout?session_id=123']] } }
  ]);
}
main();
