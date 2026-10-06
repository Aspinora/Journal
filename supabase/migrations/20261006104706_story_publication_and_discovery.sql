-- Additive metadata; publication status remains compatible with existing feeds.
alter table public.story_works
  add column genres jsonb not null default '[]' check(jsonb_typeof(genres)='array'),
  add column series_status text check (series_status in ('ongoing','hiatus','completed')),
  add column completed_at timestamptz,
  add column last_release_at timestamptz,
  add column reader_metadata jsonb not null default '{}';
alter table public.journals add column reader_metadata jsonb not null default '{}';
alter table public.story_volumes add column published_at timestamptz,
  add column series_status text check (series_status in ('ongoing','hiatus','completed'));
alter table public.story_chapters add column first_published_at timestamptz;
update public.story_chapters set first_published_at=published_at where status='published';
update public.story_works w set
  series_status=case when status in ('ongoing','hiatus','completed') then status else 'ongoing' end,
  last_release_at=(select max(published_at) from public.story_chapters c where c.story_id=w.id and c.status='published')
where status<>'draft';
update public.story_volumes v set published_at=(select min(published_at) from public.story_chapters c where c.volume_id=v.id and c.status='published');

create table public.story_genres (genre text primary key, subgenres text[] not null);
alter table public.story_genres enable row level security;
create policy "Story taxonomy is readable" on public.story_genres for select to anon,authenticated using (true);
grant select on public.story_genres to anon,authenticated;
insert into public.story_genres values ('Fantasy',array['General','High Fantasy','Low Fantasy','Urban Fantasy','Dark Fantasy','Romantic Fantasy','Mythological Fantasy','Historical Fantasy']),('Romance',array['General','Contemporary Romance','Historical Romance','Paranormal Romance','Romantic Comedy','Slow Burn','Second Chance']),('Mystery & Thriller',array['General','Detective Mystery','Cozy Mystery','Crime Thriller','Psychological Thriller','Suspense','Political Thriller']),('Science Fiction',array['General','Space Opera','Cyberpunk','Dystopian','Time Travel','Hard Science Fiction','Post-apocalyptic']),('Literary Fiction',array['General','Coming of Age','Family Saga','Contemporary Fiction','Experimental Fiction']),('Historical',array['General','Historical Fiction','Historical Adventure','Alternate History','Historical Mystery']),('Horror',array['General','Supernatural Horror','Gothic Horror','Psychological Horror','Cosmic Horror','Folk Horror']),('Adventure',array['General','Action Adventure','Survival','Exploration','Sea Adventure']),('Drama',array['General','Family Drama','Social Drama','Tragedy','Slice of Life']),('Poetry',array['General','Narrative Poetry','Epic Poetry','Verse Novel']),('Non-fiction',array['General','Memoir','Biography','True Crime','Personal Narrative']),('Other',array['General']);
update public.story_works set genres=jsonb_build_array(jsonb_build_object('genre',genre,'subgenres',jsonb_build_array('General'))) where kind='story' and genre is not null;

create table public.story_subscriptions (
  story_id uuid not null references public.story_works(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(story_id,user_id)
);
create index story_subscriptions_user_idx on public.story_subscriptions(user_id);
alter table public.story_subscriptions enable row level security;
create policy "Readers manage their subscriptions" on public.story_subscriptions for all to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id and exists(select 1 from public.story_works w where w.id=story_id and w.status<>'draft' and w.visibility in ('public','unlisted') and w.moderation_status in ('active','under_review')));
grant select,insert,update,delete on public.story_subscriptions to authenticated;
alter table public.notifications add column story_id uuid references public.story_works(id) on delete cascade,
  add column chapter_id uuid references public.story_chapters(id) on delete set null;
create index notifications_story_idx on public.notifications(story_id) where story_id is not null;
create index notifications_chapter_idx on public.notifications(chapter_id) where chapter_id is not null;

create schema if not exists private;
create function private.stamp_story_release() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.status='published' then
    new.first_published_at:=coalesce(old.first_published_at,old.published_at,now());
    new.published_at:=coalesce(old.first_published_at,old.published_at,now());
  else
    new.first_published_at:=old.first_published_at;
  end if;
  return new;
end $$;
revoke all on function private.stamp_story_release() from public,anon,authenticated;
create trigger stamp_story_release before update on public.story_chapters for each row execute function private.stamp_story_release();

create function private.stamp_series_status() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.series_status='completed' then
    new.completed_at:=case when old.series_status='completed' then old.completed_at else now() end;
  else new.completed_at:=null;
  end if;
  return new;
end $$;
revoke all on function private.stamp_series_status() from public,anon,authenticated;
create trigger stamp_series_status before update on public.story_works for each row execute function private.stamp_series_status();

