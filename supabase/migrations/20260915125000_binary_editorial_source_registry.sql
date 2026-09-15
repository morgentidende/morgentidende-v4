-- Binary editorial source policy: authoritative vs discovery_only.
-- The registry may grow through the GitHub publish bridge. Unknown media default to
-- discovery_only until they are explicitly classified. Editor-locked rows cannot
-- be overwritten by automation.

create table if not exists public.editorial_source_registry (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  source_name text not null,
  classification text not null check (classification in ('authoritative','discovery_only')),
  region text,
  rationale text,
  discovered_via text,
  decision_origin text not null default 'automation' check (decision_origin in ('seed','automation','editor_in_chief')),
  editor_locked boolean not null default false,
  first_seen_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists editorial_source_registry_classification_idx
  on public.editorial_source_registry (classification, domain);

alter table public.editorial_source_registry enable row level security;

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
        '^www\\.', ''
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

    if v_domain is null or v_domain !~ '^[a-z0-9.-]+\\.[a-z]{2,}$' then raise exception 'invalid_source_registry_domain'; end if;
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

-- Seed the narrow authoritative whitelist. The list is deliberately explicit;
-- unlisted media are discovery_only until classified and added.
insert into public.editorial_source_registry
  (domain,source_name,classification,region,rationale,decision_origin,editor_locked)
values
  ('dr.dk','DR','authoritative','Danmark','National public-service medium','seed',false),
  ('tv2.dk','TV 2','authoritative','Danmark','National public-service medium','seed',false),
  ('ritzau.dk','Ritzau','authoritative','Danmark','Established national news agency','seed',false),
  ('jyllands-posten.dk','Jyllands-Posten','authoritative','Danmark','Large established print newspaper','seed',false),
  ('jp.dk','Jyllands-Posten','authoritative','Danmark','Large established print newspaper','seed',false),
  ('berlingske.dk','Berlingske','authoritative','Danmark','Large established print newspaper','seed',false),
  ('politiken.dk','Politiken','authoritative','Danmark','Large established print newspaper','seed',false),

  ('svt.se','SVT Nyheter','authoritative','Sverige','National public-service medium','seed',false),
  ('sverigesradio.se','Sveriges Radio','authoritative','Sverige','National public-service medium','seed',false),
  ('tt.se','TT','authoritative','Sverige','Established national news agency','seed',false),
  ('dn.se','Dagens Nyheter','authoritative','Sverige','Large established print newspaper','seed',false),
  ('svd.se','Svenska Dagbladet','authoritative','Sverige','Large established print newspaper','seed',false),

  ('nrk.no','NRK','authoritative','Norge','National public-service medium','seed',false),
  ('tv2.no','TV 2 Norge','authoritative','Norge','National broadcaster','seed',false),
  ('ntb.no','NTB','authoritative','Norge','Established national news agency','seed',false),
  ('aftenposten.no','Aftenposten','authoritative','Norge','Large established print newspaper','seed',false),
  ('vg.no','VG','authoritative','Norge','Large established print newspaper','seed',false),

  ('tagesschau.de','ARD / Tagesschau','authoritative','Tyskland','National public-service news','seed',false),
  ('ard.de','ARD','authoritative','Tyskland','National public-service network','seed',false),
  ('zdf.de','ZDF','authoritative','Tyskland','National public-service broadcaster','seed',false),
  ('dpa.com','dpa','authoritative','Tyskland','Established national news agency','seed',false),
  ('faz.net','Frankfurter Allgemeine Zeitung','authoritative','Tyskland','Large established print newspaper','seed',false),
  ('sueddeutsche.de','Süddeutsche Zeitung','authoritative','Tyskland','Large established print newspaper','seed',false),

  ('orf.at','ORF','authoritative','Østrig','National public-service broadcaster','seed',false),
  ('apa.at','APA','authoritative','Østrig','Established national news agency','seed',false),
  ('derstandard.at','Der Standard','authoritative','Østrig','Large established print newspaper','seed',false),
  ('diepresse.com','Die Presse','authoritative','Østrig','Large established print newspaper','seed',false),

  ('franceinfo.fr','Franceinfo','authoritative','Frankrig','National public-service news','seed',false),
  ('radiofrance.fr','Radio France','authoritative','Frankrig','National public-service broadcaster','seed',false),
  ('afp.com','AFP','authoritative','International','Major international news agency','seed',false),
  ('lemonde.fr','Le Monde','authoritative','Frankrig','Large established print newspaper','seed',false),
  ('lefigaro.fr','Le Figaro','authoritative','Frankrig','Large established print newspaper','seed',false),

  ('rainews.it','RaiNews','authoritative','Italien','National public-service news','seed',false),
  ('rai.it','RAI','authoritative','Italien','National public-service broadcaster','seed',false),
  ('ansa.it','ANSA','authoritative','Italien','Established national news agency','seed',false),
  ('corriere.it','Corriere della Sera','authoritative','Italien','Large established print newspaper','seed',false),
  ('repubblica.it','La Repubblica','authoritative','Italien','Large established print newspaper','seed',false),
  ('ilgiornale.it','Il Giornale','authoritative','Italien','Established print newspaper','seed',false),
  ('laverita.info','La Verità','authoritative','Italien','Established print newspaper','seed',false),
  ('liberoquotidiano.it','Libero Quotidiano','authoritative','Italien','Established print newspaper','seed',false),

  ('rtve.es','RTVE','authoritative','Spanien','National public-service broadcaster','seed',false),
  ('efe.com','EFE','authoritative','Spanien','Established national news agency','seed',false),
  ('elpais.com','El País','authoritative','Spanien','Large established print newspaper','seed',false),
  ('elmundo.es','El Mundo','authoritative','Spanien','Large established print newspaper','seed',false),
  ('abc.es','ABC','authoritative','Spanien','Large established print newspaper','seed',false),

  ('rtp.pt','RTP','authoritative','Portugal','National public-service broadcaster','seed',false),
  ('lusa.pt','Lusa','authoritative','Portugal','Established national news agency','seed',false),
  ('publico.pt','Público','authoritative','Portugal','Large established print newspaper','seed',false),
  ('cmjornal.pt','Correio da Manhã','authoritative','Portugal','Large established print newspaper','seed',false),

  ('pap.pl','PAP','authoritative','Polen','Established national news agency','seed',false),
  ('wyborcza.pl','Gazeta Wyborcza','authoritative','Polen','Large established print newspaper','seed',false),
  ('rp.pl','Rzeczpospolita','authoritative','Polen','Large established print newspaper','seed',false),

  ('bbc.com','BBC News','authoritative','Storbritannien','National public-service broadcaster','seed',false),
  ('bbc.co.uk','BBC News','authoritative','Storbritannien','National public-service broadcaster','seed',false),
  ('reuters.com','Reuters','authoritative','International','Major international news agency','seed',false),
  ('pa.media','PA Media','authoritative','Storbritannien','Established national news agency','seed',false),
  ('thetimes.com','The Times','authoritative','Storbritannien','Large established print newspaper','seed',false),
  ('theguardian.com','The Guardian','authoritative','Storbritannien','Large established print newspaper','seed',false),
  ('telegraph.co.uk','The Daily Telegraph','authoritative','Storbritannien','Large established print newspaper','seed',false),

  ('rte.ie','RTÉ News','authoritative','Irland','National public-service broadcaster','seed',false),
  ('irishtimes.com','The Irish Times','authoritative','Irland','Large established print newspaper','seed',false),
  ('independent.ie','Irish Independent','authoritative','Irland','Large established print newspaper','seed',false),

  ('apnews.com','Associated Press','authoritative','International','Major international news agency','seed',false),
  ('npr.org','NPR','authoritative','USA','National public media network','seed',false),
  ('pbs.org','PBS NewsHour','authoritative','USA','National public media','seed',false),
  ('nytimes.com','New York Times','authoritative','USA','Large established print newspaper','seed',false),
  ('washingtonpost.com','Washington Post','authoritative','USA','Large established print newspaper','seed',false),
  ('wsj.com','Wall Street Journal','authoritative','USA','Large established print newspaper','seed',false),
  ('nypost.com','New York Post','authoritative','USA','Large established print newspaper','seed',false),

  ('bangkokpost.com','Bangkok Post','authoritative','Thailand','Large established national newspaper','editor_in_chief',true),
  ('nationthailand.com','The Nation Thailand','authoritative','Thailand','Editor-in-chief approved authoritative source','editor_in_chief',true),
  ('thaipbsworld.com','Thai PBS World','authoritative','Thailand','Public-service broadcaster','seed',false),
  ('thaipbs.or.th','Thai PBS','authoritative','Thailand','Public-service broadcaster','seed',false),

  ('inquirer.net','Philippine Daily Inquirer','authoritative','Filippinerne','Large established print newspaper','seed',false),
  ('philstar.com','The Philippine Star','authoritative','Filippinerne','Large established print newspaper','seed',false),
  ('mb.com.ph','Manila Bulletin','authoritative','Filippinerne','Large established print newspaper','seed',false),
  ('pna.gov.ph','Philippine News Agency','authoritative','Filippinerne','National news agency','seed',false),

  ('dawn.com','Dawn','authoritative','Pakistan','Large established print newspaper','seed',false),
  ('tribune.com.pk','The Express Tribune','authoritative','Pakistan','Established print newspaper','seed',false),
  ('app.com.pk','Associated Press of Pakistan','authoritative','Pakistan','National news agency','seed',false),

  ('indianexpress.com','The Indian Express','authoritative','Indien','Large established print newspaper','editor_in_chief',true),
  ('indiatimes.com','Times of India','authoritative','Indien','Large established print newspaper','editor_in_chief',true),
  ('hindustantimes.com','Hindustan Times','authoritative','Indien','Large established print newspaper','editor_in_chief',true),
  ('pti.in','Press Trust of India','authoritative','Indien','Established national news agency','seed',false),
  ('ddnews.gov.in','DD News','authoritative','Indien','National public-service broadcaster','seed',false),
  ('newsonair.gov.in','Akashvani / All India Radio','authoritative','Indien','National public-service broadcaster','seed',false),

  ('antaranews.com','ANTARA','authoritative','Indonesien','National news agency','seed',false),
  ('thejakartapost.com','The Jakarta Post','authoritative','Indonesien','Large established print newspaper','seed',false),
  ('kompas.com','Kompas','authoritative','Indonesien','Large established print newspaper','seed',false),

  ('thedailystar.net','The Daily Star','authoritative','Bangladesh','Large established print newspaper','seed',false),
  ('bssnews.net','Bangladesh Sangbad Sangstha','authoritative','Bangladesh','National news agency','seed',false),

  ('nst.com.my','New Straits Times','authoritative','Malaysia','Large established print newspaper','seed',false),
  ('thestar.com.my','The Star','authoritative','Malaysia','Large established print newspaper','seed',false),
  ('bernama.com','Bernama','authoritative','Malaysia','National news agency','seed',false),

  ('channelnewsasia.com','CNA / Channel NewsAsia','authoritative','Asien generelt','Major regional public-service news network','seed',false),
  ('nhk.or.jp','NHK','authoritative','Japan','National public-service broadcaster','seed',false),
  ('kyodonews.net','Kyodo News','authoritative','Japan','Established national news agency','seed',false),
  ('yonhapnews.co.kr','Yonhap','authoritative','Sydkorea','Established national news agency','seed',false),
  ('focustaiwan.tw','CNA / Focus Taiwan','authoritative','Taiwan','National news agency','seed',false),

  ('clarin.com','Clarín','authoritative','Argentina','Large established print newspaper','seed',false),
  ('lanacion.com.ar','La Nación','authoritative','Argentina','Large established print newspaper','seed',false),
  ('folha.uol.com.br','Folha de S.Paulo','authoritative','Brasilien','Large established print newspaper','seed',false),
  ('oglobo.globo.com','O Globo','authoritative','Brasilien','Large established print newspaper','seed',false),
  ('estadao.com.br','O Estado de S. Paulo','authoritative','Brasilien','Large established print newspaper','seed',false),
  ('latercera.com','La Tercera','authoritative','Chile','Large established print newspaper','seed',false),
  ('eltiempo.com','El Tiempo','authoritative','Colombia','Large established print newspaper','seed',false),
  ('elespectador.com','El Espectador','authoritative','Colombia','Established print newspaper','seed',false),
  ('nacion.com','La Nación','authoritative','Costa Rica','Large established print newspaper','seed',false),
  ('eluniverso.com','El Universo','authoritative','Ecuador','Large established print newspaper','seed',false),
  ('laprensagrafica.com','La Prensa Gráfica','authoritative','El Salvador','Large established print newspaper','seed',false),
  ('elsalvador.com','El Diario de Hoy','authoritative','El Salvador','Large established print newspaper','seed',false),
  ('prensalibre.com','Prensa Libre','authoritative','Guatemala','Large established print newspaper','seed',false),
  ('laprensa.hn','La Prensa','authoritative','Honduras','Large established print newspaper','seed',false),
  ('elheraldo.hn','El Heraldo','authoritative','Honduras','Large established print newspaper','seed',false),
  ('eluniversal.com.mx','El Universal','authoritative','Mexico','Large established print newspaper','seed',false),
  ('reforma.com','Reforma','authoritative','Mexico','Large established print newspaper','seed',false),
  ('milenio.com','Milenio','authoritative','Mexico','Large established print newspaper','seed',false),
  ('excelsior.com.mx','Excélsior','authoritative','Mexico','Large established print newspaper','seed',false),
  ('laprensa.com.ni','La Prensa','authoritative','Nicaragua','Large established print newspaper','seed',false),
  ('prensa.com','La Prensa','authoritative','Panama','Large established print newspaper','seed',false),
  ('abc.com.py','ABC Color','authoritative','Paraguay','Large established print newspaper','seed',false),
  ('ultimahora.com','Última Hora','authoritative','Paraguay','Large established print newspaper','seed',false),
  ('elcomercio.pe','El Comercio','authoritative','Peru','Large established print newspaper','seed',false),
  ('larepublica.pe','La República','authoritative','Peru','Large established print newspaper','seed',false),
  ('elpais.com.uy','El País','authoritative','Uruguay','Large established print newspaper','seed',false),
  ('elobservador.com.uy','El Observador','authoritative','Uruguay','Established national newspaper','seed',false),
  ('elnacional.com','El Nacional','authoritative','Venezuela','Established national newspaper','seed',false)
on conflict (domain) do update
  set source_name=excluded.source_name,
      classification=case when public.editorial_source_registry.editor_locked then public.editorial_source_registry.classification else excluded.classification end,
      region=coalesce(excluded.region,public.editorial_source_registry.region),
      rationale=case when public.editorial_source_registry.editor_locked then public.editorial_source_registry.rationale else excluded.rationale end,
      decision_origin=case when public.editorial_source_registry.editor_locked then public.editorial_source_registry.decision_origin else excluded.decision_origin end,
      editor_locked=public.editorial_source_registry.editor_locked or excluded.editor_locked,
      updated_at=clock_timestamp();

-- Explicit discovery-only rows that are important enough to protect against
-- accidental promotion by legacy source_type fields.
insert into public.editorial_source_registry
  (domain,source_name,classification,region,rationale,decision_origin,editor_locked)
values
  ('jihadwatch.org','Jihad Watch','discovery_only','USA','Discovery lead only; never final factual evidence','editor_in_chief',true),
  ('samnytt.se','Samnytt','discovery_only','Sverige','Discovery lead only','editor_in_chief',true),
  ('hodjasblog.one','Hodjanernes Blog','discovery_only','Danmark','Discovery lead only','editor_in_chief',true),
  ('uriasposten.net','Uriasposten','discovery_only','Danmark','Discovery lead only','editor_in_chief',true),
  ('fdesouche.com','Fdesouche','discovery_only','Frankrig','Aggregator/discovery lead only','seed',false),
  ('nius.de','NIUS','discovery_only','Tyskland','Discovery source under current policy','seed',false),
  ('apollo-news.net','Apollo News','discovery_only','Tyskland','Discovery source under current policy','seed',false),
  ('jungefreiheit.de','Junge Freiheit','discovery_only','Tyskland','Discovery source under current policy','seed',false),
  ('document.no','Document','discovery_only','Norge','Discovery source under current policy','seed',false),
  ('gbnews.com','GB News','discovery_only','Storbritannien','Discovery source under current policy','seed',false),
  ('dailycaller.com','Daily Caller','discovery_only','USA','Discovery source under current policy','seed',false),
  ('dailywire.com','Daily Wire','discovery_only','USA','Discovery source under current policy','seed',false)
on conflict (domain) do update
  set classification=case when public.editorial_source_registry.editor_locked then public.editorial_source_registry.classification else excluded.classification end,
      source_name=excluded.source_name,
      region=excluded.region,
      rationale=case when public.editorial_source_registry.editor_locked then public.editorial_source_registry.rationale else excluded.rationale end,
      editor_locked=public.editorial_source_registry.editor_locked or excluded.editor_locked,
      decision_origin=case when public.editorial_source_registry.editor_locked then public.editorial_source_registry.decision_origin else excluded.decision_origin end,
      updated_at=clock_timestamp();

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

  -- Objective primary/official material remains authoritative for what the
  -- authority itself states, decides or publishes.
  if v_host ~ '(^|\\.)(gov\\.[a-z.]+|gob\\.[a-z.]+|government\\.[a-z.]+|parliament\\.[a-z.]+|police\\.[a-z.]+|court\\.[a-z.]+)$'
     or v_host ~ '(^|\\.)(gov\\.uk|ft\\.dk|bundestag\\.de|europa\\.eu|ec\\.europa\\.eu|echr\\.coe\\.int|justice\\.gov|treasury\\.gov|judiciary\\.uk|cps\\.gov\\.uk|forsvaret\\.dk|fmn\\.dk|politi\\.dk|pet\\.dk|fe-ddis\\.dk|stm\\.dk|um\\.dk|domstol\\.dk|retsinformation\\.dk|brs\\.dk|sst\\.dk|ssi\\.dk|dst\\.dk|skat\\.dk|nyidanmark\\.dk)$'
     or v_publisher ~ '(ministry|ministeriet|ministerium|department of|government|regering|parliament|folketing|bundestag|court|domstol|judiciary|police|politi|prosecution|statsadvokat|statistics|statistik|election authority|valgkommission|electoral commission|treasury|central bank|kommune|council|inspectorate|embassy|prime minister|president|white house|forsvarskommandoen|forsvaret|forsvarsministeriet|udenrigsministeriet|statsministeriet|rigspolitiet)' then
    return 'authoritative';
  end if;

  -- A direct original statement/document from the subject may bear claims about
  -- that subject when the producer explicitly marks the relationship.
  if coalesce((p_source->>'subject_is_source')::boolean,false)
     and v_explicit in ('primary_original','original_post','social_post','original_document','subject_statement') then
    return 'authoritative';
  end if;

  -- Unknown media are safe-defaulted to discovery_only. Scheduled Tasks should
  -- classify and submit them through source_registry_updates before publication.
  return 'discovery_only';
end;
$$;

-- Compatibility wrapper: old callers keep the function name, but the legacy
-- multi-tier taxonomy is gone.
create or replace function public.classify_editorial_source(p_source jsonb)
returns text
language sql
stable
set search_path = public
as $$ select public.editorial_source_classification(p_source); $$;

create or replace function public.evaluate_article_source_quality(
  p_source_metadata jsonb,
  p_editorial_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  s jsonb;
  v_class text;
  v_authoritative int := 0;
  v_discovery_only int := 0;
  v_reference int := 0;
begin
  if jsonb_typeof(p_source_metadata) <> 'array' then
    return jsonb_build_object('gate','block','reason','source_metadata_not_array','counts',jsonb_build_object());
  end if;

  for s in select value from jsonb_array_elements(p_source_metadata)
  loop
    v_class := public.editorial_source_classification(s);
    case v_class
      when 'authoritative' then v_authoritative := v_authoritative + 1;
      when 'reference' then v_reference := v_reference + 1;
      else v_discovery_only := v_discovery_only + 1;
    end case;
  end loop;

  if v_authoritative >= 1 then
    return jsonb_build_object(
      'gate','pass',
      'reason','authoritative_source_present',
      'counts',jsonb_build_object('authoritative',v_authoritative,'discovery_only',v_discovery_only,'reference',v_reference)
    );
  end if;

  return jsonb_build_object(
    'gate','block',
    'reason','no_authoritative_source',
    'counts',jsonb_build_object('authoritative',v_authoritative,'discovery_only',v_discovery_only,'reference',v_reference)
  );
end;
$$;

-- Registry updates travel inside the same authenticated GitHub bridge payload,
-- so Scheduled Tasks still never write directly to Supabase.
create or replace function public.ingest_github_publish_payload(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue_id text;
  v_slug text;
  v_headline text;
  v_body text;
  v_category_slug text;
  v_kind public.article_kind;
  v_category_id uuid;
  v_article_id uuid;
  v_publish_at timestamptz;
  v_source_metadata jsonb;
  v_editorial_metadata jsonb;
  v_story_cluster_id uuid;
  v_topic_key text;
  v_story_kind text;
  v_duplicate_error text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'payload_must_be_object'; end if;
  perform public.upsert_editorial_source_registry(coalesce(p_payload->'source_registry_updates','[]'::jsonb));
  v_queue_id := nullif(trim(p_payload->>'queue_id'), '');
  v_slug := nullif(trim(p_payload->>'slug'), '');
  v_headline := nullif(trim(p_payload->>'headline'), '');
  v_body := coalesce(p_payload->>'body_markdown', '');
  v_category_slug := nullif(lower(trim(p_payload->>'category_slug')), '');
  if v_queue_id is null then raise exception 'queue_id_required'; end if;
  if v_slug is null then raise exception 'slug_required'; end if;
  if v_headline is null then raise exception 'headline_required'; end if;
  if v_category_slug is null then raise exception 'category_slug_required'; end if;
  if char_length(v_slug) > 180 then raise exception 'slug_too_long'; end if;
  if char_length(v_headline) > 220 then raise exception 'headline_too_long'; end if;
  if coalesce(jsonb_typeof(p_payload->'source_metadata'), 'array') <> 'array' then raise exception 'source_metadata_must_be_array'; end if;
  if coalesce(jsonb_typeof(p_payload->'editorial_metadata'), 'object') <> 'object' then raise exception 'editorial_metadata_must_be_object'; end if;
  v_kind := public.normalize_bridge_kind(p_payload->>'kind', v_category_slug);
  select id into v_category_id from public.categories where lower(slug)=v_category_slug and active=true limit 1;
  if v_category_id is null then raise exception 'unknown_category:%', v_category_slug; end if;
  if nullif(p_payload->>'story_cluster_id','') is not null then
    begin v_story_cluster_id := (p_payload->>'story_cluster_id')::uuid;
    exception when others then raise exception 'invalid_story_cluster_id'; end;
  end if;
  begin v_publish_at := coalesce(nullif(p_payload->>'publish_at','')::timestamptz, clock_timestamp());
  exception when others then raise exception 'invalid_publish_at'; end;
  v_source_metadata := coalesce(p_payload->'source_metadata','[]'::jsonb);
  v_editorial_metadata := coalesce(p_payload->'editorial_metadata','{}'::jsonb)
    || jsonb_build_object('github_queue_id',v_queue_id,'publication_transport','github_pr_bridge','publication_requested_at',clock_timestamp());
  perform pg_advisory_xact_lock(hashtextextended('github_queue_id:' || v_queue_id, 0));
  select id into v_article_id from public.articles where github_queue_id=v_queue_id order by created_at desc limit 1;
  if v_article_id is not null then perform public.publish_article_safely(v_article_id); return v_article_id; end if;
  select id into v_article_id from public.articles where slug=v_slug limit 1;
  if v_article_id is not null then raise exception 'slug_conflict:%',v_slug; end if;
  v_topic_key := nullif(public.normalize_story_key(v_editorial_metadata->>'topic_key'),'');
  v_story_kind := coalesce(nullif(v_editorial_metadata->>'story_kind',''),case when v_kind='magazine'::public.article_kind then 'evergreen_explainer' else 'news' end);
  if v_kind='magazine'::public.article_kind then
    if v_topic_key is null then raise exception 'magazine_topic_key_required'; end if;
    if v_story_kind not in ('evergreen_explainer','followup','new_study','update') then raise exception 'magazine_story_kind_invalid'; end if;
    v_editorial_metadata := jsonb_set(v_editorial_metadata,'{topic_key}',to_jsonb(v_topic_key),true);
    v_editorial_metadata := jsonb_set(v_editorial_metadata,'{story_kind}',to_jsonb(v_story_kind),true);
  end if;
  perform public.lock_article_dedupe_keys(v_headline,v_kind,v_topic_key);
  v_duplicate_error := public.article_duplicate_publication_error(null,v_headline,v_kind,v_topic_key,v_story_cluster_id,v_editorial_metadata,true);
  if v_duplicate_error is not null then raise exception '%',v_duplicate_error; end if;
  insert into public.articles (slug,kind,status,category_id,story_cluster_id,headline,frontpage_headline,headline_accent_text,deck,body_markdown,author_name,author_title,hero_url,hero_alt,hero_source_url,hero_candidate_url,hero_candidate_note,hero_credit,hero_license,hero_license_url,is_lead,lead_rank,is_breaking,breaking_until,publish_at,created_by,source_metadata,editorial_metadata,topic_key)
  values (v_slug,v_kind,'scheduled'::public.article_status,v_category_id,v_story_cluster_id,v_headline,nullif(p_payload->>'frontpage_headline',''),nullif(p_payload->>'headline_accent_text',''),nullif(p_payload->>'deck',''),v_body,nullif(p_payload->>'author_name',''),nullif(p_payload->>'author_title',''),nullif(p_payload->>'hero_url',''),nullif(p_payload->>'hero_alt',''),nullif(p_payload->>'hero_source_url',''),nullif(p_payload->>'hero_candidate_url',''),nullif(p_payload->>'hero_candidate_note',''),nullif(p_payload->>'hero_credit',''),nullif(p_payload->>'hero_license',''),nullif(p_payload->>'hero_license_url',''),coalesce((p_payload->>'is_lead')::boolean,false),nullif(p_payload->>'lead_rank','')::integer,coalesce((p_payload->>'is_breaking')::boolean,false),nullif(p_payload->>'breaking_until','')::timestamptz,v_publish_at,'chatgpt_scheduled_github_bridge',v_source_metadata,v_editorial_metadata,v_topic_key)
  returning id into v_article_id;
  perform public.publish_article_safely(v_article_id);
  return v_article_id;
end;
$$;

create or replace function public.ingest_github_discovery_audit_payload(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_run_id text; v_queue_id text; v_candidates jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'payload_must_be_object'; end if;
  perform public.upsert_editorial_source_registry(coalesce(p_payload->'source_registry_updates','[]'::jsonb));
  v_run_id := nullif(btrim(coalesce(p_payload->>'run_id',p_payload->>'queue_id')),'');
  v_queue_id := nullif(btrim(p_payload->>'queue_id'),'');
  v_candidates := p_payload->'discovery_audit';
  if v_run_id is null then raise exception 'discovery_audit_run_id_required'; end if;
  if jsonb_typeof(v_candidates) <> 'array' then raise exception 'discovery_audit_candidates_must_be_array'; end if;
  return public.record_discovery_candidate_audit(v_run_id,v_candidates,null,v_queue_id);
end;
$$;

grant execute on function public.ingest_github_publish_payload(jsonb) to service_role;
grant execute on function public.ingest_github_discovery_audit_payload(jsonb) to service_role;

-- Regression checks for the new binary rule.
do $$
begin
  if public.classify_editorial_source(jsonb_build_object('url','https://www.bangkokpost.com/test','publisher','Bangkok Post')) <> 'authoritative' then
    raise exception 'source registry regression: Bangkok Post must be authoritative';
  end if;
  if public.classify_editorial_source(jsonb_build_object('url','https://www.nationthailand.com/test','publisher','The Nation Thailand')) <> 'authoritative' then
    raise exception 'source registry regression: The Nation Thailand must be authoritative';
  end if;
  if public.classify_editorial_source(jsonb_build_object('url','https://jihadwatch.org/test','publisher','Jihad Watch','source_type','primary_official')) <> 'discovery_only' then
    raise exception 'source registry regression: locked discovery-only must beat legacy source_type';
  end if;
  if (public.evaluate_article_source_quality(jsonb_build_array(jsonb_build_object('url','https://www.bangkokpost.com/test','publisher','Bangkok Post')),'{}'::jsonb)->>'gate') <> 'pass' then
    raise exception 'source gate regression: one authoritative source must pass';
  end if;
  if (public.evaluate_article_source_quality(jsonb_build_array(jsonb_build_object('url','https://jihadwatch.org/test','publisher','Jihad Watch')),'{}'::jsonb)->>'gate') <> 'block' then
    raise exception 'source gate regression: discovery-only source must not pass';
  end if;
end;
$$;
