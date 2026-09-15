-- Give magazine evergreen dedupe a stable database key and backfill the
-- current seven-day corpus with deliberately granular topic keys.

alter table public.articles
  add column if not exists topic_key text;

create index if not exists articles_topic_key_recent_idx
  on public.articles (topic_key, created_at desc)
  where topic_key is not null
    and status in ('published'::public.article_status, 'scheduled'::public.article_status);

create or replace function public.sync_article_topic_key()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_meta_key text;
  v_col_key text;
begin
  v_meta_key := nullif(public.normalize_story_key(coalesce(new.editorial_metadata,'{}'::jsonb)->>'topic_key'), '');
  v_col_key := nullif(public.normalize_story_key(new.topic_key), '');

  -- An explicit column change wins. This is used by verified backfills/manual edits.
  if tg_op = 'UPDATE' and new.topic_key is distinct from old.topic_key then
    new.topic_key := v_col_key;
    if v_col_key is null then
      new.editorial_metadata := coalesce(new.editorial_metadata,'{}'::jsonb) - 'topic_key';
    else
      new.editorial_metadata := jsonb_set(
        coalesce(new.editorial_metadata,'{}'::jsonb),
        '{topic_key}',
        to_jsonb(v_col_key),
        true
      );
    end if;
    return new;
  end if;

  -- Normal publish payloads currently supply the key in editorial_metadata.
  if v_meta_key is not null then
    new.topic_key := v_meta_key;
    new.editorial_metadata := jsonb_set(
      coalesce(new.editorial_metadata,'{}'::jsonb),
      '{topic_key}',
      to_jsonb(v_meta_key),
      true
    );
  elsif v_col_key is not null then
    new.topic_key := v_col_key;
    new.editorial_metadata := jsonb_set(
      coalesce(new.editorial_metadata,'{}'::jsonb),
      '{topic_key}',
      to_jsonb(v_col_key),
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_article_topic_key on public.articles;
create trigger trg_sync_article_topic_key
before insert or update of topic_key, editorial_metadata
on public.articles
for each row
execute function public.sync_article_topic_key();

-- Verified one-by-one from the current magazine corpus. Keys are intentionally
-- narrower than broad categories: one recurring evergreen advice/explainer
-- package gets one key.
update public.articles
set topic_key = case headline
  when '10 minutters gåtur efter maden kan dæmpe blodsukkerstigningen' then 'gaatur-efter-mad'
  when 'Sauna og hjertet: Forskningen ser lovende ud – men den stærkeste evidens er mere forsigtig' then 'sauna-hjerte'
  when 'Vægsiddet kan sænke blodtrykket – og kræver næsten intet udstyr' then 'vaegsidning-blodtryk'
  when 'Derfor kan du se gennem mikrobølgeovnens dør uden at mikrobølgerne slipper ud' then 'mikroboelgeovn-doer'
  when 'Induktionskomfuret varmer gryden direkte – derfor kan glasset være langt køligere' then 'induktionskomfur'
  when 'Kreatin er ikke kun til muskler: Forskning peger på en effekt i hjernen' then 'kreatin-hjerne'
  when 'Samme sengetid kan være vigtigere, end du tror' then 'soevn-regelmaessighed'
  when 'Derfor er flyvinduer runde – en katastrofe ændrede måden, vi bygger passagerfly på' then 'flyvinduer-sikkerhed'
  when 'Styrketræning er forbundet med lavere risiko for tidlig død – selv en lille dosis tæller' then 'styrketraening-levetid'
  when '10.000 skridt er ikke nødvendige: 7.000 om dagen er forbundet med markant lavere risiko' then 'daglige-skridt-helbred'
  when 'Einstein gemmer sig i din mobil: GPS virker kun, fordi tiden går forskelligt i rummet' then 'gps-relativitet'
  when 'Bridge-canary: teknisk testartikel' then 'bridge-canary'
  when 'Kan et passagerfly flyve videre på én motor? Ja – og det er indbygget i sikkerheden' then 'passagerfly-en-motor'
  when 'Kvantecomputere laver fejl hele tiden – nu kan flere qubits faktisk gøre dem mere stabile' then 'kvantefejlkorrektion'
  when 'Nye tandemsolceller kan presse langt mere strøm ud af det samme tag' then 'tandemsolceller'
  when 'Taknemmelighed virker – men effekten er mindre end selvhjælpsbøgerne lover' then 'taknemmelighed-oevelse'
  when 'Regelmæssig søvn kan være vigtigere, end du tror' then 'soevn-regelmaessighed'
  when 'Fusionsenergi har passeret en historisk grænse – nu begynder den svære del' then 'fusionsenergi-nettoenergi'
  when 'AI-agenter kan overtage de kedelige computeropgaver – men de er ikke klar til alt' then 'ai-agenter-computeropgaver'
  when 'Metakognitiv terapi mod bekymringer: Løsningen kan være at tænke mindre over dem' then 'metakognitiv-terapi-bekymring'
  when 'Solid-state-batterier kan ændre elbilen: Her er gennembruddet, vi venter på' then 'solid-state-batterier'
  when 'Humanoide robotter rykker ind: Hvor tæt er vi på en robot i hjemmet?' then 'humanoide-robotter-hjemmet'
  when 'Protein og styrketræning: Mere er ikke altid bedre' then 'protein-styrketraening'
  when 'Taknemmelighed virker – men du behøver kun gøre lidt' then 'taknemmelighed-oevelse'
  when 'ACT mod angst: Du behøver ikke vinde over dine tanker' then 'act-angst'
  when 'Morgenlys kan hjælpe din søvn: Kroppens ur reagerer på lyset' then 'morgenlys-doegnrytme'
  when 'Kreatin gør mere end at bygge muskler: Forskning peger også på hjernen' then 'kreatin-hjerne'
  when 'Mænd mister testosteron – og det kan mærkes på krop, sind og status' then 'testosteron-maend'
  when 'Hvad sker der, hvis en kæmpe solstorm rammer Jorden?' then 'solstorm-samfund'
  when 'Sådan kan verden se ud i 2050, hvis de mest lovende teknologier lykkes' then 'fremtidsteknologi-2050'
  when 'Kan vi bremse aldring? Her er det forskerne faktisk kan i dag' then 'aldring-forskning'
  when 'Hvis strømmen forsvandt i en uge: Sådan ville det moderne samfund blive ramt' then 'stroemudfald-samfund'
  when 'De 7 ting mennesker ofte fortryder, når de bliver ældre' then 'livsfortrydelser'
  when 'Parterapeuter: De 10 sætninger der langsomt kan ødelægge et parforhold' then 'parforhold-destruktive-saetninger'
  when '8 ting voksne børn husker fra deres barndom – som forældrene ofte overser' then 'barndom-foraeldreskab'
  when 'Hvorfor nogle par stadig har lyst til hinanden efter 20 år' then 'langvarigt-parforhold-lyst'
  else topic_key
end
where kind = 'magazine'::public.article_kind
  and headline in (
    '10 minutters gåtur efter maden kan dæmpe blodsukkerstigningen',
    'Sauna og hjertet: Forskningen ser lovende ud – men den stærkeste evidens er mere forsigtig',
    'Vægsiddet kan sænke blodtrykket – og kræver næsten intet udstyr',
    'Derfor kan du se gennem mikrobølgeovnens dør uden at mikrobølgerne slipper ud',
    'Induktionskomfuret varmer gryden direkte – derfor kan glasset være langt køligere',
    'Kreatin er ikke kun til muskler: Forskning peger på en effekt i hjernen',
    'Samme sengetid kan være vigtigere, end du tror',
    'Derfor er flyvinduer runde – en katastrofe ændrede måden, vi bygger passagerfly på',
    'Styrketræning er forbundet med lavere risiko for tidlig død – selv en lille dosis tæller',
    '10.000 skridt er ikke nødvendige: 7.000 om dagen er forbundet med markant lavere risiko',
    'Einstein gemmer sig i din mobil: GPS virker kun, fordi tiden går forskelligt i rummet',
    'Bridge-canary: teknisk testartikel',
    'Kan et passagerfly flyve videre på én motor? Ja – og det er indbygget i sikkerheden',
    'Kvantecomputere laver fejl hele tiden – nu kan flere qubits faktisk gøre dem mere stabile',
    'Nye tandemsolceller kan presse langt mere strøm ud af det samme tag',
    'Taknemmelighed virker – men effekten er mindre end selvhjælpsbøgerne lover',
    'Regelmæssig søvn kan være vigtigere, end du tror',
    'Fusionsenergi har passeret en historisk grænse – nu begynder den svære del',
    'AI-agenter kan overtage de kedelige computeropgaver – men de er ikke klar til alt',
    'Metakognitiv terapi mod bekymringer: Løsningen kan være at tænke mindre over dem',
    'Solid-state-batterier kan ændre elbilen: Her er gennembruddet, vi venter på',
    'Humanoide robotter rykker ind: Hvor tæt er vi på en robot i hjemmet?',
    'Protein og styrketræning: Mere er ikke altid bedre',
    'Taknemmelighed virker – men du behøver kun gøre lidt',
    'ACT mod angst: Du behøver ikke vinde over dine tanker',
    'Morgenlys kan hjælpe din søvn: Kroppens ur reagerer på lyset',
    'Kreatin gør mere end at bygge muskler: Forskning peger også på hjernen',
    'Mænd mister testosteron – og det kan mærkes på krop, sind og status',
    'Hvad sker der, hvis en kæmpe solstorm rammer Jorden?',
    'Sådan kan verden se ud i 2050, hvis de mest lovende teknologier lykkes',
    'Kan vi bremse aldring? Her er det forskerne faktisk kan i dag',
    'Hvis strømmen forsvandt i en uge: Sådan ville det moderne samfund blive ramt',
    'De 7 ting mennesker ofte fortryder, når de bliver ældre',
    'Parterapeuter: De 10 sætninger der langsomt kan ødelægge et parforhold',
    '8 ting voksne børn husker fra deres barndom – som forældrene ofte overser',
    'Hvorfor nogle par stadig har lyst til hinanden efter 20 år'
  );
