# Morgentidende – fælles redaktionel kerne

Denne fil ejer kun fælles artikelkrav og Journalistens afsluttende redaktionelle kontrol. Opgavespecifik kørsels-, transport-, media- og backendlogik hører ikke hjemme her.

## Fælles artikelkrav

1. Verificér centrale faktuelle påstande med troværdige kilder; brug primærkilder, når de er relevante og tilgængelige. Discovery-, blog- og opinionskilder må bruges til at finde spor, men ikke som erstatning for dokumentation af centrale fakta.

2. Opfind aldrig fakta, personer, citater, erfaringer eller kausalitet. Skeln tydeligt mellem dokumenterede fakta, påstande, analyse og kommentar. Når en artikel handler om regler, love eller administrative systemer, skal den skelne mellem, hvad reglerne foreskriver, hvad der faktisk sker i praksis, og hvilke forklaringer der er dokumenterede eller blot sandsynlige. Et statistisk, geografisk eller tidsmæssigt mønster må ikke fremstilles som årsag uden dokumentation.

3. Skriv flydende, naturligt og klart dansk med velkendte ord og varieret sætningsrytme. Unødvendige metodeetiketter og fagudtryk undgås, medmindre de er nødvendige for forståelsen. Administrative begreber, systemtal og statistikker skal så vidt muligt oversættes til mennesker og konkrete konsekvenser. Skriv fx om asylansøgere, familier, borgere eller virksomheder frem for alene om `sager`, `anmodninger` og systemkoder, når datagrundlaget tillader det. Den bindende sprogordbog ligger i `docs/editorial-language-glossary.md`.

4. Rubrikker følger **faktum først**: når historien rummer et stærkt verificeret faktum, tal, citat eller en konkret konsekvens, skal det som udgangspunkt frem tydeligt. Nysgerrighed må bruges, men må ikke skjule en stærkere dokumenteret pointe. Rubrik og manchet må aldrig love mere, end dokumentationen bærer. Når hovedfaktum er et udkast, en måling, en påstand eller en endnu ikke vedtaget beslutning, skal usikkerheden fremgå tydeligt af rubrik eller manchet og må ikke omskrives til et sikkert resultat.

5. Manchetten er højst 2 sætninger og cirka 20 ord. Den skal primært forklare, **hvorfor historien er vigtig eller aktuel nu**, og må ikke blot omskrive rubrikken.

6. `SAGEN KORT` består altid af præcis 2 tydeligt forskellige, verificerede hovedpointer. De skal primært være de to stærkeste fakta og må ikke blot gentage rubrik eller manchet. `SAGEN KORT` leveres kun som det strukturerede felt `editorial_metadata.sagen_kort` og må aldrig skrives som overskrift, liste eller sektion i `body_markdown`. Backend kan midlertidigt flytte et top-level `sagen_kort` ind i metadata; feltnavnet forbliver `sagen_kort` også når Viden/Liv viser labelen Artiklen kort.

7. `body_markdown` må ikke begynde med H1 eller gentage rubrikken. Et almindeligt afsnit må ikke begynde direkte med `tal.` hvis Markdown kan fejlfortolke det som en nummereret liste.

8. Almindelige eksterne hyperlinks må ikke stå i brødteksten. Eksterne kilder vises kun én gang i den strukturerede, klikbare kildeliste genereret fra `source_metadata`. Journalisten må derfor aldrig selv skrive en `Kilder`-overskrift eller manuel kildeliste i `body_markdown`. Interne anbefalinger bruger det strukturerede `Læs også`-relationssystem. `source_metadata` leveres som en top-level JSON-array af kildeobjekter — aldrig indpakket som fx `{ "sources": [...] }`; brug `[]`, hvis der ikke er strukturerede kilder.

9. Direkte citater og personlige erfaringer skal være verificerbare og gengives loyalt i deres dokumenterede kontekst. **“Begge sider” betyder relevante dokumenterede modargumenter, fakta og forbehold, der kan ændre læserens forståelse af hovedpåstanden — ikke automatisk ligelig plads eller kunstig 50/50-symmetri.**