-- Only this trigger can create update notifications. Clients cannot notify other users.
create function private.notify_story_release() returns trigger language plpgsql security definer set search_path='' as $$
declare item record;
begin
  for item in select n.story_id,count(*) as chapter_count,min(n.id::text)::uuid as chapter_id,max(n.first_published_at) as released_at
    from new_chapters n join old_chapters o using(id)
    where n.status='published' and o.status<>'published' and n.first_published_at is not null and o.first_published_at is null
    group by n.story_id
  loop
    update public.story_works set last_release_at=item.released_at,published_at=coalesce(published_at,item.released_at) where id=item.story_id;
    update public.story_volumes v set published_at=coalesce(v.published_at,(select min(c.first_published_at) from public.story_chapters c where c.volume_id=v.id and c.status='published')) where v.story_id=item.story_id;
    insert into public.notifications(recipient_id,type,actor_id,story_id,chapter_id,message)
      select s.user_id,'story_update',w.author_id,w.id,case when item.chapter_count=1 then item.chapter_id end,
        case when item.chapter_count=1 then 'A new chapter is available in ' else item.chapter_count||' new chapters are available in ' end||w.title
      from public.story_subscriptions s join public.story_works w on w.id=s.story_id
      where s.story_id=item.story_id and not s.muted and s.user_id<>w.author_id
        and w.author_id=auth.uid() and w.visibility in ('public','unlisted') and w.moderation_status in ('active','under_review');
  end loop;
  return null;
end $$;
revoke all on function private.notify_story_release() from public,anon,authenticated;
create trigger notify_story_release after update on public.story_chapters referencing old table as old_chapters new table as new_chapters for each statement execute function private.notify_story_release();

