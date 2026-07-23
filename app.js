const supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_PUBLISHABLE_KEY
);

const SEASON = 2026;
const LAST_HISTORICAL_ROUND = 14;
const DEFAULT_VENUE_NAME = "CT Caxangá";
const DEFAULT_VENUE_MAP_URL = "https://www.google.com/maps/dir/?api=1&destination=-8.033411,-34.9597396";
const STAT_FIELDS = ["goals", "assists", "craque", "xerife", "paredao"];
const ADJUSTMENT_FIELDS = ["games", ...STAT_FIELDS];
let data = { players: [], games: [], rounds: [], adjustments: {}, attendance: {} };
let selectedRanking = "goals";
let pendingPhotoFile = null;
let pendingEditPhotoFile = null;
let currentUser = null;
let isAdmin = false;
let editingGameId = null;
let activeRoundId = null;
let roundsAvailable = true;
let attendanceAvailable = true;
let gameDraftEntries = null;

function number(value) { return Number(value || 0); }
function initials(player) {
  return (player?.name || "GP").split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
}
function displayName(player) { return player?.name || "Atleta"; }
function shirtNumber(player) {
  const value = player?.shirtNumber;
  if (value === 0 || value === "0") return "00";
  return value === null || value === undefined || value === "" ? "—" : value;
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
function getActiveRound() { return data.rounds.find(round => round.id === activeRoundId); }
function getRoundById(roundId) { return data.rounds.find(round => round.id === roundId); }
function teamLabel(numberValue) { return `Time ${numberValue}`; }
function gameTeamNumber(game, side) {
  const label = side === "home" ? game?.home : game?.away;
  const match = String(label || "").match(/(\d+)/);
  return match?.[1] || (side === "home" ? "1" : "2");
}
function attendanceFor(playerId, fallbackEntry = null) {
  const roundId = getActiveRound()?.id || getEditingGame()?.roundId;
  const savedStatus = roundId ? data.attendance[roundId]?.[playerId] : null;
  return savedStatus || (fallbackEntry?.team ? "present" : "unknown");
}
function attendanceMeta(status) {
  return {
    present: { title: "Compareceu", section: "Compareceu na pelada", icon: "●" },
    unknown: { title: "Dúvida", section: "Dúvida de presença", icon: "?" },
    absent: { title: "Não compareceu", section: "Não compareceu na pelada", icon: "×" }
  }[status] || { title: "Dúvida", section: "Dúvida de presença", icon: "?" };
}
function getNextRoundNumber() {
  return Math.max(LAST_HISTORICAL_ROUND, ...data.rounds.map(round => number(round.number))) + 1;
}
function roundLabel(round) { return `Rodada ${round?.number ?? round?.round_number}`; }
function roundStatusLabel(round) { return round.status === "completed" ? "Finalizada" : "Em edição"; }
function venueMapLink(label = "Abrir no GPS") {
  return `<a class="venue-map-link" href="${DEFAULT_VENUE_MAP_URL}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
}
function getGameTotals(playerId) {
  const totals = Object.fromEntries(STAT_FIELDS.map(field => [field, 0]));
  data.games.forEach(game => game.stats.forEach(entry => {
    if (entry.playerId !== playerId) return;
    STAT_FIELDS.forEach(field => { totals[field] += number(entry[field]); });
  }));
  return totals;
}
function getRecordedGameCount(playerId) {
  return data.games.reduce((total, game) => total + (game.stats.some(entry => entry.playerId === playerId) ? 1 : 0), 0);
}
function getStats() {
  const totals = Object.fromEntries(data.players.map(player => [player.id, {
    player,
    games: number(data.adjustments[player.id]?.games),
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
  const items = metric === "paredao" ? getStats().filter(item => isGoalkeeper(item.player)) : getStats();
  return [...items].sort((a, b) => b[metric] - a[metric] || displayName(a.player).localeCompare(displayName(b.player)))[0];
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
  if (isGoalkeeper(item.player)) return [["PAREDÃO", item.paredao], ["CRAQUE", item.craque]];
  return [["GOLS", item.goals], ["ASSIST.", item.assists], ["CRAQUE", item.craque], ["XERIFE", item.xerife]];
}
function isGoalkeeper(player) { return String(player?.position || "").toLocaleLowerCase("pt-BR").includes("goleiro"); }
function cardStatsMarkup(item) {
  const items = cardStatItems(item);
  return `<div class="card-stats card-stats-${items.length}">${items.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>`;
}

function renderHome() {
  const stats = getStats();
  const latest = getLatestGame();
  const latestRoundNumber = Math.max(LAST_HISTORICAL_ROUND, ...data.rounds.map(round => number(round.number)));
  document.querySelector("#total-games").textContent = latestRoundNumber;
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
  const records = [
    { metric: "goals", label: "Artilheiro" },
    { metric: "assists", label: "Garçom" },
    { metric: "xerife", label: "Xerife da temporada" },
    { metric: "paredao", label: "Paredão da temporada" },
    { metric: "craque", label: "Destaque da temporada" }
  ];
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
  renderCompleteRanking(getStats());
}
function renderCompleteRanking(stats) {
  const items = [...stats].sort((a, b) =>
    b.goals - a.goals || b.assists - a.assists || b.craque - a.craque || b.xerife - a.xerife || b.paredao - a.paredao || b.games - a.games || displayName(a.player).localeCompare(displayName(b.player))
  );
  document.querySelector("#complete-ranking-list").innerHTML = items.length ? items.map((item, index) =>
    `<tr><td class="complete-rank-position">${String(index + 1).padStart(2, "0")}</td><td><div class="complete-rank-player">${avatar(item.player)}<span><strong>${escapeHtml(displayName(item.player))}</strong><small>#${shirtNumber(item.player)} · ${escapeHtml(item.player.position)}</small></span></div></td><td>${item.games}</td><td>${item.goals}</td><td>${item.assists}</td><td>${item.craque}</td><td>${item.xerife}</td><td>${item.paredao}</td></tr>`
  ).join("") : `<tr><td class="complete-ranking-empty" colspan="8">Ainda não existem atletas cadastrados.</td></tr>`;
}
function renderPlayers(filter = "") {
  const text = filter.trim().toLocaleLowerCase("pt-BR");
  const allPlayers = getStats();
  const goalkeepers = allPlayers.filter(item => isGoalkeeper(item.player)).length;
  document.querySelector("#roster-summary").textContent = `${allPlayers.length} ${allPlayers.length === 1 ? "atleta" : "atletas"} no elenco, incluindo ${goalkeepers} ${goalkeepers === 1 ? "goleiro" : "goleiros"} na temporada 2026.`;
  const players = allPlayers.filter(item => !text || `${item.player.name} ${item.player.shirtNumber}`.toLocaleLowerCase("pt-BR").includes(text)).sort((a, b) => displayName(a.player).localeCompare(displayName(b.player)));
  document.querySelector("#roster-count").textContent = `${players.length} ${players.length === 1 ? "ATLETA" : "ATLETAS"}`;
  document.querySelector("#athletes-grid").innerHTML = players.map(item =>
    `<article class="athlete-card"><div class="card-image">${avatar(item.player)}</div><div class="card-top"><span>GP • 2026</span><span class="athlete-number">#${shirtNumber(item.player)}</span></div><div class="card-bottom"><h2>${escapeHtml(displayName(item.player))}</h2><p>${escapeHtml(item.player.position)}</p><span class="card-games">${item.games} ${item.games === 1 ? "jogo disputado" : "jogos disputados"}</span>${cardStatsMarkup(item)}</div></article>`
  ).join("") || `<div class="empty-state">Nenhum atleta cadastrado ainda.</div>`;
}
function teamOptions(selected = "") {
  return `<option value="">—</option>${Array.from({ length: 10 }, (_, index) => {
    const value = String(index + 1);
    return `<option value="${value}"${String(selected) === value ? " selected" : ""}>${teamLabel(value)}</option>`;
  }).join("")}`;
}
function captureGameDraftEntries() {
  const draft = new Map();
  document.querySelectorAll(".game-player-row").forEach(row => {
    draft.set(row.dataset.playerId, {
      team: row.querySelector(".field-team").value,
      attendance: row.querySelector(".field-attendance").value,
      goals: number(row.querySelector(".field-goals").value),
      assists: number(row.querySelector(".field-assists").value),
      craque: number(row.querySelector(".field-craque").value),
      xerife: number(row.querySelector(".field-xerife").value),
      paredao: number(row.querySelector(".field-paredao").value)
    });
  });
  return draft;
}
function renderGamePlayerRow(player, entry) {
  const present = entry.attendance === "present";
  const disabled = present ? "" : " disabled";
  return `<div class="game-player-row" data-player-id="${player.id}" data-attendance="${entry.attendance}"><div>${avatar(player)}<span><strong title="${escapeHtml(displayName(player))}">${escapeHtml(displayName(player))}</strong><small>#${shirtNumber(player)} · ${escapeHtml(player.position)}</small></span></div><div class="attendance-control"><span class="attendance-indicator ${entry.attendance}" aria-hidden="true">${attendanceMeta(entry.attendance).icon}</span><select class="field-attendance" aria-label="Presença de ${escapeHtml(player.name)}"><option value="present"${entry.attendance === "present" ? " selected" : ""}>Compareceu</option><option value="unknown"${entry.attendance === "unknown" ? " selected" : ""}>Dúvida</option><option value="absent"${entry.attendance === "absent" ? " selected" : ""}>Não compareceu</option></select></div><select class="field-team" aria-label="Time de ${escapeHtml(player.name)}"${disabled}>${teamOptions(entry.team)}</select><input class="field-goals" type="number" min="0" value="${number(entry.goals)}" title="Gols" aria-label="Gols de ${escapeHtml(player.name)}"${disabled} /><input class="field-assists" type="number" min="0" value="${number(entry.assists)}" title="Assistências" aria-label="Assistências de ${escapeHtml(player.name)}"${disabled} /><input class="field-craque" type="number" min="0" max="1" value="${number(entry.craque)}" title="Craque" aria-label="Craque de ${escapeHtml(player.name)}"${disabled} /><input class="field-xerife" type="number" min="0" max="1" value="${number(entry.xerife)}" title="Xerife" aria-label="Xerife de ${escapeHtml(player.name)}"${disabled} /><input class="field-paredao" type="number" min="0" max="1" value="${number(entry.paredao)}" title="Paredão" aria-label="Paredão de ${escapeHtml(player.name)}"${disabled} /></div>`;
}
function renderGameFields() {
  {
    const container = document.querySelector("#game-player-fields");
    const existing = new Map((getEditingGame()?.stats || []).map(entry => [entry.playerId, entry]));
    const rows = data.players.map(player => {
      const savedEntry = existing.get(player.id) || {};
      const draftEntry = gameDraftEntries?.get(player.id) || {};
      const entry = { ...savedEntry, ...draftEntry, attendance: draftEntry.attendance || attendanceFor(player.id, savedEntry) };
      return { player, entry };
    });
    const header = `<div class="game-fields-header"><span>Atleta</span><span>Presença</span><span>Time</span><span>Gols</span><span>Assistências</span><span>Craque</span><span>Xerife</span><span>Paredão</span></div>`;
    const sections = ["present", "unknown", "absent"].map(status => {
      const items = rows.filter(item => item.entry.attendance === status);
      if (!items.length) return "";
      const meta = attendanceMeta(status);
      return `<section class="attendance-section ${status}"><div class="attendance-section-heading"><span class="attendance-indicator ${status}" aria-hidden="true">${meta.icon}</span><strong>${meta.section}</strong><small>${items.length} ${items.length === 1 ? "atleta" : "atletas"}</small></div>${items.map(item => renderGamePlayerRow(item.player, item.entry)).join("")}</section>`;
    }).join("");
    container.innerHTML = data.players.length ? header + sections : `<div class="empty-state">Cadastre pelo menos um atleta antes de lançar uma rodada.</div>`;
    return;
  }
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
  {
    const teamNumber = gameTeamNumber(game, side);
    const entries = game.stats.filter(entry => String(entry.team) === String(teamNumber));
    if (!entries.length) return `<p class="saved-game-empty">Nenhum atleta informado.</p>`;
    return `<ul>${entries.map(entry => {
      const player = data.players.find(item => item.id === entry.playerId);
      return `<li><strong>${escapeHtml(displayName(player))}</strong><small>${entrySummary(entry)}</small></li>`;
    }).join("")}</ul>`;
  }
  const entries = game.stats.filter(entry => entry.team === side);
  if (!entries.length) return `<p class="saved-game-empty">Nenhum atleta informado.</p>`;
  return `<ul>${entries.map(entry => {
    const player = data.players.find(item => item.id === entry.playerId);
    return `<li><strong>${escapeHtml(displayName(player))}</strong><small>${entrySummary(entry)}</small></li>`;
  }).join("")}</ul>`;
}
function savedGameMarkup(game, index) {
  return `<article class="saved-game round-saved-game"><div class="saved-game-top"><div class="round-game-score"><span class="round-game-number">JOGO ${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(game.home)} <b>${game.homeScore} × ${game.awayScore}</b> ${escapeHtml(game.away)}</strong></div><button class="button secondary edit-game" data-edit-game="${game.id}" type="button">Editar</button></div><div class="saved-game-rosters"><section><span>${escapeHtml(game.home)}</span>${renderTeamRoster(game, "home")}</section><section><span>${escapeHtml(game.away)}</span>${renderTeamRoster(game, "away")}</section></div></article>`;
}
function publicGameMarkup(game, index) {
  return `<article class="saved-game round-saved-game public-saved-game"><div class="saved-game-top"><div class="round-game-score"><span class="round-game-number">JOGO ${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(game.home)} <b>${game.homeScore} × ${game.awayScore}</b> ${escapeHtml(game.away)}</strong></div></div><div class="saved-game-rosters"><section><span>${escapeHtml(game.home)}</span>${renderTeamRoster(game, "home")}</section><section><span>${escapeHtml(game.away)}</span>${renderTeamRoster(game, "away")}</section></div></article>`;
}
function attendanceListMarkup(roundId) {
  if (!attendanceAvailable) return "";
  const list = ["present", "unknown", "absent"].map(status => {
    const players = data.players.filter(player => (data.attendance[roundId]?.[player.id] || "unknown") === status);
    const meta = attendanceMeta(status);
    return `<section class="public-attendance-list ${status}"><div><span class="attendance-indicator ${status}" aria-hidden="true">${meta.icon}</span><strong>${meta.section}</strong><small>${players.length}</small></div>${players.length ? `<ul>${players.map(player => `<li>${escapeHtml(displayName(player))}</li>`).join("")}</ul>` : `<p>Nenhum atleta.</p>`}</section>`;
  }).join("");
  return `<section class="public-attendance"><div class="public-attendance-heading"><div><p class="eyebrow">PRESENÇA DA RODADA</p><h3>Lista de presença</h3></div><small>Atualizada pelo organizador</small></div><div class="public-attendance-grid">${list}</div></section>`;
}
function renderPublicRounds() {
  const currentContainer = document.querySelector("#public-round-week");
  const historyContainer = document.querySelector("#public-round-history");
  if (!roundsAvailable) {
    currentContainer.innerHTML = `<div class="empty-state">O calendário de rodadas será liberado em breve.</div>`;
    historyContainer.innerHTML = `<div class="empty-state">Ainda não há rodadas publicadas.</div>`;
    return;
  }
  const rounds = [...data.rounds].sort((a, b) => b.number - a.number);
  const currentRound = rounds.find(round => round.status === "draft") || rounds[0];
  if (!currentRound) {
    currentContainer.innerHTML = `<div class="round-public-heading"><span class="round-status draft">PRÓXIMA RODADA</span><div><p class="eyebrow">A CAMINHO</p><h2>Rodada ${getNextRoundNumber()}</h2><p>Os confrontos da semana aparecerão aqui assim que o organizador abrir a rodada.</p></div></div>`;
    historyContainer.innerHTML = `<div class="empty-state">A Rodada 15 será a primeira registrada neste novo formato.</div>`;
    return;
  }
  const games = data.games.filter(game => game.roundId === currentRound.id).sort((a, b) => a.id.localeCompare(b.id));
  currentContainer.innerHTML = `<div class="round-public-heading"><span class="round-status ${currentRound.status}">${roundStatusLabel(currentRound).toUpperCase()}</span><div><p class="eyebrow">${roundLabel(currentRound).toUpperCase()}</p><h2>${formatDate(currentRound.date)}</h2><p>${escapeHtml(currentRound.place || DEFAULT_VENUE_NAME)} · ${games.length} ${games.length === 1 ? "confronto" : "confrontos"}</p>${venueMapLink("Abrir CT Caxangá no GPS")}</div></div><div class="round-games-list public-round-games">${games.length ? games.map(publicGameMarkup).join("") : `<div class="saved-game-empty">Os confrontos desta rodada ainda serão definidos.</div>`}</div>`;
  currentContainer.insertAdjacentHTML("beforeend", attendanceListMarkup(currentRound.id));
  const historicalRounds = rounds.filter(round => round.id !== currentRound.id);
  historyContainer.innerHTML = historicalRounds.length ? historicalRounds.map(round => {
    const roundGames = data.games.filter(game => game.roundId === round.id).sort((a, b) => a.id.localeCompare(b.id));
    return `<article class="round-public-history-item"><div><span class="mini-label">${roundLabel(round).toUpperCase()} · ${roundStatusLabel(round).toUpperCase()}</span><strong>${formatDate(round.date)}</strong><small>${escapeHtml(round.place || DEFAULT_VENUE_NAME)} · ${roundGames.length} ${roundGames.length === 1 ? "confronto" : "confrontos"}</small>${venueMapLink("Abrir no GPS")}</div><div class="round-games-list">${roundGames.length ? roundGames.map(publicGameMarkup).join("") : `<div class="saved-game-empty">Nenhum confronto salvo.</div>`}</div></article>`;
  }).join("") : `<div class="empty-state">As próximas rodadas finalizadas aparecerão aqui.</div>`;
}
function renderSavedGames() {
  const container = document.querySelector("#saved-games-list");
  const groups = [...data.rounds].sort((a, b) => b.number - a.number).map(round => ({
    round,
    games: data.games.filter(game => game.roundId === round.id).sort((a, b) => a.id.localeCompare(b.id))
  }));
  const legacyGames = data.games.filter(game => !game.roundId).sort((a, b) => b.date.localeCompare(a.date));
  if (legacyGames.length) groups.push({ round: null, games: legacyGames });
  container.innerHTML = groups.length ? groups.map(group => {
    const { round, games } = group;
    if (!round) return `<section class="round-history legacy-history"><div class="round-history-heading"><div><span class="mini-label">REGISTROS ANTERIORES</span><strong>Confrontos sem rodada</strong><small>Partidas salvas antes do novo formato semanal.</small></div></div><div class="round-games-list">${games.map(savedGameMarkup).join("")}</div></section>`;
    return `<section class="round-history ${round.id === activeRoundId ? "active-round-history" : ""}"><div class="round-history-heading"><div><span class="mini-label">${roundLabel(round).toUpperCase()} · ${roundStatusLabel(round).toUpperCase()}</span><strong>${formatDate(round.date)}</strong><small>${escapeHtml(round.place || "Local não informado")} · ${games.length} ${games.length === 1 ? "confronto" : "confrontos"}</small></div><button class="button secondary open-round" data-open-round="${round.id}" type="button">Abrir rodada</button></div><div class="round-games-list">${games.length ? games.map(savedGameMarkup).join("") : `<div class="saved-game-empty">Nenhum confronto salvo nesta rodada.</div>`}</div></section>`;
  }).join("") : `<div class="empty-state saved-games-empty">A Rodada 15 ainda não possui confrontos salvos.</div>`;
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
  ADJUSTMENT_FIELDS.forEach(field => { document.querySelector(`#adjustment-${field}`).value = number(adjustment[field]); });
}
function renderRoundWeek() {
  const activeRound = getActiveRound();
  const summary = document.querySelector("#round-week-summary");
  const roundNumber = document.querySelector("#round-number");
  const roundDate = document.querySelector("#round-date");
  const roundPlace = document.querySelector("#round-place");
  const finishButton = document.querySelector("#finish-round-button");
  const gameContext = document.querySelector("#round-game-context");
  if (!roundsAvailable) {
    summary.innerHTML = `<span class="round-status draft">AÇÃO NECESSÁRIA</span><p>Execute a migração 007 no Supabase para ativar as rodadas semanais.</p>`;
    finishButton.disabled = true;
    gameContext.textContent = "EXECUTE A MIGRAÇÃO 007 PARA ATIVAR AS RODADAS";
    return;
  }
  if (activeRound) {
    roundNumber.value = activeRound.number;
    roundDate.value = activeRound.date;
    roundPlace.value = activeRound.place || DEFAULT_VENUE_NAME;
    const totalGames = data.games.filter(game => game.roundId === activeRound.id).length;
    summary.innerHTML = `<span class="round-status ${activeRound.status}">${roundStatusLabel(activeRound)}</span><p><strong>${roundLabel(activeRound)}</strong> · ${formatDate(activeRound.date)} · ${escapeHtml(activeRound.place || DEFAULT_VENUE_NAME)} · ${totalGames} ${totalGames === 1 ? "confronto salvo" : "confrontos salvos"}</p>`;
    finishButton.disabled = activeRound.status === "completed";
    gameContext.textContent = `${roundLabel(activeRound).toUpperCase()} · ${roundStatusLabel(activeRound).toUpperCase()}`;
  } else {
    roundNumber.value = getNextRoundNumber();
    roundDate.value = new Date().toISOString().slice(0, 10);
    roundPlace.value = DEFAULT_VENUE_NAME;
    summary.innerHTML = `<span class="round-status draft">PRÓXIMA RODADA</span><p>Preencha os dados e salve para abrir a ${roundLabel({ number: getNextRoundNumber() })}.</p>`;
    finishButton.disabled = true;
    gameContext.textContent = "SALVE A RODADA DA SEMANA PRIMEIRO";
  }
}
function syncGameFormWithRound() {
  const activeRound = getActiveRound();
  const date = document.querySelector("#game-date");
  const place = document.querySelector("#game-place");
  if (activeRound) {
    date.value = activeRound.date;
    place.value = activeRound.place || DEFAULT_VENUE_NAME;
  }
  date.disabled = Boolean(activeRound && !editingGameId);
  place.readOnly = Boolean(activeRound && !editingGameId);
}
function updateGameFormState() {
  const editing = Boolean(editingGameId);
  const activeRound = getActiveRound();
  const submit = document.querySelector("#game-submit");
  submit.innerHTML = editing ? "Salvar alterações <span>→</span>" : activeRound ? `Salvar confronto na ${roundLabel(activeRound)} <span>→</span>` : "Salve a rodada para lançar confrontos <span>→</span>";
  submit.disabled = !roundsAvailable || (!editing && !activeRound);
  document.querySelector("#new-game-button").disabled = !roundsAvailable || !activeRound;
  document.querySelector("#save-attendance-button").disabled = !roundsAvailable || !attendanceAvailable || !activeRound;
  document.querySelector("#cancel-game-edit").hidden = !editing;
  syncGameFormWithRound();
}
function renderAll() {
  renderHome();
  renderRanking();
  renderPublicRounds();
  renderPlayers(document.querySelector("#player-search")?.value || "");
  renderGameFields();
  renderSavedGames();
  renderAdminPlayers();
  renderAdjustmentForm();
  renderRoundWeek();
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
  const [playersResult, gamesResult, statsResult, adjustmentsResult, roundsResult, attendanceResult] = await Promise.all([
    supabaseClient.from("players").select("*").order("full_name"),
    supabaseClient.from("games").select("*").order("played_on", { ascending: false }),
    supabaseClient.from("player_game_stats").select("*"),
    supabaseClient.from("player_season_adjustments").select("*").eq("season", SEASON),
    supabaseClient.from("rounds").select("*").eq("season", SEASON).order("round_number"),
    supabaseClient.from("round_attendance").select("*")
  ]);
  const error = playersResult.error || gamesResult.error || statsResult.error || adjustmentsResult.error;
  if (error) { toast(`Não foi possível carregar os dados: ${error.message}`); return; }
  roundsAvailable = !roundsResult.error;
  attendanceAvailable = !attendanceResult.error;
  const gamesById = new Map((gamesResult.data || []).map(game => [game.id, game]));
  const gameStats = new Map((gamesResult.data || []).map(game => [game.id, []]));
  (statsResult.data || []).forEach(stat => gameStats.get(stat.game_id)?.push({
    playerId: stat.player_id,
    team: stat.team_number ? String(stat.team_number) : (stat.team_side === "home" ? gameTeamNumber(gamesById.get(stat.game_id), "home") : stat.team_side === "away" ? gameTeamNumber(gamesById.get(stat.game_id), "away") : ""),
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
    games: (gamesResult.data || []).map(game => ({ id: game.id, roundId: game.round_id, date: game.played_on, place: game.place, home: game.home_team, away: game.away_team, homeScore: game.home_score, awayScore: game.away_score, stats: gameStats.get(game.id) || [] })),
    rounds: (roundsResult.data || []).map(round => ({ id: round.id, number: round.round_number, date: round.played_on, place: round.place, status: round.status })),
    adjustments: Object.fromEntries((adjustmentsResult.data || []).map(adjustment => [adjustment.player_id, adjustment])),
    attendance: (attendanceResult.data || []).reduce((all, item) => {
      all[item.round_id] ||= {};
      all[item.round_id][item.player_id] = item.status;
      return all;
    }, {})
  };
  if (activeRoundId && !getRoundById(activeRoundId)) activeRoundId = null;
  if (!activeRoundId) {
    activeRoundId = [...data.rounds]
      .filter(round => round.status === "draft")
      .sort((a, b) => b.number - a.number)[0]?.id || null;
  }
  renderAll();
  if (showMessage) toast("Dados atualizados.");
}
async function saveRoundAttendance(entries = captureGameDraftEntries(), { notify = true } = {}) {
  const round = getActiveRound();
  if (!round) { if (notify) toast("Salve ou abra a Rodada da Semana antes de confirmar presenças."); return false; }
  if (!attendanceAvailable) { if (notify) toast("Execute a migração 008 no Supabase para salvar a lista de presença."); return false; }
  const { error } = await supabaseClient.from("round_attendance").upsert(
    data.players.map(player => ({
      round_id: round.id,
      player_id: player.id,
      status: entries.get(player.id)?.attendance || attendanceFor(player.id),
      updated_at: new Date().toISOString()
    })),
    { onConflict: "round_id,player_id" }
  );
  if (error) { if (notify) toast(`Não foi possível salvar a presença: ${error.message}`); return false; }
  return true;
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
  gameDraftEntries = null;
  const form = document.querySelector("#game-form");
  form.reset();
  document.querySelector("#team-home").value = "1";
  document.querySelector("#team-away").value = "2";
  const activeRound = getActiveRound();
  document.querySelector("#game-date").value = activeRound?.date || new Date().toISOString().slice(0, 10);
  document.querySelector("#game-place").value = activeRound?.place || DEFAULT_VENUE_NAME;
  renderGameFields();
  updateGameFormState();
}
function openGameEditor(gameId) {
  if (!requireAdmin()) return;
  const game = data.games.find(item => item.id === gameId);
  if (!game) return;
  if (game.roundId) activeRoundId = game.roundId;
  editingGameId = game.id;
  gameDraftEntries = null;
  document.querySelector("#game-date").value = game.date;
  document.querySelector("#game-place").value = game.place || "";
  document.querySelector("#team-home").value = gameTeamNumber(game, "home");
  document.querySelector("#team-away").value = gameTeamNumber(game, "away");
  document.querySelector("#score-home").value = game.homeScore;
  document.querySelector("#score-away").value = game.awayScore;
  renderGameFields();
  renderRoundWeek();
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
  ADJUSTMENT_FIELDS.forEach(field => { document.querySelector(`#edit-player-${field}`).value = number(stats[field]); });
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
document.querySelector("#round-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  if (!roundsAvailable) { toast("Execute a migração 007 no Supabase para ativar a Rodada da Semana."); return; }
  const activeRound = getActiveRound();
  const payload = {
    season: SEASON,
    round_number: number(document.querySelector("#round-number").value),
    played_on: document.querySelector("#round-date").value,
    place: DEFAULT_VENUE_NAME,
    status: activeRound?.status || "draft",
    updated_at: new Date().toISOString()
  };
  const request = activeRound
    ? supabaseClient.from("rounds").update(payload).eq("id", activeRound.id).select().single()
    : supabaseClient.from("rounds").upsert(payload, { onConflict: "season,round_number" }).select().single();
  const { data: savedRound, error } = await request;
  if (error) { toast(`Não foi possível salvar a rodada: ${error.message}`); return; }
  activeRoundId = savedRound.id;
  await loadRemoteData();
  resetGameForm();
  toast(`${roundLabel(savedRound)} está pronta para receber os confrontos.`);
});
document.querySelector("#finish-round-button").addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const activeRound = getActiveRound();
  if (!activeRound) { toast("Abra uma rodada antes de finalizar."); return; }
  if (!confirm(`Finalizar a ${roundLabel(activeRound)}? Você ainda poderá corrigir os confrontos depois.`)) return;
  const { error } = await supabaseClient.from("rounds").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", activeRound.id);
  if (error) { toast(`Não foi possível finalizar a rodada: ${error.message}`); return; }
  activeRoundId = null;
  await loadRemoteData();
  resetGameForm();
  toast(`${roundLabel(activeRound)} foi finalizada e entrou no histórico.`);
});
document.querySelector("#new-round-button").addEventListener("click", () => {
  if (!requireAdmin()) return;
  activeRoundId = null;
  editingGameId = null;
  renderRoundWeek();
  resetGameForm();
  document.querySelector("#round-number").focus();
});
document.querySelector("#game-player-fields").addEventListener("change", event => {
  if (!event.target.matches(".field-attendance")) return;
  gameDraftEntries = captureGameDraftEntries();
  const entry = gameDraftEntries.get(event.target.closest(".game-player-row").dataset.playerId);
  if (entry.attendance !== "present") {
    entry.team = "";
    STAT_FIELDS.forEach(field => { entry[field] = 0; });
  }
  renderGameFields();
});
document.querySelector("#save-attendance-button").addEventListener("click", async () => {
  if (!requireAdmin()) return;
  gameDraftEntries = captureGameDraftEntries();
  const saved = await saveRoundAttendance(gameDraftEntries);
  if (!saved) return;
  gameDraftEntries = null;
  await loadRemoteData();
  toast("Lista de presença salva e publicada em Rodadas.");
});
document.querySelector("#game-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  if (!attendanceAvailable) { toast("Execute a migração 008 no Supabase para usar presença e os Times 1 a 10."); return; }
  if (!roundsAvailable) { toast("Execute a migração 007 no Supabase antes de lançar confrontos por rodada."); return; }
  const activeRound = getActiveRound();
  if (!editingGameId && !activeRound) { toast("Salve a Rodada da Semana antes de adicionar confrontos."); return; }
  const rows = [...document.querySelectorAll(".game-player-row")].map(row => ({
    playerId: row.dataset.playerId,
    attendance: row.querySelector(".field-attendance").value,
    team: row.querySelector(".field-team").value,
    goals: number(row.querySelector(".field-goals").value),
    assists: number(row.querySelector(".field-assists").value),
    craque: number(row.querySelector(".field-craque").value),
    xerife: number(row.querySelector(".field-xerife").value),
    paredao: number(row.querySelector(".field-paredao").value)
  }));
  const homeTeamNumber = document.querySelector("#team-home").value;
  const awayTeamNumber = document.querySelector("#team-away").value;
  if (homeTeamNumber === awayTeamNumber) { toast("Escolha dois times diferentes para este confronto."); return; }
  const invalidTeam = rows.find(entry => entry.team && ![homeTeamNumber, awayTeamNumber].includes(entry.team));
  if (invalidTeam) { toast("Neste confronto, escolha somente um dos dois times do placar."); return; }
  const invalidRow = rows.find(entry => entry.attendance === "present" && !entry.team && STAT_FIELDS.some(field => number(entry[field]) > 0));
  if (invalidRow) { toast("Escolha o Time 1 ou o Time 2 para todo atleta com estatísticas."); return; }
  const entries = rows.filter(entry => entry.attendance === "present" && entry.team);
  if (!entries.length) { toast("Escolha o Time 1 ou o Time 2 para pelo menos um atleta."); return; }
  const gamePayload = {
    round_id: activeRound?.id || getEditingGame()?.roundId || null,
    played_on: document.querySelector("#game-date").value,
    place: DEFAULT_VENUE_NAME,
    home_team: teamLabel(homeTeamNumber),
    away_team: teamLabel(awayTeamNumber),
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
    team_side: entry.team === homeTeamNumber ? "home" : "away",
    team_number: number(entry.team),
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
  const attendanceSaved = await saveRoundAttendance(new Map(rows.map(entry => [entry.playerId, entry])), { notify: false });
  editingGameId = null;
  gameDraftEntries = null;
  await loadRemoteData();
  resetGameForm();
  toast(attendanceSaved ? "Confronto e lista de presença salvos. Os rankings foram atualizados." : "Confronto salvo, mas a presença não pôde ser atualizada.");
});
document.querySelector("#new-game-button").addEventListener("click", () => {
  if (!requireAdmin()) return;
  if (!getActiveRound()) { toast("Salve a Rodada da Semana antes de adicionar um confronto."); return; }
  resetGameForm();
  document.querySelector("#team-home").focus();
  toast("Novo confronto pronto para preenchimento.");
});
document.querySelector("#cancel-game-edit").addEventListener("click", resetGameForm);
document.querySelector("#saved-games-list").addEventListener("click", event => {
  const roundButton = event.target.closest("[data-open-round]");
  if (roundButton) {
    if (!requireAdmin()) return;
    activeRoundId = roundButton.dataset.openRound;
    editingGameId = null;
    renderAll();
    resetGameForm();
    document.querySelector("#round-form").scrollIntoView({ behavior: "smooth", block: "start" });
    toast(`${roundLabel(getActiveRound())} aberta para edição.`);
    return;
  }
  const button = event.target.closest("[data-edit-game]");
  if (button) openGameEditor(button.dataset.editGame);
});
document.querySelector("#adjustment-player").addEventListener("change", fillAdjustmentFields);
document.querySelector("#adjustment-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  const playerId = document.querySelector("#adjustment-player").value;
  if (!playerId) { toast("Cadastre um atleta antes de salvar o saldo histórico."); return; }
  const payload = Object.fromEntries(ADJUSTMENT_FIELDS.map(field => [field, number(document.querySelector(`#adjustment-${field}`).value)]));
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
  const wantedGames = number(document.querySelector("#edit-player-games").value);
  const registeredGames = getGameTotals(playerId);
  const impossibleField = STAT_FIELDS.find(field => wantedTotals[field] < registeredGames[field]);
  if (impossibleField) { toast("Esse total é menor do que o já registrado nas rodadas. Edite o confronto para reduzir esse número."); return; }
  if (wantedGames < getRecordedGameCount(playerId)) { toast("Esse total de jogos é menor do que o já registrado nas rodadas. Edite o confronto para reduzir esse número."); return; }
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
  const historicalBalance = {
    games: wantedGames - getRecordedGameCount(playerId),
    ...Object.fromEntries(STAT_FIELDS.map(field => [field, wantedTotals[field] - registeredGames[field]]))
  };
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
