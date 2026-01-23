/* Research Tree (Observed)
   - Reads /jsons/matchstats.json
   - Builds a co-occurrence / “next tech” directed graph based on per-player order in each game.

   Your schema:
     players: [{name, position, ...}]
     researchComplete: [{name, position, time, struct}]  time in ms

   How edges are inferred:
     For each (game, player):
       sort researchComplete items by time
       add edges between consecutive techs: A -> B
       edge weight increments

   Visual:
     Force-directed directed graph (arrows).
     Node size = completions
     Node color = bucket category (keywordBucket)
*/

const $ = (id) => document.getElementById(id);

function pick(obj, keys){ for (const k of keys) if (obj && obj[k]!=null) return obj[k]; return null; }
function asNumber(v){ if (v==null) return null; if (typeof v==='number') return v; const n=Number(v); return Number.isFinite(n)?n:null; }
function norm(s){ return String(s??'').trim(); }

const MATCH_URLS = ["../jsons/matchstats.json","/jsons/matchstats.json","./jsons/matchstats.json","../pretty/jsons/matchstats.json"];

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

const CAT_COLORS = {
  "Economy/Production":"#6ee7b7",
  "Kinetic Weapons":"#93c5fd",
  "Energy Weapons":"#f9a8d4",
  "Early DPS":"#fcd34d",
  "Armor/Bodies":"#c4b5fd",
  "Mobility":"#fdba74",
  "Cyborgs":"#a7f3d0",
  "Sensors/Arty":"#fca5a5",
  "Artillery":"#fecaca",
  "Anti-Air":"#bfdbfe",
  "VTOL/Missiles":"#fbbf24",
  "Other":"#e5e7eb"
};

// Build player list for dropdown
function updatePlayerPick(games){
  const set = new Set();
  for (const g of games){
    const players = pick(g, ["players"]) || [];
    if (!Array.isArray(players)) continue;
    for (const p of players){
      if (p && typeof p==="object"){
        const nm = norm(pick(p, ["name","player","nick"]));
        if (nm) set.add(nm);
      }
    }
  }
  const all = [...set].sort((a,b)=>a.localeCompare(b));
  const sel = $("playerPick");
  const cur = sel.value;
  sel.innerHTML = `<option value="">All players</option>`;
  for (const nm of all){
    const opt = document.createElement("option");
    opt.value = nm;
    opt.textContent = nm;
    sel.appendChild(opt);
  }
  if ([...sel.options].some(o=>o.value===cur)) sel.value = cur;
  return all.length;
}

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

// Extract per-player ordered list of tech ids in a game
function perPlayerSequences(game, playerFilter){
  const rc = pick(game, ["researchComplete","research_complete","research","techComplete"]);
  if (!Array.isArray(rc) || !rc.length) return [];
  const posMap = buildPosNameMap(pick(game, ["players"]) || []);
  // group by player
  const byPlayer = new Map(); // name -> [{tech, t}]
  for (const it of rc){
    if (!it || typeof it!=="object") continue;
    const tech = norm(pick(it, ["name","tech","topic","item"]));
    if (!tech) continue;
    const pos = asNumber(pick(it, ["position","player","p","slot"]));
    const player = posMap.get(pos) || `P${pos ?? "?"}`;
    if (playerFilter && player !== playerFilter) continue;
    const t = asNumber(pick(it, ["time","t","ms","sec","s"])) ?? 0;
    if (!byPlayer.has(player)) byPlayer.set(player, []);
    byPlayer.get(player).push({tech, t});
  }
  // sort and return sequences
  const seqs = [];
  for (const [player, arr] of byPlayer.entries()){
    arr.sort((a,b)=>a.t-b.t);
    // de-duplicate consecutive duplicates
    const list = [];
    for (const x of arr){
      if (!list.length || list[list.length-1] !== x.tech) list.push(x.tech);
    }
    if (list.length >= 2) seqs.push({player, list});
  }
  return seqs;
}

function buildGraph(games, opts){
  const {playerFilter, edgeMin, topN} = opts;

  const nodeCount = new Map(); // tech -> completions
  const edgeCount = new Map(); // "A\tB" -> count

  for (const g of games){
    const seqs = perPlayerSequences(g, playerFilter);
    for (const s of seqs){
      for (const tech of s.list) nodeCount.set(tech, (nodeCount.get(tech)||0)+1);
      for (let i=0;i<s.list.length-1;i++){
        const a = s.list[i], b = s.list[i+1];
        const key = a + "\t" + b;
        edgeCount.set(key, (edgeCount.get(key)||0)+1);
      }
    }
  }

  // keep only topN nodes by count
  const topNodes = [...nodeCount.entries()].sort((a,b)=>b[1]-a[1]).slice(0, topN);
  const keep = new Set(topNodes.map(([k])=>k));

  const nodes = topNodes.map(([id, c]) => {
    const cat = keywordBucket(id);
    return {id, c, cat, color: CAT_COLORS[cat] || CAT_COLORS.Other};
  });

  const links = [];
  for (const [k, w] of edgeCount.entries()){
    if (w < edgeMin) continue;
    const [a,b] = k.split("\t");
    if (!keep.has(a) || !keep.has(b)) continue;
    links.push({source:a, target:b, w});
  }

  return {nodes, links};
}

