import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPECTED_AUD = "morgentidende-publish-bridge";
const EXPECTED_REPO = "morgentidende/morgentidende-v4";
const EXPECTED_WORKFLOW_REF_PREFIX = "morgentidende/morgentidende-v4/.github/workflows/chatgpt-publish-bridge.yml@";
const ISSUER = "https://token.actions.githubusercontent.com";
const ALLOWED_MAGAZINE_STORY_KINDS = new Set(["evergreen_explainer", "followup", "new_study", "update"]);
const ALLOWED_FOLLOWUP_REASONS = new Set(["new_fact", "official_response", "arrest", "new_data", "court_decision", "material_update"]);
const ALLOWED_KINDS = new Set(["news", "comment", "debate", "magazine"]);
const ALLOWED_PAYLOAD_TYPES = new Set(["article", "discovery_audit"]);
const ALLOWED_SOURCE_CLASSIFICATIONS = new Set(["authoritative", "discovery_only"]);

type Json = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function b64url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function verifyGithubOidc(token: string): Promise<Json> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt");
  const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("invalid_jwt_header");
  if (payload.iss !== ISSUER) throw new Error("invalid_issuer");
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(EXPECTED_AUD)) throw new Error("invalid_audience");
  if (payload.repository !== EXPECTED_REPO) throw new Error("invalid_repository");
  if (payload.event_name !== "pull_request") throw new Error("invalid_event");
  if (typeof payload.workflow_ref !== "string" || !payload.workflow_ref.startsWith(EXPECTED_WORKFLOW_REF_PREFIX)) throw new Error("invalid_workflow_ref");
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now || (payload.nbf && payload.nbf > now + 30)) throw new Error("expired_or_not_yet_valid");
  const jwksRes = await fetch(`${ISSUER}/.well-known/jwks`);
  if (!jwksRes.ok) throw new Error("jwks_fetch_failed");
  const jwks = await jwksRes.json();
  const jwk = jwks.keys?.find((key: Json) => key.kid === header.kid);
  if (!jwk) throw new Error("jwks_kid_not_found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error("invalid_signature");
  return payload;
}

function normalizeKind(kind: unknown, categorySlug: unknown): string {
  const category = String(categorySlug ?? "").trim().toLowerCase();
  const raw = String(kind ?? "").trim().toLowerCase();
  if (category === "viden" || category === "liv") {
    if (!raw || raw === "magazine" || raw === "article" || raw === "evergreen") return "magazine";
    throw new Error("kind_category_conflict");
  }
  if (!raw) return "news";
  if (!ALLOWED_KINDS.has(raw)) throw new Error("invalid_article_kind");
  return raw;
}

function validateSourceRegistryUpdates(value: unknown) {
  if (value == null) return;
  if (!Array.isArray(value)) throw new Error("source_registry_updates_must_be_array");
  if (value.length > 50) throw new Error("source_registry_updates_too_many");
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("source_registry_update_must_be_object");
    const item = raw as Json;
    const domain = String(item.domain ?? item.url ?? "").trim();
    const sourceName = String(item.source_name ?? item.publisher ?? "").trim();
    const classification = String(item.classification ?? "").trim().toLowerCase();
    if (!domain) throw new Error("source_registry_domain_required");
    if (!sourceName) throw new Error("source_registry_name_required");
    if (!ALLOWED_SOURCE_CLASSIFICATIONS.has(classification)) throw new Error("invalid_source_registry_classification");
    item.classification = classification;
  }
}

