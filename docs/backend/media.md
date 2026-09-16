# Morgentidende — media/hero backend-runbook

Denne fil er den kanoniske tekniske beskrivelse af media/hero-pipelinen. Producer-regler for almindelige news-runs ligger i `docs/automations/news-task.md` og skal ikke kopieres herfra ind i prompts.

## Sluttilstand

Et nyt hero må først bruges ved publicering, når:

- filen er valideret af Media Worker,
- assettet findes i `media_assets` med `status = ready`,
- kommerciel brug er tilladt,
- lokal lagring/kopiering er tilladt,
- obligatorisk credit/licensmetadata er registreret,
- `articles.hero_media_id` peger på assettet,
- `articles.hero_url` matcher assettets interne `delivery_url`.

Nye heros hotlinkes ikke direkte fra eksterne hosts. `media.morgentidende.dk` er den kanoniske leveringshost for arkiverede rasterassets.

## GitHub-news: queue-first

Almindelige GitHub-news afleverer rangerede `editorial_metadata.hero_candidates` sammen med artikelpayloaden.

Efter article insert opretter `enqueue_github_bridge_media` et `media_ingest_jobs`-job. GitHub-news er derfor **queue-first**; den normale news-sti kalder ikke synkront `/ingest` fra ingest-SQL.

Media Worker claimer jobbet og håndterer:

- download af originalfil,
- MIME og filsignatur,
- faktiske pixelmål,
- minimum 800×450 og kvalitetspræference omkring 1200×675,
- provider/source-resolution når relevant,
- SHA-256-dedupe,
- arkivmaster i R2,
- provenance/rettighedsmetadata,
- oprettelse eller genbrug af `media_assets`,
- attach af `hero_media_id` og intern `hero_url` til artiklen.

## Retry og fallback

Permanente fejl, fx ugyldigt format, 404/410, for lille fil eller manglende arkiveringsret, skal terminaliseres eller føre direkte til næste allerede godkendte kandidat.

Transiente fejl, fx timeout, 408/425/429 eller 5xx, må gå gennem recovery/fallback-køen. `enqueue_media_ingest_fallback` bevares som database-sikkerhed for, at kun godkendte transient-tilstande kan skabe fallback-job.

Workerens kø/recovery er transportlogik; den er ikke i sig selv en ekstra publication-gate.

## Rettigheder

Produceren kan sende rettighedsmetadata som kandidatpåstande, men publicering stoler ikke alene på producentens tekst. Det arkiverede asset er den kanoniske rettighedsrecord.

Når relevant gemmes på assettet:

- `source_provider`
- `source_asset_id`
- `source_url`
- `license_name`
- `license_url`
- `credit_text`
- `rights_notes`
- `rights_expires_at`
- `commercial_use_allowed`
- `local_storage_allowed`
- `modifications_allowed`
- `attribution_required`
- `alt_text`
- SHA-256, byte-størrelse og faktiske dimensioner.

No-attribution-licenser foretrækkes. Når attribution er påkrævet, vises korrekt credit diskret i artiklen.

`modifications_allowed` vurderes særskilt. Creative crops eller andre ændringer må ikke bruges, hvis licensen forbyder relevante bearbejdelser.

## Arkivmodel

- Én masterfil pr. rasterasset i Cloudflare R2.
- Objektkeys er content-hash-baserede og immutable.
- Responsive størrelser og moderne formater leveres dynamisk gennem Cloudflare/image transforms.
- Frontend gemmer ikke permanente størrelsesvarianter alene til layout.
- Secrets/tokens må ikke gemmes i repo eller databasefelter.

## Crop og levering

Frontend bruger den fælles media-helper til responsive transforms. Face-aware gravity kan bruges på managed media, men frontend-crop er præsentation og må ikke omgå rettigheds- eller archive-gates.

Legacy eksterne URLs kan mangle managed transforms. Nye assets skal gennem den interne delivery-URL.

## QA og publicering

Hero/media er en separat publication dependency. Artikeltekst/source-QA hashes ikke længere hero-attach som en redaktionel content-ændring.

Media-validitet håndhæves fortsat af SQL write-validation og den centrale publication transition. Defense-in-depth her er tilsigtet.

Den aktuelle prepublication-release-policy er **45 sekunder** og ejes af Supabase publication/QA-logikken. Media-runbooken må ikke definere en alternativ buffer.

## Chatgenererede raster-heros

Dropbox er den primære transportbro, når ChatGPT-genererede rasterbilleder ikke kan sendes direkte til worker-endpointet.

Standardprincip:

`generated file → Dropbox/direct binary transport → Media Worker → R2 → media_assets ready → attach`

Dropbox-link er kun transport og må ikke blive permanent hero-URL.

Den gamle base64/SQL-uploadvej er pensioneret. `manual_chat_media_upload_jobs` kan fortsat bruges til aktive Dropbox/direct-binary jobs, så længe den vej stadig har callers.

## SVG

SVG må bruges som kontrolleret master til fx kort og diagrammer, men publiceres ikke råt som hero.

`SVG master → sikkerhedskontrol → rasterisering → arkiveret rasterasset`

Scripts, event-handlers, `foreignObject` og aktive eksterne ressourcer afvises. Original SVG kan bevares som provenance/master.

## Legacy

`legacy_unarchived` er kun migrationsrest. Nye assets må ikke oprettes som legacy/unarchived.

Migrering af et legacy-hero kræver:

1. verificér rettigheder igen,
2. ingest samme lovlige original gennem normal worker,
3. arkivér i R2,
4. opret/genbrug `media_assets`,
5. opdatér `hero_media_id` og intern `hero_url`,
6. bevar provenance/credit.

Når antallet af legacy-rækker er nul og ingen kode kan skabe nye, kan legacy-kolonne og guard fjernes i en separat migration.

## Ownership

- **Journalist/producer:** motivvalg og rangerede kandidater.
- **Media Worker:** filverifikation, dimensioner, provider-resolution, SHA, arkivering, retry/fallback-eksekvering og asset creation.
- **Database:** fail-closed rettigheds-/archive-/hero-match-gates og publication eligibility.
- **Frontend:** responsive visning/crop og credit rendering; aldrig publication-gate.
