create or replace function public.normalize_editorial_source_domain(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(btrim(coalesce(p_value,''))), '^https?://', ''),
        '^www[.]', ''
      ),
      '[/?:#].*$', ''
    ),
    ''
  );
$$;

create or replace function public.upsert_editorial_source_registry(p_updates jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_domain text;
  v_name text;
  v_class text;
  v_region text;
  v_rationale text;
  v_discovered_via text;
  v_count integer := 0;
begin
  if p_updates is null then return 0; end if;
  if jsonb_typeof(p_updates) <> 'array' then raise exception 'source_registry_updates_must_be_array'; end if;
  if jsonb_array_length(p_updates) > 50 then raise exception 'source_registry_updates_too_many'; end if;

  for item in select value from jsonb_array_elements(p_updates)
  loop
    if jsonb_typeof(item) <> 'object' then raise exception 'source_registry_update_must_be_object'; end if;
    v_domain := public.normalize_editorial_source_domain(coalesce(item->>'domain', item->>'url'));
    v_name := nullif(btrim(coalesce(item->>'source_name', item->>'publisher', v_domain)), '');
    v_class := lower(nullif(btrim(item->>'classification'), ''));
    v_region := nullif(btrim(item->>'region'), '');
    v_rationale := nullif(btrim(item->>'rationale'), '');
    v_discovered_via := nullif(btrim(item->>'discovered_via'), '');

    if v_domain is null or v_domain !~ '^[a-z0-9.-]+[.][a-z]{2,}$' then raise exception 'invalid_source_registry_domain'; end if;
    if v_name is null then raise exception 'source_registry_name_required'; end if;
    if v_class not in ('authoritative','discovery_only') then raise exception 'invalid_source_registry_classification'; end if;

    insert into public.editorial_source_registry
      (domain,source_name,classification,region,rationale,discovered_via,decision_origin,editor_locked,updated_at)
    values
      (v_domain,v_name,v_class,v_region,v_rationale,v_discovered_via,'automation',false,clock_timestamp())
    on conflict (domain) do update
      set source_name = excluded.source_name,
          classification = case when public.editorial_source_registry.editor_locked then public.editorial_source_registry.classification else excluded.classification end,
          region = coalesce(excluded.region, public.editorial_source_registry.region),
          rationale = case when public.editorial_source_registry.editor_locked then public.editorial_source_registry.rationale else coalesce(excluded.rationale, public.editorial_source_registry.rationale) end,
          discovered_via = coalesce(excluded.discovered_via, public.editorial_source_registry.discovered_via),
          decision_origin = case when public.editorial_source_registry.editor_locked then public.editorial_source_registry.decision_origin else 'automation' end,
          updated_at = clock_timestamp();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.upsert_editorial_source_registry(jsonb) from public;
grant execute on function public.upsert_editorial_source_registry(jsonb) to service_role;

create or replace function public.editorial_source_classification(p_source jsonb)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_explicit text := lower(coalesce(p_source->>'source_type',p_source->>'quality_tier',''));
  v_publisher text := lower(coalesce(p_source->>'publisher',''));
  v_url text := coalesce(p_source->>'url','');
  v_host text := public.normalize_editorial_source_domain(v_url);
  v_class text;
begin
  if v_explicit in ('reference','image','media_reference') then return 'reference'; end if;

  if v_host is not null then
    select r.classification into v_class
    from public.editorial_source_registry r
    where v_host = r.domain or v_host like '%.' || r.domain
    order by char_length(r.domain) desc
    limit 1;
    if v_class is not null then return v_class; end if;
  end if;

  if v_host ~ '(^|[.])(gov[.][a-z.]+|gob[.][a-z.]+|government[.][a-z.]+|parliament[.][a-z.]+|police[.][a-z.]+|court[.][a-z.]+)$'
     or v_host ~ '(^|[.])(gov[.]uk|ft[.]dk|bundestag[.]de|europa[.]eu|ec[.]europa[.]eu|echr[.]coe[.]int|justice[.]gov|treasury[.]gov|judiciary[.]uk|cps[.]gov[.]uk|forsvaret[.]dk|fmn[.]dk|politi[.]dk|pet[.]dk|fe-ddis[.]dk|stm[.]dk|um[.]dk|domstol[.]dk|retsinformation[.]dk|brs[.]dk|sst[.]dk|ssi[.]dk|dst[.]dk|skat[.]dk|nyidanmark[.]dk)$'
     or v_publisher ~ '(ministry|ministeriet|ministerium|department of|government|regering|parliament|folketing|bundestag|court|domstol|judiciary|police|politi|prosecution|statsadvokat|statistics|statistik|election authority|valgkommission|electoral commission|treasury|central bank|kommune|council|inspectorate|embassy|prime minister|president|white house|forsvarskommandoen|forsvaret|forsvarsministeriet|udenrigsministeriet|statsministeriet|rigspolitiet)' then
    return 'authoritative';
  end if;

  if coalesce((p_source->>'subject_is_source')::boolean,false)
     and v_explicit in ('primary_original','original_post','social_post','original_document','subject_statement') then
    return 'authoritative';
  end if;

  return 'discovery_only';
end;
$$;

do $$
begin
  if public.normalize_editorial_source_domain('https://www.example.com/path') <> 'example.com' then
    raise exception 'source registry regression: domain normalization failed';
  end if;
  if public.upsert_editorial_source_registry(jsonb_build_array(jsonb_build_object(
    'source_name','Temporary Regex Regression',
    'domain','registry-regression.example',
    'classification','discovery_only',
    'region','selftest'
  ))) <> 1 then
    raise exception 'source registry regression: valid domain rejected';
  end if;
  delete from public.editorial_source_registry where domain='registry-regression.example';
end;
$$;