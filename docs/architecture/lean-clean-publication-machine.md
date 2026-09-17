# Lean, clean publication machine

Goal: one small, reusable publication engine that can power Morgentidende and be cloned for other newspapers, magazines or specialist periodicals without carrying brand-specific logic into the core.

## Core publication path

`Discover → Research → semantic dedupe → Write + final check → transport → Media → Article QA → Safe Publish`

Each transition has one owner. A later layer may verify an invariant, but it must not reimplement the previous layer's business logic.

## Design laws

1. **One owner per state transition.** Avoid multiple triggers, workers or prompts deciding the same thing.
2. **No watchdog when a state transition can be atomic.** Recovery jobs may retry lost callbacks; they must not become a second publisher.
3. **Core before adapters.** Article, media and QA state live in the publication database. GitHub, Metricool, SES and other providers are adapters.
4. **Optional modules never block publication.** Social, newsletter, analytics and other distribution modules start after Safe Publish and can fail independently.
5. **No brand-specific core logic.** A clone should change configuration, source profile, editorial rules and visual identity — not the publication state machine.
6. **Prefer deletion over parallel legacy paths.** When a replacement is proven, remove the old role, trigger, watchdog or queue instead of keeping both.
7. **Fail early on cheap invariants.** Reject invalid media URLs, missing required fields and known duplicates before expensive downstream work.
8. **Fail closed on privileged operations.** Internal workers and mutation RPCs require explicit service authentication.
9. **Store provider acknowledgements, not provider state machines.** External services may have their own statuses; the core stores only the state required to continue safely.
10. **Instrumentation must observe, not mutate.** Diagnostic code must never be able to block the primary insert/update path.

## Optional distribution modules

### Social

`Published article → editorial/social selection → social_posts → provider adapter (Metricool) → Facebook / Instagram`

`social_posts` is the only local queue/ledger. There is no second event table and no social trigger on `articles` until an explicit selection policy is enabled. Metricool is a replaceable adapter.

Launch scope is Facebook and Instagram only. X, TikTok, LinkedIn or other networks are added as explicit modules when there is a real use case.

### Newsletter

Newsletter generation and delivery consume already-published content. Newsletter failure must never affect article publication.

### Live / special formats

Live centers and special sections may reference the same article/story-cluster model, but must not introduce an alternate article publication path.

## Clone contract

A new publication should normally need to replace only:

- editorial profile and source policy
- categories / magazine sections
- visual identity and domain
- provider credentials
- distribution policy

The following should remain unchanged unless the product itself changes:

- publication state machine
- media validation and storage contract
- QA ownership model
- Safe Publish gate
- public/private database boundary
- adapter boundaries
