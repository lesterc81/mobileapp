-- ============================================================
-- multi-branch POS: initial schema
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- branches ----------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text not null default '',
  created_at timestamp with time zone not null default now()
);

-- ---------- profiles (mirrors auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null default 'cashier'
    check (role in ('owner', 'manager', 'cashier')),
  branch_id uuid references public.branches(id) on delete set null,
  created_at timestamp with time zone not null default now()
);

-- First person to ever sign up becomes the owner/admin.
-- Everyone after that starts as a cashier until an owner promotes them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, branch_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    case when not exists (select 1 from public.profiles) then 'owner' else 'cashier' end,
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- products (global menu catalog) ----------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12,2) not null default 0 check (price >= 0),
  category text not null default '',
  barcode text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create unique index if not exists products_barcode_key on public.products(barcode)
  where barcode is not null and barcode <> '';

-- ---------- ingredients (global stock catalog) ----------
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null default 'pcs',
  units_per_pack numeric(12,3),
  pack_name text not null default 'pack',
  created_at timestamp with time zone not null default now()
);

-- per-branch on-hand stock
create table public.ingredient_stock (
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  quantity_on_hand numeric(12,3) not null default 0 check (quantity_on_hand >= 0),
  low_stock_threshold numeric(12,3) not null default 0,
  created_at timestamp with time zone not null default now(),
  primary key (ingredient_id, branch_id)
);

