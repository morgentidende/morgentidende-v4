# Morgentidende — canonical news automation mandate

Denne fil er **eneste entrypoint** for almindelige autonome nyhedsruns. Scheduled Tasks henviser hertil og kopierer ikke regler lokalt.

## Fase-manifest

Læs kun det, den aktuelle fase kræver:

- **Discover:** denne fil §1 + `docs/news-editorial-profile.md` + `docs/discovery-sources.md`.
- **Research:** denne fil §2. Genbrug profilkontekst; læs ikke discovery-listen igen.
- **Write:** `docs/editorial-core.md` + `docs/editorial-language-glossary.md` + `docs/news-editorial-profile.md`.
- **Final check:** slut-QA i `docs/editorial-core.md` + denne fil §4.
- **Publish:** denne fil §§5, 6 og 8. Åbn ikke backend-runbooks, source-registry-, media-worker- eller v4-spec-dokumentation.

Denne automation vælger ikke Viden eller Liv.

## Runtime-princip

Default er én almindelig nyhedsartikel pr. normal kørsel. Kvalitet, dokumentation, slut-QA, hero- og publication-gates må ikke sænkes for at fylde et slot.

Hold tool-kæden kort. Et normalt run bør sigte mod højst ca. 15 eksterne kald før terminal levering og må ikke åbne nye researchspor, når centrale fakta og væsentlige forbehold allerede er dokumenteret. Brug ikke direkte Supabase-read som nødvendig gate i Scheduled Task-runtime.

En normal kørsel ender i én terminal GitHub-leverance:
- artikelpayload, eller
- `payload_type=discovery_audit` med konkret `terminal_reason`.

Hvis selve GitHub-write fejler, retry højst én gang og returnér `BRIDGE_FAILED`. En fejl må aldrig ændre automationens schedule eller enabled-status.

## 1. Historievalg

**Morgentidendes særkende er stærke, dokumenterbare nyheder, som andre danske medier overser eller prioriterer lavt.** Når en frisk discovery-historie er tilstrækkeligt stærk, veldokumenteret og relevant for profilen, prioriteres den som udgangspunkt over en almindelig omnibusnyhed, som allerede dækkes bredt af danske medier. Breaking-override gælder ved reelt store, akutte hændelser med høj dansk betydning.

1. Lav et kort breaking-scan af store danske medier. Brug kun override ved en frisk, dokumenterbar hændelse med høj dansk betydning, fx terror, stor ulykke/katastrofe, krig/NATO med direkte dansk berøring, regeringskrise, større cyberangreb eller myndighedsindgreb med umiddelbar virkning for mange danskere.
2. Ellers brug `docs/discovery-sources.md`. Lav én billig shortlist på højst 5 friske kandidater ud fra aktualitet, dokumenterbarhed, graden af underdækning i danske medier og match med `docs/news-editorial-profile.md`.
3. Research kandidaterne i rangeret rækkefølge, én ad gangen. Start ikke en ny discovery-runde, bare fordi én kandidat falder.
4. Hvis hele shortlisten falder, må der laves højst én ny historievalgsrunde med dansk major-media fallback. Ingen yderligere fulde genstarter i samme run.

Lav nyhedsværdi alene er ikke en hard stop, men filler må ikke publiceres.

## 2. Research og kildegulv

Der er kun to medieklasser i producerlogikken:

- `authoritative`: må bruges som faktuel slutkilde.
- `discovery_only`: må bruges til at opdage og følge en historie, men ikke som slutdokumentation.

Ukendte domæner behandles som `discovery_only`, indtil de er klassificeret. Kendte redaktørlåste klassifikationer må ikke overstyres af modelgæt. Nye klassifikationer afleveres via top-level `source_registry_updates` i GitHub-payloaden; Scheduled Task skriver aldrig direkte til Supabase.

Centrale fakta skal kunne dokumenteres af mindst én `authoritative` eller relevant primær kilde. Én bærende autoritativ kilde er tilstrækkelig, når den konkret dokumenterer historiens centrale fakta. Når én kilde bærer historien, attribueres væsentlige oplysninger naturligt.

Normal researchramme er 2–3 autoritative/primære kilder. Stop, når centrale påstande og væsentlige forbehold er tilstrækkeligt dokumenteret. Brug kun en ekstra kilde, hvis en konkret central konflikt eller usikkerhed kræver det.

## 3. Skriv artikel

Følg `docs/editorial-core.md`, `docs/editorial-language-glossary.md` og den aktuelle profil i `docs/news-editorial-profile.md`. Skriv ikke links eller manuel kildeliste i brødteksten. `source_metadata` er en top-level array. Brug den stærkeste dokumenterede vinkel uden at gå længere end kilderne bærer.

Brug kun almindeligt, etableret dansk. Dan aldrig et nyt dansk ord ved direkte oversættelse fra engelsk, tysk eller andre sprog. Hvis et udenlandsk fagudtryk ikke har en naturlig dansk ækvivalent, forklares betydningen med almindelige danske ord. Før aflevering laves én kort sprogpassage efter ordbogen.

