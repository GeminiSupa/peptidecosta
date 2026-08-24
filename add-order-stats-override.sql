-- =========================================================================
--        PEPTIDES COSTA RICA - KEEP TEST ORDERS OUT OF THE FIGURES
-- =========================================================================
-- Run this in your Supabase SQL Editor.
--
-- A test order flipped to Paid lands in Revenue Today, in the analytics
-- chart, in that customer's lifetime total, and - if it carries a sales
-- agent - in a real commission payout. There was no way to take one back
-- out short of deleting the row, which loses the record of what happened.
--
-- stats_override is a per-order answer to "does this count as money?" that
-- outranks the status rules in src/lib/orderRevenue.mjs:
--
--   'exclude'  never counts, whatever the status says   (a test order)
--   'include'  always counts, whatever the status says  (a real sale whose
--              status has not caught up yet)
--   NULL       follow the normal status rules           (the default)
--
-- Nothing is deleted: an override is reversible by setting it back to NULL,
-- and stats_override_reason keeps the note about why it was set.

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS stats_override TEXT,
    ADD COLUMN IF NOT EXISTS stats_override_reason TEXT,
    ADD COLUMN IF NOT EXISTS stats_override_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stats_override_by TEXT;

-- Only the two values the code understands, or nothing at all.
ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS orders_stats_override_check;

ALTER TABLE public.orders
    ADD CONSTRAINT orders_stats_override_check
    CHECK (stats_override IS NULL OR stats_override IN ('include', 'exclude'));

COMMENT ON COLUMN public.orders.stats_override IS
    'include | exclude | NULL. Outranks the status rules when deciding whether this order counts as revenue. See src/lib/orderRevenue.mjs.';

-- Overridden orders are a tiny minority, so a partial index keeps the
-- "show me everything currently overridden" screen cheap without carrying
-- an entry for every ordinary row.
CREATE INDEX IF NOT EXISTS orders_stats_override_idx
    ON public.orders (stats_override)
    WHERE stats_override IS NOT NULL;
