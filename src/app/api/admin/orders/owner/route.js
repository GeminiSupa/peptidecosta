import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { appendOrderActivity } from '@/lib/orderActivity';
import { isActiveProfile } from '@/lib/subUserTier.mjs';
import {
  OWNER_REASON_MIN,
  cleanReason,
  decideOwnerChange,
  findActiveProfile,
  profileOwnerName,
  sameOwner,
} from '@/lib/orderOwnership.mjs';
import { customerOwnerFor, loadTeamProfiles } from '@/lib/orderOwnershipServer';

/**
 * The one place an order's owner changes.
 *
 *   POST  { orderId, action: 'claim' }                          take an unowned order
 *   POST  { orderId, action: 'assign', salesAgent, reason }     superadmin sets it
 *   POST  { orderId, action: 'request', salesAgent, reason }    ask a superadmin
 *   GET                                                         pending requests
 *   PATCH { requestId, decision: 'approve'|'reject', note }     superadmin answers
 *
 * The rules live in orderOwnership.mjs. add-order-owner-guard.sql stops a
 * browser session writing orders.sales_agent directly, so this route (service
 * role) is the only way through.
 */

export const runtime = 'nodejs';

const REQUESTS = 'order_owner_change_requests';
const MIGRATION_MESSAGE = 'Owner change requests are not switched on in the database yet. Run add-order-owner-guard.sql in Supabase first.';

const clean = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);

function requestsTableMissing(error) {
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || String(error?.message || '').includes(REQUESTS);
}

