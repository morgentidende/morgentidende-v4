# Morgentidende — source registry

## Formål

Dette dokument beskriver det bindende binære system for mediekilder. Den konkrete runtime-klassifikation ligger i `public.editorial_source_registry`.

Der findes kun to medieklasser:

- `authoritative`: må bruges som faktuel slutkilde.
- `discovery_only`: må bruges til at opdage en historie og følge links videre, men må ikke bruges som faktuel slutdokumentation.

## Publication-regel

Én `authoritative` kilde er nok til publication, når den konkrete kilde dokumenterer historiens centrale fakta. En anden autoritativ kilde skal søges, når det er rimeligt, men er ikke et krav.

Når én kilde bærer historien, skal væsentlige oplysninger attribueres naturligt, fx “ifølge Bangkok Post”.

En artikel med kun `discovery_only`-medier som dokumentation må ikke publiceres.

## Hvad tæller som authoritative

Som hovedregel:

1. national public service / bredt etableret statsligt nyhedsmedie,
2. stort etableret nationalt eller internationalt nyhedsbureau,
3. stor etableret privat avis med fysisk papirudgave,
4. officiel primærkilde om egne afgørelser, tal, handlinger og udtalelser,
5. direkte originaludtalelse/dokument fra sagens subjekt om netop subjektets egen udtalelse/handling, når relationen er eksplicit markeret.

Politisk ståsted er ikke i sig selv en klassifikationsregel. Kategorien siger heller ikke, at alt et medie publicerer er sandt; den siger, at mediet må fungere som faktuel slutkilde under normal kildekritik og korrekt attribution.

## Hvad tæller som discovery_only

Som hovedregel nichemedier, blogs, aggregatorer, ideologiske specialmedier, tænketanke, kampagne-/advocacy-sider og øvrige tipkilder, der ikke opfylder authoritative-reglen eller konkret er godkendt som authoritative.

Kendte redaktørbeslutninger om fx Jihad Watch, Samnytt, Hodjanernes Blog og Uriasposten er discovery-only og må ikke automatisk overstyres af payload-felter eller modelgæt.

Bangkok Post og The Nation Thailand er authoritative efter redaktørbeslutning. The Indian Express, Times of India og Hindustan Times er authoritative efter reglen om store etablerede private papiraviser.

## Selvudvidende register

Når et kendt discovery-medie linker videre til et nyt medie/domæne:

1. undersøg mediets karakter,
2. klassificér det `authoritative` eller `discovery_only`,
3. send klassifikationen i top-level `source_registry_updates` gennem GitHub publish bridge,
4. genbrug klassifikationen ved senere fund.

Registret forventes at vokse hurtigt i begyndelsen og langsommere senere.

Automation må gerne op- eller nedklassificere tidligere automatiske vurderinger, når ny research begrunder det. `editor_locked=true` betyder, at chefredaktørens beslutning ikke må ændres automatisk.

Et ukendt domæne behandles som `discovery_only`, indtil det er klassificeret og registry-opdateringen er afleveret.

## Payload-format

```json
{
  "source_registry_updates": [
    {
      "source_name": "Example Daily",
      "domain": "example.com",
      "classification": "authoritative",
      "region": "Exampleland",
      "rationale": "Large established national print newspaper",
      "discovered_via": "example-discovery.net"
    }
  ]
}
```

Maksimalt 50 registry-opdateringer pr. payload. Opdateringer må sendes både med artikelpayload og audit-only payload. Scheduled Tasks skriver aldrig direkte til Supabase.

## Backend-gate

`evaluate_article_source_quality` bruger ikke længere den gamle flertrinsmodel (`primary_official`, `strong_secondary`, `other_secondary`, `niche`, `advocacy` osv.). Gate-resultatet er nu:

- mindst én `authoritative` kilde → `pass`
- ingen `authoritative` kilder → `block: no_authoritative_source`

`classify_editorial_source` findes kun som kompatibilitetswrapper og returnerer den nye binære klassifikation (plus `reference` for ikke-redaktionelle reference-/mediekilder).
