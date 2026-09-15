# Media-agent og hero-flow

Dette dokument er den kanoniske tekniske regel for hero-arbejdet i Morgentidende.

Målet er: høj billedkvalitet, dokumenterede rettigheder, idempotent arkivering og så kort tid som muligt fra færdig hero til publiceret artikel.

## 1. Fælles slutpunkt: `media_assets`

Uanset hvor en hero kommer fra, må artiklen først bruge den, når Media Worker har valideret filen og oprettet et `media_assets`-asset med `status = ready`.

Artikler må ikke publiceres på baggrund af en lokal fil, en midlertidig URL eller en manuelt indsat hero-URL alene. `hero_media_id` skal pege på det validerede asset, og `hero_url` skal være Workerens interne leverings-URL.

## 2. Eksterne billeder

Når et eksternt billede har dokumenteret ret til både kommerciel brug og lokal lagring, bruges Media Workerens synkrone `POST /ingest` med `source_url`.

Workeren skal:
- hente originalen,
- kontrollere MIME/signatur,
- læse dimensioner,
- håndhæve hero-minimum på 800×450,
- registrere kvalitetsadvarsel under den foretrukne grænse 1200×675,
- deduplikere på SHA-256,
- gemme én arkivmaster i R2,
- bevare original `source_url` og rettighedsmetadata,
- oprette `media_assets` og knytte asset til artiklen.

Hvis den første kandidat fejler permanent, fx fordi filen er for lille, ugyldig eller ikke må arkiveres, skal hero-orchestreringen gå direkte videre til næste allerede fundne og rettighedsgodkendte kandidat. Den samme permanente fejl må ikke vente på retry-køen.

Transient fejl, fx 429, timeout eller 5xx, må bruge fallback-køen.

### Forsidevariation

Hero-valget skal passe til artiklen og samtidig fungere på den aktuelle forside som helhed.

- Samme foto må ikke optræde to gange på samme forside; næsten-identiske motiver undgås også.
- I story clusters og magasinrækker tilstræbes motivvariation frem for flere næsten ens bygninger, flag, skærme eller portrætter ved siden af hinanden.
- Hvis to heros visuelt konkurrerer eller ligner hinanden for meget, beholdes det stærkeste motiv til den vigtigste artikel og der vælges et relevant alternativ til den anden.
- Personbårne historier bør som udgangspunkt have mennesker i heroen, når et relevant og lovligt foto findes.
- Et tydeligt genkendeligt ansigt bruges kun som hero, når personen faktisk er central i artiklen; ellers foretrækkes et mindre identificerende menneskemotiv.

## 3. Chatgenererede raster-heros: Dropbox er fast hovedregel

**Fast regel:** Når en raster-hero genereres i ChatGPT til Morgentidende, er Dropbox den primære transportbro fra ChatGPT til Media Worker.

Standardflow:

`image_gen → Dropbox upload → kortlivet single-use download-link → Media Worker /upload → R2 → media_assets ready → hero_media_id → QA → publicering`

Dropbox er kun transportlag. Dropbox-linket er ikke artikelens hero-URL og må ikke gemmes som permanent offentlig billedkilde.

Den genererede original skal uploades i højest praktiske kvalitet. Chatten må ikke nedskalere eller hårdt komprimere billedet blot for at få det gennem transportlaget.

Dropbox-download-linket skal være kortlivet og single-use, så Media Worker henter filen én gang og derefter arbejder videre på sin egen R2-kopi.

Media Worker skal stadig udføre de samme kontroller som ved andre heros: MIME, filsignatur, dimensioner, SHA-256, rettigheder og arkivstatus.

### Fallback-rækkefølge for chatgenererede raster-heros

1. Dropbox-transport.
2. Direkte binær chat-upload (`POST /manual-upload-file/:job_id`) hvis runtime kan nå Worker-endpointet direkte.

