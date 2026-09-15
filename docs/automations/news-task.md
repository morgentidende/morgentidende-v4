# Morgentidende — canonical news automation mandate

Dette er den kanoniske instruktion for de almindelige autonome nyheds-slots. Scheduled Tasks skal henvise til denne fil i stedet for at kopiere mandatet lokalt.

## Mandat

Default er én almindelig Morgentidende-nyhedsartikel pr. normal kørsel. Lav nyhedsværdi alene er ikke en stopgrund, men dokumentation, dedupe, hero- og publication-gates må aldrig udvandes for at fylde et slot. Brug højeste tilgængelige model/ræsonneringsniveau.

Læs og følg altid de aktuelle canonical regler i:
- `docs/editorial-core.md`
- relevante dele af `docs/news-editorial-profile-and-discovery.md`
- `docs/chatgpt-publish-bridge.md`

Denne fil ejer **kørselsrækkefølgen** for den almindelige Scheduled Task-newsautomation. Hvis en procesregel i `docs/news-editorial-profile-and-discovery.md` beskriver en anden rækkefølge for stofvalg/scanning, har denne fil forrang for netop denne automation. Profilfilen ejer fortsat redaktionel profil, discovery-kilder og kildekritik.

Denne automation må ikke vælge Viden eller Liv; de hører til magazine-flowet.

## Historievalg

### 1. Snæver breaking-override

Lav først et kort aktuelt scan af store danske medier for en **akut breakinghistorie**. Override må kun bruges ved en frisk, dokumenterbar hændelse med høj national betydning inden for:
- dansk sikkerhed eller forsvar,
- terror,
- stor ulykke eller katastrofe,
- krig/NATO med direkte dansk berøring,
- regeringskrise,
- alvorlig kriminalitet med national vægt,
- større cyberangreb,
- stats-/myndighedsindgreb med umiddelbar virkning for mange danskere.

Hvis en sådan breakinghistorie klart findes, ikke er en 7-dages-dublet uden væsentlig udvikling og kan dokumenteres, vælg den og gå videre til research. Override skal være snæver og hændelsesbaseret; almindeligt vigtigt stof, analyser, kendis- og kulturhistorier må ikke springe Discovery over.

### 2. Discovery først

Hvis breaking-overriden ikke rammer, start med discovery-listen. Rangér billigt de **5 stærkeste friske Discovery-kandidater** ud fra rubrik, aktualitet og match med Morgentidendes kerneinteresser. Dybdescreen dem derefter i rækkefølge og stop ved den første kandidat, der klarer dedupe og dokumentationsgulvet.

Ved 7-dages-dublet uden væsentlig ny udvikling eller utilstrækkelig dokumentation: gå videre til næste Discovery-kandidat. Screen højst 5 Discovery-kandidater pr. run.

### 3. Dansk major-media fallback

Hvis ingen af de 5 Discovery-kandidater kan bruges, scan store danske nyhedsmedier og vælg den **stærkeste aktuelle historie lige nu**.

Scan bredt blandt fx DR, TV 2, Berlingske, Politiken, Jyllands-Posten, B.T., Ekstra Bladet og Ritzau-historier bragt i større danske medier.

Vægt fallback-kandidater i denne rækkefølge:
1. aktualitet,
2. konsekvens for Danmark/danskere,
3. væsentlighed og offentlig interesse,
4. konflikt/dramatik,
5. realistisk delingspotentiale.

Ved samme vægt taber en gammel historie til en frisk. Analyse, kendis og kultur taber til breaking og konkret konsekvens.

Fallbacken skal vælge den stærkeste historie, også hvis alle aktuelle historier er svage. `NO_PUBLISHABLE_CANDIDATE` må ikke bruges alene på grund af lav nyhedsværdi. Svag nyhedsværdi kan give en kortere artikel; utilstrækkelig dokumentation må aldrig reddes af fallback-pligten.

Hvis den stærkeste fallback-kandidat er en dublet uden væsentlig udvikling eller ikke kan dokumenteres, gå videre til den næststærkeste og fortsæt så langt som rimeligt.

## Early dedupe før fuld research

For den kandidat, der aktuelt screenes:
1. forsøg én Supabase **read-only** preflight mod relevante `published` og `scheduled` artikler fra de seneste 7 dage,
2. hvis preflight returnerer et konkret resultatsæt, sammenlign kandidatens væsentlige sag/emne med eksisterende rubrikker og `story_cluster_id`, når det findes,
3. kassér kandidaten straks, hvis den i væsentlighed allerede er dækket uden reel ny udvikling, og gå videre i det aktuelle source-pool.

