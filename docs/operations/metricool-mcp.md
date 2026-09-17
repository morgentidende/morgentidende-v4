# Metricool MCP adapter: queue consumer contract

## Inventory (verified 2026-09-17)
- `social_posts` is the private queue and ledger; zero live rows at inspection.
- Unique `(article_id, network, variant_key)` constraint; only Facebook/Instagram in the enum.
- Existing fields cover payload, media, attempts, errors, provider acknowledgement and metadata.
- RLS enabled; anonymous/authenticated roles cannot access the ledger.
- `social_distribution_policy.enabled=false`, `start_at=null`.
- Supabase `social-dispatcher` is deployed (version 1 at inspection).
- Previously the dispatcher both enqueued rows and called `workers/social-publisher` over REST.
- That Worker only adapts authenticated HTTP requests to Metricool's paid API.
- Metricool MCP is connected to brand 6923586 (Morgentidende), Europe/Copenhagen,
  Facebook page 1356072074249084 and Instagram @morgentidende.

## Target architecture
Published article -> existing queue producer -> social_posts -> MCP-capable agent
-> Metricool MCP -> Facebook/Instagram -> acknowledgement/status back to social_posts.

The queue producer remains independent of article publication and contains no new
editorial selection model. It formats existing article facts. No article triggers,
Safe Publish, dedupe or editorial pipeline changes are required.

This is an agent-operated adapter, NOT an autonomous Supabase-to-MCP connection.
The authenticated Metricool tools belong to the agent session. Deploying the queue
producer does not create a background MCP runner. No recurring run is configured.
Automatic publishing must remain OFF until explicitly approved by the owner.

## Mandatory consumer procedure
1. Confirm owner authorization for the concrete test or publication batch. During
   rollout, do not create posts. Read `social_distribution_policy`; OFF blocks
   unattended consumption. A separately authorized test is limited to named rows.
2. Read one `ready` row. Do not rewrite its editorial text. Confirm its article is
   still published, network is Facebook/Instagram, and desired date is in the future.
3. Validate media BEFORE reserving: every URL must be public HTTPS, reachable and
   actually return supported image/video bytes, not HTML/SVG. Inspect dimensions,
   format and provider requirements. Instagram requires at least one valid medium.
   Use approved media origins; do not probe arbitrary internal addresses. Record
   invalid media as `failed`/`invalid_media` with a sanitized explanation. Never call
   Metricool for that row.
4. Generate one UUID claim token and run the atomic reservation below. Continue ONLY
   if exactly one row is returned. No row means another consumer won or it is no
   longer eligible. Preserve the returned payload as the attempt's frozen snapshot.
5. Call Metricool `createScheduledPost` ONCE using the returned payload and brand
   6923586. Use one network per ledger row. Preserve media, alt text, AI labeling and
   timezone. Consult the current tool schema; do not assume REST payload compatibility.
6. Save the full non-secret acknowledgement (id/uuid/planner URL where provided) with
   the same claim token and `scheduled` status using the fenced completion below.
   A scheduler acknowledgement is NOT proof the platform published it.
7. Verify publication in Metricool and the actual platform. Only then mark published
   and set published_at, preserving the provider identifiers and platform URL.

## Atomic reservation (service-role / trusted database operator only)
Use bound values for `:post_id` and `:claim_token`; never concatenate untrusted text.
The existing `failed` state is deliberately used with `provider_outcome_unknown`
before the external side effect. It is a durable no-retry fence if the agent dies.

```sql
UPDATE public.social_posts
SET status = 'failed', attempts = attempts + 1,
    last_error_code = 'provider_outcome_unknown',
    last_error = 'MCP attempt reserved; reconcile before any repeat send',
    metadata = metadata || jsonb_build_object(
      'mcp_claim_token', :claim_token::text,
      'mcp_claimed_at', now(), 'adapter', 'metricool_mcp')
WHERE id = :post_id::uuid AND status = 'ready'
  AND provider_ref = '{}'::jsonb
  AND network IN ('facebook', 'instagram')
RETURNING *;
```

