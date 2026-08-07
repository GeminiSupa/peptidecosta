import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import { buildAgentNameResolver, lookupHistoricalAgent } from '@/lib/agentAttribution.mjs';
import { writeDroppingMissingColumns } from '@/lib/optionalColumns.mjs';

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

export async function POST(request) {
  try {
    const body = await request.json();
    const name = clean(body.name, 120);
    const email = clean(body.email, 200).toLowerCase();
    const phoneRaw = clean(body.phone, 40);
    const language = body.language === 'en' ? 'en' : 'es';
    const source = clean(body.source, 60) || 'contact_form';

    if (!name) {
      return NextResponse.json({ error: 'name_required' }, { status: 400 });
    }
    if (email && !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'email_invalid' }, { status: 400 });
    }
    // Either channel is enough to follow up, but with neither there is no lead.
    const phone = phoneRaw ? cleanPhoneNumber(phoneRaw) : '';
    if (!email && !phone) {
      return NextResponse.json({ error: 'contact_required' }, { status: 400 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
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
    let historyAgent = '';
    if (!existingOwner) {
      try {
        const { data: profiles } = await supabase.from('admin_profiles').select('name, email');
        const match = await lookupHistoricalAgent(supabase, {
          phone,
          email,
          // Some closed orders record an agent's email rather than their name;
          // both must resolve to the one agent.
          resolveAgent: buildAgentNameResolver(profiles),
        });
        historyAgent = match?.agent || '';
      } catch (attributionErr) {
        // Never lose the lead over attribution; an agent can still claim it.
        console.warn('[leads/contact] History attribution skipped:', attributionErr.message);
      }
    }
    const owner = existingOwner || historyAgent;

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
    };

    // These arrive via their own hand-run migrations (or not at all). Dropping
    // them individually keeps a lead from being lost to a schema gap, the same
    // way the team-member save handles admin_profiles.
    const optional = ['name', 'email', 'phone', 'sales_agent', 'updated_at'];

    const { error } = await writeDroppingMissingColumns(payload, optional, (row) => (
      existing
        ? supabase.from('catalog_leads').update(row).eq('id', existing.id)
        : supabase.from('catalog_leads').insert({ ...row, created_at: nowIso })
    ));
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[leads/contact] failed:', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
