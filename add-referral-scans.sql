-- Records a visit that arrived from a referral link or QR code.
--
-- Run once against the project database. Safe to re-run.
--
-- Orders already carry sales_agent / affiliate attribution, so conversions are
-- known. What was missing is the other half: how many people arrived at all.
-- Without it there is no way to tell a QR that got 5 scans from one that got
-- 500 and converted badly.
--
-- One row per landing. No cookies, no personal data - just which referral, on
-- what kind of device, from roughly where.

CREATE TABLE IF NOT EXISTS public.referral_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_agent TEXT,
  referral TEXT,
  promo_code TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  session_id TEXT,
  is_first_visit BOOLEAN NOT NULL DEFAULT true,
  device_type TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.referral_scans ENABLE ROW LEVEL SECURITY;

-- Written server-side via the service role only; never read by the public app.
DROP POLICY IF EXISTS "Service role manages referral_scans" ON public.referral_scans;
CREATE POLICY "Service role manages referral_scans"
  ON public.referral_scans FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_referral_scans_agent
  ON public.referral_scans(sales_agent, created_at DESC)
  WHERE sales_agent IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_scans_campaign
  ON public.referral_scans(utm_campaign, created_at DESC)
  WHERE utm_campaign IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_scans_created
  ON public.referral_scans(created_at DESC);

-- One landing per session per referral. A shopper who reloads the catalog or
-- browses back and forth would otherwise inflate the scan count.
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_scans_unique_session
  ON public.referral_scans(session_id, COALESCE(sales_agent, ''), COALESCE(promo_code, ''))
  WHERE session_id IS NOT NULL;
