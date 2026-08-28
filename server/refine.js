/**
 * Refine free-form user text into Grok Build–ready prompts and/or slash commands.
 * Local heuristics only (no API key required).
 */

import { scorePrompt } from "./prompts.js";

const PATH_RE =
  /(?:[\w./-]+\.(?:tsx?|jsx?|mjs|cjs|py|cs|gd|godot|json|md|css|scss|html|rhai|toml|yml|yaml|rs|go|java|kt|swift)|(?:src|app|lib|server|client|components|Assets|scripts|packages|tests)\/[\w./-]+)/g;

const INTENT_RULES = [
  {
    id: "plan",
    command: "/plan",
    weight: 0,
    test: (t) =>
      /\b(plan|design|architect|how should|approach|trade-?offs?|spec)\b/i.test(t) &&
      !/\b(implement|code|fix|build now)\b/i.test(t),
    boost: 40,
    label: "Plan first",
  },
  {
    id: "goal",
    command: "/goal",
    weight: 0,
    test: (t) =>
      /\b(keep going|until|multi-?step|end.?to.?end|fully|complete the|finish all|migrate|greenfield)\b/i.test(
        t
      ) || (t.length > 400 && /\band\b/gi.test(t) && (t.match(/\band\b/gi) || []).length >= 4),
    boost: 35,
    label: "Autonomous goal",
  },
  {
    id: "deep-research",
    command: "/deep-research",
    weight: 0,
    test: (t) =>
      /\b(research|compare|trade-?offs?|survey|what are the options|pros and cons|benchmark)\b/i.test(
        t
      ) && !/\b(implement|fix|code)\b/i.test(t),
    boost: 45,
    label: "Background research",
  },
  {
    id: "review",
    command: "/review",
    weight: 0,
    test: (t) =>
      /\b(review|pr review|code review|look at (the )?(diff|changes|pr))\b/i.test(t),
    boost: 42,
    label: "Code review skill",
  },
  {
    id: "check-work",
    command: "/check-work",
    weight: 0,
    test: (t) =>
      /\b(verify|validate|check (my |the )?work|run tests|self-?verify|did it work)\b/i.test(
        t
      ),
    boost: 40,
    label: "Verify changes",
  },
  {
    id: "workflow",
    command: "/create-workflow",
    weight: 0,
    test: (t) =>
      /\b(workflow|fan-?out|multi-?agent|pipeline|orchestrat)\b/i.test(t),
    boost: 40,
    label: "Create workflow",
  },
  {
    id: "compact",
    command: "/compact",
    weight: 0,
    test: (t) => /\b(compact|context (is )?(full|high|full)|too long conversation)\b/i.test(t),
    boost: 50,
    label: "Free context",
  },
  {
    id: "imagine",
    command: "/imagine",
    weight: 0,
    test: (t) =>
      /\b(generate (an? )?image|draw|illustration|sprite|mockup art)\b/i.test(t) &&
      !/\bvideo\b/i.test(t),
    boost: 48,
    label: "Image generation",
  },
  {
    id: "imagine-video",
    command: "/imagine-video",
    weight: 0,
    test: (t) => /\b(generate (a )?video|animate|animation|clip)\b/i.test(t),
    boost: 48,
    label: "Video generation",
  },
  {
    id: "implement",
    command: null, // plain prompt
    weight: 10,
    test: () => true,
    boost: 10,
    label: "Implement prompt",
  },
];

function extractPaths(text) {
  const found = text.match(PATH_RE) || [];
  return [...new Set(found)].slice(0, 12);
}

function extractConstraints(text) {
  const lines = [];
  const patterns = [
    /\b(?:don't|do not|must not|never|avoid|without|keep|preserve|only)\b[^.!?\n]{5,120}/gi,
  ];
  for (const re of patterns) {
    const m = text.match(re) || [];
    for (const x of m) lines.push(x.trim());
  }
  return [...new Set(lines)].slice(0, 6);
}

function extractDoneWhen(text) {
  const m =
    text.match(
      /\b(?:done when|verify(?: that)?|should (?:pass|succeed|show|work)|expect(?:ed)?(?: that)?|acceptance)[:\s]+([^.!?\n]{5,160})/i
    ) ||
    text.match(/\b(npm (?:run )?\w+|pytest|cargo test|go test|curl \S+)[^.!?\n]*/i);
  if (m) return (m[1] || m[0]).trim();
  return null;
}

function splitGoals(text) {
  // Split on numbered lists or "and also"
  const numbered = text.match(/(?:^|\n)\s*\d+[.)]\s*[^\n]+/g);
  if (numbered && numbered.length >= 2) {
    return numbered.map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim());
  }
  const parts = text
    .split(/\band also\b|\bthen\b|\badditionally\b|;/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
  if (parts.length >= 2 && parts.length <= 6) return parts;
  return [text.trim()];
}

