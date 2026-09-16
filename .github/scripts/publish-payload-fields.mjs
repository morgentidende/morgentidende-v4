const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLUSTER_KEY_RE = /^[a-z0-9][a-z0-9-]{1,119}$/;

export class PublishPayloadFieldError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PublishPayloadFieldError';
    this.code = code;
  }
}

function fail(code) {
  throw new PublishPayloadFieldError(code);
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSagenKort(value) {
  if (value == null) return null;
  if (!Array.isArray(value)) fail('sagen_kort_must_have_exactly_two_nonempty_points');
  const points = value.map((point) => asTrimmedString(point));
  if (points.length !== 2 || points.some((point) => !point)) {
    fail('sagen_kort_must_have_exactly_two_nonempty_points');
  }
  return points;
}

export function validatePublishPayloadFields(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('payload_must_be_object');
  }

  const deck = payload.deck == null ? null : asTrimmedString(payload.deck);
  const manchet = payload.manchet == null ? null : asTrimmedString(payload.manchet);
  if (payload.deck != null && typeof payload.deck !== 'string') fail('invalid_deck');
  if (payload.manchet != null && typeof payload.manchet !== 'string') fail('invalid_manchet');
  if (deck && deck.length > 300) fail('deck_too_long');
  if (manchet && manchet.length > 300) fail('deck_too_long');
  if (deck && manchet && deck !== manchet) fail('deck_alias_conflict');

  const metadata = payload.editorial_metadata;
  if (metadata != null && (typeof metadata !== 'object' || Array.isArray(metadata))) {
    fail('invalid_editorial_metadata');
  }

  const topSagen = payload.sagen_kort === undefined ? null : normalizeSagenKort(payload.sagen_kort);
  const metaSagen = metadata?.sagen_kort === undefined ? null : normalizeSagenKort(metadata.sagen_kort);
  if (topSagen && metaSagen && (topSagen[0] !== metaSagen[0] || topSagen[1] !== metaSagen[1])) {
    fail('sagen_kort_alias_conflict');
  }

  if (payload.story_cluster_id != null && payload.story_cluster_id !== '') {
    if (typeof payload.story_cluster_id !== 'string' || !UUID_RE.test(payload.story_cluster_id.trim())) {
      fail('invalid_story_cluster_id');
    }
  }

  if (payload.story_cluster_key != null && payload.story_cluster_key !== '') {
    if (typeof payload.story_cluster_key !== 'string' || !CLUSTER_KEY_RE.test(payload.story_cluster_key.trim())) {
      fail('invalid_story_cluster_key');
    }
  }

  return {
    deck: deck || manchet || null,
    sagen_kort: metaSagen || topSagen,
    story_cluster_id: payload.story_cluster_id ? payload.story_cluster_id.trim().toLowerCase() : null,
    story_cluster_key: payload.story_cluster_key ? payload.story_cluster_key.trim() : null,
  };
}
