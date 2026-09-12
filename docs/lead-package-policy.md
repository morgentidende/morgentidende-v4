# Morgentidende – leadpakker

Denne fil ejer kun regler, der er særlige for leadpakker. Fælles artikelkrav og generelt slut-QA ligger i `docs/editorial-core.md`; nyhedsprofil og politiske skalaer ligger i `docs/news-editorial-profile-and-discovery.md`; teknisk publicering ligger i `docs/v4-spec.md` og den aktive Supabase-implementering.

## Pakkeformat

- En leadpakke består af **1 lead + præcis 3 substantielle opfølgere**.
- Leadet er pakkens hovedhistorie og skal kunne forstås selvstændigt.
- De tre opfølgere skal være tydeligt forskellige og hver tilføre ny journalistisk værdi. Relevante spor kan være dokumentation/baggrund, konsekvenser, autentiske reaktioner eller personlige erfaringer, analyse, forklaring eller anden klart selvstændig vinkel.
- Lead og opfølgere kobles strukturelt sammen via det aktive CMS/story-cluster-system.
- I det fælles slut-QA kontrolleres også, at pakken fortsat består af 1 lead + 3 opfølgere, og at de strukturelle story-cluster/relationer er sat korrekt.
- Publicér hver artikel, når den er klar. Én problematisk opfølger må ikke blokere de øvrige; færdiggør den manglende artikel via den gældende fallback-logik.

## Hero-regel for leadpakker

- De fire artikler i samme leadpakke skal som udgangspunkt have **fire forskellige hero-billeder**.
- Den samme `hero_url` må ikke genbruges på to artikler i samme story cluster, medmindre der foreligger en konkret og usædvanlig redaktionel grund, og genbruget er eksplicit valgt frem for blot at være fallback eller søgegenbrug.
- Media-fasen skal kontrollere hero-URL'er på tværs af hele pakken før publicering og søge et alternativt lovligt billede, hvis en URL allerede er brugt i pakken.
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
