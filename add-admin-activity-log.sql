-- Activity log: what each account did, for the owner to read.
-- Run this BEFORE deploying the code that writes to it.
--
-- Why it exists: an affiliate was receiving the new-order alert for the whole
-- shop and there was no way to find out when it started or who put them on the
-- list, because nothing recorded account actions. The order history says "team
-- alert sent" and names nobody.
--
-- What goes in: actions, not keystrokes. Who did what, to what, when, from
-- where. Deliberately NOT clicks or typing — that would capture passwords as
-- people type them and customers' details in half-written messages, which is a
-- worse leak than the one this was built to answer.
--
-- Who can read it: superadmins, through /api/admin/activity-log. Row level
-- security is on with no policy at all, so the browser client cannot read a
-- single row however the query is written, and the route is the only way in.
--
-- How long it is kept: 90 days, trimmed nightly by the purge-recycle-bin cron.
-- A week was considered and rejected: the affiliate problem this was built for
-- had already been running 10 days when it was noticed.

create table if not exists admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),

  -- Who. Kept as plain text as well as the id, because the point of a log is
  -- to still read correctly after the account it describes has been deleted.
  actor_user_id uuid,
  actor_email text,
  actor_name text,
  actor_tier text,

  -- What. A dotted key from ADMIN_ACTIVITY_ACTIONS in
  -- src/lib/adminActivityLog.mjs, e.g. 'account.permissions_changed'.
  action text not null,

  -- What it was done to: 'order', 'customer', 'account', 'product',
  -- 'notification_recipient', 'payout', 'deal', 'promo', 'session'.
  subject_type text,
  subject_id text,
  -- The human name at the time — an order number, a product name, an email.
  -- Stored rather than looked up later, for the same reason as actor_email.
  subject_label text,

  -- The specific change: { field: { from, to } }, and nothing more. Never a
  -- whole row, so a log entry cannot become a second copy of customer data.
  detail jsonb,

  ip text,
  user_agent text
);

-- Reading the log is almost always "newest first", optionally for one person.
create index if not exists idx_admin_activity_log_at
  on admin_activity_log (at desc);
create index if not exists idx_admin_activity_log_actor
  on admin_activity_log (actor_email, at desc);
-- "What has happened to this order / this account?"
create index if not exists idx_admin_activity_log_subject
  on admin_activity_log (subject_type, subject_id, at desc);

-- No policies on purpose: nothing but the service role reads or writes this.
alter table admin_activity_log enable row level security;
