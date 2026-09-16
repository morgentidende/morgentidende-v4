# Morgentidende — canonical magazine evergreen mandate

Dette er den kanoniske instruktion for den autonome Viden/Liv-evergreen-task. Scheduled Task skal henvise til denne fil i stedet for at kopiere payload-, hero- og transportkontrakten lokalt.

## Mandat

Udgiv præcis én ny evergreen-artikel til Viden eller Liv pr. kørsel, hvis der findes et stærkt emne. Brug højeste tilgængelige model/ræsonneringsniveau.

Læs og følg altid:
- `docs/editorial-core.md`
- `docs/editorial-language-glossary.md`
- `docs/magazine-editorial-policy.md`
- `docs/chatgpt-publish-bridge.md`

Viden/Liv er apolitiske. Emnet skal have høj læse-, delings- og søgeværdi. Research i troværdige kilder, helst primærkilder.

## Dedupe-preflight før prosa

Før fuld artikelproduktion:
1. vælg et foreløbigt evergreen-emne,
2. lav en stabil kort `topic_key`,
3. brug Supabase **read-only** til at kontrollere `published` og `scheduled` Viden/Liv-magasinartikler fra de seneste 7 dage,
4. sammenlign væsentligt evergreen-emne, normaliseret rubrik og eksisterende `topic_key`.

Hvis samme væsentlige emne allerede findes inden for 7 dage, kassér kandidaten med `DUPLICATE_7D` og vælg et nyt emne i samme kørsel. Opret ingen branch, queue-fil eller PR for den kasserede kandidat.

En normal evergreen er `story_kind: evergreen_explainer`. Brug kun `followup`, når der er et dokumenterbart nyt faktum eller en reel ny udvikling, som gør artiklen substantielt forskellig fra den tidligere.

Backendens 7-dages gate er bindende sidste kontrol. Forsøg aldrig at omgå den ved kosmetisk rubrikskifte eller metadataændring.

## Research, artikel og hero

Følg magazine-policyen for stil, nytte, kilder og redaktionel kvalitet. Følg også den interne sprogordbog: brug almindeligt, etableret dansk; dan ikke hjemmelavede ord ved direkte oversættelse; og lav før aflevering én kort sprogpassage for mistænkelige sammensatte ord, direkte oversættelser, embedsmandssprog og unødvendige fremmedord.

Følg hero-kontrakten i `docs/chatgpt-publish-bridge.md`. Find lovlige relevante ranked candidates; opfind aldrig rettigheder. Media Worker ejer download, MIME/signatur, dimensionskontrol, permanent/transient klassifikation, arkivering, fallback og retry.

Hvis ingen lovlig hero kan verificeres, afslut med `NO_LEGAL_HERO` i stedet for at efterlade en artikel blokeret i media-gaten.

## Aflevering

Supabase er read-only fra Scheduled Task. Aflever kun gennem GitHub publish bridge efter den aktuelle bridge-kontrakt. Merge ikke transport-PR'en og brug aldrig direkte Supabase-write som fallback.

Backend afviser payloads, der bryder magazine-, topic-, followup-, media- eller publication-invariants. Forsøg aldrig at omgå en gate.

En fejl i en kørsel må aldrig ændre automationens schedule eller enabled-status.

## Run-resultat

Ved vellykket aflevering: returnér kort rubrik + `queue_id`.

Ved skip/fejl: returnér kort reason code og sidste gennemførte trin. Brug især:
- `DUPLICATE_7D`
- `NO_LEGAL_HERO`
- `NO_PUBLISHABLE_CANDIDATE` når intet emne er stærkt nok
