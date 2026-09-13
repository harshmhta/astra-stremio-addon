import test from "node:test";
import assert from "node:assert/strict";
import { parseEventName, matchesFixture, teamKey } from "../../src/live/events.js";

const NOW = Date.UTC(2026, 9, 20, 12); // 2026-10-20 12:00Z

test("DAZN-style name: competition | teams | weekday date without year", () => {
  const p = parseEventName("CA-DAZN 14: UEFA Champions League| Real Madrid vs. Juventus (Commentaires en Français)| Wed 22 Oct 3:00 PM", NOW);
  assert.equal(p.competition, "champions-league");
  assert.equal(p.home, "Real Madrid");
  assert.equal(p.away, "Juventus");
  assert.equal(p.start, Date.UTC(2026, 9, 22, 15, 0));
  assert.equal(p.stale, false);
});

test("a no-year date outside −1…+30 days is stale", () => {
  const p = parseEventName("CA-DAZN 2: UEFA Youth League| Monaco U19 vs. Spurs U19| Wed 22 Oct 8:00 AM", Date.UTC(2026, 2, 1));
  assert.equal(p.stale, true);
  assert.equal(p.start, null);
});

test("ESPN+ style with explicit timestamp and no opponent", () => {
  const p = parseEventName("US (ESPN+ 003) | 2026 WSL Championship Tour: Surf City El Salvador Pro Jun 07 8:30AM ET (2026-06-07 08:30:00)", NOW);
  assert.equal(p.start, Date.UTC(2026, 5, 7, 8, 30));
  assert.equal(p.away, null);
  assert.ok(p.home.startsWith("2026 WSL Championship Tour"));
});

test("plain network channels and team feeds are not events", () => {
  assert.equal(parseEventName("UK || SKY SPORTS MAIN EVENT", NOW), null);
  assert.equal(parseEventName("EPL-Arsenal", NOW), null);
  assert.equal(parseEventName("Carib NBA League Pass 7 (D)", NOW), null);
});

test("teamKey normalizes club suffixes and punctuation", () => {
  assert.equal(teamKey("Real Madrid CF"), "real madrid");
  assert.equal(teamKey("Tottenham Hotspur FC"), "tottenham hotspur");
  assert.equal(teamKey("Al-Nassr"), "al nassr");
});

test("matchesFixture: both teams must match; dated names must be within 24h; stale never matches", () => {
  const fixture = { home: { name: "Real Madrid" }, away: { name: "Juventus" }, start: Date.UTC(2026, 9, 22, 19, 0) };
  const good = parseEventName("CA-DAZN 14: UEFA Champions League| Real Madrid vs. Juventus| Wed 22 Oct 3:00 PM", NOW);
  assert.equal(matchesFixture(good, fixture), true);
  const swapped = parseEventName("CA-DAZN 14: UCL| Juventus vs. Real Madrid| Wed 22 Oct 3:00 PM", NOW);
  assert.equal(matchesFixture(swapped, fixture), true);
  const wrongDay = parseEventName("CA-DAZN 14: UCL| Real Madrid vs. Juventus| Sat 25 Oct 3:00 PM", NOW);
  assert.equal(matchesFixture(wrongDay, fixture), false);
  const stale = parseEventName("CA-DAZN 14: UCL| Real Madrid vs. Juventus| Wed 22 Oct 3:00 PM", Date.UTC(2026, 2, 1));
  assert.equal(matchesFixture(stale, fixture), false);
  const otherTeam = parseEventName("CA-DAZN 14: UCL| Real Madrid vs. Barcelona| Wed 22 Oct 3:00 PM", NOW);
  assert.equal(matchesFixture(otherTeam, fixture), false);
  const undated = { competition: null, home: "Real Madrid", away: "Juventus", start: null, stale: false };
  assert.equal(matchesFixture(undated, fixture), true, "undated names match on teams alone");
});
