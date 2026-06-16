import { NextResponse } from 'next/server';
import { getUsdToCrcRate } from '@/lib/pricing';

export const revalidate = 3600; // Cache the response for 1 hour

export async function GET() {
  try {
    const rate = await getUsdToCrcRate();
    return NextResponse.json({ rate });
  } catch (err) {
    console.error('Error fetching exchange rate:', err);
    return NextResponse.json({ rate: 454.48 }, { status: 500 }); // Fallback rate
  }
}
