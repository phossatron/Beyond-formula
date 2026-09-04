\set ON_ERROR_STOP on

-- Forward migration maps the legacy Admin by normalized email and nulls pass.
do $$
begin
  if not exists (
    select 1 from public.fs_memberships
    where user_id='11111111-1111-1111-1111-111111111111' and role='admin' and active
  ) then raise exception 'legacy Admin membership was not migrated'; end if;
  if (select data->'pass' from public.fs_users where name='Admin Owner') is distinct from 'null'::jsonb
     or not (select data ? 'pass' from public.fs_users where name='Admin Owner')
  then raise exception 'fs_users.data.pass must remain present and JSON null'; end if;
end $$;

insert into public.fs_memberships(user_id,name,role,active) values
  ('22222222-2222-2222-2222-222222222222','Sales One','sales',true),
  ('33333333-3333-3333-3333-333333333333','Sales Two','sales',true),
  ('44444444-4444-4444-4444-444444444444','PD One','pd',true),
  ('55555555-5555-5555-5555-555555555555','RA One','ra',true),
  ('66666666-6666-6666-6666-666666666666','Inactive User','sales',false),
  ('88888888-8888-8888-8888-888888888888','OPC One','opc',true)
on conflict (user_id) do update set name=excluded.name,role=excluded.role,active=excluded.active;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
insert into public.fs_records(id,data) values
  ('A00001','{"id":"A00001","customer":"Alpha","createdBy":"Sales One","salesOwner":"Sales One","rows":[],"closed":false}'::jsonb),
  ('A00002','{"id":"A00002","customer":"Beta","createdBy":"Sales Two","salesOwner":"Sales Two","rows":[],"closed":false}'::jsonb)
on conflict (id) do update set data=excluded.data;
select public.fs_append_chat_event(
  'seed-chat','A00001','{"type":"system","action":"chat_created","text":"seed"}'::jsonb
);
insert into public.fs_activities(uid,ts,data) values
  ('seed-event',0,'{"user":"Admin Owner"}'::jsonb)
on conflict (uid) do nothing;
commit;

-- Utility: an expected authorization failure must set psql's ERROR flag.
\set ON_ERROR_STOP off
begin; set local role anon; select * from public.fs_records;
\if :ERROR
  \echo 'PASS anon read denied'
\else
  \echo 'FAIL anon read unexpectedly allowed'
  \quit 1
\endif
rollback;

begin; set local role anon; insert into public.fs_records(id,data) values ('X00001','{"id":"X00001"}');
\if :ERROR
  \echo 'PASS anon write denied'
\else
  \echo 'FAIL anon write unexpectedly allowed'
  \quit 1
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','77777777-7777-7777-7777-777777777777',true); select 1/count(*) from public.fs_records;
\if :ERROR
  \echo 'PASS unknown user denied'
\else
  \echo 'FAIL unknown user unexpectedly allowed'
  \quit 1
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666',true); select 1/count(*) from public.fs_records;
\if :ERROR
  \echo 'PASS inactive user denied'
\else
  \echo 'FAIL inactive user unexpectedly allowed'
  \quit 1
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true); update public.fs_records set data=jsonb_set(data,'{customer}','"Hijacked"') where id='A00002';
\if :ERROR
  \echo 'PASS Sales cannot update another owner record'
\else
  \echo 'FAIL Sales updated another owner record'
  \quit 1
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',true); update public.fs_records set data=jsonb_set(data,'{customer}','"Changed by PD"') where id='A00001';
\if :ERROR
  \echo 'PASS PD customer mutation denied'
\else
  \echo 'FAIL PD changed customer field'
  \quit 1
\endif
rollback;