En reel ny udvikling kan fortsætte som opfølger og skal bruge korrekt eksisterende story cluster, når det er relevant. En kosmetisk ny rubrik gør ikke en gammel sag ny.

Preflight er kun en omkostnings-/kvalitetsbesparelse og er **ikke** en publication-gate. Hvis Supabase-værktøjet ikke kan kaldes, ikke returnerer et konkret resultatsæt, kræver reconnect/consent eller fejler, skal preflight markeres `BYPASSED` og kørslen fortsætte. Brug ikke direkte Supabase-write som fallback, og lav ikke gentagne Supabase-kald for samme kandidat.

Backendens ingest- og publication-gates er den bindende sidste dedupe-kontrol og må aldrig omgås.

## Dokumentationsgulv

Research i troværdige kilder, helst primærkilder. Centrale fakta skal kunne verificeres. En discovery-side er et spor, ikke slutdokumentation.

Lav nyhedsværdi er ikke en hard gate. Manglende verificerbar dokumentation er en hard gate. Skriv skarpt med meget højt delingspotentiale, men aldrig stærkere eller længere end dokumentationen bærer.

## Discovery-audit og senere diagnose

Alle kandidater, der faktisk bliver rangordnet eller dybdescreenet i et run, skal efterlade et kompakt audit-spor, så senere diagnose kan finde falske positive og falske negative uden at rekonstruere kørslen fra hukommelse.

Brug ét stabilt `discovery_run_id` pr. run og ét stabilt `candidate_id` pr. kandidat. For hver kandidat, der faktisk blev behandlet, registrér når oplysningerne findes:
- `candidate_id`
- `source_pool` og `path_used`
- `rank_position`
- `deep_screened`
- `discovery_source_name`, `discovery_source_url`, `discovery_domain`
- `candidate_headline` og kort `candidate_topic`
- `hard_negative` når policy-checket er kendt
- `downstream_sources` som kompakt liste over faktisk fundne bedre kilder
- `semantic_assessment` når den er udført
- `decision` og konkret `decision_reason`
- `model_name` og `prompt_version` når de er observerbare.

Opfind aldrig felter, der ikke er observeret. Auditdata må ikke ændre et redaktionelt udfald og må ikke bruges som erstatning for publication-gates.

Når en artikel afleveres, lægges `discovery_run_id` og hele runnets behandlede kandidat-audit i `editorial_metadata.discovery_run_id` og `editorial_metadata.discovery_audit`. Backend kopierer auditsporet til den særskilte `discovery_candidate_audit`-tabel og knytter den valgte kandidat til artikel/queue, når muligt.

Hvis runnet ender uden artikel efter en legitim hard stop, skal auditsporet stadig afleveres gennem GitHub-broen som en `payload_type: "discovery_audit"`-payload. Dette er telemetry, ikke publicering, og må ikke ændre schedule eller enabled-status. Brug samme transport-sikkerhedsgrænse som artikelbroen og aldrig direkte Supabase-write fra Scheduled Task.

`audit_outcome` (`correct_reject`, `false_negative`, `correct_publish`, `false_positive`) må **aldrig** sættes automatisk af Scheduled Task. Det er et senere audit-/diagnosefelt.

## Hero/media

Almindelige nyheder skal bruge ægte dokumentarisk materiale, ikke AI-foto præsenteret som dokumentation. Følg ranked hero-candidate-kontrakten i `docs/chatgpt-publish-bridge.md` og opfind aldrig rettigheder.

Søg efter flere lovlige originalkandidater. Før `NO_LEGAL_HERO` kan bruges, skal der være gjort et reelt forsøg på mindst **3 forskellige hero-kandidater/kilder** for sagen. Hvis mindst én lovlig kandidat findes, må artiklen afleveres med den/de kandidater, der findes; Media Worker ejer download, fallback og transient retry. Hvis ingen lovlig kandidat findes efter mindst 3 reelle forsøg, skift til næste kvalificerede historie én gang og gentag hero-søgningen. `NO_LEGAL_HERO` er først legitim derefter.

Tasken må ikke bygge sin egen hero-retry/orchestrator og må højst sende de op til seks rangerede kandidater, publish-bridge-kontrakten understøtter.

## Lukkede hard stops

