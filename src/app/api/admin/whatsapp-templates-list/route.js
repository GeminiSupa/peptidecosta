import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: [] });
  if (auth.error) return auth.error;

  try {
    const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!WABA_ID || !ACCESS_TOKEN) {
      return NextResponse.json({ error: 'WhatsApp credentials not configured' }, { status: 500 });
    }

    const res = await fetch(`https://graph.facebook.com/v25.0/${WABA_ID}/message_templates?fields=name,status,language,components&limit=100`, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data.error?.message || 'Meta API error' }, { status: res.status });
    }

    const approved = (data.data || []).filter(t => t.status === 'APPROVED');
    // Deduplicate by name to avoid listing the same template multiple times if translated
    const uniqueNames = [...new Set(approved.map(t => t.name))];
    
    return NextResponse.json({ 
      templates: uniqueNames,
      details: approved
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
