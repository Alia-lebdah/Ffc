const $ = (selector) => document.querySelector(selector);

// ---------------------------------------------------------------
// DATA LAYER
// If config.js has a Supabase URL + key, data lives in the shared
// Supabase database (everyone sees the same data). Otherwise it
// falls back to this browser's localStorage, like before.
// ---------------------------------------------------------------
const DEFAULT_DATA = JSON.parse(JSON.stringify({ teams, players, matches }));
const sb = (typeof SUPABASE_URL === "string" && SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
let adminSession = null;
let lastSnapshot = "";

function applyData(d) {
  if (d?.teams && d?.players && d?.matches) {
    teams = d.teams; players = d.players; matches = d.matches;
    return true;
  }
  return false;
}

// Returns true if the data changed since the last load.
async function loadTournamentData() {
  try {
    if (sb) {
      const { data, error } = await sb.from("tournament").select("data").eq("id", 1).maybeSingle();
      if (error) console.warn("Could not load shared data.", error.message);
      else if (data) applyData(data.data);   // empty table -> keep data.js defaults
    } else {
      applyData(JSON.parse(localStorage.getItem("gfc_tournament_data")));
    }
  } catch (e) {
    console.warn("Could not load saved tournament data.", e);
  }
  const snap = JSON.stringify({ teams, players, matches });
  const changed = snap !== lastSnapshot;
  lastSnapshot = snap;
  return changed;
}

async function saveTournamentData() {
  const payload = { teams, players, matches };
  if (sb) {
    const { error } = await sb.from("tournament").upsert({ id: 1, data: payload, updated_at: new Date().toISOString() });
    if (error) { alert("Could not save: " + error.message); return false; }
  } else {
    localStorage.setItem("gfc_tournament_data", JSON.stringify(payload));
  }
  lastSnapshot = JSON.stringify(payload);
  return true;
}

// Save, then redraw. If saving failed, reload the real data so the screen isn't misleading.
async function commit(message) {
  const ok = await saveTournamentData();
  if (ok && message) alert(message);
  if (!ok) await loadTournamentData();
  render();
}

async function resetTournamentData() {
  if (sb) {
    applyData(JSON.parse(JSON.stringify(DEFAULT_DATA)));
    await commit("Data reset to the original data.js.");
  } else {
    localStorage.removeItem("gfc_tournament_data");
    location.reload();
  }
}

const teamById = id => teams.find(t => t.id === id);
const playerById = id => players.find(p => p.id === id);

function teamBadge(team, small = false) {
  return `<span class="team-badge ${small ? "small" : ""}" style="--team:${team.color}">${team.emoji}</span>`;
}

function teamName(id) {
  return teamById(id)?.name || "Unknown";
}

function formatDate(date) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric"
  });
}

function calculateStandings() {
  const table = teams.map(t => ({
    teamId: t.id, played: 0, wins: 0, draws: 0, losses: 0,
    gf: 0, ga: 0, gd: 0, points: 0
  }));

  matches.filter(m => m.homeScore !== null && m.awayScore !== null).forEach(m => {
    const h = table.find(x => x.teamId === m.home);
    const a = table.find(x => x.teamId === m.away);
    h.played++; a.played++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;

    if (m.homeScore > m.awayScore) {
      h.wins++; h.points += 3; a.losses++;
    } else if (m.homeScore < m.awayScore) {
      a.wins++; a.points += 3; h.losses++;
    } else {
      h.draws++; a.draws++; h.points++; a.points++;
    }
  });

  table.forEach(t => t.gd = t.gf - t.ga);

  return table.sort((a,b) =>
    b.points - a.points ||
    b.gd - a.gd ||
    b.gf - a.gf ||
    teamName(a.teamId).localeCompare(teamName(b.teamId))
  );
}

function calculatePlayerStats() {
  const stats = players.map(p => ({
    ...p, goals: 0
  }));

  matches.forEach(m => {
    [...(m.homeScorers || []), ...(m.awayScorers || [])].forEach(id => {
      const player = stats.find(p => p.id === id);
      if (player) player.goals++;
    });
  });

  return stats.sort((a,b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name));
}

