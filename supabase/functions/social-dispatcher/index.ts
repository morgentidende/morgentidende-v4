import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOCIAL_PUBLISHER_URL = (Deno.env.get("SOCIAL_PUBLISHER_URL") || "").replace(/\/$/, "");
const SOCIAL_PUBLISHER_TOKEN = Deno.env.get("SOCIAL_PUBLISHER_TOKEN") || "";
const RUNNER_HEADER = "x-morgentidende-social-runner-token";

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

type Network = "facebook" | "instagram";

type Policy = {
  enabled?: boolean;
  start_at?: string | null;
  base_url?: string;
  timezone?: string;
  min_provider_lead_seconds?: number;
  facebook?: { enabled?: boolean; delay_seconds?: number; exclude_categories?: string[] };
  instagram?: { enabled?: boolean; delay_seconds?: number; exclude_categories?: string[] };
};

type Article = {
  id: string;
  slug: string;
  headline: string;
  deck: string | null;
  hero_url: string | null;
  hero_media_id: string | null;
  published_at: string;
  category_id: string | null;
  kind: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...restHeaders, ...(init.headers || {}) },
  });
}

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await rest(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`RPC ${name}: ${response.status} ${await response.text()}`);
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function authorize(req: Request) {
  const token = (req.headers.get(RUNNER_HEADER) || "").trim();
  if (!token) return false;
  try {
    return await rpc("authorize_social_dispatcher_runner", { p_token: token }) === true;
  } catch {
    return false;
  }
}

async function getPolicy(): Promise<Policy | null> {
  const response = await rest("site_settings?key=eq.social_distribution_policy&select=value&limit=1");
  if (!response.ok) throw new Error(`policy_fetch_failed:${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows[0]?.value ? rows[0].value as Policy : null;
}

async function getCategories(): Promise<Map<string, string>> {
  const response = await rest("categories?select=id,name");
  if (!response.ok) throw new Error(`categories_fetch_failed:${response.status}`);
  const rows = await response.json();
  return new Map((Array.isArray(rows) ? rows : []).map((row: any) => [String(row.id), String(row.name)]));
}

async function getArticles(startAt: string): Promise<Article[]> {
  const params = new URLSearchParams({
    status: "eq.published",
    published_at: `gte.${startAt}`,
    select: "id,slug,headline,deck,hero_url,hero_media_id,published_at,category_id,kind",
    order: "published_at.asc",
    limit: "100",
  });
  const response = await rest(`articles?${params.toString()}`);
  if (!response.ok) throw new Error(`articles_fetch_failed:${response.status}:${await response.text()}`);
  return await response.json();
}

async function getHeroMeta(ids: string[]) {
  const map = new Map<string, { altText: string | null; ai: boolean }>();
  if (!ids.length) return map;
  const quoted = ids.map((id) => `"${id}"`).join(",");
  const response = await rest(`media_assets?id=in.(${encodeURIComponent(quoted)})&select=id,alt_text,source_provider`);
  if (!response.ok) return map;
  const rows = await response.json();
  for (const row of Array.isArray(rows) ? rows : []) {
    const provider = String(row.source_provider || "").toLowerCase();
    map.set(String(row.id), {
      altText: row.alt_text ? String(row.alt_text) : null,
      ai: provider.startsWith("openai_image_gen"),
    });
  }
  return map;
}

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

function buildText(network: Network, article: Article, category: string, baseUrl: string) {
  const headline = clean(article.headline);
  const deck = clean(article.deck);
  const articleUrl = `${baseUrl.replace(/\/$/, "")}/artikel/${encodeURIComponent(article.slug)}`;
  if (network === "facebook") {
    return [headline, deck, `Læs hele historien: ${articleUrl}`].filter(Boolean).join("\n\n");
  }
  const host = new URL(baseUrl).hostname.replace(/^www\./, "");
  const categoryLine = category ? `${category} på ${host}` : host;
  return [headline, deck, `Læs hele artiklen: ${categoryLine}`].filter(Boolean).join("\n\n");
}

function excluded(category: string, values: unknown) {
  return Array.isArray(values) && values.map((v) => String(v).toLowerCase()).includes(category.toLowerCase());
}

function plannedTime(articlePublishedAt: string, delaySeconds: number, minLeadSeconds: number) {
  const now = Date.now();
  const desired = new Date(articlePublishedAt).getTime() + Math.max(0, delaySeconds) * 1000;
  const floor = now + Math.max(60, minLeadSeconds) * 1000;
  return new Date(Math.max(desired, floor)).toISOString();
}

async function insertSocialRows(rows: Record<string, unknown>[]) {
  if (!rows.length) return 0;
  const response = await rest("social_posts?on_conflict=article_id,network,variant_key", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`social_insert_failed:${response.status}:${await response.text()}`);
  const inserted = await response.json();
  return Array.isArray(inserted) ? inserted.length : 0;
}

async function getReadyPosts() {
  const response = await rest("social_posts?status=eq.ready&select=id,article_id,network,post_text,media_urls,media_alt_text,scheduled_for,metadata&order=scheduled_for.asc&limit=50");
  if (!response.ok) throw new Error(`social_ready_fetch_failed:${response.status}`);
  return await response.json();
}

async function patchPost(id: string, patch: Record<string, unknown>) {
  const response = await rest(`social_posts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`social_patch_failed:${response.status}:${await response.text()}`);
}

