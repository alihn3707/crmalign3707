-- ============================================================
-- setup-members-plus.sql
-- مرحله‌ی ۱: سمت سرور برای اعضای پیشرفته
--   * فضای ذخیره‌ی جدا برای هر عضو (فایل، مشتری، بازدید، گزارش)
--   * ارجاع کار + یادداشت زیر هر کار
--   * دسترسی قابل تنظیم و فعال/غیرفعال کردن عضو
--   * گزارش فعالیت و آمار
--   * پیشنهاد انتقال فایل/مشتری عضو به لیست اصلی (با تأیید مدیر)
-- روی Supabase فعلی (که setup.sql قبلاً اجرا شده) اجرا کن. اجرای دوباره مشکلی ایجاد نمی‌کند.
-- ============================================================

-- ---------- ۱) ستون‌های جدید برای اعضا ----------
alter table public.crm_members add column if not exists active boolean not null default true;
alter table public.crm_members add column if not exists perms jsonb not null default '{}'::jsonb;
alter table public.crm_members add column if not exists last_login timestamptz;
alter table public.crm_members add column if not exists last_seen timestamptz;
alter table public.crm_members add column if not exists fails int not null default 0;
alter table public.crm_members add column if not exists locked_until timestamptz;

-- ---------- ۲) جدول‌ها ----------
create table if not exists public.crm_member_data (
  member text not null references public.crm_members(u) on update cascade on delete cascade,
  k text not null,
  j text,
  t bigint,
  primary key (member, k)
);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  member text not null references public.crm_members(u) on update cascade on delete cascade,
  cust text,
  file text,
  due timestamptz,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  report text not null default '',
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  done_at timestamptz
);

create table if not exists public.crm_task_notes (
  id bigserial primary key,
  task uuid not null references public.crm_tasks(id) on delete cascade,
  author text not null,
  body text not null,
  created timestamptz not null default now()
);

create table if not exists public.crm_transfers (
  id uuid primary key default gen_random_uuid(),
  member text not null references public.crm_members(u) on update cascade on delete cascade,
  kind text not null check (kind in ('file', 'cust')),
  item jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created timestamptz not null default now(),
  decided timestamptz
);

alter table public.crm_member_data enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_task_notes enable row level security;
alter table public.crm_transfers enable row level security;

-- ---------- ۳) توابع کمکی داخلی (از بیرون قابل فراخوانی نیستند) ----------
create or replace function public.crm_check_admin() returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is distinct from (select owner from crm_config limit 1) then
    raise exception 'denied';
  end if;
end $$;

-- ورود عضو: نام کاربری را برمی‌گرداند یا null؛ بعد از ۸ رمز اشتباه، ۱۰ دقیقه قفل می‌شود
create or replace function public.crm_auth(p_u text, p_p text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r crm_members%rowtype;
begin
  select * into r from crm_members where u = lower(trim(p_u));
  if not found then return null; end if;
  if r.active is not true then return null; end if;
  if r.locked_until is not null and r.locked_until > now() then return null; end if;
  if r.pw = extensions.crypt(coalesce(p_p, ''), r.pw) then
    update crm_members set fails = 0, locked_until = null, last_seen = now() where u = r.u;
    return r.u;
  end if;
  update crm_members
     set fails = fails + 1,
         locked_until = case when fails + 1 >= 8 then now() + interval '10 minutes' else null end
   where u = r.u;
  return null;
end $$;

create or replace function public.crm_perm(p_u text, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (perms ->> p_key)::boolean from crm_members where u = p_u), true)
$$;

create or replace function public.crm_cnt(p_j text) returns int
language plpgsql immutable as $$
declare x jsonb;
begin
  if p_j is null then return 0; end if;
  x := crm_json(p_j::jsonb);
  if jsonb_typeof(x) = 'array' then return jsonb_array_length(x); end if;
  return 0;
exception when others then
  return 0;
end $$;

create or replace function public.crm_arr(p_j text) returns jsonb
language plpgsql immutable as $$
declare x jsonb;
begin
  if p_j is null then return '[]'::jsonb; end if;
  x := crm_json(p_j::jsonb);
  if jsonb_typeof(x) = 'array' then return x; end if;
  return '[]'::jsonb;
