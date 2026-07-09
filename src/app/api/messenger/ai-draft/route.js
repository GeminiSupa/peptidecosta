import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Drafts a suggested Messenger reply using the live catalog as context.
// Self-contained: the admin UI only sends the conversation, everything else is
// loaded here so the draft is accurate and grounded in real products.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export async function POST(request) {
  try {
    const { messages = [], contactName = 'Customer' } = await request.json();

    const GEMINI = process.env.GEMINI_API_KEY;
    const OPENAI = process.env.OPENAI_API_KEY;
    if (!GEMINI && !OPENAI) {
      return NextResponse.json({ error: 'AI is not configured on the server.' }, { status: 500 });
    }

    let catalog = '';
    if (supabase) {
      try {
        const { data: products } = await supabase
          .from('products')
          .select('product, category, price_usd, price_crc, status');
        if (products?.length) {
          catalog = 'Active Catalog:\n' + products
            .map((p) => `- ${p.product} (${p.category}, ${p.price_usd} USD / ${p.price_crc || 'N/A'} CRC, ${p.status})`)
            .join('\n');
        }
      } catch {
        // Draft without catalog rather than fail.
      }
    }

    const history = (messages || [])
      .map((m) => `${m.direction === 'inbound' ? contactName : 'Store'}: "${m.text || ''}"`)
      .join('\n');
    const latest = [...(messages || [])].reverse().find((m) => m.direction === 'inbound')?.text || '';

    const prompt = `You are the customer support agent for "Peptides Costa Rica" replying on Facebook Messenger.
Reply in the same language the customer used (Spanish or English; default to Spanish if unsure).
Be warm, professional, and helpful. Keep it concise and natural for chat.

${catalog}

Conversation so far:
${history}

Customer's latest message:
"${latest}"

Rules:
- Never invent products, prices, or claims. If something is not in the catalog above, say you will check with the team.
- Do not make medical, dosage, or human-use claims.
- Output ONLY the reply text to send, with no preamble or quotes.`;

    let text = '';
    if (OPENAI) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await r.json();
      if (!r.ok) return NextResponse.json({ error: data.error?.message || 'AI failed' }, { status: r.status });
      text = data.choices?.[0]?.message?.content || '';
    } else {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const data = await r.json();
      if (!r.ok) return NextResponse.json({ error: data.error?.message || 'AI failed' }, { status: r.status });
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    return NextResponse.json({ success: true, text: text.trim() });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
