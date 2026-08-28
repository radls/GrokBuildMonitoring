export function formatNumber(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const num = Number(n);
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(Math.round(num));
}

export function formatTokens(n) {
  if (n == null) return "—";
  return formatNumber(n);
}

export function formatDuration(seconds) {
  if (seconds == null || seconds <= 0) return "—";
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

export function formatRelative(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function shortId(id) {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function leafName(cwdOrName) {
  if (!cwdOrName) return "—";
  const s = String(cwdOrName).replace(/\/+$/, "");
  const parts = s.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || s;
}

export function gradeClass(grade) {
  if (!grade) return "grade-na";
  return `grade-${String(grade).toLowerCase()}`;
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

/** Format USD cost (estimates). */
export function formatUsd(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v === 0) return "$0";
  if (Math.abs(v) < 0.01) return `$${v.toFixed(4)}`;
  if (Math.abs(v) < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}