function cleanGoalLine(text) {
  let t = text
    .replace(/^\/\w+(?:\s+)?/, "") // strip leading slash command if pasted
    .replace(/\s+/g, " ")
    .trim();
  // Prefer first sentence as goal core
  const sentence = t.split(/(?<=[.!?])\s+/)[0] || t;
  if (sentence.length > 200) return sentence.slice(0, 197) + "…";
  return sentence;
}

function detectIntent(text) {
  const scored = INTENT_RULES.map((r) => ({
    ...r,
    score: r.test(text) ? r.boost + r.weight : r.weight,
  })).sort((a, b) => b.score - a.score);
  return scored[0];
}

function buildStructuredPrompt(raw, { paths, constraints, doneWhen, goals }) {
  const primary = goals[0] || raw;
  const goal = cleanGoalLine(primary);

  const scope =
    paths.length > 0
      ? paths.join(", ")
      : "<files / folders / components — add if known>";

  const constraintLines =
    constraints.length > 0
      ? constraints.map((c) => `- ${c}`).join("\n")
      : "- <what not to change — add if known>";

  const verify =
    doneWhen ||
    "<command, test, or UI check — e.g. npm run build / curl API / browser check>";

  const deferred =
    goals.length > 1
      ? `\n\nDeferred (do not do now):\n${goals
          .slice(1)
          .map((g, i) => `${i + 1}. ${cleanGoalLine(g)}`)
          .join("\n")}`
      : "";

  return `Goal: ${goal}
Scope: ${scope}
Constraints:
${constraintLines}
Done when: ${verify}${deferred}`;
}

function buildCommandInvocation(intent, raw, structured) {
  const text = raw.trim();
  switch (intent.id) {
    case "plan":
      return {
        command: "/plan",
        invocation: `/plan ${cleanGoalLine(text)}`,
        body: structured,
        howToUse:
          "Run the slash command first (or paste `/plan …`). After the plan looks right, send the structured body as the implement prompt.",
      };
    case "goal":
      return {
        command: "/goal",
        invocation: `/goal ${cleanGoalLine(text)}`,
        body: structured,
        howToUse:
          "Paste the `/goal` line to start autonomous multi-round work. Optionally add `--budget <tokens>`. Use `/goal status` to check progress.",
      };
    case "deep-research":
      return {
        command: "/deep-research",
        invocation: `/deep-research ${cleanGoalLine(text)}`,
        body: null,
        howToUse:
          "Paste the command as-is. Progress appears in `/workflows`; the report lands in chat when ready.",
      };
    case "review":
      return {
        command: "/review",
        invocation: "/review",
        body: structured,
        howToUse:
          "Run `/review` (skill). If you need a focus area, send the structured body as the first message after invoking review.",
      };
    case "check-work":
      return {
        command: "/check-work",
        invocation: "/check-work",
        body: structured,
        howToUse:
          "Run `/check-work` for independent verification. Include Done-when checks in the body if you want specific tests.",
      };
    case "workflow":
      return {
        command: "/create-workflow",
        invocation: "/create-workflow",
        body: structured,
        howToUse:
          "Run `/create-workflow`, then describe the pipeline with the structured body (phases, fan-out, verification).",
      };
    case "compact": {
      const keep = text.replace(/.*\bkeep\b[:\s]*/i, "").slice(0, 120);
      const inv =
        keep && keep.length > 10 && keep !== text
          ? `/compact keep ${keep}`
          : "/compact keep the current task goals, file paths, and decisions";
      return {
        command: "/compact",
        invocation: inv,
        body: null,
        howToUse: "Run to free context. Prefer a keep-note so critical details survive.",
      };
    }
    case "imagine":
      return {
        command: "/imagine",
        invocation: `/imagine ${text.replace(/^\/imagine\s*/i, "").trim()}`,
        body: null,
        howToUse: "Paste into Grok Build as a slash command.",
      };
    case "imagine-video":
      return {
        command: "/imagine-video",
        invocation: `/imagine-video ${text.replace(/^\/imagine-video\s*/i, "").trim()}`,
        body: null,
        howToUse: "Paste into Grok Build as a slash command.",
      };
    default:
      return {
        command: null,
        invocation: null,
        body: structured,
        howToUse:
          "Paste the refined prompt into Grok Build as a normal user message (no slash required).",
      };
  }
}

