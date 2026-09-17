# Morgentidende – fælles redaktionel kerne

Denne fil ejer fælles artikelkrav og Journalistens **producer-check før handoff**. Opgavespecifik kørsels-, transport-, media- og backendlogik hører ikke hjemme her.

**Begreber:** Den semantiske 7-dages-dedupe ligger efter Research og før Write. Producer-check er Journalistens sidste redaktionelle kontrol før GitHub-handoff. Backendens **Article QA** er en separat publication-gate og må først starte, når hero/media er valideret, `ready` og attached til artiklen.

## Fælles artikelkrav

1. **Dokumentation.** Verificér centrale faktuelle påstande med troværdige kilder; brug primærkilder, når relevante og tilgængelige. Discovery-, blog- og opinionskilder må finde spor, men ikke erstatte dokumentation af centrale fakta.

2. **Ingen opfundne led.** Opfind aldrig fakta, personer, citater, erfaringer eller kausalitet. Skeln mellem dokumenterede fakta, påstande, analyse og kommentar. Ved regler/love/systemer skelnes mellem forskrift, faktisk praksis og dokumenterede versus mulige forklaringer. Mønstre er ikke årsager uden dokumentation.

3. **Klart dansk.** Skriv naturligt, konkret og forståeligt. Oversæt administrative begreber, systemtal og statistik til mennesker og konsekvenser, når datagrundlaget tillader det. Den bindende sprogordbog ligger i `docs/editorial-language-glossary.md`.

4. **Rubrik = faktum først.** Løft stærke verificerede fakta, tal, citater eller konsekvenser frem. Rubrik/manchet må aldrig love mere end dokumentationen bærer. Udkast, målinger, påstande og ikke-vedtagne beslutninger må ikke omskrives til sikre resultater.

5. **Manchet.** Højst 2 sætninger og cirka 20 ord. Forklar primært hvorfor historien er vigtig/aktuel nu; gentag ikke rubrikken.

6. **`SAGEN KORT`.** Præcis 2 tydeligt forskellige, verificerede hovedpointer. De skal primært være de to stærkeste fakta og ikke blot gentage rubrik/manchet. Leveres kun som `editorial_metadata.sagen_kort`; aldrig som manuel sektion i `body_markdown`. Feltnavnet er fortsat `sagen_kort`, også når Viden/Liv viser labelen Artiklen kort.

7. **Body-struktur.** `body_markdown` begynder ikke med H1 eller gentager rubrikken. Undgå markdown, der utilsigtet bliver nummererede lister.

8. **Links/kilder.** Ingen almindelige eksterne hyperlinks eller manuel kildeliste i brødteksten. Eksterne kilder kommer én gang fra top-level `source_metadata` array. Interne anbefalinger bruger det strukturerede `Læs også`-relationssystem.

9. **Citater og modspil.** Direkte citater og erfaringer skal være verificerbare og loyale mod konteksten. “Begge sider” betyder relevante dokumenterede modargumenter, fakta og forbehold, der kan ændre forståelsen — ikke kunstig 50/50-symmetri.

10. **Hero-relevans.** Alle artikler skal have relevant hero. Prioritet: central person/begivenhed → direkte relevant sted/genstand/miljø → tydelig visualisering af konsekvens. Generiske flag, facader og brede symbolbilleder er sidste udvej. Hero må ikke vildlede; AI-billeder må ikke fremstille virkelige personer eller konkrete virkelige hændelser som dokumentariske fotos. Teknisk media-håndtering ejes af run-kontrakten/backend.

11. **Researchstop.** Stop, når centrale påstande og væsentlige forbehold er dokumenteret. Derefter må delbarhedsarbejde kun prioritere allerede dokumenteret materiale; det må ikke starte ny research. Ekstra citater, SEO-finjustering og ekstra kilder er ikke i sig selv gates.

12. **Forklar ikke-alment kendte egenavne.** Ved første omtale forklares udenlandske/ikke-alment kendte personer, organisationer, virksomheder, institutioner, bevægelser og partier kort og naturligt, typisk 1–3 ord. Politiske beskrivelser skal være konkrete og sagsbaserede frem for højre/venstre-etiketter. Direkte citater må gengive kildens egne etiketter med tydelig attribution.

13. **Udenlandsk valuta.** Centrale udenlandske beløb angives samtidig eller først i rimeligt afrundede DKK efter relevant kurs. Rubrik og `SAGEN KORT` bruger som udgangspunkt DKK, når det hjælper læseren. Originalvaluta kan stå i parentes ved første centrale omtale.

