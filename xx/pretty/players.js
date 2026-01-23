(() => {
  const $ = (id) => document.getElementById(id);

  const state = { rawGames: [], players: [], byName: new Map() };

  function setStatus(t){ $("status").textContent = t; }
  const safeArr = (x)=> Array.isArray(x) ? x : [];

  function normalizeGames(ms){
    let games = ms?.games ?? ms;
    if (!games) return [];
    if (Array.isArray(games)) return games;
    for (const k of ["items","matches","data","rows"]) if (Array.isArray(games?.[k])) return games[k];
    if (typeof games === "object"){
      const vals = Object.values(games);
      if (vals.length && typeof vals[0] === "object") return vals;
    }
    return [];
  }

  function parseWhen(g){
    const cand = g.when || g.start || g.started || g.date || g.timestamp || g.time || g.utc;
    if (!cand) return null;
    if (typeof cand === "number") return new Date(cand);
    const d = new Date(String(cand));
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtUTC(d){
    if (!d) return "—";
    return d.toISOString().replace("T"," ").replace("Z","Z");
  }

  function gidOf(g){
    return g.gid || g.id || g.gameId || g.gamelog || g.gamelog_id || g.gameLog || g.game || g.key || g.slug || g.uuid || null;
  }

  function mapOf(g){
    return g.map || g.mapName || g.map_name || g.level || g.levelName || g.challenge?.map || "—";
  }

  function durationOf(g){
    const d = g.duration || g.dur || g.length || g.durationSeconds || g.duration_s || g.gameDuration;
    if (d == null) return "—";
    if (typeof d === "string") return d;
    if (typeof d === "number"){
      const sec = d > 100000 ? Math.round(d/1000) : Math.round(d);
      const m = Math.floor(sec/60);
      const s = sec%60;
      return `${m}m${String(s).padStart(2,"0")}s`;
    }
    return "—";
  }

  function participantsOf(g){
    let ps = [];
    for (const k of ["players","participants","people","names"]) if (Array.isArray(g[k])) ps = ps.concat(g[k]);
    for (const k of ["winners","winner","won","teamWon","win","playersWon"]) if (Array.isArray(g[k])) ps = ps.concat(g[k]);
    for (const k of ["losers","loser","lost","teamLost","playersLost"]) if (Array.isArray(g[k])) ps = ps.concat(g[k]);

    ps = ps.map(p => (typeof p === "string") ? p : (p?.name ?? p?.player ?? p?.nick ?? p?.id ?? "")).filter(Boolean);

    if (!ps.length && typeof g.result === "string") {
      const m = g.result.match(/^(.*?)\s+won\s+vs\s+(.*?)\s+lost/i);
      if (m){
        ps = ps.concat(m[1].split(",").map(s=>s.trim()).filter(Boolean));
        ps = ps.concat(m[2].split(",").map(s=>s.trim()).filter(Boolean));
      }
    }
    const seen = new Set(), out=[];
    for (const p of ps){
      const k = String(p).trim();
      if (!k || seen.has(k)) continue;
      seen.add(k); out.push(k);
    }
    return out;
  }

  function winnerLoserSets(g){
    const winners = new Set(), losers = new Set();
    const pushSet = (arr,set) => safeArr(arr).forEach(x=>{
      const n = (typeof x==="string") ? x : (x?.name ?? x?.player ?? x?.nick ?? x?.id ?? "");
      if (n) set.add(String(n).trim());
    });

    pushSet(g.winners, winners);
    pushSet(g.won, winners);
    pushSet(g.teamWon, winners);
    pushSet(g.losers, losers);
    pushSet(g.lost, losers);
    pushSet(g.teamLost, losers);

    if ((!winners.size && !losers.size) && typeof g.result === "string") {
      const m = g.result.match(/^(.*?)\s+won\s+vs\s+(.*?)\s+lost/i);
      if (m){
        m[1].split(",").map(s=>s.trim()).filter(Boolean).forEach(n=>winners.add(n));
        m[2].split(",").map(s=>s.trim()).filter(Boolean).forEach(n=>losers.add(n));
      }
    }
    return { winners, losers };
  }

  const esc = (s)=>String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function buildAggregates(games){
    state.byName.clear();
    for (const g of games){
      const gid = gidOf(g);
      const when = parseWhen(g);
      const mp = mapOf(g);
      const parts = participantsOf(g);
      const { winners, losers } = winnerLoserSets(g);

      for (const p of parts){
        if (!state.byName.has(p)){
          state.byName.set(p, { name:p, games:[], maps:new Map(), wins:0, losses:0, last:null });
        }
        const a = state.byName.get(p);
        a.games.push({ gid, when, map: mp, duration: durationOf(g), result: g.result || g.outcome || g.summary || "" });
        a.maps.set(mp, (a.maps.get(mp)||0)+1);
        if (winners.has(p)) a.wins++;
        if (losers.has(p)) a.losses++;
        if (when && (!a.last || when > a.last)) a.last = when;
      }
    }

    const rows = Array.from(state.byName.values()).map(a=>{
      let topMap="—", topCount=0;
      for (const [m,c] of a.maps.entries()) if (c>topCount){ topCount=c; topMap=m; }
      return { name:a.name, games:a.games.length, wins:a.wins, losses:a.losses, last:a.last, topMap, topCount };
    });

    rows.sort((x,y)=> (y.games-x.games) || ((y.last?.getTime()||0)-(x.last?.getTime()||0)) || x.name.localeCompare(y.name));
    state.players = rows;
  }

  function render(){
    const q = $("q").value.trim().toLowerCase();
    const tbody = $("tbody");
    tbody.innerHTML = "";

    let shown = 0;
    for (const r of state.players){
      if (q){
        const hit = r.name.toLowerCase().includes(q) || String(r.topMap).toLowerCase().includes(q);
        if (!hit) continue;
      }
      shown++;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="name" data-player="">${esc(r.name)}</div>
          <div class="muted" style="font-size:12px; margin-top:3px;">
            ${r.topCount ? `${esc(r.topMap)} <span class="tag">${r.topCount}×</span>` : "—"}
          </div>
        </td>
        <td><strong>${r.games}</strong></td>
        <td>${r.wins}</td>
        <td>${r.losses}</td>
        <td class="mono" style="font-size:12px;">${esc(fmtUTC(r.last))}</td>
        <td class="muted">${esc(r.topMap)}</td>
      `;
      const nameEl = tr.querySelector(".name");
      if (nameEl) nameEl.dataset.player = r.name;
      tbody.appendChild(tr);
    }

    $("kPlayers").textContent = String(shown);
    $("kGames").textContent = String(state.rawGames.length);

    const lastGame = state.rawGames.map(g=>parseWhen(g)).filter(Boolean).sort((a,b)=>b-a)[0] || null;
    $("kLast").textContent = lastGame ? fmtUTC(lastGame).slice(0,16) : "—";

    const hi = $("highlights");
    hi.innerHTML = "";
    const top = state.players.slice(0, 8);
    $("hiTop").textContent = top.length ? `Top ${top.length} by games played` : "—";
    for (const r of top){
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `
        <h3><span class="name" data-player="">${esc(r.name)}</span></h3>
        <div class="meta">${r.games} games • ${r.wins} wins • ${r.losses} losses</div>
        <div class="meta">Last: <span class="mono">${esc(fmtUTC(r.last))}</span></div>
        <div class="meta">Map: <strong>${esc(r.topMap)}</strong></div>
        <div class="links">
          <a class="a" href="./games.html">Games</a>
          <a class="a" href="./top.html">Leaderboard</a>
        </div>
      `;
      hi.appendChild(div);
    }

    document.querySelectorAll("[data-player]").forEach(el=>{
      el.onclick = ()=> openPlayer(el.getAttribute("data-player"));
    });
  }

  function openPlayer(name){
    const agg = state.byName.get(name);
    if (!agg) return;

    $("modalTitle").textContent = name;
    $("modalSub").textContent = `${agg.games.length} games • ${agg.wins} wins • ${agg.losses} losses • last ${fmtUTC(agg.last)}`;

    const links = $("modalLinks");
    links.innerHTML = "";
    const a1 = document.createElement("a");
    a1.className="a"; a1.href="./games.html"; a1.textContent="Open Games";
    links.appendChild(a1);

    const body = $("modalBody");
    body.innerHTML = "";

    const games = agg.games.slice().sort((a,b)=>((b.when?.getTime()||0)-(a.when?.getTime()||0))).slice(0, 80);
    for (const g of games){
      const gid = g.gid ? String(g.gid) : "";
      const when = g.when ? fmtUTC(g.when).slice(0,16) : "—";
      const linkCells = gid
        ? `<a class="a" href="./game-players.html?gid=${encodeURIComponent(gid)}">Players</a>
           <a class="a" href="./research-timeline.html?gid=${encodeURIComponent(gid)}">Research</a>`
        : `<span class="muted">no gid</span>`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono" style="font-size:12px;">${esc(when)}</td>
        <td>${esc(g.duration || "—")}</td>
        <td>${esc(g.map || "—")}</td>
        <td class="muted">${esc(g.result || "")}</td>
        <td><div class="links">${linkCells}</div></td>
      `;
      body.appendChild(tr);
    }

    $("modalBack").style.display="flex";
    $("modalBack").setAttribute("aria-hidden","false");
  }

  function closeModal(){
    $("modalBack").style.display="none";
    $("modalBack").setAttribute("aria-hidden","true");
  }

  async function fetchJSONWithFallback(urls){
    let lastErr = null;
    for (const url of urls){
      try{
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        return await r.json();
      }catch(e){
        lastErr = e;
      }
    }
    throw lastErr || new Error("Failed to fetch JSON");
  }

  function jsonBasePath() {
    const pathname = window.location?.pathname || "/";
    if (pathname.includes("/pretty/")) {
      return new URL("../jsons/", window.location.href).pathname;
    }
    if (pathname.endsWith("/")) return `${pathname}jsons/`;
    const lastSlash = pathname.lastIndexOf("/");
    const base = lastSlash >= 0 ? pathname.slice(0, lastSlash + 1) : "/";
    return `${base}jsons/`;
  }

  async function load(){
    setStatus("Loading matchstats.json …");
    try{
      const basePath = jsonBasePath();
      const ms = await fetchJSONWithFallback([
        `${basePath}matchstats.json`,
        "../jsons/matchstats.json",
        "./jsons/matchstats.json",
      ]);
      const games = normalizeGames(ms);
      state.rawGames = games;
      buildAggregates(games);
      setStatus(`Loaded ${games.length} games • ${state.players.length} players`);
      render();
    }catch(e){
      console.error(e);
      setStatus("Failed to load matchstats.json");
    }
  }

  $("btnRefresh").onclick = load;
  $("q").oninput = render;
  $("btnClose").onclick = closeModal;
  $("modalBack").onclick = (e)=>{ if (e.target === $("modalBack")) closeModal(); };
  document.addEventListener("keydown",(e)=>{ if (e.key === "Escape") closeModal(); });

  load();
})();
