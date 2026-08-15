const clean = (value) => String(value ?? '').trim();
const emailKey = (value) => clean(value).toLowerCase();
const phoneKey = (value) => clean(value).replace(/\D/g, '').slice(-8);

export function manualOrderCustomerKey(customer = {}) {
  return emailKey(customer.email || customer.customer_email)
    || phoneKey(customer.phone || customer.customer_phone || customer.whatsappWaId)
    || clean(customer.name || customer.customer_name).toLowerCase();
}

export function orderToManualCustomer(order = {}) {
  return {
    id: manualOrderCustomerKey(order),
    name: clean(order.customer_name),
    email: clean(order.customer_email),
    phone: clean(order.customer_phone),
    customerIdNumber: clean(order.customer_id_number),
    customerIdType: clean(order.customer_id_type) || '1',
    shippingAddress: clean(order.shipping_address),
    lastOrderAt: order.created_at || '',
  };
}

export function buildManualOrderCustomerOptions(orders = []) {
  const byKey = new Map();
  [...orders]
    .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
    .forEach((order) => {
      const customer = orderToManualCustomer(order);
      if (!customer.id || byKey.has(customer.id)) return;
      customer.searchLabel = [customer.name || 'Customer', customer.email, customer.phone]
        .filter(Boolean)
        .join(' · ');
      byKey.set(customer.id, customer);
    });
  return [...byKey.values()].sort((left, right) => left.searchLabel.localeCompare(
    right.searchLabel,
    undefined,
    { sensitivity: 'base', numeric: true }
  ));
}

export function resolveManualOrderCustomerPrefill(customer = {}, orders = []) {
  const wantedEmail = emailKey(customer.email || customer.customer_email);
  const wantedPhone = phoneKey(customer.phone || customer.customer_phone || customer.whatsappWaId);
  const match = [...orders]
    .filter((order) => (
      (wantedEmail && emailKey(order.customer_email) === wantedEmail)
      || (wantedPhone && phoneKey(order.customer_phone) === wantedPhone)
    ))
    .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))[0];
  const fromOrder = match ? orderToManualCustomer(match) : {};
  return {
    ...fromOrder,
    id: manualOrderCustomerKey(customer) || fromOrder.id || '',
    name: clean(customer.name || customer.customer_name) || fromOrder.name || '',
    email: clean(customer.email || customer.customer_email) || fromOrder.email || '',
    phone: clean(customer.phone || customer.customer_phone || customer.whatsappWaId) || fromOrder.phone || '',
  };
}
