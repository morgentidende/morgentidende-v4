# Morgentidende v4

Morgentidende – få begge sider af sagen i Danmarks nye avis.

## Autoritativ struktur
- `v4-frontend/` – aktiv Astro/Cloudflare-frontend.
- `supabase/migrations/` – database- og sikkerhedshistorik. Migrationsfiler bevares som versionshistorik og må ikke behandles som parallel aktiv applikationslogik.
- `docs/v4-spec.md` – gældende produkt-, design-, CMS-, publicerings- og driftsregler.
- `docs/editorial-core.md` – fælles artikelkrav for autonom artikelproduktion.
- `docs/news-editorial-profile-and-discovery.md` – gældende nyhedsprofil, politiske skalaer, discovery-kilder og bredt nyhedsmix.
- `docs/magazine-editorial-policy.md` – supplerende gældende regler for de apolitiske magasiner Viden og Liv.

De aktive ChatGPT-automationer ejer kun deres opgavespecifikke mandat, tidsplan og logging-identitet. De skal referere til de centrale regelsæt frem for at kopiere fælles regler ind i lange prompter.

## Arkitektur
- ChatGPT er den redaktionelle motor.
- Supabase håndterer artikler, scheduling, relationer, QA-kø og versionshistorik.
- Cloudflare driver frontend/deployment.
- Ingen secrets må ligge i det offentlige repo.
- Offentlige læsere får kun adgang til eksplicitte `v4_public_*` views.

## Vedligeholdelsesregel
Der skal kun være én aktiv implementation af en funktion eller regel. Når kode eller regler erstattes, fjernes den gamle aktive version i samme ændring. Historik bevares i Git/audit-log i stedet for som dead code eller konkurrerende regler.

Deaktiverede automations, gamle arkitekturbeskrivelser og historiske migrationsfiler må ikke bruges som sandhedskilde for den aktuelle drift.