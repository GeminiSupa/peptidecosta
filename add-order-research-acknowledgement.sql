-- The research-use acknowledgement a customer ticked before checkout opened.
--
-- Our card processor's bank requires that the payment form is unreachable
-- until the customer has affirmatively agreed that the products are supplied
-- for research only and are not for human or animal consumption. The gate is
-- enforced in the storefront and again in api/orders/create; these two columns
-- are the record that it happened, which is what an underwriter asks to see.
--
-- research_ack_version names the wording that was on screen, so revising the
-- sentence later cannot retroactively change what older orders agreed to.
-- research_ack_at is the server's clock at the moment the order was accepted —
-- deliberately not the browser's, which would make the audit trail hostage to
-- whatever a customer's device thinks the date is.
--
-- NULL means the order predates the gate, or was created by staff through the
-- admin order form, which is not a public checkout.
--
-- Safe to run more than once. Adds two nullable columns and touches no rows.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS research_ack_version TEXT,
  ADD COLUMN IF NOT EXISTS research_ack_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.research_ack_version IS
  'Which wording of the research-use acknowledgement the customer agreed to at checkout. NULL for orders placed before the gate existed and for staff-created manual orders.';

COMMENT ON COLUMN public.orders.research_ack_at IS
  'Server time at which the research-use acknowledgement was accepted with this order. Not the browser clock.';

NOTIFY pgrst, 'reload schema';
