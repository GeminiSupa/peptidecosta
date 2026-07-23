-- Spanish variant for custom ribbon wording. English lives in badge_text;
-- each language falls back to the other when one is empty.
-- Safe to re-run.
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS badge_text_es text;
