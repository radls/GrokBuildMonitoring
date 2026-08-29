/**
 * Top prompt strategies for optimal Grok Build usage.
 * Ranked against live prompt-quality issue signals when available.
 */

/** @typedef {{
 *  id: string,
 *  title: string,
 *  rank?: number,
 *  summary: string,
 *  when: string,
 *  how: string,
 *  template?: string,
 *  example: string,
 *  antiPatterns?: string[],
 *  pairsWith?: string[],
 *  addresses?: string[],
 * }} Strategy */

/** @type {Strategy[]} */
export const STRATEGY_CATALOG = [
  {
    id: "goal-scope-constraints-done",
    title: "Goal → Scope → Constraints → Done-when",
    summary:
      "The default template for implement prompts. Maximizes agent yield and scores highest on this dashboard’s prompt quality heuristic.",
    when: "Almost every coding turn — especially multi-file or non-trivial work.",
    how: "State the outcome, name files/components, list what not to touch, and how you’ll verify success.",
    template: `Goal: <what should be true when finished>
Scope: <files / folders / components>
Constraints: <what not to change>
Done when: <command, test, or UI check>`,
    example: `Goal: Top projects bar shows leaf names only
Scope: client/src/App.jsx ProjectBarRow
Constraints: Don't change the API schema
Done when: hover tooltip still shows full path and cost`,
    antiPatterns: [
      '"Fix it" / "make it better" with no target',
      "Image-only messages with no expected vs actual",
    ],
    pairsWith: ["/plan", "/check-work"],
    addresses: ["no_criteria", "no_paths", "short", "vague_language", "image_only"],
  },
  {
    id: "one-outcome-per-turn",
    title: "One primary outcome per turn",
    summary:
      "Give the agent a single success condition. Queue follow-ups instead of packing five features into one prompt.",
    when: "You notice long thrash, high tools/turn, or partial delivery.",
    how: "Pick the one change that unblocks you. Explicitly defer the rest (“next: …”).",
    example: `Only implement the cost KPI on Overview.
Next turn: project table cost column.`,
    antiPatterns: [
      "Mega-prompts with many “and also…” clauses",
      '"Apply all the suggestions above" without re-stating the remaining goal',
    ],
    pairsWith: ["/goal", "/new", "/compact"],
    addresses: ["multi_goal", "very_long", "vague_continuation", "unstructured"],
  },
  {
    id: "plan-then-build",
    title: "Plan mode before large edits",
    summary:
      "Use /plan (or a short design pass) when architecture or tradeoffs are unclear — then implement from the agreed plan.",
    when: "New features, refactors, multi-module work, or low prompt-quality streaks.",
    how: "`/plan <intent>` → refine → scoped implement prompt referencing the plan.",
    example: `/plan Add prompt-strategy coaching pane to the monitoring Overview
Then: Implement only the strategies pane per the plan; done when /api/overview includes strategies.`,
    antiPatterns: ["Jumping straight to edits on ambiguous requirements"],
    pairsWith: ["/plan", "/view-plan", "/design", "/execute-plan"],
    addresses: ["unstructured", "multi_goal", "short", "no_criteria"],
  },
  {
    id: "name-the-path",
    title: "Name the path early",
    summary:
      "Absolute or relative paths cut exploration tools dramatically and lower estimated cost.",
    when: "You already know the file, folder, or symbol — even approximately.",
    how: "Paste paths from the editor, repo tree, or prior agent output in the Scope line.",
    example: `Scope: server/strategies.js and client/src/App.jsx OverviewPage only`,
    antiPatterns: ['"Somewhere in the frontend" with no path hints'],
    pairsWith: ["/context"],
    addresses: ["no_paths", "somewhat_vague"],
  },
  {
    id: "done-when-verify",
    title: "Always include a verify step",
    summary:
      "Done-when lets the agent self-check and pairs with /check-work for independent validation.",
    when: "Any change that can break build, tests, UI, or API contracts.",
    how: "End with a concrete check: command, URL, screenshot region, or invariant.",
    example: `Done when: npm run build succeeds and curl localhost:3847/api/overview | jq .strategies`,
    antiPatterns: ["Stopping at “looks good” with no check"],
    pairsWith: ["/check-work", "/goal"],
    addresses: ["no_criteria"],
  },
  {
    id: "evidence-not-adjectives",
    title: "Symptoms over adjectives",
    summary:
      'Replace "terrible", "broken", "weird" with expected vs actual behavior.',
    when: "Bugs, UI polish, performance complaints, or image attachments.",
    how: "State expected, actual, repro steps; keep the image and caption it.",
    example: `Expected: tooltip fully visible above the bar.
Actual: top half clipped under the sticky header.
[image]`,
    antiPatterns: ['"The game looks terrible" + image only'],
    pairsWith: ["/rewind", "/btw"],
    addresses: ["vague_language", "image_only", "somewhat_vague", "very_short"],
  },
  {
    id: "session-hygiene",
    title: "Session hygiene for cost & focus",
    summary:
      "Fresh sessions per feature, compact with a keep-note, flush memory before big resets.",
    when: "High context %, high $/turn, or topic switches mid-thread.",
    how: "`/compact keep …` or `/new` after `/flush` if memory matters. One feature ≈ one session.",
    example: `/compact keep strategies API shape and Overview tab layout
/new
Implement prompt strategies pane only…`,
    antiPatterns: ["Stacking unrelated projects into one endless session"],
    pairsWith: ["/compact", "/new", "/context", "/flush", "/usage"],
    addresses: ["very_long", "multi_goal"],
  },
  {
    id: "goal-for-marathons",
    title: "Use /goal for multi-round outcomes",
    summary:
      "When success needs several turns and verification, /goal keeps the agent on a measurable objective.",
    when: "Migrations, greenfield features, or “keep going until it works” work.",
    how: "`/goal <objective> [--budget tokens]` with a testable claim; check `/goal status`.",
    example: `/goal Strategies pane shows top 5 ranked strategies; verified in browser at :5174
/goal status`,
    antiPatterns: ["Open-ended 'keep improving the app' goals"],
    pairsWith: ["/goal", "/check-work", "/plan"],
    addresses: ["no_criteria", "multi_goal", "vague_continuation"],
  },
  {
    id: "workflow-for-repeats",
    title: "Workflows for repeated pipelines",
    summary:
      "Encode review/research/verify fan-out as a workflow so you don’t re-prompt the orchestration every time.",
    when: "The same multi-agent pattern repeats (PR review, research, asset pipelines).",
    how: "`/create-workflow` → smoke-check → `/workflow <name> {args}` → watch `/workflows`.",
    example: `/create-workflow Diff review with adversarial verification
/workflow review-changes {"target":"origin/main...HEAD"}`,
    antiPatterns: ["Manually re-describing the same multi-step process each session"],
    pairsWith: ["/create-workflow", "/workflow", "/workflows", "/deep-research"],
    addresses: ["multi_goal", "unstructured"],
  },
  {
    id: "structured-lists",
    title: "Structure long prompts as lists",
    summary:
      "Numbered requirements reduce missed constraints in long messages.",
    when: "More than ~3 requirements or steps in one message.",
    how: "1) Goal 2) Scope 3) Constraints 4) Done when — or a short checklist.",
    example: `1) Add strategies pane to Overview
2) Rank by user issue signals
3) Don't remove cost metrics
4) Done when build + overview API include strategies`,
    antiPatterns: ["Wall of prose with buried constraints"],
    pairsWith: ["/plan"],
    addresses: ["unstructured", "very_long"],
  },
  {
    id: "restate-on-continue",
    title: "Re-state the goal when continuing",
    summary:
      'After compaction or "apply the fixes", restate remaining goal + verification — context may have dropped details.',
    when: "Follow-ups, rewinds, long sessions, or vague continuations.",
    how: "One sentence goal + done-when, even if the agent “should remember.”",
    example: `Continue: implement only the Strategies nav tab.
Done when: /strategies route shows all catalog items grouped by category.`,
    antiPatterns: ['"Apply the suggested fixes" / "do the above" alone'],
    pairsWith: ["/compact", "/resume", "/btw"],
    addresses: ["vague_continuation", "short", "very_short"],
  },
  {
    id: "verify-independently",
    title: "Close the loop with /check-work or /review",
    summary:
      "After a big implement, spend a turn on independent verification instead of more features.",
    when: "Large diffs, flaky areas, or pre-merge.",
    how: "`/check-work` for builds/tests; `/review` for maintainability/PR feedback.",
    example: `/check-work
/review`,
    antiPatterns: ["Shipping without any verification turn"],
    pairsWith: ["/check-work", "/review", "/goal"],
    addresses: ["no_criteria"],
  },
];

