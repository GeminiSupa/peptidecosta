import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isProspectsTableMissing } from '@/lib/prospects.mjs';
import {
  buildOutreachPrompt,
  canContactProspect,
  normalizeOutreachChannel,
  parseDraftResponse,
  sanitizeOutreachDraft,
} from '@/lib/prospectOutreach.mjs';
import { PROSPECT_OUTREACH_FIELDS, getCalBookingBaseUrl, resolveBookingUrl } from '@/lib/prospectOutreachServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const OPENAI_MODEL = 'gpt-4o-mini';
const GEMINI_MODEL = 'gemini-flash-latest';

async function draftWithOpenAI(prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'AI drafting failed');
  return { text: data.choices?.[0]?.message?.content || '', model: OPENAI_MODEL };
}

async function draftWithGemini(prompt, apiKey) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'AI drafting failed');
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '', model: GEMINI_MODEL };
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    let requestBody;
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { prospectId, channel, language = 'auto' } = requestBody;
    const outreachChannel = normalizeOutreachChannel(channel);
    if (!prospectId) return NextResponse.json({ error: 'Prospect ID is required' }, { status: 400 });
    if (!outreachChannel) return NextResponse.json({ error: 'Choose email or WhatsApp' }, { status: 400 });

    if (!getCalBookingBaseUrl()) {
      return NextResponse.json({
        error: 'Set CAL_BOOKING_URL to your Cal.com event link before drafting outreach. Without it a message has nothing to book.',
      }, { status: 503 });
    }

    const openAiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!openAiKey && !geminiKey) {
      return NextResponse.json({ error: 'AI is not configured on the server.' }, { status: 503 });
    }

    const supabase = getSupabaseAdmin();
    const { data: prospect, error } = await supabase
      .from('sales_prospects')
      .select(PROSPECT_OUTREACH_FIELDS)
      .eq('id', prospectId)
      .single();

    if (isProspectsTableMissing(error)) {
      return NextResponse.json({ error: 'Run add-prospect-channel-permissions.sql and prospect-outreach-migration.sql first.', setupRequired: true }, { status: 503 });
    }
    if (error || !prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

    // Checked before the model is called: drafting a message we may not send
    // wastes tokens and invites someone to paste it out by hand.
    const permission = canContactProspect(prospect, outreachChannel);
    if (!permission.allowed) return NextResponse.json({ error: permission.reason }, { status: 403 });

    const bookingUrl = await resolveBookingUrl(supabase, prospect);
    const prompt = buildOutreachPrompt(prospect, {
      channel: outreachChannel,
      bookingUrl,
      language,
      permission,
    });

    const { text, model } = openAiKey
      ? await draftWithOpenAI(prompt, openAiKey)
      : await draftWithGemini(prompt, geminiKey);

    const draft = sanitizeOutreachDraft(parseDraftResponse(text), {
      channel: outreachChannel,
      bookingUrl,
      organizationName: prospect.organization_name,
    });

    if (!draft.body) return NextResponse.json({ error: 'The model returned an empty draft. Try again.' }, { status: 502 });

    return NextResponse.json({
      success: true,
      channel: outreachChannel,
      subject: draft.subject,
      body: draft.body,
      bookingUrl,
      recipient: permission.identity,
      model,
    });
  } catch (err) {
    console.error('[Prospect outreach] Draft failed:', err);
    return NextResponse.json({ error: err.message || 'Unable to draft outreach' }, { status: 500 });
  }
}
