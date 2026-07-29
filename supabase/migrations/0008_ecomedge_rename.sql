-- =====================================================================
-- Rename brand eComKiller → eComEdge — NAME + SLUG/KEY + TAGLINE only.
--
-- Accent stays RED (#FF2D55 / #FF8A00): the red→Rosa colour unification is a
-- separate, pending decision across all 4 stores. This migration copies every
-- other column (accent, eyebrow, hero copy, sort, …) verbatim from the live
-- ecomkiller row and overrides only key, name, and tagline.
--
-- ROLLOUT ORDER (no broken window): the tolerant static ships FIRST — dual CSS
-- selector (ecomedge + ecomkiller) and a JS twin-resolver that maps the param
-- to whichever brand key currently exists. This transaction is applied to the
-- LIVE DB only AFTER that static is deployed, so both DB states are safe.
--
-- brands.key is the FK target of products.brand and ai_agents.brand. This
-- repoints both (6 products, 0 agents). products.id (UUID) and slug are
-- unchanged, and order_items/entitlements reference product_id (UUID), not
-- brand — so NO product links, orders, or downloads break.
-- =====================================================================
begin;

-- Create the renamed brand row, preserving all live values except key/name/tagline.
insert into public.brands (key, name, tagline, eyebrow, hero_title, hero_sub, accent, accent2, support_email, domain, sort, is_active, created_at)
select 'ecomedge', 'eComEdge', 'Copy, launches, and margins with an edge.',
       eyebrow, hero_title, hero_sub, accent, accent2, support_email, domain, sort, is_active, created_at
from public.brands
where key = 'ecomkiller';

-- Repoint the FK children to the new key.
update public.products  set brand = 'ecomedge' where brand = 'ecomkiller';
update public.ai_agents set brand = 'ecomedge' where brand = 'ecomkiller';

-- Retire the old brand row (only after children are repointed).
delete from public.brands where key = 'ecomkiller';

commit;
