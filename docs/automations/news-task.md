# Morgentidende — canonical news automation mandate

Denne fil er den korte kørselskontrakt for almindelige autonome nyhedsslots. Scheduled Tasks henviser hertil i stedet for at kopiere mandatet lokalt.

## Ejerskab

- `docs/editorial-core.md` ejer fælles artikelkrav og journalistens slut-QA, herunder 7-dages-reglen.
- `docs/news-editorial-profile-and-discovery.md` ejer aktuel emneprioritering/tone samt discovery-pool. Hent kun de relevante afsnit (`Aktuel indstilling`, `Discovery-regel` og den konkrete discovery-liste) frem for hele profilprosaen, når connectoren understøtter afgrænset læsning.
- `docs/source-registry.md` og backend-registret ejer kendte domæners kildeklassifikation.
- `docs/chatgpt-publish-bridge.md` ejer transport, payload og media-handoff.

Denne automation vælger ikke Viden eller Liv.

## Runtime-princip

Default er én almindelig nyhedsartikel pr. normal kørsel. Kvalitet, dokumentation, slut-QA, hero- og publication-gates må ikke sænkes for at fylde et slot.

Hold tool-kæden kort. Et normalt run bør sigte mod højst ca. 15 eksterne kald før terminal levering og må ikke åbne nye researchspor, når centrale fakta og væsentlige forbehold allerede er dokumenteret. Brug ikke direkte Supabase-read som nødvendig gate i Scheduled Task-runtime.

En normal kørsel skal ende i én terminal GitHub-leverance:
- artikelpayload, eller
- `payload_type=discovery_audit` med konkret `terminal_reason`.

Hvis selve GitHub-write fejler, retry højst én gang og returnér `BRIDGE_FAILED`. En fejl må aldrig ændre automationens schedule eller enabled-status.

## 1. Historievalg

**Morgentidendes særkende er stærke, dokumenterbare nyheder, som andre danske medier overser eller prioriterer lavt.** Discovery-listen er derfor ikke kun en reservekilde, men avisens vigtigste konkurrencefordel i almindelige news-runs. Når en frisk discovery-historie er tilstrækkeligt stærk, veldokumenteret og relevant for avisens profil, skal den som udgangspunkt prioriteres over en mere almindelig omnibusnyhed, som allerede dækkes bredt af danske medier. Breaking-override gælder stadig ved reelt store, akutte hændelser med høj dansk betydning.

1. Lav et kort breaking-scan af store danske medier. Brug kun override ved en frisk, dokumenterbar hændelse med høj dansk betydning (fx terror, stor ulykke/katastrofe, krig/NATO med direkte dansk berøring, regeringskrise, større cyberangreb eller myndighedsindgreb med umiddelbar virkning for mange danskere).
2. Ellers brug discovery-poolen. Lav én billig shortlist på højst 5 friske kandidater ud fra aktualitet, dokumenterbarhed, graden af underdækning i danske medier og match med avisens aktuelle profil.
3. Research kandidaterne i rangeret rækkefølge, én ad gangen. Start ikke en ny discovery-runde, bare fordi én kandidat falder.
4. Hvis hele shortlisten falder, må der laves højst én ny historievalgsrunde med dansk major-media fallback. Ingen yderligere fulde genstarter i samme run.

Lav nyhedsværdi alene er ikke en hard stop, men filler må ikke publiceres.

## 2. Research og kildegulv

Discovery-only-kilder er spor, ikke slutdokumentation. Følg den bindende kildeklassifikation i source registry.

Centrale fakta skal kunne dokumenteres af mindst én `authoritative` eller relevant primær kilde. Én bærende autoritativ kilde er tilstrækkelig, når den konkret dokumenterer historiens centrale fakta.

Normal researchramme er 2–3 autoritative/primære kilder. Stop, når centrale påstande og væsentlige forbehold er tilstrækkeligt dokumenteret. Brug kun en ekstra kilde ud over dette, hvis en konkret central konflikt eller usikkerhed kræver det.

Nye domæner behandles som `discovery_only`, indtil de er klassificeret. Eventuelle nye klassifikationer afleveres via `source_registry_updates` i GitHub-payloaden; Scheduled Task skriver aldrig direkte til Supabase.

## 3. Skriv artikel

