# ChatGPT Scheduled Task → GitHub → Supabase publish bridge

> **Scope:** Almindelige news-runs læser kun `docs/automations/news-task.md`. Denne fil er backend-/specialflow-reference og må ikke blive en parallel producer-prompt.

## Formål

Scheduled Tasks skriver ikke direkte til Supabase for artikelpublicering eller discovery-audit. En artikel eller et audit-only run afleveres som en afgrænset JSON-payload i en GitHub-PR. Den server-side bridge bevarer idempotens og de centrale media-, Article QA- og publication-invariants.

## Transportkontrakt

En Scheduled Task skal:

1. oprette en unik `publish/chatgpt-*` branch fra aktuel `main`,
2. skrive præcis én ny `publish-queue/<queue_id>.json`,
3. oprette præcis én PR mod `main`,
4. bruge titel der starter `[PUBLISH] `,
5. have `<!-- morgentidende-chatgpt-publish -->` i PR-body,
6. aldrig merge transport-PR'en selv.

Workflowet lukker transport-PR'en efter vellykket aflevering. Scheduled Task bruger ikke direkte Supabase-write som fallback.

## Payload

Minimum for artikel:

```json
{
  "queue_id": "unik-idempotency-nøgle",
  "slug": "artikel-slug",
  "headline": "Rubrik",
  "deck": "Manchet",
  "category_slug": "udland",
  "body_markdown": "Brødtekst",
  "source_metadata": [],
  "editorial_metadata": {
    "sagen_kort": [
      "Første verificerede hovedpointe.",
      "Anden verificerede hovedpointe."
    ],
    "frontpage_destination": "normal"
  }
}
```

`deck` er den kanoniske manchet. Legacy-aliaset `manchet` accepteres kun som kompatibilitet og må ikke være i konflikt med `deck`.

`editorial_metadata.sagen_kort` er kanonisk og består af præcis to ikke-tomme strenge. Backend genererer ikke punkterne.

`story_cluster_id` er kun UUID. Producenter, der kender den semantiske slug, sender `story_cluster_key`. Backend resolver nøglen mod `story_clusters.slug`. Hvis både id og key findes, skal de pege på samme cluster.

`payload_type` kan udelades for artikler og normaliseres da til `article`. `source_metadata` er en top-level array. `editorial_metadata` er et object.

## Discovery-audit

Når en artikel afleveres, kan det kompakte auditspor ligge i `editorial_metadata.discovery_audit` sammen med et stabilt `discovery_run_id`.

Ved et legitimt hard stop uden artikel bruges samme transport som audit-only:

```json
{
  "payload_type": "discovery_audit",
  "queue_id": "audit-news-...",
  "run_id": "news-...",
  "discovery_audit": []
}
```

Audit-only opretter ingen artikel og må aldrig bruges som workaround omkring publication-gates. Maksimalt 50 kandidater accepteres pr. payload.

## Validering: én canonical ejer pr. regel

- **GitHub-scriptet** validerer transport/payload-shape og giver tidlig producer-feedback.
- **Edge Function** ejer OIDC-authentication og basal transport-shape sanity.
- **Postgres** er canonical ejer af artikel-businessregler: kind/category, aliases, story-cluster resolution, magazine topic/followup, source-policy, media/QA/publication invariants og idempotens.

Edge Function må ikke kopiere en parallel business-rule-engine, fordi det skaber drift mellem GitHub og database.

De kanoniske `kind`-værdier er `news`, `comment`, `debate` og `magazine`. For `category_slug: "viden"` og `category_slug: "liv"` er den bindende type `magazine`; database-laget håndhæver dette.

## Magazine / evergreen

Nye magazine-payloads skal have en stabil `editorial_metadata.topic_key`.

Tilladte `editorial_metadata.story_kind` er:

- `evergreen_explainer`
- `followup`
- `new_study`
- `update`

Ved `followup` kræves parent-id, gyldig followup reason og eksisterende story cluster via `story_cluster_id` eller `story_cluster_key`. `topic_key` beskriver emnet; followup-felterne beskriver relationen til tidligere artikel.

## Semantisk dedupe

Den almindelige news-dedupe ejes **ikke** af bridge/backend. Den køres semantisk efter Research og før Write efter `docs/editorial-core.md` og `docs/automations/news-task.md`.

Backend håndhæver ikke en deterministisk 7-dages tekst/fingerprint-gate for almindelige news-artikler.