function matchCard(m) {
  const home = teamById(m.home), away = teamById(m.away);
  const completed = m.homeScore !== null && m.awayScore !== null;

  return `
    <article class="match-card">
      <div class="match-meta">
        <span>${formatDate(m.date)}</span>
        <span>•</span>
        <span>${m.time}</span>
        <span>•</span>
        <span>${m.venue}</span>
        ${completed ? '<span class="status finished">FT</span>' : '<span class="status upcoming">UPCOMING</span>'}
      </div>
      <div class="match-teams">
        <div class="match-team">
          ${teamBadge(home)}
          <strong>${home.name}</strong>
        </div>
        <div class="score">${completed ? `${m.homeScore} <span>–</span> ${m.awayScore}` : "VS"}</div>
        <div class="match-team">
          ${teamBadge(away)}
          <strong>${away.name}</strong>
        </div>
      </div>
      ${completed ? `
        <div class="scorers">
          ${(m.homeScorers || []).map(id => playerById(id)?.name).filter(Boolean).join(", ") || "No scorers"}
          ${m.awayScorers?.length ? " • " + m.awayScorers.map(id => playerById(id)?.name).filter(Boolean).join(", ") : ""}
        </div>` : ""}
    </article>`;
}

function standingsRows(limit = null) {
  const table = calculateStandings();
  const shown = limit ? table.slice(0, limit) : table;

  return shown.map((row, i) => {
    const team = teamById(row.teamId);
    return `
      <tr>
        <td><strong>${i + 1}</strong></td>
        <td><div class="table-team">${teamBadge(team, true)}<strong>${team.name}</strong></div></td>
        <td>${row.played}</td>
        <td>${row.wins}</td>
        <td>${row.draws}</td>
        <td>${row.losses}</td>
        <td>${row.gf}</td>
        <td>${row.ga}</td>
        <td>${row.gd > 0 ? "+" : ""}${row.gd}</td>
        <td><strong>${row.points}</strong></td>
      </tr>`;
  }).join("");
}

function pageShell(title, subtitle, content) {
  return `
    <section class="page">
      <div class="page-heading">
        <div>
          <p class="eyebrow">FOUNDERS FOOTBALL CUP 26/27</p>
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </div>
      </div>
      ${content}
    </section>`;
}

