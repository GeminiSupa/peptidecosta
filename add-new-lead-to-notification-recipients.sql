-- Alter public.notification_recipients to carry the "new lead" alert flag.
--
-- The application has shipped support for this all along: the API reads and
-- writes new_lead, Team Management renders the tickbox, and
-- getLeadNotificationRecipients queries it. Only the column was never created,
-- so every one of those paths quietly took its "migration has not run yet"
-- branch and the tickbox did nothing at all.
--
-- IMPORTANT — this migration changes where lead emails go. While the column is
-- absent, getLeadNotificationRecipients reports the managed list unavailable and
-- falls back to the LEAD_NOTIFICATION_TO environment variable. The moment the
-- column exists the table becomes the whole answer and that variable is no
-- longer read. The seed below therefore reproduces the current env list
-- (omerforce@gmail.com, info@peptidescostarica.net) so nobody who is being
-- alerted today stops being alerted the second this runs. The variable itself is
-- left in place, untouched; it simply stops being consulted.
ALTER TABLE public.notification_recipients
  ADD COLUMN IF NOT EXISTS new_lead BOOLEAN NOT NULL DEFAULT false;

UPDATE public.notification_recipients
SET new_lead = true
WHERE channel = 'email'
  AND lower(destination) IN ('omerforce@gmail.com', 'info@peptidescostarica.net');

CREATE INDEX IF NOT EXISTS notification_recipients_new_lead_idx
  ON public.notification_recipients (channel, new_lead)
  WHERE active;
