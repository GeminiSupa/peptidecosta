-- Durable operational handoffs for CRM work, order notifications, and
-- commission disbursements. Safe to run more than once.

-- -------------------------------------------------------------------------
-- CRM follow-ups and shared activity
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_key TEXT NOT NULL,
  customer_name TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_by TEXT,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_reminders_customer_due
  ON public.crm_reminders (customer_key, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_reminders_open_due
  ON public.crm_reminders (due_at) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.crm_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_key TEXT NOT NULL,
  customer_name TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_activity_customer_created
  ON public.crm_activity (customer_key, created_at DESC);

ALTER TABLE public.crm_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_reminders_admin_all ON public.crm_reminders;
CREATE POLICY crm_reminders_admin_all ON public.crm_reminders
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS crm_activity_admin_all ON public.crm_activity;
CREATE POLICY crm_activity_admin_all ON public.crm_activity
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

-- -------------------------------------------------------------------------
-- Shared inquiry ownership
-- -------------------------------------------------------------------------
ALTER TABLE public.customer_inquiries
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS assigned_by TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customer_inquiries_assigned_to
  ON public.customer_inquiries (assigned_to, status, created_at DESC);

-- -------------------------------------------------------------------------
-- Durable completion notification state
-- -------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS completion_notification_status TEXT,
  ADD COLUMN IF NOT EXISTS completion_notification_error TEXT,
  ADD COLUMN IF NOT EXISTS completion_notification_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_notification_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_completion_notification_retry
  ON public.orders (completion_notification_status, completion_notification_last_attempt_at)
  WHERE completion_notification_status = 'failed';

-- -------------------------------------------------------------------------
-- Payout settlement evidence. Approval remains an accounting control; Paid
-- means the transfer has actually been recorded with a reference.
-- -------------------------------------------------------------------------
ALTER TABLE public.commission_payouts
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_note TEXT,
  ADD COLUMN IF NOT EXISTS payment_initiated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_recorded_by TEXT,
  ADD COLUMN IF NOT EXISTS email_sent BOOLEAN,
  ADD COLUMN IF NOT EXISTS email_error TEXT;

ALTER TABLE public.affiliate_payouts
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_note TEXT,
  ADD COLUMN IF NOT EXISTS payment_initiated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_recorded_by TEXT,
  ADD COLUMN IF NOT EXISTS email_sent BOOLEAN,
  ADD COLUMN IF NOT EXISTS email_error TEXT;

CREATE INDEX IF NOT EXISTS idx_commission_payouts_settlement_status
  ON public.commission_payouts (status, paid_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_settlement_status
  ON public.affiliate_payouts (status, paid_at);

NOTIFY pgrst, 'reload schema';
