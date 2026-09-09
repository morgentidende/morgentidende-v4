# Media-agent og hero-flow

Målet er, at hero-arbejdet ikke må blokere normal artikeludgivelse unødigt.

## To veje ind i R2

### Eksterne billeder
Når et eksternt billede har dokumenteret ret til kommerciel brug **og** lokal lagring, bruges Workerens `POST /ingest` med `source_url`. Workeren downloader originalen, deduplikerer på SHA-256, gemmer en kopi i R2 og opretter `media_assets`. Artiklen bruger derefter den interne `media.morgentidende.dk`-URL.

Eksterne billeder uden lokal lagringsret skal ikke kopieres ind i arkivet.

### AI-genererede billeder
AI-heros sendes direkte som fil til `POST /upload` som `multipart/form-data`:
- `file`: billedfilen
- `metadata`: JSON med rettigheder, artikel-id og øvrige metadata

Det fjerner behovet for midlertidig offentlig URL eller staging-tjeneste. Workeren gemmer filen direkte i R2, deduplikerer på SHA-256, opretter `media_assets` og knytter asset til artiklen, når `article_id` er medsendt.

## Udgiv nu
Ved chatstyret publicering skal `/ingest` eller `/upload` bruges direkte, så hero behandles med det samme. Artikeltekst/research og hero-generation bør køre parallelt, og publicering må ikke vente på den fem-minutters kø, når brugeren har bedt om udgivelse nu.

## Baggrundskø
Supabase-køen `enqueue_media_ingest_job(article_id, payload)` beholdes til autonome opgaver, batch-arbejde og retries. Den er URL-baseret og egner sig især til eksterne billeder.

Cloudflare Workerens cron-trigger kører hvert femte minut, claimer højst fem jobs ad gangen og sender dem gennem den samme validerede ingest-logik som `POST /ingest`. Ved succes sættes jobbet til `done`, asset-id gemmes, og artiklen får automatisk `hero_media_id` og intern `hero_url`.

Fejl retries automatisk op til tre forsøg. Jobs, der sidder fast i `processing` i mere end 15 minutter, frigives automatisk eller markeres `failed` efter tredje forsøg.

Køtabellen og RPC-funktionerne er kun tilgængelige for `service_role`; anon/authenticated har ingen adgang.

## Faste metadata
Begge veje skal medtage, når relevant: `source_provider`, `source_asset_id`, `license_name`, `license_url`, `credit_text`, `rights_notes`, `rights_expires_at`, `modifications_allowed`, `attribution_required`, `alt_text` og `metadata`.

Alle assets, der arkiveres, skal have `commercial_use_allowed: true` og `local_storage_allowed: true`.
