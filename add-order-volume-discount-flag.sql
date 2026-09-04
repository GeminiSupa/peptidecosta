-- Whether an order's automatic volume discount was applied.
--
-- The manual order form now asks. Without somewhere to record the answer, an
-- order saved with both discounts would silently lose the volume one the next
-- time anyone edited its items — the total would drop below what the customer
-- agreed to, with nothing on screen to say why.
--
-- NULL means "never asked": every order that existed before this column, and
-- every website order, which follows the ordinary tier rules. Only the manual
-- order form ever writes it.
--
-- Safe to run more than once. Adds one nullable column and touches no rows.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS apply_volume_discount BOOLEAN;

COMMENT ON COLUMN public.orders.apply_volume_discount IS
  'Manual orders only: whether staff chose to apply the automatic volume discount alongside any negotiated one. NULL means the choice was never made and the default rules apply.';

NOTIFY pgrst, 'reload schema';
