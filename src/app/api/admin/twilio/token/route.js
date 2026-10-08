import { NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/adminAuth';
import { generateVoiceToken } from '@/lib/twilio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/twilio/token
 * Generates a short-lived Twilio Access Token with a VoiceGrant.
 * The browser Twilio Voice SDK uses this to authenticate WebRTC calls.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  // Use the authenticated admin's user ID as the caller identity
  const identity = `admin-${(auth.user?.id || 'dashboard').slice(0, 12)}`;

  const result = generateVoiceToken({ identity });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || 'Could not generate Voice token.' },
      { status: 422 }
    );
  }

  return NextResponse.json({
    token: result.token,
    identity: result.identity,
    ttl: result.ttl,
  });
}
