import fs from "fs";
import path from "path";

/** sessionDir -> { mtimeMs, analysis } */
const promptCache = new Map();

function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text" && part.text) return part.text;
        return "";
      })
      .join("\n");
  }
  return "";
}

/**
 * Extract driving user prompts from chat_history.jsonl.
 * Prefers <user_query> blocks; skips system noise and synthetic continuations.
 */
export function extractUserQueries(sessionDir, { maxBytes = 1_500_000, maxQueries = 40 } = {}) {
  const historyPath = path.join(sessionDir, "chat_history.jsonl");
  if (!fs.existsSync(historyPath)) return [];

  let raw = "";
  try {
    const fd = fs.openSync(historyPath, "r");
    try {
      const buf = Buffer.alloc(maxBytes);
      const n = fs.readSync(fd, buf, 0, maxBytes, 0);
      raw = buf.slice(0, n).toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }

  const queries = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type !== "user") continue;
    if (obj.synthetic_reason) continue;

    const text = extractTextContent(obj.content);
    if (!text) continue;

    // Primary: user_query tags
    const tagRe = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/gi;
    let m;
    let found = false;
    while ((m = tagRe.exec(text)) !== null) {
      const q = cleanQuery(m[1]);
      if (q && isRealUserQuery(q)) {
        queries.push(q);
        found = true;
      }
    }
    if (found) {
      if (queries.length >= maxQueries) break;
      continue;
    }

    // Fallback: short plain user messages without system wrappers
    if (
      !text.includes("<system-reminder>") &&
      !text.includes("<user_info>") &&
      !text.includes("skills are available") &&
      text.length < 4000
    ) {
      const q = cleanQuery(text);
      if (q && isRealUserQuery(q) && q.length >= 8) {
        queries.push(q);
      }
    }
    if (queries.length >= maxQueries) break;
  }

  return queries;
}

