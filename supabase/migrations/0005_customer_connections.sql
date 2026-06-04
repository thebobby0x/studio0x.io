-- =====================================================================
-- Customer connections (per-customer OAuth to Google, X, Meta, etc.)
-- Tokens are stored here but HIDDEN from client roles via column-level
-- grants — only the service role (edge functions) can read them. Row
-- Level Security limits each customer to their own rows.
-- =====================================================================
create table if not exists public.customer_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null,
  account_label text,
  scopes        text,
  status        text not null default 'pending'
                check (status in ('pending','connected','error','revoked')),
  -- ---- secrets (service-role only) ----
  access_token  text,
  refresh_token text,
  token_type    text,
  expires_at    timestamptz,
  state         text,           -- CSRF state for the in-flight handshake
  code_verifier text,           -- PKCE verifier (X/Twitter)
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists customer_connections_user_idx on public.customer_connections (user_id);
create index if not exists customer_connections_state_idx on public.customer_connections (state);

alter table public.customer_connections enable row level security;

-- Owner can read + delete (disconnect) their own connections.
create policy "conn owner select" on public.customer_connections for select using (user_id = auth.uid());
create policy "conn owner delete" on public.customer_connections for delete using (user_id = auth.uid());
-- Inserts/updates (incl. token writes) happen only via the service role in
-- edge functions, which bypasses RLS — no client insert/update policy.

-- Hide token/secret columns from client roles: expose only safe columns.
revoke select on public.customer_connections from anon, authenticated;
grant  select (id, user_id, provider, account_label, scopes, status, created_at, updated_at)
  on public.customer_connections to anon, authenticated;
grant  delete on public.customer_connections to authenticated;
