# Morgentidende Cloudflare Admin

A deliberately constrained admin Worker for diagnosing and repairing the Cloudflare parts used by Morgentidende.

## Required secrets

Set these as Worker secrets, never in Git:

- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `ADMIN_TOKEN`

Optional non-secret allowlists:

- `ALLOWED_WORKERS` (defaults to `morgentidende-v4,morgentidende-media-ingest,morgentidende-cloudflare-admin`)
- `ALLOWED_ZONE` (defaults to `morgentidende.dk`)

The Cloudflare API token must be user-scoped because Workers Builds requires a user token.

Recommended permissions for the broader operational connector:

### Account
- Workers Builds Configuration: Edit
- Workers Scripts: Read
- Workers R2 Storage: Read

### Zone — restrict resource to `morgentidende.dk`
- Zone: Read
- DNS: Read
- Zone Settings: Read
- Zone Settings: Edit
- Zone WAF: Read
- Workers Routes: Read
- Cache Rules: Read
- Analytics: Read
- Cache Purge

Do not grant Billing, API Tokens Edit, Memberships Edit, account administration, SSL certificate editing, or broad Workers Scripts Edit to this connector.

## Allowed operations

### Diagnostics / read
- `GET /health` — public health check
- `GET /diagnostics/summary` — one-shot diagnostic snapshot of Workers, R2 buckets, zone, settings, DNS, rulesets and Worker routes
- `GET /workers/:name/triggers`
- `GET /workers/:name/preview-trigger`
- `GET /workers/:name/builds`
- `GET /builds/:uuid/logs`
- `GET /r2/buckets`
- `GET /zone`
- `GET /zone/dns`
- `GET /zone/settings`
- `GET /zone/rulesets`
- `GET /zone/worker-routes`

### Narrow write operations
- `POST /workers/morgentidende-v4/preview-trigger/repair`
  - build command `npm run build`
  - deploy command `npx wrangler versions upload`
  - root directory `v4-frontend`
  - include `*`, exclude `main`
- `PATCH /zone/settings/:setting`
  - only a fixed allowlist: `always_use_https`, `automatic_https_rewrites`, `browser_check`, `min_tls_version`, `security_level`, `tls_1_3`
- `POST /zone/cache/purge`
  - only explicit HTTPS URLs under `morgentidende.dk`
  - maximum 30 URLs per request
  - purge-everything is intentionally disabled

All routes except `/health` require `Authorization: Bearer <ADMIN_TOKEN>`.

The Worker is intentionally not a generic Cloudflare API proxy. Even if the Cloudflare token has broader read access, the public admin interface only exposes the fixed operations above.
