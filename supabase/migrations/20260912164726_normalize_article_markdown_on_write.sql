create or replace function public.normalize_article_markdown_on_write()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_body text;
  v_literal_count integer;
begin
  v_body := coalesce(new.body_markdown, '');

  -- Defensive normalization for chat/API writers that accidentally send
  -- markdown as a JSON-escaped single-line string (literal \\n / \\r\\n / \\t).
  -- Only decode when the body has no real line breaks and clearly contains
  -- multiple escaped structural breaks, avoiding legitimate isolated backslashes.
  if strpos(v_body, chr(10)) = 0 then
    v_literal_count := (length(v_body) - length(replace(v_body, chr(92) || 'n', ''))) / 2;
    if v_literal_count >= 2 then
      v_body := replace(v_body, chr(92) || 'r' || chr(92) || 'n', chr(10));
      v_body := replace(v_body, chr(92) || 'n', chr(10));
      v_body := replace(v_body, chr(92) || 't', chr(9));
      new.body_markdown := v_body;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_normalize_article_markdown_on_write on public.articles;
create trigger trg_normalize_article_markdown_on_write
before insert or update of body_markdown on public.articles
for each row
execute function public.normalize_article_markdown_on_write();