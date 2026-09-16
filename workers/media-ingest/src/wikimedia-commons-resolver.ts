type CommonsExtMetadataValue = { value?: string };

type CommonsImageInfo = {
  url?: string;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  width?: number;
  height?: number;
  size?: number;
  descriptionurl?: string;
  sha1?: string;
  mime?: string;
  mediatype?: string;
  user?: string;
  extmetadata?: Record<string, CommonsExtMetadataValue>;
};

type CommonsPage = {
  pageid?: number;
  ns?: number;
  title?: string;
  missing?: boolean;
  imageinfo?: CommonsImageInfo[];
};

type CommonsApiResponse = {
  query?: {
    pages?: CommonsPage[];
    redirects?: Array<{ from?: string; to?: string }>;
  };
};

export type CommonsResolveResult =
  | { kind: 'resolved'; payload: Record<string, unknown> }
  | { kind: 'permanent'; error: string; detail?: Record<string, unknown> }
  | { kind: 'transient'; error: string; status?: number };

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const COMMONS_USER_AGENT = 'MorgentidendeMedia/1.0 (https://morgentidende.dk)';
const COMMONS_TARGET_WIDTH = 1600;

const sourceUrl = (payload: Record<string, unknown>) => (
  typeof payload.source_url === 'string' ? payload.source_url : ''
);

const sourceProvider = (payload: Record<string, unknown>) => (
  typeof payload.source_provider === 'string' ? payload.source_provider.toLowerCase() : ''
);

const commonsFileTitleFromUrl = (rawUrl: string): string | null => {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (host !== 'upload.wikimedia.org' && host !== 'commons.wikimedia.org') return null;

    if (host === 'commons.wikimedia.org') {
      const wikiIndex = url.pathname.indexOf('/wiki/');
      if (wikiIndex >= 0) {
        const title = decodeURIComponent(url.pathname.slice(wikiIndex + '/wiki/'.length));
        if (/^file:/i.test(title)) return title.replace(/_/g, ' ');
      }
    }

    const fileName = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '');
    if (!fileName) return null;
    return `File:${fileName.replace(/_/g, ' ')}`;
  } catch {
    return null;
  }
};

const metadataRecord = (payload: Record<string, unknown>) => (
  payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
    ? payload.metadata as Record<string, unknown>
    : {}
);

const commonsIdentity = (payload: Record<string, unknown>) => {
  const metadata = metadataRecord(payload);
  const identity = metadata.commons_identity;
  return identity && typeof identity === 'object' && !Array.isArray(identity)
    ? identity as Record<string, unknown>
    : {};
};

export const isWikimediaCommonsPayload = (payload: Record<string, unknown>) => {
  if (sourceProvider(payload).includes('wikimedia')) return true;
  return commonsFileTitleFromUrl(sourceUrl(payload)) !== null;
};

const htmlToText = (value: string) => value
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();

const extValue = (ext: Record<string, CommonsExtMetadataValue>, key: string) => (
  typeof ext[key]?.value === 'string' ? ext[key]!.value! : ''
);

const licenseAllowsCommercialArchive = (licenseShortName: string) => {
  const normalized = licenseShortName.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('cc0') || normalized.includes('public domain')) return true;
  if (/^cc by(?:-sa)?\b/.test(normalized)) return true;
  return false;
};

const attributionIsRequired = (licenseShortName: string, ext: Record<string, CommonsExtMetadataValue>) => {
  const explicit = extValue(ext, 'AttributionRequired').trim().toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return /^cc by(?:-sa)?\b/i.test(licenseShortName.trim());
};

