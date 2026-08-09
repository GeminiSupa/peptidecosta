import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPageAccessToken } from '@/lib/facebookPageToken';
import { resolveLeadOwner } from '@/lib/leadOwner';

// ─── Supabase client (service role for server writes) ───
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && (supabaseServiceKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
  : null;

// ─── Meta Credentials ───
const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN;

/**
 * GET Handler: Verification handshake with Meta.
 * Meta calls this when you configure your Webhook in the Meta Developer Portal.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[Facebook Webhook] ✅ Verification Successful');
      return new Response(challenge, { status: 200 });
    }

    console.warn('[Facebook Webhook] ❌ Verification failed: token mismatch or incorrect hub.mode');
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  } catch (err) {
    console.error('[Facebook Webhook] Handshake exception:', err);
    return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 });
  }
}

/**
 * POST Handler: Process real-time Meta events.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    console.log('[Facebook Webhook] 📩 Event Received:', JSON.stringify(body, null, 2));

    const PAGE_ACCESS_TOKEN = await getPageAccessToken();
    const entries = body?.entry || [];

    for (const entry of entries) {
      // ─── A. Process Messaging (Messenger) Inbound Events ───
      const messagings = entry?.messaging || [];
      for (const msgEvent of messagings) {
        const senderId = msgEvent?.sender?.id;
        const messageText = msgEvent?.message?.text;
        const timestamp = msgEvent?.timestamp;

        if (senderId && messageText) {
          console.log(`[Facebook Webhook] 💬 Inbound Messenger Message from ${senderId}: "${messageText}"`);

          if (supabase) {
            // Attempt to resolve sender name via Profile API (optional, best effort)
            let senderName = 'Facebook User';
            try {
              if (PAGE_ACCESS_TOKEN) {
                const profileRes = await fetch(`https://graph.facebook.com/${senderId}?fields=first_name,last_name&access_token=${PAGE_ACCESS_TOKEN}`);
                if (profileRes.ok) {
                  const profileData = await profileRes.json();
                  senderName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'Facebook User';
                }
              }
            } catch (profileErr) {
              console.warn('[Facebook Webhook] Failed to fetch Messenger profile:', profileErr);
            }

            // Insert message alert into notification table
            await supabase.from('facebook_notifications').insert({
              type: 'message',
              sender_name: senderName,
              sender_id: senderId,
              content: messageText,
              raw_payload: msgEvent,
              external_link: `https://business.facebook.com/latest/inbox/messenger?selected_item_id=${senderId}`
            });
          }
        }
      }

      // ─── B. Process Changes Inbound Events (Lead Ads / Page Comments) ───
      const changes = entry?.changes || [];
      for (const change of changes) {
        const field = change?.field;
        const value = change?.value;
        if (!value) continue;

        // 1. Process Lead Ads Event
        if (field === 'leadgen') {
          const leadgenId = value?.leadgen_id;
          const formId = value?.form_id;
          const adId = value?.ad_id;

          console.log(`[Facebook Webhook] 🎯 Inbound Lead Ads event: leadgen_id=${leadgenId}`);

          if (leadgenId && PAGE_ACCESS_TOKEN && supabase) {
            try {
              // Call Meta Graph API to fetch lead details
              const leadRes = await fetch(`https://graph.facebook.com/v25.0/${leadgenId}?access_token=${PAGE_ACCESS_TOKEN}`);
              if (!leadRes.ok) {
                const errData = await leadRes.json();
                throw new Error(`Graph API returned error: ${JSON.stringify(errData)}`);
              }

              const leadData = await leadRes.json();
              console.log('[Facebook Webhook] 📋 Retrieved Lead Data:', JSON.stringify(leadData, null, 2));

              // Map lead fields (name, email, phone, etc.)
              let fullName = 'Facebook Prospect';
              let emailVal = '';
              let phoneVal = '';

              const fieldData = leadData?.field_data || [];
              for (const fieldObj of fieldData) {
                const name = fieldObj.name;
                const values = fieldObj.values || [];
                const val = values[0] || '';

                if (name === 'full_name' || name === 'name') fullName = val;
                else if (name === 'email') emailVal = val;
                else if (name === 'phone_number' || name === 'phone') phoneVal = val;
              }

              // A. Save to catalog_leads
              const contactMethod = emailVal ? 'email' : 'whatsapp';
              const contactValue = emailVal || phoneVal || `lead_${leadgenId}`;

              // Lead Ads give both fields when the form asks for both, so pass
              // each one through rather than guessing from contact_value.
              const salesAgent = await resolveLeadOwner(supabase, {
                phone: phoneVal,
                email: emailVal,
                label: 'facebook/webhook',
              });

              await supabase.from('catalog_leads').insert({
                contact_method: contactMethod,
                contact_value: contactValue.trim(),
                sales_agent: salesAgent || null,
                language: 'es', // default to ES
                utm_source: 'facebook_ads',
                utm_medium: 'lead_form',
                utm_campaign: leadData?.form_id || formId,
                referrer: 'Meta Lead Ads Form'
              });

              // B. Save notification alert to facebook_notifications
              await supabase.from('facebook_notifications').insert({
                type: 'lead',
                sender_name: fullName,
                sender_id: leadgenId,
                content: `New Facebook Lead Form submitted!\nForm ID: ${formId}\nAd ID: ${adId}`,
                email: emailVal || null,
                phone: phoneVal || null,
                raw_payload: leadData,
                external_link: `https://business.facebook.com/latest/leads_center`
              });

              console.log(`[Facebook Webhook] ✅ Lead processed successfully: ${fullName}`);
            } catch (leadErr) {
              console.error('[Facebook Webhook] ❌ Failed to fetch/save Lead Ads details:', leadErr);
              
              // Log a generic alert even if details fetch fails
              await supabase.from('facebook_notifications').insert({
                type: 'lead',
                sender_name: 'Lead Ad Event',
                sender_id: leadgenId,
                content: `A Lead Ad was submitted, but we failed to fetch details: ${leadErr.message}`,
                raw_payload: value
              });
            }
          }
        }

        // 2. Process Page Comments Event
        if (field === 'feed') {
          const itemType = value?.item; // 'comment'
          const verb = value?.verb; // 'add'
          const commentMessage = value?.message;
          const senderName = value?.sender_name;
          const commentId = value?.comment_id;
          const postId = value?.post_id;

          if (itemType === 'comment' && verb === 'add' && commentMessage) {
            console.log(`[Facebook Webhook] 💬 Post Comment from ${senderName}: "${commentMessage}"`);

            if (supabase) {
              await supabase.from('facebook_notifications').insert({
                type: 'comment',
                sender_name: senderName || 'Post Visitor',
                sender_id: commentId || postId,
                content: commentMessage,
                raw_payload: value,
                external_link: `https://facebook.com/${postId}`
              });
            }
          }
        }
      }
    }

    // Always respond quickly with 200 OK to keep Meta happy
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (err) {
    console.error('[Facebook Webhook] ❌ Error processing payload:', err);
    // Still return 200 OK so Meta doesn't flag or suspend the webhook
    return NextResponse.json({ status: 'error logged' }, { status: 200 });
  }
}
