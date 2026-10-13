-- =====================================================================================================
-- Operational data: customers, employees, catalogue, orders, sales, payments, expenses.
-- Every child row references its parent with a composite key (business_id, parent_id), so a row can
-- never point at another tenant's record even if someone sends a foreign UUID.
-- =====================================================================================================

create type public.order_status as enum ('new', 'confirmed', 'in_progress', 'for_review', 'completed', 'cancelled');
create type public.order_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.payment_method as enum ('cash', 'bank_transfer', 'gcash', 'maya', 'other');
create type public.payment_status as enum ('unpaid', 'partially_paid', 'paid', 'refunded');
create type public.record_status as enum ('active', 'voided');
create type public.employment_status as enum ('active', 'on_leave', 'resigned', 'terminated');

-- ---------------------------------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  contact_number text check (char_length(contact_number) <= 30),
  email text check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address text check (char_length(address) <= 300),
  notes text check (char_length(notes) <= 2000),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
create index customers_business_name_idx on public.customers (business_id, lower(name));

-- ---------------------------------------------------------------------------------------------------
-- Employees (staff directory; a login is optional and linked through member_id)
-- ---------------------------------------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  member_id uuid,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  email text check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (char_length(phone) <= 30),
  job_title text check (char_length(job_title) <= 80),
  department text check (char_length(department) <= 80),
  employment_status public.employment_status not null default 'active',
  hired_on date,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, member_id) references public.business_members (business_id, id) on delete set null (member_id)
);
create index employees_business_idx on public.employees (business_id, lower(full_name));
create unique index employees_member_uq on public.employees (business_id, member_id) where member_id is not null;

-- ---------------------------------------------------------------------------------------------------
-- Catalogue of products / services (optional price list used by orders and sales)
-- ---------------------------------------------------------------------------------------------------
create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null default 'service' check (kind in ('product', 'service')),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  sku text check (char_length(sku) <= 60),
  unit_price_centavos bigint not null default 0 check (unit_price_centavos between 0 and 100000000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
create index catalog_items_business_idx on public.catalog_items (business_id, lower(name));

-- ---------------------------------------------------------------------------------------------------
-- Orders & operations
-- ---------------------------------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  order_number text not null,
  customer_id uuid,
  order_date date not null,
  description text check (char_length(description) <= 2000),
  assigned_employee_id uuid,
  due_date date,
  priority public.order_priority not null default 'normal',
  status public.order_status not null default 'new',
  order_type text not null default 'general' check (order_type ~ '^[a-z_]{1,40}$'),  -- extension point
  custom_fields jsonb not null default '{}' check (jsonb_typeof(custom_fields) = 'object'),
  notes text check (char_length(notes) <= 4000),
  total_centavos bigint not null default 0 check (total_centavos >= 0),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, order_number),
  foreign key (business_id, customer_id) references public.customers (business_id, id),
  foreign key (business_id, assigned_employee_id) references public.employees (business_id, id) on delete set null (assigned_employee_id)
);
create index orders_business_date_idx on public.orders (business_id, order_date desc);
create index orders_business_status_idx on public.orders (business_id, status);
create index orders_customer_idx on public.orders (business_id, customer_id);
create index orders_assignee_idx on public.orders (business_id, assigned_employee_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  order_id uuid not null,
  catalog_item_id uuid,
  item_type text not null default 'service' check (item_type in ('product', 'service')),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  quantity numeric(12, 3) not null check (quantity > 0 and quantity <= 1000000),
  unit_price_centavos bigint not null default 0 check (unit_price_centavos between 0 and 100000000000),
  line_total_centavos bigint generated always as (round(quantity * unit_price_centavos)::bigint) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (business_id, order_id) references public.orders (business_id, id) on delete cascade,
  foreign key (business_id, catalog_item_id) references public.catalog_items (business_id, id) on delete set null (catalog_item_id)
);
create index order_items_order_idx on public.order_items (business_id, order_id);

-- Chronological activity log; status history = rows of kind 'status_changed'.
create table public.order_activity (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  order_id uuid not null,
  kind text not null check (kind in ('created', 'status_changed', 'assigned', 'note', 'updated')),
  from_status public.order_status,
  to_status public.order_status,
  message text check (char_length(message) <= 2000),
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (business_id, order_id) references public.orders (business_id, id) on delete cascade
);
create index order_activity_order_idx on public.order_activity (business_id, order_id, created_at);

