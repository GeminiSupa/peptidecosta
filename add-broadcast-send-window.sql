-- The hours a one-time announcement is allowed to send, in Costa Rica time.
--
-- Pacing a send slowly is right for 1,500 recipients and wrong for a night:
-- spread over thirteen hours, a broadcast started in the afternoon runs until
-- dawn and buzzes phones at 3am. That earns spam reports, and spam reports are
-- what actually get a WhatsApp number restricted.
--
-- Whole hours 0-23 in CR wall time (UTC-6, no DST). Inclusive of the start,
-- exclusive of the end: 8 and 20 means the first message may go at 08:00 and
-- the last before 20:00. A window may wrap midnight if anyone ever wants it.
--
-- Both NULL means no restriction, which is how every existing broadcast
-- behaves, so nothing needs backfilling.
--
-- Safe to run more than once. Adds two nullable columns and touches no rows.

ALTER TABLE public.scheduled_broadcasts
  ADD COLUMN IF NOT EXISTS send_window_start_hour INTEGER,
  ADD COLUMN IF NOT EXISTS send_window_end_hour INTEGER;

COMMENT ON COLUMN public.scheduled_broadcasts.send_window_start_hour IS
  'First Costa Rica hour (0-23) this broadcast may send in. NULL means no restriction.';
COMMENT ON COLUMN public.scheduled_broadcasts.send_window_end_hour IS
  'Costa Rica hour (0-23) sending stops at, exclusive. NULL means no restriction.';

NOTIFY pgrst, 'reload schema';
