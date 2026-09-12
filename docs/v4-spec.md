# Morgentidende v4 – gældende produkt- og driftsspecifikation

Denne fil ejer produkt-, frontend-, CMS-, publicerings- og driftsregler. Fælles journalistiske artikelkrav ligger i `docs/editorial-core.md`; nyhedsprofilen ligger i `docs/news-editorial-profile-and-discovery.md`; Viden/Liv-regler ligger i `docs/magazine-editorial-policy.md`.

Historiske løsninger, tidligere designversioner, deaktiverede automations og udgåede forsøg hører hjemme i Git-historikken eller audit-loggen og er ikke aktive sandhedskilder.

## Arkitektur
- ChatGPT er den redaktionelle motor.
- Supabase er CMS/database for artikler, scheduling, relationer, QA-kø og versionshistorik.
- Cloudflare driver frontend/deployment.
- Frontend læser publicerede data fra CMS; artikler må ikke publiceres ved at omskrive forsiden som rå HTML.
- Tekniske lag og publiceringsgates skal holdes små, stabile og uden parallel legacy-logik.

## Redaktionel drift
- De aktive ChatGPT-Opgaver definerer den aktuelle udgivelsesrytme. Denne specifikation må ikke indføre en konkurrerende dagskvote eller få en planlagt normal kørsel til at springe publicering over.
- Breaking og meget store nyheder kan publiceres straks. Ikke-breaking artikler bruger den aktive korte, fail-open prepublication-QA-buffer.
- Artikler kan også bestilles, skrives og publiceres direkte fra ChatGPT-chatten.
- Live-forsiden og ekstern URL-verifikation er diagnostik, ikke godkendelsesgates. Ved ekstern fejl bruges Supabase/CMS som autoritativ fallback.

## Hero og mediedrift
- Alle artikler skal have hero. Hero-flowet er fail-open: et mislykket billedforsøg udløser en sikker fallback frem for at blokere en ellers publicerbar artikel.
- **Midlertidig AI-hero-prøve:** Morgentidende bruger i en afgrænset prøveperiode markant flere AI-genererede heros for at gøre forsiden visuelt stærkere og mere delbar.
- AI-heros må være fotorealistiske, når motivet er fiktivt eller generisk og ikke kan forveksles med dokumentation af en konkret virkelig hændelse.
- AI-heros må ikke afbilde virkelige personer eller fremstille konkrete virkelige nyhedsbegivenheder som dokumentariske fotografier.
- AI-heros prioriteres især til Tema, Viden, Liv, Kommentar samt idé-, trend-, fremtids-, teknologi-, sundheds- og samfundshistorier.
- Rigtige fotos bruges fortsat, når en konkret person, hændelse eller dokumentarisk virkelighed er en væsentlig del af historiens journalistiske værdi.
- AI-genererede heros mærkes i metadata/credit som AI-illustration eller tilsvarende og må aldrig krediteres som et ægte foto.
- Eksterne hero-assets skal have dokumenteret lovlig brugsret og relevante metadata. No-attribution-licenser foretrækkes; hvis attribution kræves, krediteres korrekt.
- Effekten af AI-hero-prøven vurderes efter kort tid ud fra forsidens visuelle kvalitet, klik og delingspotentiale.

## Artikeldata og relationer
- Fælles artikelkrav, herunder `SAGEN KORT`, body-format, faktaverifikation, kildeliste, citater og linkregler, ejes af `docs/editorial-core.md`.
- I den aktive database er `articles.sagen_kort` en genereret læsekolonne fra `editorial_metadata.sagen_kort`. Writers må derfor skrive de to punkter til `editorial_metadata.sagen_kort` og må aldrig forsøge at INSERT/UPDATE den genererede `sagen_kort`-kolonne direkte.
- Relationer gemmes struktureret via `article_relations`/`story_cluster`.
- Direkte lead/opfølgning-relationer oprettes begge veje automatisk.
- Duplikater må ikke oprettes, og eksisterende relationer skal bevares.

