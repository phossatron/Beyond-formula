-- ============================================================
-- Formula Studio — โครงสร้างฐานข้อมูลกลาง (Supabase / Postgres)
-- ============================================================
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
--
-- หลักการออกแบบ (ตามกฎข้อ 1 ใน CLAUDE.md — ห้ามแก้ไขโครงสร้างข้อมูล):
--   เก็บ object รูปทรงเดิมของแอปทั้งก้อนไว้ในคอลัมน์ jsonb ชื่อ data
--   ไม่แตกฟิลด์ออกเป็นคอลัมน์ → ชื่อฟิลด์และชนิดข้อมูลเดิมไม่ต้องเปลี่ยนแม้แต่ตัวเดียว
--   และเพิ่มฟิลด์ใหม่ในแอปได้ต่อไปโดยไม่ต้องแก้ฐานข้อมูล
-- ============================================================

-- ---------- ชุดข้อมูลงาน (fs_records) ----------
create table if not exists fs_records (
  id         text primary key,          -- รหัสงาน A00001
  data       jsonb not null,            -- record object ทั้งก้อน
  updated_at timestamptz not null default now()
);

-- ---------- ห้องแชท (fs_chats) ----------
create table if not exists fs_chats (
  job_id     text primary key,          -- ผูกกับ fs_records.id
  data       jsonb not null,            -- chat object ทั้งก้อน (messages/parts/approvals)
  updated_at timestamptz not null default now()
);

-- ---------- ผู้ใช้ (fs_users) ----------
create table if not exists fs_users (
  name       text primary key,          -- ชื่อผู้ใช้ (คีย์เดิมของแอป)
  data       jsonb not null,            -- {name, role, email, pass}
  updated_at timestamptz not null default now()
);

-- ---------- Activities log (fs_activities) — append only ----------
-- uid = รหัสประจำเหตุการณ์ที่แอปคำนวณจากเนื้อหา ทำให้ส่งซ้ำกี่ครั้งก็ไม่เกิดรายการซ้ำ
create table if not exists fs_activities (
  uid        text primary key,
  ts         bigint not null,           -- Date.now() ตอนเกิดเหตุการณ์
  data       jsonb not null
);
create index if not exists fs_activities_ts_idx on fs_activities (ts desc);

-- ---------- ค่าอื่น ๆ ของระบบ (fs_meta) ----------
-- ใช้เก็บ reccounter = ตัวนับเลขรันของรหัสงาน (ห้ามย้อนกลับ)
create table if not exists fs_meta (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- สิทธิ์การเข้าถึง
-- ============================================================
-- โปรเจกต์นี้ยังใช้ระบบ login เดิมของแอป (ตรวจฝั่ง client) ยังไม่ได้ใช้ Supabase Auth
-- จึงต้องเปิดให้ anon key อ่าน/เขียนได้ มิฉะนั้นแอปจะทำงานไม่ได้
--
-- ⚠️ ข้อควรรู้: ใครที่รู้ URL + anon key (ซึ่งอยู่ในไฟล์ index.html ที่เปิดดูได้)
--    สามารถอ่าน/แก้ข้อมูลทั้งหมดได้ เหมาะกับข้อมูลภายในทีมเท่านั้น
--    ถ้าต้องการกันจริง ต้องเปลี่ยนไปใช้ Supabase Auth + RLS ตาม user (งานอีกก้อน)
-- ============================================================
alter table fs_records    enable row level security;
alter table fs_chats      enable row level security;
alter table fs_users      enable row level security;
alter table fs_activities enable row level security;
alter table fs_meta       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fs_records','fs_chats','fs_users','fs_activities','fs_meta'] loop
    execute format('drop policy if exists anon_all on %I', t);
    execute format(
      'create policy anon_all on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ============================================================
-- อัพเดต updated_at อัตโนมัติทุกครั้งที่มีการแก้ไข
-- ============================================================
create or replace function fs_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['fs_records','fs_chats','fs_users','fs_meta'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before update on %I for each row execute function fs_touch_updated_at()', t, t);
  end loop;
end $$;
