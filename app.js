const STORAGE_KEY = "galera-da-pelada-2026";

const starterData = {
  players: [
    { id: "p1", name: "Almir", número: "", position: "Zagueiro", photo: "" },
    { id: "p2", name: "Anderson", número: "", position: "Zagueiro", photo: "" },
    { id: "p3", name: "Allerf", número: "", position: "Zagueiro", photo: "" },
    { id: "p4", name: "Fabinho", número: "", position: "Meia", photo: "" },
    { id: "p5", name: "Fabio", número: "Luquinhas", position: "Atacante", photo: "" },
    { id: "p6", name: "Bruno Souza", número: "Brunão", position: "Defensor", photo: "" },
    { id: "p7", name: "Gustavo Lima", número: "Guga", position: "Defensor", photo: "" },
    { id: "p8", name: "André Silva", número: "Dé", position: "Goleiro", photo: "" }
  ],
  games: [
    {
      id: "g3", date: "2026-07-17", place: "Arena da Vila", home: "Time Verde", away: "Time Preto", homeScore: 9, awayScore: 7,
      stats: [
        { playerId: "p1", played: true, goals: 4, assists: 1, saves: 0, tackles: 0, award: "craque" },
        { playerId: "p2", played: true, goals: 1, assists: 3, saves: 0, tackles: 1, award: "" },
        { playerId: "p3", played: true, goals: 0, assists: 0, saves: 9, tackles: 0, award: "paredao" },
        { playerId: "p4", played: true, goals: 2, assists: 2, saves: 0, tackles: 1, award: "" },
        { playerId: "p5", played: true, goals: 2, assists: 0, saves: 0, tackles: 0, award: "" },
        { playerId: "p6", played: true, goals: 0, assists: 1, saves: 0, tackles: 7, award: "xerife" },
        { playerId: "p7", played: true, goals: 0, assists: 0, saves: 0, tackles: 4, award: "" },
        { playerId: "p8", played: true, goals: 0, assists: 0, saves: 5, tackles: 0, award: "" }
      ]
    },
    {
      id: "g2", date: "2026-07-10", place: "Arena da Vila", home: "Time Verde", away: "Time Preto", homeScore: 6, awayScore: 6,
      stats: [
        { playerId: "p1", played: true, goals: 2, assists: 1, saves: 0, tackles: 0, award: "" }, { playerId: "p2", played: true, goals: 0, assists: 2, saves: 0, tackles: 1, award: "" }, { playerId: "p3", played: true, goals: 0, assists: 0, saves: 6, tackles: 0, award: "paredao" }, { playerId: "p4", played: true, goals: 3, assists: 0, saves: 0, tackles: 2, award: "craque" }, { playerId: "p5", played: true, goals: 1, assists: 1, saves: 0, tackles: 0, award: "" }, { playerId: "p6", played: true, goals: 0, assists: 0, saves: 0, tackles: 5, award: "xerife" }, { playerId: "p7", played: true, goals: 0, assists: 1, saves: 0, tackles: 2, award: "" }, { playerId: "p8", played: true, goals: 0, assists: 0, saves: 5, tackles: 0, award: "" }
      ]
    },
    {
      id: "g1", date: "2026-07-03", place: "Arena da Vila", home: "Time Verde", away: "Time Preto", homeScore: 8, awayScore: 5,
      stats: [
        { playerId: "p1", played: true, goals: 2, assists: 2, saves: 0, tackles: 0, award: "" }, { playerId: "p2", played: true, goals: 1, assists: 1, saves: 0, tackles: 2, award: "" }, { playerId: "p3", played: true, goals: 0, assists: 0, saves: 8, tackles: 0, award: "paredao" }, { playerId: "p4", played: true, goals: 2, assists: 1, saves: 0, tackles: 1, award: "" }, { playerId: "p5", played: true, goals: 3, assists: 0, saves: 0, tackles: 0, award: "craque" }, { playerId: "p6", played: true, goals: 0, assists: 1, saves: 0, tackles: 6, award: "xerife" }, { playerId: "p7", played: true, goals: 0, assists: 0, saves: 0, tackles: 2, award: "" }, { playerId: "p8", played: true, goals: 0, assists: 0, saves: 4, tackles: 0, award: "" }
      ]
    }
  ]
};

