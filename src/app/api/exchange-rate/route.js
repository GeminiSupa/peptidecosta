import { NextResponse } from 'next/server';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';
import { FALLBACK_EXCHANGE_RATE } from '@/lib/pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await getDatabaseBackedUsdToCrcRate({ syncProducts: true });
    return NextResponse.json(result);
  } catch (err) {
    console.error('Error fetching exchange rate:', err);
    return NextResponse.json({ rate: FALLBACK_EXCHANGE_RATE }, { status: 500 });
  }
}
