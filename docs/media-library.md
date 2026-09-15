# Morgentidende – internt billedarkiv

Denne fil beskriver rettigheder, kreditering, arkivering og legacy-migrering for medieassets. Den tekniske hero-/transportpipeline ejes af `docs/media-agent-queue.md`; timing og publiceringsbuffer ejes af `docs/v4-spec.md` og den operative Supabase-konfiguration.

## Hård regel for nye heros
Alle nye hero-billeder skal før publicering:
- være tilladt til kommerciel brug,
- være tilladt at kopiere og lagre lokalt,
- være ingested i Morgentidendes eget mediearkiv,
- have en `ready` record i `media_assets`,
- bruges via den interne delivery URL og `hero_media_id`.

Direkte hotlinking af et nyt hero fra Wikimedia, Openverse, Pexels, Unsplash eller andre eksterne billedhosts er ikke en gyldig publiceringsvej. Eksisterende legacy-artikler med eksterne `hero_url` er kun grandfathered, indtil de migreres.

No-attribution-licenser foretrækkes. Hvis licensen kræver kreditering, skal korrekt credit og licensmetadata registreres på assettet. Krediteringen vises diskret helt nederst i artiklen, ikke under hero-billedet.

## Arkivmodel
- Supabase `media_assets` gemmer kilde, licens, credit, rettighedsstatus, checksum og lagringsmetadata.
- Cloudflare R2 gemmer én masterfil pr. asset.
- `media.morgentidende.dk` er den kanoniske leverings-URL.
- Cloudflare Image Transformations genererer responsive størrelser og moderne formater ved levering; vi gemmer ikke permanente frontend-kopier i flere størrelser.
- Objektkeys er content-hash-baserede og immutable, fx `heroes/2026/09/<sha256>.jpg`.
- Uploadede objekter får `Cache-Control: public, max-age=31536000, immutable`.
- Ingen tokens, access keys eller secrets må ligge i repo eller Supabase-tabeller.

Transport, `/ingest`, Dropbox, direct-binary fallback, SVG-behandling, retry-kø og cron-frekvens beskrives kun i `docs/media-agent-queue.md` og `workers/media-ingest/README.md`.

## Rettighedsgate
Et asset må sættes til `ready`, når:
- kommerciel brug er tilladt,
- lokal lagring/kopiering er tilladt,
- en intern delivery URL findes,
- licens/kilde/credit er registreret i det omfang kilden kræver det.

Når et media asset er tilknyttet, må publicering ikke bruge assettet, hvis det ikke er `ready`, mangler kommercielle/lokale lagringsrettigheder, mangler obligatorisk credit eller hvis artiklens `hero_url` ikke matcher assettets interne delivery URL.

`modifications_allowed` registreres særskilt. Hvis licensen ikke tillader bearbejdning, må redaktionen ikke bruge kreative crops eller andre transformationer, der ændrer værkets karakter. Almindelig teknisk skalering vurderes efter den konkrete licens.

## Provenance
Når relevant bevares:
- `source_provider`
- `source_asset_id`
- original `source_url` for eksterne billeder
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
- SHA-256, byte-størrelse og faktiske dimensioner
- teknisk ingest-/transportmetadata.

AI-genererede assets bruger `source_provider = openai_image_generation`. Der må ikke opfindes en ekstern `source_url` til et genereret billede, og credit må ikke fremstille et AI-billede som et dokumentarisk foto.

## Kreditering
Obligatorisk billedkreditering skal være korrekt men visuelt diskret. Den vises nederst i artiklen efter artikelens kildeliste og før delings-/anbefalingsmoduler. Der vises ikke credit direkte under heroen.

Når metadata findes, bør krediteringen kunne indeholde fotograf/ophavsmand, kilde og licens med relevante links. Morgentidendes egne billeder/grafikker behøver ikke særskilt synlig credit, medmindre en konkret rettighedsregel kræver det.

## Migrering af eksisterende heros
Eksisterende eksterne `hero_url` beholdes midlertidigt som legacy-fallback. Migrering sker gradvist:
1. verificer licensen igen,
2. send den godkendte master gennem den kanoniske ingest-pipeline,
3. beregn SHA-256 og genbrug eksisterende asset ved dublet,
4. upload til R2,
5. opret eller genbrug `media_assets`-record,
6. sæt `articles.hero_media_id`,
7. erstat `articles.hero_url` med intern delivery URL,
8. bevar oprindelig `hero_source_url`, licens og credit i artikelmetadata/asset.

Der må ikke masse-downloades billeder alene, fordi de aktuelt kan vises eksternt. Retten til hotlink/embed er ikke det samme som retten til at lave en lokal kopi.

## AI-genererede heros
AI-heros, som Morgentidende har ret til at lagre og bruge kommercielt, arkiveres efter samme asset- og provenancekrav. Den tekniske transportvej og fallback-rækkefølge står kun i `docs/media-agent-queue.md`.