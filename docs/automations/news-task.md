# Morgentidende — canonical news automation mandate

Dette er den kanoniske instruktion for de almindelige autonome nyheds-slots. Scheduled Tasks skal henvise til denne fil i stedet for at kopiere mandatet lokalt.

## Mandat

Default er én almindelig Morgentidende-nyhedsartikel pr. normal kørsel. Lav nyhedsværdi alene er ikke en stopgrund, men dokumentations-, slut-QA-, hero- og publication-gates må aldrig udvandes for at fylde et slot. Brug højeste tilgængelige model/ræsonneringsniveau.

Læs og følg altid de aktuelle canonical regler i:
- `docs/editorial-core.md`
- relevante dele af `docs/news-editorial-profile-and-discovery.md`
- `docs/source-registry.md`
- `docs/chatgpt-publish-bridge.md`

Denne fil ejer kørselsrækkefølgen for den almindelige Scheduled Task-newsautomation. `docs/editorial-core.md` ejer fælles artikelkrav og journalistens slut-QA, herunder 7-dages-reglen. Profilfilen ejer redaktionel profil og discovery-pool. Backendens `editorial_source_registry` ejer den bindende medieklassifikation.

Denne automation må ikke vælge Viden eller Liv; de hører til magazine-flowet.

## Historievalg

### 1. Snæver breaking-override
Lav først et kort aktuelt scan af store danske medier for en akut breakinghistorie. Override må kun bruges ved en frisk, dokumenterbar hændelse med høj national betydning inden for dansk sikkerhed/forsvar, terror, stor ulykke/katastrofe, krig/NATO med direkte dansk berøring, regeringskrise, alvorlig kriminalitet med national vægt, større cyberangreb eller stats-/myndighedsindgreb med umiddelbar virkning for mange danskere.

Hvis en sådan breakinghistorie klart findes og kan dokumenteres, vælg den og gå videre til research.

### 2. Discovery først
Hvis breaking-overriden ikke rammer, start med discovery-listen. Rangér billigt de 5 stærkeste friske Discovery-kandidater ud fra rubrik, aktualitet og match med Morgentidendes kerneinteresser. Dybdescreen dem i rækkefølge og stop ved den første kandidat, der klarer dokumentationsgulvet. Screen højst 5 Discovery-kandidater pr. udvælgelsesrunde.

### 3. Dansk major-media fallback
Hvis ingen af de 5 Discovery-kandidater kan bruges, scan store danske nyhedsmedier og vælg den stærkeste aktuelle historie lige nu. Scan bredt blandt fx DR, TV 2, Berlingske, Politiken, Jyllands-Posten, B.T., Ekstra Bladet og Ritzau-historier bragt i større danske medier.

Vægt fallback-kandidater efter aktualitet, konsekvens for Danmark/danskere, væsentlighed/offentlig interesse, konflikt/dramatik og realistisk delingspotentiale. Lav nyhedsværdi alene må ikke føre til `NO_PUBLISHABLE_CANDIDATE`.

## Binært kildesystem — bindende

Der findes kun to medieklasser:

- `authoritative`: må bruges som faktuel slutkilde.
- `discovery_only`: må opdage historien og føre videre til andre kilder, men må ikke være faktuel slutdokumentation.

Én `authoritative` kilde er tilstrækkelig til publication, når den konkret dokumenterer historiens centrale fakta. Forsøg stadig at finde yderligere autoritative/primære kilder, når det er rimeligt, men kilde nummer to er ikke et krav. Ved én bærende kilde attribueres væsentlige oplysninger tydeligt.

`authoritative` omfatter som hovedregel national public service/statsligt medie, stort etableret nyhedsbureau eller stor etableret privat avis med fysisk papirudgave. Primære officielle myndighedskilder er autoritative om egne afgørelser, tal, handlinger og udtalelser. En direkte originaludtalelse/dokument fra sagens subjekt kan bære påstande om netop subjektets egen udtalelse/handling, når relationen er eksplicit markeret.

`discovery_only` omfatter nichemedier, blogs, aggregatorer, tænketanke, advocacy/kampagnesider, ideologiske specialmedier og øvrige tipkilder, medmindre de konkret er godkendt som `authoritative` i registret.

Backend-tabellen `public.editorial_source_registry` er bindende for kendte mediedomæner. Kendte editor-in-chief-beslutninger må ikke overskrives automatisk.

### Nye medier fundet gennem discovery
Når et discovery-medie linker til et nyt medie/domæne, skal det nye medie vurderes og registreres. Vurder selv `authoritative` eller `discovery_only` efter reglen ovenfor.

- Genbrug eksisterende domæneklassifikation, hvis den findes.
- Nyt domæne tilføjes én gang.
- Ved ny dokumentation må automationen senere op- eller nedklassificere automatiske vurderinger.
- En editor-in-chief-låst vurdering må ikke ændres automatisk.
- Nye klassifikationer sendes som top-level `source_registry_updates` gennem GitHub-broen. Scheduled Task må aldrig skrive direkte til Supabase.
- Hvis et nyt medie ikke er klassificeret/registreret endnu, behandles det sikkert som `discovery_only` indtil klassifikationen er afleveret.

