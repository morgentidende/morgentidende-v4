create table if not exists public.manual_chat_media_upload_jobs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  token_hash text not null,
  payload_base64 text,
  mime_type text not null,
  file_name text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','done','failed','expired')),
  asset_id uuid references public.media_assets(id) on delete set null,
  result jsonb,
  last_error text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  consumed_at timestamptz
);

alter table public.manual_chat_media_upload_jobs enable row level security;
revoke all on table public.manual_chat_media_upload_jobs from anon, authenticated;
grant select, insert, update, delete on table public.manual_chat_media_upload_jobs to service_role;

create index if not exists manual_chat_media_upload_jobs_expiry_idx
  on public.manual_chat_media_upload_jobs(status, expires_at);
