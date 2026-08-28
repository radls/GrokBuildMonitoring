import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import {
  computeEfficiency,
  aggregateEfficiency,
  efficiencyInsights,
} from "./efficiency.js";
import {
  analyzeSessionPrompts,
  aggregatePromptQuality,
} from "./prompts.js";
import { recommendCommands } from "./commands.js";
import { recommendStrategies } from "./strategies.js";

const DEFAULT_GROK_HOME = process.env.GROK_HOME || path.join(os.homedir(), ".grok");

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function decodeCwd(encoded) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function projectNameFromCwd(cwd) {
  if (!cwd) return "unknown";
  const parts = cwd.replace(/\/+$/, "").split(path.sep).filter(Boolean);
  return parts[parts.length - 1] || cwd;
}

const CLOUD_HOSTS = [
  { host: "github.com", provider: "GitHub" },
  { host: "gitlab.com", provider: "GitLab" },
  { host: "bitbucket.org", provider: "Bitbucket" },
  { host: "dev.azure.com", provider: "Azure DevOps" },
  { host: "ssh.dev.azure.com", provider: "Azure DevOps" },
  { host: "codeberg.org", provider: "Codeberg" },
  { host: "git.sr.ht", provider: "SourceHut" },
  { host: "gitea.com", provider: "Gitea" },
];

/** cwd -> cloud repo info | null (cached) */
const cloudRepoCache = new Map();

function parseRemoteUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  // git@github.com:user/repo.git  OR  https://github.com/user/repo.git
  let host = null;
  let pathPart = null;
  const ssh = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
  if (ssh) {
    host = ssh[1].toLowerCase();
    pathPart = ssh[2].replace(/\.git$/i, "");
  } else {
    try {
      const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
      const u = new URL(withProto);
      host = u.hostname.toLowerCase();
      pathPart = u.pathname.replace(/^\//, "").replace(/\.git$/i, "");
    } catch {
      return null;
    }
  }
  const match = CLOUD_HOSTS.find((h) => host === h.host || host.endsWith("." + h.host));
  if (!match) {
    // treat any non-local remote as cloud-ish
    if (host && !host.includes("localhost") && host !== "127.0.0.1") {
      return {
        provider: host,
        host,
        url: raw,
        webUrl: host.includes("github") || host.includes("gitlab")
          ? `https://${host}/${pathPart}`
          : null,
        slug: pathPart || null,
        isCloud: true,
      };
    }
    return null;
  }
  const webUrl =
    match.provider === "GitHub" || match.provider === "GitLab" || match.provider === "Bitbucket"
      ? `https://${match.host}/${pathPart}`
      : match.provider === "Azure DevOps"
        ? raw.startsWith("http")
          ? raw.replace(/\.git$/i, "")
          : null
        : `https://${match.host}/${pathPart}`;
  return {
    provider: match.provider,
    host: match.host,
    url: raw,
    webUrl,
    slug: pathPart || null,
    isCloud: true,
  };
}

