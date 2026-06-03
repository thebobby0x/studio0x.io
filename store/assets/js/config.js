// =====================================================================
// studio0x market — front-end config
// Fill these in after provisioning Supabase. The anon key is SAFE to
// expose publicly (it only grants what Row Level Security allows).
// Never put the service-role key here.
// =====================================================================
window.STORE_CONFIG = {
  brand: "studio0x market",
  tagline: "Premium digital assets. Instant delivery.",

  // From Supabase → Project Settings → API
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",

  // Edge functions base. Default works for hosted Supabase:
  //   https://YOUR_PROJECT_REF.functions.supabase.co
  functionsBase: "https://YOUR_PROJECT_REF.functions.supabase.co",

  currency: "usd",
  // Support / from email shown on pages
  supportEmail: "b@studio0x.io",
};
