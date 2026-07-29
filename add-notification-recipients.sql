-- One place that answers "who gets told about a new order".
--
-- Before this, the answer was spread across three sources: the
-- ORDER_NOTIFICATION_TO environment variable (which is set but empty in
-- production, so a hardcoded fallback pair of addresses was actually in use),
-- a per-member email toggle on admin_profiles, and a per-member WhatsApp
-- toggle plus number on the same table. Nobody could see the whole list, and
-- alerting somebody who is not a login — an owner's second phone, say —
-- required inventing a team member for them.
--
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS notification_recipients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label        text NOT NULL,
  channel      text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  destination  text NOT NULL,
  new_order    boolean NOT NULL DEFAULT true,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- The same phone or address must not be listed twice, or every alert goes out
-- in duplicate. Case-insensitive so Info@… and info@… collide as they should.
CREATE UNIQUE INDEX IF NOT EXISTS notification_recipients_destination_key
  ON notification_recipients (channel, lower(destination));

ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;

-- Reached only through the admin API with the service role key, which bypasses
-- RLS. No policy is granted, so anon and authenticated clients see nothing.

-- ── Seed from what is live today, so switching over changes nobody's alerts ──

-- The two owner/ops inboxes the code falls back to when ORDER_NOTIFICATION_TO
-- is empty. Update these if that variable is ever given a real value.
INSERT INTO notification_recipients (label, channel, destination, new_order)
VALUES
  ('Owner inbox', 'email', 'omerforce@gmail.com', true),
  ('Ops inbox',   'email', 'info@peptidescostarica.net', true)
ON CONFLICT (channel, lower(destination)) DO NOTHING;

-- Every team member currently subscribed to order emails.
INSERT INTO notification_recipients (label, channel, destination, new_order)
SELECT
  COALESCE(p.name, p.email),
  'email',
  p.email,
  true
FROM admin_profiles p
WHERE p.email IS NOT NULL
  AND COALESCE(p.notifications_enabled, true) IS TRUE
  AND COALESCE(p.order_email_notifications, true) IS TRUE
ON CONFLICT (channel, lower(destination)) DO NOTHING;

-- Every team member currently opted in to order WhatsApp alerts. The column
-- holds a comma-separated list, so it is split into one row per number.
INSERT INTO notification_recipients (label, channel, destination, new_order)
SELECT
  COALESCE(p.name, p.email),
  'whatsapp',
  regexp_replace(entry, '\D', '', 'g'),
  true
FROM admin_profiles p
CROSS JOIN LATERAL unnest(string_to_array(COALESCE(p.whatsapp_number, ''), ',')) AS entry
WHERE COALESCE(p.notifications_enabled, true) IS TRUE
  AND p.order_whatsapp_notifications IS TRUE
  AND length(regexp_replace(entry, '\D', '', 'g')) BETWEEN 8 AND 15
ON CONFLICT (channel, lower(destination)) DO NOTHING;