function homePage() {
  const upcoming = matches.filter(m => m.homeScore === null).sort((a,b) => a.date.localeCompare(b.date))[0];
  const recent = matches.filter(m => m.homeScore !== null).slice().reverse().slice(0,4);
  const topPlayers = calculatePlayerStats().slice(0,5);
  const standings = calculateStandings();

  const nextMatchCard = upcoming ? `
        <div class="card next-match">
          <div class="card-head">
            <div><span class="icon">📅</span><h2>Next match</h2></div>
          </div>
          <div class="match-meta centered">${formatDate(upcoming.date)} • ${upcoming.time} • ${upcoming.venue}</div>
          <div class="match-teams">
            <div class="match-team">${teamBadge(teamById(upcoming.home))}<strong>${teamName(upcoming.home)}</strong></div>
            <div class="versus">VS</div>
            <div class="match-team">${teamBadge(teamById(upcoming.away))}<strong>${teamName(upcoming.away)}</strong></div>
          </div>
          <a class="button" href="#fixtures">View fixtures →</a>
        </div>` : `
        <div class="card next-match">
          <div class="card-head"><div><span class="icon">📅</span><h2>Next match</h2></div></div>
          <p class="admin-help">No upcoming matches scheduled.</p>
        </div>`;

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">WELCOME TO THE CUP</p>
        <h1>FOUNDERS<br>FOOTBALL CUP <span>26/27</span></h1>
        <p class="hero-tagline">${TOURNAMENT.tagline}</p>
      </div>
      <div class="hero-ball">⚽</div>
      <div class="confetti c1">✦</div><div class="confetti c2">◆</div><div class="confetti c3">●</div>
    </section>

    <section class="dashboard-grid">
      <div class="card standings-card">
        <div class="card-head">
          <div><span class="icon">🏆</span><h2>Current standings</h2></div>
          <a href="#standings">View full table →</a>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead>
            <tbody>${standingsRows(6)}</tbody>
          </table>
        </div>
      </div>

      <div class="middle-column">
        ${nextMatchCard}

        <div class="card">
          <div class="card-head"><div><span class="icon">↻</span><h2>Latest results</h2></div><a href="#fixtures">View all →</a></div>
          ${recent.map(m => `
            <div class="result-row">
              <span>${formatDate(m.date)}</span>
              <strong>${teamName(m.home)}</strong>
              <b>${m.homeScore} – ${m.awayScore}</b>
              <strong>${teamName(m.away)}</strong>
              <span class="status finished">FT</span>
            </div>`).join("")}
        </div>
      </div>

      <div class="card scorers-card">
        <div class="card-head">
          <div><span class="icon">⚽</span><h2>Top scorers</h2></div>
          <a href="#players">View all →</a>
        </div>
        ${topPlayers.map((p,i) => `
          <div class="player-row">
            <span class="rank">${i+1}.</span>
            <div class="avatar">${p.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div>
            <div class="player-info"><strong>${p.name}</strong><span>${teamName(p.teamId)}</span></div>
            <strong class="goals">${p.goals}<small> Goals</small></strong>
          </div>`).join("")}
      </div>
    </section>

    <section class="quick-links">
      <a href="#standings">🏆 <span>View standings</span> →</a>
      <a href="#teams">👥 <span>Explore teams</span> →</a>
      <a href="#players">⚽ <span>Player stats</span> →</a>
      <a href="#fixtures">📅 <span>View fixtures</span> →</a>
      <a href="#admin">✏️ <span>Edit</span> →</a>
    </section>`;
}

function standingsPage() {
  return pageShell("Standings", "The league table updates automatically from completed match results.", `
    <div class="card large-table">
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead>
          <tbody>${standingsRows()}</tbody>
        </table>
      </div>
      <div class="legend">
        <span><b>W</b> Wins</span><span><b>D</b> Draws</span><span><b>L</b> Losses</span><span><b>GF</b> Goals for</span><span><b>GA</b> Goals against</span><span><b>GD</b> Goal difference</span>
      </div>
    </div>`);
}

function teamsPage() {
  return pageShell("Teams", "Meet the teams competing in the Founders Football Cup.", `
    <div class="team-grid">
      ${teams.map(t => {
        const squad = players.filter(p => p.teamId === t.id);
        return `
          <article class="team-card">
            <div class="team-card-top" style="--team:${t.color}">
              ${teamBadge(t)}
              <div><h2>${t.name}</h2><span>${squad.length} players</span></div>
            </div>
            <div class="squad-list">
              ${squad.map(p => `<div><span>#${p.number}</span><strong>${p.name}</strong><small>${p.position}</small></div>`).join("")}
            </div>
          </article>`;
      }).join("")}
    </div>`);
}

function playersPage() {
  const stats = calculatePlayerStats();
  return pageShell("Players", "Player statistics are calculated from the match data.", `
    <div class="card">
      <div class="table-wrap">
        <table class="player-table">
          <thead><tr><th>Player</th><th>Team</th><th>Position</th><th>Apps</th><th>Goals</th><th>Assists</th></tr></thead>
          <tbody>
            ${stats.map(p => `
              <tr>
                <td><div class="table-team"><div class="avatar">${p.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div><strong>${p.name}</strong></div></td>
                <td>${teamName(p.teamId)}</td><td>${p.position}</td><td>${p.appearances}</td><td><strong>${p.goals}</strong></td><td>${p.assists}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`);
}

function fixturesPage() {
  const upcoming = matches.filter(m => m.homeScore === null).sort((a,b) => a.date.localeCompare(b.date));
  const completed = matches.filter(m => m.homeScore !== null).sort((a,b) => b.date.localeCompare(a.date));

  return pageShell("Fixtures & Results", "All upcoming matches and completed results in one place.", `
    <h2 class="section-title">Upcoming matches</h2>
    <div class="fixtures-grid">${upcoming.map(matchCard).join("")}</div>
    <h2 class="section-title">Results</h2>
    <div class="fixtures-grid">${completed.map(matchCard).join("")}</div>`);
}


const ADMIN_PASSWORD = "GFCadmin26"; // Change this if you want a different password.
let adminUnlocked = false;

function getAdminUnlocked() {
  if (adminUnlocked) return true;
  try { return sessionStorage.getItem("gfc_admin_unlocked") === "yes"; }
  catch (e) { return false; }
}

function setAdminUnlocked(value) {
  adminUnlocked = value;
  try {
    if (value) sessionStorage.setItem("gfc_admin_unlocked", "yes");
    else sessionStorage.removeItem("gfc_admin_unlocked");
  } catch (e) {}
}

function adminLoginPage(message = "") {
  return `
    <section class="page admin-login-page">
      <div class="admin-box card">
        <div class="admin-icon">✏️</div>
        <p class="eyebrow">FOUNDERS FOOTBALL CUP 26/27</p>
        <h1>Admin</h1>
        <p>${sb ? "Sign in with the admin account to edit the tournament." : "Enter the admin password to edit the tournament."}</p>
        ${message ? `<div class="admin-message">${message}</div>` : ""}
        <form id="admin-login-form" class="admin-form" novalidate>
          ${sb ? '<label>Email<input id="admin-email" type="email" autocomplete="username" placeholder="admin@example.com" required></label>' : ""}
          <label>Password<input id="admin-password" type="password" autocomplete="current-password" placeholder="Enter password" required></label>
          <button class="button admin-submit" type="submit">Unlock admin →</button>
        </form>
        <a class="admin-back" href="#home">← Back to home</a>
      </div>
    </section>`;
}

function adminIsUnlocked() {
  return sb ? !!adminSession : getAdminUnlocked();
}

function adminPage() {
  return pageShell("Edit tournament", "Add results, fixtures, players and teams. " + (sb ? "Changes are saved to the shared database and show for everyone." : "Changes are saved in this browser only."), `
    <div class="admin-grid">
      <div class="card admin-card">
        <div class="card-head"><div><span class="icon">⚽</span><h2>Add match result</h2></div></div>
        <form id="result-form" class="admin-form">
          <div class="form-grid">
            <label>Date<input name="date" type="date" required></label>
            <label>Time<input name="time" type="time" required></label>
            <label>Venue<input name="venue" placeholder="Pitch 1" required></label>
            <label>Home team<select name="home" required>${teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></label>
            <label>Away team<select name="away" required>${teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></label>
            <label>Home score<input name="homeScore" type="number" min="0" required></label>
            <label>Away score<input name="awayScore" type="number" min="0" required></label>
          </div>
          <p class="admin-help">For goal scorers, enter player names separated by commas. If a player scores twice, write their name twice.</p>
          <div class="form-grid">
            <label>Home scorers<input name="homeScorers" placeholder="e.g. Omar Hassan, Karim Nabil"></label>
            <label>Away scorers<input name="awayScorers" placeholder="e.g. Adam Samir"></label>
          </div>
          <button class="button admin-submit" type="submit">Save result</button>
        </form>
      </div>

      <div class="card admin-card">
        <div class="card-head"><div><span class="icon">📅</span><h2>Add fixture</h2></div></div>
        <form id="fixture-form" class="admin-form">
          <div class="form-grid">
            <label>Date<input name="date" type="date" required></label>
            <label>Time<input name="time" type="time" required></label>
            <label>Venue<input name="venue" placeholder="Pitch 1" required></label>
            <label>Home team<select name="home" required>${teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></label>
            <label>Away team<select name="away" required>${teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></label>
          </div>
          <button class="button admin-submit" type="submit">Add fixture</button>
        </form>
      </div>

      <div class="card admin-card">
        <div class="card-head"><div><span class="icon">👤</span><h2>Add player</h2></div></div>
        <form id="player-form" class="admin-form">
          <div class="form-grid">
            <label>Name<input name="name" required placeholder="Player name"></label>
            <label>Number<input name="number" type="number" min="0" required></label>
            <label>Position<input name="position" required placeholder="Forward"></label>
            <label>Team<select name="teamId" required>${teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select></label>
          </div>
          <button class="button admin-submit" type="submit">Add player</button>
        </form>
      </div>

      <div class="card admin-card">
        <div class="card-head"><div><span class="icon">👥</span><h2>Add team</h2></div></div>
        <form id="team-form" class="admin-form">
          <div class="form-grid">
            <label>Team name<input name="name" required placeholder="New team"></label>
            <label>Short name<input name="short" maxlength="3" required placeholder="NEW"></label>
            <label>Emoji<input name="emoji" maxlength="2" value="⚽" required></label>
            <label>Colour<input name="color" type="color" value="#6ea8dc" required></label>
          </div>
          <button class="button admin-submit" type="submit">Add team</button>
        </form>
      </div>
    </div>

    <div class="card admin-card admin-existing">
      <div class="card-head"><div><span class="icon">🗑️</span><h2>Manage matches</h2></div></div>
      <div class="admin-match-list">
        ${matches.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(m=>`
          <div class="admin-match-row">
            <div><strong>${teamName(m.home)} ${m.homeScore !== null ? m.homeScore + "–" + m.awayScore : "VS"} ${teamName(m.away)}</strong><span>${formatDate(m.date)} • ${m.time} • ${m.venue}</span></div>
            <button class="danger-button delete-match" data-id="${m.id}" type="button">Delete</button>
          </div>`).join("")}
      </div>
    </div>

    <div class="admin-actions">
      <button id="admin-export" class="button secondary-button" type="button">Download data.js</button>
      <button id="admin-logout" class="button secondary-button" type="button">Lock admin</button>
      <button id="admin-reset" class="button danger-outline" type="button">${sb ? "Reset everything to data.js" : "Reset this browser's edits"}</button>
    </div>`);
}

// Builds a ready-to-upload data.js from the current (edited) data,
// so edits can be published for every visitor by replacing the file on the host.
function exportDataJs() {
  const text =
`/* Exported from the admin page on ${new Date().toISOString().slice(0,10)}. Replace data.js on your website with this file. */

const TOURNAMENT = ${JSON.stringify(TOURNAMENT, null, 2)};

let teams = ${JSON.stringify(teams, null, 2)};

let players = ${JSON.stringify(players, null, 2)};

let matches = ${JSON.stringify(matches, null, 2)};
`;
  const url = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
  const link = document.createElement("a");
  link.href = url; link.download = "data.js";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function playerIdsFromNames(value) {
  return value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean).map(name => {
    const p = players.find(x => x.name.toLowerCase() === name);
    return p?.id;
  }).filter(Boolean);
}

function bindAdminEvents() {
  const login = $("#admin-login-form");
  if (login) login.addEventListener("submit", async e => {
    e.preventDefault();
    e.stopPropagation();
    const password = document.getElementById("admin-password")?.value || "";
    let ok = false;

    if (sb) {
      const email = document.getElementById("admin-email")?.value.trim() || "";
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data?.session) { adminSession = data.session; ok = true; }
    } else if (password === ADMIN_PASSWORD) {
      setAdminUnlocked(true); ok = true;
    }

    if (ok) return render();
    const text = "Incorrect login. Please try again.";
    const message = document.querySelector(".admin-message");
    if (message) message.textContent = text;
    else {
      const note = document.createElement("div");
      note.className = "admin-message";
      note.textContent = text;
      document.querySelector(".admin-box")?.insertBefore(note, login);
    }
    document.getElementById("admin-password")?.select();
  });

  const resultForm = $("#result-form");
  if (resultForm) resultForm.addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(resultForm);
    const home = f.get("home"), away = f.get("away");
    if (home === away) return alert("Home and away teams must be different.");
    const homeScorers = playerIdsFromNames(f.get("homeScorers") || "");
    const awayScorers = playerIdsFromNames(f.get("awayScorers") || "");
    if (homeScorers.length !== Number(f.get("homeScore")) || awayScorers.length !== Number(f.get("awayScore"))) {
      if (!confirm("The number of scorer names does not match the score. Save anyway?")) return;
    }
    matches.push({ id: "m" + Date.now(), date: f.get("date"), time: f.get("time"), venue: f.get("venue"), home, away, homeScore: Number(f.get("homeScore")), awayScore: Number(f.get("awayScore")), homeScorers, awayScorers });
    await commit("Result saved. Standings and player stats have updated.");
  });

  const fixtureForm = $("#fixture-form");
  if (fixtureForm) fixtureForm.addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(fixtureForm);
    if (f.get("home") === f.get("away")) return alert("Home and away teams must be different.");
    matches.push({ id: "m" + Date.now(), date: f.get("date"), time: f.get("time"), venue: f.get("venue"), home: f.get("home"), away: f.get("away"), homeScore: null, awayScore: null, homeScorers: [], awayScorers: [] });
    await commit("Fixture added.");
  });

  const playerForm = $("#player-form");
  if (playerForm) playerForm.addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(playerForm), name = f.get("name");
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") + "-" + Date.now();
    players.push({ id, name, teamId:f.get("teamId"), number:Number(f.get("number")), position:f.get("position"), assists:0, appearances:0 });
    await commit("Player added.");
  });

  const teamForm = $("#team-form");
  if (teamForm) teamForm.addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(teamForm), name=f.get("name"), id=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    if (teams.some(t=>t.id===id)) return alert("A team with that name already exists.");
    teams.push({ id, name, short:f.get("short").toUpperCase(), emoji:f.get("emoji"), color:f.get("color") });
    await commit("Team added.");
  });

  document.querySelectorAll(".delete-match").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Delete this match? This will change the standings and scorer totals.")) return;
    matches = matches.filter(m => m.id !== btn.dataset.id);
    await commit();
  }));

  $("#admin-export")?.addEventListener("click", exportDataJs);
  $("#admin-logout")?.addEventListener("click", async () => {
    if (sb) { await sb.auth.signOut(); adminSession = null; } else setAdminUnlocked(false);
    location.hash = "home";
  });
  $("#admin-reset")?.addEventListener("click", () => {
    if (confirm(sb ? "Reset the shared database back to the original data.js? Everyone will see this." : "Reset all admin edits made on this browser and return to the original data?")) resetTournamentData();
  });
}

function render() {
  const page = location.hash.replace("#", "") || "home";
  if (page === "admin" && !adminIsUnlocked()) {
    $("#app").innerHTML = adminLoginPage();
    bindAdminEvents();
    window.scrollTo({top: 0, behavior: "instant"});
    return;
  }
  const pages = { home: homePage, standings: standingsPage, teams: teamsPage, players: playersPage, fixtures: fixturesPage, admin: adminPage };
  $("#app").innerHTML = pages[page] ? pages[page]() : homePage();
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("active", a.dataset.page === page));
  if (page === "admin") bindAdminEvents();
  window.scrollTo({top: 0, behavior: "instant"});
}

window.addEventListener("hashchange", render);

async function init() {
  $("#app").innerHTML = '<section class="page"><p class="admin-help">Loading…</p></section>';
  if (sb) {
    const { data } = await sb.auth.getSession();
    adminSession = data?.session || null;
    sb.auth.onAuthStateChange((_event, session) => { adminSession = session; });
  }
  await loadTournamentData();
  render();

  // Pick up changes other people made when the tab becomes visible again
  // (skipped on the admin page so half-filled forms aren't wiped).
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !sb || location.hash === "#admin") return;
    if (await loadTournamentData()) render();
  });
}
init();
