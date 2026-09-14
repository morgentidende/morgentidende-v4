# ChatGPT Scheduled Task → GitHub → Supabase publish bridge

## Formål

Scheduled Tasks må ikke længere skrive direkte til Supabase med `execute_sql` for artikelpublicering. I stedet afleverer en Scheduled Task én artikel som en afgrænset JSON-payload i en GitHub-PR. GitHub Actions validerer transporten og kalder den server-side databasefunktion `public.ingest_github_publish_payload(jsonb)` via Supabase Management API.

Det fjerner den ustabile Scheduled Task → Supabase write-handling fra automationskørslen, men bevarer den eksisterende Supabase QA-, media- og publication-watchdog.

## Hård transportkontrakt

En Scheduled Task skal:

1. Bruge kun GitHub som write-app under afleveringen.
2. Oprette en unik branch fra `main` med præfiks `publish/chatgpt-`.
3. Oprette præcis én ny fil under `publish-queue/`, fx `publish-queue/<queue_id>.json`.
4. Oprette præcis én PR mod `main`.
5. PR-titlen skal starte med `[PUBLISH] `.
6. PR-body skal indeholde `<!-- morgentidende-chatgpt-publish -->`.
7. PR'en må ikke indeholde andre filændringer.
8. Tasken må ikke merge PR'en og må ikke skrive til Supabase direkte.

Workflowet lukker og forsøger at slette transportbranchen efter en vellykket afleveringskørsel.

## Payload

Minimum:

```json
{
  "queue_id": "unik-idempotency-nøgle",
  "slug": "artikel-slug",
  "headline": "Rubrik",
  "category_slug": "viden",
  "body_markdown": "Brødtekst",
  "source_metadata": [],
  "editorial_metadata": {}
}
```

Understøttede felter omfatter desuden `kind`, `frontpage_headline`, `headline_accent_text`, `deck`, `author_name`, `author_title`, `hero_url`, `hero_alt`, `hero_source_url`, `hero_candidate_url`, `hero_candidate_note`, `hero_credit`, `hero_license`, `hero_license_url`, `story_cluster_id`, `is_lead`, `lead_rank`, `is_breaking`, `breaking_until` og `publish_at`.

`source_metadata` skal være en top-level JSON-array. `editorial_metadata` skal være et JSON-object.

## Hero/media-handoff

Når en Scheduled Task har fundet en ekstern hero, skal den **ikke** sætte den eksterne URL direkte som færdig `hero_url`. Brug `hero_candidate_url` og dokumentér rettighederne. Bridge-triggeren opretter derefter automatisk et `media_ingest_jobs`-job, så den eksisterende media-worker downloader, validerer, arkiverer og knytter det lokale asset til artiklen.

Minimum for automatisk media-ingest:

```json
{
  "hero_candidate_url": "https://...",
  "hero_alt": "Kort neutral alt-tekst",
  "hero_license": "licensnavn",
  "hero_license_url": "https://...",
  "hero_credit": "kun hvis krævet",
  "hero_candidate_note": "kort rettighedsnotat",
  "editorial_metadata": {
    "hero_source_provider": "kildenavn",
    "hero_rights": {
      "commercial_use_allowed": true,
      "local_storage_allowed": true,
      "modifications_allowed": false,
      "attribution_required": false
    }
  }
}
```

Media-job oprettes kun, hvis både `commercial_use_allowed` og `local_storage_allowed` eksplicit er `true`. Mangler dokumentationen, bliver artiklen stående sikkert i prepublication i stedet for at omgå hero-reglerne. Media-workeren kører sin eksisterende fallback/retry-logik og publication watchdog frigiver først artiklen, når kravene er opfyldt.

## Idempotency

`queue_id` gemmes som `editorial_metadata.github_queue_id`. Samme `queue_id` kan afleveres igen uden at oprette en dublet. En eksisterende slug med en anden `queue_id` giver fejl i stedet for at overskrive en anden artikel.

## Publicering og QA

Bridge-funktionen indsætter artiklen som `scheduled` og kalder derefter `public.publish_article_safely(article_id)`. Den eksisterende pipeline afgør, om artiklen kan frigives straks eller skal blive stående i prepublication/hero/QA-forløbet.

Det betyder især:

- hero/media-regler omgås ikke,
- ekstern hero går gennem det eksisterende lokale media-arkiv,
- den deterministiske QA-kø bevares,
- publication watchdog bevares,
- Scheduled Task behøver kun én GitHub-write-sekvens,
- retry kan ske med samme `queue_id` uden dubletter.

## Scheduled Task-standard

Fremtidige autonome artikelopgaver skal afslutte med en afleveringsfase i denne form:

> Aflever den færdige artikel gennem Morgentidendes GitHub publish bridge. Opret en unik `publish/chatgpt-*` branch fra `main`, skriv præcis én JSON-payload i `publish-queue/<queue_id>.json`, og opret en PR mod `main` med titel `[PUBLISH] <kort rubrik>` og body-markøren `<!-- morgentidende-chatgpt-publish -->`. Brug samme `queue_id` ved retry. Merge ikke PR'en. Skriv ikke direkte til Supabase. En ekstern hero skal afleveres som `hero_candidate_url` med eksplicit dokumentation af kommerciel brug og lokal arkivering.

Research- og læsekald kan fortsat bruge relevante read-only apps, men selve article-write-pathen skal være GitHub-broen.

## Driftsprincip

Brug ikke Supabase-write-checkpoints fra Scheduled Tasks. Observability skal primært komme fra GitHub PR/workflow-resultatet og de server-side Supabase-events, som allerede udløses af den normale publication/media/QA-pipeline. Færre write-actions giver færre fejlflader og gør retry entydigt.
