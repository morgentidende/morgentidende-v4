const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLUSTER_KEY_RE = /^[a-z0-9][a-z0-9-]{1,119}$/;

function fail(message) {
  throw new Error(message);
}

function asTrimmedString(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeSagenPoints(value) {
  if (!Array.isArray(value)) fail('sagen_kort_must_have_exactly_two_nonempty_points');
  const points = value.map((point) => (typeof point === 'string' ? point.trim() : ''));
  if (points.length !== 2 || points.some((point) => !point)) {
    fail('sagen_kort_must_have_exactly_two_nonempty_points');
  }
  return points;
}

export function validatePublishPayloadShape(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('payload_must_be_object');
  }

  const deck = payload.deck === undefined ? null : asTrimmedString(payload.deck);
  const manchet = payload.manchet === undefined ? null : asTrimmedString(payload.manchet);
  if (payload.deck !== undefined && deck === undefined) fail('invalid_deck');
  if (payload.manchet !== undefined && manchet === undefined) fail('invalid_manchet');
  if (deck && deck.length > 300) fail('deck_too_long');
  if (manchet && manchet.length > 300) fail('deck_too_long');
  if (deck && manchet && deck !== manchet) fail('deck_alias_conflict');

  const metadata = payload.editorial_metadata;
  if (metadata != null && (typeof metadata !== 'object' || Array.isArray(metadata))) {
    fail('editorial_metadata_must_be_object');
  }

  const topSagen = Object.prototype.hasOwnProperty.call(payload, 'sagen_kort')
    ? normalizeSagenPoints(payload.sagen_kort)
    : null;
  const metaSagen = metadata && Object.prototype.hasOwnProperty.call(metadata, 'sagen_kort')
    ? normalizeSagenPoints(metadata.sagen_kort)
    : null;
  if (topSagen && metaSagen && (topSagen[0] !== metaSagen[0] || topSagen[1] !== metaSagen[1])) {
    fail('sagen_kort_alias_conflict');
  }

  const clusterId = payload.story_cluster_id === undefined
    ? null
    : asTrimmedString(payload.story_cluster_id);
  if (payload.story_cluster_id !== undefined && clusterId === undefined) fail('invalid_story_cluster_id');
  if (clusterId && !UUID_RE.test(clusterId)) fail('invalid_story_cluster_id');

  const clusterKeyRaw = payload.story_cluster_key === undefined
    ? null
    : asTrimmedString(payload.story_cluster_key);
  if (payload.story_cluster_key !== undefined && clusterKeyRaw === undefined) {
    fail('invalid_story_cluster_key');
  }
  const clusterKey = clusterKeyRaw ? clusterKeyRaw.toLowerCase() : null;
  if (clusterKey && !CLUSTER_KEY_RE.test(clusterKey)) fail('invalid_story_cluster_key');

  return {
    deck: deck || manchet,
    sagen_kort: metaSagen || topSagen,
    story_cluster_id: clusterId,
    story_cluster_key: clusterKey,
  };
}
