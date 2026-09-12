# Permanent magasinregel – Viden og Liv

Denne fil ejer kun de regler, der er særlige for Viden og Liv. Fælles artikelkrav ligger i `docs/editorial-core.md`; teknisk publicering og QA ligger i `docs/v4-spec.md` og den aktive Supabase-implementering.

## Hård afgrænsning

- Viden og Liv er apolitiske magasiner.
- De politiske Skala 1/2 og den nationalkonservative/libertære discovery-liste må ikke styre emnevalg, tone, kildevalg, argumentvægt, rubrik eller manchet i Viden/Liv.
- Politiske konsekvenser kan omtales, når de er nødvendige for at forstå emnet, men vinklen må ikke presses ind i avisens politiske profil.

## Redaktionel retning

- Artikler skal vælges og vinkles med ekstremt højt delingspotentiale gennem stærk nytteværdi, overraskende eller nye oplysninger, konkrete råd, følelsesmæssig relevans, identitetsrelevans, nysgerrighed eller tydelig konsekvens for læserens liv.
- Viden skal især gøre kompleks forskning, teknologi, naturvidenskab og fremtidstendenser forståelige, konkrete og samtaleværdige.
- Liv skal især gøre dokumenteret viden om sundhed, psykologi, relationer, privatøkonomi og livskvalitet praktisk anvendelig og delbar.
- Hold begge magasinblokke friske. Før emnevalg skal de seneste Viden- og Liv-artikler sammenlignes; når to kandidater er omtrent lige stærke, foretrækkes det magasin, der har været længst uden en ny artikel eller er tydeligt underrepræsenteret i de seneste udgivelser. Der må aldrig vælges en svagere artikel alene for at skabe matematisk balance.
- Korrekthed har forrang for delbarhed. Research skal dog stoppe, når centrale påstande og væsentlige forbehold er tilstrækkeligt dokumenteret.
- Researchbaserede magasinartikler skal gemme deres eksterne kilder i `source_metadata`, så den eksisterende kildeliste nederst kan renderes. Kilder må ikke indsættes som almindelige hyperlinks i brødteksten.

## Tal og forskning

- Led aktivt efter konkrete, meningsfulde tal, når kilderne giver dem, men brug dem selektivt. Som udgangspunkt er 2–4 centrale tal ofte nok.
- Foretræk læsevenlige tal som procenter, absolutte risici, antal gange, år, kroner eller tydelige før/efter-sammenligninger. Undgå tekniske effektmål, medmindre de er nødvendige og forklares konkret.
- Når relative og absolutte risici begge er relevante og ændrer forståelsen væsentligt, bør begge oplyses. Tal må ikke cherry-pickes.
- Ved sundhed, behandling og kosttilskud må artiklen gerne fokusere tydeligt på dokumenterede fordele, når evidensen bærer det, men afgørende kontraindikationer og alvorlige risici må ikke skjules, evidensen må ikke overdrives, og der må ikke gives risikabel individuel medicinsk vejledning.

## Længde, SEO og sprog

- Længde bestemmes af søgeintention og læserværdi, ikke af et fast ordtal. Korte svarartikler kan typisk være ca. 500–800 ord, almindelige evergreen-artikler ca. 800–1.500 ord og større guider ca. 1.500–2.500 ord eller mere, når emnet kræver det. Ingen artikel fyldes kunstigt for at ramme et ordtal.
- Evergreen-artikler SEO-optimeres ved publicering med tydelig søgeintention, naturlige søgeord, relevant metadata, klare H2/H3-afsnit og et kort direkte svar tidligt i artiklen uden keyword stuffing.
- Brug almindelige danske ord frem for engelske forkortelser og fagudtryk, når et naturligt dansk ord findes. Hvis en nødvendig forkortelse eller et fagudtryk bruges, forklares det første gang.

Alle øvrige fælles krav – bl.a. faktaverifikation, rubrik/manchet, præcis 2 punkter i `SAGEN KORT`, links, kildeliste, citater, hero og fail-open-principper – arves fra `docs/editorial-core.md` og skal ikke gentages her.