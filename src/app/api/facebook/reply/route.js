import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getPageAccessToken } from '@/lib/facebookPageToken';

// Sends a Messenger reply from the Page — POLICY-AWARE.
//
// Meta's rule: a Page may send a standard message only within 24 HOURS of the
// customer's last inbound message. Outside that window, sends must use a message
// tag (HUMAN_AGENT allows human support replies up to 7 days, but the tag needs
// app-review approval). Violating the window repeatedly gets the Page's messaging
// restricted or removed — so we enforce it server-side instead of letting Meta
// rack up violations against the Page.
// Set FB_HUMAN_AGENT_ENABLED=1 ONLY after Meta approves the Human Agent
// permission for the app — sending the tag without approval fails anyway.
const HUMAN_AGENT_ENABLED = process.env.FB_HUMAN_AGENT_ENABLED === '1';

const HOUR = 60 * 60 * 1000;
const WINDOW_MS = 24 * HOUR;          // standard messaging window
const HUMAN_AGENT_MS = 7 * 24 * HOUR; // HUMAN_AGENT tag allowance

/** Map raw Meta error codes to messages an admin can act on. */
function friendlyMetaError(err) {
  const code = err?.code;
  const sub = err?.error_subcode;
  if (code === 10 || sub === 2018278) {
    return 'Meta blocked this send: the 24-hour reply window has closed (the customer must message you again first). Repeated attempts risk Page messaging restrictions.';
  }
  if (code === 551 || sub === 1545041) {
    return 'This person is unavailable — they may have blocked the Page or deactivated their account. Do not retry.';
  }
  if (code === 613 || code === 4 || code === 17 || code === 32) {
    return 'Meta rate limit hit. Slow down — wait a few minutes before sending more messages.';
  }
  if (code === 190) {
    return 'Facebook Page access token is invalid or expired. Renew it in Meta Business settings.';
  }
  return err?.message || 'Failed to send message';
}

export async function POST(request) {
  // Sending as the business Page is privileged — admin session required.
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { recipientId, messageText, imageUrl, lastInboundAt } = await request.json();

    if (!recipientId || (!messageText && !imageUrl)) {
      return NextResponse.json({ error: 'recipientId and either messageText or imageUrl are required' }, { status: 400 });
    }

    const PAGE_ACCESS_TOKEN = await getPageAccessToken();
    if (!PAGE_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'Facebook Page Access Token not configured' }, { status: 500 });
    }

    // ── 24h-window compliance (when the UI tells us the last inbound time) ──
    let messagingType = 'RESPONSE';
    let tag = null;
    if (lastInboundAt) {
      const age = Date.now() - new Date(lastInboundAt).getTime();
      if (Number.isFinite(age) && age > WINDOW_MS) {
        if (HUMAN_AGENT_ENABLED && age <= HUMAN_AGENT_MS) {
          messagingType = 'MESSAGE_TAG';
          tag = 'HUMAN_AGENT';
        } else {
          const hours = Math.round(age / HOUR);
          return NextResponse.json({
            error: `Reply window closed: the customer last wrote ${hours}h ago (limit is 24h). ` +
                   `Sending anyway would violate Meta policy and risk the Page being restricted. ` +
                   `Wait for them to message again${HUMAN_AGENT_ENABLED ? '' : ', or enable the Human Agent tag (7-day window) via Meta app review'}.`,
            windowClosed: true,
          }, { status: 422 });
        }
      }
    }

    const fbUrl = `https://graph.facebook.com/v25.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    const payload = {
      recipient: { id: recipientId },
      messaging_type: messagingType,
      ...(tag ? { tag } : {}),
      message: imageUrl
        ? { attachment: { type: 'image', payload: { url: imageUrl, is_reusable: true } } }
        : { text: messageText },
    };

    const response = await fetch(fbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('[Facebook Reply Error]', responseData);
      return NextResponse.json(
        { error: friendlyMetaError(responseData.error), metaCode: responseData.error?.code },
        { status: response.status }
      );
    }

    console.log(`[Facebook Reply] Sent to ${recipientId} (type: ${messagingType}${tag ? `/${tag}` : ''}) by ${auth.user?.email || 'admin'}`);
    return NextResponse.json({ success: true, data: responseData });
  } catch (error) {
    console.error('[Facebook Reply Exception]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
