// =====================================================================
// studio0x market — front-end config
// Fill these in after provisioning Supabase. The anon key is SAFE to
// expose publicly (it only grants what Row Level Security allows).
// Never put the service-role key here.
// =====================================================================
window.STORE_CONFIG = {
  brand: "studio0x market",
  tagline: "Premium digital assets. Instant delivery.",

  // studio0x-market Supabase project (anon key is public-safe under RLS)
  supabaseUrl: "https://cmwdvxvxlfjeaknftobb.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtd2R2eHZ4bGZqZWFrbmZ0b2JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTU2OTUsImV4cCI6MjA5NjA5MTY5NX0.Uvrn-D6nGnJfQEA-CGRAwlrUj-gCgPXMKIa1BYI6tyk",

  // Edge functions base for hosted Supabase.
  functionsBase: "https://cmwdvxvxlfjeaknftobb.functions.supabase.co",

  currency: "usd",
  // Support / from email shown on pages
  supportEmail: "b@studio0x.io",

  // Launch pricing window. While now < this date, product pages reframe each
  // product's compare-at price as where the price is HEADING, with a live day
  // countdown ("going up to $57 in N days"). After it passes, pages fall back
  // to the normal strikethrough. Update this date to relaunch.
  launchPriceUntil: "2026-06-16T23:59:59",
};
