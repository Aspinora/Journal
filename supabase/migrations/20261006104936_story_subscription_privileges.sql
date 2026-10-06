revoke all on public.story_subscriptions from anon,authenticated;
grant select,insert,update,delete on public.story_subscriptions to authenticated;
revoke all on public.story_genres from anon,authenticated;
grant select on public.story_genres to anon,authenticated;

