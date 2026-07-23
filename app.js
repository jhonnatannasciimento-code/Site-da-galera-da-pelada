const supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_PUBLISHABLE_KEY
);

const SEASON = 2026;
const STAT_FIELDS = ["goals", "assists", "craque", "xerife", "paredao"];
let data = { players: [], games: [], adjustments: {} };
let selectedRanking = "goals";
let pendingPhotoFile = null;
let pendingEditPhotoFile = null;
let currentUser = null;
let isAdmin = false;
let editingGameId = null;

function number(value) { return Number(value || 0); }
function initials(player) {
  return (player?.name || "GP").split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
}
function displayName(player) { return player?.name || "Atleta"; }
function shirtNumber(player) {
  return player?.shirtNumber === null || player?.shirtNumber === undefined || player?.shirtNumber === "" ? "—" : player.shirtNumber;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
  }[character]));
}
function avatar(player, extraClass = "") {
  const name = displayName(player);
  return `<div class="avatar ${extraClass}">${player?.photo
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
function getEditingGame() { return data.games.find(game => game.id === editingGameId); }
function getGameTotals(playerId) {
  const totals = Object.fromEntries(STAT_FIELDS.map(field => [field, 0]));
  data.games.forEach(game => game.stats.forEach(entry => {
    if (entry.playerId !== playerId) return;
    STAT_FIELDS.forEach(field => { totals[field] += number(entry[field]); });
  }));
  return totals;
}
function getStats() {
  const totals = Object.fromEntries(data.players.map(player => [player.id, {
    player,
    games: 0,
    goals: number(data.adjustments[player.id]?.goals),
    assists: number(data.adjustments[player.id]?.assists),
    saves: 0,
    tackles: 0,
    craque: number(data.adjustments[player.id]?.craque),
    xerife: number(data.adjustments[player.id]?.xerife),
    paredao: number(data.adjustments[player.id]?.paredao)
  }]));
  data.games.forEach(game => game.stats.forEach(entry => {
    const total = totals[entry.playerId];
    if (!total) return;
    total.games += 1;
    total.goals += number(entry.goals);
    total.assists += number(entry.assists);
    total.saves += number(entry.saves);
    total.tackles += number(entry.tackles);
    total.craque += number(entry.craque);
    total.xerife += number(entry.xerife);
    total.paredao += number(entry.paredao);
  }));
  return Object.values(totals);
}
function bestStat(metric) {
  return [...getStats()].sort((a, b) => b[metric] - a[metric] || displayName(a.player).localeCompare(displayName(b.player)))[0];
}
function awardInfo(key) {
  return {
    craque: { title: "Craque", label: "melhor da rodada", icon: "★" },
    xerife: { title: "Xerife", label: "dono da marcação", icon: "◆" },
    paredao: { title: "Paredão", label: "segurou tudo", icon: "⬡" },
    artilheiro: { title: "Artilheiro", label: "goleador da rodada", icon: "⚽" }
  }[key];
}
function cardStatItems(item) {
  const position = String(item.player.position || "").toLocaleLowerCase("pt-BR");
  if (position.includes("goleiro")) return [["PAREDÃO", item.paredao], ["CRAQUE", item.craque]];
  return [["GOLS", item.goals], ["ASSIST.", item.assists], ["CRAQUE", item.craque], ["XERIFE", item.xerife]];
}
function cardStatsMarkup(item) {
  const items = cardStatItems(item);
  return `<div class="card-stats card-stats-${items.length}">${items.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>`;
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
    let entry = latestStats.find(stat => number(stat[key]) > 0);
    if (!entry && key === "artilheiro") entry = [...latestStats].sort((a, b) => number(b.goals) - number(a.goals))[0];
    return data.players.find(player => player.id === entry?.playerId);
  };
  document.querySelector("#weekly-awards").innerHTML = ["craque", "artilheiro", "xerife", "paredao"].map(key => {
    const info = awardInfo(key);
    const player = awardPlayer(key);
    const stat = latestStats.find(entry => entry.playerId === player?.id) || {};
    return `<article class="award-card"><div class="award-type"><span>${info.title.toUpperCase()}</span><span class="award-icon">${info.icon}</span></div>${player
      ? `<h3>${escapeHtml(displayName(player))}</h3><small>${key === "artilheiro" ? `${stat.goals || 0} gols` : info.label}</small><div class="award-person">${avatar(player)}</div>`
      : `<h3>—</h3><small>sem dados</small>`}</article>`;
  }).join("");
  document.querySelector("#recent-games").innerHTML = [...data.games].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map(game =>
    `<article class="recent-game"><div class="date-box">${shortDate(game.date)}<br/><span>${escapeHtml(game.place || "Quadra")}</span></div><div><strong>${escapeHtml(game.home)} <span class="recent-score">${game.homeScore} × ${game.awayScore}</span> ${escapeHtml(game.away)}</strong><small>${game.stats.length} atletas em campo</small></div><span class="mini-label">RODADA</span></article>`
  ).join("") || `<div class="empty-state">Nenhuma rodada cadastrada.</div>`;
  const records = [{ metric: "goals", label: "Artilheiro" }, { metric: "assists", label: "Garçom" }, { metric: "xerife", label: "Mais xerifes" }];
  document.querySelector("#records").innerHTML = records.map(record => {
    const winner = bestStat(record.metric);
    return winner && winner[record.metric] > 0 ? `<article class="record-item">${avatar(winner.player)}<div class="record-text"><strong>${escapeHtml(displayName(winner.player))}</strong><small>${record.label}</small></div><span class="record-number">${winner[record.metric]}</span></article>` : "";
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
  const items = getStats().filter(item => item[selectedRanking] > 0).sort((a, b) => b[selectedRanking] - a[selectedRanking] || b.goals - a.goals || displayName(a.player).localeCompare(displayName(b.player)));
  document.querySelector("#ranking-list").innerHTML = items.length ? items.map((item, index) =>
    `<article class="rank-row"><span class="rank-position">${String(index + 1).padStart(2, "0")}</span>${avatar(item.player)}<div class="rank-player"><strong>${escapeHtml(displayName(item.player))}</strong><small>#${shirtNumber(item.player)} · ${escapeHtml(item.player.position)} · ${item.games} ${item.games === 1 ? "jogo" : "jogos"}</small></div><span class="rank-meta">${item.goals} gols · ${item.assists} assist.</span><span class="rank-value">${item[selectedRanking]}<small>${item[selectedRanking] === 1 ? details.singular : details.plural}</small></span></article>`
  ).join("") : `<div class="empty-state">Ainda não existem dados nesta categoria.</div>`;
}
function renderPlayers(filter = "") {
  const text = filter.trim().toLocaleLowerCase("pt-BR");
  const players = getStats().filter(item => !text || `${item.player.name} ${item.player.shirtNumber}`.toLocaleLowerCase("pt-BR").includes(text)).sort((a, b) => displayName(a.player).localeCompare(displayName(b.player)));
  document.querySelector("#roster-count").textContent = `${players.length} ${players.length === 1 ? "ATLETA" : "ATLETAS"}`;
  document.querySelector("#athletes-grid").innerHTML = players.map(item =>
    `<article class="athlete-card"><div class="card-image">${avatar(item.player)}</div><div class="card-top"><span>GP • 2026</span><span class="athlete-number">#${shirtNumber(item.player)}</span></div><div class="card-bottom"><h2>${escapeHtml(displayName(item.player))}</h2><p>${escapeHtml(item.player.position)}</p>${cardStatsMarkup(item)}</div></article>`
  ).join("") || `<div class="empty-state">Nenhum atleta cadastrado ainda.</div>`;
}
function renderGameFields() {
  const container = document.querySelector("#game-player-fields");
  const existing = new Map((getEditingGame()?.stats || []).map(entry => [entry.playerId, entry]));
  const header = `<div class="game-fields-header"><span>ATLETA</span><span>TIME</span><span>G</span><span>A</span><span>C</span><span>X</span><span>P</span></div>`;
  container.innerHTML = data.players.length ? header + data.players.map(player => {
    const entry = existing.get(player.id) || {};
    return `<div class="game-player-row" data-player-id="${player.id}"><div>${avatar(player)}<span><strong title="${escapeHtml(displayName(player))}">${escapeHtml(displayName(player))}</strong><small>#${shirtNumber(player)} · ${escapeHtml(player.position)}</small></span></div><select class="field-team" aria-label="Time de ${escapeHtml(player.name)}"><option value="">—</option><option value="home"${entry.team === "home" ? " selected" : ""}>T1</option><option value="away"${entry.team === "away" ? " selected" : ""}>T2</option></select><input class="field-goals" type="number" min="0" value="${number(entry.goals)}" title="Gols" aria-label="Gols de ${escapeHtml(player.name)}" /><input class="field-assists" type="number" min="0" value="${number(entry.assists)}" title="Assistências" aria-label="Assistências de ${escapeHtml(player.name)}" /><input class="field-craque" type="number" min="0" max="1" value="${number(entry.craque)}" title="Craque" aria-label="Craque de ${escapeHtml(player.name)}" /><input class="field-xerife" type="number" min="0" max="1" value="${number(entry.xerife)}" title="Xerife" aria-label="Xerife de ${escapeHtml(player.name)}" /><input class="field-paredao" type="number" min="0" max="1" value="${number(entry.paredao)}" title="Paredão" aria-label="Paredão de ${escapeHtml(player.name)}" /></div>`;
  }).join("") : `<div class="empty-state">Cadastre pelo menos um atleta antes de lançar uma rodada.</div>`;
}
function entrySummary(entry) {
  const items = [];
  if (number(entry.goals)) items.push(`${entry.goals}G`);
  if (number(entry.assists)) items.push(`${entry.assists}A`);
  if (number(entry.craque)) items.push("Craque");
  if (number(entry.xerife)) items.push("Xerife");
  if (number(entry.paredao)) items.push("Paredão");
  return items.join(" · ") || "Participou";
}
function renderTeamRoster(game, side) {
  const entries = game.stats.filter(entry => entry.team === side);
  if (!entries.length) return `<p class="saved-game-empty">Nenhum atleta informado.</p>`;
  return `<ul>${entries.map(entry => {
    const player = data.players.find(item => item.id === entry.playerId);
    return `<li><strong>${escapeHtml(displayName(player))}</strong><small>${entrySummary(entry)}</small></li>`;
  }).join("")}</ul>`;
}
function renderSavedGames() {
  const container = document.querySelector("#saved-games-list");
  const games = [...data.games].sort((a, b) => b.date.localeCompare(a.date));
  container.innerHTML = games.length ? games.map(game => `<article class="saved-game"><div class="saved-game-top"><div><span class="mini-label">${formatDate(game.date)}</span><strong>${escapeHtml(game.home)} <b>${game.homeScore} × ${game.awayScore}</b> ${escapeHtml(game.away)}</strong><small>${escapeHtml(game.place || "Local não informado")}</small></div><button class="button secondary edit-game" data-edit-game="${game.id}" type="button">Editar</button></div><div class="saved-game-rosters"><section><span>${escapeHtml(game.home)}</span>${renderTeamRoster(game, "home")}</section><section><span>${escapeHtml(game.away)}</span>${renderTeamRoster(game, "away")}</section></div></article>`).join("") : `<div class="empty-state saved-games-empty">Nenhum confronto salvo ainda.</div>`;
}
function renderAdminPlayers() {
  const container = document.querySelector("#admin-players-list");
  container.innerHTML = data.players.length ? data.players.map(player =>
    `<article class="admin-player-item"><div>${avatar(player)}<span><strong>${escapeHtml(displayName(player))}</strong><small>#${shirtNumber(player)} · ${escapeHtml(player.position)}</small></span></div><span class="admin-player-actions"><button class="edit-player" data-edit-player="${player.id}" type="button">Editar</button><button class="delete-player" data-delete-player="${player.id}" type="button">Excluir</button></span></article>`
  ).join("") : `<div class="empty-state">Nenhum atleta para gerenciar.</div>`;
}
function renderAdjustmentForm() {
  const select = document.querySelector("#adjustment-player");
  const selectedId = select.value;
  select.innerHTML = data.players.length
    ? data.players.map(player => `<option value="${player.id}">${escapeHtml(displayName(player))} · #${shirtNumber(player)}</option>`).join("")
    : `<option value="">Cadastre um atleta primeiro</option>`;
  select.disabled = !data.players.length;
  if (data.players.some(player => player.id === selectedId)) select.value = selectedId;
  fillAdjustmentFields();
}
function fillAdjustmentFields() {
  const playerId = document.querySelector("#adjustment-player")?.value;
  const adjustment = data.adjustments[playerId] || {};
  STAT_FIELDS.forEach(field => { document.querySelector(`#adjustment-${field}`).value = number(adjustment[field]); });
}
function updateGameFormState() {
  const editing = Boolean(editingGameId);
  document.querySelector("#game-submit").innerHTML = editing ? "Salvar alterações <span>→</span>" : "Salvar rodada e atualizar ranking <span>→</span>";
  document.querySelector("#cancel-game-edit").hidden = !editing;
}
function renderAll() {
  renderHome();
  renderRanking();
  renderPlayers(document.querySelector("#player-search")?.value || "");
  renderGameFields();
  renderSavedGames();
  renderAdminPlayers();
  renderAdjustmentForm();
  updateGameFormState();
}
function showView(id) {
  if (id === "admin" && !isAdmin) return openLoginModal();
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active-view", view.id === id));
  document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.viewTarget === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => element.classList.remove("show"), 3400);
}

