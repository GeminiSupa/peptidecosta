-- =========================================================================
--   PEPTIDES COSTA RICA - CHECKOUT LOCKOUT FIX + EXCHANGE RATE LOCK
-- =========================================================================
-- Run this in the Supabase SQL Editor BEFORE the matching code is deployed.
--
-- Two unrelated problems, one file, because both are one-time SQL:
--
--   1. A customer could be locked out of checkout for 24 hours by attempts
--      that never saved an order. The counter was incremented before the
--      order was validated, so a refused attempt cost the customer a slot.
--      The new code counts a slot only once an order row actually exists,
--      which needs a way to read a counter without incrementing it.
--
--   2. site_settings.exchange_rate priced the whole storefront and was
--      writable by any authenticated account. Customer signups are self
--      serve, so that was open to anyone. The rate is only ever written by
--      the server (service role, which bypasses RLS), so no legitimate
--      caller loses anything by locking the row.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. Read a rate-limit counter without consuming from it.
-- -------------------------------------------------------------------------
-- Mirrors consume_api_rate_limit exactly, minus the write. The window is
-- computed the same way so both functions always agree on which row they
-- are talking about.
create or replace function public.peek_api_rate_limit(
  p_bucket text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
  v_retry_after integer;
begin
  if coalesce(length(p_bucket), 0) < 1
     or coalesce(length(p_key_hash), 0) < 32
     or p_limit < 1
     or p_window_seconds < 1 then
    raise exception 'Invalid rate-limit parameters';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  select l.request_count into v_count
    from public.api_rate_limits l
   where l.bucket = left(p_bucket, 100)
     and l.key_hash = left(p_key_hash, 128)
     and l.window_started_at = v_window_start;

  v_count := coalesce(v_count, 0);

  v_retry_after := greatest(
    1,
    ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer
  );

  -- Strictly less than: consume() allows when the count AFTER incrementing is
  -- within the limit, so the equivalent test before incrementing is `<`.
  return query select
    v_count < p_limit,
    greatest(0, p_limit - v_count),
    v_retry_after;
end;
$$;

revoke all on function public.peek_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.peek_api_rate_limit(text, text, integer, integer) to service_role;


-- -------------------------------------------------------------------------
-- 2. Settings are for staff, and the exchange rate is for nobody.
-- -------------------------------------------------------------------------
-- The old policy was `USING (true) TO authenticated`, which read as "staff"
-- and meant "anyone holding a login". Customer signup is self serve, so that
-- was the whole internet: sign up, rewrite site_settings.exchange_rate, and
-- every colón price on the storefront moves. The 300-800 plausibility band
-- was the only thing standing in the way, and 300 against a real rate of 448
-- is a third off the shop.
--
-- Two tests, because they answer two different questions:
--
--   is_admin_user()        who may write settings at all. True for a dashboard
--                          profile that is not pending or suspended, false for
--                          a customer account. Every browser write to this
--                          table is in the admin panel, so nothing legitimate
--                          loses access.
--   id <> 'exchange_rate'  which rows a person may write. Nobody hand-edits
--                          the rate, staff included: it is fetched hourly from
--                          the FX providers and written by the server under
--                          the service role, which bypasses RLS entirely.
--
-- WITH CHECK repeats both so a row cannot be renamed into 'exchange_rate'
-- after the fact to get around the USING clause.
drop policy if exists "Allow authenticated write access to settings" on public.site_settings;

create policy "Allow authenticated write access to settings"
on public.site_settings
for all
to authenticated
using (public.is_admin_user() and id <> 'exchange_rate')
with check (public.is_admin_user() and id <> 'exchange_rate');


-- -------------------------------------------------------------------------
-- 3. Confirm both changes took.
-- -------------------------------------------------------------------------
select
  'peek_api_rate_limit executable by service_role only' as check,
  has_function_privilege('service_role', 'public.peek_api_rate_limit(text,text,integer,integer)', 'execute') as service_role,
  has_function_privilege('authenticated', 'public.peek_api_rate_limit(text,text,integer,integer)', 'execute') as authenticated,
  has_function_privilege('anon', 'public.peek_api_rate_limit(text,text,integer,integer)', 'execute') as anon;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'site_settings'
order by policyname;
