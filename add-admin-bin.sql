-- Recycle bin for dashboard deletes (orders, leads, carts, inquiries).
-- Safe to run more than once. Apply before relying on restore from the Bin tab.
-- Deletes still go through the existing admin APIs; those APIs snapshot here
-- first. The dashboard never reads this table from the browser.

CREATE TABLE IF NOT EXISTS public.admin_bin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order', 'lead', 'cart', 'inquiry')),
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL,
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_bin_deleted_at_idx
  ON public.admin_bin (deleted_at DESC);

CREATE INDEX IF NOT EXISTS admin_bin_type_idx
  ON public.admin_bin (entity_type, deleted_at DESC);

ALTER TABLE public.admin_bin ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_bin FROM anon;
REVOKE ALL ON TABLE public.admin_bin FROM authenticated;

-- Staff reach this table only through /api/admin/bin on the service role.
DROP POLICY IF EXISTS admin_bin_admin_all ON public.admin_bin;
