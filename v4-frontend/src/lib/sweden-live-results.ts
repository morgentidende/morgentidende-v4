type LiveResult = Record<string, any>;

type PartyRow = { name: string; percent: number; change?: number; seats?: number };

const ZIP_URL = 'https://resultat.val.se/resultatfiler/val2026/p/rd/Val_2026_preliminar_00_RD.zip';
const MANDATE_FILE_SUFFIX = 'Val_2026_preliminar_mandatfordelning_00_RD.json';

const PARTY_NAMES: Record<string, string> = {
  S: 'Socialdemokraterna', SD: 'Sverigedemokraterna', M: 'Moderaterna', V: 'Vänsterpartiet',
  C: 'Centerpartiet', KD: 'Kristdemokraterna', MP: 'Miljöpartiet', L: 'Liberalerna',
};

const PARTY_ALIASES: Record<string, string> = {
  socialdemokraterna: 'S', arbetarepartietsocialdemokraterna: 'S', sverigedemokraterna: 'SD',
  moderaterna: 'M', moderatasamlingspartiet: 'M', vansterpartiet: 'V', centerpartiet: 'C',
  kristdemokraterna: 'KD', miljopartiet: 'MP', miljopartietdegrona: 'MP', liberalerna: 'L',
};

const normalize = (value: unknown) => String(value ?? '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.').replace('−', '-'));
  return Number.isFinite(parsed) ? parsed : null;
};

const findEocd = (bytes: Uint8Array) => {
  const min = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
  }
  return -1;
};

const inflateRaw = async (bytes: Uint8Array) => {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw' as any));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

async function extractZipText(buffer: ArrayBuffer, wantedSuffix: string): Promise<string | null> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocd = findEocd(bytes);
  if (eocd < 0) return null;
  const entryCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder('utf-8');

  for (let entry = 0; entry < entryCount && cursor + 46 <= bytes.length; entry += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) return null;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const fileName = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength));
    if (fileName.endsWith(wantedSuffix)) {
      if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) return null;
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      const uncompressed = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : null;
      return uncompressed ? decoder.decode(uncompressed) : null;
    }
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return null;
}

const detectPartyCode = (obj: Record<string, any>): string | null => {
  const preferredKeys = Object.keys(obj).filter((key) => /part.*(forkort|beteck|kod|namn)|^parti$/i.test(normalize(key)));
  const values = [...preferredKeys.map((key) => obj[key]), ...Object.values(obj).filter((v) => typeof v === 'string')];
  for (const raw of values) {
    const exact = String(raw ?? '').trim().toUpperCase();
    if (PARTY_NAMES[exact]) return exact;
    const alias = PARTY_ALIASES[normalize(raw)];
    if (alias) return alias;
  }
  return null;
};

const pickNumeric = (obj: Record<string, any>, keyPattern: RegExp, range?: [number, number]) => {
  for (const [key, raw] of Object.entries(obj)) {
    if (!keyPattern.test(normalize(key))) continue;
    const value = numberValue(raw);
    if (value === null) continue;
    if (range && (value < range[0] || value > range[1])) continue;
    return value;
  }
  return null;
};

const parsePartyObject = (obj: Record<string, any>): PartyRow | null => {
  const code = detectPartyCode(obj);
  if (!code) return null;
  const percent = pickNumeric(obj, /(rostandel|andelroster|andelrost|procent|rostprocent|valresultatprocent)/, [0, 100]);
  if (percent === null) return null;
  const change = pickNumeric(obj, /(forandring|differens|diff|jamforelse|jmf)/, [-100, 100]);
  const seats = pickNumeric(obj, /(mandatantal|antalmandat|mandat)/, [0, 349]);
  return {
    name: PARTY_NAMES[code], percent: Math.round(percent * 10) / 10,
    ...(change === null ? {} : { change: Math.round(change * 10) / 10 }),
    ...(seats === null ? {} : { seats: Math.round(seats) }),
  };
};

