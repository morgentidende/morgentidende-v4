# Morgentidende v4 – gældende produkt- og redaktionsspecifikation

Denne fil indeholder kun de regler, der er gældende nu. Historiske løsninger, tidligere designversioner og udgåede forsøg hører hjemme i Git-historikken eller audit-loggen – ikke som aktive regler i produktet.

## Arkitektur
- ChatGPT er den redaktionelle motor.
- Supabase er CMS/database for artikler, scheduling, relationer, læser-login og versionshistorik.
- Cloudflare driver frontend/deployment.
- Frontend læser publicerede data fra CMS; artikler må ikke publiceres ved at omskrive forsiden som rå HTML.
- Redaktionelle gates skal holdes på et minimum. Tekniske lag skal være små, stabile og uden parallel legacy-logik.

## Redaktionel drift
- 3–4 autonome redaktionskørsler dagligt med samlet mål om ca. 5–10 nye artikler pr. døgn.
- Breaking og meget store nyheder kan publiceres straks. Andre artikler kan schedules.
- Artikler kan også bestilles, skrives og publiceres direkte fra ChatGPT-chatten.
- ChatGPT skal kunne fejlfinde publicering, frontend, metadata, scheduling og relationer via logs/health-data.

## Artikelkrav
- Alle artikler skal have hero.
- **Midlertidig AI-hero-prøve:** Morgentidende skruer i en afgrænset prøveperiode markant op for AI-genererede heros for at gøre forsiden mere visuelt attraktiv og mere delbar.
- AI-heros må gerne være fotorealistiske, når motivet er fiktivt eller generisk og ikke kan forveksles med dokumentation af en konkret virkelig hændelse.
- AI-heros må ikke afbilde virkelige personer. Hvis en artikel handler om en konkret virkelig person, bruges et lovligt rigtigt foto, neutral grafik eller et konceptuelt AI-motiv uden personen.
- AI-heros må ikke fremstille en konkret virkelig nyhedsbegivenhed som et fotografi, der kunne opfattes som dokumentation fra stedet.
- AI-heros prioriteres især til Tema, Viden, Liv, Kommentar samt idé-, trend-, fremtids-, teknologi-, sundheds- og samfundshistorier, hvor et stærkt konceptuelt motiv kan løfte forsiden.
- Rigtige fotos bruges fortsat, når den konkrete person, hændelse eller dokumentariske virkelighed er en væsentlig del af historiens journalistiske værdi.
- AI-genererede heros mærkes i metadata/credit som AI-illustration eller tilsvarende og må aldrig krediteres som et ægte foto.
- Effekten af prøveperioden vurderes efter kort tid ud fra forsidens visuelle kvalitet, klik og delingspotentiale; derefter kan reglen justeres eller ophæves.
- Hero skal have dokumenteret lovlig brugsret og interne metadata for kilde, licens og credit.
- No-attribution-licenser foretrækkes. Billeder med obligatorisk attribution bruges kun, når et passende alternativ ikke med rimelighed kan findes, og krediteres da korrekt.
- Hvis et foreslået hero ikke kan verificeres, findes automatisk et lovligt alternativ.
- Manchet: højst 2 sætninger og cirka 20 ord samlet.
- **Markdown-regel:** Et almindeligt brødtekstafsnit må ikke begynde direkte med mønstret `tal.` (fx `11. september ...`), fordi markdown kan fortolke det som en nummereret liste og ændre tallet ved rendering. Omskriv i stedet naturligt, fx `Den 11. september ...`, medmindre der faktisk ønskes en nummereret liste.
- Almindelige nyheder og Kommentarer må ikke slutte med en særskilt kildeliste. Kilder indarbejdes naturligt i brødteksten.
- Forskningsartikler i Viden og Liv skal have en kort kildesektion nederst med centrale studier/papers og klikbare links.
- Artikler bygget på personlige erfaringer eller øjenvidner skal bruge verificerbare direkte citater, når de findes. Citater må aldrig opfindes eller løsnes fra dokumenteret kontekst.
- Personlige beretninger og nyhedsartikler må ikke slutte moraliserende eller fortælle læseren, hvad vedkommende bør konkludere.
- På politiske emner bruges data-first: relevante tal, primærkilder, citater, historik og væsentlige modstående oplysninger. Fakta holdes adskilt fra analyse og kommentar.
- Nyheds- og analyseartikler må ikke styre læseren mod en bestemt ideologisk eller moralsk konklusion gennem formanende sprog eller selektiv framing.
- Kunstig balance skal undgås. Modargumenter medtages, når de er faktuelt eller journalistisk relevante.
- Kommentarstof må have tydelig holdning, men skal markeres som Kommentar og holde vurderinger adskilt fra dokumenterede fakta.

## Relaterede artikler
- “Læs også” inde i brødteksten bruges kun ved direkte relation til samme sag.
- Relationer gemmes struktureret via `article_relations`/`story_cluster`.
- Direkte lead/opfølgning-relationer oprettes begge veje automatisk.
- Duplikater må ikke oprettes, og eksisterende relationer skal bevares.

