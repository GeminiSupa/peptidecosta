import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import { resolveLeadOwner } from '@/lib/leadOwner';
import { writeDroppingMissingColumns } from '@/lib/optionalColumns.mjs';
import { rateLimit } from '@/lib/rateLimit.mjs';

// The storefront "Contáctenos" form. This replaced the WhatsApp CTAs, so it is
// now the only way a visitor who does not want to check out can reach the team
// from the landing page.
//
// It writes to `catalog_leads` (the CRM Leads tab) rather than
// `customer_inquiries` (the Inquiries tab), because these are sales leads an
// agent is meant to claim and work, not support tickets.

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);

// This is posted to from standalone ad landing pages, which are not served
// from this domain, so the browser needs CORS to let the request through.
// It is not a security control — anything can POST here with curl regardless —
// so the actual abuse protection is the per-IP rate limit below.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const withCors = (body, status = 200) => NextResponse.json(body, { status, headers: CORS_HEADERS });

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request) {
  try {
    // 20 leads per 10 minutes per IP. A real landing page sends one; this only
    // ever bites a script.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!rateLimit(`lead-contact:${ip}`, 20)) {
      return withCors({ error: 'rate_limited' }, 429);
    }

    const body = await request.json();
    const name = clean(body.name, 120);
    const email = clean(body.email, 200).toLowerCase();
    const phoneRaw = clean(body.phone, 40);
    const language = body.language === 'en' ? 'en' : 'es';
    const source = clean(body.source, 60) || 'contact_form';

    // Ad campaign tracking. catalog_leads has carried these columns all along
    // but nothing was filling them, so a lead from a paid ad was
    // indistinguishable from an organic one and the ad spend could not be
    // judged. An AdWords landing page passes them straight through.
    const utmSource = clean(body.utm_source ?? body.utmSource, 120);
    const utmMedium = clean(body.utm_medium ?? body.utmMedium, 120);
    const utmCampaign = clean(body.utm_campaign ?? body.utmCampaign, 120);
    const referrer = clean(body.referrer, 500) || request.headers.get('referer') || '';

    if (!name) {
      return withCors({ error: 'name_required' }, 400);
    }
    if (email && !EMAIL_RE.test(email)) {
      return withCors({ error: 'email_invalid' }, 400);
    }
    // Either channel is enough to follow up, but with neither there is no lead.
    const phone = phoneRaw ? cleanPhoneNumber(phoneRaw) : '';
    if (!email && !phone) {
      return withCors({ error: 'contact_required' }, 400);
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return withCors({ error: 'server_not_configured' }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Email is the more stable identity, so it wins as the dedupe key when the
    // visitor gives both. This matches how live chat saves its leads.
    const contactMethod = email ? 'email' : 'whatsapp';
    const contactValue = email || phone;

    const { data: existing } = await supabase
      .from('catalog_leads')
      .select('*')
      .eq('contact_value', contactValue)
      .maybeSingle();

    const nowIso = new Date().toISOString();

    // A returning customer goes back to the agent who first closed them. An
    // existing owner is never overwritten — an agent who already claimed this
    // lead outranks anything history says.
    const existingOwner = String(existing?.sales_agent || existing?.owner || existing?.assigned_to || '').trim();
    const owner = await resolveLeadOwner(supabase, {
      phone,
      email,
      existingOwner,
      label: 'leads/contact',
    });
    const historyAgent = existingOwner ? '' : owner;

    // catalog_leads has no name/email/phone columns on the live schema, so the
    // details are always written into `notes` as well. Otherwise an agent
    // opening the lead would see a bare phone number and no name.
    const note = [
      `Contáctenos form (${source})`,
      `Name: ${name}`,
      email ? `Email: ${email}` : null,
      phone ? `Phone (WhatsApp/SMS): ${phone}` : null,
      // Mirrored into the note as well, because `sales_agent` is dropped below
      // if the live table lacks the column — the owner must stay visible.
      historyAgent ? `Owner: ${historyAgent} (returning customer — first closed by this agent)` : null,
      utmCampaign || utmSource
        ? `Campaign: ${[utmSource, utmMedium, utmCampaign].filter(Boolean).join(' / ')}`
        : null,
    ].filter(Boolean).join('\n');

    const payload = {
      contact_method: contactMethod,
      contact_value: contactValue,
      language,
      // A returning contact keeps whatever stage an agent already moved them
      // to; only a genuinely new lead starts at 'New'.
      status: existing?.status && existing.status !== 'New' ? existing.status : 'New',
      notes: existing?.notes ? `${note}\n\n--- Previous CRM notes ---\n${existing.notes}` : note,
      // Written only if the column exists — see the optional list below.
      name: name || null,
      email: email || null,
      phone: phone || null,
      sales_agent: owner || null,
      updated_at: nowIso,
      // Only overwrite the campaign on a lead that actually arrived with one,
      // so a returning visitor coming in organically does not erase the ad
      // that originally won them.
      ...(utmSource ? { utm_source: utmSource } : {}),
      ...(utmMedium ? { utm_medium: utmMedium } : {}),
      ...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
      ...(referrer ? { referrer } : {}),
    };

    // These arrive via their own hand-run migrations (or not at all). Dropping
    // them individually keeps a lead from being lost to a schema gap, the same
    // way the team-member save handles admin_profiles.
    const optional = [
      'name', 'email', 'phone', 'sales_agent', 'updated_at',
      'utm_source', 'utm_medium', 'utm_campaign', 'referrer',
    ];

    const { error } = await writeDroppingMissingColumns(payload, optional, (row) => (
      existing
        ? supabase.from('catalog_leads').update(row).eq('id', existing.id)
        : supabase.from('catalog_leads').insert({ ...row, created_at: nowIso })
    ));
    if (error) throw error;

    return withCors({ success: true });
  } catch (err) {
    console.error('[leads/contact] failed:', err);
    return withCors({ error: 'save_failed' }, 500);
  }
}
