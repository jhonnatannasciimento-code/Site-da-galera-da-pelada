const supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_PUBLISHABLE_KEY
);

const SEASON = 2026;
const LAST_HISTORICAL_ROUND = 14;
const DEFAULT_VENUE_NAME = "CT Caxangá";
const DEFAULT_VENUE_MAP_URL = "https://www.google.com/maps/dir/?api=1&destination=-8.033411,-34.9597396";
const STAT_FIELDS = ["goals", "assists", "craque", "xerife", "paredao"];
const MATCH_STAT_FIELDS = ["goals", "assists"];
const ADJUSTMENT_FIELDS = ["games", ...STAT_FIELDS];
const TEAM_LIMIT = 20;
const DIRECTOR_PHOTO_BUCKET = "director-photos";
const MEDIA_PHOTO_BUCKET = "media-gallery";
const MEDIA_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const HALL_PHOTO_BUCKET = "hall-of-fame";
const HALL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const DIRECTOR_CROP_SIZE = 220;
const ROUND_SHARE_WIDTH = 1080;
const ROUND_SHARE_HEIGHT = 1350;
const DEFAULT_DIRECTORS = [
  { id: "anderson", slot: 1, name: "Anderson", role: "Diretor Geral", instagramUrl: "https://www.instagram.com/anderson_r_andrade/", photo: null },
  { id: "almir", slot: 2, name: "Almir", role: "Diretor Auxiliar", instagramUrl: "https://www.instagram.com/almir.claudino/", photo: null },
  { id: "jhonnatan", slot: 3, name: "Jhonnatan", role: "Diretor de Marketing", instagramUrl: "https://www.instagram.com/jhonnatan_nascimento/", photo: null }
];
let data = { players: [], games: [], rounds: [], adjustments: {}, attendance: {}, roundAwards: [], goalEvents: [], highlightClips: [], directors: [], notices: [], mediaItems: [], hallAwards: [], auditLogs: [] };
let selectedRanking = "goals";
let selectedPositionFilter = "all";
let selectedMediaType = "all";
let selectedMediaYear = "all";
let selectedMediaCategory = "all";
let selectedHallYear = "all";
let selectedHallCategory = "all";
let selectedAuditEntity = "all";
let selectedAuditAction = "all";
let expandedPublicRoundIds = new Set();
let pendingPhotoFile = null;
let pendingEditPhotoFile = null;
let pendingDirectorPhotoFile = null;
let directorCropState = null;
let playerCropState = null;
let currentUser = null;
let isAdmin = false;
let editingGameId = null;
let activeRoundId = null;
let roundsAvailable = true;
let attendanceAvailable = true;
let rodizioAvailable = true;
let goalEventsAvailable = true;
let highlightClipsAvailable = true;
let directorsAvailable = true;
let noticesAvailable = true;
let mediaAvailable = true;
let hallOfFameAvailable = true;
let auditLogsAvailable = true;
let gameDraftEntries = null;
let gameGoalEvents = [];
let lineupSearchText = "";
let goalEventCounter = 0;
let manualScoreMode = false;
let attendanceFilter = "all";
let attendanceDirty = false;
const PUBLIC_ATTENDANCE_PLAYER_KEY = "gpfc-public-attendance-player";
let publicAttendancePlayerId = localStorage.getItem(PUBLIC_ATTENDANCE_PLAYER_KEY) || "";
let publicAttendanceChoice = "";
let publicAttendanceRoundId = "";
let sharedRoundId = "";
let sharedRoundBlob = null;
let sharedRoundObjectUrl = "";

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
function directorPhotoMarkup(director, extraClass = "") {
  const name = director?.name || "Diretor";
  return `<div class="director-avatar ${extraClass}">${director?.photo
    ? `<img src="${escapeHtml(director.photo)}" alt="Foto de ${escapeHtml(name)}" />`
    : `<img src="assets/escudo-moderno-gpfc.webp" alt="Escudo do G.P.F.C" />`}</div>`;
}
function directorList() {
  return (data.directors.length ? data.directors : DEFAULT_DIRECTORS).slice().sort((a, b) => a.slot - b.slot);
}
function clamp(value, minimum, maximum) { return Math.min(Math.max(value, minimum), maximum); }
function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${date}T12:00:00`)).replaceAll(" de ", " ");
}
function shortDate(date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(`${date}T12:00:00`)).replace(".", "");
}
function noticeTypeInfo(category) {
  return {
    important: { label: "Importante", icon: "!" },
    round: { label: "Rodada", icon: "⚽" },
    financial: { label: "Financeiro", icon: "R$" },
    general: { label: "Geral", icon: "i" }
  }[category] || { label: "Geral", icon: "i" };
}
function noticeIsVisible(notice) {
  const today = new Date().toISOString().slice(0, 10);
  return notice.status === "active" && (!notice.expiresOn || notice.expiresOn >= today);
}
function sortedNotices(notices) {
  return [...notices].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
}
function getLatestGame() { return [...data.games].sort((a, b) => b.date.localeCompare(a.date))[0]; }
function getEditingGame() { return data.games.find(game => game.id === editingGameId); }
function getActiveRound() { return data.rounds.find(round => round.id === activeRoundId); }
function getRoundById(roundId) { return data.rounds.find(round => round.id === roundId); }
function teamLabel(numberValue) { return `Time ${numberValue}`; }
function teamNumbers() { return Array.from({ length: TEAM_LIMIT }, (_, index) => String(index + 1)); }
function fillTeamSelectors(homeValue = "1", awayValue = "2") {
  const home = document.querySelector("#team-home");
  const away = document.querySelector("#team-away");
  if (!home || !away) return;
  const optionMarkup = selected => teamNumbers().map(value => `<option value="${value}"${String(value) === String(selected) ? " selected" : ""}>${teamLabel(value)}</option>`).join("");
  home.innerHTML = optionMarkup(homeValue);
  away.innerHTML = optionMarkup(awayValue);
  refreshWinnerChoices();
}
function ensureTeamSelectors() {
  const home = document.querySelector("#team-home");
  const away = document.querySelector("#team-away");
  if (!home || !away || home.options.length >= TEAM_LIMIT) return;
  fillTeamSelectors(home.value || "1", away.value || "2");
}
function refreshWinnerChoices(selected = document.querySelector("#winner-side")?.value || "") {
  const winner = document.querySelector("#winner-side");
  const home = document.querySelector("#team-home")?.value;
  const away = document.querySelector("#team-away")?.value;
  if (!winner || !home || !away) return;
  winner.innerHTML = `<option value="">Definir pelo placar</option><option value="home">${teamLabel(home)}</option><option value="away">${teamLabel(away)}</option>`;
  winner.value = ["home", "away"].includes(selected) ? selected : "";
}
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
function isAttendanceClosed(round = getActiveRound()) {
  return Boolean(round?.attendanceClosed);
}
function getAttendanceHistory(playerId) {
  return Object.values(data.attendance).reduce((history, roundStatuses) => {
    const status = roundStatuses?.[playerId];
    if (["present", "absent", "unknown"].includes(status)) history[status] += 1;
    return history;
  }, { present: 0, absent: 0, unknown: 0 });
}
function attendanceMeta(status) {
  return {
    present: { title: "Compareceu", section: "Compareceu na pelada", icon: "●" },
    unknown: { title: "Dúvida", section: "Dúvida de presença", icon: "?" },
    absent: { title: "Não compareceu", section: "Não compareceu na pelada", icon: "×" }
  }[status] || { title: "Dúvida", section: "Dúvida de presença", icon: "?" };
}
function isCompletedGame(game) { return game.status !== "draft"; }
function roundGames(roundId) { return roundId ? data.games.filter(game => game.roundId === roundId).sort((a, b) => number(a.number) - number(b.number) || a.id.localeCompare(b.id)) : []; }
function getNextGameNumber(roundId = getActiveRound()?.id) {
  return Math.max(0, ...roundGames(roundId).map(game => number(game.number))) + 1;
}
function getNextTeamNumber(roundId = getActiveRound()?.id) {
  const used = roundGames(roundId).flatMap(game => [number(gameTeamNumber(game, "home")), number(gameTeamNumber(game, "away"))]);
  return String(Math.min(TEAM_LIMIT, Math.max(0, ...used) + 1));
}
function resultLabel(game) {
  return { regular: "Placar normal", penalties: "Pênaltis", ficha: "Ficha" }[game?.resultMethod] || "Placar normal";
}
function getRoundStatLeaders(roundId, field) {
  const totals = new Map();
  roundGames(roundId).forEach(game => game.stats.forEach(entry => {
    totals.set(entry.playerId, number(totals.get(entry.playerId)) + number(entry[field]));
  }));
  const highest = Math.max(0, ...totals.values());
  if (!highest) return [];
  return [...totals.entries()].filter(([, value]) => value === highest).map(([playerId, value]) => ({ player: data.players.find(player => player.id === playerId), value })).filter(item => item.player);
}
function getRoundAwardPlayers(roundId, category) {
  return data.roundAwards.filter(item => item.roundId === roundId && item.category === category).map(item => data.players.find(player => player.id === item.playerId)).filter(Boolean);
}
function isInstagramUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "instagram.com" || url.hostname.endsWith(".instagram.com"));
  } catch {
    return false;
  }
}
function clipTypeInfo(type) {
  return {
    gol: { label: "Gol", icon: "⚽" },
    assistencia: { label: "Assistência", icon: "↗" },
    defesa: { label: "Defesa", icon: "🧤" },
    drible: { label: "Drible", icon: "✦" },
    outro: { label: "Melhor lance", icon: "★" }
  }[type] || { label: "Melhor lance", icon: "★" };
}
function isSafeHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}
function mediaCategoryInfo(category) {
  return {
    rodada: { label: "Rodada", icon: "⚽" },
    premiacao: { label: "Premiação", icon: "★" },
    confraternizacao: { label: "Confraternização", icon: "◆" },
    historia: { label: "Nossa história", icon: "GP" },
    lance: { label: "Melhor lance", icon: "▶" },
    outro: { label: "G.P.F.C", icon: "●" }
  }[category] || { label: "G.P.F.C", icon: "●" };
}
function hallCategoryInfo(category) {
  return {
    artilheiro: { label: "Artilheiro", title: "Artilheiro do ano", icon: "⚽" },
    garcom: { label: "Garçom", title: "Garçom do ano", icon: "A" },
    craque: { label: "Craque", title: "Craque do ano", icon: "★" },
    xerife: { label: "Xerife", title: "Xerife do ano", icon: "X" },
    paredao: { label: "Paredão", title: "Paredão do ano", icon: "P" }
  }[category] || { label: "Campeão", title: "Campeão do ano", icon: "★" };
}
function hallWinnerKey(award) {
  return award.playerId || String(award.winnerName || "").trim().toLocaleLowerCase("pt-BR");
}
function hallTitleCount(award) {
  const key = hallWinnerKey(award);
  return data.hallAwards.filter(item => item.status === "active" && hallWinnerKey(item) === key).length;
}
function allMediaEntries() {
  const galleryItems = data.mediaItems
    .filter(item => item.status === "active")
    .map(item => ({ ...item, origin: "gallery" }));
  const reelItems = data.highlightClips.map(clip => {
    const round = getRoundById(clip.roundId);
    const player = data.players.find(item => item.id === clip.playerId);
    const info = clipTypeInfo(clip.type);
    return {
      id: `clip-${clip.id}`,
      mediaType: "video",
      title: `${info.label} de ${displayName(player)}`,
      description: clip.caption || `Lance de destaque de ${displayName(player)} ${round ? `na ${roundLabel(round)}` : `na temporada ${SEASON}`}.`,
      year: round?.date ? number(String(round.date).slice(0, 4)) : SEASON,
      category: "lance",
      roundId: clip.roundId,
      sourceUrl: clip.instagramUrl,
      featured: false,
      status: "active",
      createdAt: clip.createdAt,
      playerIds: player ? [player.id] : [],
      origin: "highlight"
    };
  });
  return [...galleryItems, ...reelItems].sort((a, b) =>
    number(Boolean(b.featured)) - number(Boolean(a.featured)) ||
    number(b.year) - number(a.year) ||
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );
}
function roundHighlightPlayers(roundId) {
  const players = new Map();
  [
    ...getRoundStatLeaders(roundId, "goals").map(item => item.player),
    ...getRoundStatLeaders(roundId, "assists").map(item => item.player),
    ...getRoundAwardPlayers(roundId, "craque"),
    ...getRoundAwardPlayers(roundId, "xerife"),
    ...getRoundAwardPlayers(roundId, "paredao")
  ].filter(Boolean).forEach(player => players.set(player.id, player));
  return [...players.values()].sort((a, b) => displayName(a).localeCompare(displayName(b), "pt-BR"));
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
  data.games.filter(isCompletedGame).forEach(game => game.stats.forEach(entry => {
    if (entry.playerId !== playerId) return;
    STAT_FIELDS.forEach(field => { totals[field] += number(entry[field]); });
  }));
  data.roundAwards.forEach(award => {
    if (award.playerId === playerId) totals[award.category] += 1;
  });
  return totals;
}
function getRecordedGameCount(playerId) {
  return getAttendanceHistory(playerId).present;
}
function getStats(excludeRoundId = null) {
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
  data.games.filter(isCompletedGame).forEach(game => {
    if (excludeRoundId && String(game.roundId) === String(excludeRoundId)) return;
    game.stats.forEach(entry => {
    const total = totals[entry.playerId];
    if (!total) return;
    total.goals += number(entry.goals);
    total.assists += number(entry.assists);
    total.saves += number(entry.saves);
    total.tackles += number(entry.tackles);
    total.craque += number(entry.craque);
    total.xerife += number(entry.xerife);
    total.paredao += number(entry.paredao);
    });
  });
  Object.entries(data.attendance).forEach(([roundId, statuses]) => {
    if (excludeRoundId && String(roundId) === String(excludeRoundId)) return;
    Object.entries(statuses).forEach(([playerId, status]) => {
      if (status === "present" && totals[playerId]) totals[playerId].games += 1;
    });
  });
  data.roundAwards.forEach(award => {
    if (excludeRoundId && String(award.roundId) === String(excludeRoundId)) return;
    const total = totals[award.playerId];
    if (total) total[award.category] += 1;
  });
  return Object.values(totals);
}
function getAttendanceStats(excludeRoundId = null) {
  return data.players.map(player => {
    const totals = { player, present: 0, absent: 0, unknown: 0 };
    Object.entries(data.attendance).forEach(([roundId, statuses]) => {
      if (excludeRoundId && String(roundId) === String(excludeRoundId)) return;
      const status = statuses?.[player.id];
      if (["present", "absent", "unknown"].includes(status)) totals[status] += 1;
    });
    return totals;
  });
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

function homeRoundCardMarkup() {
  const draftRound = [...data.rounds].filter(round => round.status === "draft").sort((a, b) => b.number - a.number)[0];
  const completedRound = [...data.rounds].filter(round => round.status === "completed").sort((a, b) => b.number - a.number)[0];
  const round = draftRound || completedRound;
  if (!round) {
    return `<div class="home-round-card-top"><span class="home-round-kicker">PRÓXIMA PELADA</span><span class="home-round-pulse"></span></div><h2>Rodada ${getNextRoundNumber()}</h2><p class="home-round-date">Data a confirmar <span>· 17h às 19h</span></p><p class="home-round-place">CT Caxangá</p>${venueMapLink("Abrir CT Caxangá no GPS")}<button class="button secondary home-round-action" data-view-target="rodadas" type="button">Ver presença e confrontos <span>→</span></button>`;
  }
  const games = roundGames(round.id);
  if (round.status === "completed") {
    const totalGoals = games.reduce((sum, game) => sum + number(game.homeScore) + number(game.awayScore), 0);
    const results = roundResults(round.id);
    const highestWins = Math.max(0, ...results.map(item => item.wins));
    const leaders = results.filter(item => item.wins === highestWins && highestWins > 0).map(item => item.team);
    const summary = games.length ? `${games.length} ${games.length === 1 ? "confronto" : "confrontos"} · ${totalGoals} gols` : "Sem confrontos registrados";
    return `<div class="home-round-card-top finished"><span class="home-round-kicker">RODADA FINALIZADA</span><span class="round-status completed">FINALIZADA</span></div><h2>${roundLabel(round)}</h2><p class="home-round-date">${formatDate(round.date)}</p><p class="home-round-summary">${summary}</p>${leaders.length ? `<p class="home-round-leader">Mais vitórias: <strong>${escapeHtml(leaders.join(" · "))}</strong></p>` : ""}<button class="button secondary home-round-action" data-view-target="rodadas" type="button">Ver resultados da rodada <span>→</span></button>`;
  }
  const attendance = data.attendance[round.id] || {};
  const present = data.players.filter(player => attendance[player.id] === "present").length;
  const unknown = data.players.filter(player => attendance[player.id] === "unknown").length;
  return `<div class="home-round-card-top"><span class="home-round-kicker">PRÓXIMA PELADA</span><span class="home-round-pulse"></span></div><h2>${roundLabel(round)}</h2><p class="home-round-date">${formatDate(round.date)} <span>· 17h às 19h</span></p><p class="home-round-place">${escapeHtml(round.place || DEFAULT_VENUE_NAME)}</p><p class="home-round-attendance"><strong>${present}</strong> confirmados <i>·</i> <strong>${unknown}</strong> em dúvida</p>${venueMapLink("Abrir CT Caxangá no GPS")}<button class="button secondary home-round-action" data-view-target="rodadas" type="button">Ver presença e confrontos <span>→</span></button>`;
}

function renderDirectors() {
  const container = document.querySelector("#directors-grid");
  if (!container) return;
  container.innerHTML = directorList().map(director => `<a class="director-card" href="${escapeHtml(director.instagramUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir Instagram de ${escapeHtml(director.name)}"><div class="director-card-photo">${directorPhotoMarkup(director)}</div><div><span class="director-card-kicker">DIRETORIA G.P.F.C</span><h3>${escapeHtml(director.name)}</h3><p>${escapeHtml(director.role)}</p><small>Instagram <b>→</b></small></div></a>`).join("");
}
function renderHome() {
  const stats = getStats();
  const latest = getLatestGame();
  const latestRoundNumber = Math.max(LAST_HISTORICAL_ROUND, ...data.rounds.map(round => number(round.number)));
  document.querySelector("#total-games").textContent = latestRoundNumber;
  document.querySelector("#total-monthly-players").textContent = stats.filter(item => !isGoalkeeper(item.player)).length;
  document.querySelector("#total-goalkeepers").textContent = stats.filter(item => isGoalkeeper(item.player)).length;
  const goals = stats.reduce((sum, item) => sum + item.goals, 0);
  const assists = stats.reduce((sum, item) => sum + item.assists, 0);
  document.querySelector("#total-goals").textContent = goals;
  document.querySelector("#total-assists").textContent = assists;
  document.querySelector("#home-round-card").innerHTML = homeRoundCardMarkup();

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
  paredao: { title: "Paredão", kicker: "GOLEIROS DA RODADA", singular: "VEZ", plural: "VEZES" },
  presence: { title: "Presenças", kicker: "QUEM MAIS COMPARECEU", singular: "PRESENÇA", plural: "PRESENÇAS" }
};
function getLatestCompletedRound() {
  return [...data.rounds].filter(round => round.status === "completed").sort((a, b) => b.number - a.number)[0];
}
function getRankingItems(metric, stats = getStats(), excludeRoundId = null) {
  const items = metric === "presence" ? getAttendanceStats(excludeRoundId) : stats;
  return items
    .filter(item => metric === "presence" ? item.present > 0 : item[metric] > 0)
    .filter(item => metric !== "paredao" || isGoalkeeper(item.player))
    .sort((a, b) => metric === "presence"
      ? b.present - a.present || a.absent - b.absent || displayName(a.player).localeCompare(displayName(b.player))
      : b[metric] - a[metric] || b.goals - a.goals || b.assists - a.assists || displayName(a.player).localeCompare(displayName(b.player))
    );
}
function rankingMovementMarkup(playerId, currentPosition, previousPositions, referenceRound) {
  if (!referenceRound) return `<span class="ranking-movement neutral" title="A evolução aparecerá após a primeira rodada finalizada.">—</span>`;
  const previousPosition = previousPositions.get(playerId);
  if (!previousPosition) return `<span class="ranking-movement new" title="Entrou no ranking nesta rodada.">NOVO</span>`;
  const change = previousPosition - currentPosition;
  if (change > 0) return `<span class="ranking-movement up" title="Subiu ${change} ${change === 1 ? "posição" : "posições"}.">&uarr; ${change}</span>`;
  if (change < 0) return `<span class="ranking-movement down" title="Desceu ${Math.abs(change)} ${Math.abs(change) === 1 ? "posição" : "posições"}.">&darr; ${Math.abs(change)}</span>`;
  return `<span class="ranking-movement stable" title="Manteve a posição.">—</span>`;
}
function renderRanking() {
  const details = rankingDetails[selectedRanking];
  document.querySelector("#ranking-kicker").textContent = details.kicker;
  document.querySelector("#ranking-name").textContent = details.title;
  document.querySelectorAll(".ranking-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.ranking === selectedRanking));
  const referenceRound = getLatestCompletedRound();
  const previousItems = referenceRound ? getRankingItems(selectedRanking, getStats(referenceRound.id), referenceRound.id) : [];
  const previousPositions = new Map(previousItems.map((item, index) => [item.player.id, index + 1]));
  const updateLabel = document.querySelector("#ranking-update-label");
  if (updateLabel) updateLabel.textContent = referenceRound ? `MOVIMENTAÇÃO NA ${roundLabel(referenceRound).toUpperCase()}` : "AGUARDANDO RODADA FINALIZADA";
  const items = getRankingItems(selectedRanking);
  document.querySelector("#ranking-list").innerHTML = items.length ? items.map((item, index) =>
    `<article class="rank-row"><span class="rank-position">${String(index + 1).padStart(2, "0")}</span>${avatar(item.player)}<div class="rank-player"><strong>${escapeHtml(displayName(item.player))}</strong><small>#${shirtNumber(item.player)} · ${escapeHtml(item.player.position)} · ${selectedRanking === "presence" ? `${item.absent} faltas` : `${item.games} ${item.games === 1 ? "jogo" : "jogos"}`}</small></div><span class="rank-meta">${selectedRanking === "presence" ? `${item.present} confirmadas · ${item.unknown} dúvidas` : `${item.goals} gols · ${item.assists} assist.`}</span>${rankingMovementMarkup(item.player.id, index + 1, previousPositions, referenceRound)}<span class="rank-value">${selectedRanking === "presence" ? item.present : item[selectedRanking]}<small>${(selectedRanking === "presence" ? item.present : item[selectedRanking]) === 1 ? details.singular : details.plural}</small></span></article>`
  ).join("") : `<div class="empty-state">Ainda não existem dados nesta categoria.</div>`;
  renderCompleteRanking(getStats());
}
function renderCompleteRanking(stats) {
  const items = [...stats].sort((a, b) =>
    b.goals - a.goals || b.assists - a.assists || b.craque - a.craque || b.xerife - a.xerife || b.paredao - a.paredao || b.games - a.games || displayName(a.player).localeCompare(displayName(b.player))
  );
  const attendanceByPlayer = new Map(getAttendanceStats().map(item => [item.player.id, item]));
  document.querySelector("#complete-ranking-list").innerHTML = items.length ? items.map((item, index) =>
    `<tr><td class="complete-rank-position">${String(index + 1).padStart(2, "0")}</td><td><div class="complete-rank-player">${avatar(item.player)}<span><strong>${escapeHtml(displayName(item.player))}</strong><small>#${shirtNumber(item.player)} · ${escapeHtml(item.player.position)}</small></span></div></td><td>${item.games}</td><td>${attendanceByPlayer.get(item.player.id)?.present || 0}</td><td>${item.goals}</td><td>${item.assists}</td><td>${item.craque}</td><td>${item.xerife}</td><td>${item.paredao}</td></tr>`
  ).join("") : `<tr><td class="complete-ranking-empty" colspan="9">Ainda não existem atletas cadastrados.</td></tr>`;
}
function positionMatchesFilter(player, filter) {
  if (filter === "all") return true;
  const position = String(player?.position || "").toLocaleLowerCase("pt-BR");
  return {
    goalkeeper: position.includes("goleiro"),
    defender: position.includes("zagueiro") || position.includes("defensor"),
    midfielder: position.includes("meia"),
    forward: position.includes("atacante")
  }[filter] || false;
}
function seasonLeaderIds(stats, field, goalkeepersOnly = false) {
  const eligible = stats.filter(item => !goalkeepersOnly || isGoalkeeper(item.player));
  const highest = Math.max(0, ...eligible.map(item => number(item[field])));
  return new Set(highest ? eligible.filter(item => number(item[field]) === highest).map(item => item.player.id) : []);
}
function leaderSets(stats = getStats()) {
  return {
    artilheiro: seasonLeaderIds(stats, "goals"),
    garcom: seasonLeaderIds(stats, "assists"),
    xerife: seasonLeaderIds(stats, "xerife"),
    paredao: seasonLeaderIds(stats, "paredao", true)
  };
}
function leaderBadgesMarkup(playerId, leaders) {
  const badges = [
    ["artilheiro", "&#9917; Artilheiro"],
    ["garcom", "&#10148; Gar&ccedil;om"],
    ["xerife", "&#9670; Xerife"],
    ["paredao", "&#10032; Pared&atilde;o"]
  ].filter(([key]) => leaders[key]?.has(playerId));
  return badges.length ? `<div class="leader-badges">${badges.map(([key, label]) => `<span class="leader-badge ${key}">${label}</span>`).join("")}</div>` : "";
}
function closeAthleteProfileModal() {
  document.querySelector("#athlete-profile-modal").hidden = true;
}
function openAthleteProfile(playerId) {
  const stats = getStats().find(item => item.player.id === playerId);
  if (!stats) return;
  const player = stats.player;
  const attendance = getAttendanceHistory(playerId);
  const attendanceTotal = attendance.present + attendance.absent + attendance.unknown;
  const specialty = isGoalkeeper(player)
    ? [["PARED\u00c3O", stats.paredao], ["CRAQUE", stats.craque]]
    : [["CRAQUE", stats.craque], ["XERIFE", stats.xerife]];
  const mainStats = [["JOGOS", stats.games], ["GOLS", stats.goals], ["ASSIST.", stats.assists], ["PRESEN\u00c7AS", attendance.present]];
  document.querySelector("#athlete-profile-content").innerHTML = `<div class="athlete-profile-hero"><div class="athlete-profile-avatar">${avatar(player)}</div><div><p class="eyebrow">ATLETA DO G.P.F.C</p><h2 id="athlete-profile-name">${escapeHtml(displayName(player))}</h2><p>#${shirtNumber(player)} \u00b7 ${escapeHtml(player.position)}</p>${leaderBadgesMarkup(player.id, leaderSets())}</div></div><section class="athlete-profile-stats">${mainStats.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</section><section class="athlete-profile-specialty">${specialty.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</section><section class="athlete-profile-attendance"><div><span>HIST\u00d3RICO DE PRESEN\u00c7A</span><strong>${attendanceTotal ? `${attendance.present} foi` : "Ainda sem registros"}</strong></div><p>${attendanceTotal ? `${attendance.absent} faltas \u00b7 ${attendance.unknown} em d\u00favida \u00b7 ${attendanceTotal} listas salvas` : "A presen\u00e7a aparecer\u00e1 depois das pr\u00f3ximas rodadas."}</p></section>`;
  document.querySelector("#athlete-profile-modal").hidden = false;
  document.querySelector("#athlete-profile-modal .login-close").focus();
}
function renderPlayers(filter = "") {
  const text = filter.trim().toLocaleLowerCase("pt-BR");
  const allPlayers = getStats();
  const goalkeepers = allPlayers.filter(item => isGoalkeeper(item.player)).length;
  document.querySelector("#roster-summary").textContent = `${allPlayers.length} ${allPlayers.length === 1 ? "atleta" : "atletas"} no elenco, incluindo ${goalkeepers} ${goalkeepers === 1 ? "goleiro" : "goleiros"} na temporada 2026.`;
  document.querySelectorAll("[data-position-filter]").forEach(button => button.classList.toggle("active", button.dataset.positionFilter === selectedPositionFilter));
  const players = allPlayers.filter(item => positionMatchesFilter(item.player, selectedPositionFilter) && (!text || `${item.player.name} ${item.player.shirtNumber}`.toLocaleLowerCase("pt-BR").includes(text))).sort((a, b) => displayName(a.player).localeCompare(displayName(b.player)));
  const leaders = leaderSets(allPlayers);
  document.querySelector("#roster-count").textContent = `${players.length} ${players.length === 1 ? "ATLETA" : "ATLETAS"}`;
  document.querySelector("#athletes-grid").innerHTML = players.map(item => {
    const history = getAttendanceHistory(item.player.id);
    const historyTotal = history.present + history.absent + history.unknown;
    const attendanceSummary = historyTotal
      ? `Presença: ${history.present} foi · ${history.absent} faltas · ${history.unknown} dúvidas`
      : "Histórico de presença será exibido nas próximas rodadas.";
    return `<button class="athlete-card athlete-card-button" data-open-athlete="${item.player.id}" type="button" aria-label="Abrir perfil de ${escapeHtml(displayName(item.player))}"><div class="card-image">${avatar(item.player)}</div><div class="card-top"><span>GP • 2026</span><span class="athlete-number">#${shirtNumber(item.player)}</span></div>${leaderBadgesMarkup(item.player.id, leaders)}<div class="card-bottom"><h2>${escapeHtml(displayName(item.player))}</h2><p>${escapeHtml(item.player.position)}</p><div class="card-games"><strong>${item.games} ${item.games === 1 ? "jogo disputado" : "jogos disputados"}</strong><small>${attendanceSummary}</small></div>${cardStatsMarkup(item)}</div></button>`;
  }).join("") || `<div class="empty-state">Nenhum atleta cadastrado ainda.</div>`;
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
function teamOptions(selected = "") {
  const choices = [...new Set([document.querySelector("#team-home")?.value, document.querySelector("#team-away")?.value].filter(Boolean))];
  return `<option value="">Fora do jogo</option>${choices.map(value => `<option value="${value}"${String(selected) === String(value) ? " selected" : ""}>${teamLabel(value)}</option>`).join("")}`;
}
function renderGamePlayerRow(player, entry) {
  const present = entry.attendance === "present";
  const disabled = present ? "" : " disabled";
  return `<div class="game-player-row rodizio-player-row" data-player-id="${player.id}" data-attendance="${entry.attendance}"><div>${avatar(player)}<span><strong title="${escapeHtml(displayName(player))}">${escapeHtml(displayName(player))}</strong><small>#${shirtNumber(player)} · ${escapeHtml(player.position)}</small></span></div><div class="attendance-control"><span class="attendance-indicator ${entry.attendance}" aria-hidden="true">${attendanceMeta(entry.attendance).icon}</span><select class="field-attendance" aria-label="Presença de ${escapeHtml(player.name)}"><option value="present"${entry.attendance === "present" ? " selected" : ""}>Compareceu</option><option value="unknown"${entry.attendance === "unknown" ? " selected" : ""}>Dúvida</option><option value="absent"${entry.attendance === "absent" ? " selected" : ""}>Não compareceu</option></select></div><select class="field-team" aria-label="Time de ${escapeHtml(player.name)}"${disabled}>${teamOptions(entry.team)}</select><input class="field-goals" type="number" min="0" value="${number(entry.goals)}" title="Gols" aria-label="Gols de ${escapeHtml(player.name)}"${disabled} /><input class="field-assists" type="number" min="0" value="${number(entry.assists)}" title="Assistências" aria-label="Assistências de ${escapeHtml(player.name)}"${disabled} /></div>`;
}
function renderLineupSummary(rows = []) {
  const container = document.querySelector("#lineup-summary");
  if (!container) return;
  const teams = [document.querySelector("#team-home")?.value, document.querySelector("#team-away")?.value].filter(Boolean);
  const cards = teams.map(teamNumber => {
    const selected = rows.filter(item => String(item.entry.team) === String(teamNumber));
    const goalkeepers = selected.filter(item => isGoalkeeper(item.player));
    const linePlayers = selected.filter(item => !isGoalkeeper(item.player));
    const invalid = linePlayers.length > 5 || goalkeepers.length > 1;
    return `<article class="lineup-card ${invalid ? "invalid" : ""}"><div><span>${teamLabel(teamNumber).toUpperCase()}</span><strong>${linePlayers.length}/5 linha · ${goalkeepers.length}/1 goleiro</strong></div><ul>${selected.length ? selected.map(item => `<li>${escapeHtml(displayName(item.player))}${isGoalkeeper(item.player) ? " <small>GOL</small>" : ""}</li>`).join("") : "<li class=\"lineup-empty\">Escolha os atletas abaixo.</li>"}</ul></article>`;
  }).join("");
  const latest = roundGames(getActiveRound()?.id).slice(-1)[0];
  const copyAction = !editingGameId && latest?.winnerSide ? `<button id="copy-winner-button" class="button secondary" type="button">Copiar ${teamLabel(gameTeamNumber(latest, latest.winnerSide))} vencedor</button>` : "";
  container.innerHTML = `<div class="lineup-summary-heading"><div><strong>Escalações do confronto</strong><small>Máximo de 5 atletas de linha e 1 goleiro por time.</small></div>${copyAction}</div><div class="lineup-cards">${cards}</div>`;
}
function renderGameFields() {
  const container = document.querySelector("#game-player-fields");
  const existing = new Map((getEditingGame()?.stats || []).map(entry => [entry.playerId, entry]));
  const rows = data.players.map(player => {
    const savedEntry = existing.get(player.id) || {};
    const draftEntry = gameDraftEntries?.get(player.id) || {};
    return { player, entry: { ...savedEntry, ...draftEntry, attendance: draftEntry.attendance || attendanceFor(player.id, savedEntry) } };
  });
  const header = `<div class="game-fields-header rodizio-fields-header"><span>Atleta</span><span>Presença</span><span>Escalação</span><span>Gols</span><span>Assistências</span></div>`;
  const sections = ["present", "unknown", "absent"].map(status => {
    const items = rows.filter(item => item.entry.attendance === status);
    if (!items.length) return "";
    const meta = attendanceMeta(status);
    return `<section class="attendance-section ${status}"><div class="attendance-section-heading"><span class="attendance-indicator ${status}" aria-hidden="true">${meta.icon}</span><strong>${meta.section}</strong><small>${items.length} ${items.length === 1 ? "atleta" : "atletas"}</small></div>${items.map(item => renderGamePlayerRow(item.player, item.entry)).join("")}</section>`;
  }).join("");
  container.innerHTML = data.players.length ? header + sections : `<div class="empty-state">Cadastre pelo menos um atleta antes de lançar uma rodada.</div>`;
  renderLineupSummary(rows);
}
function captureGameDraftEntries() {
  const draft = new Map();
  document.querySelectorAll(".game-player-row").forEach(row => {
    draft.set(row.dataset.playerId, {
      team: row.querySelector(".field-team").value,
      attendance: row.querySelector(".field-attendance").value,
      goals: number(row.querySelector(".field-goals").value),
      assists: number(row.querySelector(".field-assists").value)
    });
  });
  return draft;
}
function getGameDraftRows() {
  const existing = new Map((getEditingGame()?.stats || []).map(entry => [entry.playerId, entry]));
  return data.players.map(player => {
    const savedEntry = existing.get(player.id) || {};
    const draftEntry = gameDraftEntries?.get(player.id) || {};
    const attendance = draftEntry.attendance || attendanceFor(player.id, savedEntry);
    return { player, entry: { ...savedEntry, ...draftEntry, attendance, team: draftEntry.team ?? savedEntry.team ?? "" } };
  });
}
function goalEventTotals() {
  const totals = new Map();
  gameGoalEvents.forEach(event => {
    if (!event.scorerId || event.ownGoal) return;
    totals.set(event.scorerId, { goals: number(totals.get(event.scorerId)?.goals) + 1, assists: number(totals.get(event.scorerId)?.assists) });
    if (event.assisterId) totals.set(event.assisterId, { goals: number(totals.get(event.assisterId)?.goals), assists: number(totals.get(event.assisterId)?.assists) + 1 });
  });
  return totals;
}
function syncScoreFromGoalEvents() {
  const home = document.querySelector("#team-home")?.value;
  const away = document.querySelector("#team-away")?.value;
  if (!home || !away) return;
  document.querySelector("#score-home").value = gameGoalEvents.filter(event => String(event.team) === String(home) && event.scorerId).length;
  document.querySelector("#score-away").value = gameGoalEvents.filter(event => String(event.team) === String(away) && event.scorerId).length;
}
function updateScoreEditState() {
  const homeScore = document.querySelector("#score-home");
  const awayScore = document.querySelector("#score-away");
  const button = document.querySelector("#toggle-score-edit");
  const status = document.querySelector("#score-edit-status");
  if (!homeScore || !awayScore || !button || !status) return;
  homeScore.readOnly = !manualScoreMode;
  awayScore.readOnly = !manualScoreMode;
  button.textContent = manualScoreMode ? "Usar placar automático" : "Editar placar";
  status.textContent = manualScoreMode ? "Modo manual: este placar não altera artilharia nem assistências." : "Placar automático pelos gols registrados.";
  button.classList.toggle("active", manualScoreMode);
}
function syncScoreFromGoalEvents() {
  if (manualScoreMode) { updateScoreEditState(); return; }
  const home = document.querySelector("#team-home")?.value;
  const away = document.querySelector("#team-away")?.value;
  if (!home || !away) return;
  document.querySelector("#score-home").value = gameGoalEvents.filter(event => String(event.team) === String(home) && event.scorerId).length;
  document.querySelector("#score-away").value = gameGoalEvents.filter(event => String(event.team) === String(away) && event.scorerId).length;
  updateScoreEditState();
}
function presentLineupPlayers(team, rows = getGameDraftRows()) {
  return rows.filter(item => item.entry.attendance === "present" && String(item.entry.team) === String(team));
}
function validateLineupAssignment(player, team, rows = getGameDraftRows()) {
  const members = presentLineupPlayers(team, rows).filter(item => item.player.id !== player.id);
  const sameRole = members.filter(item => isGoalkeeper(item.player) === isGoalkeeper(player));
  return isGoalkeeper(player) ? sameRole.length < 1 : sameRole.length < 5;
}
function captureGameDraftEntries() {
  const previous = gameDraftEntries || new Map();
  const draft = new Map(getGameDraftRows().map(({ player, entry }) => [player.id, { ...entry }]));
  document.querySelectorAll(".game-player-row").forEach(row => {
    const playerId = row.dataset.playerId;
    const entry = draft.get(playerId) || previous.get(playerId) || {};
    entry.attendance = row.querySelector(".field-attendance")?.value || entry.attendance || "unknown";
    if (entry.attendance !== "present") entry.team = "";
    draft.set(playerId, entry);
  });
  return draft;
}
function renderGamePlayerRow(player, entry) {
  const locked = isAttendanceClosed();
  const quickButton = (status, icon, label) => `<button class="attendance-choice ${status} ${entry.attendance === status ? "active" : ""}" data-attendance-status="${status}" type="button" aria-label="${label} para ${escapeHtml(player.name)}"${locked ? " disabled" : ""}>${icon}<span>${label}</span></button>`;
  return `<div class="game-player-row presence-player-row" data-player-id="${player.id}" data-attendance="${entry.attendance}"><div>${avatar(player)}<span><strong title="${escapeHtml(displayName(player))}">${escapeHtml(displayName(player))}</strong><small>#${shirtNumber(player)} · ${escapeHtml(player.position)}</small></span></div><input class="field-attendance" type="hidden" value="${entry.attendance}" /><div class="attendance-control attendance-buttons">${quickButton("present", "●", "Foi")}${quickButton("absent", "×", "Faltou")}${quickButton("unknown", "?", "Dúvida")}</div></div>`;
}
function renderLineupSummary(rows = getGameDraftRows()) {
  const container = document.querySelector("#lineup-summary");
  if (!container) return;
  const teams = [document.querySelector("#team-home")?.value, document.querySelector("#team-away")?.value].filter(Boolean);
  const latest = roundGames(getActiveRound()?.id).filter(isCompletedGame).slice(-1)[0];
  const winnerTeam = !editingGameId && latest?.winnerSide ? gameTeamNumber(latest, latest.winnerSide) : "";
  const cards = teams.map(teamNumber => {
    const selected = presentLineupPlayers(teamNumber, rows);
    const goalkeepers = selected.filter(item => isGoalkeeper(item.player));
    const linePlayers = selected.filter(item => !isGoalkeeper(item.player));
    const invalid = linePlayers.length > 5 || goalkeepers.length > 1;
    const carriedWinner = String(teamNumber) === String(winnerTeam);
    return `<article class="lineup-card ${invalid ? "invalid" : ""} ${carriedWinner ? "carried-winner" : ""}"><div><span>${carriedWinner ? "● TIME QUE PERMANECEU" : teamLabel(teamNumber).toUpperCase()}</span><strong>${teamLabel(teamNumber)} · ${linePlayers.length}/5 linha · ${goalkeepers.length}/1 goleiro</strong></div><ul>${selected.length ? selected.map(item => `<li>${escapeHtml(displayName(item.player))}${isGoalkeeper(item.player) ? " <small>GOL</small>" : ""}<button type="button" class="remove-lineup-player" data-remove-player="${item.player.id}" aria-label="Remover ${escapeHtml(displayName(item.player))}">×</button></li>`).join("") : "<li class=\"lineup-empty\">Escolha os atletas abaixo.</li>"}</ul></article>`;
  }).join("");
  const copyAction = !editingGameId && latest?.winnerSide ? `<button id="copy-winner-button" class="button secondary" type="button">Levar ${teamLabel(gameTeamNumber(latest, latest.winnerSide))} vencedor</button>` : "";
  container.innerHTML = `<div class="lineup-summary-heading"><div><strong>Times do confronto</strong><small>Até 5 atletas de linha e 1 goleiro por time.</small></div>${copyAction}</div><div class="lineup-cards">${cards}</div>`;
}
function renderLineupBuilder(rows = getGameDraftRows()) {
  const container = document.querySelector("#lineup-builder");
  if (!container) return;
  const teams = [document.querySelector("#team-home")?.value, document.querySelector("#team-away")?.value].filter(Boolean);
  const present = rows.filter(item => item.entry.attendance === "present");
  const term = lineupSearchText.trim().toLocaleLowerCase("pt-BR");
  const visible = present.filter(item => !term || `${displayName(item.player)} ${shirtNumber(item.player)}`.toLocaleLowerCase("pt-BR").includes(term));
  const picker = visible.length ? visible.map(({ player, entry }) => `<article class="lineup-picker-player ${entry.team ? "assigned" : ""}">${avatar(player)}<div><strong>${escapeHtml(displayName(player))}</strong><small>#${shirtNumber(player)} · ${escapeHtml(player.position)}${entry.team ? ` · ${teamLabel(entry.team)}` : ""}</small></div><div class="lineup-player-actions">${teams.map(team => `<button type="button" data-assign-player="${player.id}" data-assign-team="${team}"${String(entry.team) === String(team) ? " disabled" : ""}>+ ${teamLabel(team)}</button>`).join("")}</div></article>`).join("") : `<p class="lineup-builder-empty">${present.length ? "Nenhum atleta encontrado." : "Confirme quem compareceu para montar os times."}</p>`;
  container.innerHTML = `<div class="lineup-builder-heading"><div><p class="eyebrow">MONTAR CONFRONTO</p><h3>Atletas que compareceram</h3><small>Pesquise ou clique no time para escalar. Um atleta pode voltar em outro jogo da rodada.</small></div><label class="lineup-search">⌕<input id="lineup-player-search" value="${escapeHtml(lineupSearchText)}" placeholder="Buscar atleta ou camisa" /></label></div><div class="lineup-picker-list">${picker}</div>`;
}
function renderGoalEvents(rows = getGameDraftRows()) {
  const container = document.querySelector("#goal-events");
  if (!container) return;
  const teams = [document.querySelector("#team-home")?.value, document.querySelector("#team-away")?.value].filter(Boolean);
  const optionPlayers = (team, selected, blank, omitId = "") => `${blank ? `<option value="">${blank}</option>` : ""}${presentLineupPlayers(team, rows).filter(item => item.player.id !== omitId).map(item => `<option value="${item.player.id}"${item.player.id === selected ? " selected" : ""}>${escapeHtml(displayName(item.player))}</option>`).join("")}`;
  const opposingTeam = team => teams.find(item => String(item) !== String(team)) || "";
  const events = gameGoalEvents.map((event, index) => {
    const scorerTeam = event.ownGoal ? opposingTeam(event.team) : event.team;
    const scorerLabel = event.ownGoal ? "Quem fez contra?" : "Quem fez o gol?";
    return `<div class="goal-event-row ${event.ownGoal ? "own-goal" : ""}" data-goal-event-id="${event.id}"><span class="goal-event-number">${index + 1}</span><select class="goal-team" aria-label="Time que recebeu o gol">${teams.map(team => `<option value="${team}"${String(event.team) === String(team) ? " selected" : ""}>${teamLabel(team)}</option>`).join("")}</select><select class="goal-scorer" aria-label="${scorerLabel}">${optionPlayers(scorerTeam, event.scorerId, scorerLabel)}</select><select class="goal-assister" aria-label="Quem deu a assistência"${event.ownGoal ? " disabled" : ""}>${event.ownGoal ? `<option value="">Gol contra não tem assistência</option>` : optionPlayers(event.team, event.assisterId, "Sem assistência", event.scorerId)}</select><label class="goal-own-goal-toggle"><input class="goal-own-goal" type="checkbox"${event.ownGoal ? " checked" : ""} /> Contra</label><button class="remove-goal-event" type="button" aria-label="Remover gol">×</button></div>`;
  }).join("");
  const canAddGoal = teams.length === 2 && teams.some(team => presentLineupPlayers(team, rows).length);
  container.innerHTML = `<div class="goal-events-heading"><div><p class="eyebrow">GOLS DO CONFRONTO</p><h3>Artilharia e assistências</h3><small>Registre cada gol. O placar e as estatísticas serão calculados automaticamente.</small></div><button id="add-goal-event" class="button secondary" type="button"${canAddGoal ? "" : " disabled"}>+ Adicionar gol</button></div><div class="goal-events-list">${events || `<p class="goal-events-empty">Ainda não há gols neste confronto.</p>`}</div>`;
  syncScoreFromGoalEvents();
}
function renderGameFields() {
  const container = document.querySelector("#game-player-fields");
  const rows = getGameDraftRows();
  const counts = Object.fromEntries(["present", "unknown", "absent"].map(status => [status, rows.filter(item => item.entry.attendance === status).length]));
  const header = `<div class="game-fields-header presence-fields-header"><span>Atleta</span><span>Presença</span></div>`;
  const filterButton = (filter, label, value) => `<button class="attendance-filter ${attendanceFilter === filter ? "active" : ""}" type="button" data-attendance-filter="${filter}">${label} <b>${value}</b></button>`;
  const toolbar = `<div class="attendance-toolbar"><div>${filterButton("all", "Todos", rows.length)}${filterButton("present", "Compareceram", counts.present)}${filterButton("absent", "Faltaram", counts.absent)}${filterButton("unknown", "Dúvida", counts.unknown)}</div><small>Toque em uma opção para atualizar cada atleta.</small></div>`;
  const sections = ["present", "unknown", "absent"].filter(status => attendanceFilter === "all" || attendanceFilter === status).map(status => {
    const items = rows.filter(item => item.entry.attendance === status);
    if (!items.length) return "";
    const meta = attendanceMeta(status);
    return `<section class="attendance-section ${status}"><div class="attendance-section-heading"><span class="attendance-indicator ${status}" aria-hidden="true">${meta.icon}</span><strong>${meta.section}</strong><small>${items.length} ${items.length === 1 ? "atleta" : "atletas"}</small></div>${items.map(item => renderGamePlayerRow(item.player, item.entry)).join("")}</section>`;
  }).join("");
  container.innerHTML = data.players.length ? toolbar + header + sections : `<div class="empty-state">Cadastre pelo menos um atleta antes de lançar uma rodada.</div>`;
  renderLineupBuilder(rows);
  renderLineupSummary(rows);
  renderGoalEvents(rows);
  updateAttendanceControls();
}
function updateAttendanceControls() {
  const round = getActiveRound();
  const closed = isAttendanceClosed(round);
  const status = document.querySelector("#attendance-save-status");
  const closeButton = document.querySelector("#close-attendance-button");
  const markAllButton = document.querySelector("#mark-all-present");
  const copyButton = document.querySelector("#copy-last-attendance");
  if (status) {
    status.className = "attendance-save-status";
    if (closed) {
      status.textContent = "Lista de presença fechada.";
      status.classList.add("closed");
    } else if (attendanceDirty) {
      status.textContent = "Alterações ainda não salvas.";
      status.classList.add("dirty");
    } else if (round) {
      status.textContent = "Lista de presença salva.";
      status.classList.add("saved");
    } else {
      status.textContent = "Preencha e salve a Rodada da Semana para publicar a presença.";
    }
  }
  if (closeButton) {
    closeButton.hidden = !round;
    closeButton.textContent = closed ? "Reabrir lista" : "Fechar e salvar lista";
    closeButton.disabled = !roundsAvailable || !attendanceAvailable;
  }
  [markAllButton, copyButton].forEach(button => {
    if (button) button.disabled = closed;
  });
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
function highlightGroupMarkup(title, kicker, players, valueField = null) {
  const visible = players.filter(Boolean);
  return `<article class="round-highlight-group"><span>${kicker}</span><strong>${title}</strong>${visible.length ? `<div class="round-highlight-players">${visible.map(item => {
    const player = item.player || item;
    const value = valueField && item.value ? `<small>${item.value} ${valueField}</small>` : "";
    return `<div>${avatar(player)}<p>${escapeHtml(displayName(player))}${value}</p></div>`;
  }).join("")}</div>` : `<p class="round-highlight-empty">Aguardando definição</p>`}</article>`;
}
function roundHighlightsMarkup(roundId, compact = false, showTitle = true) {
  const goals = getRoundStatLeaders(roundId, "goals");
  const assists = getRoundStatLeaders(roundId, "assists");
  const craque = getRoundAwardPlayers(roundId, "craque");
  const xerife = getRoundAwardPlayers(roundId, "xerife");
  const paredao = getRoundAwardPlayers(roundId, "paredao");
  const title = showTitle ? `<div class="round-highlights-title"><p class="eyebrow">DESTAQUES DA RODADA</p><h3>Quem se destacou</h3></div>` : "";
  return `<section class="round-highlights ${compact ? "compact" : ""}">${title}<div class="round-highlights-grid">${highlightGroupMarkup("Artilheiro", "GOLS", goals, "gols")}${highlightGroupMarkup("Garçom", "ASSISTÊNCIAS", assists, "assist.")}${highlightGroupMarkup("Craque", "ESCOLHA DA RODADA", craque)}${highlightGroupMarkup("Xerife", "DEFESA", xerife)}${highlightGroupMarkup("Paredão", "GOLEIROS", paredao)}</div></section>`;
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
function roundResults(roundId) {
  const totals = new Map();
  const get = team => {
    if (!totals.has(team)) totals.set(team, { team, wins: 0, losses: 0, draws: 0, goalsFor: 0, goalsAgainst: 0 });
    return totals.get(team);
  };
  roundGames(roundId).filter(isCompletedGame).forEach(game => {
    const home = get(game.home);
    const away = get(game.away);
    home.goalsFor += number(game.homeScore);
    home.goalsAgainst += number(game.awayScore);
    away.goalsFor += number(game.awayScore);
    away.goalsAgainst += number(game.homeScore);
    const winner = game.winnerSide || (number(game.homeScore) > number(game.awayScore) ? "home" : number(game.awayScore) > number(game.homeScore) ? "away" : "");
    if (winner === "home") { home.wins += 1; away.losses += 1; }
    else if (winner === "away") { away.wins += 1; home.losses += 1; }
    else { home.draws += 1; away.draws += 1; }
  });
  return [...totals.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team));
}
function shareRoundFilename(round) {
  return `gpfc-rodada-${round.number}-${String(round.date || SEASON)}.png`;
}
function loadCanvasImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}
function canvasRoundRect(context, x, y, width, height, radius = 24) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}
function canvasFitText(context, value, maxWidth) {
  const text = String(value || "");
  if (context.measureText(text).width <= maxWidth) return text;
  let fitted = text;
  while (fitted.length && context.measureText(`${fitted}…`).width > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted.trim()}…`;
}
function shareHighlightNames(items) {
  const names = items.filter(Boolean).map(item => displayName(item.player || item));
  return names.length ? names.join(" · ") : "Aguardando definição";
}
async function createRoundShareImage(roundId) {
  const round = getRoundById(roundId);
  if (!round) throw new Error("Rodada não encontrada.");
  const games = roundGames(round.id).filter(isCompletedGame);
  const canvas = document.createElement("canvas");
  canvas.width = ROUND_SHARE_WIDTH;
  canvas.height = ROUND_SHARE_HEIGHT;
  const context = canvas.getContext("2d");

  const background = context.createLinearGradient(0, 0, ROUND_SHARE_WIDTH, ROUND_SHARE_HEIGHT);
  background.addColorStop(0, "#020713");
  background.addColorStop(0.55, "#061a3a");
  background.addColorStop(1, "#082f67");
  context.fillStyle = background;
  context.fillRect(0, 0, ROUND_SHARE_WIDTH, ROUND_SHARE_HEIGHT);

  const glow = context.createRadialGradient(870, 230, 20, 870, 230, 520);
  glow.addColorStop(0, "rgba(36, 184, 255, .42)");
  glow.addColorStop(1, "rgba(36, 184, 255, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, ROUND_SHARE_WIDTH, 760);

  try {
    const shield = await loadCanvasImage("assets/escudo-moderno-gpfc.webp");
    context.save();
    context.globalAlpha = 0.12;
    context.drawImage(shield, 535, -55, 640, 640);
    context.restore();
    context.drawImage(shield, 66, 54, 116, 116);
  } catch (error) {
    console.warn("Não foi possível adicionar o escudo à arte.", error);
  }

  context.fillStyle = "#f4f8ff";
  context.font = "800 38px 'Barlow Condensed', sans-serif";
  context.fillText("G.P.F.C", 210, 94);
  context.fillStyle = "#55d8ff";
  context.font = "700 19px 'DM Sans', sans-serif";
  context.fillText("GALERA DA PELADA · DESDE 2016", 210, 130);

  context.textAlign = "right";
  context.fillStyle = "#75dcff";
  context.font = "700 22px 'DM Sans', sans-serif";
  context.fillText(`TEMPORADA ${SEASON}`, 1010, 83);
  context.fillStyle = "#ffffff";
  context.font = "800 72px 'Barlow Condensed', sans-serif";
  context.fillText(`RODADA ${round.number}`, 1010, 145);
  context.textAlign = "left";

  context.strokeStyle = "rgba(83, 209, 255, .48)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(66, 194);
  context.lineTo(1014, 194);
  context.stroke();

  context.fillStyle = "#c4d4e9";
  context.font = "600 23px 'DM Sans', sans-serif";
  context.fillText(`${formatDate(round.date)}  ·  ${round.place || DEFAULT_VENUE_NAME}`, 66, 232);
  context.fillStyle = "#4fd7ff";
  context.font = "800 25px 'Barlow Condensed', sans-serif";
  context.fillText("PLACARES DA RODADA", 66, 288);

  const visibleGames = games.slice(0, 10);
  const gameStartY = 315;
  const gameRowHeight = 53;
  visibleGames.forEach((game, index) => {
    const y = gameStartY + index * gameRowHeight;
    context.fillStyle = index % 2 ? "rgba(4, 31, 67, .9)" : "rgba(7, 43, 88, .82)";
    canvasRoundRect(context, 66, y, 948, 43, 9);
    context.fill();
    context.fillStyle = "#52d8ff";
    context.font = "700 16px 'DM Sans', sans-serif";
    context.fillText(String(game.number || index + 1).padStart(2, "0"), 83, y + 28);
    context.fillStyle = "#edf6ff";
    context.font = "700 22px 'DM Sans', sans-serif";
    context.textAlign = "right";
    context.fillText(canvasFitText(context, game.home, 300), 454, y + 29);
    context.textAlign = "center";
    context.fillStyle = "#5edcff";
    context.font = "800 28px 'Barlow Condensed', sans-serif";
    context.fillText(`${number(game.homeScore)}  ×  ${number(game.awayScore)}`, 540, y + 30);
    context.textAlign = "left";
    context.fillStyle = "#edf6ff";
    context.font = "700 22px 'DM Sans', sans-serif";
    context.fillText(canvasFitText(context, game.away, 300), 626, y + 29);
    context.fillStyle = "#8ba4c5";
    context.font = "600 14px 'DM Sans', sans-serif";
    context.textAlign = "right";
    context.fillText(resultLabel(game), 995, y + 27);
    context.textAlign = "left";
  });
  if (!visibleGames.length) {
    context.fillStyle = "#91a9c8";
    context.font = "600 24px 'DM Sans', sans-serif";
    context.fillText("Nenhum confronto finalizado nesta rodada.", 66, 350);
  } else if (games.length > visibleGames.length) {
    context.fillStyle = "#91a9c8";
    context.font = "600 17px 'DM Sans', sans-serif";
    context.fillText(`+ ${games.length - visibleGames.length} confrontos no site`, 66, gameStartY + visibleGames.length * gameRowHeight + 4);
  }

  const results = roundResults(round.id);
  const highestWins = Math.max(0, ...results.map(item => item.wins));
  const leaders = results.filter(item => item.wins === highestWins && highestWins > 0);
  const resultBottom = visibleGames.length ? gameStartY + visibleGames.length * gameRowHeight : 380;
  const leaderY = Math.min(875, resultBottom + 28);
  context.fillStyle = "rgba(24, 143, 229, .2)";
  canvasRoundRect(context, 66, leaderY, 948, 82, 14);
  context.fill();
  context.fillStyle = "#77ddff";
  context.font = "700 17px 'DM Sans', sans-serif";
  context.fillText("TIME COM MAIS VITÓRIAS", 88, leaderY + 29);
  context.fillStyle = "#ffffff";
  context.font = "800 31px 'Barlow Condensed', sans-serif";
  context.fillText(canvasFitText(context, leaders.length ? leaders.map(item => item.team).join(" · ") : "Aguardando resultados", 560), 88, leaderY + 62);
  context.textAlign = "right";
  context.fillStyle = "#55d8ff";
  context.font = "800 30px 'Barlow Condensed', sans-serif";
  context.fillText(leaders.length ? `${highestWins} ${highestWins === 1 ? "VITÓRIA" : "VITÓRIAS"}` : "—", 990, leaderY + 52);
  context.textAlign = "left";

  const highlights = [
    ["ARTILHEIRO", shareHighlightNames(getRoundStatLeaders(round.id, "goals"))],
    ["GARÇOM", shareHighlightNames(getRoundStatLeaders(round.id, "assists"))],
    ["CRAQUE", shareHighlightNames(getRoundAwardPlayers(round.id, "craque"))],
    ["XERIFE", shareHighlightNames(getRoundAwardPlayers(round.id, "xerife"))],
    ["PAREDÃO", shareHighlightNames(getRoundAwardPlayers(round.id, "paredao"))]
  ];
  const highlightStartY = leaderY + 126;
  context.fillStyle = "#4fd7ff";
  context.font = "800 25px 'Barlow Condensed', sans-serif";
  context.fillText("DESTAQUES DA SEMANA", 66, highlightStartY);
  highlights.forEach(([label, names], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 66 + column * 482;
    const y = highlightStartY + 25 + row * 82;
    const width = index === highlights.length - 1 ? 948 : 466;
    context.fillStyle = "rgba(2, 18, 43, .76)";
    canvasRoundRect(context, x, y, width, 68, 12);
    context.fill();
    context.fillStyle = "#6bdcff";
    context.font = "700 15px 'DM Sans', sans-serif";
    context.fillText(label, x + 18, y + 24);
    context.fillStyle = names === "Aguardando definição" ? "#8095b2" : "#f5f9ff";
    context.font = "700 20px 'DM Sans', sans-serif";
    context.fillText(canvasFitText(context, names, width - 36), x + 18, y + 51);
  });

  context.fillStyle = "#5fdcff";
  context.font = "700 18px 'DM Sans', sans-serif";
  context.fillText("@galeradapelada2016", 66, 1310);
  context.textAlign = "right";
  context.fillStyle = "#91a9c8";
  context.fillText("FUTEBOL · AMIZADE · RESENHA", 1014, 1310);
  context.textAlign = "left";

  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Não foi possível gerar a imagem.")), "image/png", 0.96));
}
function closeShareRoundModal() {
  document.querySelector("#share-round-modal").hidden = true;
  if (sharedRoundObjectUrl) URL.revokeObjectURL(sharedRoundObjectUrl);
  sharedRoundObjectUrl = "";
  sharedRoundBlob = null;
  sharedRoundId = "";
}
async function openShareRoundModal(roundId) {
  const round = getRoundById(roundId);
  if (!round) return;
  const modal = document.querySelector("#share-round-modal");
  const preview = document.querySelector("#share-round-preview");
  const downloadButton = document.querySelector("#download-round-image");
  const shareButton = document.querySelector("#share-round-image");
  sharedRoundId = roundId;
  sharedRoundBlob = null;
  preview.innerHTML = `<span>Gerando imagem da ${escapeHtml(roundLabel(round))}...</span>`;
  downloadButton.disabled = true;
  shareButton.disabled = true;
  modal.hidden = false;
  try {
    await document.fonts?.ready;
    sharedRoundBlob = await createRoundShareImage(roundId);
    sharedRoundObjectUrl = URL.createObjectURL(sharedRoundBlob);
    preview.innerHTML = `<img src="${sharedRoundObjectUrl}" alt="Prévia do resumo visual da ${escapeHtml(roundLabel(round))}" />`;
    downloadButton.disabled = false;
    shareButton.disabled = false;
  } catch (error) {
    console.error(error);
    preview.innerHTML = `<span>Não foi possível gerar a imagem. Tente novamente.</span>`;
    toast("Não foi possível gerar o resumo da rodada.");
  }
}
function downloadRoundShareImage() {
  const round = getRoundById(sharedRoundId);
  if (!round || !sharedRoundBlob) return;
  const link = document.createElement("a");
  link.href = sharedRoundObjectUrl;
  link.download = shareRoundFilename(round);
  link.click();
}
async function shareRoundImage() {
  const round = getRoundById(sharedRoundId);
  if (!round || !sharedRoundBlob) return;
  const file = new File([sharedRoundBlob], shareRoundFilename(round), { type: "image/png" });
  const shareData = { title: `${roundLabel(round)} · G.P.F.C`, text: `Confira os resultados da ${roundLabel(round)} da Galera da Pelada.`, files: [file] };
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
      console.warn("Compartilhamento nativo indisponível.", error);
    }
  }
  downloadRoundShareImage();
  toast("Imagem baixada. Agora você pode enviá-la pelo aplicativo desejado.");
}
function roundGamesSummaryMarkup(roundId, compact = false) {
  const round = getRoundById(roundId);
  const results = roundResults(roundId);
  if (!round || !results.length) return "";
  const highestWins = Math.max(...results.map(item => item.wins));
  const leaders = results.filter(item => item.wins === highestWins && highestWins > 0);
  const leaderText = leaders.length ? leaders.map(item => item.team).join(" · ") : "Ainda sem vencedor";
  const leaderWins = highestWins === 1 ? "1 vitória" : `${highestWins} vitórias`;
  return `<section class="round-games-summary ${compact ? "compact" : ""}"><div class="round-games-summary-heading"><div><p class="eyebrow">JOGOS DA RODADA ${round.number}</p><h3>Vitórias e derrotas</h3></div><div class="round-most-wins"><span>TIME QUE MAIS VENCEU</span><strong>${escapeHtml(leaderText)}</strong><small>${leaders.length ? leaderWins : "Aguardando resultado"}</small></div></div><div class="round-results-grid">${results.map(item => `<article class="round-result-card ${leaders.includes(item) ? "leader" : ""}"><strong>${escapeHtml(item.team)}</strong><span><b>${item.wins}</b> V · <b>${item.losses}</b> D${item.draws ? ` · ${item.draws} E` : ""}</span><small>${item.goalsFor} gols feitos · ${item.goalsAgainst} sofridos</small></article>`).join("")}</div></section>`;
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
  currentContainer.insertAdjacentHTML("beforeend", roundHighlightsMarkup(currentRound.id));
  currentContainer.insertAdjacentHTML("beforeend", attendanceListMarkup(currentRound.id));
  const historicalRounds = rounds.filter(round => round.id !== currentRound.id);
  historyContainer.innerHTML = historicalRounds.length ? historicalRounds.map(round => {
    const roundGames = data.games.filter(game => game.roundId === round.id).sort((a, b) => a.id.localeCompare(b.id));
    return `<article class="round-public-history-item"><div><span class="mini-label">${roundLabel(round).toUpperCase()} · ${roundStatusLabel(round).toUpperCase()}</span><strong>${formatDate(round.date)}</strong><small>${escapeHtml(round.place || DEFAULT_VENUE_NAME)} · ${roundGames.length} ${roundGames.length === 1 ? "confronto" : "confrontos"}</small>${venueMapLink("Abrir no GPS")}</div><div class="round-games-list">${roundGames.length ? roundGames.map(publicGameMarkup).join("") : `<div class="saved-game-empty">Nenhum confronto salvo.</div>`}</div></article>`;
  }).join("") : `<div class="empty-state">As próximas rodadas finalizadas aparecerão aqui.</div>`;
}
function gameResultMarkup(game) {
  const winnerSide = gameWinnerSide(game);
  if (!winnerSide) return "";
  return `<small class="game-result-method">${resultLabel(game)} · ${escapeHtml(winnerSide === "home" ? game.home : game.away)} venceu</small>`;
}
function savedGameMarkup(game, index) {
  if (!isCompletedGame(game)) {
    const gameNumber = game.number || index + 1;
    return `<article class="saved-game round-saved-game draft-game"><div class="saved-game-top"><div class="round-game-score"><span class="round-game-number">JOGO ${String(gameNumber).padStart(2, "0")} · RASCUNHO</span><strong>${escapeHtml(game.home)} <b>×</b> ${escapeHtml(game.away)}</strong><small>Confronto reservado. Clique em Editar para montar os times e finalizar.</small></div><div class="saved-game-actions"><button class="button secondary edit-game" data-edit-game="${game.id}" type="button">Editar</button><button class="button danger delete-game" data-delete-game="${game.id}" type="button">Excluir</button></div></div></article>`;
  }
  const homeState = game.winnerSide === "home" ? "winner" : game.winnerSide ? "loser" : "";
  const awayState = game.winnerSide === "away" ? "winner" : game.winnerSide ? "loser" : "";
  const gameNumber = game.number || index + 1;
  return `<article class="saved-game round-saved-game"><div class="saved-game-top"><div class="round-game-score"><span class="round-game-number">JOGO ${String(gameNumber).padStart(2, "0")}</span><strong>${escapeHtml(game.home)} <b>${game.homeScore} × ${game.awayScore}</b> ${escapeHtml(game.away)}</strong>${gameResultMarkup(game)}</div><div class="saved-game-actions"><button class="button secondary edit-game" data-edit-game="${game.id}" type="button">Editar</button><button class="button danger delete-game" data-delete-game="${game.id}" type="button">Excluir</button></div></div><div class="saved-game-rosters"><section class="${homeState}"><span>${homeState === "winner" ? "● VENCEU · " : homeState === "loser" ? "× PERDEU · " : ""}${escapeHtml(game.home)}</span>${renderTeamRoster(game, "home")}</section><section class="${awayState}"><span>${awayState === "winner" ? "● VENCEU · " : awayState === "loser" ? "× PERDEU · " : ""}${escapeHtml(game.away)}</span>${renderTeamRoster(game, "away")}</section></div></article>`;
}
function publicGameMarkup(game, index) {
  const homeState = game.winnerSide === "home" ? "winner" : game.winnerSide ? "loser" : "";
  const awayState = game.winnerSide === "away" ? "winner" : game.winnerSide ? "loser" : "";
  const gameNumber = game.number || index + 1;
  return `<article class="saved-game round-saved-game public-saved-game"><div class="saved-game-top"><div class="round-game-score"><span class="round-game-number">JOGO ${String(gameNumber).padStart(2, "0")}</span><strong>${escapeHtml(game.home)} <b>${game.homeScore} × ${game.awayScore}</b> ${escapeHtml(game.away)}</strong>${gameResultMarkup(game)}</div></div><div class="saved-game-rosters"><section class="${homeState}"><span>${homeState === "winner" ? "● VENCEU · " : homeState === "loser" ? "× PERDEU · " : ""}${escapeHtml(game.home)}</span>${renderTeamRoster(game, "home")}</section><section class="${awayState}"><span>${awayState === "winner" ? "● VENCEU · " : awayState === "loser" ? "× PERDEU · " : ""}${escapeHtml(game.away)}</span>${renderTeamRoster(game, "away")}</section></div></article>`;
}
function gameWinnerSide(game) {
  if (["home", "away"].includes(game.winnerSide)) return game.winnerSide;
  if (number(game.homeScore) > number(game.awayScore)) return "home";
  if (number(game.awayScore) > number(game.homeScore)) return "away";
  return "";
}
function publicRoundTimelineMarkup(round) {
  const games = roundGames(round.id).filter(isCompletedGame);
  const results = roundResults(round.id);
  const highestWins = Math.max(0, ...results.map(item => item.wins));
  const leaders = results.filter(item => item.wins === highestWins && highestWins > 0);
  const leaderText = leaders.length ? leaders.map(item => item.team).join(" \u00b7 ") : "Sem vencedor definido";
  const expanded = expandedPublicRoundIds.has(round.id);
  const gameRows = games.length ? games.map((game, index) => {
    const winnerSide = gameWinnerSide(game);
    const winner = winnerSide === "home" ? game.home : winnerSide === "away" ? game.away : "Empate";
    return `<li class="round-timeline-game"><span>JOGO ${String(game.number || index + 1).padStart(2, "0")}</span><strong>${escapeHtml(game.home)} <b>${game.homeScore} \u00d7 ${game.awayScore}</b> ${escapeHtml(game.away)}</strong><small>${winnerSide ? `Vencedor: <b>${escapeHtml(winner)}</b> \u00b7 ${escapeHtml(resultLabel(game))}` : "Empate sem decis\u00e3o registrada"}</small></li>`;
  }).join("") : `<li class="round-timeline-empty">Nenhum confronto salvo nesta rodada.</li>`;
  return `<article class="round-public-history-item round-timeline-item"><header class="round-timeline-heading"><div><span class="round-status ${round.status}">${roundStatusLabel(round).toUpperCase()}</span><p class="eyebrow">${roundLabel(round).toUpperCase()}</p><strong>${formatDate(round.date)}</strong><small>${escapeHtml(round.place || DEFAULT_VENUE_NAME)} \u00b7 ${games.length} ${games.length === 1 ? "confronto" : "confrontos"}</small></div><div class="round-timeline-actions"><div class="round-timeline-leader"><span>TIME COM MAIS VIT\u00d3RIAS</span><strong>${escapeHtml(leaderText)}</strong><small>${leaders.length ? `${highestWins} ${highestWins === 1 ? "vit\u00f3ria" : "vit\u00f3rias"}` : "Aguardando resultado"}</small></div><div class="round-timeline-buttons"><button class="button secondary round-share-button" data-share-round="${round.id}" type="button"${games.length ? "" : " disabled"}>Compartilhar rodada</button><button class="button secondary round-timeline-toggle" data-toggle-round-details="${round.id}" type="button" aria-expanded="${expanded}">${expanded ? "Ocultar detalhes" : "Ver detalhes"}</button></div></div></header><ol class="round-timeline-games">${gameRows}</ol><div class="round-public-details"${expanded ? "" : " hidden"}><div class="round-games-list">${games.map(publicGameMarkup).join("")}</div>${roundGamesSummaryMarkup(round.id, true)}${roundHighlightsMarkup(round.id, true)}${roundClipsSectionMarkup(round.id)}${attendanceListMarkup(round.id)}</div></article>`;
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
    currentContainer.innerHTML = `<div class="round-public-heading"><span class="round-status draft">PRÓXIMA RODADA</span><div><p class="eyebrow">A CAMINHO</p><h2>Rodada ${getNextRoundNumber()}</h2><p>Os confrontos e destaques aparecerão aqui assim que o organizador abrir a rodada.</p></div></div>`;
    historyContainer.innerHTML = `<div class="empty-state">A Rodada 15 será a primeira registrada neste novo formato.</div>`;
    return;
  }
  const games = roundGames(currentRound.id).filter(isCompletedGame);
  currentContainer.innerHTML = `<div class="round-public-heading"><span class="round-status ${currentRound.status}">${roundStatusLabel(currentRound).toUpperCase()}</span><div><p class="eyebrow">${roundLabel(currentRound).toUpperCase()}</p><h2>${formatDate(currentRound.date)}</h2><p>${escapeHtml(currentRound.place || DEFAULT_VENUE_NAME)} · ${games.length} ${games.length === 1 ? "confronto" : "confrontos"}</p>${venueMapLink("Abrir CT Caxangá no GPS")}</div><button class="button secondary round-share-button" data-share-round="${currentRound.id}" type="button"${games.length ? "" : " disabled"}>Compartilhar rodada <span>↗</span></button></div><div class="round-games-list public-round-games">${games.length ? games.map(publicGameMarkup).join("") : `<div class="saved-game-empty">Os confrontos desta rodada ainda serão definidos.</div>`}</div>${roundGamesSummaryMarkup(currentRound.id)}${roundHighlightsMarkup(currentRound.id)}${roundClipsSectionMarkup(currentRound.id)}${attendanceListMarkup(currentRound.id)}`;
  const historicalRounds = rounds.filter(round => round.id !== currentRound.id);
  historyContainer.innerHTML = historicalRounds.length
    ? historicalRounds.map(publicRoundTimelineMarkup).join("")
    : `<div class="empty-state">As próximas rodadas finalizadas aparecerão aqui.</div>`;
}
function renderSavedGames() {
  const container = document.querySelector("#saved-games-list");
  const activeRound = getActiveRound();
  if (activeRound) {
    const games = roundGames(activeRound.id);
    container.innerHTML = `<section class="round-history active-round-history"><div class="round-history-heading"><div><span class="mini-label">${roundLabel(activeRound).toUpperCase()} · ${roundStatusLabel(activeRound).toUpperCase()}</span><strong>${games.length} ${games.length === 1 ? "confronto salvo" : "confrontos salvos"}</strong><small>Finalize um jogo para mantê-lo nesta lista. Use Editar para corrigir.</small></div></div><div class="round-games-list">${games.length ? games.map(savedGameMarkup).join("") : `<div class="saved-game-empty">Nenhum confronto salvo ainda. Monte os times e clique em Finalizar confronto.</div>`}</div></section>`;
    return;
  }
  const groups = [...data.rounds].sort((a, b) => b.number - a.number).map(round => ({
    round,
    games: roundGames(round.id)
  }));
  const legacyGames = data.games.filter(game => !game.roundId).sort((a, b) => b.date.localeCompare(a.date));
  if (legacyGames.length) groups.push({ round: null, games: legacyGames });
  container.innerHTML = groups.length ? groups.map(group => {
    const { round, games } = group;
    if (!round) return `<section class="round-history legacy-history"><div class="round-history-heading"><div><span class="mini-label">REGISTROS ANTERIORES</span><strong>Confrontos sem rodada</strong><small>Partidas salvas antes do novo formato semanal.</small></div></div><div class="round-games-list">${games.map(savedGameMarkup).join("")}</div></section>`;
    return `<section class="round-history ${round.id === activeRoundId ? "active-round-history" : ""}"><div class="round-history-heading"><div><span class="mini-label">${roundLabel(round).toUpperCase()} · ${roundStatusLabel(round).toUpperCase()}</span><strong>${formatDate(round.date)}</strong><small>${escapeHtml(round.place || "Local não informado")} · ${games.length} ${games.length === 1 ? "confronto" : "confrontos"}</small></div><button class="button secondary open-round" data-open-round="${round.id}" type="button">Abrir rodada</button></div><div class="round-games-list">${games.length ? games.map(savedGameMarkup).join("") : `<div class="saved-game-empty">Nenhum confronto salvo nesta rodada.</div>`}</div>${roundGamesSummaryMarkup(round.id, true)}</section>`;
  }).join("") : `<div class="empty-state saved-games-empty">A Rodada 15 ainda não possui confrontos salvos.</div>`;
}
function roundParticipants(roundId) {
  const ids = new Set(roundGames(roundId).flatMap(game => game.stats.map(entry => entry.playerId)));
  Object.entries(data.attendance[roundId] || {}).forEach(([playerId, status]) => { if (status === "present") ids.add(playerId); });
  return data.players.filter(player => ids.has(player.id));
}
function renderRoundAwards() {
  const autoContainer = document.querySelector("#round-auto-highlights");
  const manualContainer = document.querySelector("#round-manual-awards");
  const submit = document.querySelector("#save-round-awards");
  const round = getActiveRound();
  if (!rodizioAvailable) {
    autoContainer.innerHTML = `<p class="adjustment-note">Execute a migração 009 no Supabase para salvar os destaques por rodada.</p>`;
    manualContainer.innerHTML = "";
    submit.disabled = true;
    return;
  }
  if (!round) {
    autoContainer.innerHTML = `<p class="adjustment-note">Abra uma rodada para calcular e salvar seus destaques.</p>`;
    manualContainer.innerHTML = "";
    submit.disabled = true;
    return;
  }
  const artilheiros = getRoundStatLeaders(round.id, "goals");
  const garcons = getRoundStatLeaders(round.id, "assists");
  autoContainer.innerHTML = `<div class="auto-highlight"><span>ARTILHARIA</span><strong>${artilheiros.length ? artilheiros.map(item => `${escapeHtml(displayName(item.player))} (${item.value})`).join(" · ") : "Sem gols registrados"}</strong></div><div class="auto-highlight"><span>GARÇOM</span><strong>${garcons.length ? garcons.map(item => `${escapeHtml(displayName(item.player))} (${item.value})`).join(" · ") : "Sem assistências registradas"}</strong></div>`;
  const players = roundParticipants(round.id);
  const savedCraque = getRoundAwardPlayers(round.id, "craque")[0]?.id || "";
  const savedXerifes = new Set(getRoundAwardPlayers(round.id, "xerife").map(player => player.id));
  const savedParedoes = new Set(getRoundAwardPlayers(round.id, "paredao").map(player => player.id));
  const playerOptions = players.map(player => `<option value="${player.id}"${player.id === savedCraque ? " selected" : ""}>${escapeHtml(displayName(player))} · #${shirtNumber(player)}</option>`).join("");
  const checkboxList = (category, selected, onlyGoalkeepers = false) => {
    const list = players.filter(player => !onlyGoalkeepers || isGoalkeeper(player));
    return list.length ? `<div class="award-check-list">${list.map(player => `<label><input type="checkbox" data-award-category="${category}" value="${player.id}"${selected.has(player.id) ? " checked" : ""} /> ${escapeHtml(displayName(player))}</label>`).join("")}</div>` : `<p class="adjustment-note">${onlyGoalkeepers ? "Nenhum goleiro presente na rodada." : "Confirme a presença ou registre um jogo primeiro."}</p>`;
  };
  manualContainer.innerHTML = `<label>Craque da rodada<select id="award-craque"><option value="">Selecione um atleta</option>${playerOptions}</select></label><div class="manual-award-group"><strong>Xerife da rodada <small>Escolha até 2 atletas</small></strong>${checkboxList("xerife", savedXerifes)}</div><div class="manual-award-group"><strong>Paredão da rodada <small>Escolha até 2 goleiros</small></strong>${checkboxList("paredao", savedParedoes, true)}</div>`;
  submit.disabled = false;
}
function renderHomeHighlights() {
  const container = document.querySelector("#weekly-awards");
  const round = [...data.rounds]
    .filter(item => item.status === "completed")
    .sort((a, b) => b.number - a.number)[0];
  if (!round) {
    container.innerHTML = `<div class="empty-state home-highlights-empty">A primeira rodada finalizada vai aparecer aqui com seus destaques.</div>`;
    return;
  }
  const games = roundGames(round.id);
  const gameLabel = games.length === 1 ? "confronto" : "confrontos";
  container.innerHTML = `<div class="home-highlights-meta"><span>${roundLabel(round)} \u00b7 ${formatDate(round.date)}</span><small>${games.length} ${gameLabel}</small></div>${roundHighlightsMarkup(round.id, true, false)}`;
}
function highlightClipsMarkup(roundId, { showEmpty = true } = {}) {
  const clips = data.highlightClips.filter(clip => clip.roundId === roundId);
  if (!clips.length) return showEmpty ? `<div class="empty-state highlight-clips-empty">Os Reels dos destaques aparecerão aqui depois da publicação no Instagram.</div>` : "";
  return clips.map(clip => {
    const player = data.players.find(item => item.id === clip.playerId);
    const info = clipTypeInfo(clip.type);
    if (!player || !isInstagramUrl(clip.instagramUrl)) return "";
    return `<article class="highlight-clip-card"><div class="highlight-clip-player">${avatar(player)}<div><span>${info.icon} ${info.label.toUpperCase()}</span><strong>${escapeHtml(displayName(player))}</strong></div></div>${clip.caption ? `<p>${escapeHtml(clip.caption)}</p>` : ""}<a class="highlight-clip-link" href="${escapeHtml(clip.instagramUrl)}" target="_blank" rel="noopener noreferrer">Ver Reel no Instagram <span>↗</span></a></article>`;
  }).join("");
}
function roundClipsSectionMarkup(roundId) {
  const clips = data.highlightClips.filter(clip => clip.roundId === roundId);
  return `<section class="round-highlight-clips"><div class="round-clips-section-heading"><div><p class="eyebrow">MELHORES MOMENTOS</p><h3>Lances da rodada</h3></div><span class="mini-label">${clips.length} ${clips.length === 1 ? "REEL" : "REELS"}</span></div><div class="highlight-clips-grid">${highlightClipsMarkup(roundId)}</div></section>`;
}
function renderHomeClips() {
  const container = document.querySelector("#latest-round-clips");
  const round = getLatestCompletedRound();
  if (!round) {
    container.innerHTML = `<div class="empty-state highlight-clips-empty">Finalize uma rodada para publicar os melhores lances da semana.</div>`;
    return;
  }
  container.innerHTML = `<div class="highlight-clips-meta"><span>${roundLabel(round)} · ${formatDate(round.date)}</span><small>VÍDEOS NO INSTAGRAM</small></div><div class="highlight-clips-grid">${highlightClipsMarkup(round.id)}</div>`;
}
function noticeMessageMarkup(message) {
  return escapeHtml(message).replace(/\r?\n/g, "<br>");
}
function renderHomeNotices() {
  const container = document.querySelector("#home-notices");
  if (!container) return;
  if (!noticesAvailable) {
    container.innerHTML = `<div class="empty-state">Os avisos oficiais da pelada aparecerão aqui.</div>`;
    return;
  }
  const notices = sortedNotices(data.notices.filter(noticeIsVisible));
  container.innerHTML = notices.length ? notices.map(notice => {
    const info = noticeTypeInfo(notice.category);
    return `<article class="notice-card notice-${escapeHtml(notice.category)}${notice.pinned ? " is-pinned" : ""}"><header><span class="notice-category"><b>${info.icon}</b>${info.label}</span>${notice.pinned ? `<span class="notice-pinned">FIXADO</span>` : ""}</header><h3>${escapeHtml(notice.title)}</h3><p>${noticeMessageMarkup(notice.message)}</p><footer><span>Publicado em ${formatDate(String(notice.publishedAt).slice(0, 10))}</span>${notice.expiresOn ? `<span>Até ${formatDate(notice.expiresOn)}</span>` : ""}</footer></article>`;
  }).join("") : `<div class="empty-state">Nenhum aviso importante no momento. Acompanhe aqui as novidades da Galera da Pelada.</div>`;
}
function getPublicAttendanceRound() {
  return [...data.rounds]
    .filter(round => round.status === "draft")
    .sort((a, b) => b.number - a.number)[0] || null;
}
function publicAttendanceStatusInfo(status) {
  return {
    present: { icon: "●", label: "Vou participar", shortLabel: "Confirmado" },
    unknown: { icon: "?", label: "Estou em dúvida", shortLabel: "Em dúvida" },
    absent: { icon: "×", label: "Não vou", shortLabel: "Não vai" }
  }[status] || null;
}
function renderPublicAttendanceConfirmation() {
  const container = document.querySelector("#public-attendance-panel");
  if (!container) return;
  const round = getPublicAttendanceRound();
  if (!round) {
    container.innerHTML = `<div class="empty-state public-attendance-empty">A confirmação será aberta quando a próxima rodada for criada.</div>`;
    return;
  }
  if (!attendanceAvailable) {
    container.innerHTML = `<div class="empty-state public-attendance-empty">A lista de presença está sendo preparada.</div>`;
    return;
  }

  const attendance = data.attendance[round.id] || {};
  const players = [...data.players].sort((a, b) => displayName(a).localeCompare(displayName(b), "pt-BR"));
  if (publicAttendanceRoundId !== round.id) {
    publicAttendanceRoundId = round.id;
    publicAttendanceChoice = publicAttendancePlayerId ? attendance[publicAttendancePlayerId] || "" : "";
  }
  if (!players.some(player => player.id === publicAttendancePlayerId)) {
    publicAttendancePlayerId = "";
    publicAttendanceChoice = "";
  }
  const selectedPlayer = players.find(player => player.id === publicAttendancePlayerId);
  if (selectedPlayer && !publicAttendanceChoice) publicAttendanceChoice = attendance[selectedPlayer.id] || "";
  const currentInfo = selectedPlayer ? publicAttendanceStatusInfo(attendance[selectedPlayer.id]) : null;
  const totals = ["present", "unknown", "absent"].map(status => ({
    status,
    total: players.filter(player => attendance[player.id] === status).length,
    info: publicAttendanceStatusInfo(status)
  }));
  const choiceButtons = ["present", "unknown", "absent"].map(status => {
    const info = publicAttendanceStatusInfo(status);
    const selected = publicAttendanceChoice === status;
    return `<button class="public-attendance-choice choice-${status}${selected ? " is-selected" : ""}" type="button" data-public-attendance-status="${status}" aria-pressed="${selected}"><b>${info.icon}</b><span>${info.label}</span></button>`;
  }).join("");

  container.innerHTML = `<article class="public-attendance-card${round.attendanceClosed ? " is-closed" : ""}">
    <div class="public-attendance-summary">
      <div><span>${roundLabel(round)}</span><strong>${formatDate(round.date)}</strong><small>${escapeHtml(round.place || DEFAULT_VENUE_NAME)} · 17h às 19h</small></div>
      <div class="public-attendance-totals">${totals.map(item => `<span class="total-${item.status}"><b>${item.total}</b>${item.info.shortLabel}</span>`).join("")}</div>
    </div>
    ${round.attendanceClosed
      ? `<div class="public-attendance-closed"><b>Lista encerrada</b><span>A diretoria fechou as confirmações desta rodada.</span></div>`
      : `<form id="public-attendance-form" class="public-attendance-form">
          <label class="public-player-select">Seu nome
            <select id="public-attendance-player" required>
              <option value="">Selecione seu nome na lista</option>
              ${players.map(player => `<option value="${player.id}"${player.id === publicAttendancePlayerId ? " selected" : ""}>${escapeHtml(displayName(player))} · camisa ${escapeHtml(shirtNumber(player))}</option>`).join("")}
            </select>
          </label>
          <div class="public-attendance-choices" role="group" aria-label="Escolha sua resposta">${choiceButtons}</div>
          <div class="public-attendance-submit">
            <p>${currentInfo ? `Resposta atual: <strong>${currentInfo.shortLabel}</strong>. Você pode alterá-la.` : "Escolha uma resposta e confirme."}</p>
            <button class="button primary" type="submit"${!selectedPlayer || !publicAttendanceChoice ? " disabled" : ""}>Confirmar presença <span>→</span></button>
          </div>
        </form>`}
  </article>`;
}
function renderMediaGallery() {
  const gallery = document.querySelector("#media-gallery");
  const yearSelect = document.querySelector("#media-year-filter");
  const summary = document.querySelector("#media-gallery-summary");
  if (!gallery || !yearSelect || !summary) return;
  const entries = allMediaEntries();
  const years = [...new Set(entries.map(item => number(item.year)).filter(Boolean))].sort((a, b) => b - a);
  const previousYear = selectedMediaYear;
  yearSelect.innerHTML = `<option value="all">Todos</option>${years.map(year => `<option value="${year}">${year}</option>`).join("")}`;
  selectedMediaYear = previousYear === "all" || years.includes(number(previousYear)) ? previousYear : "all";
  yearSelect.value = selectedMediaYear;
  document.querySelector("#media-category-filter").value = selectedMediaCategory;
  document.querySelectorAll("[data-media-type]").forEach(button => button.classList.toggle("active", button.dataset.mediaType === selectedMediaType));
  const filtered = entries.filter(item =>
    (selectedMediaType === "all" || item.mediaType === selectedMediaType) &&
    (selectedMediaYear === "all" || String(item.year) === String(selectedMediaYear)) &&
    (selectedMediaCategory === "all" || item.category === selectedMediaCategory)
  );
  summary.innerHTML = `<strong>${filtered.length}</strong> ${filtered.length === 1 ? "memória encontrada" : "memórias encontradas"}<span>Fotos históricas e vídeos publicados nas redes do G.P.F.C.</span>`;
  gallery.innerHTML = filtered.length ? filtered.map(item => {
    const category = mediaCategoryInfo(item.category);
    const round = item.roundId ? getRoundById(item.roundId) : null;
    const relatedPlayers = (item.playerIds || []).map(id => data.players.find(player => player.id === id)).filter(Boolean);
    const playerText = relatedPlayers.map(displayName).join(", ");
    const body = item.mediaType === "photo"
      ? `<div class="media-card-visual"><img src="${escapeHtml(item.sourceUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" /></div>`
      : `<div class="media-card-visual media-video-visual"><span class="media-play" aria-hidden="true">▶</span><img src="assets/escudo-moderno-gpfc.webp" alt="" loading="lazy" /></div>`;
    return `<a class="media-card${item.featured ? " is-featured" : ""}" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${item.mediaType === "photo" ? "Abrir foto" : "Assistir vídeo"}: ${escapeHtml(item.title)}">${body}<div class="media-card-content"><div class="media-card-meta"><span>${category.icon} ${category.label}</span><b>${escapeHtml(item.year)}</b></div><h3>${escapeHtml(item.title)}</h3>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}<div class="media-card-details">${round ? `<span>${escapeHtml(roundLabel(round))}</span>` : ""}${playerText ? `<span>${escapeHtml(playerText)}</span>` : ""}</div><span class="media-card-open-label">${item.mediaType === "photo" ? "Abrir foto" : "Assistir vídeo"} <b>↗</b></span></div></a>`;
  }).join("") : `<div class="empty-state media-empty-state">Nenhuma mídia encontrada com estes filtros. Escolha outra categoria ou ano.</div>`;
}
function updateMediaFormFields() {
  const type = document.querySelector("#media-type")?.value || "photo";
  const photoField = document.querySelector("#media-photo-field");
  const urlField = document.querySelector("#media-url-field");
  if (!photoField || !urlField) return;
  photoField.hidden = type !== "photo";
  urlField.hidden = type !== "video";
}
function resetMediaForm() {
  const form = document.querySelector("#media-form");
  if (!form) return;
  form.reset();
  document.querySelector("#media-id").value = "";
  document.querySelector("#media-year").value = String(SEASON);
  document.querySelector("#save-media").innerHTML = `Publicar mídia <span>→</span>`;
  document.querySelector("#cancel-media-edit").hidden = true;
  updateMediaFormFields();
}
function renderAdminMedia() {
  const form = document.querySelector("#media-form");
  const list = document.querySelector("#media-admin-list");
  const roundSelect = document.querySelector("#media-round");
  const playerOptions = document.querySelector("#media-player-options");
  if (!form || !list || !roundSelect || !playerOptions) return;
  const editingId = document.querySelector("#media-id").value;
  const selectedRound = roundSelect.value;
  const selectedPlayers = [...playerOptions.querySelectorAll("input:checked")].map(input => input.value);
  roundSelect.innerHTML = `<option value="">Nenhuma rodada</option>${[...data.rounds].sort((a, b) => b.number - a.number).map(round => `<option value="${round.id}">${escapeHtml(roundLabel(round))} · ${formatDate(round.date)}</option>`).join("")}`;
  playerOptions.innerHTML = [...data.players].sort((a, b) => displayName(a).localeCompare(displayName(b), "pt-BR")).map(player => `<label class="media-player-option"><input type="checkbox" value="${player.id}"${selectedPlayers.includes(player.id) ? " checked" : ""}><span>${escapeHtml(displayName(player))}<small>Camisa #${escapeHtml(shirtNumber(player))}</small></span></label>`).join("");
  if (selectedRound) roundSelect.value = selectedRound;
  if (!mediaAvailable) {
    form.querySelectorAll("input, textarea, select, button").forEach(field => field.disabled = true);
    list.innerHTML = `<p class="adjustment-note">Execute a migração 018 no Supabase para ativar a Galeria de mídias.</p>`;
    return;
  }
  form.querySelectorAll("input, textarea, select, button").forEach(field => field.disabled = false);
  const items = [...data.mediaItems].sort((a, b) => number(b.year) - number(a.year) || String(b.createdAt).localeCompare(String(a.createdAt)));
  list.innerHTML = items.length ? `<div class="media-admin-heading"><strong>Publicações da galeria</strong><small>${items.length} ${items.length === 1 ? "item" : "itens"}</small></div>${items.map(item => {
    const category = mediaCategoryInfo(item.category);
    const archived = item.status === "archived";
    return `<article class="media-admin-item${archived ? " is-archived" : ""}"><div class="media-admin-thumb">${item.mediaType === "photo" ? `<img src="${escapeHtml(item.sourceUrl)}" alt="" loading="lazy" />` : "▶"}</div><div class="media-admin-copy"><span>${category.label} · ${escapeHtml(item.year)}</span><strong>${escapeHtml(item.title)}</strong><small>${archived ? "Arquivada" : item.featured ? "Em destaque" : "Publicada"}</small></div><div class="media-admin-actions"><button type="button" data-edit-media="${item.id}">Editar</button><button type="button" data-archive-media="${item.id}">${archived ? "Reativar" : "Arquivar"}</button></div></article>`;
  }).join("")}` : `<p class="adjustment-note">Nenhuma foto publicada ainda. Os Reels das rodadas já aparecem na página Mídias automaticamente.</p>`;
  if (!editingId) updateMediaFormFields();
}
function resetHallForm() {
  const form = document.querySelector("#hall-form");
  if (!form) return;
  form.reset();
  document.querySelector("#hall-award-id").value = "";
  document.querySelector("#hall-award-year").value = String(SEASON - 1);
  document.querySelector("#save-hall-award").innerHTML = `Adicionar campeão <span>→</span>`;
  document.querySelector("#cancel-hall-edit").hidden = true;
}
function renderHallOfFame() {
  const grid = document.querySelector("#hall-awards-grid");
  const summary = document.querySelector("#hall-summary");
  const leaders = document.querySelector("#hall-leaders");
  const yearSelect = document.querySelector("#hall-year-filter");
  if (!grid || !summary || !leaders || !yearSelect) return;
  const awards = data.hallAwards.filter(item => item.status === "active");
  const years = [...new Set(awards.map(item => number(item.year)).filter(Boolean))].sort((a, b) => b - a);
  const previousYear = selectedHallYear;
  yearSelect.innerHTML = `<option value="all">Todos</option>${years.map(year => `<option value="${year}">${year}</option>`).join("")}`;
  selectedHallYear = previousYear === "all" || years.includes(number(previousYear)) ? previousYear : "all";
  yearSelect.value = selectedHallYear;
  document.querySelectorAll("[data-hall-category]").forEach(button => button.classList.toggle("active", button.dataset.hallCategory === selectedHallCategory));
  const championKeys = new Set(awards.map(hallWinnerKey));
  summary.innerHTML = `<strong>${awards.length}</strong><span>troféus registrados</span><strong>${championKeys.size}</strong><span>campeões</span>`;
  const titleTotals = awards.reduce((totals, award) => {
    const key = hallWinnerKey(award);
    const current = totals.get(key) || { name: award.winnerName, photo: award.photoUrl, total: 0 };
    current.total += 1;
    if (!current.photo && award.photoUrl) current.photo = award.photoUrl;
    totals.set(key, current);
    return totals;
  }, new Map());
  const topChampions = [...titleTotals.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR")).slice(0, 3);
  leaders.innerHTML = topChampions.length ? `<div class="hall-leaders-heading"><p class="eyebrow">MAIORES CAMPEÕES</p><h3>Quem mais levantou troféus</h3></div><div class="hall-leaders-list">${topChampions.map((champion, index) => `<article class="hall-leader-card"><span class="hall-leader-position">${index + 1}º</span><div class="hall-leader-photo">${champion.photo ? `<img src="${escapeHtml(champion.photo)}" alt="Foto de ${escapeHtml(champion.name)}" loading="lazy" />` : `<span>${escapeHtml(champion.name.slice(0, 2).toUpperCase())}</span>`}</div><div><strong>${escapeHtml(champion.name)}</strong><small>${champion.total} ${champion.total === 1 ? "título" : "títulos"}</small></div></article>`).join("")}</div>` : "";
  const filtered = awards
    .filter(item => (selectedHallYear === "all" || String(item.year) === String(selectedHallYear)) && (selectedHallCategory === "all" || item.category === selectedHallCategory))
    .sort((a, b) => number(b.year) - number(a.year) || a.category.localeCompare(b.category, "pt-BR") || a.winnerName.localeCompare(b.winnerName, "pt-BR"));
  grid.innerHTML = filtered.length ? filtered.map(award => {
    const category = hallCategoryInfo(award.category);
    const titles = hallTitleCount(award);
    const photo = award.photoUrl
      ? `<img src="${escapeHtml(award.photoUrl)}" alt="Foto de ${escapeHtml(award.winnerName)}" loading="lazy" />`
      : `<div class="hall-card-placeholder"><span>${category.icon}</span><small>G.P.F.C</small></div>`;
    return `<article class="hall-award-card hall-${award.category}"><div class="hall-award-photo">${photo}<span class="hall-award-year">${escapeHtml(award.year)}</span></div><div class="hall-award-body"><span class="hall-award-category"><b>${category.icon}</b>${category.title}</span><h3>${escapeHtml(award.winnerName)}</h3><p>${award.note ? escapeHtml(award.note) : `Campeão da temporada ${escapeHtml(award.year)}.`}</p><span class="hall-title-seal">${titles} ${titles === 1 ? "título no Hall" : "títulos no Hall"}</span></div></article>`;
  }).join("") : `<div class="empty-state hall-empty-state">Nenhum campeão encontrado com este filtro.</div>`;
}
function renderAdminHallOfFame() {
  const form = document.querySelector("#hall-form");
  const list = document.querySelector("#hall-admin-list");
  const playerSelect = document.querySelector("#hall-award-player");
  if (!form || !list || !playerSelect) return;
  const selectedPlayer = playerSelect.value;
  playerSelect.innerHTML = `<option value="">Vencedor antigo ou fora do elenco</option>${[...data.players].sort((a, b) => displayName(a).localeCompare(displayName(b), "pt-BR")).map(player => `<option value="${player.id}">${escapeHtml(displayName(player))} · #${escapeHtml(shirtNumber(player))}</option>`).join("")}`;
  if (selectedPlayer) playerSelect.value = selectedPlayer;
  if (!hallOfFameAvailable) {
    form.querySelectorAll("input, textarea, select, button").forEach(field => field.disabled = true);
    list.innerHTML = `<p class="adjustment-note">Execute a migração 019 no Supabase para ativar o Hall da Fama.</p>`;
    return;
  }
  form.querySelectorAll("input, textarea, select, button").forEach(field => field.disabled = false);
  const awards = [...data.hallAwards].sort((a, b) => number(b.year) - number(a.year) || a.category.localeCompare(b.category, "pt-BR"));
  list.innerHTML = awards.length ? `<div class="media-admin-heading"><strong>Campeões cadastrados</strong><small>${awards.length} ${awards.length === 1 ? "título" : "títulos"}</small></div>${awards.map(award => {
    const category = hallCategoryInfo(award.category);
    const archived = award.status === "archived";
    return `<article class="media-admin-item hall-admin-item${archived ? " is-archived" : ""}"><div class="media-admin-thumb hall-admin-thumb">${award.photoUrl ? `<img src="${escapeHtml(award.photoUrl)}" alt="" loading="lazy" />` : category.icon}</div><div class="media-admin-copy"><span>${category.label} · ${escapeHtml(award.year)}</span><strong>${escapeHtml(award.winnerName)}</strong><small>${archived ? "Arquivado" : "Publicado"}</small></div><div class="media-admin-actions"><button type="button" data-edit-hall-award="${award.id}">Editar</button><button type="button" data-archive-hall-award="${award.id}">${archived ? "Reativar" : "Arquivar"}</button></div></article>`;
  }).join("")}` : `<p class="adjustment-note">Nenhum campeão cadastrado. Comece pelo ano de 2016 ou pelo ano mais recente.</p>`;
}
function resetNoticeForm() {
  const form = document.querySelector("#notice-form");
  if (!form) return;
  form.reset();
  document.querySelector("#notice-id").value = "";
  document.querySelector("#save-notice").innerHTML = `Publicar aviso <span>→</span>`;
  document.querySelector("#cancel-notice-edit").hidden = true;
}
function renderAdminNotices() {
  const form = document.querySelector("#notice-form");
  const list = document.querySelector("#notices-admin-list");
  if (!form || !list) return;
  if (!noticesAvailable) {
    form.querySelectorAll("input, textarea, select, button").forEach(field => field.disabled = true);
    list.innerHTML = `<p class="adjustment-note">Execute a migração 016 no Supabase para ativar o mural de avisos.</p>`;
    return;
  }
  form.querySelectorAll("input, textarea, select, button").forEach(field => field.disabled = false);
  const notices = sortedNotices(data.notices);
  list.innerHTML = notices.length ? notices.map(notice => {
    const info = noticeTypeInfo(notice.category);
    const isArchived = notice.status === "archived";
    return `<article class="notice-admin-item${isArchived ? " is-archived" : ""}"><div class="notice-admin-copy"><span class="notice-category"><b>${info.icon}</b>${info.label}</span><strong>${escapeHtml(notice.title)}</strong><p>${noticeMessageMarkup(notice.message)}</p><small>${isArchived ? "Arquivado" : notice.pinned ? "Fixado no mural" : "Publicado"}${notice.expiresOn ? ` · Até ${formatDate(notice.expiresOn)}` : ""}</small></div><div class="notice-admin-actions"><button class="edit-notice" type="button" data-edit-notice="${notice.id}">Editar</button><button class="archive-notice" type="button" data-archive-notice="${notice.id}">${isArchived ? "Reativar" : "Arquivar"}</button></div></article>`;
  }).join("") : `<p class="adjustment-note">Nenhum aviso criado ainda. Publique o primeiro comunicado para ele aparecer na página inicial.</p>`;
}
function renderAdminHighlightClips() {
  const select = document.querySelector("#highlight-clip-player");
  const form = document.querySelector("#highlight-clip-form");
  const list = document.querySelector("#highlight-clips-list");
  const round = getActiveRound();
  if (!highlightClipsAvailable) {
    form.querySelectorAll("input, select, button").forEach(field => field.disabled = true);
    select.innerHTML = `<option value="">Execute a migração 012 primeiro</option>`;
    list.innerHTML = `<p class="adjustment-note">Execute a migração 012 no Supabase para salvar links de Reels.</p>`;
    return;
  }
  form.querySelectorAll("input, select, button").forEach(field => field.disabled = !round);
  if (!round) {
    select.innerHTML = `<option value="">Abra uma rodada primeiro</option>`;
    list.innerHTML = `<p class="adjustment-note">Abra a rodada da semana para cadastrar os lances dos seus destaques.</p>`;
    return;
  }
  const players = roundHighlightPlayers(round.id);
  const previousValue = select.value;
  select.innerHTML = players.length
    ? `<option value="">Selecione um destaque</option>${players.map(player => `<option value="${player.id}">${escapeHtml(displayName(player))} · #${shirtNumber(player)}</option>`).join("")}`
    : `<option value="">Salve gols, assistências ou destaques primeiro</option>`;
  select.disabled = !players.length;
  if (players.some(player => player.id === previousValue)) select.value = previousValue;
  const clips = data.highlightClips.filter(clip => clip.roundId === round.id);
  list.innerHTML = clips.length ? `<div class="highlight-clips-admin-heading"><strong>Lances cadastrados em ${roundLabel(round)}</strong><small>${clips.length} ${clips.length === 1 ? "Reel" : "Reels"}</small></div>${clips.map(clip => {
    const player = data.players.find(item => item.id === clip.playerId);
    const info = clipTypeInfo(clip.type);
    return `<article class="highlight-clips-admin-item"><div>${avatar(player)}<span><strong>${escapeHtml(displayName(player))}</strong><small>${info.icon} ${info.label}${clip.caption ? ` · ${escapeHtml(clip.caption)}` : ""}</small></span></div><a href="${escapeHtml(clip.instagramUrl)}" target="_blank" rel="noopener noreferrer" class="text-button">Abrir Reel ↗</a><button class="delete-highlight-clip" type="button" data-delete-highlight-clip="${clip.id}">Excluir</button></article>`;
  }).join("")}` : `<p class="adjustment-note">Nenhum lance cadastrado nesta rodada ainda.</p>`;
}
function renderAdminPlayers() {
  const container = document.querySelector("#admin-players-list");
  container.innerHTML = data.players.length ? data.players.map(player =>
    `<article class="admin-player-item"><div>${avatar(player)}<span><strong>${escapeHtml(displayName(player))}</strong><small>#${shirtNumber(player)} · ${escapeHtml(player.position)}</small></span></div><span class="admin-player-actions"><button class="edit-player" data-edit-player="${player.id}" type="button">Editar</button><button class="delete-player" data-delete-player="${player.id}" type="button">Excluir</button></span></article>`
  ).join("") : `<div class="empty-state">Nenhum atleta para gerenciar.</div>`;
}
function renderAdminDirectors() {
  const container = document.querySelector("#admin-directors-list");
  if (!container) return;
  if (!directorsAvailable) {
    container.innerHTML = `<p class="adjustment-note">Execute a migração 013 no Supabase para ativar a edição da diretoria.</p>`;
    return;
  }
  container.innerHTML = directorList().map(director => `<article class="admin-director-item"><div>${directorPhotoMarkup(director)}<span><strong>${escapeHtml(director.name)}</strong><small>${escapeHtml(director.role)}</small></span></div><button class="edit-director" data-edit-director="${director.id}" type="button">Editar</button></article>`).join("");
}
const AUDIT_ENTITY_INFO = {
  players: { label: "Atleta", group: "players" },
  rounds: { label: "Rodada", group: "rounds" },
  games: { label: "Confronto", group: "rounds" },
  player_game_stats: { label: "Estatística de confronto", group: "statistics" },
  player_season_adjustments: { label: "Saldo histórico", group: "statistics" },
  round_attendance: { label: "Presença", group: "statistics" },
  round_awards: { label: "Destaque da rodada", group: "statistics" },
  game_goal_events: { label: "Gol ou assistência", group: "statistics" },
  bulletin_notices: { label: "Aviso", group: "notices" }
};
const AUDIT_ACTION_INFO = {
  INSERT: { label: "Criou", className: "created" },
  UPDATE: { label: "Alterou", className: "updated" },
  DELETE: { label: "Excluiu", className: "deleted" }
};
const AUDIT_FIELD_LABELS = {
  full_name: "nome", shirt_number: "camisa", position: "posição", photo_url: "foto",
  round_number: "número da rodada", played_on: "data", place: "local", status: "situação",
  home_team: "primeiro time", away_team: "segundo time", home_score: "placar do primeiro time",
  away_score: "placar do segundo time", result_method: "decisão", winner_side: "vencedor",
  games: "jogos", goals: "gols", assists: "assistências", craque: "craque",
  xerife: "xerife", paredao: "paredão", title: "título", message: "mensagem",
  category: "categoria", is_pinned: "fixação", expires_on: "validade", attendance_closed: "lista de presença"
};
function auditPlayerName(snapshot) {
  const playerId = snapshot?.player_id || snapshot?.scorer_id;
  return data.players.find(player => player.id === playerId)?.name || "Atleta";
}
function auditRecordLabel(log) {
  const snapshot = log.newData || log.oldData || {};
  if (log.entityType === "players") return snapshot.full_name || "Atleta";
  if (log.entityType === "rounds") return `Rodada ${snapshot.round_number || ""}`.trim();
  if (log.entityType === "games") return snapshot.game_number ? `Jogo ${snapshot.game_number}` : "Confronto";
  if (log.entityType === "bulletin_notices") return snapshot.title || "Aviso";
  if (["player_game_stats", "player_season_adjustments", "round_attendance", "round_awards", "game_goal_events"].includes(log.entityType)) return auditPlayerName(snapshot);
  return AUDIT_ENTITY_INFO[log.entityType]?.label || log.entityType;
}
function auditChangeSummary(log) {
  if (log.action !== "UPDATE") return "";
  const ignoredFields = new Set(["id", "created_at", "updated_at", "published_at"]);
  const oldData = log.oldData || {};
  const newData = log.newData || {};
  const changed = Object.keys(newData).filter(field => !ignoredFields.has(field) && JSON.stringify(oldData[field]) !== JSON.stringify(newData[field]));
  if (!changed.length) return "Registro atualizado";
  const labels = changed.slice(0, 4).map(field => AUDIT_FIELD_LABELS[field] || field.replaceAll("_", " "));
  return `Campos: ${labels.join(", ")}${changed.length > 4 ? ` e mais ${changed.length - 4}` : ""}`;
}
function formatAuditDate(date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(date));
}
function renderAdminAuditLogs() {
  const list = document.querySelector("#audit-log-list");
  const summary = document.querySelector("#audit-log-summary");
  if (!list || !summary) return;
  if (!auditLogsAvailable) {
    summary.textContent = "Auditoria ainda não configurada";
    list.innerHTML = `<p class="adjustment-note">Execute a migração 020 no Supabase para começar a registrar as atividades.</p>`;
    return;
  }
  const logs = data.auditLogs.filter(log => {
    const entityGroup = AUDIT_ENTITY_INFO[log.entityType]?.group || log.entityType;
    return (selectedAuditEntity === "all" || entityGroup === selectedAuditEntity)
      && (selectedAuditAction === "all" || log.action === selectedAuditAction);
  });
  summary.textContent = `${logs.length} ${logs.length === 1 ? "atividade exibida" : "atividades exibidas"}`;
  list.innerHTML = logs.length ? logs.map(log => {
    const entity = AUDIT_ENTITY_INFO[log.entityType] || { label: log.entityType };
    const action = AUDIT_ACTION_INFO[log.action] || { label: log.action, className: "updated" };
    const actor = log.adminEmail || "Administrador";
    const details = auditChangeSummary(log);
    return `<article class="audit-log-item"><span class="audit-action audit-${action.className}">${action.label}</span><div class="audit-log-copy"><strong>${escapeHtml(entity.label)} · ${escapeHtml(auditRecordLabel(log))}</strong><small>${escapeHtml(actor)} · ${escapeHtml(formatAuditDate(log.createdAt))}</small>${details ? `<p>${escapeHtml(details)}</p>` : ""}</div></article>`;
  }).join("") : `<div class="empty-state">Nenhuma atividade encontrada para estes filtros.</div>`;
}
function exportPlayerName(playerId) {
  return data.players.find(player => player.id === playerId)?.name || "Atleta não encontrado";
}
function safeSpreadsheetValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}
function csvCell(value) {
  return `"${safeSpreadsheetValue(value).replaceAll('"', '""')}"`;
}
function csvDocument(headers, rows) {
  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n")}`;
}
function downloadBackupFile(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportDateStamp() {
  return new Date().toISOString().slice(0, 10);
}
function exportDataset(type) {
  if (type === "players") {
    const attendanceByPlayer = Object.fromEntries(getAttendanceStats().map(item => [item.player.id, item]));
    const rows = getStats().map(item => [
      item.player.id, item.player.name, shirtNumber(item.player), item.player.position,
      item.games, item.goals, item.assists, item.craque, item.xerife, item.paredao,
      attendanceByPlayer[item.player.id]?.present || 0,
      attendanceByPlayer[item.player.id]?.absent || 0,
      attendanceByPlayer[item.player.id]?.unknown || 0,
      item.player.photo || ""
    ]);
    return {
      filename: `gpfc-atletas-estatisticas-${SEASON}-${exportDateStamp()}.csv`,
      headers: ["id", "atleta", "camisa", "posicao", "jogos", "gols", "assistencias", "craque", "xerife", "paredao", "presencas", "faltas", "duvidas", "foto_url"],
      rows
    };
  }
  if (type === "rounds") {
    return {
      filename: `gpfc-rodadas-${SEASON}-${exportDateStamp()}.csv`,
      headers: ["id", "temporada", "rodada", "data", "local", "status", "presenca_fechada", "confrontos"],
      rows: data.rounds.map(round => [round.id, SEASON, round.number, round.date, round.place, round.status, round.attendanceClosed ? "sim" : "nao", roundGames(round.id).length])
    };
  }
  if (type === "games") {
    return {
      filename: `gpfc-confrontos-${SEASON}-${exportDateStamp()}.csv`,
      headers: ["id", "temporada", "rodada", "jogo", "data", "local", "time_1", "placar_time_1", "placar_time_2", "time_2", "decisao", "vencedor", "status"],
      rows: data.games.map(game => {
        const round = getRoundById(game.roundId);
        const winner = game.winnerSide === "home" ? game.home : game.winnerSide === "away" ? game.away : "empate";
        return [game.id, SEASON, round?.number || "", game.number, game.date, game.place, game.home, game.homeScore, game.awayScore, game.away, resultLabel(game), winner, game.status];
      })
    };
  }
  if (type === "attendance") {
    const rows = data.rounds.flatMap(round => Object.entries(data.attendance[round.id] || {}).map(([playerId, status]) => [
      round.id, round.number, round.date, playerId, exportPlayerName(playerId), attendanceMeta(status).title, status
    ]));
    return {
      filename: `gpfc-presencas-${SEASON}-${exportDateStamp()}.csv`,
      headers: ["rodada_id", "rodada", "data", "atleta_id", "atleta", "situacao", "codigo_situacao"],
      rows
    };
  }
  const rows = data.goalEvents.map(event => {
    const game = data.games.find(item => item.id === event.gameId);
    const round = getRoundById(game?.roundId);
    return [
      event.id, round?.number || "", game?.number || "", event.number, event.team,
      event.scorerId || "", exportPlayerName(event.scorerId),
      event.assisterId || "", event.assisterId ? exportPlayerName(event.assisterId) : "Sem assistência",
      event.ownGoal ? "sim" : "nao"
    ];
  });
  return {
    filename: `gpfc-gols-assistencias-${SEASON}-${exportDateStamp()}.csv`,
    headers: ["evento_id", "rodada", "jogo", "numero_evento", "time", "autor_id", "autor", "assistente_id", "assistente", "gol_contra"],
    rows
  };
}
function renderExportBackupSummary() {
  const summary = document.querySelector("#export-backup-summary");
  if (!summary) return;
  summary.textContent = `${data.players.length} atletas · ${data.rounds.length} rodadas · ${data.games.length} confrontos · ${data.goalEvents.length} gols registrados`;
}
function exportSelectedCsv() {
  if (!requireAdmin()) return;
  const type = document.querySelector("#export-data-type")?.value || "players";
  const dataset = exportDataset(type);
  downloadBackupFile(csvDocument(dataset.headers, dataset.rows), dataset.filename, "text/csv;charset=utf-8");
  toast(`CSV gerado com ${dataset.rows.length} registros.`);
}
function exportCompleteBackup() {
  if (!requireAdmin()) return;
  const backup = {
    metadata: { project: "G.P.F.C - Galera da Pelada", season: SEASON, generatedAt: new Date().toISOString(), version: 1 },
    ...data
  };
  downloadBackupFile(JSON.stringify(backup, null, 2), `gpfc-backup-completo-${SEASON}-${exportDateStamp()}.json`, "application/json;charset=utf-8");
  toast("Backup completo gerado com sucesso.");
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
  const saveRoundButton = document.querySelector("#save-round-button");
  const finishButton = document.querySelector("#finish-round-button");
  const deleteButton = document.querySelector("#delete-round-button");
  const gameContext = document.querySelector("#round-game-context");
  if (!roundsAvailable) {
    summary.innerHTML = `<span class="round-status draft">AÇÃO NECESSÁRIA</span><p>Execute a migração 007 no Supabase para ativar as rodadas semanais.</p>`;
    finishButton.disabled = true;
    deleteButton.hidden = true;
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
    finishButton.textContent = `Finalizar ${roundLabel(activeRound)}`;
    deleteButton.hidden = false;
    deleteButton.disabled = false;
    saveRoundButton.innerHTML = `Salvar ${roundLabel(activeRound)} <span>→</span>`;
    gameContext.textContent = `${roundLabel(activeRound).toUpperCase()} · ${roundStatusLabel(activeRound).toUpperCase()}`;
  } else {
    roundNumber.value = getNextRoundNumber();
    roundDate.value = new Date().toISOString().slice(0, 10);
    roundPlace.value = DEFAULT_VENUE_NAME;
    summary.innerHTML = `<span class="round-status draft">PRÓXIMA RODADA</span><p>Preencha os dados e salve para abrir a ${roundLabel({ number: getNextRoundNumber() })}.</p>`;
    finishButton.disabled = true;
    finishButton.textContent = "Finalizar rodada";
    deleteButton.hidden = true;
    saveRoundButton.innerHTML = `Iniciar ${roundLabel({ number: getNextRoundNumber() })} <span>→</span>`;
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
  const newGameButton = document.querySelector("#new-game-button");
  submit.innerHTML = editing ? "Salvar alterações <span>→</span>" : activeRound ? "Finalizar confronto <span>→</span>" : "Inicie a rodada para lançar confrontos <span>→</span>";
  submit.disabled = !roundsAvailable || !attendanceAvailable || !rodizioAvailable || !goalEventsAvailable || (!editing && !activeRound);
  newGameButton.disabled = false;
  newGameButton.dataset.tooltip = !roundsAvailable ? "Execute a migração 007 para ativar as rodadas." : !attendanceAvailable ? "Execute a migração 008 para ativar a presença." : !rodizioAvailable ? "Execute a migração 009 para ativar o modo Rodízio." : !activeRound ? "Salve a Rodada da Semana primeiro." : "Adicionar novo confronto";
  newGameButton.classList.toggle("needs-setup", !roundsAvailable || !attendanceAvailable || !rodizioAvailable || !activeRound);
  const attendanceButton = document.querySelector("#close-attendance-button");
  if (attendanceButton) attendanceButton.disabled = !roundsAvailable || !attendanceAvailable || !activeRound;
  document.querySelector("#cancel-game-edit").hidden = !editing;
  syncGameFormWithRound();
}
function updateGameFormState() {
  const editing = Boolean(editingGameId);
  const activeRound = getActiveRound();
  const submit = document.querySelector("#game-submit");
  const newGameButton = document.querySelector("#new-game-button");
  submit.innerHTML = editing ? "Salvar alterações <span>→</span>" : activeRound ? "Finalizar confronto <span>→</span>" : "Inicie a rodada para lançar confrontos <span>→</span>";
  submit.disabled = !roundsAvailable || !attendanceAvailable || !rodizioAvailable || !goalEventsAvailable || (!editing && !activeRound);
  newGameButton.disabled = false;
  newGameButton.dataset.tooltip = !roundsAvailable ? "Execute a migração 007 para ativar as rodadas." : !attendanceAvailable ? "Execute a migração 008 para ativar a presença." : !rodizioAvailable ? "Execute a migração 009 para ativar o modo Rodízio." : !goalEventsAvailable ? "Execute a migração 010 para registrar gols e assistências." : !activeRound ? "Salve a Rodada da Semana primeiro." : "Adicionar novo confronto";
  newGameButton.classList.toggle("needs-setup", !roundsAvailable || !attendanceAvailable || !rodizioAvailable || !goalEventsAvailable || !activeRound);
  const attendanceButton = document.querySelector("#close-attendance-button");
  if (attendanceButton) attendanceButton.disabled = !roundsAvailable || !attendanceAvailable || !activeRound;
  document.querySelector("#cancel-game-edit").hidden = !editing;
  syncGameFormWithRound();
}
function renderAll() {
  renderDirectors();
  renderHome();
  renderHomeHighlights();
  renderHomeClips();
  renderHomeNotices();
  renderPublicAttendanceConfirmation();
  renderMediaGallery();
  renderHallOfFame();
  renderRanking();
  renderPublicRounds();
  renderPlayers(document.querySelector("#player-search")?.value || "");
  ensureTeamSelectors();
  renderGameFields();
  renderSavedGames();
  renderAdminPlayers();
  renderAdminDirectors();
  renderAdjustmentForm();
  renderRoundWeek();
  renderRoundAwards();
  renderAdminHighlightClips();
  renderAdminNotices();
  renderAdminMedia();
  renderAdminHallOfFame();
  renderAdminAuditLogs();
  renderExportBackupSummary();
  updateGameFormState();
}
const VIEW_PAGE_TITLES = {
  inicio: "G.P.F.C - Galera da Pelada | Camaragibe PE - Desde 2016",
  rankings: "Rankings | G.P.F.C - Galera da Pelada",
  rodadas: "Rodadas | G.P.F.C - Galera da Pelada",
  atletas: "Atletas | G.P.F.C - Galera da Pelada",
  midias: "Mídias | G.P.F.C - Galera da Pelada",
  "hall-da-fama": "Hall da Fama | G.P.F.C - Galera da Pelada",
  admin: "Admin | G.P.F.C - Galera da Pelada"
};

function showView(id) {
  if (id === "admin" && !isAdmin) return openLoginModal();
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active-view", view.id === id));
  document.querySelectorAll(".nav-link").forEach(button => {
    const isCurrentView = button.dataset.viewTarget === id;
    button.classList.toggle("active", isCurrentView);
    button.toggleAttribute("aria-current", isCurrentView);
  });
  document.title = VIEW_PAGE_TITLES[id] || VIEW_PAGE_TITLES.inicio;
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
  const [playersResult, gamesResult, statsResult, adjustmentsResult, roundsResult, attendanceResult, awardsResult, goalEventsResult, highlightClipsResult, directorsResult, noticesResult, mediaItemsResult, mediaPlayersResult, hallAwardsResult, auditLogsResult] = await Promise.all([
    supabaseClient.from("players").select("*").order("full_name"),
    supabaseClient.from("games").select("*").order("played_on", { ascending: false }),
    supabaseClient.from("player_game_stats").select("*"),
    supabaseClient.from("player_season_adjustments").select("*").eq("season", SEASON),
    supabaseClient.from("rounds").select("*").eq("season", SEASON).order("round_number"),
    supabaseClient.from("round_attendance").select("*"),
    supabaseClient.from("round_awards").select("*"),
    supabaseClient.from("game_goal_events").select("*").order("event_number"),
    supabaseClient.from("round_highlight_clips").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("director_profiles").select("*").order("slot"),
    supabaseClient.from("bulletin_notices").select("*").order("published_at", { ascending: false }),
    supabaseClient.from("media_items").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("media_item_players").select("*"),
    supabaseClient.from("hall_of_fame_awards").select("*").order("award_year", { ascending: false }),
    isAdmin
      ? supabaseClient.from("admin_activity_logs").select("*").order("created_at", { ascending: false }).limit(150)
      : Promise.resolve({ data: [], error: null })
  ]);
  const error = playersResult.error || gamesResult.error || statsResult.error || adjustmentsResult.error;
  if (error) { toast(`Não foi possível carregar os dados: ${error.message}`); return; }
  roundsAvailable = !roundsResult.error;
  attendanceAvailable = !attendanceResult.error;
  rodizioAvailable = !awardsResult.error;
  goalEventsAvailable = !goalEventsResult.error;
  highlightClipsAvailable = !highlightClipsResult.error;
  directorsAvailable = !directorsResult.error;
  noticesAvailable = !noticesResult.error;
  mediaAvailable = !mediaItemsResult.error && !mediaPlayersResult.error;
  hallOfFameAvailable = !hallAwardsResult.error;
  auditLogsAvailable = !auditLogsResult.error;
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
  const mediaPlayersByItem = (mediaPlayersResult.data || []).reduce((all, item) => {
    all[item.media_id] ||= [];
    all[item.media_id].push(item.player_id);
    return all;
  }, {});
  data = {
    players: (playersResult.data || []).map(player => ({ id: player.id, name: player.full_name, shirtNumber: player.shirt_number, position: player.position, photo: player.photo_url })),
    games: (gamesResult.data || []).map(game => ({ id: game.id, roundId: game.round_id, number: game.game_number, date: game.played_on, place: game.place, home: game.home_team, away: game.away_team, homeScore: game.home_score, awayScore: game.away_score, resultMethod: game.result_method, winnerSide: game.winner_side, status: game.status || "completed", stats: gameStats.get(game.id) || [] })),
    rounds: (roundsResult.data || []).map(round => ({ id: round.id, number: round.round_number, date: round.played_on, place: round.place, status: round.status, attendanceClosed: Boolean(round.attendance_closed) })),
    adjustments: Object.fromEntries((adjustmentsResult.data || []).map(adjustment => [adjustment.player_id, adjustment])),
    attendance: (attendanceResult.data || []).reduce((all, item) => {
      all[item.round_id] ||= {};
      all[item.round_id][item.player_id] = item.status;
      return all;
    }, {}),
    roundAwards: (awardsResult.data || []).map(award => ({ roundId: award.round_id, playerId: award.player_id, category: award.category })),
    goalEvents: (goalEventsResult.data || []).map(event => ({ id: event.id, gameId: event.game_id, team: String(event.team_number), scorerId: event.scorer_id, assisterId: event.assister_id, ownGoal: Boolean(event.is_own_goal), number: event.event_number })),
    highlightClips: (highlightClipsResult.data || []).map(clip => ({ id: clip.id, roundId: clip.round_id, playerId: clip.player_id, type: clip.clip_type, instagramUrl: clip.instagram_url, caption: clip.caption, createdAt: clip.created_at })),
    directors: (directorsResult.data || []).map(director => ({ id: director.id, slot: director.slot, name: director.full_name, role: director.role, instagramUrl: director.instagram_url, photo: director.photo_url })),
    notices: (noticesResult.data || []).map(notice => ({ id: notice.id, title: notice.title, message: notice.message, category: notice.category, pinned: Boolean(notice.is_pinned), status: notice.status, expiresOn: notice.expires_on, publishedAt: notice.published_at })),
    mediaItems: (mediaItemsResult.data || []).map(item => ({
      id: item.id,
      mediaType: item.media_type,
      title: item.title,
      description: item.description,
      year: item.media_year,
      category: item.category,
      roundId: item.round_id,
      sourceUrl: item.source_url,
      featured: Boolean(item.is_featured),
      status: item.status,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      playerIds: mediaPlayersByItem[item.id] || []
    })),
    hallAwards: (hallAwardsResult.data || []).map(award => ({
      id: award.id,
      year: award.award_year,
      category: award.category,
      winnerName: award.winner_name,
      playerId: award.player_id,
      photoUrl: award.photo_url,
      note: award.note,
      status: award.status,
      createdAt: award.created_at,
      updatedAt: award.updated_at
    })),
    auditLogs: (auditLogsResult.data || []).map(log => ({
      id: log.id,
      adminUserId: log.admin_user_id,
      adminEmail: log.admin_email,
      action: log.action,
      entityType: log.entity_type,
      recordId: log.record_id,
      oldData: log.old_data,
      newData: log.new_data,
      createdAt: log.created_at
    }))
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
  if (file.size > 5_000_000) { toast("Escolha uma foto de até 5 MB."); input.value = ""; return false; }
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
async function uploadMediaPhoto(file) {
  if (!file) return null;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (!allowedTypes.includes(file.type)) throw new Error("Envie uma foto JPG, PNG, WEBP ou AVIF.");
  if (file.size > MEDIA_PHOTO_MAX_BYTES) throw new Error("Escolha uma foto de até 5 MB.");
  const extensionByType = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensionByType[file.type] || "jpg"}`;
  const path = `${SEASON}/${fileName}`;
  const { error } = await supabaseClient.storage.from(MEDIA_PHOTO_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return supabaseClient.storage.from(MEDIA_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
async function uploadHallPhoto(file, year) {
  if (!file) return null;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (!allowedTypes.includes(file.type)) throw new Error("Envie uma foto JPG, PNG, WEBP ou AVIF.");
  if (file.size > HALL_PHOTO_MAX_BYTES) throw new Error("Escolha uma foto de até 5 MB.");
  const extensionByType = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensionByType[file.type] || "jpg"}`;
  const path = `${year}/${fileName}`;
  const { error } = await supabaseClient.storage.from(HALL_PHOTO_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return supabaseClient.storage.from(HALL_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
async function uploadDirectorPhoto(directorId, file) {
  if (!file) return null;
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${directorId}/${Date.now()}.${extension}`;
  const { error } = await supabaseClient.storage.from(DIRECTOR_PHOTO_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return supabaseClient.storage.from(DIRECTOR_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
function resetDirectorCropper() {
  if (directorCropState?.objectUrl) URL.revokeObjectURL(directorCropState.objectUrl);
  directorCropState = null;
  const cropper = document.querySelector("#director-cropper");
  const image = document.querySelector("#director-crop-image");
  const zoom = document.querySelector("#director-crop-zoom");
  if (cropper) cropper.hidden = true;
  if (image) image.removeAttribute("src");
  if (zoom) zoom.value = "1";
}
function updateDirectorCropper() {
  if (!directorCropState) return;
  const state = directorCropState;
  const scale = state.baseScale * state.zoom;
  const width = state.image.naturalWidth * scale;
  const height = state.image.naturalHeight * scale;
  state.x = clamp(state.x, DIRECTOR_CROP_SIZE - width, 0);
  state.y = clamp(state.y, DIRECTOR_CROP_SIZE - height, 0);
  const preview = document.querySelector("#director-crop-image");
  preview.style.width = `${width}px`;
  preview.style.height = `${height}px`;
  preview.style.left = `${state.x}px`;
  preview.style.top = `${state.y}px`;
  document.querySelector("#director-crop-zoom").value = String(state.zoom);
}
function startDirectorCropper(file) {
  resetDirectorCropper();
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const baseScale = Math.max(DIRECTOR_CROP_SIZE / image.naturalWidth, DIRECTOR_CROP_SIZE / image.naturalHeight);
    const width = image.naturalWidth * baseScale;
    const height = image.naturalHeight * baseScale;
    directorCropState = { file, image, objectUrl, baseScale, zoom: 1, x: (DIRECTOR_CROP_SIZE - width) / 2, y: (DIRECTOR_CROP_SIZE - height) / 2, pointerId: null };
    document.querySelector("#director-crop-image").src = objectUrl;
    document.querySelector("#director-cropper").hidden = false;
    updateDirectorCropper();
  };
  image.src = objectUrl;
}
async function croppedDirectorPhoto() {
  if (!directorCropState) return pendingDirectorPhotoFile;
  const state = directorCropState;
  const scale = state.baseScale * state.zoom;
  const sourceSize = DIRECTOR_CROP_SIZE / scale;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  context.drawImage(state.image, -state.x / scale, -state.y / scale, sourceSize, sourceSize, 0, 0, 512, 512);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Não foi possível preparar o recorte da foto.");
  return new File([blob], "diretor.jpg", { type: "image/jpeg" });
}
function resetPlayerCropper() {
  if (playerCropState?.objectUrl) URL.revokeObjectURL(playerCropState.objectUrl);
  playerCropState = null;
  const cropper = document.querySelector("#player-cropper");
  const image = document.querySelector("#player-crop-image");
  const zoom = document.querySelector("#player-crop-zoom");
  if (cropper) cropper.hidden = true;
  if (image) image.removeAttribute("src");
  if (zoom) zoom.value = "1";
}
function updatePlayerCropper() {
  if (!playerCropState) return;
  const state = playerCropState;
  const scale = state.baseScale * state.zoom;
  const width = state.image.naturalWidth * scale;
  const height = state.image.naturalHeight * scale;
  state.x = clamp(state.x, DIRECTOR_CROP_SIZE - width, 0);
  state.y = clamp(state.y, DIRECTOR_CROP_SIZE - height, 0);
  const preview = document.querySelector("#player-crop-image");
  preview.style.width = `${width}px`;
  preview.style.height = `${height}px`;
  preview.style.left = `${state.x}px`;
  preview.style.top = `${state.y}px`;
  document.querySelector("#player-crop-zoom").value = String(state.zoom);
}
function startPlayerCropper(file) {
  resetPlayerCropper();
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const baseScale = Math.max(DIRECTOR_CROP_SIZE / image.naturalWidth, DIRECTOR_CROP_SIZE / image.naturalHeight);
    const width = image.naturalWidth * baseScale;
    const height = image.naturalHeight * baseScale;
    playerCropState = { file, image, objectUrl, baseScale, zoom: 1, x: (DIRECTOR_CROP_SIZE - width) / 2, y: (DIRECTOR_CROP_SIZE - height) / 2, pointerId: null };
    document.querySelector("#player-crop-image").src = objectUrl;
    document.querySelector("#player-cropper").hidden = false;
    updatePlayerCropper();
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    toast("Não foi possível abrir esta imagem.");
  };
  image.src = objectUrl;
}
async function croppedPlayerPhoto() {
  if (!playerCropState) return pendingEditPhotoFile;
  const state = playerCropState;
  const scale = state.baseScale * state.zoom;
  const sourceSize = DIRECTOR_CROP_SIZE / scale;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  context.drawImage(state.image, -state.x / scale, -state.y / scale, sourceSize, sourceSize, 0, 0, 512, 512);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Não foi possível preparar o recorte da foto.");
  return new File([blob], "atleta.jpg", { type: "image/jpeg" });
}
function previewPhoto(element, player, source = player?.photo) {
  element.innerHTML = source ? `<img src="${source}" alt="Prévia da foto de ${escapeHtml(displayName(player))}" />` : initials(player);
}
function resetGameForm() {
  editingGameId = null;
  manualScoreMode = false;
  attendanceFilter = "all";
  attendanceDirty = false;
  gameDraftEntries = null;
  gameGoalEvents = [];
  lineupSearchText = "";
  const form = document.querySelector("#game-form");
  form.reset();
  fillTeamSelectors("1", "2");
  document.querySelector("#result-method").value = "regular";
  document.querySelector("#winner-side").value = "";
  const activeRound = getActiveRound();
  document.querySelector("#game-date").value = activeRound?.date || new Date().toISOString().slice(0, 10);
  document.querySelector("#game-place").value = activeRound?.place || DEFAULT_VENUE_NAME;
  renderGameFields();
  updateGameFormState();
}
function prepareNextGameFromWinner() {
  editingGameId = null;
  manualScoreMode = false;
  attendanceFilter = "all";
  gameGoalEvents = [];
  lineupSearchText = "";
  const round = getActiveRound();
  const latest = roundGames(round?.id).slice(-1)[0];
  const form = document.querySelector("#game-form");
  form.reset();
  document.querySelector("#game-date").value = round?.date || new Date().toISOString().slice(0, 10);
  document.querySelector("#game-place").value = round?.place || DEFAULT_VENUE_NAME;
  document.querySelector("#result-method").value = "regular";
  document.querySelector("#winner-side").value = "";
  if (!latest?.winnerSide) {
    const first = getNextTeamNumber(round?.id);
    const second = String(Math.min(TEAM_LIMIT, number(first) + 1));
    fillTeamSelectors(first, second === first ? "1" : second);
    gameDraftEntries = null;
    renderGameFields();
    updateGameFormState();
    return;
  }
  const winnerTeam = gameTeamNumber(latest, latest.winnerSide);
  const nextTeam = getNextTeamNumber(round?.id);
  fillTeamSelectors(winnerTeam, nextTeam === winnerTeam ? String(Math.min(TEAM_LIMIT, number(winnerTeam) + 1)) : nextTeam);
  const winnerIds = new Set(latest.stats.filter(entry => String(entry.team) === String(winnerTeam)).map(entry => entry.playerId));
  gameDraftEntries = new Map(data.players.map(player => [player.id, {
    attendance: winnerIds.has(player.id) ? "present" : attendanceFor(player.id),
    team: winnerIds.has(player.id) ? winnerTeam : "",
    goals: 0,
    assists: 0
  }]));
  renderGameFields();
  updateGameFormState();
}
function openGameEditor(gameId) {
  if (!requireAdmin()) return;
  const game = data.games.find(item => item.id === gameId);
  if (!game) return;
  if (game.roundId) activeRoundId = game.roundId;
  editingGameId = game.id;
  const savedEntries = new Map(game.stats.map(entry => [entry.playerId, entry]));
  gameDraftEntries = new Map(data.players.map(player => {
    const saved = savedEntries.get(player.id);
    return [player.id, {
      attendance: saved ? "present" : attendanceFor(player.id),
      team: saved?.team || "",
      goals: 0,
      assists: 0
    }];
  }));
  gameGoalEvents = data.goalEvents.filter(event => event.gameId === game.id).map(event => ({ ...event }));
  manualScoreMode = gameGoalEvents.length === 0;
  lineupSearchText = "";
  document.querySelector("#game-date").value = game.date;
  document.querySelector("#game-place").value = game.place || "";
  fillTeamSelectors(gameTeamNumber(game, "home"), gameTeamNumber(game, "away"));
  document.querySelector("#score-home").value = game.homeScore;
  document.querySelector("#score-away").value = game.awayScore;
  document.querySelector("#result-method").value = game.resultMethod || "regular";
  document.querySelector("#winner-side").value = game.winnerSide || "";
  renderGameFields();
  renderRoundWeek();
  updateGameFormState();
  toast("Confronto aberto para edição.");
}
function closePlayerEditModal() {
  document.querySelector("#player-edit-modal").hidden = true;
  pendingEditPhotoFile = null;
  resetPlayerCropper();
}
function closeDirectorEditModal() {
  document.querySelector("#director-edit-modal").hidden = true;
  pendingDirectorPhotoFile = null;
  resetDirectorCropper();
}
function openDirectorEdit(directorId) {
  if (!requireAdmin() || !directorsAvailable) return;
  const director = data.directors.find(item => item.id === directorId);
  if (!director) return;
  document.querySelector("#edit-director-id").value = director.id;
  document.querySelector("#edit-director-name").value = director.name;
  document.querySelector("#edit-director-role").value = director.role;
  document.querySelector("#edit-director-instagram").value = director.instagramUrl;
  document.querySelector("#edit-director-photo").value = "";
  resetDirectorCropper();
  document.querySelector("#edit-director-photo-preview").innerHTML = director.photo
    ? `<img src="${escapeHtml(director.photo)}" alt="Prévia da foto de ${escapeHtml(director.name)}" />`
    : `<img src="assets/escudo-moderno-gpfc.webp" alt="Escudo do G.P.F.C" />`;
  pendingDirectorPhotoFile = null;
  document.querySelector("#director-edit-modal").hidden = false;
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
  resetPlayerCropper();
  document.querySelector("#edit-player-photo").value = "";
  document.querySelector("#player-edit-modal").hidden = false;
}

function handleGameFieldsChange(event) {
  if (!event.target.matches(".field-attendance")) return;
  gameDraftEntries = captureGameDraftEntries();
  const playerId = event.target.closest(".game-player-row")?.dataset.playerId;
  const entry = gameDraftEntries.get(playerId);
  if (entry?.attendance !== "present") {
    entry.team = "";
    gameGoalEvents = gameGoalEvents.filter(goal => goal.scorerId !== playerId && goal.assisterId !== playerId);
  }
  renderGameFields();
}
function handleTeamHeaderChange() {
  gameDraftEntries = captureGameDraftEntries();
  refreshWinnerChoices();
  const allowed = new Set([document.querySelector("#team-home").value, document.querySelector("#team-away").value]);
  gameDraftEntries.forEach(entry => { if (entry.team && !allowed.has(String(entry.team))) entry.team = ""; });
  gameGoalEvents = gameGoalEvents.filter(event => allowed.has(String(event.team)));
  renderGameFields();
}
function handleLineupSummaryClick(event) {
  const remove = event.target.closest("[data-remove-player]");
  if (remove) {
    gameDraftEntries = captureGameDraftEntries();
    const playerId = remove.dataset.removePlayer;
    const entry = gameDraftEntries.get(playerId);
    if (entry) entry.team = "";
    gameGoalEvents = gameGoalEvents.filter(goal => goal.scorerId !== playerId && goal.assisterId !== playerId);
    renderGameFields();
    return true;
  }
  return false;
}
document.querySelector("#lineup-builder").addEventListener("input", event => {
  if (!event.target.matches("#lineup-player-search")) return;
  lineupSearchText = event.target.value;
  renderLineupBuilder();
  const search = document.querySelector("#lineup-player-search");
  search?.focus();
  search?.setSelectionRange(lineupSearchText.length, lineupSearchText.length);
});
document.querySelector("#lineup-builder").addEventListener("click", event => {
  const action = event.target.closest("[data-assign-player]");
  if (!action) return;
  gameDraftEntries = captureGameDraftEntries();
  const player = data.players.find(item => item.id === action.dataset.assignPlayer);
  const entry = gameDraftEntries.get(player?.id);
  if (!player || !entry) return;
  const previousTeam = entry.team;
  entry.team = action.dataset.assignTeam;
  if (!validateLineupAssignment(player, entry.team)) {
    entry.team = "";
    toast(isGoalkeeper(player) ? "Cada time pode ter apenas 1 goleiro." : "Cada time pode ter até 5 atletas de linha.");
    renderGameFields();
    return;
  }
  if (previousTeam && previousTeam !== entry.team) gameGoalEvents = gameGoalEvents.filter(goal => goal.scorerId !== player.id && goal.assisterId !== player.id);
  renderGameFields();
});
document.querySelector("#toggle-score-edit").addEventListener("click", () => {
  manualScoreMode = !manualScoreMode;
  if (!manualScoreMode) syncScoreFromGoalEvents();
  else updateScoreEditState();
});
document.querySelector("#goal-events").addEventListener("click", event => {
  if (event.target.closest("#add-goal-event")) {
    if (manualScoreMode) {
      manualScoreMode = false;
      toast("O placar voltou ao modo automático pelos gols registrados.");
    }
    const home = document.querySelector("#team-home").value;
    gameGoalEvents.push({ id: `draft-${++goalEventCounter}`, team: home, scorerId: "", assisterId: "", ownGoal: false });
    renderGoalEvents();
    return;
  }
  const remove = event.target.closest(".remove-goal-event");
  if (!remove) return;
  const eventId = remove.closest(".goal-event-row").dataset.goalEventId;
  gameGoalEvents = gameGoalEvents.filter(item => item.id !== eventId);
  renderGoalEvents();
});
document.querySelector("#goal-events").addEventListener("change", event => {
  if (!event.target.matches(".goal-team, .goal-scorer, .goal-assister, .goal-own-goal")) return;
  const row = event.target.closest(".goal-event-row");
  const goal = gameGoalEvents.find(item => item.id === row.dataset.goalEventId);
  if (!goal) return;
  if (event.target.matches(".goal-team")) {
    goal.team = event.target.value;
    goal.scorerId = "";
    goal.assisterId = "";
  } else if (event.target.matches(".goal-own-goal")) {
    goal.ownGoal = event.target.checked;
    goal.scorerId = "";
    goal.assisterId = "";
  } else if (event.target.matches(".goal-scorer")) {
    goal.scorerId = event.target.value;
    if (goal.assisterId === goal.scorerId) goal.assisterId = "";
  } else {
    goal.assisterId = event.target.value;
  }
  renderGoalEvents();
});
document.querySelectorAll("[data-view-target]").forEach(button => button.addEventListener("click", () => showView(button.dataset.viewTarget)));

document.querySelector("#home-round-card").addEventListener("click", event => {
  const button = event.target.closest("[data-view-target]");
  if (button) showView(button.dataset.viewTarget);
});
document.querySelectorAll("[data-admin-access]").forEach(button => button.addEventListener("click", () => isAdmin ? showView("admin") : openLoginModal()));
document.querySelector("#admin-access-button").addEventListener("click", () => isAdmin ? showView("admin") : openLoginModal());
document.querySelectorAll("[data-close-login]").forEach(button => button.addEventListener("click", closeLoginModal));
document.querySelectorAll("[data-close-player-edit]").forEach(button => button.addEventListener("click", closePlayerEditModal));
document.querySelectorAll("[data-close-director-edit]").forEach(button => button.addEventListener("click", closeDirectorEditModal));
document.querySelectorAll("[data-close-athlete-profile]").forEach(button => button.addEventListener("click", closeAthleteProfileModal));
document.querySelector("#admin-logout").addEventListener("click", async () => { await supabaseClient.auth.signOut(); await refreshAuthState(); showView("inicio"); toast("Sessão encerrada."); });
document.querySelectorAll(".ranking-tab").forEach(button => button.addEventListener("click", () => { selectedRanking = button.dataset.ranking; renderRanking(); }));
document.querySelector("#player-search").addEventListener("input", event => renderPlayers(event.target.value));
document.querySelector("#position-filters").addEventListener("click", event => {
  const button = event.target.closest("[data-position-filter]");
  if (!button) return;
  selectedPositionFilter = button.dataset.positionFilter;
  renderPlayers(document.querySelector("#player-search").value);
});
document.querySelector("#media-filters").addEventListener("click", event => {
  const button = event.target.closest("[data-media-type]");
  if (!button) return;
  selectedMediaType = button.dataset.mediaType;
  renderMediaGallery();
});
document.querySelector("#media-year-filter").addEventListener("change", event => {
  selectedMediaYear = event.target.value;
  renderMediaGallery();
});
document.querySelector("#media-category-filter").addEventListener("change", event => {
  selectedMediaCategory = event.target.value;
  renderMediaGallery();
});
document.querySelector("#hall-filters").addEventListener("click", event => {
  const button = event.target.closest("[data-hall-category]");
  if (!button) return;
  selectedHallCategory = button.dataset.hallCategory;
  renderHallOfFame();
});
document.querySelector("#hall-year-filter").addEventListener("change", event => {
  selectedHallYear = event.target.value;
  renderHallOfFame();
});
document.querySelector("#athletes-grid").addEventListener("click", event => {
  const card = event.target.closest("[data-open-athlete]");
  if (card) openAthleteProfile(card.dataset.openAthlete);
});
document.querySelector("#public-round-history").addEventListener("click", event => {
  const shareButton = event.target.closest("[data-share-round]");
  if (shareButton) {
    openShareRoundModal(shareButton.dataset.shareRound);
    return;
  }
  const button = event.target.closest("[data-toggle-round-details]");
  if (!button) return;
  const roundId = button.dataset.toggleRoundDetails;
  if (expandedPublicRoundIds.has(roundId)) expandedPublicRoundIds.delete(roundId);
  else expandedPublicRoundIds.add(roundId);
  renderPublicRounds();
});
document.querySelector("#public-round-week").addEventListener("click", event => {
  const button = event.target.closest("[data-share-round]");
  if (button) openShareRoundModal(button.dataset.shareRound);
});
document.querySelectorAll("[data-close-share-round]").forEach(button => button.addEventListener("click", closeShareRoundModal));
document.querySelector("#download-round-image").addEventListener("click", downloadRoundShareImage);
document.querySelector("#share-round-image").addEventListener("click", shareRoundImage);
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
  startPlayerCropper(file);
});
document.querySelector("#player-crop-zoom").addEventListener("input", event => {
  if (!playerCropState) return;
  const state = playerCropState;
  const previousScale = state.baseScale * state.zoom;
  const sourceCenterX = (DIRECTOR_CROP_SIZE / 2 - state.x) / previousScale;
  const sourceCenterY = (DIRECTOR_CROP_SIZE / 2 - state.y) / previousScale;
  state.zoom = number(event.target.value) || 1;
  const nextScale = state.baseScale * state.zoom;
  state.x = DIRECTOR_CROP_SIZE / 2 - sourceCenterX * nextScale;
  state.y = DIRECTOR_CROP_SIZE / 2 - sourceCenterY * nextScale;
  updatePlayerCropper();
});
document.querySelector("#player-crop-area").addEventListener("pointerdown", event => {
  if (!playerCropState) return;
  event.preventDefault();
  playerCropState.pointerId = event.pointerId;
  playerCropState.dragStartX = event.clientX;
  playerCropState.dragStartY = event.clientY;
  playerCropState.initialX = playerCropState.x;
  playerCropState.initialY = playerCropState.y;
  event.currentTarget.setPointerCapture(event.pointerId);
});
document.querySelector("#player-crop-area").addEventListener("pointermove", event => {
  const state = playerCropState;
  if (!state || state.pointerId !== event.pointerId) return;
  state.x = state.initialX + event.clientX - state.dragStartX;
  state.y = state.initialY + event.clientY - state.dragStartY;
  updatePlayerCropper();
});
document.querySelector("#player-crop-area").addEventListener("pointerup", event => {
  if (!playerCropState || playerCropState.pointerId !== event.pointerId) return;
  playerCropState.pointerId = null;
  event.currentTarget.releasePointerCapture(event.pointerId);
});
document.querySelector("#edit-director-photo").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file || !validatePlayerPhoto(file, event.target)) return;
  pendingDirectorPhotoFile = file;
  startDirectorCropper(file);
});
document.querySelector("#director-crop-zoom").addEventListener("input", event => {
  if (!directorCropState) return;
  const state = directorCropState;
  const previousScale = state.baseScale * state.zoom;
  const sourceCenterX = (DIRECTOR_CROP_SIZE / 2 - state.x) / previousScale;
  const sourceCenterY = (DIRECTOR_CROP_SIZE / 2 - state.y) / previousScale;
  state.zoom = number(event.target.value) || 1;
  const nextScale = state.baseScale * state.zoom;
  state.x = DIRECTOR_CROP_SIZE / 2 - sourceCenterX * nextScale;
  state.y = DIRECTOR_CROP_SIZE / 2 - sourceCenterY * nextScale;
  updateDirectorCropper();
});
document.querySelector("#director-crop-area").addEventListener("pointerdown", event => {
  if (!directorCropState) return;
  event.preventDefault();
  directorCropState.pointerId = event.pointerId;
  directorCropState.dragStartX = event.clientX;
  directorCropState.dragStartY = event.clientY;
  directorCropState.initialX = directorCropState.x;
  directorCropState.initialY = directorCropState.y;
  event.currentTarget.setPointerCapture(event.pointerId);
});
document.querySelector("#director-crop-area").addEventListener("pointermove", event => {
  const state = directorCropState;
  if (!state || state.pointerId !== event.pointerId) return;
  state.x = state.initialX + event.clientX - state.dragStartX;
  state.y = state.initialY + event.clientY - state.dragStartY;
  updateDirectorCropper();
});
document.querySelector("#director-crop-area").addEventListener("pointerup", event => {
  if (!directorCropState || directorCropState.pointerId !== event.pointerId) return;
  directorCropState.pointerId = null;
  event.currentTarget.releasePointerCapture(event.pointerId);
});
document.querySelector("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const errorBox = document.querySelector("#login-error");
  errorBox.textContent = "";
  const { error } = await supabaseClient.auth.signInWithPassword({ email: document.querySelector("#login-email").value.trim(), password: document.querySelector("#login-password").value });
  if (error) { errorBox.textContent = "E-mail ou senha inválidos."; return; }
  await refreshAuthState();
  if (!isAdmin) { errorBox.textContent = "Esta conta não tem autorização administrativa."; return; }
  await loadRemoteData();
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
  toast(`${roundLabel(savedRound)} foi salva sem limpar os dados que você já preencheu.`);
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
document.querySelector("#delete-round-button").addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const activeRound = getActiveRound();
  if (!activeRound) { toast("Abra uma rodada antes de excluir."); return; }
  const games = roundGames(activeRound.id);
  const message = `${roundLabel(activeRound)} será excluída com ${games.length} ${games.length === 1 ? "confronto" : "confrontos"}, presenças e destaques. Esta ação não pode ser desfeita. Continuar?`;
  if (!confirm(message)) return;
  const gameIds = games.map(game => game.id);
  if (gameIds.length) {
    const { error: statsError } = await supabaseClient.from("player_game_stats").delete().in("game_id", gameIds);
    if (statsError) { toast(`Não foi possível excluir as estatísticas: ${statsError.message}`); return; }
    const { error: gamesError } = await supabaseClient.from("games").delete().in("id", gameIds);
    if (gamesError) { toast(`Não foi possível excluir os confrontos: ${gamesError.message}`); return; }
  }
  const { error: roundError } = await supabaseClient.from("rounds").delete().eq("id", activeRound.id);
  if (roundError) { toast(`Não foi possível excluir a rodada: ${roundError.message}`); return; }
  activeRoundId = null;
  editingGameId = null;
  gameDraftEntries = null;
  gameGoalEvents = [];
  await loadRemoteData();
  resetGameForm();
  toast(`${roundLabel(activeRound)} de teste foi excluída.`);
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
  return handleGameFieldsChange(event);
  if (event.target.matches(".field-team")) {
    gameDraftEntries = captureGameDraftEntries();
    const playerId = event.target.closest(".game-player-row").dataset.playerId;
    const entry = gameDraftEntries.get(playerId);
    const player = data.players.find(item => item.id === playerId);
    if (entry.team) {
      const members = [...gameDraftEntries.entries()].filter(([, item]) => String(item.team) === String(entry.team));
      const linePlayers = members.filter(([id]) => !isGoalkeeper(data.players.find(playerItem => playerItem.id === id)));
      const goalkeepers = members.filter(([id]) => isGoalkeeper(data.players.find(playerItem => playerItem.id === id)));
      if ((isGoalkeeper(player) && goalkeepers.length > 1) || (!isGoalkeeper(player) && linePlayers.length > 5)) {
        entry.team = "";
        gameDraftEntries.set(playerId, entry);
        toast(isGoalkeeper(player) ? "Cada time pode ter apenas 1 goleiro." : "Cada time pode ter no máximo 5 jogadores de linha.");
        renderGameFields();
        return;
      }
    }
    renderLineupSummary(data.players.map(playerItem => ({ player: playerItem, entry: gameDraftEntries.get(playerItem.id) || {} })));
    return;
  }
  if (!event.target.matches(".field-attendance")) return;
  gameDraftEntries = captureGameDraftEntries();
  const entry = gameDraftEntries.get(event.target.closest(".game-player-row").dataset.playerId);
  if (entry.attendance !== "present") {
    entry.team = "";
    STAT_FIELDS.forEach(field => { entry[field] = 0; });
  }
  renderGameFields();
});
document.querySelector("#game-player-fields").addEventListener("click", event => {
  const filter = event.target.closest("[data-attendance-filter]");
  if (filter) {
    attendanceFilter = filter.dataset.attendanceFilter;
    renderGameFields();
    return;
  }
  const choice = event.target.closest("[data-attendance-status]");
  if (!choice || !requireAdmin()) return;
  if (isAttendanceClosed()) { toast("A lista de presença está fechada. Reabra-a para fazer alterações."); return; }
  gameDraftEntries = captureGameDraftEntries();
  const playerId = choice.closest(".game-player-row")?.dataset.playerId;
  const entry = gameDraftEntries.get(playerId);
  if (!entry) return;
  entry.attendance = choice.dataset.attendanceStatus;
  if (entry.attendance !== "present") {
    entry.team = "";
    gameGoalEvents = gameGoalEvents.filter(goal => goal.scorerId !== playerId && goal.assisterId !== playerId);
  }
  attendanceDirty = true;
  attendanceFilter = "all";
  renderGameFields();
});
document.querySelector("#mark-all-present").addEventListener("click", () => {
  if (!requireAdmin()) return;
  if (isAttendanceClosed()) { toast("A lista de presença está fechada. Reabra-a para fazer alterações."); return; }
  gameDraftEntries = captureGameDraftEntries();
  data.players.forEach(player => {
    const entry = gameDraftEntries.get(player.id) || {};
    entry.attendance = "present";
    gameDraftEntries.set(player.id, entry);
  });
  attendanceDirty = true;
  attendanceFilter = "all";
  renderGameFields();
  toast("Todos foram marcados como compareceram. Ajuste apenas quem faltou.");
});
document.querySelector("#copy-last-attendance").addEventListener("click", () => {
  if (!requireAdmin()) return;
  if (isAttendanceClosed()) { toast("A lista de presença está fechada. Reabra-a para fazer alterações."); return; }
  const currentRound = getActiveRound();
  const targetNumber = currentRound?.number || number(document.querySelector("#round-number").value);
  const previous = [...data.rounds]
    .filter(round => round.id !== currentRound?.id && number(round.number) < targetNumber)
    .sort((a, b) => b.number - a.number)
    .find(round => Object.keys(data.attendance[round.id] || {}).length);
  if (!previous) { toast("Ainda não existe uma rodada anterior com presença salva."); return; }
  gameDraftEntries = captureGameDraftEntries();
  data.players.forEach(player => {
    const entry = gameDraftEntries.get(player.id) || {};
    entry.attendance = data.attendance[previous.id]?.[player.id] || "unknown";
    if (entry.attendance !== "present") entry.team = "";
    gameDraftEntries.set(player.id, entry);
  });
  const presentIds = new Set(data.players.filter(player => gameDraftEntries.get(player.id)?.attendance === "present").map(player => player.id));
  gameGoalEvents = gameGoalEvents.filter(goal => presentIds.has(goal.scorerId) && (!goal.assisterId || presentIds.has(goal.assisterId)));
  attendanceDirty = true;
  attendanceFilter = "all";
  renderGameFields();
  toast(`Presença copiada da ${roundLabel(previous)}. Revise as alterações.`);
});
document.querySelectorAll("#team-home, #team-away").forEach(select => select.addEventListener("change", () => {
  return handleTeamHeaderChange();
  gameDraftEntries = captureGameDraftEntries();
  refreshWinnerChoices();
  const allowed = new Set([document.querySelector("#team-home").value, document.querySelector("#team-away").value]);
  gameDraftEntries.forEach(entry => {
    if (entry.team && !allowed.has(entry.team)) {
      entry.team = "";
      MATCH_STAT_FIELDS.forEach(field => { entry[field] = 0; });
    }
  });
  renderGameFields();
}));
document.querySelector("#lineup-summary").addEventListener("click", event => {
  if (handleLineupSummaryClick(event)) return;
  if (!event.target.closest("#copy-winner-button")) return;
  if (!requireAdmin()) return;
  prepareNextGameFromWinner();
  toast("Escalação vencedora copiada para o novo confronto.");
});
document.querySelector("#close-attendance-button").addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const round = getActiveRound();
  if (!round) { toast("Salve ou abra a Rodada da Semana antes de fechar a lista."); return; }
  const willClose = !isAttendanceClosed(round);
  const confirmation = willClose
    ? "Fechar a lista de presença? Você ainda poderá reabri-la depois, se precisar corrigir algo."
    : "Reabrir a lista de presença? Isso permitirá novas alterações.";
  if (!confirm(confirmation)) return;
  if (willClose) {
    gameDraftEntries = captureGameDraftEntries();
    const saved = await saveRoundAttendance(gameDraftEntries, { notify: false });
    if (!saved) { toast("Salve a presença antes de fechar a lista."); return; }
    attendanceDirty = false;
  }
  const { error } = await supabaseClient
    .from("rounds")
    .update({ attendance_closed: willClose, updated_at: new Date().toISOString() })
    .eq("id", round.id);
  if (error) {
    toast("Execute a migração 011 no Supabase para ativar o fechamento da lista de presença.");
    return;
  }
  await loadRemoteData();
  toast(willClose ? "Lista de presença fechada. Os nomes ficaram protegidos contra mudanças por engano." : "Lista de presença reaberta para edição.");
});
document.querySelector("#round-manual-awards").addEventListener("change", event => {
  const category = event.target.dataset.awardCategory;
  if (!category || !event.target.checked) return;
  const checked = [...document.querySelectorAll(`[data-award-category="${category}"]:checked`)];
  if (checked.length <= 2) return;
  event.target.checked = false;
  toast("Xerife e Paredão podem ter no máximo 2 atletas por rodada.");
});
document.querySelector("#round-awards-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  if (!rodizioAvailable) { toast("Execute a migração 009 no Supabase para salvar os destaques."); return; }
  const round = getActiveRound();
  if (!round) { toast("Abra uma rodada antes de salvar seus destaques."); return; }
  const craque = document.querySelector("#award-craque")?.value;
  if (!craque) { toast("Escolha o único Craque da rodada."); return; }
  const xerifes = [...document.querySelectorAll('[data-award-category="xerife"]:checked')].map(input => input.value);
  const paredoes = [...document.querySelectorAll('[data-award-category="paredao"]:checked')].map(input => input.value);
  if (xerifes.length > 2 || paredoes.length > 2) { toast("Xerife e Paredão permitem até 2 atletas cada."); return; }
  const { error: deleteError } = await supabaseClient.from("round_awards").delete().eq("round_id", round.id);
  if (deleteError) { toast(`Não foi possível atualizar os destaques: ${deleteError.message}`); return; }
  const awards = [
    { round_id: round.id, player_id: craque, category: "craque" },
    ...xerifes.map(playerId => ({ round_id: round.id, player_id: playerId, category: "xerife" })),
    ...paredoes.map(playerId => ({ round_id: round.id, player_id: playerId, category: "paredao" }))
  ];
  const { error } = await supabaseClient.from("round_awards").insert(awards);
  if (error) { toast(`Não foi possível salvar os destaques: ${error.message}`); return; }
  await loadRemoteData();
  toast("Destaques salvos no histórico da rodada.");
});
document.querySelector("#highlight-clip-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  if (!highlightClipsAvailable) { toast("Execute a migração 012 no Supabase para ativar os lances."); return; }
  const round = getActiveRound();
  if (!round) { toast("Abra uma rodada antes de adicionar um lance."); return; }
  const playerId = document.querySelector("#highlight-clip-player").value;
  const instagramUrl = document.querySelector("#highlight-clip-url").value.trim();
  const caption = document.querySelector("#highlight-clip-caption").value.trim();
  if (!roundHighlightPlayers(round.id).some(player => player.id === playerId)) { toast("Escolha um atleta que foi destaque desta rodada."); return; }
  if (!isInstagramUrl(instagramUrl)) { toast("Cole um link válido de Reel do Instagram."); return; }
  const { error } = await supabaseClient.from("round_highlight_clips").insert({
    round_id: round.id,
    player_id: playerId,
    clip_type: document.querySelector("#highlight-clip-type").value,
    instagram_url: instagramUrl,
    caption
  });
  if (error) { toast(`Não foi possível salvar o lance: ${error.message}`); return; }
  document.querySelector("#highlight-clip-form").reset();
  await loadRemoteData();
  toast("Lance adicionado e publicado na página inicial.");
});
document.querySelector("#highlight-clips-list").addEventListener("click", async event => {
  const button = event.target.closest("[data-delete-highlight-clip]");
  if (!button || !requireAdmin()) return;
  if (!confirm("Excluir este link de Reel?")) return;
  const { error } = await supabaseClient.from("round_highlight_clips").delete().eq("id", button.dataset.deleteHighlightClip);
  if (error) { toast(`Não foi possível excluir o lance: ${error.message}`); return; }
  await loadRemoteData();
  toast("Lance excluído.");
});
document.querySelector("#notice-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  if (!noticesAvailable) { toast("Execute a migração 016 no Supabase para ativar o mural."); return; }
  const id = document.querySelector("#notice-id").value;
  const title = document.querySelector("#notice-title").value.trim();
  const message = document.querySelector("#notice-message").value.trim();
  if (title.length < 2 || message.length < 2) { toast("Preencha o título e a mensagem do aviso."); return; }
  const payload = {
    title,
    message,
    category: document.querySelector("#notice-category").value,
    is_pinned: document.querySelector("#notice-pinned").checked,
    expires_on: document.querySelector("#notice-expires-on").value || null,
    updated_at: new Date().toISOString()
  };
  const request = id
    ? supabaseClient.from("bulletin_notices").update(payload).eq("id", id)
    : supabaseClient.from("bulletin_notices").insert(payload);
  const { error } = await request;
  if (error) { toast(`Não foi possível salvar o aviso: ${error.message}`); return; }
  resetNoticeForm();
  await loadRemoteData();
  toast(id ? "Aviso atualizado no mural." : "Aviso publicado no mural.");
});
document.querySelector("#cancel-notice-edit").addEventListener("click", resetNoticeForm);
document.querySelector("#notices-admin-list").addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit-notice]");
  const archiveButton = event.target.closest("[data-archive-notice]");
  if (editButton) {
    if (!requireAdmin()) return;
    const notice = data.notices.find(item => item.id === editButton.dataset.editNotice);
    if (!notice) return;
    document.querySelector("#notice-id").value = notice.id;
    document.querySelector("#notice-title").value = notice.title;
    document.querySelector("#notice-message").value = notice.message;
    document.querySelector("#notice-category").value = notice.category;
    document.querySelector("#notice-pinned").checked = notice.pinned;
    document.querySelector("#notice-expires-on").value = notice.expiresOn || "";
    document.querySelector("#save-notice").innerHTML = `Salvar alterações <span>→</span>`;
    document.querySelector("#cancel-notice-edit").hidden = false;
    document.querySelector("#notice-form").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!archiveButton || !requireAdmin()) return;
  const notice = data.notices.find(item => item.id === archiveButton.dataset.archiveNotice);
  if (!notice) return;
  const archiving = notice.status !== "archived";
  if (!confirm(archiving ? "Arquivar este aviso? Ele deixará de aparecer para o público." : "Reativar este aviso no mural?")) return;
  const { error } = await supabaseClient.from("bulletin_notices")
    .update({ status: archiving ? "archived" : "active", updated_at: new Date().toISOString() })
    .eq("id", notice.id);
  if (error) { toast(`Não foi possível atualizar o aviso: ${error.message}`); return; }
  await loadRemoteData();
  toast(archiving ? "Aviso arquivado." : "Aviso reativado no mural.");
});
document.querySelector("#media-type").addEventListener("change", updateMediaFormFields);
document.querySelector("#cancel-media-edit").addEventListener("click", resetMediaForm);
document.querySelector("#media-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  if (!mediaAvailable) { toast("Execute a migração 018 no Supabase para ativar a galeria."); return; }
  const id = document.querySelector("#media-id").value;
  const existing = data.mediaItems.find(item => item.id === id);
  const mediaType = document.querySelector("#media-type").value;
  const title = document.querySelector("#media-title-input").value.trim();
  const description = document.querySelector("#media-description").value.trim();
  const year = number(document.querySelector("#media-year").value);
  const photoFile = document.querySelector("#media-photo").files[0];
  const externalUrl = document.querySelector("#media-url").value.trim();
  const playerIds = [...document.querySelectorAll('#media-player-options input[type="checkbox"]:checked')].map(input => input.value);
  if (title.length < 2 || year < 2016) { toast("Informe um título e um ano válido a partir de 2016."); return; }
  let sourceUrl = existing?.sourceUrl || "";
  try {
    if (mediaType === "photo") {
      if (photoFile) sourceUrl = await uploadMediaPhoto(photoFile);
      if (!sourceUrl || (existing && existing.mediaType !== "photo" && !photoFile)) throw new Error("Escolha a foto que será publicada.");
    } else {
      if (!isSafeHttpsUrl(externalUrl)) throw new Error("Informe um link de vídeo válido começando com https://.");
      sourceUrl = externalUrl;
    }
  } catch (error) {
    toast(`Não foi possível preparar a mídia: ${error.message}`);
    return;
  }
  const payload = {
    media_type: mediaType,
    title,
    description,
    media_year: year,
    category: document.querySelector("#media-category").value,
    round_id: document.querySelector("#media-round").value || null,
    source_url: sourceUrl,
    is_featured: document.querySelector("#media-featured").checked,
    status: existing?.status || "active",
    updated_at: new Date().toISOString()
  };
  let mediaId = id;
  if (id) {
    const { error } = await supabaseClient.from("media_items").update(payload).eq("id", id);
    if (error) { toast(`Não foi possível atualizar a mídia: ${error.message}`); return; }
  } else {
    const { data: inserted, error } = await supabaseClient.from("media_items").insert(payload).select("id").single();
    if (error) { toast(`Não foi possível publicar a mídia: ${error.message}`); return; }
    mediaId = inserted.id;
  }
  const { error: deleteLinksError } = await supabaseClient.from("media_item_players").delete().eq("media_id", mediaId);
  if (deleteLinksError) { toast(`A mídia foi salva, mas os atletas não foram atualizados: ${deleteLinksError.message}`); return; }
  if (playerIds.length) {
    const { error: linksError } = await supabaseClient.from("media_item_players").insert(playerIds.map(playerId => ({ media_id: mediaId, player_id: playerId })));
    if (linksError) { toast(`A mídia foi salva, mas os atletas não foram vinculados: ${linksError.message}`); return; }
  }
  resetMediaForm();
  await loadRemoteData();
  toast(id ? "Mídia atualizada na galeria." : "Mídia publicada na galeria.");
});
document.querySelector("#media-admin-list").addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit-media]");
  const archiveButton = event.target.closest("[data-archive-media]");
  if (editButton) {
    if (!requireAdmin()) return;
    const item = data.mediaItems.find(media => media.id === editButton.dataset.editMedia);
    if (!item) return;
    document.querySelector("#media-id").value = item.id;
    document.querySelector("#media-type").value = item.mediaType;
    document.querySelector("#media-year").value = item.year;
    document.querySelector("#media-title-input").value = item.title;
    document.querySelector("#media-description").value = item.description || "";
    document.querySelector("#media-category").value = item.category;
    document.querySelector("#media-round").value = item.roundId || "";
    document.querySelector("#media-url").value = item.mediaType === "video" ? item.sourceUrl : "";
    document.querySelector("#media-photo").value = "";
    document.querySelector("#media-featured").checked = item.featured;
    document.querySelectorAll('#media-player-options input[type="checkbox"]').forEach(input => input.checked = (item.playerIds || []).includes(input.value));
    document.querySelector("#save-media").innerHTML = `Salvar alterações <span>→</span>`;
    document.querySelector("#cancel-media-edit").hidden = false;
    updateMediaFormFields();
    document.querySelector("#media-form").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!archiveButton || !requireAdmin()) return;
  const item = data.mediaItems.find(media => media.id === archiveButton.dataset.archiveMedia);
  if (!item) return;
  const archiving = item.status !== "archived";
  if (!confirm(archiving ? "Arquivar esta mídia? Ela deixará de aparecer para o público." : "Reativar esta mídia na galeria?")) return;
  const { error } = await supabaseClient.from("media_items").update({ status: archiving ? "archived" : "active", updated_at: new Date().toISOString() }).eq("id", item.id);
  if (error) { toast(`Não foi possível atualizar a mídia: ${error.message}`); return; }
  await loadRemoteData();
  toast(archiving ? "Mídia arquivada." : "Mídia reativada na galeria.");
});
document.querySelector("#hall-award-player").addEventListener("change", event => {
  const player = data.players.find(item => item.id === event.target.value);
  if (player) document.querySelector("#hall-award-name").value = displayName(player);
});
document.querySelector("#cancel-hall-edit").addEventListener("click", resetHallForm);
document.querySelector("#hall-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  if (!hallOfFameAvailable) { toast("Execute a migração 019 no Supabase para ativar o Hall da Fama."); return; }
  const id = document.querySelector("#hall-award-id").value;
  const existing = data.hallAwards.find(item => item.id === id);
  const year = number(document.querySelector("#hall-award-year").value);
  const playerId = document.querySelector("#hall-award-player").value || null;
  const player = data.players.find(item => item.id === playerId);
  const winnerName = document.querySelector("#hall-award-name").value.trim();
  const file = document.querySelector("#hall-award-photo").files[0];
  if (year < 2016 || winnerName.length < 2) { toast("Informe o ano e o nome do campeão."); return; }
  let photoUrl = existing?.photoUrl || player?.photo || null;
  try {
    if (file) photoUrl = await uploadHallPhoto(file, year);
  } catch (error) {
    toast(`Não foi possível preparar a foto: ${error.message}`);
    return;
  }
  const payload = {
    award_year: year,
    category: document.querySelector("#hall-award-category").value,
    winner_name: winnerName,
    player_id: playerId,
    photo_url: photoUrl,
    note: document.querySelector("#hall-award-note").value.trim(),
    status: existing?.status || "active",
    updated_at: new Date().toISOString()
  };
  const request = id
    ? supabaseClient.from("hall_of_fame_awards").update(payload).eq("id", id)
    : supabaseClient.from("hall_of_fame_awards").insert(payload);
  const { error } = await request;
  if (error) {
    const duplicate = error.code === "23505";
    toast(duplicate ? "Este campeão já está cadastrado nessa categoria e ano." : `Não foi possível salvar o campeão: ${error.message}`);
    return;
  }
  resetHallForm();
  await loadRemoteData();
  toast(id ? "Campeão atualizado no Hall da Fama." : "Campeão adicionado ao Hall da Fama.");
});
document.querySelector("#hall-admin-list").addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit-hall-award]");
  const archiveButton = event.target.closest("[data-archive-hall-award]");
  if (editButton) {
    if (!requireAdmin()) return;
    const award = data.hallAwards.find(item => item.id === editButton.dataset.editHallAward);
    if (!award) return;
    document.querySelector("#hall-award-id").value = award.id;
    document.querySelector("#hall-award-year").value = award.year;
    document.querySelector("#hall-award-category").value = award.category;
    document.querySelector("#hall-award-player").value = award.playerId || "";
    document.querySelector("#hall-award-name").value = award.winnerName;
    document.querySelector("#hall-award-note").value = award.note || "";
    document.querySelector("#hall-award-photo").value = "";
    document.querySelector("#save-hall-award").innerHTML = `Salvar alterações <span>→</span>`;
    document.querySelector("#cancel-hall-edit").hidden = false;
    document.querySelector("#hall-form").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!archiveButton || !requireAdmin()) return;
  const award = data.hallAwards.find(item => item.id === archiveButton.dataset.archiveHallAward);
  if (!award) return;
  const archiving = award.status !== "archived";
  if (!confirm(archiving ? "Arquivar este título? Ele deixará de aparecer no Hall da Fama." : "Reativar este título no Hall da Fama?")) return;
  const { error } = await supabaseClient.from("hall_of_fame_awards").update({ status: archiving ? "archived" : "active", updated_at: new Date().toISOString() }).eq("id", award.id);
  if (error) { toast(`Não foi possível atualizar o título: ${error.message}`); return; }
  await loadRemoteData();
  toast(archiving ? "Título arquivado." : "Título reativado no Hall da Fama.");
});
async function submitRodizioGame() {
  if (!requireAdmin()) return;
  if (!roundsAvailable || !attendanceAvailable || !rodizioAvailable || !goalEventsAvailable) {
    toast("Execute as migrações pendentes antes de publicar o confronto.");
    return;
  }
  const activeRound = getActiveRound();
  if (!editingGameId && !activeRound) {
    toast("Salve a Rodada da Semana antes de adicionar confrontos.");
    return;
  }
  gameDraftEntries = captureGameDraftEntries();
  const rows = getGameDraftRows();
  const homeTeamNumber = document.querySelector("#team-home").value;
  const awayTeamNumber = document.querySelector("#team-away").value;
  if (homeTeamNumber === awayTeamNumber) {
    toast("Escolha dois times diferentes para este confronto.");
    return;
  }
  const entries = rows.filter(item => item.entry.attendance === "present" && item.entry.team).map(item => ({ playerId: item.player.id, team: String(item.entry.team) }));
  const homeEntries = entries.filter(entry => entry.team === homeTeamNumber);
  const awayEntries = entries.filter(entry => entry.team === awayTeamNumber);
  if (!homeEntries.length || !awayEntries.length) {
    toast("Monte os dois times antes de concluir o confronto.");
    return;
  }
  const hasInvalidLineup = [homeTeamNumber, awayTeamNumber].some(team => {
    const players = presentLineupPlayers(team, rows);
    return players.filter(item => isGoalkeeper(item.player)).length > 1 || players.filter(item => !isGoalkeeper(item.player)).length > 5;
  });
  if (hasInvalidLineup) {
    toast("Cada time permite até 5 atletas de linha e 1 goleiro.");
    return;
  }
  const selectedIdsByTeam = new Map([homeTeamNumber, awayTeamNumber].map(team => [team, new Set(presentLineupPlayers(team, rows).map(item => item.player.id))]));
  const opposingTeam = team => [homeTeamNumber, awayTeamNumber].find(item => String(item) !== String(team));
  const invalidGoal = gameGoalEvents.find(event => {
    const scorerTeam = event.ownGoal ? opposingTeam(event.team) : event.team;
    return !event.scorerId
      || !selectedIdsByTeam.get(String(scorerTeam))?.has(event.scorerId)
      || (event.ownGoal && event.assisterId)
      || (!event.ownGoal && event.assisterId && !selectedIdsByTeam.get(String(event.team))?.has(event.assisterId));
  });
  if (invalidGoal) {
    toast("Em cada gol, escolha o autor e uma assistência válida do mesmo time.");
    return;
  }
  syncScoreFromGoalEvents();
  const homeScore = number(document.querySelector("#score-home").value);
  const awayScore = number(document.querySelector("#score-away").value);
  let resultMethod = document.querySelector("#result-method").value;
  let winnerSide = document.querySelector("#winner-side").value;
  if (homeScore !== awayScore) {
    winnerSide = homeScore > awayScore ? "home" : "away";
    resultMethod = "regular";
  } else if (!["penalties", "ficha"].includes(resultMethod) || !["home", "away"].includes(winnerSide)) {
    toast("No empate, selecione Pênaltis ou Ficha e informe o vencedor. Isso não soma gols na artilharia.");
    return;
  }
  const gamePayload = {
    round_id: activeRound?.id || getEditingGame()?.roundId || null,
    game_number: getEditingGame()?.number || getNextGameNumber(activeRound?.id),
    played_on: document.querySelector("#game-date").value,
    place: DEFAULT_VENUE_NAME,
    home_team: teamLabel(homeTeamNumber),
    away_team: teamLabel(awayTeamNumber),
    home_score: homeScore,
    away_score: awayScore,
    result_method: resultMethod,
    winner_side: winnerSide,
    status: "completed"
  };
  let gameId = editingGameId;
  if (gameId) {
    const { error } = await supabaseClient.from("games").update(gamePayload).eq("id", gameId);
    if (error) { toast(`Não foi possível atualizar o confronto: ${error.message}`); return; }
    const { error: goalsDeleteError } = await supabaseClient.from("game_goal_events").delete().eq("game_id", gameId);
    if (goalsDeleteError) { toast(`Não foi possível atualizar os gols: ${goalsDeleteError.message}`); return; }
    const { error: statsDeleteError } = await supabaseClient.from("player_game_stats").delete().eq("game_id", gameId);
    if (statsDeleteError) { toast(`Não foi possível atualizar as estatísticas: ${statsDeleteError.message}`); return; }
  } else {
    const { data: game, error } = await supabaseClient.from("games").insert(gamePayload).select().single();
    if (error) { toast(`Não foi possível salvar o confronto: ${error.message}`); return; }
    gameId = game.id;
  }
  const totals = goalEventTotals();
  const { error: statsError } = await supabaseClient.from("player_game_stats").insert(entries.map(entry => ({
    game_id: gameId,
    player_id: entry.playerId,
    team_side: entry.team === homeTeamNumber ? "home" : "away",
    team_number: number(entry.team),
    goals: number(totals.get(entry.playerId)?.goals),
    assists: number(totals.get(entry.playerId)?.assists),
    saves: 0,
    tackles: 0,
    is_craque: false,
    is_xerife: false,
    is_paredao: false
  })));
  if (statsError) {
    if (!editingGameId) await supabaseClient.from("games").delete().eq("id", gameId);
    toast(`Não foi possível salvar as estatísticas: ${statsError.message}`);
    return;
  }
  if (gameGoalEvents.length) {
    const { error: goalEventsError } = await supabaseClient.from("game_goal_events").insert(gameGoalEvents.map((event, index) => ({
      game_id: gameId,
      event_number: index + 1,
      team_number: number(event.team),
      scorer_id: event.scorerId,
      assister_id: event.ownGoal ? null : (event.assisterId || null),
      ...(event.ownGoal ? { is_own_goal: true } : {})
    })));
    if (goalEventsError) {
      const migrationHint = goalEventsError.message.includes("is_own_goal") ? " Execute a migração 014 para ativar gol contra." : "";
      toast(`Confronto salvo, mas os gols não puderam ser registrados: ${goalEventsError.message}${migrationHint}`);
      return;
    }
  }
  const attendanceSaved = await saveRoundAttendance(new Map(rows.map(item => [item.player.id, item.entry])), { notify: false });
  editingGameId = null;
  gameDraftEntries = null;
  gameGoalEvents = [];
  await loadRemoteData();
  prepareNextGameFromWinner();
  document.querySelector("#round-game-context")?.scrollIntoView({ behavior: "smooth", block: "start" });
  toast(attendanceSaved ? "Confronto salvo. A lista foi atualizada e o próximo jogo está pronto." : "Confronto salvo, mas a presença não pôde ser atualizada.");
}
document.querySelector("#game-form").addEventListener("submit", async event => {
  event.preventDefault();
  return submitRodizioGame();
  if (!requireAdmin()) return;
  if (!rodizioAvailable) { toast("Execute a migração 009 no Supabase para usar o modo Rodízio."); return; }
  if (!attendanceAvailable) { toast("Execute a migração 008 no Supabase para usar presença e os Times 1 a 10."); return; }
  if (!roundsAvailable) { toast("Execute a migração 007 no Supabase antes de lançar confrontos por rodada."); return; }
  const activeRound = getActiveRound();
  if (!editingGameId && !activeRound) { toast("Salve a Rodada da Semana antes de adicionar confrontos."); return; }
  const rows = [...document.querySelectorAll(".game-player-row")].map(row => ({
    playerId: row.dataset.playerId,
    attendance: row.querySelector(".field-attendance").value,
    team: row.querySelector(".field-team").value,
    goals: number(row.querySelector(".field-goals").value),
    assists: number(row.querySelector(".field-assists").value)
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
  const homeEntries = entries.filter(entry => entry.team === homeTeamNumber);
  const awayEntries = entries.filter(entry => entry.team === awayTeamNumber);
  if (!homeEntries.length || !awayEntries.length) { toast("Monte os dois lados do confronto antes de salvar."); return; }
  const homeScore = number(document.querySelector("#score-home").value);
  const awayScore = number(document.querySelector("#score-away").value);
  const selectedMethod = document.querySelector("#result-method").value;
  let winnerSide = document.querySelector("#winner-side").value;
  let resultMethod = selectedMethod;
  if (homeScore !== awayScore) {
    winnerSide = homeScore > awayScore ? "home" : "away";
    resultMethod = "regular";
  } else if (!["penalties", "ficha"].includes(resultMethod) || !["home", "away"].includes(winnerSide)) {
    toast("Em caso de empate, escolha Pênaltis ou Ficha e informe o time vencedor.");
    return;
  }
  const gamePayload = {
    round_id: activeRound?.id || getEditingGame()?.roundId || null,
    game_number: getEditingGame()?.number || getNextGameNumber(activeRound?.id),
    played_on: document.querySelector("#game-date").value,
    place: DEFAULT_VENUE_NAME,
    home_team: teamLabel(homeTeamNumber),
    away_team: teamLabel(awayTeamNumber),
    home_score: homeScore,
    away_score: awayScore,
    result_method: resultMethod,
    winner_side: winnerSide
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
    is_craque: false,
    is_xerife: false,
    is_paredao: false
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
  showView("rodadas");
});
async function createGameDraft() {
  const activeRound = getActiveRound();
  const latestFinishedGame = roundGames(activeRound.id).filter(isCompletedGame).slice(-1)[0];
  const winnerTeamNumber = latestFinishedGame?.winnerSide ? gameTeamNumber(latestFinishedGame, latestFinishedGame.winnerSide) : "";
  const homeTeamNumber = winnerTeamNumber || document.querySelector("#team-home").value;
  const nextTeamNumber = getNextTeamNumber(activeRound.id);
  const awayTeamNumber = winnerTeamNumber
    ? (String(nextTeamNumber) === String(winnerTeamNumber) ? String(Math.min(TEAM_LIMIT, number(winnerTeamNumber) + 1)) : nextTeamNumber)
    : document.querySelector("#team-away").value;
  if (homeTeamNumber === awayTeamNumber) {
    toast("Escolha dois times diferentes antes de adicionar o rascunho.");
    return;
  }
  const payload = {
    round_id: activeRound.id,
    game_number: getNextGameNumber(activeRound.id),
    played_on: activeRound.date,
    place: activeRound.place || DEFAULT_VENUE_NAME,
    home_team: teamLabel(homeTeamNumber),
    away_team: teamLabel(awayTeamNumber),
    home_score: 0,
    away_score: 0,
    result_method: "regular",
    winner_side: null,
    status: "draft"
  };
  const { data: game, error } = await supabaseClient.from("games").insert(payload).select().single();
  if (error) {
    const hint = error.message.includes("status") ? " Execute a migração 015 no Supabase." : "";
    toast(`Não foi possível adicionar o rascunho: ${error.message}${hint}`);
    return;
  }
  const winnerEntries = winnerTeamNumber
    ? latestFinishedGame.stats.filter(entry => String(entry.team) === String(winnerTeamNumber))
    : [];
  if (winnerEntries.length) {
    const { error: rosterError } = await supabaseClient.from("player_game_stats").insert(winnerEntries.map(entry => ({
      game_id: game.id,
      player_id: entry.playerId,
      team_side: "home",
      team_number: number(homeTeamNumber),
      goals: 0,
      assists: 0,
      saves: 0,
      tackles: 0,
      is_craque: false,
      is_xerife: false,
      is_paredao: false
    })));
    if (rosterError) {
      await supabaseClient.from("games").delete().eq("id", game.id);
      toast(`Não foi possível manter o time vencedor: ${rosterError.message}`);
      return;
    }
  }
  await loadRemoteData();
  openGameEditor(game.id);
  toast(winnerEntries.length
    ? `Jogo ${String(payload.game_number).padStart(2, "0")} criado com o ${teamLabel(homeTeamNumber)} vencedor mantido.`
    : `Jogo ${String(payload.game_number).padStart(2, "0")} adicionado como rascunho. Você pode editá-lo agora ou depois.`);
}

document.querySelector("#new-game-button").addEventListener("click", async () => {
  if (!requireAdmin()) return;
  if (!roundsAvailable) { toast("Execute a migração 007 no Supabase para ativar as rodadas."); return; }
  if (!attendanceAvailable) { toast("Execute a migração 008 no Supabase para ativar a presença."); return; }
  if (!rodizioAvailable) { toast("Execute a migração 009 no Supabase para ativar o modo Rodízio."); return; }
  if (!goalEventsAvailable) { toast("Execute a migração 010 no Supabase para registrar os gols do confronto."); return; }
  if (!getActiveRound()) {
    document.querySelector("#round-form").scrollIntoView({ behavior: "smooth", block: "start" });
    toast("Salve a Rodada da Semana antes de adicionar um confronto.");
    return;
  }
  await createGameDraft();
});
document.querySelector("#cancel-game-edit").addEventListener("click", resetGameForm);
document.querySelector("#saved-games-list").addEventListener("click", async event => {
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
  const deleteButton = event.target.closest("[data-delete-game]");
  if (deleteButton) {
    if (!requireAdmin()) return;
    const game = data.games.find(item => item.id === deleteButton.dataset.deleteGame);
    if (!game) return;
    const label = `Jogo ${String(game.number || 0).padStart(2, "0")}`;
    if (!confirm(`Excluir ${label}? Os atletas, gols e placar desse confronto serão removidos.`)) return;
    const { error: goalsError } = await supabaseClient.from("game_goal_events").delete().eq("game_id", game.id);
    if (goalsError) { toast(`Não foi possível excluir os gols: ${goalsError.message}`); return; }
    const { error: statsError } = await supabaseClient.from("player_game_stats").delete().eq("game_id", game.id);
    if (statsError) { toast(`Não foi possível excluir os atletas do confronto: ${statsError.message}`); return; }
    const { error: gameError } = await supabaseClient.from("games").delete().eq("id", game.id);
    if (gameError) { toast(`Não foi possível excluir o confronto: ${gameError.message}`); return; }
    if (editingGameId === game.id) resetGameForm();
    await loadRemoteData();
    toast(`${label} foi excluído.`);
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
document.querySelector("#admin-directors-list").addEventListener("click", event => {
  const button = event.target.closest("[data-edit-director]");
  if (button) openDirectorEdit(button.dataset.editDirector);
});
document.querySelector("#director-edit-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  if (!directorsAvailable) { toast("Execute a migração 013 no Supabase antes de editar a diretoria."); return; }
  const directorId = document.querySelector("#edit-director-id").value;
  const director = data.directors.find(item => item.id === directorId);
  if (!director) return;
  const instagramUrl = document.querySelector("#edit-director-instagram").value.trim();
  if (!isInstagramUrl(instagramUrl)) { toast("Informe um link válido do Instagram com https://."); return; }
  let photoUrl = director.photo;
  try {
    if (pendingDirectorPhotoFile) photoUrl = await uploadDirectorPhoto(directorId, await croppedDirectorPhoto());
  } catch (error) {
    toast(`Não foi possível enviar a foto: ${error.message}`);
    return;
  }
  const { error } = await supabaseClient.from("director_profiles").update({
    full_name: document.querySelector("#edit-director-name").value.trim(),
    role: document.querySelector("#edit-director-role").value.trim(),
    instagram_url: instagramUrl,
    photo_url: photoUrl,
    updated_at: new Date().toISOString()
  }).eq("id", directorId);
  if (error) { toast(`Não foi possível salvar o diretor: ${error.message}`); return; }
  closeDirectorEditModal();
  await loadRemoteData();
  toast("Diretor atualizado na página inicial.");
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
    if (pendingEditPhotoFile) photoUrl = await uploadPlayerPhoto(playerId, await croppedPlayerPhoto());
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

document.querySelector("#audit-entity-filter")?.addEventListener("change", event => {
  selectedAuditEntity = event.target.value;
  renderAdminAuditLogs();
});
document.querySelector("#audit-action-filter")?.addEventListener("change", event => {
  selectedAuditAction = event.target.value;
  renderAdminAuditLogs();
});
document.querySelector("#refresh-audit-log")?.addEventListener("click", async event => {
  event.currentTarget.disabled = true;
  await loadRemoteData();
  event.currentTarget.disabled = false;
  toast("Histórico de atividades atualizado.");
});
document.querySelector("#export-csv")?.addEventListener("click", exportSelectedCsv);
document.querySelector("#export-full-backup")?.addEventListener("click", exportCompleteBackup);

document.querySelector("#game-date").value = new Date().toISOString().slice(0, 10);
(async function initialiseApp() {
  await refreshAuthState();
  await loadRemoteData();
  supabaseClient.auth.onAuthStateChange(() => { setTimeout(refreshAuthState, 0); });
})();
// COMPARTILHAR RODADA NO WHATSAPP - G.P.F.C
function shareRoundOnWhatsApp() {
  const roundNumber = document.getElementById('round-number')?.value || '?';
  const roundDate = document.getElementById('round-date')?.value || '';
  const games = document.querySelectorAll('#saved-games-list .saved-game-item');
  
  let dataFormatada = roundDate ? new Date(roundDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'hoje';
  
  let texto = `🔥 *G.P.F.C - GALERA DA PELADA* 🔥\n`;
  texto += `⚽ RODADA ${roundNumber} - ${dataFormatada} - CT Caxangá\n\n`;
  texto += `*Resultados:*\n`;

  if (games.length === 0) {
    texto += `Nenhum confronto lançado ainda.\n`;
  } else {
    games.forEach((game, i) => {
      // tenta pegar placar do seu HTML - se não achar, usa texto genérico
      const placar = game.innerText.replace(/\n/g, ' ').substring(0, 100);
      texto += `• ${placar}\n`;
    });
  }

  texto += `\n📊 *Veja rankings completos e artilharia:*\n`;
  texto += `https://site-da-galera-da-pelada.vercel.app/\n\n`;
  texto += `_Desde 2016 - 10 anos de resenha_`;

  const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
}

// MOSTRA O BOTÃO SÓ QUANDO FINALIZA A RODADA
const finishBtn = document.getElementById('finish-round-button');
const shareBtn = document.getElementById('share-whatsapp-button');

if (finishBtn && shareBtn) {
  finishBtn.addEventListener('click', () => {
    setTimeout(() => {
      shareBtn.hidden = false;
      shareBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 800);
  });
  
  shareBtn.addEventListener('click', shareRoundOnWhatsApp);
}

const mobileMenuToggle = document.querySelector("#menu-toggle");
const mobileMainNav = document.querySelector("#main-nav");

function setMobileMenu(isOpen) {
  if (!mobileMenuToggle || !mobileMainNav) return;
  mobileMainNav.classList.toggle("is-open", isOpen);
  mobileMenuToggle.setAttribute("aria-expanded", String(isOpen));
  mobileMenuToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
  mobileMenuToggle.textContent = isOpen ? "\u00D7" : "\u2630";
  document.body.style.overflow = isOpen ? "hidden" : "";
}

mobileMenuToggle?.addEventListener("click", () => {
  setMobileMenu(!mobileMainNav.classList.contains("is-open"));
});

mobileMainNav?.addEventListener("click", event => {
  if (event.target.closest("button")) setMobileMenu(false);
});

document.querySelector("#public-attendance-panel")?.addEventListener("change", event => {
  if (event.target.id !== "public-attendance-player") return;
  publicAttendancePlayerId = event.target.value;
  const round = getPublicAttendanceRound();
  publicAttendanceChoice = round && publicAttendancePlayerId
    ? data.attendance[round.id]?.[publicAttendancePlayerId] || ""
    : "";
  renderPublicAttendanceConfirmation();
});

document.querySelector("#public-attendance-panel")?.addEventListener("click", event => {
  const button = event.target.closest("[data-public-attendance-status]");
  if (!button) return;
  if (!publicAttendancePlayerId) {
    toast("Selecione seu nome antes de escolher a resposta.");
    return;
  }
  publicAttendanceChoice = button.dataset.publicAttendanceStatus;
  renderPublicAttendanceConfirmation();
});

document.querySelector("#public-attendance-panel")?.addEventListener("submit", async event => {
  if (event.target.id !== "public-attendance-form") return;
  event.preventDefault();
  const round = getPublicAttendanceRound();
  if (!round || round.attendanceClosed) {
    toast("A confirmação desta rodada está fechada.");
    return;
  }
  if (!publicAttendancePlayerId || !publicAttendanceChoice) {
    toast("Escolha seu nome e uma resposta.");
    return;
  }
  const submit = event.target.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Salvando...";
  const { error } = await supabaseClient.rpc("confirm_round_attendance", {
    p_round_id: round.id,
    p_player_id: publicAttendancePlayerId,
    p_status: publicAttendanceChoice
  });
  if (error) {
    renderPublicAttendanceConfirmation();
    const migrationHint = /function|schema cache/i.test(error.message) ? " Execute a migração 017 no Supabase." : "";
    toast(`Não foi possível confirmar: ${error.message}${migrationHint}`);
    return;
  }
  localStorage.setItem(PUBLIC_ATTENDANCE_PLAYER_KEY, publicAttendancePlayerId);
  data.attendance[round.id] ||= {};
  data.attendance[round.id][publicAttendancePlayerId] = publicAttendanceChoice;
  renderAll();
  const player = data.players.find(item => item.id === publicAttendancePlayerId);
  toast(`Presença de ${displayName(player)} atualizada com sucesso.`);
});