let data = loadData();
let selectedRanking = "goals";
let pendingPhoto = "";

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : structuredClone(starterData);
  } catch { return structuredClone(starterData); }
}
function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function initials(player) { return (player.nickname || player.name).split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase(); }
function avatar(player, extraClass = "") { return `<div class="avatar ${extraClass}">${player.photo ? `<img src="${player.photo}" alt="Foto de ${escapeHtml(player.nickname || player.name)}" />` : initials(player)}</div>`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char])); }
function formatDate(date) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`)).replace(" de ", " ").replace(" de ", " "); }
function shortDate(date) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", ""); }
function getLatestGame() { return [...data.games].sort((a, b) => b.date.localeCompare(a.date))[0]; }
function getStats() {
  const stats = Object.fromEntries(data.players.map(player => [player.id, { player, games: 0, goals: 0, assists: 0, saves: 0, tackles: 0, craque: 0, xerife: 0, paredao: 0 }]));
  data.games.forEach(game => game.stats.forEach(entry => {
    const total = stats[entry.playerId]; if (!total || !entry.played) return;
    total.games += 1; total.goals += Number(entry.goals || 0); total.assists += Number(entry.assists || 0); total.saves += Number(entry.saves || 0); total.tackles += Number(entry.tackles || 0);
    if (entry.award) total[entry.award] += 1;
  }));
  return Object.values(stats);
}
function bestStat(metric) { return [...getStats()].sort((a, b) => b[metric] - a[metric] || a.player.name.localeCompare(b.player.name))[0]; }
function awardInfo(key) { return { craque: { title: "Craque", label: "melhor da rodada", icon: "★", metric: "craque" }, xerife: { title: "Xerife", label: "dono da marcação", icon: "◆", metric: "xerife" }, paredao: { title: "Paredão", label: "segurou tudo", icon: "⬡", metric: "paredao" }, artilheiro: { title: "Artilheiro", label: "goleador da rodada", icon: "⚽", metric: "goals" } }[key]; }

function renderHome() {
  const stats = getStats(); const latest = getLatestGame();
  document.querySelector("#total-games").textContent = data.games.length;
  document.querySelector("#total-players").textContent = data.players.length;
  const goals = stats.reduce((sum, item) => sum + item.goals, 0);
  document.querySelector("#total-goals").textContent = goals;
  document.querySelector("#goal-average").textContent = data.games.length ? (goals / data.games.length).toFixed(1).replace(".", ",") : "0";
  document.querySelector("#latest-score").innerHTML = latest ? `<div class="score-date">${formatDate(latest.date)}</div><div class="score-line"><span>${escapeHtml(latest.home)}</span><b class="score-number">${latest.homeScore}–${latest.awayScore}</b><span>${escapeHtml(latest.away)}</span></div><div class="score-place">${escapeHtml(latest.place || "Pelada da galera")}</div>` : `<div class="empty-state">A primeira rodada ainda será lançada.</div>`;
  const latestStats = latest?.stats || [];
  const awardPlayer = key => {
    let stat = latestStats.find(entry => entry.award === key);
    if (!stat && key === "artilheiro") stat = [...latestStats].filter(item => item.played).sort((a,b) => b.goals-a.goals)[0];
    return data.players.find(player => player.id === stat?.playerId) || data.players[0];
  };
  document.querySelector("#weekly-awards").innerHTML = ["craque", "artilheiro", "xerife", "paredao"].map(key => {
    const info = awardInfo(key); const player = awardPlayer(key);
    const stat = latestStats.find(entry => entry.playerId === player?.id) || {};
    const amount = key === "artilheiro" ? `${stat.goals || 0} gols` : info.label;
    return `<article class="award-card"><div class="award-type"><span>${info.title.toUpperCase()}</span><span class="award-icon">${info.icon}</span></div>${player ? `<h3>${escapeHtml(player.nickname || player.name)}</h3><small>${amount}</small><div class="award-person">${avatar(player)}</div>` : `<h3>—</h3><small>sem dados</small>`}</article>`;
  }).join("");
  document.querySelector("#recent-games").innerHTML = [...data.games].sort((a,b)=>b.date.localeCompare(a.date)).slice(0, 3).map(game => `<article class="recent-game"><div class="date-box">${shortDate(game.date)}<br/><span>${escapeHtml(game.place || "Quadra")}</span></div><div><strong>${escapeHtml(game.home)} <span class="recent-score">${game.homeScore} × ${game.awayScore}</span> ${escapeHtml(game.away)}</strong><small>${game.stats.filter(item => item.played).length} atletas em campo</small></div><span class="mini-label">RODADA</span></article>`).join("") || `<div class="empty-state">Nenhuma rodada cadastrada.</div>`;
  const records = [{ metric: "goals", label: "Artilheiro" }, { metric: "assists", label: "Garçom" }, { metric: "saves", label: "Mais defesas" }];
  document.querySelector("#records").innerHTML = records.map(record => { const winner = bestStat(record.metric); return winner ? `<article class="record-item">${avatar(winner.player)}<div class="record-text"><strong>${escapeHtml(winner.player.nickname || winner.player.name)}</strong><small>${record.label}</small></div><span class="record-number">${winner[record.metric]}</span></article>` : ""; }).join("");
}

const rankingDetails = {
  goals: { title: "Artilharia", kicker: "GOLS MARCADOS", singular: "GOL", plural: "GOLS" },
  assists: { title: "Assistências", kicker: "PASSES PARA GOL", singular: "ASSIST.", plural: "ASSIST." },
  craque: { title: "Craque", kicker: "VEZES CRAQUE DA RODADA", singular: "VEZ", plural: "VEZES" },
  xerife: { title: "Xerife", kicker: "DESTAQUES DEFENSIVOS", singular: "VEZ", plural: "VEZES" },
  paredao: { title: "Paredão", kicker: "GOLEIROS DA RODADA", singular: "VEZ", plural: "VEZES" },
  
};
function renderRanking() {
  const details = rankingDetails[selectedRanking]; const metric = details.source || selectedRanking;
  document.querySelector("#ranking-kicker").textContent = details.kicker; document.querySelector("#ranking-name").textContent = details.title;
  document.querySelectorAll(".ranking-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.ranking === selectedRanking));
  const items = getStats().filter(item => item[metric] > 0).sort((a,b) => b[metric] - a[metric] || b.goals - a.goals || a.player.name.localeCompare(b.player.name));
  document.querySelector("#ranking-list").innerHTML = items.length ? items.map((item, index) => `<article class="rank-row"><span class="rank-position">${String(index + 1).padStart(2, "0")}</span>${avatar(item.player)}<div class="rank-player"><strong>${escapeHtml(item.player.nickname || item.player.name)}</strong><small>${escapeHtml(item.player.position)} · ${item.games} ${item.games === 1 ? "jogo" : "jogos"}</small></div><span class="rank-meta">${item.goals} gols · ${item.assists} assist.</span><span class="rank-value">${item[metric]}<small>${item[metric] === 1 ? details.singular : details.plural}</small></span></article>`).join("") : `<div class="empty-state">Ainda não existem dados nesta categoria. Lance a primeira rodada no painel admin.</div>`;
}

function renderPlayers(filter = "") {
  const text = filter.trim().toLocaleLowerCase("pt-BR"); const stats = getStats();
  const players = stats.filter(item => !text || `${item.player.name} ${item.player.nickname}`.toLocaleLowerCase("pt-BR").includes(text)).sort((a,b) => a.player.name.localeCompare(b.player.name));
  document.querySelector("#roster-count").textContent = `${players.length} ${players.length === 1 ? "ATLETA" : "ATLETAS"}`;
  document.querySelector("#athletes-grid").innerHTML = players.map((item, index) => `<article class="athlete-card"><div class="card-image">${avatar(item.player)}</div><div class="card-top"><span>GP • 2026</span><span class="athlete-number">${String(index + 1).padStart(2, "0")}</span></div><div class="card-bottom"><h2>${escapeHtml(item.player.nickname || item.player.name)}</h2><p>${escapeHtml(item.player.position)}</p><div class="card-stats"><div><span>JOGOS</span><strong>${item.games}</strong></div><div><span>GOLS</span><strong>${item.goals}</strong></div><div><span>ASSIST.</span><strong>${item.assists}</strong></div></div></div></article>`).join("") || `<div class="empty-state">Nenhum atleta encontrado.</div>`;
}

function renderGameFields() {
  const container = document.querySelector("#game-player-fields");
  container.innerHTML = data.players.length ? data.players.map(player => `<div class="game-player-row" data-player-id="${player.id}"><div>${avatar(player)}<strong title="${escapeHtml(player.nickname || player.name)}">${escapeHtml(player.nickname || player.name)}</strong></div><label class="play-check" title="Jogou"><input class="field-played" type="checkbox" /></label><input class="field-goals" type="number" min="0" value="0" title="Gols" aria-label="Gols de ${escapeHtml(player.name)}" /><input class="field-assists" type="number" min="0" value="0" title="Assistências" aria-label="Assistências de ${escapeHtml(player.name)}" /><input class="field-saves" type="number" min="0" value="0" title="Defesas" aria-label="Defesas de ${escapeHtml(player.name)}" /><select class="field-award" aria-label="Destaque de ${escapeHtml(player.name)}"><option value="">Destaque</option><option value="craque">Craque</option><option value="xerife">Xerife</option><option value="paredao">Paredão</option></select></div>`).join("") : `<div class="empty-state">Cadastre pelo menos um atleta antes de lançar uma rodada.</div>`;
}

function renderAll() { renderHome(); renderRanking(); renderPlayers(document.querySelector("#player-search")?.value || ""); renderGameFields(); }
function showView(id) { document.querySelectorAll(".view").forEach(view => view.classList.toggle("active-view", view.id === id)); document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.viewTarget === id)); window.scrollTo({ top: 0, behavior: "smooth" }); }
function toast(message) { const element = document.querySelector("#toast"); element.textContent = message; element.classList.add("show"); clearTimeout(toast.timeout); toast.timeout = setTimeout(() => element.classList.remove("show"), 3200); }

document.querySelectorAll("[data-view-target]").forEach(button => button.addEventListener("click", () => showView(button.dataset.viewTarget)));
document.querySelectorAll(".ranking-tab").forEach(button => button.addEventListener("click", () => { selectedRanking = button.dataset.ranking; renderRanking(); }));
document.querySelector("#player-search").addEventListener("input", event => renderPlayers(event.target.value));
document.querySelector("#player-photo").addEventListener("change", event => { const file = event.target.files[0]; if (!file) return; if (file.size > 2_500_000) { toast("Escolha uma foto de até 2,5 MB."); event.target.value = ""; return; } const reader = new FileReader(); reader.onload = () => { pendingPhoto = reader.result; document.querySelector("#photo-preview").innerHTML = `<img src="${pendingPhoto}" alt="Prévia da foto" />`; }; reader.readAsDataURL(file); });
document.querySelector("#player-form").addEventListener("submit", event => { event.preventDefault(); const name = document.querySelector("#player-name").value.trim(); const nickname = document.querySelector("#player-nickname").value.trim(); data.players.push({ id: `p-${Date.now()}`, name, nickname: nickname || name.split(" ")[0], position: document.querySelector("#player-position").value, photo: pendingPhoto }); saveData(); event.target.reset(); pendingPhoto = ""; document.querySelector("#photo-preview").textContent = "+"; renderAll(); toast(`${nickname || name} entrou no elenco de 2026.`); });
document.querySelector("#game-form").addEventListener("submit", event => { event.preventDefault(); if (!data.players.length) { toast("Cadastre ao menos um atleta antes de lançar a rodada."); return; } const entries = [...document.querySelectorAll(".game-player-row")].map(row => ({ playerId: row.dataset.playerId, played: row.querySelector(".field-played").checked, goals: Number(row.querySelector(".field-goals").value || 0), assists: Number(row.querySelector(".field-assists").value || 0), saves: Number(row.querySelector(".field-saves").value || 0), tackles: 0, award: row.querySelector(".field-award").value })); if (!entries.some(entry => entry.played)) { toast("Marque pelo menos um atleta que jogou."); return; } const date = document.querySelector("#game-date").value; const game = { id: `g-${Date.now()}`, date, place: document.querySelector("#game-place").value.trim(), home: document.querySelector("#team-home").value.trim(), away: document.querySelector("#team-away").value.trim(), homeScore: Number(document.querySelector("#score-home").value), awayScore: Number(document.querySelector("#score-away").value), stats: entries }; data.games = data.games.filter(existing => existing.date !== game.date); data.games.push(game); saveData(); event.target.reset(); document.querySelector("#team-home").value = "Time Verde"; document.querySelector("#team-away").value = "Time Preto"; document.querySelector("#game-date").value = new Date().toISOString().slice(0, 10); renderAll(); toast("Rodada salva. Os rankings de 2026 foram atualizados."); });
document.querySelector("#reset-data").addEventListener("click", () => { if (!confirm("Restaurar os dados de exemplo? Os seus cadastros feitos neste navegador serão substituídos.")) return; data = structuredClone(starterData); saveData(); renderAll(); toast("Dados de exemplo restaurados."); });
document.querySelector("#game-date").value = new Date().toISOString().slice(0, 10);
renderAll();
