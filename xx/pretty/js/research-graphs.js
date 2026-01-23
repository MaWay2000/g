/* Research Graphs
   - Reads /jsons/matchstats.json
   - Supports your schema:
       players: [{name, position, ...}, ...]
       researchComplete: [{name, position, time, struct}, ...]   time in ms
       duration_s
*/
const $ = (id) => document.getElementById(id);

function pick(obj, keys){ for (const k of keys) if (obj && obj[k]!=null) return obj[k]; return null; }
function asNumber(v){ if (v==null) return null; if (typeof v==='number') return v; const n=Number(v); return Number.isFinite(n)?n:null; }
function norm(s){ return String(s??'').trim(); }

function extractGames(raw){
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.games)) return raw.games;
  for (const k of ["data","items","matches"]) if (raw && Array.isArray(raw[k])) return raw[k];
  return [];
}
function extractWhen(game){
  const s = pick(game, ["when","time","timestamp","date","startTime","startedAt"]);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function withinDays(d, days){ if (!days) return true; return (Date.now()-d.getTime()) <= days*24*3600*1000; }
function durationSec(game){
  const d = pick(game, ["duration_s","duration","durationSec","durationSeconds","length"]);
  const n = asNumber(d);
  if (n==null) return null;
  return n>100000 ? Math.round(n/1000) : Math.round(n);
}

function keywordBucket(tech){
  const t = tech.toLowerCase();
  const has = (...xs)=> xs.some(x=>t.includes(x));
  if (has("vtol","bomb","lancer","missile")) return "VTOL/Missiles";
  if (has("cyborg","borg")) return "Cyborgs";
  if (has("laser","pulse","plasma")) return "Energy Weapons";
  if (has("cannon","rail","gauss")) return "Kinetic Weapons";
  if (has("mg","machinegun","flamer","inferno")) return "Early DPS";
  if (has("armor","armour","body","composite","reactive")) return "Armor/Bodies";
  if (has("engine","tracks","half-track","wheels","hover")) return "Mobility";
  if (has("sensor","radar","cb","counter-battery")) return "Sensors/Arty";
  if (has("howitzer","mortar","artillery","ripple")) return "Artillery";
  if (has("factory","power","module","gen","derrick")) return "Economy/Production";
  if (has("aa","sam","flak","hurricane")) return "Anti-Air";
  return "Other";
}

async function fetchJSON(urls){
  let lastErr;
  for (const u of urls){
    try{
      const r = await fetch(u, {cache:"no-store"});
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    }catch(e){ lastErr=e; }
  }
  throw lastErr || new Error("fetch failed");
}

const MATCH_URLS = ["../jsons/matchstats.json","/jsons/matchstats.json","./jsons/matchstats.json","../pretty/jsons/matchstats.json"];

function buildPosNameMap(playersArr){
  const map = new Map();
  if (!Array.isArray(playersArr)) return map;
  for (const p of playersArr){
    if (!p || typeof p!=="object") continue;
    const pos = asNumber(pick(p, ["position","slot","index"]));
    const nm = norm(pick(p, ["name","player","nick"]));
    if (pos!=null && nm) map.set(pos, nm);
  }
  return map;
}

function extractEvents(game){
  const rc = pick(game, ["researchComplete","research_complete","research","techComplete"]);
  if (!Array.isArray(rc)) return [];
  const posMap = buildPosNameMap(pick(game, ["players"]) || []);
  const out = [];
  for (const it of rc){
    if (!it || typeof it!=="object") continue;
    const tech = norm(pick(it, ["name","tech","topic","item"]));
    const pos = asNumber(pick(it, ["position","player","p","slot"]));
    const player = posMap.get(pos) || `P${pos ?? "?"}`;
    const tms = asNumber(pick(it, ["time","t","ms","sec","s"]));
    const sec = (tms==null) ? null : (tms/1000);
    if (tech) out.push({player, tech, sec});
  }
  return out;
}

function fmtMMSS(sec){
  if (sec==null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec/60);
  const s = Math.floor(sec%60);
  return `${m}:${String(s).padStart(2,"0")}`;
}

let charts = {};
function destroyCharts(){ for (const k of Object.keys(charts)) { try{charts[k].destroy()}catch{} } charts = {}; }

function setStatus(msg){ $("status").textContent = msg; }

function updatePlayerPick(players){
  const sel = $("playerPick");
  const cur = sel.value;
  sel.innerHTML = `<option value="">All players</option>`;
  for (const p of players){
    const opt = document.createElement("option");
    opt.value = p; opt.textContent = p;
    sel.appendChild(opt);
  }
  if ([...sel.options].some(o=>o.value===cur)) sel.value = cur;
}

function topEntries(map, n){ return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n); }

