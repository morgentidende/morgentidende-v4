create extension if not exists pgcrypto;

create type public.article_status as enum ('draft','scheduled','published','unpublished');
create type public.article_kind as enum ('news','comment','debate','magazine');
create type public.article_relation_type as enum ('direct_related','follow_up','background','reaction');

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  section_kind text not null default 'news',
  nav_visible boolean not null default true,
  is_magazine boolean not null default false,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.story_clusters (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind public.article_kind not null default 'news',
  status public.article_status not null default 'draft',
  category_id uuid references public.categories(id) on delete set null,
  story_cluster_id uuid references public.story_clusters(id) on delete set null,

  headline text not null,
  frontpage_headline text,
  headline_accent_text text,
  deck text,
  body_markdown text not null default '',

  author_name text,
  author_title text,
  author_portrait_url text,

  hero_url text,
  hero_alt text,
  hero_source_url text,
  hero_candidate_url text,
  hero_candidate_note text,
  hero_credit text,
  hero_license text,
  hero_license_url text,

  is_lead boolean not null default false,
  lead_rank integer,
  is_breaking boolean not null default false,
  breaking_last_update_at timestamptz,
  breaking_until timestamptz,

  publish_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,

  created_by text not null default 'chat_manual',
  source_metadata jsonb not null default '[]'::jsonb,
  editorial_metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint deck_length_reasonable check (deck is null or char_length(deck) <= 300),
  constraint headline_accent_short check (headline_accent_text is null or array_length(regexp_split_to_array(trim(headline_accent_text), '\s+'), 1) <= 7),
  constraint breaking_requires_window check (not is_breaking or breaking_until is not null)
);

create index articles_status_publish_idx on public.articles(status, publish_at desc);
create index articles_published_idx on public.articles(published_at desc) where status = 'published';
create index articles_category_idx on public.articles(category_id, published_at desc);
create index articles_cluster_idx on public.articles(story_cluster_id, published_at desc);
create index articles_breaking_idx on public.articles(breaking_until desc) where is_breaking = true;

create table public.article_relations (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  related_article_id uuid not null references public.articles(id) on delete cascade,
  relation_type public.article_relation_type not null default 'direct_related',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  constraint no_self_relation check (article_id <> related_article_id),
  unique(article_id, related_article_id, relation_type)
);

create index article_relations_article_idx on public.article_relations(article_id, sort_order);

create table public.article_versions (
  id bigint generated always as identity primary key,
  article_id uuid not null references public.articles(id) on delete cascade,
  version_data jsonb not null,
  changed_at timestamptz not null default now()
);

create index article_versions_article_idx on public.article_versions(article_id, changed_at desc);

create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.site_settings(key, value) values
  ('autopublish_enabled', 'true'::jsonb),
  ('breaking_window_minutes', '120'::jsonb)
on conflict (key) do nothing;

insert into public.categories(slug, name, section_kind, nav_visible, is_magazine, sort_order) values
  ('indland','Indland','news',true,false,10),
  ('udland','Udland','news',true,false,20),
  ('penge','Penge','news',true,false,30),
  ('kultur','Kultur','news',true,false,40),
  ('viden','Viden','magazine',true,true,50),
  ('liv','Liv','magazine',true,true,60),
  ('kommentar','Kommentar','comment',false,false,70)
on conflict (slug) do nothing;

create table public.reader_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  subscription_status text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger categories_set_updated_at before update on public.categories
for each row execute function public.set_updated_at();
create trigger clusters_set_updated_at before update on public.story_clusters
for each row execute function public.set_updated_at();
create trigger articles_set_updated_at before update on public.articles
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.reader_profiles
for each row execute function public.set_updated_at();

create or replace function public.snapshot_article_version()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.article_versions(article_id, version_data)
  values (old.id, to_jsonb(old));
  return new;
end;
$$;

create trigger articles_snapshot_before_update
before update on public.articles
for each row execute function public.snapshot_article_version();

create or replace function public.handle_new_reader()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reader_profiles(id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_reader();

alter table public.categories enable row level security;
alter table public.story_clusters enable row level security;
alter table public.articles enable row level security;
alter table public.article_relations enable row level security;
alter table public.article_versions enable row level security;
alter table public.site_settings enable row level security;
alter table public.reader_profiles enable row level security;

create policy categories_public_read on public.categories
for select to anon, authenticated
using (active = true);

create policy clusters_public_read on public.story_clusters
for select to anon, authenticated
using (active = true);

create policy articles_public_read on public.articles
for select to anon, authenticated
using (
  status = 'published'
  and published_at is not null
  and published_at <= now()
);

create policy relations_public_read on public.article_relations
for select to anon, authenticated
using (
  exists (
    select 1 from public.articles a
    where a.id = article_id
      and a.status = 'published'
      and a.published_at is not null
      and a.published_at <= now()
  )
  and exists (
    select 1 from public.articles ra
    where ra.id = related_article_id
      and ra.status = 'published'
      and ra.published_at is not null
      and ra.published_at <= now()
  )
);

create policy reader_profile_self_read on public.reader_profiles
for select to authenticated
using (auth.uid() = id);

create policy reader_profile_self_update on public.reader_profiles
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