/**
 * Rank strategies using live prompt-quality issue frequencies.
 */
export function recommendStrategies(snapshot = {}) {
  const promptQuality = snapshot.promptQuality || {};
  const efficiency = snapshot.efficiency || {};
  const issues = promptQuality.issueBreakdown || [];
  const issueWeight = new Map(issues.map((i) => [i.id, i.pct || i.count || 0]));

  const scored = STRATEGY_CATALOG.map((s, index) => {
    let score = 10 + (STRATEGY_CATALOG.length - index); // slight base order preference
    const whyNow = [];

    for (const issueId of s.addresses || []) {
      const w = issueWeight.get(issueId) || 0;
      if (w > 0) {
        score += w * 1.5;
        const label = issues.find((i) => i.id === issueId)?.label || issueId;
        whyNow.push(`Addresses your issue: ${label} (~${w}% of prompts)`);
      }
    }

    // Efficiency signals
    if ((efficiency.costPerTurn || 0) >= 0.15 && s.id === "session-hygiene") {
      score += 20;
      whyNow.push(
        `High est. cost/turn (~$${Number(efficiency.costPerTurn).toFixed(2)})`
      );
    }
    if ((efficiency.toolsPerTurn || 0) >= 20 && s.id === "one-outcome-per-turn") {
      score += 15;
      whyNow.push("High tools/turn — tighter outcomes reduce thrash");
    }
    if ((efficiency.contextUtilizationPct || 0) >= 50 && s.id === "session-hygiene") {
      score += 12;
      whyNow.push(`Context ~${efficiency.contextUtilizationPct}%`);
    }
    if ((promptQuality.avgScore || 100) < 55 && s.id === "goal-scope-constraints-done") {
      score += 18;
      whyNow.push(`Prompt quality ${promptQuality.avgScore}/100 — use the core template`);
    }

    if (whyNow.length === 0) {
      whyNow.push("Core Grok Build best practice");
    }

    return {
      ...s,
      priority: Math.round(score),
      whyNow: whyNow.slice(0, 3),
    };
  }).sort((a, b) => b.priority - a.priority);

  // Assign display ranks 1..n after sort
  const ranked = scored.map((s, i) => ({ ...s, rank: i + 1 }));

  return {
    generatedAt: new Date().toISOString(),
    title: "Top prompt strategies for Grok Build",
    summary:
      "Practical prompting patterns that improve agent yield, lower thrash/cost, and raise prompt-quality scores.",
    top: ranked.slice(0, 6),
    all: ranked,
    count: ranked.length,
    signals: {
      promptScore: promptQuality.avgScore ?? null,
      topIssues: issues.slice(0, 5).map((i) => ({
        id: i.id,
        label: i.label,
        pct: i.pct,
      })),
      costPerTurn: efficiency.costPerTurn ?? null,
      toolsPerTurn: efficiency.toolsPerTurn ?? null,
      contextUtilizationPct: efficiency.contextUtilizationPct ?? null,
    },
  };
}
