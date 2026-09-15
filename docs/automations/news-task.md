# Morgentidende — canonical news automation mandate

Dette er den kanoniske instruktion for de almindelige autonome nyheds-slots. Scheduled Tasks skal henvise til denne fil i stedet for at kopiere mandatet lokalt.

## Mandat

Udgiv præcis én almindelig Morgentidende-nyhedsartikel pr. normal kørsel, medmindre en reel teknisk/publication-gate gør publicering umulig. Brug højeste tilgængelige model/ræsonneringsniveau.

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
4. kassér kandidaten straks, hvis den i væsentlighed allerede er dækket, og gå videre til næste kandidat i det aktuelle source-pool.

En reel ny udvikling kan fortsætte som opfølger og skal bruge korrekt eksisterende story cluster, når det er relevant. En kosmetisk ny rubrik gør ikke en gammel sag ny.

Preflight er kun en omkostnings-/kvalitetsbesparelse og er **ikke** en publication-gate. Hvis Supabase-værktøjet ikke kan kaldes, ikke returnerer et konkret resultatsæt, kræver reconnect/consent, eller fejler med auth, policy, timeout, transport, serverfejl eller ukendt fejl, skal preflight markeres `BYPASSED` og kørslen fortsætte til research og GitHub publish bridge. Brug ikke direkte Supabase-write som fallback, og forsøg ikke gentagne Supabase-kald i samme kandidat-preflight.

Backendens ingest- og publication-gates er den bindende sidste dedupe-kontrol og må aldrig omgås. Et manglende early-preflight-resultat må derfor højst koste ekstra research/hero-arbejde; det må ikke alene stoppe nyhedskørslen.

## Historievalg — Discovery først, danske medier som fallback

Start altid med discovery-listen. Rangér de stærkeste friske kandidater og screen **højst 3 kandidater** i rækkefølge. Ved 7-dages-dublet uden væsentlig ny udvikling, utilstrækkelig dokumentation eller anden reel publication-gate: gå videre til næste Discovery-kandidat.

Hvis ingen af de op til 3 Discovery-kandidater kan bruges, skift til fallback: lav et aktuelt scan af de store danske nyhedsmedier og vælg den **stærkeste historie lige nu**.

Scan bredt blandt store danske medier, fx DR, TV 2, Berlingske, Politiken, Jyllands-Posten, B.T., Ekstra Bladet og Ritzau-historier bragt i større danske medier. Brug flere medier når det er nødvendigt for at afgøre, hvad der faktisk er den største/bedste historie lige nu.

Vurder danske fallback-kandidater relativt mod hinanden efter almindelig nyhedsværdi og Morgentidende-relevans: aktualitet, konsekvens, nærhed til Danmark/danskere, dramatik, væsentlighed, konflikt, overraskelse, offentlig interesse og realistisk delingspotentiale.

**Fallbacken skal altid vælge en historie.** Hvis de aktuelle historier i de store danske medier er svage, vælg stadig den stærkeste af dem. `NO_PUBLISHABLE_CANDIDATE` må ikke bruges, blot fordi alle danske fallback-kandidater vurderes som svage eller middelmådige.

Hvis den stærkeste danske fallback-kandidat er en 7-dages-dublet uden væsentlig ny udvikling, gå videre til den næststærkeste. Fortsæt så langt som nødvendigt, indtil du har den stærkeste aktuelle kandidat, der ikke afvises af dedupe eller en reel dokumentations-/publication-gate.

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
- `reason`: fx `DUPLICATE_7D`, `NO_LEGAL_HERO` eller konkret fejltype
- `candidates_tried`
- `source_pool`: `discovery` eller `danish_major_media`
- `queue_id` når relevant
- felterne fra `Minimal run-diagnostik`

`PRECHECK_UNAVAILABLE` må ikke bruges som fatal reason alene. Hvis early preflight ikke kan gennemføres, brug `dedupe_result=BYPASSED` og fortsæt; kun en senere uomgåelig fejl må gøre kørslen `failed`.

`NO_PUBLISHABLE_CANDIDATE` er ikke en gyldig exit alene på grund af lav nyhedsværdi i fallbacken. Hvis ingen Discovery-kandidat kan bruges, skal automationen skifte til `danish_major_media` og forsøge at publicere den stærkeste aktuelle historie dér.