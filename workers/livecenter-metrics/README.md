# Livecenter metrics worker

Generic Cloudflare Worker for polling structured/semistructured Livecenter metric sources.

## Contract

The worker reads active `public.live_centers` rows and is entirely config-driven by:

- `cadence.metrics_poll_seconds`
- `cadence.metrics_writer`
- `adapters`
- `adapter_config`
- `source_policy`
- `primary_source`

It does not branch on story slug or country.

Each source adapter produces a partial metric object plus provenance. Every fetch is written to `public.live_metric_snapshots` through the `apply_livecenter_metric_snapshot` RPC. A composite is projected to the live center only when all `required_metrics` are present, validation passes and `cadence.metrics_writer = "worker"`.

The first supported adapter kind is `html_regex`: fetch HTML, collapse it to plain text, apply configured regex capture groups and parse Arabic or Nepali number phrases.

## Safety

- No partial composite projection.
- Raw source text is not stored; only hash, extracted metrics and provenance are persisted.
- Downward corrections are allowed.
- Optional plausibility multiplier can stop extreme upward jumps.
- The Worker never writes editorial microarticles.
- Editorial automation remains an independent fallback until a Worker source set has been observed and verified.

## Schedule

Cloudflare cron runs every five minutes. Per-center `metrics_poll_seconds` can make individual centers poll less often.

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not commit secret values.