/**
 * @param {string} input
 * @param {{ projectHint?: string }} [opts]
 */
export function refinePrompt(input, opts = {}) {
  const original = String(input || "").trim();
  if (!original) {
    return {
      error: "Enter a prompt to refine.",
      original: "",
      refined: null,
    };
  }

  const before = scorePrompt(original);
  const paths = extractPaths(original);
  if (opts.projectHint && !paths.length) {
    // soft hint only in guidance
  }
  const constraints = extractConstraints(original);
  const doneWhen = extractDoneWhen(original);
  const goals = splitGoals(original);
  const intent = detectIntent(original);

  const structured = buildStructuredPrompt(original, {
    paths,
    constraints,
    doneWhen,
    goals,
  });

  const cmd = buildCommandInvocation(intent, original, structured);
  const refinedText = cmd.invocation
    ? cmd.body
      ? `${cmd.invocation}\n\n${cmd.body}`
      : cmd.invocation
    : structured;

  const after = scorePrompt(cmd.body || refinedText.replace(/^\/\S+\s*/, ""));

  const changes = [];
  if (before.score < after.score) {
    changes.push(
      `Prompt quality score ${before.score} → ${after.score} (${before.grade} → ${after.grade})`
    );
  }
  if (paths.length) changes.push(`Detected ${paths.length} path/file reference(s) for Scope.`);
  else changes.push("No paths found — add Scope files when you know them.");
  if (doneWhen) changes.push("Preserved/extracted a Done-when style verification.");
  else changes.push("Added a Done-when placeholder — fill with a real check.");
  if (constraints.length) changes.push(`Extracted ${constraints.length} constraint phrase(s).`);
  else changes.push("Added Constraints placeholders — list what not to change.");
  if (goals.length > 1) {
    changes.push(
      `Split ${goals.length} goals — primary only; deferred the rest to avoid multi-goal thrash.`
    );
  }
  if (cmd.command) {
    changes.push(`Suggested slash command ${cmd.command} (${intent.label}).`);
  } else {
    changes.push("Formatted as a structured implement prompt (no slash command required).");
  }

  const tips = [
    ...(after.improvements || []).slice(0, 3),
    "Paste into Grok Build: slash commands go in the prompt box starting with `/`.",
    "Prefer one primary outcome per turn; use Deferred or a follow-up message for the rest.",
  ];

  const alternatives = [];
  if (intent.id === "implement" && original.length > 80) {
    alternatives.push({
      command: "/plan",
      invocation: `/plan ${cleanGoalLine(original)}`,
      why: "If architecture is unclear, plan first then implement the structured body.",
    });
  }
  if (intent.id !== "goal" && goals.length >= 3) {
    alternatives.push({
      command: "/goal",
      invocation: `/goal ${cleanGoalLine(original)}`,
      why: "Multiple outcomes — consider an autonomous goal with a token budget.",
    });
  }
  if (intent.id !== "check-work" && /implement|fix|add|build/i.test(original)) {
    alternatives.push({
      command: "/check-work",
      invocation: "/check-work",
      why: "After the agent implements, run independent verification.",
    });
  }

  return {
    original,
    intent: {
      id: intent.id,
      label: intent.label,
      command: cmd.command,
    },
    scores: {
      before: {
        score: before.score,
        grade: before.grade,
        issues: before.issues,
        strengths: before.strengths,
      },
      after: {
        score: after.score,
        grade: after.grade,
        issues: after.issues,
        strengths: after.strengths,
      },
    },
    refined: {
      /** Best single paste for Grok Build */
      full: refinedText,
      /** Slash line only, if any */
      command: cmd.invocation,
      /** Structured Goal/Scope body */
      body: cmd.body,
      howToUse: cmd.howToUse,
    },
    extracted: {
      paths,
      constraints,
      doneWhen,
      goalCount: goals.length,
      projectHint: opts.projectHint || null,
    },
    changes,
    tips: tips.slice(0, 6),
    alternatives,
  };
}