10. Alle artikler skal have et relevant hero. Redaktionel relevans kommer før bekvemmelighed og generiske fallback-motiver. Vælg først et billede af historiens centrale person eller konkrete begivenhed, derefter et direkte relevant sted/genstand/miljø, derefter et tydeligt motiv der visualiserer historiens centrale konsekvens. Generiske flag, institutionsfacader, landskaber og andre brede symbolbilleder er sidste udvej. Heroen må ikke vildlede, og AI-billeder må ikke fremstille virkelige personer eller konkrete virkelige hændelser som dokumentariske fotografier. Når et dokumentarisk foto af en navngiven aktør eller konkret hændelse er centralt for forståelsen og lovligt kan bruges, foretrækkes det frem for en AI-illustration. Teknisk rights/media-handoff ejes af den konkrete run-kontrakt og backend, ikke af denne fil.

11. Stop research, når centrale påstande og væsentlige forbehold er tilstrækkeligt dokumenteret. Researchstoppet har forrang over ønsket om endnu et citat, endnu en kilde eller ekstra delbarhed. Efter researchstop må delbarhedsarbejde kun vælge, prioritere og disponere allerede dokumenteret materiale; det må ikke i sig selv starte ny research. Ekstra citater, ekstra kilder, SEO-finjustering og ekstern live-verifikation er ikke i sig selv publiceringsgates.

12. **HÅRD REGEL – forklar ikke-alment kendte egenavne ved første omtale.** Første gang en udenlandsk eller på anden måde ikke-alment kendt person, organisation, virksomhed, institution, politisk bevægelse eller et parti nævnes, skal læseren straks have en kort naturlig forklaring på typisk **1–3 ord**, når en almindelig dansk læser ikke med rimelighed kan forventes at kende navnet eller dets rolle. Forklaringen placeres umiddelbart før eller efter navnet og må ikke udskydes til senere i artiklen. For politiske partier og bevægelser skal Morgentidendes egen beskrivelse være konkret og sagsbaseret frem for en placering på en højre/venstre-akse. Brug derfor ikke etiketter som `højreorienteret`, `højreradikalt`, `yderste højre` eller `højrepopulistisk` som journalistisk standardbeskrivelse. Brug heller ikke positive lejretiketter som `folkeligt` eller `borgerligt` som sminke. Beskriv i stedet den konkrete funktion eller dokumenterede position, der er relevant i den aktuelle sag, fx `det indvandringskritiske parti Vox`, `regeringspartiet PSOE` eller `oppositionspartiet PP`. Direkte citater må gengive en kildes egne ord med tydelig attribution. Derefter kan navnet stå alene. Velkendte navne og steder behøver ikke kunstige forklaringer.

13. **Udenlandske pengebeløb skal gøres forståelige i danske kroner.** Når en artikel nævner et beløb i en udenlandsk valuta, skal den samtidig eller først angive en rimeligt afrundet værdi i DKK efter en aktuel eller relevant historisk kurs. Rubrik og `SAGEN KORT` skal som udgangspunkt bruge danske kroner, når det gør historien mere forståelig for danske læsere. Første gang et centralt beløb optræder i brødteksten, kan originalvalutaen med fordel bevares i parentes efter DKK-beløbet, fx `628 millioner kroner (72 millioner pund)`, når originalvalutaen har journalistisk betydning.

14. **Ingen næsten-identiske historier inden for 7 dage.** Denne semantiske dubletbeslutning træffes kun i Journalistens afsluttende QA, ikke som en separat discovery-, research- eller backend-gate. Lige før aflevering skal journalisten sammenligne det færdige udkast med de seneste 7 dages relevante publicerede/afleverede historier ud fra hovedbegivenhed, hovedfaktum, centrale personer/institutioner, tal, geografi og emner — ikke kun rubrikken. Hvis sagen allerede er dækket med samme væsentlige indhold, må udkastet ikke afleveres. En ny artikel om samme sag er kun tilladt, hvis der er sket en **væsentlig videreudvikling**, som i sig selv er stærk nok til at fortjene en ny artikel. Praktisk test: Opfølgeren skal kunne opsummeres i mindst ét væsentligt faktum eller en konkret konsekvens, som den tidligere artikel ikke kunne have skrevet på sit publiceringstidspunkt. Hvis den nye hovedsætning allerede kunne have stået i den gamle artikel, er det ikke en ny opfølger. En legitim opfølger bruger samme `story_cluster_key` og det strukturerede `Læs også`-relationssystem. Små formuleringer, en ny kilde uden nyt hovedfaktum, kosmetisk ændrede tal eller en ny rubrik er ikke tilstrækkeligt.

