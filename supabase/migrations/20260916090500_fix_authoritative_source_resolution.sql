-- Narrow fix for false-negative source classification without reintroducing the old
-- multi-tier quality model. Registry decisions still win first.

create or replace function public.editorial_source_classification(p_source jsonb)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_explicit text := lower(coalesce(
    p_source->>'source_class',
    p_source->>'source_type',
    p_source->>'quality_tier',
    p_source->>'type',
    ''
  ));
  v_publisher text := lower(coalesce(p_source->>'publisher', p_source->>'name', ''));
  v_url text := coalesce(p_source->>'url','');
  v_host text := public.normalize_editorial_source_domain(v_url);
  v_class text;
begin
  if v_explicit in ('reference','image','media_reference') then return 'reference'; end if;

  -- Explicit registry rows are authoritative for known media. Editor-locked
  -- discovery_only decisions therefore cannot be overridden by payload hints.
  if v_host is not null then
    select r.classification into v_class
    from public.editorial_source_registry r
    where v_host = r.domain or v_host like '%.' || r.domain
    order by char_length(r.domain) desc
    limit 1;
    if v_class is not null then return v_class; end if;
  end if;

  -- Article-scoped producer hint. This does not write or upgrade the registry.
  if v_explicit in ('authoritative','primary_official','official','authority','government','court','police','statistics','wire_service','major_media') then
    return 'authoritative';
  end if;

  -- Small structural rule for official public bodies, including regional portals.
  if v_host ~ '(^|[.])(gov[.][a-z.]+|gob[.][a-z.]+|gouv[.][a-z.]+|government[.][a-z.]+|parliament[.][a-z.]+|police[.][a-z.]+|court[.][a-z.]+|admin[.][a-z.]+)$'
     or v_host ~ '(^|[.])(gov[.]uk|ft[.]dk|bundestag[.]de|europa[.]eu|ec[.]europa[.]eu|echr[.]coe[.]int|justice[.]gov|treasury[.]gov|judiciary[.]uk|cps[.]gov[.]uk|forsvaret[.]dk|fmn[.]dk|politi[.]dk|pet[.]dk|fe-ddis[.]dk|stm[.]dk|um[.]dk|domstol[.]dk|retsinformation[.]dk|brs[.]dk|sst[.]dk|ssi[.]dk|dst[.]dk|skat[.]dk|nyidanmark[.]dk|eustat[.]eus|irekia[.]euskadi[.]eus)$'
     or v_host ~ '(^|[.])euskadi[.]eus$'
     or v_publisher ~ '(ministry|ministeriet|ministerium|department of|government|regering|parliament|folketing|bundestag|court|domstol|judiciary|police|politi|prosecution|statsadvokat|statistics|statistik|election authority|valgkommission|electoral commission|treasury|central bank|kommune|council|inspectorate|embassy|prime minister|president|white house|forsvarskommandoen|forsvaret|forsvarsministeriet|udenrigsministeriet|statsministeriet|rigspolitiet|eustat|baskerlandets regering)' then
    return 'authoritative';
  end if;

  -- Wire identity belongs to the agency, not the syndicating portal/domain.
  if v_publisher ~ '(^|[^a-z])(dpa|reuters|associated press|ap|afp|ritzau|ritzaus bureau)([^a-z]|$)'
     or v_publisher ~ '(press agency|news agency|nyhedsbureau)' then
    return 'authoritative';
  end if;

  if coalesce((p_source->>'subject_is_source')::boolean,false)
     and v_explicit in ('primary_original','original_post','social_post','original_document','subject_statement') then
    return 'authoritative';
  end if;

  return 'discovery_only';
end;
$$;

insert into public.editorial_source_registry
  (domain,source_name,classification,region,rationale,decision_origin,editor_locked)
values
  ('handelsblatt.com','Handelsblatt','authoritative','Tyskland','Large established print newspaper','seed',false)
on conflict (domain) do update
set source_name = excluded.source_name,
    classification = case when public.editorial_source_registry.editor_locked then public.editorial_source_registry.classification else excluded.classification end,
    region = coalesce(excluded.region, public.editorial_source_registry.region),
    rationale = case when public.editorial_source_registry.editor_locked then public.editorial_source_registry.rationale else excluded.rationale end,
    updated_at = clock_timestamp();

-- Regression checks for the production false negatives.
do $$
begin
  if public.editorial_source_classification(jsonb_build_object(
       'url','https://es.eustat.eus/elementos/test',
       'name','Eustat / Baskerlandets sikkerhedsministerium',
       'type','primary'
     )) <> 'authoritative' then
    raise exception 'source classification regression: Eustat must be authoritative';
  end if;

  if public.editorial_source_classification(jsonb_build_object(
       'url','https://www.irekia.euskadi.eus/es/news/test',
       'name','Baskerlandets regering – Irekia',
       'type','primary'
     )) <> 'authoritative' then
    raise exception 'source classification regression: Irekia must be authoritative';
  end if;

  if public.editorial_source_classification(jsonb_build_object(
       'url','https://de.finance.yahoo.com/nachrichten/test',
       'publisher','dpa via Yahoo Finance'
     )) <> 'authoritative' then
    raise exception 'source classification regression: syndicated dpa must be authoritative';
  end if;

  if public.editorial_source_classification(jsonb_build_object(
       'url','https://www.handelsblatt.com/politik/test',
       'publisher','Handelsblatt'
     )) <> 'authoritative' then
    raise exception 'source classification regression: Handelsblatt must be authoritative';
  end if;
end;
$$;
