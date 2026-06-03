# ai-create-product

Phase 2 (AI creators) edge function for the studio0x market.

## What it does

Given a niche-trained **creator** agent (`ai_agents.kind = 'creator'`) and a
short admin `brief`, this function:

1. Records an `ai_jobs` row (`status: running`, `job_type: generate_product`).
2. Loads the agent's `system_prompt`, `model`, and `niche`.
3. Calls the **Anthropic (Claude) Messages API** with the agent's system prompt
   (prompt-cached) and the brief, asking for strict JSON product content
   (`name`, `tagline`, `type`, `bullets`, `description`, `body`).
4. Creates (or updates, if `productId` is given) a **hidden draft product**
   (`is_active = false`, `price_cents = 0`) for admin review before it goes live.
5. Uploads the generated markdown `body` to the private `product-assets` bucket
   and sets the product's `asset_path`.
6. Marks the job `done` (or `error`) and returns `{ jobId, productId, slug, status }`.

Request body: `{ "agentId": "...", "brief": "...", "productId"?: "..." }`

## Auth

Requires an **admin JWT**. `verify_jwt = true` (see `supabase/config.toml`), and
the function additionally verifies the caller's `profiles.role` is `admin` or
`superadmin`. Call it with the logged-in user's access token:

```
Authorization: Bearer <supabase access_token>
```

The default anon-key `callFn` helper will NOT satisfy the admin check — the
admin console sends the user's session token directly.

## Required environment / secrets

| Secret | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API key (server-side only — never exposed to the browser). |
| `SUPABASE_URL` | Provided by the platform. |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted DB writes / storage upload (provided by the platform). |
| `SUPABASE_ANON_KEY` | Used to build a token-bound client for the admin check (provided by the platform). |

Set the Anthropic key as a function secret:

```sh
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

## Deploy

```sh
supabase functions deploy ai-create-product
```

Generated products start as **hidden drafts** — review and activate them in the
admin Products tab before they appear in the storefront.
