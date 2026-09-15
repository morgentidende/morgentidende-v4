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
     or v_host ~ '(^|\.)(forsvaret\.dk|fmn\.dk|politi\.dk|pet\.dk|fe-ddis\.dk|stm\.dk|um\.dk|domstol\.dk|retsinformation\.dk|brs\.dk|sst\.dk|ssi\.dk|dst\.dk|skat\.dk|nyidanmark\.dk)$'
     or v_publisher ~ '(\baepd\b|ministry|ministeriet|ministerium|department of|government|regering|parliament|folketing|bundestag|court|domstol|judiciary|police|politi|prosecution|statsadvokat|statistics|statistik|election authority|valgkommission|electoral commission|treasury|central bank|commission|kommune|council|inspectorate|embassy|prime minister|president|white house|europ[æe]an court|european court|sikkerhedspolisen|mi5|fbi|cia|pet\b)'
     or v_publisher ~ '(^|\b)(forsvarskommandoen|forsvaret|forsvarsministeriet|udenrigsministeriet|statsministeriet|rigspolitiet)(\b|$)' then
    return 'primary_official';
  end if;

  if v_host ~ '(^|\.)(facebook\.com|x\.com|twitter\.com|instagram\.com|youtube\.com|tiktok\.com)$' then return 'primary_original'; end if;

  if v_host ~ '(^|\.)(reuters\.com|apnews\.com|afp\.com|bbc\.com|bbc\.co\.uk|dr\.dk|tv2\.dk|svt\.se|nrk\.no|zdf\.de|tagesschau\.de|orf\.at|elpais\.com|lemonde\.fr|theguardian\.com|nytimes\.com|washingtonpost\.com|wsj\.com|ft\.com|handelsblatt\.com|zeit\.de|nos\.nl|lbc\.co\.uk|ritzau\.dk|berlingske\.dk|politiken\.dk|jyllands-posten\.dk|jp\.dk|bt\.dk|ekstrabladet\.dk)$'
     or v_publisher ~ '^(reuters|associated press|ap|afp|bbc|dr|tv 2|tv2|svt|nrk|zdf|tagesschau|orf|el pa[ií]s|le monde|financial times|wall street journal|new york times|washington post|handelsblatt|die zeit|nos|lbc|ritzau|ritzaus bureau|berlingske|politiken|jyllands-posten|jyllandsposten|b\.t\.|bt|ekstra bladet)$' then
    return 'strong_secondary';
  end if;

  if v_publisher ~ '^ritzau' and v_url ~ '/ritzau/' then return 'strong_secondary'; end if;
  if v_publisher ~ '(press agency|news agency|nyhedsbureau)' then return 'strong_secondary'; end if;
  return 'other_secondary';
end;
$$;

-- Regression checks for the incident that exposed the classifier gap and nearby cases.
do $$
begin
  if public.classify_editorial_source(jsonb_build_object('url','https://www.forsvaret.dk/da/nyheder/2026/test','publisher','Forsvarskommandoen')) <> 'primary_official' then
    raise exception 'source classifier regression: forsvaret.dk must be primary_official';
  end if;

  if public.classify_editorial_source(jsonb_build_object('url','https://www.dksocial.dk/ritzau/test','publisher','Ritzau')) <> 'strong_secondary' then
    raise exception 'source classifier regression: syndicated Ritzau must be strong_secondary';
  end if;

  if public.classify_editorial_source(jsonb_build_object('url','https://jihadwatch.org/test','publisher','Jihad Watch')) <> 'niche' then
    raise exception 'source classifier regression: Jihad Watch must remain niche';
  end if;

  if (public.evaluate_article_source_quality(
        jsonb_build_array(
          jsonb_build_object('url','https://www.forsvaret.dk/da/nyheder/2026/test','publisher','Forsvarskommandoen'),
          jsonb_build_object('url','https://www.dksocial.dk/ritzau/test','publisher','Ritzau')
        ),
        '{}'::jsonb
      )->>'gate') <> 'pass' then
    raise exception 'source quality regression: official plus strong secondary must pass';
  end if;
end;
$$;
