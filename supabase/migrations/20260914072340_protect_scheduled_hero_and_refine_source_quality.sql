create or replace function public.classify_editorial_source(p_source jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_explicit text := lower(coalesce(p_source->>'source_type', p_source->>'quality_tier', ''));
  v_publisher text := lower(coalesce(p_source->>'publisher',''));
  v_url text := lower(coalesce(p_source->>'url',''));
  v_host text;
begin
  if v_explicit in ('primary_official','official','authority','government','court','police','statistics') then return 'primary_official'; end if;
  if v_explicit in ('primary_original','original_post','social_post','original_document','subject_statement') then return 'primary_original'; end if;
  if v_explicit in ('strong_secondary','major_media','wire_service') then return 'strong_secondary'; end if;
  if v_explicit in ('niche','advocacy','activist','tip_source') then return v_explicit; end if;
  if v_explicit in ('reference','image','media_reference') then return 'reference'; end if;

  v_host := regexp_replace(v_url, '^https?://([^/]+).*$', '\1');
  v_host := regexp_replace(v_host, '^www\.', '');

  if v_host ~ '(commons\.wikimedia\.org|wikipedia\.org)$' then return 'reference'; end if;
  if v_host ~ '(samnytt\.se|jihadwatch\.org)$' then return 'niche'; end if;
  if v_publisher ~ '(free speech union|big brother watch|amnesty|human rights watch|greenpeace|think tank|institute|foundation|campaign)' then return 'advocacy'; end if;

  if v_host ~ '(^|\.)(gov\.[a-z.]+|gob\.[a-z.]+|government\.[a-z.]+|parliament\.[a-z.]+|police\.[a-z.]+|court\.[a-z.]+)$'
     or v_host ~ '(^|\.)(gov\.uk|ft\.dk|bundestag\.de|europa\.eu|ec\.europa\.eu|echr\.coe\.int|justice\.gov|treasury\.gov|judiciary\.uk|cps\.gov\.uk|spa\.gov\.sa|aepd\.es|lamoncloa\.gob\.es|rijksoverheid\.nl|inspectie-jenv\.nl)$'
     or v_publisher ~ '(\baepd\b|ministry|ministeriet|ministerium|department of|government|regering|parliament|folketing|bundestag|court|domstol|judiciary|police|politi|prosecution|statsadvokat|statistics|statistik|election authority|valgkommission|electoral commission|treasury|central bank|commission|kommune|council|inspectorate|embassy|prime minister|president|white house|europ[æe]an court|european court|sikkerhedspolisen|mi5|fbi|cia|pet\b)' then
    return 'primary_official';
  end if;

  if v_host ~ '(^|\.)(facebook\.com|x\.com|twitter\.com|instagram\.com|youtube\.com|tiktok\.com)$' then return 'primary_original'; end if;

  if v_host ~ '(^|\.)(reuters\.com|apnews\.com|afp\.com|bbc\.com|bbc\.co\.uk|dr\.dk|tv2\.dk|svt\.se|nrk\.no|zdf\.de|tagesschau\.de|orf\.at|elpais\.com|lemonde\.fr|theguardian\.com|nytimes\.com|washingtonpost\.com|wsj\.com|ft\.com|handelsblatt\.com|zeit\.de|nos\.nl|lbc\.co\.uk)$'
     or v_publisher ~ '^(reuters|associated press|ap|afp|bbc|dr|tv 2|svt|nrk|zdf|tagesschau|orf|el pa[ií]s|le monde|financial times|wall street journal|new york times|washington post|handelsblatt|die zeit|nos|lbc)$' then
    return 'strong_secondary';
  end if;

  if v_publisher ~ '(press agency|news agency|nyhedsbureau)' then return 'strong_secondary'; end if;
  return 'other_secondary';
end;
$$;

create or replace function public.validate_article_media()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  media_error text;
begin
  if tg_op='UPDATE'
     and new.status='scheduled'::public.article_status
     and old.hero_media_id is not null
     and new.hero_media_id is null then
    raise exception 'scheduled article hero cannot be detached; replace it with another archived media asset instead';
  end if;

  if new.status <> 'published'::public.article_status then return new; end if;

  if new.hero_media_id is null
     and tg_op='UPDATE'
     and old.status='published'::public.article_status
     and old.hero_media_id is null then
    return new;
  end if;

  media_error := public.article_media_publication_error(new.hero_media_id,new.hero_url);
  perform public.raise_article_media_publication_error(media_error);
  return new;
end;
$$;
