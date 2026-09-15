const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

const nepaliDigits = new Map([
  ['०', '0'], ['१', '1'], ['२', '2'], ['३', '3'], ['४', '4'],
  ['५', '5'], ['६', '6'], ['७', '7'], ['८', '8'], ['९', '9'],
]);

function assertEnv(env) {
  for (const name of REQUIRED_ENV) {
    if (!env[name]) throw new Error(`Missing ${name}`);
  }
}

function supabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  };
}

async function supabaseGet(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}${path}`, {
    headers: supabaseHeaders(env),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase GET ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function supabaseRpc(env, name, payload) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase RPC ${name} ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function htmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDigits(value) {
  return [...String(value)].map((ch) => nepaliDigits.get(ch) ?? ch).join('');
}

function parseNumberPhrase(value) {
  const normalized = normalizeDigits(value)
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^\d+$/.test(normalized)) return Number(normalized);

  const tokens = normalized.split(' ');
  const units = new Map([
    ['सय', 100],
    ['हजार', 1000],
    ['लाख', 100000],
    ['करोड', 10000000],
  ]);

  let total = 0;
  let sawNumber = false;
  for (let i = 0; i < tokens.length; i += 1) {
    if (!/^\d+$/.test(tokens[i])) continue;
    sawNumber = true;
    const n = Number(tokens[i]);
    const unit = units.get(tokens[i + 1]);
    if (unit) {
      total += n * unit;
      i += 1;
    } else {
      total += n;
    }
  }
  return sawNumber ? total : null;
}

function extractFields(text, fieldPatterns = {}) {
  const metrics = {};
  const errors = [];

  for (const [field, patterns] of Object.entries(fieldPatterns)) {
    const candidates = Array.isArray(patterns) ? patterns : [patterns];
    let found = null;
    for (const pattern of candidates) {
      try {
        const match = text.match(new RegExp(pattern, 'iu'));
        if (match?.[1]) {
          found = parseNumberPhrase(match[1]);
          if (Number.isFinite(found)) break;
        }
      } catch (error) {
        errors.push(`${field}: invalid regex (${String(error)})`);
      }
    }
    if (Number.isFinite(found)) metrics[field] = found;
  }

  return { metrics, errors };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchAdapter(adapterId, config) {
  if (!config?.url) throw new Error(`${adapterId}: missing url`);
  if (!['html_regex', 'html_bulletin'].includes(config.kind)) {
    throw new Error(`${adapterId}: unsupported adapter kind ${String(config.kind)}`);
  }

  const response = await fetch(config.url, {
    headers: {
      'user-agent': 'Morgentidende-Livecenter/1.0 (+https://morgentidende.dk)',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`${adapterId}: source HTTP ${response.status}`);

  const raw = await response.text();
  const text = htmlToText(raw);
  const { metrics, errors } = extractFields(text, config.field_patterns || {});
  return {
    adapterId,
    sourceName: config.source_name || adapterId,
    sourceUrl: config.url,
    rawHash: await sha256(text),
    metrics,
    errors,
    checkedAt: new Date().toISOString(),
  };
}

function isCenterActive(center, nowMs) {
  if (!center.homepage_active) return false;
  if (!['live', 'scheduled'].includes(center.status)) return false;
  if (center.starts_at && Date.parse(center.starts_at) > nowMs) return false;
  if (center.ends_at && Date.parse(center.ends_at) <= nowMs) return false;
  return true;
}

function dueForPoll(center, nowMs) {
  const pollSeconds = Number(center?.cadence?.metrics_poll_seconds || 300);
  const last = center.source_checked_at ? Date.parse(center.source_checked_at) : 0;
  if (!Number.isFinite(last) || last <= 0) return true;
  return nowMs - last >= Math.max(60, pollSeconds) * 1000 - 5000;
}

function composeMetrics(center, adapterResults) {
  const cfg = center.adapter_config || {};
  const fieldSources = cfg.field_sources || {};
  const required = Array.isArray(cfg.required_metrics) ? cfg.required_metrics : Object.keys(fieldSources);
  const byId = new Map(adapterResults.map((result) => [result.adapterId, result]));
  const next = { ...(center.metrics || {}) };
  const usedSources = new Map();
  const missing = [];

  for (const field of required) {
    const sourceId = fieldSources[field];
    const source = byId.get(sourceId);
    const value = source?.metrics?.[field];
    if (!source || !Number.isFinite(value)) {
      missing.push(field);
      continue;
    }
    next[field] = value;
    usedSources.set(sourceId, source);
  }

  const values = required.map((field) => next[field]);
  const invalid = values.some((value) => !Number.isInteger(value) || value < 0 || value > 100000000);
  if (invalid) return { ok: false, reason: 'invalid_metric_value', metrics: next, missing };
  if (missing.length) return { ok: false, reason: 'missing_required_metrics', metrics: next, missing };

  const maxMultiplier = Number(cfg?.plausibility?.max_multiplier || 0);
  if (maxMultiplier > 1) {
    for (const field of required) {
      const previous = Number(center?.metrics?.[field]);
      const current = Number(next[field]);
      if (previous > 100 && current > previous * maxMultiplier) {
        return { ok: false, reason: `implausible_jump:${field}`, metrics: next, missing: [] };
      }
    }
  }

  next._provenance = {
    field_sources: fieldSources,
    sources: [...usedSources.values()].map((source) => ({
      id: source.adapterId,
      name: source.sourceName,
      url: source.sourceUrl,
      checked_at: source.checkedAt,
    })),
  };

  return { ok: true, metrics: next, missing: [] };
}

async function writeSnapshot(env, center, result, project = false, metricsOverride = null, sourceNameOverride = null, sourceUrlOverride = null) {
  const metrics = metricsOverride || result.metrics;
  return supabaseRpc(env, 'apply_livecenter_metric_snapshot', {
    p_live_center_id: center.id,
    p_adapter_id: result.adapterId,
    p_raw_hash: result.rawHash,
    p_metrics: metrics,
    p_source_name: sourceNameOverride || result.sourceName,
    p_source_url: sourceUrlOverride || result.sourceUrl,
    p_source_published_at: null,
    p_source_checked_at: result.checkedAt,
    p_validation_status: result.errors?.length ? 'warning' : 'ok',
    p_validation_errors: result.errors || [],
    p_project: project,
  });
}

async function processCenter(env, center) {
  const adapterIds = Array.isArray(center.adapters) ? center.adapters : [];
  const configs = center.adapter_config || {};
  if (!adapterIds.length) return { center: center.slug, status: 'no_adapters' };

  const results = [];
  const failures = [];
  for (const adapterId of adapterIds) {
    try {
      const result = await fetchAdapter(adapterId, configs[adapterId]);
      results.push(result);
      await writeSnapshot(env, center, result, false);
    } catch (error) {
      failures.push({ adapter: adapterId, error: String(error) });
    }
  }

  const composed = composeMetrics(center, results);
  if (!composed.ok) {
    return { center: center.slug, status: composed.reason, missing: composed.missing, failures };
  }

  const shouldProject = center?.cadence?.metrics_writer === 'worker';
  if (!shouldProject) {
    return { center: center.slug, status: 'observed', metrics: composed.metrics, failures };
  }

  const compositeText = JSON.stringify({ metrics: composed.metrics, sources: composed.metrics?._provenance?.sources || [] });
  const composite = {
    adapterId: '__composite__',
    sourceName: composed.metrics?._provenance?.sources?.map((source) => source.name).join(' · ') || 'Officielle kilder',
    sourceUrl: composed.metrics?._provenance?.sources?.[0]?.url || null,
    rawHash: await sha256(compositeText),
    metrics: composed.metrics,
    errors: [],
    checkedAt: new Date().toISOString(),
  };

  const projection = await writeSnapshot(
    env,
    center,
    composite,
    true,
    composed.metrics,
    composite.sourceName,
    composite.sourceUrl,
  );

  return { center: center.slug, status: 'projected', projection, metrics: composed.metrics, failures };
}

async function run(env) {
  assertEnv(env);
  const select = [
    'id','slug','status','homepage_active','starts_at','ends_at','schema','renderer','cadence',
    'adapters','primary_source','adapter_config','source_policy','metrics','metrics_updated_at',
    'source_name','source_url','source_checked_at'
  ].join(',');
  const centers = await supabaseGet(env, `/rest/v1/live_centers?homepage_active=eq.true&select=${encodeURIComponent(select)}`);
  const nowMs = Date.now();
  const active = (centers || []).filter((center) => isCenterActive(center, nowMs) && dueForPoll(center, nowMs));
  const outcomes = [];
  for (const center of active) outcomes.push(await processCenter(env, center));
  return { checked_at: new Date().toISOString(), centers_due: active.length, outcomes };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env).then((result) => console.log(JSON.stringify(result))).catch((error) => console.error(error)));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, worker: 'morgentidende-livecenter-metrics' });
    }
    return new Response('Not found', { status: 404 });
  },
};
