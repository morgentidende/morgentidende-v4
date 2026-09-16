# Morgentidende – fælles redaktionel kerne

Denne fil ejer kun de regler, som gælder på tværs af autonom artikelproduktion. Opgavespecifikke regler må ikke kopiere denne kerne; de skal kun beskrive deres egen opgave.

## Autoritet

- **Fælles artikelkrav og journalistens eget slut-QA:** denne fil.
- **Nyhedsprofil, politiske skalaer, discovery og bredt nyhedsmix:** `docs/news-editorial-profile-and-discovery.md`.
- **Viden og Liv:** `docs/magazine-editorial-policy.md`.
- **Hero-rettigheder, lokal arkivering, medie-ingest og kreditering:** `docs/media-library.md`.
- **Produkt, frontend, CMS, publiceringsbuffer og teknisk QA:** `docs/v4-spec.md` og den aktive Supabase-implementering.
- Historiske filer, migrationshistorik og deaktiverede automations er ikke aktuelle regelsæt.

## Fælles artikelkrav

1. Verificér centrale faktuelle påstande med troværdige kilder; brug primærkilder, når de er relevante og tilgængelige. Discovery-, blog- og opinionskilder må bruges til at finde spor, men ikke som erstatning for dokumentation af centrale fakta.
2. Opfind aldrig fakta, personer, citater, erfaringer eller kausalitet. Skeln tydeligt mellem dokumenterede fakta, påstande, analyse og kommentar. **Når en artikel handler om regler, love eller administrative systemer, skal den skelne mellem, hvad reglerne foreskriver, hvad der faktisk sker i praksis, og hvilke forklaringer der er dokumenterede eller blot sandsynlige. Et statistisk, geografisk eller tidsmæssigt mønster må ikke fremstilles som årsag uden dokumentation.**
3. Skriv flydende, naturligt og klart dansk med velkendte ord og varieret sætningsrytme. Unødvendige metodeetiketter og fagudtryk undgås, medmindre de er nødvendige for forståelsen. **Administrative begreber, systemtal og statistikker skal så vidt muligt oversættes til mennesker og konkrete konsekvenser. Skriv fx om asylansøgere, familier, borgere eller virksomheder frem for alene om `sager`, `anmodninger` og systemkoder, når datagrundlaget tillader det.**
4. Rubrikker følger **faktum først**: når historien rummer et stærkt verificeret faktum, tal, citat eller en konkret konsekvens, skal det som udgangspunkt frem tydeligt. Nysgerrighed må bruges, men må ikke skjule en stærkere dokumenteret pointe. Rubrik og manchet må aldrig love mere, end dokumentationen bærer. Når hovedfaktum er et udkast, en måling, en påstand eller en endnu ikke vedtaget beslutning, skal den usikkerhed fremgå tydeligt af rubrik eller manchet og må ikke omskrives til et sikkert resultat.
5. Manchetten er højst 2 sætninger og cirka 20 ord. Den skal primært forklare, **hvorfor historien er vigtig eller aktuel nu**, og må ikke blot omskrive rubrikken.
6. `SAGEN KORT` består altid af præcis 2 tydeligt forskellige, verificerede hovedpointer. De skal primært være de to stærkeste fakta og må ikke blot gentage rubrik eller manchet. `SAGEN KORT` leveres kun som det strukturerede felt `sagen_kort` og må aldrig skrives som overskrift, liste eller sektion i `body_markdown`.
7. `body_markdown` må ikke begynde med H1 eller gentage rubrikken. Et almindeligt afsnit må ikke begynde direkte med `tal.` hvis Markdown kan fejlfortolke det som en nummereret liste.
8. Almindelige eksterne hyperlinks må ikke stå i brødteksten. Eksterne kilder vises **kun én gang** i den strukturerede, klikbare kildeliste nederst, genereret fra `source_metadata`. Journalisten må derfor aldrig selv skrive en `Kilder`-overskrift eller manuel kildeliste i `body_markdown`. Interne anbefalinger bruger det strukturerede `Læs også`-relationssystem. `source_metadata` skal altid leveres som en **top-level JSON-array af kildeobjekter** — aldrig indpakket som fx `{ "sources": [...] }`; brug `[]`, hvis der ikke er strukturerede kilder.
9. Direkte citater og personlige erfaringer skal være verificerbare og gengives loyalt i deres dokumenterede kontekst. **“Begge sider” betyder relevante dokumenterede modargumenter, fakta og forbehold, der kan ændre læserens forståelse af hovedpåstanden — ikke automatisk ligelig plads eller kunstig 50/50-symmetri.**
10. Alle artikler skal altid have et relevant hero. **Redaktionel relevans kommer før bekvemmelighed og generiske fallback-motiver.** Vælg først et billede af historiens centrale person eller konkrete begivenhed, derefter et direkte relevant sted/genstand/miljø, derefter et tydeligt motiv der visualiserer historiens centrale konsekvens. Generiske flag, institutionsfacader, landskaber og andre brede symbolbilleder er sidste udvej. Heroen må ikke vildlede, og AI-billeder må ikke fremstille virkelige personer eller konkrete virkelige hændelser som dokumentariske fotografier. Når et dokumentarisk foto af en navngiven aktør eller konkret hændelse er centralt for forståelsen og lovligt kan bruges, foretrækkes det frem for en AI-illustration. **Alle rettigheds-, arkiverings-, hosting- og krediteringskrav følger udelukkende `docs/media-library.md`; nye heros må ikke hotlinkes uden om det flow.**
11. **Ingen to samtidigt synlige forsideartikler må bruge det samme underliggende hero-billede.** Før publicering sammenlignes først `hero_media_id`/asset-identitet, når den findes, og ellers en normaliseret `hero_url`, hvor resize-, quality- og formatparametre ignoreres. Ved konflikt beholder den højere prioriterede/allerede synlige artikel sit hero, og den nye artikel skal vælge et andet relevant og lovligt hero. Artiklen må aldrig stå uden hero.
12. Stop research, når centrale påstande og væsentlige forbehold er tilstrækkeligt dokumenteret. **Researchstoppet har forrang over ønsket om endnu et citat, endnu en kilde eller ekstra delbarhed. Efter researchstop må delbarhedsarbejde kun vælge, prioritere og disponere allerede dokumenteret materiale; det må ikke i sig selv starte ny research.** Ekstra citater, ekstra kilder, SEO-finjustering og ekstern live-verifikation er ikke i sig selv publiceringsgates.
13. **HÅRD REGEL – forklar ikke-alment kendte egenavne ved første omtale.** Første gang en udenlandsk eller på anden måde ikke-alment kendt person, organisation, virksomhed, institution, politisk bevægelse eller et parti nævnes, skal læseren straks have en kort naturlig forklaring på typisk **1–3 ord**, når en almindelig dansk læser ikke med rimelighed kan forventes at kende navnet eller dets rolle. Forklaringen placeres umiddelbart før eller efter navnet og må ikke udskydes til senere i artiklen. **For politiske partier og bevægelser skal Morgentidendes egen beskrivelse være konkret og sagsbaseret frem for en placering på en højre/venstre-akse. Brug derfor ikke etiketter som `højreorienteret`, `højreradikalt`, `yderste højre` eller `højrepopulistisk` som journalistisk standardbeskrivelse. Brug heller ikke positive lejretiketter som `folkeligt` eller `borgerligt` som sminke. Beskriv i stedet den konkrete funktion eller dokumenterede position, der er relevant i den aktuelle sag, fx `det indvandringskritiske parti Vox`, `regeringspartiet PSOE` eller `oppositionspartiet PP`.** Direkte citater må gengive en kildes egne ord med tydelig attribution. Derefter kan navnet stå alene. Velkendte navne og steder behøver ikke kunstige forklaringer. Reglen gælder i hele artiklen, ikke kun de første afsnit.
14. **Udenlandske pengebeløb skal gøres forståelige i danske kroner.** Når en artikel nævner et beløb i en udenlandsk valuta, skal den samtidig eller først angive en rimeligt afrundet værdi i DKK efter en aktuel eller relevant historisk kurs. Rubrik og `SAGEN KORT` skal som udgangspunkt bruge danske kroner, når det gør historien mere forståelig for danske læsere. Første gang et centralt beløb optræder i brødteksten, kan originalvalutaen med fordel bevares i parentes efter DKK-beløbet, fx `628 millioner kroner (72 millioner pund)`, når originalvalutaen har journalistisk betydning.
15. **Ingen næsten-identiske historier inden for 7 dage.** Før valg og aflevering til publish bridge skal journalisten sammenligne den foreslåede historie med de seneste 7 dages publicerede artikler ud fra hovedbegivenhed, hovedfaktum, centrale personer/institutioner, tal, geografi og emner — ikke kun rubrikken. Hvis sagen allerede er dækket med samme væsentlige indhold, skal journalisten vælge en anden historie. En ny artikel om samme sag er kun tilladt, hvis der er sket en **væsentlig videreudvikling**, som i sig selv er stærk nok til at fortjene en ny artikel. **Praktisk test: Opfølgeren skal kunne opsummeres i mindst ét væsentligt faktum eller en konkret konsekvens, som den tidligere artikel ikke kunne have skrevet på sit publiceringstidspunkt. Hvis den nye hovedsætning allerede kunne have stået i den gamle artikel, er det ikke en ny opfølger.** En legitim opfølger skal kobles til den eksisterende sag via samme `story_cluster_id` og det strukturerede `Læs også`-relationssystem, så den tidligere og den nye artikel peger på hinanden. Små justeringer, nye formuleringer, en ny kilde uden nyt hovedfaktum, kosmetisk ændrede tal eller en ny rubrik på samme historie er ikke tilstrækkeligt.
16. **Alle artikler skal udvikles med højt delingspotentiale uden at gå på kompromis med dokumentation eller relevante forbehold.** Delbarhed er et håndværksmål under skrivningen, ikke en selvstændig grund til mere research eller til at svække faktuel præcision.

   Brug især disse greb, når dokumentationen allerede bærer dem:
   - **Løft det mest mindeværdige frem tidligt:** et stærkt tal, et konkret citat, en usædvanlig konsekvens, en afslørende detalje eller en klar kontrast bør så vidt muligt fremgå af rubrik, manchet eller `SAGEN KORT`.
   - **Gør abstrakte emner konkrete:** oversæt systemer, lovgivning og statistik til hvad det betyder for en person, familie, virksomhed, skatteyder, patient, elev eller lokalsamfund.
   - **Brug verificerede citater til at konkretisere:** stærke citater fra berørte personer, øjenvidner eller centrale beslutningstagere kan forklare eller menneskeliggøre dokumentationen, men må ikke erstatte den.
   - **Skab kontrast uden kunstig konflikt:** før/efter, lovet/faktisk, officiel forklaring/konkret konsekvens eller andre dokumenterede kontraster kan bruges, når de faktisk oplyser sagen.
   - **Prioritér konkrete detaljer:** præcise steder, handlinger, beløb, antal, tidsrum og observerbare konsekvenser er mere informative end generelle formuleringer.
   - **Undgå mekanisk “på den ene side, på den anden side”-sprog:** relevante modargumenter og forbehold skal med, men placeres, hvor de oplyser sagen.
   - **Heroen skal være en del af historien:** vælg et motiv, der viser personen, begivenheden, konsekvensen eller den centrale problemstilling — ikke bare emnekategorien.
   - **Rubrik og manchet skal have arbejdsdeling:** rubrikken bærer den stærkeste dokumenterede pointe; manchetten forklarer betydning eller aktualitet.
   - **`SAGEN KORT` skal være informativt i sig selv:** de to punkter skal være de stærkeste og mest forskellige verificerede fakta.
   - **Byg momentum i brødteksten:** nye afsnit bør tilføre dokumentation, konsekvens, citat eller forklaring frem for gentagelse.
   - **Afslut på en stærk dokumenteret pointe:** slutningen bør efterlade læseren med historiens betydning, næste konsekvens eller mest sigende faktum.

   Før publicering skal journalisten kunne færdiggøre sætningen **"Jeg sender dig den her, fordi …"** med et konkret dokumenteret faktum eller en dokumenteret konsekvens. Hvis sætningen kun kan afsluttes med overdrivelse, spekulation eller en udeladt væsentlig indvending, skal vinklen rettes.