-- PD ต้องแก้หมวด Job Data ที่ canEditSection() เปิดให้ได้จริง
-- ก่อนหน้านี้ pd_keys มีแค่ rows/rdUpdated/modNote ทำให้ UI ยอมให้กดบันทึกแล้ว
-- เซิร์ฟเวอร์ปฏิเสธ 42501 → PostgREST ตอบ 403 → ผู้ใช้ถูกเด้งออกจากระบบ
begin; set local role authenticated; select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',true);
update public.fs_records set data=jsonb_set(data,'{conceptStr}','"เซรั่มบำรุงผิวหน้า"') where id='A00001';
\if :ERROR
  \echo 'FAIL PD could not edit the product concept'
  \quit 1
\else
  \echo 'PASS PD edits product section'
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',true);
update public.fs_records set data = data
  || jsonb_build_object('color','ใส','scent','ไม่มีกลิ่น','packType','ขวดปั๊ม','widthCm','4','lengthCm','12')
  || jsonb_build_object('finalTarget','ผู้หญิง 25-35','gender','หญิง','price','390','priority','สูง','fdaType','เครื่องสำอาง')
  || jsonb_build_object('allBenefits','["ลดเลือนริ้วรอย"]'::jsonb,'benefits','["ลดเลือนริ้วรอย"]'::jsonb,'cons','["แพ้ง่ายควรทดสอบ"]'::jsonb,'notes','ทดสอบ')
  where id='A00001';
\if :ERROR
  \echo 'FAIL PD could not edit spec/target/benefit sections'
  \quit 1
\else
  \echo 'PASS PD edits spec, target and benefit sections'
\endif
rollback;

-- แต่สิทธิ์ที่เพิ่มให้ต้องไม่เลยขอบเขต: กล่องลูกค้า & แบรนด์ ยังล็อกอยู่ทุก Role
begin; set local role authenticated; select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',true);
update public.fs_records set data=jsonb_set(data,'{brand}','"Rebranded by PD"') where id='A00001';
\if :ERROR
  \echo 'PASS PD brand mutation still denied'
\else
  \echo 'FAIL PD changed brand field'
  \quit 1
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',true);
update public.fs_records set data=jsonb_set(data,'{salesOwner}','"PD One"') where id='A00001';
\if :ERROR
  \echo 'PASS PD salesOwner mutation still denied'
\else
  \echo 'FAIL PD reassigned the sales owner'
  \quit 1
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',true);
update public.fs_records set data=jsonb_set(data,'{closed}','{"by":"PD One","at":"now","ts":1}'::jsonb) where id='A00001';
\if :ERROR
  \echo 'PASS PD still cannot close a job'
\else
  \echo 'FAIL PD closed a job'
  \quit 1
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',true); update public.fs_chats set data=jsonb_set(data,'{approvals,pd}','{"by":"RA One"}') where job_id='A00001';
\if :ERROR
  \echo 'PASS RA cannot change PD approval'
\else
  \echo 'FAIL RA changed PD approval'
  \quit 1
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',true); update public.fs_chats set data=jsonb_set(data,'{approvals,ra}','{"by":"Spoofed Name"}') where job_id='A00001';
\if :ERROR
  \echo 'PASS approval actor spoof denied'
\else
  \echo 'FAIL approval actor spoof unexpectedly allowed'
  \quit 1
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true); select 1/count(*) from public.fs_activities;
\if :ERROR
  \echo 'PASS non-Admin activity read denied'
\else
  \echo 'FAIL non-Admin read activity log'
  \quit 1
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true); update public.fs_activities set data='{}' where uid='none';
\if :ERROR
  \echo 'PASS activity log update denied'
\else
  \echo 'FAIL activity log update unexpectedly allowed'
  \quit 1
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true); insert into public.fs_activities(uid,ts,data) values ('spoofed-event',2,'{"user":"Sales Two"}');
\if :ERROR
  \echo 'PASS activity actor spoof denied'
\else
  \echo 'FAIL activity actor spoof unexpectedly allowed'
  \quit 1
\endif
rollback;

begin; set local role authenticated; select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',true); update public.fs_chats set data=jsonb_set(data,'{messages}','[{"type":"msg","user":"Sales One","text":"forged"}]') where job_id='A00001';
\if :ERROR
  \echo 'PASS chat actor spoof denied'
