/**
 * Estimated API cost for Grok sessions.
 *
 * Session signals expose last context size + turn counts, not exact
 * billed input/output. We estimate agent-style usage:
 *   - input ≈ average context × turns (linear growth to final context)
 *   - output ≈ assistant messages × typical reply size, floored by chunks
 *
 * Rates default to public xAI list prices (USD per 1M tokens, short context).
 * Long-context (≥200k final context) uses the higher list tier when known.
 *
 * Override with env GROK_MONITOR_PRICING_JSON:
 *   {"grok-4.5":{"input":2,"output":6,"inputLong":4,"outputLong":12},"default":{"input":2,"output":6}}
 */

const DEFAULT_RATES = {
  // Short-context / 1M tokens (USD)
  "grok-4.5": { input: 2.0, output: 6.0, inputLong: 4.0, outputLong: 12.0, longAt: 200_000 },
  "grok-4.5-build": { input: 2.0, output: 6.0, inputLong: 4.0, outputLong: 12.0, longAt: 200_000 },
  "grok-build": { input: 2.0, output: 6.0, inputLong: 4.0, outputLong: 12.0, longAt: 200_000 },
  "grok-4": { input: 3.0, output: 15.0, inputLong: 3.0, outputLong: 15.0, longAt: 200_000 },
  "grok-4-fast": { input: 0.2, output: 0.5, inputLong: 0.2, outputLong: 0.5, longAt: 200_000 },
  "grok-4.1-fast": { input: 0.2, output: 0.5, inputLong: 0.2, outputLong: 0.5, longAt: 200_000 },
  "grok-4.3": { input: 1.25, output: 2.5, inputLong: 1.25, outputLong: 2.5, longAt: 200_000 },
  "grok-3": { input: 3.0, output: 15.0, inputLong: 3.0, outputLong: 15.0, longAt: 200_000 },
  default: { input: 2.0, output: 6.0, inputLong: 4.0, outputLong: 12.0, longAt: 200_000 },
};

let ratesCache = null;

function loadRates() {
  if (ratesCache) return ratesCache;
  let rates = { ...DEFAULT_RATES };
  const raw = process.env.GROK_MONITOR_PRICING_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      rates = { ...rates, ...parsed };
    } catch {
      /* ignore bad env */
    }
  }
  ratesCache = rates;
  return rates;
}

export function getModelRates(modelId) {
  const rates = loadRates();
  if (!modelId) return rates.default || DEFAULT_RATES.default;
  const id = String(modelId).toLowerCase();
  if (rates[id]) return rates[id];
  // fuzzy: grok-4.5-build → grok-4.5
  const keys = Object.keys(rates).filter((k) => k !== "default");
  const hit = keys.find((k) => id.startsWith(k) || k.startsWith(id));
  if (hit) return rates[hit];
  // partial contains
  const contains = keys.find((k) => id.includes(k) || k.includes(id.split("-").slice(0, 2).join("-")));
  if (contains) return rates[contains];
  return rates.default || DEFAULT_RATES.default;
}

function pickRate(rates, contextTokens) {
  const longAt = rates.longAt ?? 200_000;
  const useLong = contextTokens >= longAt;
  return {
    inputPerM: useLong ? rates.inputLong ?? rates.input : rates.input,
    outputPerM: useLong ? rates.outputLong ?? rates.output : rates.output,
    tier: useLong ? "long" : "short",
  };
}

/**
 * Estimate input/output tokens for an agent session from signals.
 */
