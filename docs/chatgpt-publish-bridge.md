# ChatGPT Scheduled Task → GitHub → Supabase publish bridge

> **Producer-scope:** Almindelige news-runs må ikke læse denne fil. Deres komplette producer-kontrakt ligger i `docs/automations/news-task.md`. Denne fil er backend-/specialflow-reference og bevarer de detaljer, som ikke skal fylde normal news-kontekst.

## Formål

Scheduled Tasks skriver ikke direkte til Supabase for artikelpublicering eller discovery-audit. En artikel eller et audit-only run afleveres som en afgrænset JSON-payload i en GitHub-PR. Den server-side bridge bevarer Supabase media-, Article QA- og publication-gates.

## Hård transportkontrakt

En Scheduled Task skal oprette en unik `publish/chatgpt-*` branch fra `main`, skrive præcis én ny `publish-queue/<queue_id>.json`, og oprette præcis én PR mod `main`. PR-titlen starter `[PUBLISH] ` og body indeholder `<!-- morgentidende-chatgpt-publish -->`. Tasken må ikke merge PR'en eller skrive direkte til Supabase. Workflowet lukker transport-PR'en efter vellykket aflevering.

## Payload

Artikelpayload, minimum:

```json
{
  "queue_id": "unik-idempotency-nøgle",
  "slug": "artikel-slug",
  "headline": "Rubrik",
  "deck": "Manchet",
  "category_slug": "viden",
  "body_markdown": "Brødtekst",
  "story_cluster_key": "eksisterende-cluster-slug",
  "source_metadata": [],
  "editorial_metadata": {
    "sagen_kort": ["Første verificerede hovedpointe.", "Anden verificerede hovedpointe."]
  }
}
```

`deck` er den kanoniske manchet. `manchet` accepteres midlertidigt som alias og afvises med `deck_alias_conflict`, hvis begge findes og er forskellige.

`editorial_metadata.sagen_kort` er kanonisk og skal være præcis to ikke-tomme strenge. Et top-level `sagen_kort` accepteres midlertidigt som alias og flyttes ind i metadata; konflikt afvises med `sagen_kort_alias_conflict`. Backend genererer aldrig punkterne.

`story_cluster_id` er kun UUID. Producenter, der kender den semantiske slug, sender `story_cluster_key`. Backend resolver nøglen mod `story_clusters.slug` og skriver det fundne UUID. Ukendt key giver `story_cluster_not_found:<key>`; der oprettes ikke et nyt cluster. Hvis både id og key findes, skal de pege på samme cluster, ellers `story_cluster_conflict`. En tekstslug i `story_cluster_id` er `invalid_story_cluster_id`.

`payload_type` kan udelades for artikler og normaliseres da til `article`. `source_metadata` er en top-level JSON-array. `editorial_metadata` er et JSON-object. Eksisterende artikel-, lead-, breaking-, source- og hero-felter er fortsat understøttet.

### Discovery-audit

Almindelige nyhedsruns kan sende et kompakt auditspor for kandidater, der faktisk blev behandlet. Når en artikel afleveres, lægges auditsporet i `editorial_metadata.discovery_audit` sammen med et stabilt `discovery_run_id`.

Hvis et legitimt hard stop betyder, at der ikke findes en artikelpayload, må samme GitHub-transport bruges til audit-only:

```json
{
  "payload_type": "discovery_audit",
  "queue_id": "audit-news-20260915-1300",
  "run_id": "news-20260915-1300",
  "discovery_audit": [ ... ]
}
```

Audit-only opretter ingen artikel og må aldrig bruges som workaround omkring publication-gates. Maksimalt 50 kandidater accepteres pr. payload. Transporten er idempotent pr. `run_id` + `candidate_id`.

De kanoniske `kind`-værdier er `news`, `comment`, `debate` og `magazine`. For `category_slug: "viden"` og `category_slug: "liv"` er den bindende artikeltype altid `magazine`: manglende/blank `kind` samt legacy-aliaserne `article` og `evergreen` normaliseres til `magazine`; eksplicit `news`, `comment`, `debate` eller andre modstridende værdier afvises med `kind_category_conflict`. Uden for Viden/Liv defaultes manglende `kind` fortsat til `news`.

## Magazine / evergreen

Nye magazine-payloads skal altid have en stabil `editorial_metadata.topic_key`. Uden `topic_key` afvises payloaden; topic-dedupe må aldrig falde tilbage til kun rubrik-sammenligning.

`editorial_metadata.story_kind` er valgfri og defaultes til `evergreen_explainer`. Tilladte værdier er `evergreen_explainer`, `followup`, `new_study` og `update`.

Hvis `story_kind` er `followup`, kræves desuden:
- `editorial_metadata.followup_parent_article_id`
- `editorial_metadata.followup_reason` i `new_fact`, `official_response`, `arrest`, `new_data`, `court_decision`, `material_update`
- top-level `story_cluster_id` (UUID) eller `story_cluster_key` (eksisterende slug), som skal være samme cluster som parent-artiklen

