# Morgentidende – internt billedarkiv

Denne fil ejer reglerne for hero-rettigheder, lokal arkivering, medie-ingest og kreditering. Andre policies må kun henvise hertil og må ikke kopiere disse regler.

## Hård regel for nye heros
Alle nye hero-billeder skal før publicering:
- være tilladt til gratis kommerciel brug,
- være tilladt at kopiere og lagre lokalt,
- være ingested i Morgentidendes eget mediearkiv,
- have en `ready` record i `media_assets`,
- bruges via den interne delivery URL og `hero_media_id`.

Direkte hotlinking af et nyt hero fra Wikimedia, Openverse, Pexels, Unsplash eller andre eksterne billedhosts er ikke en gyldig publiceringsvej. Eksisterende legacy-artikler med eksterne `hero_url` er kun grandfathered, indtil de migreres.

Hvis licensen kræver kreditering, skal korrekt credit og licensmetadata registreres på assettet. Krediteringen vises diskret **helt nederst i artiklen**, ikke under hero-billedet.

## Formål
Morgentidende leverer egne kopier af hero-billeder, når licensen tillader lokal lagring og kommerciel genbrug. Det reducerer hotlinking, eksterne fejl, langsomme tredjepartskilder og gør rettighedsdokumentation sporbar.

## Arkitektur
1. **Media-agent** finder eller genererer det bedste relevante hero efter den redaktionelle hero-prioritet. Hastighed må ikke bruges som begrundelse for at vælge et dårligere eller mere generisk motiv.
2. **Rettighedstjek** afgør om kommerciel brug og lokal arkivering er tilladt.
3. **Fast path:** Media ingest Worker kaldes straks via `POST /ingest`. Den godkendte master hentes, SHA-256 beregnes, dubletter genbruges, filen skrives til R2 og artiklen får `hero_media_id` + intern `hero_url` i samme flow.
4. **Fallback queue:** Kun hvis fast path rammer en midlertidig teknisk fejl, gemmes samme ingest-payload i `media_ingest_jobs` til senere retry. Permanente fejl som ugyldige rettigheder, ugyldig URL eller ikke-understøttet filtype må ikke skjules som queue-jobs.
5. **Supabase `media_assets`** gemmer kilde, licens, credit, rettighedsstatus, checksum og lagringsmetadata.
6. **Cloudflare R2** gemmer én masterfil pr. asset.
7. **`media.morgentidende.dk`** er custom domain til R2 og den kanoniske leverings-URL.
8. **Cloudflare Image Transformations** genererer responsive størrelser og moderne formater ved levering. Vi gemmer ikke manuelle 320/640/960/1600-kopier.
9. **Frontend** bruger `srcset` på interne media-URLs. Eksterne legacy-URLs fungerer kun som migrationskompatibilitet.

## Hastighed og hero-garanti
Fast path er den normale publiceringsvej og skal forsøges straks, så et godkendt hero normalt arkiveres på få sekunder i stedet for at vente på et cronjob.

Fallback-køen er kun et sikkerhedsnet. Workerens cron kører hver 30. minut og behandler strandede jobs. Queue-retries kalder kerne-ingest direkte og må ikke oprette nye fallback-jobs rekursivt.

Artikler må fortsat ikke publiceres uden et fungerende arkiveret hero. Databasens `hero_media_id`-gate er derfor bevidst bevaret. Hurtigere ingest må aldrig omgå rettighedstjekket eller sænke kravene til heroens journalistiske relevans.

## R2-konfiguration
- Bucket: `morgentidende-media`
- Custom domain: `media.morgentidende.dk`
- `r2.dev` public access bør være slået fra, når custom domain virker.
- Objektkeys er content-hash-baserede og immutable, fx `heroes/2026/09/<sha256>.jpg`.
- Uploadede objekter får `Cache-Control: public, max-age=31536000, immutable`.
- Ingen tokens, access keys eller secrets må ligge i repo eller Supabase-tabeller.

## Automatisk Media-agent ingest
Worker-koden ligger i `workers/media-ingest` og har et autentificeret endpoint `POST /ingest`.

Media-agenten sender kun et billede til ingest, når rettighedstjekket allerede har fastslået:
- `commercial_use_allowed = true`
- `local_storage_allowed = true`