## Rubrik-rendering
- Forsiderubrik og artikelrubrik kan være forskellige.
- Redaktionelle rubrikregler ejes af `docs/editorial-core.md` og eventuelle opgavespecifikke policies.
- Tofarvede forsiderubrikker bruges kun, når et stærkt kort citat eller en kort formulering egner sig.
- Accenttekst/citat i rubrik: 1–7 ord.
- På artikelsiden bruges én rubrikfarve.

## Kategorier
Aktive kategorier:
- Indland
- Udland
- Penge
- Kultur
- Tema
- Viden
- Liv
- Kommentar (ikke synlig i topmenu)

Kategorier bør være data/config frem for spredt hardcoding.

Viden og Liv er magasinsektioner:
- Egen blok på forsiden.
- Laptop: 4 artikler pr. magasinblok.
- Mobil: 3 artikler pr. magasinblok.
- Viden har et køligere science/teknologi-præg og større frihed til illustrationer/diagrammer.
- Liv har en varmere visuel retning med portrætter/stemningsfotos.
- På mobil skjules Viden og Liv i masthead-menuen; sektionerne og deres kategorisider består fortsat.

## Breaking og lead
- Breaking bruges kun til exceptionelt store hændelser.
- Breaking bruger gul/guld-accent, ikke alarmrød.
- Breaking vises som story-cluster med hovedhistorie og relevante opfølgere.
- En ny opfølgning kan forlænge breaking-status til 2 timer efter seneste opfølgning.
- Brugeren kan overstyre breaking-status fra chatten.
- Almindelig lead er præsentationsmetadata og er ikke bundet til kategorien Tema. En politisk eller almindelig nyhedsartikel kan være non-breaking lead i sin normale kategori.
- Tema-leads beholder Tema-labelen; andre non-breaking leads bruger den almindelige lead-præsentation uden at blive tvangsflyttet til Tema.
- Når en ny lead overtager, flyttes den seneste tidligere lead ned i det almindelige nyhedsflow. I de første 2 timer efter skiftet kan den prioriteres i den sekundære nyhedsrække; derefter følger den normal kronologi.

## Design
- Mørkeblå/navy/mørkelilla hovedpalette med diskret gul/guld accent.
- Det godkendte aktuelle sol-logo i `v4-frontend/public/morgentidende-sun.png` er det autoritative logoasset.
- Lys og mørk mode skal begge have tilstrækkelig kontrast.
- Søgning og Mørk/Lys-kontrol ligger øverst til højre; der er ikke læser-login i den aktive løsning.
- Forsiden bruger lige grids, ikke masonry/forskudte kort.
- Nyhedskort bruger konsistent hero-format/crop, som udgangspunkt 3:2.
- Rubrikker har kontrolleret højde/linjeantal, så rækker forbliver visuelt lige.
- Mastheaden har én aktiv to-lags implementation: øverste logo-/aktionsdel er sticky, mens nederste del ruller hurtigt og glidende væk ved scroll. Der må ikke eksistere parallel gammel collapse-logik.

## Artikelside
- Rubrik/manchet og brødtekst skal have behagelig, konsekvent læsebredde på laptop og mobil.
- “Læs også” må ikke duplikeres med samme artikel i de umiddelbare anbefalingsblokke.
- Under artiklen kan vises relevante nyheder, Viden, Liv og bredere discovery uden unødvendige gentagelser.

## Publicering
Statusser:
- `draft`
- `scheduled`
- `published`
- `unpublished`

