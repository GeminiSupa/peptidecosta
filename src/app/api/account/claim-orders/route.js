import { NextResponse } from 'next/server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  CustomerSessionError,
  resolveCustomerOrderOwner,
} from '@/lib/customerOrderOwnership.mjs';
import {
  buildClaimBlocklist,
  buildCustomerProfileRow,
  isEmailClaimable,
  normalizeEmail,
  selectClaimableOrders,
} from '@/lib/customerAccount.mjs';
import { rememberOrderAddress } from '@/lib/accountAddress.mjs';
import { buildAccountWelcomeEmail } from '@/lib/accountSignInCode.mjs';
import { getOrderMailSettings } from '@/lib/transactionalSmtp';
import { getOrderEmailLogoAttachment } from '@/lib/orderEmailBranding.mjs';
import nodemailer from 'nodemailer';

// Step two of customer login: attach the account to its history.
//
// Runs on every successful sign-in, not only the first. A customer who created
// an account today may check out as a guest next month — on a phone, or before
// remembering they have a login — and those orders would otherwise be stranded
// forever. The pass is idempotent: it only ever touches orders that carry no
// owner yet.
//
// Claiming is deliberately email-only. Phone numbers are the primary identifier
// in this business and would match far more rows, but a phone number is never
// verified here, so matching on one would let anyone who knows a customer's
// number take their order history.

/** Escape LIKE metacharacters so an address cannot widen its own search. */
function escapeLikePattern(value) {
  return String(value).replace(/([\\%_])/g, '\\$1');
}

async function loadBlocklist(admin) {
  const { data, error } = await admin.from('order_claim_blocklist').select('email');
  if (error) throw error;
  return buildClaimBlocklist(data || []);
}

/**
 * Create the profile on first sign-in, and fill gaps on later ones.
 *
 * Never overwrites a name or phone the customer has since edited on
 * /account/profile — only null columns are backfilled from order history.
 */
async function ensureCustomerProfile(admin, { userId, email, orders, locale }) {
  const latest = [...(orders || [])].sort((a, b) => (
    new Date(b?.created_at || 0) - new Date(a?.created_at || 0)
  ))[0];

  const { data: existing } = await admin
    .from('customer_profiles')
    .select('user_id, display_name, phone')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    const row = buildCustomerProfileRow({
      userId,
      email,
      displayName: latest?.customer_name,
      phone: latest?.customer_phone,
      locale,
    });
    if (row) {
      const { error } = await admin.from('customer_profiles').insert(row);
      if (error && !/duplicate|already exists|unique/i.test(error.message || '')) throw error;
      return !error;
    }
    return true;
  }

  const patch = {};
  if (!existing.display_name && latest?.customer_name) patch.display_name = String(latest.customer_name).trim();
  if (!existing.phone && latest?.customer_phone) patch.phone = String(latest.customer_phone).trim();
  if (Object.keys(patch).length > 0) {
    await admin.from('customer_profiles').update(patch).eq('user_id', userId);
  }
  return false;
}

async function sendWelcomeEmail({ email, name, locale }) {
  const { smtp, from } = getOrderMailSettings();
  if (!smtp.configured || !email) return;

  const letter = buildAccountWelcomeEmail({ name, lang: locale });
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  await transporter.sendMail({
    from,
    to: email,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
    attachments: [getOrderEmailLogoAttachment()],
  });
}

async function rememberOwnedAddresses(admin, userId) {
  const { data: owned, error } = await admin
    .from('orders')
    .select('customer_name, customer_phone, shipping_address, created_at')
    .eq('customer_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  for (const order of owned || []) {
    try {
      await rememberOrderAddress(admin, userId, order);
    } catch (addressError) {
      console.error('[account/claim-orders] address:', addressError?.message || addressError);
    }
  }
}

export async function POST(request) {
  const admin = getSupabaseAdmin();

  let customer;
  try {
    customer = await resolveCustomerOrderOwner(admin, request.headers.get('authorization'));
  } catch (error) {
    if (error instanceof CustomerSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  if (!customer?.id) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const email = normalizeEmail(customer.email);
  if (!email) {
    return NextResponse.json({ error: 'This account has no verified email' }, { status: 400 });
  }

  let locale = 'es';
  try {
    const body = await request.json();
    if (String(body?.lang || '').toLowerCase().startsWith('en')) locale = 'en';
  } catch {
    locale = 'es';
  }

  try {
    const blocklist = await loadBlocklist(admin);

    if (!isEmailClaimable(email, blocklist)) {
      // The account exists (request-code should have refused it, but an older
      // account may predate the blocklist). Claim nothing and say so, rather
      // than handing over orders that belong to other people.
      const created = await ensureCustomerProfile(admin, { userId: customer.id, email, orders: [], locale });
      if (created) {
        try {
          await sendWelcomeEmail({ email, name: '', locale });
        } catch (mailError) {
          console.error('[account/claim-orders] welcome:', mailError?.message || mailError);
        }
      }
      return NextResponse.json({ ok: true, claimed: 0, blocked: true });
    }

    // ilike catches case drift; the `%` wrapper also catches rows stored with
    // stray whitespace. It is a superset — selectClaimableOrders() then applies
    // the exact normalized comparison that actually decides ownership.
    const { data: candidates, error } = await admin
      .from('orders')
      .select('id, customer_email, customer_user_id, customer_name, customer_phone, created_at')
      .is('customer_user_id', null)
      .ilike('customer_email', `%${escapeLikePattern(email)}%`);

    if (error) throw error;

    const claimable = selectClaimableOrders(candidates || [], { email, blocklist });

    if (claimable.length > 0) {
      const { error: updateError } = await admin
        .from('orders')
        .update({ customer_user_id: customer.id })
        .in('id', claimable.map((order) => order.id))
        // Re-assert the guard at write time: another request may have claimed
        // these rows between the read and the write.
        .is('customer_user_id', null);

      if (updateError) throw updateError;
    }

    const created = await ensureCustomerProfile(admin, {
      userId: customer.id,
      email,
      orders: claimable,
      locale,
    });

    await rememberOwnedAddresses(admin, customer.id);

    if (created) {
      const latest = [...claimable].sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))[0];
      try {
        await sendWelcomeEmail({
          email,
          name: latest?.customer_name || '',
          locale,
        });
      } catch (mailError) {
        console.error('[account/claim-orders] welcome:', mailError?.message || mailError);
      }
    }

    return NextResponse.json({ ok: true, claimed: claimable.length, blocked: false });
  } catch (error) {
    console.error('[account/claim-orders] failed:', error);
    return NextResponse.json({ error: 'Could not link your order history' }, { status: 500 });
  }
}
