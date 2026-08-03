(function () {
  const readValue = (source, ...keys) => {
    for (const key of keys) {
      const value = source && source[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };

  const applyConfig = (source) => {
    const url = readValue(source, "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "url");
    const key = readValue(source, "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "key");

    if (!url || !key) throw new Error("Configura\u00e7\u00e3o p\u00fablica do Supabase incompleta.");

    window.SUPABASE_URL = url;
    window.SUPABASE_PUBLISHABLE_KEY = key;
  };

  const localConfig = window.__SUPABASE_CONFIG__ || window.__ENV__ || {};
  const hasLocalConfig = readValue(localConfig, "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "url")
    && readValue(localConfig, "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "key");

  // Em desenvolvimento local, usa o arquivo ignorado pelo Git. Em produ\u00e7\u00e3o,
  // busca somente os valores p\u00fablicos nas vari\u00e1veis da Vercel.
  const configRequest = hasLocalConfig
    ? Promise.resolve(localConfig)
    : fetch("/api/config", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("N\u00e3o foi poss\u00edvel carregar a configura\u00e7\u00e3o do site.");
      return response.json();
    });

  window.supabaseConfigReady = configRequest.then((config) => {
    applyConfig(config);
  });
})();
