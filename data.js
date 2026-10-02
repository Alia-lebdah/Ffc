/*
  ============================================================
  FOUNDERS FOOTBALL CUP 26/27 — EDIT YOUR TOURNAMENT HERE
  ============================================================

  This is the ONLY file you need to edit for normal updates.

  1. Change team names/badges/colors in teams.
  2. Add/remove players in players.
  3. Add fixtures/results in matches.
  4. Refresh the website.

  IMPORTANT:
  - A match with a score is treated as completed.
  - A match without homeScore/awayScore is upcoming.
  - Standings are calculated automatically from completed matches.
  - Player goals are calculated from the scorer lists in matches.
*/

const TOURNAMENT = {
  name: "Founders Football Cup",
  season: "26/27",
  tagline: "Same school • Same passion • One cup"
};

let teams = [
  { id: "falcons", name: "Falcons", short: "FAL", emoji: "🦅", color: "#ef6f91" },
  { id: "lions", name: "Lions", short: "LIO", emoji: "🦁", color: "#4d8fc4" },
  { id: "tigers", name: "Tigers", short: "TIG", emoji: "🐯", color: "#eab84d" },
  { id: "eagles", name: "Eagles", short: "EAG", emoji: "🦅", color: "#63a895" },
  { id: "sharks", name: "Sharks", short: "SHA", emoji: "🦈", color: "#7458a8" },
  { id: "wolves", name: "Wolves", short: "WOL", emoji: "🐺", color: "#727b83" }
];

let players = [
  { id: "omar-hassan", name: "Omar Hassan", teamId: "falcons", number: 9, position: "Forward", assists: 2, appearances: 4 },
  { id: "youssef-adel", name: "Youssef Adel", teamId: "lions", number: 10, position: "Forward", assists: 1, appearances: 4 },
  { id: "rami-khaled", name: "Rami Khaled", teamId: "tigers", number: 7, position: "Forward", assists: 2, appearances: 4 },
  { id: "ziad-mostafa", name: "Ziad Mostafa", teamId: "eagles", number: 11, position: "Midfielder", assists: 1, appearances: 4 },
  { id: "ali-farouk", name: "Ali Farouk", teamId: "sharks", number: 9, position: "Forward", assists: 1, appearances: 4 },
  { id: "adam-samir", name: "Adam Samir", teamId: "wolves", number: 10, position: "Midfielder", assists: 1, appearances: 4 },
  { id: "karim-nabil", name: "Karim Nabil", teamId: "falcons", number: 7, position: "Midfielder", assists: 3, appearances: 4 },
  { id: "yassin-mahmoud", name: "Yassin Mahmoud", teamId: "lions", number: 8, position: "Midfielder", assists: 2, appearances: 4 },
  { id: "mina-george", name: "Mina George", teamId: "tigers", number: 5, position: "Defender", assists: 1, appearances: 4 },
  { id: "seif-ali", name: "Seif Ali", teamId: "eagles", number: 8, position: "Midfielder", assists: 2, appearances: 4 },
  { id: "khaled-tarek", name: "Khaled Tarek", teamId: "sharks", number: 6, position: "Defender", assists: 1, appearances: 4 },
  { id: "malek-hany", name: "Malek Hany", teamId: "wolves", number: 9, position: "Forward", assists: 1, appearances: 4 }
];

/*
  Each scorer is a player ID.
  Example: ["omar-hassan", "karim-nabil"] means those two players scored.
*/
let matches = [
  {
    id: "m1",
    date: "2026-09-20",
    time: "10:00",
    venue: "Pitch 1",
    home: "falcons",
    away: "wolves",
    homeScore: 3,
    awayScore: 2,
    homeScorers: ["omar-hassan", "omar-hassan", "karim-nabil"],
    awayScorers: ["adam-samir", "malek-hany"]
  },
  {
    id: "m2",
    date: "2026-09-20",
    time: "11:30",
    venue: "Pitch 1",
    home: "lions",
    away: "sharks",
    homeScore: 4,
    awayScore: 0,
    homeScorers: ["youssef-adel", "youssef-adel", "yassin-mahmoud", "youssef-adel"],
    awayScorers: []
  },
  {
    id: "m3",
    date: "2026-09-21",
    time: "10:00",
    venue: "Pitch 2",
    home: "tigers",
    away: "sharks",
    homeScore: 2,
    awayScore: 1,
    homeScorers: ["rami-khaled", "rami-khaled"],
    awayScorers: ["ali-farouk"]
  },
  {
    id: "m4",
    date: "2026-09-21",
    time: "11:30",
    venue: "Pitch 2",
    home: "eagles",
    away: "lions",
    homeScore: 1,
    awayScore: 1,
    homeScorers: ["ziad-mostafa"],
    awayScorers: ["youssef-adel"]
  },
  {
    id: "m5",
    date: "2026-10-03",
    time: "10:00",
    venue: "Pitch 1",
    home: "falcons",
    away: "lions",
    homeScore: null,
    awayScore: null,
    homeScorers: [],
    awayScorers: []
  },
  {
    id: "m6",
    date: "2026-10-03",
    time: "11:30",
    venue: "Pitch 1",
    home: "tigers",
    away: "eagles",
    homeScore: null,
    awayScore: null,
    homeScorers: [],
    awayScorers: []
  },
  {
    id: "m7",
    date: "2026-10-10",
    time: "10:00",
    venue: "Pitch 2",
    home: "wolves",
    away: "sharks",
    homeScore: null,
    awayScore: null,
    homeScorers: [],
    awayScorers: []
  }
];
