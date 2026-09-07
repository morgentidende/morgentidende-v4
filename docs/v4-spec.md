# Morgentidende v4 – produkt- og arkitekturspecifikation

## Grundprincip
Morgentidende v4 skal være markant simplere end v3. ChatGPT er den redaktionelle motor. CMS, database, scheduler og frontend skal være små, stabile og tekniske lag uden unødvendige redaktionelle gates.

## Redaktionel motor
- 3–4 autonome redaktionskørsler dagligt.
- Samlet mål: ca. 5–10 nye artikler pr. døgn.
- En kørsel kan producere flere artikler og planlægge dem til forskellige tidspunkter.
- Breaking og meget store nyheder kan publiceres straks.
- Andre artikler kan schedules 15 minutter eller flere timer frem.
- Artikler kan også oprettes direkte fra ChatGPT-chatten, enten som research + skriv + publicér eller som fælles kladde, der efterfølgende publiceres/schedules.
- ChatGPT skal kunne fejlfinde publicering, frontend, metadata, scheduling og relateringer via logs/health-data.

## Artikelkrav
- Alle artikler skal have hero.
- Rigtige fotos er førstevalg til nyheder.
- Hero skal have dokumenteret lovlig brugsret og metadata for kilde/licens/credit internt, også når kreditering ikke vises for læseren.
- Ved nye hero-fotos prioriteres og bruges som udgangspunkt kun billeder med licens/vilkår, hvor offentlig attribution ikke er et krav, fx CC0/public domain eller tjenester med en verificeret licens uden krediteringskrav.
- Billeder med BY-/attributionskrav, fx CC BY og CC BY-SA, må kun bruges, hvis et passende no-attribution-alternativ ikke med rimelighed kan findes; hvis de bruges, skal den krævede kreditering vises korrekt.
- Unsplash-billeder må kun bruges uden synlig kreditering, når brugen sker under selve Unsplash-licensen; hvis billedet leveres via Unsplash API, skal API-vilkårenes krediteringskrav følges.
- Brugeren kan foreslå eller levere URL til hero; den skal verificeres før brug.
- Hvis foreslået hero ikke kan verificeres, findes automatisk et lovligt alternativ i stedet for at afvise artiklen.
- Forklarende AI-grafik kan bruges inde i artikler og efter behov som hero i især Viden.
- Manchet: højst 2 sætninger og cirka 20 ord samlet.
- Almindelige nyheder og Kommentarer må ikke slutte med en særskilt kildeliste. Kilder skal i stedet indarbejdes naturligt i brødteksten med formuleringer som “ifølge ...”, “fremgår det af ...”, “oplyser ...” eller tilsvarende, når det er journalistisk naturligt.
- Forskningsartikler, typisk i Viden og Liv, skal derimod have en tydelig kildesektion nederst med de centrale studier, papers eller andre forskningskilder.
- Artikler bygget på personlige erfaringer og øjenvidneberetninger skal indeholde direkte, verificerbare citater fra de omtalte personer, når sådanne citater findes i troværdige kilder. Det er ikke tilstrækkeligt kun at parafrasere deres oplevelser. Citater må ikke opfindes, sammenstykkes eller løsnes fra den dokumenterede kontekst, og kilden skal nævnes naturligt i brødteksten.
- Ved artikler med flere personlige cases eller øjenvidner bør flere af de centrale personer komme direkte til orde med egne citater, så teksten ikke reducerer deres erfaringer til journalistens referat alene.
- Læs også vises kun inde i artikelteksten ved direkte relation til samme sag.
- Relaterede artikler gemmes struktureret via article_relations/story_cluster.
- Når en Kommentar eller anden egentlig opfølgning kobles direkte til en lead-/hovedartikel, skal relationen oprettes automatisk begge veje, så begge artikler viser hinanden i Læs også. Duplikater må ikke oprettes, og eksisterende relationer skal bevares.

