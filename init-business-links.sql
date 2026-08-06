-- init-business-links.sql
-- Run this script in the Supabase SQL Editor to initialize the business_links settings.

INSERT INTO public.site_settings (id, value)
VALUES (
  'business_links',
  '{
    "whatsappNumber": "50660626224",
    "whatsappDisplay": "+506 6062 6224",
    "googleMapsUrl": "https://maps.app.goo.gl/jJCMHBM8aPXx67G3A",
    "facebookUrl": "",
    "instagramUrl": "",
    "trustpilotUrl": "https://www.trustpilot.com/review/peptidescostarica.net",
    "trustpilotUrlEn": "https://www.trustpilot.com/review/peptidescostarica.net",
    "trustpilotUrlEs": "https://es.trustpilot.com/review/peptidescostarica.net",
    "googleReviewUrl": "https://maps.app.goo.gl/jJCMHBM8aPXx67G3A",
    "supportEmail": "support@peptidescostarica.net"
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