async function loadRemoteData(showMessage = false) {
  const [playersResult, gamesResult, statsResult, adjustmentsResult] = await Promise.all([
    supabaseClient.from("players").select("*").order("full_name"),
    supabaseClient.from("games").select("*").order("played_on", { ascending: false }),
    supabaseClient.from("player_game_stats").select("*"),
    supabaseClient.from("player_season_adjustments").select("*").eq("season", SEASON)
  ]);
  const error = playersResult.error || gamesResult.error || statsResult.error || adjustmentsResult.error;
  if (error) { toast(`Não foi possível carregar os dados: ${error.message}`); return; }
  const gameStats = new Map((gamesResult.data || []).map(game => [game.id, []]));
  (statsResult.data || []).forEach(stat => gameStats.get(stat.game_id)?.push({
    playerId: stat.player_id,
    team: stat.team_side || "",
    goals: number(stat.goals),
    assists: number(stat.assists),
    saves: number(stat.saves),
    tackles: number(stat.tackles),
    craque: stat.is_craque ? 1 : 0,
    xerife: stat.is_xerife ? 1 : 0,
    paredao: stat.is_paredao ? 1 : 0
  }));
  data = {
    players: (playersResult.data || []).map(player => ({ id: player.id, name: player.full_name, shirtNumber: player.shirt_number, position: player.position, photo: player.photo_url })),
    games: (gamesResult.data || []).map(game => ({ id: game.id, date: game.played_on, place: game.place, home: game.home_team, away: game.away_team, homeScore: game.home_score, awayScore: game.away_score, stats: gameStats.get(game.id) || [] })),
    adjustments: Object.fromEntries((adjustmentsResult.data || []).map(adjustment => [adjustment.player_id, adjustment]))
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
function validatePlayerPhoto(file, input) {
  const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedImageTypes.includes(file.type)) { toast("Envie uma imagem JPG, PNG ou WEBP."); input.value = ""; return false; }
  if (file.size > 2_500_000) { toast("Escolha uma foto de até 2,5 MB."); input.value = ""; return false; }
  return true;
}
async function uploadPlayerPhoto(playerId, file) {
  if (!file) return null;
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${playerId}/${Date.now()}.${extension}`;
  const { error } = await supabaseClient.storage.from("player-photos").upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return supabaseClient.storage.from("player-photos").getPublicUrl(path).data.publicUrl;
}
function previewPhoto(element, player, source = player?.photo) {
  element.innerHTML = source ? `<img src="${source}" alt="Prévia da foto de ${escapeHtml(displayName(player))}" />` : initials(player);
}
function resetGameForm() {
  editingGameId = null;
  const form = document.querySelector("#game-form");
  form.reset();
  document.querySelector("#team-home").value = "Time Verde";
  document.querySelector("#team-away").value = "Time Preto";
  document.querySelector("#game-date").value = new Date().toISOString().slice(0, 10);
  renderGameFields();
  updateGameFormState();
}
function openGameEditor(gameId) {
  if (!requireAdmin()) return;
  const game = data.games.find(item => item.id === gameId);
  if (!game) return;
  editingGameId = game.id;
  document.querySelector("#game-date").value = game.date;
  document.querySelector("#game-place").value = game.place || "";
  document.querySelector("#team-home").value = game.home;
  document.querySelector("#team-away").value = game.away;
  document.querySelector("#score-home").value = game.homeScore;
  document.querySelector("#score-away").value = game.awayScore;
  renderGameFields();
  updateGameFormState();
  document.querySelector("#game-form").scrollIntoView({ behavior: "smooth", block: "start" });
  toast("Confronto aberto para edição.");
}
function closePlayerEditModal() {
  document.querySelector("#player-edit-modal").hidden = true;
  pendingEditPhotoFile = null;
}
function openPlayerEdit(playerId) {
  if (!requireAdmin()) return;
  const player = data.players.find(item => item.id === playerId);
  const stats = getStats().find(item => item.player.id === playerId);
  if (!player || !stats) return;
  document.querySelector("#edit-player-id").value = player.id;
  document.querySelector("#edit-player-name").value = player.name;
  document.querySelector("#edit-player-shirt-number").value = player.shirtNumber ?? "";
  document.querySelector("#edit-player-position").value = player.position;
  STAT_FIELDS.forEach(field => { document.querySelector(`#edit-player-${field}`).value = number(stats[field]); });
  previewPhoto(document.querySelector("#edit-photo-preview"), player);
  pendingEditPhotoFile = null;
  document.querySelector("#edit-player-photo").value = "";
  document.querySelector("#player-edit-modal").hidden = false;
}

document.querySelectorAll("[data-view-target]").forEach(button => button.addEventListener("click", () => showView(button.dataset.viewTarget)));
document.querySelectorAll("[data-admin-access]").forEach(button => button.addEventListener("click", () => isAdmin ? showView("admin") : openLoginModal()));
document.querySelector("#admin-access-button").addEventListener("click", () => isAdmin ? showView("admin") : openLoginModal());
document.querySelectorAll("[data-close-login]").forEach(button => button.addEventListener("click", closeLoginModal));
document.querySelectorAll("[data-close-player-edit]").forEach(button => button.addEventListener("click", closePlayerEditModal));
document.querySelector("#admin-logout").addEventListener("click", async () => { await supabaseClient.auth.signOut(); await refreshAuthState(); showView("inicio"); toast("Sessão encerrada."); });
document.querySelectorAll(".ranking-tab").forEach(button => button.addEventListener("click", () => { selectedRanking = button.dataset.ranking; renderRanking(); }));
document.querySelector("#player-search").addEventListener("input", event => renderPlayers(event.target.value));
document.querySelector("#player-photo").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file || !validatePlayerPhoto(file, event.target)) return;
  pendingPhotoFile = file;
  const reader = new FileReader();
  reader.onload = () => { document.querySelector("#photo-preview").innerHTML = `<img src="${reader.result}" alt="Prévia da foto" />`; };
  reader.readAsDataURL(file);
});
document.querySelector("#edit-player-photo").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file || !validatePlayerPhoto(file, event.target)) return;
  pendingEditPhotoFile = file;
  const player = data.players.find(item => item.id === document.querySelector("#edit-player-id").value);
  const reader = new FileReader();
  reader.onload = () => previewPhoto(document.querySelector("#edit-photo-preview"), player, reader.result);
  reader.readAsDataURL(file);
});
document.querySelector("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const errorBox = document.querySelector("#login-error");
  errorBox.textContent = "";
  const { error } = await supabaseClient.auth.signInWithPassword({ email: document.querySelector("#login-email").value.trim(), password: document.querySelector("#login-password").value });
  if (error) { errorBox.textContent = "E-mail ou senha inválidos."; return; }
  await refreshAuthState();
  if (!isAdmin) { errorBox.textContent = "Esta conta não tem autorização administrativa."; return; }
  closeLoginModal();
  showView("admin");
  toast("Login de administrador realizado.");
});
document.querySelector("#player-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  const name = document.querySelector("#player-name").value.trim();
  const shirtNumber = number(document.querySelector("#player-shirt-number").value);
  const position = document.querySelector("#player-position").value;
  const { data: player, error } = await supabaseClient.from("players").insert({ full_name: name, nickname: name.split(" ")[0], shirt_number: shirtNumber, position }).select().single();
  if (error) { toast(`Não foi possível salvar: ${error.message}`); return; }
  try {
    const photoUrl = await uploadPlayerPhoto(player.id, pendingPhotoFile);
    if (photoUrl) await supabaseClient.from("players").update({ photo_url: photoUrl }).eq("id", player.id);
  } catch (uploadError) {
    toast(`Atleta salvo, mas a foto falhou: ${uploadError.message}`);
  }
  event.target.reset();
  pendingPhotoFile = null;
  document.querySelector("#photo-preview").textContent = "+";
  await loadRemoteData();
  toast(`${name} entrou no elenco com a camisa ${shirtNumber}.`);
});
document.querySelector("#game-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  const rows = [...document.querySelectorAll(".game-player-row")].map(row => ({
    playerId: row.dataset.playerId,
    team: row.querySelector(".field-team").value,
    goals: number(row.querySelector(".field-goals").value),
    assists: number(row.querySelector(".field-assists").value),
    craque: number(row.querySelector(".field-craque").value),
    xerife: number(row.querySelector(".field-xerife").value),
    paredao: number(row.querySelector(".field-paredao").value)
  }));
  const invalidRow = rows.find(entry => !entry.team && STAT_FIELDS.some(field => number(entry[field]) > 0));
  if (invalidRow) { toast("Escolha o Time 1 ou o Time 2 para todo atleta com estatísticas."); return; }
  const entries = rows.filter(entry => entry.team);
  if (!entries.length) { toast("Escolha o Time 1 ou o Time 2 para pelo menos um atleta."); return; }
  const gamePayload = {
    played_on: document.querySelector("#game-date").value,
    place: document.querySelector("#game-place").value.trim(),
    home_team: document.querySelector("#team-home").value.trim(),
    away_team: document.querySelector("#team-away").value.trim(),
    home_score: number(document.querySelector("#score-home").value),
    away_score: number(document.querySelector("#score-away").value)
  };
  let gameId = editingGameId;
  if (gameId) {
    const { error } = await supabaseClient.from("games").update(gamePayload).eq("id", gameId);
    if (error) { toast(`Não foi possível atualizar o confronto: ${error.message}`); return; }
    const { error: deleteError } = await supabaseClient.from("player_game_stats").delete().eq("game_id", gameId);
    if (deleteError) { toast(`Não foi possível atualizar as estatísticas: ${deleteError.message}`); return; }
  } else {
    const { data: game, error } = await supabaseClient.from("games").insert(gamePayload).select().single();
    if (error) { toast(`Não foi possível salvar a rodada: ${error.message}`); return; }
    gameId = game.id;
  }
  const { error: statsError } = await supabaseClient.from("player_game_stats").insert(entries.map(entry => ({
    game_id: gameId,
    player_id: entry.playerId,
    team_side: entry.team,
    goals: entry.goals,
    assists: entry.assists,
    saves: 0,
    tackles: 0,
    is_craque: entry.craque > 0,
    is_xerife: entry.xerife > 0,
    is_paredao: entry.paredao > 0
  })));
  if (statsError) {
    if (!editingGameId) await supabaseClient.from("games").delete().eq("id", gameId);
    toast(`Não foi possível salvar as estatísticas: ${statsError.message}`);
    return;
  }
  editingGameId = null;
  await loadRemoteData();
  toast("Confronto salvo. Os rankings foram atualizados.");
});
document.querySelector("#new-game-button").addEventListener("click", () => { if (requireAdmin()) resetGameForm(); });
document.querySelector("#cancel-game-edit").addEventListener("click", resetGameForm);
document.querySelector("#saved-games-list").addEventListener("click", event => {
  const button = event.target.closest("[data-edit-game]");
  if (button) openGameEditor(button.dataset.editGame);
});
document.querySelector("#adjustment-player").addEventListener("change", fillAdjustmentFields);
document.querySelector("#adjustment-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  const playerId = document.querySelector("#adjustment-player").value;
  if (!playerId) { toast("Cadastre um atleta antes de salvar o saldo histórico."); return; }
  const payload = Object.fromEntries(STAT_FIELDS.map(field => [field, number(document.querySelector(`#adjustment-${field}`).value)]));
  const { error } = await supabaseClient.from("player_season_adjustments").upsert({
    player_id: playerId, season: SEASON, ...payload, updated_at: new Date().toISOString()
  }, { onConflict: "player_id,season" });
  if (error) { toast(`Não foi possível salvar o saldo: ${error.message}`); return; }
  await loadRemoteData();
  toast("Saldo histórico salvo. Os rankings foram atualizados.");
});
document.querySelector("#admin-players-list").addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit-player]");
  if (editButton) { openPlayerEdit(editButton.dataset.editPlayer); return; }
  const deleteButton = event.target.closest("[data-delete-player]");
  if (!deleteButton || !requireAdmin()) return;
  const player = data.players.find(item => item.id === deleteButton.dataset.deletePlayer);
  if (!confirm(`Excluir ${displayName(player)}? As estatísticas dele também serão removidas.`)) return;
  const { error } = await supabaseClient.from("players").delete().eq("id", deleteButton.dataset.deletePlayer);
  if (error) { toast(`Não foi possível excluir: ${error.message}`); return; }
  await loadRemoteData();
  toast("Atleta excluído.");
});
document.querySelector("#player-edit-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  const playerId = document.querySelector("#edit-player-id").value;
  const player = data.players.find(item => item.id === playerId);
  if (!player) return;
  const wantedTotals = Object.fromEntries(STAT_FIELDS.map(field => [field, number(document.querySelector(`#edit-player-${field}`).value)]));
  const registeredGames = getGameTotals(playerId);
  const impossibleField = STAT_FIELDS.find(field => wantedTotals[field] < registeredGames[field]);
  if (impossibleField) { toast("Esse total é menor do que o já registrado nas rodadas. Edite o confronto para reduzir esse número."); return; }
  let photoUrl = player.photo;
  try {
    if (pendingEditPhotoFile) photoUrl = await uploadPlayerPhoto(playerId, pendingEditPhotoFile);
  } catch (error) {
    toast(`Não foi possível enviar a foto: ${error.message}`);
    return;
  }
  const name = document.querySelector("#edit-player-name").value.trim();
  const { error: playerError } = await supabaseClient.from("players").update({
    full_name: name,
    nickname: name.split(" ")[0],
    shirt_number: number(document.querySelector("#edit-player-shirt-number").value),
    position: document.querySelector("#edit-player-position").value,
    photo_url: photoUrl
  }).eq("id", playerId);
  if (playerError) { toast(`Não foi possível editar o atleta: ${playerError.message}`); return; }
  const historicalBalance = Object.fromEntries(STAT_FIELDS.map(field => [field, wantedTotals[field] - registeredGames[field]]));
  const { error: statsError } = await supabaseClient.from("player_season_adjustments").upsert({
    player_id: playerId, season: SEASON, ...historicalBalance, updated_at: new Date().toISOString()
  }, { onConflict: "player_id,season" });
  if (statsError) { toast(`Dados do atleta salvos, mas as estatísticas falharam: ${statsError.message}`); return; }
  closePlayerEditModal();
  await loadRemoteData();
  toast("Atleta e estatísticas atualizados.");
});

document.querySelector("#game-date").value = new Date().toISOString().slice(0, 10);
(async function initialiseApp() {
  await refreshAuthState();
  await loadRemoteData();
  supabaseClient.auth.onAuthStateChange(() => { setTimeout(refreshAuthState, 0); });
})();
