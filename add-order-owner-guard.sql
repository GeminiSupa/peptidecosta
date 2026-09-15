-- Order ownership: approval requests, and a database lock on orders.sales_agent.
-- Safe to run more than once.
--
-- RUN IT RIGHT AFTER THE DEPLOY THAT ADDS /api/admin/orders/owner.
--   * Run before that deploy, the old "Claim" button (which wrote from the
--     browser) stops working until the new code is live.
--   * Until it runs, owner change requests reply "Run add-order-owner-guard.sql".
--
-- Why: the orders_admin_all policy lets every signed-in team member UPDATE any
-- order from their browser. A lock in the app alone could be walked around, so
-- ownership changes are refused here unless they come through the server
-- (service role), which applies the rules in src/lib/orderOwnership.mjs.
-- Same pattern add-lead-claiming.sql already uses for catalog_leads.

-- 1. Requests a superadmin approves or rejects ------------------------------

CREATE TABLE IF NOT EXISTS public.order_owner_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number TEXT,
  from_agent TEXT,
  to_agent TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'stale', 'cancelled')),
  requested_by_user_id UUID,
  requested_by_email TEXT,
  requested_by_name TEXT,
  decided_by_email TEXT,
  decision_note TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One open request per order, so a superadmin never answers two at once.
CREATE UNIQUE INDEX IF NOT EXISTS order_owner_change_requests_one_pending
  ON public.order_owner_change_requests(order_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS order_owner_change_requests_status_idx
  ON public.order_owner_change_requests(status, created_at DESC);

-- Read and written only by the server. No policies = no browser access.
ALTER TABLE public.order_owner_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_owner_change_requests FROM anon, authenticated;

-- 2. Lock orders.sales_agent against direct browser writes -------------------

CREATE OR REPLACE FUNCTION public.guard_order_owner_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IN ('authenticated', 'anon')
     AND OLD.sales_agent IS DISTINCT FROM NEW.sales_agent THEN
    RAISE EXCEPTION 'Order ownership changes must go through Claim or Request owner change'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_owner_update ON public.orders;
CREATE TRIGGER trg_guard_order_owner_update
  BEFORE UPDATE OF sales_agent ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_order_owner_update();

NOTIFY pgrst, 'reload schema';

-- Check it worked (both should return one row):
--   SELECT to_regclass('public.order_owner_change_requests');
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_guard_order_owner_update';