function validatePayload(payload: Json): "article" | "discovery_audit" {
  const payloadType = String(payload.payload_type ?? "article").trim().toLowerCase();
  if (!ALLOWED_PAYLOAD_TYPES.has(payloadType)) throw new Error("invalid_payload_type");
  payload.payload_type = payloadType;

  if (typeof payload.queue_id !== "string" || !(payload.queue_id as string).trim()) throw new Error("missing_queue_id");
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(payload.queue_id as string)) throw new Error("invalid_queue_id");
  validateSourceRegistryUpdates(payload.source_registry_updates);

  if (payloadType === "discovery_audit") {
    if (payload.run_id != null && (typeof payload.run_id !== "string" || !(payload.run_id as string).trim())) throw new Error("invalid_run_id");
    if (!Array.isArray(payload.discovery_audit)) throw new Error("discovery_audit_candidates_must_be_array");
    if ((payload.discovery_audit as unknown[]).length > 50) throw new Error("discovery_audit_too_many_candidates");
    for (const item of payload.discovery_audit as unknown[]) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("discovery_audit_candidate_must_be_object");
    }
    return "discovery_audit";
  }

  for (const key of ["slug", "headline", "category_slug", "body_markdown"]) {
    if (typeof payload[key] !== "string" || !(payload[key] as string).trim()) throw new Error(`missing_${key}`);
  }
  if (!/^[a-z0-9][a-z0-9-]{1,179}$/.test(payload.slug as string)) throw new Error("invalid_slug");
  if (!Array.isArray(payload.source_metadata ?? [])) throw new Error("invalid_source_metadata");
  if (payload.editorial_metadata != null && (typeof payload.editorial_metadata !== "object" || Array.isArray(payload.editorial_metadata))) throw new Error("invalid_editorial_metadata");

  const normalizedKind = normalizeKind(payload.kind, payload.category_slug);
  payload.kind = normalizedKind;
  const metadata = (payload.editorial_metadata ?? {}) as Json;
  if (metadata.discovery_audit != null) {
    if (!Array.isArray(metadata.discovery_audit)) throw new Error("discovery_audit_candidates_must_be_array");
    if ((metadata.discovery_audit as unknown[]).length > 50) throw new Error("discovery_audit_too_many_candidates");
  }

  if (normalizedKind === "magazine") {
    const topicKey = String(metadata.topic_key ?? "").trim();
    if (!topicKey) throw new Error("magazine_topic_key_required");
    const storyKind = String(metadata.story_kind ?? "evergreen_explainer").trim();
    if (!ALLOWED_MAGAZINE_STORY_KINDS.has(storyKind)) throw new Error("magazine_story_kind_invalid");
    metadata.story_kind = storyKind;
    payload.editorial_metadata = metadata;
    if (storyKind === "followup") {
      if (!String(metadata.followup_parent_article_id ?? "").trim()) throw new Error("followup_requires_parent");
      const reason = String(metadata.followup_reason ?? "").trim();
      if (!ALLOWED_FOLLOWUP_REASONS.has(reason)) throw new Error("followup_requires_reason");
      if (!String(payload.story_cluster_id ?? "").trim()) throw new Error("followup_requires_cluster");
    }
  }
  return "article";
}

async function callRpc(name: string, args: Json) {
  const response = await fetch(`${PROJECT_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!response.ok) throw new Error(`rpc_${response.status}:${typeof parsed === "string" ? parsed.slice(0, 400) : JSON.stringify(parsed).slice(0, 400)}`);
  return parsed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return json({ ok: true, service: "chatgpt-publish-bridge" });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!PROJECT_URL || !SERVICE_ROLE_KEY) return json({ error: "server_credentials_missing" }, 503);
  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "missing_oidc" }, 401);
    const claims = await verifyGithubOidc(auth.slice(7));
    const payload = await req.json() as Json;
    const payloadType = validatePayload(payload);
    if (payloadType === "discovery_audit") {
      const count = await callRpc("ingest_github_discovery_audit_payload", { p_payload: payload });
      return json({ ok: true, audit_count: count, run_id: claims.run_id ?? null });
    }
    const articleId = await callRpc("ingest_github_publish_payload", { p_payload: payload });
    return json({ ok: true, article_id: articleId, run_id: claims.run_id ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const authError = /jwt|issuer|audience|repository|event|workflow|signature|jwks|expired|oidc/.test(message);
    return json({ error: message }, authError ? 401 : 422);
  }
});