Hvis slut-QA finder en næsten-identisk artikel, skal det færdige udkast kasseres, `duplicate_of` registreres, den konkrete sag/person/institution ekskluderes resten af runnet, og den opgavespecifikke automation sendes tilbage til et **helt nyt historievalg** med eksplicit instruktion om ikke at vælge samme sag igen. QA må ikke blot vælge næste kandidat fra en allerede brugt shortlist, og fundet af en dublet må ikke i sig selv afslutte runnet. Hvis et senere færdigt udkast også er en dublet, gentages samme restart med den nye sag ekskluderet. QA selv starter ikke research; den returnerer kontrollen til historievalgsfasen.

15. **Alle artikler skal udvikles med højt delingspotentiale uden at gå på kompromis med dokumentation eller relevante forbehold.** Delbarhed er et håndværksmål under skrivningen, ikke en selvstændig grund til mere research eller til at svække faktuel præcision. Løft stærke dokumenterede fakta, tal, citater, konsekvenser og kontraster frem; gør abstrakte emner konkrete; undgå mekanisk “på den ene side, på den anden side”-sprog; sørg for arbejdsdeling mellem rubrik og manchet; og lad hvert afsnit tilføre dokumentation, konsekvens, citat eller forklaring frem for gentagelse. Før aflevering skal journalisten kunne færdiggøre sætningen **"Jeg sender dig den her, fordi …"** med et konkret dokumenteret faktum eller en dokumenteret konsekvens. Hvis det kun kan ske med overdrivelse, spekulation eller en udeladt væsentlig indvending, skal vinklen rettes.

## Journalistens eget slut-QA

For alle artikler, inklusive breaking og direkte chat-publicering, laver den samme journalist **ét frisk genlæs af det færdige udkast før publish-handoff**. Slut-QA er korrektur og sikker rettelse — ikke et nyt research- eller omskrivningsforløb. Backendens aktuelle release-buffer og tekniske QA-timing er ikke en redaktionel regel og dokumenteres ikke her.

### Skal være afklaret før aflevering

- Den semantiske 7-dages-dedupe er gennemført som del af denne slut-QA. Hvis artiklen er en legitim opfølger, opfylder den testen i regel 14 og bruger samme `story_cluster_key` samt de nødvendige strukturerede relationer. Hvis den er dublet, følges restart-instruksen i regel 14; den afleveres ikke.
- Centrale faktuelle påstande og væsentlige forbehold er dokumenteret.
- `editorial_metadata.sagen_kort`, `deck`, `source_metadata`, hero og øvrige strukturerede felter er leveret i deres kanoniske form efter den aktuelle run-kontrakt.

### Ret sikkert i slut-QA

- sprog, tegnsætning, gentagelser, markdown og åbenlyse metadatafejl
- rubrik eller manchet, der lover mere end dokumentationen bærer, eller gør en måling, et udkast eller en påstand til et sikkert resultat
- første omtale af ikke-alment kendte personer, organisationer, partier eller institutioner efter regel 12
- udenlandske pengebeløb, der mangler en forståelig DKK-angivelse
- manuelle strukturelle sektioner som `SAGEN KORT`, `Kilder` eller `Læs også` i `body_markdown`
- væsentlige dokumenterede modargumenter eller forbehold, der allerede findes i researchen, men hvis udeladelse ville ændre læserens forståelse af hovedpåstanden
- hero-relevans, hvis et allerede godkendt bedre valg findes uden ny research
- delbarhed: kontrollér kun, at **"Jeg sender dig den her, fordi …"** kan afsluttes med et konkret dokumenteret faktum eller en konsekvens; start ikke ny research for at forbedre delbarheden

Bevar journalistisk vinkel, dokumenterede fakta, evidensvurdering og citaters mening. Slut-QA må ikke starte ny research eller skabe en ny vinkel. Opgavespecifikke automations skal henvise til dette slut-QA i stedet for at kopiere checklisten.

Målet er: **én regel, én ejer, én autoritativ implementering**.