async function dispatch(post: any, policy: Policy) {
  if (!SOCIAL_PUBLISHER_URL || !SOCIAL_PUBLISHER_TOKEN) {
    throw new Error("social_publisher_not_configured");
  }

  const minLead = Math.max(60, Number(policy.min_provider_lead_seconds ?? 120));
  const original = new Date(post.scheduled_for).getTime();
  const publishAt = new Date(Math.max(original || 0, Date.now() + minLead * 1000)).toISOString();
  const metadata = post.metadata && typeof post.metadata === "object" ? post.metadata : {};

  let response: Response;
  try {
    response = await fetch(`${SOCIAL_PUBLISHER_URL}/schedule`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${SOCIAL_PUBLISHER_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        network: post.network,
        text: post.post_text,
        publishAt,
        timezone: policy.timezone || "Europe/Copenhagen",
        mediaUrls: Array.isArray(post.media_urls) ? post.media_urls : [],
        mediaAltText: Array.isArray(post.media_alt_text) ? post.media_alt_text : [],
        isAiGenerated: Boolean(metadata.hero_ai_generated),
      }),
    });
  } catch (error) {
    await patchPost(post.id, {
      status: "failed",
      attempts: 1,
      last_error_code: "provider_outcome_unknown",
      last_error: String((error as Error)?.message || error),
    });
    return { id: post.id, status: "failed", reason: "provider_outcome_unknown" };
  }

  const raw = await response.text();
  let body: any = raw;
  try { body = JSON.parse(raw); } catch { /* keep raw */ }

  if (!response.ok || body?.ok !== true) {
    await patchPost(post.id, {
      status: "failed",
      attempts: 1,
      last_error_code: String(body?.error || `provider_http_${response.status}`),
      last_error: typeof raw === "string" ? raw.slice(0, 4000) : "provider_error",
    });
    return { id: post.id, status: "failed", reason: body?.error || response.status };
  }

  await patchPost(post.id, {
    status: "scheduled",
    scheduled_for: publishAt,
    attempts: 1,
    provider_ref: body,
    last_error_code: null,
    last_error: null,
  });
  return { id: post.id, status: "scheduled", network: post.network, scheduled_for: publishAt };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!(await authorize(req))) return json({ ok: false, error: "unauthorized_runner" }, 403);

  try {
    const policy = await getPolicy();
    if (!policy?.enabled) return json({ ok: true, enabled: false, inserted: 0, dispatched: [] });
    if (!policy.start_at) return json({ ok: false, error: "social_policy_start_at_required" }, 409);

    const baseUrl = clean(policy.base_url || "https://morgentidende.dk");
    const categories = await getCategories();
    const articles = await getArticles(String(policy.start_at));
    const heroIds = articles.map((a) => a.hero_media_id).filter((id): id is string => Boolean(id));
    const heroMeta = await getHeroMeta(heroIds);
    const rows: Record<string, unknown>[] = [];
    const minLead = Math.max(60, Number(policy.min_provider_lead_seconds ?? 120));

    for (const article of articles) {
      const category = article.category_id ? (categories.get(article.category_id) || "") : "";
      const hero = article.hero_media_id ? heroMeta.get(article.hero_media_id) : undefined;
      const networks: Network[] = ["facebook", "instagram"];

      for (const network of networks) {
        const cfg = policy[network] || {};
        if (cfg.enabled === false) continue;
        if (excluded(category, cfg.exclude_categories)) continue;
        if (network === "instagram" && !article.hero_url) continue;

        const mediaUrls = article.hero_url ? [article.hero_url] : [];
        const alt = hero?.altText || article.headline;
        rows.push({
          article_id: article.id,
          network,
          variant_key: "primary",
          status: "ready",
          post_text: buildText(network, article, category, baseUrl),
          media_urls: mediaUrls,
          media_alt_text: mediaUrls.length ? [alt] : [],
          scheduled_for: plannedTime(article.published_at, Number(cfg.delay_seconds ?? (network === "facebook" ? 120 : 300)), minLead),
          metadata: {
            article_slug: article.slug,
            article_url: `${baseUrl.replace(/\/$/, "")}/artikel/${article.slug}`,
            category,
            article_kind: article.kind,
            hero_ai_generated: Boolean(hero?.ai),
          },
        });
      }
    }

    const inserted = await insertSocialRows(rows);
    const ready = await getReadyPosts();
    const dispatched = [];
    for (const post of Array.isArray(ready) ? ready : []) {
      dispatched.push(await dispatch(post, policy));
    }

    return json({ ok: true, enabled: true, articles_seen: articles.length, inserted, dispatched });
  } catch (error) {
    return json({ ok: false, error: String((error as Error)?.message || error) }, 500);
  }
});
