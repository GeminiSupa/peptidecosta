import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPageAccessToken } from '@/lib/facebookPageToken';

// ─── Supabase client (service role for server writes) ───
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && (supabaseServiceKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
  : null;

// ─── Meta Credentials (env-only; no secrets hardcoded) ───
const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;
const PAGE_ID = process.env.MESSENGER_PAGE_ID || process.env.FACEBOOK_PAGE_ID || '';

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

    if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      console.log('[Messenger Webhook] ✅ Verification Successful');
      return new Response(challenge, { status: 200 });
    }

    console.warn('[Messenger Webhook] ❌ Verification failed: token mismatch or incorrect hub.mode');
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  } catch (err) {
    console.error('[Messenger Webhook] Handshake exception:', err);
    return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 });
  }
}

/**
 * POST Handler: Process real-time Meta events.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    console.log('[Messenger Webhook] 📩 Event Received:', JSON.stringify(body, null, 2));

    const PAGE_ACCESS_TOKEN = await getPageAccessToken();
    if (body.object === 'page') {
      const entries = body?.entry || [];
      
      for (const entry of entries) {
        // Optionally verify the page ID matches
        if (entry.id && entry.id !== PAGE_ID) {
          console.log(`[Messenger Webhook] Ignoring event for Page ID ${entry.id}`);
          continue;
        }

        const messagings = entry?.messaging || [];
        for (const msgEvent of messagings) {
          const senderId = msgEvent?.sender?.id;
          const messageText = msgEvent?.message?.text;
          const timestamp = msgEvent?.timestamp;

          if (senderId && messageText) {
            console.log(`[Messenger Webhook] 💬 Inbound Messenger Message from ${senderId}: "${messageText}"`);

            if (supabase) {
              // Attempt to resolve sender name via Profile API (optional, best effort)
              let senderName = 'Messenger User';
              try {
                if (PAGE_ACCESS_TOKEN) {
                  const profileRes = await fetch(`https://graph.facebook.com/${senderId}?fields=first_name,last_name&access_token=${PAGE_ACCESS_TOKEN}`);
                  if (profileRes.ok) {
                    const profileData = await profileRes.json();
                    senderName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'Messenger User';
                  }
                }
              } catch (profileErr) {
                console.warn('[Messenger Webhook] Failed to fetch Messenger profile:', profileErr);
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
      }
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    } else {
      return NextResponse.json({ status: 'not a page event' }, { status: 404 });
    }
  } catch (err) {
    console.error('[Messenger Webhook] ❌ Error processing payload:', err);
    // Still return 200 OK so Meta doesn't flag or suspend the webhook
    return NextResponse.json({ status: 'error logged' }, { status: 200 });
  }
}
