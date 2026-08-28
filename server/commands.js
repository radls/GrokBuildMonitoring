/**
 * Curated Grok Build command recommendations for optimal usage.
 *
 * Catalog aligned with ~/.grok/docs/user-guide/04-slash-commands.md
 * (Grok Build 0.2.x builtins + high-value invocable skills).
 */

/** @typedef {{ id: string, command: string, aliases?: string[], category: string, summary: string, when: string, how: string, example: string, tips?: string[], related?: string[], source?: "builtin"|"skill" }} CommandRec */

/** @type {CommandRec[]} */
export const COMMAND_CATALOG = [
  // —— Plan & design ——
  {
    id: "plan",
    command: "/plan",
    category: "Plan & design",
    source: "builtin",
    summary: "Enter plan mode before large or ambiguous builds.",
    when: "Architecture choices, multi-file design, or risk assessment before editing.",
    how: "Run `/plan [description]`. Refine the plan, then implement with a scoped prompt.",
    example: "/plan Add cost tracking to the monitoring Overview",
    tips: [
      "Use when prompts are vague or the task spans many modules.",
      "Shift+Tab also cycles Normal / Plan / Always-approve.",
    ],
    related: ["/view-plan", "/design", "/goal"],
  },
  {
    id: "view-plan",
    command: "/view-plan",
    aliases: ["/show-plan", "/plan-view"],
    category: "Plan & design",
    source: "builtin",
    summary: "Preview the current saved plan.",
    when: "Mid-implementation and you need the agreed steps again.",
    how: "Run `/view-plan` to open the plan preview.",
    example: "/view-plan",
    related: ["/plan"],
  },
  {
    id: "design",
    command: "/design",
    category: "Plan & design",
    source: "skill",
    summary: "Skill: design-doc writer + reviewer loop until consensus.",
    when: "You want a polished design doc and PR plan before coding.",
    how: "Invoke `/design` with the system goal and constraints.",
    example: "/design Local monitoring for Grok sessions with cost estimates",
    tips: ["Follow with `/execute-plan` for larger systems."],
    related: ["/execute-plan", "/plan"],
  },
  {
    id: "execute-plan",
    command: "/execute-plan",
    category: "Plan & design",
    source: "skill",
    summary: "Skill: execute a design-doc PR plan with isolated subagents.",
    when: "You already have a design with a PR plan DAG.",
    how: "Run after `/design` (or with an existing design doc).",
    example: "/execute-plan",
    related: ["/design", "/workflows"],
  },

  // —— Goals & autonomy ——
  {
    id: "goal",
    command: "/goal",
    category: "Goals & autonomy",
    source: "builtin",
    summary: "Autonomous multi-round goal with evidence-based completion.",
    when: "One prompt isn’t enough — keep going until a verifiable outcome is met.",
    how: "`/goal <objective> [--budget <tokens>]` or `status|pause|resume|clear`. Token budget is separate from workflow agent budgets.",
    example: "/goal All Overview tooltips stay above the sticky bar; verified in the browser\n/goal status",
    tips: [
      "Write the goal as done-when: measurable, testable.",
      "Use `--budget` on long runs so cost doesn’t runaway.",
      "Completion needs independent evidence review.",
    ],
    related: ["/plan", "/workflows", "/check-work"],
  },
  {
    id: "loop",
    command: "/loop",
    category: "Goals & autonomy",
    source: "builtin",
    summary: "Run a prompt on a recurring interval (scheduler).",
    when: "Polling deploys, health checks, or periodic refreshes.",
    how: "`/loop [interval] <prompt>`. Intervals: `Ns` (min 60s), `Nm`, `Nh`, `Nd`. Tasks expire after 7 days.",
    example: "/loop 30m check deploy status\n/loop check deploy status every hour",
    tips: ["Cancel with scheduler_delete using the job ID from creation."],
    related: ["/goal", "/workflows"],
  },
  {
    id: "btw",
    command: "/btw",
    category: "Goals & autonomy",
    source: "builtin",
    summary: "Aside to the agent without interrupting the current task.",
    when: "You need a quick side question while a long turn is running.",
    how: "`/btw <question>` — side Q&A is not part of the main turn.",
    example: "/btw also check the error handling",
    related: ["/dashboard", "/session-info"],
  },

  // —— Workflows & multi-agent ——
  {
    id: "create-workflow",
    command: "/create-workflow",
    category: "Workflows & multi-agent",
    source: "skill",
    summary: "Skill: author a Rhai multi-agent workflow, smoke-check, and save it.",
    when: "You repeatedly fan out the same multi-step process (review, research, verify).",
    how: "Describe the pipeline. Saves under `.grok/workflows/` or `~/.grok/workflows/`.",
    example: "/create-workflow Fan-out code review on a diff with adversarial verification",
    tips: [
      "Keep agent prompts self-contained — workflows re-run without full chat history.",
      "Smoke-check with validate_only before a full live run.",
    ],
    related: ["/workflow", "/workflows"],
  },
  {
    id: "workflow",
    command: "/workflow",
    category: "Workflows & multi-agent",
    source: "builtin",
    summary: "Launch, pause, resume, stop, or save a named workflow run.",
    when: "You have a saved workflow and want to run or control it.",
    how: "`/workflow <name> [json-args]` · `pause|resume|stop <display-name>` · `save`.",
    example: '/workflow review-changes {"target":"origin/main...HEAD"}\n/workflow pause review-changes',
    tips: [
      "Display names are session-unique (`review-changes`, `review-changes-2`).",
      "Budget-limited runs need a higher agent_budget to resume.",
    ],
    related: ["/workflows", "/create-workflow"],
  },
  {
    id: "workflows",
    command: "/workflows",
    category: "Workflows & multi-agent",
    source: "builtin",
    summary: "Live dashboard of active/retained workflow runs (not the catalog).",
    when: "Background work is running and you want progress, agents, or pause/stop.",
    how: "Open `/workflows`; use p/r/x on a run detail as documented.",
    example: "/workflows",
    related: ["/workflow", "/deep-research", "/dashboard"],
  },
  {
    id: "deep-research",
    command: "/deep-research",
    category: "Workflows & multi-agent",
    source: "builtin",
    summary: "Background research workflow with claim verification.",
    when: "You need sourced, cross-checked answers (APIs, libraries, design options).",
    how: "`/deep-research <query>` — returns immediately; progress in `/workflows`.",
    example: "/deep-research Compare local-first vs cloud analytics for CLI agents",
    related: ["/workflows"],
  },
  {
    id: "dashboard",
    command: "/dashboard",
    aliases: ["/agents-dashboard", "/sessions"],
    category: "Workflows & multi-agent",
    source: "builtin",
    summary: "Agent Dashboard: live roster of top-level sessions in this pager.",
    when: "Multiple sessions/forks — peek, reply, dispatch, pin, rename, stop, attach.",
    how: "`/dashboard` (or Ctrl+\\). Not `/config-agents` (agent definitions).",
    example: "/dashboard",
    tips: [
      "Hidden in minimal mode; disable with GROK_AGENT_DASHBOARD=0.",
      "Delete a session: Ctrl+X twice or [✗] on the dashboard.",
    ],
    related: ["/fork", "/config-agents", "/workflows"],
  },

  // —— Session efficiency ——
  {
    id: "compact",
    command: "/compact",
    category: "Session efficiency",
    source: "builtin",
    summary: "Compress history to free context-window space.",
    when: "Context utilization is high (~50–85%+) or responses lose focus.",
    how: "`/compact` or `/compact keep <what matters>`. Auto-compact also fires near threshold.",
    example: "/compact keep the monitoring API contracts and UI layout decisions",
    tips: ["Prefer `/new` for a new feature once the session is large."],
    related: ["/context", "/new", "/flush"],
  },
  {
    id: "context",
    command: "/context",
    category: "Session efficiency",
    source: "builtin",
    summary: "Category breakdown of context usage (system, messages, free space, tools).",
    when: "Efficiency is dropping or you’re unsure whether to compact or start fresh.",
    how: "Run `/context` and inspect free space vs overhead.",
    example: "/context",
    related: ["/compact", "/session-info"],
  },
  {
    id: "new",
    command: "/new",
    aliases: ["/clear"],
    category: "Session efficiency",
    source: "builtin",
    summary: "Start a fresh session and clear the conversation.",
    when: "Switching features/projects, or after thrashy high-cost sessions.",
    how: "`/new` then send a high-quality prompt (goal, scope, constraints, done-when).",
    example: "/new",
    related: ["/compact", "/rename", "/delete"],
  },
  {
    id: "resume",
    command: "/resume",
    category: "Session efficiency",
    source: "builtin",
    summary: "Open the session picker to reload a previous session.",
    when: "Continuing prior work by title or id.",
    how: "`/resume` in TUI, or `grok --resume <id-or-title>` from CLI.",
    example: "/resume",
    related: ["/dashboard", "/rename"],
  },
  {
    id: "session-info",
    command: "/session-info",
    aliases: ["/status", "/info"],
    category: "Session efficiency",
    source: "builtin",
    summary: "Auth method, model, turn count, and context usage at a glance.",
    when: "Quick health check without the full `/context` breakdown.",
    how: "Run `/session-info`.",
    example: "/session-info",
    related: ["/context", "/usage", "/model"],
  },
  {
    id: "usage",
    command: "/usage",
    aliases: ["/cost"],
    category: "Session efficiency",
    source: "builtin",
    summary: "View credit usage or manage billing.",
    when: "Tracking cost alongside this dashboard’s estimates.",
    how: "`/usage` or `/usage manage`.",
    example: "/usage\n/usage manage",
    related: ["/session-info", "/privacy"],
  },
  {
    id: "model",
    command: "/model",
    aliases: ["/m"],
    category: "Session efficiency",
    source: "builtin",
    summary: "Switch models (and optional reasoning effort).",
    when: "You need a different model or effort for the next turns.",
    how: "`/model <name> [effort]`. Effort levels: low, medium, high, xhigh.",
    example: "/model grok-4.5\n/model grok-build\n/effort high",
    related: ["/effort", "/session-info"],
  },
  {
    id: "effort",
    command: "/effort",
    category: "Session efficiency",
    source: "builtin",
    summary: "Set reasoning effort on the current model without reselecting it.",
    when: "Trade speed vs depth mid-session.",
    how: "`/effort low|medium|high|xhigh` (when the model supports it).",
    example: "/effort high",
    related: ["/model"],
  },

  // —— Quality & recovery ——
  {
    id: "rewind",
    command: "/rewind",
    aliases: ["/undo"],
    category: "Quality & recovery",
    source: "builtin",
    summary: "Restore files + conversation to an earlier user prompt.",
    when: "A turn went sideways and you want a clean rollback.",
    how: "`/rewind` (or `/undo`) and pick a rewind point. Esc Esc when idle also works.",
    example: "/rewind",
    tips: ["Later file changes are discarded unless they’re in git."],
    related: ["/fork", "/compact"],
  },
  {
    id: "fork",
    command: "/fork",
    category: "Quality & recovery",
    source: "builtin",
    summary: "Branch the session (optional worktree) for an alternate approach.",
    when: "Parallel attempt without losing the original thread.",
    how: "`/fork [--worktree|--no-worktree] [directive]`.",
    example: "/fork --worktree Try a lighter UI with less polling",
    related: ["/dashboard", "/rewind", "/new"],
  },
  {
    id: "review",
    command: "/review",
    category: "Quality & recovery",
    source: "skill",
    summary: "Skill: reviewer subagent on local changes, a branch, or a PR.",
    when: "Before merge, or second-pass quality after a big implement.",
    how: "Invoke `/review` against uncommitted work, a branch, or a GitHub PR.",
    example: "/review",
    related: ["/check-work", "/create-workflow"],
  },
  {
    id: "check-work",
    command: "/check-work",
    aliases: ["/check", "/verify", "/self-verify"],
    category: "Quality & recovery",
    source: "skill",
    summary: "Skill: verification subagent — diffs, builds, tests, correctness.",
    when: "After a large implement turn; pairs with strong done-when prompts.",
    how: "Run `/check-work` so an independent agent validates.",
    example: "/check-work",
    related: ["/review", "/goal"],
  },
  {
    id: "always-approve",
    command: "/always-approve",
    category: "Quality & recovery",
    source: "builtin",
    summary: "Toggle skip-all permission prompts (yolo) on/off.",
    when: "Trusted local work where prompts slow you down — use carefully.",
    how: "Run `/always-approve` to enable; run again to return to ask. Shift+Tab cycles modes.",
    example: "/always-approve",
    tips: ["Dangerous for shared/prod machines. Prefer `/auto` when available."],
    related: ["/auto", "/settings"],
  },
  {
    id: "auto",
    command: "/auto",
    category: "Quality & recovery",
    source: "builtin",
    summary: "Toggle classifier-based auto-approval of safe tools.",
    when: "You want fewer prompts without full always-approve.",
    how: "`/auto` toggles; only appears when the feature is enabled.",
    example: "/auto",
    related: ["/always-approve", "/settings"],
  },

  // —— Memory & continuity ——
  {
    id: "remember",
    command: "/remember",
    category: "Memory & continuity",
    source: "builtin",
    summary: "Save a note to memory immediately.",
    when: "Decisions, env quirks, or conventions should survive compact/new.",
    how: "`/remember <note>`.",
    example: "/remember Monitoring API defaults to port 3847 and reads ~/.grok",
    related: ["/flush", "/memory"],
  },
  {
    id: "flush",
    command: "/flush",
    category: "Memory & continuity",
    source: "builtin",
    summary: "Force-save session knowledge to memory (LLM summary).",
    when: "About to `/compact` or `/new` but want durable notes kept.",
    how: "Requires memory enabled (`GROK_MEMORY=1` or experimental flag), then `/flush`.",
    example: "/flush",
    related: ["/remember", "/compact", "/dream"],
  },
  {
    id: "memory",
    command: "/memory",
    aliases: ["/mem"],
    category: "Memory & continuity",
    source: "builtin",
    summary: "Browse/manage saved memories; `/memory on|off` toggles.",
    when: "Inspect or disable cross-session memory.",
    how: "`/memory` · `/memory on` · `/memory off`.",
    example: "/memory\n/memory off",
    related: ["/remember", "/flush", "/dream"],
  },
  {
    id: "dream",
    command: "/dream",
    category: "Memory & continuity",
    source: "builtin",
    summary: "Consolidate memory — merge session logs into organized topics.",
    when: "Memory is messy after many sessions.",
    how: "Requires memory enabled, then `/dream`.",
    example: "/dream",
    related: ["/memory", "/flush"],
  },

  // —— Media & creative ——
  {
    id: "imagine",
    command: "/imagine",
    category: "Media & creative",
    source: "builtin",
    summary: "Generate an image from a text description.",
    when: "Concept art, UI mock inspiration, sprites (via skill pipeline).",
    how: "`/imagine <description>`.",
    example: "/imagine dark monitoring dashboard with cyan KPI strip",
    related: ["/imagine-video"],
  },
  {
    id: "imagine-video",
    command: "/imagine-video",
    category: "Media & creative",
    source: "builtin",
    summary: "Generate a video from text (or image) description.",
    when: "Short animation / motion concept from a prompt.",
    how: "`/imagine-video <description>` — plans shots and animates frames.",
    example: "/imagine-video a soft camera pan across a code dashboard at night",
    related: ["/imagine"],
  },

  // —— Session management ——
  {
    id: "rename",
    command: "/rename",
    aliases: ["/title"],
    category: "Session management",
    source: "builtin",
    summary: "Rename the current session title.",
    when: "Make resume/search easier later.",
    how: "`/rename <title>`.",
    example: "/rename Grok Build Monitoring cost UI",
    related: ["/resume", "/dashboard"],
  },
  {
    id: "delete",
    command: "/delete",
    category: "Session management",
    source: "builtin",
    summary: "Delete the current session history (confirms first).",
    when: "Throwaway session you don’t want on disk.",
    how: "`/delete` here, or `d` then `y` in `/resume` list; dashboard Ctrl+X twice.",
    example: "/delete",
    related: ["/new", "/home", "/dashboard"],
  },
  {
    id: "home",
    command: "/home",
    aliases: ["/welcome"],
    category: "Session management",
    source: "builtin",
    summary: "Leave the session and return to the welcome screen.",
    when: "Switch work without quitting Grok.",
    how: "`/home`.",
    example: "/home",
    related: ["/resume", "/quit"],
  },
  {
    id: "export",
    command: "/export",
    category: "Session management",
    source: "builtin",
    summary: "Export the conversation to a file or the clipboard.",
    when: "Sharing or archiving a useful thread.",
    how: "`/export`.",
    example: "/export",
    related: ["/copy"],
  },
  {
    id: "copy",
    command: "/copy",
    category: "Session management",
    source: "builtin",
    summary: "Copy the latest (or Nth) response; optional file path.",
    when: "Grabbing agent output for docs or SSH without clipboard.",
    how: "`/copy` · `/copy 2` · `/copy out.txt`. Backup in `~/.grok/last-copy.txt`.",
    example: "/copy\n/copy 2 ~/exports/last-reply.md",
    related: ["/export"],
  },
  {
    id: "history",
    command: "/history",
    category: "Session management",
    source: "builtin",
    summary: "Fuzzy-search this session’s past prompts.",
    when: "Re-run or edit a previous prompt quickly.",
    how: "`/history`, or ↑ on an empty prompt.",
    example: "/history",
    related: ["/resume"],
  },

  // —— Extensions & setup ——
  {
    id: "skills",
    command: "/skills",
    category: "Extensions & setup",
    source: "builtin",
    summary: "Browse installed skills (many appear as /slash commands).",
    when: "Discover create-workflow, design, review, Unity, docs tools, etc.",
    how: "Open `/skills` and enable what you need.",
    example: "/skills",
    related: ["/plugins", "/create-workflow", "/docs"],
  },
  {
    id: "plugins",
    command: "/plugins",
    category: "Extensions & setup",
    source: "builtin",
    summary: "Manage installed plugins and marketplace installs.",
    when: "Adding community/plugin capabilities.",
    how: "Open `/plugins` modal, or shell subcommands list/install/uninstall/update.",
    example: "/plugins",
    related: ["/marketplace", "/skills"],
  },
  {
    id: "marketplace",
    command: "/marketplace",
    category: "Extensions & setup",
    source: "builtin",
    summary: "Browse and install plugins from the marketplace.",
    when: "Looking for new plugins.",
    how: "`/marketplace`.",
    example: "/marketplace",
    related: ["/plugins"],
  },
  {
    id: "hooks",
    command: "/hooks",
    category: "Extensions & setup",
    source: "builtin",
    summary: "View/add/remove lifecycle hooks.",
    when: "Automating on session events (trust model applies).",
    how: "`/hooks` opens the extensions modal on Hooks.",
    example: "/hooks",
    related: ["/plugins", "/settings"],
  },
  {
    id: "mcps",
    command: "/mcps",
    category: "Extensions & setup",
    source: "builtin",
    summary: "Manage MCP servers.",
    when: "Connecting Linear, Slack, custom tools, etc.",
    how: "`/mcps` opens the MCP management modal.",
    example: "/mcps",
    related: ["/settings", "/import-claude"],
  },
  {
    id: "config-agents",
    command: "/config-agents",
    aliases: ["/agents"],
    category: "Extensions & setup",
    source: "builtin",
    summary: "Manage agent definitions, default, and active agent.",
    when: "Switching agent types or editing definitions — not the live session roster.",
    how: "`/config-agents` (alias `/agents`). For live multi-session UI use `/dashboard`.",
    example: "/config-agents",
    related: ["/personas", "/dashboard"],
  },
  {
    id: "personas",
    command: "/personas",
    category: "Extensions & setup",
    source: "builtin",
    summary: "Create/edit/delete personas for subagents.",
    when: "Shaping subagent behavior.",
    how: "`/personas`.",
    example: "/personas",
    related: ["/config-agents"],
  },
  {
    id: "docs",
    command: "/docs",
    aliases: ["/howto", "/guides"],
    category: "Extensions & setup",
    source: "builtin",
    summary: "How-to guides, online Build docs, or jump by title.",
    when: "Unsure about a command’s flags or a Grok Build feature.",
    how: "`/docs` · `/docs web` · `/docs Getting Started`.",
    example: "/docs\n/docs web\n/docs Slash Commands",
    related: ["/tutorial", "/release-notes"],
  },
  {
    id: "tutorial",
    command: "/tutorial",
    aliases: ["/tour", "/onboarding"],
    category: "Extensions & setup",
    source: "builtin",
    summary: "Onboarding topics: first prompt, navigation, plan mode, worktrees, etc.",
    when: "Learning Grok Build or switching from another agent tool.",
    how: "`/tutorial`.",
    example: "/tutorial",
    related: ["/docs"],
  },
  {
    id: "doctor",
    command: "/doctor",
    category: "Extensions & setup",
    source: "builtin",
    summary: "Diagnose terminal, clipboard, color, input, notification, sandbox issues.",
    when: "Something in the TUI/environment is broken.",
    how: "`/doctor` · `/doctor fix` for automatic fixes. Aliases: `/terminal-setup`, etc.",
    example: "/doctor\n/doctor fix",
    related: ["/settings"],
  },
  {
    id: "settings",
    command: "/settings",
    aliases: ["/config", "/preferences", "/prefs"],
    category: "Extensions & setup",
    source: "builtin",
    summary: "Interactive settings modal.",
    when: "Changing UI, permissions, models, or defaults.",
    how: "`/settings`.",
    example: "/settings",
    related: ["/privacy", "/model", "/theme"],
  },
  {
    id: "privacy",
    command: "/privacy",
    category: "Extensions & setup",
    source: "builtin",
    summary: "Coding data, retention, and training opt-in/out.",
    when: "Managing data retention / training preferences (or ZDR on teams).",
    how: "`/privacy` opens Settings on that page.",
    example: "/privacy",
    related: ["/settings", "/usage"],
  },
  {
    id: "theme",
    command: "/theme",
    aliases: ["/t"],
    category: "Extensions & setup",
    source: "builtin",
    summary: "Switch the color theme.",
    when: "UI appearance.",
    how: "`/theme`.",
    example: "/theme",
    related: ["/settings", "/timestamps"],
  },
  {
    id: "release-notes",
    command: "/release-notes",
    aliases: ["/changelog"],
    category: "Extensions & setup",
    source: "builtin",
    summary: "View release notes for the current Grok Build version.",
    when: "See what changed after an update.",
    how: "`/release-notes` or `/changelog`.",
    example: "/release-notes",
    related: ["/docs"],
  },
  {
    id: "import-claude",
    command: "/import-claude",
    category: "Extensions & setup",
    source: "builtin",
    summary: "Import ~/.claude settings (permissions, env, MCP, hooks, paths).",
    when: "Migrating from Claude Code.",
    how: "`/import-claude`.",
    example: "/import-claude",
    related: ["/mcps", "/hooks", "/settings"],
  },
  {
    id: "create-skill",
    command: "/create-skill",
    category: "Extensions & setup",
    source: "skill",
    summary: "Skill: scaffold a new Grok skill (SKILL.md + optional scripts).",
    when: "Packaging a repeatable workflow as a user-invocable /command.",
    how: "`/create-skill` and follow the interactive flow.",
    example: "/create-skill",
    related: ["/skills", "/create-workflow"],
  },
  {
    id: "help",
    command: "/help",
    category: "Extensions & setup",
    source: "skill",
    summary: "Skill: Grok docs — config, MCP, auth, skills, shortcuts.",
    when: "Setup or onboarding questions.",
    how: "`/help` or ask naturally; skill reads user-guide docs.",
    example: "/help",
    related: ["/docs", "/tutorial"],
  },

  // —— Account ——
  {
    id: "login",
    command: "/login",
    category: "Account",
    source: "builtin",
    summary: "Log in or re-authenticate without leaving the session.",
    when: "Token expired or switching accounts.",
    how: "`/login`.",
    example: "/login",
    related: ["/logout", "/usage"],
  },
  {
    id: "logout",
    command: "/logout",
    category: "Account",
    source: "builtin",
    summary: "Log out and return to the login screen.",
    when: "Clearing credentials for this machine session.",
    how: "`/logout`.",
    example: "/logout",
    related: ["/login"],
  },
  {
    id: "feedback",
    command: "/feedback",
    category: "Account",
    source: "builtin",
    summary: "Report an issue or send feedback.",
    when: "Something isn’t working correctly.",
    how: "`/feedback [message]`.",
    example: "/feedback Something isn't working correctly",
    related: ["/doctor", "/release-notes"],
  },
];

