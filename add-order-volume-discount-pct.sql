-- The volume discount percentage an order was actually charged.
--
-- The orders list worked this out by re-running the tier rules over the saved
-- items, which is only correct while the rules never change. They do: a deal
-- week raised the 10+ vial tier from 20% to 35%, and the moment it lapsed
-- every order taken during it started reporting 20% on screen — under a total
-- that plainly had 35% taken off. Staff answering "why does this say 20%?"
-- had nothing in the record to check against.
--
-- Recomputing also cannot survive an edit: change the items on an old order
-- and the badge silently reprices it against today's tier.
--
-- So the figure is written once, when the order is priced, and read back
-- verbatim afterwards. NULL means "written before this column existed" — those
-- rows keep falling back to the recomputed value, which is the best guess
-- available for them and exactly what the screen showed before.
--
-- Safe to run more than once. Adds one nullable column and touches no rows.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS volume_discount_pct NUMERIC;

COMMENT ON COLUMN public.orders.volume_discount_pct IS
  'The automatic volume-discount percentage applied when this order was priced, recorded so the tier rules can change without rewriting history. NULL means the order predates the column; the reader falls back to recomputing from the items.';

NOTIFY pgrst, 'reload schema';
