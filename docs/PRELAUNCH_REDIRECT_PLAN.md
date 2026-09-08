# Morgentidende redirect-plan før launch

## Mål
Kun én offentlig, indekserbar version af Morgentidende skal eksistere efter launch: `https://morgentidende.dk`.

## Før domænet er koblet på
- `.workers.dev` skal være `noindex` via robots og `X-Robots-Tag`.
- Canonical til `morgentidende.dk` må ikke låses globalt endnu.
- Eksisterende artikel-slugs skal bevares, medmindre der er en konkret redaktionel grund til at ændre dem.

## Ved launch
1. Tilknyt `morgentidende.dk` som produktionsdomæne.
2. Vælg én canonical host (`morgentidende.dk` uden `www`, medmindre andet besluttes).
3. 301-redirect `www` til canonical host.
4. 301-redirect den gamle `.workers.dev`-adresse til samme path på `morgentidende.dk`.
5. Generér canonical URL på alle offentlige sider ud fra produktionsdomænet.
6. Opdatér `robots.txt`, almindeligt sitemap og news sitemap til produktionsdomænet.
7. Bevar 404 for URL'er uden en reel erstatning; redirect ikke alt ukendt til forsiden.

## Gamle v3/v4 URL'er
Før launch skal kendte gamle URL-mønstre og delte artikel-URL'er samles. For hver gammel URL vælges:
- 301 til samme artikel, hvis historien findes i v4.
- 301 til nærmeste reelle erstatning, kun hvis indholdet er klart tilsvarende.
- 404/410 hvis indholdet er permanent væk og ingen reel erstatning findes.

## Kontrol efter launch
- Test HTTP-status for forside, kategorier, artikler, 404 og redirects.
- Kontrollér ingen redirect-loops eller kæder.
- Kontrollér canonical, Open Graph og sitemaps på rigtige produktions-URL'er.
- Kontrollér at `.workers.dev` ikke kan konkurrere i Google med produktionsdomænet.
