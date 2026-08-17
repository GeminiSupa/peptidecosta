-- Put reserved stock back when a sale does not happen.
--
-- Inventory is deducted the moment an order is placed — that reservation is
-- deliberate, it stops two customers being sold the last vial. But nothing ever
-- added it back. A cancelled, declined or simply abandoned order held its stock
-- forever, so the count drifted down until the catalog showed "Out of Stock"
-- for vials sitting on the shelf.
--
-- Two columns make a safe restore possible:
--
--   inventory_deducted  what was ACTUALLY taken. The deduction clamps at zero
--                       (Math.max(0, current - qty)), so an order for 5 against
--                       a stock of 2 only removed 2. Restoring the order's face
--                       quantities would invent three vials.
--   inventory_restored_at  the guard. Set before the stock is returned and only
--                       when still null, so the admin panel cancelling an order
--                       while the expiry cron is mid-sweep cannot pay it out
--                       twice — one of them wins the row, the other sees zero
--                       rows matched and stops.
--
-- Both are written defensively, so checkout and admin edits keep working
-- whether or not this file has been run. Running it is what makes restores
-- exact and non-repeatable.
--
-- Safe to re-run.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_deducted JSONB,
  ADD COLUMN IF NOT EXISTS inventory_restored_at TIMESTAMPTZ;

-- The expiry sweep looks for old orders that have not been restored yet.
CREATE INDEX IF NOT EXISTS orders_inventory_pending_restore_idx
  ON public.orders (created_at)
  WHERE inventory_restored_at IS NULL;

-- What the hourly sweep would take right now, before trusting it with anything.
-- Unpaid for more than 24 hours and still holding stock:
--
--   SELECT order_number, status, created_at, inventory_deducted
--   FROM public.orders
--   WHERE inventory_restored_at IS NULL
--     AND created_at < now() - interval '24 hours'
--     AND lower(status) IN ('pending', 'payment pending', 'pending - card', 'pending - card 3ds')
--   ORDER BY created_at;