function compute(rawGames, scopeDays, minGames, playerFilter){
  const rows = rawGames.map(g=>({
    g,
    when: extractWhen(g),
    dur: durationSec(g),
    events: extractEvents(g),
    players: (pick(g, ["players"]) || [])
  })).filter(x=>x.events.length);

  const scoped = rows.filter(x=> x.when ? withinDays(x.when, scopeDays) : true);

  const playerSet = new Set();
  for (const x of scoped){
    for (const p of (x.players||[])){
      if (p && typeof p==="object"){
        const nm = norm(pick(p, ["name","player","nick"]));
        if (nm) playerSet.add(nm);
      }
    }
  }
  const allPlayers = [...playerSet].sort((a,b)=>a.localeCompare(b));

  const filtered = playerFilter
    ? scoped.filter(x => (x.players||[]).some(p => p && typeof p==="object" && norm(p.name)===playerFilter))
    : scoped;

  if (!playerFilter && minGames>1){
    const counts = new Map();
    for (const x of filtered){
      for (const p of (x.players||[])){
        if (p && typeof p==="object"){
          const nm = norm(p.name);
          if (nm) counts.set(nm, (counts.get(nm)||0)+1);
        }
      }
    }
    const allowed = new Set([...counts.entries()].filter(([,v])=>v>=minGames).map(([k])=>k));
    for (const x of filtered) x.events = x.events.filter(ev => allowed.has(ev.player));
  }

  if (playerFilter){
    for (const x of filtered) x.events = x.events.filter(ev=>ev.player===playerFilter);
  }

  const catCounts = new Map();
  const techCounts = new Map();
  const earliest = new Map(); // cat -> sec
  const tempo = [];
  let totalTech = 0;

  for (const x of filtered){
    const dur = x.dur || null;
    const nTech = x.events.length;
    totalTech += nTech;

    if (dur){
      const tpm = nTech / (dur/60);
      const label = x.when ? x.when.toISOString().slice(0,10) : "unknown";
      tempo.push({label, tpm});
    }

    for (const ev of x.events){
      const cat = keywordBucket(ev.tech);
      catCounts.set(cat, (catCounts.get(cat)||0)+1);
      techCounts.set(ev.tech, (techCounts.get(ev.tech)||0)+1);
      if (ev.sec!=null){
        const cur = earliest.get(cat);
        if (cur==null || ev.sec<cur) earliest.set(cat, ev.sec);
      }
    }
  }

  tempo.sort((a,b)=>a.label.localeCompare(b.label));

  return { gamesCount: filtered.length, totalTech, playersCount: playerFilter?1:allPlayers.length,
           allPlayers, catCounts, techCounts, earliest, tempo };
}

function renderCatList(catCounts){
  const el = $("catList");
  const rows = topEntries(catCounts, 12);
  el.innerHTML = rows.map(([k,v]) =>
    `<div class="row"><div><span class="badge">${k}</span></div><div class="muted">${v}</div></div>`
  ).join("") || `<div class="muted">No data</div>`;
}

function makePie(ctx, labels, values){
  return new Chart(ctx, { type:"doughnut",
    data:{ labels, datasets:[{ data: values }] },
    options:{ responsive:true, plugins:{ legend:{ position:"bottom" } } }
  });
}
function makeLine(ctx, labels, values){
  return new Chart(ctx, { type:"line",
    data:{ labels, datasets:[{ label:"tech/min", data: values, tension:0.25 }] },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } }, plugins:{ legend:{ display:true } } }
  });
}
function makeBar(ctx, labels, values, label){
  return new Chart(ctx, { type:"bar",
    data:{ labels, datasets:[{ label, data: values }] },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } }, plugins:{ legend:{ display:true } } }
  });
}

async function loadAndRender(){
  $("btnRefresh").disabled = true;
  setStatus("Loading…");
  try{
    const scope = $("scope").value;
    const scopeDays = scope==="all" ? 0 : Number(scope);
    const minGames = Number($("minGames").value);
    const playerFilter = $("playerPick").value || "";

    const raw = await fetchJSON(MATCH_URLS);
    const rawGames = extractGames(raw);

    const res = compute(rawGames, scopeDays, minGames, playerFilter);

    $("kGames").textContent = String(res.gamesCount);
    $("kTechs").textContent = String(res.totalTech);
    $("kPlayers").textContent = String(res.playersCount);
    $("kNote").textContent = playerFilter ? `Filtered to: ${playerFilter}` : `Min games (player stats): ${minGames}`;

    updatePlayerPick(res.allPlayers);

    destroyCharts();

    // Pie: top 10 cats + remainder
    const catSorted = topEntries(res.catCounts, 10);
    const others = [...res.catCounts.entries()].slice(10).reduce((a,[,v])=>a+v,0);
    const labels = catSorted.map(([k])=>k).concat(others?["(Other cats)"]:[]);
    const values = catSorted.map(([,v])=>v).concat(others?[others]:[]);
    charts.catPie = makePie($("catPie").getContext("2d"), labels, values);

    renderCatList(res.catCounts);

    // Tempo line
    const tLabels = res.tempo.map(x=>x.label);
    const tValues = res.tempo.map(x=>Number(x.tpm.toFixed(2)));
    charts.tempoLine = makeLine($("tempoLine").getContext("2d"), tLabels, tValues);

    // Earliest bar
    const eSorted = [...res.earliest.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    const eLabels = eSorted.map(([k])=>k);
    const eValues = eSorted.map(([,sec])=>Number((sec??0).toFixed(2)));
    charts.firstBar = makeBar($("firstBar").getContext("2d"), eLabels, eValues, "seconds (lower is faster)");
    charts.firstBar.options.plugins.tooltip = { callbacks:{ label:(ctx)=> ` ${fmtMMSS(ctx.raw)} (${ctx.raw.toFixed(2)}s)` } };
    charts.firstBar.update();

    // Top tech IDs
    const topTech = topEntries(res.techCounts, 20);
    charts.topTechBar = makeBar(
      $("topTechBar").getContext("2d"),
      topTech.map(([k])=>k),
      topTech.map(([,v])=>v),
      "completions"
    );

    setStatus(`Loaded ${res.gamesCount} games • ${res.totalTech} completed techs`);
  }catch(e){
    console.error(e);
    setStatus(`Error: ${e?.message || e}`);
  }finally{
    $("btnRefresh").disabled = false;
  }
}

$("btnRefresh").addEventListener("click", loadAndRender);
$("scope").addEventListener("change", loadAndRender);
$("minGames").addEventListener("change", loadAndRender);
$("playerPick").addEventListener("change", loadAndRender);

loadAndRender();
