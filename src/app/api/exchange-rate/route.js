import { NextResponse } from 'next/server';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await getDatabaseBackedUsdToCrcRate({ syncProducts: true });
    return NextResponse.json(result);
  } catch (err) {
    console.error('Error fetching exchange rate:', err);
    return NextResponse.json({ rate: 454.48 }, { status: 500 }); // Fallback rate
  }
}
