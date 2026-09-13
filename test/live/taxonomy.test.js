import test from "node:test";
import assert from "node:assert/strict";
import { SPORTS, COMPETITIONS, TEAMS, matchTeams, matchCompetition, teamsFromEnv, competitionById, teamById } from "../../src/live/taxonomy.js";

test("sports are ordered as the Home screen wants them", () => {
  assert.deepEqual(SPORTS, ["soccer", "college-football", "nfl", "cricket", "nba", "mlb", "f1", "tennis"]);
});

test("team aliases", () => {
  assert.deepEqual(matchTeams("UEFA Champions League| Real Madrid vs. Juventus"), ["real-madrid"]);
  assert.deepEqual(matchTeams("Elche vs R. Madrid"), ["real-madrid"]);
  assert.deepEqual(matchTeams("Liverpool Women v Arsenal Women"), []);
  assert.deepEqual(matchTeams("Liverpool vs Tottenham Hotspur"), ["liverpool"]);
  assert.deepEqual(matchTeams("Penn State Nittany Lions at Oregon Ducks"), ["penn-state"]);
  assert.deepEqual(matchTeams("Al-Nassr vs Al Hilal"), ["al-nassr"]);
  assert.deepEqual(matchTeams("Al Nassr FC v Neom"), ["al-nassr"]);
  assert.deepEqual(matchTeams("MI vs CSK", "cricket"), ["mumbai-indians"]);
  assert.deepEqual(matchTeams("MI vs CSK"), [], "MI only counts inside cricket");
  assert.deepEqual(matchTeams("India v West Indies, 1st T20I", "cricket"), ["india-cricket"]);
  assert.deepEqual(matchTeams("India Cricket vs West Indies Cricket"), ["india-cricket"], "cricket keyword gives context");
  assert.deepEqual(matchTeams("India v Iran (AFC Qualifier)"), [], "plain India without cricket context is not the cricket team");
});

test("competition keywords + rights map", () => {
  assert.equal(matchCompetition("Live Premier League: Coventry v Brighton"), "premier-league");
  assert.equal(matchCompetition("Test Cricket"), "cricket-international");
  assert.equal(matchCompetition("Live Indian Premier League: MI v CSK"), "ipl");
  assert.equal(matchCompetition("UEFA Champions League| Frankfurt vs. Liverpool"), "champions-league");
  assert.equal(matchCompetition("AFC Champions League Al Ain vs Al-Nassr"), "afc-champions-league");
  assert.equal(matchCompetition("Solheim Cup Women's Golf"), null);
  assert.deepEqual(competitionById("premier-league").networks.UK, ["sky-sports-premier-league", "sky-sports-main-event", "tnt-sports-1"]);
  assert.deepEqual(competitionById("saudi-pro-league").networks.UK, []);
  assert.deepEqual(competitionById("college-football").espn, { sport: "football", league: "college-football", groups: "80" });
});

test("every competition has a sport in SPORTS and every team has a known sport + competitions", () => {
  for (const c of COMPETITIONS) assert.ok(SPORTS.includes(c.sport), c.id);
  for (const t of TEAMS) {
    assert.ok(SPORTS.includes(t.sport), t.id);
    for (const c of t.competitions) assert.ok(competitionById(c), `${t.id} → ${c}`);
  }
  assert.equal(teamById("liverpool").tsdbId, "133602");
});

test("teamsFromEnv ignores unknown ids and trims", () => {
  assert.deepEqual(teamsFromEnv("liverpool, nope ,india-cricket"), ["liverpool", "india-cricket"]);
  assert.deepEqual(teamsFromEnv(""), TEAMS.map((t) => t.id), "empty → all default teams");
});
