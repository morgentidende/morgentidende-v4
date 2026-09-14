import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const restHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function restFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...restHeaders, ...(init.headers || {}) } });
  if (RETRYABLE.has(response.status)) {
    await sleep(250);
    response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...restHeaders, ...(init.headers || {}) } });
  }
  return response;
}

function normalizeEscapedMarkdown(markdown: string): string {
  let value = String(markdown ?? "");
  const hasRealNewlines = /\r?\n/.test(value);
  const escapedBreaks = (value.match(/\\n/g) || []).length;
  if (!hasRealNewlines && escapedBreaks >= 2) value = value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  return value.replace(/\r\n/g, "\n");
}

function stripOrdinaryBodyLinks(markdown: string): string {
  return String(markdown ?? "")
    .replace(/(?<!!)\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/<a\b[^>]*>(.*?)<\/a>/gis, "$1");
}

function stripTrailingManualSources(markdown: string, sourceMetadata: unknown): string {
  if (!Array.isArray(sourceMetadata) || sourceMetadata.length === 0) return String(markdown ?? "");
  return String(markdown ?? "").replace(/\n{2,}#{2,4}\s+Kilder\s*\n[\s\S]*$/iu, "").trimEnd();
}

function normalizeHeroUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    for (const key of ["w", "width", "h", "height", "q", "quality", "fit", "fm", "format", "auto"]) u.searchParams.delete(key);
    u.hash = "";
    return u.toString();
  } catch { return raw.trim(); }
}

function deterministicWarnings(article: any): string[] {
  const text = `${article.headline ?? ""}\n${article.deck ?? ""}\n${article.body_markdown ?? ""}`;
  const warnings: string[] = [];
  const leakPatterns = [/den (?:indvending|formulering) skal stå som/iu,/avisen(?:s)? egen konklusion/iu,/morgentidende (?:skal|må|bør)/iu,/redaktionel(?:le)? (?:regel|instruks|arbejdstekst)/iu,/skriv (?:artiklen|det|denne) (?:så|som|med)/iu];
  if (leakPatterns.some((p) => p.test(text))) warnings.push("possible_editorial_instruction_leakage");
  if (/\bfagfællebedømt\b|\bpeer[- ]reviewed\b|\brandomiseret\b|\bdobbeltblind\b/iu.test(text)) warnings.push("unnecessary_research_jargon");
  if (/\\n(?:\\n)?#{1,6}\s|\\n\\n/.test(String(article.body_markdown ?? ""))) warnings.push("escaped_markdown_whitespace");
  const paragraphs = String(article.body_markdown ?? "").split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 50);
  const seen = new Set<string>();
  for (const p of paragraphs) {
    const key = p.toLocaleLowerCase("da-DK");
    if (seen.has(key)) { warnings.push("duplicate_paragraph"); break; }
    seen.add(key);
  }
  if (/(^|\n)##\s+([^\n]+)\n\n##\s+\2($|\n)/iu.test(article.body_markdown ?? "")) warnings.push("duplicate_heading");
  if (/(?<!!)\[[^\]]+\]\(https?:\/\/[^)]+\)/i.test(article.body_markdown ?? "") || /<a\b[^>]*href=/i.test(article.body_markdown ?? "")) warnings.push("ordinary_body_hyperlink");
  if (/\n{2,}#{2,4}\s+Kilder\s*\n/iu.test(article.body_markdown ?? "") && Array.isArray(article.source_metadata) && article.source_metadata.length) warnings.push("manual_source_section_with_structured_sources");
  if (!article.hero_url) warnings.push("missing_hero");
  return warnings;
}

function sourceQualityWarnings(sourceQuality: any): string[] {
  const gate = String(sourceQuality?.gate ?? "");
  const reason = String(sourceQuality?.reason ?? "unknown");
  if (gate === "block") return [`source_quality_block:${reason}`];
  if (gate === "warn") return [`source_quality_warn:${reason}`];
  return [];
}

