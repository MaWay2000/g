// /pretty/js/leaderboard.js
// "Pizzazz" light leaderboard page powered by /jsons/matchstats.json

(function(){
  "use strict";

  const $ = (id) => document.getElementById(id);

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

    function setText(id, val){
    const el = $(id);
    if (el) el.textContent = val;
  }
function safeNum(x){
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }
  function norm(s){ return (s ?? "").toString().trim(); }
  function key(s){ return norm(s).toLowerCase(); }
  function escapeHtml(s){
    return (s ?? "").toString()
      .replaceAll("&","&amp;").replaceAll("<","&lt;")
      .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
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
    if (data && typeof data === "object" && Array.isArray(data.games)) return data.games;
    if (data && typeof data === "object" && Array.isArray(data.matches)) return data.matches;
    return [];
  }

  function extractWhen(g){ return g.ended_utc || g.started_utc || g.when || g.time || ""; }
  function extractMap(g){ return g.map || g.map_name || g.level || ""; }

  function extractReplayUrl(g){
    let rep = g.replay_url || g.replayUrl || g.replay || "";
    if (!rep && g.replay_file) rep = String(g.replay_file);
    rep = (rep ?? "").toString();
    if (rep && !rep.startsWith("/") && !rep.includes("://")) {
      if (rep.endsWith(".wzrp") || rep.endsWith(".wzreplay") || rep.endsWith(".zip")) rep = "/replays/" + rep;
      else rep = "/" + rep;
    }
    return rep;
  }

  function updateLast(agg, when, map, rep){
    if (!when) return;
    if (!agg.last_seen || when > agg.last_seen){
      agg.last_seen = when;
      agg.last_map = map || agg.last_map || "";
      agg.last_replay_url = rep || agg.last_replay_url || "";
    }
  }

  function pickId(g){
    return g?.id ?? g?.game_id ?? g?.gameId ?? g?.uuid ?? "";
  }

  // Build player aggregates + per-player history + recent games
  function build(data){
    const games = asGamesArray(data);

    const by = new Map();
    const maps = new Map();

    let totalKills = 0;
    let totalResearch = 0;
    let totalScore = 0;

    let latestTime = "";

    const recentGames = [];

    for (const g of games){
      if (!g || typeof g !== "object") continue;

      const when = extractWhen(g);
      const map = extractMap(g);
      const rep = extractReplayUrl(g);

      if (when && (!latestTime || when > latestTime)) latestTime = when;

      if (map) maps.set(map, (maps.get(map) || 0) + 1);

      // keep for recent feed
      if (when) {
        recentGames.push({
          id: pickId(g),
          when,
          map,
          winners: Array.isArray(g.winners) ? g.winners.slice(0, 4) : [],
          losers: Array.isArray(g.losers) ? g.losers.slice(0, 4) : [],
          rep
        });
      }

      const winners = Array.isArray(g.winners) ? g.winners.map(key) : [];
      const losers  = Array.isArray(g.losers)  ? g.losers.map(key)  : [];
      const winSet = new Set(winners);
      const loseSet = new Set(losers);

      const plist = Array.isArray(g.players) ? g.players : [];

      for (const p of plist){
        if (!p) continue;
        const name = norm(p.name || p.player || p.nick || (typeof p === "string" ? p : ""));
        if (!name) continue;

        const k = key(name);
        let agg = by.get(k);
        if (!agg){
          agg = {
            name,
            wins:0, losses:0, draws:0, games:0,
            kills:0, research:0, score:0,
            last_seen:"", last_map:"", last_replay_url:"",
            history: [] // {when, result, map, rep}
          };
          by.set(k, agg);
        }

        agg.name = name;
        agg.games += 1;

        const usertype = (p.usertype || "").toString().toLowerCase();
        let result = "D";
        if (winSet.has(k) || usertype === "winner"){ agg.wins += 1; result = "W"; }
        else if (loseSet.has(k) || usertype === "loser"){ agg.losses += 1; result = "L"; }
        else { agg.draws += 1; result = "D"; }

        const kills = safeNum(p.kills);
        const research = safeNum(p.researchComplete);
        const score = safeNum(p.score);

        agg.kills += kills;
        agg.research += research;
        agg.score += score;

        totalKills += kills;
        totalResearch += research;
        totalScore += score;

        updateLast(agg, when, map, rep);
        if (when) agg.history.push({ when, result, map, rep });
      }
    }

    const out = [];
    const now = Date.now();
    const cutoff7 = now - (7 * 86400000);

    for (const agg of by.values()){
      const g = agg.games || 0;
      agg.win_rate = g ? (agg.wins / g) : 0;
      agg.kpg = g ? (agg.kills / g) : 0;
      agg.rpg = g ? (agg.research / g) : 0;
      agg.spg = g ? (agg.score / g) : 0;

      // history newest first
      agg.history.sort((a,b) => (b.when > a.when ? 1 : (b.when < a.when ? -1 : 0)));

      // current win streak
      let streak = 0;
      for (const h of agg.history){
        if (h.result === "W") streak++;
        else break;
      }
      agg.streak = streak;

      // last 10 form
      const last10 = agg.history.slice(0, 10);
      const w10 = last10.filter(x => x.result === "W").length;
      agg.form10 = last10.length ? (w10 / last10.length) : 0;
      agg.form10_count = last10.length;

      // activity last 7 days
      let a7 = 0;
      for (const h of agg.history){
        const t = Date.parse(h.when);
        if (!Number.isFinite(t)) continue;
        if (t >= cutoff7) a7++;
        else break;
      }
      agg.active7 = a7;

      out.push(agg);
    }

    // top map
    let topMap = "";
    let topMapCount = 0;
    for (const [m,c] of maps.entries()){
      if (c > topMapCount){ topMap = m; topMapCount = c; }
    }

    // sort recent games by time desc
    recentGames.sort((a,b) => (b.when > a.when ? 1 : (b.when < a.when ? -1 : 0)));

    return {
      players: out,
      gamesCount: games.length,
      mapsCount: maps.size,
      topMap,
      topMapCount,
      totalKills,
      totalResearch,
      totalScore,
      latestTime,
      recentGames: recentGames.slice(0, 6)
    };
  }

  const METRICS = {
    wins: {
      title: "Wins",
      valueLabel: "Wins",
      sort: (a,b) => (b.wins-a.wins) || (b.win_rate-a.win_rate) || (b.games-a.games) || a.name.localeCompare(b.name),
      columns: ["Player","Wins","Games","Win rate","Kills","Research","Last seen (UTC)","Last map","Replay"]
    },
    winrate: {
      title: "Win rate",
      valueLabel: "Win rate",
      sort: (a,b) => (b.win_rate-a.win_rate) || (b.wins-a.wins) || (b.games-a.games) || a.name.localeCompare(b.name),
      columns: ["Player","Win rate","Games","Wins","Kills/game","Research/game","Last seen (UTC)","Last map","Replay"]
    },
    kills: {
      title: "Kills",
      valueLabel: "Kills",
      sort: (a,b) => (b.kills-a.kills) || (b.kpg-a.kpg) || (b.games-a.games) || a.name.localeCompare(b.name),
      columns: ["Player","Kills","Kills/game","Games","Wins","Win rate","Last seen (UTC)","Last map","Replay"]
    },
    kpg: {
      title: "Kills per game",
      valueLabel: "Kills/game",
      sort: (a,b) => (b.kpg-a.kpg) || (b.kills-a.kills) || (b.games-a.games) || a.name.localeCompare(b.name),
      columns: ["Player","Kills/game","Games","Kills","Wins","Win rate","Last seen (UTC)","Last map","Replay"]
    },
    research: {
      title: "Research",
      valueLabel: "Research",
      sort: (a,b) => (b.research-a.research) || (b.rpg-a.rpg) || (b.games-a.games) || a.name.localeCompare(b.name),
      columns: ["Player","Research","Research/game","Games","Wins","Win rate","Last seen (UTC)","Last map","Replay"]
    },
    rpg: {
      title: "Research per game",
      valueLabel: "Research/game",
      sort: (a,b) => (b.rpg-a.rpg) || (b.research-a.research) || (b.games-a.games) || a.name.localeCompare(b.name),
      columns: ["Player","Research/game","Games","Research","Wins","Win rate","Last seen (UTC)","Last map","Replay"]
    },
    score: {
      title: "Score",
      valueLabel: "Score",
      sort: (a,b) => (b.score-a.score) || (b.spg-a.spg) || (b.games-a.games) || a.name.localeCompare(b.name),
      columns: ["Player","Score","Score/game","Games","Wins","Kills","Research","Last seen (UTC)","Last map","Replay"]
    },
    spg: {
      title: "Score per game",
      valueLabel: "Score/game",
      sort: (a,b) => (b.spg-a.spg) || (b.score-a.score) || (b.games-a.games) || a.name.localeCompare(b.name),
      columns: ["Player","Score/game","Games","Score","Wins","Win rate","Last seen (UTC)","Last map","Replay"]
    },
    streak: {
      title: "Current win streak",
      valueLabel: "Streak",
      sort: (a,b) => (b.streak-a.streak) || (b.wins-a.wins) || (b.win_rate-a.win_rate) || a.name.localeCompare(b.name),
      columns: ["Player","Streak","Games","Wins","Win rate","Last 10 form","Last seen (UTC)","Last map","Replay"]
    },
    active7: {
      title: "Most active (7 days)",
      valueLabel: "Games (7d)",
      sort: (a,b) => (b.active7-a.active7) || (b.games-a.games) || (b.wins-a.wins) || a.name.localeCompare(b.name),
      columns: ["Player","Games (7d)","Games","Wins","Win rate","Kills","Research","Last seen (UTC)","Replay"]
    },
    form10: {
      title: "Best form (last 10)",
      valueLabel: "Form (10)",
      sort: (a,b) => (b.form10-a.form10) || (b.wins-a.wins) || (b.win_rate-a.win_rate) || a.name.localeCompare(b.name),
      columns: ["Player","Form (10)","Games","Wins","Win rate","Kills/game","Research/game","Last seen (UTC)","Replay"]
    }
  };

  let STATE = { all: [], summary: null };

  function rowValue(metricKey, p){
    switch(metricKey){
      case "wins": return p.wins;
      case "winrate": return p.win_rate;
      case "kills": return p.kills;
      case "kpg": return p.kpg;
      case "research": return p.research;
      case "rpg": return p.rpg;
      case "score": return p.score;
      case "spg": return p.spg;
      case "streak": return p.streak;
      case "active7": return p.active7;
      case "form10": return p.form10;
      default: return 0;
    }
  }

  function formatValue(metricKey, v){
    if (metricKey === "winrate" || metricKey === "form10") return fmtPct(v);
    if (metricKey === "kpg" || metricKey === "rpg" || metricKey === "spg") return fmt1(v);
    return fmtInt(v);
  }

  function makePodCard(rank, p, metricKey, topVal){
    const el = document.createElement("div");
    el.className = "pod";
    el.addEventListener("click", () => openModal(p));

    const label = `#${rank}`;
    const v = rowValue(metricKey, p);
    const pct = topVal > 0 ? Math.max(0.06, Math.min(1, v / topVal)) : 0.08;

    el.innerHTML = `
      <div class="rankTag">${escapeHtml(label)}</div>
      <div class="name">${escapeHtml(p.name)}</div>
      <p class="metric"><b>${escapeHtml(METRICS[metricKey].valueLabel)}</b>: ${escapeHtml(formatValue(metricKey, v))} • Games: ${escapeHtml(fmtInt(p.games))}</p>
      <div class="bar"><div style="width:${(pct*100).toFixed(1)}%"></div></div>
    `;
    return el;
  }

  function makeHofCard(title, metricKey, rows){
    const conf = METRICS[metricKey] || METRICS.wins;
    const top = rows.slice().sort(conf.sort).slice(0, 5);
    const topVal = top.length ? rowValue(metricKey, top[0]) : 0;

    const card = document.createElement("div");
    card.className = "card fx hofCard";
    card.innerHTML = `
      <div class="hd">
        <div class="k"><b>${escapeHtml(title)}</b></div>
        <div style="color:var(--muted);font-size:13px;font-weight:1000;">${escapeHtml(conf.valueLabel)}</div>
      </div>
      <div class="bd">
        <ul class="hofList"></ul>
      </div>
    `;

    const ul = card.querySelector(".hofList");
    top.forEach((p, idx) => {
      const v = rowValue(metricKey, p);
      const pct = topVal > 0 ? Math.max(0.06, Math.min(1, v / topVal)) : 0.08;

      const li = document.createElement("li");
      li.className = "hofRow";
      li.addEventListener("click", () => openModal(p));
      li.innerHTML = `
        <div class="rk">${idx+1}</div>
        <div class="grow">
          <div class="pname">${escapeHtml(p.name)}</div>
          <div class="pmeta">Games: ${escapeHtml(fmtInt(p.games))} • Win rate: ${escapeHtml(fmtPct(p.win_rate))}</div>
          <div class="miniBar"><div style="width:${(pct*100).toFixed(1)}%"></div></div>
        </div>
        <div class="val">${escapeHtml(formatValue(metricKey, v))}</div>
      `;
      ul.appendChild(li);
    });

    return card;
  }

  function renderRecentGames(sum){
    const box = $("recentGames");
    if (!box) return;

    const items = sum.recentGames || [];
    box.innerHTML = "";

    if (!items.length){
      box.innerHTML = `<div style="color:#64748b;padding:6px 2px;">No recent games.</div>`;
      return;
    }

    items.forEach(g => {
      const div = document.createElement("div");
      div.className = "recentRow";

      const map = g.map || "—";
      const when = g.when || "—";
      const winners = (g.winners || []).filter(Boolean);
      const losers = (g.losers || []).filter(Boolean);
      const winText = winners.length ? winners.join(", ") : "—";

      const rep = g.rep ? `<a class="link" href="${escapeHtml(g.rep)}">Replay</a>` : "";

      const mapTag = g.id
        ? `<a class="tag map link" href="./games.html?gid=${encodeURIComponent(String(g.id))}">${escapeHtml(map)}</a>`
        : `<div class="tag map">${escapeHtml(map)}</div>`;

      div.innerHTML = `
        ${mapTag}
        <div style="min-width:0;">
          <div><span class="tag win">Winners</span> <b>${escapeHtml(winText)}</b> ${rep}</div>
          <div class="recentMeta">${escapeHtml(when)}</div>
        </div>
      `;

      box.appendChild(div);
    });
  }

  function renderHallOfFame(){
    const root = $("hofGrid");
    if (!root) return;

    root.innerHTML = "";
    const rows = STATE.all;

    const cards = [
      makeHofCard("Top winners", "wins", rows),
      makeHofCard("Top killers", "kills", rows),
      makeHofCard("Top researchers", "research", rows),
      makeHofCard("Top score", "score", rows)
    ];

    cards.forEach(c => root.appendChild(c));
  }

  function render(){
    const metricKey = $("metric").value || "wins";
    const conf = METRICS[metricKey] || METRICS.wins;

    const q = (($("q").value || "") + "").toLowerCase().trim();
    const minGames = Math.max(0, parseInt($("minGames").value || "0", 10) || 0);
    const limit = Math.max(1, parseInt($("limit").value || "50", 10) || 50);

    let rows = STATE.all.slice();
    rows = rows.filter(p => (p.games || 0) >= minGames);
    if (q) rows = rows.filter(p => (p.name || "").toLowerCase().includes(q));

    if (metricKey === "form10"){
      rows = rows.filter(p => (p.form10_count || 0) >= Math.min(10, Math.max(5, minGames)));
    }

    rows.sort(conf.sort);

    $("tableTitle").textContent = conf.title;
    $("meta").textContent = `Showing ${Math.min(rows.length, limit)} of ${rows.length} players • metric: ${conf.title}`;

    // podium top 3
    const podium = $("podium");
    podium.innerHTML = "";
    const top3 = rows.slice(0, 3);
    const topVal = top3.length ? rowValue(metricKey, top3[0]) : 0;
    top3.forEach((p, i) => podium.appendChild(makePodCard(i+1, p, metricKey, topVal)));

    // header
    const thead = $("thead");
    thead.innerHTML = "";
    const trh = document.createElement("tr");
    trh.innerHTML = `<th>#</th>` + conf.columns.map(c => `<th>${escapeHtml(c)}</th>`).join("");
    thead.appendChild(trh);

    // body
    const tbody = $("tbody");
    tbody.innerHTML = "";

    const slice = rows.slice(0, limit);
    if (!slice.length){
      tbody.innerHTML = `<tr><td colspan="${conf.columns.length+1}" style="padding:14px;color:#64748b">No results.</td></tr>`;
      return;
    }

    slice.forEach((p, idx) => {
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.addEventListener("click", () => openModal(p));

      let cells = [];
      if (metricKey === "wins"){
        cells = [p.name, fmtInt(p.wins), fmtInt(p.games), fmtPct(p.win_rate), fmtInt(p.kills), fmtInt(p.research), p.last_seen || "—", p.last_map || "—", p.last_replay_url ? "Download" : "—"];
      } else if (metricKey === "winrate"){
        cells = [p.name, fmtPct(p.win_rate), fmtInt(p.games), fmtInt(p.wins), fmt1(p.kpg), fmt1(p.rpg), p.last_seen || "—", p.last_map || "—", p.last_replay_url ? "Download" : "—"];
      } else if (metricKey === "kills"){
        cells = [p.name, fmtInt(p.kills), fmt1(p.kpg), fmtInt(p.games), fmtInt(p.wins), fmtPct(p.win_rate), p.last_seen || "—", p.last_map || "—", p.last_replay_url ? "Download" : "—"];
      } else if (metricKey === "kpg"){
        cells = [p.name, fmt1(p.kpg), fmtInt(p.games), fmtInt(p.kills), fmtInt(p.wins), fmtPct(p.win_rate), p.last_seen || "—", p.last_map || "—", p.last_replay_url ? "Download" : "—"];
      } else if (metricKey === "research"){
        cells = [p.name, fmtInt(p.research), fmt1(p.rpg), fmtInt(p.games), fmtInt(p.wins), fmtPct(p.win_rate), p.last_seen || "—", p.last_map || "—", p.last_replay_url ? "Download" : "—"];
      } else if (metricKey === "rpg"){
        cells = [p.name, fmt1(p.rpg), fmtInt(p.games), fmtInt(p.research), fmtInt(p.wins), fmtPct(p.win_rate), p.last_seen || "—", p.last_map || "—", p.last_replay_url ? "Download" : "—"];
      } else if (metricKey === "score"){
        cells = [p.name, fmtInt(p.score), fmt1(p.spg), fmtInt(p.games), fmtInt(p.wins), fmtInt(p.kills), fmtInt(p.research), p.last_seen || "—", p.last_map || "—", p.last_replay_url ? "Download" : "—"];
      } else if (metricKey === "spg"){
        cells = [p.name, fmt1(p.spg), fmtInt(p.games), fmtInt(p.score), fmtInt(p.wins), fmtPct(p.win_rate), p.last_seen || "—", p.last_map || "—", p.last_replay_url ? "Download" : "—"];
      } else if (metricKey === "streak"){
        cells = [p.name, fmtInt(p.streak), fmtInt(p.games), fmtInt(p.wins), fmtPct(p.win_rate), fmtPct(p.form10), p.last_seen || "—", p.last_map || "—", p.last_replay_url ? "Download" : "—"];
      } else if (metricKey === "active7"){
        cells = [p.name, fmtInt(p.active7), fmtInt(p.games), fmtInt(p.wins), fmtPct(p.win_rate), fmtInt(p.kills), fmtInt(p.research), p.last_seen || "—", p.last_replay_url ? "Download" : "—"];
      } else if (metricKey === "form10"){
        cells = [p.name, fmtPct(p.form10), fmtInt(p.games), fmtInt(p.wins), fmtPct(p.win_rate), fmt1(p.kpg), fmt1(p.rpg), p.last_seen || "—", p.last_replay_url ? "Download" : "—"];
      }

      const tds = [];
      tds.push(`<td class="num">${idx+1}</td>`);
      for (let i=0;i<cells.length;i++){
        if (i === 0){
          tds.push(`<td><b>${escapeHtml(cells[i])}</b></td>`);
        } else {
          const isReplay = (cells[i] === "Download");
          if (isReplay && p.last_replay_url){
            tds.push(`<td><a class="link" href="${escapeHtml(p.last_replay_url)}">Download</a></td>`);
          } else {
            tds.push(`<td class="num">${escapeHtml(cells[i])}</td>`);
          }
        }
      }
      tr.innerHTML = tds.join("");
      tbody.appendChild(tr);
    });
  }

  function openModal(p){
    $("modalTitle").textContent = p.name;

    const pills = [
      ["Games", fmtInt(p.games)],
      ["Wins", fmtInt(p.wins)],
      ["Losses", fmtInt(p.losses)],
      ["Draws", fmtInt(p.draws)],
      ["Win rate", fmtPct(p.win_rate)],
      ["Kills", fmtInt(p.kills)],
      ["Kills/game", fmt1(p.kpg)],
      ["Research", fmtInt(p.research)],
      ["Research/game", fmt1(p.rpg)],
      ["Score", fmtInt(p.score)],
      ["Score/game", fmt1(p.spg)],
      ["Streak", fmtInt(p.streak)],
      ["Active (7d)", fmtInt(p.active7)]
    ];

    $("modalPills").innerHTML = pills.map(([k,v]) =>
      `<div class="pill">${escapeHtml(k)}: <b>${escapeHtml(v)}</b></div>`
    ).join("");

    const last10 = (p.history || []).slice(0,10);
    $("modalForm").innerHTML = last10.length
      ? last10.map(h => `<span class="badge ${h.result}">${h.result}</span>`).join("")
      : `<span style="color:#64748b">No games.</span>`;

    const last = p.history && p.history.length ? p.history[0] : null;
    if (!last){
      $("modalLast").innerHTML = `<span style="color:#64748b">No recent map/replay.</span>`;
    } else {
      const rep = last.rep ? `<a class="link" href="${escapeHtml(last.rep)}">Download replay</a>` : `<span style="color:#64748b">No replay</span>`;
      $("modalLast").innerHTML = `
        <div><b>Last seen:</b> ${escapeHtml(last.when || "—")}</div>
        <div><b>Map:</b> ${escapeHtml(last.map || "—")}</div>
        <div style="margin-top:6px">${rep}</div>
      `;
    }

    $("modalBack").style.display = "flex";
  }

  function closeModal(){ $("modalBack").style.display = "none"; }

  async function load(){
    $("meta").textContent = "Loading…";
    const ts = Date.now();
    const res = await fetch(`${jsonBasePath()}matchstats.json?ts=${ts}`, { cache:"no-store" });
    if (!res.ok) throw new Error(`matchstats fetch failed: ${res.status}`);
    const data = await res.json();

    const sum = build(data);
    STATE.all = sum.players;
    STATE.summary = sum;

    setText("chipPlayers", fmtInt(sum.players.length));
    setText("chipGames", fmtInt(sum.gamesCount));
    setText("chipMaps", fmtInt(sum.mapsCount));
    setText("chipUpdated", sum.latestTime ? sum.latestTime.replace("T"," ").replace("Z"," UTC") : "—");

    setText("totalKills", fmtInt(sum.totalKills));
    setText("totalResearch", fmtInt(sum.totalResearch));
    setText("totalScore", fmtInt(sum.totalScore));

    const games = Math.max(1, sum.gamesCount);
    setText("killsPerGame", `${fmt1(sum.totalKills / games)} kills/game overall`);
setText("researchPerGame", `${fmt1(sum.totalResearch / games)} research/game overall`);
setText("scorePerGame", `${fmt1(sum.totalScore / games)} score/game overall`);
setText("topMap", sum.topMap || "—");
    setText("topMapMeta", sum.topMap ? `${fmtInt(sum.topMapCount)} games` : "—");

    renderHallOfFame();
    renderRecentGames(sum);
    render();
  }

  function hook(){
    $("refresh").addEventListener("click", () => load().catch(e => alert(e)));
    $("q").addEventListener("input", render);
    $("metric").addEventListener("change", render);
    $("minGames").addEventListener("input", render);
    $("limit").addEventListener("change", render);

    $("close").addEventListener("click", closeModal);
    $("modalBack").addEventListener("click", (e) => {
      if (e.target === $("modalBack")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  hook();
  load().catch(e => {
    $("meta").textContent = `Error: ${e}`;
    $("tbody").innerHTML = `<tr><td style="padding:14px;color:#64748b">Error: ${escapeHtml(String(e))}</td></tr>`;
  });

})();
