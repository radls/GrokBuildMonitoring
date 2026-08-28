/**
 * Token / effort efficiency derived from Grok session signals.
 *
 * Note: contextTokensUsed is the last recorded context window size, not
 * lifetime billed tokens. We treat it as "context intensity" and pair it
 * with yield metrics (lines, tools, turns). Cost is estimated via pricing.js.
 */

import { estimateSessionCost } from "./pricing.js";

function safeDiv(n, d) {
  if (!d || !Number.isFinite(d) || d === 0) return 0;
  if (!Number.isFinite(n)) return 0;
  return n / d;
}

export function computeEfficiency(signals = {}, { modelId = null } = {}) {
  const turns = signals.turnCount || 0;
  const tools = signals.toolCallCount || 0;
  const tokens = signals.contextTokensUsed || 0;
  const lines = Math.max(0, signals.agentLinesAdded || 0);
  const linesRemoved = Math.max(0, signals.agentLinesRemoved || 0);
  const files = signals.totalFilesTouched || signals.agentFilesTouched || 0;
  const errors = (signals.errorCount || 0) + (signals.toolFailureCount || 0);
  const cancellations = signals.cancellationCount || 0;
  const duration = signals.sessionDurationSeconds || 0;
  const contextPct = signals.contextWindowUsage || 0;

  const cost = estimateSessionCost(signals, modelId || signals.primaryModelId);
  const estTokens = cost.totalTokensEst || 0;
  const costUsd = cost.estimatedCostUsd || 0;

  const linesPer1kTokens = safeDiv(lines, (estTokens || tokens) / 1000);
  const linesPerTurn = safeDiv(lines, turns);
  const linesPerToolCall = safeDiv(lines, tools);
  const toolsPerTurn = safeDiv(tools, turns);
  const tokensPerTurn = safeDiv(estTokens || tokens, turns);
  const filesPerTurn = safeDiv(files, turns);
  const netLinesPerTurn = safeDiv(lines - linesRemoved, turns);
  const errorRate = safeDiv(errors, Math.max(tools, 1));
  const cancelRate = safeDiv(cancellations, Math.max(turns, 1));
  const linesPerMinute = safeDiv(lines, duration / 60);
  const costPerTurn = safeDiv(costUsd, turns);
  const costPer1kLines = safeDiv(costUsd * 1000, lines);
  const linesPerDollar = safeDiv(lines, costUsd);
  const costPer1kEstTokens = safeDiv(costUsd * 1000, estTokens);

  // Composite 0–100: reward code yield, punish errors / empty thrash / huge context with little output
  let score = 50;
  // Yield: lines per turn
  if (turns > 0) {
    if (linesPerTurn >= 80) score += 18;
    else if (linesPerTurn >= 30) score += 12;
    else if (linesPerTurn >= 10) score += 6;
    else if (linesPerTurn < 1 && tools > 10) score -= 12;
  }
  // Tool efficiency: not too many tools per line of value
  if (tools > 0 && lines > 0) {
    if (linesPerToolCall >= 15) score += 12;
    else if (linesPerToolCall >= 5) score += 7;
    else if (linesPerToolCall < 1) score -= 8;
  } else if (tools > 20 && lines === 0) {
    score -= 15; // thrashing
  }
  // Context intensity vs yield
  if (tokens > 0 || estTokens > 0) {
    if (linesPer1kTokens >= 20) score += 10;
    else if (linesPer1kTokens >= 5) score += 5;
    else if (linesPer1kTokens < 0.5 && (estTokens || tokens) > 50_000) score -= 10;
  }
  if (contextPct >= 80) score -= 6; // near window limit often means waste / compaction risk
  else if (contextPct >= 50 && linesPerTurn < 5) score -= 4;

  // Cost efficiency: reward high lines per dollar
  if (costUsd > 0 && lines > 0) {
    if (linesPerDollar >= 5000) score += 8;
    else if (linesPerDollar >= 1000) score += 5;
    else if (linesPerDollar < 50 && costUsd > 0.5) score -= 6;
  } else if (costUsd > 1 && lines === 0) {
    score -= 10;
  }

  score -= Math.min(20, errorRate * 40);
  score -= Math.min(10, cancelRate * 25);

  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade = "C";
  if (score >= 85) grade = "A";
  else if (score >= 70) grade = "B";
  else if (score >= 55) grade = "C";
  else if (score >= 40) grade = "D";
  else grade = "F";

  return {
    score,
    grade,
    linesPer1kTokens: round(linesPer1kTokens, 2),
    linesPerTurn: round(linesPerTurn, 2),
    linesPerToolCall: round(linesPerToolCall, 2),
    toolsPerTurn: round(toolsPerTurn, 2),
    tokensPerTurn: round(tokensPerTurn, 0),
    filesPerTurn: round(filesPerTurn, 2),
    netLinesPerTurn: round(netLinesPerTurn, 2),
    errorRate: round(errorRate, 3),
    cancelRate: round(cancelRate, 3),
    linesPerMinute: round(linesPerMinute, 2),
    contextUtilizationPct: contextPct,
    contextTokensUsed: tokens,
    // cost
    estimatedCostUsd: costUsd,
    inputCostUsd: cost.inputCostUsd,
    outputCostUsd: cost.outputCostUsd,
    peakContextCostUsd: cost.peakContextCostUsd,
    inputTokensEst: cost.inputTokensEst,
    outputTokensEst: cost.outputTokensEst,
    totalTokensEst: cost.totalTokensEst,
    costPerTurn: round(costPerTurn, 4),
    costPer1kLines: round(costPer1kLines, 4),
    linesPerDollar: round(linesPerDollar, 1),
    costPer1kEstTokens: round(costPer1kEstTokens, 4),
    pricingTier: cost.pricingTier,
    rates: cost.rates,
    modelId: cost.modelId,
    estimateNote: cost.estimateNote,
    // raw inputs for aggregation
    _lines: lines,
    _linesRemoved: linesRemoved,
    _turns: turns,
    _tools: tools,
    _tokens: tokens,
    _estTokens: estTokens,
    _costUsd: costUsd,
    _inputCostUsd: cost.inputCostUsd || 0,
    _outputCostUsd: cost.outputCostUsd || 0,
    _inputTokensEst: cost.inputTokensEst || 0,
    _outputTokensEst: cost.outputTokensEst || 0,
    _files: files,
    _errors: errors,
    _duration: duration,
  };
}