\else
  \echo 'FAIL chat actor spoof unexpectedly allowed'
  \quit 1
\endif
rollback;
\set ON_ERROR_STOP on

-- Chat event store: append-only, idempotent, server-stamped actor, and RPC-only writes.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
do $$
declare
  first_event jsonb;
  duplicate_event jsonb;
  event_count integer;
  message_count integer;
begin
  first_event := public.fs_append_chat_event(
    'sales-message-1','A00001','{"type":"message","text":"first"}'::jsonb
  );
  duplicate_event := public.fs_append_chat_event(
    'sales-message-1','A00001','{"type":"message","text":"different payload"}'::jsonb
  );
  if first_event is distinct from duplicate_event then
    raise exception 'duplicate event did not return the original canonical event';
  end if;
  select count(*) into event_count from public.fs_chat_events where event_id='sales-message-1';
  if event_count <> 1 then raise exception 'duplicate event created more than one row'; end if;
  select jsonb_array_length(data->'messages') into message_count from public.fs_chats where job_id='A00001';
  if message_count <> 2 then raise exception 'projection duplicated or lost the message'; end if;
  if first_event->>'actor' <> 'Sales One' then raise exception 'event actor was not server stamped'; end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',true);
do $$
declare event_data jsonb;
begin
  event_data := public.fs_append_chat_event(
    'ra-approval-1','A00001',
    '{"type":"approval_set","key":"ra","approval":{"by":"Spoofed Name"}}'::jsonb
  );
  if event_data->>'actor' <> 'RA One' then raise exception 'approval actor was not server stamped'; end if;
  if event_data->'approval'->>'by' <> 'RA One' then raise exception 'approval payload accepted spoofed actor'; end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
select public.fs_mark_chat_seen('A00001',123456789);
do $$ begin
  if (select seen_ts from public.fs_chat_reads
      where user_id='22222222-2222-2222-2222-222222222222' and job_id='A00001') <> 123456789
  then raise exception 'chat read marker was not saved'; end if;
end $$;
rollback;

\set ON_ERROR_STOP off
begin; set local role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true); insert into public.fs_chat_events(event_id,job_id,data) values ('direct-write','A00001','{}'::jsonb);
\if :ERROR
  \echo 'PASS direct chat event insert denied'
\else
  \echo 'FAIL direct chat event insert unexpectedly allowed'
  \quit 1
\endif
rollback;
\set ON_ERROR_STOP on

-- Positive paths.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
do $$ begin if (select count(*) from public.fs_records) <> 2 then raise exception 'active member cannot read shared records'; end if; end $$;
update public.fs_records set data=jsonb_set(data,'{customer}','"Alpha Updated"') where id='A00001';
insert into public.fs_activities(uid,ts,data) values ('sales-event',1,'{"user":"Sales One"}');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',true);
update public.fs_records set data=jsonb_set(data,'{rows}','[{"name":"Vitamin C"}]') where id='A00001';
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',true);
select public.fs_append_chat_event('positive-ra','A00001','{"type":"approval_set","key":"ra"}'::jsonb);
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
insert into public.fs_memberships(user_id,name,role,active)
values ('77777777-7777-7777-7777-777777777777','Former Unknown','purchasing',true);
insert into public.fs_users(name,data)
values ('New User','{"name":"New User","role":"purchasing","email":"new@example.test","pass":null}');
rollback;

-- Rollback is compatibility-only: data stays, named legacy policy returns.
\ir ../../supabase/rollback_auth_rls.sql
do $$
begin
  if not exists (select 1 from public.fs_records where id='A00001') then raise exception 'rollback dropped application data'; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fs_records' and policyname='anon_all')
  then raise exception 'rollback did not restore anon_all'; end if;
end $$;

begin;
set local role anon;
select count(*) from public.fs_records;
rollback;
\echo 'PASS SQL authorization and rollback contract'
