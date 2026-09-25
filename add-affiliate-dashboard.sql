-- =========================================================================
--            AFFILIATE DASHBOARD: LOGINS, ACCESS MODE, REQUESTS
-- =========================================================================
-- Run this in the Supabase SQL Editor BEFORE deploying the code that needs it.
-- Safe to run more than once.
--
-- What it does, in plain terms:
--   1. Lets an admin_profiles row be an 'affiliate' — an outside partner with
--      a login who is not on the team.
--   2. Records whether that affiliate may only look, or may also correct their
--      own contact details.
--   3. Adds the table behind the Requests tab, so an affiliate asking to
--      change their email waits for a superadmin instead of doing it.
--
-- Nothing here changes an existing row. Every current profile stays
-- tier='staff' with the access it has today.

-- -------------------------------------------------------------------------
-- 1. The affiliate tier
-- -------------------------------------------------------------------------
ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS admin_profiles_tier_check;
ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_tier_check
  CHECK (tier IN ('staff', 'sub_user', 'affiliate'));

-- The old rule read "sub_user has a parent, staff does not" and matched
-- nothing else, so an affiliate row could not be inserted at all. An affiliate
-- has no parent — they report to nobody, they are not on the team.
ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS sub_user_has_parent;
ALTER TABLE public.admin_profiles
  ADD CONSTRAINT sub_user_has_parent CHECK (
    (tier = 'sub_user' AND parent_agent_id IS NOT NULL)
    OR
    (tier IN ('staff', 'affiliate') AND parent_agent_id IS NULL)
  );

-- An affiliate is never a superadmin. Same guard as the sub-user one above,
-- and for the same reason: this is the row that would hand an outsider the
-- whole dashboard if it were ever set by mistake.
ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS affiliate_never_superadmin;
ALTER TABLE public.admin_profiles
  ADD CONSTRAINT affiliate_never_superadmin CHECK (
    NOT (tier = 'affiliate' AND is_superadmin = true)
  );

-- -------------------------------------------------------------------------
-- 2. Look-only, or look-and-correct-my-details
-- -------------------------------------------------------------------------
-- Anything with money on it — commission rate, amounts, payout status — is
-- read-only at BOTH levels. 'read_write' buys them their own WhatsApp number
-- and nothing more; an email change goes through section 3.
ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS affiliate_access TEXT NOT NULL DEFAULT 'read';

ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS admin_profiles_affiliate_access_check;
ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_affiliate_access_check
  CHECK (affiliate_access IN ('read', 'read_write'));

COMMENT ON COLUMN public.admin_profiles.affiliate_access IS
  'Affiliate dashboard mode: read = look only; read_write = may also correct own contact details. Never covers money.';

-- -------------------------------------------------------------------------
-- 3. Requests waiting on a superadmin
-- -------------------------------------------------------------------------
-- An affiliate''s email is two things at once: how they sign in, and where
-- payout notices go. Letting them change it themselves would let anyone who
-- got into the account quietly redirect the money, so it becomes a request.
-- Until it is approved, the old address keeps both jobs.
CREATE TABLE IF NOT EXISTS public.affiliate_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN ('email')),
  current_value TEXT,
  requested_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by_user_id UUID,
  requested_by_email TEXT,
  decided_by_email TEXT,
  decision_note TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One open request per affiliate per field, so a superadmin never answers two
-- versions of the same question.
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_change_requests_one_pending
  ON public.affiliate_change_requests(affiliate_id, field)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS affiliate_change_requests_status_idx
  ON public.affiliate_change_requests(status, created_at DESC);

-- Read and written only by the server. No policies = no browser access, which
-- matters more here than usual: the people this table is about have logins.
ALTER TABLE public.affiliate_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.affiliate_change_requests FROM anon, authenticated;

-- -------------------------------------------------------------------------
-- 4. Check it landed
-- -------------------------------------------------------------------------
--   SELECT tier, affiliate_access, count(*)
--     FROM public.admin_profiles GROUP BY 1, 2;
--   SELECT count(*) FROM public.affiliate_change_requests;
