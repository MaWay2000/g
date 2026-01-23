
function bgTogglePreview(btn){
  const tech = btn.getAttribute('data-tech') || '';
  const page = 'research';
  const url = 'https://betaguide.wz2100.net/research.html?details_id=' + encodeURIComponent(tech);
  window.open(url, '_blank', 'noopener');
}
window.bgTogglePreview = bgTogglePreview;

/* Research Timeline (Light, no dropdown)
   Uses /jsons/matchstats.json
   - Left panel shows a searchable list of games (derived from same JSON)
   - Click a game to load timeline table
*/

const $ = (id) => document.getElementById(id);

function pick(obj, keys){ for (const k of keys) if (obj && obj[k]!=null) return obj[k]; return null; }
function asNumber(v){ if (v==null) return null; if (typeof v==='number') return v; const n=Number(v); return Number.isFinite(n)?n:null; }
function norm(s){ return String(s??'').trim(); }

const MATCH_URLS = ["../jsons/matchstats.json","/jsons/matchstats.json","./jsons/matchstats.json","../pretty/jsons/matchstats.json"];

// Research names (ID -> pretty display name)
// File is bundled at /pretty/research_names.json
const NAME_URLS = [
  "./research_names.json",
  "/pretty/research_names.json",
  "./jsons/research_names.json",
  "/jsons/research_names.json"
];

let NAME_MAP = null;

function prettyTechName(techId){
  if (!techId) return "";
  const k = String(techId);
  const v = NAME_MAP && Object.prototype.hasOwnProperty.call(NAME_MAP, k) ? NAME_MAP[k] : null;
  return v ? String(v) : k;
}


// Research icons
// - Map (best): pretty/js/research-icons-map.js defines window.WZ2100_RESEARCH_ICON_MAP (researchId -> relative icon path)
// - Hosting:
//     * Default local base:  /pretty/data_icons/
//     * Remote fallback:    raw.githubusercontent.com (if local is missing)
//
// If you host locally, copy the "data_icons" folder into:  /pretty/data_icons/
// (A helper script is included in tools/fetch_wz_icons.sh)

const ICON_MAP = window.WZ2100_RESEARCH_ICON_MAP || {};
const ICON_FALLBACK = window.WZ2100_RESEARCH_ICON_FALLBACK || "img/research-placeholder.svg";

const DEFAULT_LOCAL_ICON_BASE = "./data_icons/";
const DEFAULT_REMOTE_ICON_BASE = "https://raw.githubusercontent.com/crab312/warzone2100-database/master/wz2100-database-project/data_icons/";

function _cleanBase(u){
  const s = String(u || "").trim();
  if (!s) return "";
  return s.replace(/\/+$/, "") + "/";
}

function iconBase(){
  // Back-compat: WZ2100_RESEARCH_ICON_BASE
  const b = window.WZ2100_ICON_BASE || window.WZ2100_RESEARCH_ICON_BASE || DEFAULT_LOCAL_ICON_BASE;
  return _cleanBase(b);
}

function remoteIconBase(){
  // Set to "" to disable remote fallback.
  const b = window.WZ2100_REMOTE_ICON_BASE;
  if (b === "") return "";
  return _cleanBase((typeof b === 'string') ? b : DEFAULT_REMOTE_ICON_BASE);
}

