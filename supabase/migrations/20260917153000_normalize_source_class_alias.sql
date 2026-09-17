-- Accept the source classification aliases already emitted by scheduled writers.
-- Canonical output remains authoritative/reference/discovery_only.
create or replace function public.editorial_source_classification(p_source jsonb)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_explicit text := lower(coalesce(
    p_source->>'source_class',
    p_source->>'class',
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

  if v_host is not null then
    select r.classification into v_class
    from public.editorial_source_registry r
    where v_host = r.domain or v_host like '%.' || r.domain
    order by char_length(r.domain) desc
    limit 1;
    if v_class is not null then return v_class; end if;
  end if;

  if v_explicit in ('authoritative','primary_official','official','authority','government','court','police','statistics','wire_service','major_media') then
    return 'authoritative';
  end if;

  if v_host ~ '(^|[.])(gov[.][a-z.]+|gob[.][a-z.]+|gouv[.][a-z.]+|government[.][a-z.]+|parliament[.][a-z.]+|police[.][a-z.]+|court[.][a-z.]+|admin[.][a-z.]+)$'
     or v_host ~ '(^|[.])(gov[.]uk|ft[.]dk|bundestag[.]de|europa[.]eu|ec[.]europa[.]eu|echr[.]coe[.]int|justice[.]gov|treasury[.]gov|judiciary[.]uk|cps[.]gov[.]uk|forsvaret[.]dk|fmn[.]dk|politi[.]dk|pet[.]dk|fe-ddis[.]dk|stm[.]dk|um[.]dk|domstol[.]dk|retsinformation[.]dk|brs[.]dk|sst[.]dk|ssi[.]dk|dst[.]dk|skat[.]dk|nyidanmark[.]dk|eustat[.]eus|irekia[.]euskadi[.]eus)$'
     or v_host ~ '(^|[.])euskadi[.]eus$'
     or v_publisher ~ '(ministry|ministeriet|ministerium|department of|government|regering|parliament|folketing|bundestag|court|domstol|judiciary|police|politi|prosecution|statsadvokat|statistics|statistik|election authority|valgkommission|electoral commission|treasury|central bank|kommune|council|inspectorate|embassy|prime minister|president|white house|forsvarskommandoen|forsvaret|forsvarsministeriet|udenrigsministeriet|statsministeriet|rigspolitiet|eustat|baskerlandets regering)' then
    return 'authoritative';
  end if;

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

comment on function public.editorial_source_classification(jsonb) is
  'Normalizes source classification aliases (source_class/class/source_type/quality_tier/type), then registry/domain/publisher heuristics.';
