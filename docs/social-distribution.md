# Social distribution – Morgentidende

Morgentidende automatiserer distribution til Facebook, Instagram og X, men publicerer ikke mekanisk samme artikel på alle platforme.

## Platformvalg
Hver publiceret artikel vurderes særskilt på:
- breaking-værdi
- debatpotentiale
- visuel styrke
- personlig relevans
- forklaringsværdi

Der produceres kun et opslag til en platform, når artiklen passer naturligt til platformens publikum.

### Facebook
Prioritér bredt relevante og delbare historier, især Indland, privatøkonomi, sundhed, familie, kriminalitet, migration, menneskelige historier og større leads.

### Instagram
Prioritér visuelt stærke og let forklarlige historier, især Viden, AI, teknologi, rumfart, biler, økonomi, sundhed, parforhold og Liv. Brug helst hero eller carousel og platformstilpasset tekst frem for almindelige linkopslag.

### X
Prioritér breaking, politik, EU, ytringsfrihed, migration, kriminalitet, internationale konflikter, økonomi, AI/tech, analyser og Kommentar.

## Tekst og publicering
- Hver platform får sin egen tekst. Identiske opslag på tværs af platforme er ikke tilladt.
- Avisens publicering må aldrig forsinkes af social distribution.
- Social distribution sker efter artikelpublicering og post-publish QA.
- Platformvalg og platformstekst skal kunne auditeres.
- Fejl ved én platform må ikke blokere de andre platforme.
- Tokens, app-secrets og andre legitimationsoplysninger må aldrig ligge i GitHub eller Supabase-tabeller; de opbevares kun i secret storage.

## Arkitektur
`Publish → post-publish QA → Social Router → platformkø → Metricool → Facebook / Instagram / X`

Social Router beslutter platformfit og skriver separate kladder til den private `social_posts`-kø. Publisheren sender platformsspecifikke opslag til Metricool. Metricool håndterer forbindelsen til de enkelte sociale netværk.

## Metricool
Metricools scheduler-API bruges som fælles udgivelseslag. Det reducerer behovet for tre separate integrationslag og giver én kø til Facebook, Instagram og X. API-legitimationsoplysninger skal kun ligge server-side.

Instagram bør forbindes til Metricool via en professionel Instagram-konto koblet til en Facebook-side, da den forbindelse giver den mest komplette og stabile Meta-funktionalitet.