const CATEGORY_ORDER = [
  "Plan & design",
  "Goals & autonomy",
  "Workflows & multi-agent",
  "Session efficiency",
  "Quality & recovery",
  "Memory & continuity",
  "Media & creative",
  "Session management",
  "Extensions & setup",
  "Account",
];

/**
 * Build prioritized recommendations from live monitoring snapshot signals.
 */
export function recommendCommands(snapshot = {}) {
  const efficiency = snapshot.efficiency || {};
  const promptQuality = snapshot.promptQuality || {};
  const totals = snapshot.totals || {};
  const active = snapshot.active || [];

  const reasons = new Map(); // id -> { score, reasons[] }

  function bump(id, points, reason) {
    if (!reasons.has(id)) reasons.set(id, { score: 0, reasons: [] });
    const e = reasons.get(id);
    e.score += points;
    if (reason) e.reasons.push(reason);
  }

  // Always surface core power tools
  bump("goal", 12, "Best for multi-round outcomes with verification.");
  bump("create-workflow", 12, "Automate repeated multi-agent pipelines.");
  bump("plan", 10, "Default first step for non-trivial work.");
  bump("workflow", 8, "Run saved workflows once authored.");
  bump("workflows", 6, "Watch background runs.");
  bump("dashboard", 8, "Manage multiple live sessions/forks in one place.");
  bump("compact", 6, "Keep sessions efficient.");
  bump("context", 5, "Diagnose context pressure.");
  bump("check-work", 8, "Independent verification after big changes.");
  bump("review", 7, "Second-pass quality before merge.");
  bump("usage", 5, "Compare account usage with this dashboard’s cost estimates.");
  bump("docs", 4, "Built-in how-tos and online Build docs.");

  // Prompt quality driven
  const pq = promptQuality.avgScore;
  if (pq != null && pq < 55) {
    bump("plan", 18, `Prompt quality is ${pq}/100 — plan mode reduces vague thrash.`);
    bump("goal", 10, "A crisp /goal forces measurable done-when language.");
    bump("docs", 6, "Refresh command patterns while improving prompts.");
    bump("tutorial", 5, "Short onboarding topics for better prompting habits.");
  } else if (pq != null && pq < 70) {
    bump("plan", 10, "Prompts are mid-quality — short plans still help.");
    bump("check-work", 8, "Add verification after implement turns.");
  }

  // Efficiency driven
  const ctx = efficiency.contextUtilizationPct ?? 0;
  const toolsPerTurn = efficiency.toolsPerTurn ?? 0;
  const linesPerTurn = efficiency.linesPerTurn ?? 0;
  const err = efficiency.errorRate ?? 0;
  const costPerTurn = efficiency.costPerTurn ?? 0;

  if (ctx >= 60) {
    bump("compact", 22, `Context utilization ~${ctx}% — compact with a keep-note.`);
    bump("context", 14, "Inspect what’s consuming the window.");
    bump("new", 12, "Or start a fresh session for the next feature.");
    bump("flush", 8, "Flush memory before compact if durable notes matter.");
  } else if (ctx >= 40) {
    bump("compact", 10, `Context ~${ctx}% — consider compacting soon.`);
    bump("context", 8, "Monitor free space before the next large turn.");
  }

  if (costPerTurn >= 0.15) {
    bump("compact", 12, `High est. cost/turn (~$${Number(costPerTurn).toFixed(2)}) — free context.`);
    bump("new", 10, "Start fresh sessions per feature to cut re-prompt cost.");
    bump("usage", 8, "Check account usage alongside estimates.");
  }

  if (toolsPerTurn >= 20 && linesPerTurn < 20) {
    bump("plan", 16, "High tools/turn with modest yield — plan before more exploration.");
    bump("create-workflow", 10, "If this exploration pattern repeats, encode it as a workflow.");
    bump("new", 8, "Reset thrashy sessions instead of stacking more turns.");
  }

  if (err >= 0.08) {
    bump("check-work", 14, `Error rate ${err} — verify with an independent pass.`);
    bump("rewind", 10, "Rewind bad turns instead of patching endlessly.");
    bump("review", 8, "Review diffs before continuing.");
  }

  if ((totals.activeSessions || active.length) > 0) {
    bump("session-info", 6, "You have live sessions — glance at status/context.");
    bump("dashboard", 12, "Multiple sessions may be active — use the Agent Dashboard.");
    bump("workflows", 6, "Check background workflow runs if any were launched.");
    bump("btw", 4, "Side questions without interrupting the main turn.");
  }

  // Cloud repos → review/workflow more relevant
  const cloudProjects = (snapshot.projects || []).filter((p) => p.cloudRepo?.isCloud);
  if (cloudProjects.length > 0) {
    bump("review", 10, `${cloudProjects.length} project(s) have cloud remotes — review before push/PR.`);
    bump("create-workflow", 8, "PR/diff review workflows pay off with cloud-hosted repos.");
  }

  // Build prioritized list from catalog
  const byId = new Map(COMMAND_CATALOG.map((c) => [c.id, c]));
  const ranked = [...reasons.entries()]
    .map(([id, meta]) => {
      const base = byId.get(id);
      if (!base) return null;
      return {
        ...base,
        priority: meta.score,
        whyNow: meta.reasons.slice(0, 3),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);

  // Ensure catalog coverage: append unranked commands at lower priority
  const seen = new Set(ranked.map((r) => r.id));
  for (const c of COMMAND_CATALOG) {
    if (seen.has(c.id)) continue;
    ranked.push({ ...c, priority: 1, whyNow: ["General best practice."] });
  }

  const featured = ranked.slice(0, 8);
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: ranked.filter((r) => r.category === cat),
  })).filter((g) => g.items.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    catalogSource: "Grok Build user-guide 04-slash-commands.md + invocable skills",
    catalogCount: COMMAND_CATALOG.length,
    featured,
    byCategory,
    signals: {
      promptScore: pq ?? null,
      efficiencyScore: efficiency.score ?? null,
      contextUtilizationPct: ctx,
      toolsPerTurn,
      linesPerTurn,
      errorRate: err,
      costPerTurn,
      cloudProjects: cloudProjects.length,
      activeSessions: totals.activeSessions ?? active.length,
    },
  };
}