// D3 render
function renderGraph(graph, q){
  const svg = d3.select("#viz");
  svg.selectAll("*").remove();

  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;

  const tip = document.getElementById("tip");

  // zoom/pan
  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([0.2, 4]).on("zoom", (event) => {
    g.attr("transform", event.transform);
  }));

  // defs for arrows
  svg.append("defs").append("marker")
    .attr("id","arrow")
    .attr("viewBox","0 -5 10 10")
    .attr("refX", 18)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient","auto")
    .append("path")
    .attr("d","M0,-5L10,0L0,5")
    .attr("fill","rgba(255,255,255,.28)");

  const radius = d3.scaleSqrt()
    .domain(d3.extent(graph.nodes, d => d.c))
    .range([4, 18]);

  const linkWidth = d3.scaleLinear()
    .domain(d3.extent(graph.links, d=>d.w))
    .range([0.6, 4.0]);

  const sim = d3.forceSimulation(graph.nodes)
    .force("link", d3.forceLink(graph.links).id(d=>d.id).distance(60).strength(0.7))
    .force("charge", d3.forceManyBody().strength(-160))
    .force("center", d3.forceCenter(width/2, height/2))
    .force("collide", d3.forceCollide().radius(d=>radius(d.c)+3));

  const link = g.append("g")
    .attr("stroke","rgba(255,255,255,.14)")
    .attr("stroke-opacity",0.85)
    .selectAll("line")
    .data(graph.links)
    .join("line")
    .attr("stroke-width", d=>linkWidth(d.w))
    .attr("marker-end","url(#arrow)");

  const node = g.append("g")
    .selectAll("circle")
    .data(graph.nodes)
    .join("circle")
    .attr("r", d=>radius(d.c))
    .attr("fill", d=>d.color)
    .attr("stroke","rgba(255,255,255,.40)")
    .attr("stroke-width", 1.0)
    .call(d3.drag()
      .on("start", (event,d)=>{ if (!event.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
      .on("drag", (event,d)=>{ d.fx=event.x; d.fy=event.y; })
      .on("end", (event,d)=>{ if (!event.active) sim.alphaTarget(0); d.fx=null; d.fy=null; })
    );

  // labels (only for searched/high nodes)
  const label = g.append("g")
    .selectAll("text")
    .data(graph.nodes)
    .join("text")
    .text(d=>d.id)
    .attr("font-size","10px")
    .attr("fill","rgba(255,255,255,.90)")
    .attr("pointer-events","none")
    .style("display", d=>{
      if (q && d.id.toLowerCase().includes(q.toLowerCase())) return "block";
      return d.c >= (d3.quantile(graph.nodes.map(x=>x.c).sort((a,b)=>a-b), 0.92) || 999999) ? "block" : "none";
    });

  function showTip(html, x, y){
    tip.innerHTML = html;
    tip.style.left = (x + 12) + "px";
    tip.style.top  = (y + 12) + "px";
    tip.style.display = "block";
  }
  function hideTip(){ tip.style.display = "none"; }

  node.on("mousemove", (event, d) => {
    showTip(
      `<div><b>${d.id}</b></div>
       <div class="small muted">${d.cat}</div>
       <div style="margin-top:6px" class="small">Completions: <b>${d.c}</b></div>`,
      event.clientX, event.clientY
    );
  }).on("mouseleave", hideTip);

  sim.on("tick", () => {
    link
      .attr("x1", d=>d.source.x)
      .attr("y1", d=>d.source.y)
      .attr("x2", d=>d.target.x)
      .attr("y2", d=>d.target.y);

    node
      .attr("cx", d=>d.x)
      .attr("cy", d=>d.y);

    label
      .attr("x", d=>d.x + 10)
      .attr("y", d=>d.y + 3);
  });
}

function renderLegend(){
  const el = $("legend");
  const cats = Object.keys(CAT_COLORS);
  el.innerHTML = cats.map(c =>
    `<div class="legitem"><span class="dot" style="background:${CAT_COLORS[c]}"></span><span class="muted small">${c}</span></div>`
  ).join("");
}

function setStatus(msg){ $("status").textContent = msg; }

async function loadAndRender(){
  $("btnRefresh").disabled = true;
  setStatus("Loading…");
  try{
    const scope = $("scope").value;
    const scopeDays = scope==="all" ? 0 : Number(scope);
    const playerFilter = $("playerPick").value || "";
    const edgeMin = Number($("edgeMin").value);
    const topN = Number($("topN").value);
    const q = $("q").value.trim();

    const raw = await fetchJSON(MATCH_URLS);
    const games = extractGames(raw);

    // scope filter
    const scoped = games.filter(g => {
      const d = extractWhen(g);
      return d ? withinDays(d, scopeDays) : true;
    });

    const playersCount = updatePlayerPick(scoped);
    const graph = buildGraph(scoped, {playerFilter, edgeMin, topN});

    $("kGames").textContent = String(scoped.length);
    $("kPlayers").textContent = String(playersCount);
    $("kNodes").textContent = String(graph.nodes.length);
    $("kEdges").textContent = String(graph.links.length);

    renderLegend();
    renderGraph(graph, q);

    setStatus(`Built ${graph.nodes.length} nodes • ${graph.links.length} edges`);
  }catch(e){
    console.error(e);
    setStatus(`Error: ${e?.message || e}`);
  }finally{
    $("btnRefresh").disabled = false;
  }
}

$("btnRefresh").addEventListener("click", loadAndRender);
$("scope").addEventListener("change", loadAndRender);
$("playerPick").addEventListener("change", loadAndRender);
$("edgeMin").addEventListener("change", loadAndRender);
$("topN").addEventListener("change", loadAndRender);
$("q").addEventListener("input", () => {
  clearTimeout(window.__qT);
  window.__qT = setTimeout(loadAndRender, 250);
});

renderLegend();
loadAndRender();
