-- Fulfillment queue: the step between "sales agent got paid" and "Omer packed
-- and shipped it".
--
-- ready_to_prepare_at is the flag itself. Null means the order has not been
-- handed to fulfillment yet; a timestamp means it has, and is the moment it
-- entered the queue. ready_to_prepare_by records which agent handed it over,
-- for the same reason sales_agent is recorded elsewhere — so a question about
-- who did what has an answer.
--
-- There is deliberately no "packed" or "finished" column here. The existing
-- status flow already means that: an order leaves the Fulfillment tab the
-- moment its status reaches Order Complete (with a tracking number), which
-- already fires the customer's shipped notification. A second status would
-- only be a second thing that can disagree with the first.
--
-- Safe to run more than once.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ready_to_prepare_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_to_prepare_by text;

-- The Fulfillment tab's whole query is "orders with the flag set, still not
-- complete" — this is that query's index.
CREATE INDEX IF NOT EXISTS orders_ready_to_prepare_idx
  ON public.orders (ready_to_prepare_at)
  WHERE ready_to_prepare_at IS NOT NULL;