export const resolveWikimediaCommonsPayload = async (
  payload: Record<string, unknown>,
): Promise<CommonsResolveResult> => {
  const identity = commonsIdentity(payload);
  const storedTitle = typeof identity.file_title === 'string' ? identity.file_title : null;
  const derivedTitle = commonsFileTitleFromUrl(sourceUrl(payload));
  const title = storedTitle || derivedTitle;
  if (!title) return { kind: 'permanent', error: 'commons_file_identity_missing' };

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'info|imageinfo',
    inprop: 'url',
    iilimit: '1',
    iiprop: 'timestamp|user|url|size|sha1|mime|mediatype|canonicaltitle|extmetadata',
    iiurlwidth: String(COMMONS_TARGET_WIDTH),
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|UsageTerms|Attribution|Artist|Credit|AttributionRequired|Copyrighted|Permission|Restrictions',
  });

  const storedPageId = Number(identity.pageid || 0);
  if (Number.isInteger(storedPageId) && storedPageId > 0) params.set('pageids', String(storedPageId));
  else params.set('titles', title);

  let response: Response;
  try {
    response = await fetch(`${COMMONS_API}?${params.toString()}`, {
      headers: {
        accept: 'application/json',
        'user-agent': COMMONS_USER_AGENT,
        'api-user-agent': COMMONS_USER_AGENT,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return {
      kind: 'transient',
      error: error instanceof Error ? `commons_api_network:${error.message}` : 'commons_api_network',
    };
  }

  if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) {
    return { kind: 'transient', error: `commons_api_${response.status}`, status: response.status };
  }
  if (!response.ok) {
    return { kind: 'permanent', error: `commons_api_${response.status}`, status: response.status } as CommonsResolveResult;
  }

  let data: CommonsApiResponse;
  try {
    data = await response.json<CommonsApiResponse>();
  } catch {
    return { kind: 'transient', error: 'commons_api_invalid_json' };
  }

  const page = data.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing || !info?.url) return { kind: 'permanent', error: 'commons_file_missing' };
  if (page.ns !== 6 || !String(page.title || '').toLowerCase().startsWith('file:')) {
    return { kind: 'permanent', error: 'commons_identity_not_file' };
  }
  if (storedPageId > 0 && page.pageid !== storedPageId) {
    return {
      kind: 'permanent',
      error: 'commons_pageid_changed',
      detail: { expected_pageid: storedPageId, actual_pageid: page.pageid || null },
    };
  }

  const expectedSha1 = typeof identity.sha1 === 'string'
    ? identity.sha1
    : (typeof metadataRecord(payload).commons_expected_sha1 === 'string'
      ? String(metadataRecord(payload).commons_expected_sha1)
      : '');
  if (expectedSha1 && info.sha1 && info.sha1.toLowerCase() !== expectedSha1.toLowerCase()) {
    return {
      kind: 'permanent',
      error: 'commons_sha1_changed',
      detail: { expected_sha1: expectedSha1, actual_sha1: info.sha1 },
    };
  }
  if (!String(info.mime || '').toLowerCase().startsWith('image/')) {
    return { kind: 'permanent', error: 'commons_resolved_asset_not_image' };
  }

  const ext = info.extmetadata || {};
  const licenseShortName = htmlToText(extValue(ext, 'LicenseShortName'));
  const licenseUrl = extValue(ext, 'LicenseUrl').trim();
  if (!licenseAllowsCommercialArchive(licenseShortName)) {
    return {
      kind: 'permanent',
      error: 'commons_rights_not_supported',
      detail: { license: licenseShortName || null },
    };
  }

  const attributionRequired = attributionIsRequired(licenseShortName, ext);
  const creditText = htmlToText(
    extValue(ext, 'Attribution')
      || extValue(ext, 'Artist')
      || extValue(ext, 'Credit')
      || info.user
      || '',
  );
  if (attributionRequired && !creditText) return { kind: 'permanent', error: 'commons_attribution_missing' };

  const canonicalTitle = page.title || title;
  const filePageUrl = info.descriptionurl
    || `https://commons.wikimedia.org/wiki/${encodeURIComponent(canonicalTitle.replace(/ /g, '_')).replace(/%3A/gi, ':')}`;
  const metadata = metadataRecord(payload);
  const resolvedUrl = info.thumburl || info.url;

  return {
    kind: 'resolved',
    payload: {
      ...payload,
      source_url: resolvedUrl,
      source_provider: 'wikimedia_commons',
      source_asset_id: page.pageid ? String(page.pageid) : canonicalTitle,
      license_name: licenseShortName,
      license_url: licenseUrl || null,
      credit_text: creditText || null,
      commercial_use_allowed: true,
      local_storage_allowed: true,
      attribution_required: attributionRequired,
      rights_notes: `Resolved via Wikimedia Commons API from ${title}`,
      metadata: {
        ...metadata,
        commons_identity: {
          provider: 'wikimedia_commons',
          file_title: canonicalTitle,
          pageid: page.pageid || null,
          file_page_url: filePageUrl,
          submitted_url: sourceUrl(payload),
          canonical_direct_url: info.url,
          resolved_direct_url: resolvedUrl,
          sha1: info.sha1 || null,
          original_width: info.width || null,
          original_height: info.height || null,
          original_bytes: info.size || null,
          resolved_width: info.thumbwidth || info.width || null,
          resolved_height: info.thumbheight || info.height || null,
        },
        commons_license_snapshot: {
          license_short_name: licenseShortName,
          license_url: licenseUrl || null,
          attribution_required: attributionRequired,
          credit_text: creditText || null,
        },
        commons_resolved_at: new Date().toISOString(),
      },
    },
  };
};
