-- ============================================================
-- fix 3: upsert_staff bcrypt cost must be >= 10.
-- gen_salt('bf') defaults to cost 6, which GoTrue rejects as
-- too weak ("Invalid login credentials"). Use cost 10.
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
security definer set search_path = public, extensions, auth
as $$
declare
  v_id uuid;
  v_now timestamptz := now();
begin
  if not public.is_owner() then
    raise exception 'Only the owner can manage staff';
  end if;

  if p_role not in ('owner', 'manager', 'cashier') then
    raise exception 'Invalid role';
  end if;

  if p_user_id is null then
    insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, created_at, updated_at, last_sign_in_at)
    values (
      gen_random_uuid(),
      p_email,
      crypt(p_password, gen_salt('bf', 10)),
      jsonb_build_object('full_name', p_full_name),
      v_now,
      v_now,
      v_now,
      null
    )
    returning id into v_id;

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      p_email,
      v_id,
      jsonb_build_object(
        'sub', v_id::text,
        'email', p_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      null,
      v_now,
      v_now
    );
  else
    v_id := p_user_id;
    update auth.users set email = p_email, updated_at = v_now where id = v_id;

    update auth.identities
    set provider_id = p_email,
        identity_data = jsonb_build_object(
          'sub', v_id::text,
          'email', p_email,
          'email_verified', true,
          'phone_verified', false
        ),
        updated_at = v_now
    where user_id = v_id and provider = 'email';
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