function detectCloudRepo(projectCwd) {
  if (!projectCwd || projectCwd === "unknown") return null;
  const key = normalizePath(projectCwd);
  if (cloudRepoCache.has(key)) return cloudRepoCache.get(key);

  let result = null;
  try {
    if (!fs.existsSync(key) || !fs.statSync(key).isDirectory()) {
      cloudRepoCache.set(key, null);
      return null;
    }
    // Prefer remotes from this dir; git walks up to root automatically
    const out = execFileSync("git", ["-C", key, "remote", "get-url", "origin"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    result = parseRemoteUrl(out);
  } catch {
    // try listing remotes
    try {
      const out = execFileSync("git", ["-C", key, "remote", "-v"], {
        encoding: "utf8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const line = out
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.includes("(fetch)"));
      if (line) {
        const parts = line.split(/\s+/);
        result = parseRemoteUrl(parts[1]);
      }
    } catch {
      result = null;
    }
  }

  cloudRepoCache.set(key, result);
  return result;
}

const HOME = os.homedir();
const WORKSPACE_CANDIDATES = [
  path.join(HOME, "GrokBuildProjects"),
  path.join(HOME, "Projects"),
  path.join(HOME, "Developer"),
  path.join(HOME, "dev"),
  path.join(HOME, "code"),
  path.join(HOME, "src"),
].filter((p) => {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
});

const IGNORE_TOP_LEVEL = new Set([
  ".grok",
  ".npm",
  ".cache",
  ".local",
  ".config",
  ".cursor",
  ".codex",
  ".claude",
  ".Trash",
  "Library",
  "Downloads",
  "Documents",
  "Desktop",
  "Movies",
  "Music",
  "Pictures",
  "Applications",
  "Public",
  "node_modules",
  "bin",
  "tmp",
  "Temp",
]);

const PROJECT_MARKERS = [
  "package.json",
  "project.godot",
  "Cargo.toml",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "ProjectSettings",
  "Assets",
  ".git",
  "README.md",
  "main.py",
  "CMakeLists.txt",
];

/** sessionDir -> { mtimeMs, projectCwd } */
const projectInferCache = new Map();

/** Cached known project roots discovered from disk */
let knownProjectRootsCache = null;

function normalizePath(p) {
  if (!p) return p;
  return path.resolve(p.replace(/\/+$/, ""));
}

function pathIsUnder(child, parent) {
  const c = normalizePath(child);
  const p = normalizePath(parent);
  return c === p || c.startsWith(p + path.sep);
}

function looksLikeProjectDir(dir) {
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
    return PROJECT_MARKERS.some((m) => fs.existsSync(path.join(dir, m)));
  } catch {
    return false;
  }
}

/** Folder names that contain multiple projects rather than being one project */
const PROJECT_CONTAINERS = new Set([
  "UnityProjects",
  "Projects",
  "apps",
  "packages",
  "repos",
  "games",
  "services",
]);

/**
 * Discover real project folders under known workspaces (and $HOME children).
 * Stops at project roots — never treats Assets/src/etc as projects.
 */
function getKnownProjectRoots() {
  if (knownProjectRootsCache) return knownProjectRootsCache;

  const roots = new Set();

  function addIfProject(dir) {
    const resolved = normalizePath(dir);
    if (looksLikeProjectDir(resolved)) roots.add(resolved);
  }

  function scanContainer(dir, depth = 0) {
    if (depth > 2) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith(".") || IGNORE_TOP_LEVEL.has(ent.name)) {
        continue;
      }
      const child = path.join(dir, ent.name);
      if (PROJECT_CONTAINERS.has(ent.name) || !looksLikeProjectDir(child)) {
        // Container or non-project dir: look one level deeper for projects
        if (looksLikeProjectDir(child) && !PROJECT_CONTAINERS.has(ent.name)) {
          addIfProject(child);
        } else {
          scanContainer(child, depth + 1);
        }
      } else {
        addIfProject(child);
      }
    }
  }

  for (const ws of WORKSPACE_CANDIDATES) {
    roots.add(normalizePath(ws));
    scanContainer(ws, 0);
  }

  // Home-level directories that look like projects (legacy locations)
  try {
    for (const ent of fs.readdirSync(HOME, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith(".") || IGNORE_TOP_LEVEL.has(ent.name)) {
        continue;
      }
      const full = path.join(HOME, ent.name);
      if (WORKSPACE_CANDIDATES.some((ws) => normalizePath(ws) === normalizePath(full))) {
        continue;
      }
      if (PROJECT_CONTAINERS.has(ent.name)) {
        scanContainer(full, 0);
      } else {
        addIfProject(full);
      }
    }
  } catch {
    /* ignore */
  }

  // Prefer workspace copy over home stub when both share a basename
  const byBase = new Map();
  for (const r of roots) {
    const base = path.basename(r);
    const existing = byBase.get(base) || [];
    existing.push(r);
    byBase.set(base, existing);
  }
  const preferred = new Set();
  for (const [, siblings] of byBase) {
    if (siblings.length === 1) {
      preferred.add(siblings[0]);
      continue;
    }
    const underWs = siblings.find((s) =>
      WORKSPACE_CANDIDATES.some((ws) => pathIsUnder(s, ws) && normalizePath(s) !== normalizePath(ws))
    );
    preferred.add(
      underWs || siblings.slice().sort((a, b) => b.length - a.length)[0]
    );
  }

  knownProjectRootsCache = Array.from(preferred).sort((a, b) => b.length - a.length);
  return knownProjectRootsCache;
}

/**
 * Map an arbitrary path to the deepest known project root that contains it.
 * Also remaps legacy locations (e.g. ~/UnityProjects/Foo → ~/GrokBuildProjects/UnityProjects/Foo).
 */
