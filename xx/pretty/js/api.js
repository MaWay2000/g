export async function fetchJson(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}
export function jsonBasePath() {
  const pathname = window.location?.pathname || "/";
  if (pathname.endsWith("/")) return `${pathname}jsons/`;
  const lastSlash = pathname.lastIndexOf("/");
  const base = lastSlash >= 0 ? pathname.slice(0, lastSlash + 1) : "/";
  return `${base}jsons/`;
}
export function safeArray(x) {
  return Array.isArray(x) ? x : (x ? [x] : []);
}
export function toUtcString(ts) {
  if (ts == null) return "";
  try {
    if (typeof ts === "string") {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) return d.toISOString().replace("T"," ").replace("Z","Z");
      return ts;
    }
    if (typeof ts === "number") {
      const ms = ts > 2e12 ? ts : (ts > 2e9 ? ts * 1000 : ts * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().replace("T"," ").replace("Z","Z");
    }
  } catch {}
  return "";
}
export function durString(seconds) {
  if (seconds == null || isNaN(seconds)) return "";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `${h}h${mm}m${r}s`;
  return `${mm}m${r}s`;
}
export function replayUrlFromMatch(m) {
  const base = jsonBasePath();
  const normalizeReplayPath = (path) => {
    if (!path) return "";
    if (path.includes("://")) return path;
    if (path.startsWith("/")) {
      if (path.startsWith("/jsons/")) return `${base}${path.slice("/jsons/".length)}`;
      return path;
    }
    const cleaned = path.startsWith("jsons/") ? path.slice("jsons/".length) : path;
    return `${base}${cleaned}`;
  };
  const direct = m?.replay_url || m?.replayUrl || m?.replay || "";
  if (typeof direct === "string" && direct.length > 0) return normalizeReplayPath(direct);
  const fn = m?.replay_file || m?.replayFile || m?.replay_filename || m?.replayFilename || "";
  if (typeof fn === "string" && fn.length > 0) return `${base}replays/${fn}`;
  return "";
}
