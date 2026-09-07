-- ============================================================
-- fix: qualify pgcrypto functions (they live in the extensions schema)
-- gen_salt/crypt must be schema-qualified or added to search_path.
-- ============================================================

create or replace function public.upsert_staff(
  p_user_id uuid,          -- existing auth user to update, null = new
  p_email text,
  p_password text,         -- only for new accounts
  p_full_name text,
  p_role text,
  p_branch_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can manage staff';
  end if;

  if p_role not in ('owner', 'manager', 'cashier') then
    raise exception 'Invalid role';
  end if;

  if p_user_id is null then
    insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
    values (
      gen_random_uuid(),
      p_email,
      crypt(p_password, gen_salt('bf')),
      jsonb_build_object('full_name', p_full_name),
      now(),
      now(),
      now()
    )
    returning id into v_id;
  else
    v_id := p_user_id;
    update auth.users set email = p_email, updated_at = now() where id = v_id;
  end if;

  insert into public.profiles (id, email, full_name, role, branch_id)
  values (v_id, p_email, p_full_name, p_role, p_branch_id)
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      branch_id = excluded.branch_id;

  return v_id;
end;
$$;