Payload indeholder mindst `source_url` og de to rettighedsflags. Når muligt medsendes også `article_id`, kilde/provider, licens, credit, alt-tekst og dokumentation i `metadata`.

Hvis `attribution_required = true`, skal `credit_text` være udfyldt korrekt. Manglende obligatorisk credit gør assettet uegnet til publicering.

Workerens fast path:
1. afviser ukrypterede eller åbenlyst lokale/private source-URL'er,
2. henter kun understøttede billedformater,
3. håndhæver filstørrelsesgrænse,
4. beregner SHA-256,
5. genbruger eksisterende `media_assets`-record ved identisk fil,
6. uploader master til R2 med immutable cache-header,
7. opretter en `ready` media-record i Supabase,
8. kobler asset og intern `hero_url` direkte på artiklen, hvis `article_id` er sendt med.

Hvis fast path fejler midlertidigt på netværk, upstream rate-limit eller serverfejl, returnerer endpointet `202` med `queued: true`, og fallback-jobbet bliver forsøgt igen af den sjældne cron. Et succesfuldt fast-path ingest returnerer assettet direkte. Permanente validerings- og rettighedsfejl returneres straks og køes ikke.

Workerens secrets ligger kun i Cloudflare:
- `MEDIA_INGEST_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

R2 forbindes via bindingen `MEDIA_BUCKET`; ingen R2 access key skal ligge i Worker-koden.

## Cloudflare Images
På zonen `morgentidende.dk` er **Images > Transformations** aktiv. Frontend bruger URL'er i formen:

`/cdn-cgi/image/width=640,fit=cover,format=auto,quality=82/https://media.morgentidende.dk/...`

Transformationer bruges for `media.morgentidende.dk`. Responsive størrelser genereres ved levering fra én arkiveret masterfil.

## Rettighedsgate
Et asset må sættes til `ready`, når:
- kommerciel brug er tilladt,
- lokal lagring/kopiering er tilladt,
- en intern delivery URL findes,
- licens/kilde/credit er registreret i det omfang kilden kræver det.

Databasen blokerer nye publiceringer uden `hero_media_id`. Når et media asset er tilknyttet, blokeres publicering også, hvis assettet ikke er `ready`, mangler kommercielle/lokale lagringsrettigheder, mangler obligatorisk credit eller hvis artiklens `hero_url` ikke matcher assettets interne delivery URL.

`modifications_allowed` registreres særskilt. Hvis licensen ikke tillader bearbejdning, må redaktionen ikke bruge kreative crops eller andre transformationer, der ændrer værkets karakter. Almindelig teknisk skalering vurderes stadig efter den konkrete licens.

## Kreditering
Obligatorisk billedkreditering skal være korrekt men visuelt diskret. Den vises nederst i artiklen efter artikelens kildeliste og før delings-/anbefalingsmoduler. Der vises ikke længere credit direkte under heroen.

Når metadata findes, bør krediteringen kunne indeholde fotograf/ophavsmand, kilde og licens med relevante links. Morgentidendes egne billeder/grafikker behøver ikke en særskilt synlig credit, medmindre en konkret rettighedsregel kræver det.

## Migrering af eksisterende heros
Eksisterende eksterne `hero_url` beholdes midlertidigt som legacy-fallback. Migrering sker gradvist:
1. verificer licensen igen,
2. send den godkendte master gennem ingest-flowet,
3. beregn SHA-256 og genbrug eksisterende asset ved dublet,
4. upload til R2,
5. opret `media_assets`-record,
6. sæt `articles.hero_media_id`,
7. erstat `articles.hero_url` med intern delivery URL,
8. bevar oprindelig `hero_source_url`, `hero_license*` og credit i artikelmetadata/asset.

Der må ikke masse-downloades billeder alene fordi de aktuelt kan vises eksternt. Retten til hotlink/embed er ikke det samme som retten til at lave en lokal kopi.

## AI-genererede heros
AI-heros, som Morgentidende selv har ret til at lagre og bruge kommercielt, arkiveres på samme måde. `source_provider`, model/runtime og generation metadata gemmes i `metadata`; credit må ikke fremstille et AI-billede som et dokumentarisk foto.
