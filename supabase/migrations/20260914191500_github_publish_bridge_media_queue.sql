create or replace function public.enqueue_github_bridge_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_url text;
  v_rights jsonb;
begin
  if new.created_by <> 'chatgpt_scheduled_github_bridge' then
    return new;
  end if;

  v_source_url := coalesce(nullif(new.hero_candidate_url,''), nullif(new.hero_source_url,''));
  if v_source_url is null then
    return new;
  end if;

  v_rights := coalesce(new.editorial_metadata->'hero_rights', '{}'::jsonb);
  if coalesce((v_rights->>'commercial_use_allowed')::boolean, false) is not true
     or coalesce((v_rights->>'local_storage_allowed')::boolean, false) is not true then
    return new;
  end if;

  insert into public.media_ingest_jobs(article_id, payload)
  values (
    new.id,
    jsonb_strip_nulls(jsonb_build_object(
      'source_url', v_source_url,
      'source_provider', nullif(new.editorial_metadata->>'hero_source_provider',''),
      'license_name', new.hero_license,
      'license_url', new.hero_license_url,
      'credit_text', new.hero_credit,
      'rights_notes', new.hero_candidate_note,
      'commercial_use_allowed', true,
      'local_storage_allowed', true,
      'modifications_allowed', coalesce((v_rights->>'modifications_allowed')::boolean, false),
      'attribution_required', coalesce((v_rights->>'attribution_required')::boolean, false),
      'alt_text', new.hero_alt,
      'metadata', jsonb_build_object(
        'transport', 'github_pr_bridge',
        'queue_id', new.editorial_metadata->>'github_queue_id'
      )
    ))
  );

  return new;
end;
$$;

drop trigger if exists trg_enqueue_github_bridge_media on public.articles;
create trigger trg_enqueue_github_bridge_media
after insert on public.articles
for each row
execute function public.enqueue_github_bridge_media();

revoke all on function public.enqueue_github_bridge_media() from public, anon, authenticated;
grant execute on function public.enqueue_github_bridge_media() to service_role;
