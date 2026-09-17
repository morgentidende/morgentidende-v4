# Morgentidende — canonical news automation mandate

Denne fil er **eneste entrypoint** for almindelige autonome nyhedsruns. Scheduled Tasks henviser hertil og kopierer ikke regler lokalt.

## Pipeline

Den kanoniske rækkefølge er:

`Discover → Research → Semantisk 7-dages-dedupe → Write + final check → GitHub-handoff → Hero/media ready → Article QA → Publish`

**Discover begynder med et kort forsideblik.** Forsideredaktør er ikke en selvstændig rolle eller fase.

**Dedupe køres efter Research, men før Write.** På det tidspunkt er sagens substans kendt godt nok til at sammenligne hovedbegivenhed, hovedfaktum, centrale aktører, tal, geografi og den konkrete nye udvikling. Der bruges ikke deterministisk fingerprint som redaktionel dublet-gate. Dedupe-vurderingen er semantisk; dens inputkorpus skal derimod hentes komplet og eksplicit.

**Write afsluttes med Journalistens final check.** Der findes ikke en særskilt Producer-rolle. Final check er korrektur, forsideplacering og payload-kontrol — ikke ny research, ny dedupe eller backendens Article QA.

**Hero/media skal være publication-ready før backend sender artiklen til Article QA.** Scheduled Task leverer hero-kandidater ved handoff; Media Worker resolver, validerer, arkiverer og attacher heroen. Først derefter må backend enqueue Article QA.

Denne automation vælger ikke Viden eller Liv.

## Fase-manifest

Læs kun det, den aktuelle fase kræver:

- **1 Discover:** denne fil §1 + `docs/news-editorial-profile.md` + `docs/discovery-sources.md`.
- **2 Research:** denne fil §2. Genbrug profilkontekst; læs ikke discovery-listen igen.
- **3 Dedupe:** denne fil §3 + dubletreglen i `docs/editorial-core.md`.
- **4 Write + final check:** `docs/editorial-core.md` + `docs/editorial-language-glossary.md` + `docs/news-editorial-profile.md` + denne fil §4.
- **5 Hero-handoff:** denne fil §5.
- **6 Delivery:** denne fil §§6–8.

## Runtime-princip

Default er én almindelig nyhedsartikel pr. normal kørsel. Kvalitet og dokumentation må ikke sænkes for at fylde et slot.

Hold tool-kæden kort. Et normalt run bør sigte mod højst ca. 15 eksterne kald før terminal levering. Start ikke nye researchspor, når centrale fakta og væsentlige forbehold allerede er dokumenteret. Brug ikke direkte Supabase-read som nødvendig gate i Scheduled Task-runtime.

Et run ender i én terminal GitHub-leverance: artikelpayload eller `payload_type=discovery_audit` med konkret `terminal_reason`. GitHub-write retryes højst én gang; derefter `BRIDGE_FAILED`. En fejl må aldrig ændre schedule eller enabled-status.

## 1. Discover — forsideblik + historievalg

Start med et **billigt snapshot** af den offentlige Morgentidende-forside og ved behov offentlig artikelhistorik/feed fra cirka de seneste 12–24 timer. Det er kun prioriteringskontekst, ikke en selvstændig researchrunde.

Vurdér kort:
- hvilke emner/sager der allerede fylder meget,
- kategori- og geografisk spredning,
- gentagelser af samme person, parti, konflikt eller kulturkamp,
- tydeligt underrepræsenterede emner/vinkler,
- hvilke to specialsektioner der aktuelt er aktive og hvilke sager de følger.

Omsæt snapshot’et til én kort discovery-retning. En klart større breaking-historie må tilsidesætte mixhensynet.

Historievalg:
1. Lav et kort breaking-scan af store danske medier. Override kun ved en frisk, dokumenterbar hændelse med høj dansk betydning, fx terror, stor ulykke/katastrofe, krig/NATO med direkte dansk berøring, regeringskrise, større cyberangreb eller myndighedsindgreb med umiddelbar virkning for mange danskere.
2. Ellers brug `docs/discovery-sources.md`. Lav én shortlist på højst 5 friske kandidater ud fra aktualitet, dokumenterbarhed, underdækning i danske medier, profilmatch og bidrag til et bedre samlet mix.
3. Research kandidaterne i rangeret rækkefølge, én ad gangen.
4. Hvis hele shortlisten falder af, må der laves højst én ny historievalgsrunde med dansk major-media fallback.

Der køres ikke semantisk dedupe på en tynd discovery-beskrivelse. Dedupe sker først efter Research i §3.

## 2. Research og kildegulv

Der er kun to medieklasser i producerlogikken:
- `authoritative`: må bruges som faktuel slutkilde.
- `discovery_only`: må bruges til at opdage og følge en historie, men ikke som slutdokumentation.

Ukendte domæner behandles som `discovery_only`, indtil de er klassificeret. Redaktørlåste klassifikationer må ikke overstyres af modelgæt. Nye klassifikationer afleveres via top-level `source_registry_updates`; Scheduled Task skriver aldrig direkte til Supabase.

