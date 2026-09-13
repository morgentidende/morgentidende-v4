type LiveResult = Record<string, any>;

const RESULT_URL = 'https://resultat.val.se/val2026/RD?r=P';
const TOTAL_ELECTION_NIGHT_DISTRICTS = 6312;

const PARTY_NAMES: Record<string, string> = {
  S: 'Socialdemokraterna',
  SD: 'Sverigedemokraterna',
  M: 'Moderaterna',
  V: 'Vänsterpartiet',
  C: 'Centerpartiet',
  KD: 'Kristdemokraterna',
  MP: 'Miljöpartiet',
  L: 'Liberalerna',
};

const decodeText = (html: string) => html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&minus;|&#8722;/gi, '−')
  .replace(/&plusmn;|&#177;/gi, '±')
  .replace(/\s+/g, ' ')
  .trim();

const toNumber = (value?: string | null) => {
  if (!value) return null;
  const parsed = Number(value.replace(',', '.').replace('−', '-'));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseParties = (text: string) => {
  const sectionStart = text.indexOf('Röstfördelning');
  const sectionEnd = text.indexOf('Ogiltiga röster', sectionStart + 1);
  const section = sectionStart >= 0
    ? text.slice(sectionStart, sectionEnd > sectionStart ? sectionEnd : undefined)
    : text;

  const parties: Array<{ name: string; percent: number; change?: number }> = [];
  const seen = new Set<string>();
  const re = /\b(SD|KD|MP|S|M|V|C|L)\b\s+[^%]{0,120}?\s(\d{1,2}[,.]\d)\s*%\s*(?:([+−-]\d{1,2}[,.]\d|±\s*0)\b)?/g;

  for (const match of section.matchAll(re)) {
    const code = match[1];
    if (seen.has(code)) continue;
    const percent = toNumber(match[2]);
    if (percent === null) continue;
    const rawChange = (match[3] || '').replace(/\s+/g, '');
    const change = rawChange.startsWith('±') ? 0 : toNumber(rawChange);
    parties.push({
      name: PARTY_NAMES[code] || code,
      percent,
      ...(change === null ? {} : { change }),
    });
    seen.add(code);
  }

  return parties;
};

const parseCountedDistricts = (text: string) => {
  const patterns = [
    /(?:Räknade|Rapporterade)\s+(?:valdistrikt|distrikt)\s*:?\s*([\d\s.]+)\s*(?:av|\/ )\s*([\d\s.]+)/i,
    /([\d\s.]+)\s+av\s+([\d\s.]+)\s+(?:valdistrikt|distrikt)\s+(?:är\s+)?(?:räknade|rapporterade)/i,
    /(?:valdistrikt|distrikt)\s*:?\s*([\d\s.]+)\s*\/\s*([\d\s.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const counted = Number(match[1].replace(/[^\d]/g, ''));
    const total = Number(match[2].replace(/[^\d]/g, ''));
    if (counted >= 0 && total > 0 && counted <= total) return { counted, total };
  }

  return null;
};

export async function loadOfficialSwedenResults(current: LiveResult | null | undefined): Promise<LiveResult> {
  try {
    const response = await fetch(RESULT_URL, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Morgentidende/1.0 (+https://morgentidende.dk)',
      },
    });

    if (!response.ok) return current || {};
    const html = await response.text();
    const text = decodeText(html);

    // Do not replace known-good result data with an empty or pre-count page.
    if (/Resultatet ännu ej sammanställt/i.test(text)) return current || {};

    const parties = parseParties(text);
    if (parties.length < 6) return current || {};

    const counted = parseCountedDistricts(text);
    const countedPct = counted
      ? Math.round((counted.counted / counted.total) * 1000) / 10
      : null;

    const total = counted?.total || TOTAL_ELECTION_NIGHT_DISTRICTS;
    const countedLabel = counted
      ? `${counted.counted.toLocaleString('da-DK')} af ${total.toLocaleString('da-DK')} distrikter optalt`
      : 'Foreløbigt resultat';

    return {
      ...(current || {}),
      phase: 'counting',
      headline: 'Foreløbigt valgresultat',
      counted_label: countedLabel,
      subheadline: 'Officielle, foreløbige tal fra Valmyndigheten. Resultatet ændrer sig løbende.',
      ...(countedPct === null ? {} : { counted_pct: countedPct }),
      parties,
      source_url: RESULT_URL,
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return current || {};
  }
}
