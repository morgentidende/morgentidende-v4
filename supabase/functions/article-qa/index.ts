import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMERGENCY_HERO_URL = "https://morgentidende.dk/morgentidende-sun.png";

const restHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

function stripOrdinaryBodyLinks(markdown: string): string {
  return String(markdown ?? "")
    .replace(/(?<!!)\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/<a\b[^>]*>(.*?)<\/a>/gis, "$1");
}

function deterministicWarnings(article: any): string[] {
  const text = `${article.headline ?? ""}\n${article.deck ?? ""}\n${article.body_markdown ?? ""}`;
  const warnings: string[] = [];
  const leakPatterns = [/den (?:indvending|formulering) skal stå som/iu,/avisen(?:s)? egen konklusion/iu,/morgentidende (?:skal|må|bør)/iu,/redaktionel(?:le)? (?:regel|instruks|arbejdstekst)/iu,/skriv (?:artiklen|det|denne) (?:så|som|med)/iu];
  if (leakPatterns.some((p) => p.test(text))) warnings.push("possible_editorial_instruction_leakage");
  if (/\bfagfællebedømt\b|\bpeer[- ]reviewed\b|\brandomiseret\b|\bdobbeltblind\b/iu.test(text)) warnings.push("unnecessary_research_jargon");
  const paragraphs = String(article.body_markdown ?? "").split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 50);
  const seen = new Set<string>();
  for (const p of paragraphs) {
    const key = p.toLocaleLowerCase("da-DK");
    if (seen.has(key)) { warnings.push("duplicate_paragraph"); break; }
    seen.add(key);
  }
  if (/(^|\n)##\s+([^\n]+)\n\n##\s+\2($|\n)/iu.test(article.body_markdown ?? "")) warnings.push("duplicate_heading");
  if (/(?<!!)\[[^\]]+\]\(https?:\/\/[^)]+\)/i.test(article.body_markdown ?? "") || /<a\b[^>]*href=/i.test(article.body_markdown ?? "")) warnings.push("ordinary_body_hyperlink");
  if (!article.hero_url) warnings.push("missing_hero");
  return warnings;
}

async function patch(path: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "PATCH", headers: { ...restHeaders, Prefer: "return=minimal" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${path}: ${r.status} ${await r.text()}`);
}

async function heroLoads(url: string | null): Promise<boolean> {
  if (!url) return false;
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(7000) });
    if (r.status === 405 || r.status === 403) r = await fetch(url, { method: "GET", redirect: "follow", headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return false;
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    return ct.startsWith("image/") || /\.(?:jpe?g|png|webp|gif|avif|svg)(?:\?|$)/i.test(url);
  } catch { return false; }
}

Deno.serve(async () => {
  const jobsResp = await fetch(`${SUPABASE_URL}/rest/v1/article_qa_runs?status=eq.pending&select=id,article_id,created_at&order=created_at.asc&limit=20`, { headers: restHeaders });
  if (!jobsResp.ok) return new Response(await jobsResp.text(), { status: 500 });
  const jobs = await jobsResp.json();
  const results: any[] = [];

  for (const job of jobs) {
    const started = Date.now();
    try {
      await patch(`article_qa_runs?id=eq.${job.id}&status=eq.pending`, { status: "running", started_at: new Date(started).toISOString(), engine: "deterministic-only", updated_at: new Date().toISOString() });
      const aResp = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${job.article_id}&select=id,headline,deck,body_markdown,source_metadata,hero_url,hero_alt,hero_media_id,publish_at,published_at,is_breaking&limit=1`, { headers: restHeaders });
      if (!aResp.ok) throw new Error(`article fetch ${aResp.status}`);
      const [article] = await aResp.json();
      if (!article) throw new Error("article_not_found");

      const warnings = deterministicWarnings(article);
      const fixes: string[] = [];

      const strippedBody = stripOrdinaryBodyLinks(article.body_markdown ?? "");
      if (strippedBody !== (article.body_markdown ?? "")) {
        await patch(`articles?id=eq.${article.id}`, { body_markdown: strippedBody, editorial_updated_at: new Date().toISOString() });
        article.body_markdown = strippedBody;
        fixes.push("ordinary_body_hyperlinks_removed");
      }

      if (article.hero_url && !(await heroLoads(article.hero_url))) {
        await patch(`articles?id=eq.${article.id}`, { hero_url: EMERGENCY_HERO_URL, hero_media_id: null, hero_alt: "Morgentidende" });
        fixes.push("broken_hero_replaced_with_emergency_fallback");
        warnings.push("broken_hero_url");
      }

      const finished = Date.now();
      const finalWarnings = Array.from(new Set(warnings));
      const finalStatus = finalWarnings.length ? "warnings" : "passed";
      await patch(`article_qa_runs?id=eq.${job.id}`, { status: finalStatus, finished_at: new Date(finished).toISOString(), duration_ms: finished - started, fixes_applied: fixes, warnings: finalWarnings, engine: "deterministic-only", updated_at: new Date().toISOString() });
      results.push({ id: job.id, status: finalStatus, duration_ms: finished - started, engine: "deterministic-only" });
    } catch (e) {
      const finished = Date.now();
      await patch(`article_qa_runs?id=eq.${job.id}`, { status: "failed", finished_at: new Date(finished).toISOString(), duration_ms: finished - started, warnings: [String((e as any)?.message ?? e)], updated_at: new Date().toISOString() }).catch(() => {});
      results.push({ id: job.id, status: "failed", duration_ms: finished - started });
    }
  }
  return Response.json({ processed: results.length, results });
});
