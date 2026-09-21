-- Routine Builder: schools, users, shared school data, activity log.
-- Run once in the Supabase SQL editor (or with `supabase db push`).

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  display_name text not null default '',
  role text not null default 'member' check (role in ('admin', 'member')),
  school_id uuid references public.schools (id) on delete set null,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- One row per school: the whole editable school (settings, subjects, teachers,
-- classes) plus the last generated routine. `version` prevents two people
-- overwriting each other's changes.
create table public.school_data (
  school_id uuid primary key references public.schools (id) on delete cascade,
  data jsonb not null,
  routine jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  school_id uuid references public.schools (id) on delete set null,
  action text not null check (length(action) <= 40),
  detail jsonb not null default '{}'::jsonb
);
create index activity_log_at_idx on public.activity_log (at desc);
create index activity_log_user_idx on public.activity_log (user_id, at desc);
create index activity_log_school_idx on public.activity_log (school_id, at desc);

-- ---------- Helpers (security definer so policies can call them without recursion) ----------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and not disabled)
$$;

create or replace function public.my_school() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from profiles where id = auth.uid() and not disabled
$$;

-- True until the first admin exists; the login page then offers admin setup.
create or replace function public.needs_setup() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where role = 'admin')
$$;

-- Admin dashboard: users with their last sign-in time (auth.users is not exposed directly).
create or replace function public.admin_list_users()
returns table (
  id uuid, username text, display_name text, role text, school_id uuid,
  disabled boolean, created_at timestamptz, last_sign_in_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.role, p.school_id, p.disabled, p.created_at, u.last_sign_in_at
  from profiles p join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.username
$$;

-- Every new school starts with an empty data row.
create or replace function public.create_school_data() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into school_data (school_id, data) values (new.id, '{}'::jsonb) on conflict do nothing;
  return new;
end $$;

create trigger schools_create_data after insert on public.schools
for each row execute function public.create_school_data();

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.is_admin(), public.my_school(), public.admin_list_users() to authenticated;
grant execute on function public.needs_setup() to anon, authenticated;

-- ---------- Row-level security ----------

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.school_data enable row level security;
alter table public.activity_log enable row level security;

-- Schools: members see their own school; admins see and manage all.
create policy schools_read on public.schools for select to authenticated
  using (public.is_admin() or id = public.my_school());
create policy schools_admin_write on public.schools for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Profiles: everyone sees their own; admins see and edit all.
-- Users are created and deleted only by the admin-users function (service role).
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- School data: members read and write their own school only; admins any school.
create policy school_data_read on public.school_data for select to authenticated
  using (public.is_admin() or school_id = public.my_school());
create policy school_data_write on public.school_data for update to authenticated
  using (public.is_admin() or school_id = public.my_school())
  with check (public.is_admin() or school_id = public.my_school());

-- Activity: anyone signed in can add their own entries; only admins read the log.
create policy activity_insert on public.activity_log for insert to authenticated
  with check (
    user_id = auth.uid()
    and not coalesce((select disabled from public.profiles where id = auth.uid()), true)
    and (school_id is null or school_id = public.my_school() or public.is_admin())
  );
create policy activity_admin_read on public.activity_log for select to authenticated
  using (public.is_admin());
