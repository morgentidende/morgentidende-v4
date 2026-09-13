create table if not exists public.live_centers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  title text not null,
  deck text,
  status text not null default 'live' check (status in ('scheduled','live','ended')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  homepage_active boolean not null default false,
  key_points text[] not null default '{}',
  result_data jsonb not null default '{}'::jsonb,
  result_updated_at timestamptz,
  source_label text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_updates (
  id uuid primary key default gen_random_uuid(),
  live_center_id uuid not null references public.live_centers(id) on delete cascade,
  published_at timestamptz not null default now(),
  headline text not null,
  body text not null,
  source_metadata jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.live_centers enable row level security;
alter table public.live_updates enable row level security;

create policy "public read active live centers" on public.live_centers for select to anon, authenticated using (homepage_active = true and status in ('scheduled','live') and starts_at <= now() and (ends_at is null or ends_at > now()));
create policy "public read live updates" on public.live_updates for select to anon, authenticated using (exists (select 1 from public.live_centers c where c.id = live_center_id and c.homepage_active = true and c.status in ('scheduled','live') and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())));

grant select on public.live_centers to anon, authenticated;
grant select on public.live_updates to anon, authenticated;

create or replace view public.v4_public_live_centers with (security_invoker=true) as
select id, slug, label, title, deck, status, starts_at, ends_at, key_points, result_data, result_updated_at, source_label, source_url, updated_at
from public.live_centers
where homepage_active = true and status in ('scheduled','live') and starts_at <= now() and (ends_at is null or ends_at > now());

create or replace view public.v4_public_live_updates with (security_invoker=true) as
select u.id, u.live_center_id, u.published_at, u.headline, u.body
from public.live_updates u
join public.live_centers c on c.id = u.live_center_id
where c.homepage_active = true and c.status in ('scheduled','live') and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now());

grant select on public.v4_public_live_centers to anon, authenticated;
grant select on public.v4_public_live_updates to anon, authenticated;
