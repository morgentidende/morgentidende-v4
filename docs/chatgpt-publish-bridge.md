# ChatGPT Scheduled Task → GitHub → Supabase publish bridge

## Formål

Scheduled Tasks skriver ikke direkte til Supabase for artikelpublicering. En artikel afleveres som en afgrænset JSON-payload i en GitHub-PR. Den server-side bridge bevarer den eksisterende Supabase QA-, media- og publication-watchdog.

## Hård transportkontrakt

En Scheduled Task skal oprette en unik `publish/chatgpt-*` branch fra `main`, skrive præcis én ny `publish-queue/<queue_id>.json`, og oprette præcis én PR mod `main`. PR-titlen starter `[PUBLISH] ` og body indeholder `<!-- morgentidende-chatgpt-publish -->`. Tasken må ikke merge PR'en eller skrive direkte til Supabase. Workflowet lukker transport-PR'en efter vellykket aflevering.

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

`source_metadata` er en top-level JSON-array. `editorial_metadata` er et JSON-object. Eksisterende artikel-, lead-, breaking-, source- og hero-felter er fortsat understøttet.

De kanoniske `kind`-værdier er `news`, `comment`, `debate` og `magazine`. For `category_slug: "viden"` og `category_slug: "liv"` er den bindende artikeltype altid `magazine`: manglende/blank `kind` samt legacy-aliaserne `article` og `evergreen` normaliseres til `magazine`; eksplicit `news`, `comment`, `debate` eller andre modstridende værdier afvises med `kind_category_conflict`. Uden for Viden/Liv defaultes manglende `kind` fortsat til `news`.

## Magazine / evergreen

Nye magazine-payloads skal altid have en stabil `editorial_metadata.topic_key`. Uden `topic_key` afvises payloaden; topic-dedupe må aldrig falde tilbage til kun rubrik-sammenligning. Dette gælder også, når Viden/Liv-payloaden kom ind med manglende `kind` eller legacy-alias og derfor blev normaliseret til `magazine`.

Eksempel:

```json
{
  "kind": "magazine",
  "editorial_metadata": {
    "topic_key": "gaatur-efter-mad",
    "story_kind": "evergreen_explainer"
  }
}
```

`topic_key` beskriver selve evergreen-emnet og skal genbruges for samme væsentlige emne, også hvis rubrikken formuleres anderledes. Database-laget normaliserer nøglen med `normalize_story_key`; producenter bør fortsat sende en kort, stabil ASCII/slug-lignende nøgle. Der er ingen grund til at omskrive ældre lagrede keys kosmetisk.

For `scheduled` og `published` magazine-artikler er `topic_key` en database-invariant. En aktiv magazine-artikel må ikke få key'en nulstillet eller ændret via almindelig UPDATE. En reel redaktionel korrektion skal gå gennem den auditerede server-side correction-RPC med actor og reason. Historiske legacy-rækker omskrives ikke automatisk og publiceres ikke af denne regel.

`editorial_metadata.story_kind` er valgfri og defaultes til `evergreen_explainer`. Tilladte værdier for magazine er:

- `evergreen_explainer`
- `followup`
- `new_study`
- `update`

Hvis `story_kind` er `followup`, kræves desuden:

- `editorial_metadata.followup_parent_article_id`
- `editorial_metadata.followup_reason`, som skal være én af `new_fact`, `official_response`, `arrest`, `new_data`, `court_decision`, `material_update`
- top-level `story_cluster_id`, som skal være samme cluster som parent-artiklen

Magazine-followups skal stadig have `topic_key`. `topic_key` beskriver emnet; followup-felterne beskriver relationen til den tidligere artikel.

7-dages duplicate-gaten er bindende server-side og kontrollerer:

- exact normaliseret headline blandt `scheduled`/`published`
- samme `articles.topic_key` blandt `scheduled`/`published` for magazine
- en strukturelt gyldig `followup` kan genbruge emnet, men exact-headline-gaten gælder stadig

GitHub-validatoren og Edge Functionen afviser ugyldige magazine-payloads tidligt, men database-RPC'en og database-invariants er den ultimative gate.

