# Morgentidende – design-lås

Kernedesignet må ikke ændres af autonome redaktionelle eller tekniske oprydninger uden eksplicit brugerbestilling.

## Beskyttede områder

Design-låsen omfatter som minimum:

- `v4-frontend/src/styles/**`
- `v4-frontend/src/components/V4Card.astro`
- `v4-frontend/src/pages/index.astro`
- `v4-frontend/src/layouts/V4Layout.astro`

En pull request, der ændrer disse områder, skal have eksplicit brugeraccept og markeres med:

`<!-- design-change-approved -->`

Workflowet `.github/workflows/design-lock.yml` afviser ellers PR'en.

## Faste layoutprincipper

- Mobilens store lodrette nyhedskort bevarer rækkefølgen hero → kategori → rubrik og skal have tydelig luft mellem kortene.
- Mobilens små horisontale nyhedskort bruger hero til venstre og kategori + rubrik til højre.
- På horisontale mobilkort skal heroen være vertikalt centreret mod den samlede tekstblok; den må ikke automatisk top- eller bundjusteres.
- Ændringer i spacing, typografi, hero-format, masthead, lead-layout, magasin-layout eller mobilkort kræver eksplicit designbestilling.
- Redaktionelle ændringer må ikke samtidig ændre design, medmindre det specifikt er bestilt.

Målet er at forhindre, at refaktorering, QA eller automatisering utilsigtet flytter det godkendte visuelle udtryk.
