module.exports = function handler(request, response) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;

  response.setHeader("Cache-Control", "no-store, max-age=0");

  if (!url || !key) {
    return response.status(500).json({ error: "Vari\u00e1veis p\u00fablicas do Supabase n\u00e3o configuradas." });
  }

  // A publishable key pode ser usada no navegador quando o RLS est\u00e1 ativo.
  // Nunca inclua uma chave secret/service_role nesta resposta.
  return response.status(200).json({ url, key });
};
