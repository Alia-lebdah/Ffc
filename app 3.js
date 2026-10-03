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

// Make sure every match has the fields the live features need
// (older saved data won't have them yet).
function normalizeMatches() {
  matches.forEach(m => {
    if (!Array.isArray(m.events)) m.events = [];
    if (!Array.isArray(m.homeScorers)) m.homeScorers = [];
    if (!Array.isArray(m.awayScorers)) m.awayScorers = [];
    if (!m.status) {
      m.status = (m.homeScore != null && m.awayScore != null) ? "finished" : "upcoming";
    }
  });
}
normalizeMatches();

function applyData(d) {
  if (d?.teams && d?.players && d?.matches) {
    teams = d.teams; players = d.players; matches = d.matches;
    normalizeMatches();
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
  render({ keepScroll: location.hash === "#admin" });
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

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isFinished = m => m.status === "finished";
const isLive = m => m.status === "live";
const isUpcoming = m => !isFinished(m) && !isLive(m);
const byKickoff = (a, b) => (a.date + " " + (a.time || "")).localeCompare(b.date + " " + (b.time || ""));

// ---- Live match clock -------------------------------------------------
// The admin sets a starting minute; every visitor's browser keeps counting
// from there, so the database isn't written to every minute.
function liveMinute(m) {
  const c = m.clock;
  if (!c) return 0;
  const base = Number(c.minute) || 0;
  if (!c.running) return base;
  const started = Date.parse(c.at);
  if (isNaN(started)) return base;
  return base + Math.max(0, Math.floor((Date.now() - started) / 60000));
}
function liveMinuteText(m) {
  return m.phase === "HT" ? "HT" : liveMinute(m) + "'";
}
function updateLiveClocks() {
  document.querySelectorAll("[data-live-minute]").forEach(el => {
    const m = matches.find(x => x.id === el.dataset.liveMinute);
    if (m) el.textContent = liveMinuteText(m);
  });
}

// ---- Match events (goals, penalties, cards) ---------------------------
const EVENT_META = {
  goal:            { icon: "⚽", label: "Goal" },
  penalty_awarded: { icon: "⚠️", label: "Penalty awarded" },
  penalty_scored:  { icon: "🎯", label: "Penalty scored" },
  penalty_saved:   { icon: "🧤", label: "Penalty saved" },
  penalty_missed:  { icon: "❌", label: "Penalty missed" },
  own_goal:        { icon: "⚽", label: "Own goal" },
  yellow:          { icon: "🟨", label: "Yellow card" },
  red:             { icon: "🟥", label: "Red card" }
};
const eventMeta = ev => EVENT_META[ev.type] || { icon: "•", label: ev.type };

// Which column an event is shown in. An own goal counts for the other team.
const displaySide = ev => ev.type === "own_goal" ? (ev.side === "home" ? "away" : "home") : ev.side;

function sortedEvents(m) {
  return m.events.map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.minute - b.e.minute || a.i - b.i)
    .map(x => x.e);
}

function eventRow(ev) {
  const meta = eventMeta(ev);
  const name = ev.playerId ? (playerById(ev.playerId)?.name || "") : "";
  const other = ev.otherId ? (playerById(ev.otherId)?.name || "") : "";
  const parts = [];
  if (name) parts.push(meta.label);
  if (ev.type === "goal" && other) parts.push("assist " + other);
  if (ev.type === "penalty_saved" && other) parts.push("saved by " + other);
  const text = `<span class="ev-text"><strong>${esc(name || meta.label)}</strong>${parts.length ? `<small>${parts.map(esc).join(" • ")}</small>` : ""}</span>`;
  const icon = `<span class="ev-icon">${meta.icon}</span>`;
  const side = displaySide(ev);
  return `<div class="event-row ${side}"><div class="ev">${side === "home" ? text + icon : icon + text}</div><span class="min">${esc(ev.minute)}'</span></div>`;
}

function timeline(m) {
  let list = sortedEvents(m);
  if (isLive(m)) list = list.reverse();   // newest first while the match is on
  return `<div class="timeline">${list.map(eventRow).join("")}</div>`;
}

// Goals add to the score (and the scorer's tally); dir = +1 to add, -1 to undo.
function applyEventEffects(m, ev, dir) {
  const bump = (side, n) => {
    const key = side === "home" ? "homeScore" : "awayScore";
    m[key] = Math.max(0, (m[key] ?? 0) + n);
  };
  if (ev.type === "goal" || ev.type === "penalty_scored") {
    bump(ev.side, dir);
    if (ev.playerId) {
      const list = ev.side === "home" ? m.homeScorers : m.awayScorers;
      if (dir > 0) list.push(ev.playerId);
      else { const i = list.lastIndexOf(ev.playerId); if (i >= 0) list.splice(i, 1); }
    }
  } else if (ev.type === "own_goal") {
    bump(ev.side === "home" ? "away" : "home", dir);
  }
}

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

  matches.filter(isFinished).forEach(m => {
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
  const live = isLive(m), finished = isFinished(m);
  const showScore = live || finished;
  const badge = live
    ? `<span class="status live"><i class="live-dot"></i>LIVE <span data-live-minute="${esc(m.id)}">${liveMinuteText(m)}</span></span>`
    : finished ? '<span class="status finished">FT</span>' : '<span class="status upcoming">UPCOMING</span>';

  let details = "";
  if (m.events.length) details = timeline(m);
  else if (finished) details = `
        <div class="scorers">
          ${(m.homeScorers || []).map(id => playerById(id)?.name).filter(Boolean).join(", ") || "No scorers"}
          ${m.awayScorers?.length ? " • " + m.awayScorers.map(id => playerById(id)?.name).filter(Boolean).join(", ") : ""}
        </div>`;

  return `
    <article class="match-card ${live ? "is-live" : ""}">
      <div class="match-meta">
        <span>${formatDate(m.date)}</span>
        <span>•</span>
        <span>${m.time}</span>
        <span>•</span>
        <span>${m.venue}</span>
        ${badge}
      </div>
      <div class="match-teams">
        <div class="match-team">
          ${teamBadge(home)}
          <strong>${home.name}</strong>
        </div>
        <div class="score">${showScore ? `${m.homeScore ?? 0} <span>–</span> ${m.awayScore ?? 0}` : "VS"}</div>
        <div class="match-team">
          ${teamBadge(away)}
          <strong>${away.name}</strong>
        </div>
      </div>
      ${details}
    </article>`;
}

function liveBanner() {
  const liveMatches = matches.filter(isLive);
  if (!liveMatches.length) return "";
  return `
    <section class="live-banner">
      <div class="live-banner-head">
        <span class="live-pill"><i class="live-dot"></i>LIVE NOW</span>
        <a href="#fixtures">All fixtures →</a>
      </div>
      <div class="live-banner-grid">${liveMatches.map(matchCard).join("")}</div>
    </section>`;
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
  const upcoming = matches.filter(isUpcoming).sort(byKickoff)[0];
  const recent = matches.filter(isFinished).slice().reverse().slice(0,4);
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

    ${liveBanner()}

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
  const liveNow = matches.filter(isLive).sort(byKickoff);
  const upcoming = matches.filter(isUpcoming).sort(byKickoff);
  const completed = matches.filter(isFinished).sort((a,b) => byKickoff(b, a));

  return pageShell("Fixtures & Results", "All upcoming matches and completed results in one place.", `
    ${liveNow.length ? `<h2 class="section-title">🔴 Live now</h2><div class="fixtures-grid">${liveNow.map(matchCard).join("")}</div>` : ""}
    <h2 class="section-title">Upcoming matches</h2>
    <div class="fixtures-grid">${upcoming.map(matchCard).join("") || '<p class="admin-help">No upcoming matches.</p>'}</div>
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

// ---------------------------------------------------------------
// LIVE MATCH CONTROL (admin)
// ---------------------------------------------------------------
let liveMatchId = null;

const EVENT_HELP = {
  goal: "Pick the team that scored. The score updates automatically.",
  penalty_awarded: "Pick the team that was awarded the penalty.",
  penalty_scored: "Pick the team taking the penalty. The score updates automatically.",
  penalty_saved: "Pick the team taking the penalty (the player is the taker).",
  penalty_missed: "Pick the team taking the penalty (the player is the taker).",
  own_goal: "Pick the team of the player who scored it. The goal is added to the other team.",
  yellow: "Pick the team of the player who got the card.",
  red: "Pick the team of the player who got the card."
};

function liveControlCard() {
  const rank = m => isLive(m) ? 0 : isUpcoming(m) ? 1 : 2;
  const list = matches.slice().sort((a, b) =>
    rank(a) - rank(b) || (rank(a) === 2 ? byKickoff(b, a) : byKickoff(a, b)));

  if (!list.length) return `
    <div class="card admin-card live-control">
      <div class="card-head"><div><span class="icon">🔴</span><h2>Live match control</h2></div></div>
      <p class="admin-help">Add a fixture first, then you can run it live from here.</p>
    </div>`;

  const m = list.find(x => x.id === liveMatchId) || list[0];
  liveMatchId = m.id;
  const live = isLive(m), finished = isFinished(m), ht = live && m.phase === "HT";
  const statusText = live ? (ht ? "Half time" : "Live • " + liveMinuteText(m)) : finished ? "Full time" : "Not started";

  const buttons = (!live && !finished)
    ? `<button class="button" data-live="start" type="button">▶ Start match</button>`
    : live && !ht
      ? `<button class="button" data-live="ht" type="button">⏸ Half time</button><button class="danger-button" data-live="ft" type="button">⏹ Full time</button>`
      : live
        ? `<button class="button" data-live="resume" type="button">▶ Start 2nd half</button><button class="danger-button" data-live="ft" type="button">⏹ Full time</button>`
        : `<button class="secondary-button" data-live="reopen" type="button">↩ Reopen match</button>`;

  const clockSet = live ? `
      <div class="live-minute-set">
        <input id="clock-minute" type="number" min="0" max="150" placeholder="Fix the clock: minute">
        <button id="clock-set" class="secondary-button" type="button">Set minute</button>
      </div>` : "";

  const eventForm = isUpcoming(m) ? `<p class="admin-help">Press <b>Start match</b> to begin adding goals, penalties and cards.</p>` : `
      <form id="event-form" class="admin-form">
        <div class="form-grid">
          <label>Event<select name="type">${Object.keys(EVENT_META).map(k => `<option value="${k}">${EVENT_META[k].icon} ${EVENT_META[k].label}</option>`).join("")}</select></label>
          <label>Team<select name="side"><option value="home">${esc(teamName(m.home))}</option><option value="away">${esc(teamName(m.away))}</option></select></label>
          <label>Minute<input name="minute" type="number" min="0" max="150" required value="${live ? liveMinute(m) : ""}"></label>
          <label>Player<select name="playerId"></select></label>
          <label id="other-label"><span>Assisted by (optional)</span><select name="otherId"></select></label>
        </div>
        <p class="admin-help" id="event-help"></p>
        <button class="button admin-submit" type="submit">Add event</button>
      </form>`;

  const events = sortedEvents(m).slice().reverse().map(e => {
    const meta = eventMeta(e);
    const pl = e.playerId ? playerById(e.playerId)?.name : "";
    const team = teamName(e.side === "home" ? m.home : m.away);
    return `
      <div class="admin-match-row">
        <div><strong>${esc(e.minute)}' ${meta.icon} ${esc(meta.label)}${pl ? " — " + esc(pl) : ""}</strong><span>${esc(team)}</span></div>
        <button class="danger-button delete-event" data-id="${esc(e.id)}" type="button">Delete</button>
      </div>`;
  }).join("");

  return `
    <div class="card admin-card live-control">
      <div class="card-head"><div><span class="icon">🔴</span><h2>Live match control</h2></div></div>
      <div class="admin-form">
        <label>Match<select id="live-match-select">${list.map(x => `<option value="${esc(x.id)}" ${x.id === m.id ? "selected" : ""}>${esc(teamName(x.home))} vs ${esc(teamName(x.away))} • ${formatDate(x.date)} ${esc(x.time)}${isLive(x) ? " (LIVE)" : isFinished(x) ? " (finished)" : ""}</option>`).join("")}</select></label>
      </div>
      <div class="live-scoreboard">
        <strong>${esc(teamName(m.home))}</strong>
        <div class="score">${isUpcoming(m) ? "VS" : `${m.homeScore ?? 0} <span>–</span> ${m.awayScore ?? 0}`}</div>
        <strong>${esc(teamName(m.away))}</strong>
      </div>
      <p class="live-status ${live ? "on" : ""}">${statusText}</p>
      <div class="live-buttons">${buttons}</div>
      ${clockSet}
      ${eventForm}
      ${events ? `<h3 class="live-events-title">Events</h3><div class="admin-match-list">${events}</div>` : ""}
    </div>`;
}

// Fill the player drop-downs for the chosen team / event type.
function fillEventForm(form, m) {
  if (!m) return;
  const el = form.elements;
  const type = el.type.value, side = el.side.value;
  const teamId = side === "home" ? m.home : m.away;
  const oppId = side === "home" ? m.away : m.home;
  const options = id => '<option value="">— not sure / skip —</option>' +
    players.filter(p => p.teamId === id).sort((a, b) => a.name.localeCompare(b.name))
      .map(p => `<option value="${esc(p.id)}">#${esc(p.number)} ${esc(p.name)}</option>`).join("");

  el.playerId.innerHTML = options(teamId);
  const wrap = form.querySelector("#other-label");
  if (type === "goal") {
    wrap.firstElementChild.textContent = "Assisted by (optional)";
    el.otherId.innerHTML = options(teamId);
    wrap.style.display = "";
  } else if (type === "penalty_saved") {
    wrap.firstElementChild.textContent = "Saved by goalkeeper (optional)";
    el.otherId.innerHTML = options(oppId);
    wrap.style.display = "";
  } else {
    el.otherId.innerHTML = options(teamId);
    wrap.style.display = "none";
  }
  form.querySelector("#event-help").textContent = EVENT_HELP[type] || "";
}

function bindLiveControl() {
  $("#live-match-select")?.addEventListener("change", e => {
    liveMatchId = e.target.value;
    render({ keepScroll: true });
  });

  const nowIso = () => new Date().toISOString();
  const ensureScores = m => { if (m.homeScore == null) m.homeScore = 0; if (m.awayScore == null) m.awayScore = 0; };

  // Always work on the latest saved data, so a second device can't overwrite it with old data.
  const withMatch = async fn => {
    if (sb) await loadTournamentData();
    const m = matches.find(x => x.id === liveMatchId);
    if (!m) return;
    if (fn(m) === false) return;
    await commit();
  };

  document.querySelectorAll("[data-live]").forEach(btn => btn.addEventListener("click", () => {
    const action = btn.dataset.live;
    if (action === "ft" && !confirm("End the match? The final score will count in the standings.")) return;
    btn.disabled = true;
    withMatch(m => {
      if (action === "start") { m.status = "live"; ensureScores(m); m.phase = ""; m.clock = { minute: 0, at: nowIso(), running: true }; }
      if (action === "ht") { m.clock = { minute: liveMinute(m), at: nowIso(), running: false }; m.phase = "HT"; }
      if (action === "resume") { m.clock = { minute: m.clock?.minute || 0, at: nowIso(), running: true }; m.phase = ""; }
      if (action === "ft") { m.clock = { minute: liveMinute(m), at: nowIso(), running: false }; m.status = "finished"; m.phase = ""; ensureScores(m); }
      if (action === "reopen") { m.status = "live"; m.phase = ""; m.clock = { minute: m.clock?.minute || 0, at: nowIso(), running: true }; }
    });
  }));

  $("#clock-set")?.addEventListener("click", () => {
    const input = $("#clock-minute");
    const n = Number(input.value);
    if (input.value === "" || !Number.isFinite(n) || n < 0) return alert("Type the minute first.");
    withMatch(m => { m.clock = { minute: Math.round(n), at: nowIso(), running: true }; m.phase = ""; });
  });

  const form = $("#event-form");
  if (form) {
    const current = () => matches.find(x => x.id === liveMatchId);
    let minuteTouched = false;
    form.elements.minute.addEventListener("input", () => { minuteTouched = true; });
    // Keep the minute box up to date until you type your own.
    form.addEventListener("focusin", () => {
      const m = current();
      if (!minuteTouched && m && isLive(m)) form.elements.minute.value = liveMinute(m);
    });
    form.addEventListener("change", e => {
      if (e.target.name === "type" || e.target.name === "side") fillEventForm(form, current());
    });
    fillEventForm(form, current());

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const el = form.elements;
      const minute = Number(el.minute.value);
      if (el.minute.value === "" || !Number.isFinite(minute) || minute < 0) return alert("Enter the minute of the event.");
      const type = el.type.value;
      const ev = {
        id: "e" + Date.now() + Math.random().toString(36).slice(2, 6),
        type, side: el.side.value, minute: Math.round(minute),
        playerId: el.playerId.value || null,
        otherId: (type === "goal" || type === "penalty_saved") ? (el.otherId.value || null) : null
      };
      await withMatch(m => {
        if (isUpcoming(m)) { alert("Start the match first."); return false; }
        ensureScores(m);
        m.events.push(ev);
        applyEventEffects(m, ev, +1);
      });
    });
  }

  document.querySelectorAll(".delete-event").forEach(btn => btn.addEventListener("click", () => {
    if (!confirm("Delete this event? If it was a goal, the score goes down by one.")) return;
    withMatch(m => {
      const i = m.events.findIndex(e => e.id === btn.dataset.id);
      if (i < 0) return false;
      const [ev] = m.events.splice(i, 1);
      applyEventEffects(m, ev, -1);
    });
  }));
}

function adminPage() {
  return pageShell("Edit tournament", "Run live matches, add results, fixtures, players and teams. " + (sb ? "Changes are saved to the shared database and show for everyone." : "Changes are saved in this browser only."), `
    ${liveControlCard()}

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

    <div class="admin-grid admin-existing">
      <div class="card admin-card">
        <div class="card-head"><div><span class="icon">👥</span><h2>Manage teams</h2></div></div>
        <div class="admin-match-list">
          ${teams.map(t=>`
            <div class="admin-match-row">
              <div><strong>${t.emoji} ${t.name}</strong><span>${players.filter(p=>p.teamId===t.id).length} players • ${matches.filter(m=>m.home===t.id||m.away===t.id).length} matches</span></div>
              <button class="danger-button delete-team" data-id="${t.id}" type="button">Delete</button>
            </div>`).join("") || '<p class="admin-help">No teams.</p>'}
        </div>
      </div>
      <div class="card admin-card">
        <div class="card-head"><div><span class="icon">⚽</span><h2>Manage players</h2></div></div>
        <div class="admin-match-list">
          ${players.slice().sort((x,y)=>x.name.localeCompare(y.name)).map(p=>`
            <div class="admin-match-row">
              <div><strong>${p.name}</strong><span>${teamName(p.teamId)} • #${p.number} • ${p.position}</span></div>
              <button class="danger-button delete-player" data-id="${p.id}" type="button">Delete</button>
            </div>`).join("") || '<p class="admin-help">No players.</p>'}
        </div>
      </div>
    </div>

    <div class="card admin-card admin-existing">
      <div class="card-head"><div><span class="icon">🗑️</span><h2>Manage matches</h2></div></div>
      <div class="admin-match-list">
        ${matches.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(m=>`
          <div class="admin-match-row">
            <div><strong>${teamName(m.home)} ${(m.homeScore != null && !isUpcoming(m)) ? m.homeScore + "–" + m.awayScore : "VS"} ${teamName(m.away)}${isLive(m) ? " 🔴 LIVE" : ""}</strong><span>${formatDate(m.date)} • ${m.time} • ${m.venue}</span></div>
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
    matches.push({ id: "m" + Date.now(), date: f.get("date"), time: f.get("time"), venue: f.get("venue"), home, away, homeScore: Number(f.get("homeScore")), awayScore: Number(f.get("awayScore")), homeScorers, awayScorers, status: "finished", events: [] });
    await commit("Result saved. Standings and player stats have updated.");
  });

  const fixtureForm = $("#fixture-form");
  if (fixtureForm) fixtureForm.addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(fixtureForm);
    if (f.get("home") === f.get("away")) return alert("Home and away teams must be different.");
    matches.push({ id: "m" + Date.now(), date: f.get("date"), time: f.get("time"), venue: f.get("venue"), home: f.get("home"), away: f.get("away"), homeScore: null, awayScore: null, homeScorers: [], awayScorers: [], status: "upcoming", events: [] });
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

  document.querySelectorAll(".delete-player").forEach(btn => btn.addEventListener("click", async () => {
    const p = playerById(btn.dataset.id);
    if (!p || !confirm(`Delete ${p.name}? Their goals will no longer be counted.`)) return;
    players = players.filter(x => x.id !== p.id);
    matches.forEach(m => {
      m.homeScorers = (m.homeScorers || []).filter(id => id !== p.id);
      m.awayScorers = (m.awayScorers || []).filter(id => id !== p.id);
      m.events.forEach(e => { if (e.playerId === p.id) e.playerId = null; if (e.otherId === p.id) e.otherId = null; });
    });
    await commit();
  }));

  document.querySelectorAll(".delete-team").forEach(btn => btn.addEventListener("click", async () => {
    const t = teamById(btn.dataset.id);
    if (!t) return;
    const nPlayers = players.filter(p => p.teamId === t.id).length;
    const nMatches = matches.filter(m => m.home === t.id || m.away === t.id).length;
    if (!confirm(`Delete ${t.name}? This also deletes its ${nPlayers} player(s) and ${nMatches} match(es), and changes the standings.`)) return;
    const gone = new Set(players.filter(p => p.teamId === t.id).map(p => p.id));
    teams = teams.filter(x => x.id !== t.id);
    players = players.filter(p => p.teamId !== t.id);
    matches = matches.filter(m => m.home !== t.id && m.away !== t.id);
    matches.forEach(m => {
      m.homeScorers = (m.homeScorers || []).filter(id => !gone.has(id));
      m.awayScorers = (m.awayScorers || []).filter(id => !gone.has(id));
    });
    await commit();
  }));

  bindLiveControl();

  $("#admin-export")?.addEventListener("click", exportDataJs);
  $("#admin-logout")?.addEventListener("click", async () => {
    if (sb) { await sb.auth.signOut(); adminSession = null; } else setAdminUnlocked(false);
    location.hash = "home";
  });
  $("#admin-reset")?.addEventListener("click", () => {
    if (confirm(sb ? "Reset the shared database back to the original data.js? Everyone will see this." : "Reset all admin edits made on this browser and return to the original data?")) resetTournamentData();
  });
}

