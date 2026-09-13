// Parses panel *event channel* names ("…| Real Madrid vs. Juventus| Wed 22 Oct 3:00 PM")
// into a fixture hint. Only used to attach such a channel as a weak feed
// candidate to a fixture that already exists — never to create events.
import { matchCompetition } from "./taxonomy.js";

const DAY_MS = 24 * 3600 * 1000;
const PAST_WINDOW_MS = 1 * DAY_MS;
const FUTURE_WINDOW_MS = 30 * DAY_MS;
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

const EXPLICIT_TS = /\((\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\)/;
// "Wed 22 Oct 3:00 PM" | "22 Oct 3:00PM" | "Jun 07 8:30AM ET"
const MONTH_DAY_TIME = /\b(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+)?(?:(\d{1,2})\s+([a-z]{3})[a-z]*|([a-z]{3})[a-z]*\s+(\d{1,2}))\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b(?:\s*[a-z]{2,4})?/i;
const TEAM_SPLIT = /\s+(?:vs\.?|v\.?|@|at)\s+|\s+-\s+/i;
const LEADING_PREFIX = /^[A-Z]{2}(?:[-\s][A-Z]+)?\s*\d*\s*[:|]\s*/; // "CA-DAZN 14: " / "UK: "

export function teamKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(fc|cf|sc|afc|cd|ac|club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveYear(month, day, hour, minute, nowMs) {
  const y = new Date(nowMs).getUTCFullYear();
  for (const year of [y - 1, y, y + 1]) {
    const t = Date.UTC(year, month, day, hour, minute);
    if (t >= nowMs - PAST_WINDOW_MS && t <= nowMs + FUTURE_WINDOW_MS) return t;
  }
  return null;
}

const stripParens = (s) => s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

export function parseEventName(name, nowMs = Date.now()) {
  const raw = String(name || "");
  let start = null;
  let stale = false;
  let dated = false;
  let text = raw;

  const explicit = EXPLICIT_TS.exec(text);
  if (explicit) {
    dated = true;
    start = Date.UTC(+explicit[1], +explicit[2] - 1, +explicit[3], +explicit[4], +explicit[5], +(explicit[6] || 0));
    text = text.replace(EXPLICIT_TS, " ");
  }
  const md = MONTH_DAY_TIME.exec(text);
  if (md) {
    dated = true;
    const day = +(md[1] || md[4]);
    const month = MONTHS[(md[2] || md[3]).toLowerCase()];
    let hour = +md[5] % 12;
    if (md[7].toLowerCase() === "pm") hour += 12;
    const minute = +(md[6] || 0);
    if (!explicit && month !== undefined) {
      start = resolveYear(month, day, hour, minute, nowMs);
      stale = start === null;
    }
    text = text.replace(MONTH_DAY_TIME, " ");
  }

  const segments = text.split("|").map((s) => stripParens(s)).filter(Boolean);
  let teamsText = segments.find((s) => TEAM_SPLIT.test(s)) || (segments.length > 1 ? segments[1] : segments[0] || "");
  if (segments.length === 1) teamsText = teamsText.replace(LEADING_PREFIX, "");
  teamsText = teamsText.replace(/\s+/g, " ").trim().replace(/[:\-|]\s*$/, "").trim();

  const parts = teamsText.split(TEAM_SPLIT).map((s) => s.trim()).filter(Boolean);
  const hasMatchup = parts.length >= 2;
  if (!hasMatchup && !dated) return null;

  return {
    competition: matchCompetition(raw),
    home: parts[0] || null,
    away: hasMatchup ? parts[1] : null,
    start,
    stale,
  };
}

function sameTeam(a, b) {
  const ka = teamKey(a);
  const kb = teamKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const shorter = Math.min(ka.length, kb.length);
  return shorter >= 4 && (ka.includes(kb) || kb.includes(ka));
}

export function matchesFixture(parsed, fixture) {
  if (!parsed || parsed.stale) return false;
  const fh = fixture.home?.name;
  const fa = fixture.away?.name;
  let teamsOk;
  if (fa) {
    teamsOk = (sameTeam(parsed.home, fh) && sameTeam(parsed.away, fa)) || (sameTeam(parsed.home, fa) && sameTeam(parsed.away, fh));
  } else {
    teamsOk = sameTeam(parsed.home, fh) || sameTeam(parsed.home, fixture.name);
  }
  if (!teamsOk) return false;
  if (parsed.start == null) return true;
  return Math.abs(parsed.start - fixture.start) <= DAY_MS;
}
