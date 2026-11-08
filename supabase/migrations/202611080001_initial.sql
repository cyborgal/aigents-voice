-- AIGents Voice: one authenticated user owns one business in this MVP.
-- Apply through the Supabase SQL editor or `supabase db push`.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key references auth.users(id) on delete cascade,
  officer_name text not null check (char_length(officer_name) between 1 and 120),
  business_email text not null check (char_length(business_email) <= 254),
  company_name text not null check (char_length(company_name) between 1 and 160),
  nmls_id text not null check (nmls_id ~ '^[0-9]{1,12}$'),
  business_phone text not null check (business_phone ~ '^\+[1-9][0-9]{7,14}$'),
  timezone text not null default 'America/Los_Angeles',
  calling_days integer[] not null default array[1,2,3,4,5],
  calling_start time not null default '09:00',
  calling_end time not null default '17:00',
  agent_name text not null default 'AIGents Assistant'
    check (char_length(agent_name) between 1 and 80),
  activation_status text not null default 'inactive'
    check (activation_status in ('inactive','pending','active','failed')),
  external_client_id text,
  integration_mode text not null default 'demo'
    check (integration_mode in ('demo','live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_calling_days check (
    cardinality(calling_days) between 1 and 7
    and calling_days <@ array[0,1,2,3,4,5,6]
    and array_position(calling_days, null) is null
  ),
  constraint valid_calling_hours check (calling_start < calling_end)
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text,
  prospect_name text,
  phone_masked text not null,
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  status text not null default 'queued'
    check (status in ('queued','ringing','in_progress','completed','failed','rejected','unknown')),
  outcome text,
  duration_seconds integer check (duration_seconds >= 0),
  summary text,
  transcript jsonb,
  recording_url text,
  mode text not null check (mode in ('demo','live')),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_id, mode)
);

create index calls_user_created_idx on public.calls(user_id, created_at desc);

-- Optional provider-supplied usage. Missing metrics remain NULL, never fabricated.
-- Each usage event must be incremental, not a cumulative account snapshot.
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  call_id uuid references public.calls(id) on delete set null,
  external_event_id text,
  minutes numeric(12,4) check (minutes >= 0),
  appointments_booked integer check (appointments_booked >= 0),
  mode text not null check (mode in ('demo','live')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, external_event_id, mode)
);

create index usage_events_user_occurred_idx on public.usage_events(user_id, occurred_at desc);

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated before update on public.profiles
for each row execute function public.set_updated_at();
create trigger businesses_updated before update on public.businesses
for each row execute function public.set_updated_at();
create trigger calls_updated before update on public.calls
for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Populate profiles if this migration is applied after accounts already exist.
insert into public.profiles(id, email, full_name)
select id, coalesce(email, ''), coalesce(raw_user_meta_data ->> 'full_name', '')
from auth.users on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.calls enable row level security;
alter table public.usage_events enable row level security;

create policy profiles_read_own on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy businesses_read_own on public.businesses for select to authenticated
using ((select auth.uid()) = id);
create policy calls_read_own on public.calls for select to authenticated
using ((select auth.uid()) = user_id);
create policy usage_read_own on public.usage_events for select to authenticated
using ((select auth.uid()) = user_id);

-- Mutations go through authenticated, validated server routes using service_role.
-- In particular the browser cannot mark an agent active or invent call records.
revoke all on public.profiles, public.businesses, public.calls, public.usage_events from anon, authenticated;
grant select on public.profiles, public.businesses, public.calls, public.usage_events to authenticated;
grant all on public.profiles, public.businesses, public.calls, public.usage_events to service_role;

-- Serialize reservations per user so rate limits also hold across server instances.
create function public.reserve_test_call(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_phone_masked text,
  p_mode text
)
returns setof public.calls
language plpgsql security definer set search_path = '' as $$
declare
  existing_call public.calls%rowtype;
  today_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if p_user_id is null or p_idempotency_key is null then
    raise exception 'User and idempotency key are required' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('demo', 'live') then
    raise exception 'Invalid integration mode' using errcode = '22023';
  end if;
  if p_phone_masked is null or char_length(p_phone_masked) not between 4 and 40 then
    raise exception 'Masked phone is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select * into existing_call from public.calls where idempotency_key = p_idempotency_key;
  if found then
    if existing_call.user_id <> p_user_id or existing_call.mode <> p_mode
       or existing_call.phone_masked <> p_phone_masked then
      raise exception 'Idempotency key conflicts with an existing request' using errcode = '22023';
    end if;
    return next existing_call;
    return;
  end if;

  if exists (select 1 from public.calls where user_id = p_user_id and created_at > now() - interval '60 seconds') then
    raise exception 'Please wait 60 seconds between test calls' using errcode = 'P0001';
  end if;
  if (select count(*) from public.calls where user_id = p_user_id and created_at >= today_start) >= 10 then
    raise exception 'Daily limit of 10 test calls reached; resets at midnight UTC' using errcode = 'P0001';
  end if;

  return query insert into public.calls(user_id, idempotency_key, phone_masked, mode, status)
    values (p_user_id, p_idempotency_key, p_phone_masked, p_mode, 'queued')
    returning *;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.reserve_test_call(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_test_call(uuid, uuid, text, text) to service_role;

commit;