- `publish_at` bestemmer, hvornår en scheduled artikel bliver synlig.
- Breaking/lead er metadata på artikler/story clusters og må ikke kobles unødvendigt til kategori.
- `autopublish_enabled` er globalt nødstop for autonom publicering og bruges kun ved systemiske fejl, fx gentagne publiceringsfejl, dubletstorm, auth/CMS-fejl eller ødelagte data.
- Ikke-breaking artikler har en 2-minutters prepublication-QA-buffer. `qa_release_at` er en hård release-deadline: journalistens slut-QA, teknisk QA-warning, timeout, 504 eller manglende ekstern live-verifikation må ikke forlænge bufferen.
- Redaktionelt slut-QA i bufferen udføres af den samme ChatGPT-journalist efter reglerne i `docs/editorial-core.md`.
- Supabase `article-qa` er kun et deterministisk teknisk sikkerhedsnet. Det må ikke kalde betalte eksterne AI/API-tjenester. Det må automatisk udføre sikre tekniske fixes, fx fjerne almindelige eksterne brødtekstlinks og erstatte et brudt hero med fallback.
- Supabase `v4_public_articles` er den autoritative første kontrol efter release. Ekstern åbning/crawl af URL er sekundær diagnostik og må højst give warning.
- Den aktive Supabase-trigger/Edge Function-implementering ejer den tekniske QA-mekanik. Automationsprompter skal kun henvise til den centrale slut-QA-regel og må ikke kopiere dens checkliste eller genimplementere den tekniske QA.

## Validering
Hårde stop holdes på et minimum:
1. Fix automatisk.
2. Fallback automatisk.
3. Publicér.
4. Blokér kun ved reel teknisk, juridisk eller sikkerhedsmæssig risiko.

Legitime hårde stop omfatter fx:
- tom artikeltekst
- ugyldig database-record, som ikke kan repareres automatisk
- dokumenteret ulovlig eller vildledende mediebrug uden sikker fallback
- ugyldig publiceringstid, som ikke kan normaliseres automatisk
- auth-/sikkerhedsfejl, der gør en write-operation uforsvarlig eller umulig

Følgende er ikke publiceringsgates og håndteres som warning/fix/fallback: ekstern live-verifikation, frontpage-read, ekstra nice-to-have-kilder/citater efter tilstrækkelig dokumentation, SEO-finjustering, relationer, social distribution, logging og ikke-kritiske metadatafejl.

## Sikkerhed og anonymitet
- Brugerens identitet må ikke eksponeres i repo, commits, metadata, domæne-setup eller offentlige systemer.
- Ingen secrets i det offentlige GitHub-repo.
- Supabase service-role key, database-password, Cloudflare tokens mv. ligger kun i sikre secret stores/environment variables.
- GitHub bruger noreply-email.
- RLS er aktivt på Supabase-tabeller.
- Offentlige læsere får kun adgang til eksplicitte `v4_public_*` views.
- CMS/admin-write sker server-side med mindst mulige rettigheder.
- Artikelhistorik/versionering bevares.

## Udvikling og QA
- Alle designændringer kontrolleres efter implementering på både mobil og laptop.
- Responsive fejl løses ved kilden; generel overflow må ikke bruges som camouflage for en kendt layoutfejl.
- Når kode erstattes, fjernes tidligere overflødig, duplikeret eller død kode i samme ændring.
- Historik bevares i commits/audit-log, ikke som aktiv legacy-kode.
- Én tydelig aktiv implementation foretrækkes frem for parallelle gamle og nye spor.

## Modelregel for redaktionelt arbejde
- Autonom research, artikelskrivning, Kommentar, redaktionel slutbearbejdning og udgivelse bruger den mest intelligente faktisk tilgængelige model/runtime på det pågældende tidspunkt.
- Høj eller højeste relevante reasoning-indstilling bruges, når platformen giver mulighed for det.
- Der må ikke automatisk nedgraderes til en svagere model alene for at spare ressourcer.
- Modelvalg eller manglende mulighed for at verificere et bestemt modelniveau må ikke være en publiceringsgate. Hvis den foretrukne runtime ikke kan vælges, bruges den bedste faktisk tilgængelige runtime.
- CMS-indstillingen `editorial_model_policy` er et driftsmirror af denne regel; denne fil er regel-ejer.