# Morgentidende — canonical news automation mandate

Denne fil er **eneste entrypoint** for almindelige autonome nyhedsruns. Scheduled Tasks henviser hertil og kopierer ikke regler lokalt.

## Pipeline

`Discover → Research → én semantisk 7-dages-dedupe → Write + final check → GitHub-handoff → Hero/media → Article QA → Safe Publish`

Der findes **præcis én redaktionel dedupe**. Den ligger efter Research og før Write. Der må ikke køres en ny semantisk dubletkontrol efter Write, ved handoff, i Media, i Article QA eller i Safe Publish. En sjælden dublet er acceptabel; dobbelt dedupe og falske stop er ikke.

Backend må fortsat håndhæve teknisk idempotens og øvrige publication-invariants, fx samme `queue_id`, gyldig hero, source policy, current-version QA og strukturerede artikelkrav. Det er ikke redaktionel dedupe.

Denne automation vælger ikke Viden eller Liv.

## 1. Discover

Start med et billigt forsideblik og vælg højst 5 friske kandidater. Prioritér aktualitet, dokumenterbarhed, underdækning i danske medier, profilmatch og et bedre samlet nyhedsmix.

1. Lav et kort breaking-scan af store danske medier. Override kun ved en klart større frisk historie med høj dansk betydning.
2. Ellers brug `docs/discovery-sources.md`.
3. Research kandidater i rangeret rækkefølge, én ad gangen.
4. Hvis hele shortlisten falder af, må der laves højst én ny historievalgsrunde med dansk major-media fallback.

Kør ikke dedupe på en tynd discovery-beskrivelse.

## 2. Research

Brug `authoritative` eller relevante primærkilder til centrale fakta. `discovery_only` må finde historien, men ikke bære centrale faktuelle påstande.

Normal researchramme er 2–3 autoritative/primære kilder. Stop, når centrale påstande og væsentlige forbehold er dokumenteret.

Research slutter med et kompakt **story brief**: hovedbegivenhed, stærkeste dokumenterede hovedfaktum, centrale aktører, sted/tid, væsentlige tal og hvad der konkret er nyt nu.

## 3. Den eneste semantiske dedupe

Kør én semantisk vurdering **efter Research og før Write**.

### Primær ledger

Brug alle GitHub-PR'er i repoet med titelprefix `[PUBLISH] ` fra de seneste 7 dage, med `state=all`, som den primære dedupe-ledger. Lukkede PR'er tæller, fordi bridge-flowet normalt lukker dem efter ingest.

Enumerér nok PR'er til at dække 7-dages-vinduet. Screen først titler/metadata billigt og hent kun fuld PR/payload for semantisk plausible overlap.

### Supplerende historik

Brug offentlig Morgentidende-forside/artikelhistorik/feed som **best-effort supplement**. Manglende, afkortet eller ufuldstændigt public feed må aldrig i sig selv stoppe runnet eller udløse `QA_HISTORY_UNAVAILABLE`, når GitHub-ledgeren kan vurderes forsvarligt.

Selve afgørelsen er semantisk og redaktionel: sammenlign hovedbegivenhed, hovedfaktum, aktører, tal, geografi og den konkrete nye udvikling. Brug ikke fingerprint, ordlighed, nøgleord eller rubrikmatch som dubletdommer.

Hvis kandidaten er næsten-identisk uden væsentlig videreudvikling: registrér `duplicate_of`, ekskludér den konkrete sag resten af runnet og lav et nyt Discover. Hvis den er en legitim opfølger, behold den og brug samme `story_cluster_key` samt struktureret `Læs også`.

Hvis der går mere end cirka 5 minutter fra dedupe-check til Write, refresh kun den friske `[PUBLISH]`-hale siden sidste check.

Gem et kompakt `editorial_metadata.dedupe_context` med `checked_at`, `window_days: 7`, `publish_prs_seen`, `include_closed_publish_prs: true`, `newest_publish_pr` når observerbar samt `public_articles_seen` når offentlig historik faktisk kunne hentes. Snapshot'et er diagnostik, ikke en ny gate.

