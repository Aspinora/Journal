-- Multipart journals: preserve their category and use the existing reader handoff.
-- Existing stories/articles keep their current response shape and read behavior.
CREATE OR REPLACE FUNCTION public.get_stories_articles_feed(p_category text, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'recent'::text, p_limit integer DEFAULT 6, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, slug text, title text, subtitle text, excerpt text, body_markdown text, cover_url text, cover_thumb_url text, category_id smallint, script text, tags text[], published_at timestamp with time zone, allow_comments boolean, content_note text, like_count integer, comment_count integer, read_count integer, featured boolean, author_id uuid, status text, visibility text, display_name text, username text, avatar_url text, kind text, chapter_count integer, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cat_id smallint := case p_category when 'articles' then 6 when 'journals' then 1 when 'all' then null else 2 end;
  v_story_kind text := case p_category when 'articles' then 'article' when 'journals' then 'journal' when 'all' then null else 'story' end;
  v_term text := nullif(trim(coalesce(p_search, '')), '');
begin
  return query
  with combined as (
    select j.id, j.slug, j.title, j.subtitle, j.excerpt, j.body_markdown,
           j.cover_url, j.cover_thumb_url, j.category_id, j.script, j.tags,
           j.published_at, j.allow_comments, j.content_note,
           j.like_count, j.comment_count, j.read_count, j.featured,
           j.author_id, j.status, j.visibility, 'journal'::text as kind, null::int as chapter_count
    from journals j
    where j.status = 'published' and j.visibility = 'public' and (v_cat_id is null or j.category_id = v_cat_id)
      and (v_term is null or j.title ilike '%'||v_term||'%' or j.excerpt ilike '%'||v_term||'%' or j.body_markdown ilike '%'||v_term||'%'
           or exists (select 1 from profiles pp where pp.id = j.author_id and (pp.display_name ilike '%'||v_term||'%' or pp.username ilike '%'||v_term||'%')))
    union all
    select w.id, w.slug, w.title, null, w.description, null,
           w.cover_url, w.cover_url, (case w.kind when 'journal' then 1 when 'article' then 6 else 2 end)::smallint, null, w.tags,
           w.published_at, true, null,
           w.like_count, w.comment_count, w.read_count, false,
           w.author_id, w.status, w.visibility, (case w.kind when 'journal' then 'journal' else 'story' end)::text as kind,
           (select count(*)::int from story_chapters c where c.story_id = w.id and c.status = 'published') as chapter_count
    from story_works w
    where w.status in ('published','ongoing','completed','hiatus') and w.visibility = 'public' and (v_story_kind is null or w.kind = v_story_kind)
      and (v_term is null or w.title ilike '%'||v_term||'%' or w.description ilike '%'||v_term||'%'
           or exists (select 1 from profiles pp where pp.id = w.author_id and (pp.display_name ilike '%'||v_term||'%' or pp.username ilike '%'||v_term||'%')))
  ), counted as (
    select *, count(*) over() as total_count from combined
  )
  select c.id, c.slug, c.title, c.subtitle, c.excerpt, c.body_markdown,
         c.cover_url, c.cover_thumb_url, c.category_id, c.script, c.tags,
         c.published_at, c.allow_comments, c.content_note,
         c.like_count, c.comment_count, c.read_count, c.featured,
         c.author_id, c.status, c.visibility,
         p.display_name, p.username, p.avatar_url,
         c.kind, c.chapter_count, c.total_count
  from counted c
  join profiles p on p.id = c.author_id
  order by
    case when p_sort = 'appreciated' then c.like_count end desc nulls last,
    case when p_sort = 'discussed' then c.comment_count end desc nulls last,
    case when p_sort not in ('appreciated','discussed') then c.published_at end desc nulls last,
    c.id desc
  limit p_limit offset p_offset;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_work_for_read(p_id_or_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uuid uuid;
  v_journal jsonb;
  v_story story_works;
  v_chapter_count int;
  v_single_chapter story_chapters;
  v_result jsonb;
begin
  v_journal := public.get_journal_for_read(p_id_or_slug);
  if v_journal is not null then
    return v_journal || jsonb_build_object('kind', 'journal');
  end if;

  begin
    v_uuid := p_id_or_slug::uuid;
  exception when others then
    v_uuid := null;
  end;

  select w.* into v_story
  from story_works w
  where w.status in ('published','ongoing','completed','hiatus')
    and (w.id = v_uuid or w.slug = p_id_or_slug)
    and (w.visibility <> 'private' or w.author_id = auth.uid())
  limit 1;

  if v_story.id is null then
    return null;
  end if;

  select count(*) into v_chapter_count from story_chapters c
    where c.story_id = v_story.id and c.status = 'published';

  if v_chapter_count = 1 then
    select c.* into v_single_chapter from story_chapters c
      where c.story_id = v_story.id and c.status = 'published' limit 1;
  end if;

  select jsonb_build_object(
    'id', v_story.id, 'slug', v_story.slug, 'title', v_story.title, 'subtitle', null,
    'excerpt', v_story.description, 'body_markdown', case when v_story.kind <> 'journal' and v_chapter_count = 1 then v_single_chapter.published_html else null end,
    'cover_url', v_story.cover_url, 'cover_thumb_url', v_story.cover_url,
    'category_id', case v_story.kind when 'journal' then 1 when 'article' then 6 else 2 end,
    'script', null, 'tags', to_jsonb(v_story.tags), 'published_at', v_story.published_at,
    'allow_comments', true, 'content_note', null,
    'like_count', v_story.like_count, 'comment_count', v_story.comment_count, 'read_count', v_story.read_count,
    'featured', false, 'author_id', v_story.author_id, 'status', v_story.status, 'visibility', v_story.visibility,
    'kind', case when v_story.kind = 'journal' then 'journal' else 'story' end, 'is_multipart', v_story.kind = 'journal', 'chapter_count', v_chapter_count,
    'single_chapter_id', (case when v_chapter_count = 1 then v_single_chapter.id else null end),
    'profiles', (select jsonb_build_object('display_name', p.display_name, 'username', p.username, 'avatar_url', p.avatar_url) from profiles p where p.id = v_story.author_id)
  ) into v_result;

  return v_result;
end;
$function$
;

-- Keep the first journal publication date stable across edits and republishing.
CREATE OR REPLACE FUNCTION public._stamp_multipart_journal_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $function$
BEGIN
  IF NEW.kind = 'journal' THEN
    IF TG_OP = 'UPDATE' AND OLD.published_at IS NOT NULL THEN
      NEW.published_at := OLD.published_at;
    ELSIF NEW.status IN ('published','ongoing','completed','hiatus') AND NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_stamp_multipart_journal_publication
BEFORE INSERT OR UPDATE ON public.story_works
FOR EACH ROW EXECUTE FUNCTION public._stamp_multipart_journal_publication();

UPDATE public.story_works w
SET published_at = coalesce(
  (SELECT min(c.published_at) FROM public.story_chapters c
   WHERE c.story_id = w.id AND c.status = 'published'), w.updated_at, w.created_at)
WHERE w.kind = 'journal' AND w.status IN ('published','ongoing','completed','hiatus')
  AND w.published_at IS NULL;
