import { redirect } from 'next/navigation';

export default async function CardPaymentRedirectPage({ params }) {
  const { order, token } = await params;
  const query = new URLSearchParams({
    order: String(order || ''),
    token: String(token || ''),
  });

  redirect(`/pay-card?${query.toString()}`);
}