Magazine-followups skal stadig have `topic_key`.

Den redaktionelle 7-dages-regel for almindelige nyheder ejes ikke af bridge/backend. Den semantiske beslutning træffes efter Research og før Write efter `docs/editorial-core.md` og `docs/automations/news-task.md`. Backend bevarer tekniske invariants som queue-id-idempotency, slug-konflikt, source/media/QA-gates, magazine `topic_key`-struktur og followup-validering.

## Hero/media-handoff: én rangeret kandidatliste

Producenten ejer discovery og rangering. Media Worker ejer download, MIME/signatur, faktiske pixelmål, rettighedsgate, SHA-256, lokal arkivering, permanent/transient fejlklassifikation, fallback og retry.

For almindelige news-payloads er den bindende standard **3–6 rangerede, selvstændigt rettighedsgodkendte kandidater** i `editorial_metadata.hero_candidates`. **1–2 kandidater er kun tilladt med en eksplicit `editorial_metadata.hero_exception.reason`**. **0 kandidater afvises.**

Når dimensioner er kendte, bør producenten vælge mindst **1200×675**. Kendte kandidater under **800×450** afvises allerede ved bridge-kontrakten. Ukendt størrelse kan accepteres som fallback, men Media Worker måler den faktiske fil og håndhæver 800×450 som absolut minimum.

`source_url` skal være en direkte downloadbar billedfil, medmindre Media Worker har en eksplicit resolver for den pågældende kildetype. Wikimedia Commons File-sider er understøttet og resolveres via Commons API. Almindelige HTML-galleri-/fotosider er ikke gyldige hero-kilder. Undgå thumbnails, previews og nedskaleringsparametre.

Hver kandidat skal selv have `commercial_use_allowed=true` og `local_storage_allowed=true`; rettigheder og kandidat-specifik resolver-state må ikke arves fra en tidligere kandidat.

Ved permanent fejl, fx for lille fil, ugyldigt format, 404/410 eller ulovlig/ikke-arkiverbar kilde, går Media Worker direkte til næste kandidat i samme state machine. Ved transient fejl, fx timeout, 429 eller 5xx, beholdes samme kandidat og retry-køen bruges.

Når alle kandidater er udtømt terminalt, markerer Media Worker jobbet `failed` og flytter den kanoniske bridge-artikel ud af `scheduled` til `draft` med `publication_attention.reason=hero_candidates_exhausted`. Der kræves ny redaktionel/media-input; ingen watchdog skal holde den kunstigt levende.

GitHub-broen må ikke implementere en separat hero-orchestrator. Den validerer news-kontrakten og omsætter kandidatlisten til Media Workerens `source_url` + `fallback_candidates`-kontrakt; selve fallback-state-machine ejes kun af Media Worker.

## Idempotency

`queue_id` gemmes som `editorial_metadata.github_queue_id`. Samme `queue_id` kan afleveres igen uden artikeldublet. Der må højst være ét åbent (`pending`/`processing`) bridge-media-job pr. artikel. Media Workerens eksisterende SHA-256-dedup genbruges.

Discovery-audit er separat idempotent på `(run_id, candidate_id)` og kan derfor genafleveres uden dobbeltrækker.

## Publicering og Article QA

Bridge-funktionen indsætter artikelpayloads som `scheduled` og starter media-flowet. Når en primær eller senere fallback-kandidat bliver `ready`, knyttes artiklen til `hero_media_id`/intern `hero_url`. **Først derefter må Article QA enqueue.**

Article QA ejer tekst-/kildeintegritet for current version. Hero-load, MIME, dimensioner, rettigheder, arkivering og hero-unikhed ejes af Media Worker/databaseinvariants og må ikke genimplementeres som parallelle QA-checks.

Den normale rækkefølge er:

`scheduled → media ingest/attach → hero ready → Article QA → safe publish`

Der er ingen kunstig fast QA-ventetid. Når current-version QA ender `passed` eller `warnings`, forsøger backend `publish_article_safely` direkte. Det eksisterende minutlige release-job bevares kun som recovery for mistede callbacks eller transiente driftsfejl og respekterer et eventuelt bevidst fremtidigt `publish_at`.

Audit-only payloads opretter ingen artikel og kalder ikke publication-gates.

## Scheduled Task-standard

Autonome artikelopgaver afleverer via GitHub-broen. Almindelige news-runs følger den komplette producer-kontrakt i `docs/automations/news-task.md` og skal ikke åbne denne fil. Media Worker ejer teknisk hero-retry/recovery.

## Driftsprincip

Ingen Supabase-write-checkpoints fra Scheduled Tasks. Observability skal være minimal: platform/scheduler-native start/stop-trace, når den findes, plus terminal GitHub-artefakt og server-side Supabase/media/QA-events. Agenten må ikke gøre per-fase logging til en ekstra tool-kæde.
