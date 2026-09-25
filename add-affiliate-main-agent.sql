alter table if exists public.affiliates
  add column if not exists handling_agent_id uuid;

create index if not exists idx_affiliates_handling_agent_id
  on public.affiliates (handling_agent_id);

comment on column public.affiliates.handling_agent_id is
  'Main sales agent responsible for handling orders and CRM follow-up for this affiliate.';
