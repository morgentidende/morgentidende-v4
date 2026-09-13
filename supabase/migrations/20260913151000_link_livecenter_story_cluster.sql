alter table public.live_centers
  add column if not exists story_cluster_id uuid references public.story_clusters(id) on delete set null;

create or replace view public.v4_public_live_centers with (security_invoker=true) as
select id, slug, label, title, deck, status, starts_at, ends_at, key_points, result_data, result_updated_at, source_label, source_url, updated_at, story_cluster_id
from public.live_centers
where homepage_active = true and status in ('scheduled','live') and starts_at <= now() and (ends_at is null or ends_at > now());

grant select on public.v4_public_live_centers to anon, authenticated;
