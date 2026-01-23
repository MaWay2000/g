import { fetchJson, safeArray } from "./api.js";
import { buildGamesRows } from "./render-list.js";
import { showDetail } from "./render-detail.js";

const MATCHES_URL = "/jsons/matchstats.json";

let allMatches = [];

const state = {
  q: "",
  days: "all",        // all | 1 | 7 | 30
  limit: 50,
  sort: "when",       // when | duration | map | result
  dir: "desc",        // asc | desc
  hideMM: false,
  currentGid: null,
  loaded: false,
};

const $ = (id) => document.getElementById(id);

const els = {
  q: null,
  days: null,
  limit: null,
  sort: null,
  dir: null,
  hideMM: null,
  refresh: null,
  status: null,
  countLine: null,
  detailCard: null,
  closeDetail: null,
  copyLink: null,
};

function normalizeMatches(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.matches)) return data.matches;
  if (Array.isArray(data?.games)) return data.games;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function pickId(m) {
  return m?.id ?? m?.game_id ?? m?.gameId ?? m?.uuid ?? "";
}

function getStartTs(m) {
  return Date.parse(m?.started_utc || m?.start_utc || m?.startUtc || m?.startedAt || m?.start_time || m?.when || m?.ts || 0) || 0;
}

function mapName(m) {
  return String(m?.map || m?.mapName || m?.map_name || "").trim();
}

