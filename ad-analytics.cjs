// server/ad-analytics.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

// load env from .env.local first, then .env
dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
// accept either name; falls back to secret123 for local testing
const ADMIN_KEY =
  process.env.REACT_APP_AD_ADMIN_KEY ||
  process.env.AD_ADMIN_KEY ||
  "secret123";

app.use(cors());
app.use(express.json());

const EVENTS = [];
function cap(arr, max = 5000) {
  if (arr.length > max) arr.splice(0, arr.length - max);
}

// quick health check
app.get("/", (req, res) => res.send("ad server ok"));

// ingest from the client
app.post("/api/ad-events", (req, res) => {
  const { event, adId, meta, ts } = req.body || {};
  if (!event || !adId) return res.status(400).json({ error: "missing event or adId" });
  const rec = {
    event,           // "view" | "click" | "close"
    adId,            // "seb1" | "seb2" etc
    meta: meta || {},// { uid, t, path, ua }
    ts: ts || Date.now(),
    ip: req.ip
  };
  EVENTS.push(rec);
  cap(EVENTS);
  res.json({ ok: true });
});

// simple admin gate for reads
function requireKey(req, res, next) {
  const key = req.query.key || req.headers["x-admin-key"];
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: "bad key" });
  next();
}

// tail of raw events
app.get("/api/ad-events", requireKey, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "100", 10), 1000);
  const start = Math.max(EVENTS.length - limit, 0);
  res.json(EVENTS.slice(start).reverse());
});

// aggregated counts
app.get("/api/ad-stats", requireKey, (req, res) => {
  const byAd = {};
  for (const e of EVENTS) {
    byAd[e.adId] ||= { view: 0, click: 0, close: 0 };
    byAd[e.adId][e.event] = (byAd[e.adId][e.event] || 0) + 1;
  }
  const total = EVENTS.reduce((acc, e) => {
    acc[e.event] = (acc[e.event] || 0) + 1;
    return acc;
  }, {});
  res.json({ byAd, total, count: EVENTS.length });
});

app.listen(PORT, () => {
  console.log(`Ad analytics listening on http://localhost:${PORT}`);
});
