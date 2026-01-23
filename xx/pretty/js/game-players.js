const $ = (q) => document.querySelector(q);

function jsonBasePath(){
  const pathname = window.location?.pathname || "/";
  if (pathname.includes("/pretty/")) {
    return new URL("../jsons/", window.location.href).pathname;
  }
  if (pathname.endsWith("/")) return `${pathname}jsons/`;
  const lastSlash = pathname.lastIndexOf("/");
  const base = lastSlash >= 0 ? pathname.slice(0, lastSlash + 1) : "/";
  return `${base}jsons/`;
}

function qp(name){
  const u = new URL(location.href);
  return u.searchParams.get(name) || "";
}
function asNum(v){
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pick(obj, keys){
  for (const k of keys){
    if (!obj) break;
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) return obj[k];
  }
  return undefined;
}
function normName(s){
  if (s === null || s === undefined) return "";
  return String(s).trim();
}
function fmtMaybe(n){
  const x = asNum(n);
  return x === null ? "" : String(x);
}
function fmtFixed(n, d=2){
  const x = asNum(n);
  return x === null ? "" : x.toFixed(d);
}
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function buildLabActivity(game){
  const rc = pick(game, ["researchComplete","research_complete","research","techComplete"]) || [];
  const counts = new Map();
  if (Array.isArray(rc)){
    for (const ev of rc){
      if (!ev || typeof ev !== "object") continue;
      const pos = asNum(pick(ev, ["position","player","p","slot"]));
      if (pos === null) continue;
      counts.set(pos, (counts.get(pos)||0) + 1);
    }
  }
  return counts;
}

function rowClass(i){ return "row" + (i % 10); }

function renderTable(tableSel, players, labCounts, filterStr){
  const tbody = document.querySelector(tableSel + " tbody");
  tbody.innerHTML = "";
  const f = (filterStr || "").toLowerCase().trim();

  const filtered = players.filter(p => {
    if (!f) return true;
    const nm = normName(pick(p, ["name","player","nick","username","id","publicKey"])).toLowerCase();
    return nm.includes(f);
  });

  filtered.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.className = rowClass(idx);

    const name = normName(pick(p, ["name","player","nick","username"])) || normName(pick(p, ["publicKey","id"])) || `P${fmtMaybe(p.position)}`;
    const sub = "not rated";

    const pos = asNum(pick(p, ["position","pos","index"])) ?? "";
    const team = asNum(pick(p, ["team","t"])) ?? "";

    const kills = fmtMaybe(pick(p, ["kills","k"]));
    const dLost = fmtMaybe(pick(p, ["droidsLost","droidLost","droids_lost","lostDroids","lost"]));
    const dBuilt = fmtMaybe(pick(p, ["droidsBuilt","droidBuilt","droids_built","builtDroids","built"]));
    const sLost = fmtMaybe(pick(p, ["structuresLost","structLost","structures_lost","lostStructures"]));
    const sBuilt = fmtMaybe(pick(p, ["structuresBuilt","structBuilt","structures_built","builtStructures"]));
    const power = fmtMaybe(pick(p, ["power","pwr","powerGenerated","powerUsed","totalPower"]));

    let pwl = pick(p, ["pwl","PWL"]);
    if (pwl === undefined){
      const pow = asNum(power);
      const lost = asNum(dLost) ?? 0;
      pwl = (pow !== null) ? (lost > 0 ? (pow / lost) : "") : "";
    }
    const pwlStr = (typeof pwl === "number") ? fmtFixed(pwl, 2) : (pwl || "");

    const lab = labCounts ? (labCounts.get(Number(pos)) || 0) : "";
    const labStr = lab === "" ? "" : String(lab);

    tr.innerHTML = `
      <td class="player">
        <a href="#">${escapeHtml(name)}</a>
        <span class="sub">${escapeHtml(sub)}</span>
      </td>
      <td class="center mono">${escapeHtml(String(pos))}</td>
      <td class="center mono">${escapeHtml(String(team))}</td>
      <td class="center mono">TODO</td>
      <td class="right mono">${escapeHtml(kills)}</td>
      <td class="right mono">${escapeHtml(dLost)}</td>
      <td class="right mono">${escapeHtml(dBuilt)}</td>
      <td class="right mono">${escapeHtml(sLost)}</td>
      <td class="right mono">${escapeHtml(sBuilt)}</td>
      <td class="right mono">${escapeHtml(power)}</td>
      <td class="right mono">${escapeHtml(pwlStr)}</td>
      <td class="right mono">${escapeHtml(labStr)}</td>
    `;
    tbody.appendChild(tr);
  });

  return filtered.length;
}

async function load(){
  const gid = qp("gid");
  $("#metaPill").textContent = gid ? `Game: ${gid}` : "Game: (missing ?gid=…)";

  const r = await fetch(`${jsonBasePath()}matchstats.json`, {cache:"no-store"});
  const d = await r.json();
  const games = (d && typeof d === "object" && Array.isArray(d.games)) ? d.games : (Array.isArray(d) ? d : []);
  if (!games.length){
    $("#metaPill").textContent = "No games found in matchstats.json";
    return;
  }

  const game = gid
    ? (games.find(g => g && typeof g === "object" && String(pick(g,["id","gid","gamelog","gamelogId","gamelog_id","filename","file"])||"") === gid) || null)
    : games[0];

  if (!game){
    $("#metaPill").textContent = `Game not found: ${gid}`;
    return;
  }

  const map = pick(game, ["map","mapName"]) || "";
  const title = `${map ? map + " • " : ""}${gid || pick(game,["id","gid","gamelog","gamelogId","filename","file"]) || ""}`;
  $("#metaPill").textContent = title || "Game loaded";

  const players = Array.isArray(pick(game, ["players","playerStats","player_stats"])) ? pick(game, ["players","playerStats","player_stats"]) : [];
  const labCounts = buildLabActivity(game);

  const winners = players.filter(p => String(pick(p, ["usertype","result","outcome","status"])||"").toLowerCase().includes("win"));
  const losers  = players.filter(p => String(pick(p, ["usertype","result","outcome","status"])||"").toLowerCase().includes("loss"));

  const w = winners.length ? winners : players;
  const l = losers.length ? losers : (winners.length ? players.filter(p => !winners.includes(p)) : []);

  const fs = $("#filter").value || "";
  const wCount = renderTable("#wTable", w, labCounts, fs);
  const lCount = renderTable("#lTable", l, labCounts, fs);

  $("#wMeta").textContent = `${wCount} player${wCount===1?"":"s"}`;
  $("#lMeta").textContent = `${lCount} player${lCount===1?"":"s"}`;

  $("#filter").oninput = () => {
    const f2 = $("#filter").value || "";
    const wc = renderTable("#wTable", w, labCounts, f2);
    const lc = renderTable("#lTable", l, labCounts, f2);
    $("#wMeta").textContent = `${wc} player${wc===1?"":"s"}`;
    $("#lMeta").textContent = `${lc} player${lc===1?"":"s"}`;
  };
}

$("#btnRefresh").addEventListener("click", () => load().catch(err => {
  console.error(err);
  $("#metaPill").textContent = "Error loading matchstats.json (see console)";
}));

load().catch(err => {
  console.error(err);
  $("#metaPill").textContent = "Error loading matchstats.json (see console)";
});
