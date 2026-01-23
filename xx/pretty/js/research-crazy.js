/* Research+: Crazy Stats — matchstats.json schema (researchComplete as list of dicts)
   researchComplete item example:
     { name: 'R-Wpn-MG1Mk1', position: 4, struct: 161337, time: 25202 }
   players example:
     players: [ {name:'Wasif Haider', position:0, ...}, ... ]
*/

const $ = (id) => document.getElementById(id);

function pick(obj, keys) {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return null;
}
function asNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function normName(s) {
  return String(s ?? '').trim();
}
function safeDiv(a,b) { return b ? a/b : 0; }
function minsToStr(sec) {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m${String(s).padStart(2,'0')}s`;
}
function topN(map, n=5) {
  return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n);
}

async function fetchJSON(urls) {
  let lastErr;
  for (const u of urls) {
    try {
      const r = await fetch(u, {cache: "no-store"});
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("fetch failed");
}

const MATCH_URLS = [
  "../jsons/matchstats.json",
  "/jsons/matchstats.json",
  "./jsons/matchstats.json",
  "../pretty/jsons/matchstats.json"
];

function extractGames(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.games)) return raw.games;
  for (const k of ["data","items","matches"]) {
    if (raw && Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function extractWhenUTC(game) {
  const s = pick(game, ["when","time","timestamp","date","startTime","startedAt"]);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function withinDays(d, days) {
  if (!days) return true;
  const now = Date.now();
  return (now - d.getTime()) <= days*24*3600*1000;
}
function extractDurationSec(game) {
  const d = pick(game, ["duration_s","duration","durationSec","durationSeconds","length","gameDuration"]);
  const n = asNumber(d);
  if (n == null) return null;
  return n > 100000 ? Math.round(n/1000) : Math.round(n);
}

function keywordBucket(tech) {
  const t = tech.toLowerCase();
  const has = (...xs) => xs.some(x => t.includes(x));
  if (has("vtol", "bomb", "lancer", "missile")) return "VTOL/Missiles";
  if (has("cyborg", "borg")) return "Cyborgs";
  if (has("laser", "pulse", "plasma")) return "Energy Weapons";
  if (has("cannon", "rail", "gauss")) return "Kinetic Weapons";
  if (has("mg", "machinegun", "flamer", "inferno")) return "Early DPS";
  if (has("armor", "armour", "body", "composite", "reactive")) return "Armor/Bodies";
  if (has("engine", "tracks", "half-track", "wheels", "hover")) return "Mobility";
  if (has("sensor", "radar", "cb", "counter-battery")) return "Sensors/Arty";
  if (has("howitzer", "mortar", "artillery", "ripple")) return "Artillery";
  if (has("factory", "power", "module", "gen", "derrick")) return "Economy/Production";
  if (has("aa", "sam", "flak", "hurricane")) return "Anti-Air";
  return "Other";
}

/* Map researchComplete -> normalized events
   - tech: item.name
   - player: item.position -> game.players[*].name (best effort)
   - time: item.time is ms -> sec
*/
function extractResearchEvents(game) {
  const rc = pick(game, ["researchComplete","research_complete","research","techComplete"]);
  if (!Array.isArray(rc)) return [];

  const playersArr = pick(game, ["players","playerNames","names"]) || [];

  // Build position->name map from players objects (your real schema)
  const posMap = new Map();
  if (Array.isArray(playersArr)) {
    for (const p of playersArr) {
      if (!p) continue;

      // Case: string array
      if (typeof p === "string") continue;

      // Case: object with name + position
      if (typeof p === "object") {
        const pos = asNumber(pick(p, ["position","slot","index"]));
        const nm = normName(pick(p, ["name","player","nick"]));
        if (pos != null && nm) posMap.set(pos, nm);
      }
    }
  }

  const posToName = (pos) => {
    const p = asNumber(pos);
    if (p == null) return "P?";
    if (posMap.has(p)) return posMap.get(p);
    // fallback: if array is string list by index
    if (Array.isArray(playersArr) && typeof playersArr[p] === "string") return normName(playersArr[p]);
    return `P${p}`;
  };

  const out = [];
  for (const item of rc) {
    if (!item || typeof item !== "object") continue;

    const tech = normName(pick(item, ["name","tech","topic","item","research"]));
    const pos = pick(item, ["position","player","p","slot"]);
    const player = normName(posToName(pos));

    const tms = asNumber(pick(item, ["time","t","ms","sec","s"]));
    const sec = (tms == null) ? null : (tms / 1000);

    if (player && tech) out.push({player, tech, sec});
  }
  return out;
}

function renderRows(container, rows, fmtRight) {
  container.innerHTML = "";
  for (const r of rows) {
    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `<div><span class="badge">${r.left}</span> <span class="muted">${r.sub || ""}</span></div>
                     <div class="right">${fmtRight ? fmtRight(r.right) : r.right}</div>`;
    container.appendChild(div);
  }
}

function compute(rawGames, scopeDays, minGames, q) {
  const games = rawGames
    .map(g => ({g, when: extractWhenUTC(g), dur: extractDurationSec(g), ev: extractResearchEvents(g)}))
    .filter(x => x.ev.length);

  const filteredGames = games.filter(x => x.when ? withinDays(x.when, scopeDays) : true);

  const playerGames = new Map(); // player -> Set(gameIndex)
  const playerEvents = new Map(); // player -> [{sec,tech,dur}]
  const keywordCounts = new Map(); // player -> Map(bucket->count)

  filteredGames.forEach((x, idx) => {
    for (const e of x.ev) {
      const p = e.player;
      if (!playerGames.has(p)) playerGames.set(p, new Set());
      playerGames.get(p).add(idx);

      if (!playerEvents.has(p)) playerEvents.set(p, []);
      playerEvents.get(p).push({sec: e.sec, tech: e.tech, dur: x.dur});

      if (!keywordCounts.has(p)) keywordCounts.set(p, new Map());
      const b = keywordBucket(e.tech);
      keywordCounts.get(p).set(b, (keywordCounts.get(p).get(b)||0) + 1);
    }
  });

  const players = [];
  for (const [p, set] of playerGames.entries()) {
    const gcount = set.size;
    if (gcount < minGames) continue;
    if (q && !p.toLowerCase().includes(q.toLowerCase())) continue;

    const evs = playerEvents.get(p) || [];

    // events/min (use sum of durations where available)
    let totalMins = 0;
    let countedEvents = 0;
    for (const e of evs) {
      if (e.dur) { totalMins += e.dur/60; countedEvents++; }
    }
    const epm = countedEvents ? (countedEvents / totalMins) : 0;

    const uniq = new Set(evs.map(e => e.tech.toLowerCase())).size;
    const uniqPerGame = uniq / gcount;

    const buckets = keywordCounts.get(p) || new Map();
    const topBuckets = topN(buckets, 3).map(([k,v]) => `${k} (${v})`).join(", ");

    players.push({p, gcount, epm, uniqPerGame, topBuckets});
  }
  players.sort((a,b)=> (b.epm-a.epm) || (b.uniqPerGame-a.uniqPerGame));

  const rushers = players.slice(0,5).map(x => ({left:x.p, sub:`${x.gcount} games`, right:x.epm.toFixed(2)}));

  const diversity = [...players].sort((a,b)=> (b.uniqPerGame-a.uniqPerGame)).slice(0,5)
    .map(x => ({left:x.p, sub:`${x.gcount} games`, right:x.uniqPerGame.toFixed(1)}));

  // First-to categories: earliest completion time per category across all games
  const catBest = new Map(); // cat -> {sec, player}
  filteredGames.forEach((x) => {
    const earliest = new Map(); // cat -> {sec, player}
    for (const e of x.ev) {
      const sec = e.sec ?? null;
      if (sec == null) continue;
      const cat = keywordBucket(e.tech);
      const cur = earliest.get(cat);
      if (!cur || sec < cur.sec) earliest.set(cat, {sec, player:e.player});
    }
    for (const [cat, v] of earliest.entries()) {
      const cur = catBest.get(cat);
      if (!cur || v.sec < cur.sec) catBest.set(cat, {sec: v.sec, player: v.player});
    }
  });

  const firstToRows = [...catBest.entries()]
    .sort((a,b)=> a[0].localeCompare(b[0]))
    .map(([cat, v]) => ({cat, player:v.player, sec:v.sec}));

  // Unhinged shares
  const unhinged = [];
  for (const [p, buckets] of keywordCounts.entries()) {
    const set = playerGames.get(p);
    if (!set || set.size < minGames) continue;
    if (q && !p.toLowerCase().includes(q.toLowerCase())) continue;
    let total = 0;
    for (const v of buckets.values()) total += v;
    const econ = safeDiv((buckets.get("Economy/Production")||0), total);
    const vtol = safeDiv((buckets.get("VTOL/Missiles")||0), total);
    const arty = safeDiv(((buckets.get("Sensors/Arty")||0)+(buckets.get("Artillery")||0)), total);
    unhinged.push({p, econ, vtol, arty, games:set.size});
  }
  const pickTop = (key) =>
    [...unhinged].sort((a,b)=> b[key]-a[key]).slice(0,3).map(x =>
      `<div class="row"><div><span class="badge">${x.p}</span> <span class="muted">${x.games} games</span></div><div class="right">${Math.round(x[key]*100)}%</div></div>`
    ).join("");

  const unhingedHtml = `
    <div class="card" style="margin:0 0 12px 0">
      <div class="row"><div><span class="badge">Most Economy-Brained</span> <span class="muted">share of econ/production techs</span></div><div class="right muted">%</div></div>
      ${pickTop("econ")}
    </div>
    <div class="card" style="margin:0 0 12px 0">
      <div class="row"><div><span class="badge">VTOL Addicts</span> <span class="muted">share of VTOL/missile techs</span></div><div class="right muted">%</div></div>
      ${pickTop("vtol")}
    </div>
    <div class="card">
      <div class="row"><div><span class="badge">Arty Gremlins</span> <span class="muted">share of sensors + artillery techs</span></div><div class="right muted">%</div></div>
      ${pickTop("arty")}
    </div>
  `;

  return {
    gamesCount: filteredGames.length,
    eventsCount: filteredGames.reduce((a,x)=>a+x.ev.length,0),
    playersCount: playerGames.size,
    rushers,
    diversity,
    firstToRows,
    playerRows: players,
    unhingedHtml
  };
}

async function loadAndRender() {
  const btn = $("btnRefresh");
  const status = $("status");
  btn.disabled = true;
  status.textContent = "Loading…";

  try {
    const scope = $("scope") ? $("scope").value : "all";
    const scopeDays = scope === "all" ? 0 : Number(scope);
    const minGames = Number($("minGames").value);
    const q = $("q").value.trim();

    const raw = await fetchJSON(MATCH_URLS);
    const rawGames = extractGames(raw);

    const res = compute(rawGames, scopeDays, minGames, q);

    $("kGames").textContent = String(res.gamesCount);
    $("kEvents").textContent = String(res.eventsCount);
    $("kPlayers").textContent = String(res.playersCount);

    renderRows($("rushers"), res.rushers, (x)=>`${x} ev/min`);
    renderRows($("diversity"), res.diversity, (x)=>`${x} uniq/game`);

    const tbody = $("firstToTbl").querySelector("tbody");
    tbody.innerHTML = "";
    for (const r of res.firstToRows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.cat}</td><td><span class="badge">${r.player}</span></td><td class="right">${minsToStr(r.sec)}</td><td class="right">—</td>`;
      tbody.appendChild(tr);
    }

    $("unhinged").innerHTML = res.unhingedHtml;

    const pt = $("playerTbl").querySelector("tbody");
    pt.innerHTML = "";
    for (const x of res.playerRows.slice(0, 200)) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="badge">${x.p}</span></td>
        <td class="right">${x.gcount}</td>
        <td class="right">${x.epm.toFixed(2)}</td>
        <td class="right">${x.uniqPerGame.toFixed(1)}</td>
        <td class="muted">${x.topBuckets || "—"}</td>
      `;
      pt.appendChild(tr);
    }

    status.textContent = `Loaded ${res.gamesCount} games • ${res.eventsCount} completed techs`;
  } catch (e) {
    console.error(e);
    status.textContent = `Error: ${e?.message || e}`;
  } finally {
    btn.disabled = false;
  }
}

$("btnRefresh").addEventListener("click", loadAndRender);
if ($("scope")) $("scope").addEventListener("change", loadAndRender);
$("minGames").addEventListener("change", loadAndRender);
$("q").addEventListener("input", () => {
  clearTimeout(window.__qT);
  window.__qT = setTimeout(loadAndRender, 250);
});

loadAndRender();