## Hero/media-handoff

Producenten ejer motivvalg og rangeret kandidat-liste. Media Worker ejer provider-resolution, download, MIME/signatur, faktiske pixelmål, rettighedsgate, SHA-256, lokal arkivering, permanent/transient fejlklassifikation, fallback og retry.

For almindelige news-payloads er standarden **3–6 rangerede, selvstændigt rettighedsgodkendte kandidater** i `editorial_metadata.hero_candidates`. 1–2 kandidater kræver `editorial_metadata.hero_exception.reason`. 0 kandidater afvises/auditeres som `NO_LEGAL_HERO`.

Eksempel:

```json
{
  "editorial_metadata": {
    "hero_candidates": [
      {
        "source_url": "https://.../original-1.jpg",
        "width": 2400,
        "height": 1600,
        "source_provider": "wikimedia_commons",
        "license_name": "CC BY-SA 4.0",
        "commercial_use_allowed": true,
        "local_storage_allowed": true,
        "attribution_required": true,
        "credit_text": "...",
        "alt_text": "Kort neutral alt-tekst"
      }
    ]
  }
}
```

### Dimensioner

Producentens normale søgemål er **originaler på mindst 1200×675**. Kendte kandidater under **800×450 må aldrig sendes**. Når dimensionerne er kendt, afleveres `width` og `height`; GitHub preflight afviser kendte for små kandidater.

Ukendt størrelse kan accepteres, men rangeres normalt efter kandidater med verificeret tilstrækkelig størrelse. Media Worker måler altid den faktisk hentede fil og håndhæver 800×450 som sidste autoritative gate.

Wikimedia Commons resolveres via Commons API; originalens authoritative dimensioner og rettigheder kontrolleres før download. En Commons-thumbnail bruges kun, hvis den selv opfylder minimumskravet; ellers bruges originalen.

### Source URL

`source_url` skal være:

- direkte original billed-/download-URL, eller
- en provider-side Media Worker eksplicit kan resolve, fx Wikimedia Commons File-side.

En almindelig HTML-landingsside er ikke en billed-URL. Kendte EU Audiovisual photo landing pages afvises i news hero preflight, indtil der eventuelt findes en eksplicit resolver. Brug den faktiske download-/originalfil-URL i stedet.

Undgå thumbnails, previews og kendte nedskaleringsparametre.

### Fallback

Media Worker ejer **én** fallback-state-machine. Kandidat-specifik resolver-state må ikke arves til næste kandidat.

- permanent fejl → næste kandidat straks,
- transient fejl → samme kandidat retryes via recovery-kø,
- alle kandidater udtømt → media-job terminalt `failed`; artiklen flyttes til `draft` med `publication_attention.reason=hero_candidates_exhausted`.

Der kræves ingen publication/media-watchdog for denne tilstand.

## Idempotency

`queue_id` gemmes som `editorial_metadata.github_queue_id`. Samme payload med samme `queue_id` kan afleveres igen uden artikeldublet; ændret payload under samme queue-id afvises.

Der må højst være ét åbent (`pending`/`processing`) bridge-media-job pr. artikel. Media Workerens SHA-256-dedupe genbruges.

Discovery-audit er separat idempotent på `(run_id, candidate_id)`.

## Publicering og Article QA

Bridge-funktionen indsætter artikelpayloads som `scheduled` og starter media-flowet.

Bindende rækkefølge:

`scheduled → media ingest/attach → hero ready → Article QA → Safe Publish → published`

Article QA ejer tekst-/kildeintegritet for den aktuelle version. Heroens MIME, dimensioner, rettigheder, arkivtilstand, URL og hero-unikhed ejes af Media Worker/databaseinvariants og kontrolleres ikke igen som parallel QA-logik.

Der er ingen kunstig 45-sekunders QA-buffer. Efter current-version QA `passed`/`warnings` forsøges Safe Publish direkte. Den periodiske release-runner er kun recovery.

Audit-only payloads opretter ingen artikel og kalder ikke publication-gates.

## Driftsprincip

Ingen Supabase-write-checkpoints fra almindelige Scheduled Tasks. Observability skal være minimal: scheduler-native trace når tilgængelig, terminal GitHub-artefakt og server-side media/QA/publication-state.

Målet er konsekvent: **én regel, én ejer, én state machine**.