## 4. Slut-QA og semantisk 7-dages-dedupe

Den redaktionelle 7-dages-dedupe ejes af Journalisten og er del af den ene afsluttende kontrol før publish-handoff. Backend træffer ikke en ny selvstændig semantisk dubletbeslutning.

Etabler ét rimeligt 7-dages-sammenligningsgrundlag:
1. GitHub `[PUBLISH]`-historik for de seneste 7 dage, inklusive åbne og nyligt lukkede transport-PR'er.
2. Brug kun offentlig Morgentidende-historik/feed som fallback eller supplement, hvis GitHub-historikken åbenlyst er utilstrækkelig.

Direkte Supabase-read er ikke nødvendig QA-gate. QA må ikke godkende på hukommelse alene.

Hvis artiklen er næsten-identisk med en historie fra de seneste 7 dage uden væsentlig videreudvikling:
- kassér udkastet,
- registrér `duplicate_of`,
- markér den konkrete sag/person/institution som ekskluderet resten af runnet,
- gå direkte til næste kandidat på den eksisterende shortlist.

Der må højst ske én fuld ny historievalgsrunde efter at den oprindelige shortlist er udtømt. Hvis der stadig ikke findes en ikke-dublet, stop med `DUPLICATE_RETRY_EXHAUSTED` og aflever audit-only.

En legitim væsentlig opfølger bruger samme `story_cluster_id` og struktureret `Læs også` efter `editorial-core.md`.

Hvis intet rimeligt 7-dages-grundlag kan etableres, stop med `QA_HISTORY_UNAVAILABLE` og aflever audit-only.

## 5. Hero/media — producer-kontrakt

Almindelige nyheder bruger ægte dokumentarisk materiale. Journalisten ejer motivvalg og kandidatlisten; Media Worker ejer URL-resolution, download, MIME/signatur, faktiske pixelmål, rettighedsgate, SHA-256, lokal arkivering, fallback og retry.

Producenten leverer **mindst 3 og højst 6 rangerede, forskellige hero-kandidater** i `editorial_metadata.hero_candidates`. Hver kandidat skal selv have en `source_url` og dokumenterede rettighedsfelter; mindst `commercial_use_allowed=true` og `local_storage_allowed=true`. Rettigheder må aldrig gættes eller arves fra en anden kandidat.

Hvis der efter rimelig søgning kun findes 1–2 lovlige kandidater, må payloaden kun afleveres med en eksplicit `editorial_metadata.hero_exception` med en kort konkret `reason`. Exception er en nødudgang, ikke normal drift. En artikel med 0 hero-kandidater må aldrig afleveres som artikelpayload.

Kendte kandidater under 800×450 må ikke sendes; foretræk mindst 1200×675, når metadata findes. For Wikimedia Commons må producenten gerne sende en legitim `File:`-/Commons-side-URL; Media Worker resolver den via Commons API og vælger en passende direkte/skaleret billed-URL. Producenten skal ikke lave separat HEAD/GET-preflight.

Media Worker prøver kandidaterne i rækkefølge som **én state machine**: permanent fejl går straks videre til næste kandidat; transient fejl retryer samme kandidat. Først når hele kandidatlisten er udtømt, må hero-flowet terminalisere.

Hvis ingen lovlig hero-kandidat kan findes inden for budgettet, stop med `NO_LEGAL_HERO` og aflever audit-only. Start ikke en helt ny artikel alene på grund af hero-mangel.

## 6. Discovery-audit

Bevar kun et kompakt auditspor for kandidater, der faktisk blev rangordnet eller researchet. Brug ét stabilt `discovery_run_id` pr. run og ét stabilt `candidate_id` pr. kandidat.

Ved artikel lægges audit i `editorial_metadata`. Ved legitimt hard stop afleveres audit-only gennem samme GitHub-transport. Audit må ikke ændre redaktionelt udfald.

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

## 8. Aflevering — producer-kontrakt

Scheduled Task skriver aldrig artiklen direkte til Supabase.

1. Opret en unik `publish/chatgpt-*` branch fra aktuel `main`.
2. Skriv præcis én ny `publish-queue/<queue_id>.json` på branchen.
3. Payloaden skal mindst indeholde `queue_id`, `slug`, `headline`, `category_slug`, `body_markdown`, top-level `source_metadata` array og `editorial_metadata` object. Medtag hero candidates, source-registry-opdateringer og audit, når relevant.
4. Opret præcis én PR mod `main`; titlen starter `[PUBLISH] ` og body indeholder `<!-- morgentidende-chatgpt-publish -->`.
5. Merge ikke transport-PR'en. Brug aldrig direkte Supabase-write som fallback. Backend ejer idempotens, slug/source/media/QA/publication-gates og lukker transport-PR'en efter vellykket aflevering.

Aflever først artikelpayload efter bestået slut-QA med `final_qa_duplicate=false`. Ved hard stop afleveres audit-only med konkret `terminal_reason`.

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
