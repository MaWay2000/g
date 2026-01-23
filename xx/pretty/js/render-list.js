import { safeArray, toUtcString, durString, replayUrlFromMatch } from "./api.js";

export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function matchId(m, idx) { return m?.id || m?.game_id || m?.gameId || m?.uuid || `game_${idx+1}`; }
function mapName(m) { return m?.map || m?.mapName || m?.map_name || "(unknown)"; }
function whenUtc(m) { return toUtcString(m?.started_utc || m?.start_utc || m?.startUtc || m?.startedAt || m?.start_time || m?.when || m?.ts); }
function durationSeconds(m) {
  const v = m?.duration_s ?? m?.durationSec ?? m?.duration ?? null;
  return (typeof v === "number") ? v : (v == null ? null : Number(v));
}
function winners(m) { return safeArray(m?.winners || m?.winner || m?.won || m?.winning_players || m?.winningPlayers); }
function losers(m) { return safeArray(m?.losers || m?.loser || m?.lost || m?.losing_players || m?.losingPlayers); }

function nameOf(x) { return typeof x === "string" ? x : (x?.name ?? x?.player ?? x?.nick ?? ""); }
function joinNames(xs) { return safeArray(xs).map(nameOf).filter(Boolean).join(", "); }

function posNameMap(m) {
  const mp = new Map();

  const plist = Array.isArray(m?.players) ? m.players : [];
  for (const p of plist) {
    const nm = p?.name;
    const pos = p?.position ?? p?.index;
    if (nm && (pos === 0 || pos)) mp.set(String(pos), nm);
  }

  const pdata = Array.isArray(m?.playerData) ? m.playerData : [];
  pdata.forEach((p, i) => {
    const nm = p?.name;
    const pos = p?.position ?? p?.index ?? i;
    if (nm && (pos === 0 || pos)) mp.set(String(pos), nm);
  });

  return mp;
}

function researchCounts(m) {
  // Best: per-tech list
  const rc = Array.isArray(m?.researchComplete) ? m.researchComplete : [];
  if (rc.length) {
    const counts = new Map();
    for (const e of rc) {
      const pos = e?.position ?? e?.player ?? e?.index;
      if (!(pos === 0 || pos)) continue;
      const k = String(pos);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    if (counts.size) return counts;
  }

  // Fallback: totals in playerData
  const pdata = Array.isArray(m?.playerData) ? m.playerData : [];
  const counts = new Map();
  pdata.forEach((p, i) => {
    const pos = p?.position ?? p?.index ?? i;
    const n = p?.researchComplete;
    if (!(pos === 0 || pos)) return;
    if (typeof n === "number") counts.set(String(pos), n);
  });

  return counts.size ? counts : null;
}

function researchCell(m) {
  const counts = researchCounts(m);
  if (!counts) return `<span class="muted small">—</span>`;

  const names = posNameMap(m);
  const keys = [...counts.keys()].sort((a,b) => Number(a)-Number(b));
  const pairs = keys.map(k => ({
    pos: k,
    name: names.get(k) || `P${k}`,
    n: counts.get(k) || 0
  }));

  const compact = (pairs.length === 2)
    ? `${pairs[0].n}-${pairs[1].n}`
    : pairs.map(p => p.n).join("/");

  const tooltip = pairs.map(p => `${p.name}: ${p.n}`).join(" | ");
  return `<code title="${escapeHtml(tooltip)}">${escapeHtml(compact)}</code>`;
}

export function buildGamesRows(matches, onClick, onHexClick) {
  const rows = [];
  matches.forEach((m, idx) => {
    const id = matchId(m, idx);
    const map = mapName(m);
    const when = whenUtc(m);
    const dur = durString(durationSeconds(m) ?? 0);

    const w = winners(m);
    const l = losers(m);

    const result = (w.length || l.length)
      ? `${joinNames(w)} ${w.length ? "won" : ""}${(w.length && l.length) ? " vs " : ""}${joinNames(l)} ${l.length ? "lost" : ""}`.trim()
      : (m?.result || m?.outcome || "—");

    const replayUrl = replayUrlFromMatch(m);
    const replayCell = replayUrl
      ? `<a href="${escapeHtml(replayUrl)}" download>Download</a>`
      : `<span class="muted small">—</span>`;

    rows.push(`
      <tr data-id="${encodeURIComponent(id)}" role="link" tabindex="0" aria-label="Open game details for ${escapeHtml(map)}">
        <td><a href="#" class="hexlink" title="Research timeline" data-hex="${encodeURIComponent(id)}" aria-label="Research timeline"></a></td>
        <td><a class="maplink" href="./games.html?gid=${encodeURIComponent(id)}">${escapeHtml(map)}</a></td>
        <td><code>${escapeHtml(when || "")}</code></td>
        <td><code>${escapeHtml(dur || "")}</code></td>
        <td>${researchCell(m)}</td>
        <td>${escapeHtml(result)}</td>
        <td>${replayCell}</td>
      </tr>
    `);
  });

  const tbody = document.getElementById("gamesBody");
  tbody.innerHTML = rows.join("");

  // IMPORTANT: allow clicking multiple games (no once:true)
  tbody.onclick = (e) => {
  // Allow replay download links to work (don’t hijack clicks)
  const dl = e.target.closest('a[download], a[href][download]');
  if (dl) return;

  // If the user is trying to open a link in a new tab/window, let the browser do it
  const isModified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1;
  const mapLink = e.target.closest('a.maplink');
  if (mapLink && isModified) return;

  const hex = e.target.closest('a[data-hex]');
  if (hex) {
    e.preventDefault();
    const id = decodeURIComponent(hex.getAttribute("data-hex"));
    if (typeof onHexClick === "function") onHexClick(id);
    return;
  }

  const tr = e.target.closest("tr[data-id]");
  if (!tr) return;
  e.preventDefault();
  const id = decodeURIComponent(tr.getAttribute("data-id"));
  onClick(id);
};

  tbody.onkeydown = (e) => {
    if (e.target.closest("a, button, input, select, textarea")) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    e.preventDefault();
    const id = decodeURIComponent(tr.getAttribute("data-id"));
    onClick(id);
  };
}
