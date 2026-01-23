(() => {
  const statusEl = document.getElementById('top10Status');
  const bodyEl = document.getElementById('top10Body');

  const enc = new TextEncoder();

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

  function toBase32(bytes){
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0, value = 0, output = "";
    for (const b of bytes){
      value = (value << 8) | b;
      bits += 8;
      while (bits >= 5){
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
    return output;
  }

  async function sha256Base32(text){
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
    return toBase32(new Uint8Array(buf));
  }

  function fmtUtc(iso){
    try{
      const d = new Date(iso);
      // keep ISO-like but without milliseconds
      return d.toISOString().replace(/\.\d{3}Z$/, "Z");
    }catch(e){
      return iso || "";
    }
  }

  function fmtDuration(seconds){
    // match your existing format like 35m23s
    if (seconds == null) return "";
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}h${m}m${r}s`;
    return `${m}m${r}s`;
  }

  async function copyText(btn, text){
    try{
      await navigator.clipboard.writeText(text);
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 800);
    }catch(e){
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 800);
    }
  }

  function gameDetailLink(game){
    const id = game?.id || game?.game_id || game?.gameId || game?.uuid || "";
    return `/pretty/games.html?gid=${encodeURIComponent(String(id))}`;
  }

  function getGames(payload){
    // support {games:[...]} or [...]
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.games)) return payload.games;
    return [];
  }

  async function run(){
    statusEl.textContent = "Loading matchstats…";
    const res = await fetch(`${jsonBasePath()}matchstats.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const games = getGames(payload);

    games.sort((a,b) => {
      const da = Date.parse(a.started_utc || a.startDate || a.started || a.date || 0) || 0;
      const db = Date.parse(b.started_utc || b.startDate || b.started || b.date || 0) || 0;
      return db - da;
    });

    const top = games.slice(0, 10);

    statusEl.textContent = `Showing ${top.length} most recent games`;

    bodyEl.innerHTML = "";
    for (const g of top){
      const tr = document.createElement('tr');

      const map = g.map || g.mapName || g.gameName || "Unknown";
      const started = g.started_utc || g.startDate || g.started || "";
      const dur = fmtDuration(g.gameTime || g.duration || g.duration_s || g.durationSeconds);

      const tdMap = document.createElement('td');
      tdMap.className = 'top10-map';
      const a = document.createElement('a');
      a.href = gameDetailLink(g);
      a.textContent = map;
      tdMap.appendChild(a);

      const tdWhen = document.createElement('td');
      tdWhen.textContent = fmtUtc(started);

      const tdDur = document.createElement('td');
      tdDur.textContent = dur;

      const tdPlayers = document.createElement('td');
      const chips = document.createElement('div');
      chips.className = 'chips';

      const players = g.players || g.playerData || [];
      for (const p of players){
        const name = p.name || p.playerName || "Player";
        const pk = p.publicKey || p.public_key || p.publickey || "";
        const chip = document.createElement('div');
        chip.className = 'chip';

        const nm = document.createElement('span');
        nm.className = 'name';
        nm.textContent = name;

        const b1 = document.createElement('button');
        b1.className = 'btn-mini';
        b1.textContent = 'PK';
        b1.title = 'Copy publicKey';
        b1.addEventListener('click', () => copyText(b1, pk || ""));

        const b2 = document.createElement('button');
        b2.className = 'btn-mini';
        b2.textContent = 'HASH';
        b2.title = 'Copy Base32 fingerprint';
        b2.addEventListener('click', async () => {
          const h = await sha256Base32(pk || "");
          await copyText(b2, h);
        });

        chip.appendChild(nm);
        chip.appendChild(b1);
        chip.appendChild(b2);
        chips.appendChild(chip);
      }

      tdPlayers.appendChild(chips);

      const tdDetails = document.createElement('td');
      const btn = document.createElement('a');
      btn.className = 'btn-mini';
      btn.href = gameDetailLink(g);
      btn.textContent = 'Open';
      tdDetails.appendChild(btn);

      tr.appendChild(tdMap);
      tr.appendChild(tdWhen);
      tr.appendChild(tdDur);
      tr.appendChild(tdPlayers);
      tr.appendChild(tdDetails);

      bodyEl.appendChild(tr);
    }
  }

  run().catch(err => {
    console.error(err);
    statusEl.textContent = "Error loading data. Check that matchstats.json exists.";
  });
})();