Den tidligere base64/SQL-uploadvej er pensioneret. Databasen håndhæver nu, at `payload_base64` altid er `NULL`, så base64-transport ikke kan genindføres ved en fejl. `manual_chat_media_upload_jobs` består fortsat som transport-jobtabel for de aktive Dropbox/direct-binary flows; tabellen er ikke i sig selv et tegn på base64-transport.

Ved retry skal samme genererede fil genbruges. Der må ikke genereres en ny variant blot fordi transporten fejlede; SHA-256 skal gøre forløbet idempotent.

## 4. Chatgenereret SVG

SVG er tilladt som kontrolleret original/master, især til kort, diagrammer og redaktionel grafik.

Den rå SVG må ikke publiceres direkte som hero. Flowet er:

`kontrolleret SVG → transport → privat SVG-masterarkiv → sikkerhedskontrol → rasterisering til WebP → Media Worker → media_assets ready`

Original SVG bevares som provenance/master, mens den offentlige hero er rasteriseret. SVG med scripts, event-handlers, `foreignObject` eller eksterne/aktive ressourcer skal afvises.

Dropbox må også bruges som transportbro for SVG, men den eksisterende SVG-master/rasteriseringslogik skal bevares.

## 5. Fast path og fallback-kø

Normal publicering må ikke vente på køen.

- `/ingest` og `/upload` er de normale Media Worker-indgange.
- `media_ingest_jobs` er kun recovery for dokumenterede transiente fejl.
- Workerens recovery-cron kører hvert **1. minut**.
- Retry-planen er cirka **4, 12 og 30 minutter**.
- Permanente fejl skal terminaliseres straks eller føre til næste kandidat.

## 6. Publicering og timing

Når brugeren siger "udgiv", skal research/artikel og hero-arbejde køre parallelt, hvor det er muligt.

Media-laget ejer ikke længden på prepublication-QA-bufferen. Den aktuelle produktregel ligger i `docs/v4-spec.md`, og den operative værdi spejles i Supabase `site_settings.prepublication_qa_policy`. Aktuelt er bufferen **2 minutter** og non-blocking med hård release-deadline.

Så snart hero er `ready`, source gate er godkendt og den aktuelle artikelversion har bestået eller er frigivet af den aktive QA-policy, fortsætter publiceringen efter den centrale publiceringsregel. Media-cron er kun transport/recovery og må ikke blive en ekstra publiceringsgate.

Målet for chatgenererede heros er derfor ikke mange minutters transporttid. Når billedet er færdiggenereret, bør Dropbox → Media Worker → `ready` normalt være en kort operation, så media-laget ikke forlænger den centrale QA-buffer.

## 7. Rettigheder og provenance

Når relevant skal assetet bevare:
- `source_provider`
- `source_asset_id`
- `source_url` / original kilde-URL for eksterne billeder
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
- teknisk metadata om transport/ingest.

AI-genererede assets bruger `source_provider = openai_image_generation`. Der må ikke opfindes en ekstern `source_url` til et genereret billede.

Alle assets, der arkiveres i R2, skal have `commercial_use_allowed: true` og `local_storage_allowed: true`.

De juridiske detaljer om arkivering, kreditering og legacy-migrering er samlet i `docs/media-library.md`; denne fil ejer den tekniske pipeline.

## 8. Én master, responsive leverancer

Der gemmes én arkivmaster i R2. Responsive størrelser leveres dynamisk via Cloudflare/image-transforms. Vi skal ikke gemme flere permanente kopier af samme rasterhero alene for frontend-størrelser.

## 9. Ingen unødvendig brugerfriktion

Når brugeren udtrykkeligt har bedt om en AI-genereret hero til en artikel, kræves der ikke særskilt forhåndsgodkendelse af billedet, medmindre brugeren specifikt beder om preview/godkendelse først.

Et genereret hero-billede, der er tiltænkt artiklen, skal som standard føres direkte gennem transport- og media-pipelinen frem for at skabe et ekstra manuelt publiceringstrin.