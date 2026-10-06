import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';

/**
 * Who is holding each Google Ads chat in Chatwoot, right now.
 *
 * The lead row has `chatwoot_assignee_name`, but nothing fills it: that column
 * is written by the Chatwoot webhook, and the webhook has never fired on this
 * account - every lead has a null `chatwoot_last_event_at`. Turning the webhook
 * on is a change inside Chatwoot, which is not ours to make, so the Leads
 * screen read "Assigned to" and showed nothing, for every lead, forever.
 *
 * We send these chats over deliberately unassigned and let Chatwoot hand them
 * out, so who ended up with one is a question the admin has to be able to
 * answer without logging in to Chatwoot. This reads it from Chatwoot's own API
 * with the credentials the sender already uses.
 */

const PAGE_LIMIT = 6; // Chatwoot returns 25 per page; 150 covers the Leads screen.

function readConfig(env) {
  const baseUrl = String(env.CHATWOOT_BASE_URL || '').trim().replace(/\/+$/, '');
  const accountId = String(env.CHATWOOT_ACCOUNT_ID || '').trim();
  const inboxId = String(env.CHATWOOT_INBOX_ID || '').trim();
  const accessToken = String(env.CHATWOOT_API_ACCESS_TOKEN || '').trim();
  return { baseUrl, accountId, inboxId, accessToken, configured: Boolean(baseUrl && accountId && inboxId && accessToken) };
}

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['leads'] });
  if (auth.error) return auth.error;

  const config = readConfig(process.env);
  if (!config.configured) {
    return NextResponse.json({ configured: false, assignees: {} });
  }

  const assignees = {};
  try {
    for (let page = 1; page <= PAGE_LIMIT; page += 1) {
      const url = `${config.baseUrl}/api/v1/accounts/${config.accountId}/conversations`
        + `?status=all&inbox_id=${encodeURIComponent(config.inboxId)}&page=${page}&sort_by=last_activity_at`;
      const response = await fetch(url, { headers: { api_access_token: config.accessToken } });
      if (!response.ok) throw new Error(`Chatwoot answered ${response.status}`);
      const body = await response.json();
      const rows = body?.data?.payload || [];
      for (const row of rows) {
        const assignee = row?.meta?.assignee;
        assignees[String(row.id)] = {
          // No assignee is the normal, healthy state for a chat we have just
          // handed over, so it is reported as a value rather than left out.
          name: assignee?.available_name || assignee?.name || '',
          email: assignee?.email || '',
          status: row?.status || '',
        };
      }
      if (rows.length < 25) break;
    }
  } catch (error) {
    // A Chatwoot outage must not take the Leads screen down with it; the screen
    // falls back to showing nothing for this column.
    console.warn('[chatwoot-assignees] Could not read Chatwoot:', error.message);
    return NextResponse.json({ configured: true, error: error.message, assignees: {} }, { status: 200 });
  }

  return NextResponse.json({ configured: true, assignees });
}
