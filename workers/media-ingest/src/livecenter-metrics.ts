interface LivecenterMetricsEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type Json = Record<string, any>;

const nepaliDigits = new Map([
  ['०', '0'], ['१', '1'], ['२', '2'], ['३', '3'], ['४', '4'],
  ['५', '5'], ['६', '6'], ['७', '7'], ['८', '8'], ['९', '9'],
]);

const headers = (env: LivecenterMetricsEnv) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json',
});

async function dbGet(env: LivecenterMetricsEnv, path: string) {
  const response = await fetch(`${env.SUPABASE_URL}${path}`, { headers: headers(env) });
  const text = await response.text();
  if (!response.ok) throw new Error(`livecenter db read ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function dbRpc(env: LivecenterMetricsEnv, name: string, payload: Json) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`livecenter rpc ${name} ${response.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

function htmlToText(html: string) {
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

function normalizeDigits(value: string) {
  return [...String(value)].map((ch) => nepaliDigits.get(ch) ?? ch).join('');
}

function parseNumberPhrase(value: string) {
  const normalized = normalizeDigits(value).replace(/[,.]/g, '').replace(/\s+/g, ' ').trim();
  if (/^\d+$/.test(normalized)) return Number(normalized);

  const tokens = normalized.split(' ');
  const units = new Map<string, number>([
    ['सय', 100], ['हजार', 1000], ['लाख', 100000], ['करोड', 10000000],
  ]);
  let total = 0;
  let found = false;
  for (let i = 0; i < tokens.length; i += 1) {
    if (!/^\d+$/.test(tokens[i])) continue;
    found = true;
    const n = Number(tokens[i]);
    const unit = units.get(tokens[i + 1]);
    if (unit) {
      total += n * unit;
      i += 1;
    } else {
      total += n;
    }
  }
  return found ? total : null;
}

function extractFields(text: string, patterns: Json) {
  const metrics: Json = {};
  const errors: string[] = [];
  for (const [field, configured] of Object.entries(patterns || {})) {
    const list = Array.isArray(configured) ? configured : [configured];
    for (const pattern of list) {
      try {
        const match = text.match(new RegExp(String(pattern), 'iu'));
        if (!match?.[1]) continue;
        const value = parseNumberPhrase(match[1]);
        if (Number.isFinite(value)) {
          metrics[field] = value;
          break;
        }
      } catch (error) {
        errors.push(`${field}: ${String(error)}`);
      }
    }
  }
  return { metrics, errors };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchAdapter(adapterId: string, config: Json) {
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
  const text = htmlToText(await response.text());
  const parsed = extractFields(text, config.field_patterns || {});
  return {
    adapterId,
    sourceName: config.source_name || adapterId,
    sourceUrl: config.url,
    checkedAt: new Date().toISOString(),
    rawHash: await sha256(text),
    metrics: parsed.metrics,
    errors: parsed.errors,
  };
}

function active(center: Json, now: number) {
  return center.homepage_active === true
    && ['live', 'scheduled'].includes(center.status)
    && (!center.starts_at || Date.parse(center.starts_at) <= now)
    && (!center.ends_at || Date.parse(center.ends_at) > now);
}

function due(center: Json, now: number) {
  const seconds = Math.max(60, Number(center?.cadence?.metrics_poll_seconds || 300));
  const checked = center.source_checked_at ? Date.parse(center.source_checked_at) : 0;
  return !Number.isFinite(checked) || checked <= 0 || now - checked >= seconds * 1000 - 5000;
}

async function snapshot(env: LivecenterMetricsEnv, center: Json, result: Json, project = false, metrics?: Json) {
  return dbRpc(env, 'apply_livecenter_metric_snapshot', {
    p_live_center_id: center.id,
    p_adapter_id: result.adapterId,
    p_raw_hash: result.rawHash,
    p_metrics: metrics || result.metrics,
    p_source_name: result.sourceName,
    p_source_url: result.sourceUrl,
    p_source_published_at: null,
    p_source_checked_at: result.checkedAt,
    p_validation_status: result.errors?.length ? 'warning' : 'ok',
    p_validation_errors: result.errors || [],
    p_project: project,
  });
}

function compose(center: Json, results: Json[]) {
  const config = center.adapter_config || {};
  const fieldSources = config.field_sources || {};
  const required: string[] = Array.isArray(config.required_metrics)
    ? config.required_metrics
    : Object.keys(fieldSources);
  const byId = new Map(results.map((result) => [result.adapterId, result]));
  const next: Json = { ...(center.metrics || {}) };
  const sourceIds = new Set<string>();
  const missing: string[] = [];

  for (const field of required) {
    const sourceId = fieldSources[field];
    const source = byId.get(sourceId);
    const value = source?.metrics?.[field];
    if (!Number.isInteger(value) || value < 0 || value > 100000000) {
      missing.push(field);
      continue;
    }
    next[field] = value;
    sourceIds.add(sourceId);
  }
  if (missing.length) return { ok: false, reason: 'missing_required_metrics', missing };

  const multiplier = Number(config?.plausibility?.max_multiplier || 0);
  if (multiplier > 1) {
    for (const field of required) {
      const previous = Number(center?.metrics?.[field]);
      const current = Number(next[field]);
      if (previous > 100 && current > previous * multiplier) {
        return { ok: false, reason: `implausible_jump:${field}`, missing: [] };
      }
    }
  }

  const sources = [...sourceIds]
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((source) => ({ id: source.adapterId, name: source.sourceName, url: source.sourceUrl, checked_at: source.checkedAt }));
  next._provenance = { field_sources: fieldSources, sources };
  return { ok: true, metrics: next, sources };
}

async function processCenter(env: LivecenterMetricsEnv, center: Json) {
  const ids: string[] = Array.isArray(center.adapters) ? center.adapters : [];
  const configs = center.adapter_config || {};
  const results: Json[] = [];
  const failures: Json[] = [];

  for (const adapterId of ids) {
    try {
      const result = await fetchAdapter(adapterId, configs[adapterId]);
      results.push(result);
      await snapshot(env, center, result, false);
    } catch (error) {
      failures.push({ adapter: adapterId, error: String(error) });
    }
  }

  const composed: any = compose(center, results);
  if (!composed.ok) return { slug: center.slug, status: composed.reason, missing: composed.missing, failures };
  if (center?.cadence?.metrics_writer !== 'worker') {
    return { slug: center.slug, status: 'observed', metrics: composed.metrics, failures };
  }

  const sourceName = composed.sources.map((source: Json) => source.name).join(' · ') || 'Officielle kilder';
  const sourceUrl = composed.sources[0]?.url || null;
  const checkedAt = new Date().toISOString();
  const composite = {
    adapterId: '__composite__',
    rawHash: await sha256(JSON.stringify(composed.metrics)),
    sourceName,
    sourceUrl,
    checkedAt,
    errors: [],
    metrics: composed.metrics,
  };
  const projection = await snapshot(env, center, composite, true, composed.metrics);
  return { slug: center.slug, status: 'projected', projection, failures };
}

export async function pollLivecenterMetrics(env: LivecenterMetricsEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Livecenter metrics missing Supabase bindings');
  }
  const select = [
    'id','slug','status','homepage_active','starts_at','ends_at','cadence','adapters','primary_source',
    'adapter_config','source_policy','metrics','source_checked_at'
  ].join(',');
  const centers = await dbGet(env, `/rest/v1/live_centers?homepage_active=eq.true&select=${encodeURIComponent(select)}`);
  const now = Date.now();
  const dueCenters = (centers || []).filter((center: Json) => active(center, now) && due(center, now));
  const outcomes = [];
  for (const center of dueCenters) outcomes.push(await processCenter(env, center));
  return { checked_at: new Date().toISOString(), centers_due: dueCenters.length, outcomes };
}