## Hero/media-handoff: én rangeret kandidatliste

Producenten ejer discovery og rangering. Media Worker ejer download, MIME/signatur, faktiske pixelmål, rettighedsgate, SHA-256, lokal arkivering, permanent/transient fejlklassifikation, fallback og retry.

Nye producenter bør sende op til seks rangerede, selvstændigt rettighedsgodkendte originalkandidater i `editorial_metadata.hero_candidates`. Første element er den foretrukne kandidat; resten er fallback-budgettet. `hero_candidate_url` (ental) understøttes fortsat bagudkompatibelt og behandles som en liste med ét element.

Eksempel:

```json
{
  "editorial_metadata": {
    "hero_candidates": [
      {
        "source_url": "https://.../original-1.jpg",
        "source_provider": "wikimedia_commons",
        "license_name": "CC BY-SA 4.0",
        "license_url": "https://...",
        "credit_text": "...",
        "rights_notes": "...",
        "commercial_use_allowed": true,
        "local_storage_allowed": true,
        "modifications_allowed": true,
        "attribution_required": true,
        "alt_text": "Kort neutral alt-tekst"
      },
      {
        "source_url": "https://.../original-2.jpg",
        "commercial_use_allowed": true,
        "local_storage_allowed": true
      }
    ]
  }
}
```

Producenten bør bruge dimensionsmetadata som forfilter og foretrække mindst 1200×675. Kendte kandidater under 800×450 må ikke sendes. Søgemetadata er dog aldrig autoritative: Media Worker måler altid den faktisk downloadede original og håndhæver minimum 800×450.

Undgå thumbnail-/preview-URL'er og kendte nedskaleringsparametre. Brug originalfil-URL når kilden tilbyder den.

Hver kandidat skal selv have `commercial_use_allowed=true` og `local_storage_allowed=true`; rettigheder må ikke arves blindt fra kandidat 1.

Ved permanent fejl, fx for lille fil, ugyldigt format, 404/410 eller ulovlig/ikke-arkiverbar kilde, går den eksisterende fallback-motor direkte til næste kandidat. Ved transient fejl, fx timeout, 429 eller 5xx, beholdes samme kandidat og den eksisterende retry-kø bruges. Først når kandidatbudgettet er udtømt, må media-jobbet terminalisere og artiklen forblive scheduled/missing hero.

GitHub-broen må ikke implementere en separat hero-orchestrator. Den omsætter kandidatlisten til Media Workerens eksisterende `source_url` + `fallback_candidates`-kontrakt.

## Idempotency

`queue_id` gemmes som `editorial_metadata.github_queue_id`. Samme `queue_id` kan afleveres igen uden artikeldublet. Der må højst være ét åbent (`pending`/`processing`) bridge-media-job pr. artikel. Media Workerens eksisterende SHA-256-dedup genbruges.

## Publicering og QA

Bridge-funktionen indsætter artiklen som `scheduled` og kalder `public.publish_article_safely(article_id)`. Når en primær eller senere fallback-kandidat bliver `ready`, knyttes samme artikel til `hero_media_id`/intern `hero_url`; eksisterende QA og publication watchdog fortsætter derefter publiceringen. Hero/media-regler omgås aldrig.

## Scheduled Task-standard

Autonome artikelopgaver skal aflevere via GitHub-broen. De bør finde og rangere flere lovlige original-heros, helst forfiltreret til ≥1200×675, og sende dem som `editorial_metadata.hero_candidates`. De skal ikke selv implementere retry/recovery; det ejes af Media Worker. Hvis kun én kandidat findes, kan legacy `hero_candidate_url` fortsat bruges.

## Driftsprincip

Ingen Supabase-write-checkpoints fra Scheduled Tasks. Observability kommer primært fra GitHub PR/workflow-resultatet og server-side Supabase/media/QA-events. Hero-fallback er ét fælles system for Scheduled Tasks, magasin, time-nyheder, manuel chat-publicering og fremtidige producenter.
