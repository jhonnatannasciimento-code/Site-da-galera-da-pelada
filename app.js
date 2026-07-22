const supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_PUBLISHABLE_KEY
);

let data = { players: [], games: [] };
let selectedRanking = "goals";
let pendingPhotoFile = null;
let currentUser = null;
let isAdmin = false;

function initials(player) {
  return (player.nickname || player.name || "GP")
    .split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
  }[char]));
}
function avatar(player, extraClass = "") {
  const name = player.nickname || player.name;
  return `<div class="avatar ${extraClass}">${player.photo
    ? `<img src="${player.photo}" alt="Foto de ${escapeHtml(name)}" />`
    : initials(player)}</div>`;
}
function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${date}T12:00:00`)).replaceAll(" de ", " ");
}
function shortDate(date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(`${date}T12:00:00`)).replace(".", "");
}
function getLatestGame() { return [...data.games].sort((a, b) => b.date.localeCompare(a.date))[0]; }
function getStats() {
  const totals = Object.fromEntries(data.players.map(player => [player.id, {
    player, games: 0, goals: 0, assists: 0, saves: 0, tackles: 0, craque: 0, xerife: 0, paredao: 0
  }]));
  data.games.forEach(game => game.stats.forEach(entry => {
    const total = totals[entry.playerId];
    if (!total) return;
    total.games += 1;
    total.goals += Number(entry.goals || 0);
    total.assists += Number(entry.assists || 0);
    total.saves += Number(entry.saves || 0);
    total.tackles += Number(entry.tackles || 0);
    if (entry.award) total[entry.award] += 1;
  }));
  return Object.values(totals);
}
function bestStat(metric) {
  return [...getStats()].sort((a, b) => b[metric] - a[metric] || a.player.name.localeCompare(b.player.name))[0];
}
function awardInfo(key) {
  return {
    craque: { title: "Craque", label: "melhor da rodada", icon: "★" },
    xerife: { title: "Xerife", label: "dono da marcação", icon: "◆" },
    paredao: { title: "Paredão", label: "segurou tudo", icon: "⬡" },
    artilheiro: { title: "Artilheiro", label: "goleador da rodada", icon: "⚽" }
  }[key];
}

function renderHome() {
  const stats = getStats();
  const latest = getLatestGame();
  document.querySelector("#total-games").textContent = data.games.length;
  document.querySelector("#total-players").textContent = data.players.length;
  const goals = stats.reduce((sum, item) => sum + item.goals, 0);
  document.querySelector("#total-goals").textContent = goals;
  document.querySelector("#goal-average").textContent = data.games.length ? (goals / data.games.length).toFixed(1).replace(".", ",") : "0";
  document.querySelector("#latest-score").innerHTML = latest
    ? `<div class="score-date">${formatDate(latest.date)}</div><div class="score-line"><span>${escapeHtml(latest.home)}</span><b class="score-number">${latest.homeScore}–${latest.awayScore}</b><span>${escapeHtml(latest.away)}</span></div><div class="score-place">${escapeHtml(latest.place || "Pelada da galera")}</div>`
    : `<div class="empty-state">A primeira rodada ainda será lançada.</div>`;

  const latestStats = latest?.stats || [];
  const awardPlayer = key => {
    let entry = latestStats.find(stat => stat.award === key);
    if (!entry && key === "artilheiro") entry = [...latestStats].sort((a, b) => b.goals - a.goals)[0];
    return data.players.find(player => player.id === entry?.playerId);
  };
  document.querySelector("#weekly-awards").innerHTML = ["craque", "artilheiro", "xerife", "paredao"].map(key => {
    const info = awardInfo(key); const player = awardPlayer(key);
    const stat = latestStats.find(entry => entry.playerId === player?.id) || {};
    return `<article class="award-card"><div class="award-type"><span>${info.title.toUpperCase()}</span><span class="award-icon">${info.icon}</span></div>${player
      ? `<h3>${escapeHtml(player.nickname || player.name)}</h3><small>${key === "artilheiro" ? `${stat.goals || 0} gols` : info.label}</small><div class="award-person">${avatar(player)}</div>`
      : `<h3>—</h3><small>sem dados</small>`}</article>`;
  }).join("");
  document.querySelector("#recent-games").innerHTML = [...data.games].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map(game =>
    `<article class="recent-game"><div class="date-box">${shortDate(game.date)}<br/><span>${escapeHtml(game.place || "Quadra")}</span></div><div><strong>${escapeHtml(game.home)} <span class="recent-score">${game.homeScore} × ${game.awayScore}</span> ${escapeHtml(game.away)}</strong><small>${game.stats.length} atletas em campo</small></div><span class="mini-label">RODADA</span></article>`
  ).join("") || `<div class="empty-state">Nenhuma rodada cadastrada.</div>`;
  const records = [{ metric: "goals", label: "Artilheiro" }, { metric: "assists", label: "Garçom" }, { metric: "saves", label: "Mais defesas" }];
  document.querySelector("#records").innerHTML = records.map(record => {
    const winner = bestStat(record.metric);
    return winner && winner[record.metric] > 0 ? `<article class="record-item">${avatar(winner.player)}<div class="record-text"><strong>${escapeHtml(winner.player.nickname || winner.player.name)}</strong><small>${record.label}</small></div><span class="record-number">${winner[record.metric]}</span></article>` : "";
  }).join("") || `<div class="empty-state">Os recordes aparecerão após a primeira rodada.</div>`;
}

const rankingDetails = {
  goals: { title: "Artilharia", kicker: "GOLS MARCADOS", singular: "GOL", plural: "GOLS" },
  assists: { title: "Assistências", kicker: "PASSES PARA GOL", singular: "ASSIST.", plural: "ASSIST." },
  craque: { title: "Craque", kicker: "VEZES CRAQUE DA RODADA", singular: "VEZ", plural: "VEZES" },
  xerife: { title: "Xerife", kicker: "DESTAQUES DEFENSIVOS", singular: "VEZ", plural: "VEZES" },
  paredao: { title: "Paredão", kicker: "GOLEIROS DA RODADA", singular: "VEZ", plural: "VEZES" }
};
function renderRanking() {
  const details = rankingDetails[selectedRanking];
  document.querySelector("#ranking-kicker").textContent = details.kicker;
  document.querySelector("#ranking-name").textContent = details.title;
  document.querySelectorAll(".ranking-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.ranking === selectedRanking));
  const items = getStats().filter(item => item[selectedRanking] > 0).sort((a, b) => b[selectedRanking] - a[selectedRanking] || b.goals - a.goals || a.player.name.localeCompare(b.player.name));
  document.querySelector("#ranking-list").innerHTML = items.length ? items.map((item, index) =>
    `<article class="rank-row"><span class="rank-position">${String(index + 1).padStart(2, "0")}</span>${avatar(item.player)}<div class="rank-player"><strong>${escapeHtml(item.player.nickname || item.player.name)}</strong><small>${escapeHtml(item.player.position)} · ${item.games} ${item.games === 1 ? "jogo" : "jogos"}</small></div><span class="rank-meta">${item.goals} gols · ${item.assists} assist.</span><span class="rank-value">${item[selectedRanking]}<small>${item[selectedRanking] === 1 ? details.singular : details.plural}</small></span></article>`
  ).join("") : `<div class="empty-state">Ainda não existem dados nesta categoria.</div>`;
}
function renderPlayers(filter = "") {
  const text = filter.trim().toLocaleLowerCase("pt-BR");
  const players = getStats().filter(item => !text || `${item.player.name} ${item.player.nickname}`.toLocaleLowerCase("pt-BR").includes(text)).sort((a, b) => a.player.name.localeCompare(b.player.name));
  document.querySelector("#roster-count").textContent = `${players.length} ${players.length === 1 ? "ATLETA" : "ATLETAS"}`;
  document.querySelector("#athletes-grid").innerHTML = players.map((item, index) =>
    `<article class="athlete-card"><div class="card-image">${avatar(item.player)}</div><div class="card-top"><span>GP • 2026</span><span class="athlete-number">${String(index + 1).padStart(2, "0")}</span></div><div class="card-bottom"><h2>${escapeHtml(item.player.nickname || item.player.name)}</h2><p>${escapeHtml(item.player.position)}</p><div class="card-stats"><div><span>JOGOS</span><strong>${item.games}</strong></div><div><span>GOLS</span><strong>${item.goals}</strong></div><div><span>ASSIST.</span><strong>${item.assists}</strong></div></div></div></article>`
  ).join("") || `<div class="empty-state">Nenhum atleta cadastrado ainda.</div>`;
}
function renderGameFields() {
  const container = document.querySelector("#game-player-fields");
  container.innerHTML = data.players.length ? data.players.map(player =>
    `<div class="game-player-row" data-player-id="${player.id}"><div>${avatar(player)}<strong title="${escapeHtml(player.nickname || player.name)}">${escapeHtml(player.nickname || player.name)}</strong></div><label class="play-check" title="Jogou"><input class="field-played" type="checkbox" /></label><input class="field-goals" type="number" min="0" value="0" title="Gols" aria-label="Gols de ${escapeHtml(player.name)}" /><input class="field-assists" type="number" min="0" value="0" title="Assistências" aria-label="Assistências de ${escapeHtml(player.name)}" /><input class="field-saves" type="number" min="0" value="0" title="Defesas" aria-label="Defesas de ${escapeHtml(player.name)}" /><select class="field-award" aria-label="Destaque de ${escapeHtml(player.name)}"><option value="">Destaque</option><option value="craque">Craque</option><option value="xerife">Xerife</option><option value="paredao">Paredão</option></select></div>`
  ).join("") : `<div class="empty-state">Cadastre pelo menos um atleta antes de lançar uma rodada.</div>`;
}
function renderAdminPlayers() {
  const container = document.querySelector("#admin-players-list");
  container.innerHTML = data.players.length ? data.players.map(player =>
    `<article class="admin-player-item"><div>${avatar(player)}<span><strong>${escapeHtml(player.nickname || player.name)}</strong><small>${escapeHtml(player.position)}</small></span></div><button class="delete-player" data-delete-player="${player.id}" type="button">Excluir</button></article>`
  ).join("") : `<div class="empty-state">Nenhum atleta para gerenciar.</div>`;
}
function renderAll() {
  renderHome(); renderRanking(); renderPlayers(document.querySelector("#player-search")?.value || ""); renderGameFields(); renderAdminPlayers();
}
function showView(id) {
  if (id === "admin" && !isAdmin) return openLoginModal();
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active-view", view.id === id));
  document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.viewTarget === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function toast(message) {
  const element = document.querySelector("#toast"); element.textContent = message; element.classList.add("show"); clearTimeout(toast.timeout); toast.timeout = setTimeout(() => element.classList.remove("show"), 3400);
}

async function loadRemoteData(showMessage = false) {
  const [playersResult, gamesResult, statsResult] = await Promise.all([
    supabaseClient.from("players").select("*").order("full_name"),
    supabaseClient.from("games").select("*").order("played_on", { ascending: false }),
    supabaseClient.from("player_game_stats").select("*")
  ]);
  const error = playersResult.error || gamesResult.error || statsResult.error;
  if (error) { toast(`Não foi possível carregar os dados: ${error.message}`); return; }
  const gameStats = new Map((gamesResult.data || []).map(game => [game.id, []]));
  (statsResult.data || []).forEach(stat => gameStats.get(stat.game_id)?.push({
    playerId: stat.player_id, goals: stat.goals, assists: stat.assists, saves: stat.saves, tackles: stat.tackles,
    award: stat.is_craque ? "craque" : stat.is_xerife ? "xerife" : stat.is_paredao ? "paredao" : ""
  }));
  data = {
    players: (playersResult.data || []).map(player => ({ id: player.id, name: player.full_name, nickname: player.nickname, position: player.position, photo: player.photo_url })),
    games: (gamesResult.data || []).map(game => ({ id: game.id, date: game.played_on, place: game.place, home: game.home_team, away: game.away_team, homeScore: game.home_score, awayScore: game.away_score, stats: gameStats.get(game.id) || [] }))
  };
  renderAll();
  if (showMessage) toast("Dados atualizados.");
}
async function refreshAuthState() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session?.user || null;
  isAdmin = false;
  if (currentUser) {
    const { data: allowed } = await supabaseClient.rpc("is_admin");
    isAdmin = allowed === true;
    if (!isAdmin) await supabaseClient.auth.signOut();
  }
  document.querySelector("#admin-nav-label").textContent = isAdmin ? "Admin" : "Entrar";
  document.querySelector("#admin-logout").hidden = !isAdmin;
}
function openLoginModal() { document.querySelector("#login-modal").hidden = false; document.querySelector("#login-email").focus(); }
function closeLoginModal() { document.querySelector("#login-modal").hidden = true; document.querySelector("#login-error").textContent = ""; document.querySelector("#login-form").reset(); }
function requireAdmin() { if (isAdmin) return true; openLoginModal(); return false; }

async function uploadPlayerPhoto(playerId) {
  if (!pendingPhotoFile) return null;
  const extension = pendingPhotoFile.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${playerId}/${Date.now()}.${extension}`;
  const { error } = await supabaseClient.storage.from("player-photos").upload(path, pendingPhotoFile, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return supabaseClient.storage.from("player-photos").getPublicUrl(path).data.publicUrl;
}

