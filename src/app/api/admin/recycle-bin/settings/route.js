import { NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/adminAuth';
import { validateRetention } from '@/lib/recycleBin.mjs';
import { actorFrom, getRetention, setRetention } from '@/lib/recycleBinServer';

export const dynamic = 'force-dynamic';

/**
 * How long the Bin holds things. Superadmin only.
 *
 * Shortening this is the one setting in the app that destroys data on a timer,
 * so the UI asks for a confirmation before sending it. That confirmation is a
 * courtesy, not the control — the check that matters is `requireSuperadmin`
 * here, which a browser cannot talk its way past.
 */

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  return NextResponse.json({
    retention: await getRetention(),
    canChange: Boolean(auth.profile.is_superadmin),
  });
}

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const checked = validateRetention(
    body?.neverPurge === true ? null : body?.retentionDays,
  );
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  const previous = await getRetention();
  const result = await setRetention(
    { days: checked.days, neverPurge: checked.neverPurge, actor: actorFrom(auth.profile) },
  );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  const was = previous.neverPurge ? 'never' : `${previous.days}d`;
  const now = checked.neverPurge ? 'never' : `${checked.days}d`;
  console.log(`[recycle-bin] retention ${was} -> ${now} by ${auth.profile.email}`);

  return NextResponse.json({ success: true, retention: result.retention });
}
