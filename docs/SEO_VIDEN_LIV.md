# SEO- og redaktionel standard for Viden og Liv

Målet er, at flertallet af artikler i Viden og Liv er evergreen-indhold, som kan hente relevant Google-trafik i måneder eller år. SEO må ikke ske på bekostning af troværdighed, journalistisk kvalitet eller læseoplevelse. Dette dokument er den autoritative standard for Viden og Liv.

## Redaktionel hovedregel

- Mindst 70 % af nye Viden- og Liv-artikler bør være evergreen eller semi-evergreen.
- Evergreen-emner vælges ud fra reelle læserspørgsmål og varig nytte, ikke kun aktuelle trends.
- Skriv people-first: artiklen skal løse læserens spørgsmål fuldt ud, også hvis læseren aldrig kom fra Google.
- Artikler skal have høj delbarhed gennem reel nytte, overraskende eller nye oplysninger, konkrete råd, følelsesmæssig relevans, identitetsrelevans, nysgerrighed eller tydelig betydning for læserens liv.
- Rubrikker må være stærkt nysgerrighedsskabende, men må aldrig love mere end dokumentationen kan bære.
- Ingen kunstig keyword stuffing, generiske SEO-afsnit eller omskrivning af konkurrenters artikler uden selvstændig værdi.
- Kvalitet, præcision og korrekthed har altid forrang for clickbait og delbarhed.

## Rubrik og søgeintention

- Rubrik/H1 skal beskrive det spørgsmål eller problem, siden faktisk løser.
- Det vigtigste søgeudtryk skal normalt optræde naturligt i rubrik, indledning og mindst én relevant mellemoverskrift.
- Brug almindeligt dansk, som læsere faktisk søger efter.
- Undgå årstal i evergreen-slugs og rubrikker, medmindre året er en reel del af emnet. Eksisterende URL'er ændres ikke alene af SEO-hensyn.
- Metabeskrivelsen skal være specifik og give en reel grund til at klikke; ingen lokkemad, som artiklen ikke leverer på.

## Dybde og struktur

Google har ingen foretrukken ordlængde. Artiklen skal være så lang som nødvendigt for at give et tilfredsstillende og substantielt svar.

For konkurrencedygtige evergreen-emner bør artiklen normalt indeholde:
- et kort, klart svar tidligt i teksten
- logisk H2/H3-struktur
- forklaring af centrale begreber
- dokumentation og relevante primærkilder
- konkrete eksempler, fremgangsmåder eller anvendelse, når emnet egner sig til det
- begrænsninger, usikkerhed og relevante modargumenter
- interne links til 2-5 nært beslægtede Morgentidende-artikler, når de findes

Meget korte artikler på ca. 150-400 ord bør ikke være standardformat for konkurrencedygtige evergreen-søgninger, hvis emnet kræver mere for at blive dækket ordentligt.

## Viden

Prioritér varige forklarende emner inden for blandt andet:
- AI og teknologi
- forskning og videnskab
- rumfart og energi
- hjerne og kognition
- biologi og aldring
- forklaringer af nye teknologier og forskningsfelter

Viden skal gøre kompleks forskning, teknologi og fremtidstendenser forståelige, konkrete og samtaleværdige. Aktuelle forskningsnyheder kan bruges som indgang, men bør ofte løftes til en mere varig forklarende artikel, hvis emnet har langsigtet søgepotentiale.

## Liv

Prioritér varige praktiske emner inden for blandt andet:
- sundhed og træning
- søvn
- psykologi og trivsel
- parforhold
- ernæring
- privatøkonomi
- aldring og livsstil

Liv skal gøre dokumenteret viden om sundhed, psykologi, relationer, privatøkonomi og livskvalitet praktisk anvendelig og delbar. Sundheds- og privatøkonomiindhold er YMYL. Her kræves ekstra tydelig kildebrug, forsigtig formulering og høj faglig præcision.

Sundhedsartikler må gerne fokusere tydeligt på dokumenterede fordele, når det er historiens vinkel, men må ikke skjule afgørende kontraindikationer, overdrive evidens eller give risikabel individuel medicinsk vejledning.

## Kilder og troværdighed / E-E-A-T

- Forskningsbaserede Viden- og Liv-artikler skal have en kort kildesektion med de centrale studier eller faglige kilder.
- Kilder skal kunne identificeres og helst linkes direkte fra artiklen.
- Primær forskning, myndigheder, faglige selskaber og originale rapporter prioriteres over sekundære omtaler.
- Angiv korrekt forfatter/byline. Hvis der senere indføres faglig reviewer, skal reviewer og kvalifikation fremgå synligt.
- Ved væsentlige opdateringer skal `updated_at` kun ændres, når indholdet faktisk er substantielt opdateret.
- Sundhedsartikler må ikke fremstille tidlige, små eller observationsbaserede studier som etablerede behandlingsfakta.

## Billeder

- Hero skal være relevant for emnet og have beskrivende alt-tekst.
- Undgå generiske billeder, hvis et mere emnespecifikt billede er tilgængeligt.
- Bevar stor billed-preview i robots/meta og responsive billedversioner.

## Intern linking og hubs

- Viden- og Liv-kategorierne fungerer som emnehubs og skal have beskrivende SEO-titler og beskrivelser.
- Relaterede evergreen-artikler bør linke til hinanden med beskrivende ankertekst.
- Når flere artikler dækker samme overordnede emne, bør én stærk hovedartikel være den primære destination, mens mere specifikke artikler linker tilbage til den.
- Mod slutningen af brødteksten bør der, når en reelt relevant artikel findes, være 1-2 naturlige prosasætninger, som inviterer læseren videre til mindst én beslægtet Morgentidende-artikel. Linket skal være en del af den journalistiske prosa og ikke et kunstigt SEO-link.
- Hvis ingen passende intern destination findes, må der ikke indsættes et irrelevant link alene for SEO.
- Brødtekstlinks skal være tydeligt genkendelige som links i avisens design.

## Teknisk SEO

- Én canonical URL pr. artikel.
- Sproget angives som `da-DK` i HTML og structured data.
- Viden/Liv-evergreens bruger `Article`; egentlige nyheder bruger `NewsArticle`.
- Structured data skal have korrekt headline, image, datePublished, dateModified, author, publisher, inLanguage og articleSection.
- Navngivne menneskelige forfattere markeres som `Person`; Morgentidende/redaktionen markeres som `Organization`.
- Breadcrumb structured data på artikelsider.
- XML-sitemap for alle indekserbare artikler; news-sitemap kun til nyligt publiceret nyhedsindhold.
- `.workers.dev` skal forblive noindex indtil det rigtige domæne er live.
- Ingen indeksering af 404/500/login/admin.

## Løbende vedligeholdelse

Evergreen er ikke det samme som aldrig at opdatere. Gennemgå stærke Viden/Liv-sider, når:
- ny forskning ændrer konklusionen
- tal eller anbefalinger bliver forældede
- en artikel begynder at få betydelig søgetrafik og kan forbedres
- Search Console viser mange visninger men lav CTR eller en placering lige uden for topresultaterne

Opdater kun publicerings-/ændringsdato synligt, når artiklen faktisk er ændret substantielt.
