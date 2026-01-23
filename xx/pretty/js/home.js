import { fetchJson, jsonBasePath, safeArray, durString, replayUrlFromMatch } from "./api.js";

const LOBBY_URL = new URL("../lobby.json", window.location.href).pathname;
const MATCHES_URL = `${jsonBasePath()}matchstats.json`;

const $ = (id) => document.getElementById(id);

const els = {
  status: $("homeStatus"),
  liveKpis: $("liveKpis"),
  lobbyMeta: $("lobbyMeta"),
  matchesMeta: $("matchesMeta"),
  recentBody: $("recentBody"),
  recentFooter: $("recentFooter"),
};

function normalizeMatches(payload){
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.games)) return payload.games;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function pickId(m){
  return m?.id ?? m?.game_id ?? m?.gameId ?? m?.uuid ?? "";
}

function getStartTs(m){
  return Date.parse(m?.started_utc || m?.start_utc || m?.startUtc || m?.startedAt || m?.start_time || m?.when || m?.ts || 0) || 0;
}

function fmtUtc(iso){
  const ts = Date.parse(iso || 0);
  if (!ts) return String(iso || "");
  try{
    return new Date(ts).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
  }catch{
    return String(iso || "");
  }
}

function joinNames(xs){
  return safeArray(xs).map(x => (typeof x === "string" ? x : (x?.name ?? x?.player ?? x?.nick ?? ""))).filter(Boolean).join(", ");
}

function resultString(m){
  const w = safeArray(m?.winners || m?.winner || m?.won || m?.winning_players || m?.winningPlayers);
  const l = safeArray(m?.losers || m?.loser || m?.lost || m?.losing_players || m?.losingPlayers);

  const wn = joinNames(w);
  const ln = joinNames(l);

  if (wn && ln) return `${wn} won vs ${ln} lost`;
  if (wn) return `${wn} won`;
  if (ln) return `${ln} lost`;
  return String(m?.result || m?.outcome || "—");
}

function clear(el){
  while (el && el.firstChild) el.removeChild(el.firstChild);
}

function kpi(label, value){
  const box = document.createElement("div");
  box.className = "kpi";
  const l = document.createElement("div");
  l.className = "kpiLabel";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "kpiValue";
  v.textContent = value;
  box.appendChild(l);
  box.appendChild(v);
  return box;
}

function setStatus(text){
  if (els.status) els.status.textContent = text;
}

function renderLobby(lobby){
  if (!els.liveKpis) return;
  clear(els.liveKpis);

  const games = Array.isArray(lobby?.games) ? lobby.games : [];
  const gamesCount = lobby?.gamesAvailable ?? games.length;
  const playersCount = games.reduce((sum, g) => sum + (Number(g?.curPlayers) || 0), 0);
  const ts = lobby?.timestamp_utc ? fmtUtc(lobby.timestamp_utc) : "—";

  els.liveKpis.appendChild(kpi("Lobby games", String(gamesCount)));
  els.liveKpis.appendChild(kpi("Players in lobby", String(playersCount)));
  els.liveKpis.appendChild(kpi("Lobby updated", ts || "—"));

  if (els.lobbyMeta){
    const ok = lobby?.connectionError === false;
    const lobbyName = lobby?.lobby ?? "unknown";
    els.lobbyMeta.textContent = `lobby=${lobbyName} · connectionError=${ok ? "false" : String(lobby?.connectionError)}`;
  }
}

function renderRecent(matches){
  if (!els.recentBody) return;

  const sorted = matches.slice().sort((a,b) => getStartTs(b) - getStartTs(a));
  const recent = sorted.slice(0, 6);

  clear(els.recentBody);

  if (!recent.length){
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "muted";
    td.style.padding = "14px";
    td.textContent = "No matches found.";
    tr.appendChild(td);
    els.recentBody.appendChild(tr);
    if (els.matchesMeta) els.matchesMeta.textContent = "No data";
    if (els.recentFooter) els.recentFooter.textContent = "";
    return;
  }

  for (const m of recent){
    const id = pickId(m);
    const map = String(m?.map || m?.mapName || m?.map_name || "(unknown)");
    const when = fmtUtc(m?.started_utc || m?.start_utc || m?.startUtc || m?.startedAt || "");
    const dur = durString(m?.duration_s ?? m?.durationSec ?? m?.duration ?? 0);
    const res = resultString(m);
    const rurl = replayUrlFromMatch(m);

    const tr = document.createElement("tr");

    const tdMap = document.createElement("td");
    const aMap = document.createElement("a");
    aMap.href = `./games.html?gid=${encodeURIComponent(id)}`;
    aMap.textContent = map;
    tdMap.appendChild(aMap);

    const tdWhen = document.createElement("td");
    const cWhen = document.createElement("code");
    cWhen.textContent = when;
    tdWhen.appendChild(cWhen);

    const tdDur = document.createElement("td");
    const cDur = document.createElement("code");
    cDur.textContent = dur;
    tdDur.appendChild(cDur);

    const tdRes = document.createElement("td");
    tdRes.textContent = res;

    const tdReplay = document.createElement("td");
    if (rurl){
      const a = document.createElement("a");
      a.href = rurl;
      a.setAttribute("download", "");
      a.textContent = "Download";
      tdReplay.appendChild(a);
    }else{
      const s = document.createElement("span");
      s.className = "muted small";
      s.textContent = "—";
      tdReplay.appendChild(s);
    }

    tr.appendChild(tdMap);
    tr.appendChild(tdWhen);
    tr.appendChild(tdDur);
    tr.appendChild(tdRes);
    tr.appendChild(tdReplay);

    els.recentBody.appendChild(tr);
  }

  const last = sorted[0];
  const lastTs = fmtUtc(last?.started_utc || last?.start_utc || last?.startUtc || last?.startedAt || "");

  if (els.matchesMeta) els.matchesMeta.textContent = `Loaded ${matches.length} matches · Latest: ${lastTs || "—"}`;
  if (els.recentFooter) els.recentFooter.textContent = "Click any map to open match details (shareable link).";
}

async function run(){
  setStatus("Loading lobby + matchstats…");

  const lobbyPromise = fetchJson(`${LOBBY_URL}?ts=${Date.now()}`, 12000).catch((e) => ({ __error: e }));
  const matchesPromise = fetchJson(`${MATCHES_URL}?ts=${Date.now()}`, 15000).catch((e) => ({ __error: e }));

  const [lobby, matchesPayload] = await Promise.all([lobbyPromise, matchesPromise]);

  // Lobby
  if (lobby && lobby.__error){
    renderLobby(null);
    if (els.lobbyMeta) els.lobbyMeta.textContent = `Failed to load ${LOBBY_URL} — ${lobby.__error?.message || lobby.__error}`;
  }else{
    renderLobby(lobby);
  }

  // Matches
  if (matchesPayload && matchesPayload.__error){
    if (els.matchesMeta) els.matchesMeta.textContent = `Failed to load ${MATCHES_URL}`;
    if (els.recentBody){
      clear(els.recentBody);
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "muted";
      td.style.padding = "14px";
      td.textContent = `Could not load matchstats: ${matchesPayload.__error?.message || matchesPayload.__error}`;
      tr.appendChild(td);
      els.recentBody.appendChild(tr);
    }
  }else{
    const matches = normalizeMatches(matchesPayload);
    renderRecent(matches);
  }

  const lobbyOk = !(lobby && lobby.__error);
  const matchesOk = !(matchesPayload && matchesPayload.__error);
  setStatus(lobbyOk && matchesOk ? "OK" : "Loaded with warnings");
}

run();
