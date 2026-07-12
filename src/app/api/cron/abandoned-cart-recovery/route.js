import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canSendWhatsAppMarketing } from '@/lib/whatsappCompliance';

export const maxDuration = 60; // Vercel limit
export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Optional security: Ensure cron is called via secure cron secret in production
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    request.headers.get('x-vercel-cron') !== '1'
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Find carts abandoned > 30 minutes ago but < 24 hours ago
  // and have NOT been recovered, and have NOT had a whatsapp sent yet.
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: abandonedCarts, error } = await supabaseAdmin
    .from('abandoned_carts')
    .select('*')
    .eq('is_recovered', false)
    .eq('recovery_whatsapp_sent', false)
    .lt('created_at', thirtyMinsAgo)
    .gt('created_at', twentyFourHoursAgo);

  if (error) {
    console.error('Error fetching abandoned carts for cron:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!abandonedCarts || abandonedCarts.length === 0) {
    return NextResponse.json({ success: true, message: 'No carts require recovery at this time.' });
  }

  let sentCount = 0;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.costapeptides.com';

  let skippedNoConsent = 0;
  for (const cart of abandonedCarts) {
    // We can only send a recovery message if we captured a phone number
    if (!cart.customer_phone) continue;

    // Compliance gate: only message people who explicitly opted in to WhatsApp.
    // This is a marketing (promo) message, so it must never go to a non-opted-in
    // number — that is what gets the WhatsApp number flagged for spam.
    const gate = await canSendWhatsAppMarketing(supabaseAdmin, cart.customer_phone);
    if (!gate.ok) { skippedNoConsent++; continue; }

    // Build the recovery message
    let cartItemsText = "";
    try {
      const items = typeof cart.cart_data === 'string' ? JSON.parse(cart.cart_data) : cart.cart_data;
      if (Array.isArray(items)) {
        cartItemsText = items.map(item => `- ${item.product} (x${item.quantity})`).join('\\n');
      }
    } catch(e) {
      cartItemsText = "- Tus artículos seleccionados / Your selected items";
    }

    const isSpanish = (cart.customer_phone.startsWith('+506') || !cart.customer_phone.startsWith('+1'));
    
    // Recovery link with auto-fill query params
    const recoveryLink = `${baseUrl}/checkout?session_id=${cart.session_id}&recover=true`;

    const msg = isSpanish 
      ? `¡Hola! Notamos que dejaste algunos artículos en tu carrito en Peptides Costa Rica 🧪:\\n\\n${cartItemsText}\\n\\n¿Tuviste algún problema al completar tu pedido? Usa este enlace para finalizar tu compra y obtén un 5% de descuento extra en tu orden:\\n${recoveryLink}`
      : `Hi! We noticed you left some items in your cart at Peptides Costa Rica 🧪:\\n\\n${cartItemsText}\\n\\nDid you have any issues completing your order? Use this link to complete your checkout and get an extra 5% off your order:\\n${recoveryLink}`;

    // Send WhatsApp (using the existing WhatsApp sending API)
    try {
      // Internal fetch to our whatsapp/send API
      const waRes = await fetch(`${baseUrl}/api/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cart.customer_phone,
          message: msg
        })
      });

      if (waRes.ok) {
        // Mark as sent
        await supabaseAdmin
          .from('abandoned_carts')
          .update({
            recovery_whatsapp_sent: true,
            recovery_whatsapp_sent_at: new Date().toISOString()
          })
          .eq('id', cart.id);
        
        sentCount++;
      }
    } catch(err) {
      console.error(`Failed to send WhatsApp recovery to cart ${cart.id}:`, err);
    }
  }

  return NextResponse.json({
    success: true,
    processed: abandonedCarts.length,
    sent: sentCount,
    skippedNoConsent
  });
}
