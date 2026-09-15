import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPECTED_AUD = "morgentidende-publish-bridge";
const EXPECTED_REPO = "morgentidende/morgentidende-v4";
const ISSUER = "https://token.actions.githubusercontent.com";
const ALLOWED_MAGAZINE_STORY_KINDS = new Set(["evergreen_explainer", "followup", "new_study", "update"]);
const ALLOWED_FOLLOWUP_REASONS = new Set(["new_fact", "official_response", "arrest", "new_data", "court_decision", "material_update"]);
const ALLOWED_KINDS = new Set(["news", "comment", "debate", "magazine"]);

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

function validatePayload(payload: Json) {
  for (const key of ["queue_id", "slug", "headline", "category_slug", "body_markdown"]) {
    if (typeof payload[key] !== "string" || !(payload[key] as string).trim()) throw new Error(`missing_${key}`);
  }
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(payload.queue_id as string)) throw new Error("invalid_queue_id");
  if (!/^[a-z0-9][a-z0-9-]{1,179}$/.test(payload.slug as string)) throw new Error("invalid_slug");
  if (!Array.isArray(payload.source_metadata ?? [])) throw new Error("invalid_source_metadata");
  if (payload.editorial_metadata != null && (typeof payload.editorial_metadata !== "object" || Array.isArray(payload.editorial_metadata))) {
    throw new Error("invalid_editorial_metadata");
  }

  const normalizedKind = normalizeKind(payload.kind, payload.category_slug);
  payload.kind = normalizedKind;

  if (normalizedKind === "magazine") {
    const metadata = (payload.editorial_metadata ?? {}) as Json;
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
}

async function ingest(payload: Json) {
  const response = await fetch(`${PROJECT_URL}/rest/v1/rpc/ingest_github_publish_payload`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ p_payload: payload }),
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
    validatePayload(payload);
    const articleId = await ingest(payload);
    return json({ ok: true, article_id: articleId, run_id: claims.run_id ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const authError = /jwt|issuer|audience|repository|event|signature|jwks|expired|oidc/.test(message);
    return json({ error: message }, authError ? 401 : 422);
  }
});
