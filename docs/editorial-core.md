# Morgentidende – fælles redaktionel kerne

Denne fil ejer kun de regler, som gælder på tværs af autonom artikelproduktion. Opgavespecifikke regler må ikke kopiere denne kerne; de skal kun beskrive deres egen opgave.

## Autoritet

- **Fælles artikelkrav og journalistens eget slut-QA:** denne fil.
- **Nyhedsprofil, politiske skalaer, discovery og bredt nyhedsmix:** `docs/news-editorial-profile-and-discovery.md`.
- **Viden og Liv:** `docs/magazine-editorial-policy.md`.
- **Hero-rettigheder, lokal arkivering, hosting og kreditering:** `docs/media-library.md`.
- **Produkt, frontend, CMS, publiceringsbuffer og teknisk QA:** `docs/v4-spec.md` og den aktive Supabase-implementering.
- Historiske filer, migrationshistorik og deaktiverede automations er ikke aktuelle regelsæt.

## Fælles artikelkrav

1. Verificér centrale faktuelle påstande med troværdige kilder; brug primærkilder, når de er relevante og tilgængelige. Discovery-, blog- og opinionskilder må bruges til at finde spor, men ikke som erstatning for dokumentation af centrale fakta.
2. Opfind aldrig fakta, personer, citater, erfaringer eller kausalitet. Skeln tydeligt mellem dokumenterede fakta, påstande, analyse og kommentar.
3. Skriv flydende, naturligt og klart dansk med velkendte ord og varieret sætningsrytme. Unødvendige metodeetiketter og fagudtryk undgås, medmindre de er nødvendige for forståelsen.
4. Rubrikker følger **faktum først**: når historien rummer et stærkt verificeret faktum, tal, citat eller en konkret konsekvens, skal det som udgangspunkt frem tydeligt. Nysgerrighed må bruges, men må ikke skjule en stærkere dokumenteret pointe. Rubrik og manchet må aldrig love mere, end dokumentationen bærer.
5. Manchetten er højst 2 sætninger og cirka 20 ord.
6. `SAGEN KORT` består altid af præcis 2 tydeligt forskellige hovedpointer.
7. `body_markdown` må ikke begynde med H1 eller gentage rubrikken. Et almindeligt afsnit må ikke begynde direkte med `tal.` hvis Markdown kan fejlfortolke det som en nummereret liste.
8. Almindelige eksterne hyperlinks må ikke stå i brødteksten. Eksterne kilder vises **kun én gang** i den strukturerede, klikbare kildeliste nederst, genereret fra `source_metadata`. Journalisten må derfor aldrig selv skrive en `Kilder`-overskrift eller manuel kildeliste i `body_markdown`. Interne anbefalinger bruger det strukturerede `Læs også`-relationssystem. `source_metadata` skal altid leveres som en **top-level JSON-array af kildeobjekter** — aldrig indpakket som fx `{ "sources": [...] }`; brug `[]`, hvis der ikke er strukturerede kilder.
9. Direkte citater og personlige erfaringer skal være verificerbare og gengives loyalt i deres dokumenterede kontekst.
10. Alle artikler skal altid have et relevant hero. **Redaktionel relevans kommer før bekvemmelighed og generiske fallback-motiver.** Vælg først et billede af historiens centrale person eller konkrete begivenhed, derefter et direkte relevant sted/genstand/miljø, derefter et tydeligt motiv der visualiserer historiens centrale konsekvens. Generiske flag, institutionsfacader, landskaber og andre brede symbolbilleder er sidste udvej. Heroen må ikke vildlede, og AI-billeder må ikke fremstille virkelige personer eller konkrete virkelige hændelser som dokumentariske fotografier. **Alle rettigheds-, arkiverings-, hosting- og krediteringskrav følger udelukkende `docs/media-library.md`; nye heros må ikke hotlinkes uden om det flow.**
11. **Ingen to samtidigt synlige forsideartikler må bruge det samme underliggende hero-billede.** Før publicering sammenlignes først `hero_media_id`/asset-identitet, når den findes, og ellers en normaliseret `hero_url`, hvor resize-, quality- og formatparametre ignoreres. Ved konflikt beholder den højere prioriterede/allerede synlige artikel sit hero, og den nye artikel skal vælge et andet relevant og lovligt hero. Artiklen må aldrig stå uden hero.
12. Stop research, når centrale påstande og væsentlige forbehold er tilstrækkeligt dokumenteret. Ekstra citater, ekstra kilder, SEO-finjustering og ekstern live-verifikation er ikke i sig selv publiceringsgates.
13. **HÅRD REGEL – forklar ikke-alment kendte egenavne ved første omtale.** Første gang en udenlandsk eller på anden måde ikke-alment kendt person, organisation, virksomhed, institution, politisk bevægelse eller et parti nævnes, skal læseren straks have en kort naturlig forklaring på typisk **1–3 ord**, når en almindelig dansk læser ikke med rimelighed kan forventes at kende navnet eller dets rolle. Forklaringen placeres umiddelbart før eller efter navnet og må ikke udskydes til senere i artiklen. Eksempler: `det indvandringskritiske parti Vox`, `regeringspartiet PSOE`, `det konservative PP`, `EU's grænseagentur Frontex`. Derefter kan navnet stå alene. Velkendte navne og steder behøver ikke kunstige forklaringer. Reglen gælder i hele artiklen, ikke kun de første afsnit.
14. **Udenlandske pengebeløb skal gøres forståelige i danske kroner.** Når en artikel nævner et beløb i en udenlandsk valuta, skal den samtidig eller først angive en rimeligt afrundet værdi i DKK efter en aktuel eller relevant historisk kurs. Rubrik og `SAGEN KORT` skal som udgangspunkt bruge danske kroner, når det gør historien mere forståelig for danske læsere. Første gang et centralt beløb optræder i brødteksten, kan originalvalutaen med fordel bevares i parentes efter DKK-beløbet, fx `628 millioner kroner (72 millioner pund)`, når originalvalutaen har journalistisk betydning.
15. **Ingen næsten-identiske historier inden for 36 timer.** Før valg og publicering skal journalisten sammenligne den foreslåede historie med de seneste 36 timers publicerede artikler ud fra hovedbegivenhed, hovedfaktum, centrale personer/institutioner, tal, geografi og emner — ikke kun rubrikken. Hvis sagen allerede er dækket med samme væsentlige indhold, skal journalisten vælge en anden historie. En ny artikel om samme sag er kun tilladt, hvis der er sket en **væsentlig videreudvikling**, som i sig selv er stærk nok til at fortjene en plads på forsiden. En sådan opfølger skal kobles til den eksisterende sag via samme `story_cluster_id` og det strukturerede `Læs også`-relationssystem, så den tidligere og den nye artikel peger på hinanden. Små justeringer, nye formuleringer, en ny kilde uden nyt hovedfaktum eller kosmetisk ændrede tal er ikke tilstrækkeligt til en ny artikel.
16. **Alle artikler skal udvikles med ekstremt højt delingspotentiale som et selvstændigt redaktionelt mål.** Delbarhed skal tænkes ind allerede ved valg af vinkel og derefter konsekvent i **hero, rubrik, manchet, `SAGEN KORT`, citater, tal, artikelstruktur og afslutning**. Artiklen skal så vidt muligt have mindst én tydelig følelsesmæssig motor — fx overraskelse, indignation, bekymring, fascination, håb eller genkendelse — samt mindst ét mindeværdigt faktum, tal, citat eller konkret menneskelig konsekvens, som læseren spontant får lyst til at sende videre. Heroen skal så vidt muligt visualisere historiens centrale konflikt, person, konsekvens eller overraskelse frem for blot emnet. Rubrikken skal fremhæve historiens stærkeste dokumenterede konflikt, overraskelse, citat eller konsekvens; manchetten skal øge betydningen og må ikke blot gentage rubrikken; `SAGEN KORT` skal prioritere de to mest slagkraftige og forskellige hovedfakta; brødteksten skal løbende levere konkrete, delbare øjeblikke gennem stærke tal, citater, kontraster, menneskelige konsekvenser eller nye afsløringer. Ved øjenvidne- og menneskelige konsekvenshistorier skal et stærkt verificeret citat meget gerne bæres op i rubrikken, når det er journalistisk dækkende. Før publicering skal journalisten kunne færdiggøre sætningen **"Jeg sender dig den her, fordi …"** med en klar, konkret grund. Delingspotentiale må **aldrig** opnås ved overdrivelse, faktuel fordrejning, udeladelse af afgørende forbehold eller clickbait, der lover mere end dokumentationen bærer.

