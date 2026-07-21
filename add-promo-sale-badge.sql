-- Lets a promo code put a sale ribbon on the products it targets.
--
-- Run once against the project database. Safe to re-run.
--
-- show_sale_badge  opt-in per promo. Off by default so existing promos are
--                  unchanged and nothing appears on the catalog unexpectedly.
-- badge_style      which preset wording to use: 'code' | 'save' | 'limited' | 'custom'
-- badge_text       the literal ribbon text, used only when badge_style = 'custom'
--
-- Note: a promo with hidden = true never renders a badge regardless of these
-- columns. Hidden codes are private, and badging their products on the public
-- catalog would defeat the point.

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS show_sale_badge boolean NOT NULL DEFAULT false;

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS badge_style text NOT NULL DEFAULT 'code';

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS badge_text text;

ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_badge_style_check;

ALTER TABLE public.promo_codes
  ADD CONSTRAINT promo_codes_badge_style_check
  CHECK (badge_style IN ('code', 'save', 'limited', 'custom'));

-- The catalog looks up badge-eligible promos on every load, so index the
-- narrow set that can actually produce one.
CREATE INDEX IF NOT EXISTS idx_promo_codes_sale_badge
  ON public.promo_codes(show_sale_badge)
  WHERE show_sale_badge = true AND is_active = true AND hidden = false;
