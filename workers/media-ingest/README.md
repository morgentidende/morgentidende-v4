# Media ingest worker

Denne Worker er den kanoniske tekniske indgang til Morgentidendes hero-arkiv.

Den tværgående hero-/media-policy ejes **kun** af [`docs/media-agent-queue.md`](../../docs/media-agent-queue.md). Dette dokument beskriver kun Workerens implementation og må ikke oprette en parallel regelbog for transport, rettigheder, fallback eller publicering.

## Runtime-invariants

- Et asset er først anvendeligt, når `media_assets.status = ready`.
- `hero_media_id` er den autoritative artikelkobling; løs hero-URL er ikke en publiceringsvej.
- Media Worker ejer filvalidering, dimensioner, SHA-256, R2-arkiv, provenance og retry/fallback for media.
- Publication/QA-gates ejes af Supabase-publiceringslaget, ikke af Media Worker.
- Kortlivede transport-URL'er må aldrig blive permanente billedkilder.

## Entry points

- `src/index.ts` – kerne-ingest/upload og R2/media-assets.
- `src/ops-entry.ts` – auth/routing, Dropbox cron-consume og fast-path fallback-kandidater.
- `src/dropbox-chat-upload.ts` – Dropbox-transport, integritetskontrol og canonical upload.
- `src/queue-entry.ts` – recovery-kø samt bevaret legacy-kompatibilitet for manual chat upload.
- `src/direct-chat-upload.ts` – direkte binær chat-upload fallback.
- `src/svg-chat-upload.ts` – kontrolleret SVG-master + rasterisering.
- `src/image-dimensions.ts` – dimension parser.

## Drift

Media-cron kører hvert minut og holder to forskellige opgaver adskilt:

1. nye Dropbox-transportjobs, som behandles ved første cron-tick;
2. recovery for dokumenterede transiente eksterne ingest-fejl med retry-plan cirka 4/12/30 minutter.

Nye producenter må ikke bygge alternative media-, hero- eller retry-pipelines omkring disse entry points. Brug den kanoniske kontrakt i `docs/media-agent-queue.md`.
