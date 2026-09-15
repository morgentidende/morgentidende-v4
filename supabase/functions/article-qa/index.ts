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

async function rpc(name: string, body: Record<string, unknown>): Promise<any> {
  const response = await restFetch(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`RPC ${name}: ${response.status} ${await response.text()}`);
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
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
    for (const key of ["w", "width", "h", "height", "q", "quality", "fit", "fm", "format", "auto", "ixid", "ixlib"]) u.searchParams.delete(key);
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

type DuplicateHeroResult = "duplicate" | "clear" | "unavailable";

async function duplicateHeroOnFrontpage(article: any): Promise<DuplicateHeroResult> {
  if (!article.hero_url && !article.hero_media_id) return "clear";
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const select = "id,hero_url,hero_media_id,story_cluster_id,published_at";
  const r = await restFetch(`articles?select=${select}&status=eq.published&published_at=gte.${since}&id=neq.${article.id}&order=published_at.desc&limit=200`);
  if (!r.ok) {
    console.error(`duplicate_hero_query_failed status=${r.status} body=${(await r.text()).slice(0, 300)}`);
    return "unavailable";
  }
  const rows = await r.json();
  const normalized = normalizeHeroUrl(article.hero_url);
  const now = Date.now();
  const duplicate = rows.some((row: any) => {
    const publishedAt = row.published_at ? Date.parse(row.published_at) : NaN;
    if (Number.isFinite(publishedAt) && publishedAt > now) return false;
    if (article.story_cluster_id && row.story_cluster_id && article.story_cluster_id === row.story_cluster_id) return false;
    if (article.hero_media_id && row.hero_media_id && article.hero_media_id === row.hero_media_id) return true;
    return Boolean(normalized && normalizeHeroUrl(row.hero_url) === normalized);
  });
  return duplicate ? "duplicate" : "clear";
}

function firstRow(value: any): any {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function finishJob(job: any, expectedHash: string | null, status: string, started: number, warnings: string[], fixes: string[]) {
  return rpc("finish_article_qa_run", {
    p_job_id: job.id,
    p_claim_token: job.claim_token,
    p_expected_hash: expectedHash,
    p_status: status,
    p_duration_ms: Date.now() - started,
    p_warnings: warnings,
    p_fixes_applied: fixes,
    p_engine: "deterministic-v2",
  });
}

Deno.serve(async () => {
  const results: any[] = [];

  try {
    await rpc("reclaim_stale_article_qa_jobs", { p_timeout: "10 minutes" });
  } catch (error) {
    return new Response(`qa_reclaim_failed:${String((error as any)?.message ?? error)}`, { status: 500 });
  }

  let jobs: any[] = [];
  try {
    const claimed = await rpc("claim_article_qa_jobs", { p_limit: 20 });
    jobs = Array.isArray(claimed) ? claimed : [];
  } catch (error) {
    return new Response(`qa_claim_failed:${String((error as any)?.message ?? error)}`, { status: 500 });
  }

  for (const job of jobs) {
    const started = Date.now();
    let expectedHash: string | null = job.content_hash ?? null;
    const fixes: string[] = [];

    try {
      if (!job.claim_token || !expectedHash) {
        await finishJob(job, expectedHash, "superseded", started, ["unverifiable_legacy_qa_run"], fixes).catch(() => null);
        results.push({ id: job.id, status: "superseded", reason: "unverifiable_legacy_qa_run" });
        continue;
      }

      const matches = await rpc("article_qa_claim_matches_live", { p_job_id: job.id, p_claim_token: job.claim_token, p_expected_hash: expectedHash });
      if (matches !== true) {
        await finishJob(job, expectedHash, "superseded", started, ["stale_before_processing"], fixes).catch(() => null);
        results.push({ id: job.id, status: "superseded", reason: "stale_before_processing" });
        continue;
      }

      const aResp = await restFetch(`articles?id=eq.${job.article_id}&select=id,headline,deck,body_markdown,hero_url,hero_media_id,story_cluster_id,source_metadata&limit=1`);
      if (!aResp.ok) throw new Error(`article fetch ${aResp.status}`);
      const [article] = await aResp.json();
      if (!article) {
        await finishJob(job, expectedHash, "failed", started, ["article_not_found"], fixes).catch(() => null);
        results.push({ id: job.id, status: "failed", reason: "article_not_found" });
        continue;
      }

      const originalBody = String(article.body_markdown ?? "");
      let proposedBody = normalizeEscapedMarkdown(originalBody);
      if (proposedBody !== originalBody) fixes.push("escaped_markdown_whitespace_normalized");

      const withoutManualSources = stripTrailingManualSources(proposedBody, article.source_metadata);
      if (withoutManualSources !== proposedBody) fixes.push("manual_source_section_removed");
      proposedBody = withoutManualSources;

      const strippedBody = stripOrdinaryBodyLinks(proposedBody);
      if (strippedBody !== proposedBody) fixes.push("ordinary_body_hyperlinks_removed");
      proposedBody = strippedBody;

      if (proposedBody !== originalBody) {
        const appliedResult = firstRow(await rpc("apply_article_qa_body_fix", {
          p_job_id: job.id,
          p_claim_token: job.claim_token,
          p_expected_hash: expectedHash,
          p_body_markdown: proposedBody,
        }));

        if (!appliedResult?.applied || !appliedResult?.new_hash) {
          await finishJob(job, expectedHash, "superseded", started, [String(appliedResult?.reason ?? "qa_fix_claim_lost")], fixes).catch(() => null);
          results.push({ id: job.id, status: "superseded", reason: appliedResult?.reason ?? "qa_fix_claim_lost" });
          continue;
        }

        expectedHash = String(appliedResult.new_hash);
        article.body_markdown = proposedBody;
      }

      const warnings = [...deterministicWarnings(article), ...sourceQualityWarnings(job.source_quality)];
      if (article.hero_url && !(await heroLoads(article.hero_url))) warnings.push("broken_hero_url");
      const heroDuplicate = await duplicateHeroOnFrontpage(article);
      if (heroDuplicate === "duplicate") warnings.push("duplicate_frontpage_hero");
      if (heroDuplicate === "unavailable") warnings.push("duplicate_hero_check_unavailable");

      const finalWarnings = Array.from(new Set(warnings));
      const finalStatus = finalWarnings.length ? "warnings" : "passed";
      const finishedRow = firstRow(await finishJob(job, expectedHash, finalStatus, started, finalWarnings, fixes));

      if (!finishedRow) {
        results.push({ id: job.id, status: "ownership_lost", content_hash: expectedHash });
        continue;
      }

      results.push({ id: job.id, status: finishedRow.status ?? finalStatus, duration_ms: Date.now() - started, engine: "deterministic-v2", content_hash: expectedHash });
    } catch (e) {
      const message = String((e as any)?.message ?? e);
      await finishJob(job, expectedHash, "failed", started, [message], fixes).catch(() => null);
      results.push({ id: job.id, status: "failed", duration_ms: Date.now() - started, content_hash: expectedHash, error: message });
    }
  }

  return Response.json({ processed: results.length, results });
});
