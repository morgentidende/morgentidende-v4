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

### Manuel chat + AI-hero
Når brugeren manuelt beder om et AI-genereret hero i chatten, skal chat-publiceringsvejen **ikke** bruge en særskilt billedpipeline og må ikke først gøre billedet til et synligt chat-preview som et nødvendigt mellemtrin. Hero-brief og artikel-id skal føres ind i den samme kanoniske media fast path, som bruges ved autonom publicering, og den genererede fil skal sendes direkte til `POST /upload` med `article_id`.

Brugeren behøver ikke forhåndsgodkende AI-heroen, medmindre vedkommende udtrykkeligt beder om at se eller godkende den først. Standardflowet er derfor: generér → direkte upload → `media_assets` ready → tilknyt `hero_media_id`/intern `hero_url` → normal prepublication-QA → publicér.

Chatten må ikke manuelt skrive hero-URL eller publicere en artikel på baggrund af et lokalt/genereret billede, før `/upload` har returneret et gyldigt asset. Ved retry skal samme genererede fil genbruges, så Workerens SHA-256-deduplikering gør uploaden idempotent i stedet for at generere en ny variant.

## Fast path er den eneste normale indgang
Ved både chatstyret og autonom publicering skal `/ingest` eller `/upload` bruges direkte. Et URL-baseret hero-forsøg skal derfor altid gennem den synkrone `/ingest`-vej først.

`media_ingest_jobs` er **ikke** en alternativ normal indgang til mediearkivet. Et job må kun oprettes som fallback efter en dokumenteret midlertidig fejl fra fast path, fx HTTP 5xx eller `source_fetch_failed` med upstream 408, 425, 429 eller 5xx.

Den gamle generelle `enqueue_media_ingest_job`-RPC er deaktiveret for `service_role`, og direkte `INSERT` i køtabellen er blokeret. Fallback-job oprettes kun gennem `enqueue_media_ingest_fallback`, som validerer både arkivrettigheder og at den forudgående fejl faktisk var midlertidig. Det forhindrer, at en normal hero ved en fejl bliver lagt direkte i kø og dermed unødigt forsinket.

## Fallback-kø
Cloudflare Workerens cron-trigger kører hvert **4. minut** og claimer højst 10 jobs ad gangen. Køen er kun et sikkerhedsnet for fast-path-fejl; normale heros skal som udgangspunkt være færdige i samme request.

Ved en transient fejl prøves der igen efter cirka **4, 12 og 30 minutter**. Et job får højst tre køforsøg. Jobs, der sidder fast i `processing` i mere end 15 minutter, frigives automatisk eller markeres `failed` efter tredje forsøg.

Køtabellen og RPC-funktionerne er ikke offentlige. `anon` og `authenticated` har ingen adgang; Workerens `service_role` kan claime og opdatere jobs, men kan ikke omgå fallback-valideringen ved selv at indsætte nye køjobs.

## Udgiv nu
Når brugeren beder om udgivelse nu, skal artikeltekst/research og hero-arbejde så vidt muligt køre parallelt. Publicering må ikke planlægges omkring cron-køen. Hvis fast path lykkes, tilknyttes `hero_media_id` straks, hvorefter den normale 2-minutters prepublication-QA-buffer kan begynde.

## Faste metadata
Begge veje skal medtage, når relevant: `source_provider`, `source_asset_id`, `license_name`, `license_url`, `credit_text`, `rights_notes`, `rights_expires_at`, `modifications_allowed`, `attribution_required`, `alt_text` og `metadata`.

Alle assets, der arkiveres, skal have `commercial_use_allowed: true` og `local_storage_allowed: true`.