function cleanQuery(q) {
  return String(q || "")
    .replace(/\r\n/g, "\n")
    .replace(/\[Image #\d+\]/gi, "[image]")
    .trim();
}

function isRealUserQuery(q) {
  if (!q || q.length < 2) return false;
  // Filter system prompt fragments accidentally captured
  if (q.includes("<action_safety>") || q.includes("<executing_actions_with_care>")) return false;
  if (q.includes("You are Grok") && q.length > 500) return false;
  if (q.startsWith("tag.") && q.includes("Weigh each action")) return false;
  if (q.includes("Available Skills") && q.includes("Use when:")) return false;
  return true;
}

const VAGUE = [
  "fix",
  "improve",
  "better",
  "terrible",
  "broken",
  "something",
  "stuff",
  "help",
  "please",
  "update",
  "change",
  "make it",
  "looks bad",
  "doesn't work",
  "not working",
  "weird",
  "issue",
  "bug",
];

const STRUCTURE_HINTS =
  /(?:^|\n)\s*(?:\d+[.)]\s+|[-*]\s+|step\s+\d+|first[,:]|second[,:]|then[,:]|finally[,:])/i;
const CRITERIA_HINTS =
  /\b(should|must|need to|needs to|verify|test|assert|done when|acceptance|expected|pass(?:es|ing)?|requirements?)\b/i;
const CONSTRAINT_HINTS =
  /\b(don't|do not|without|only|must not|never|avoid|keep|preserve|no\s+\w+)/i;
const PATH_HINTS =
  /(?:[./][\w.-]+\.\w{1,8}|src\/|app\/|lib\/|components\/|Assets\/|scripts\/|\.tsx?\b|\.jsx?\b|\.py\b|\.cs\b|\.godot\b)/i;
const TECH_HINTS =
  /\b(react|unity|godot|three\.?js|node|api|css|html|typescript|python|docker|sql|vite|express|tailwind|hdrp|shader)\b/i;
const METRIC_HINTS =
  /\b\d+(?:\.\d+)?%|\b\d+\s*(?:ms|s|px|mb|gb|fps|lines?|files?|users?)\b/i;
const CONTINUATION =
  /^(?:apply|do|use)\s+(?:the\s+)?(?:suggested|above|those|these)\s+(?:fixes|changes|edits)/i;
const IMAGE_ONLY = /^\[image\]$/i;

/**
 * Score a single driving prompt 0–100 with reasons and improvement tips.
 */
export function scorePrompt(query) {
  const q = cleanQuery(query);
  const lower = q.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const len = q.length;

  let score = 45;
  const strengths = [];
  const issues = [];
  const improvements = [];

  // Length band
  if (len < 12) {
    score -= 25;
    issues.push("very_short");
    improvements.push("Write at least one full sentence describing the goal and expected result.");
  } else if (len < 40) {
    score -= 10;
    issues.push("short");
    improvements.push("Add a bit more context: what to change, where, and how you'll know it worked.");
  } else if (len <= 600) {
    score += 12;
    strengths.push("good_length");
  } else if (len <= 1500) {
    score += 6;
    strengths.push("detailed");
  } else {
    score -= 6;
    issues.push("very_long");
    improvements.push("Split mega-prompts into 2–4 sequential tasks so the agent can finish and verify each.");
  }

  // Structure
  if (STRUCTURE_HINTS.test(q)) {
    score += 12;
    strengths.push("structured");
  } else if (words.length > 40) {
    issues.push("unstructured");
    improvements.push("Use a short numbered list (1–2–3) for steps or requirements.");
  }

  // Acceptance criteria
  if (CRITERIA_HINTS.test(q)) {
    score += 10;
    strengths.push("has_criteria");
  } else {
    issues.push("no_criteria");
    improvements.push('Add success criteria, e.g. "done when X works and Y test/command passes".');
  }

  // Constraints
  if (CONSTRAINT_HINTS.test(q)) {
    score += 8;
    strengths.push("has_constraints");
  } else if (words.length > 15) {
    improvements.push("State constraints (files to avoid, behavior to preserve, style limits).");
  }

  // Paths / artifacts
  if (PATH_HINTS.test(q)) {
    score += 10;
    strengths.push("path_specific");
  } else if (words.length > 12 && !IMAGE_ONLY.test(q)) {
    issues.push("no_paths");
    improvements.push("Name the file, folder, or component when you know it (reduces search thrash).");
  }

  // Tech specificity
  if (TECH_HINTS.test(q)) {
    score += 6;
    strengths.push("tech_specific");
  }

  // Metrics / concrete numbers
  if (METRIC_HINTS.test(q)) {
    score += 6;
    strengths.push("measurable");
  }

  // Vague language density
  let vagueHits = 0;
  for (const v of VAGUE) {
    if (lower.includes(v)) vagueHits += 1;
  }
  if (vagueHits >= 3) {
    score -= 14;
    issues.push("vague_language");
    improvements.push('Replace vague words ("fix", "better", "terrible") with specific symptoms and targets.');
  } else if (vagueHits === 2) {
    score -= 6;
    issues.push("somewhat_vague");
  }

  // Image-only / apply-above
  if (IMAGE_ONLY.test(q) || (q.includes("[image]") && words.length < 6)) {
    score -= 18;
    issues.push("image_only");
    improvements.push("Describe what is wrong in the screenshot (expected vs actual) in text.");
  }
  if (CONTINUATION.test(q) && words.length < 12) {
    score -= 10;
    issues.push("vague_continuation");
    improvements.push('Instead of "apply the fixes", restate the remaining goal and verification step.');
  }

  // Multi-goal jam (many "and" clauses with few structure markers)
  const andCount = (lower.match(/\band\b/g) || []).length;
  if (andCount >= 4 && !STRUCTURE_HINTS.test(q) && len > 80) {
    score -= 8;
    issues.push("multi_goal");
    improvements.push("Separate independent goals into sequential prompts; one primary outcome per turn.");
  }

  // Single clear imperative is ok for short follow-ups
  if (words.length >= 8 && words.length <= 40 && vagueHits === 0 && PATH_HINTS.test(q)) {
    score += 5;
    strengths.push("focused");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let grade = "C";
  if (score >= 85) grade = "A";
  else if (score >= 70) grade = "B";
  else if (score >= 55) grade = "C";
  else if (score >= 40) grade = "D";
  else grade = "F";

  // Deduplicate improvements, cap
  const seen = new Set();
  const uniqImprovements = [];
  for (const tip of improvements) {
    if (seen.has(tip)) continue;
    seen.add(tip);
    uniqImprovements.push(tip);
  }

  return {
    score,
    grade,
    length: len,
    wordCount: words.length,
    strengths,
    issues,
    improvements: uniqImprovements.slice(0, 4),
    preview: q.length > 160 ? `${q.slice(0, 157)}…` : q,
  };
}

export function analyzeSessionPrompts(sessionDir) {
  const historyPath = path.join(sessionDir, "chat_history.jsonl");
  let mtimeMs = 0;
  try {
    if (fs.existsSync(historyPath)) mtimeMs = fs.statSync(historyPath).mtimeMs;
  } catch {
    mtimeMs = 0;
  }
  const cached = promptCache.get(sessionDir);
  if (cached && cached.mtimeMs === mtimeMs) return cached.analysis;

  const queries = extractUserQueries(sessionDir);
  const scored = queries.map((q) => ({ query: q, ...scorePrompt(q) }));

  const avg =
    scored.length > 0
      ? Math.round(scored.reduce((n, s) => n + s.score, 0) / scored.length)
      : null;

  let grade = null;
  if (avg != null) {
    if (avg >= 85) grade = "A";
    else if (avg >= 70) grade = "B";
    else if (avg >= 55) grade = "C";
    else if (avg >= 40) grade = "D";
    else grade = "F";
  }

  const issueCounts = {};
  const improvementCounts = {};
  for (const s of scored) {
    for (const i of s.issues) issueCounts[i] = (issueCounts[i] || 0) + 1;
    for (const tip of s.improvements) {
      improvementCounts[tip] = (improvementCounts[tip] || 0) + 1;
    }
  }

  const analysis = {
    promptCount: scored.length,
    avgScore: avg,
    grade,
    issueCounts,
    improvementCounts,
    // Keep a few exemplars (worst + best) for the UI
    samples: [
      ...scored
        .slice()
        .sort((a, b) => a.score - b.score)
        .slice(0, 2),
      ...scored
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, 1),
    ]
      .filter((s, idx, arr) => arr.findIndex((x) => x.preview === s.preview) === idx)
      .map(({ query, ...rest }) => rest),
  };

  promptCache.set(sessionDir, { mtimeMs, analysis });
  return analysis;
}

const ISSUE_LABELS = {
  very_short: "Prompts are extremely short",
  short: "Prompts lack detail",
  very_long: "Prompts try to do too much at once",
  unstructured: "Long prompts without structure",
  no_criteria: "Missing success / verification criteria",
  no_paths: "Missing file or component targets",
  vague_language: "Heavy use of vague language",
  somewhat_vague: "Somewhat vague wording",
  image_only: "Image-only prompts without description",
  vague_continuation: "Vague “apply the fixes” follow-ups",
  multi_goal: "Multiple goals packed into one prompt",
};

/** Rich guidance for each issue type — shown in UI tooltips / popups */
const ISSUE_GUIDANCE = {
  very_short: {
    why: "One- or two-word prompts force the agent to guess goals, so it searches broadly and burns tools/context.",
    how: "Write at least one full sentence: what to change, where, and what “done” looks like.",
    example:
      'Bad: "fix"\nGood: "Fix the null crash in src/player/GroveWalker.cs when equipping a torch; done when Play Mode equips without errors."',
  },
  short: {
    why: "Brief prompts omit scope and success checks, so the agent explores more than necessary.",
    how: "Add target files/components and one verification step (command, test, or UI check).",
    example:
      'Bad: "make the UI better"\nGood: "Tighten spacing on the HUD score panel in GameHUD.gd so labels don’t clip; verify in the main scene."',
  },
  very_long: {
    why: "Mega-prompts mix many goals; mid-task context fills up and earlier goals get dropped or half-done.",
    how: "Split into 2–4 sequential prompts, each with one primary outcome and its own done-when.",
    example:
      "Instead of one paragraph with 6 features, send: (1) landmarks, (2) walk speed, (3) fishing animation — one message each.",
  },
  unstructured: {
    why: "Long prose without structure hides requirements; the agent may miss constraints buried mid-paragraph.",
    how: "Use a short numbered list: Goal, Scope, Constraints, Done when.",
    example:
      "1) Goal: …\n2) Scope: files …\n3) Constraints: don’t touch …\n4) Done when: npm test / Play Mode check …",
  },
  no_criteria: {
    why: "Without success criteria the agent can’t self-check, so it stops early or over-edits without proof.",
    how: 'Add “done when …” with a concrete check: test command, scene behavior, or visible UI state.',
    example:
      'Done when: `npm run build` succeeds and the Projects page shows leaf names only on the bar chart.',
  },
  no_paths: {
    why: "Missing paths force directory walks and greps, which inflate tool count and context tokens.",
    how: "Name the file, folder, or component when you know it (even approximately).",
    example:
      'Prefer: "Update client/src/App.jsx Overview bar labels" over "fix the dashboard labels".',
  },
  vague_language: {
    why: 'Words like "fix", "better", or "terrible" don’t define the target state, so the agent invents one.',
    how: "Describe expected vs actual behavior, symptoms, and the desired end state.",
    example:
      'Bad: "The game looks terrible."\nGood: "Ground texture is stretched on the main terrain mesh; use a tiled material and show a before/after in Play Mode."',
  },
  somewhat_vague: {
    why: "Mildly vague wording still leaves room for wrong assumptions about scope or quality bar.",
    how: "Replace adjectives with measurable outcomes (sizes, counts, error messages, screenshots + text).",
    example:
      'Instead of "improve performance", say "keep scene load under 2s and reduce draw calls on the village LOD".',
  },
  image_only: {
    why: "Screenshots without text leave layout/intent ambiguous; the agent may fix the wrong UI region.",
    how: "Keep the image, but add 1–2 sentences: what is wrong, where, and what correct looks like.",
    example:
      "[image] The tooltip is clipped under the sticky top bar; it should render fully above the bar chart row.",
  },
  vague_continuation: {
    why: '"Apply the fixes" depends on prior context that may already be compacted away.',
    how: "Restate the remaining goal and verification even when continuing a thread.",
    example:
      'Instead of "apply suggested fixes", say "Apply the tooltip z-index fix in styles.css and App.jsx; done when hover tooltips are fully visible."',
  },
  multi_goal: {
    why: "Multiple independent goals in one prompt compete for attention and make partial delivery likely.",
    how: "Pick one primary outcome per turn; queue the rest as follow-ups.",
    example:
      "Session 1: efficiency metrics only. Session 2: prompt quality tips. Don’t combine both in one mega ask.",
  },
};

const IMPROVEMENT_GUIDANCE = {
  "Write at least one full sentence describing the goal and expected result.": {
    why: "Ultra-short prompts leave goal and success undefined.",
    how: "State the change and how you will know it worked.",
    example: "Add X to Y; done when Z is true.",
  },
  "Add a bit more context: what to change, where, and how you'll know it worked.": {
    why: "Medium-short prompts still omit location or verification.",
    how: "Name the area of the app and one check.",
    example: "In the Projects table, show cloud badges; verify GitHub-linked folders show a Cloud chip.",
  },
  "Split mega-prompts into 2–4 sequential tasks so the agent can finish and verify each.": {
    why: "Large multi-feature prompts raise failure and context cost.",
    how: "Ship one vertical slice per message.",
    example: "Prompt A: API fields. Prompt B: UI. Prompt C: polish.",
  },
  "Use a short numbered list (1–2–3) for steps or requirements.": {
    why: "Structure reduces missed requirements.",
    how: "Number requirements or steps explicitly.",
    example: "1) … 2) … 3) …",
  },
  'Add success criteria, e.g. "done when X works and Y test/command passes".': {
    why: "Criteria let the agent stop at “correct,” not “maybe.”",
    how: "End with Done when + command or visible check.",
    example: "Done when curl /api/overview returns promptQuality.feedbackItems.",
  },
  "State constraints (files to avoid, behavior to preserve, style limits).": {
    why: "Constraints prevent drive-by refactors that waste tokens.",
    how: "Say what not to touch.",
    example: "Don’t rename public API routes; only change the Overview panel.",
  },
  "Name the file, folder, or component when you know it (reduces search thrash).": {
    why: "Paths cut exploration tools dramatically.",
    how: "Paste a relative path or symbol name.",
    example: "server/prompts.js aggregatePromptQuality",
  },
  'Replace vague words ("fix", "better", "terrible") with specific symptoms and targets.': {
    why: "Vague words are not actionable acceptance criteria.",
    how: "Describe symptoms and desired state.",
    example: "Button is unclickable below 400px width; make hit target 44px.",
  },
  "Describe what is wrong in the screenshot (expected vs actual) in text.": {
    why: "Images alone are under-specified.",
    how: "Caption expected vs actual.",
    example: "Expected: full tooltip. Actual: top half cut off by header.",
  },
  'Instead of "apply the fixes", restate the remaining goal and verification step.': {
    why: "Continuations fail after compaction without restated goals.",
    how: "Re-state goal + done-when every turn.",
    example: "Implement the remaining FixedTip portal; done when tooltips aren’t clipped.",
  },
  "Separate independent goals into sequential prompts; one primary outcome per turn.": {
    why: "One outcome per turn improves completion rate and efficiency.",
    how: "Defer secondary goals explicitly.",
    example: "Only do cloud badges now; we’ll do efficiency tips next.",
  },
  "Template to try: Goal → Scope (files) → Constraints → Done-when (test/command/UI check).": {
    why: "This template covers the four signals the scorer rewards most.",
    how: "Paste the template and fill each line.",
    example:
      "Goal: …\nScope: …\nConstraints: …\nDone when: …",
  },
  "Keep using concrete targets and verification; your stronger prompts already show good yield patterns.": {
    why: "Your higher-scoring prompts already correlate with better agent yield.",
    how: "Reuse the same structure on weaker threads.",
    example: "Copy a strong prompt’s shape and swap in the new goal/scope.",
  },
  "No user prompts found yet — once you run sessions, quality scoring will appear here.": {
    why: "Scoring needs at least one real user_query in chat history.",
    how: "Run a Grok session with a normal request, then refresh this dashboard.",
    example: "Ask Grok to implement a small, scoped change and reopen Overview.",
  },
};

function guidanceForIssue(id) {
  return (
    ISSUE_GUIDANCE[id] || {
      why: "This pattern tends to lower prompt scores and agent efficiency.",
      how: "Add goal, scope, constraints, and a done-when check.",
      example: "Goal: … Scope: … Done when: …",
    }
  );
}

function guidanceForImprovement(tip) {
  return (
    IMPROVEMENT_GUIDANCE[tip] || {
      why: "Acting on this tip usually raises prompt scores and reduces tool thrash.",
      how: tip,
      example: "Goal → Scope → Constraints → Done when",
    }
  );
}

function guidanceForOverall(grade, avgScore, promptCount, sessionCount) {
  return {
    why: `Your average driving-prompt score is ${avgScore}/100 (${grade}) over ${promptCount} prompts in ${sessionCount} sessions. This is a local heuristic, not an LLM judge.`,
    how: "Prioritize the top issue chips below — fixing the most common gaps moves the average fastest.",
    example:
      "Aim for B (≥70): each prompt names a path, states constraints, and ends with a done-when check.",
  };
}

/**
 * Aggregate prompt quality across sessions → overall rating + top improvements.
 */
export function aggregatePromptQuality(sessionAnalyses) {
  const list = sessionAnalyses.filter((a) => a && a.promptCount > 0);
  if (list.length === 0) {
    const emptyTip =
      "No user prompts found yet — once you run sessions, quality scoring will appear here.";
    const g = guidanceForImprovement(emptyTip);
    return {
      avgScore: null,
      grade: null,
      promptCount: 0,
      sessionCount: 0,
      issueBreakdown: [],
      topImprovements: [{ tip: emptyTip, count: 0, ...g }],
      feedback: [emptyTip],
      feedbackItems: [
        {
          id: "empty",
          kind: "summary",
          text: emptyTip,
          title: "No prompts yet",
          why: g.why,
          how: g.how,
          example: g.example,
        },
      ],
      strengthsSummary: [],
      samples: { best: [], needsWork: [] },
    };
  }

  let promptCount = 0;
  let scoreSum = 0;
  const issueCounts = {};
  const improvementCounts = {};
  const samples = [];

  for (const a of list) {
    promptCount += a.promptCount;
    scoreSum += (a.avgScore || 0) * a.promptCount;
    for (const [k, v] of Object.entries(a.issueCounts || {})) {
      issueCounts[k] = (issueCounts[k] || 0) + v;
    }
    for (const [k, v] of Object.entries(a.improvementCounts || {})) {
      improvementCounts[k] = (improvementCounts[k] || 0) + v;
    }
    for (const s of a.samples || []) samples.push(s);
  }

  const avgScore = Math.round(scoreSum / Math.max(promptCount, 1));
  let grade = "C";
  if (avgScore >= 85) grade = "A";
  else if (avgScore >= 70) grade = "B";
  else if (avgScore >= 55) grade = "C";
  else if (avgScore >= 40) grade = "D";
  else grade = "F";

  const issueBreakdown = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, count]) => {
      const g = guidanceForIssue(id);
      return {
        id,
        label: ISSUE_LABELS[id] || id,
        count,
        pct: Math.round((count / promptCount) * 100),
        why: g.why,
        how: g.how,
        example: g.example,
      };
    });

  const topImprovements = Object.entries(improvementCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tip, count]) => {
      const g = guidanceForImprovement(tip);
      return { tip, count, why: g.why, how: g.how, example: g.example };
    });

  // Structured feedback items for UI tooltips / popups
  const feedbackItems = [];
  const overallG = guidanceForOverall(grade, avgScore, promptCount, list.length);
  feedbackItems.push({
    id: "overall",
    kind: "summary",
    text: `Overall driving-prompt quality: **${grade}** (${avgScore}/100) across ${promptCount} prompts in ${list.length} sessions.`,
    title: "Overall prompt quality",
    why: overallG.why,
    how: overallG.how,
    example: overallG.example,
  });

  for (const issue of issueBreakdown.slice(0, 4)) {
    feedbackItems.push({
      id: `issue-${issue.id}`,
      kind: "issue",
      issueId: issue.id,
      text: `${issue.label} appeared in ~${issue.pct}% of prompts (${issue.count}×) — address this first.`,
      title: issue.label,
      why: issue.why,
      how: issue.how,
      example: issue.example,
      stat: `${issue.pct}% · ${issue.count}×`,
    });
  }

  for (const imp of topImprovements.slice(0, 4)) {
    feedbackItems.push({
      id: `tip-${imp.tip.slice(0, 40)}`,
      kind: "improvement",
      text: imp.tip,
      title: "Recommended improvement",
      why: imp.why,
      how: imp.how,
      example: imp.example,
      stat: imp.count > 1 ? `seen ${imp.count}×` : null,
    });
  }

  if (avgScore >= 70) {
    const tip =
      "Keep using concrete targets and verification; your stronger prompts already show good yield patterns.";
    const g = guidanceForImprovement(tip);
    feedbackItems.push({
      id: "keep-going",
      kind: "strength",
      text: tip,
      title: "What’s working",
      why: g.why,
      how: g.how,
      example: g.example,
    });
  } else {
    const tip =
      "Template to try: Goal → Scope (files) → Constraints → Done-when (test/command/UI check).";
    const g = guidanceForImprovement(tip);
    feedbackItems.push({
      id: "template",
      kind: "template",
      text: tip,
      title: "Prompt template",
      why: g.why,
      how: g.how,
      example: g.example,
    });
  }

  // Back-compat plain strings
  const feedback = feedbackItems.map((f) => f.text);

  const bestSamples = samples
    .slice()
    .sort((a, b) => b.score - a.score)
    .filter((s, i, arr) => arr.findIndex((x) => x.preview === s.preview) === i)
    .slice(0, 2)
    .map((s) => enrichSampleGuidance(s, "best"));
  const worstSamples = samples
    .slice()
    .sort((a, b) => a.score - b.score)
    .filter((s, i, arr) => arr.findIndex((x) => x.preview === s.preview) === i)
    .slice(0, 3)
    .map((s) => enrichSampleGuidance(s, "needsWork"));

  return {
    avgScore,
    grade,
    promptCount,
    sessionCount: list.length,
    issueBreakdown,
    topImprovements,
    feedback,
    feedbackItems,
    samples: { best: bestSamples, needsWork: worstSamples },
  };
}

function enrichSampleGuidance(sample, bucket) {
  const primaryIssue = (sample.issues && sample.issues[0]) || null;
  const g = primaryIssue
    ? guidanceForIssue(primaryIssue)
    : {
        why:
          bucket === "best"
            ? "This prompt scored well on length, structure, paths, and/or criteria."
            : "This prompt lost points on vagueness, length, or missing scope/criteria.",
        how:
          bucket === "best"
            ? "Reuse this shape: clear goal + concrete targets + success check."
            : sample.improvements?.[0] ||
              "Add goal, scope, constraints, and done-when.",
        example:
          bucket === "best"
            ? sample.preview
            : sample.improvements?.[0] ||
              "Goal: … Scope: … Done when: …",
      };

  return {
    ...sample,
    guidance: {
      title:
        bucket === "best"
          ? "Why this prompt scores higher"
          : primaryIssue
            ? ISSUE_LABELS[primaryIssue] || "Why this prompt scores lower"
            : "Why this prompt scores lower",
      why: g.why,
      how: g.how,
      example: g.example,
      issues: sample.issues || [],
      strengths: sample.strengths || [],
    },
  };
}
