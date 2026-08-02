(function () {
  const runtimeEnv = typeof window !== "undefined"
    ? (window.__ENV__ || window.__SUPABASE_CONFIG__ || {})
    : {};

  const readValue = (...keys) => {
    for (const key of keys) {
      const value = runtimeEnv[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  };

  const url = readValue("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const key = readValue("SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");

  window.SUPABASE_URL = url || window.SUPABASE_URL || "";
  window.SUPABASE_PUBLISHABLE_KEY = key || window.SUPABASE_PUBLISHABLE_KEY || "";
})();
