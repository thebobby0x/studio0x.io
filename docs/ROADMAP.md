# studio0x market — roadmap

## Phase 1 — Storefront + Stripe ✅ (this build)

- Storefront, dynamic product **landing pages with a CTA on every page**.
- **Impulse add-ons / order bumps** served at every checkout (global + per-product).
- Stripe Checkout with **server-trusted pricing** (browser never sets prices).
- Webhook fulfillment → **entitlements** → automatic, signed, expiring downloads.
- **Super-admin console**: products, file uploads, add-ons, orders, revenue.
- Row Level Security throughout; private asset bucket; public image bucket.

## Phase 2 — AI creators (niche-trained) — in progress / shipped ✅

The data model is already in place (`ai_agents`, `ai_jobs`). Status:

- ✅ **Admin agent CRUD** in the AI tab — create/edit creator & social agents
  (name, kind, niche, model, system prompt, active).
- ✅ **"Generate a product with AI"** panel — pick a creator agent + brief and
  call the `ai-create-product` edge function (with the admin's JWT).
- ✅ Edge function `ai-create-product` calls the **Claude API** with the
  agent's `system_prompt` (prompt-cached) + brief, returning structured
  content (name, tagline, type, bullets, description, markdown body).
- ✅ Generated content becomes a **hidden draft product** (`is_active = false`,
  `price_cents = 0`); the markdown `body` is uploaded to the private
  `product-assets` bucket and set as `asset_path`.
- ✅ Each generation is tracked as an `ai_jobs` row (`running → done | error`),
  surfaced in a recent-jobs table in the admin AI tab.
- ⏳ Next: render the body to real files (PDF/CSV/PPTX) in the function or a
  worker instead of raw markdown.
- Suggested agents: Deck Designer, List Builder, Template Smith, Prompt
  Curator, Course Author — each with a tuned `system_prompt` + niche.

**External setup needed:** set an `ANTHROPIC_API_KEY` **Supabase function
secret** (`supabase secrets set ANTHROPIC_API_KEY=…`), then deploy with
`supabase functions deploy ai-create-product`. Prompt caching is enabled on
the agent's system prompt to cut cost (see the `claude-api` skill).

> Note: AI-generated products start as **hidden drafts** so an admin can
> review (and price) them before they go live in the storefront.

## Phase 3 — AI social-media experts + funnels

Tables `funnels` and `social_campaigns` are scaffolded. The plan:

- A social agent drafts a **multi-step funnel** per product (ad → landing →
  email → upsell) stored in `funnels.steps`.
- It generates platform-native posts and a posting schedule
  (`social_campaigns.plan`), then **monitors and optimizes** by writing
  back engagement into `social_campaigns.metrics`.
- **Scheduling/posting** runs through the available **Zapier** MCP (8,000+
  apps incl. X, Instagram, LinkedIn, TikTok, Buffer) — no need to manage each
  platform's API directly at first.
- Email funnels can route through Resend/SendGrid or Gmail via Zapier.

**External setup needed:** connected social accounts (platform approvals can
take time), and a scheduler (Supabase `pg_cron` or a Zapier trigger) to run
campaign steps.

## Phase 4 — Growth & polish

- Customer accounts + "my downloads" library page.
- Coupons (Stripe promo codes are already enabled at checkout).
- Post-purchase one-click upsells, abandoned-cart email.
- Analytics dashboard (revenue by product, conversion, funnel drop-off).
- Affiliate/referral program.

---

### Architecture at a glance

```
Browser (GitHub Pages, static)
   │  anon key + RLS                    create-checkout-session ─┐
   ├── reads products/add-ons ──► Supabase Postgres             │
   └── POST checkout ───────────► Edge Functions ──► Stripe ◄────┘
                                        ▲                 │
Stripe webhook ── checkout.session.completed ────────────┘
   └─► writes order + entitlements ; success.html polls get-order
                                        │
Phase 2/3: ai-create-product / campaign-runner ──► Claude API + Zapier
```
