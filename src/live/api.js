// JSON API for the Astra TV app, mounted under the secret path at /api/v1.
import express from "express";
import { teamById } from "./taxonomy.js";

function parseTeams(q) {
  if (q == null || q === "") return undefined;
  return String(q).split(",").map((s) => s.trim()).filter((id) => teamById(id));
}

export function createLiveRouter({ engine }) {
  const r = express.Router();

  r.get("/home", async (req, res, next) => {
    try { res.json(await engine.home(parseTeams(req.query.teams))); } catch (err) { next(err); }
  });

  r.get("/events", async (req, res, next) => {
    try {
      const events = await engine.events({ sport: req.query.sport || null, teams: parseTeams(req.query.teams) });
      res.json({ events });
    } catch (err) { next(err); }
  });

  r.get("/events/:id", async (req, res, next) => {
    try {
      const event = await engine.event(req.params.id, parseTeams(req.query.teams));
      if (!event) return res.status(404).json({ err: "not found" });
      res.json({ event });
    } catch (err) { next(err); }
  });

  r.get("/channels", async (req, res, next) => {
    try { res.json({ rows: await engine.channels({ sport: req.query.sport || null }) }); } catch (err) { next(err); }
  });

  r.get("/teams", (req, res) => res.json({ teams: engine.teams() }));

  r.get("/search", async (req, res, next) => {
    try {
      const q = String(req.query.q || "").trim().toLowerCase();
      if (q.length < 2) return res.json({ events: [], channels: [] });
      const [events, rows] = await Promise.all([engine.events({}), engine.channels({})]);
      const hit = (s) => String(s || "").toLowerCase().includes(q);
      res.json({
        events: events.filter((e) => hit(e.name) || hit(e.home?.name) || hit(e.away?.name)).slice(0, 20),
        channels: rows.flatMap((r) => r.feeds).filter((f) => hit(f.channelName) || hit(f.label)).slice(0, 20),
      });
    } catch (err) { next(err); }
  });

  return r;
}