function matchKnownProject(filePath) {
  const resolved = normalizePath(filePath);
  const roots = getKnownProjectRoots();

  for (const root of roots) {
    if (pathIsUnder(resolved, root)) return root;
  }

  if (!pathIsUnder(resolved, HOME)) return null;

  const rel = path.relative(HOME, resolved);
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length === 0) return null;

  // 1) Place the same relative path under each workspace and walk up to a known root
  for (const ws of WORKSPACE_CANDIDATES) {
    let cur = normalizePath(path.join(ws, ...parts));
    const wsNorm = normalizePath(ws);
    while (pathIsUnder(cur, wsNorm) || cur === wsNorm) {
      for (const root of roots) {
        if (cur === root) return root;
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  }

  // 2) Suffix match against known roots: .../UnityProjects/WhisperwoodRelic
  for (let len = Math.min(parts.length, 4); len >= 1; len--) {
    const suffix = parts.slice(0, len).join(path.sep);
    for (const root of roots) {
      if (root === suffix || root.endsWith(path.sep + suffix)) {
        return root;
      }
    }
  }

  // 3) Basename match for unique project folders
  if (parts.length >= 1) {
    const base = parts[parts.length - 1];
    // skip file-like
    if (!/\.[a-z0-9]{1,5}$/i.test(base)) {
      const hits = roots.filter((r) => path.basename(r) === base);
      if (hits.length === 1) return hits[0];
      const underWs = hits.find((r) =>
        WORKSPACE_CANDIDATES.some((ws) => pathIsUnder(r, ws))
      );
      if (underWs) return underWs;
    }
  }

  // 4) First path segment as project name under workspace (grocad, eldermere_unity, ...)
  if (parts.length >= 1 && !IGNORE_TOP_LEVEL.has(parts[0])) {
    const hits = roots.filter((r) => path.basename(r) === parts[0]);
    if (hits.length === 1) return hits[0];
    const underWs = hits.find((r) =>
      WORKSPACE_CANDIDATES.some((ws) => pathIsUnder(r, ws))
    );
    if (underWs) return underWs;
  }

  return null;
}

/**
 * Read head + tail of large files so late-session project work is not missed
 * (early bytes often contain workspace list_dir noise).
 */
function readSnippet(filePath, maxBytes = 1_200_000) {
  try {
    if (!fs.existsSync(filePath)) return "";
    const st = fs.statSync(filePath);
    const size = st.size;
    if (size <= maxBytes) {
      return fs.readFileSync(filePath, "utf8");
    }
    const headBytes = Math.floor(maxBytes * 0.35);
    const tailBytes = maxBytes - headBytes;
    const fd = fs.openSync(filePath, "r");
    try {
      const headBuf = Buffer.alloc(headBytes);
      const tailBuf = Buffer.alloc(tailBytes);
      fs.readSync(fd, headBuf, 0, headBytes, 0);
      fs.readSync(fd, tailBuf, 0, tailBytes, Math.max(0, size - tailBytes));
      return headBuf.toString("utf8") + "\n" + tailBuf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }
}

function bumpScore(scores, project, amount) {
  if (!project) return;
  if (WORKSPACE_CANDIDATES.some((ws) => normalizePath(ws) === normalizePath(project))) {
    return;
  }
  scores.set(project, (scores.get(project) || 0) + amount);
}

/**
 * Infer the actual project folder a session worked in by mining path
 * mentions from updates/events, matched against known project roots.
 * Falls back to the session cwd (also matched if possible).
 */
function inferProjectCwd(sessionDir, sessionCwd) {
  const updatesPath = path.join(sessionDir, "updates.jsonl");
  let mtimeMs = 0;
  try {
    if (fs.existsSync(updatesPath)) mtimeMs = fs.statSync(updatesPath).mtimeMs;
  } catch {
    mtimeMs = 0;
  }
  // Bump cache key version when inference logic changes
  const cacheKey = sessionDir + "::v2";
  const cached = projectInferCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs && cached.sessionCwd === sessionCwd) {
    return cached.projectCwd;
  }

  const baseCwd = normalizePath(sessionCwd || HOME);
  const baseMatched = matchKnownProject(baseCwd);
  const roots = getKnownProjectRoots().filter(
    (r) => !WORKSPACE_CANDIDATES.some((ws) => normalizePath(ws) === normalizePath(r))
  );

  let text =
    readSnippet(path.join(sessionDir, "updates.jsonl")) +
    "\n" +
    readSnippet(path.join(sessionDir, "events.jsonl"), 400_000);

  // Title / summary often names the real project when cwd is a parent workspace
  const summary = safeReadJson(path.join(sessionDir, "summary.json"));
  const titleBlob = [
    summary?.generated_title,
    summary?.session_summary,
    summary?.title,
  ]
    .filter(Boolean)
    .join(" ");

  const scores = new Map();

  // 1) Absolute paths under $HOME
  const homeEsc = HOME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `${homeEsc}/([A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+){0,5})`,
    "g"
  );
  let match;
  while ((match = re.exec(text)) !== null) {
    const full = path.join(HOME, match[1]);
    const top = match[1].split("/")[0];
    if (IGNORE_TOP_LEVEL.has(top) || top.startsWith(".")) continue;
    bumpScore(scores, matchKnownProject(full), 1);
  }

  // 2) Known project basenames in path-like contexts (relative + absolute)
  // Weight path-ish hits higher than bare name mentions.
  for (const root of roots) {
    const base = path.basename(root);
    if (!base || base.length < 2) continue;
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pathish = new RegExp(
      `(?:^|[/\\\\"'\\s])${esc}(?:[/\\\\"']|$)`,
      "g"
    );
    const bare = new RegExp(`\\b${esc}\\b`, "g");
    const pathHits = (text.match(pathish) || []).length;
    const bareHits = (text.match(bare) || []).length;
    if (pathHits > 0) bumpScore(scores, root, pathHits * 2);
    else if (bareHits >= 3) bumpScore(scores, root, Math.min(bareHits, 20) * 0.5);

    // 3) Title / summary name match is a strong signal for the active thread
    if (titleBlob && new RegExp(esc, "i").test(titleBlob)) {
      bumpScore(scores, root, 25);
    }
  }

  text = null;

  let best = null;
  let bestScore = 0;
  for (const [cand, score] of scores) {
    if (score < 2) continue;
    if (score > bestScore) {
      best = cand;
      bestScore = score;
    }
  }

  let projectCwd = baseMatched || baseCwd;

  if (best) {
    const isGenericBase =
      baseCwd === HOME ||
      WORKSPACE_CANDIDATES.some((ws) => normalizePath(ws) === baseCwd) ||
      !baseMatched;

    if (isGenericBase) {
      projectCwd = best;
    } else if (baseMatched && best === baseMatched) {
      projectCwd = baseMatched;
    } else if (baseMatched && pathIsUnder(best, baseMatched)) {
      // session already inside a project root — prefer that root
      projectCwd = baseMatched;
    } else if (bestScore >= 5) {
      projectCwd = best;
    } else {
      projectCwd = baseMatched || baseCwd;
    }
  }

  projectInferCache.set(cacheKey, { mtimeMs, sessionCwd, projectCwd });
  return projectCwd;
}

