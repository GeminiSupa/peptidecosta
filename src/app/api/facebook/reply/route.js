import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { recipientId, messageText } = await request.json();

    if (!recipientId || !messageText) {
      return NextResponse.json({ error: 'recipientId and messageText are required' }, { status: 400 });
    }

    const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (!PAGE_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'Facebook Page Access Token not configured' }, { status: 500 });
    }

    const fbUrl = `https://graph.facebook.com/v25.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    const payload = {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text: messageText }
    };

    const response = await fetch(fbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('[Facebook Reply Error]', responseData);
      return NextResponse.json({ error: responseData.error?.message || 'Failed to send message' }, { status: response.status });
    }

    return NextResponse.json({ success: true, data: responseData });
  } catch (error) {
    console.error('[Facebook Reply Exception]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
