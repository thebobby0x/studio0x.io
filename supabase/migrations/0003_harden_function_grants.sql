-- =====================================================================
-- Security hardening (addresses Supabase advisor warnings)
-- These SECURITY DEFINER functions are only ever invoked internally:
--   handle_new_user  -> by the on_auth_user_created trigger
--   increment_sales  -> by the stripe-webhook (service role)
-- Neither should be callable through the public PostgREST RPC API.
--
-- public.is_admin() is intentionally left executable: RLS policies
-- evaluate it as the querying role (anon + authenticated), so it must
-- remain callable for those policies to work.
-- =====================================================================
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.increment_sales(uuid) from public, anon, authenticated;
