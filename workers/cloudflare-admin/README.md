# Morgentidende Cloudflare Admin

A deliberately narrow admin Worker for inspecting Cloudflare Workers Builds and repairing the preview trigger for `morgentidende-v4`.

## Required secrets

Set these as Worker secrets, never in Git:

- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `ADMIN_TOKEN`

The Cloudflare API token must be a user-scoped token. Grant only:

- Workers Builds Configuration: Edit
- Workers Scripts: Read

## Allowed operations

- `GET /health` — public health check
- `GET /workers/:name/triggers` — inspect build triggers
- `GET /workers/:name/preview-trigger` — inspect preview trigger
- `GET /workers/:name/builds` — inspect builds
- `GET /builds/:uuid/logs` — inspect a build log
- `POST /workers/morgentidende-v4/preview-trigger/repair` — repairs only the preview trigger to:
  - build command `npm run build`
  - deploy command `npx wrangler versions upload`
  - root directory `v4-frontend`
  - include `*`, exclude `main`

All routes except `/health` require `Authorization: Bearer <ADMIN_TOKEN>`.

This Worker is intentionally not a generic Cloudflare API proxy.