## Rubrikker
- Forsiderubrik og artikelrubrik kan være forskellige.
- Forsiderubrikker må være moderat nysgerrighedsskabende/click-drevne, men må ikke love mere end artiklen leverer.
- Rubrikken må gerne tilbageholde konklusionen, men ikke skjule emnet.
- Alle forsidekort kan i princippet bruge tofarvet rubrik, men kun når et stærkt kort citat/formulering egner sig.
- Accenttekst/citat i rubrik: 1–7 ord.
- Inde i artiklen bruges kun én rubrikfarve.

## Kategorier og magasiner
Aktuel startkonfiguration:
- Indland
- Udland
- Penge
- Kultur
- Viden
- Liv
- Kommentar (ikke synlig i topmenu)

Kategorier skal være data/config, ikke hardcoded, så de kan ændres senere.

Viden og Liv er egentlige magasinsektioner:
- Begge får egen elegant blok ca. midt på forsiden.
- Laptop: 4 artikler pr. magasinblok.
- Mobil: 3 artikler pr. magasinblok.
- Viden: lidt mere maskulint/køligt science/teknologi-præg og større frihed til illustrationer/diagrammer.
- Liv: lidt varmere/feminin farveretning og stærke portrætter/stemningsfotos.
- Begge skal stadig tydeligt høre til Morgentidendes samlede brand.

Fremtidig Debat:
- Kan tilføjes senere uden redesign.
- Egen blok midt på forsiden.
- Kronikørens/forfatterens portræt er normalt indlæggets hero.
- Navn og titel skal være tydelige, så Debat ikke forveksles med nyhedsstof.

## Breaking og lead
### Breaking
- Kun til exceptionelt store hændelser, fx store katastrofer, terror, krig/angreb eller tilsvarende store chokhistorier.
- Elegant gul/guld-accent, ikke klassisk skrigende alarmrød.
- Breaking vises som en samlet story-cluster-kasse med hovedhistorie og plads til opfølgere.
- Hver ny opfølger forlænger breaking-status til 2 timer efter seneste opfølger.
- Brugeren kan altid overstyre breaking-status fra chatten.
- Ved ny større breaking kan den nye historie overtage breaking-pladsen.

### Almindelig lead
- Egen lead-kasse med hovedhistorie og relevante opfølgere.
- Visuelt roligere end breaking og inden for navy/mørkelilla brandet.

## Forside-design
- Samme overordnede designretning som v3.
- Mørkeblå/navy/mørkelilla hovedpalette.
- Diskret gul/guld accent til kategorier, labels og detaljer.
- v2-sol-logo kombineres med Morgentidende-ordmærket fra v3; ordmærkets serif må være lidt mere elegant.
- Alt skal fungere med tilstrækkelig kontrast i både lys og mørk mode.
- Mørk/lys-skydeknap øverst til højre sammen med Login.
- Login er til læsere og skal senere kunne udvides til betalt abonnement.
- Forsiden må ikke bruge masonry/forskudte kort. Artikler står i pæne, lige grids.
- Nyhedskort bruger konsistent hero-format/crop, som udgangspunkt 3:2.
- Rubrikker får kontrolleret højde/linjeantal for at bevare lige rækker.

## Artikelside
På laptop skal rubrik/manchet-bredde og brødtekst-bredde matche v3.

Under artiklen:
1. 2 rækker × 3 spalter nyheder, primært stærkt relateret/relevant for den læste artikel.
2. Magasin Viden.
3. Magasin Liv.
4. 2 rækker × 4 spalter nyheder, mere discovery/nyere/stærke historier på tværs af avisen.

Den samme artikel bør ikke gentages unødigt i Læs også og de umiddelbare anbefalingsblokke.

## Publiceringsmodel
Statusser:
- draft
- scheduled
- published
- unpublished