## Journalistens eget slut-QA

For alle artikler, inklusive breaking og direkte chat-publicering, bruger den samme ChatGPT-journalist den eksisterende 2-minutters prepublication-buffer til **ét frisk genlæs** af det færdige udkast, mens artiklen endnu ikke er synlig.

- Ret kun sikre fejl i rubrik, manchet, sprog, tegnsætning, gentagelser, markdown, `SAGEN KORT`, links og åbenlyse metadatafejl.
- Kontrollér eksplicit, at `body_markdown` ikke indeholder en manuel `Kilder`-sektion, når `source_metadata` skal rendere den strukturerede kildeliste nederst.
- Kontrollér, at `source_metadata` har det kanoniske top-level array-format før publicering.
- Kontrollér, at artiklen ikke dublerer en publiceret artikel fra de seneste 36 timer. Hvis det er en legitim opfølger på en væsentlig videreudvikling, skal samme `story_cluster_id` og gensidige `Læs også`-relationer være sat før release.
- Lav en **første-omtale-kontrol i hele artiklen**: Hver ikke-alment kendt person, organisation, virksomhed, institution, bevægelse og hvert parti skal forklares kort ved første omtale, normalt med 1–3 ord. Det gælder også navne, som først optræder langt nede i artiklen. Ret fx `Vox` til `det indvandringskritiske parti Vox`, `PSOE` til `regeringspartiet PSOE` og `PP` til `det konservative PP` første gang de forekommer. Gentag ikke forklaringen ved senere omtaler.
- Kontrollér, at udenlandske pengebeløb er oversat til forståelige DKK-beløb, og at originalvalutaen bevares første gang, når den er journalistisk relevant.
- Kontrollér, at heroen er specifik for historiens person, begivenhed, sted eller centrale konsekvens; et generisk flag/symbol må kun stå tilbage som reel sidste udvej.
- Kontrollér, at heroen er ingested og rettighedsgodkendt efter `docs/media-library.md`; nye artikler må ikke publiceres med et eksternt hotlink som hero.
- Kontrollér, at heroen ikke allerede bruges af en anden samtidigt synlig forsideartikel efter den fælles hero-identitetsregel.
- Lav en **delbarhedskontrol**: Har artiklen en klar følelsesmæssig motor, et stærkt visuelt greb, mindst ét mindeværdigt faktum/citat/kontrast og en tydelig grund til, at en læser ville sende den videre? Hvis et af disse led åbenlyst kan styrkes uden at ændre fakta eller vinkel, skal det rettes før release.
- Bevar journalistisk vinkel, dokumenterede fakta, evidensvurdering og citaters mening. Slut-QA er korrektur, ikke en ny redaktionel omskrivning.
- Opgavespecifikke policies kan kræve ekstra kontrol af deres egne data, fx `source_metadata` for Viden/Liv eller story-cluster-relationer for leadpakker.
- Slut-QA må aldrig forlænge `qa_release_at` eller blokere release. Hvis journalisten ikke når kontrollen, publiceres artiklen stadig ved den tekniske deadline.
- Automationsprompter skal blot henvise til dette slut-QA; de må ikke kopiere checklisten.

## Drift for autonome journalister

- Publicér gennem det aktive Supabase/CMS-flow; omskriv aldrig forsiden som rå HTML.
- Følg den aktive tekniske publiceringslogik i `docs/v4-spec.md` og Supabase. Automationsprompter skal ikke genimplementere publiceringsbuffer, hero-fallback eller teknisk QA i tekst.
- Supabase `v4_public_articles` er den autoritative første kontrol efter release. Ekstern webåbning er sekundær diagnostik.
- En enkelt ikke-kritisk fejl må ikke få en journalist til at deaktivere sig selv.
- Ved en reel kørselsfejl: log fejlen hvis muligt og afslut kørslen; ændr ikke tidsplanen eller deaktiver automationen.

Målet er: **én regel, én ejer, én autoritativ implementering**.