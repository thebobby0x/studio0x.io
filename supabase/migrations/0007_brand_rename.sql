-- =====================================================================
-- Rebrand the niche storefronts to the studio0x naming convention, give
-- each a bold distinct accent (umbrella stays Miami pink), add coachKit,
-- repoint the catalog, fold the coaching kit into coachKit, and archive
-- unrelated test/dead kits.
-- =====================================================================
insert into public.brands (key, name, tagline, eyebrow, hero_title, hero_sub, accent, accent2, sort) values
('agentedge','agentEdge','The unfair advantage for modern agents.','For real estate agents','Win the listing. Close the deal.','Done-for-you kits, scripts, and automations engineered to give agents an edge — listings won, deals closed, hours saved.','#2F6BFF','#00D1FF',1),
('ecomkiller','eComKiller','Copy & launches that kill it on Shopify.','For Shopify & Etsy sellers','Sell more. Write less.','AI product copy, ad creative, and launch playbooks built to convert — turn browsers into buyers without the busywork.','#FF2D55','#FF8A00',2),
('bookedbnb','bookedBNB','Stay booked. Stay 5-star.','For short-term rental hosts','Run your rental like a pro.','Listing kits, guest messaging, and ops playbooks that keep your calendar full and your reviews five-star.','#FF5A5F','#FFB400',3),
('coachkit','coachKit','Everything to sign, serve & scale clients.','For coaches & consultants','Sign clients. Deliver wins.','Offers, proposals, onboarding, and session frameworks that help coaches land high-ticket clients and deliver real results.','#7C5CFF','#22D3A5',4)
on conflict (key) do update set name=excluded.name, tagline=excluded.tagline, eyebrow=excluded.eyebrow,
  hero_title=excluded.hero_title, hero_sub=excluded.hero_sub, accent=excluded.accent, accent2=excluded.accent2, sort=excluded.sort;

-- Repoint existing catalog to the new brand keys.
update public.products set brand='agentedge'  where brand='realestate';
update public.products set brand='ecomkiller' where brand='ecom';
update public.products set brand='bookedbnb'  where brand='bnb';
-- Fold the existing coaching kit into coachKit.
update public.products set brand='coachkit', engine='contentos' where slug='coachpilot-ai';
-- Archive unrelated / test kits so the stores show only on-brand products.
update public.products set is_active=false where slug in ('mainstreet-ai-kit','inbox-ignite','pantrypilot');

-- Retire the old brand rows.
delete from public.brands where key in ('realestate','ecom','bnb');
