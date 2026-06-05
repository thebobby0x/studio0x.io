-- =====================================================================
-- Multi-brand foundation
--   brands           : niche storefronts (real estate, ecom, bnb, …)
--   products.brand   : which niche store a product belongs to (null = umbrella only)
--   products.engine  : provenance — which tool made it (contentos | templatevault)
--   ai_agents.brand  : optional niche scoping for creator/social agents
-- One shared backend powers every storefront; a front-end themes + filters by brand.
-- =====================================================================
create table if not exists public.brands (
  key           text primary key,           -- url-safe slug, e.g. 'realestate'
  name          text not null,              -- display brand name
  tagline       text,
  eyebrow       text,
  hero_title    text,
  hero_sub      text,
  accent        text default '#F7B5CD',     -- primary accent (hex)
  accent2       text default '#00A3E0',
  support_email text default 'b@studio0x.io',
  domain        text,                       -- custom domain when assigned
  sort          int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.products  add column if not exists brand  text references public.brands(key);
alter table public.products  add column if not exists engine text;   -- 'contentos' | 'templatevault'
alter table public.ai_agents add column if not exists brand  text references public.brands(key);
create index if not exists products_brand_idx on public.products (brand);

alter table public.brands enable row level security;
create policy "brands public read" on public.brands for select using (is_active or public.is_admin());
create policy "brands admin write" on public.brands for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Seed the first three niche storefronts. (Names are easy to change here
-- anytime — they're just rows.)
-- ---------------------------------------------------------------------
insert into public.brands (key, name, tagline, eyebrow, hero_title, hero_sub, accent, accent2, sort) values
('realestate', 'ListLaunch',
 'AI + templates that win listings and close faster.',
 'For modern real estate agents',
 'Win the listing. Close the deal.',
 'Done-for-you kits, scripts, and automations built only for real estate agents — by people who live in the niche.',
 '#00A3E0', '#98FFD9', 1),
('ecom', 'ShelfLift',
 'Copy, creative & launch kits that move product.',
 'For Shopify & Etsy sellers',
 'Sell more. Write less.',
 'AI product copy, ad creative, and launch playbooks engineered for e-commerce sellers who want conversions, not busywork.',
 '#FF671F', '#F7B5CD', 2),
('bnb', 'bnbOS',
 'Higher occupancy, 5-star reviews, less work.',
 'For short-term rental hosts',
 'Run your rental like a pro.',
 'Listing kits, guest messaging, and operations playbooks that turn any short-term rental into a 5-star, high-occupancy machine.',
 '#FF5A5F', '#00A3E0', 3)
on conflict (key) do update set
  name = excluded.name, tagline = excluded.tagline, eyebrow = excluded.eyebrow,
  hero_title = excluded.hero_title, hero_sub = excluded.hero_sub,
  accent = excluded.accent, accent2 = excluded.accent2, sort = excluded.sort;

-- Map existing catalog to brands + stamp the engine (current kits are AI content).
update public.products set engine = 'contentos' where engine is null;
update public.products set brand = 'realestate' where slug = 'listingpilot-ai';
update public.products set brand = 'ecom'       where slug = 'shopcopy-ai-kit';
