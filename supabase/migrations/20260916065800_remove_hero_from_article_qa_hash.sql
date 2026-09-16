-- Hero attachment is a separate publication dependency enforced by the media
-- gate. It should not invalidate article text/source QA by itself.
-- Keep the function signature for compatibility with existing callers, but
-- exclude hero_media_id and hero_url from the content hash.

create or replace function public.article_qa_content_hash(
  p_headline text,
  p_deck text,
  p_body_markdown text,
  p_hero_media_id uuid,
  p_hero_url text,
  p_source_metadata jsonb
)
returns text
language sql
immutable
set search_path = 'public'
as $function$
  select md5(
    coalesce(p_headline,'') || E'\x1f' ||
    coalesce(p_deck,'') || E'\x1f' ||
    coalesce(p_body_markdown,'') || E'\x1f' ||
    coalesce(p_source_metadata,'[]'::jsonb)::text
  );
$function$;

comment on function public.article_qa_content_hash(text, text, text, uuid, text, jsonb)
is 'Hashes editorial text/source content for QA. Hero fields remain in the signature for compatibility but are intentionally excluded; media validity is enforced separately by publication gates.';
