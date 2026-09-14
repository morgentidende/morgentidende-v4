# Media ingest worker

Denne Worker er den kanoniske tekniske indgang til Morgentidendes hero-arkiv.

## Invariants

1. En artikel må kun bruge en hero, når `media_assets.status = ready`.
2. `hero_media_id` er autoritativ; en løs hero-URL er ikke nok.
3. Eksterne billeder arkiveres kun ved dokumenteret `commercial_use_allowed = true` og `local_storage_allowed = true`.
4. Original kilde-URL og rettighedsmetadata bevares for eksterne billeder.
5. Rasterheros skal have læsbare dimensioner og mindst 800×450. 1200×675 er foretrukket.
6. Der gemmes én rastermaster i R2; responsive størrelser leveres dynamisk.
7. Permanente ingest-fejl skal ikke kø-retries. Brug næste kandidat eller markér terminal fejl.
8. Transiente fejl kan bruge recovery-køen.
9. Et kortlivet transport-link må aldrig blive permanent `source_url` eller `hero_source_url` for et AI-genereret billede.

## Transport vs. ingest

Transporten ind til Worker og selve ingest-logikken er to forskellige lag.

### Chatgenereret raster

Primær transport fra ChatGPT er Dropbox:

`ChatGPT file → Dropbox → kortlivet single-use download URL → pending manual_chat_media_upload_job → media cron → canonical /upload → R2`

Dropbox er staging/transport, ikke permanent asset-host. Chatten skal oprette jobbet med `transport_provider=dropbox`, `dropbox_download_url`, forventet byte-størrelse og SHA-256. Media Workerens normale ét-minuts cron opdager selv pending Dropbox-jobs; chatten behøver ikke kunne nå Worker-endpointet direkte.

Efter vellykket ingest fjernes `dropbox_download_url` fra jobmetadata, og det gemte media-asset bruger `source_provider=openai_image_generation` uden et Dropbox-link som kilde. Dropbox-provenance beholdes kun som transportmetadata.

Fallback-rækkefølge:
1. Dropbox + automatisk cron-consume.
2. `POST /manual-upload-dropbox/:job_id` som eksplicit fast path, når runtime kan nå Worker-endpointet.
3. `POST /manual-upload-file/:job_id` for direkte binær upload, når runtime kan nå Worker-endpointet.
4. Legacy `manual_chat_media_upload_jobs` base64-vej som nød-/kompatibilitetsfallback.

### Eksterne billeder

`POST /ingest` med `source_url` er normalvejen. Workeren henter og validerer originalen.

### SVG

Kontrolleret SVG kan bevares som privat source-master, men den offentlige hero er en rasteriseret WebP. Aktivt/eksternt SVG-indhold skal afvises.

## Entry points

- `src/index.ts` – kerne-ingest/upload og R2/media-assets.
- `src/ops-entry.ts` – auth/routing, Dropbox cron-consume og fast-path fallback-kandidater.
- `src/dropbox-chat-upload.ts` – Dropbox transport, integritetskontrol og canonical upload.
- `src/queue-entry.ts` – recovery-kø og legacy manual chat upload.
- `src/direct-chat-upload.ts` – direkte binær chat-upload fallback.
- `src/svg-chat-upload.ts` – kontrolleret SVG-master + rasterisering.
- `src/image-dimensions.ts` – dimension parser.

## Queue policy

Media-cron kører hvert minut. Den har to opgaver, som skal holdes adskilt:

- consume af nye Dropbox-transportjobs, som er en normal chat-hero-vej;
- recovery-kø for transiente eksterne ingest-fejl med retry-plan cirka 4/12/30 minutter.

Et Dropbox-job skal derfor behandles ved første cron-tick og må ikke vente på 4/12/30-minutters recovery-planen.

## Publicering

Media Worker skal kun levere et valideret `ready` asset. Selve artikel-publiceringen håndteres af Supabase-gates: aktuel versions-QA, source quality, hero-validering og prepublication-buffer.

Se også `docs/media-agent-queue.md`, som er den kanoniske tværgående hero-regel.