-- ---------- recipes (bill of materials) ----------
create table public.recipes (
  product_id uuid not null references public.products(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  quantity_required numeric(12,3) not null check (quantity_required > 0),
  primary key (product_id, ingredient_id)
);

-- ---------- sales ----------
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  user_id uuid not null references public.profiles(id),
  payment_method text not null default 'cash',
  total numeric(12,2) not null check (total >= 0),
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_sales_branch_time on public.sales(branch_id, created_at desc);
create index if not exists idx_sales_user_time on public.sales(user_id, created_at desc);

create table public.sale_items (
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  quantity_sold integer not null check (quantity_sold > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  created_at timestamp with time zone not null default now(),
  primary key (sale_id, product_id)
);

create index if not exists idx_sale_items_product on public.sale_items(product_id);
create index if not exists idx_sale_items_sale on public.sale_items(sale_id);

-- ---------- stock movements (audit log) ----------
create table public.stock_movements (
  id bigint generated always as identity primary key,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  change_amount numeric(12,3) not null check (change_amount <> 0),
  reason text not null,
  timestamp timestamp with time zone not null default now(),
  related_sale_id uuid references public.sales(id) on delete set null,
  user_id uuid references public.profiles(id)
);

create index if not exists idx_stock_movements_ingredient on public.stock_movements(ingredient_id, timestamp desc);
create index if not exists idx_stock_movements_branch on public.stock_movements(branch_id, timestamp desc);

-- ---------- attendance ----------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid references public.branches(id),
  date date not null default current_date,
  time_in timestamp with time zone not null default now(),
  time_out timestamp with time zone,
  total_hours numeric(6,2),
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_attendance_user_date on public.attendance(user_id, date desc);
create index if not exists idx_attendance_branch on public.attendance(branch_id, date desc);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.ingredients enable row level security;
alter table public.ingredient_stock enable row level security;
alter table public.recipes enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.attendance enable row level security;

-- helper: current role
create or replace function public.current_role()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- helper: can manage (owner or manager)
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select role in ('owner', 'manager') from public.profiles where id = auth.uid()
$$;

-- helper: is owner
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select role = 'owner' from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_role() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- ---------- branches: everyone can read, only owner writes ----------
create policy "branches read" on public.branches for select using (auth.role() = 'authenticated');
create policy "branches write" on public.branches for all using (public.is_owner()) with check (public.is_owner());

-- ---------- profiles: everyone can read, owner manages roles/branches ----------
create policy "profiles read" on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles insert" on public.profiles for insert with check (public.is_owner());
create policy "profiles update" on public.profiles for update using (public.is_owner() or auth.uid() = id) with check (public.is_owner() or auth.uid() = id);
create policy "profiles delete" on public.profiles for delete using (public.is_owner());

-- ---------- products: read all, write managers ----------
create policy "products read" on public.products for select using (auth.role() = 'authenticated');
create policy "products write" on public.products for all using (public.is_manager()) with check (public.is_manager());

-- ---------- ingredients: read all, write managers ----------
create policy "ingredients read" on public.ingredients for select using (auth.role() = 'authenticated');
create policy "ingredients write" on public.ingredients for all using (public.is_manager()) with check (public.is_manager());

-- ---------- ingredient_stock: read all, write managers ----------
create policy "stock read" on public.ingredient_stock for select using (auth.role() = 'authenticated');
create policy "stock write" on public.ingredient_stock for all using (public.is_manager()) with check (public.is_manager());

-- ---------- recipes: read all, write managers ----------
create policy "recipes read" on public.recipes for select using (auth.role() = 'authenticated');
create policy "recipes write" on public.recipes for all using (public.is_manager()) with check (public.is_manager());

-- ---------- sales: read all authenticated, insert any authenticated ----------
create policy "sales read" on public.sales for select using (auth.role() = 'authenticated');
create policy "sales insert" on public.sales for insert with check (auth.role() = 'authenticated');

-- ---------- sale_items ----------
create policy "sale_items read" on public.sale_items for select using (auth.role() = 'authenticated');
create policy "sale_items insert" on public.sale_items for insert with check (auth.role() = 'authenticated');

-- ---------- stock_movements: read all, insert authenticated ----------
create policy "movements read" on public.stock_movements for select using (auth.role() = 'authenticated');
create policy "movements insert" on public.stock_movements for insert with check (auth.role() = 'authenticated');

-- ---------- attendance: read all, insert/update own ----------
create policy "attendance read" on public.attendance for select using (auth.role() = 'authenticated');
create policy "attendance insert" on public.attendance for insert with check (auth.uid() = user_id and time_out is null);
create policy "attendance update own" on public.attendance for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- RPC: atomic sale
-- Deducts stock per recipe, inserts sale + items + movements in
-- one transaction. Throws if any ingredient goes below zero.
-- ============================================================
create or replace function public.sell_products(
  p_branch_id uuid,
  p_payment_method text,
  p_items jsonb  -- [{product_id, quantity}]
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_product record;
  v_recipe record;
  v_ingredient record;
  v_need numeric(12,3);
  v_on_hand numeric(12,3);
  v_now timestamp with time zone := now();
begin
  if p_branch_id is null then
    raise exception 'A branch is required';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Sale quantity must be a positive whole number';
    end if;

    select id, name, price, is_active into v_product
    from public.products where id = v_product_id;
    if not found then
      raise exception 'Product not found';
    end if;
    if not v_product.is_active then
      raise exception E'"%s" is inactive and cannot be sold', v_product.name;
    end if;

    -- check stock across all recipes for this product
    for v_recipe in
      select r.ingredient_id, r.quantity_required, i.name as ingredient_name, i.unit
      from public.recipes r
      join public.ingredients i on i.id = r.ingredient_id
      where r.product_id = v_product_id
    loop
      v_need := v_recipe.quantity_required * v_qty;
      select quantity_on_hand into v_on_hand
      from public.ingredient_stock
      where ingredient_id = v_recipe.ingredient_id and branch_id = p_branch_id;

      if v_on_hand < v_need - 1e-9 then
        raise exception E'"%s": need %s%s, have %s%s (product "%s" qty %)',
          v_recipe.ingredient_name,
          round(v_need::numeric, 3),
          v_recipe.unit,
          coalesce(v_on_hand, 0),
          v_recipe.unit,
          v_product.name,
          v_qty;
      end if;
    end loop;

    v_total := v_total + (v_product.price * v_qty);
  end loop;

  insert into public.sales (id, branch_id, user_id, payment_method, total, created_at)
  values (v_sale_id, p_branch_id, auth.uid(), coalesce(p_payment_method, 'cash'), round(v_total::numeric, 2), v_now);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    select id, name, price into v_product
    from public.products where id = v_product_id;

    insert into public.sale_items (sale_id, product_id, product_name, quantity_sold, unit_price, total_price, created_at)
    values (v_sale_id, v_product_id, v_product.name, v_qty, v_product.price, round((v_product.price * v_qty)::numeric, 2), v_now);

    for v_recipe in
      select r.ingredient_id, r.quantity_required
      from public.recipes r
      where r.product_id = v_product_id
    loop
      v_need := v_recipe.quantity_required * v_qty;
      update public.ingredient_stock
      set quantity_on_hand = quantity_on_hand - v_need
      where ingredient_id = v_recipe.ingredient_id and branch_id = p_branch_id;

      insert into public.stock_movements (ingredient_id, branch_id, change_amount, reason, timestamp, related_sale_id, user_id)
      values (v_recipe.ingredient_id, p_branch_id, -v_need, 'sale', v_now, v_sale_id, auth.uid());
    end loop;
  end loop;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'total', round(v_total::numeric, 2)
  );
end;
$$;

-- ============================================================
-- RPC: staff management (owner only)
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
security definer set search_path = public
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

grant execute on function public.sell_products(uuid, text, jsonb) to authenticated;
grant execute on function public.upsert_staff(uuid, text, text, text, text, uuid) to authenticated;