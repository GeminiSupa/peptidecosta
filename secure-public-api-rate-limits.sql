-- Durable, atomic abuse limits for public service-consuming API routes.
-- Apply this migration before deploying the matching application code.

alter table public.orders
  add column if not exists inventory_deducted jsonb;

create table if not exists public.api_rate_limits (
  bucket text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (bucket, key_hash, window_started_at)
);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
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

  insert into public.api_rate_limits (
    bucket, key_hash, window_started_at, request_count, updated_at
  ) values (
    left(p_bucket, 100), left(p_key_hash, 128), v_window_start, 1, v_now
  )
  on conflict (bucket, key_hash, window_started_at)
  do update set
    request_count = public.api_rate_limits.request_count + 1,
    updated_at = excluded.updated_at
  returning request_count into v_count;

  v_retry_after := greatest(
    1,
    ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer
  );

  -- Opportunistic cleanup prevents an unbounded table without a cron job.
  if random() < 0.01 then
    delete from public.api_rate_limits
      where updated_at < v_now - interval '2 days';
  end if;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_retry_after;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;