function fallbackRelForTech(techId){
  // Give every item *something* reasonable (avoids blank/broken icons when mapping is missing).
  const id = String(techId || "");

  // Structure upgrades / economy
  if (/^R-Struc-Research-Upgrade/i.test(id) || /^R-Struc-Research/i.test(id)) return "Structures/A0ResearchModule1.gif";
  if (/^R-Struc-Factory-Upgrade/i.test(id) || /^R-Struc-Factory/i.test(id)) return "Structures/A0FacMod1.gif";
  if (/^R-Struc-Power-Upgrade/i.test(id) || /^R-Struc-Power/i.test(id)) return "Structures/A0PowMod1.gif";
  if (/^R-Struc-RprFac/i.test(id) || /^R-Struc-RepairFacility/i.test(id)) return "Structures/A0RepairCentre3.gif";
  if (/^R-Struc-VTOLPad/i.test(id)) return "Structures/A0VtolPad.gif";
  if (/^R-Struc-VTOLFactory/i.test(id)) return "Structures/A0VTolFactory1.gif";
  if (/^R-Struc-CommandRelay/i.test(id)) return "Structures/A0ComDroidControl.gif";

  // Defense / walls
  if (/^R-Defense-/i.test(id)){
    if (/Wall/i.test(id)) return "Structures/A0HardcreteMk1Wall.gif";
    if (/AA|AASite|Flak|Hurricane/i.test(id)) return "Structures/WallTower-DoubleAAGun.gif";
    return "Structures/PillBox1.gif";
  }

  // Cyborgs / vehicles
  if (/^R-Cyborg-/i.test(id)) return "Body/CyborgHeavyBody.gif";
  if (/^R-Vehicle-/i.test(id)) return "Body/Body1REC.gif";

  // Systems / components
  if (/^R-Sys-/i.test(id) || /^R-Comp-/i.test(id)) return "SupportTurrets/SensorTurret1Mk1.gif";

  // Weapons (category-level fallback)
  if (/^R-Wpn-/i.test(id)){
    if (/^R-Wpn-Cannon/i.test(id)) return "Weapon/Cannon1Mk1.gif";
    if (/^R-Wpn-MG/i.test(id)) return "Weapon/MG1Mk1.gif";
    if (/^R-Wpn-Rocket/i.test(id)) return "Weapon/Rocket-Pod.gif";
    if (/^R-Wpn-Flamer/i.test(id)) return "Weapon/Flame1Mk1.gif";
    if (/^R-Wpn-Mortar/i.test(id)) return "Weapon/Mortar1Mk1.gif";
    if (/^R-Wpn-Howitzer/i.test(id)) return "Weapon/Howitzer105Mk1.gif";
    if (/^R-Wpn-Missile/i.test(id)) return "Weapon/Missile-A-T.gif";
    if (/^R-Wpn-Rail/i.test(id)) return "Weapon/RailGun1Mk1.gif";
    if (/^R-Wpn-Laser/i.test(id) || /^R-Wpn-Plasma/i.test(id)) return "Weapon/Laser3BEAMMk1.gif";
    if (/^R-Wpn-EMP/i.test(id)) return "Weapon/EMP-Cannon.gif";
    return "Weapon/MG1Mk1.gif";
  }

  return null;
}

function getTechIconRel(techId){
  const rel = ICON_MAP[techId];
  return rel || fallbackRelForTech(techId);
}

