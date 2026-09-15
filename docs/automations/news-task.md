# Morgentidende — canonical news automation mandate

Dette er den kanoniske instruktion for de almindelige autonome nyheds-slots. Scheduled Tasks skal henvise til denne fil i stedet for at kopiere mandatet lokalt.

## Mandat

Udgiv højst én stærk almindelig Morgentidende-nyhedsartikel pr. kørsel. Brug højeste tilgængelige model/ræsonneringsniveau.

Læs og følg altid de aktuelle canonical regler i:
- `docs/editorial-core.md`
- relevante dele af `docs/news-editorial-profile-and-discovery.md`
- `docs/chatgpt-publish-bridge.md`

Denne automation må ikke vælge Viden eller Liv; de hører til magazine-flowet.

## Early dedupe før fuld research

Før du bruger tid på fuld research, skrivning eller hero-arbejde:
1. vælg en foreløbig kandidat,
2. forsøg én Supabase **read-only** preflight mod relevante `published` og `scheduled` artikler fra de seneste 7 dage,
3. hvis preflight returnerer et konkret resultatsæt, sammenlign kandidatens væsentlige sag/emne med eksisterende rubrikker og `story_cluster_id`, når det findes,
4. kassér kandidaten straks, hvis den i væsentlighed allerede er dækket.

En reel ny udvikling kan fortsætte som opfølger og skal bruge korrekt eksisterende story cluster, når det er relevant. En kosmetisk ny rubrik gør ikke en gammel sag ny.

Preflight er kun en omkostnings-/kvalitetsbesparelse og er **ikke** en publication-gate. Hvis Supabase-værktøjet ikke kan kaldes, ikke returnerer et konkret resultatsæt, kræver reconnect/consent, eller fejler med auth, policy, timeout, transport, serverfejl eller ukendt fejl, skal preflight markeres `BYPASSED` og kørslen fortsætte til research og GitHub publish bridge. Brug ikke direkte Supabase-write som fallback, og forsøg ikke gentagne Supabase-kald i samme kandidat-preflight.

Backendens ingest- og publication-gates er den bindende sidste dedupe-kontrol og må aldrig omgås. Et manglende early-preflight-resultat må derfor højst koste ekstra research/hero-arbejde; det må ikke alene stoppe nyhedskørslen.

## Historievalg

Start med discovery-listen. Rangér de stærkeste friske kandidater og prøv højst 3 i rækkefølge. Ved dublet, svag dokumentation eller for lav nyhedsværdi: gå videre til næste kandidat.

Hvis ingen af de tre discovery-kandidater er stærk nok, lav ét bredt aktuelt scan af store troværdige vestlige medier og vælg den stærkeste verificerbare historie med høj relevans for Morgentidendes danske læsere.

Kvalitet slår volumen. Hvis ingen kandidat er stærk nok, afslut med `NO_PUBLISHABLE_CANDIDATE` og publicér intet filler.

## Research og artikel

Research i troværdige kilder, helst primærkilder. Skriv skarpt med meget højt delingspotentiale, men aldrig længere end dokumentationen bærer.

Til almindelige nyheder skal hero være ægte dokumentarisk materiale, ikke AI-foto præsenteret som dokumentation. Følg ranked hero-candidate-kontrakten i publish-bridge-dokumentet og opfind aldrig rettigheder.

## Aflevering

Supabase er read-only fra Scheduled Task. Aflever kun gennem GitHub publish bridge efter `docs/chatgpt-publish-bridge.md`. Merge ikke transport-PR'en og brug aldrig direkte Supabase-write som fallback.

Backend afviser payloads, der bryder de tekniske publication-invariants. Forsøg aldrig at omgå en gate.

En fejl i en kørsel må aldrig ændre automationens schedule eller enabled-status.

## Minimal run-diagnostik

Returnér kun diagnostik, der er bundet til observerbare handlinger i den aktuelle kørsel. Gæt aldrig på tool-registry eller connector-tilstand.

Medtag mindst:
- `canonical_rules_loaded`: `true` eller `false`
- `preflight_attempted`: `true` eller `false`
- `supabase_tool_call_observed`: `true` kun hvis et faktisk Supabase tool-call blev udført i kørslen; ellers `false`
- `supabase_tool_result`: `OK`, `ERROR` eller `NO_CALL`
- `preflight_error_class`: `AUTH`, `NOT_FOUND`, `TIMEOUT`, `POLICY`, `TRANSPORT`, `SERVER`, `UNKNOWN` eller `NONE`
- `preflight_rows`: heltal når et konkret resultatsæt foreligger, ellers `null`
- `dedupe_result`: `NEW`, `DUPLICATE`, `BYPASSED` eller `UNKNOWN`
- `research_started`: `true` eller `false`
- `github_bridge_started`: `true` eller `false`

Hvis der ikke kan peges på et faktisk Supabase tool-call i kørslen, skal `supabase_tool_call_observed=false` og `supabase_tool_result=NO_CALL`. Et modeludsagn om, at Supabase er utilgængelig, er ikke i sig selv et observeret tool-resultat.

Diagnostikken må ikke skrives til Supabase og må ikke gøre kørslen mere skrøbelig. Den skal indgå i kørselsresultatet, også når kørslen ender i `failed` eller `skipped`.

## Run-resultat

Returnér kompakt status med mindst:
- `status`: `published_or_queued`, `skipped` eller `failed`
- `reason`: fx `NO_PUBLISHABLE_CANDIDATE`, `DUPLICATE_7D`, `NO_LEGAL_HERO` eller konkret fejltype
- `candidates_tried`
- `source_pool`: `discovery` eller `western_fallback`
- `queue_id` når relevant
- felterne fra `Minimal run-diagnostik`

`PRECHECK_UNAVAILABLE` må ikke bruges som fatal reason alene. Hvis early preflight ikke kan gennemføres, brug `dedupe_result=BYPASSED` og fortsæt; kun en senere uomgåelig fejl må gøre kørslen `failed`.
