-- =====================================================================
-- Editable-files upsell + PDF deliverables
--   products.editable_paths : the editable source files (md/docx/…) that
--                             the "Editable Files" add-on unlocks.
--   addons.grants_editable  : marks an add-on as the editable-files upgrade,
--                             so the webhook grants the product's editable
--                             files (not a fixed add-on file).
-- =====================================================================
alter table public.products add column if not exists editable_paths text[] not null default '{}';
alter table public.addons   add column if not exists grants_editable boolean not null default false;

-- The +$7 global "Editable Files" order bump.
insert into public.addons (slug, name, pitch, description, price_cents, is_active, is_global, grants_editable)
values (
  'editable-files',
  'Editable Files (+$7)',
  'Get the editable source too — tweak, rebrand, and reuse in minutes.',
  'Unlocks the editable document(s) (Word / Markdown) in addition to your PDF.',
  700, true, true, true
)
on conflict (slug) do update
  set grants_editable = true, is_global = true, is_active = true,
      price_cents = 700, name = excluded.name, pitch = excluded.pitch,
      description = excluded.description;
