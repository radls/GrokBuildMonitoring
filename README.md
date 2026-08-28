# Grok Build Monitoring

Local web dashboard that tracks **Grok Build** usage and status per **session** and **project**.

It reads session data from your Grok home directory (default `~/.grok`) — no cloud account, no telemetry upload. Everything stays on your machine.

## Features

- **Live sessions** — processes registered in `active_sessions.json`, with PID aliveness checks
- **Per-session usage** — turns, tool calls, context tokens, duration, lines added/removed, files touched, latency
- **Per-project rollups** — nested under each parent workspace (e.g. `GrokBuildProjects / grocad`), not just the session launch folder
- **Project inference** — sessions started from `$HOME` or a workspace root are attributed to the real project folder by matching file paths in session logs against known project directories on disk
- **Status** — `active` · `recent` · `stale` · `idle`
- **Session detail drawer** — tools used, model, agent name, subagent count, todos
- **Prompt strategies** — top prompting playbook for Grok Build (Goal→Scope→Done-when, one outcome per turn, plan-then-build, …) ranked from your quality/cost signals
- **Prompt refiner** — paste a rough idea; get a Grok Build–ready structured prompt and suggested slash command (`/plan`, `/goal`, `/review`, …)
- **Command guidance** — recommended Grok Build slash commands & skills (`/goal`, `/create-workflow`, `/plan`, `/workflow`, …) ranked from your live efficiency/prompt signals
- **Estimated cost** — USD from public xAI rates (context×turns input heuristic + output estimate); lines/$, $/turn, in/out split
- **Auto-refresh** every 4s (toggle Live / Paused)

### Cost notes

Session files store **last context size**, not exact billed tokens. Cost is estimated as:

- **Input** ≈ `0.55 × peak_context × turns` (agent re-prompt growth)
- **Output** ≈ chunk/message heuristic  
- **Rates** default to grok-4.5 list ($2/M in · $6/M out; long-context tier ≥200k)

Override with `GROK_MONITOR_PRICING_JSON='{"grok-4.5":{"input":2,"output":6,...}}'`.

## Data sources

| Source | Purpose |
|--------|---------|
| `~/.grok/active_sessions.json` | Currently open Grok processes |
| `~/.grok/sessions/<encoded-cwd>/<session-id>/summary.json` | Title, cwd, model, timestamps |
| `.../signals.json` | Token/tool/duration/churn counters |
| `.../plan.json` | Todo progress |
| `~/.grok/version.json` | Grok CLI version |

Override the data root with `GROK_HOME` if needed.

## Quick start

```bash
# Requirements: Node.js 18+
npm install
npm run dev
```

Then open:

- **UI (Vite):** http://localhost:5174  
- **API:** http://localhost:3847  

### Production

```bash
npm run build
npm start
# → http://localhost:3847
```

### Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3847` | API / production server port |
| `HOST` | `127.0.0.1` | Bind address for the API. Default is localhost-only so session data is not exposed on the LAN. |
| `GROK_HOME` | `~/.grok` | Grok data directory |
| `CACHE_MS` | `1500` | In-memory scan cache TTL |
| `NODE_ENV` | — | Set to `production` to serve `dist/` |

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/overview` | Totals, active list, projects |
| `GET /api/sessions` | All sessions (`?project=&status=&kind=&q=&limit=&refresh=1`) |
| `GET /api/sessions/:id` | Session detail |
| `GET /api/projects` | Project aggregates |
| `GET /api/commands` | Recommended Grok Build command usage |
| `GET /api/strategies` | Top prompt strategies + guidance |
| `POST /api/refine` | Body `{ "prompt": "..." }` → refined Grok Build prompt + command |

## Status meanings

| Status | Meaning |
|--------|---------|
| **active** | Listed in `active_sessions.json` and PID is alive |
| **stale** | Listed as active but process is gone |
| **recent** | Updated within the last 5 minutes |
| **idle** | Older session, not running |

## Notes

- **Context tokens** are the last recorded context-window size per session (from `signals.json`), not a full lifetime billing total.
- Subagent sessions appear as separate rows; project rollups count main vs subagent separately.
- The scanner is read-only and never modifies Grok session files.

## License

MIT