Følg `docs/editorial-core.md`. Skriv ikke links eller manuel kildeliste i brødteksten. `source_metadata` er en top-level array. Brug den stærkeste dokumenterede vinkel uden at gå længere end kilderne bærer.

## 4. Slut-QA og semantisk 7-dages-dedupe

Dedupe er del af journalistens ene afsluttende QA; der findes ikke en separat redaktionel early gate.

Etabler ét rimeligt 7-dages-sammenligningsgrundlag:
1. GitHub `[PUBLISH]`-historik for de seneste 7 dage, inklusive åbne og nyligt lukkede transport-PR'er.
2. Brug kun offentlig Morgentidende-historik/feed som fallback eller supplement, hvis GitHub-historikken åbenlyst er utilstrækkelig.

Direkte Supabase-read er ikke nødvendig QA-gate. QA må ikke godkende på hukommelse alene.

Hvis artiklen er næsten-identisk med en historie fra de seneste 7 dage uden væsentlig videreudvikling:
- kassér udkastet,
- registrér `duplicate_of`,
- markér den konkrete sag/person/institution som ekskluderet resten af runnet,
- gå direkte til næste kandidat på den eksisterende shortlist og research den kandidat.

Der må højst ske én fuld ny historievalgsrunde efter at den oprindelige shortlist er udtømt. Hvis der stadig ikke kan findes en ikke-dublet, stop med `DUPLICATE_RETRY_EXHAUSTED` og aflever audit-only.

En legitim væsentlig opfølger bruger samme `story_cluster_id` og struktureret `Læs også` efter `editorial-core.md`.

Hvis intet rimeligt 7-dages-grundlag kan etableres, stop med `QA_HISTORY_UNAVAILABLE` og aflever audit-only.

## 5. Hero/media

Almindelige nyheder bruger ægte dokumentarisk materiale. Følg media-handoff i `docs/chatgpt-publish-bridge.md`.

Producenten skal normalt levere højst 2 rangerede, selvstændigt lovlige original-URL'er. Ét stærkt lovligt hero er nok. Media Worker ejer download, MIME/signatur, pixelmål, rettighedsgate, lokal arkivering, fallback og retry.

Kendte kandidater under 800×450 må ikke sendes; foretræk mindst 1200×675, når metadata findes. Brug originalfil frem for thumbnail/preview.

Hvis ingen lovlig hero-kandidat kan findes inden for dette budget, stop med `NO_LEGAL_HERO` og aflever audit-only. Start ikke en helt ny artikel alene på grund af hero-mangel.

## 6. Discovery-audit

Bevar kun et kompakt auditspor for kandidater, der faktisk blev rangordnet eller researchet. Brug ét stabilt `discovery_run_id` pr. run og ét stabilt `candidate_id` pr. kandidat.

Ved artikel lægges audit i `editorial_metadata`. Ved legitimt hard stop afleveres audit-only gennem samme GitHub-bro. Audit må ikke ændre redaktionelt udfald.

Minimumfelter pr. behandlet kandidat, når observerbart:
- source pool/path
- rank
- candidate headline/topic
- deep-screened ja/nej
- downstream-kilder
- decision + reason
- model/prompt-version

Ingen separate eksterne checkpoint-writes fra Scheduled Task.

## 7. Hard stops

Tilladte konkrete stopkoder omfatter:
- `CANONICAL_UNREADABLE`
- `INSUFFICIENT_DOCUMENTATION`
- `QA_HISTORY_UNAVAILABLE`
- `DUPLICATE_RETRY_EXHAUSTED`
- `NO_LEGAL_HERO`
- `BRIDGE_FAILED`
- `BACKEND_REJECTED`

Manglende kilde nummer to er ikke i sig selv en hard stop, hvis én autoritativ kilde bærer de centrale fakta.

## 8. Aflevering

Følg transportkontrakten i `docs/chatgpt-publish-bridge.md`: unik `publish/chatgpt-*` branch fra `main` → præcis én `publish-queue/<queue_id>.json` → præcis én `[PUBLISH]`-PR mod `main` med den krævede body-marker. Merge ikke og brug aldrig direkte Supabase-write som fallback.

Aflever først artikelpayload efter bestået slut-QA med `final_qa_duplicate=false`. Ved hard stop afleveres audit-only.

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
