-- =====================================================================
-- studio0x market — initial schema
-- Digital-asset marketplace: products, impulse add-ons, orders,
-- entitlements (secure downloads), admin roles, and AI scaffolding.
-- =====================================================================

-- Extensions: pgcrypto provides gen_random_bytes() for download tokens.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Helper: role lookup
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'customer'
             check (role in ('customer','admin','superadmin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','superadmin')
  );
$$;

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Products (the digital assets being sold)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  tagline         text,
  description     text,
  type            text not null default 'pdf'
                  check (type in ('pdf','list','image','presentation',
                                  'template','ai-training','bundle','other')),
  price_cents     integer not null default 0 check (price_cents >= 0),
  compare_at_cents integer,                 -- optional "was" price for urgency
  currency        text not null default 'usd',
  cover_image_url text,
  asset_path      text,                     -- path in private 'product-assets' bucket
  is_active       boolean not null default true,
  is_featured     boolean not null default false,
  -- Flexible landing-page content (hero, bullets, faq, testimonials, cta copy)
  landing         jsonb not null default '{}'::jsonb,
  seo_title       text,
  seo_description text,
  sales_count     integer not null default 0,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists products_active_idx on public.products (is_active);
create index if not exists products_featured_idx on public.products (is_featured);

-- ---------------------------------------------------------------------
-- Add-ons (impulse / order-bump products offered at checkout)
-- ---------------------------------------------------------------------
create table if not exists public.addons (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  pitch       text,                          -- one-line impulse pitch
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency    text not null default 'usd',
  cover_image_url text,
  asset_path  text,
  is_active   boolean not null default true,
  is_global   boolean not null default false, -- offered on every product
  created_at  timestamptz not null default now()
);

-- Which add-ons are offered on which product (in addition to global ones).
create table if not exists public.product_addons (
  product_id uuid references public.products(id) on delete cascade,
  addon_id   uuid references public.addons(id) on delete cascade,
  sort       integer not null default 0,
  primary key (product_id, addon_id)
);

-- ---------------------------------------------------------------------
-- Orders + line items
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  stripe_session_id   text unique,
  stripe_payment_intent text,
  customer_email      text,
  user_id             uuid references auth.users(id),
  amount_total_cents  integer,
  currency            text not null default 'usd',
  status              text not null default 'pending'
                      check (status in ('pending','paid','fulfilled','refunded','failed')),
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists orders_email_idx on public.orders (customer_email);
create index if not exists orders_user_idx on public.orders (user_id);

create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.orders(id) on delete cascade,
  item_type   text not null check (item_type in ('product','addon')),
  product_id  uuid references public.products(id),
  addon_id    uuid references public.addons(id),
  name        text,
  price_cents integer,
  asset_path  text,
  created_at  timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------
-- Entitlements (secure, time-limited download grants)
-- ---------------------------------------------------------------------
create table if not exists public.entitlements (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid references public.orders(id) on delete cascade,
  customer_email text,
  asset_path     text not null,
  name           text,
  download_token text unique not null default encode(gen_random_bytes(24), 'hex'),
  download_count integer not null default 0,
  max_downloads  integer not null default 20,
  expires_at     timestamptz not null default (now() + interval '90 days'),
  created_at     timestamptz not null default now()
);
create index if not exists entitlements_order_idx on public.entitlements (order_id);

-- =====================================================================
-- AI SCAFFOLDING (Phase 2 — niche-trained creators + social experts)
-- Tables exist now so the pipeline plugs in cleanly later.
-- =====================================================================
create table if not exists public.ai_agents (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          text not null check (kind in ('creator','social')),
  niche         text,                         -- e.g. 'fitness', 'real-estate'
  system_prompt text,
  model         text not null default 'claude-opus-4-8',
  config        jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.ai_jobs (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid references public.ai_agents(id),
  product_id uuid references public.products(id),
  job_type   text,                            -- generate_pdf | generate_list | ...
  status     text not null default 'queued'
             check (status in ('queued','running','done','error')),
  input      jsonb not null default '{}'::jsonb,
  output     jsonb not null default '{}'::jsonb,
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.funnels (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  name       text,
  steps      jsonb not null default '[]'::jsonb, -- ordered funnel steps
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.social_campaigns (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  agent_id   uuid references public.ai_agents(id),
  platform   text,                            -- x | instagram | tiktok | linkedin
  status     text not null default 'draft'
             check (status in ('draft','scheduled','live','paused','done')),
  plan       jsonb not null default '{}'::jsonb,
  metrics    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- STORAGE BUCKETS
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('product-assets', 'product-assets', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.products        enable row level security;
alter table public.addons          enable row level security;
alter table public.product_addons  enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.entitlements    enable row level security;
alter table public.ai_agents       enable row level security;
alter table public.ai_jobs         enable row level security;
alter table public.funnels         enable row level security;
alter table public.social_campaigns enable row level security;

-- profiles: a user sees/updates their own row; admins see all.
create policy "profiles self read"  on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles self update" on public.profiles for update using (id = auth.uid());
create policy "profiles admin all"  on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- products: public reads active rows; admins do everything.
create policy "products public read" on public.products for select using (is_active or public.is_admin());
create policy "products admin write" on public.products for all using (public.is_admin()) with check (public.is_admin());

-- addons: public reads active rows; admins do everything.
create policy "addons public read" on public.addons for select using (is_active or public.is_admin());
create policy "addons admin write" on public.addons for all using (public.is_admin()) with check (public.is_admin());

-- product_addons: public read; admin write.
create policy "product_addons public read" on public.product_addons for select using (true);
create policy "product_addons admin write" on public.product_addons for all using (public.is_admin()) with check (public.is_admin());

-- orders / order_items / entitlements: owner-or-admin read only.
-- (Writes happen server-side via the service-role key in edge functions,
--  which bypasses RLS — no public write policy is intentional.)
create policy "orders owner read" on public.orders for select
  using (public.is_admin() or user_id = auth.uid() or customer_email = auth.jwt()->>'email');
create policy "order_items owner read" on public.order_items for select
  using (public.is_admin() or exists (
    select 1 from public.orders o where o.id = order_id
    and (o.user_id = auth.uid() or o.customer_email = auth.jwt()->>'email')));
create policy "entitlements owner read" on public.entitlements for select
  using (public.is_admin() or customer_email = auth.jwt()->>'email');

-- AI tables: admin-only for now.
create policy "ai_agents admin" on public.ai_agents for all using (public.is_admin()) with check (public.is_admin());
create policy "ai_jobs admin" on public.ai_jobs for all using (public.is_admin()) with check (public.is_admin());
create policy "funnels public read" on public.funnels for select using (is_active or public.is_admin());
create policy "funnels admin write" on public.funnels for all using (public.is_admin()) with check (public.is_admin());
create policy "social admin" on public.social_campaigns for all using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- STORAGE POLICIES
-- =====================================================================
-- product-images: public read, admin write.
create policy "product-images public read" on storage.objects for select
  using (bucket_id = 'product-images');
create policy "product-images admin write" on storage.objects for insert
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product-images admin update" on storage.objects for update
  using (bucket_id = 'product-images' and public.is_admin());
create policy "product-images admin delete" on storage.objects for delete
  using (bucket_id = 'product-images' and public.is_admin());

-- product-assets (private): admin manage only. Customer downloads are issued
-- as short-lived signed URLs by the get-order edge function (service role).
create policy "product-assets admin all" on storage.objects for all
  using (bucket_id = 'product-assets' and public.is_admin())
  with check (bucket_id = 'product-assets' and public.is_admin());