exception when others then
  return '[]'::jsonb;
end $$;

create or replace function public.crm_task_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(t) || jsonb_build_object('notes', coalesce((
      select jsonb_agg(jsonb_build_object('by', n.author, 'body', n.body, 'at', n.created) order by n.created)
        from crm_task_notes n where n.task = t.id), '[]'::jsonb))
    from crm_tasks t where t.id = p_id
$$;

-- ---------- ۴) توابع عضو (با نام کاربری و رمز) ----------
-- ورود و دریافت دسترسی‌ها
create or replace function public.member_login(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u text;
begin
  u := crm_auth(p_u, p_p);
  if u is null then return null; end if;
  update crm_members set last_login = now() where crm_members.u = member_login.u;
  return jsonb_build_object('u', u, 'perms', (select perms from crm_members where crm_members.u = member_login.u));
end $$;

-- فایل‌های اصلی دپارتمان (بدون نام و تلفن مالک)؛ جایگزین نسخه‌ی قبلی
create or replace function public.member_files(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u text; o uuid; fj jsonb; hj jsonb;
begin
  u := crm_auth(p_u, p_p);
  if u is null or not crm_perm(u, 'main_files') then return null; end if;
  select owner into o from crm_config limit 1;
  select crm_json(a.j::jsonb) into fj from app_data a where a.user_id = o and a.k = 's_files';
  select crm_json(a.j::jsonb) into hj from app_data a where a.user_id = o and a.k = 's_hoods';
  return jsonb_build_object(
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', x->'code', 'cat', x->'cat', 'area', x->'area', 'hood', x->'hood',
        'size', x->'size', 'price', x->'price', 'age', x->'age', 'bed', x->'bed',
        'dir', x->'dir', 'floor', x->'floor', 'floors', x->'floors',
        'park', x->'park', 'stor', x->'stor', 'elev', x->'elev',
        'deed', x->'deed', 'occ', x->'occ', 'photos', x->'photos'))
      from jsonb_array_elements(coalesce(fj, '[]'::jsonb)) x
      where x->>'st' = 'active'), '[]'::jsonb),
    'hoods', coalesce((
      select jsonb_agg(jsonb_build_object('code', h->'code', 'name', h->'name'))
      from jsonb_array_elements(coalesce(hj, '[]'::jsonb)) h), '[]'::jsonb)
  );
end $$;

