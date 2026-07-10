import { NextResponse } from 'next/server';

/**
 * Guard for cron-only routes. Returns a 401 NextResponse if the caller is not
 * an authorized cron trigger, otherwise null.
 *
 * Accepts either:
 *   • Authorization: Bearer <CRON_SECRET>   (manual / external scheduler)
 *   • x-vercel-cron: 1                       (Vercel's own cron invocations)
 *
 * If CRON_SECRET is unset we fail CLOSED for non-Vercel callers — a missing
 * secret must never silently make these endpoints world-triggerable.
 */
export function verifyCronRequest(request) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (isVercelCron) return null;

  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (secret && authHeader === `Bearer ${secret}`) return null;

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