function parentLabelPath(projectCwd) {
  const parts = normalizePath(projectCwd).split(path.sep).filter(Boolean);
  // Show last 2 segments when under home, else leaf
  if (parts.length >= 2) {
    const homeParts = HOME.split(path.sep).filter(Boolean);
    if (parts.slice(0, homeParts.length).join("/") === homeParts.join("/")) {
      const rel = parts.slice(homeParts.length);
      if (rel.length === 0) return path.basename(HOME);
      return rel.join(" / ");
    }
  }
  return projectNameFromCwd(projectCwd);
}

function emptyProjectMetrics() {
  return {
    sessions: 0,
    mainSessions: 0,
    subagentSessions: 0,
    activeSessions: 0,
    totalTurns: 0,
    totalToolCalls: 0,
    totalTokens: 0,
    totalDurationSeconds: 0,
    linesAdded: 0,
    linesRemoved: 0,
    filesTouched: 0,
    errors: 0,
  };
}

function accumulateSession(metrics, s) {
  metrics.sessions += 1;
  if (String(s.sessionKind || "main").startsWith("subagent")) {
    metrics.subagentSessions += 1;
  } else {
    metrics.mainSessions += 1;
  }
  if (s.status === "active") metrics.activeSessions += 1;
  metrics.totalTurns += s.signals.turnCount || 0;
  metrics.totalToolCalls += s.signals.toolCallCount || 0;
  metrics.totalTokens += s.signals.contextTokensUsed || 0;
  metrics.totalDurationSeconds += s.signals.sessionDurationSeconds || 0;
  metrics.linesAdded += s.signals.agentLinesAdded || 0;
  metrics.linesRemoved += s.signals.agentLinesRemoved || 0;
  metrics.filesTouched += s.signals.totalFilesTouched || 0;
  metrics.errors += (s.signals.errorCount || 0) + (s.signals.toolFailureCount || 0);
}

function buildProjectTree(flatMap) {
  const nodes = Array.from(flatMap.values()).map((p) => ({
    ...p,
    models: Array.from(p.models || []),
    children: [],
    depth: 0,
    parentCwd: null,
    relativePath: p.name,
  }));

  // Index by cwd
  const byCwd = new Map(nodes.map((n) => [n.cwd, n]));

  // Assign each node to deepest ancestor present in the set
  for (const node of nodes) {
    let parent = null;
    let parentDepth = -1;
    for (const other of nodes) {
      if (other.cwd === node.cwd) continue;
      if (!pathIsUnder(node.cwd, other.cwd)) continue;
      const depth = other.cwd.split(path.sep).length;
      if (depth > parentDepth) {
        parent = other;
        parentDepth = depth;
      }
    }
    if (parent) {
      node.parentCwd = parent.cwd;
      node.relativePath = path.relative(parent.cwd, node.cwd) || node.name;
      parent.children.push(node);
    }
  }

  function setDepth(node, depth) {
    node.depth = depth;
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of node.children) setDepth(child, depth + 1);
  }

  const roots = nodes.filter((n) => !n.parentCwd);
  roots.sort((a, b) => {
    const ta = new Date(a.lastActiveAt || 0).getTime();
    const tb = new Date(b.lastActiveAt || 0).getTime();
    return tb - ta;
  });
  for (const r of roots) setDepth(r, 0);

  // Rollups: total* includes descendants; own* stays as direct sessions
  function rollup(node) {
    const total = { ...emptyProjectMetrics() };
    // start with own
    for (const k of Object.keys(total)) {
      total[k] = node[k] || 0;
    }
    const models = new Set(node.models || []);
    let lastActiveAt = node.lastActiveAt;
    for (const child of node.children) {
      const cr = rollup(child);
      for (const k of Object.keys(total)) {
        total[k] += cr.total[k] || 0;
      }
      for (const m of cr.models) models.add(m);
      if (
        cr.lastActiveAt &&
        (!lastActiveAt || new Date(cr.lastActiveAt) > new Date(lastActiveAt))
      ) {
        lastActiveAt = cr.lastActiveAt;
      }
    }
    node.ownSessions = node.sessions;
    node.ownTurns = node.totalTurns;
    node.ownToolCalls = node.totalToolCalls;
    node.total = total;
    node.models = Array.from(models);
    if (lastActiveAt) node.lastActiveAt = lastActiveAt;
    // For parent display convenience, expose rollup as primary counters when has children
    if (node.children.length > 0) {
      node.rollupSessions = total.sessions;
      node.rollupTurns = total.totalTurns;
      node.rollupToolCalls = total.totalToolCalls;
      node.rollupTokens = total.totalTokens;
      node.rollupDurationSeconds = total.totalDurationSeconds;
      node.rollupLinesAdded = total.linesAdded;
      node.rollupLinesRemoved = total.linesRemoved;
      node.rollupActiveSessions = total.activeSessions;
    } else {
      node.rollupSessions = node.sessions;
      node.rollupTurns = node.totalTurns;
      node.rollupToolCalls = node.totalToolCalls;
      node.rollupTokens = node.totalTokens;
      node.rollupDurationSeconds = node.totalDurationSeconds;
      node.rollupLinesAdded = node.linesAdded;
      node.rollupLinesRemoved = node.linesRemoved;
      node.rollupActiveSessions = node.activeSessions;
    }
    return { total, models, lastActiveAt };
  }

  for (const r of roots) rollup(r);

  // Flat preorder list for simple table rendering
  const flat = [];
  function walk(node) {
    flat.push(node);
    for (const c of node.children) walk(c);
  }
  for (const r of roots) walk(r);

  // Serializable flat rows: avoid duplicating nested child objects
  const flatRows = flat.map((node) => {
    const { children, total, ...rest } = node;
    return {
      ...rest,
      total,
      childCount: children.length,
      childCwds: children.map((c) => c.cwd),
      hasChildren: children.length > 0,
    };
  });

  // Serializable tree (nested)
  function serializeTree(node) {
    return {
      ...flatRows.find((r) => r.cwd === node.cwd),
      children: node.children.map(serializeTree),
    };
  }

  return {
    tree: roots.map(serializeTree),
    flat: flatRows,
    byCwd,
  };
}

