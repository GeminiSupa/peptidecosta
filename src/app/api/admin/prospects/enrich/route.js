import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { enrichFromWebsite } from '@/lib/prospectEnrichmentRunner.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    return NextResponse.json(await enrichFromWebsite({
      websiteUrl: body.website_url,
      organizationName: body.organization_name,
    }));
  } catch (error) {
    console.error('[Prospector Enrichment] Failed:', error.message);
    return NextResponse.json({ error: error.message || 'Unable to scan this website' }, { status: 422 });
  }
}
