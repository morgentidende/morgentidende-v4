# Morgentidende – fælles redaktionel kerne

Denne fil ejer kun de regler, som gælder på tværs af autonom artikelproduktion. Opgavespecifikke regler må ikke kopiere denne kerne; de skal kun beskrive deres egen opgave.

## Autoritet

- **Fælles artikelkrav og journalistens eget slut-QA:** denne fil.
- **Nyhedsprofil, politiske skalaer, discovery og bredt nyhedsmix:** `docs/news-editorial-profile-and-discovery.md`.
- **Viden og Liv:** `docs/magazine-editorial-policy.md`.
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
8. Almindelige eksterne hyperlinks må ikke stå i brødteksten. Eksterne kilder vises **kun én gang** i den strukturerede, klikbare kildeliste nederst, genereret fra `source_metadata`. Journalisten må derfor aldrig selv skrive en `Kilder`-overskrift eller manuel kildeliste i `body_markdown`. Interne anbefalinger bruger det strukturerede `Læs også`-relationssystem.
9. Direkte citater og personlige erfaringer skal være verificerbare og gengives loyalt i deres dokumenterede kontekst.
10. Alle artikler skal altid have et relevant hero. **Redaktionel relevans kommer før bekvemmelighed og generiske fallback-motiver.** Vælg først et lovligt billede af historiens centrale person eller konkrete begivenhed, derefter et direkte relevant sted/genstand/miljø, derefter et tydeligt motiv der visualiserer historiens centrale konsekvens (fx penge ved økonomihistorier). Generiske flag, institutionsfacader, landskaber og andre brede symbolbilleder er sidste udvej og må ikke vælges blot fordi de er nemme eller public-domain. Et hero skal gøre læseren klogere på netop denne historie, ikke blot signalere land eller emnekategori. Mediebrug skal være lovlig og må ikke vildlede. Et mislykket hero-forsøg bruger en sikker **relevant** fallback i stedet for at blokere en ellers publicerbar artikel. AI-billeder må ikke fremstille virkelige personer eller konkrete virkelige hændelser som dokumentariske fotografier.
11. **Ingen to samtidigt synlige forsideartikler må bruge det samme underliggende hero-billede.** Før publicering sammenlignes først `hero_media_id`/asset-identitet, når den findes, og ellers en normaliseret `hero_url`, hvor resize-, quality- og formatparametre ignoreres. Ved konflikt beholder den højere prioriterede/allerede synlige artikel sit hero, og den nye artikel skal vælge et andet relevant og lovligt hero. Artiklen må aldrig stå uden hero.
12. Stop research, når centrale påstande og væsentlige forbehold er tilstrækkeligt dokumenteret. Ekstra citater, ekstra kilder, SEO-finjustering og ekstern live-verifikation er ikke i sig selv publiceringsgates.

## Journalistens eget slut-QA

For ikke-breaking artikler bruger den samme ChatGPT-journalist den eksisterende korte prepublication-buffer til **ét frisk genlæs** af det færdige udkast, mens artiklen stadig er `scheduled`.

- Ret kun sikre fejl i rubrik, manchet, sprog, tegnsætning, gentagelser, markdown, `SAGEN KORT`, links og åbenlyse metadatafejl.
- Kontrollér eksplicit, at `body_markdown` ikke indeholder en manuel `Kilder`-sektion, når `source_metadata` skal rendere den strukturerede kildeliste nederst.
- Kontrollér, at heroen er specifik for historiens person, begivenhed, sted eller centrale konsekvens; et generisk flag/symbol må kun stå tilbage som reel sidste udvej.
- Kontrollér, at heroen ikke allerede bruges af en anden samtidigt synlig forsideartikel efter den fælles hero-identitetsregel.
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
