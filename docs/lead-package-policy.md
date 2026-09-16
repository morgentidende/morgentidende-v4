# Morgentidende – leadpakker

Denne fil ejer kun regler, der er særlige for leadpakker. Fælles artikelkrav og generelt slut-QA ligger i `docs/editorial-core.md`; nyhedsprofil og politiske skalaer ligger i `docs/news-editorial-profile-and-discovery.md`; teknisk publicering ligger i `docs/v4-spec.md` og den aktive Supabase-implementering.

## Pakkeformat

- En **færdig** leadpakke består af **1 lead + præcis 3 substantielle opfølgere**. Det er pakkens redaktionelle mål og slutformat — ikke en publication invariant for den enkelte artikel.
- Leadet er pakkens hovedhistorie, skal kunne forstås selvstændigt og må publiceres, når det er klar, også hvis en eller flere opfølgere endnu mangler.
- De tre opfølgere skal være tydeligt forskellige og hver tilføre ny journalistisk værdi. Relevante spor kan være dokumentation/baggrund, konsekvenser, autentiske reaktioner eller personlige erfaringer, analyse, forklaring eller anden klart selvstændig vinkel.
- Lead og opfølgere kobles strukturelt sammen via det aktive CMS/story-cluster-system.
- En opfølger, der publiceres senere i et eksisterende story cluster, skal automatisk blive `direct_related` til de allerede publicerede artikler i samme cluster. Relationerne er gensidige, så ældre artikler uden manuel omskrivning kan få dynamiske **Læs også**-links til den nye artikel.
- Ved visning prioriteres eksplicitte artikelrelationer først; øvrige publicerede artikler i samme story cluster bruges derefter som supplement uden dubletter.
- Slut-QA for den enkelte artikel kontrollerer kun, at dens egne story-cluster/relationer er korrekte. Fravær af opfølger 2 eller 3 må ikke underkende et færdigt lead eller en anden færdig opfølger.
- Publicér hver artikel, når den er klar. Én problematisk eller forsinket opfølger må ikke blokere de øvrige; den manglende artikel færdiggøres via den gældende fallback-logik.

## Hero-regel for leadpakker

- De fire artikler i samme leadpakke skal som udgangspunkt have **fire forskellige hero-billeder**.
- Samme underliggende medie må ikke genbruges på to artikler i samme story cluster, medmindre der foreligger en konkret og usædvanlig redaktionel grund, og genbruget er eksplicit valgt.
- Sammenlign først `hero_media_id`/asset-identitet, når den findes. For legacy-eksterne billeder bruges normaliseret `hero_url` som fallback-identitet, så resize-, quality- og formatparametre ikke kan skjule et dubletbillede.
- Media-fasen skal kontrollere hero-identitet på tværs af hele pakken før publicering og søge et alternativt lovligt billede, hvis mediet allerede er brugt i pakken.
- Hvis et perfekt billede ikke kan findes, er et lidt mindre oplagt men stadig faktuelt relevant og lovligt billede bedre end et synligt dublet-hero i samme pakke.
- Leadets hero prioriteres højest. Opfølgere skal så vidt muligt afspejle deres egen særskilte vinkel frem for blot pakkens fælles emne.

## Politisk leadpakke

- Emnevalg, vinkling og argumentvægt følger de aktuelle skalaer og regler i `docs/news-editorial-profile-and-discovery.md`.
- Politiske leadpakker publicerer ikke i Viden eller Liv.

## Tema-leadpakke

- Tema skal være bredt relevant og tilføre forsiden reel bredde.
- Tema må gerne være aktuelt eller vedvarende relevant, men må ikke blot være et ordinært Viden/Liv-evergreen.
- En politisk vinkel må kun bruges, når stoffet naturligt bærer den.

## Fælles mål

Vælg et veldokumenteret emne med høj informationsværdi og nok substans til fire forskellige artikler. En leadpakke må ikke skabes ved at strække én historie kunstigt ud over fire næsten ens tekster.
