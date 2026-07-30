-- init-business-links.sql
-- Run this script in the Supabase SQL Editor to initialize the business_links settings.

INSERT INTO public.site_settings (id, value)
VALUES (
  'business_links',
  '{
    "whatsappNumber": "50684046973",
    "whatsappDisplay": "+506 8404-6973",
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