export function estimateTokenVolumes(signals = {}) {
  const turns = Math.max(0, signals.turnCount || 0);
  const context = Math.max(0, signals.contextTokensUsed || 0);
  const assistantMsgs = Math.max(0, signals.assistantMessageCount || 0);
  const chunks = Math.max(0, signals.totalChunkCount || 0);

  // Average context if roughly linear growth to final size
  const avgContext = turns > 0 ? context * 0.55 : context;
  // Each turn re-sends context as input (agentic pattern)
  const inputTokens = Math.round(avgContext * Math.max(turns, context > 0 ? 1 : 0));

  // Output: prefer chunk count (~tokens of streamed text) when present
  let outputTokens = 0;
  if (chunks > 0) {
    // chunks are often partial tokens/pieces; treat conservatively as ~1 token unit each is too high
    // use min of chunk-based and message-based caps
    outputTokens = Math.round(Math.min(chunks * 0.35, assistantMsgs * 2500 + turns * 1500));
  } else if (assistantMsgs > 0) {
    outputTokens = assistantMsgs * 900;
  } else if (turns > 0) {
    outputTokens = turns * 600;
  }

  // Never let output dominate absurdly vs input for agent sessions
  if (inputTokens > 0 && outputTokens > inputTokens * 0.5) {
    outputTokens = Math.round(inputTokens * 0.35);
  }

  return {
    inputTokensEst: inputTokens,
    outputTokensEst: outputTokens,
    totalTokensEst: inputTokens + outputTokens,
    avgContextTokens: Math.round(avgContext),
    peakContextTokens: context,
    turns,
  };
}

/**
 * @returns cost breakdown in USD
 */
export function estimateSessionCost(signals = {}, modelId = null) {
  const volumes = estimateTokenVolumes(signals);
  const rates = getModelRates(modelId || signals.primaryModelId);
  const { inputPerM, outputPerM, tier } = pickRate(rates, volumes.peakContextTokens);

  const inputCost = (volumes.inputTokensEst / 1_000_000) * inputPerM;
  const outputCost = (volumes.outputTokensEst / 1_000_000) * outputPerM;
  const totalCost = inputCost + outputCost;

  // Peak context re-process cost (single full window at input rate) — useful lower bound
  const peakContextCost = (volumes.peakContextTokens / 1_000_000) * inputPerM;

  return {
    ...volumes,
    modelId: modelId || signals.primaryModelId || null,
    pricingTier: tier,
    rates: { inputPerM, outputPerM },
    inputCostUsd: roundMoney(inputCost),
    outputCostUsd: roundMoney(outputCost),
    estimatedCostUsd: roundMoney(totalCost),
    peakContextCostUsd: roundMoney(peakContextCost),
    estimateNote:
      "Estimate from context×turns (agent re-prompt) + output heuristic; not exact billing.",
  };
}

export function aggregateCosts(costItems) {
  const list = costItems.filter(Boolean);
  const sum = {
    inputTokensEst: 0,
    outputTokensEst: 0,
    totalTokensEst: 0,
    estimatedCostUsd: 0,
    inputCostUsd: 0,
    outputCostUsd: 0,
    peakContextCostUsd: 0,
    peakContextTokens: 0,
  };
  for (const c of list) {
    sum.inputTokensEst += c.inputTokensEst || 0;
    sum.outputTokensEst += c.outputTokensEst || 0;
    sum.totalTokensEst += c.totalTokensEst || 0;
    sum.estimatedCostUsd += c.estimatedCostUsd || 0;
    sum.inputCostUsd += c.inputCostUsd || 0;
    sum.outputCostUsd += c.outputCostUsd || 0;
    sum.peakContextCostUsd += c.peakContextCostUsd || 0;
    sum.peakContextTokens += c.peakContextTokens || 0;
  }
  return {
    ...sum,
    estimatedCostUsd: roundMoney(sum.estimatedCostUsd),
    inputCostUsd: roundMoney(sum.inputCostUsd),
    outputCostUsd: roundMoney(sum.outputCostUsd),
    peakContextCostUsd: roundMoney(sum.peakContextCostUsd),
    sessionCount: list.length,
    estimateNote:
      "Sum of per-session estimates (context×turns heuristic). Not exact billed total.",
  };
}

function roundMoney(n) {
  if (!Number.isFinite(n)) return 0;
  if (n === 0) return 0;
  if (n < 0.01) return Math.round(n * 100000) / 100000; // more precision for tiny
  return Math.round(n * 10000) / 10000;
}

export function formatUsd(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}
