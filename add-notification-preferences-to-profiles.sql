-- =========================================================================
--        PEPTIDES COSTA RICA - PER-MEMBER NOTIFICATION PREFERENCES
-- =========================================================================
-- Run this in your Supabase SQL Editor.
--
-- Adds the switches shown in Team Management when adding or editing a member:
--
--   notifications_enabled         master switch. Off = this member gets no
--                                 notifications at all: no bell, no email,
--                                 no WhatsApp.
--   order_email_notifications     the "New Order Received" email. Already
--                                 exists if you ran the earlier migration;
--                                 the IF NOT EXISTS below makes rerunning safe.
--   order_whatsapp_notifications  new-order WhatsApp alert. Opt-IN: it stays
--                                 off until you switch it on for someone, so
--                                 running this migration sends nothing new.
--   whatsapp_number               where that alert goes. Without a number the
--                                 WhatsApp switch does nothing.
--
-- Safe to run more than once.

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS order_email_notifications BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS order_whatsapp_notifications BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
