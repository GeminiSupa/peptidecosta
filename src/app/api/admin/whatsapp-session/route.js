import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSessionStatus, startSession, disconnectSession } from '@/lib/waSession';

export const dynamic = 'force-dynamic';

// GET — return current session status + QR data URL (polled by the UI every 2s)
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  return NextResponse.json(getSessionStatus());
}

// POST — start / initiate the session (triggers QR generation)
export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    // Non-blocking — client will poll GET for QR + status
    startSession().catch(err => console.error('[WA Route] startSession error:', err));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — log out and wipe saved credentials
export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    await disconnectSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