Centrale fakta skal bæres af mindst én `authoritative` eller relevant primær kilde. Normal researchramme er 2–3 autoritative/primære kilder. Stop, når centrale påstande og væsentlige forbehold er dokumenteret; brug kun ekstra kilder ved en konkret central konflikt eller usikkerhed.

Researchfasen skal ende med et kompakt **story brief** til Dedupe og Write: hovedbegivenhed, stærkeste dokumenterede hovedfaktum, centrale aktører, sted/tid, væsentlige tal og hvad der konkret er nyt nu.

## 3. Semantisk 7-dages-dedupe

Kør én semantisk dubletkontrol **efter Research og før Write** på baggrund af story brief og researchen. Genbrug ikke blot Discover-fasens 12–24-timers forsideblik; dedupe skal hente et friskt, særskilt korpus på dette tidspunkt.

### Bindende dedupe-korpus

Hent to komplette kilder:

1. **Publiceret historik:** alle Morgentidende-artikler i den offentlige historik/feed fra de seneste 7 dage.
2. **GitHub-transporter:** alle PR'er i repoet med titel, der starter `[PUBLISH] `, og som er oprettet eller opdateret inden for de seneste 7 dage — **uanset om PR'en er open eller closed**. En succesfuld bridge lukker transport-PR'en efter ingest, så `closed` betyder ikke gammel eller irrelevant. Brug en PR-liste/søgning med `state=all` til enumeration; brug ikke en fuzzy tekst-/kode-søgning som erstatning for det komplette transportkorpus.

Hvis en liste er pagineret eller afkortet, fortsæt indtil 7-dages-vinduet er dækket. Hvis det ikke kan afgøres, at korpus er komplet nok til en forsvarlig vurdering, stop **før Write** med `QA_HISTORY_UNAVAILABLE`.

Lav først billig screening mod alle titler/metadata. Fetch kun fuld PR/payload for semantisk plausible matches. Sammenlign derefter story brief med hovedbegivenhed, hovedfaktum, centrale aktører, tal, geografi og den konkrete nye udvikling i de relevante eksisterende artikler/transporter.

Selve afgørelsen er fortsat **semantisk og redaktionel**. Brug ikke deterministisk fingerprint, ordlighed, nøgleord eller rubrikmatch som dubletdommer.

Gem et kompakt observerbart snapshot i `editorial_metadata.dedupe_context`:
- `checked_at`
- `window_days: 7`
- `public_articles_seen`
- `publish_prs_seen`
- `include_closed_publish_prs: true`
- `newest_publish_pr` når observerbar

Snapshot'et er diagnostik, ikke en deterministisk publication-gate.

Hvis mere end cirka **5 minutter** går fra dedupe-korpus blev hentet, til Write skal begynde, refresh kun den friske GitHub `[PUBLISH]`-hale siden `checked_at` og genvurdér eventuelle nye transporter **før første artikelprosa skrives**. Dette er samme dedupe-fase, ikke en ekstra sen QA-gate.

Følg regel 14 i `docs/editorial-core.md`. Hvis kandidaten er næsten-identisk uden væsentlig videreudvikling: registrér `duplicate_of`, ekskludér den konkrete sag resten af runnet, og gå tilbage til §1 med det ekskluderede tema kendt. Lav et nyt Discover frem for blot at tage næste kandidat fra den gamle shortlist.

Hvis kandidaten er en legitim opfølger, behold den og brug samme `story_cluster_key` samt struktureret `Læs også`.

## 4. Write + final check

Følg `docs/editorial-core.md`, `docs/editorial-language-glossary.md` og `docs/news-editorial-profile.md`. Brug den stærkeste dokumenterede vinkel uden at gå længere end kilderne bærer.

Skriv ikke links eller manuel kildeliste i brødteksten. `source_metadata` er en top-level array. Brug almindeligt etableret dansk.

Afslut samme Write-fase med ét frisk genlæs efter final-check-reglerne i `docs/editorial-core.md`. Final check må rette sikre tekst-/metadatafejl, men må ikke starte ny research, skabe ny vinkel eller lave en ny dedupe-runde uden konkret ny information. Hvis substansen ændres, gå tilbage til relevant tidligere fase og genkør §3.

Vælg samtidig artikelens forsideplacering semantisk:
- `editorial_metadata.frontpage_destination = "special_1"`, hvis artiklen klart er en videreudvikling i den sag, som den aktive Specialsektion 1 følger.
- `editorial_metadata.frontpage_destination = "special_2"`, hvis artiklen klart er en videreudvikling i den sag, som den aktive Specialsektion 2 følger.
- Ellers `editorial_metadata.frontpage_destination = "normal"`.

En specialsektion er et løbende sagsforløb, ikke en alternativ kategori. Artikler i specialsektionerne kommer som udgangspunkt kronologisk ind længst til venstre i den relevante vandrette strøm. En reel breaking-historie kan stadig få særskilt breaking-behandling.

## 5. Hero/media — kandidatkontrakt

