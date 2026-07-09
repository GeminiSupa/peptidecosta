import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GRAPH = 'https://graph.facebook.com/v25.0';

// Costa Rica is UTC−6 year-round.
const CR_OFFSET_MS = 6 * 60 * 60 * 1000;
function crStartOfToday() {
  const cr = new Date(Date.now() - CR_OFFSET_MS);
  cr.setUTCHours(0, 0, 0, 0);
  return new Date(cr.getTime() + CR_OFFSET_MS);
}

async function countMessages(supabase, direction, sinceIso) {
  let q = supabase
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('direction', direction);
  if (sinceIso) q = q.gte('created_at', sinceIso);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function countMarketing(supabase, sinceIso) {
  let q = supabase
    .from('marketing_delivery_events')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'whatsapp')
    .eq('status', 'delivered');
  if (sinceIso) q = q.gte('last_attempt_at', sinceIso);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();

    const now = Date.now();
    const todayIso = crStartOfToday().toISOString();
    const weekIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthIso = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Build all three periods. Each period: inbound, outbound, marketing.
    const build = async (label, sinceIso) => {
      const [inbound, outbound, marketing] = await Promise.all([
        countMessages(supabase, 'inbound', sinceIso),
        countMessages(supabase, 'outbound', sinceIso),
        countMarketing(supabase, sinceIso),
      ]);
      const transactional = Math.max(0, outbound - marketing);
      const ratio = inbound > 0 ? Number((outbound / inbound).toFixed(2)) : null;
      return { label, inbound, outbound, marketing, transactional, ratio };
    };

    const [today, week, month] = await Promise.all([
      build('today', todayIso),
      build('7d', weekIso),
      build('30d', monthIso),
    ]);

    // Live number health from the WhatsApp Cloud API (best-effort).
    let quality = null;
    if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
      try {
        const res = await fetch(
          `${GRAPH}/${PHONE_NUMBER_ID}?fields=quality_rating,messaging_limit_tier,display_phone_number&access_token=${ACCESS_TOKEN}`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        if (!data.error) {
          quality = {
            rating: data.quality_rating || 'UNKNOWN',
            tier: data.messaging_limit_tier || null,
            number: data.display_phone_number || null,
          };
        }
      } catch {
        // ignore — quality is a nice-to-have
      }
    }

    // Warnings — the spam-risk signals.
    const warnings = [];
    if (quality?.rating === 'RED') {
      warnings.push({ level: 'critical', text: 'Number quality is RED — sending is restricted. Pause all marketing immediately.' });
    } else if (quality?.rating === 'YELLOW') {
      warnings.push({ level: 'warning', text: 'Number quality is YELLOW — reduce marketing and let it recover to GREEN.' });
    }
    // Low inbound:outbound ratio over 7 days = blasting, not conversing.
    if (week.ratio !== null && week.ratio >= 5 && week.outbound >= 50) {
      warnings.push({ level: 'warning', text: `You sent ${week.ratio}× more messages than you received this week — a spam-risk pattern.` });
    }
    // High marketing volume today.
    if (today.marketing >= 200) {
      warnings.push({ level: 'warning', text: `${today.marketing} marketing messages sent today — high volume raises block/report risk.` });
    }

    return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), quality, periods: { today, week, month }, warnings });
  } catch (err) {
    console.error('[WhatsApp Analytics] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to load analytics' }, { status: 500 });
  }
}
