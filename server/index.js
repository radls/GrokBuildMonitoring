import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { getGrokHome, scanAll, getSessionDetail } from "./scanner.js";
import { refinePrompt } from "./refine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 3847;
const HOST = process.env.HOST || "127.0.0.1";
const isProd =
  process.env.NODE_ENV === "production" ||
  process.env.npm_lifecycle_event === "start";

const app = express();
const corsOrigins = [
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
];
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

// Simple in-memory cache to avoid hammering disk on rapid polls
let cache = { at: 0, data: null };
const CACHE_MS = Number(process.env.CACHE_MS) || 1500;

function getSnapshot(force = false) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < CACHE_MS) {
    return cache.data;
  }
  const data = scanAll({ grokHome: getGrokHome() });
  cache = { at: now, data };
  return data;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "grok-build-monitoring",
    grokHome: getGrokHome(),
    time: new Date().toISOString(),
  });
});

app.get("/api/overview", (req, res) => {
  try {
    const force = req.query.refresh === "1";
    const snap = getSnapshot(force);
    res.json({
      scannedAt: snap.scannedAt,
      grokHome: snap.grokHome,
      version: snap.version,
      versions: snap.versions,
      totals: snap.totals,
      efficiency: snap.efficiency,
      efficiencyInsights: snap.efficiencyInsights,
      promptQuality: snap.promptQuality,
      commandGuidance: snap.commandGuidance,
      promptStrategies: snap.promptStrategies,
      active: snap.active,
      projects: snap.projects,
      projectTree: snap.projectTree,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/commands", (req, res) => {
  try {
    const force = req.query.refresh === "1";
    const snap = getSnapshot(force);
    res.json(snap.commandGuidance || { featured: [], byCategory: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/strategies", (req, res) => {
  try {
    const force = req.query.refresh === "1";
    const snap = getSnapshot(force);
    res.json(
      snap.promptStrategies || { top: [], all: [], count: 0, title: "Strategies" }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post("/api/refine", (req, res) => {
  try {
    const prompt = req.body?.prompt ?? req.body?.text ?? "";
    const projectHint = req.body?.projectHint || null;
    const result = refinePrompt(prompt, { projectHint });
    if (result.error && !result.refined) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/sessions", (req, res) => {
  try {
    const force = req.query.refresh === "1";
    const snap = getSnapshot(force);
    let sessions = snap.sessions;

    const { project, status, kind, q, limit } = req.query;

    if (project) {
      const p = String(project).toLowerCase();
      sessions = sessions.filter((s) => {
        const projectCwd = (s.projectCwd || s.cwd || "").toLowerCase();
        const name = (s.project || "").toLowerCase();
        const label = (s.projectPath || "").toLowerCase();
        // Exact cwd, leaf name, path label, or under a parent cwd prefix
        return (
          projectCwd === p ||
          name === p ||
          label === p ||
          projectCwd.endsWith("/" + p) ||
          projectCwd.startsWith(p.endsWith("/") ? p : p + "/") ||
          (s.cwd && s.cwd.toLowerCase().includes(p)) ||
          label.includes(p)
        );
      });
    }
    if (status) {
      const st = String(status).toLowerCase();
      sessions = sessions.filter((s) => s.status === st);
    }
    if (kind === "main") {
      sessions = sessions.filter(
        (s) => !String(s.sessionKind || "main").startsWith("subagent")
      );
    } else if (kind === "subagent") {
      sessions = sessions.filter((s) =>
        String(s.sessionKind || "").startsWith("subagent")
      );
    }
    if (q) {
      const query = String(q).toLowerCase();
      sessions = sessions.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.id.toLowerCase().includes(query) ||
          s.project.toLowerCase().includes(query) ||
          (s.cwd && s.cwd.toLowerCase().includes(query)) ||
          (s.modelId && s.modelId.toLowerCase().includes(query))
      );
    }

    const lim = Math.min(Number(limit) || 500, 2000);
    res.json({
      scannedAt: snap.scannedAt,
      count: sessions.length,
      sessions: sessions.slice(0, lim),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/sessions/:id", (req, res) => {
  try {
    const detail = getSessionDetail(req.params.id, { grokHome: getGrokHome() });
    if (!detail) return res.status(404).json({ error: "Session not found" });
    res.json(detail);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/projects", (req, res) => {
  try {
    const snap = getSnapshot(req.query.refresh === "1");
    res.json({
      scannedAt: snap.scannedAt,
      count: snap.projects.length,
      projects: snap.projects,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

if (isProd) {
  const dist = path.join(ROOT, "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Grok Build Monitoring → http://${HOST}:${PORT}`);
  console.log(`  GROK_HOME: ${getGrokHome()}`);
  console.log(`  mode: ${isProd ? "production" : "development"}`);
});
