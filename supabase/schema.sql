-- Formula Studio — Supabase Auth + membership/RLS forward migration
-- Critical Change. Review, test and run in staging before production.
-- The five application tables retain their locked key + jsonb data contract.

begin;

create table if not exists public.fs_records (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.fs_chats (
  job_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
-- Additive Chat event store. fs_chats remains the backward-compatible projection.
create table if not exists public.fs_chat_events (
  event_id text primary key,
  job_id text not null,
  seq bigint generated always as identity unique,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists fs_chat_events_job_seq_idx
  on public.fs_chat_events (job_id, seq);
create table if not exists public.fs_chat_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null,
  seen_ts bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
create index if not exists fs_chat_reads_job_idx
  on public.fs_chat_reads (job_id, updated_at desc);
create table if not exists public.fs_users (
  name text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.fs_activities (
  uid text primary key,
  ts bigint not null,
  data jsonb not null
);
create index if not exists fs_activities_ts_idx on public.fs_activities (ts desc);
create table if not exists public.fs_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.fs_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null unique,
  role text not null check (role in ('admin','pd','ra','rd','sales','opc','mkt','purchasing')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fs_memberships_role_active_idx
  on public.fs_memberships (role, active);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema public to authenticated;
grant usage on schema private to authenticated;

create or replace function private.fs_is_active_member() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fs_memberships m
    where m.user_id=auth.uid() and m.active
  )
$$;
create or replace function private.fs_current_role() returns text
language sql stable security definer
set search_path = ''
as $$
  select m.role from public.fs_memberships m
  where m.user_id=auth.uid() and m.active
$$;
create or replace function private.fs_current_name() returns text
language sql stable security definer
set search_path = ''
as $$
  select m.name from public.fs_memberships m
  where m.user_id=auth.uid() and m.active
$$;
revoke all on function private.fs_is_active_member() from public, anon;
revoke all on function private.fs_current_role() from public, anon;
revoke all on function private.fs_current_name() from public, anon;
grant execute on function private.fs_is_active_member() to authenticated;
grant execute on function private.fs_current_role() to authenticated;
grant execute on function private.fs_current_name() to authenticated;

create or replace function private.fs_touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at=now();
  return new;
end $$;
revoke all on function private.fs_touch_updated_at() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['fs_records','fs_chats','fs_users','fs_meta','fs_memberships'] loop
    execute format('drop trigger if exists %I_touch on public.%I',t,t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function private.fs_touch_updated_at()',t,t);
  end loop;
end $$;

-- Map only already-known legacy users to Auth users. Unmatched Auth users get no access.
insert into public.fs_memberships(user_id,name,role,active)
select au.id, u.name, lower(u.data->>'role'), true
from public.fs_users u
join auth.users au on lower(trim(au.email))=lower(trim(u.data->>'email'))
where lower(u.data->>'role') in ('admin','pd','ra','rd','sales','opc','mkt','purchasing')
on conflict (user_id) do update
set name=excluded.name,role=excluded.role,updated_at=now();

-- Preserve the locked key while removing every browser password hash from server data.
update public.fs_users
set data=jsonb_set(data,'{pass}','null'::jsonb,true)
where not (data ? 'pass') or data->'pass' is distinct from 'null'::jsonb;

create or replace function private.fs_guard_user_json() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.data->>'name' is distinct from new.name then
    raise exception 'fs_users name must match data.name' using errcode='42501';
  end if;
  if lower(coalesce(new.data->>'role','')) not in ('admin','pd','ra','rd','sales','opc','mkt','purchasing') then
    raise exception 'invalid Formula Studio role' using errcode='42501';
  end if;
  if not (new.data ? 'pass') or new.data->'pass' is distinct from 'null'::jsonb then
    raise exception 'fs_users.data.pass must be JSON null' using errcode='42501';
  end if;
  return new;
end $$;

create or replace function private.fs_guard_activity_json() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_role text := private.fs_current_role();
  actor_name text := private.fs_current_name();
begin
  if actor_role is null or actor_name is null then
    raise exception 'active membership required' using errcode='42501';
  end if;
  if actor_role<>'admin' and (
    new.data->>'user' is distinct from actor_name
    or coalesce(new.data->>'via','')<>''
  ) then
    raise exception 'activity actor mismatch' using errcode='42501';
  end if;
  return new;
end $$;

create or replace function private.fs_guard_record_json() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_role text := private.fs_current_role();
  actor_name text := private.fs_current_name();
  pd_keys text[] := array['rows','rdUpdated','modNote'];
begin
  if actor_role is null or actor_name is null then
    raise exception 'active membership required' using errcode='42501';
  end if;
  if new.id !~ '^[A-Z]+[0-9]{5}$' or new.data->>'id' is distinct from new.id then
    raise exception 'record id must match data.id' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    if actor_role not in ('admin','sales','opc','mkt') then
      raise exception 'role cannot create records' using errcode='42501';
    end if;
    if actor_role='sales' and new.data->>'createdBy' is distinct from actor_name then
      raise exception 'Sales can create only owned records' using errcode='42501';
    end if;
    return new;
  end if;
  if new.data->>'createdBy' is distinct from old.data->>'createdBy' then
    raise exception 'record creator is immutable' using errcode='42501';
  end if;
  if (new.data->'closed') is distinct from (old.data->'closed')
     and actor_role not in ('admin','sales','opc') then
    raise exception 'role cannot change closed state' using errcode='42501';
  end if;
  if actor_role='admin' then return new; end if;
  if actor_role='sales' then
    if old.data->>'createdBy' is distinct from actor_name then
      raise exception 'Sales can update only owned records' using errcode='42501';
    end if;
    return new;
  end if;
  if actor_role in ('opc','mkt') then return new; end if;
  if actor_role='pd' and (new.data - pd_keys)=(old.data - pd_keys) then return new; end if;
  raise exception 'record mutation exceeds role permission' using errcode='42501';
end $$;

create or replace function private.fs_guard_chat_json() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_role text := private.fs_current_role();
  actor_name text := private.fs_current_name();
  old_approvals jsonb := coalesce(old.data->'approvals','{}'::jsonb);
  new_approvals jsonb := coalesce(new.data->'approvals','{}'::jsonb);
  old_messages jsonb := coalesce(old.data->'messages','[]'::jsonb);
  new_messages jsonb := coalesce(new.data->'messages','[]'::jsonb);
  prefix_messages jsonb;
  old_other_parts jsonb;
  new_other_parts jsonb;
  invalid_message boolean;
begin
  if new.job_id !~ '^[A-Z]+[0-9]{5}$' or new.data->>'jobId' is distinct from new.job_id then
    raise exception 'chat job id must match data.jobId' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    if not private.fs_is_active_member() then raise exception 'active membership required' using errcode='42501'; end if;
    if new.data->>'createdBy' is distinct from actor_name and actor_role<>'admin' then
      raise exception 'chat creator mismatch' using errcode='42501';
    end if;
    return new;
  end if;
  if actor_role='admin' then return new; end if;
  if (new.data - array['messages','parts','seen','exports','approvals'])
     is distinct from (old.data - array['messages','parts','seen','exports','approvals']) then
    raise exception 'immutable chat fields changed' using errcode='42501';
  end if;
  if jsonb_typeof(new_messages)<>'array' or jsonb_array_length(new_messages)<jsonb_array_length(old_messages) then
    raise exception 'chat messages are append-only' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(e.value order by e.ord),'[]'::jsonb) into prefix_messages
  from jsonb_array_elements(new_messages) with ordinality e(value,ord)
  where e.ord<=jsonb_array_length(old_messages);
  if prefix_messages is distinct from old_messages then
    raise exception 'existing chat messages cannot be rewritten' using errcode='42501';
  end if;
  select exists (
    select 1 from jsonb_array_elements(new_messages) with ordinality e(value,ord)
    where e.ord>jsonb_array_length(old_messages) and e.value->>'user' is distinct from actor_name
  ) into invalid_message;
  if invalid_message then
    raise exception 'new chat message actor mismatch' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(new.data->'parts','[]'::jsonb))<>'array' then
    raise exception 'chat parts must be an array' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(e.value order by e.value->>'name'),'[]'::jsonb) into old_other_parts
  from jsonb_array_elements(coalesce(old.data->'parts','[]'::jsonb)) e(value)
  where e.value->>'name' is distinct from actor_name;
  select coalesce(jsonb_agg(e.value order by e.value->>'name'),'[]'::jsonb) into new_other_parts
  from jsonb_array_elements(coalesce(new.data->'parts','[]'::jsonb)) e(value)
  where e.value->>'name' is distinct from actor_name;
  if new_other_parts is distinct from old_other_parts then
    raise exception 'user can update only own participation' using errcode='42501';
  end if;
  if (coalesce(new.data->'seen','{}'::jsonb) - actor_name)
     is distinct from (coalesce(old.data->'seen','{}'::jsonb) - actor_name) then
    raise exception 'user can update only own seen state' using errcode='42501';
  end if;
  if (new_approvals - array['pd','ra','rd','sales'])
     is distinct from (old_approvals - array['pd','ra','rd','sales']) then
    raise exception 'unknown approval state changed' using errcode='42501';
  end if;
  if (new_approvals->'pd') is distinct from (old_approvals->'pd') and actor_role<>'pd' then
    raise exception 'only PD can change PD approval' using errcode='42501';
  end if;
  if (new_approvals->'ra') is distinct from (old_approvals->'ra') and actor_role<>'ra' then
    raise exception 'only RA can change RA approval' using errcode='42501';
  end if;
  if (new_approvals->'rd') is distinct from (old_approvals->'rd') and actor_role<>'rd' then
    raise exception 'only RD can change RD approval' using errcode='42501';
  end if;
  if (new_approvals->'sales') is distinct from (old_approvals->'sales') and actor_role<>'sales' then
    raise exception 'only Sales can change Sales approval' using errcode='42501';
  end if;
  if (new_approvals->'pd' is distinct from old_approvals->'pd'
      and new_approvals->'pd' is not null
      and new_approvals->'pd'->>'by' is distinct from actor_name)
  then raise exception 'PD approval actor mismatch' using errcode='42501'; end if;
  if (new_approvals->'ra' is distinct from old_approvals->'ra'
      and new_approvals->'ra' is not null
      and new_approvals->'ra'->>'by' is distinct from actor_name)
  then raise exception 'RA approval actor mismatch' using errcode='42501'; end if;
  if (new_approvals->'rd' is distinct from old_approvals->'rd'
      and new_approvals->'rd' is not null
      and new_approvals->'rd'->>'by' is distinct from actor_name)
  then raise exception 'RD approval actor mismatch' using errcode='42501'; end if;
  if (new_approvals->'sales' is distinct from old_approvals->'sales'
      and new_approvals->'sales' is not null
      and new_approvals->'sales'->>'by' is distinct from actor_name)
  then raise exception 'Sales approval actor mismatch' using errcode='42501'; end if;
  if (new.data->'exports') is distinct from (old.data->'exports') and actor_role<>'opc' then
    raise exception 'only OPC can change export state' using errcode='42501';
  end if;
  return new;
end $$;

revoke all on function private.fs_guard_user_json() from public, anon, authenticated;
revoke all on function private.fs_guard_activity_json() from public, anon, authenticated;
revoke all on function private.fs_guard_record_json() from public, anon, authenticated;
revoke all on function private.fs_guard_chat_json() from public, anon, authenticated;
drop trigger if exists fs_users_guard on public.fs_users;
create trigger fs_users_guard before insert or update on public.fs_users
for each row execute function private.fs_guard_user_json();
drop trigger if exists fs_activities_guard on public.fs_activities;
create trigger fs_activities_guard before insert on public.fs_activities
for each row execute function private.fs_guard_activity_json();
drop trigger if exists fs_records_guard on public.fs_records;
create trigger fs_records_guard before insert or update on public.fs_records
for each row execute function private.fs_guard_record_json();
drop trigger if exists fs_chats_guard on public.fs_chats;
create trigger fs_chats_guard before insert or update on public.fs_chats
for each row execute function private.fs_guard_chat_json();

do $$
declare t text;
begin
  foreach t in array array['fs_records','fs_chats','fs_users','fs_activities','fs_meta','fs_memberships'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('drop policy if exists anon_all on public.%I',t);
  end loop;
end $$;

revoke all on table public.fs_records,public.fs_chats,public.fs_users,
  public.fs_activities,public.fs_meta,public.fs_memberships from public,anon,authenticated;
grant select on public.fs_chats to authenticated;
grant select,insert,update,delete on public.fs_records to authenticated;
grant select,insert,update,delete on public.fs_users,public.fs_memberships to authenticated;
grant select,insert on public.fs_activities to authenticated;
grant select,insert,update,delete on public.fs_meta to authenticated;

alter table public.fs_chat_events enable row level security;
alter table public.fs_chat_events force row level security;
alter table public.fs_chat_reads enable row level security;
alter table public.fs_chat_reads force row level security;
revoke all on table public.fs_chat_events,public.fs_chat_reads from public,anon,authenticated;
grant select on public.fs_chat_events,public.fs_chat_reads to authenticated;

drop policy if exists chat_events_member_select on public.fs_chat_events;
create policy chat_events_member_select on public.fs_chat_events for select to authenticated
using (private.fs_is_active_member());
drop policy if exists chat_reads_self_select on public.fs_chat_reads;
create policy chat_reads_self_select on public.fs_chat_reads for select to authenticated
using (private.fs_is_active_member() and user_id=auth.uid());

create or replace function public.fs_append_chat_event(
  p_event_id text,
  p_job_id text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := private.fs_current_role();
  actor_name text := private.fs_current_name();
  event_type text := coalesce(p_payload->>'type','');
  action_name text := coalesce(p_payload->>'action','');
  approval_key text := coalesce(p_payload->>'key','');
  text_value text := btrim(coalesce(p_payload->>'text',''));
  approval_value jsonb := 'null'::jsonb;
  event_data jsonb;
  existing_data jsonb;
  existing_job_id text;
  chat_data jsonb;
  parts_data jsonb;
  message_data jsonb;
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  if actor_name is null or actor_role is null then
    raise exception 'active membership required' using errcode='42501';
  end if;
  if p_event_id is null or p_event_id !~ '^[A-Za-z0-9:_-]{1,160}$' then
    raise exception 'invalid chat event id' using errcode='42501';
  end if;
  if p_job_id is null or p_job_id !~ '^[A-Z]+[0-9]{5}$' then
    raise exception 'invalid chat job id' using errcode='42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'chat event payload must be an object' using errcode='42501';
  end if;

  select e.job_id,e.data into existing_job_id,existing_data
  from public.fs_chat_events e where e.event_id=p_event_id;
  if found then
    if existing_job_id is distinct from p_job_id then
      raise exception 'chat event id already belongs to another job' using errcode='42501';
    end if;
    return existing_data;
  end if;

  if event_type='message' then
    if text_value='' or length(text_value)>10000 then
      raise exception 'chat message must be 1 to 10000 characters' using errcode='22023';
    end if;
    event_data := jsonb_build_object(
      'version',1,'type','message','actor',actor_name,'ts',now_ms,
      'text',text_value,'event_id',p_event_id
    );
  elsif event_type in ('approval_set','approval_revoke') then
    if approval_key not in ('pd','ra','rd','sales') or
       (actor_role <> approval_key and actor_role <> 'admin') then
      raise exception 'approval role mismatch' using errcode='42501';
    end if;
    if event_type='approval_set' then
      approval_value := jsonb_build_object(
        'by',actor_name,
        'at',to_char(clock_timestamp(),'YYYY-MM-DD HH24:MI:SS'),
        'ts',now_ms
      );
    end if;
    event_data := jsonb_build_object(
      'version',1,'type',event_type,'actor',actor_name,'ts',now_ms,
      'key',approval_key,'approval',approval_value,'event_id',p_event_id
    );
  elsif event_type='system' then
    if text_value='' or length(text_value)>5000 then
      raise exception 'system Chat event text is invalid' using errcode='22023';
    end if;
    if action_name in ('formula_change','job_edit') and actor_role not in ('admin','pd') then
      raise exception 'formula system event role mismatch' using errcode='42501';
    end if;
    if action_name in ('close_job','reopen_job') and actor_role not in ('admin','sales','opc') then
      raise exception 'job system event role mismatch' using errcode='42501';
    end if;
    if action_name='export' and actor_role not in ('admin','opc') then
      raise exception 'export system event role mismatch' using errcode='42501';
    end if;
    if action_name not in ('chat_created','formula_change','job_edit','close_job','reopen_job','export') then
      raise exception 'unknown system Chat event' using errcode='42501';
    end if;
    event_data := jsonb_build_object(
      'version',1,'type','system','actor',actor_name,'ts',now_ms,
      'action',action_name,'text',text_value,'event_id',p_event_id
    );
  else
    raise exception 'unknown Chat event type' using errcode='22023';
  end if;

  insert into public.fs_chat_events(event_id,job_id,data)
  values (p_event_id,p_job_id,event_data);

  if not exists (select 1 from public.fs_chats c where c.job_id=p_job_id) then
    insert into public.fs_chats(job_id,data) values (
      p_job_id,
      jsonb_build_object(
        'jobId',p_job_id,'createdAt',now_ms,'createdBy',actor_name,
        'messages','[]'::jsonb,'parts','[]'::jsonb,'seen','{}'::jsonb,
        'approvals',jsonb_build_object('pd',null,'ra',null,'rd',null,'sales',null)
      )
    );
  end if;

  select c.data into chat_data from public.fs_chats c
  where c.job_id=p_job_id for update;
  select coalesce(jsonb_agg(
    case when e.value->>'name'=actor_name then
      e.value || jsonb_build_object(
        'lastAt',now_ms,
        'msgs',coalesce((e.value->>'msgs')::integer,0) + case when event_type='message' then 1 else 0 end
      )
    else e.value end order by e.ord
  ),'[]'::jsonb) into parts_data
  from jsonb_array_elements(coalesce(chat_data->'parts','[]'::jsonb)) with ordinality e(value,ord);
  if not exists (
    select 1 from jsonb_array_elements(coalesce(chat_data->'parts','[]'::jsonb)) e(value)
    where e.value->>'name'=actor_name
  ) then
    parts_data := parts_data || jsonb_build_array(jsonb_build_object(
      'name',actor_name,'firstAt',now_ms,'lastAt',now_ms,'msgs',case when event_type='message' then 1 else 0 end,'activeMs',0
    ));
  end if;
  chat_data := jsonb_set(chat_data,'{parts}',parts_data,true);
  if event_type='message' then
    message_data := jsonb_build_object('type','msg','user',actor_name,'text',text_value,'ts',now_ms,'eventId',p_event_id);
    chat_data := jsonb_set(chat_data,'{messages}',coalesce(chat_data->'messages','[]'::jsonb) || jsonb_build_array(message_data),true);
  elsif event_type='system' then
    message_data := jsonb_build_object('type','sys','user',actor_name,'text',text_value,'ts',now_ms,'eventId',p_event_id);
    chat_data := jsonb_set(chat_data,'{messages}',coalesce(chat_data->'messages','[]'::jsonb) || jsonb_build_array(message_data),true);
    if action_name in ('formula_change','job_edit') then
      chat_data := jsonb_set(chat_data,'{approvals}',jsonb_build_object('pd',null,'ra',null,'rd',null,'sales',null),true);
    elsif action_name='export' then
      chat_data := jsonb_set(chat_data,'{exports}',to_jsonb(coalesce((chat_data->>'exports')::integer,0)+1),true);
      chat_data := jsonb_set(chat_data,'{lastExportBy}',to_jsonb(actor_name),true);
      chat_data := jsonb_set(chat_data,'{lastExportAt}',to_jsonb(to_char(clock_timestamp(),'YYYY-MM-DD HH24:MI:SS')),true);
    end if;
  else
    message_data := jsonb_build_object(
      'type','sys','user',actor_name,
      'text',case when event_type='approval_set' then actor_name || ' อนุมัติ ' || upper(approval_key) || ' ✓'
                  else actor_name || ' ยกเลิกการอนุมัติ ' || upper(approval_key) end,
      'ts',now_ms,'eventId',p_event_id
    );
    chat_data := jsonb_set(chat_data,'{messages}',coalesce(chat_data->'messages','[]'::jsonb) || jsonb_build_array(message_data),true);
    chat_data := jsonb_set(chat_data,array['approvals',approval_key],approval_value,true);
  end if;
  update public.fs_chats set data=chat_data,updated_at=now() where job_id=p_job_id;
  return event_data;
end $$;

create or replace function public.fs_mark_chat_seen(p_job_id text, p_seen_ts bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.fs_is_active_member() then
    raise exception 'active membership required' using errcode='42501';
  end if;
  if p_job_id is null or p_job_id !~ '^[A-Z]+[0-9]{5}$' then
    raise exception 'invalid chat job id' using errcode='42501';
  end if;
  insert into public.fs_chat_reads(user_id,job_id,seen_ts)
  values (auth.uid(),p_job_id,greatest(coalesce(p_seen_ts,0),0))
  on conflict (user_id,job_id) do update
    set seen_ts=greatest(public.fs_chat_reads.seen_ts,excluded.seen_ts),updated_at=now();
  update public.fs_chats
  set data=jsonb_set(
    coalesce(data,'{}'::jsonb),
    array['seen',private.fs_current_name()],
    to_jsonb(greatest(coalesce(p_seen_ts,0),0)),
    true
  ), updated_at=now()
  where job_id=p_job_id;
  return true;
end $$;

create or replace function public.fs_delete_chat(p_job_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.fs_current_role() <> 'admin' then
    raise exception 'only Admin can delete Chat' using errcode='42501';
  end if;
  delete from public.fs_chat_reads where job_id=p_job_id;
  delete from public.fs_chat_events where job_id=p_job_id;
  delete from public.fs_chats where job_id=p_job_id;
  return true;
end $$;

revoke all on function public.fs_append_chat_event(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.fs_mark_chat_seen(text,bigint) from public,anon,authenticated;
revoke all on function public.fs_delete_chat(text) from public,anon,authenticated;
grant execute on function public.fs_append_chat_event(text,text,jsonb) to authenticated;
grant execute on function public.fs_mark_chat_seen(text,bigint) to authenticated;
grant execute on function public.fs_delete_chat(text) to authenticated;

-- Rerunnable legacy backfill. It records old messages/approvals without changing fs_chats.
insert into public.fs_chat_events(event_id,job_id,data)
select c.job_id || ':legacy:message:' || e.ord::text,
       c.job_id,
       jsonb_build_object(
         'version',1,
         'type',case when e.value->>'type'='msg' then 'message' else 'system' end,
         'actor',coalesce(e.value->>'user',''),
         'ts',coalesce((e.value->>'ts')::bigint,0),
         'text',coalesce(e.value->>'text',''),
         'legacy',true
       )
from public.fs_chats c
cross join lateral jsonb_array_elements(coalesce(c.data->'messages','[]'::jsonb)) with ordinality e(value,ord)
on conflict (event_id) do nothing;
insert into public.fs_chat_events(event_id,job_id,data)
select c.job_id || ':legacy:approval:' || k.key,
       c.job_id,
       jsonb_build_object(
         'version',1,'type','approval_set','actor',coalesce(c.data->'approvals'->k.key->>'by',''),
         'ts',coalesce((c.data->'approvals'->k.key->>'ts')::bigint,0),
         'key',k.key,'approval',c.data->'approvals'->k.key,'legacy',true
       )
from public.fs_chats c
cross join lateral unnest(array['pd','ra','rd','sales']) k(key)
where c.data->'approvals'->k.key is not null
on conflict (event_id) do nothing;

drop policy if exists memberships_self_or_admin_select on public.fs_memberships;
create policy memberships_self_or_admin_select on public.fs_memberships for select to authenticated
using (private.fs_is_active_member() and (user_id=auth.uid() or private.fs_current_role()='admin'));
drop policy if exists memberships_admin_insert on public.fs_memberships;
create policy memberships_admin_insert on public.fs_memberships for insert to authenticated
with check (private.fs_current_role()='admin');
drop policy if exists memberships_admin_update on public.fs_memberships;
create policy memberships_admin_update on public.fs_memberships for update to authenticated
using (private.fs_current_role()='admin') with check (private.fs_current_role()='admin');
drop policy if exists memberships_admin_delete on public.fs_memberships;
create policy memberships_admin_delete on public.fs_memberships for delete to authenticated
using (private.fs_current_role()='admin');

drop policy if exists records_member_select on public.fs_records;
create policy records_member_select on public.fs_records for select to authenticated
using (private.fs_is_active_member());
drop policy if exists records_role_insert on public.fs_records;
create policy records_role_insert on public.fs_records for insert to authenticated
with check (private.fs_current_role() in ('admin','sales','opc','mkt'));
drop policy if exists records_role_update on public.fs_records;
create policy records_role_update on public.fs_records for update to authenticated
using (private.fs_current_role() in ('admin','sales','opc','mkt','pd'))
with check (private.fs_current_role() in ('admin','sales','opc','mkt','pd'));
drop policy if exists records_admin_delete on public.fs_records;
create policy records_admin_delete on public.fs_records for delete to authenticated
using (private.fs_current_role()='admin');

drop policy if exists chats_member_select on public.fs_chats;
create policy chats_member_select on public.fs_chats for select to authenticated
using (private.fs_is_active_member());
drop policy if exists chats_member_insert on public.fs_chats;
create policy chats_member_insert on public.fs_chats for insert to authenticated
with check (private.fs_is_active_member());
drop policy if exists chats_member_update on public.fs_chats;
create policy chats_member_update on public.fs_chats for update to authenticated
using (private.fs_is_active_member()) with check (private.fs_is_active_member());
drop policy if exists chats_admin_delete on public.fs_chats;
create policy chats_admin_delete on public.fs_chats for delete to authenticated
using (private.fs_current_role()='admin');

drop policy if exists users_member_select on public.fs_users;
create policy users_member_select on public.fs_users for select to authenticated
using (private.fs_is_active_member());
drop policy if exists users_admin_insert on public.fs_users;
create policy users_admin_insert on public.fs_users for insert to authenticated
with check (private.fs_current_role()='admin');
drop policy if exists users_admin_update on public.fs_users;
create policy users_admin_update on public.fs_users for update to authenticated
using (private.fs_current_role()='admin') with check (private.fs_current_role()='admin');
drop policy if exists users_admin_delete on public.fs_users;
create policy users_admin_delete on public.fs_users for delete to authenticated
using (private.fs_current_role()='admin');

drop policy if exists activities_admin_select on public.fs_activities;
create policy activities_admin_select on public.fs_activities for select to authenticated
using (private.fs_current_role()='admin');
drop policy if exists activities_member_insert on public.fs_activities;
create policy activities_member_insert on public.fs_activities for insert to authenticated
with check (private.fs_is_active_member());

drop policy if exists meta_member_select on public.fs_meta;
create policy meta_member_select on public.fs_meta for select to authenticated
using (private.fs_is_active_member());
drop policy if exists meta_creator_insert on public.fs_meta;
create policy meta_creator_insert on public.fs_meta for insert to authenticated
with check (private.fs_current_role() in ('admin','sales','opc','mkt'));
drop policy if exists meta_creator_update on public.fs_meta;
create policy meta_creator_update on public.fs_meta for update to authenticated
using (private.fs_current_role() in ('admin','sales','opc','mkt'))
with check (private.fs_current_role() in ('admin','sales','opc','mkt'));
drop policy if exists meta_admin_delete on public.fs_meta;
create policy meta_admin_delete on public.fs_meta for delete to authenticated
using (private.fs_current_role()='admin');

commit;
