-- Give CRM leads an owner.
--
-- `catalog_leads` has no owner column at all today, so nothing can record which
-- agent a lead belongs to. The Contáctenos route already writes `sales_agent`
-- and silently drops it because the column is missing, and the attribution
-- backfill has nowhere to put its results.
--
-- The name matches `orders.sales_agent`, which holds the agent's profile name,
-- so one lead and that customer's orders read the same way. LeadsManager
-- already looks for `sales_agent` when working out who owns a lead.
--
-- Safe to run more than once.

ALTER TABLE public.catalog_leads
  ADD COLUMN IF NOT EXISTS sales_agent text;

-- The Leads tab filters by owner, so this keeps that from scanning the table.
CREATE INDEX IF NOT EXISTS catalog_leads_sales_agent_idx
  ON public.catalog_leads (sales_agent);

-- Verify: should list the new column.
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'catalog_leads' AND column_name = 'sales_agent';