-- مشخصات کامل (نام و تلفن مالک) فقط برای فایلی که به خود عضو ارجاع شده
create or replace function public.member_task_file(p_u text, p_p text, p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u text; o uuid; fj jsonb; r jsonb;
begin
  u := crm_auth(p_u, p_p);
  if u is null then return null; end if;
  if not exists (select 1 from crm_tasks where member = u and file = p_code and status <> 'completed') then
    return null;
  end if;
  select owner into o from crm_config limit 1;
  select crm_json(a.j::jsonb) into fj from app_data a where a.user_id = o and a.k = 's_files';
  select jsonb_build_object('code', x->'code', 'owner', x->'owner', 'phone', x->'phone', 'area', x->'area')
    into r
    from jsonb_array_elements(coalesce(fj, '[]'::jsonb)) x
   where x->>'code' = p_code limit 1;
  return r;
end $$;

-- خواندن و نوشتن داده‌ی شخصی عضو (فقط کلیدهای مجاز)
create or replace function public.member_data_get(p_u text, p_p text, p_k text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u text; need text; rec crm_member_data%rowtype;
begin
  u := crm_auth(p_u, p_p);
  if u is null then return null; end if;
  need := case p_k when 'files' then 'files' when 'cust' then 'customers' when 'vis' then 'reports' when 'rep' then 'reports' else null end;
  if need is null or not crm_perm(u, need) then return null; end if;
  select * into rec from crm_member_data where member = u and k = p_k;
  if not found then return jsonb_build_object('j', '[]', 't', 0); end if;
  return jsonb_build_object('j', coalesce(rec.j, '[]'), 't', coalesce(rec.t, 0));
end $$;

create or replace function public.member_data_set(p_u text, p_p text, p_k text, p_j text, p_t bigint) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare u text; need text;
begin
  u := crm_auth(p_u, p_p);
  if u is null then return false; end if;
  need := case p_k when 'files' then 'files' when 'cust' then 'customers' when 'vis' then 'reports' when 'rep' then 'reports' else null end;
  if need is null or not crm_perm(u, need) then return false; end if;
  if length(coalesce(p_j, '')) > 3000000 then return false; end if;
  insert into crm_member_data (member, k, j, t) values (u, p_k, p_j, p_t)
  on conflict (member, k) do update set j = excluded.j, t = excluded.t;
  return true;
end $$;

-- کارهای ارجاع‌شده به عضو
create or replace function public.member_tasks(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u text;
begin
  u := crm_auth(p_u, p_p);
  if u is null or not crm_perm(u, 'tasks') then return null; end if;
  return coalesce((
    select jsonb_agg(crm_task_json(t.id) order by (t.status = 'completed'), t.due nulls last, t.created desc)
      from crm_tasks t where t.member = u), '[]'::jsonb);
end $$;

create or replace function public.member_task_update(p_u text, p_p text, p_id uuid, p_status text, p_report text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare u text; n int;
begin
  u := crm_auth(p_u, p_p);
  if u is null or not crm_perm(u, 'tasks') then return false; end if;
  if p_status not in ('pending', 'in_progress', 'completed') then return false; end if;
  update crm_tasks
     set status = p_status,
         report = coalesce(p_report, report),
         updated = now(),
         done_at = case when p_status = 'completed' then now() else null end
   where id = p_id and member = u;
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function public.member_task_note(p_u text, p_p text, p_id uuid, p_body text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare u text;
begin
  u := crm_auth(p_u, p_p);
  if u is null or not crm_perm(u, 'tasks') then return false; end if;
  if length(trim(coalesce(p_body, ''))) = 0 or length(p_body) > 2000 then return false; end if;
  if not exists (select 1 from crm_tasks where id = p_id and member = u) then return false; end if;
  insert into crm_task_notes (task, author, body) values (p_id, u, trim(p_body));
  update crm_tasks set updated = now() where id = p_id;
  return true;
end $$;

-- پیشنهاد انتقال فایل یا مشتری به لیست اصلی
create or replace function public.member_propose(p_u text, p_p text, p_kind text, p_item jsonb) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare u text;
begin
  u := crm_auth(p_u, p_p);
  if u is null then return false; end if;
  if p_kind not in ('file', 'cust') or p_item is null or length(p_item::text) > 20000 then return false; end if;
  insert into crm_transfers (member, kind, item) values (u, p_kind, p_item);
  return true;
end $$;

-- ---------- ۵) توابع مدیر (فقط حساب مدیر) ----------
-- لیست اعضا با آمار و دسترسی
create or replace function public.admin_members_info() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crm_check_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'u', m.u, 'active', m.active, 'perms', m.perms,
      'created', m.created, 'last_login', m.last_login, 'last_seen', m.last_seen,
      'files', (select crm_cnt(d.j) from crm_member_data d where d.member = m.u and d.k = 'files'),
      'cust', (select crm_cnt(d.j) from crm_member_data d where d.member = m.u and d.k = 'cust'),
      'tasks_pending', (select count(*) from crm_tasks t where t.member = m.u and t.status = 'pending'),
      'tasks_progress', (select count(*) from crm_tasks t where t.member = m.u and t.status = 'in_progress'),
      'tasks_done', (select count(*) from crm_tasks t where t.member = m.u and t.status = 'completed'),
      'tasks_late', (select count(*) from crm_tasks t where t.member = m.u and t.status <> 'completed' and t.due is not null and t.due < now()),
      'proposals', (select count(*) from crm_transfers x where x.member = m.u and x.status = 'pending')
    ) order by m.u) from crm_members m), '[]'::jsonb);
end $$;

