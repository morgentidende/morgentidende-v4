# Dedupe runtime ownership

Den redaktionelle 7-dages-regel ejes af `docs/editorial-core.md` og håndhæves semantisk i journalistens afsluttende QA før GitHub publish bridge startes.

Publish bridge og database må ikke træffe en ny selvstændig 7-dages-redaktionel dubletbeslutning. Backend beholder kun tekniske invariants som `queue_id`-idempotency, slug-konflikt, source/media/QA-gates, magazine `topic_key`-struktur og gyldig followup-metadata.

`topic_key` er fortsat et strukturelt magazine-felt og bruges til relationer og konsistens, men er ikke længere en separat 7-dages publication gate.
