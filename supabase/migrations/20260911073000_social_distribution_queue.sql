-- Social distribution queue for Morgentidende.
-- Secrets/tokens never live in this table; they belong in Worker secret storage.

DO $$ BEGIN
  CREATE TYPE social_platform AS ENUM ('facebook', 'instagram', 'x');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE social_post_status AS ENUM ('draft', 'ready', 'publishing', 'published', 'skipped', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  status social_post_status NOT NULL DEFAULT 'draft',
  platform_score smallint,
  selection_reason text,
  post_text text,
  media_url text,
  media_kind text,
  scheduled_for timestamptz,
  published_at timestamptz,
  platform_post_id text,
  platform_post_url text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_posts_score_range CHECK (platform_score IS NULL OR platform_score BETWEEN 0 AND 100),
  CONSTRAINT social_posts_article_platform_unique UNIQUE (article_id, platform)
);

CREATE INDEX IF NOT EXISTS social_posts_status_schedule_idx
  ON public.social_posts(status, scheduled_for);
CREATE INDEX IF NOT EXISTS social_posts_article_idx
  ON public.social_posts(article_id);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.social_posts FROM anon, authenticated;

COMMENT ON TABLE public.social_posts IS 'Private queue/audit log for automated Facebook, Instagram and X distribution.';
COMMENT ON COLUMN public.social_posts.selection_reason IS 'Short editorial explanation for why this article fits the platform.';
COMMENT ON COLUMN public.social_posts.post_text IS 'Platform-specific copy. Never blindly reused across platforms.';
