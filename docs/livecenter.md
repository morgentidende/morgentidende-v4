# Livecenter — canonical display rules

These rules apply to every Morgentidende Livecenter unless a later canonical design rule explicitly overrides them.

- The right-hand data/status panel must always state when its displayed numbers were last updated. Store and refresh `result_updated_at`; the visible source/status line must include a human-readable local time in Europe/Copenhagen.
- The left and right panel content must share the same structural top alignment. Never correct optical drift with fractional-pixel nudges; use shared layout rows, padding and typography so both columns align automatically.
- When a live update is expanded, the `Skjul opdateringen` control belongs below the expanded text.
- Labels must describe the live event. Election centers may use `Seneste fra valget` and `RESULTAT`. Generic/disaster livecenters use `Seneste udvikling` and `STATUS`; future event types should use similarly descriptive labels rather than election terminology.
- Public copy must never mention the technology used to operate the newspaper.