## Rubrikker
- Forsiderubrik og artikelrubrik kan være forskellige.
- Hovedreglen er **faktum først**: Når historien rummer et stærkt, verificeret faktum, tal, citat eller en konkret konsekvens, skal rubrikken som udgangspunkt sige det tydeligt i stedet for at skjule pointen for at lokke et klik frem.
- Det mest opsigtsvækkende dokumenterede faktum bør stå tidligt i rubrikken, især på mobil og i deling på sociale platforme.
- Rubrikker skal optimeres til deling: læseren skal kunne forstå, hvorfor historien er interessant, vredesvækkende, glædelig, overraskende eller nyttig allerede fra rubrikken.
- Nysgerrighed må bruges, når selve afsløringen reelt bliver bedre af suspense, men den må ikke erstatte et stærkere konkret faktum, der allerede kan siges præcist.
- Praktisk mål: cirka 70 % faktum-rubrikker, 20 % stærke citat-rubrikker og højst cirka 10 % rene nysgerrighedsrubrikker. Fordelingen er en redaktionel rettesnor, ikke en mekanisk kvote.
- Rubrikker må aldrig love mere end dokumentationen kan bære, overdrive sikkerhed eller skære afgørende forbehold væk.
- Tofarvede forsiderubrikker bruges kun, når et stærkt kort citat eller en formulering egner sig.
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
- Almindelig lead vises i egen roligere lead-kasse med relevante opfølgere.
- Når en ny lead overtager, flyttes den seneste tidligere lead ned i det almindelige nyhedsflow. I de første 2 timer efter skiftet kan den prioriteres som første kort i den sekundære nyhedsrække og få større visuel vægt på desktop; derefter følger den normal kronologi.

## Design
- Mørkeblå/navy/mørkelilla hovedpalette med diskret gul/guld accent.
- Det godkendte aktuelle sol-logo i `v4-frontend/public/morgentidende-sun.png` er det autoritative logoasset.
- Lys og mørk mode skal begge have tilstrækkelig kontrast.
- Mørk/Lys-kontrol og Login ligger øverst til højre.
- Login er læser-login til konto- og læserfunktioner; adgang til journalistisk indhold må ikke gøres afhængig af betaling.
- Forsiden bruger lige grids, ikke masonry/forskudte kort.
- Nyhedskort bruger konsistent hero-format/crop, som udgangspunkt 3:2.
- Rubrikker har kontrolleret højde/linjeantal, så rækker forbliver visuelt lige.
- Mastheaden har én aktiv to-lags implementation: øverste logo-/aktionsdel er sticky, mens nederste del ruller hurtigt og glidende væk ved scroll. Der må ikke eksistere parallel gammel collapse-logik.

## Artikelside
- Rubrik/manchet og brødtekst skal have behagelig, konsekvent læsebredde på laptop og mobil.
- “Læs også” må ikke duplikeres med samme artikel i de umiddelbare anbefalingsblokke.
- Under artiklen kan vises relevante nyheder, Viden, Liv og bredere discovery, uden unødvendige gentagelser.

## Publicering
Statusser:
- `draft`
- `scheduled`
- `published`
- `unpublished`

- `publish_at` bestemmer, hvornår en scheduled artikel bliver synlig.
- Breaking/lead er metadata på artikler/story clusters.
- `autopublish_enabled` er globalt nødstop for autonom publicering.
- Nødstop bruges kun ved systemiske fejl, fx gentagne publiceringsfejl, dubletstorm, auth/CMS-fejl, ødelagte data eller gentagne hero/licens-fejl.

## Validering
Hårde stop holdes på et minimum:
1. Fix automatisk.
2. Fallback automatisk.
3. Publicér.
4. Blokér kun ved reel teknisk, juridisk eller sikkerhedsmæssig risiko.

Legitime hårde stop omfatter fx:
- tom artikeltekst
- ugyldig database-record
- intet hero efter automatiske fallback-forsøg
- udokumenterbare billedrettigheder uden brugbart alternativ
- ugyldig publiceringstid
- auth-/sikkerhedsfejl

Almindelige redaktionelle kvalitetsproblemer håndteres som warnings/fixes, ikke gates.

## Sikkerhed og anonymitet
- Brugerens identitet må ikke eksponeres i repo, commits, metadata, domæne-setup eller offentlige systemer.
- Ingen secrets i det offentlige GitHub-repo.
- Supabase service-role key, database-password, Cloudflare tokens mv. ligger kun i sikre secret stores/environment variables.
- GitHub bruger noreply-email.
- RLS er aktivt på Supabase-tabeller.
- Offentlige læsere får kun adgang til eksplicitte v4-public views.
- CMS/admin-write sker server-side med mindst mulige rettigheder.
- Artikelhistorik/versionering bevares.

## Udvikling og QA
- Alle designændringer kontrolleres efter implementering på både mobil og laptop.
- Responsive fejl løses ved kilden; generel overflow må ikke bruges som camouflage for en kendt layoutfejl.
- Når kode erstattes, fjernes den tidligere overflødige, duplikerede eller døde kode i samme ændring.
- Historik bevares i commits/audit-log, ikke som aktiv legacy-kode.
- Én tydelig aktiv implementation foretrækkes frem for parallelle gamle og nye spor.
- Regler, der er udgået eller erstattet, slettes fra den gældende specifikation i stedet for at stå som konkurrerende instruktioner.

## Modelregel for redaktionelt arbejde
- Autonom research, artikelskrivning, Kommentar, redaktionel slutbearbejdning og udgivelse bruger den mest intelligente faktisk tilgængelige model/runtime på det pågældende tidspunkt.
- Høj eller højeste relevante reasoning-indstilling bruges, når platformen giver mulighed for det. Kvalitet prioriteres over pris, tokenforbrug og latenstid.
- Der må ikke automatisk nedgraderes til en svagere model for at spare ressourcer.
- Hvis modelniveauet ikke kan vælges eller verificeres, må systemet ikke påstå en bestemt modelindstilling.
- Den redaktionelle motor læser denne regel og CMS-indstillingen `editorial_model_policy` før autonomt arbejde. Det faktiske modelvalg håndteres i den kørende agents runtime-konfiguration.
