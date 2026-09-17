-- Consolidate four tightly-coupled editorial BEFORE triggers into one ordered contract.
-- This keeps the existing semantics and error messages while making ownership explicit:
-- normalize topic_key first, then validate category/kind, magazine topic invariants,
-- and finally follow-up metadata.

create or replace function public.apply_article_editorial_contract()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_meta_key text;
  v_col_key text;
  v_category_slug text;
  v_requires_current_contract boolean := false;
  v_admin boolean := coalesce(current_setting('morgentidende.topic_key_admin', true) = '1', false);
  v_error text;
begin
  -- 1. Canonical topic_key synchronization.
  v_meta_key := nullif(public.normalize_story_key(coalesce(new.editorial_metadata,'{}'::jsonb)->>'topic_key'), '');
  v_col_key := nullif(public.normalize_story_key(new.topic_key), '');

  if tg_op = 'UPDATE' and new.topic_key is distinct from old.topic_key then
    new.topic_key := v_col_key;
    if v_col_key is null then
      new.editorial_metadata := coalesce(new.editorial_metadata,'{}'::jsonb) - 'topic_key';
    else
      new.editorial_metadata := jsonb_set(coalesce(new.editorial_metadata,'{}'::jsonb), '{topic_key}', to_jsonb(v_col_key), true);
    end if;
  elsif v_meta_key is not null then
    new.topic_key := v_meta_key;
    new.editorial_metadata := jsonb_set(coalesce(new.editorial_metadata,'{}'::jsonb), '{topic_key}', to_jsonb(v_meta_key), true);
  elsif v_col_key is not null then
    new.topic_key := v_col_key;
    new.editorial_metadata := jsonb_set(coalesce(new.editorial_metadata,'{}'::jsonb), '{topic_key}', to_jsonb(v_col_key), true);
  end if;

  -- 2. Viden/Liv must use magazine kind under the current contract.
  -- The legacy trigger also enforced the current-kind contract when category_id
  -- was NULL (because SQL NULL made its early-return predicate non-true), so the
  -- consolidated version preserves that edge-case instead of becoming looser.
  select lower(c.slug) into v_category_slug
  from public.categories c
  where c.id = new.category_id;

  if v_category_slug is null or v_category_slug in ('viden', 'liv') then
    if tg_op = 'INSERT' then
      v_requires_current_contract := true;
    else
      if new.kind is distinct from old.kind
         or new.category_id is distinct from old.category_id then
        v_requires_current_contract := true;
      end if;

      if old.status is distinct from new.status
         and new.status in ('scheduled'::public.article_status, 'published'::public.article_status) then
        v_requires_current_contract := true;
      end if;
    end if;

    if v_requires_current_contract
       and new.kind is distinct from 'magazine'::public.article_kind then
      if tg_op = 'UPDATE'
         and old.status is distinct from new.status
         and new.status in ('scheduled'::public.article_status, 'published'::public.article_status) then
        raise exception 'legacy_magazine_reactivation_requires_migration';
      end if;
      raise exception 'kind_category_conflict';
    end if;
  end if;

  -- 3. Active magazines require an immutable topic_key unless an explicit
  -- admin migration context has been enabled.
  if new.kind = 'magazine'::public.article_kind then
    if new.status in ('scheduled'::public.article_status, 'published'::public.article_status)
       and nullif(trim(new.topic_key), '') is null then
      raise exception 'magazine_topic_key_required';
    end if;

    if tg_op = 'UPDATE'
       and old.kind = 'magazine'::public.article_kind
       and old.status in ('scheduled'::public.article_status, 'published'::public.article_status)
       and new.kind = 'magazine'::public.article_kind
       and new.status in ('scheduled'::public.article_status, 'published'::public.article_status)
       and new.topic_key is distinct from old.topic_key
       and not v_admin then
      raise exception 'magazine_topic_key_immutable';
    end if;
  end if;

  -- 4. Follow-up/story-cluster metadata is validated against the normalized key.
  v_error := public.article_followup_validation_error(
    new.id,
    new.kind,
    new.story_cluster_id,
    new.topic_key,
    new.editorial_metadata
  );

  if v_error is not null then
    raise exception '%', v_error;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_00_sync_article_topic_key on public.articles;
drop trigger if exists trg_01_validate_article_category_kind on public.articles;
drop trigger if exists trg_02_validate_active_magazine_topic_key on public.articles;
drop trigger if exists trg_03_validate_article_followup_metadata on public.articles;

drop function if exists public.sync_article_topic_key();
drop function if exists public.enforce_article_category_kind();
drop function if exists public.enforce_active_magazine_topic_key();
drop function if exists public.validate_article_followup_metadata();

create trigger trg_00_apply_article_editorial_contract
before insert or update of
  topic_key,
  editorial_metadata,
  kind,
  category_id,
  status,
  story_cluster_id
on public.articles
for each row
execute function public.apply_article_editorial_contract();

comment on function public.apply_article_editorial_contract() is
  'Single ordered owner for article topic-key normalization, Viden/Liv kind rules, magazine topic invariants and follow-up metadata validation.';
