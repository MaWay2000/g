import { fetchJson, jsonBasePath, safeArray, toUtcString, durString, replayUrlFromMatch } from "./api.js";
import { showDetail } from "./render-detail.js";
import { escapeHtml } from "./render-list.js";

const MATCHES_URL = `${jsonBasePath()}matchstats.json`;

let allMatches = [];

const state = {
  q: "",
  days: "all",         // all | 1 | 7 | 30
  limit: 50,
  sort: "when",        // when | duration | map | result
  dir: "desc",         // asc | desc
  hideMM: false,
  mode: "all",         // all | 1v1 | 3v1 | ...
  map: "",             // exact map name
  groupByMap: false,
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
  groupByMap: null,
  refresh: null,
  status: null,
  countLine: null,
  gamesBody: null,
  groupWrap: null,
  detailCard: null,
  closeDetail: null,
  copyLink: null,
  modePills: null,
  mapGallery: null,
  clearMap: null,
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
  return Date.parse(
    m?.started_utc || m?.start_utc || m?.startUtc || m?.startedAt || m?.start_time || m?.when || m?.ts || 0
  ) || 0;
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

function deriveModeFromMap(map) {
  const s = String(map || "");
  const m1 = s.match(/_(\d+v\d+)(?:\b|_)/i);
  if (m1?.[1]) return m1[1].toLowerCase();
  const m2 = s.match(/\b(\d+v\d+)\b/i);
  if (m2?.[1]) return m2[1].toLowerCase();
  return "other";
}

function niceMode(mode) {
  if (mode === "all") return "All";
  if (mode === "other") return "Other";
  return mode;
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
  if (![["all"],["1"],["7"],["30"]].flat().includes(state.days)) state.days = "all";

  state.limit = clampInt(p.get("limit"), 50, 10, 1000);
  state.sort = p.get("sort") ?? "when";
  if (![["when"],["duration"],["map"],["result"]].flat().includes(state.sort)) state.sort = "when";

  state.dir = p.get("dir") ?? "desc";
  if (![["asc"],["desc"]].flat().includes(state.dir)) state.dir = "desc";

  state.hideMM = p.get("hideMM") === "1";

  state.mode = (p.get("mode") ?? "all").toLowerCase();
  if (!state.mode) state.mode = "all";

  state.map = p.get("map") ?? "";

  state.groupByMap = p.get("group") === "1";

  state.currentGid = p.get("gid") ?? null;
  if (state.currentGid === "") state.currentGid = null;
}

function buildUrl({ includeGid = true } = {}) {
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

  if (state.mode && state.mode !== "all") p.set("mode", state.mode);
  if (state.map) p.set("map", state.map);
  if (els.groupByMap?.checked) p.set("group", "1");

  if (includeGid && state.currentGid) p.set("gid", String(state.currentGid));

  const base = window.location.pathname;
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

function writeUrl({ replace = true, includeGid = true } = {}) {
  const url = buildUrl({ includeGid });
  if (replace) history.replaceState({ gid: includeGid ? state.currentGid : null }, "", url);
  else history.pushState({ gid: includeGid ? state.currentGid : null }, "", url);
}

function updateDirButton() {
  if (!els.dir) return;
  els.dir.textContent = state.dir === "asc" ? "↑" : "↓";
}

function baseFilterMatches({ ignoreMode = false, ignoreMap = false } = {}) {
  const qLower = (els.q?.value || "").trim().toLowerCase();
  const now = Date.now();
  const days = els.days?.value || "all";
  const daysN = days === "all" ? null : Number(days);
  const minTs = (daysN && Number.isFinite(daysN)) ? (now - (daysN * 86400 * 1000)) : null;

  const hideMM = !!els.hideMM?.checked;

  const mode = ignoreMode ? "all" : (state.mode || "all");
  const map = ignoreMap ? "" : (state.map || "");

  return allMatches.filter((m) => {
    if (minTs != null) {
      const ts = getStartTs(m);
      if (!ts || ts < minTs) return false;
    }

    if (hideMM) {
      const blob = `${mapName(m)} ${String(m?.game || "")}`.toLowerCase();
      if (blob.includes("matchmaking")) return false;
    }

    if (mode !== "all") {
      const md = deriveModeFromMap(mapName(m));
      if (md !== mode) return false;
    }

    if (map) {
      if (mapName(m) !== map) return false;
    }

    if (!qLower) return true;

    const mp = mapName(m).toLowerCase();
    const players = safeArray(m?.players).map(p => nameOf(p).toLowerCase()).join(" ");
    const wl = JSON.stringify([m?.winners, m?.losers, m?.result]).toLowerCase();
    return mp.includes(qLower) || players.includes(qLower) || wl.includes(qLower);
  });
}

function sortMatches(arr) {
  const dirMul = state.dir === "asc" ? 1 : -1;
  arr.sort((a, b) => {
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
      const ta = getStartTs(a);
      const tb = getStartTs(b);
      if (ta !== tb) return (ta - tb) * dirMul;
    }

    // tie-breakers
    const ta = getStartTs(a);
    const tb = getStartTs(b);
    if (ta !== tb) return (tb - ta);

    const ida = String(pickId(a));
    const idb = String(pickId(b));
    return ida.localeCompare(idb);
  });
}

function renderModePills() {
  if (!els.modePills) return;

  // counts within base filters, ignoring mode (so you can see what switching would do)
  const base = baseFilterMatches({ ignoreMode: true, ignoreMap: false });
  const counts = new Map();
  for (const m of base) {
    const md = deriveModeFromMap(mapName(m));
    counts.set(md, (counts.get(md) || 0) + 1);
  }

  const total = base.length;
  const items = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const parts = [];
  parts.push(
    `<button class="pillbtn ${state.mode === "all" ? "active" : ""}" data-mode="all" type="button">All <span class="count">${total}</span></button>`
  );

  for (const [mode, n] of items) {
    parts.push(
      `<button class="pillbtn ${state.mode === mode ? "active" : ""}" data-mode="${escapeHtml(mode)}" type="button">${escapeHtml(niceMode(mode))} <span class="count">${n}</span></button>`
    );
  }

  els.modePills.innerHTML = parts.join("");
}

function renderMapGallery() {
  if (!els.mapGallery) return;

  // counts within base filters, ignoring map (so you can browse maps within current mode/search)
  const base = baseFilterMatches({ ignoreMode: false, ignoreMap: true });
  const counts = new Map();
  for (const m of base) {
    const mp = mapName(m) || "(unknown)";
    counts.set(mp, (counts.get(mp) || 0) + 1);
  }

  const items = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // show a reasonable number of cards (keep UI fast)
  const MAX = 30;
  const top = items.slice(0, MAX);

  // ensure selected map is visible
  if (state.map && !top.some(([k]) => k === state.map)) {
    const n = counts.get(state.map) || 0;
    top.unshift([state.map, n]);
  }

  const html = top.map(([mp, n]) => {
    const active = state.map === mp ? "active" : "";
    const modeTag = deriveModeFromMap(mp);
    return `
      <div class="mapcard ${active}" data-map="${escapeHtml(mp)}" role="button" tabindex="0" aria-label="Filter map ${escapeHtml(mp)}">
        <div class="mapname" title="${escapeHtml(mp)}">${escapeHtml(mp)}</div>
        <div class="mapmeta">
          <span class="maptag">${escapeHtml(niceMode(modeTag))}</span>
          <span class="maptag">${n} games</span>
        </div>
      </div>
    `;
  }).join("");

  els.mapGallery.innerHTML = html || `<div class="muted" style="padding:12px">No maps found for this filter.</div>`;
}

function rowHtml(m, idx) {
  const id = String(pickId(m) || `game_${idx + 1}`);
  const mp = mapName(m) || "(unknown)";
  const when = toUtcString(m?.started_utc || m?.start_utc || m?.startUtc || m?.startedAt || m?.start_time || m?.when || m?.ts);
  const dur = durString(durationSeconds(m));
  const res = resultString(m);

  const replayUrl = replayUrlFromMatch(m);
  const replayCell = replayUrl
    ? `<a href="${escapeHtml(replayUrl)}" download>Download</a>`
    : `<span class="muted small">—</span>`;

  // Map link: point to this page, preserving current filters, but swapping gid
  const oldGid = state.currentGid;
  state.currentGid = id;
  const href = buildUrl({ includeGid: true });
  state.currentGid = oldGid;

  return `
    <tr data-id="${encodeURIComponent(id)}">
      <td><a href="#" class="hexlink" title="Research timeline" data-hex="${encodeURIComponent(id)}" aria-label="Research timeline"></a></td>
      <td><a class="maplink" href="${escapeHtml(href)}">${escapeHtml(mp)}</a></td>
      <td><code>${escapeHtml(when || "")}</code></td>
      <td><code>${escapeHtml(dur || "")}</code></td>
      <td><span class="muted small">—</span></td>
      <td>${escapeHtml(res)}</td>
      <td>${replayCell}</td>
    </tr>
  `;
}

function wireClickDelegation(root) {
  // delegate clicks for any table rows rendered inside root
  root.onclick = (e) => {
    // allow replay downloads
    const dl = e.target.closest('a[download], a[href][download]');
    if (dl) return;

    // allow modified-click on map links (new tab etc.)
    const isModified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1;
    const mapLink = e.target.closest('a.maplink');
    if (mapLink && isModified) return;

    const hex = e.target.closest('a[data-hex]');
    if (hex) {
      e.preventDefault();
      const id = decodeURIComponent(hex.getAttribute('data-hex'));
      openResearchById(id);
      return;
    }

    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    e.preventDefault();
    const id = decodeURIComponent(tr.getAttribute('data-id'));
    openById(id, { updateUrl: true, push: true });
  };
}

function renderList(shown, totalFiltered) {
  if (!els.gamesBody || !els.groupWrap) return;

  // toggle views
  if (state.groupByMap) {
    // hide flat table body; show grouped content
    els.gamesBody.innerHTML = "";
    const tbl = els.gamesBody.closest("table");
    if (tbl) tbl.hidden = true;
    els.groupWrap.hidden = false;

    // group in the order of the sorted "shown" list (keep sort semantics)
    const groups = new Map();
    for (const m of shown) {
      const k = mapName(m) || "(unknown)";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    }

    const parts = [];
    for (const [k, arr] of groups.entries()) {
      const latest = Math.max(...arr.map(getStartTs));
      const latestStr = latest ? toUtcString(latest) : "";

      parts.push(`
        <details class="groupdetails" open>
          <summary>
            <span>${escapeHtml(k)} <span class="groupsub">(${arr.length})</span></span>
            <span class="groupmeta">${escapeHtml(latestStr)}</span>
          </summary>
          <table class="table" aria-label="Games">
            <thead>
              <tr>
                <th>Game</th>
                <th>Map</th>
                <th>When (UTC)</th>
                <th>Duration</th>
                <th>Research</th>
                <th>Result</th>
                <th>Replay</th>
              </tr>
            </thead>
            <tbody class="gamesBody">
              ${arr.map((m, i) => rowHtml(m, i)).join("")}
            </tbody>
          </table>
        </details>
      `);
    }

    els.groupWrap.innerHTML = parts.join("") || `<div class="muted">No games found.</div>`;
    wireClickDelegation(els.groupWrap);
  } else {
    // show flat table
    const tbl = els.gamesBody.closest("table");
    if (tbl) tbl.hidden = false;
    els.groupWrap.hidden = true;
    els.groupWrap.innerHTML = "";

    els.gamesBody.innerHTML = shown.map((m, i) => rowHtml(m, i)).join("");
    wireClickDelegation(els.gamesBody);
  }

  if (els.countLine) {
    els.countLine.textContent = `Showing ${shown.length} / ${totalFiltered} filtered · Total: ${allMatches.length}`;
  }
}

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

function applyFiltersAndSort({ updateUrl: doUpdateUrl = true } = {}) {
  state.q = (els.q?.value || "").trim();
  state.days = els.days?.value || "all";
  state.limit = clampInt(els.limit?.value, 50, 10, 1000);
  state.sort = els.sort?.value || "when";
  state.hideMM = !!els.hideMM?.checked;
  state.groupByMap = !!els.groupByMap?.checked;

  const filtered = baseFilterMatches({ ignoreMode: false, ignoreMap: false });
  sortMatches(filtered);

  const shown = filtered.slice(0, state.limit);

  renderModePills();
  renderMapGallery();
  renderList(shown, filtered.length);

  if (doUpdateUrl) writeUrl({ replace: true, includeGid: true });
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
  els.groupByMap?.addEventListener("change", onChange);

  els.dir?.addEventListener("click", () => {
    state.dir = state.dir === "asc" ? "desc" : "asc";
    updateDirButton();
    applyFiltersAndSort({ updateUrl: true });
  });

  els.closeDetail?.addEventListener("click", () => closeDetail({ updateUrl: true }));
  els.copyLink?.addEventListener("click", onCopyLink);

  els.modePills?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    state.mode = String(btn.getAttribute("data-mode") || "all").toLowerCase();

    // changing mode can invalidate selected map; clear map if it would yield 0 results
    const after = baseFilterMatches({ ignoreMode: false, ignoreMap: false });
    if (state.map && after.length === 0) state.map = "";

    applyFiltersAndSort({ updateUrl: true });
  });

  const onMapPick = (el) => {
    const mp = el?.getAttribute("data-map") ?? "";
    state.map = String(mp);
    applyFiltersAndSort({ updateUrl: true });
  };

  els.mapGallery?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-map]");
    if (!card) return;
    onMapPick(card);
  });

  els.mapGallery?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest("[data-map]");
    if (!card) return;
    e.preventDefault();
    onMapPick(card);
  });

  els.clearMap?.addEventListener("click", () => {
    state.map = "";
    applyFiltersAndSort({ updateUrl: true });
  });

  // Back/forward support for ?gid=
  window.addEventListener("popstate", () => {
    if (!state.loaded) return;

    // sync state from URL (filters + gid)
    readStateFromUrl();
    initFromState();
    applyFiltersAndSort({ updateUrl: false });
    openFromUrl();
  });
}

function initFromState() {
  if (els.q) els.q.value = state.q;
  if (els.days) els.days.value = state.days;
  if (els.limit) els.limit.value = String(state.limit);
  if (els.sort) els.sort.value = state.sort;
  if (els.hideMM) els.hideMM.checked = state.hideMM;
  if (els.groupByMap) els.groupByMap.checked = state.groupByMap;
  updateDirButton();
}

document.addEventListener("DOMContentLoaded", () => {
  els.q = $("q");
  els.days = $("days");
  els.limit = $("limit");
  els.sort = $("sort");
  els.dir = $("dir");
  els.hideMM = $("hideMM");
  els.groupByMap = $("groupByMap");
  els.refresh = $("refresh");
  els.status = $("status");
  els.countLine = $("countLine");
  els.gamesBody = $("gamesBody");
  els.groupWrap = $("groupWrap");
  els.detailCard = $("detailCard");
  els.closeDetail = $("closeDetail");
  els.copyLink = $("copyLink");
  els.modePills = $("modePills");
  els.mapGallery = $("mapGallery");
  els.clearMap = $("clearMap");

  readStateFromUrl();
  initFromState();
  wireEvents();

  refresh();
});