-- ---------------------------------------------------------------------------------------------------
-- Sales, line items and payments
-- ---------------------------------------------------------------------------------------------------
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  sale_number text not null,
  customer_id uuid,
  order_id uuid,
  sale_date date not null,
  subtotal_centavos bigint not null default 0 check (subtotal_centavos >= 0),
  discount_centavos bigint not null default 0 check (discount_centavos >= 0),
  total_centavos bigint not null default 0 check (total_centavos >= 0),
  paid_centavos bigint not null default 0 check (paid_centavos >= 0),           -- payments − refunds (active only)
  refunded_centavos bigint not null default 0 check (refunded_centavos >= 0),
  payment_status public.payment_status not null default 'unpaid',
  status public.record_status not null default 'active',
  notes text check (char_length(notes) <= 2000),
  idempotency_key uuid not null,
  created_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text check (char_length(void_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, sale_number),
  unique (business_id, idempotency_key),
  check (discount_centavos <= subtotal_centavos),
  check (total_centavos = subtotal_centavos - discount_centavos),
  check (paid_centavos <= total_centavos),
  check ((status = 'voided') = (voided_at is not null)),
  foreign key (business_id, customer_id) references public.customers (business_id, id),
  foreign key (business_id, order_id) references public.orders (business_id, id)
);
create index sales_business_date_idx on public.sales (business_id, sale_date desc);
create index sales_customer_idx on public.sales (business_id, customer_id);
create index sales_open_idx on public.sales (business_id) where status = 'active' and payment_status in ('unpaid', 'partially_paid');

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  sale_id uuid not null,
  catalog_item_id uuid,
  item_type text not null default 'service' check (item_type in ('product', 'service')),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  quantity numeric(12, 3) not null check (quantity > 0 and quantity <= 1000000),
  unit_price_centavos bigint not null check (unit_price_centavos between 0 and 100000000000),
  line_total_centavos bigint generated always as (round(quantity * unit_price_centavos)::bigint) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (business_id, sale_id) references public.sales (business_id, id) on delete cascade,
  foreign key (business_id, catalog_item_id) references public.catalog_items (business_id, id) on delete set null (catalog_item_id)
);
create index sale_items_sale_idx on public.sale_items (business_id, sale_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  sale_id uuid not null,
  kind text not null default 'payment' check (kind in ('payment', 'refund')),
  amount_centavos bigint not null check (amount_centavos > 0 and amount_centavos <= 100000000000),
  method public.payment_method not null,
  reference_no text check (char_length(reference_no) <= 80),
  paid_at timestamptz not null default now(),
  notes text check (char_length(notes) <= 1000),
  status public.record_status not null default 'active',
  idempotency_key uuid not null,
  recorded_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text check (char_length(void_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, idempotency_key),
  check ((status = 'voided') = (voided_at is not null)),
  foreign key (business_id, sale_id) references public.sales (business_id, id)
);
create index payments_sale_idx on public.payments (business_id, sale_id);
create index payments_business_date_idx on public.payments (business_id, paid_at desc);

-- ---------------------------------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
create unique index expense_categories_name_uq on public.expense_categories (business_id, lower(name));

create table public.expenses (
  id uuid primary key default gen_random_uuid(),     -- client-generated id doubles as the idempotency key
  business_id uuid not null references public.businesses (id) on delete cascade,
  expense_date date not null,
  category_id uuid not null,
  amount_centavos bigint not null check (amount_centavos > 0 and amount_centavos <= 100000000000),
  description text check (char_length(description) <= 1000),
  payment_method public.payment_method not null default 'cash',
  vendor text check (char_length(vendor) <= 160),
  receipt_path text check (receipt_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$'),
  status public.record_status not null default 'active',
  recorded_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text check (char_length(void_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  check ((status = 'voided') = (voided_at is not null)),
  check (receipt_path is null or split_part(receipt_path, '/', 1) = business_id::text),
  foreign key (business_id, category_id) references public.expense_categories (business_id, id)
);
create index expenses_business_date_idx on public.expenses (business_id, expense_date desc);
create index expenses_category_idx on public.expenses (business_id, category_id);

-- ---------------------------------------------------------------------------------------------------
-- Triggers: updated_at, immutable business_id, trial/suspension enforcement, transaction counting
-- ---------------------------------------------------------------------------------------------------
create function private.enforce_writable() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_writable(new.business_id);
  return new;
end $$;

-- Counts orders + sales against the trial limit. The UPDATE takes a row lock on the subscription, so
-- concurrent inserts are serialised and the limit cannot be overshot.
create function private.count_transaction() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.subscriptions
     set transactions_used = transactions_used + 1
   where business_id = new.business_id
     and (max_transactions is null or transactions_used < max_transactions);
  if not found then
    raise exception 'Trial limit reached: this business has used all of its trial orders/transactions.' using errcode = 'TR002';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['customers', 'employees', 'catalog_items', 'orders', 'order_items', 'order_activity',
                           'sales', 'sale_items', 'payments', 'expense_categories', 'expenses'] loop
    execute format('create trigger %1$s_writable before insert or update on public.%1$s for each row execute function private.enforce_writable()', t);
    execute format('create trigger %1$s_lock before update on public.%1$s for each row execute function private.lock_business_id()', t);
  end loop;
  foreach t in array array['customers', 'employees', 'catalog_items', 'orders', 'sales', 'payments', 'expense_categories', 'expenses'] loop
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

create trigger orders_count before insert on public.orders for each row execute function private.count_transaction();
create trigger sales_count before insert on public.sales for each row execute function private.count_transaction();

-- Expenses are written directly (RLS-checked); the recorder is always the caller and voiding goes through void_expense().
create function private.expenses_defaults() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.recorded_by := (select auth.uid());
    new.status := 'active'; new.voided_at := null; new.voided_by := null; new.void_reason := null;
  elsif old.status = 'voided' then
    raise exception 'A voided expense cannot be edited.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger expenses_defaults before insert or update on public.expenses for each row execute function private.expenses_defaults();

create function private.customers_defaults() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.created_by := (select auth.uid());
  return new;
end $$;
create trigger customers_defaults before insert on public.customers for each row execute function private.customers_defaults();

create trigger audit_sales after insert or update on public.sales for each row execute function private.audit_row();
create trigger audit_payments after insert or update on public.payments for each row execute function private.audit_row();
create trigger audit_expenses after insert or update on public.expenses for each row execute function private.audit_row();
create trigger audit_employees after insert or update or delete on public.employees for each row execute function private.audit_row();
create trigger audit_expense_categories after insert or update on public.expense_categories for each row execute function private.audit_row();
