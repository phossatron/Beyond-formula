-- Emergency compatibility rollback for Formula Studio Auth/RLS.
-- WARNING: this intentionally reopens legacy anonymous CRUD access.
-- It retains every table and row. Run only after approved incident review.

begin;

drop trigger if exists fs_users_guard on public.fs_users;
drop trigger if exists fs_records_guard on public.fs_records;
drop trigger if exists fs_chats_guard on public.fs_chats;
drop trigger if exists fs_activities_guard on public.fs_activities;

drop policy if exists records_member_select on public.fs_records;
drop policy if exists records_role_insert on public.fs_records;
drop policy if exists records_role_update on public.fs_records;
drop policy if exists records_admin_delete on public.fs_records;
drop policy if exists chats_member_select on public.fs_chats;
drop policy if exists chats_member_insert on public.fs_chats;
drop policy if exists chats_member_update on public.fs_chats;
drop policy if exists chats_admin_delete on public.fs_chats;
drop policy if exists users_member_select on public.fs_users;
drop policy if exists users_admin_insert on public.fs_users;
drop policy if exists users_admin_update on public.fs_users;
drop policy if exists users_admin_delete on public.fs_users;
drop policy if exists activities_admin_select on public.fs_activities;
drop policy if exists activities_member_insert on public.fs_activities;
drop policy if exists meta_member_select on public.fs_meta;
drop policy if exists meta_creator_insert on public.fs_meta;
drop policy if exists meta_creator_update on public.fs_meta;
drop policy if exists meta_admin_delete on public.fs_meta;

grant select,insert,update,delete on public.fs_records,public.fs_chats,public.fs_users,
  public.fs_activities,public.fs_meta to anon,authenticated;
drop policy if exists anon_all on public.fs_records;
drop policy if exists anon_all on public.fs_chats;
drop policy if exists anon_all on public.fs_users;
drop policy if exists anon_all on public.fs_activities;
drop policy if exists anon_all on public.fs_meta;
create policy anon_all on public.fs_records for all to anon,authenticated using (true) with check (true);
create policy anon_all on public.fs_chats for all to anon,authenticated using (true) with check (true);
create policy anon_all on public.fs_users for all to anon,authenticated using (true) with check (true);
create policy anon_all on public.fs_activities for all to anon,authenticated using (true) with check (true);
create policy anon_all on public.fs_meta for all to anon,authenticated using (true) with check (true);

commit;
