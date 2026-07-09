import { NextResponse } from 'next/server';

// Fetches a Messenger user's real name + profile photo for a single conversation
// (called lazily when a thread is opened, so we avoid one lookup per contact).
const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const psid = searchParams.get('psid');

    if (!psid) {
      return NextResponse.json({ error: 'psid is required' }, { status: 400 });
    }
    if (!PAGE_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'Facebook Page Access Token not configured' }, { status: 500 });
    }

    const res = await fetch(
      `https://graph.facebook.com/v25.0/${psid}?fields=name,profile_pic&access_token=${PAGE_ACCESS_TOKEN}`,
      { cache: 'no-store' }
    );
    const data = await res.json();

    if (data.error) {
      // Profile lookups fail for comment-only threads; the UI falls back to initials.
      return NextResponse.json({ name: null, profilePic: null });
    }
    return NextResponse.json({ name: data.name || null, profilePic: data.profile_pic || null });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
