CREATE OR REPLACE FUNCTION public.get_journal_for_read(p_id_or_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uuid uuid;
  v_row journals;
  v_result jsonb;
begin
  -- Tolerant id-or-slug match, mirroring the client's old
  -- .or('id.eq.X,slug.eq.X'): try the uuid cast, but don't error out
  -- (and don't leak a query-error) when the value is a slug, not a
  -- uuid — this also incidentally fixes audit finding M11 (a non-uuid
  -- ?read= value used to cause a raw query error).
  begin
    v_uuid := p_id_or_slug::uuid;
  exception when others then
    v_uuid := null;
  end;

  select j.* into v_row
  from journals j
  where j.status = 'published'
    and (j.id = v_uuid or j.slug = p_id_or_slug)
    and (j.visibility <> 'private' or j.author_id = auth.uid())
  limit 1;

  if v_row.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', v_row.id, 'slug', v_row.slug, 'title', v_row.title, 'subtitle', v_row.subtitle,
    'excerpt', v_row.excerpt, 'body_markdown', v_row.body_markdown, 'cover_url', v_row.cover_url,
    'cover_thumb_url', v_row.cover_thumb_url, 'category_id', v_row.category_id, 'script', v_row.script,
    'tags', to_jsonb(v_row.tags), 'published_at', v_row.published_at, 'allow_comments', v_row.allow_comments,
    'content_note', v_row.content_note, 'reader_metadata', v_row.reader_metadata, 'like_count', v_row.like_count, 'comment_count', v_row.comment_count,
    'read_count', v_row.read_count, 'featured', v_row.featured, 'author_id', v_row.author_id,
    'status', v_row.status, 'visibility', v_row.visibility,
    'profiles', (select jsonb_build_object('display_name', p.display_name, 'username', p.username, 'avatar_url', p.avatar_url) from profiles p where p.id = v_row.author_id)
  ) into v_result;

  return v_result;
end;
$function$

