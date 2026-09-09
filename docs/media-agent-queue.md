# Media-agent queue

ChatGPT/Media-agenten behøver ikke kende eller håndtere `MEDIA_INGEST_TOKEN`.

Når et hero er fundet eller genereret og rettighederne er verificeret, oprettes et job via Supabase-funktionen `enqueue_media_ingest_job(article_id, payload)`.

Payload skal som minimum indeholde:
- `source_url`
- `commercial_use_allowed: true`
- `local_storage_allowed: true`

Når muligt medsendes `source_provider`, `source_asset_id`, `license_name`, `license_url`, `credit_text`, `rights_notes`, `rights_expires_at`, `modifications_allowed`, `attribution_required`, `alt_text` og `metadata`.

Cloudflare Workerens cron-trigger kører hvert femte minut, claimer højst fem jobs ad gangen og sender dem gennem den samme validerede ingest-logik som det direkte `/ingest` endpoint. Ved succes opdateres jobbet til `done`, asset-id gemmes, og artiklen får automatisk `hero_media_id` og intern `hero_url`, når `article_id` er angivet.

Fejl retries automatisk op til tre forsøg. Jobs, der sidder fast i `processing` i mere end 15 minutter, frigives automatisk eller markeres `failed` efter tredje forsøg.

Køtabellen og RPC-funktionerne er kun tilgængelige for `service_role`; anon/authenticated har ingen adgang.
