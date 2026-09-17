# Morgentidende — media/hero backend-runbook

Denne fil er den kanoniske tekniske beskrivelse af media/hero-pipelinen. Producentregler for almindelige news-runs ligger i `docs/automations/news-task.md` og skal ikke kopieres herfra ind i prompts.

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

- provider/source-resolution når relevant,
- download af originalfil,
- MIME og filsignatur,
- faktiske pixelmål,
- absolut minimum 800×450,
- SHA-256-dedupe,
- arkivmaster i R2,
- provenance/rettighedsmetadata,
- oprettelse eller genbrug af `media_assets`,
- attach af `hero_media_id` og intern `hero_url` til artiklen.

Producentens normale søgemål er originaler på mindst 1200×675. Kendte kandidater under 800×450 skal filtreres væk før handoff; Media Worker måler alligevel altid den faktisk hentede fil som sidste autoritative kontrol.

## Hero før Article QA

For nye artikler er rækkefølgen bindende:

`article insert → media ingest → hero ready + attached → Article QA enqueue → Safe Publish → published`

**Article QA må ikke enqueue, mens artiklen mangler et publication-ready hero.** Et hero er klar til QA, når det valgte `media_assets`-asset er `ready`, rettigheder og minimumsdimensioner er bestået, intern arkivreference findes, og artiklens `hero_media_id` peger på assettet.

Media Worker/attach-flowet er dermed overgangen ind i QA-fasen. QA er ikke en parallel proces, der venter på billedet bagefter.

## Én fallback-state-machine

Media Worker er **eneste ejer** af hero-fallback. Fast path og kø/recovery må bruge samme kandidatlogik; der må ikke eksistere parallelle fallback-implementeringer med forskellige regler.

Permanente fejl, fx ugyldigt format, 404/410, for lille fil, HTML i stedet for billede eller manglende arkiveringsret, går direkte til næste allerede godkendte kandidat.

Transiente fejl, fx timeout, 408/425/429 eller 5xx, beholder samme kandidat og må gå gennem recovery-køen. `enqueue_media_ingest_fallback` bevares som database-sikkerhed for, at kun godkendte transient-tilstande kan skabe retry-job.

**Kandidat-specifik resolver-state må aldrig arves til næste kandidat.** Identiteter, resolved URLs, SHA-forventninger, dimensioner og licenssnapshots fra kandidat A skal ryddes, før kandidat B resolveres.

Når alle kandidater er permanent udtømt, terminaliserer media-jobbet og artiklen flyttes fra `scheduled` til `draft` med `publication_attention.reason = hero_candidates_exhausted`. Der kræves ingen separat watchdog til dette.

## Source URLs og resolvers

`source_url` er enten:

1. den direkte originale billed-/download-URL, eller
2. en provider-side som Media Worker eksplicit understøtter med en resolver, fx en Wikimedia Commons File-side.

En almindelig HTML-landingsside må ikke behandles som billedfil. Hvis en provider kun eksponerer HTML-sider, skal der enten findes en specifik resolver, eller producenten skal finde den egentlige original-/download-URL.

Undgå thumbnails, previews og kendte nedskaleringsparametre. Wikimedia-resolveren læser authoritative `width`/`height` fra Commons API, afviser originaler under 800×450 før billeddownload og vælger kun en thumbnail, når den selv opfylder minimumskravet; ellers bruges originalen.

## Rettigheder

Producenten kan sende rettighedsmetadata som kandidatpåstande, men publicering stoler ikke alene på producentens tekst. Det arkiverede asset er den kanoniske rettighedsrecord.

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

Hero/media er en publication dependency **før** Article QA. Artikeltekst/source-QA hashes ikke hero-attach som en redaktionel content-ændring, men QA-enqueue er stadig fail-closed på, at et validt hero allerede er attached.

Article QA ejer tekst-/kildeintegritet for den aktuelle version. Heroens MIME, dimensioner, rettigheder, arkivtilstand, URL og hero-unikhed ejes af Media Worker/databaseinvariants og genimplementeres ikke i Article QA.

Der er **ingen kunstig 45-sekunders QA-buffer**. Efter bestået current-version QA forsøger backend Safe Publish direkte. Den periodiske release-runner er kun recovery, hvis det direkte publish-forsøg ikke gennemføres.

Media-validitet håndhæves fortsat af SQL write-validation, QA-enqueue-betingelserne og den centrale publication transition. Denne defense-in-depth beskytter samme media-invariant på relevante state transitions; den er ikke en ekstra media-orchestrator.

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

- **Journalist:** motivvalg og rangerede kandidater som del af Write/final check.
- **Media Worker:** provider-resolution, filverifikation, dimensioner, SHA, arkivering, retry/fallback-eksekvering, asset creation og attach.
- **Database:** fail-closed hero-before-QA, rettigheds-/archive-/hero-match-gates og publication eligibility.
- **Article QA:** tekst-/kildeintegritet for den aktuelle version efter hero er klar.
- **Safe Publish:** eneste endelige publication transition.
- **Frontend:** responsive visning/crop og credit rendering; aldrig publication-gate.