const contextScore = (path: string[], parent: Record<string, any> | null) => {
  const joined = normalize(path.join(' '));
  let score = /riket|riksdag|valomrade/.test(joined) ? 6 : 0;
  if (parent) {
    for (const [key, raw] of Object.entries(parent)) {
      const k = normalize(key), v = normalize(raw);
      if ((/valomradeskod|valomradekod|kod/.test(k) && (v === '00' || v === '0')) || v === 'riket') score += 12;
      if (/valomradesnamn|valomradenamn|namn/.test(k) && /riket|riksdag/.test(v)) score += 8;
    }
  }
  return score;
};

function findBestPartyArray(root: unknown): PartyRow[] {
  let best: { score: number; rows: PartyRow[] } = { score: -1, rows: [] };
  const walk = (node: unknown, path: string[] = [], parent: Record<string, any> | null = null) => {
    if (Array.isArray(node)) {
      const parsed = node.filter((item): item is Record<string, any> => !!item && typeof item === 'object' && !Array.isArray(item))
        .map(parsePartyObject).filter((row): row is PartyRow => !!row);
      const unique = [...new Map(parsed.map((row) => [row.name, row])).values()];
      if (unique.length >= 6) {
        const score = unique.length * 10 + contextScore(path, parent);
        if (score > best.score) best = { score, rows: unique };
      }
      node.forEach((item, index) => walk(item, [...path, String(index)], parent));
      return;
    }
    if (node && typeof node === 'object') {
      const objectNode = node as Record<string, any>;
      for (const [key, value] of Object.entries(objectNode)) walk(value, [...path, key], objectNode);
    }
  };
  walk(root);
  return best.rows.sort((a, b) => b.percent - a.percent);
}

export async function loadOfficialSwedenResults(current: LiveResult | null | undefined): Promise<LiveResult> {
  try {
    const response = await fetch(ZIP_URL, {
      headers: { accept: 'application/zip,application/octet-stream,*/*', 'user-agent': 'Morgentidende/1.0 (+https://morgentidende.dk)' },
      cf: { cacheTtl: 20, cacheEverything: true },
    } as RequestInit & { cf: { cacheTtl: number; cacheEverything: boolean } });
    if (!response.ok) return current || {};
    const jsonText = await extractZipText(await response.arrayBuffer(), MANDATE_FILE_SUFFIX);
    if (!jsonText) return current || {};
    const parties = findBestPartyArray(JSON.parse(jsonText));
    if (parties.length < 6) return current || {};

    const redBloc = new Set(['Socialdemokraterna', 'Vänsterpartiet', 'Miljöpartiet', 'Centerpartiet']);
    const blueBloc = new Set(['Moderaterna', 'Sverigedemokraterna', 'Kristdemokraterna', 'Liberalerna']);
    const redSeats = parties.filter((p) => redBloc.has(p.name)).reduce((sum, p) => sum + (p.seats || 0), 0);
    const blueSeats = parties.filter((p) => blueBloc.has(p.name)).reduce((sum, p) => sum + (p.seats || 0), 0);
    const hasMandates = redSeats + blueSeats > 0;
    const blocks = hasMandates ? [
      { name: 'Rød blok', seats: redSeats },
      { name: 'Blå blok', seats: blueSeats },
    ] : [];
    const blockSummary = hasMandates
      ? redSeats === blueSeats
        ? `Blokkene står lige. 175 mandater kræves for flertal.`
        : `${redSeats > blueSeats ? 'Rød blok' : 'Blå blok'} fører med ${Math.abs(redSeats - blueSeats)} mandat${Math.abs(redSeats - blueSeats) === 1 ? '' : 'er'}. 175 kræves for flertal.`
      : undefined;

    return {
      ...(current || {}), phase: 'counting', headline: 'Foreløbigt valgresultat', counted_label: 'Optællingen er i gang',
      subheadline: 'Officielle, foreløbige tal fra Valmyndigheten. Resultatet ændrer sig løbende.',
      parties: parties.map(({ name, percent, change }) => ({ name, percent, ...(typeof change === 'number' ? { change } : {}) })),
      ...(blocks.length ? { blocks } : {}), ...(blockSummary ? { block_summary: blockSummary } : {}),
      source_url: ZIP_URL, fetched_at: new Date().toISOString(),
    };
  } catch {
    return current || {};
  }
}
