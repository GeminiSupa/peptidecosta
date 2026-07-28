-- =========================================================================
--            PEPTIDES COSTA RICA - ORDER EMAIL NOTIFICATIONS
-- =========================================================================
-- Run this in your Supabase SQL Editor.
--
-- Every agent in admin_profiles receives the "New Order Received" email by
-- default, so a newly created agent is subscribed the moment they are added.
-- Flip the flag to false to opt someone out.

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS order_email_notifications BOOLEAN NOT NULL DEFAULT true;

-- Agents who should not receive new-order emails.
UPDATE public.admin_profiles
SET order_email_notifications = false
WHERE lower(email) IN (
  'sean@peptidescostarica.net',
  'aziza@peptidescostarica.net'
);