function durationSeconds(m) {
  const v = m?.duration_s ?? m?.durationSec ?? m?.duration;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nameOf(x) {
  return typeof x === "string" ? x : (x?.name ?? x?.player ?? x?.nick ?? "");
}

function joinNames(xs) {
  return safeArray(xs).map(nameOf).filter(Boolean).join(", ");
}

function resultString(m) {
  const w = safeArray(m?.winners || m?.winner || m?.won || m?.winning_players || m?.winningPlayers);
  const l = safeArray(m?.losers || m?.loser || m?.lost || m?.losing_players || m?.losingPlayers);

  const wn = joinNames(w);
  const ln = joinNames(l);

  if (wn && ln) return `${wn} won vs ${ln} lost`;
  if (wn) return `${wn} won`;
  if (ln) return `${ln} lost`;
  return String(m?.result || m?.outcome || "—");
}

function setStatus(msg) {
  if (els.status) els.status.textContent = msg;
}

function clampInt(x, fallback, min, max) {
  const n = parseInt(String(x ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function readStateFromUrl() {
  const p = new URLSearchParams(window.location.search);

  state.q = p.get("q") ?? "";
  state.days = p.get("days") ?? "all";
  if (!["all","1","7","30"].includes(state.days)) state.days = "all";

  state.limit = clampInt(p.get("limit"), 50, 10, 1000);
  state.sort = p.get("sort") ?? "when";
  if (!["when","duration","map","result"].includes(state.sort)) state.sort = "when";

  state.dir = p.get("dir") ?? "desc";
  if (!["asc","desc"].includes(state.dir)) state.dir = "desc";

  state.hideMM = p.get("hideMM") === "1";

  state.currentGid = p.get("gid") ?? null;
  if (state.currentGid === "") state.currentGid = null;
}

function writeUrl({ replace = true, includeGid = true } = {}) {
  const p = new URLSearchParams();

  const q = (els.q?.value || "").trim();
  if (q) p.set("q", q);

  const days = els.days?.value || "all";
  if (days && days !== "all") p.set("days", days);

  const limit = els.limit?.value || "50";
  if (limit && limit !== "50") p.set("limit", limit);

  const sort = els.sort?.value || "when";
  if (sort && sort !== "when") p.set("sort", sort);

  const dir = state.dir || "desc";
  if (dir && dir !== "desc") p.set("dir", dir);

  if (els.hideMM?.checked) p.set("hideMM", "1");

  if (includeGid && state.currentGid) p.set("gid", String(state.currentGid));

  const base = window.location.pathname;
  const qs = p.toString();
  const url = qs ? `${base}?${qs}` : base;

  if (replace) history.replaceState({ gid: includeGid ? state.currentGid : null }, "", url);
  else history.pushState({ gid: includeGid ? state.currentGid : null }, "", url);
}

function updateDirButton() {
  if (!els.dir) return;
  els.dir.textContent = state.dir === "asc" ? "↑" : "↓";
}

function applyFiltersAndSort({ updateUrl: doUpdateUrl = true } = {}) {
  state.q = (els.q?.value || "").trim();
  state.days = els.days?.value || "all";
  state.limit = clampInt(els.limit?.value, 50, 10, 1000);
  state.sort = els.sort?.value || "when";
  state.hideMM = !!els.hideMM?.checked;

  // Filter
  const qLower = state.q.toLowerCase();
  const now = Date.now();
  const daysN = state.days === "all" ? null : Number(state.days);
  const minTs = (daysN && Number.isFinite(daysN)) ? (now - (daysN * 86400 * 1000)) : null;

  let filtered = allMatches.filter((m) => {
    // Days range
    if (minTs != null) {
      const ts = getStartTs(m);
      if (!ts || ts < minTs) return false;
    }

    // Hide matchmaking (best-effort)
    if (state.hideMM) {
      const blob = `${mapName(m)} ${String(m?.game || "")}`.toLowerCase();
      if (blob.includes("matchmaking")) return false;
    }

    if (!qLower) return true;

    const map = mapName(m).toLowerCase();
    const players = safeArray(m?.players).map(p => nameOf(p).toLowerCase()).join(" ");
    const wl = JSON.stringify([m?.winners, m?.losers, m?.result]).toLowerCase();
    return map.includes(qLower) || players.includes(qLower) || wl.includes(qLower);
  });

  // Sort
  const dirMul = state.dir === "asc" ? 1 : -1;

  filtered.sort((a, b) => {
    if (state.sort === "duration") {
      const da = durationSeconds(a);
      const db = durationSeconds(b);
      if (da !== db) return (da - db) * dirMul;
    } else if (state.sort === "map") {
      const ma = mapName(a).toLowerCase();
      const mb = mapName(b).toLowerCase();
      const c = ma.localeCompare(mb);
      if (c !== 0) return c * dirMul;
    } else if (state.sort === "result") {
      const ra = resultString(a).toLowerCase();
      const rb = resultString(b).toLowerCase();
      const c = ra.localeCompare(rb);
      if (c !== 0) return c * dirMul;
    } else {
      // when (default)
      const ta = getStartTs(a);
      const tb = getStartTs(b);
      if (ta !== tb) return (ta - tb) * dirMul;
    }

    // Tie-break: newest first by default, then id
    const ta = getStartTs(a);
    const tb = getStartTs(b);
    if (ta !== tb) return (tb - ta);

    const ida = String(pickId(a));
    const idb = String(pickId(b));
    return ida.localeCompare(idb);
  });

  const totalFiltered = filtered.length;
  const shown = filtered.slice(0, state.limit);

  buildGamesRows(shown, (gid) => openById(gid, { updateUrl: true, push: true }), openResearchById);

  if (els.countLine) {
    const parts = [];
    parts.push(`Showing ${shown.length} / ${totalFiltered} filtered`);
    parts.push(`Total: ${allMatches.length}`);
    els.countLine.textContent = parts.join(" · ");
  }

  if (doUpdateUrl) writeUrl({ replace: true, includeGid: true });
}

// Open the Research Timeline page for this game id
function openResearchById(id) {
  const gid = encodeURIComponent(String(id ?? ""));
  window.location.href = `./research-timeline.html?gid=${gid}`;
}

function closeDetail({ updateUrl = true } = {}) {
  if (els.detailCard) els.detailCard.hidden = true;
  state.currentGid = null;
  if (updateUrl) writeUrl({ replace: true, includeGid: false });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text ?? ""));
    return true;
  } catch {
    return false;
  }
}

async function onCopyLink() {
  const btn = els.copyLink;
  if (!btn) return;

  const ok = await copyText(window.location.href);
  const old = btn.textContent;
  btn.textContent = ok ? "Copied!" : "Copy failed";
  setTimeout(() => { btn.textContent = old; }, 900);

  if (!ok) {
    // last-resort fallback
    try { window.prompt("Copy this link:", window.location.href); } catch {}
  }
}

function openById(id, { updateUrl = true, push = false, scroll = true } = {}) {
  if (!id) return;

  const match = allMatches.find(x => (x?.id || x?.game_id || x?.gameId || x?.uuid) == id);
  if (!match) {
    setStatus(`Match not found: ${id}`);
    return;
  }

  state.currentGid = String(id);

  showDetail(match);

  if (els.detailCard) {
    els.detailCard.hidden = false;
    if (scroll) els.detailCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (updateUrl) writeUrl({ replace: !push, includeGid: true });
}

function openFromUrl() {
  const p = new URLSearchParams(window.location.search);
  const gid = p.get("gid");
  if (gid) {
    openById(gid, { updateUrl: false, push: false, scroll: false });
  } else {
    closeDetail({ updateUrl: false });
  }
}

async function refresh() {
  setStatus("Loading…");
  try {
    const data = await fetchJson(`${MATCHES_URL}?ts=${Date.now()}`, 15000);
    allMatches = normalizeMatches(data);
    setStatus(`Loaded ${allMatches.length} games`);
    state.loaded = true;

    applyFiltersAndSort({ updateUrl: false });
    openFromUrl();
  } catch (e) {
    setStatus(`Error: ${e?.message || e}`);
  }
}

function wireEvents() {
  els.refresh?.addEventListener("click", refresh);

  const onChange = () => applyFiltersAndSort({ updateUrl: true });
  els.q?.addEventListener("input", onChange);
  els.days?.addEventListener("change", onChange);
  els.limit?.addEventListener("change", onChange);
  els.sort?.addEventListener("change", onChange);
  els.hideMM?.addEventListener("change", onChange);

  els.dir?.addEventListener("click", () => {
    state.dir = state.dir === "asc" ? "desc" : "asc";
    updateDirButton();
    applyFiltersAndSort({ updateUrl: true });
  });

  els.closeDetail?.addEventListener("click", () => closeDetail({ updateUrl: true }));
  els.copyLink?.addEventListener("click", onCopyLink);

  // Back/forward support for ?gid=
  window.addEventListener("popstate", () => {
    if (!state.loaded) return;
    openFromUrl();
  });
}

function initFromState() {
  // Fill controls from URL-derived state
  if (els.q) els.q.value = state.q;
  if (els.days) els.days.value = state.days;
  if (els.limit) els.limit.value = String(state.limit);
  if (els.sort) els.sort.value = state.sort;
  if (els.hideMM) els.hideMM.checked = state.hideMM;
  updateDirButton();
}

document.addEventListener("DOMContentLoaded", () => {
  els.q = $("q");
  els.days = $("days");
  els.limit = $("limit");
  els.sort = $("sort");
  els.dir = $("dir");
  els.hideMM = $("hideMM");
  els.refresh = $("refresh");
  els.status = $("status");
  els.countLine = $("countLine");
  els.detailCard = $("detailCard");
  els.closeDetail = $("closeDetail");
  els.copyLink = $("copyLink");

  readStateFromUrl();
  initFromState();
  wireEvents();

  refresh();
});