function render(opts = {}) {
  const page = location.hash.replace("#", "") || "home";
  const toTop = () => { if (!opts.keepScroll) window.scrollTo({top: 0, behavior: "instant"}); };
  if (page === "admin" && !adminIsUnlocked()) {
    $("#app").innerHTML = adminLoginPage();
    bindAdminEvents();
    toTop();
    return;
  }
  const pages = { home: homePage, standings: standingsPage, teams: teamsPage, players: playersPage, fixtures: fixturesPage, admin: adminPage };
  $("#app").innerHTML = pages[page] ? pages[page]() : homePage();
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("active", a.dataset.page === page));
  if (page === "admin") bindAdminEvents();
  toTop();
}

window.addEventListener("hashchange", () => render());

// ---------------------------------------------------------------
// LIVE UPDATES FOR VISITORS
// - Supabase Realtime pushes a ping the moment the admin saves
//   (needs the one-line addition in setup.sql), and
// - a light poll is the safety net: every 8s while a match is live,
//   every 45s otherwise. Skipped on the admin page so forms aren't wiped.
// ---------------------------------------------------------------
let refreshing = false;
async function refreshLive() {
  if (!sb || refreshing || document.visibilityState !== "visible" || location.hash === "#admin") return;
  refreshing = true;
  try {
    if (await loadTournamentData()) render({ keepScroll: true });
  } finally {
    refreshing = false;
  }
}

function scheduleRefresh() {
  setTimeout(async () => {
    await refreshLive();
    scheduleRefresh();
  }, matches.some(isLive) ? 8000 : 45000);
}

async function init() {
  $("#app").innerHTML = '<section class="page"><p class="admin-help">Loading…</p></section>';
  if (sb) {
    const { data } = await sb.auth.getSession();
    adminSession = data?.session || null;
    sb.auth.onAuthStateChange((_event, session) => { adminSession = session; });
  }
  await loadTournamentData();
  render();

  setInterval(updateLiveClocks, 15000);   // keeps the match minute ticking

  if (sb) {
    document.addEventListener("visibilitychange", () => refreshLive());
    try {
      sb.channel("tournament-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "tournament" }, () => refreshLive())
        .subscribe();
    } catch (e) { console.warn("Realtime not available, using polling.", e); }
    scheduleRefresh();
  }
}
init();