async function loadOrder(supabase, orderId) {
  const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Writes the new owner only while the order still has the owner that was read,
 * so two people acting on one order cannot silently overwrite each other.
 * Returns null when someone else got there first.
 */
async function writeOwner(supabase, order, nextOwner, activity) {
  let query = supabase
    .from('orders')
    .update({
      sales_agent: nextOwner || null,
      activity_log: appendOrderActivity(order.activity_log, activity),
    })
    .eq('id', order.id);
  query = order.sales_agent === null || order.sales_agent === undefined
    ? query.is('sales_agent', null)
    : query.eq('sales_agent', order.sales_agent);
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw error;
  return data;
}

async function appendActivity(supabase, order, activity) {
  const { data, error } = await supabase
    .from('orders')
    .update({ activity_log: appendOrderActivity(order.activity_log, activity) })
    .eq('id', order.id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data || order;
}

/**
 * The bell shows a superadmin every notification whatever its recipient, and
 * shows staff only rows addressed to them. So one row addressed to any
 * superadmin reaches all of them and no one else; a row per superadmin would
 * show each of them the same request twice.
 */
async function notify(supabase, row) {
  try {
    const { error } = await supabase.from('admin_notifications').insert(row);
    if (error) console.warn('[admin/orders/owner] notification:', error.message);
  } catch (error) {
    console.warn('[admin/orders/owner] notification:', error.message);
  }
}

async function closePendingRequests(supabase, orderId, note, actorEmail) {
  const { error } = await supabase
    .from(REQUESTS)
    .update({
      status: 'cancelled',
      decision_note: note,
      decided_by_email: actorEmail || null,
      decided_at: new Date().toISOString(),
    })
    .eq('order_id', orderId)
    .eq('status', 'pending');
  if (error && !requestsTableMissing(error)) {
    console.warn('[admin/orders/owner] close pending requests:', error.message);
  }
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase.from(REQUESTS).select('*');
    query = auth.profile.is_superadmin
      ? query.eq('status', 'pending').order('created_at', { ascending: true }).limit(100)
      : query.eq('requested_by_user_id', auth.user.id).order('created_at', { ascending: false }).limit(50);
    const { data, error } = await query;
    if (error) {
      if (requestsTableMissing(error)) {
        return NextResponse.json({ ok: true, requests: [], migrationMissing: true });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, requests: data || [] });
  } catch (error) {
    console.error('[admin/orders/owner GET]', error);
    return NextResponse.json({ error: error.message || 'Could not load owner change requests' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const orderId = clean(body.orderId, 80);
    const action = clean(body.action, 20);
    const reason = cleanReason(body.reason);
    if (!orderId || !['claim', 'assign', 'request'].includes(action)) {
      return NextResponse.json({ error: 'orderId and a valid action are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const order = await loadOrder(supabase, orderId);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const isSuperadmin = Boolean(auth.profile.is_superadmin);
    const profiles = await loadTeamProfiles(supabase);
    const actorOwner = profileOwnerName(auth.profile) || clean(auth.user.email, 160);
    const currentOwner = clean(order.sales_agent, 160);

    // A name from a dropdown is resolved to the person's canonical owner name,
    // so "dani" and "elainedrb@gmail.com" cannot become a second Dani.
    let targetOwner = actorOwner;
    if (action !== 'claim') {
      const requested = clean(body.salesAgent, 160);
      targetOwner = '';
      if (requested) {
        const profile = findActiveProfile(profiles, requested);
        if (!profile) {
          return NextResponse.json({ error: `${requested} is not an active team member.` }, { status: 400 });
        }
        targetOwner = profileOwnerName(profile);
      }
    }

    if (action === 'request') {
      if (!targetOwner) {
        return NextResponse.json({ error: 'Choose who the order should move to.' }, { status: 400 });
      }
      if (sameOwner(currentOwner, targetOwner)) {
        return NextResponse.json({ error: `This order already belongs to ${currentOwner}.` }, { status: 400 });
      }
      if (reason.length < OWNER_REASON_MIN) {
        return NextResponse.json({ error: 'Write a short reason so the superadmin knows why.' }, { status: 400 });
      }

      const { data: created, error: insertError } = await supabase
        .from(REQUESTS)
        .insert({
          order_id: order.id,
          order_number: order.order_number || null,
          from_agent: currentOwner || null,
          to_agent: targetOwner,
          reason,
          status: 'pending',
          requested_by_user_id: auth.user.id,
          requested_by_email: auth.user.email || null,
          requested_by_name: actorOwner || null,
        })
        .select('*')
        .single();
      if (insertError) {
        if (insertError.code === '23505') {
          return NextResponse.json({
            error: 'There is already an owner change request waiting on this order. A superadmin needs to answer that one first.',
          }, { status: 409 });
        }
        if (requestsTableMissing(insertError)) {
          return NextResponse.json({ error: MIGRATION_MESSAGE }, { status: 503 });
        }
        throw insertError;
      }

      const updatedOrder = await appendActivity(supabase, order, {
        type: 'owner_change_requested',
        message: `${actorOwner} asked to move this order from ${currentOwner || 'Unassigned'} to ${targetOwner} — Reason: ${reason}`,
        by: auth.user.email,
      });

      const superadmin = profiles.find((profile) => profile.is_superadmin && isActiveProfile(profile) && profile.email);
      if (superadmin) {
        await notify(supabase, {
          type: 'owner_change_request',
          title: `Owner change request: ${order.order_number || 'order'}`,
          body: `${actorOwner}: ${currentOwner || 'Unassigned'} → ${targetOwner}. ${reason}`.slice(0, 500),
          link_tab: 'orders',
          link_ref: order.order_number || order.id,
          recipient_email: String(superadmin.email).trim().toLowerCase(),
        });
      }

      return NextResponse.json({
        ok: true,
        request: created,
        order: updatedOrder,
        message: 'Request sent. A superadmin will approve or reject it.',
      });
    }

    if (action === 'assign' && !isSuperadmin) {
      return NextResponse.json({
        error: 'Only a superadmin can change an order owner directly. Use "Request owner change".',
        code: 'needs_approval',
      }, { status: 403 });
    }

    let customerOwner = '';
    if (!isSuperadmin && !currentOwner) {
      try {
        customerOwner = await customerOwnerFor(supabase, order, profiles);
      } catch (lookupError) {
        console.error('[admin/orders/owner] customer history lookup:', lookupError);
        return NextResponse.json({
          error: "Could not check this customer's past orders, so the order was not claimed. Try again in a minute.",
        }, { status: 503 });
      }
    }

    const decision = decideOwnerChange({
      currentOwner,
      customerOwner,
      targetOwner,
      actorOwner,
      isSuperadmin,
      status: order.status,
      reason,
    });
    if (decision.outcome === 'unchanged') {
      return NextResponse.json({ ok: true, order, message: 'The owner is unchanged.' });
    }
    if (decision.outcome === 'refused') {
      return NextResponse.json({ error: decision.message, code: decision.code }, { status: 400 });
    }
    if (decision.outcome === 'needs_approval') {
      return NextResponse.json({
        error: decision.message,
        code: 'needs_approval',
        owner: currentOwner || customerOwner || null,
      }, { status: 409 });
    }

    const message = action === 'claim'
      ? `Order claimed by ${targetOwner}`
      : `Owner changed from ${currentOwner || 'Unassigned'} to ${targetOwner || 'Unassigned'}${reason ? ` — Reason: ${reason}` : ''}`;
    const updated = await writeOwner(supabase, order, targetOwner, {
      type: 'agent_assignment',
      message,
      by: auth.user.email,
    });
    if (!updated) {
      const latest = await loadOrder(supabase, order.id);
      return NextResponse.json({
        error: `Someone changed this order's owner a moment ago (it is now ${latest?.sales_agent || 'Unassigned'}). Nothing was changed.`,
        order: latest,
      }, { status: 409 });
    }

    // A superadmin deciding directly answers any request still waiting on it.
    if (isSuperadmin) {
      await closePendingRequests(supabase, order.id, `Owner set directly by ${actorOwner}`, auth.user.email);
    }

    return NextResponse.json({ ok: true, order: updated, message });
  } catch (error) {
    console.error('[admin/orders/owner POST]', error);
    return NextResponse.json({ error: error.message || 'Could not change the order owner' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const requestId = clean(body.requestId, 80);
    const decision = clean(body.decision, 20);
    const note = cleanReason(body.note);
    if (!requestId || !['approve', 'reject'].includes(decision)) {
      return NextResponse.json({ error: 'requestId and a decision are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: ownerRequest, error: loadError } = await supabase
      .from(REQUESTS)
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (loadError) {
      if (requestsTableMissing(loadError)) return NextResponse.json({ error: MIGRATION_MESSAGE }, { status: 503 });
      throw loadError;
    }
    if (!ownerRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    if (ownerRequest.status !== 'pending') {
      return NextResponse.json({ error: `This request was already ${ownerRequest.status}.` }, { status: 409 });
    }

    const deciderName = profileOwnerName(auth.profile) || auth.user.email;
    const requesterName = ownerRequest.requested_by_name || ownerRequest.requested_by_email || 'A team member';
    const decidedAt = new Date().toISOString();

    // Conditional on still being pending, so two superadmins answering at once
    // cannot both act on it.
    const settle = async (status, decisionNote) => {
      const { data, error } = await supabase
        .from(REQUESTS)
        .update({
          status,
          decided_by_email: auth.user.email || null,
          decided_at: decidedAt,
          decision_note: decisionNote || null,
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data;
    };
    const alreadyAnswered = () => NextResponse.json({
      error: 'Someone else answered this request a moment ago.',
    }, { status: 409 });

    const order = await loadOrder(supabase, ownerRequest.order_id);
    if (!order) {
      await settle('cancelled', 'The order no longer exists');
      return NextResponse.json({ error: 'That order no longer exists, so the request was closed.' }, { status: 404 });
    }

    const tellRequester = (title, text) => (ownerRequest.requested_by_email
      ? notify(supabase, {
          type: 'owner_change_decision',
          title,
          body: text.slice(0, 500),
          link_tab: 'orders',
          link_ref: order.order_number || order.id,
          recipient_email: String(ownerRequest.requested_by_email).trim().toLowerCase(),
        })
      : Promise.resolve());

    if (decision === 'reject') {
      const settled = await settle('rejected', note);
      if (!settled) return alreadyAnswered();
      const updatedOrder = await appendActivity(supabase, order, {
        type: 'owner_change_rejected',
        message: `${deciderName} rejected ${requesterName}'s request to move this order to ${ownerRequest.to_agent}${note ? ` — ${note}` : ''}`,
        by: auth.user.email,
      });
      await tellRequester(
        `Owner change rejected: ${order.order_number || 'order'}`,
        `${deciderName} kept this order with ${order.sales_agent || 'Unassigned'}.${note ? ` ${note}` : ''}`,
      );
      return NextResponse.json({ ok: true, order: updatedOrder, request: settled, message: 'Request rejected.' });
    }

    if (!sameOwner(order.sales_agent, ownerRequest.from_agent)) {
      await settle('stale', `The owner had already changed to ${order.sales_agent || 'Unassigned'}`);
      return NextResponse.json({
        error: `The owner changed after this request was made (it is now ${order.sales_agent || 'Unassigned'}), so nothing was changed and the request was closed.`,
        order,
      }, { status: 409 });
    }

    const profiles = await loadTeamProfiles(supabase);
    const target = findActiveProfile(profiles, ownerRequest.to_agent);
    if (!target) {
      return NextResponse.json({
        error: `${ownerRequest.to_agent} is no longer an active team member, so this cannot be approved. Reject it instead.`,
      }, { status: 400 });
    }
    const targetOwner = profileOwnerName(target);

    const settled = await settle('approved', note);
    if (!settled) return alreadyAnswered();

    let updatedOrder = null;
    try {
      updatedOrder = await writeOwner(supabase, order, targetOwner, {
        type: 'agent_assignment',
        message: `Owner changed from ${order.sales_agent || 'Unassigned'} to ${targetOwner} — approved by ${deciderName}, requested by ${requesterName}: ${ownerRequest.reason}${note ? ` (${note})` : ''}`,
        by: auth.user.email,
      });
    } catch (writeError) {
      console.error('[admin/orders/owner PATCH] owner write:', writeError);
    }
    if (!updatedOrder) {
      // Put the request back so it can be answered again once the order settles.
      await supabase
        .from(REQUESTS)
        .update({ status: 'pending', decided_by_email: null, decided_at: null, decision_note: null })
        .eq('id', requestId);
      return NextResponse.json({
        error: 'The order changed while this was being approved. Nothing was changed — refresh and try again.',
      }, { status: 409 });
    }

    await tellRequester(
      `Owner change approved: ${order.order_number || 'order'}`,
      `${deciderName} moved this order to ${targetOwner}.${note ? ` ${note}` : ''}`,
    );
    return NextResponse.json({ ok: true, order: updatedOrder, request: settled, message: `Order moved to ${targetOwner}.` });
  } catch (error) {
    console.error('[admin/orders/owner PATCH]', error);
    return NextResponse.json({ error: error.message || 'Could not answer the request' }, { status: 500 });
  }
}
