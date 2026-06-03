# studio0x market — roadmap

## Phase 1 — Storefront + Stripe ✅ (this build)

- Storefront, dynamic product **landing pages with a CTA on every page**.
- **Impulse add-ons / order bumps** served at every checkout (global + per-product).
- Stripe Checkout with **server-trusted pricing** (browser never sets prices).
- Webhook fulfillment → **entitlements** → automatic, signed, expiring downloads.
- **Super-admin console**: products, file uploads, add-ons, orders, revenue.
- Row Level Security throughout; private asset bucket; public image bucket.

## Phase 2 — AI creators (niche-trained)

The data model is already in place (`ai_agents`, `ai_jobs`). The plan:

- An admin clicks **"Generate with AI"** on a product, picks a niche agent.
- An edge function (`ai-create-product`) calls the **Claude API** with the
  agent's `system_prompt` + brief, returning structured content (outline,
  copy, bullets, file body).
- For real files: render the content to PDF/CSV/PPTX in the function (or a
  worker), upload to `product-assets`, and set the product's `asset_path`.
- Each generation is tracked as an `ai_jobs` row (`queued → running → done`).
- Suggested agents: Deck Designer, List Builder, Template Smith, Prompt
  Curator, Course Author — each with a tuned `system_prompt` + niche.

**External setup needed:** an `ANTHROPIC_API_KEY` function secret. Prompt
caching should be enabled on the system prompt to cut cost (see the
`claude-api` skill).

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