## Dokumentationsgulv
Research i autoritative og/eller primære kilder. En discovery-only-side er et spor, ikke slutdokumentation. Centrale fakta skal kunne verificeres af mindst én autoritativ kilde. Manglende ekstra kilde er ikke en hard stop, hvis én autoritativ kilde faktisk bærer de centrale fakta.

Manglende autoritativ dokumentation er en hard gate. Skriv aldrig stærkere end dokumentationen bærer.

## Afsluttende QA og 7-dages-regel
Dubletkontrollen er ikke et selvstændigt pipeline-trin. Den håndhæves kun i journalistens afsluttende QA efter `docs/editorial-core.md`, regel 15 og afsnittet `Journalistens eget slut-QA`.

Til dubletkontrollen skal QA bruge observerbar artikelhistorik fra de seneste 7 dage. Foretræk backendens read-only artikelhistorik. Hvis den ikke kan læses, brug GitHub `[PUBLISH]`-historik og derefter den offentlige avis som fallback. QA må ikke godkende ud fra hukommelse alene.

Hvis QA finder en næsten-identisk artikel uden væsentlig videreudvikling:
- kassér udkastet uden publish-queue eller transport-PR,
- registrér `duplicate_of`,
- ekskludér den konkrete sag og dens centrale person/institution resten af dette run,
- start helt forfra ved `Historievalg` og foretag ny rangering og research.

Genbrug ikke research, rubrik eller vinkel fra den kasserede dublet. Højst 3 komplette genstarter på grund af dubletter pr. run. Hvis tredje genstart også ender som dublet, stop med `DUPLICATE_RETRY_EXHAUSTED`.

Hvis ingen historikkilde kan etablere et rimeligt 7-dages-sammenligningsgrundlag efter fallback, stop med `QA_HISTORY_UNAVAILABLE` i stedet for at publicere blindt.

En legitim opfølger med væsentlig videreudvikling følger `docs/editorial-core.md` for `story_cluster_id` og struktureret `Læs også`.

## Discovery-audit og senere diagnose
Alle kandidater, der faktisk bliver rangordnet eller dybdescreenet, skal efterlade et kompakt audit-spor. Brug ét stabilt `discovery_run_id` pr. run og ét stabilt `candidate_id` pr. kandidat. Registrér når observerbart: source pool/path, rank, deep-screen, discovery source/domain, kandidat-rubrik/emne, downstream-kilder, beslutning/reason, model/prompt-version og relevante kildeklassifikationer.

Når en artikel afleveres, lægges `discovery_run_id` og kandidat-audit i `editorial_metadata`. Hvis runnet stopper legitimt uden artikel, send audit-only gennem samme GitHub-bro. Audit må ikke ændre redaktionelt udfald. `audit_outcome` sættes aldrig automatisk.

## Hero/media
Almindelige nyheder skal bruge ægte dokumentarisk materiale, ikke AI-foto præsenteret som dokumentation. Følg ranked hero-candidate-kontrakten i `docs/chatgpt-publish-bridge.md`.

Før `NO_LEGAL_HERO` kan bruges, skal mindst 3 forskellige reelle hero-kandidater/kilder være forsøgt. Hvis ingen lovlig kandidat findes, skift til næste kvalificerede historie én gang og gentag. Media Worker ejer download, fallback og transient retry.

## Lukkede hard stops
En normal kørsel må kun ende uden artikel af en konkret grund som:
- `CANONICAL_UNREADABLE`
- `INSUFFICIENT_DOCUMENTATION`
- `QA_HISTORY_UNAVAILABLE`
- `DUPLICATE_RETRY_EXHAUSTED`
- `NO_LEGAL_HERO`
- `BRIDGE_FAILED`
- `BACKEND_REJECTED`

Lav nyhedsværdi, manglende kilde nummer to eller fravær af primærkilde når én autoritativ sekundærkilde bærer historien, er ikke hard stops.

## Aflevering
Supabase er read-only fra Scheduled Task. Aflever artikel, discovery-audit og eventuelle `source_registry_updates` gennem GitHub publish bridge. Merge ikke transport-PR'en og brug aldrig direkte Supabase-write som fallback. En fejl må aldrig ændre automationens schedule eller enabled-status.

Afsluttende QA skal være gennemført og have `final_qa_duplicate=false`, før GitHub-broen må startes.

## Minimal run-diagnostik
Returnér kun observerbar diagnostik. Medtag mindst:
- `canonical_rules_loaded`
- `path_used`
- `breaking_scan_hit`
- `discovery_ranked`
- `deep_screens`
- `research_started`
- `selected_headline`
- `authoritative_sources_found`
- `source_registry_updates`
- `final_qa_history_source`
- `final_qa_history_count`
- `final_qa_duplicate`
- `duplicate_of`
- `duplicate_restart_count`
- `duplicate_exclusions`
- `hero_candidates_tried`
- `github_bridge_started`
- `bridge_http_or_pr`
- `backend_reject_code`

## Run-resultat
Returnér kompakt status med mindst:
- `status`: `published_or_queued`, `skipped` eller `failed`
- `reason`
- `candidates_tried`
- `source_pool`
- `queue_id` når relevant
- felterne fra Minimal run-diagnostik.

`NO_PUBLISHABLE_CANDIDATE` er ikke en gyldig exit alene på grund af lav nyhedsværdi.