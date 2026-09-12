# Morgentidende – fælles redaktionel kerne

Denne fil ejer kun de regler, som gælder på tværs af autonom artikelproduktion. Opgavespecifikke regler må ikke kopiere denne kerne; de skal kun beskrive deres egen opgave.

## Autoritet

- **Fælles artikelkrav:** denne fil.
- **Nyhedsprofil, politiske skalaer, discovery og bredt nyhedsmix:** `docs/news-editorial-profile-and-discovery.md`.
- **Viden og Liv:** `docs/magazine-editorial-policy.md`.
- **Produkt, frontend, CMS, publicering, QA-buffer og teknisk drift:** `docs/v4-spec.md` og den aktive Supabase-implementering.
- Historiske filer, migrationshistorik og deaktiverede automations er ikke aktuelle regelsæt.

## Fælles artikelkrav

1. Verificér centrale faktuelle påstande med troværdige kilder; brug primærkilder, når de er relevante og tilgængelige. Discovery-, blog- og opinionskilder må bruges til at finde spor, men ikke som erstatning for dokumentation af centrale fakta.
2. Opfind aldrig fakta, personer, citater, erfaringer eller kausalitet. Skeln tydeligt mellem dokumenterede fakta, påstande, analyse og kommentar.
3. Skriv flydende, klart dansk. Rubrik og manchet skal være præcise og må ikke love mere, end dokumentationen bærer. Manchetten er højst 2 sætninger og cirka 20 ord.
4. `SAGEN KORT` består altid af præcis 2 tydeligt forskellige hovedpointer.
5. `body_markdown` må ikke begynde med H1 eller gentage rubrikken. Et almindeligt afsnit må ikke begynde direkte med `tal.` hvis Markdown kan fejlfortolke det som en nummereret liste.
6. Almindelige eksterne hyperlinks må ikke stå i brødteksten. Eksterne kilder vises i den diskrete kildeliste nederst. Interne anbefalinger bruger det strukturerede `Læs også`-relationssystem.
7. Direkte citater og personlige erfaringer skal være verificerbare og gengives loyalt i deres dokumenterede kontekst.
8. Alle artikler skal have et relevant hero. Mediebrug skal være lovlig og må ikke vildlede. Et mislykket hero-forsøg bruger en sikker fallback i stedet for at blokere en ellers publicerbar artikel. AI-billeder må ikke fremstille virkelige personer eller konkrete virkelige hændelser som dokumentariske fotografier.
9. Stop research, når centrale påstande og væsentlige forbehold er tilstrækkeligt dokumenteret. Ekstra citater, ekstra kilder, SEO-finjustering og ekstern live-verifikation er ikke i sig selv publiceringsgates.

## Drift for autonome journalister

- Publicér gennem det aktive Supabase/CMS-flow; omskriv aldrig forsiden som rå HTML.
- Følg den aktive tekniske publiceringslogik i `docs/v4-spec.md` og Supabase. Automationsprompter skal ikke genimplementere QA-buffer, hero-fallback eller andre tekniske mekanismer i tekst.
- Supabase `v4_public_articles` er den autoritative første kontrol efter release. Ekstern webåbning er sekundær diagnostik.
- En enkelt ikke-kritisk fejl må ikke få en journalist til at deaktivere sig selv.
- Ved en reel kørselsfejl: log fejlen hvis muligt og afslut kørslen; ændr ikke tidsplanen eller deaktiver automationen.

Målet er: **én regel, én ejer, én autoritativ implementering**.