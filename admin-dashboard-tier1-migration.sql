-- Tier 1 admin dashboard: order ops fields + notification log
-- Run in Supabase SQL Editor

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS activity_log JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS shipping_cost_crc NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_cost_usd NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'catalog';

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link_tab TEXT,
  link_ref TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read admin_notifications" ON public.admin_notifications;
CREATE POLICY "Allow authenticated read admin_notifications"
  ON public.admin_notifications FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated update admin_notifications" ON public.admin_notifications;
CREATE POLICY "Allow authenticated update admin_notifications"
  ON public.admin_notifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON public.admin_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON public.admin_notifications (read_at) WHERE read_at IS NULL;

-- Per-admin dismissals for live notifications (pending orders, inquiries, WhatsApp)
CREATE TABLE IF NOT EXISTS public.admin_notification_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  notification_key TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (admin_user_id, notification_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_notification_dismissals_user
  ON public.admin_notification_dismissals (admin_user_id);

ALTER TABLE public.admin_notification_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read admin_notification_dismissals" ON public.admin_notification_dismissals;
CREATE POLICY "Allow authenticated read admin_notification_dismissals"
  ON public.admin_notification_dismissals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated write admin_notification_dismissals" ON public.admin_notification_dismissals;
CREATE POLICY "Allow authenticated write admin_notification_dismissals"
  ON public.admin_notification_dismissals FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update admin_notification_dismissals" ON public.admin_notification_dismissals;
CREATE POLICY "Allow authenticated update admin_notification_dismissals"
  ON public.admin_notification_dismissals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
