# Social distribution – Morgentidende

Morgentidende automatiserer distribution til Facebook, Instagram, X og senere TikTok. Samme artikel må ikke publiceres mekanisk ens på alle platforme.

## Grundprincip
Hold kæden så kort som muligt. Færre led er bedre end flere.

Standardflow:
`Publish article → vælg platform → skriv platformstekst → vælg/generér medie → Metricool → platform`

Tilføj kun ekstra worker, kø, billedlager eller transformationslag, hvis det løser et konkret problem, som ikke kan løses stabilt direkte. Avisens publicering må aldrig vente på social distribution.

## Platformvalg
Hver artikel vurderes særskilt på breaking-værdi, debatpotentiale, visuel styrke, personlig relevans og forklaringsværdi.

### Facebook
Prioritér bredt relevante og delbare historier: Indland, privatøkonomi, sundhed, familie, kriminalitet, migration, menneskelige historier og større leads. Brug normalt artikel-link med stærk, platformstilpasset tekst og hero/preview.

### Instagram
Prioritér visuelt stærke og let forklarlige historier, især Viden, Liv, AI, teknologi, rumfart, biler, økonomi, sundhed og parforhold.

Hård regel for Viden/Liv:
- Når en artikel egner sig til flere forklarende pointer, skal Instagram som udgangspunkt være en carousel, ikke bare ét hero-billede.
- Brug typisk 4–7 kort; antal bestemmes af stoffet, ikke af en fast skabelon.
- Kort 1: stærk hook/rubrik.
- Midterkort: én klar pointe pr. kort, korte tekster, høj visuel læsbarhed.
- Sidste kort: afrunding + invitation til at læse hele artiklen på morgentidende.dk.
- AI-genererede visuals er tilladt frit til Viden og Liv, også fotorealistiske, så længe de ikke fremstiller virkelige personer som om billedet var ægte reportage.
- Instagram-opslag med AI-genereret eller væsentligt AI-redigeret materiale markeres som AI-genereret, når platformen understøtter det.

Hvis carousel-teknikken midlertidigt fejler, må fallback til ét billede bruges for at sikre publicering, men fejlen skal rettes bagefter. Fallback må ikke blive permanent standard.

### X
Prioritér breaking, politik, EU, ytringsfrihed, migration, kriminalitet, internationale konflikter, økonomi, AI/tech, analyser og Kommentar.

### TikTok
Brug kun artikler, der kan omsættes til et tydeligt visuelt eller fortællende format. Undgå mekanisk genbrug af Instagram-kort uden platformstilpasning.

## Medieregler
- Almindelige nyheder: brug rigtige fotos med verificerede brugsrettigheder.
- Viden og Liv: AI-genererede heros og SoMe-kort er tilladt og kan bruges offensivt.
- Hero og SoMe-medier behøver ikke manuel forhåndsgodkendelse i chatten.
- Brug eksisterende offentligt tilgængelige hero-URL'er direkte, når det er stabilt og lovligt.
- Undgå GitHub som billed-mellemstation, medmindre der er en konkret teknisk grund.
- Hvis egne genererede SoMe-kort kræver hosting, foretrækkes ét enkelt stabilt medielager frem for flere kopier eller services.

## Tekst og publicering
- Hver platform får sin egen tekst.
- Fejl ved én platform må ikke blokere de andre.
- Social publicering sker efter artikelpublicering.
- Platformvalg og platformstekst skal kunne auditeres.
- Tokens, app-secrets og loginoplysninger må aldrig ligge i GitHub eller almindelige Supabase-tabeller; kun i secret storage/connector-auth.

## Metricool
Metricool er standardudgivelseslaget til sociale netværk. Brug Metricool direkte, når det kan løse opgaven; byg ikke parallelle Meta/X-integrationer uden et konkret behov.

Instagram skal være en professionel konto koblet til Morgentidendes Facebook-side.

## Stabilitet før elegance
Ved fejl vælges den korteste stabile fallback, så opslaget stadig kommer ud. Derefter rettes årsagen. Målet er færrest mulige bevægelige dele, ikke flest mulige automatiseringstrin.