function getTechIconUrl(techId){
  const rel = getTechIconRel(techId);
  if (!rel) return ICON_FALLBACK;
  if (/^https?:\/\//i.test(rel) || rel.startsWith("data:") || rel.startsWith("/")) return rel;
  return iconBase() + rel.replace(/^\//, "");
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

async function loadNameMap(){
  try{
    const obj = await fetchJSON(NAME_URLS);
    if (obj && typeof obj === 'object') return obj;
  }catch(e){
    // ignore
  }
  return null;
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
function durationSec(game){
  const d = pick(game, ["duration_s","duration","durationSec","durationSeconds","length"]);
  const n = asNumber(d);
  if (n==null) return null;
  return n>100000 ? Math.round(n/1000) : Math.round(n);
}

function keywordBucket(tech){
  const t = tech.toLowerCase();
  const has = (...xs)=> xs.some(x=>t.includes(x));
  if (has("vtol","bomb","lancer","missile")) return ["VTOL/Missiles","#b45309"];
  if (has("cyborg","borg")) return ["Cyborgs","#047857"];
  if (has("laser","pulse","plasma")) return ["Energy Weapons","#be185d"];
  if (has("cannon","rail","gauss")) return ["Kinetic Weapons","#1d4ed8"];
  if (has("mg","machinegun","flamer","inferno")) return ["Early DPS","#b45309"];
  if (has("armor","armour","body","composite","reactive")) return ["Armor/Bodies","#6d28d9"];
  if (has("engine","tracks","half-track","wheels","hover")) return ["Mobility","#c2410c"];
  if (has("sensor","radar","cb","counter-battery")) return ["Sensors/Arty","#b91c1c"];
  if (has("howitzer","mortar","artillery","ripple")) return ["Artillery","#9f1239"];
  if (has("factory","power","module","gen","derrick")) return ["Economy/Production","#047857"];
  if (has("aa","sam","flak","hurricane")) return ["Anti-Air","#2563eb"];
  return ["Other","#334155"];
}

function fmtMMSS(sec){
  if (sec==null) return "—";
  const m = Math.floor(sec/60);
  const s = Math.floor(sec%60);
  return `${m}:${String(s).padStart(2,"0")}`;
}
function fmtDur(sec){
  if (sec==null) return "—";
  const m = Math.floor(sec/60);
  const s = Math.floor(sec%60);
  return `${m}m${String(s).padStart(2,'0')}s`;
}

function gameTitle(g){
  const map = norm(pick(g, ["map","mapName"])) || "unknown map";
  const name = norm(pick(g, ["name","gameName"])) || map;
  return name;
}
function gameSub(g){
  const when = extractWhen(g);
  const t = when ? when.toISOString().replace('T',' ').slice(0,19) : "unknown time";
  const id = norm(pick(g, ["id","gameId"])) || "";
  const map = norm(pick(g, ["map","mapName"])) || "";
  const parts = [t, map].filter(Boolean);
  if (id) parts.push(id);
  return parts.join(" • ");
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
function getPlayers(game){
  const players = pick(game, ["players"]) || [];
  const list = [];
  if (Array.isArray(players)){
    for (const p of players){
      if (p && typeof p==="object"){
        const nm = norm(pick(p, ["name","player","nick"]));
        if (nm) list.push(nm);
      }
    }
  }
  return [...new Set(list)];
}
function extractEvents(game){
  const rc = pick(game, ["researchComplete","research_complete","research","techComplete"]);
  if (!Array.isArray(rc)) return [];
  const players = pick(game, ["players"]) || [];
  const posMap = buildPosNameMap(players);

  const out = [];
  for (const it of rc){
    if (!it || typeof it!=="object") continue;
    const tech = norm(pick(it, ["name","tech","topic","item"]));
    if (!tech) continue;
    const pos = asNumber(pick(it, ["position","player","p","slot"]));
    const player = posMap.get(pos) || `P${pos ?? "?"}`;
    const tms = asNumber(pick(it, ["time","t","ms","sec","s"])) ?? 0;
    const sec = tms/1000;
    const st = asNumber(pick(it, ["struct","structure","structId"])) ?? null;
    const [cat, color] = keywordBucket(tech);
    out.push({player, tech, sec, cat, color, st});
  }
  out.sort((a,b)=>a.sec-b.sec);
  return out;
}

function renderLegend(){
  const el = $("legend");
  const sample = [
    ["Economy/Production","#047857"],
    ["Kinetic Weapons","#1d4ed8"],
    ["Energy Weapons","#be185d"],
    ["Early DPS","#b45309"],
    ["Armor/Bodies","#6d28d9"],
    ["Mobility","#c2410c"],
    ["Cyborgs","#047857"],
    ["Sensors/Arty","#b91c1c"],
    ["Artillery","#9f1239"],
    ["Anti-Air","#2563eb"],
    ["VTOL/Missiles","#b45309"],
    ["Other","#334155"],
  ];
  el.innerHTML = sample.map(([c,col]) =>
    `<span class="chip"><span class="dot" style="background:${col}"></span>${c}</span>`
  ).join("");
}

function setStatus(msg){ $("status").textContent = msg; }

function showTip(html, x, y){
  const tip = $("tip");
  tip.innerHTML = html;
  tip.style.left = (x+12)+"px";
  tip.style.top  = (y+12)+"px";
  tip.style.display = "block";
}
function hideTip(){ $("tip").style.display = "none"; }

function bucketize(events, bucketSec){
  const maxSec = events.length ? events[events.length-1].sec : 0;
  const n = Math.floor(maxSec / bucketSec) + 1;

  const buckets = [];
  for (let i=0;i<n;i++){
    const start = i*bucketSec;
    const label = fmtMMSS(start);
    buckets.push({start, label, byPlayer:new Map()});
  }

  for (const ev of events){
    const idx = Math.floor(ev.sec / bucketSec);
    const b = buckets[Math.min(idx, buckets.length-1)];
    if (!b.byPlayer.has(ev.player)) b.byPlayer.set(ev.player, []);
    b.byPlayer.get(ev.player).push(ev);
  }
  return buckets.filter(b => {
    for (const v of b.byPlayer.values()) if (v.length) return true;
    return false;
  });
}

function buildTable(players, buckets, q){
  const hdr = $("hdr");
  hdr.innerHTML = `<th>Time</th>` + players.map(p=>`<th>${p}</th>`).join("");

  const body = $("body");
  body.innerHTML = "";

  for (const b of buckets){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="time">${b.label}</td>` + players.map(p=>{
      const evs = b.byPlayer.get(p) || [];
      if (!evs.length) return `<td class="cell dim"></td>`;
      const html = evs.map(ev=>{
        const pretty = prettyTechName(ev.tech);
        const match = q && (
          ev.tech.toLowerCase().includes(q) ||
          pretty.toLowerCase().includes(q) ||
          ev.player.toLowerCase().includes(q) ||
          ev.cat.toLowerCase().includes(q)
        );
        const border = `border-color:${ev.color}55`;
        const bg = `background:linear-gradient(180deg, ${ev.color}12, rgba(255,255,255,.90))`;
        const rel = getTechIconRel(ev.tech) || "";
        const src = rel ? getTechIconUrl(ev.tech) : ICON_FALLBACK;
        return `<div class="event" style="${border};${bg};${match?'box-shadow:0 0 0 2px rgba(2,6,23,.10), 0 12px 30px rgba(2,6,23,.12)':''}">
          <div class="evTitle"><img class="tech-icon" loading="lazy" decoding="async" alt="" data-rel="${rel}" src="${src}"><span class="evName" title="${ev.tech}">${pretty}</span></div>
          <div class="evMeta">
            <span class="tag" style="border-color:${ev.color}55">${ev.cat}</span>
            <span class="tag">${fmtMMSS(ev.sec)}</span>
            <button class="tag bgDetailsBtn" data-tech="${ev.tech}" data-cat="${ev.cat}" type="button" onclick="bgTogglePreview(this)" title="Pictures + details">Details</button>
            ${ev.st!=null ? `<span class="tag">struct ${ev.st}</span>` : ``}
          </div>
        </div>`;
      }).join("");
      return `<td class="cell">${html}</td>`;
    }).join("");
    body.appendChild(tr);
  }

  body.querySelectorAll(".event").forEach((el)=>{
    el.addEventListener("mousemove", (e)=>{
      const title = el.querySelector(".evTitle")?.textContent || "";
      const meta = [...el.querySelectorAll(".evMeta .tag")].map(x=>x.textContent).join(" • ");
      showTip(`<div><b>${title}</b></div><div class="muted" style="margin-top:4px">${meta}</div>`, e.clientX, e.clientY);
    });
    el.addEventListener("mouseleave", hideTip);
  });

  // If an icon fails to load:
  //   1) try remote fallback (if local copy is missing)
  //   2) then show placeholder
  body.querySelectorAll("img.tech-icon").forEach((img)=>{
    img.addEventListener("error", ()=>{
      const rel = (img.dataset && img.dataset.rel) ? img.dataset.rel : "";
      const rbase = remoteIconBase();
      const alreadyRemote = rbase && String(img.src||"").startsWith(rbase);

      if (rel && rbase && !alreadyRemote && !(img.dataset && img.dataset.remoteTried)){
        if (img.dataset) img.dataset.remoteTried = "1";
        img.src = rbase + rel.replace(/^\/+/, "");
        return;
      }

      if (img.dataset && img.dataset.fallback) return;
      if (img.dataset) img.dataset.fallback = "1";
      img.src = ICON_FALLBACK;
      img.classList.add("is-fallback");
    });
  });
}

let ALL = [];
let SCOPED = [];
let CURRENT = null;


function qparam(name){
  try{ return new URLSearchParams(location.search).get(name) || ""; }
  catch(e){ return ""; }
}
function gameIdOf(g){
  return String(pick(g,["id","game_id","gameId","uuid","gamelog","logId","matchId"])||"");
}
function findGameByGid(gid){
  if (!gid) return null;
  const s = String(gid);
  return SCOPED.find(g => gameIdOf(g) === s) || null;
}

function computeScoped(allGames, scopeDays){
  const out = [];
  for (const g of allGames){
    const ev = pick(g, ["researchComplete","research_complete","research","techComplete"]);
    if (!Array.isArray(ev) || !ev.length) continue;
    const d = extractWhen(g);
    if (d && !withinDays(d, scopeDays)) continue;
    out.push(g);
  }
  out.sort((a,b)=>{
    const da = extractWhen(a)?.getTime() ?? 0;
    const db = extractWhen(b)?.getTime() ?? 0;
    return db - da;
  });
  return out;
}

function renderGamesList(){
  const q = $("gameQ").value.trim().toLowerCase();
  const el = $("gamesList");

  const items = SCOPED.filter(g=>{
    if (!q) return true;
    const hay = (gameTitle(g) + " " + gameSub(g)).toLowerCase();
    return hay.includes(q);
  }).slice(0, 60);

  if (!items.length){
    el.innerHTML = `<div class="muted small">No games match.</div>`;
    return;
  }

  el.innerHTML = items.map((g, idx)=>{
    const title = gameTitle(g);
    const sub = gameSub(g);
    const evCount = (pick(g, ["researchComplete","research_complete","research","techComplete"])||[]).length;
    const dur = durationSec(g);
    const isCur = (CURRENT === g);
    return `<div class="gitem" data-idx="${SCOPED.indexOf(g)}" style="${isCur?'outline:2px solid rgba(2,6,23,.20)':''}">
      <div>
        <div class="gtitle">${title}</div>
        <div class="gsub">${sub}</div>
      </div>
      <div class="gmeta">${evCount} ev • ${fmtDur(dur)}</div>
    </div>`;
  }).join("");

  el.querySelectorAll(".gitem").forEach(div=>{
    div.addEventListener("click", ()=>{
      const idx = Number(div.getAttribute("data-idx"));
      if (!Number.isFinite(idx) || !SCOPED[idx]) return;
      loadGame(SCOPED[idx]);
      renderGamesList();
    });
  });
}

function loadGame(game){
  CURRENT = game;
  const events = extractEvents(game);
  const players = getPlayers(game);
  const dur = durationSec(game);

  const qraw = $("q").value.trim().toLowerCase();
  const bucketSec = Number($("bucket").value);

  const buckets = bucketize(events, bucketSec);

  $("kEvents").textContent = String(events.length);
  $("kPlayers").textContent = String(players.length);
  $("kDur").textContent = fmtDur(dur);
  $("gameMeta").textContent = gameSub(game);

  buildTable(players, buckets, qraw);
}

function rerenderCurrent(){
  if (!CURRENT) return;
  loadGame(CURRENT);
}

async function loadAll(){
  $("btnRefresh").disabled = true;
  setStatus("Loading…");
  try{
    const scope = $("scope").value;
    const scopeDays = scope==="all" ? 0 : Number(scope);

    // Try to load pretty names (non-fatal)
    NAME_MAP = await loadNameMap();

    const raw = await fetchJSON(MATCH_URLS);
    ALL = extractGames(raw);
    SCOPED = computeScoped(ALL, scopeDays);

    renderLegend();
    setStatus(`Loaded ${SCOPED.length} games with research`);
    renderGamesList();

    // If called with ?gid=<id> (from Games page green hex), auto-open that game
    const gid = qparam("gid");
    const hit = findGameByGid(gid);
    if (hit){
      loadGame(hit);
      renderGamesList();
    } else {
      // auto pick first game for convenience
      if (SCOPED.length && !CURRENT) loadGame(SCOPED[0]);
    }
}catch(e){
    console.error(e);
    setStatus(`Error: ${e?.message || e}`);
  }finally{
    $("btnRefresh").disabled = false;
  }
}

$("btnRefresh").addEventListener("click", ()=>{ CURRENT=null; loadAll(); });
$("scope").addEventListener("change", ()=>{ CURRENT=null; loadAll(); });
$("bucket").addEventListener("change", rerenderCurrent);
$("q").addEventListener("input", ()=>{ clearTimeout(window.__tQ); window.__tQ=setTimeout(rerenderCurrent, 180); });
$("gameQ").addEventListener("input", ()=>{ clearTimeout(window.__tG); window.__tG=setTimeout(renderGamesList, 150); });

renderLegend();
loadAll();
