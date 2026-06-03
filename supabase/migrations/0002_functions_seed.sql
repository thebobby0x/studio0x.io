-- =====================================================================
-- RPC helpers + demo seed data
-- =====================================================================

-- Atomic sales counter used by the webhook on fulfillment.
create or replace function public.increment_sales(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.products set sales_count = sales_count + 1 where id = p_id;
$$;

-- ---------------------------------------------------------------------
-- Demo content (safe to delete). Lets you click through the storefront
-- before uploading real assets. Prices are in cents.
-- ---------------------------------------------------------------------
insert into public.products (slug, name, tagline, description, type, price_cents, compare_at_cents, is_active, is_featured, landing)
values
('founder-pitch-deck', 'The Founder Pitch Deck', 'The exact 12-slide deck that raised $2M.',
 'A battle-tested pitch deck template with speaker notes, designed to get investor meetings. Fully editable.',
 'presentation', 4900, 9900, true, true,
 '{"bullets":["12 investor-ready slides","Editable Keynote + PowerPoint + Google Slides","Speaker notes for every slide","Bonus: cold-email outreach scripts"],"cta":"Get the deck"}'::jsonb),
('ai-prompt-vault', 'AI Prompt Vault — 500 Prompts', '500 plug-and-play prompts for marketing, sales & ops.',
 'A categorized library of 500 high-leverage prompts. Copy, paste, profit.',
 'list', 1900, 3900, true, true,
 '{"bullets":["500 prompts across 12 categories","Notion + PDF + CSV formats","Lifetime free updates"],"cta":"Unlock the vault"}'::jsonb),
('brand-starter-kit', 'Brand Starter Kit', 'Everything to launch a brand this weekend.',
 'Logo templates, color systems, social templates, and a brand guidelines doc.',
 'template', 3900, 7900, true, false,
 '{"bullets":["Editable logo + color system","30 social post templates","Brand guidelines template"],"cta":"Start your brand"}'::jsonb)
on conflict (slug) do nothing;

-- Impulse add-ons (order bumps).
insert into public.addons (slug, name, pitch, description, price_cents, is_active, is_global)
values
('done-for-you-setup', 'Done-For-You Setup', 'Add the 1-on-1 setup call — we set it all up for you.',
 'A 30-minute call where we configure everything alongside you.', 9900, true, false),
('lifetime-updates', 'Lifetime Updates', 'Never pay again — get every future update free, forever.',
 'Lifetime access to all future versions and additions.', 1500, true, true),
('commercial-license', 'Commercial License', 'Use it with clients and resell your work.',
 'Extends your license to commercial and client work.', 2900, true, true)
on conflict (slug) do nothing;

-- Attach the non-global add-on to the pitch deck.
insert into public.product_addons (product_id, addon_id, sort)
select p.id, a.id, 0
from public.products p, public.addons a
where p.slug = 'founder-pitch-deck' and a.slug = 'done-for-you-setup'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- AI scaffolding: a couple of starter agents (Phase 2 wiring).
-- ---------------------------------------------------------------------
insert into public.ai_agents (name, kind, niche, model, system_prompt)
values
('Deck Designer', 'creator', 'startups', 'claude-opus-4-8',
 'You are a world-class pitch-deck strategist. Produce concise, investor-ready slide content.'),
('Growth Marketer', 'social', 'd2c', 'claude-opus-4-8',
 'You are a performance social marketer. Draft, schedule, and optimize multi-platform campaigns and funnels.')
on conflict do nothing;
