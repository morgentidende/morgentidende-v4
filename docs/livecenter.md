# Livecenter — canonical contract and display rules

These rules apply to every Morgentidende Livecenter unless a later canonical design rule explicitly overrides them.

## Platform rule

A new live story is data/configuration, not a frontend/CSS branch. `LiveCenter.astro` must not contain story slugs or event-specific display copy. Visible labels come from `live_centers.ui`. CSS must never detect event type or replace semantic text with `font-size: 0`, `::after` or `:has()` tricks.

Code changes are reserved for a genuinely new schema/renderer/source-adapter type. New stories should reuse existing types. Changes to the shared visual shell still require the repository's explicit design-change approval marker.

## Ownership

- Scheduled Task / journalist owns only the left-hand editorial micro-updates in `live_updates`.
- Worker + adapter owns structured metrics whenever `cadence.metrics_writer = "worker"`.
- A Scheduled Task must never write, patch, infer or "repair" `metrics`, `result_data`, metric timestamps or metric provenance for a worker-owned center.
- Backend owns validation/snapshots/idempotency; frontend only renders validated state.
- If an official/structured metrics feed is unavailable, the center may use a non-metric renderer such as `headline_only`; an LLM must never synthesize casualty counts, election percentages or similar live numbers as fallback.

## Data contract

`live_centers` exposes the generic fields:

- `kind` — event family such as `disaster`, `election`, `generic`.
- `schema` — metrics contract, e.g. `casualties.v1` or `election_results.v1`.
- `renderer` — e.g. `stat_list`, `election_table`, `headline_only`.
- `ui` — visible labels and expand/collapse copy.
- `metrics` — validated current metrics payload. `result_data` remains a transition fallback only.
- `source_policy` — rule for which source may drive metrics.
- `source_name` / `source_url` — clean provenance fields, never presentation strings.
- `source_published_at` / `source_checked_at` — source provenance timestamps.
- `metrics_updated_at` — timestamp for the numbers currently shown.

During migration, writers may mirror `metrics` to `result_data` and `metrics_updated_at` to `result_updated_at` for backward compatibility. New UI should prefer the generic fields.

## Editorial cadence and watchdog

When `cadence.editorial` is `hourly`, the left-hand column should receive at most one meaningful micro-update per hour. `automation_slot_key` provides idempotency for the editorial slot.

An active homepage Livecenter with hourly editorial cadence is considered stale when no `live_updates` row has been published for more than 90 minutes. The deterministic worker-side watchdog records `livecenter_editorial_stale` in `automation_watchdog_alerts` and resolves the alert when a fresh update appears.

The watchdog is observability only. It must not invent or auto-publish editorial text.

## Display rules

- The right-hand data/status panel must always show source and last metric update at the bottom, on two separate DOM lines: `Kilde: …` and `Opdateret HH.MM`.
- Structured metrics are visibly marked as potentially stale when `metrics_updated_at` is older than the freshness window. The default freshness window is the greater of 15 minutes or three configured metric-poll intervals.
- Source name and timestamp must not be encoded together in `source_label`.
- The page header must not repeat live-update or metrics timestamps.
- The left and right panel content must share the same structural top alignment. Never correct optical drift with fractional-pixel nudges.
- When a live update is expanded, `Skjul opdateringen` belongs in the DOM below the expanded text, not absolutely positioned over it.
- Homepage rendering is bounded: render at most the five newest editorial updates, with only the newest two expanded into the primary feed and older rendered items behind the archive disclosure. Do not SSR an unbounded update history into the homepage.
- Labels must come from `ui`. Election centers can use `Seneste fra valget` / `RESULTAT`; disaster centers can use `Seneste udvikling` / `STATUS`; CSS does not know these strings.
- Public copy must never mention the technology used to operate the newspaper.

## Current renderers

- `stat_list` — status/casualty style metrics.
- `election_table` — election percentage/party/block data.
- `headline_only` — status headline/subheadline when no structured metric renderer is needed.

Unknown renderers must not silently guess a story type.