ChatGPT skriver til CMS/databasen; frontend læser publicerede artikler. ChatGPT skal ikke manipulere forsiden som rå HTML ved hver artikel.

Scheduler:
- `publish_at` bestemmer hvornår en scheduled artikel bliver synlig.
- Breaking/lead er metadata på artikler/story clusters.
- `autopublish_enabled` fungerer som globalt nødstop for autonom publicering.

Nødstop skal kun bruges ved systemiske fejl, fx gentagne publiceringsfejl, dubletstorm, auth-/CMS-fejl, ødelagte data eller gentagne hero/licens-fejl. En enkelt dårlig artikel skal normalt kun stoppes individuelt.

## Validering
Hårde stop skal holdes på et minimum.

Princippet er:
1. Fix automatisk.
2. Fallback automatisk.
3. Publicér.
4. Blokér kun ved reel teknisk, juridisk eller sikkerhedsmæssig risiko.

Eksempler på legitime hårde stop:
- tom artikeltekst
- ugyldig database-record
- intet hero efter automatiske fallback-forsøg
- billedrettigheder kan ikke dokumenteres og intet alternativ findes
- ugyldig publiceringstid
- auth-/sikkerhedsfejl

Almindelige redaktionelle kvalitetsproblemer skal være warnings/fixes, ikke gates.

## Sikkerhed og anonymitet
- Brugerens identitet må ikke eksponeres i repo, commits, metadata, domæne-setup eller offentlige systemer.
- Ingen secrets i det offentlige GitHub-repo.
- Supabase service-role key, database-password, Cloudflare tokens mv. må kun ligge i sikre secret stores/environment variables.
- GitHub bruger noreply-email.
- RLS er aktivt på Supabase-tabeller.
- Offentlige læsere får kun adgang til eksplicitte v4-public views.
- CMS/admin-write sker server-side med mindst mulige rettigheder.
- Artikelhistorik/versionering bevares.

## Udviklings- og QA-regler
- Alle designændringer skal efter implementering kontrolleres i både mobil- og laptoplayout. En ændring regnes ikke som visuelt færdig, før begge formater er gennemgået.
- Responsive fejl må ikke blot skjules med generel overflow, hvis den underliggende layoutfejl kan fjernes; kilden til overflow skal rettes.
- Når kode ændres eller erstattes, skal tidligere overflødig, duplikeret eller død kode fjernes i samme omgang, så v4 ikke langsomt ophober legacy-kode.
- Historik må gerne bevares i commits, audit-log eller dokumentation; den gamle kode behøver ikke blive liggende aktivt i produktionskoden for historiens skyld.
- Ved refaktorering foretrækkes én tydelig aktiv implementation frem for parallelle gamle og nye spor.

## Permanent modelregel for redaktionelt arbejde
- Ved autonom research, artikelskrivning, kommentarer, redaktionel slutbearbejdning og udgivelse bruges altid den mest intelligente tilgængelige model/runtime på det pågældende tidspunkt, eksempelvis GPT-5.6 High, Astra eller en senere model, der vurderes stærkere.
- Brug høj eller den højeste relevante reasoning-indstilling, når platformen giver mulighed for det. Kvalitet prioriteres over pris, tokenforbrug og latenstid i redaktionelt arbejde.
- Reglen gælder også artikler og kommentarer, som brugeren bestiller direkte i chatten og beder ChatGPT skrive og udgive.
- Der må ikke automatisk nedgraderes til en svagere model for at spare tid, tokens eller omkostninger. Hvis det krævede modelniveau ikke kan vælges eller verificeres, skal det oplyses åbent; der må ikke påstås en modelindstilling, som ikke er verificeret.
- Den redaktionelle motor skal læse denne regel og CMS-indstillingen `editorial_model_policy` før autonomt arbejde. Modelvalg skal håndteres i den kørende agents modelkonfiguration; en tekstregel eller databaseindstilling alene ændrer ikke runtime-modellen.
