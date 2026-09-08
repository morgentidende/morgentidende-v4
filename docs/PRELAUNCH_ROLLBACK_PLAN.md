# Morgentidende v4 – rollback og backup før launch

## Mål
Hvis en ændring ødelægger forsiden, artikelsider eller dataadgang, skal vi kunne gå tilbage til en kendt god version hurtigt og uden datatab.

## Frontend / Cloudflare
1. Alle større ændringer laves i branch + pull request.
2. CI skal være grøn før merge til `main`.
3. Behold sidste kendte gode commit-SHA før hvert launch/deploy.
4. Ved frontend-fejl: rollback/redeploy sidste kendte gode commit frem for at fejlrette direkte i produktion.
5. `.workers.dev` forbliver ikke-kanonisk og noindex; produktion skal være `morgentidende.dk` efter launch.

## Supabase
1. Skemaændringer skal ske via versionsstyrede migrationsfiler.
2. Destruktive migrationer (DROP/TRUNCATE/kolonnefjernelse) må ikke køres uden eksplicit backup og manuel vurdering.
3. Redaktionelle data må ikke være afhængige af frontend-deployment for at kunne gendannes.
4. Før større schemaændringer: verificer Supabase backup/PITR-mulighed i den aktive plan.

## Launch-check
Før første domæne-launch noteres:
- sidste kendte gode `main` commit
- aktiv Cloudflare deployment/version
- Supabase projekt og seneste migration
- DNS-konfiguration
- canonical host

## Incident-prioritet
1. Stop ny deployment/ændringer.
2. Afgør om fejlen er frontend, Cloudflare/DNS eller Supabase.
3. Rollback frontend først, hvis data er intakte.
4. Databaseændringer rulles ikke blindt tilbage; brug backup/migration efter kontrol.
5. Verificer forside, artikel, kategori, login og mobil/desktop efter rollback.
