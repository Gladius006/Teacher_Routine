-- Teachers can request an account; it stays locked until an admin approves it.

alter table public.profiles add column if not exists pending boolean not null default false;

-- Admin list now says which accounts are waiting for approval.
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id uuid, username text, display_name text, role text, school_id uuid,
  disabled boolean, pending boolean, created_at timestamptz, last_sign_in_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.role, p.school_id, p.disabled, p.pending, p.created_at, u.last_sign_in_at
  from profiles p join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.username
$$;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- School names only, for the "choose your school" list on the request form.
-- Nothing else about a school is visible without signing in.
create or replace function public.public_school_list()
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select id, name from schools order by name
$$;
grant execute on function public.public_school_list() to anon, authenticated;