-- Runs under the caller's RLS policies. Every selected chapter is released in one transaction.
create function public.publish_story_batch(p_story_id uuid,p_work jsonb,p_volumes jsonb,p_parts jsonb,p_chapters jsonb,p_releases jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.story_works; g jsonb; t text[]; item jsonb; release_ids uuid[]; stamp timestamptz:=now();
begin
  select * into w from public.story_works where id=p_story_id and author_id=auth.uid() for update;
  if w.id is null then raise exception 'This work does not belong to you.'; end if;
  if coalesce(jsonb_typeof(p_releases),'null')<>'array' then raise exception 'Choose at least one chapter to publish.'; end if;
  if jsonb_array_length(p_releases)=0 then raise exception 'Choose at least one chapter to publish.'; end if;
  if nullif(btrim(p_work->>'title'),'') is null then raise exception 'A title is required.'; end if;
  if nullif(p_work->>'copyright','') is null then raise exception 'Choose a copyright.'; end if;
  if w.kind='story' then
    if nullif(p_work->>'cover_url','') is null then raise exception 'Add a story cover before publishing.'; end if;
    if coalesce(jsonb_typeof(p_work->'genres'),'null')<>'array' then raise exception 'Choose a primary genre and subgenre.'; end if;
    if jsonb_array_length(p_work->'genres')=0 then raise exception 'Choose a primary genre and subgenre.'; end if;
    if (select count(*) from jsonb_array_elements(p_work->'genres'))<>(select count(distinct x->>'genre') from jsonb_array_elements(p_work->'genres') x) then raise exception 'Each genre can be selected once.'; end if;
    for g in select value from jsonb_array_elements(p_work->'genres') loop
      select subgenres into t from public.story_genres where genre=g->>'genre';
      if t is null or coalesce(jsonb_typeof(g->'subgenres'),'null')<>'array' or jsonb_array_length(g->'subgenres')=0 or exists(select 1 from jsonb_array_elements_text(g->'subgenres') s where not s=any(t)) then raise exception 'Choose valid subgenres for each genre.'; end if;
    end loop;
  end if;
  select array_agg((x->>'id')::uuid) into release_ids from jsonb_array_elements(p_releases) x;
  if cardinality(release_ids)<>(select count(distinct id) from unnest(release_ids) id) then raise exception 'A chapter was selected twice.'; end if;
  -- Reject attempts to attach another author's existing containers, even if readable.
  if exists(select 1 from public.story_volumes v join jsonb_array_elements(p_volumes) x on v.id=(x->>'id')::uuid where v.story_id<>p_story_id)
    or exists(select 1 from public.story_chapters c join jsonb_array_elements(p_chapters) x on c.id=(x->>'id')::uuid where c.story_id<>p_story_id)
    or exists(select 1 from public.story_parts p join public.story_volumes v on v.id=p.volume_id join jsonb_array_elements(p_parts) x on p.id=(x->>'id')::uuid where v.story_id<>p_story_id) then raise exception 'Invalid story structure.'; end if;
  for item in select value from jsonb_array_elements(p_volumes) loop
    insert into public.story_volumes(id,story_id,number,title,description,status,cover_url,is_implicit,series_status)
      values((item->>'id')::uuid,p_story_id,(item->>'number')::int,item->>'title',item->>'description','draft',item->>'cover_url',coalesce((item->>'is_implicit')::boolean,false),item->>'series_status')
      on conflict(id) do update set number=excluded.number,title=excluded.title,description=excluded.description,cover_url=excluded.cover_url,series_status=excluded.series_status;
  end loop;
  for item in select value from jsonb_array_elements(p_parts) loop
    if not exists(select 1 from public.story_volumes where id=(item->>'volume_id')::uuid and story_id=p_story_id) then raise exception 'Invalid part volume.'; end if;
    insert into public.story_parts(id,volume_id,number,title,description,status,cover_url)
      values((item->>'id')::uuid,(item->>'volume_id')::uuid,(item->>'number')::int,item->>'title',item->>'description','draft',item->>'cover_url')
      on conflict(id) do update set number=excluded.number,title=excluded.title,description=excluded.description,cover_url=excluded.cover_url;
  end loop;
  for item in select value from jsonb_array_elements(p_chapters) loop
    if not exists(select 1 from public.story_volumes where id=(item->>'volume_id')::uuid and story_id=p_story_id) or (item->>'part_id' is not null and not exists(select 1 from public.story_parts where id=(item->>'part_id')::uuid and volume_id=(item->>'volume_id')::uuid)) then raise exception 'Invalid chapter container.'; end if;
    insert into public.story_chapters(id,story_id,volume_id,part_id,number,title,status)
      values((item->>'id')::uuid,p_story_id,(item->>'volume_id')::uuid,(item->>'part_id')::uuid,(item->>'number')::int,item->>'title','draft')
      on conflict(id) do update set volume_id=excluded.volume_id,part_id=excluded.part_id,number=excluded.number,title=excluded.title
      where public.story_chapters.status<>'published' or public.story_chapters.id=any(release_ids);
  end loop;
  if (select count(*) from public.story_chapters where story_id=p_story_id and id=any(release_ids))<>cardinality(release_ids) then raise exception 'A selected chapter is missing.'; end if;
  if exists(select 1 from jsonb_array_elements(p_releases) x where nullif(btrim(regexp_replace(x->>'html','<[^>]+>','','g')),'') is null) then raise exception 'An empty chapter cannot be published.'; end if;
  if p_work->>'series_status'='completed' and exists(select 1 from public.story_chapters where story_id=p_story_id and status<>'published' and not id=any(release_ids)) then raise exception 'Publish remaining chapters before marking the work completed.'; end if;
  -- Keep the existing moderation/publishing restriction trigger active, including re-publication.
  perform public._restriction_block(auth.uid(),array['publishing','posts','account'],'publish Works');
  update public.story_works set title=p_work->>'title',description=p_work->>'description',genre=case when kind='story' then p_work->'genres'->0->>'genre' else genre end,
    genres=case when kind='story' then p_work->'genres' else genres end,tags=array(select jsonb_array_elements_text(p_work->'tags')),
    visibility=p_work->>'visibility',allow_impressions=(p_work->>'allow_impressions')::boolean,copyright=p_work->>'copyright',cover_url=p_work->>'cover_url',
    reader_metadata=coalesce(p_work->'reader_metadata','{}'),series_status=coalesce(p_work->>'series_status','ongoing'),status='published',published_at=coalesce(published_at,stamp),updated_at=stamp
    where id=p_story_id;
  update public.story_chapters c set html=r.html,published_html=r.html,status='published',published_at=stamp,word_count=r.word_count,char_count=r.char_count,updated_at=stamp
    from jsonb_to_recordset(p_releases) r(id uuid,html text,word_count int,char_count int) where c.id=r.id and c.story_id=p_story_id;
  update public.story_works set last_chapter_id=release_ids[cardinality(release_ids)],word_count=(select coalesce(sum(word_count),0) from public.story_chapters where story_id=p_story_id and status='published') where id=p_story_id;
  update public.story_volumes set status='published' where story_id=p_story_id and exists(select 1 from public.story_chapters c where c.volume_id=story_volumes.id and c.status='published') and not exists(select 1 from public.story_chapters c where c.volume_id=story_volumes.id and c.status<>'published');
  update public.story_volumes v set series_status=case when p_work->>'series_status'='completed' then 'completed' else coalesce(v.series_status,'ongoing') end where story_id=p_story_id and published_at is not null;
  update public.story_parts set status='published',published_at=coalesce(published_at,stamp) where volume_id in(select id from public.story_volumes where story_id=p_story_id) and exists(select 1 from public.story_chapters c where c.part_id=story_parts.id and c.status='published') and not exists(select 1 from public.story_chapters c where c.part_id=story_parts.id and c.status<>'published');
  return jsonb_build_object('work',(select to_jsonb(s) from public.story_works s where id=p_story_id),'chapters',(select jsonb_agg(jsonb_build_object('id',id,'published_at',published_at)) from public.story_chapters where story_id=p_story_id and id=any(release_ids)),
    'volumes',(select jsonb_agg(jsonb_build_object('id',id,'status',status,'series_status',series_status,'published_at',published_at)) from public.story_volumes where story_id=p_story_id),
    'parts',(select jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'published_at',p.published_at)) from public.story_parts p join public.story_volumes v on v.id=p.volume_id where v.story_id=p_story_id));
end $$;
revoke all on function public.publish_story_batch(uuid,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.publish_story_batch(uuid,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
