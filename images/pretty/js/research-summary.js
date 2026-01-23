/* research-summary.js
 * Clean "human readable" research view.
 * It loads the same research JSON that research-timeline.html uses.
 * If your JSON path differs, edit CANDIDATE_URLS below.
 */
(() => {
  const $ = (s) => document.querySelector(s);

  const gid = new URL(location.href).searchParams.get("gid") || "";
  const titleGid = gid ? `gid=${gid}` : "no gid provided";
  $("#matchMeta").textContent = `Research Summary • ${titleGid}`;

  // IMPORTANT: If your JSON lives somewhere else, edit these candidates.
  // Use {gid} placeholder.
  const CANDIDATE_URLS = [
    `./jsons/research_${gid}.json`,
    `./jsons/research-${gid}.json`,
    `./jsons/research/${gid}.json`,
    `./jsons/research_timeline_${gid}.json`,
    `./jsons/research-timeline/${gid}.json`,
    `./jsons/researchtimeline_${gid}.json`,
    `./jsons/researchtimeline/${gid}.json`,
    `./jsons/research-timeline_${gid}.json`,
    // If your timeline page already knows the exact path, you can add it here.
  ].filter(Boolean);

  function esc(s){
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }
  function norm(s){ return String(s ?? "").toLowerCase(); }
  function fmtTime(sec){
    if (sec == null || isNaN(sec)) return "";
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec/60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2,"0")}`;
  }

  async function fetchFirst(urls){
    let lastErr = null;
    for (const url of urls){
      try{
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const j = await r.json();
        return { url, j };
      }catch(e){ lastErr = e; }
    }
    throw lastErr || new Error("No candidates worked");
  }

  // Try to normalize many possible shapes into:
  // { match: { name, startedAt }, players: [{id,name}], events:[{player,time,topic,rawId,category}] }
  function normalize(json){
    // If it's already in a known shape, keep it.
    // We accept:
    // - { players: [...], events: [...] }
    // - { timeline: {...}, players: {...}, research: [...] }
    // - { data: ... }
    const root = json && typeof json === "object" ? json : {};
    const eventsRaw =
      root.events ||
      root.research ||
      root.items ||
      (root.data && (root.data.events || root.data.research)) ||
      [];

    const playersRaw =
      root.players ||
      (root.data && root.data.players) ||
      root.playerNames ||
      root.names ||
      null;

    // Build players list
    let players = [];
    if (Array.isArray(playersRaw)){
      players = playersRaw.map((p, i) => ({
        id: p.id ?? p.slot ?? p.player ?? i,
        name: p.name ?? p.playerName ?? `Player ${i+1}`
      }));
    } else if (playersRaw && typeof playersRaw === "object"){
      // object map
      players = Object.keys(playersRaw).map((k) => ({
        id: isNaN(+k) ? k : +k,
        name: playersRaw[k]
      }));
      players.sort((a,b) => (String(a.id)).localeCompare(String(b.id)));
    }

    // Events normalization: attempt to read fields commonly present
    const events = (Array.isArray(eventsRaw) ? eventsRaw : []).map((e, idx) => {
      const player =
        e.player ?? e.playerIndex ?? e.p ?? e.owner ?? e.slot ?? e.teamPlayer ?? e.pid ?? e.client ?? e.clientIndex ?? e.player_id ?? 0;

      const t =
        e.time ?? e.t ?? e.seconds ?? e.gameTime ?? e.game_time ?? e.timestamp ?? e.when ?? null;

      const rawId =
        e.id ?? e.tech ?? e.resId ?? e.researchId ?? e.topic ?? e.nameId ?? e.res ?? e.item ?? e.research ?? null;

      const topic =
        e.displayName ?? e.title ?? e.name ?? e.pretty ?? e.label ?? rawId ?? `Research ${idx+1}`;

      const category =
        e.category ?? e.group ?? e.area ?? e.branch ?? guessCategory(topic, rawId);

      return { player, time: coerceSeconds(t), topic: String(topic), rawId: rawId ? String(rawId) : "", category };
    });

    return { match: root.match || root.meta || {}, players, events };
  }

  function coerceSeconds(x){
    if (x == null) return null;
    if (typeof x === "number" && isFinite(x)) return x;
    const s = String(x);
    // supports "m:ss"
    const mss = s.match(/^(\d+):(\d{2})$/);
    if (mss) return (+mss[1] * 60) + (+mss[2]);
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  function guessCategory(topic, rawId){
    const s = norm(topic + " " + (rawId||""));
    if (s.includes("factory") || s.includes("power") || s.includes("econ") || s.includes("production")) return "Economy/Production";
    if (s.includes("body") || s.includes("armor") || s.includes("armour")) return "Armor/Bodies";
    if (s.includes("cannon") || s.includes("mg") || s.includes("weapon") || s.includes("rail") || s.includes("missile") || s.includes("laser") || s.includes("flame")) return "Weapons";
    if (s.includes("mortar") || s.includes("howitzer") || s.includes("artillery")) return "Artillery";
    if (s.includes("tower") || s.includes("hardpoint") || s.includes("bunker") || s.includes("defense") || s.includes("defence")) return "Defense";
    if (s.includes("sensor") || s.includes("cb") || s.includes("radar")) return "Sensors/CB";
    if (s.includes("vtol")) return "VTOL";
    if (s.includes("prop") || s.includes("tracks") || s.includes("wheels") || s.includes("hover")) return "Propulsion";
    return "Other";
  }

  const IMPORTANT_PATTERNS = [
    { key: "Factory upgrade", test: s => /factory.*upgrade|r-struc-factory-upgrade|factoryupgrade/i.test(s) },
    { key: "Power upgrade", test: s => /power.*upgrade|r-struc-power-upgrade|powerupgrade/i.test(s) },
    { key: "Body tech", test: s => /\bbody\b|r-vehicle-body/i.test(s) },
    { key: "Cannon dmg", test: s => /cannon.*damage|r-wpn-cannon-damage/i.test(s) },
    { key: "Artillery", test: s => /mortar|howitzer|artillery|r-defense-mortar/i.test(s) },
    { key: "Sensor/CB", test: s => /cb|counter[- ]battery|sensor/i.test(s) },
    { key: "VTOL", test: s => /\bvtol\b/i.test(s) },
  ];

  function isImportant(e){
    const s = `${e.topic} ${e.rawId}`;
    return IMPORTANT_PATTERNS.some(p => p.test(s));
  }

  function groupBy(arr, fn){
    const m = new Map();
    for (const x of arr){
      const k = fn(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  }

  let state = {
    focusedPlayer: null,
    q: "",
    showTimes: true,
    importantFirst: true,
    groupCats: true
  };

  function renderPlayers(players){
    const el = $("#playerChips");
    if (!players.length){
      el.innerHTML = `<div class="err">No player list found in JSON. (Still showing events.)</div>`;
      return;
    }
    el.innerHTML = players.map((p, idx) => {
      const on = state.focusedPlayer === p.id;
      return `<div class="chip ${on ? "on" : ""}" data-p="${esc(p.id)}" title="Focus ${esc(p.name)}">
        <span class="dot"></span>
        <span><b>${esc(p.name)}</b></span>
        <span class="muted">#${esc(p.id)}</span>
      </div>`;
    }).join("");

    el.querySelectorAll(".chip").forEach(ch => {
      ch.addEventListener("click", () => {
        const pid = ch.getAttribute("data-p");
        state.focusedPlayer = (String(state.focusedPlayer) === String(pid)) ? null : (isNaN(+pid) ? pid : +pid);
        renderAll();
      });
    });
  }

  function renderMoments(players, events){
    const el = $("#moments");
    const filtered = applyFilters(events);

    const perPlayer = groupBy(filtered, e => String(e.player));
    const rows = [];

    for (const p of players.length ? players : Array.from(perPlayer.keys()).map(k => ({id: k, name: `Player ${k}`}))){
      const evs = (perPlayer.get(String(p.id)) || []).slice().sort((a,b)=>(a.time??1e18)-(b.time??1e18));
      if (!evs.length) continue;

      // First important hits
      for (const pat of IMPORTANT_PATTERNS){
        const hit = evs.find(e => pat.test(`${e.topic} ${e.rawId}`));
        if (hit){
          rows.push({ who: p.name, what: pat.key, t: hit.time, ref: hit });
        }
      }
    }

    rows.sort((a,b)=>(a.t??1e18)-(b.t??1e18));
    const top = rows.slice(0, 14);

    if (!top.length){
      el.innerHTML = `<div class="muted">No obvious milestones found (or JSON fields differ). Toggle “Important first” off and use search.</div>`;
      return;
    }

    el.innerHTML = top.map(r => {
      const t = state.showTimes ? fmtTime(r.t) : "";
      return `<div class="badge">
        <div><b>${esc(r.what)}</b> <span class="muted">• ${esc(r.who)}</span></div>
        <div class="t">${esc(t)}</div>
      </div>`;
    }).join("");
  }

  function renderCompare(players, events){
    const el = $("#compare");
    const filtered = applyFilters(events);

    const checks = [
      { label:"Factory upgrade", key:"Factory upgrade", test: IMPORTANT_PATTERNS[0].test },
      { label:"Power upgrade", key:"Power upgrade", test: IMPORTANT_PATTERNS[1].test },
      { label:"Body tech", key:"Body tech", test: IMPORTANT_PATTERNS[2].test },
      { label:"Cannon dmg", key:"Cannon dmg", test: IMPORTANT_PATTERNS[3].test },
      { label:"Artillery", key:"Artillery", test: IMPORTANT_PATTERNS[4].test },
    ];

    const lines = [];
    for (const c of checks){
      let best = null;
      for (const p of players.length ? players : []){
        const evs = filtered.filter(e => String(e.player) === String(p.id));
        const hit = evs.find(e => c.test(`${e.topic} ${e.rawId}`));
        if (hit && (best == null || (hit.time ?? 1e18) < (best.time ?? 1e18))){
          best = { p, time: hit.time, hit };
        }
      }
      if (best){
        lines.push({ label: c.label, who: best.p.name, t: best.time });
      }
    }

    if (!lines.length){
      el.innerHTML = `<div class="muted">Not enough structured data for compare (or JSON differs). Still fine — lists below will work.</div>`;
      return;
    }

    el.innerHTML = lines.map(x => {
      const t = state.showTimes ? fmtTime(x.t) : "";
      return `<div class="badge">
        <div><b>${esc(x.label)}</b> <span class="muted">• ${esc(x.who)}</span></div>
        <div class="t">${esc(t)}</div>
      </div>`;
    }).join("");
  }

  function applyFilters(events){
    const q = norm(state.q).trim();
    let out = events.slice();

    if (state.focusedPlayer != null){
      out = out.filter(e => String(e.player) === String(state.focusedPlayer));
    }
    if (q){
      out = out.filter(e => norm(e.topic + " " + e.rawId + " " + e.category).includes(q));
    }
    if (state.importantFirst){
      // no filtering, but we'll sort important first later
    }
    return out;
  }

  function renderLists(players, events){
    const el = $("#lists");
    const filtered = applyFilters(events);

    // Group events by player
    const perPlayer = groupBy(filtered, e => String(e.player));

    // If players list empty, synthesize from events
    const playerList = players.length ? players.slice() : Array.from(perPlayer.keys()).map(k => ({id:k, name:`Player ${k}`}));

    el.innerHTML = playerList.map(p => {
      const evs0 = (perPlayer.get(String(p.id)) || []).slice();

      // sort: time ascending, but important items bubble up if toggle enabled
      evs0.sort((a,b) => {
        const ta = a.time ?? 1e18, tb = b.time ?? 1e18;
        if (state.importantFirst){
          const ia = isImportant(a) ? 0 : 1;
          const ib = isImportant(b) ? 0 : 1;
          if (ia !== ib) return ia - ib;
        }
        return ta - tb;
      });

      const stats = `${evs0.length} items`;
      const head = `<div class="playerHead">
        <div class="playerName">${esc(p.name)} <span class="muted">#${esc(p.id)}</span></div>
        <div class="playerStats">${esc(stats)}</div>
      </div>`;

      if (!evs0.length){
        return `<div class="playerBlock">${head}<div class="cat" style="border-top:none"><div class="muted">No items (with current filters).</div></div></div>`;
      }

      if (!state.groupCats){
        const items = evs0.map(e => renderItem(e)).join("");
        return `<div class="playerBlock">${head}<div class="cat" style="border-top:none">${items}</div></div>`;
      }

      // group by category
      const cats = groupBy(evs0, e => e.category || "Other");
      const catNames = Array.from(cats.keys()).sort((a,b)=>a.localeCompare(b));

      const catHtml = catNames.map((cname, i) => {
        const evs = cats.get(cname);
        const items = evs.map(e => renderItem(e)).join("");
        return `<div class="cat">
          <div class="catTitle"><span>${esc(cname)}</span> <span class="count">${evs.length}</span></div>
          ${items}
        </div>`;
      }).join("");

      // two column grid, but only if enough categories
      return `<div class="playerBlock">${head}<div class="catGrid">${catHtml}</div></div>`;
    }).join("");
  }

  function renderItem(e){
    const t = state.showTimes ? fmtTime(e.time) : "";
    const name = e.topic || e.rawId || "Research";
    const id = e.rawId ? `(${e.rawId})` : "";
    return `<div class="item">
      <div class="left">
        <div class="name">${esc(name)}</div>
        <div class="id">${esc(id)}</div>
      </div>
      <div class="time">${esc(t)}</div>
    </div>`;
  }

  function wireControls(){
    $("#q").addEventListener("input", (ev) => { state.q = ev.target.value; renderAll(); });
    $("#togTimes").addEventListener("change", (ev) => { state.showTimes = ev.target.checked; renderAll(); });
    $("#togImportant").addEventListener("change", (ev) => { state.importantFirst = ev.target.checked; renderAll(); });
    $("#togGroup").addEventListener("change", (ev) => { state.groupCats = ev.target.checked; renderAll(); });
  }

  let DATA = null;
  let DATA_URL = null;

  function renderAll(){
    if (!DATA) return;
    const { players, events } = DATA;
    renderPlayers(players);
    renderMoments(players, events);
    renderCompare(players, events);
    renderLists(players, events);
  }

  async function main(){
    wireControls();
    if (!gid){
      $("#lists").innerHTML = `<div class="err">Missing <b>?gid=...</b> in the URL.</div>`;
      return;
    }
    try{
      const { url, j } = await fetchFirst(CANDIDATE_URLS);
      DATA_URL = url;
      DATA = normalize(j);

      const count = DATA.events.length;
      $("#matchMeta").textContent = `Research Summary • ${titleGid} • ${count} items • ${url}`;
      renderAll();
    }catch(e){
      $("#lists").innerHTML =
        `<div class="err">
          <div style="font-weight:800;margin-bottom:6px">Couldn't load research JSON for ${esc(titleGid)}</div>
          <div style="color:#ffd4df">Tried these URLs:</div>
          <ul>${CANDIDATE_URLS.map(u=>`<li>${esc(u)}</li>`).join("")}</ul>
          <div class="muted">Fix: edit <b>CANDIDATE_URLS</b> in <code>pretty/js/research-summary.js</code> to match your real JSON path.</div>
        </div>`;
      console.error(e);
    }
  }
  main();
})();
