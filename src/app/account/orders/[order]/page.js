import OrderDetail from './OrderDetail';

// `params` is a Promise in Next.js 16 and has to be awaited before its values
// are read. The order itself is fetched in the browser, where the customer's
// own session (and therefore RLS) applies — so this server component only
// resolves the segment and hands the number down.
export default async function AccountOrderPage({ params }) {
  const { order } = await params;
  return <OrderDetail orderNumber={decodeURIComponent(order)} />;
}