En normal kørsel må kun ende uden artikel af en konkret grund som:
- `CANONICAL_UNREADABLE`: aktuelle canonical docs kan ikke læses efter ét rimeligt retry,
- `INSUFFICIENT_DOCUMENTATION`: centrale fakta kan ikke verificeres efter rimelig kildeafprøvning,
- `DUPLICATE_7D`: alle rimelige kandidater i flowet falder på 7-dages-dedupe uden væsentlig udvikling,
- `NO_LEGAL_HERO`: hero-budgettet ovenfor er udtømt,
- `BRIDGE_FAILED`: GitHub publish bridge kan ikke gennemføres uden at bryde transportkontrakten,
- `BACKEND_REJECTED`: bindende backend-gate afviser leverancen.

Lav nyhedsværdi, manglende Supabase-preflight, manglende primærkilde når seriøs sekundær dokumentation er tilstrækkelig, eller modellens egen generelle usikkerhed er ikke i sig selv hard stops.

## Aflevering

Supabase er read-only fra Scheduled Task. Aflever kun gennem GitHub publish bridge efter `docs/chatgpt-publish-bridge.md`. Merge ikke transport-PR'en og brug aldrig direkte Supabase-write som fallback.

Backend afviser payloads, der bryder de tekniske publication-invariants. Forsøg aldrig at omgå en gate. En fejl i en kørsel må aldrig ændre automationens schedule eller enabled-status.

## Minimal run-diagnostik

Returnér kun diagnostik, der er bundet til observerbare handlinger i den aktuelle kørsel. Gæt aldrig på tool-registry eller connector-tilstand.

Medtag mindst:
- `canonical_rules_loaded`: `true` eller `false`
- `path_used`: `breaking`, `discovery` eller `danish_fallback`
- `breaking_scan_hit`: `true` eller `false`
- `discovery_ranked`: heltal
- `deep_screens`: heltal
- `preflight_attempted`: `true` eller `false`
- `supabase_tool_call_observed`: `true` kun hvis et faktisk Supabase tool-call blev udført; ellers `false`
- `supabase_tool_result`: `OK`, `ERROR` eller `NO_CALL`
- `preflight_error_class`: `AUTH`, `NOT_FOUND`, `TIMEOUT`, `POLICY`, `TRANSPORT`, `SERVER`, `UNKNOWN` eller `NONE`
- `preflight_rows`: heltal når et konkret resultatsæt foreligger, ellers `null`
- `dedupe_result`: `NEW`, `DUPLICATE`, `BYPASSED` eller `UNKNOWN`
- `research_started`: `true` eller `false`
- `selected_headline`: den faktisk valgte rubrik/kandidat eller `null`
- `hero_candidates_tried`: heltal
- `github_bridge_started`: `true` eller `false`
- `bridge_http_or_pr`: PR-nummer når observeret, ellers `NO_CALL`/`ERROR`
- `backend_reject_code`: konkret kode når observeret, ellers `null`

Hvis der ikke kan peges på et faktisk Supabase tool-call, skal `supabase_tool_call_observed=false` og `supabase_tool_result=NO_CALL`. Et modeludsagn om, at Supabase er utilgængelig, er ikke et observeret tool-resultat.

Diagnostikken må ikke skrives til Supabase og må ikke gøre kørslen mere skrøbelig. Den skal indgå i kørselsresultatet, også ved `failed` eller `skipped`.

## Run-resultat

Returnér kompakt status med mindst:
- `status`: `published_or_queued`, `skipped` eller `failed`
- `reason`: brug en konkret kode, fx `QUEUED`, `DUPLICATE_7D`, `INSUFFICIENT_DOCUMENTATION`, `NO_LEGAL_HERO`, `BRIDGE_FAILED`, `BACKEND_REJECTED` eller `CANONICAL_UNREADABLE`
- `candidates_tried`
- `source_pool`: `breaking`, `discovery` eller `danish_major_media`
- `queue_id` når relevant
- felterne fra `Minimal run-diagnostik`

`PRECHECK_UNAVAILABLE` må ikke bruges som fatal reason alene. Hvis early preflight ikke kan gennemføres, brug `dedupe_result=BYPASSED` og fortsæt.

`NO_PUBLISHABLE_CANDIDATE` er ikke en gyldig exit alene på grund af lav nyhedsværdi. Hvis Discovery ikke leverer, skal automationen bruge dansk fallback og forsøge den stærkeste dokumenterbare aktuelle historie.