function round(n, places) {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function aggregateEfficiency(items) {
  // items: array of { efficiency } or efficiency objects with _raw fields
  const list = items
    .map((i) => i.efficiency || i)
    .filter(Boolean);

  const sum = {
    lines: 0,
    linesRemoved: 0,
    turns: 0,
    tools: 0,
    tokens: 0,
    files: 0,
    errors: 0,
    duration: 0,
    contextPctWeighted: 0,
    tokenWeight: 0,
    costUsd: 0,
    inputCostUsd: 0,
    outputCostUsd: 0,
    inputTokensEst: 0,
    outputTokensEst: 0,
    estTokens: 0,
    assistantMessages: 0,
  };

  for (const e of list) {
    sum.lines += e._lines || 0;
    sum.linesRemoved += e._linesRemoved || 0;
    sum.turns += e._turns || 0;
    sum.tools += e._tools || 0;
    sum.tokens += e._tokens || 0;
    sum.files += e._files || 0;
    sum.errors += e._errors || 0;
    sum.duration += e._duration || 0;
    sum.costUsd += e._costUsd || e.estimatedCostUsd || 0;
    sum.inputCostUsd += e._inputCostUsd || e.inputCostUsd || 0;
    sum.outputCostUsd += e._outputCostUsd || e.outputCostUsd || 0;
    sum.inputTokensEst += e._inputTokensEst || e.inputTokensEst || 0;
    sum.outputTokensEst += e._outputTokensEst || e.outputTokensEst || 0;
    sum.estTokens += e._estTokens || e.totalTokensEst || 0;
    const tok = e._tokens || 0;
    if (tok > 0) {
      sum.contextPctWeighted += (e.contextUtilizationPct || 0) * tok;
      sum.tokenWeight += tok;
    }
  }

  // Score from pooled totals (not average of noisy per-session scores)
  const agg = computeEfficiency({
    turnCount: sum.turns,
    toolCallCount: sum.tools,
    contextTokensUsed: sum.tokens,
    agentLinesAdded: sum.lines,
    agentLinesRemoved: sum.linesRemoved,
    totalFilesTouched: sum.files,
    errorCount: sum.errors,
    toolFailureCount: 0,
    sessionDurationSeconds: sum.duration,
    contextWindowUsage:
      sum.tokenWeight > 0
        ? Math.round(sum.contextPctWeighted / sum.tokenWeight)
        : 0,
  });

  // Prefer summed per-session cost estimates over re-estimating from pooled context
  // (pooling peak contexts would understate multi-session cost).
  const costUsd = sum.costUsd;
  const estTokens = sum.estTokens || agg.totalTokensEst || 0;
  agg.estimatedCostUsd = roundMoney(costUsd);
  agg.inputCostUsd = roundMoney(sum.inputCostUsd);
  agg.outputCostUsd = roundMoney(sum.outputCostUsd);
  agg.inputTokensEst = sum.inputTokensEst;
  agg.outputTokensEst = sum.outputTokensEst;
  agg.totalTokensEst = estTokens;
  agg.costPerTurn = round(safeDiv(costUsd, sum.turns), 4);
  agg.costPer1kLines = round(safeDiv(costUsd * 1000, sum.lines), 4);
  agg.linesPerDollar = round(safeDiv(sum.lines, costUsd), 1);
  agg.costPer1kEstTokens = round(safeDiv(costUsd * 1000, estTokens), 4);
  agg.linesPer1kTokens = round(
    safeDiv(sum.lines, (estTokens || sum.tokens) / 1000),
    2
  );
  agg.estimateNote =
    "Sum of per-session cost estimates (context×turns + output heuristic). Not exact billing.";

  agg.sessionCount = list.length;
  return agg;
}

function roundMoney(n) {
  if (!Number.isFinite(n)) return 0;
  if (n === 0) return 0;
  if (n < 0.01) return Math.round(n * 100000) / 100000;
  return Math.round(n * 10000) / 10000;
}

export function efficiencyInsights(eff) {
  const tips = [];
  if (!eff) return tips;

  const highYield = eff.linesPerTurn >= 40 && eff.errorRate < 0.05;
  const lowYieldThrash = eff.linesPerTurn < 5 && (eff._tools || 0) > 15;

  if (lowYieldThrash) {
    tips.push("High tool use with little code yield — tighten the goal or inspect before editing.");
  } else if (highYield) {
    tips.push("Strong code yield per turn — keep using concrete, scoped prompts with clear done criteria.");
  }

  if (eff.linesPer1kTokens < 1 && (eff._tokens || 0) > 80_000) {
    tips.push("Large context with low line yield — prefer smaller scopes and /compact less-needed history.");
  }
  if (eff.errorRate > 0.08) {
    tips.push("Elevated tool/error rate — add verification steps and avoid speculative multi-edits.");
  }
  if (eff.toolsPerTurn > 25 && !highYield) {
    tips.push("Many tools per turn — prompts may be too open-ended; split into smaller tasks.");
  } else if (eff.toolsPerTurn > 25 && highYield) {
    tips.push("Tool volume is high but productive — still consider splitting work to reduce context growth.");
  }
  if (eff.contextUtilizationPct >= 70) {
    tips.push("Context window often high — start fresh sessions per feature or compact earlier.");
  }
  if ((eff.estimatedCostUsd || 0) > 0) {
    if ((eff.linesPerDollar || 0) > 0 && eff.linesPerDollar < 100 && eff.estimatedCostUsd > 0.25) {
      tips.push(
        `Low code per dollar (~${eff.linesPerDollar} lines/$). Tighten scope and name files to cut exploration cost.`
      );
    } else if ((eff.linesPerDollar || 0) >= 1000) {
      tips.push(
        `Strong cost yield (~${Math.round(eff.linesPerDollar)} lines/$ estimated). Keep prompts scoped.`
      );
    }
    if ((eff.costPerTurn || 0) > 0.15) {
      tips.push(
        `High estimated cost/turn (~$${eff.costPerTurn}). Prefer /new or /compact when context is large.`
      );
    }
  }
  if (tips.length === 0) {
    tips.push("Balanced efficiency — keep tasks scoped and measure success per session.");
  }
  return tips.slice(0, 5);
}