document.querySelectorAll("[data-view-target]").forEach(button => button.addEventListener("click", () => showView(button.dataset.viewTarget)));
document.querySelectorAll("[data-admin-access]").forEach(button => button.addEventListener("click", () => isAdmin ? showView("admin") : openLoginModal()));
document.querySelector("#admin-access-button").addEventListener("click", () => isAdmin ? showView("admin") : openLoginModal());
document.querySelectorAll("[data-close-login]").forEach(button => button.addEventListener("click", closeLoginModal));
document.querySelector("#admin-logout").addEventListener("click", async () => { await supabaseClient.auth.signOut(); await refreshAuthState(); showView("inicio"); toast("Sessão encerrada."); });
document.querySelectorAll(".ranking-tab").forEach(button => button.addEventListener("click", () => { selectedRanking = button.dataset.ranking; renderRanking(); }));
document.querySelector("#player-search").addEventListener("input", event => renderPlayers(event.target.value));
document.querySelector("#player-photo").addEventListener("change", event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 2_500_000) { toast("Escolha uma foto de até 2,5 MB."); event.target.value = ""; return; }
  pendingPhotoFile = file;
  const reader = new FileReader(); reader.onload = () => { document.querySelector("#photo-preview").innerHTML = `<img src="${reader.result}" alt="Prévia da foto" />`; }; reader.readAsDataURL(file);
});
document.querySelector("#login-form").addEventListener("submit", async event => {
  event.preventDefault(); const errorBox = document.querySelector("#login-error"); errorBox.textContent = "";
  const { error } = await supabaseClient.auth.signInWithPassword({ email: document.querySelector("#login-email").value.trim(), password: document.querySelector("#login-password").value });
  if (error) { errorBox.textContent = "E-mail ou senha inválidos."; return; }
  await refreshAuthState();
  if (!isAdmin) { errorBox.textContent = "Esta conta não tem autorização administrativa."; return; }
  closeLoginModal(); showView("admin"); toast("Login de administrador realizado.");
});
document.querySelector("#player-form").addEventListener("submit", async event => {
  event.preventDefault(); if (!requireAdmin()) return;
  const name = document.querySelector("#player-name").value.trim();
  const nickname = document.querySelector("#player-nickname").value.trim() || name.split(" ")[0];
  const position = document.querySelector("#player-position").value;
  const { data: player, error } = await supabaseClient.from("players").insert({ full_name: name, nickname, position }).select().single();
  if (error) { toast(`Não foi possível salvar: ${error.message}`); return; }
  try {
    const photoUrl = await uploadPlayerPhoto(player.id);
    if (photoUrl) await supabaseClient.from("players").update({ photo_url: photoUrl }).eq("id", player.id);
  } catch (uploadError) { toast(`Atleta salvo, mas a foto falhou: ${uploadError.message}`); }
  event.target.reset(); pendingPhotoFile = null; document.querySelector("#photo-preview").textContent = "+";
  await loadRemoteData(); toast(`${nickname} entrou no elenco.`);
});
document.querySelector("#game-form").addEventListener("submit", async event => {
  event.preventDefault(); if (!requireAdmin()) return;
  const entries = [...document.querySelectorAll(".game-player-row")].map(row => ({
    playerId: row.dataset.playerId, played: row.querySelector(".field-played").checked,
    goals: Number(row.querySelector(".field-goals").value || 0), assists: Number(row.querySelector(".field-assists").value || 0),
    saves: Number(row.querySelector(".field-saves").value || 0), award: row.querySelector(".field-award").value
  })).filter(entry => entry.played);
  if (!entries.length) { toast("Marque pelo menos um atleta que jogou."); return; }
  const { data: game, error: gameError } = await supabaseClient.from("games").insert({
    played_on: document.querySelector("#game-date").value, place: document.querySelector("#game-place").value.trim(),
    home_team: document.querySelector("#team-home").value.trim(), away_team: document.querySelector("#team-away").value.trim(),
    home_score: Number(document.querySelector("#score-home").value), away_score: Number(document.querySelector("#score-away").value)
  }).select().single();
  if (gameError) { toast(`Não foi possível salvar a rodada: ${gameError.message}`); return; }
  const { error: statsError } = await supabaseClient.from("player_game_stats").insert(entries.map(entry => ({
    game_id: game.id, player_id: entry.playerId, goals: entry.goals, assists: entry.assists, saves: entry.saves, tackles: 0,
    is_craque: entry.award === "craque", is_xerife: entry.award === "xerife", is_paredao: entry.award === "paredao"
  })));
  if (statsError) { await supabaseClient.from("games").delete().eq("id", game.id); toast(`Não foi possível salvar as estatísticas: ${statsError.message}`); return; }
  event.target.reset(); document.querySelector("#team-home").value = "Time Verde"; document.querySelector("#team-away").value = "Time Preto"; document.querySelector("#game-date").value = new Date().toISOString().slice(0, 10);
  await loadRemoteData(); toast("Rodada salva. Os rankings foram atualizados.");
});
document.querySelector("#admin-players-list").addEventListener("click", async event => {
  const button = event.target.closest("[data-delete-player]"); if (!button || !requireAdmin()) return;
  const player = data.players.find(item => item.id === button.dataset.deletePlayer);
  if (!confirm(`Excluir ${player?.nickname || player?.name || "este atleta"}? As estatísticas dele também serão removidas.`)) return;
  const { error } = await supabaseClient.from("players").delete().eq("id", button.dataset.deletePlayer);
  if (error) { toast(`Não foi possível excluir: ${error.message}`); return; }
  await loadRemoteData(); toast("Atleta excluído.");
});

document.querySelector("#game-date").value = new Date().toISOString().slice(0, 10);
(async function initialiseApp() {
  await refreshAuthState();
  await loadRemoteData();
  supabaseClient.auth.onAuthStateChange(() => { setTimeout(refreshAuthState, 0); });
})();
