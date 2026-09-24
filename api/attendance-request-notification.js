const json = (response, status, body) => response.status(status).json(body);

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function supabaseRequest(path, { method = "GET", body } = {}) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Configuração privada do Supabase ausente.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new Error(`Falha ao consultar o Supabase (${response.status}).`);
  if (response.status === 204) return null;
  return response.json();
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "Método não permitido." });
  const requestId = String(request.body?.requestId || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return json(response, 400, { error: "Solicitação inválida." });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const recipients = String(process.env.ATTENDANCE_NOTIFICATION_EMAILS || "").split(",").map(item => item.trim()).filter(Boolean);
  const from = process.env.ATTENDANCE_FROM_EMAIL;
  if (!resendKey || !recipients.length || !from) {
    return json(response, 503, { error: "Notificação por e-mail ainda não configurada." });
  }

  try {
    const requests = await supabaseRequest(`attendance_approval_requests?id=eq.${encodeURIComponent(requestId)}&status=eq.pending&select=id,player_id,round_id,notified_at&limit=1`);
    const item = requests?.[0];
    if (!item) return json(response, 404, { error: "Solicitação pendente não encontrada." });
    if (item.notified_at) return json(response, 200, { sent: false, reason: "already_notified" });

    const [players, rounds] = await Promise.all([
      supabaseRequest(`players?id=eq.${encodeURIComponent(item.player_id)}&select=full_name&limit=1`),
      supabaseRequest(`rounds?id=eq.${encodeURIComponent(item.round_id)}&select=round_number,played_on,place&limit=1`)
    ]);
    const player = players?.[0];
    const round = rounds?.[0];
    if (!player || !round) return json(response, 404, { error: "Dados da solicitação não encontrados." });

    const siteUrl = String(process.env.SITE_URL || "").replace(/\/$/, "");
    const adminUrl = siteUrl ? `${siteUrl}/#admin` : "";
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": requestId },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: `G.P.F.C: solicitação de presença de ${player.full_name}`,
        html: `<h2>Nova solicitação de presença</h2><p><strong>${escapeHtml(player.full_name)}</strong> solicitou participação na Rodada ${escapeHtml(round.round_number)}, em ${escapeHtml(round.played_on)}, e possui uma pendência.</p><p>Local: ${escapeHtml(round.place || "CT Caxangá")}</p>${adminUrl ? `<p><a href="${escapeHtml(adminUrl)}">Abrir área administrativa</a></p>` : ""}<p>Aprove ou recuse a solicitação dentro do site.</p>`
      })
    });
    if (!emailResponse.ok) throw new Error(`Falha ao enviar e-mail (${emailResponse.status}).`);

    await supabaseRequest(`attendance_approval_requests?id=eq.${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      body: { notified_at: new Date().toISOString() }
    });
    return json(response, 200, { sent: true });
  } catch (error) {
    console.error("Attendance notification failed", error);
    return json(response, 500, { error: "Não foi possível enviar a notificação." });
  }
};