function isPidAlive(pid) {
  if (!pid || typeof pid !== "number") return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getProcessInfo(pid) {
  if (!isPidAlive(pid)) return null;
  try {
    // macOS/Linux: etime + command
    const out = execFileSync("ps", ["-p", String(pid), "-o", "pid=,etime=,comm="], {
      encoding: "utf8",
      timeout: 1000,
    }).trim();
    if (!out) return null;
    const match = out.match(/^\s*(\d+)\s+(\S+)\s+(.+)$/);
    if (!match) return { pid, alive: true };
    return { pid: Number(match[1]), etime: match[2], command: match[3].trim(), alive: true };
  } catch {
    return { pid, alive: isPidAlive(pid) };
  }
}

function loadActiveSessions(grokHome) {
  const data = safeReadJson(path.join(grokHome, "active_sessions.json")) || [];
  const byId = new Map();
  for (const entry of data) {
    if (!entry?.session_id) continue;
    const processInfo = getProcessInfo(entry.pid);
    byId.set(entry.session_id, {
      sessionId: entry.session_id,
      pid: entry.pid,
      cwd: entry.cwd,
      openedAt: entry.opened_at,
      processAlive: Boolean(processInfo?.alive),
      process: processInfo,
    });
  }
  return byId;
}

function emptySignals() {
  return {
    turnCount: 0,
    userMessageCount: 0,
    assistantMessageCount: 0,
    errorCount: 0,
    toolFailureCount: 0,
    cancellationCount: 0,
    contextWindowUsage: 0,
    contextTokensUsed: 0,
    contextWindowTokens: 0,
    toolCallCount: 0,
    toolsUsed: [],
    modelsUsed: [],
    primaryModelId: null,
    sessionDurationSeconds: 0,
    avgTimeToFirstTokenMs: 0,
    avgResponseTimeMs: 0,
    agentLinesAdded: 0,
    agentLinesRemoved: 0,
    agentFilesTouched: 0,
    humanFilesTouched: 0,
    totalFilesTouched: 0,
    peakRssBytes: 0,
    gitCommitCount: 0,
    prCreatedCount: 0,
    compactionCount: 0,
    longPausesCount: 0,
    totalChunkCount: 0,
  };
}

function normalizeSignals(raw) {
  const base = emptySignals();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    turnCount: raw.turnCount ?? 0,
    userMessageCount: raw.userMessageCount ?? 0,
    assistantMessageCount: raw.assistantMessageCount ?? 0,
    errorCount: raw.errorCount ?? 0,
    toolFailureCount: raw.toolFailureCount ?? 0,
    cancellationCount: raw.cancellationCount ?? 0,
    contextWindowUsage: raw.contextWindowUsage ?? 0,
    contextTokensUsed: raw.contextTokensUsed ?? 0,
    contextWindowTokens: raw.contextWindowTokens ?? 0,
    toolCallCount: raw.toolCallCount ?? 0,
    toolsUsed: Array.isArray(raw.toolsUsed) ? raw.toolsUsed : [],
    modelsUsed: Array.isArray(raw.modelsUsed) ? raw.modelsUsed : [],
    primaryModelId: raw.primaryModelId ?? null,
    sessionDurationSeconds: raw.sessionDurationSeconds ?? 0,
    avgTimeToFirstTokenMs: raw.avgTimeToFirstTokenMs ?? 0,
    avgResponseTimeMs: raw.avgResponseTimeMs ?? 0,
    agentLinesAdded: Math.max(0, raw.agentLinesAdded ?? 0),
    agentLinesRemoved: Math.max(0, raw.agentLinesRemoved ?? 0),
    agentFilesTouched: raw.agentFilesTouched ?? 0,
    humanFilesTouched: raw.humanFilesTouched ?? 0,
    totalFilesTouched: raw.totalFilesTouched ?? 0,
    peakRssBytes: raw.peakRssBytes ?? 0,
    gitCommitCount: raw.gitCommitCount ?? 0,
    prCreatedCount: raw.prCreatedCount ?? 0,
    compactionCount: raw.compactionCount ?? 0,
    longPausesCount: raw.longPausesCount ?? 0,
    totalChunkCount: raw.totalChunkCount ?? 0,
  };
}