Fenced completion, only after an acknowledged provider call:
```sql
UPDATE public.social_posts
SET status = 'scheduled', provider_ref = :ack::jsonb,
    scheduled_for = :actual_scheduled_for::timestamptz,
    last_error_code = NULL, last_error = NULL
WHERE id = :post_id::uuid AND status = 'failed'
  AND last_error_code = 'provider_outcome_unknown'
  AND metadata->>'mcp_claim_token' = :claim_token::text
RETURNING id;
```

Require exactly one completion row. On DB failure, retry saving the SAME receipt;
never repeat the Metricool create call. Store no OAuth/API tokens in metadata/logs.
If there is an explicit provider rejection with proof no post was created, keep
`failed`, record `provider_rejected` and a sanitized error, retaining the claim token.
A reviewed retry may reset that rejected row to ready after correcting the cause.

Timeout, disconnect, ambiguous error or lost acknowledgement: keep
`provider_outcome_unknown`. Never automatically reset/reclaim it based on age.
Reconcile scheduled AND already-published posts in Metricool by network, exact
payload/media/date and identifiers. `getScheduledPosts` does NOT return published
posts; an empty schedule is not proof of non-delivery. Save the matching receipt,
or require conclusive non-delivery evidence before a controlled retry.

This avoids blind retries and concurrent duplicate sends. It does not promise
exactly-once delivery across two systems: the MCP create tool exposes no idempotency
key, so unknown outcomes require reconciliation. The database unique key alone
cannot deduplicate an external side effect.

## Retirement and rollout
The revised deploy workflow deploys only the Supabase queue producer. Metricool
secrets, Worker deploy and Worker health are no longer dependencies of that flow.
The legacy Worker source/CI is retained temporarily for rollback, not used by the
new producer. Do not delete the live Worker until the new producer is deployed and
one controlled FB/IG test has verified ledger acknowledgement and platform results.
Then remove workers/social-publisher, social-worker-ci.yml, the live Worker,
unused adapter_url setting and authorize_social_adapter_token RPC. Keep the runner
authorization used by the queue producer. Do not delete unrelated shared credentials.

Before a real test: review/deploy this change, verify OFF and empty ledger, verify
media and MCP payload shape, execute a rollback-only reservation test, and obtain
explicit approval of the two concrete test rows. Permanent activation is separate.

## Executable consumer (PR follow-up)
`tools/social/mcp-consumer.mjs` implements the reservation/send/receipt state machine.
`tools/social/media.mjs` checks approved origin, HTTPS, redirects, bounded download,
PNG/JPEG signatures and dimensions. Static images only; WebP/video fail closed.
This is a structural preflight, not a full image decoder or proof of future URL
availability. Visually verify the concrete media before the first real test.
Requirements source: https://help.metricool.com/schedule-and-post-on-instagram-6b6q5

Run offline safety tests with:
`node --test tools/social/mcp-consumer.test.mjs`

The consumer defaults to dry-run. Execution also requires enabled=true in the live
policy, including at atomic reservation. It offers no OFF override. Do not enable
production just to test. The first real test needs a separate narrowly scoped test
permit design or an explicitly approved activation window; neither is added here.

Remaining host boundary: provide `query(sql, values)` using parameter binding,
`validateMedia` from the media module, and `schedule(args)` invoking the connected
Metricool MCP tool. `schedule` must normalize verified success to
`{accepted:true,id,plannerUrl,...}`; generic text is deliberately NOT accepted.
Current MCP receipt shape must be verified before implementing this normalization.
No REST/token fallback exists. No unattended host or scheduler is installed.

If storing a receipt fails, the result contains id/claim/receipt for fenced recovery.
Never call schedule again to recover a database failure. Raw unknown responses are
preserved on the existing row; timeout leaves the prewritten unknown-outcome fence.

