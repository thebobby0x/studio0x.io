# studio0x market — setup guide

A digital-asset storefront: landing pages, Stripe Checkout, impulse add-ons
(order bumps), automatic secure file delivery, and a super-admin console.

**Stack:** static front-end (this folder, hosted on GitHub Pages) → Supabase
(Postgres + Auth + Storage + Edge Functions) → Stripe (payments) → Claude
(AI creators, Phase 2).

```
store/                     # static front-end (deployable as-is)
  index.html               # storefront grid
  product.html             # product landing page + order bumps + checkout
  success.html             # post-purchase secure download delivery
  admin.html               # super-admin console (products, add-ons, orders)
  assets/js/config.js      # <-- put your Supabase keys here
supabase/
  migrations/0001_init.sql        # schema, RLS, storage buckets
  migrations/0002_functions_seed.sql  # RPC + demo data
  functions/create-checkout-session  # builds Stripe Checkout from server prices
  functions/stripe-webhook           # fulfills paid orders → entitlements
  functions/get-order                # issues signed download URLs
```

> Nothing here charges money or exposes data until **you** add live keys.
> The `anon` key in `config.js` is safe to publish (it only grants what Row
> Level Security allows). The **service-role** key and Stripe secret live only
> in Supabase function secrets — never in the front-end.

---

## 1. Create the Supabase project

In the `studio0x` org, create a new project (e.g. `studio0x-market`). Save the
database password.

## 2. Apply the schema

With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <YOUR_REF>
supabase db push          # applies supabase/migrations/*
```

(Or paste each migration into the SQL editor, in order.)

This creates the tables, RLS policies, the private `product-assets` bucket, the
public `product-images` bucket, and demo products so you can click through.

## 3. Deploy the edge functions

```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
supabase functions deploy get-order
```

Set the function secrets (Project Settings → Edge Functions → Secrets, or CLI):

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_or_test_xxx \
  STRIPE_WEBHOOK_SECRET=whsec_xxx \
  ALLOWED_ORIGIN=https://YOUR_STORE_DOMAIN
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
```

`config.toml` already disables JWT verification on these three functions (they
are called anonymously by the storefront / by Stripe).

## 4. Wire Stripe

1. Get your secret key (test first): Stripe Dashboard → Developers → API keys.
2. Add a webhook endpoint pointing at:
   `https://<YOUR_REF>.functions.supabase.co/stripe-webhook`
   Event: **`checkout.session.completed`**. Copy the signing secret
   (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

Prices are **never** taken from the browser — the checkout function reads them
from the database, so the amount charged can't be tampered with.

## 5. Connect the front-end

Edit `store/assets/js/config.js`:

```js
supabaseUrl:     "https://<YOUR_REF>.supabase.co",
supabaseAnonKey: "<YOUR_ANON_KEY>",
functionsBase:   "https://<YOUR_REF>.functions.supabase.co",
```

## 6. Make yourself a super-admin

Sign up once through `admin.html` (or Supabase Auth → Users → add user), then in
the SQL editor:

```sql
update public.profiles set role = 'superadmin' where email = 'b@studio0x.io';
```

Now sign in at `/store/admin.html` to add products, upload files, set prices,
configure impulse add-ons, and watch orders/revenue.

## 7. Deploy + custom domain

This `store/` folder is plain static files — it already deploys with the repo on
GitHub Pages at `…/store/`. To run it on its own domain (your new URL):

- **Option A (subpath):** keep it in this repo → `yourdomain/store/`.
- **Option B (own repo + domain):** copy `store/` to a new repo's root, enable
  GitHub Pages, and add a `CNAME` file with your domain. Point your registrar's
  DNS at GitHub Pages. Set `ALLOWED_ORIGIN` to that domain.

---

## Test the full flow

1. Use Stripe **test mode** keys and card `4242 4242 4242 4242`.
2. Open a product → toggle an add-on → checkout → pay.
3. Land on `success.html` → download links appear once the webhook fulfills.
4. Confirm the order shows in the admin **Orders** tab.

## What's next (Phase 2)

AI creators and AI social-media managers are scaffolded (`ai_agents`,
`ai_jobs`, `funnels`, `social_campaigns` tables + admin tab). See
[`docs/ROADMAP.md`](../docs/ROADMAP.md).
