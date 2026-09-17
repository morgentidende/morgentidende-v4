-- Lean social distribution reset.
-- The legacy social queue has never carried production rows, so replace it now
-- rather than carrying diagnostic/event machinery into the production design.

DO $$
DECLARE
  v_posts bigint := 0;
  v_events bigint := 0;
BEGIN
  IF to_regclass('public.social_posts') IS NOT NULL THEN
    SELECT count(*) INTO v_posts FROM public.social_posts;
  END IF;
  IF to_regclass('public.social_post_events') IS NOT NULL THEN
    SELECT count(*) INTO v_events FROM public.social_post_events;
  END IF;

  IF v_posts <> 0 OR v_events <> 0 THEN
    RAISE EXCEPTION 'lean social reset requires empty queue (posts=%, events=%)', v_posts, v_events;
  END IF;
END
$$;

DROP VIEW IF EXISTS public.social_dispatch_health;
DROP TRIGGER IF EXISTS social_posts_instrument_change ON public.social_posts;
DROP FUNCTION IF EXISTS public.social_posts_instrument_change();
DROP FUNCTION IF EXISTS public.social_post_record_event(uuid,text,jsonb,text,text);
DROP TABLE IF EXISTS public.social_post_events;
DROP TABLE IF EXISTS public.social_posts;
DROP TYPE IF EXISTS public.social_platform;
DROP TYPE IF EXISTS public.social_post_status;

CREATE TYPE public.social_network AS ENUM ('facebook', 'instagram');
CREATE TYPE public.social_post_status AS ENUM ('ready', 'scheduled', 'published', 'failed', 'skipped');

CREATE TABLE public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  network public.social_network NOT NULL,
  variant_key text NOT NULL DEFAULT 'primary',
  status public.social_post_status NOT NULL DEFAULT 'ready',
  post_text text NOT NULL,
  media_urls text[] NOT NULL DEFAULT '{}'::text[],
  media_alt_text text[] NOT NULL DEFAULT '{}'::text[],
  scheduled_for timestamptz,
  published_at timestamptz,
  provider text NOT NULL DEFAULT 'metricool',
  provider_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  last_error_code text,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT social_posts_variant_key_nonempty CHECK (btrim(variant_key) <> ''),
  CONSTRAINT social_posts_text_nonempty CHECK (btrim(post_text) <> ''),
  CONSTRAINT social_posts_attempts_nonnegative CHECK (attempts >= 0),
  CONSTRAINT social_posts_article_network_variant_unique UNIQUE (article_id, network, variant_key),
  CONSTRAINT social_posts_instagram_requires_media CHECK (
    network <> 'instagram'::public.social_network OR cardinality(media_urls) > 0
  ),
  CONSTRAINT social_posts_alt_text_shape CHECK (
    cardinality(media_alt_text) = 0 OR cardinality(media_alt_text) = cardinality(media_urls)
  ),
  CONSTRAINT social_posts_planned_time_required CHECK (
    status IN ('failed'::public.social_post_status, 'skipped'::public.social_post_status)
    OR scheduled_for IS NOT NULL
  ),
  CONSTRAINT social_posts_published_timestamp_required CHECK (
    status <> 'published'::public.social_post_status OR published_at IS NOT NULL
  )
);

CREATE INDEX social_posts_dispatch_idx
  ON public.social_posts(status, scheduled_for);
CREATE INDEX social_posts_article_idx
  ON public.social_posts(article_id);

CREATE TRIGGER social_posts_touch_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO service_role;

COMMENT ON TABLE public.social_posts IS
  'Single private ledger/queue for social distribution. One row is one concrete platform post; Metricool is an adapter, not the source of truth.';
COMMENT ON COLUMN public.social_posts.variant_key IS
  'Allows more than one post per article/network without duplicating the primary post; primary is the default.';
COMMENT ON COLUMN public.social_posts.provider_ref IS
  'Opaque provider acknowledgement such as Metricool id, uuid and planner URL.';
COMMENT ON COLUMN public.social_posts.metadata IS
  'Optional publication-specific metadata; core queue logic must not depend on brand-specific keys.';