14. **Ingen næsten-identiske historier inden for 7 dage.** Den semantiske dubletkontrol udføres **efter Research og før Write**, mens sagens substans er kendt, men før der bruges tid på at skrive artiklen. Kontrollen er semantisk og redaktionel — ikke en deterministisk fingerprint-, nøgleords- eller rubrik-gate.

Sammenlign researchens story brief med de seneste 7 dages publicerede Morgentidende-artikler og helt friske `[PUBLISH]`-transporter, der endnu ikke er synlige offentligt. Sammenlign hovedbegivenhed, hovedfaktum, centrale aktører, tal, geografi og den konkrete nye udvikling. Samme sag kræver en væsentlig videreudvikling, der i sig selv fortjener en ny artikel.

Praktisk test: opfølgeren skal kunne opsummeres med mindst ét væsentligt nyt faktum eller en konkret konsekvens, som den gamle artikel ikke kunne have skrevet ved publicering. Legitim opfølger bruger samme `story_cluster_key` og struktureret `Læs også`.

Hvis dedupe-fasen finder en næsten-identisk historie: registrér `duplicate_of`, ekskludér sagen/personen/institutionen resten af runnet, og returnér til et **helt nyt forsideoverblik/historievalg**. Brug ikke blot næste kandidat fra den gamle shortlist. Et dubletfund afslutter ikke i sig selv runnet.

Hvis researchen eller sagens substans ændres væsentligt efter dedupe, skal den semantiske dubletkontrol køres igen, før artiklen færdiggøres. Producer-check er ikke en ny dublet-gate.

15. **Delingspotentiale.** Udvikl artikler med højt delingspotentiale uden at svække dokumentation eller forbehold. Løft stærke fakta, tal, citater, konsekvenser og kontraster frem; gør abstrakte emner konkrete. Før handoff skal sætningen **“Jeg sender dig den her, fordi …”** kunne afsluttes med et konkret dokumenteret faktum eller en dokumenteret konsekvens. Hvis det kræver overdrivelse, spekulation eller udeladelse af en væsentlig indvending, skal vinklen rettes.

## Journalistens producer-check før handoff

For alle artikler, inklusive breaking og direkte chat-publicering, laver Journalisten ét frisk genlæs af det færdige udkast **før GitHub-handoff**. Dette er korrektur og payload-kontrol, ikke dedupe, ikke backendens Article QA og ikke et nyt researchforløb.

### Skal være afklaret

- den semantiske 7-dages-dedupe efter regel 14 er allerede gennemført før Write på et rimeligt aktuelt grundlag
- centrale fakta og væsentlige forbehold er dokumenteret
- `editorial_metadata.sagen_kort`, `deck`, `source_metadata`, hero-kandidater og øvrige strukturerede felter følger den aktuelle run-kontrakt
- hvis artiklen er en legitim opfølger, bruger den korrekt `story_cluster_key` og relationer

### Må rettes sikkert

- sprog, tegnsætning, gentagelser, markdown og åbenlyse metadatafejl
- rubrik/manchet, der lover mere end dokumentationen bærer
- første omtale af ikke-alment kendte aktører efter regel 12
- udenlandske beløb uden forståelig DKK-angivelse
- manuelle `SAGEN KORT`, `Kilder` eller `Læs også`-sektioner i `body_markdown`
- dokumenterede modargumenter/forbehold, der allerede ligger i researchen, men hvis udeladelse ændrer forståelsen
- hero-motiv/kandidatrangering, hvis et allerede fundet bedre lovligt valg findes uden ny research
- delbarhed kun ved disponering af allerede dokumenteret materiale

Bevar journalistisk vinkel, dokumenterede fakta, evidensvurdering og citaters mening. Kræver en rettelse ny research eller ændrer den sagens substans, returnér til den relevante tidligere fase og genkør dedupe efter regel 14, før artiklen færdiggøres.

## Backendens Article QA

Article QA er **post-media**. Backend må først enqueue Article QA, når den valgte hero er valideret og publication-ready. Hvis hero ændres efterfølgende, skal den aktuelle artikelversion behandles som ændret og den relevante QA/publication-state opdateres efter backendens kanoniske logik.

Opgavespecifikke automations skal henvise til denne fil i stedet for at kopiere checklisten.

Målet er: **én regel, én ejer, én autoritativ implementering**.