async function patch(path: string, body: unknown) {
  const r = await restFetch(path, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${path}: ${r.status} ${await r.text()}`);
}

async function heroLoads(url: string | null): Promise<boolean> {
  if (!url) return false;
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(7000) });
    if (r.status === 405 || r.status === 403) r = await fetch(url, { method: "GET", redirect: "follow", headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return false;
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    return ct.startsWith("image/") || /\.(?:jpe?g|png|webp|gif|avif)(?:\?|$)/i.test(url);
  } catch { return false; }
}

async function duplicateHeroOnFrontpage(article: any): Promise<boolean> {
  if (!article.hero_url) return false;
  const select = "id,hero_url,hero_media_id,published_at";
  const r = await restFetch(`v4_public_articles?select=${select}&id=neq.${article.id}&order=published_at.desc&limit=40`);
  if (!r.ok) return false;
  const rows = await r.json();
  const normalized = normalizeHeroUrl(article.hero_url);
  return rows.some((row: any) => {
    if (article.hero_media_id && row.hero_media_id && article.hero_media_id === row.hero_media_id) return true;
    return normalized && normalizeHeroUrl(row.hero_url) === normalized;
  });
}

Deno.serve(async () => {
  const jobsResp = await restFetch("article_qa_runs?status=eq.pending&select=id,article_id,created_at,content_hash,source_quality&order=created_at.asc&limit=20");
  if (!jobsResp.ok) return new Response(await jobsResp.text(), { status: 500 });
  const jobs = await jobsResp.json();
  const results: any[] = [];

  for (const job of jobs) {
    const started = Date.now();
    try {
      await patch(`article_qa_runs?id=eq.${job.id}&status=eq.pending`, { status: "running", started_at: new Date(started).toISOString(), engine: "deterministic-v2", updated_at: new Date().toISOString() });
      const aResp = await restFetch(`articles?id=eq.${job.article_id}&select=id,headline,deck,body_markdown,hero_url,hero_media_id,source_metadata&limit=1`);
      if (!aResp.ok) throw new Error(`article fetch ${aResp.status}`);
      const [article] = await aResp.json();
      if (!article) throw new Error("article_not_found");

      const fixes: string[] = [];
      const originalBody = String(article.body_markdown ?? "");
      const normalizedBody = normalizeEscapedMarkdown(originalBody);
      if (normalizedBody !== originalBody) {
        await patch(`articles?id=eq.${article.id}`, { body_markdown: normalizedBody, editorial_updated_at: new Date().toISOString() });
        article.body_markdown = normalizedBody;
        fixes.push("escaped_markdown_whitespace_normalized");
      }

      const withoutManualSources = stripTrailingManualSources(article.body_markdown ?? "", article.source_metadata);
      if (withoutManualSources !== (article.body_markdown ?? "")) {
        await patch(`articles?id=eq.${article.id}`, { body_markdown: withoutManualSources, editorial_updated_at: new Date().toISOString() });
        article.body_markdown = withoutManualSources;
        fixes.push("manual_source_section_removed");
      }

      const warnings = [...deterministicWarnings(article), ...sourceQualityWarnings(job.source_quality)];
      const strippedBody = stripOrdinaryBodyLinks(article.body_markdown ?? "");
      if (strippedBody !== (article.body_markdown ?? "")) {
        await patch(`articles?id=eq.${article.id}`, { body_markdown: strippedBody, editorial_updated_at: new Date().toISOString() });
        article.body_markdown = strippedBody;
        fixes.push("ordinary_body_hyperlinks_removed");
      }

      if (article.hero_url && !(await heroLoads(article.hero_url))) {
        warnings.push("broken_hero_url");
      }

      if (await duplicateHeroOnFrontpage(article)) warnings.push("duplicate_frontpage_hero");

      const finished = Date.now();
      const finalWarnings = Array.from(new Set(warnings));
      const finalStatus = finalWarnings.length ? "warnings" : "passed";
      await patch(`article_qa_runs?id=eq.${job.id}`, {
        status: finalStatus,
        finished_at: new Date(finished).toISOString(),
        duration_ms: finished - started,
        fixes_applied: fixes,
        warnings: finalWarnings,
        engine: "deterministic-v2",
        updated_at: new Date().toISOString()
      });
      results.push({ id: job.id, status: finalStatus, duration_ms: finished - started, engine: "deterministic-v2", content_hash: job.content_hash });
    } catch (e) {
      const finished = Date.now();
      await patch(`article_qa_runs?id=eq.${job.id}`, { status: "failed", finished_at: new Date(finished).toISOString(), duration_ms: finished - started, warnings: [String((e as any)?.message ?? e)], updated_at: new Date().toISOString() }).catch(() => {});
      results.push({ id: job.id, status: "failed", duration_ms: finished - started, content_hash: job.content_hash });
    }
  }
  return Response.json({ processed: results.length, results });
});