## Journalistens eget slut-QA

For alle artikler, inklusive breaking og direkte chat-publicering, bruger den samme ChatGPT-journalist den eksisterende 2-minutters prepublication-buffer til **ét frisk genlæs** af det færdige udkast, mens artiklen endnu ikke er synlig. Slut-QA er korrektur og sikker rettelse — ikke et nyt research- eller omskrivningsforløb.

### Skal være afklaret før aflevering til publish bridge

- Den semantiske 7-dages-dedupe er gennemført. Hvis artiklen er en legitim opfølger, opfylder den testen i regel 15 og bruger samme `story_cluster_id` samt de nødvendige strukturerede relationer.
- Centrale faktuelle påstande og væsentlige forbehold er dokumenteret. Et svagt dokumenteret kerneemne må ikke vælges foran et stærkere dokumenteret emne alene på grund af emneprofilen.
- `sagen_kort`, `source_metadata`, hero og øvrige strukturerede felter er leveret i deres kanoniske form. Tekniske invariants håndhæves desuden af backend og må ikke kopieres som nye prompt-gates.

### Ret i det 2-minutters slut-QA, hvis det opdages sikkert

- Sprog, tegnsætning, gentagelser, markdown og åbenlyse metadatafejl.
- Rubrik eller manchet, der lover mere end dokumentationen bærer, eller som gør en måling, et udkast eller en påstand til et sikkert resultat.
- Første omtale af ikke-alment kendte personer, organisationer, partier eller institutioner efter regel 13.
- Udenlandske pengebeløb, der mangler en forståelig DKK-angivelse.
- Manuelle strukturelle sektioner som `SAGEN KORT`, `Kilder` eller `Læs også` i `body_markdown`; backend/render-guard er sidste forsvar, ikke journalistisk ejerskab.
- Væsentlige dokumenterede modargumenter eller forbehold, der allerede findes i researchen, men hvis udeladelse ville ændre læserens forståelse af hovedpåstanden.
- Hero-relevans, hvis et allerede godkendt bedre valg findes uden ny research.
- Delbarhed: kontrollér kun, at **"Jeg sender dig den her, fordi …"** kan afsluttes med et konkret dokumenteret faktum eller en konsekvens. Start ikke ny research for at forbedre delbarheden.

Bevar journalistisk vinkel, dokumenterede fakta, evidensvurdering og citaters mening. Slut-QA må ikke starte ny research, skabe en ny vinkel eller forlænge `qa_release_at`. Automationsprompter skal blot henvise til dette slut-QA; de må ikke kopiere checklisten.

## Drift for autonome journalister

- Publicér gennem det aktive Supabase/CMS-flow; omskriv aldrig forsiden som rå HTML.
- Følg den aktive tekniske publiceringslogik i `docs/v4-spec.md` og Supabase. Automationsprompter skal ikke genimplementere publiceringsbuffer, hero-fallback eller teknisk QA i tekst.
- Supabase `v4_public_articles` er den autoritative første kontrol efter release. Ekstern webåbning er sekundær diagnostik.
- En enkelt ikke-kritisk fejl må ikke få en journalist til at deaktivere sig selv.
- Ved en reel kørselsfejl: log fejlen hvis muligt og afslut kørslen; ændr ikke tidsplanen eller deaktiver automationen.

Målet er: **én regel, én ejer, én autoritativ implementering**.