**Efter denne fase er dedupe afsluttet. Der må ikke være en senere semantisk dublet-gate.**

## 4. Write + final check

Følg `docs/editorial-core.md`, `docs/editorial-language-glossary.md` og `docs/news-editorial-profile.md` for artikelkrav, sprog, fairness, `SAGEN KORT`, kilder og delingspotentiale.

Write afsluttes med Journalistens final check: korrektur, payload-kontrol og forsideplacering. Final check må ikke starte en ny dedupe-runde. Hvis artikelens substans ændres væsentligt, gå tilbage til Research og kør den ene dedupe igen før ny Write.

`editorial_metadata.frontpage_destination` er `special_1`, `special_2` eller `normal`.

## 5. Hero/media

Almindelige nyheder bruger ægte dokumentarisk materiale. Lever normalt 3–6 rangerede hero-kandidater med dokumenterede rettigheder.

Søg efter originaler på mindst **1200×675** når dimensionsmetadata findes. Kendte kandidater under **800×450** er forbudt. Brug originalfil/download-URL eller en provider-side, som Media Worker eksplicit kan resolve. Almindelige HTML-landingssider og thumbnail-/preview-URL'er må ikke sendes som billedkandidater.

Media Worker ejer download, MIME/signatur, faktiske pixelmål, rettighedsgate, SHA-256, arkivering, fallback og retry. Article QA må først enqueue, når hero er publication-ready og attached.

0 lovlige hero-kandidater → `NO_LEGAL_HERO` og audit-only.

## 6. Discovery-audit

Bevar kun et kompakt auditspor for kandidater, der faktisk blev rangordnet eller researchet. Brug stabile `discovery_run_id` og `candidate_id`.

For leverede artikler ligger audit og `dedupe_context` i `editorial_metadata`. Ved legitimt hard stop leveres `payload_type=discovery_audit`.

## 7. Hard stops

Tilladte stopkoder:
- `CANONICAL_UNREADABLE`
- `INSUFFICIENT_DOCUMENTATION`
- `QA_HISTORY_UNAVAILABLE` — kun hvis den primære GitHub `[PUBLISH]`-ledger ikke kan hentes/vurderes forsvarligt
- `NO_PUBLISHABLE_CANDIDATE`
- `NO_LEGAL_HERO`
- `BRIDGE_FAILED`
- `BACKEND_REJECTED`

Et dubletfund afslutter ikke i sig selv runnet; det udløser nyt Discover inden for den normale runramme.

## 8. GitHub-handoff

Scheduled Task skriver aldrig artiklen direkte til Supabase.

1. Opret en unik `publish/chatgpt-*` branch fra aktuel `main`.
2. Skriv præcis én ny `publish-queue/<queue_id>.json`.
3. Payloaden indeholder mindst `queue_id`, `slug`, `headline`, `category_slug`, `deck`, `body_markdown`, top-level `source_metadata` og `editorial_metadata`; `sagen_kort` er præcis to ikke-tomme strenge.
4. Medtag hero-kandidater, source-registry-opdateringer, `dedupe_context` og audit når relevant.
5. Opret præcis én PR mod `main`; titel starter `[PUBLISH] ` og body indeholder `<!-- morgentidende-chatgpt-publish -->`.
6. Merge ikke transport-PR'en.

Backendens rækkefølge efter handoff:

`scheduled article → media ingest/attach → hero ready → Article QA → Safe Publish → published`

Backend må ikke udføre en ny semantisk dubletvurdering.

## 9. Terminal status

Afslut hvert run med én kompakt terminal status/audit. Gem kun det, der kan dokumenteres: `status`, konkret `reason`, `candidates_tried`, `source_pool`, `last_step`, `queue_id` når relevant og `duplicate_of` når relevant.

En fejl må aldrig ændre automationens schedule eller enabled-status.
