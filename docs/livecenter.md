# Livecenter — canonical contract and display rules

These rules apply to every Morgentidende Livecenter unless a later canonical design rule explicitly overrides them.

## Platform rule

A new live story is data/configuration, not a frontend/CSS branch. `LiveCenter.astro` must not contain story slugs or event-specific display copy. Visible labels come from `live_centers.ui`. CSS must never detect event type or replace semantic text with `font-size: 0`, `::after` or `:has()` tricks.

Code changes are reserved for a genuinely new schema/renderer/source-adapter type. New stories should reuse existing types.

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

## Display rules

- The right-hand data/status panel must always show source and last metric update at the bottom, on two separate DOM lines: `Kilde: …` and `Opdateret HH.MM`.
- Source name and timestamp must not be encoded together in `source_label`.
- The page header must not repeat live-update or metrics timestamps.
- The left and right panel content must share the same structural top alignment. Never correct optical drift with fractional-pixel nudges.
- When a live update is expanded, `Skjul opdateringen` belongs in the DOM below the expanded text, not absolutely positioned over it.
- Labels must come from `ui`. Election centers can use `Seneste fra valget` / `RESULTAT`; disaster centers can use `Seneste udvikling` / `STATUS`; CSS does not know these strings.
- Public copy must never mention the technology used to operate the newspaper.

## Current renderers

- `stat_list` — status/casualty style metrics.
- `election_table` — election percentage/party/block data.
- `headline_only` — status headline/subheadline when no structured metric renderer is needed.

Unknown renderers must not silently guess a story type.
