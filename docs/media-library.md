# Morgentidende – internt billedarkiv

## Formål
Morgentidende skal som hovedregel levere egne kopier af hero-billeder, når licensen tillader lokal lagring og kommerciel genbrug. Det reducerer hotlinking, eksterne fejl, langsomme tredjepartskilder og gør rettighedsdokumentation sporbar.

## Arkitektur
1. **Media-agent** finder eller genererer hero.
2. **Rettighedstjek** afgør om kommerciel brug og lokal arkivering er tilladt.
3. **Media ingest Worker** henter den godkendte master, beregner SHA-256, deduplikerer og skriver til R2.
4. **Supabase `media_assets`** gemmer kilde, licens, credit, rettighedsstatus, checksum og lagringsmetadata.
5. **Cloudflare R2** gemmer én masterfil pr. asset.
6. **`media.morgentidende.dk`** er custom domain til R2 og den kanoniske leverings-URL.
7. **Cloudflare Image Transformations** genererer responsive størrelser og moderne formater ved levering. Vi gemmer ikke manuelle 320/640/960/1600-kopier.
8. **Frontend** bruger `srcset` på interne media-URLs. Eksterne legacy-URLs fungerer uændret under migrationen.

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

Workerens ansvar:
1. afviser ukrypterede eller åbenlyst lokale/private source-URL'er,
2. henter kun understøttede billedformater,
3. håndhæver filstørrelsesgrænse,
4. beregner SHA-256,
5. genbruger eksisterende `media_assets`-record ved identisk fil,
6. uploader master til R2 med immutable cache-header,
7. opretter en `ready` media-record i Supabase,
8. kobler asset og intern `hero_url` direkte på artiklen, hvis `article_id` er sendt med.

Workerens secrets ligger kun i Cloudflare:
- `MEDIA_INGEST_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

R2 forbindes via bindingen `MEDIA_BUCKET`; ingen R2 access key skal ligge i Worker-koden.

## Cloudflare Images
På zonen `morgentidende.dk` er **Images > Transformations** aktiv. Frontend bruger URL'er i formen:

`/cdn-cgi/image/width=640,fit=cover,format=auto,quality=82/https://media.morgentidende.dk/...`

Transformationer bruges kun for `media.morgentidende.dk`. Legacy-billeder fra eksterne kilder sendes direkte, indtil de er migreret lovligt til arkivet.

## Rettighedsgate
Et asset må sættes til `ready`, når:
- kommerciel brug er tilladt,
- lokal lagring/kopiering er tilladt,
- en intern delivery URL findes,
- licens/kilde/credit er registreret i det omfang kilden kræver det.

Hvis en artikel har `hero_media_id`, blokerer databasen publicering, hvis asset ikke er `ready` eller mangler de nødvendige rettigheder.

`modifications_allowed` registreres særskilt. Hvis licensen ikke tillader bearbejdning, må redaktionen ikke bruge kreative crops eller andre transformationer, der ændrer værkets karakter. Almindelig teknisk skalering vurderes stadig efter den konkrete licens.

## Migrering af eksisterende heros
Eksisterende `hero_url` beholdes som fallback. Migrering sker gradvist:
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
