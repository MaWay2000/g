// /pretty/js/elo-leaderboard.js
// Simple Elo leaderboard computed client-side from /jsons/matchstats.json
// - Uses publicKey as the primary player id (fallback: lowercase player name)
// - Team Elo: each team gets an average rating; all players on the team get the same delta
// - Multi-team games: pairwise scoring, losers-vs-losers treated as draws

(function(){
  "use strict";

  const $ = (id) => document.getElementById(id);

  const K = 32;          // Elo K-factor
  const BASE = 1000;     // starting Elo
  const MAX_RECENT = 80; // modal recent games

  const state = {
    games: [],
    byId: new Map(), // id -> player aggregate
    rows: [],
    lastUtc: ""
  };

  function setStatus(t){ const el = $("status"); if (el) el.textContent = t; }

  const esc = (s)=>String(s ?? "").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm = (s)=>String(s ?? "").trim();
  const keyName = (s)=>norm(s).toLowerCase();
  const safeNum = (x)=>{ const n = Number(x); return Number.isFinite(n) ? n : 0; };

  function fmtUTC(iso){
    if (!iso) return "—";
    try{
      const d = new Date(String(iso));
      if (!isNaN(d.getTime())) return d.toISOString().replace("T"," ").replace("Z","Z");
    }catch{}
    return String(iso);
  }
  function fmtInt(n){
    n = Number(n);
    if (!Number.isFinite(n)) return "0";
    return Math.round(n).toLocaleString();
  }
  function fmt1(n){
    n = Number(n);
    if (!Number.isFinite(n)) return "—";
    return (Math.round(n*10)/10).toString();
  }
  function fmtPct(x){
    x = Number(x);
    if (!Number.isFinite(x)) return "—";
    return (Math.round(x*1000)/10) + "%";
  }

  function asGamesArray(data){
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object"){
      if (Array.isArray(data.games)) return data.games;
      if (Array.isArray(data.matches)) return data.matches;
      if (Array.isArray(data.items)) return data.items;
    }
    return [];
  }

  function whenOf(g){
    return g?.ended_utc || g?.started_utc || g?.when || g?.time || "";
  }
  function gidOf(g){
    return g?.id ?? g?.game_id ?? g?.gameId ?? g?.uuid ?? "";
  }
  function mapOf(g){
    return g?.map || g?.map_name || g?.mapName || g?.level || "";
  }
  function replayUrlOf(g){
    let rep = g?.replay_url || g?.replayUrl || g?.replay || "";
    if (!rep && g?.replay_file) rep = String(g.replay_file);
    rep = String(rep || "");
    if (rep && !rep.startsWith("/") && !rep.includes("://")) {
      if (rep.endsWith(".wzrp") || rep.endsWith(".wzreplay") || rep.endsWith(".zip")) rep = "/replays/" + rep;
      else rep = "/" + rep;
    }
    return rep;
  }

  function playerId(p){
    const pk = norm(p?.publicKey || p?.public_key || p?.pubkey || "");
    if (pk) return pk;
    return keyName(p?.name || p?.player || p?.nick || p || "");
  }

  function getAgg(id, displayName, publicKey){
    let a = state.byId.get(id);
    if (!a){
      a = {
        id,
        name: displayName || id,
        publicKey: publicKey || (id.includes("=") ? id : ""),
        elo: BASE,
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        kills: 0,
        research: 0,
        score: 0,
        last_seen: "",
        last_map: "",
        last_replay_url: "",
        history: [],     // {gid, when, map, rep, result}
        eloHistory: []   // {gid, when, delta, after}
      };
      state.byId.set(id, a);
    }
    if (displayName) a.name = displayName; // keep latest casing
    if (publicKey) a.publicKey = publicKey;
    return a;
  }

  function updateLast(a, when, map, rep){
    if (!when) return;
    if (!a.last_seen || when > a.last_seen){
      a.last_seen = when;
      a.last_map = map || a.last_map || "";
      a.last_replay_url = rep || a.last_replay_url || "";
    }
  }

  function computeExpected(ra, rb){
    return 1 / (1 + Math.pow(10, (rb - ra) / 400));
  }

  function statusFromGameTeam(teamPlayers){
    // teamPlayers: array of player objects
    let hasW = false, hasL = false;
    for (const p of teamPlayers){
      const ut = String(p?.usertype || "").toLowerCase();
      if (ut === "winner") hasW = true;
      else if (ut === "loser") hasL = true;
    }
    if (hasW && !hasL) return "W";
    if (hasL && !hasW) return "L";
    return "D";
  }

  function pairScore(si, sj){
    // Conservative: only W vs L is decisive, everything else draws.
    if (si === "W" && sj === "L") return 1;
    if (si === "L" && sj === "W") return 0;
    return 0.5;
  }

  function buildAggregates(games){
    state.byId.clear();
    state.games = games;

    // First pass: gather stats + last seen + per-game metadata
    for (const g of games){
      if (!g || typeof g !== "object") continue;
      const when = whenOf(g);
      if (when && (!state.lastUtc || when > state.lastUtc)) state.lastUtc = when;

      const gid = gidOf(g);
      const map = mapOf(g);
      const rep = replayUrlOf(g);

      const winners = new Set((Array.isArray(g.winners) ? g.winners : []).map(x => keyName(x)));
      const losers  = new Set((Array.isArray(g.losers)  ? g.losers  : []).map(x => keyName(x)));

      const plist = Array.isArray(g.players) ? g.players : [];
      for (const p of plist){
        const ut = String(p?.usertype || "").toLowerCase();
        if (ut === "spectator") continue;

        const name = norm(p?.name || p?.player || p?.nick || "");
        if (!name) continue;
        const id = playerId(p);
        const pk = norm(p?.publicKey || "");

        const a = getAgg(id, name, pk);
        a.games += 1;

        let res = "D";
        if (ut === "winner" || winners.has(keyName(name))) { a.wins += 1; res = "W"; }
        else if (ut === "loser" || losers.has(keyName(name))) { a.losses += 1; res = "L"; }
        else { a.draws += 1; res = "D"; }

        a.kills += safeNum(p?.kills);
        a.research += safeNum(p?.researchComplete);
        a.score += safeNum(p?.score);

        updateLast(a, when, map, rep);
        if (when) a.history.push({ gid, when, map, rep, result: res });
      }
    }

    // Sort each history newest-first
    for (const a of state.byId.values()){
      a.history.sort((x,y) => (y.when > x.when ? 1 : (y.when < x.when ? -1 : 0)));
    }
  }

  function computeElo(){
    // Reset all to BASE
    for (const a of state.byId.values()){
      a.elo = BASE;
      a.eloHistory = [];
    }

    const ordered = state.games.slice().filter(g => g && typeof g === "object").slice();
    ordered.sort((a,b) => {
      const wa = whenOf(a), wb = whenOf(b);
      return wa < wb ? -1 : (wa > wb ? 1 : 0);
    });

    for (const g of ordered){
      const when = whenOf(g);
      const gid = gidOf(g);
      const plist = Array.isArray(g.players) ? g.players : [];

      // Group players by team
      const teams = new Map(); // teamId -> player objects
      for (const p of plist){
        const ut = String(p?.usertype || "").toLowerCase();
        if (ut === "spectator") continue;
        const name = norm(p?.name || "");
        if (!name) continue;
        const t = Number.isFinite(Number(p?.team)) ? Number(p.team) : 0;
        if (!teams.has(t)) teams.set(t, []);
        teams.get(t).push(p);
      }

      const teamIds = Array.from(teams.keys()).sort((a,b)=>a-b);
      if (teamIds.length < 2) continue;

      // Determine each team's status (W/L/D)
      const status = new Map();
      let anyW = false, anyL = false;
      for (const tid of teamIds){
        const s = statusFromGameTeam(teams.get(tid));
        status.set(tid, s);
        if (s === "W") anyW = true;
        if (s === "L") anyL = true;
      }

      // If we don't have both winners and losers, treat as draw.
      const forceDraw = !(anyW && anyL);
      if (forceDraw){
        for (const tid of teamIds) status.set(tid, "D");
      }

      // Team average ratings
      const teamRating = new Map();
      const teamPlayerIds = new Map();
      for (const tid of teamIds){
        const ps = teams.get(tid);
        const ids = [];
        let sum = 0, cnt = 0;
        for (const p of ps){
          const id = playerId(p);
          ids.push(id);
          const a = state.byId.get(id);
          const r = a ? a.elo : BASE;
          sum += r; cnt += 1;
        }
        teamPlayerIds.set(tid, ids);
        teamRating.set(tid, cnt ? (sum / cnt) : BASE);
      }

      // Compute deltas per team
      const deltas = new Map();
      const n = teamIds.length;
      for (const ti of teamIds){
        let delta = 0;
        const ri = teamRating.get(ti);
        const si = status.get(ti);
        for (const tj of teamIds){
          if (tj === ti) continue;
          const rj = teamRating.get(tj);
          const sj = status.get(tj);
          const e = computeExpected(ri, rj);
          const s = pairScore(si, sj);
          delta += (s - e);
        }
        delta = (K / (n - 1)) * delta;
        deltas.set(ti, delta);
      }

      // Apply deltas to players
      for (const tid of teamIds){
        const delta = deltas.get(tid) || 0;
        const ids = teamPlayerIds.get(tid) || [];
        for (const id of ids){
          const a = state.byId.get(id);
          if (!a) continue;
          a.elo += delta;
          if (when) a.eloHistory.push({ gid, when, delta, after: a.elo });
        }
      }
    }

    // Round + derived metrics
    state.rows = Array.from(state.byId.values()).map(a => {
      const g = a.games || 0;
      const wr = g ? (a.wins / g) : 0;
      const kpg = g ? (a.kills / g) : 0;
      const rpg = g ? (a.research / g) : 0;
      const spg = g ? (a.score / g) : 0;
      return {
        id: a.id,
        name: a.name,
        publicKey: a.publicKey || "",
        elo: Math.round(a.elo),
        games: a.games,
        wins: a.wins,
        losses: a.losses,
        draws: a.draws,
        win_rate: wr,
        kpg, rpg, spg,
        last_seen: a.last_seen,
        last_map: a.last_map,
        last_replay_url: a.last_replay_url
      };
    });

    state.rows.sort((x,y) => (y.elo - x.elo) || (y.games - x.games) || x.name.localeCompare(y.name));
  }

  function shortKey(pk){
    if (!pk) return "—";
    if (pk.length <= 16) return pk;
    return pk.slice(0, 10) + "…" + pk.slice(-6);
  }

  function render(){
    const q = norm($("q")?.value).toLowerCase();
    const minGames = Math.max(0, Math.floor(Number($("minGames")?.value) || 0));

    const tbody = $("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    let shown = 0;
    let rank = 0;
    for (const r of state.rows){
      if ((r.games || 0) < minGames) continue;
      if (q){
        const hit = (r.name || "").toLowerCase().includes(q) || (r.publicKey || "").toLowerCase().includes(q);
        if (!hit) continue;
      }
      rank += 1;
      shown += 1;

      const tr = document.createElement("tr");
      const pk = r.publicKey || "";
      tr.innerHTML = `
        <td class="mono">${rank}</td>
        <td>
          <div class="name" data-player-id="${esc(r.id)}">${esc(r.name)}</div>
          <div class="muted" style="font-size:12px; margin-top:3px;">Last map: ${esc(r.last_map || "—")}</div>
        </td>
        <td><span class="tag">${fmtInt(r.elo)}</span></td>
        <td><strong>${fmtInt(r.games)}</strong></td>
        <td>${fmtInt(r.wins)}-${fmtInt(r.losses)}-${fmtInt(r.draws)}</td>
        <td>${fmtPct(r.win_rate)}</td>
        <td class="mono" title="${esc(pk)}" style="font-size:12px;">${esc(shortKey(pk))}</td>
        <td class="mono" style="font-size:12px;">${esc(fmtUTC(r.last_seen)).slice(0, 20)}</td>
      `;
      tbody.appendChild(tr);
    }

    $("kPlayers").textContent = String(shown);
    $("kGames").textContent = String(state.games.length);
    $("kLast").textContent = state.lastUtc ? fmtUTC(state.lastUtc).slice(0, 16) : "—";

    document.querySelectorAll("[data-player-id]").forEach(el => {
      el.onclick = () => openPlayer(el.getAttribute("data-player-id"));
    });
  }

  function openPlayer(id){
    const a = state.byId.get(id);
    if (!a) return;

    const pk = a.publicKey || "";
    const wr = a.games ? (a.wins / a.games) : 0;

    $("modalTitle").textContent = a.name;
    $("modalSub").innerHTML = `${fmtInt(Math.round(a.elo))} Elo • ${fmtInt(a.games)} games • ${fmtPct(wr)} win rate`;

    const pills = [
      ["Elo", fmtInt(Math.round(a.elo))],
      ["W-L-D", `${fmtInt(a.wins)}-${fmtInt(a.losses)}-${fmtInt(a.draws)}`],
      ["Kills", fmtInt(a.kills)],
      ["Kills/game", fmt1(a.games ? (a.kills/a.games) : 0)],
      ["Research", fmtInt(a.research)],
      ["Score", fmtInt(a.score)],
      ["Last seen", fmtUTC(a.last_seen).slice(0, 20)],
    ];
    if (pk) pills.push(["Player id", shortKey(pk)]);

    $("modalPills").innerHTML = pills.map(([k,v])=> `<div class="pill">${esc(k)}: <b>${esc(v)}</b></div>`).join("");

    const links = $("modalLinks");
    links.innerHTML = "";
    if (pk){
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Copy player id";
      btn.onclick = async () => {
        try{ await navigator.clipboard.writeText(pk); btn.textContent = "Copied"; setTimeout(()=>btn.textContent="Copy player id", 900); }catch{}
      };
      links.appendChild(btn);
    }
    if (a.last_replay_url){
      const rep = document.createElement("a");
      rep.className = "a";
      rep.href = a.last_replay_url;
      rep.textContent = "Download last replay";
      links.appendChild(rep);
    }
    const all = document.createElement("a");
    all.className = "a";
    all.href = "./games.html";
    all.textContent = "Browse games";
    links.appendChild(all);

    // Recent games: join eloHistory with per-game metadata
    const metaByGid = new Map();
    for (const h of a.history){
      if (!h?.gid) continue;
      metaByGid.set(String(h.gid), h);
    }

    const rows = (a.eloHistory || []).slice().sort((x,y)=> (y.when > x.when ? 1 : (y.when < x.when ? -1 : 0))).slice(0, MAX_RECENT);
    const body = $("modalBody");
    body.innerHTML = "";

    for (const eh of rows){
      const gid = String(eh.gid || "");
      const m = metaByGid.get(gid);
      const when = fmtUTC(eh.when).slice(0, 16);
      const map = m?.map || "—";
      const res = m?.result || "—";
      const rep = m?.rep || "";
      const delta = eh.delta || 0;
      const dClass = delta >= 0 ? "deltaUp" : "deltaDown";
      const dTxt = (delta >= 0 ? "+" : "") + fmt1(delta);

      const links = [];
      if (rep) links.push(`<a class="a" href="${esc(rep)}">Replay</a>`);
      if (gid) links.push(`<a class="a" href="./games.html?gid=${encodeURIComponent(gid)}">Open</a>`);
      if (gid) links.push(`<a class="a" href="./game-players.html?gid=${encodeURIComponent(gid)}">Players</a>`);
      if (gid) links.push(`<a class="a" href="./research-timeline.html?gid=${encodeURIComponent(gid)}">Research</a>`);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono" style="font-size:12px;">${esc(when)}</td>
        <td>${esc(map)}</td>
        <td><span class="tag">${esc(res)}</span></td>
        <td class="mono ${dClass}">${esc(dTxt)}</td>
        <td><div class="links">${links.join(" ") || `<span class="muted">—</span>`}</div></td>
      `;
      body.appendChild(tr);
    }

    $("modalBack").style.display = "flex";
    $("modalBack").setAttribute("aria-hidden","false");
  }

  function closeModal(){
    $("modalBack").style.display = "none";
    $("modalBack").setAttribute("aria-hidden","true");
  }

  async function load(){
    setStatus("Loading /jsons/matchstats.json …");
    try{
      const ts = Date.now();
      const r = await fetch(`/jsons/matchstats.json?ts=${ts}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw = await r.json();
      const games = asGamesArray(raw);
      state.lastUtc = "";
      buildAggregates(games);
      computeElo();
      setStatus(`Loaded ${games.length} games • ${state.byId.size} players`);
      render();
    }catch(e){
      console.error(e);
      setStatus("Failed to load matchstats.json");
      const tbody = $("tbody");
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="muted" style="padding:14px;">Error: ${esc(String(e))}</td></tr>`;
    }
  }

  // Hooks
  $("btnRefresh").onclick = load;
  $("q").oninput = render;
  $("minGames").oninput = render;
  $("btnClose").onclick = closeModal;
  $("modalBack").onclick = (e)=>{ if (e.target === $("modalBack")) closeModal(); };
  document.addEventListener("keydown", (e)=>{ if (e.key === "Escape") closeModal(); });

  load();
})();
