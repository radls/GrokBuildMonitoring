import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Cloud,
  FolderKanban,
  LayoutDashboard,
  RefreshCw,
  Search,
  X,
  Radio,
  Clock,
  Cpu,
  FileCode2,
  Wrench,
  MessagesSquare,
  Sparkles,
  Gauge,
  ExternalLink,
  HelpCircle,
  Terminal,
  Wand2,
  Target,
  GitBranch,
  BookOpen,
  Lightbulb,
  ListOrdered,
  Wand2 as WandSparkles,
  Copy,
  ClipboardCheck,
  Eraser,
} from "lucide-react";
import {
  fetchJson,
  formatBytes,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
  formatTokens,
  formatUsd,
  gradeClass,
  leafName,
  shortId,
} from "./utils.js";

const REFRESH_MS = 4000;

function StatusBadge({ status }) {
  const label = status || "idle";
  return (
    <span className={`badge badge-${label}`}>
      <span className="badge-dot" />
      {label}
    </span>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

function SessionDrawer({ sessionId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson(`/api/sessions/${sessionId}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = data?.signals;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h3>{data?.title || "Session"}</h3>
            <p className="muted mono" style={{ margin: "0.35rem 0 0", fontSize: "0.75rem" }}>
              {sessionId}
            </p>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">
          {loading && (
            <div className="empty">
              <span className="spinner" /> Loading…
            </div>
          )}
          {error && <div className="error-banner">{error}</div>}
          {data && !loading && (
            <>
              <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <StatusBadge status={data.status} />
                {data.sessionKind && data.sessionKind !== "main" && (
                  <span className="badge badge-idle">{data.sessionKind}</span>
                )}
              </div>

              <dl className="kv">
                <dt>Project</dt>
                <dd>{data.projectPath || data.project}</dd>
                <dt>Project path</dt>
                <dd className="mono">{data.projectCwd || data.cwd}</dd>
                <dt>Session cwd</dt>
                <dd className="mono">{data.cwd}</dd>
                <dt>Model</dt>
                <dd className="mono">{data.modelId || "—"}</dd>
                <dt>Agent</dt>
                <dd>{data.agentName || "—"}</dd>
                <dt>Created</dt>
                <dd>{data.createdAt ? new Date(data.createdAt).toLocaleString() : "—"}</dd>
                <dt>Last active</dt>
                <dd>
                  {formatRelative(data.lastActiveAt)}{" "}
                  <span className="dim">
                    ({data.lastActiveAt ? new Date(data.lastActiveAt).toLocaleString() : "—"})
                  </span>
                </dd>
                {data.active && (
                  <>
                    <dt>PID</dt>
                    <dd className="mono">
                      {data.active.pid}{" "}
                      {data.active.processAlive ? (
                        <span className="badge badge-active" style={{ marginLeft: 6 }}>
                          alive
                        </span>
                      ) : (
                        <span className="badge badge-stale" style={{ marginLeft: 6 }}>
                          dead
                        </span>
                      )}
                    </dd>
                  </>
                )}
                {data.parentSessionId && (
                  <>
                    <dt>Parent</dt>
                    <dd className="mono">{data.parentSessionId}</dd>
                  </>
                )}
              </dl>

              <h4 className="section-title">Usage & cost</h4>
              <div className="metric-row">
                <div className="metric-box">
                  <div className="m-label">Context tokens</div>
                  <div className="m-value">{formatTokens(s?.contextTokensUsed)}</div>
                  <div className="progress">
                    <span
                      style={{
                        width: `${Math.min(100, s?.contextWindowUsage || 0)}%`,
                      }}
                    />
                  </div>
                  <div className="hint muted" style={{ marginTop: 4, fontSize: "0.7rem" }}>
                    {s?.contextWindowUsage ?? 0}% of {formatTokens(s?.contextWindowTokens)}
                  </div>
                </div>
                <div className="metric-box">
                  <div className="m-label">Est. cost</div>
                  <div className="m-value">
                    {formatUsd(data.efficiency?.estimatedCostUsd)}
                  </div>
                  <div className="hint muted" style={{ marginTop: 4, fontSize: "0.7rem" }}>
                    in {formatUsd(data.efficiency?.inputCostUsd)} · out{" "}
                    {formatUsd(data.efficiency?.outputCostUsd)}
                  </div>
                </div>
                <div className="metric-box">
                  <div className="m-label">Est. tokens (in/out)</div>
                  <div className="m-value" style={{ fontSize: "0.95rem" }}>
                    {formatTokens(data.efficiency?.inputTokensEst)} /{" "}
                    {formatTokens(data.efficiency?.outputTokensEst)}
                  </div>
                </div>
                <div className="metric-box">
                  <div className="m-label">Duration</div>
                  <div className="m-value">{formatDuration(s?.sessionDurationSeconds)}</div>
                </div>
                <div className="metric-box">
                  <div className="m-label">Turns</div>
                  <div className="m-value">{formatNumber(s?.turnCount)}</div>
                </div>
                <div className="metric-box">
                  <div className="m-label">Tool calls</div>
                  <div className="m-value">{formatNumber(s?.toolCallCount)}</div>
                </div>
                <div className="metric-box">
                  <div className="m-label">Lines +/−</div>
                  <div className="m-value">
                    +{formatNumber(s?.agentLinesAdded)} / −{formatNumber(s?.agentLinesRemoved)}
                  </div>
                </div>
                <div className="metric-box">
                  <div className="m-label">Files touched</div>
                  <div className="m-value">{formatNumber(s?.totalFilesTouched)}</div>
                </div>
                <div className="metric-box">
                  <div className="m-label">Avg TTFT</div>
                  <div className="m-value">
                    {s?.avgTimeToFirstTokenMs ? `${Math.round(s.avgTimeToFirstTokenMs)}ms` : "—"}
                  </div>
                </div>
                <div className="metric-box">
                  <div className="m-label">Peak RSS</div>
                  <div className="m-value">{formatBytes(s?.peakRssBytes)}</div>
                </div>
              </div>

              {s?.toolsUsed?.length > 0 && (
                <>
                  <h4 className="section-title">Tools used</h4>
                  <div className="chips">
                    {s.toolsUsed.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                </>
              )}

              <h4 className="section-title">Messages</h4>
              <div className="metric-row">
                <div className="metric-box">
                  <div className="m-label">User / assistant</div>
                  <div className="m-value">
                    {formatNumber(s?.userMessageCount)} / {formatNumber(s?.assistantMessageCount)}
                  </div>
                </div>
                <div className="metric-box">
                  <div className="m-label">Chat messages</div>
                  <div className="m-value">{formatNumber(data.numChatMessages)}</div>
                </div>
                <div className="metric-box">
                  <div className="m-label">Errors / tool fails</div>
                  <div className="m-value">
                    {formatNumber(s?.errorCount)} / {formatNumber(s?.toolFailureCount)}
                  </div>
                </div>
                <div className="metric-box">
                  <div className="m-label">Subagents</div>
                  <div className="m-value">{formatNumber(data.subagentCount)}</div>
                </div>
              </div>

              {data.todos?.total > 0 && (
                <>
                  <h4 className="section-title">Todos</h4>
                  <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
                    {data.todos.completed}/{data.todos.total} completed
                    {data.todos.inProgress ? ` · ${data.todos.inProgress} in progress` : ""}
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GradePill({ grade, score }) {
  if (grade == null && score == null) {
    return <span className={`grade-pill ${gradeClass(null)}`}>—</span>;
  }
  return (
    <span className={`grade-pill ${gradeClass(grade)}`} title={score != null ? `${score}/100` : ""}>
      {grade || "—"}
    </span>
  );
}

function renderFeedbackLine(text) {
  // Support lightweight **bold** markers from server feedback strings
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Hover + click-to-pin guidance popup (portaled) for coaching list items.
 * `guidance` shape: { title, why, how, example, stat? }
 */
function GuidanceTip({ guidance, children, wide = false, className = "" }) {
  const [hoverRect, setHoverRect] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [pinRect, setPinRect] = useState(null);
  const rootRef = useRef(null);

  const activeRect = pinned ? pinRect : hoverRect;
  const show = Boolean(activeRect && guidance);

  useEffect(() => {
    if (!pinned) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && rootRef.current.contains(e.target)) return;
      // clicks inside portal tip
      if (e.target?.closest?.(".guidance-tip-popup")) return;
      setPinned(false);
      setPinRect(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setPinned(false);
        setPinRect(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  if (!guidance) return children;

  const tipWidth = wide ? 380 : 340;
  const placeBelow = activeRect ? activeRect.top < 240 : false;
  const left = activeRect
    ? Math.max(8, Math.min(activeRect.left, window.innerWidth - tipWidth - 8))
    : 0;
  const style = activeRect
    ? {
        position: "fixed",
        left,
        width: tipWidth,
        zIndex: 10050,
        ...(placeBelow
          ? { top: activeRect.bottom + 8 }
          : { bottom: window.innerHeight - activeRect.top + 8 }),
      }
    : {};

  return (
    <span
      ref={rootRef}
      className={`guidance-anchor ${className}`.trim()}
      onMouseEnter={(e) => {
        if (pinned) return;
        setHoverRect(e.currentTarget.getBoundingClientRect());
      }}
      onMouseLeave={() => {
        if (!pinned) setHoverRect(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        if (pinned) {
          setPinned(false);
          setPinRect(null);
        } else {
          setPinned(true);
          setPinRect(rect);
          setHoverRect(null);
        }
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.currentTarget.click();
        }
      }}
      aria-expanded={show}
      title="Hover or click for guidance"
    >
      {children}
      <HelpCircle size={13} className="guidance-icon" aria-hidden />
      {show &&
        createPortal(
          <div
            className={`fixed-tip guidance-tip-popup ${pinned ? "is-pinned" : ""}`}
            style={style}
            role="tooltip"
            onMouseEnter={() => {
              /* keep open while moving into tip on hover-only */
            }}
          >
            <div className="tip-title">
              {guidance.title || "Guidance"}
              {guidance.stat ? (
                <span className="meta-pill" style={{ marginLeft: 6 }}>
                  {guidance.stat}
                </span>
              ) : null}
              {pinned ? (
                <span className="tip-pin-hint">pinned · Esc to close</span>
              ) : (
                <span className="tip-pin-hint">click to pin</span>
              )}
            </div>
            {guidance.why && (
              <div className="guide-block">
                <div className="guide-kicker">Why it matters</div>
                <p>{guidance.why}</p>
              </div>
            )}
            {guidance.how && (
              <div className="guide-block">
                <div className="guide-kicker">What to do</div>
                <p>{guidance.how}</p>
              </div>
            )}
            {guidance.example && (
              <div className="guide-block">
                <div className="guide-kicker">Example</div>
                <pre className="guide-example">{guidance.example}</pre>
              </div>
            )}
          </div>,
          document.body
        )}
    </span>
  );
}

function CloudBadge({ repo, compact = false }) {
  if (!repo?.isCloud) return null;
  const label = compact ? repo.provider : `${repo.provider}${repo.slug ? ` · ${repo.slug}` : ""}`;
  const inner = (
    <span className="cloud-badge" title={repo.url || repo.webUrl || repo.provider}>
      <Cloud size={12} />
      {label}
      {repo.webUrl ? <ExternalLink size={11} /> : null}
    </span>
  );
  if (repo.webUrl) {
    return (
      <a
        className="cloud-badge-link"
        href={repo.webUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </a>
    );
  }
  return inner;
}

/** Fixed-position tooltip portaled to body — never clipped by panel overflow / sticky bars */
function FixedTip({ show, anchorRect, children }) {
  if (!show || !anchorRect || typeof document === "undefined") return null;
  const tipWidth = 320;
  const gap = 10;
  let left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - tipWidth - 8));
  // Prefer above the row; if near the top sticky bar, place below
  const placeBelow = anchorRect.top < 220;
  const style = {
    position: "fixed",
    left,
    width: tipWidth,
    zIndex: 10000,
    ...(placeBelow
      ? { top: anchorRect.bottom + gap }
      : { bottom: window.innerHeight - anchorRect.top + gap }),
  };
  return createPortal(
    <div className="fixed-tip" style={style} role="tooltip">
      {children}
    </div>,
    document.body
  );
}

function ProjectBarRow({ p, maxTurns }) {
  const [tip, setTip] = useState(null);
  const turns = p.rollupTurns || p.totalTurns || 0;
  const name = leafName(p.cwd || p.name);

  return (
    <div
      className="bar-row"
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTip(rect);
      }}
      onMouseLeave={() => setTip(null)}
    >
      <div className="name">
        {name}
        {p.cloudRepo?.isCloud ? (
          <Cloud size={12} className="name-cloud" title={p.cloudRepo.provider} />
        ) : null}
      </div>
      <div className="bar-track">
        <span style={{ width: `${(turns / maxTurns) * 100}%` }} />
      </div>
      <div className="num">{turns}</div>
      <FixedTip show={Boolean(tip)} anchorRect={tip}>
        <div className="tip-title">
          {name}{" "}
          {p.cloudRepo?.isCloud ? (
            <CloudBadge repo={p.cloudRepo} compact />
          ) : (
            <span className="local-badge">local only</span>
          )}
        </div>
        <div className="tip-path">{p.cwd}</div>
        <div className="tip-grid">
          <span>Last run</span>
          <strong>{formatRelative(p.lastActiveAt)}</strong>
          <span>When</span>
          <strong style={{ fontSize: "0.68rem" }}>{formatDateTime(p.lastActiveAt)}</strong>
          <span>Sessions</span>
          <strong>{p.rollupSessions ?? p.sessions}</strong>
          <span>Turns</span>
          <strong>{turns}</strong>
          <span>Tool calls</span>
          <strong>{formatNumber(p.rollupToolCalls ?? p.totalToolCalls)}</strong>
          <span>Context tokens</span>
          <strong>{formatTokens(p.rollupTokens ?? p.totalTokens)}</strong>
          <span>Est. cost</span>
          <strong>{formatUsd(p.efficiency?.estimatedCostUsd)}</strong>
          <span>Lines / $</span>
          <strong>
            {p.efficiency?.linesPerDollar != null
              ? formatNumber(p.efficiency.linesPerDollar)
              : "—"}
          </strong>
          <span>Models</span>
          <strong style={{ fontSize: "0.68rem" }}>
            {(p.models && p.models.length ? p.models.join(", ") : "—")}
          </strong>
          <span>Lines +/−</span>
          <strong>
            +{formatNumber(p.rollupLinesAdded ?? p.linesAdded)}/−
            {formatNumber(p.rollupLinesRemoved ?? p.linesRemoved)}
          </strong>
          <span>Efficiency</span>
          <strong>
            {p.efficiency?.score != null
              ? `${p.efficiency.score} (${p.efficiency.grade})`
              : "—"}
          </strong>
          <span>Prompt quality</span>
          <strong>
            {p.promptQuality?.avgScore != null
              ? `${p.promptQuality.avgScore} (${p.promptQuality.grade})`
              : "—"}
          </strong>
          {p.cloudRepo?.slug && (
            <>
              <span>Cloud repo</span>
              <strong>{p.cloudRepo.slug}</strong>
            </>
          )}
        </div>
      </FixedTip>
    </div>
  );
}

function CollapsibleLiveSessions({ active, onSelectSession }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel collapsible-panel">
      <button
        type="button"
        className="panel-header collapsible-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <h3>
          <Radio size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          Live sessions
          <span className="meta-pill" style={{ marginLeft: 8 }}>
            {active.length}
          </span>
        </h3>
        <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {open ? "Collapse" : "Expand"}
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && (
        <div className="panel-body">
          {active.length === 0 ? (
            <div className="empty">No active Grok processes registered</div>
          ) : (
            <ul className="live-list">
              {active.map((a) => (
                <li
                  key={a.sessionId}
                  className="clickable"
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelectSession(a.sessionId)}
                >
                  <div className="live-title">
                    {a.title} <StatusBadge status={a.status} />
                  </div>
                  <div className="live-meta">
                    <span>{leafName(a.projectCwd || a.project)}</span>
                    <span>pid {a.pid}</span>
                    <span>{formatRelative(a.openedAt)}</span>
                    {a.modelId && <span>{a.modelId}</span>}
                    {a.signals?.toolCallCount != null && (
                      <span>{a.signals.toolCallCount} tools</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PromptMethodDetails() {
  const [open, setOpen] = useState(false);
  return (
    <div className="method-box">
      <button type="button" className="method-toggle" onClick={() => setOpen((v) => !v)}>
        <HelpCircle size={14} />
        How prompt quality is computed
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="method-body">
          <p>
            Each driving prompt is extracted from session <code>chat_history.jsonl</code>{" "}
            (primarily text inside <code>&lt;user_query&gt;</code>). Synthetic system noise
            and subagent sessions are skipped. Each prompt starts at a base of{" "}
            <strong>45/100</strong>, then gains or loses points:
          </p>
          <div className="method-cols">
            <div>
              <h5>Adds points</h5>
              <ul>
                <li>
                  <strong>Good length</strong> (+12): ~40–600 characters — enough context
                  without a novel
                </li>
                <li>
                  <strong>Structure</strong> (+12): numbered steps or bullet lists
                </li>
                <li>
                  <strong>Success criteria</strong> (+10): words like should, must, verify,
                  test, done when, expected
                </li>
                <li>
                  <strong>Paths / files</strong> (+10): concrete paths or extensions
                  (<code>src/…</code>, <code>.tsx</code>, <code>Assets/</code>)
                </li>
                <li>
                  <strong>Constraints</strong> (+8): don’t / only / preserve / without
                </li>
                <li>
                  <strong>Tech + metrics</strong> (+6 each): stack names, numbers (ms, %,
                  fps)
                </li>
              </ul>
            </div>
            <div>
              <h5>Subtracts points</h5>
              <ul>
                <li>
                  <strong>Very short</strong> (−25) or short (−10) prompts
                </li>
                <li>
                  <strong>Vague language</strong> (−6 to −14): fix, better, terrible,
                  something, broken…
                </li>
                <li>
                  <strong>Image-only</strong> (−18): screenshot with almost no text
                </li>
                <li>
                  <strong>“Apply the fixes”</strong> (−10): vague continuation
                </li>
                <li>
                  <strong>Multi-goal jam</strong> (−8): many “and”s, no structure
                </li>
                <li>
                  <strong>Mega-prompt</strong> (−6): over ~1500 characters without
                  splitting
                </li>
              </ul>
            </div>
          </div>
          <p>
            Grades: <strong>A</strong> ≥85 · <strong>B</strong> ≥70 · <strong>C</strong>{" "}
            ≥55 · <strong>D</strong> ≥40 · <strong>F</strong> below. Project and overall
            scores average per-prompt scores. This is a local heuristic — not an LLM
            judgment — meant to coach clearer agent instructions.
          </p>
          <div className="template-card">
            <div className="section-title">Recommended template</div>
            <pre>{`Goal: <what should be true when done>
Scope: <files / folders / components>
Constraints: <what not to change>
Done when: <command, test, or UI check>`}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function StrategyCard({ item, compact = false }) {
  const guidance = {
    title: item.title,
    why: item.when,
    how: item.how,
    example: item.example,
    stat: item.rank ? `#${item.rank}` : null,
  };
  return (
    <div className={`strategy-card ${compact ? "is-compact" : ""}`}>
      <div className="strategy-card-top">
        {item.rank != null && <span className="strategy-rank">#{item.rank}</span>}
        <h4 className="strategy-title">{item.title}</h4>
        <GuidanceTip wide guidance={guidance}>
          <span className="btn strategy-help-btn" title="Guidance">
            <HelpCircle size={13} />
          </span>
        </GuidanceTip>
      </div>
      <p className="strategy-summary">{item.summary}</p>
      {item.whyNow?.length > 0 && (
        <ul className="strategy-why">
          {item.whyNow.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {!compact && item.template && (
        <pre className="strategy-template">{item.template}</pre>
      )}
      {!compact && (
        <>
          <div className="strategy-meta-grid">
            <div>
              <div className="guide-kicker">When</div>
              <p className="strategy-body">{item.when}</p>
            </div>
            <div>
              <div className="guide-kicker">How</div>
              <p className="strategy-body">{item.how}</p>
            </div>
          </div>
          {item.example && (
            <>
              <div className="guide-kicker" style={{ marginTop: 8 }}>
                Example
              </div>
              <pre className="strategy-template">{item.example}</pre>
            </>
          )}
          {item.antiPatterns?.length > 0 && (
            <div className="strategy-anti">
              <div className="guide-kicker">Avoid</div>
              <ul>
                {item.antiPatterns.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {item.pairsWith?.length > 0 && (
            <div className="metric-inline" style={{ marginTop: 8 }}>
              {item.pairsWith.map((c) => (
                <span className="metric-chip" key={c}>
                  {c}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      {compact && item.template && (
        <pre className="strategy-template strategy-template-tight">{item.template}</pre>
      )}
    </div>
  );
}

function RefinerPage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);

  async function refine() {
    setLoading(true);
    setError(null);
    setCopied(null);
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (e) {
      setResult(null);
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function copyText(label, text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Clipboard copy failed — select and copy manually.");
    }
  }

  const examples = [
    "fix the monitoring dashboard it looks bad",
    "add cost to the overview and also improve prompts and make workflows better",
    "research best practices for local first analytics dashboards",
    "review my changes before I open a PR",
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Prompt refiner</h2>
          <p>
            Paste a rough idea — get a Grok Build–ready prompt and slash command when
            appropriate
          </p>
        </div>
      </div>

      <div className="panel focus-panel refiner-panel">
        <div className="panel-pad">
          <label className="refiner-label" htmlFor="refine-input">
            Your draft prompt
          </label>
          <textarea
            id="refine-input"
            className="refiner-input"
            rows={6}
            placeholder="e.g. fix the UI and make it better, also add tests…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                refine();
              }
            }}
          />
          <div className="refiner-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={refine}
              disabled={loading || !input.trim()}
            >
              {loading ? <span className="spinner" /> : <WandSparkles size={14} />}
              Refine for Grok Build
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setInput("");
                setResult(null);
                setError(null);
              }}
            >
              <Eraser size={14} /> Clear
            </button>
            <span className="dim" style={{ fontSize: "0.75rem" }}>
              ⌘/Ctrl+Enter to refine
            </span>
          </div>
          <div className="metric-inline" style={{ marginTop: 10 }}>
            {examples.map((ex) => (
              <button
                type="button"
                key={ex}
                className="metric-chip clickable-chip"
                style={{ cursor: "pointer", border: "none" }}
                onClick={() => setInput(ex)}
              >
                Try: {ex.slice(0, 42)}
                {ex.length > 42 ? "…" : ""}
              </button>
            ))}
          </div>
          {error && <div className="error-banner" style={{ margin: "12px 0 0" }}>{error}</div>}
        </div>
      </div>

      {result?.refined && (
        <div className="section-block grid-2-tight">
          <div className="panel">
            <div className="panel-header">
              <h3>Refined for Grok Build</h3>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {result.scores && (
                  <>
                    <GradePill
                      grade={result.scores.before.grade}
                      score={result.scores.before.score}
                    />
                    <span className="dim">→</span>
                    <GradePill
                      grade={result.scores.after.grade}
                      score={result.scores.after.score}
                    />
                  </>
                )}
              </div>
            </div>
            <div className="panel-pad">
              {result.intent && (
                <div className="metric-inline" style={{ marginBottom: 10 }}>
                  <span className="metric-chip">
                    intent <b>{result.intent.label}</b>
                  </span>
                  {result.intent.command && (
                    <span className="metric-chip">
                      command <b>{result.intent.command}</b>
                    </span>
                  )}
                  <span className="metric-chip">
                    quality <b>
                      {result.scores?.before.score} → {result.scores?.after.score}
                    </b>
                  </span>
                </div>
              )}

              {result.refined.command && (
                <>
                  <div className="section-title">Slash command</div>
                  <pre className="refiner-output">{result.refined.command}</pre>
                  <button
                    type="button"
                    className="btn"
                    style={{ marginBottom: 12 }}
                    onClick={() => copyText("cmd", result.refined.command)}
                  >
                    {copied === "cmd" ? <ClipboardCheck size={14} /> : <Copy size={14} />}
                    {copied === "cmd" ? "Copied" : "Copy command"}
                  </button>
                </>
              )}

              <div className="section-title">
                {result.refined.command ? "Prompt body (after command)" : "Paste into Grok Build"}
              </div>
              <pre className="refiner-output">{result.refined.full}</pre>
              <div className="refiner-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => copyText("full", result.refined.full)}
                >
                  {copied === "full" ? <ClipboardCheck size={14} /> : <Copy size={14} />}
                  {copied === "full" ? "Copied" : "Copy all"}
                </button>
                {result.refined.body && result.refined.command && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => copyText("body", result.refined.body)}
                  >
                    {copied === "body" ? <ClipboardCheck size={14} /> : <Copy size={14} />}
                    {copied === "body" ? "Copied" : "Copy body only"}
                  </button>
                )}
              </div>
              <p className="note-muted" style={{ marginTop: 10 }}>
                {result.refined.howToUse}
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Guidance</h3>
            </div>
            <div className="panel-pad">
              <div className="section-title">What changed</div>
              <ul className="insight-list">
                {(result.changes || []).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="section-title" style={{ marginTop: 12 }}>
                Tips
              </div>
              <ul className="insight-list">
                {(result.tips || []).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {result.alternatives?.length > 0 && (
                <>
                  <div className="section-title" style={{ marginTop: 12 }}>
                    Alternatives
                  </div>
                  {result.alternatives.map((a) => (
                    <div className="sample-card" key={a.command + a.why}>
                      <div className="sample-meta">
                        <code className="command-name">{a.command}</code>
                      </div>
                      <div className="sample-text">{a.why}</div>
                      <pre className="strategy-template-tight strategy-template">
                        {a.invocation}
                      </pre>
                      <button
                        type="button"
                        className="btn"
                        style={{ marginTop: 6 }}
                        onClick={() => copyText(a.command, a.invocation)}
                      >
                        <Copy size={12} /> Copy
                      </button>
                    </div>
                  ))}
                </>
              )}
              {result.extracted && (
                <>
                  <div className="section-title" style={{ marginTop: 12 }}>
                    Extracted
                  </div>
                  <div className="metric-inline">
                    <span className="metric-chip">
                      paths <b>{result.extracted.paths?.length || 0}</b>
                    </span>
                    <span className="metric-chip">
                      constraints <b>{result.extracted.constraints?.length || 0}</b>
                    </span>
                    <span className="metric-chip">
                      goals <b>{result.extracted.goalCount || 1}</b>
                    </span>
                  </div>
                  {result.extracted.paths?.length > 0 && (
                    <div className="chips" style={{ marginTop: 8 }}>
                      {result.extracted.paths.map((p) => (
                        <span className="chip" key={p}>
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StrategiesPanel({ strategies, compact = false, onOpenFull }) {
  const data = strategies || {};
  const list = compact ? data.top || [] : data.all || data.top || [];
  const signals = data.signals || {};

  if (compact) {
    return (
      <div className="panel focus-panel strategies-panel">
        <div className="panel-header">
          <h3>
            <Lightbulb size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Top prompt strategies
          </h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="meta-pill">ranked for your sessions</span>
            {onOpenFull && (
              <button type="button" className="btn" onClick={onOpenFull}>
                All strategies
              </button>
            )}
          </div>
        </div>
        <div className="panel-pad compact-pad">
          <p className="note-muted" style={{ marginTop: 0 }}>
            {data.summary ||
              "Patterns that raise prompt quality and agent yield on Grok Build."}
            {signals.promptScore != null
              ? ` Your prompt score: ${signals.promptScore}/100.`
              : ""}{" "}
            Hover ❓ for full guidance.
          </p>
          <div className="strategy-grid">
            {list.slice(0, 5).map((item) => (
              <StrategyCard key={item.id} item={item} compact />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Prompt strategies</h2>
          <p>
            {data.summary ||
              "Optimal prompting patterns for Grok Build — ranked from your live quality signals"}
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="panel-pad compact-pad">
          <div className="metric-inline">
            <span className="metric-chip">
              prompt quality <b>{signals.promptScore ?? "—"}</b>
            </span>
            <span className="metric-chip">
              tools/turn <b>{signals.toolsPerTurn ?? "—"}</b>
            </span>
            <span className="metric-chip">
              context <b>
                {signals.contextUtilizationPct != null
                  ? `${signals.contextUtilizationPct}%`
                  : "—"}
              </b>
            </span>
            <span className="metric-chip">
              strategies <b>{data.count ?? list.length}</b>
            </span>
          </div>
          {signals.topIssues?.length > 0 && (
            <div className="metric-inline" style={{ marginTop: 6 }}>
              <span className="dim" style={{ fontSize: "0.75rem", width: "100%" }}>
                Ranking boosts strategies that address your frequent issues:
              </span>
              {signals.topIssues.map((i) => (
                <span className="metric-chip" key={i.id}>
                  {i.label} <b>{i.pct}%</b>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="section-block">
        <div className="panel focus-panel">
          <div className="panel-header">
            <h3>
              <ListOrdered size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Ranked for you
            </h3>
          </div>
          <div className="panel-pad">
            <div className="strategy-grid strategy-grid-full">
              {(data.top || list).slice(0, 6).map((item) => (
                <StrategyCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="section-block">
        <div className="panel">
          <div className="panel-header">
            <h3>
              <BookOpen size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Full playbook
            </h3>
            <span className="meta-pill">{list.length} strategies</span>
          </div>
          <div className="panel-pad">
            <div className="strategy-grid strategy-grid-full">
              {list.map((item) => (
                <StrategyCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function OverviewPage({ overview, onSelectSession, onOpenCommands, onOpenStrategies }) {
  const totals = overview?.totals || {};
  const active = overview?.active || [];
  const projects = overview?.projects || [];
  const efficiency = overview?.efficiency || {};
  const efficiencyInsights = overview?.efficiencyInsights || [];
  const promptQuality = overview?.promptQuality || {};
  const versions = overview?.versions || {};
  const [guideTab, setGuideTab] = useState("prompt"); // prompt | efficiency
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  const [showEffProjects, setShowEffProjects] = useState(false);

  const leafProjects = projects.filter((p) => !p.hasChildren);
  const ranked = (leafProjects.length ? leafProjects : projects)
    .slice()
    .sort((a, b) => (b.rollupTurns || b.totalTurns || 0) - (a.rollupTurns || a.totalTurns || 0));
  const topProjects = ranked.slice(0, 8);
  const maxTurns = Math.max(
    1,
    ...topProjects.map((p) => p.rollupTurns || p.totalTurns || 0)
  );

  const projectEffRows = leafProjects
    .slice()
    .sort(
      (a, b) =>
        (b.efficiency?.estimatedCostUsd || 0) - (a.efficiency?.estimatedCostUsd || 0) ||
        (b.efficiency?.score || 0) - (a.efficiency?.score || 0)
    )
    .filter((p) => (p.sessions || 0) > 0)
    .slice(0, 8);

  const cloudCount = leafProjects.filter((p) => p.cloudRepo?.isCloud).length;
  const modelList = versions.models || [];
  const agentList = versions.agents || [];

  return (
    <>
      {/* Compact header + versions + KPI strip */}
      <div className="page-header ov-header">
        <div>
          <h2>Overview</h2>
          <p className="ov-version-line">
            <span className="ver-pill" title={versions.grokBuildCheckedAt || ""}>
              <Terminal size={12} /> Grok Build {versions.grokBuild || overview?.version || "—"}
            </span>
            <span className="ver-pill" title="Models seen in session summaries">
              <Cpu size={12} /> {versions.primaryModel || "—"}
            </span>
            {versions.primaryAgent && (
              <span className="ver-pill" title="Most common agent profile">
                <Wand2 size={12} /> {versions.primaryAgent}
              </span>
            )}
            {modelList.length > 1 && (
              <span className="dim" style={{ fontSize: "0.75rem" }}>
                also {modelList.slice(1, 4).map((m) => m.id).join(", ")}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="kpi-strip panel">
        <div className="kpi">
          <span className="label">Prompt</span>
          <span className="kpi-val">
            {promptQuality.avgScore ?? "—"}
            <GradePill grade={promptQuality.grade} score={promptQuality.avgScore} />
          </span>
        </div>
        <div className="kpi">
          <span className="label">Efficiency</span>
          <span className="kpi-val">
            {efficiency.score ?? "—"}
            <GradePill grade={efficiency.grade} score={efficiency.score} />
          </span>
        </div>
        <div className="kpi">
          <span className="label">Est. cost</span>
          <span className="kpi-val mono cyan">
            {formatUsd(totals.estimatedCostUsd ?? efficiency.estimatedCostUsd)}
          </span>
        </div>
        <div className="kpi">
          <span className="label">Sessions</span>
          <span className="kpi-val mono">
            {formatNumber(totals.sessions)}
            <span className="dim" style={{ fontSize: "0.72rem", fontWeight: 400 }}>
              {" "}
              · {formatNumber(totals.activeSessions)} live
            </span>
          </span>
        </div>
        <div className="kpi">
          <span className="label">Projects</span>
          <span className="kpi-val mono">
            {formatNumber(totals.projects)}
            <span className="dim" style={{ fontSize: "0.72rem", fontWeight: 400 }}>
              {" "}
              · {cloudCount} cloud
            </span>
          </span>
        </div>
        <div className="kpi">
          <span className="label">Lines</span>
          <span className="kpi-val mono">+{formatNumber(totals.linesAdded)}</span>
        </div>
      </div>

      {/* Combined quality + efficiency */}
      <div className="section-block">
        <div className="panel focus-panel">
          <div className="panel-header guide-tabs-header">
            <div className="guide-tabs">
              <button
                type="button"
                className={`guide-tab ${guideTab === "prompt" ? "active" : ""}`}
                onClick={() => setGuideTab("prompt")}
              >
                <Sparkles size={14} /> Prompts
                <GradePill grade={promptQuality.grade} score={promptQuality.avgScore} />
              </button>
              <button
                type="button"
                className={`guide-tab ${guideTab === "efficiency" ? "active" : ""}`}
                onClick={() => setGuideTab("efficiency")}
              >
                <Gauge size={14} /> Efficiency & cost
                <GradePill grade={efficiency.grade} score={efficiency.score} />
              </button>
            </div>
            <span className="meta-pill">hover ❓ for guidance</span>
          </div>

          {guideTab === "prompt" && (
            <div className="panel-pad compact-pad">
              <div className="score-row-compact">
                <div className="score-big">{promptQuality.avgScore ?? "—"}</div>
                <div>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    / 100 · {formatNumber(promptQuality.promptCount)} prompts
                  </div>
                  <div className="metric-inline" style={{ marginTop: 6 }}>
                    {(promptQuality.issueBreakdown || []).slice(0, 4).map((iss) => (
                      <GuidanceTip
                        key={iss.id}
                        className="chip-guidance"
                        guidance={{
                          title: iss.label,
                          why: iss.why,
                          how: iss.how,
                          example: iss.example,
                          stat: `${iss.pct}% · ${iss.count}×`,
                        }}
                      >
                        <span className="metric-chip clickable-chip">
                          {iss.label} <b>{iss.pct}%</b>
                        </span>
                      </GuidanceTip>
                    ))}
                  </div>
                </div>
              </div>

              <ul className="feedback-list emphasis compact-list">
                {(promptQuality.feedbackItems || []).slice(0, 5).map((item) => (
                  <li key={item.id} className="feedback-item">
                    <GuidanceTip
                      wide
                      guidance={{
                        title: item.title,
                        why: item.why,
                        how: item.how,
                        example: item.example,
                        stat: item.stat,
                      }}
                    >
                      <span className="feedback-text">
                        {renderFeedbackLine(item.text)}
                      </span>
                    </GuidanceTip>
                  </li>
                ))}
              </ul>

              <div className="inline-samples">
                {(promptQuality.samples?.needsWork || []).slice(0, 1).map((s, i) => (
                  <GuidanceTip
                    key={`w-${i}`}
                    wide
                    className="sample-guidance"
                    guidance={s.guidance}
                  >
                    <div className="sample-card sample-compact">
                      <div className="sample-meta">
                        <span className="dim">Weak</span>
                        <GradePill grade={s.grade} score={s.score} />
                      </div>
                      <div className="sample-text">{s.preview}</div>
                    </div>
                  </GuidanceTip>
                ))}
                {(promptQuality.samples?.best || []).slice(0, 1).map((s, i) => (
                  <GuidanceTip
                    key={`b-${i}`}
                    wide
                    className="sample-guidance"
                    guidance={s.guidance}
                  >
                    <div className="sample-card sample-good sample-compact">
                      <div className="sample-meta">
                        <span className="dim">Strong</span>
                        <GradePill grade={s.grade} score={s.score} />
                      </div>
                      <div className="sample-text">{s.preview}</div>
                    </div>
                  </GuidanceTip>
                ))}
              </div>

              <button
                type="button"
                className="btn details-toggle"
                onClick={() => setShowPromptDetails((v) => !v)}
              >
                {showPromptDetails ? "Hide" : "Show"} scoring method
                {showPromptDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {showPromptDetails && <PromptMethodDetails />}
            </div>
          )}

          {guideTab === "efficiency" && (
            <div className="panel-pad compact-pad">
              <div className="score-row-compact">
                <div className="score-big">{efficiency.score ?? "—"}</div>
                <div className="cost-hero cost-hero-tight">
                  <div>
                    <div className="label">Est. cost</div>
                    <div className="cost-value">{formatUsd(efficiency.estimatedCostUsd)}</div>
                  </div>
                  <div>
                    <div className="label">Lines / $</div>
                    <div className="mono" style={{ fontWeight: 600, fontSize: "1.1rem" }}>
                      {efficiency.linesPerDollar != null
                        ? formatNumber(efficiency.linesPerDollar)
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="label">$ / turn</div>
                    <div className="mono" style={{ fontWeight: 600, fontSize: "1.1rem" }}>
                      {formatUsd(efficiency.costPerTurn)}
                    </div>
                  </div>
                  <div>
                    <div className="label">Est. tokens</div>
                    <div className="mono" style={{ fontWeight: 600, fontSize: "1.1rem" }}>
                      {formatTokens(efficiency.totalTokensEst)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="metric-inline">
                <span className="metric-chip">
                  in/out $ <b>
                    {formatUsd(efficiency.inputCostUsd)} / {formatUsd(efficiency.outputCostUsd)}
                  </b>
                </span>
                <span className="metric-chip">
                  ln/1k tok <b>{efficiency.linesPer1kTokens ?? "—"}</b>
                </span>
                <span className="metric-chip">
                  tools/turn <b>{efficiency.toolsPerTurn ?? "—"}</b>
                </span>
                <span className="metric-chip">
                  ln/turn <b>{efficiency.linesPerTurn ?? "—"}</b>
                </span>
                <span className="metric-chip">
                  err <b>{efficiency.errorRate ?? "—"}</b>
                </span>
              </div>

              <ul className="insight-list compact-list">
                {efficiencyInsights.slice(0, 3).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <p className="note-muted" style={{ marginTop: 6 }}>
                Cost estimate uses list rates for {versions.primaryModel || "session models"}{" "}
                (not exact billing). Peak context × turns heuristic.
              </p>

              <button
                type="button"
                className="btn details-toggle"
                onClick={() => setShowEffProjects((v) => !v)}
              >
                {showEffProjects ? "Hide" : "Show"} cost by project
                {showEffProjects ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {showEffProjects && (
                <div className="table-wrap" style={{ maxHeight: 220, marginTop: 8 }}>
                  <table className="eff-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Model*</th>
                        <th>Grade</th>
                        <th>Est. $</th>
                        <th>Ln/$</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectEffRows.map((p) => {
                        const e = p.efficiency || {};
                        return (
                          <tr key={p.cwd} title={p.cwd}>
                            <td>
                              {leafName(p.cwd || p.name)}
                              {p.cloudRepo?.isCloud ? (
                                <Cloud size={11} className="name-cloud" style={{ marginLeft: 4 }} />
                              ) : null}
                            </td>
                            <td className="mono dim" style={{ fontSize: "0.72rem" }}>
                              {(p.models && p.models[0]) || "—"}
                            </td>
                            <td>
                              <GradePill grade={e.grade} score={e.score} />
                            </td>
                            <td className="mono">{formatUsd(e.estimatedCostUsd)}</td>
                            <td className="mono">
                              {e.linesPerDollar != null
                                ? formatNumber(e.linesPerDollar)
                                : "—"}
                            </td>
                            <td className="mono">{e.score ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="note-muted">* First model id recorded on project sessions</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Prompt strategies — full-width coaching pane */}
      <div className="section-block">
        <StrategiesPanel
          strategies={overview?.promptStrategies}
          compact
          onOpenFull={onOpenStrategies}
        />
      </div>

      {/* Two-column: commands + projects */}
      <div className="section-block grid-2-tight ov-secondary">
        <div className="panel">
          <div className="panel-header">
            <h3>
              <Terminal size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Recommended usage
            </h3>
            {onOpenCommands && (
              <button type="button" className="btn" onClick={onOpenCommands}>
                Catalog
              </button>
            )}
          </div>
          <div className="panel-pad compact-pad">
            <div className="command-grid command-grid-tight">
              {(overview?.commandGuidance?.featured || []).slice(0, 4).map((item) => (
                <CommandCard key={item.id} item={item} featured />
              ))}
            </div>
          </div>
        </div>

        <div className="panel overflow-visible">
          <div className="panel-header">
            <h3>
              <FolderKanban size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Top projects
            </h3>
            <span className="meta-pill">hover for cost & versions</span>
          </div>
          <div className="bar-list bar-list-wide">
            {topProjects.length === 0 ? (
              <div className="empty">No projects found</div>
            ) : (
              topProjects.map((p) => (
                <ProjectBarRow key={p.cwd} p={p} maxTurns={maxTurns} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Versions detail strip */}
      <div className="section-block">
        <div className="panel versions-panel">
          <div className="panel-header">
            <h3>
              <Cpu size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Grok & Grok Build versions
            </h3>
          </div>
          <div className="panel-pad compact-pad versions-grid">
            <div>
              <div className="label">Grok Build (CLI)</div>
              <div className="mono" style={{ fontWeight: 600 }}>
                {versions.grokBuild || overview?.version || "—"}
              </div>
              {versions.grokBuildStable && (
                <div className="dim" style={{ fontSize: "0.72rem" }}>
                  stable {versions.grokBuildStable}
                </div>
              )}
            </div>
            <div>
              <div className="label">Grok models used</div>
              <div className="chip-wrap">
                {modelList.length === 0 ? (
                  <span className="dim">—</span>
                ) : (
                  modelList.map((m) => (
                    <span className="metric-chip" key={m.id}>
                      {m.id} <b>{m.count}</b>
                    </span>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="label">Agent profiles</div>
              <div className="chip-wrap">
                {agentList.length === 0 ? (
                  <span className="dim">—</span>
                ) : (
                  agentList.slice(0, 6).map((a) => (
                    <span className="metric-chip" key={a.id}>
                      {a.id} <b>{a.count}</b>
                    </span>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="label">Reasoning effort</div>
              <div className="chip-wrap">
                {(versions.reasoningEffort || []).length === 0 ? (
                  <span className="dim">—</span>
                ) : (
                  (versions.reasoningEffort || []).map((e) => (
                    <span className="metric-chip" key={e.id}>
                      {e.id} <b>{e.count}</b>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="section-block">
        <CollapsibleLiveSessions active={active} onSelectSession={onSelectSession} />
      </div>
    </>
  );
}

function categoryIcon(cat) {
  if (cat.startsWith("Plan")) return <BookOpen size={14} />;
  if (cat.startsWith("Goals")) return <Target size={14} />;
  if (cat.startsWith("Workflows")) return <GitBranch size={14} />;
  if (cat.startsWith("Session")) return <Gauge size={14} />;
  if (cat.startsWith("Quality")) return <Sparkles size={14} />;
  if (cat.startsWith("Memory")) return <Wand2 size={14} />;
  return <Terminal size={14} />;
}

function CommandCard({ item, featured = false }) {
  return (
    <div className={`command-card ${featured ? "is-featured" : ""}`}>
      <div className="command-card-top">
        <code className="command-name">{item.command}</code>
        {item.source && (
          <span className={`source-badge source-${item.source}`}>
            {item.source}
          </span>
        )}
        {item.aliases?.length ? (
          <span className="dim" style={{ fontSize: "0.72rem" }}>
            {item.aliases.join(" · ")}
          </span>
        ) : null}
        <span className="command-cat">{item.category}</span>
      </div>
      <div className="command-summary">{item.summary}</div>
      {item.whyNow?.length > 0 && (
        <ul className="command-why">
          {item.whyNow.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <div className="command-actions">
        <GuidanceTip
          wide
          guidance={{
            title: item.command,
            why: item.when,
            how: item.how,
            example: item.example,
            stat: item.category,
          }}
        >
          <span className="btn" style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}>
            <HelpCircle size={12} /> When & how
          </span>
        </GuidanceTip>
        {item.related?.length > 0 && (
          <span className="dim" style={{ fontSize: "0.72rem" }}>
            Related: {item.related.join(" · ")}
          </span>
        )}
      </div>
      {item.tips?.length > 0 && (
        <div className="command-tips">
          {item.tips.map((t) => (
            <div key={t} className="command-tip-line">
              · {t}
            </div>
          ))}
        </div>
      )}
      <pre className="command-example">{item.example}</pre>
    </div>
  );
}

function CommandGuidancePanel({ guidance, compact = false }) {
  const featured = guidance?.featured || [];
  const byCategory = guidance?.byCategory || [];
  const signals = guidance?.signals || {};

  if (compact) {
    return (
      <>
        <p className="note-muted" style={{ marginTop: 0 }}>
          Prioritized from live signals
          {signals.promptScore != null ? ` · prompt ${signals.promptScore}/100` : ""}
          {signals.efficiencyScore != null
            ? ` · efficiency ${signals.efficiencyScore}/100`
            : ""}
          {signals.contextUtilizationPct
            ? ` · context ~${signals.contextUtilizationPct}%`
            : ""}
          . Use <HelpCircle size={11} style={{ verticalAlign: -1 }} /> for when/how/examples —
          especially <code>/goal</code>, <code>/create-workflow</code>, <code>/plan</code>,{" "}
          <code>/workflow</code>.
        </p>
        <div className="command-grid">
          {featured.slice(0, 6).map((item) => (
            <CommandCard key={item.id} item={item} featured />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Grok Build commands</h2>
          <p>
            Optimal usage of slash commands and skills — ranked for your current
            efficiency and prompt patterns
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="panel-pad">
          <div className="metric-inline">
            <span className="metric-chip">
              prompt quality <b>{signals.promptScore ?? "—"}</b>
            </span>
            <span className="metric-chip">
              efficiency <b>{signals.efficiencyScore ?? "—"}</b>
            </span>
            <span className="metric-chip">
              context <b>
                {signals.contextUtilizationPct != null
                  ? `${signals.contextUtilizationPct}%`
                  : "—"}
              </b>
            </span>
            <span className="metric-chip">
              tools/turn <b>{signals.toolsPerTurn ?? "—"}</b>
            </span>
            <span className="metric-chip">
              cloud repos <b>{signals.cloudProjects ?? 0}</b>
            </span>
            <span className="metric-chip">
              catalog <b>{guidance?.catalogCount ?? "—"}</b>
            </span>
          </div>
          <p className="note-muted">
            Catalog synced to Grok Build slash-command docs
            {guidance?.catalogSource ? ` (${guidance.catalogSource})` : ""}.
            Recommendations re-rank from your live metrics. Power tools:{" "}
            <code>/goal</code>, <code>/plan</code>, <code>/create-workflow</code>,{" "}
            <code>/workflow</code>, <code>/dashboard</code>, <code>/compact</code>.
          </p>
        </div>
      </div>

      <div className="section-block">
        <div className="panel focus-panel">
          <div className="panel-header">
            <h3>
              <Wand2 size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Suggested for you right now
            </h3>
          </div>
          <div className="panel-pad">
            <div className="command-grid">
              {featured.map((item) => (
                <CommandCard key={item.id} item={item} featured />
              ))}
            </div>
          </div>
        </div>
      </div>

      {byCategory.map((group) => (
        <div className="section-block" key={group.category}>
          <div className="panel">
            <div className="panel-header">
              <h3>
                <span style={{ marginRight: 6, verticalAlign: -2 }}>
                  {categoryIcon(group.category)}
                </span>
                {group.category}
              </h3>
              <span className="meta-pill">{group.items.length}</span>
            </div>
            <div className="panel-pad">
              <div className="command-grid">
                {group.items.map((item) => (
                  <CommandCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function ProjectsPage({ projects, onFilterProject }) {
  // Expand all parents by default so subfolders are visible
  const parentCwds = useMemo(
    () => projects.filter((p) => p.hasChildren).map((p) => p.cwd),
    [projects]
  );
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    setExpanded(new Set(parentCwds));
  }, [parentCwds.join("|")]);

  const visible = useMemo(() => {
    const hidden = new Set();
    for (const p of projects) {
      if (p.parentCwd && !expanded.has(p.parentCwd)) {
        // hide if any ancestor is collapsed
        let parent = p.parentCwd;
        let collapse = false;
        while (parent) {
          if (!expanded.has(parent)) {
            collapse = true;
            break;
          }
          const parentNode = projects.find((x) => x.cwd === parent);
          parent = parentNode?.parentCwd || null;
        }
        if (collapse) hidden.add(p.cwd);
      }
    }
    return projects.filter((p) => !hidden.has(p.cwd));
  }, [projects, expanded]);

  const toggle = (cwd, e) => {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Projects</h2>
          <p>
            Usage by project folder — nested under each parent workspace. Click a
            row to filter sessions.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Repo</th>
                <th>Status</th>
                <th>Eff</th>
                <th>Prompts</th>
                <th>Sessions</th>
                <th>Turns</th>
                <th>Tools</th>
                <th>Tokens</th>
                <th>Est. $</th>
                <th>Ln/$</th>
                <th>Duration</th>
                <th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={13} className="empty">
                    No projects
                  </td>
                </tr>
              ) : (
                visible.map((p) => {
                  const sessions = p.hasChildren
                    ? p.rollupSessions
                    : p.sessions;
                  const turns = p.hasChildren ? p.rollupTurns : p.totalTurns;
                  const tools = p.hasChildren
                    ? p.rollupToolCalls
                    : p.totalToolCalls;
                  const tokens = p.hasChildren
                    ? p.rollupTokens
                    : p.totalTokens;
                  const duration = p.hasChildren
                    ? p.rollupDurationSeconds
                    : p.totalDurationSeconds;
                  const active = p.hasChildren
                    ? p.rollupActiveSessions
                    : p.activeSessions;
                  const eff = p.efficiency || {};
                  const pq = p.promptQuality || {};
                  const displayName = p.depth
                    ? leafName(p.relativePath || p.name)
                    : leafName(p.cwd || p.name);

                  return (
                    <tr
                      key={p.cwd}
                      className={`clickable ${p.depth ? "project-child" : "project-root"}`}
                      onClick={() => onFilterProject(p.cwd)}
                      title={[
                        p.cwd,
                        p.lastActiveAt ? `Last run: ${formatDateTime(p.lastActiveAt)}` : "",
                        eff.score != null ? `Efficiency: ${eff.score} (${eff.grade})` : "",
                        pq.avgScore != null ? `Prompts: ${pq.avgScore} (${pq.grade})` : "",
                        p.cloudRepo?.url ? `Cloud: ${p.cloudRepo.url}` : "Local only (no cloud remote)",
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    >
                      <td>
                        <div
                          className="project-name-cell"
                          style={{ paddingLeft: `${(p.depth || 0) * 18}px` }}
                        >
                          {p.hasChildren ? (
                            <button
                              className="tree-toggle"
                              onClick={(e) => toggle(p.cwd, e)}
                              aria-label={expanded.has(p.cwd) ? "Collapse" : "Expand"}
                            >
                              {expanded.has(p.cwd) ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )}
                            </button>
                          ) : (
                            <span className="tree-spacer" />
                          )}
                          <div>
                            <div style={{ fontWeight: p.depth ? 500 : 600 }}>
                              {displayName}
                              {p.hasChildren ? (
                                <span className="dim" style={{ fontWeight: 400, marginLeft: 6, fontSize: "0.75rem" }}>
                                  {p.childCount} subfolder{p.childCount === 1 ? "" : "s"}
                                  {p.ownSessions
                                    ? ` · ${p.ownSessions} at root`
                                    : ""}
                                </span>
                              ) : null}
                            </div>
                            <div className="dim mono truncate" style={{ maxWidth: 360 }}>
                              {p.cwd}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {p.cloudRepo?.isCloud ? (
                          <CloudBadge repo={p.cloudRepo} compact />
                        ) : p.hasChildren ? (
                          <span className="dim">—</span>
                        ) : (
                          <span className="local-badge">local</span>
                        )}
                      </td>
                      <td>
                        {active > 0 ? (
                          <StatusBadge status="active" />
                        ) : (
                          <StatusBadge status="idle" />
                        )}
                      </td>
                      <td>
                        <GradePill grade={eff.grade} score={eff.score} />
                      </td>
                      <td>
                        <GradePill grade={pq.grade} score={pq.avgScore} />
                      </td>
                      <td className="mono">
                        {sessions}
                        {!p.hasChildren && (
                          <span className="dim">
                            {" "}
                            ({p.mainSessions}m/{p.subagentSessions}s)
                          </span>
                        )}
                        {p.hasChildren && p.ownSessions > 0 && (
                          <span className="dim"> ({p.ownSessions} root)</span>
                        )}
                      </td>
                      <td className="mono">{formatNumber(turns)}</td>
                      <td className="mono">{formatNumber(tools)}</td>
                      <td className="mono">{formatTokens(tokens)}</td>
                      <td className="mono">{formatUsd(eff.estimatedCostUsd)}</td>
                      <td className="mono">
                        {eff.linesPerDollar != null
                          ? formatNumber(eff.linesPerDollar)
                          : "—"}
                      </td>
                      <td className="mono">{formatDuration(duration)}</td>
                      <td className="muted">{formatRelative(p.lastActiveAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SessionsPage({
  sessions,
  filters,
  setFilters,
  projects,
  onSelectSession,
  loading,
}) {
  return (
    <>
      <div className="page-header">
        <div>
          <h2>Sessions</h2>
          <p>Per-session status, tokens, tools, and churn</p>
        </div>
      </div>

      <div className="filters">
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-dim)",
            }}
          />
          <input
            className="input"
            style={{ width: "100%", paddingLeft: 34 }}
            placeholder="Search title, id, project…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
        </div>
        <select
          className="select"
          value={filters.project}
          onChange={(e) => setFilters((f) => ({ ...f, project: e.target.value }))}
          style={{ minWidth: 220 }}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.cwd} value={p.cwd}>
              {"··".repeat(p.depth || 0)}
              {p.depth ? " " : ""}
              {p.pathLabel || p.name}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="recent">Recent</option>
          <option value="stale">Stale</option>
          <option value="idle">Idle</option>
        </select>
        <select
          className="select"
          value={filters.kind}
          onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))}
        >
          <option value="">All kinds</option>
          <option value="main">Main</option>
          <option value="subagent">Subagent</option>
        </select>
      </div>

      <div className={`panel ${loading ? "loading" : ""}`}>
        <div className="table-wrap" style={{ maxHeight: "calc(100vh - 260px)" }}>
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Title</th>
                <th>Project</th>
                <th>Model</th>
                <th>Turns</th>
                <th>Tools</th>
                <th>Tokens</th>
                <th>Duration</th>
                <th>Lines</th>
                <th>Last active</th>
                <th>Id</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="empty">
                    No sessions match filters
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr
                    key={s.id}
                    className="clickable"
                    onClick={() => onSelectSession(s.id)}
                  >
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td>
                      <div className="truncate" style={{ maxWidth: 220, fontWeight: 500 }}>
                        {s.title}
                      </div>
                      {String(s.sessionKind || "").startsWith("subagent") && (
                        <div className="dim" style={{ fontSize: "0.7rem" }}>
                          {s.sessionKind}
                        </div>
                      )}
                    </td>
                    <td className="muted" title={s.projectCwd || s.cwd}>
                      {s.projectPath || s.project}
                    </td>
                    <td className="mono dim">{s.modelId || "—"}</td>
                    <td className="mono">{formatNumber(s.signals?.turnCount)}</td>
                    <td className="mono">{formatNumber(s.signals?.toolCallCount)}</td>
                    <td className="mono">{formatTokens(s.signals?.contextTokensUsed)}</td>
                    <td className="mono">
                      {formatDuration(s.signals?.sessionDurationSeconds)}
                    </td>
                    <td className="mono">
                      +{formatNumber(s.signals?.agentLinesAdded)}/−
                      {formatNumber(s.signals?.agentLinesRemoved)}
                    </td>
                    <td className="muted">{formatRelative(s.lastActiveAt)}</td>
                    <td className="mono dim">{shortId(s.id)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState({
    q: "",
    project: "",
    status: "",
    kind: "",
  });
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async (force = false) => {
    setRefreshing(true);
    try {
      const q = force ? "?refresh=1" : "";
      const [ov, sess] = await Promise.all([
        fetchJson(`/api/overview${q}`),
        fetchJson(`/api/sessions${q}`),
      ]);
      setOverview(ov);
      setSessions(sess.sessions || []);
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = setInterval(() => load(false), REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const filteredSessions = useMemo(() => {
    let list = sessions;
    if (filters.project) {
      const p = filters.project.toLowerCase();
      list = list.filter((s) => {
        const projectCwd = (s.projectCwd || s.cwd || "").toLowerCase();
        const name = (s.project || "").toLowerCase();
        const label = (s.projectPath || "").toLowerCase();
        return (
          projectCwd === p ||
          projectCwd.startsWith(p.endsWith("/") ? p : p + "/") ||
          name === p ||
          label === p ||
          label.includes(p)
        );
      });
    }
    if (filters.status) {
      list = list.filter((s) => s.status === filters.status);
    }
    if (filters.kind === "main") {
      list = list.filter(
        (s) => !String(s.sessionKind || "main").startsWith("subagent")
      );
    } else if (filters.kind === "subagent") {
      list = list.filter((s) =>
        String(s.sessionKind || "").startsWith("subagent")
      );
    }
    if (filters.q.trim()) {
      const q = filters.q.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.project.toLowerCase().includes(q) ||
          (s.cwd && s.cwd.toLowerCase().includes(q)) ||
          (s.modelId && s.modelId.toLowerCase().includes(q))
      );
    }
    return list;
  }, [sessions, filters]);

  const projects = overview?.projects || [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">GB</div>
          <div>
            <h1>Grok Build Monitoring</h1>
            <p>
              {overview?.grokHome || "~/.grok"}
              {overview?.versions?.grokBuild || overview?.version
                ? ` · Build ${overview?.versions?.grokBuild || overview?.version}`
                : ""}
              {overview?.versions?.primaryModel
                ? ` · ${overview.versions.primaryModel}`
                : ""}
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          {overview?.versions?.primaryModel && (
            <span className="meta-pill" title="Primary Grok model in sessions">
              <Cpu size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
              {overview.versions.primaryModel}
            </span>
          )}
          <span className="meta-pill">
            <Clock size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
            {overview?.scannedAt
              ? `scanned ${formatRelative(overview.scannedAt)}`
              : "—"}
          </span>
          <button
            className={`btn ${autoRefresh ? "btn-primary" : ""}`}
            onClick={() => setAutoRefresh((v) => !v)}
            title="Toggle auto-refresh"
          >
            <Activity size={14} />
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button className="btn" onClick={() => load(true)} disabled={refreshing}>
            {refreshing ? <span className="spinner" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          Failed to load: {error}. Is the API server running on port 3847?
        </div>
      )}

      <div className="layout">
        <nav className="sidebar">
          <button
            className={`nav-item ${tab === "overview" ? "active" : ""}`}
            onClick={() => setTab("overview")}
          >
            <LayoutDashboard size={16} /> Overview
          </button>
          <button
            className={`nav-item ${tab === "refiner" ? "active" : ""}`}
            onClick={() => setTab("refiner")}
          >
            <WandSparkles size={16} /> Refiner
          </button>
          <button
            className={`nav-item ${tab === "strategies" ? "active" : ""}`}
            onClick={() => setTab("strategies")}
          >
            <Lightbulb size={16} /> Strategies
          </button>
          <button
            className={`nav-item ${tab === "commands" ? "active" : ""}`}
            onClick={() => setTab("commands")}
          >
            <Terminal size={16} /> Commands
          </button>
          <button
            className={`nav-item ${tab === "projects" ? "active" : ""}`}
            onClick={() => setTab("projects")}
          >
            <FolderKanban size={16} /> Projects
          </button>
          <button
            className={`nav-item ${tab === "sessions" ? "active" : ""}`}
            onClick={() => setTab("sessions")}
          >
            <MessagesSquare size={16} /> Sessions
          </button>
          <div style={{ marginTop: "1.5rem", padding: "0 0.85rem" }}>
            <div className="section-title">Legend</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <StatusBadge status="active" />
              <StatusBadge status="recent" />
              <StatusBadge status="stale" />
              <StatusBadge status="idle" />
            </div>
            <div className="dim" style={{ marginTop: 12, fontSize: "0.7rem", lineHeight: 1.4 }}>
              <div>
                <Cpu size={11} style={{ verticalAlign: -1 }} /> tokens = last context size
              </div>
              <div>
                <Wrench size={11} style={{ verticalAlign: -1 }} /> tools from signals.json
              </div>
              <div>
                <FileCode2 size={11} style={{ verticalAlign: -1 }} /> lines from agent edits
              </div>
            </div>
          </div>
        </nav>

        <main className="main">
          {loading && !overview ? (
            <div className="empty">
              <span className="spinner" /> Loading Grok data…
            </div>
          ) : (
            <>
              {tab === "overview" && (
                <OverviewPage
                  overview={overview}
                  onSelectSession={setSelectedId}
                  onOpenCommands={() => setTab("commands")}
                  onOpenStrategies={() => setTab("strategies")}
                />
              )}
              {tab === "refiner" && <RefinerPage />}
              {tab === "strategies" && (
                <StrategiesPanel strategies={overview?.promptStrategies} />
              )}
              {tab === "commands" && (
                <CommandGuidancePanel guidance={overview?.commandGuidance} />
              )}
              {tab === "projects" && (
                <ProjectsPage
                  projects={projects}
                  onFilterProject={(cwdOrName) => {
                    setFilters((f) => ({ ...f, project: cwdOrName }));
                    setTab("sessions");
                  }}
                />
              )}
              {tab === "sessions" && (
                <SessionsPage
                  sessions={filteredSessions}
                  filters={filters}
                  setFilters={setFilters}
                  projects={projects}
                  onSelectSession={setSelectedId}
                  loading={refreshing}
                />
              )}
            </>
          )}
        </main>
      </div>

      {selectedId && (
        <SessionDrawer sessionId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