Almindelige nyheder bruger ægte dokumentarisk materiale. Journalisten ejer motivvalg og den rangerede kandidatliste; Media Worker ejer provider-resolution, download, MIME/signatur, faktiske pixelmål, rettighedsgate, SHA-256, arkivering, fallback og retry.

Lever **3–6 rangerede, forskellige hero-kandidater** i `editorial_metadata.hero_candidates`. Hver kandidat skal have egen `source_url` og dokumenterede rettighedsfelter; mindst `commercial_use_allowed=true` og `local_storage_allowed=true`. Rettigheder må aldrig gættes eller arves.

Billedsøgningen skal målrettes **originaler på mindst 1200×675**, når dimensionsmetadata kan verificeres. Kendte kandidater under **800×450 er forbudt** og må ikke sendes. Kendte dimensioner afleveres som `width` og `height`. Kandidater med ukendt størrelse rangeres efter kandidater med verificeret tilstrækkelig størrelse, medmindre en klart bedre dokumentarisk kilde begrunder andet.

`source_url` skal pege på den originale billedfil/download-URL eller på en provider-side, som Media Worker eksplicit har en resolver til, fx en Wikimedia Commons File-side. En almindelig HTML-landingsside er **ikke** en billedkandidat. Brug ikke thumbnail-/preview-URL'er eller kendte nedskaleringsparametre.

Kun 1–2 lovlige kandidater kræver eksplicit `editorial_metadata.hero_exception.reason`. 0 kandidater → `NO_LEGAL_HERO` og audit-only.

Efter handoff prøver Media Worker kandidaterne som **én** state machine. Kandidat-specifik resolver-state må ikke arves til næste kandidat. Permanent fejl går direkte til næste kandidat; transient fejl retryer samme kandidat. Først når alle kandidater er udtømt, terminaliserer media-jobbet, og artiklen går til `draft` med `publication_attention=hero_candidates_exhausted` i stedet for at stå fast som `scheduled`.

**Article QA må ikke enqueue, før et valideret asset er `ready` og attached som artikelhero.**

## 6. Discovery-audit

Bevar kun et kompakt auditspor for kandidater, der faktisk blev rangordnet eller researchet. Brug ét stabilt `discovery_run_id` pr. run og ét stabilt `candidate_id` pr. kandidat.

Minimum når observerbart: source pool/path, rank, headline/topic, deep-screened, downstream-kilder, decision/reason og model/prompt-version. For en leveret artikel skal `editorial_metadata.dedupe_context` desuden bevare det kompakte snapshot fra §3, så et senere sent dubletstop kan diagnosticeres uden at gætte. Ved artikel ligger audit i `editorial_metadata`; ved legitimt hard stop leveres audit-only. Ingen separate eksterne checkpoint-writes.

## 7. Hard stops

Tilladte stopkoder omfatter:
- `CANONICAL_UNREADABLE`
- `INSUFFICIENT_DOCUMENTATION`
- `QA_HISTORY_UNAVAILABLE`
- `NO_PUBLISHABLE_CANDIDATE`
- `NO_LEGAL_HERO`
- `BRIDGE_FAILED`
- `BACKEND_REJECTED`

`DUPLICATE_RETRY_EXHAUSTED` er ikke gyldig. Manglende kilde nummer to er ikke i sig selv hard stop, hvis én autoritativ kilde bærer de centrale fakta.

## 8. Aflevering — transportkontrakt

Scheduled Task skriver aldrig artiklen direkte til Supabase.

1. Opret en unik `publish/chatgpt-*` branch fra aktuel `main`.
2. Skriv præcis én ny `publish-queue/<queue_id>.json` på branchen.
3. Payloaden skal mindst indeholde `queue_id`, `slug`, `headline`, `category_slug`, `deck`, `body_markdown`, top-level `source_metadata` og `editorial_metadata`. `editorial_metadata.sagen_kort` er præcis to ikke-tomme strenge. `editorial_metadata.frontpage_destination` skal være `normal`, `special_1` eller `special_2`. Medtag hero candidates, source-registry-opdateringer, `dedupe_context` og audit, når relevant. Brug `story_cluster_key` for eksisterende sag; `story_cluster_id` kun når UUID er kendt.
4. Opret præcis én PR mod `main`; titlen starter `[PUBLISH] ` og body indeholder `<!-- morgentidende-chatgpt-publish -->`.
5. Merge ikke transport-PR'en. Backend ejer idempotens, insert, media, Article QA og publication-gates og lukker transport-PR'en efter vellykket aflevering.

Backendens rækkefølge efter handoff er bindende:

`scheduled article → media ingest/attach → hero ready → Article QA → Safe Publish → published`

Efter bestået current-version QA forsøges Safe Publish direkte. Den periodiske release-runner er kun recovery og må ikke være en kunstig ventefase.

## Minimal run-status

Returnér kun kompakt observerbar status:
- `status`: `published_or_queued`, `skipped` eller `failed`
- `reason`
- `candidates_tried`
- `source_pool`
- `queue_id` når relevant
- `duplicate_of` når relevant
- `terminal_delivery_type`
- konkret bridge/backend-fejl hvis observerbar