-- روشن/خاموش کردن عضو و تنظیم دسترسی‌ها
create or replace function public.admin_member_set(p_u text, p_active boolean, p_perms jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crm_check_admin();
  update crm_members
     set active = coalesce(p_active, active),
         perms = coalesce(p_perms, perms),
         fails = case when coalesce(p_active, active) then 0 else fails end,
         locked_until = null
   where u = lower(trim(p_u));
end $$;

-- مشاهده‌ی همه‌ی اطلاعات یک عضو
create or replace function public.admin_member_data(p_u text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u text := lower(trim(p_u));
begin
  perform crm_check_admin();
  return jsonb_build_object(
    'files', coalesce((select crm_arr(d.j) from crm_member_data d where d.member = u and d.k = 'files'), '[]'::jsonb),
    'cust',  coalesce((select crm_arr(d.j) from crm_member_data d where d.member = u and d.k = 'cust'),  '[]'::jsonb),
    'vis',   coalesce((select crm_arr(d.j) from crm_member_data d where d.member = u and d.k = 'vis'),   '[]'::jsonb),
    'rep',   coalesce((select crm_arr(d.j) from crm_member_data d where d.member = u and d.k = 'rep'),   '[]'::jsonb));
end $$;

-- ارجاع کار
create or replace function public.admin_task_create(p_member text, p_title text, p_desc text, p_cust text, p_file text, p_due timestamptz) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare nid uuid;
begin
  perform crm_check_admin();
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'invalid'; end if;
  if not exists (select 1 from crm_members where u = lower(trim(p_member))) then raise exception 'invalid'; end if;
  insert into crm_tasks (title, description, member, cust, file, due)
  values (trim(p_title), coalesce(p_desc, ''), lower(trim(p_member)), nullif(trim(coalesce(p_cust, '')), ''), nullif(trim(coalesce(p_file, '')), ''), p_due)
  returning id into nid;
  return nid;
end $$;

create or replace function public.admin_tasks(p_member text, p_status text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crm_check_admin();
  return coalesce((
    select jsonb_agg(crm_task_json(t.id) order by (t.status = 'completed'), t.due nulls last, t.created desc)
      from crm_tasks t
     where (nullif(p_member, '') is null or t.member = lower(trim(p_member)))
       and (nullif(p_status, '') is null or t.status = p_status)), '[]'::jsonb);
end $$;

create or replace function public.admin_task_update(p_id uuid, p_status text, p_title text, p_desc text, p_due timestamptz) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crm_check_admin();
  update crm_tasks
     set status = coalesce(nullif(p_status, ''), status),
         title = coalesce(nullif(trim(coalesce(p_title, '')), ''), title),
         description = coalesce(p_desc, description),
         due = coalesce(p_due, due),
         updated = now(),
         done_at = case when coalesce(nullif(p_status, ''), status) = 'completed' then coalesce(done_at, now()) else null end
   where id = p_id;
end $$;

create or replace function public.admin_task_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crm_check_admin();
  delete from crm_tasks where id = p_id;
end $$;

create or replace function public.admin_task_note(p_id uuid, p_body text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crm_check_admin();
  if length(trim(coalesce(p_body, ''))) = 0 or length(p_body) > 2000 then return false; end if;
  insert into crm_task_notes (task, author, body) values (p_id, 'admin', trim(p_body));
  update crm_tasks set updated = now() where id = p_id;
  return true;
end $$;

-- پیشنهادهای انتقال به لیست اصلی
create or replace function public.admin_transfers(p_status text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crm_check_admin();
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created desc)
      from crm_transfers x
     where nullif(p_status, '') is null or x.status = p_status), '[]'::jsonb);
end $$;

create or replace function public.admin_transfer_decide(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crm_check_admin();
  if p_status not in ('approved', 'rejected') then raise exception 'invalid'; end if;
  update crm_transfers set status = p_status, decided = now() where id = p_id and status = 'pending';
end $$;

-- ---------- ۶) دسترسی‌ها ----------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'member\_%' or p.proname like 'admin\_%' or p.proname like 'crm\_%')
  loop
    execute format('revoke all on function %s from public', r.sig);
    if r.proname like 'member\_%' then
      execute format('grant execute on function %s to anon, authenticated', r.sig);
    elsif r.proname like 'admin\_%' then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end $$;