function deriveStatus(session, activeMap) {
  const active = activeMap.get(session.id);
  if (active?.processAlive) return "active";
  if (active && !active.processAlive) return "stale";

  const last = session.lastActiveAt || session.updatedAt;
  if (last) {
    const ageMs = Date.now() - new Date(last).getTime();
    if (ageMs < 5 * 60 * 1000) return "recent";
  }
  return "idle";
}

function listSessionDirs(sessionsRoot) {
  if (!fs.existsSync(sessionsRoot)) return [];
  const results = [];

  let cwdDirs;
  try {
    cwdDirs = fs.readdirSync(sessionsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const cwdDir of cwdDirs) {
    if (!cwdDir.isDirectory()) continue;
    const cwdPath = path.join(sessionsRoot, cwdDir.name);
    const decodedCwd =
      safeReadJson(path.join(cwdPath, ".cwd")) ||
      // .cwd may be plain text
      (() => {
        try {
          const p = path.join(cwdPath, ".cwd");
          if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
        } catch {
          /* ignore */
        }
        return decodeCwd(cwdDir.name);
      })();

    let sessionDirs;
    try {
      sessionDirs = fs.readdirSync(cwdPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const sessionDir of sessionDirs) {
      if (!sessionDir.isDirectory()) continue;
      // UUID-ish session ids
      if (!/^[0-9a-f-]{20,}$/i.test(sessionDir.name)) continue;
      results.push({
        sessionId: sessionDir.name,
        dir: path.join(cwdPath, sessionDir.name),
        cwdGroup: decodedCwd,
        encodedCwd: cwdDir.name,
      });
    }
  }

  return results;
}

function loadSession(entry, activeMap) {
  const summary = safeReadJson(path.join(entry.dir, "summary.json"));
  if (!summary) return null;

  const signals = normalizeSignals(safeReadJson(path.join(entry.dir, "signals.json")));
  const plan = safeReadJson(path.join(entry.dir, "plan.json"));
  const todos = plan?.todos && typeof plan.todos === "object" ? plan.todos : {};
  const todoList = Object.entries(todos).map(([id, t]) => ({
    id,
    content: t?.content ?? t?.description ?? "",
    status: t?.status ?? "unknown",
  }));
  const todoStats = {
    total: todoList.length,
    completed: todoList.filter((t) => t.status === "completed").length,
    inProgress: todoList.filter((t) => t.status === "in_progress").length,
    pending: todoList.filter((t) => t.status === "pending").length,
  };

  let subagentCount = 0;
  const subagentsDir = path.join(entry.dir, "subagents");
  if (fs.existsSync(subagentsDir)) {
    try {
      subagentCount = fs
        .readdirSync(subagentsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory()).length;
    } catch {
      subagentCount = 0;
    }
  }

  const id = summary.info?.id || entry.sessionId;
  const cwd = summary.info?.cwd || entry.cwdGroup;
  const projectCwd = inferProjectCwd(entry.dir, cwd);
  const active = activeMap.get(id);
  const modelId =
    summary.current_model_id || signals.primaryModelId || null;
  // Pass full signals including message/chunk counts for cost estimation
  const efficiency = computeEfficiency(
    {
      ...signals,
      primaryModelId: modelId,
    },
    { modelId }
  );

  // Prompt analysis is heavier — still cached per chat_history mtime
  const isSubagent = String(summary.session_kind || "").startsWith("subagent");
  const prompts = isSubagent
    ? { promptCount: 0, avgScore: null, grade: null, issueCounts: {}, improvementCounts: {}, samples: [] }
    : analyzeSessionPrompts(entry.dir);

  const session = {
    id,
    cwd,
    projectCwd,
    project: projectNameFromCwd(projectCwd),
    projectPath: parentLabelPath(projectCwd),
    title:
      summary.generated_title ||
      summary.session_summary ||
      summary.title ||
      "(untitled)",
    summary: summary.session_summary || "",
    createdAt: summary.created_at,
    updatedAt: summary.updated_at,
    lastActiveAt: summary.last_active_at || summary.updated_at,
    numMessages: summary.num_messages ?? 0,
    numChatMessages: summary.num_chat_messages ?? 0,
    modelId: summary.current_model_id || signals.primaryModelId || null,
    agentName: summary.agent_name || null,
    sessionKind: summary.session_kind || "main",
    parentSessionId: summary.parent_session_id || null,
    sandboxProfile: summary.sandbox_profile || null,
    reasoningEffort: summary.reasoning_effort || null,
    signals,
    efficiency,
    prompts: {
      promptCount: prompts.promptCount,
      avgScore: prompts.avgScore,
      grade: prompts.grade,
    },
    // full analysis kept for aggregation (stripped from list payload later if needed)
    _promptAnalysis: prompts,
    _sessionDir: entry.dir,
    todos: todoStats,
    todoList,
    subagentCount,
    active: active
      ? {
          pid: active.pid,
          openedAt: active.openedAt,
          processAlive: active.processAlive,
          process: active.process,
        }
      : null,
  };

  session.status = deriveStatus(session, activeMap);
  return session;
}

export function getGrokHome() {
  return DEFAULT_GROK_HOME;
}

export function scanAll({ grokHome = DEFAULT_GROK_HOME } = {}) {
  const sessionsRoot = path.join(grokHome, "sessions");
  const activeMap = loadActiveSessions(grokHome);
  const version = safeReadJson(path.join(grokHome, "version.json"));
  const dirs = listSessionDirs(sessionsRoot);

  const sessions = [];
  for (const entry of dirs) {
    const session = loadSession(entry, activeMap);
    if (session) sessions.push(session);
  }

  sessions.sort((a, b) => {
    const ta = new Date(a.lastActiveAt || a.updatedAt || 0).getTime();
    const tb = new Date(b.lastActiveAt || b.updatedAt || 0).getTime();
    return tb - ta;
  });

  const projectsMap = new Map();
  for (const s of sessions) {
    const key = s.projectCwd || s.cwd || "unknown";
    if (!projectsMap.has(key)) {
      projectsMap.set(key, {
        cwd: key,
        name: projectNameFromCwd(key),
        pathLabel: parentLabelPath(key),
        sessions: 0,
        mainSessions: 0,
        subagentSessions: 0,
        activeSessions: 0,
        totalTurns: 0,
        totalToolCalls: 0,
        totalTokens: 0,
        totalDurationSeconds: 0,
        linesAdded: 0,
        linesRemoved: 0,
        filesTouched: 0,
        errors: 0,
        models: new Set(),
        lastActiveAt: null,
        _efficiencyItems: [],
        _promptAnalyses: [],
      });
    }
    const p = projectsMap.get(key);
    accumulateSession(p, s);
    if (s.modelId) p.models.add(s.modelId);
    if (s.efficiency) p._efficiencyItems.push(s.efficiency);
    if (s._promptAnalysis?.promptCount > 0) p._promptAnalyses.push(s._promptAnalysis);
    const last = s.lastActiveAt || s.updatedAt;
    if (last && (!p.lastActiveAt || new Date(last) > new Date(p.lastActiveAt))) {
      p.lastActiveAt = last;
    }
  }

  // Seed known workspace projects so folders like GrokBuildMonitoring appear
  // even before inference attributes sessions (or with 0 sessions + cloud remote).
  for (const root of getKnownProjectRoots()) {
    const isWs = WORKSPACE_CANDIDATES.some(
      (ws) => normalizePath(ws) === normalizePath(root)
    );
    if (isWs) continue;
    // Only seed projects that live under a known workspace (keeps noise down)
    const underWs = WORKSPACE_CANDIDATES.some((ws) => pathIsUnder(root, ws));
    if (!underWs) continue;
    if (!projectsMap.has(root)) {
      projectsMap.set(root, {
        cwd: root,
        name: projectNameFromCwd(root),
        pathLabel: parentLabelPath(root),
        ...emptyProjectMetrics(),
        models: new Set(),
        lastActiveAt: null,
        _efficiencyItems: [],
        _promptAnalyses: [],
        seeded: true,
      });
    }
  }

  // Attach efficiency, prompt quality, and cloud repo to each project node
  for (const p of projectsMap.values()) {
    p.efficiency = aggregateEfficiency(p._efficiencyItems || []);
    p.efficiencyInsights = efficiencyInsights(p.efficiency);
    p.promptQuality = aggregatePromptQuality(p._promptAnalyses || []);
    p.cloudRepo = detectCloudRepo(p.cwd);
    delete p._efficiencyItems;
    delete p._promptAnalyses;
  }

  // Ensure intermediate parent folders exist so the tree can nest
  // e.g. .../GrokBuildProjects/grocad implies parent .../GrokBuildProjects
  const cwdKeys = Array.from(projectsMap.keys());
  for (const key of cwdKeys) {
    if (key === "unknown") continue;
    for (const ws of WORKSPACE_CANDIDATES) {
      if (pathIsUnder(key, ws) && key !== ws && !projectsMap.has(ws)) {
        projectsMap.set(ws, {
          cwd: ws,
          name: projectNameFromCwd(ws),
          pathLabel: parentLabelPath(ws),
          ...emptyProjectMetrics(),
          models: new Set(),
          lastActiveAt: null,
        });
      }
    }
  }

  const { tree: projectTree, flat: projects } = buildProjectTree(projectsMap);

  const mainSessions = sessions.filter(
    (s) => !String(s.sessionKind || "main").startsWith("subagent")
  );
  const activeSessions = sessions.filter((s) => s.status === "active");

  // Efficiency / prompts: weight main sessions (subagents are task fragments)
  const mainForMetrics = sessions.filter(
    (s) => !String(s.sessionKind || "main").startsWith("subagent")
  );
  const overallEfficiency = aggregateEfficiency(
    (mainForMetrics.length ? mainForMetrics : sessions)
      .map((s) => s.efficiency)
      .filter(Boolean)
  );
  const overallPromptQuality = aggregatePromptQuality(
    (mainForMetrics.length ? mainForMetrics : sessions)
      .map((s) => s._promptAnalysis)
      .filter(Boolean)
  );

  const totals = {
    sessions: sessions.length,
    mainSessions: mainSessions.length,
    subagentSessions: sessions.length - mainSessions.length,
    activeSessions: activeSessions.length,
    projects: projects.length,
    projectRoots: projectTree.length,
    totalTurns: sessions.reduce((n, s) => n + (s.signals.turnCount || 0), 0),
    totalToolCalls: sessions.reduce((n, s) => n + (s.signals.toolCallCount || 0), 0),
    totalTokens: sessions.reduce((n, s) => n + (s.signals.contextTokensUsed || 0), 0),
    estimatedTokens: overallEfficiency.totalTokensEst || 0,
    estimatedCostUsd: overallEfficiency.estimatedCostUsd || 0,
    totalDurationSeconds: sessions.reduce(
      (n, s) => n + (s.signals.sessionDurationSeconds || 0),
      0
    ),
    linesAdded: sessions.reduce((n, s) => n + (s.signals.agentLinesAdded || 0), 0),
    linesRemoved: sessions.reduce((n, s) => n + (s.signals.agentLinesRemoved || 0), 0),
    filesTouched: sessions.reduce((n, s) => n + (s.signals.totalFilesTouched || 0), 0),
    errors: sessions.reduce(
      (n, s) => n + (s.signals.errorCount || 0) + (s.signals.toolFailureCount || 0),
      0
    ),
    efficiencyScore: overallEfficiency.score,
    efficiencyGrade: overallEfficiency.grade,
    promptScore: overallPromptQuality.avgScore,
    promptGrade: overallPromptQuality.grade,
  };

  // Strip heavy private fields from session list payload
  for (const s of sessions) {
    delete s._promptAnalysis;
    delete s._sessionDir;
  }

  // Live active list from registry (even if summary missing)
  const activeRegistry = Array.from(activeMap.values()).map((a) => {
    const matched = sessions.find((s) => s.id === a.sessionId);
    return {
      ...a,
      title: matched?.title || "(active session)",
      project: matched?.project || projectNameFromCwd(a.cwd),
      projectCwd: matched?.projectCwd || a.cwd,
      projectPath: matched?.projectPath || parentLabelPath(a.cwd),
      status: a.processAlive ? "active" : "stale",
      modelId: matched?.modelId || null,
      signals: matched?.signals || emptySignals(),
    };
  });

  const commandGuidance = recommendCommands({
    efficiency: overallEfficiency,
    promptQuality: overallPromptQuality,
    totals,
    active: activeRegistry,
    projects,
  });

  const promptStrategies = recommendStrategies({
    efficiency: overallEfficiency,
    promptQuality: overallPromptQuality,
    totals,
  });

  // Models / agents / CLI version usage breakdown
  const modelCounts = new Map();
  const agentCounts = new Map();
  const effortCounts = new Map();
  for (const s of sessions) {
    const mid = s.modelId || s.signals?.primaryModelId || "unknown";
    modelCounts.set(mid, (modelCounts.get(mid) || 0) + 1);
    const agent = s.agentName || "unknown";
    agentCounts.set(agent, (agentCounts.get(agent) || 0) + 1);
    if (s.reasoningEffort) {
      effortCounts.set(
        s.reasoningEffort,
        (effortCounts.get(s.reasoningEffort) || 0) + 1
      );
    }
  }
  const sortCount = (map) =>
    Array.from(map.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);

  const versions = {
    grokBuild: version?.version || null,
    grokBuildStable: version?.stable_version || null,
    grokBuildCheckedAt: version?.checked_at || null,
    // Primary model family used in sessions (e.g. grok-4.5)
    models: sortCount(modelCounts),
    primaryModel: sortCount(modelCounts)[0]?.id || null,
    agents: sortCount(agentCounts),
    primaryAgent: sortCount(agentCounts)[0]?.id || null,
    reasoningEffort: sortCount(effortCounts),
    // Human labels
    labels: {
      grokBuild: version?.version
        ? `Grok Build ${version.version}`
        : "Grok Build (version unknown)",
      grokModel: sortCount(modelCounts)[0]
        ? sortCount(modelCounts)
            .slice(0, 3)
            .map((m) => `${m.id} (${m.count})`)
            .join(" · ")
        : "—",
    },
  };

  return {
    scannedAt: new Date().toISOString(),
    grokHome,
    version: version?.version || null,
    versions,
    totals,
    efficiency: overallEfficiency,
    efficiencyInsights: efficiencyInsights(overallEfficiency),
    promptQuality: overallPromptQuality,
    commandGuidance,
    promptStrategies,
    active: activeRegistry,
    projects,
    projectTree,
    sessions,
  };
}

export function getSessionDetail(sessionId, { grokHome = DEFAULT_GROK_HOME } = {}) {
  const snapshot = scanAll({ grokHome });
  const session = snapshot.sessions.find((s) => s.id === sessionId);
  if (!session) return null;

  // locate dir again for extra files
  const sessionsRoot = path.join(grokHome, "sessions");
  const dirs = listSessionDirs(sessionsRoot);
  const entry = dirs.find((d) => d.sessionId === sessionId);
  let recentEvents = [];
  if (entry) {
    const eventsPath = path.join(entry.dir, "events.jsonl");
    try {
      if (fs.existsSync(eventsPath)) {
        const lines = fs.readFileSync(eventsPath, "utf8").trim().split("\n").filter(Boolean);
        recentEvents = lines.slice(-30).map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return { raw: line };
          }
        });
      }
    } catch {
      recentEvents = [];
    }
  }

  return { ...session, recentEvents };
}
