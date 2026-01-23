import { fetchJson, safeArray, toUtcString, durString, replayUrlFromMatch } from "./api.js";
import { escapeHtml } from "./render-list.js";


function cleanGameId(id) {
  const s = String(id ?? "").trim();
  // Strip internal prefixes like "gamelog_"
  const stripped = s.replace(/^gamelog[_-]?/i, "");
  return stripped || s;
}

function matchId(m) { return m?.id || m?.game_id || m?.gameId || m?.uuid || null; }
function mapName(m) { return m?.map || m?.mapName || m?.map_name || "(unknown)"; }
function startUtc(m) { return m?.started_utc || m?.start_utc || m?.startUtc || m?.startedAt || m?.start_time || m?.when || m?.ts; }
function durationSeconds(m) { return m?.duration_s ?? m?.durationSec ?? m?.duration ?? null; }

function winners(m) { return safeArray(m?.winners || m?.winner || m?.won || m?.winning_players || m?.winningPlayers); }
function losers(m) { return safeArray(m?.losers || m?.loser || m?.lost || m?.losing_players || m?.losingPlayers); }
function players(m) {
  const p = m?.players || m?.player_list || m?.playerList || [];
  return Array.isArray(p) ? p : [];
}

function nameOf(x) { return typeof x === "string" ? x : (x?.name ?? x?.player ?? x?.nick ?? ""); }

function researchList(m) {
  const r = m?.researchComplete ?? m?.research ?? [];
  return Array.isArray(r) ? r : [];
}

function fmtOffsetMs(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function posNameMap(match) {
  const mp = new Map();

  const plist = players(match);
  plist.forEach(p => {
    const nm = p?.name;
    const pos = p?.position ?? p?.index;
    if (nm && (pos === 0 || pos)) mp.set(String(pos), nm);
  });

  const pdata = Array.isArray(match?.playerData) ? match.playerData : [];
  pdata.forEach((p, i) => {
    const nm = p?.name;
    const pos = p?.position ?? p?.index ?? i;
    if (nm && (pos === 0 || pos)) mp.set(String(pos), nm);
  });

  return mp;
}

function totalsByPos(match) {
  const rc = researchList(match);
  if (rc.length) {
    const out = new Map();
    for (const e of rc) {
      const pos = e?.position ?? e?.player ?? e?.index;
      if (!(pos === 0 || pos)) continue;
      const k = String(pos);
      out.set(k, (out.get(k) || 0) + 1);
    }
    if (out.size) return out;
  }

  const pdata = Array.isArray(match?.playerData) ? match.playerData : [];
  const out = new Map();
  pdata.forEach((p, i) => {
    const pos = p?.position ?? p?.index ?? i;
    const n = p?.researchComplete;
    if (!(pos === 0 || pos)) return;
    if (typeof n === "number") out.set(String(pos), n);
  });
  return out.size ? out : null;
}

let _researchNamesPromise = null;
async function getResearchNames() {
  if (_researchNamesPromise) return _researchNamesPromise;
  _researchNamesPromise = (async () => {
    const nameUrls = [
      "./research_names.json",
      "./jsons/research_names.json",
      "/pretty/research_names.json",
      "/jsons/research_names.json"
    ];
    try {
      let lastErr;
      for (const url of nameUrls) {
        try {
          const obj = await fetchJson(url, 8000);
          if (obj && typeof obj === "object") return obj;
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error("No research_names.json found");
    } catch (err) {
      console.debug("[render-detail] names not loaded:", err?.message || err);
      return {};
    }
  })();
  return _researchNamesPromise;
}

export function showDetail(match) {
  const card = document.getElementById("detailCard");
  if (!card) return;
  card.hidden = false;

  const title = document.getElementById("detailTitle");
  const meta = document.getElementById("detailMeta");
  const pills = document.getElementById("detailPills");
  const replay = document.getElementById("detailReplay");
  const pbody = document.getElementById("playersBody");
  const researchSummary = document.getElementById("researchSummary");
  const researchBody = document.getElementById("researchBody");

  const id = matchId(match) || "(game)";
  const map = mapName(match);
  const when = toUtcString(startUtc(match));
  const dur = durString(durationSeconds(match) ?? 0);

  if (title) {
    const nice = cleanGameId(id);
    title.textContent=""; title.style.display="none";
  }
  if (meta) meta.textContent = `${map} | ${when || "UTC"} | ${dur || ""}`;

  const w = winners(match).map(nameOf).filter(Boolean);
  const l = losers(match).map(nameOf).filter(Boolean);

  if (pills) {
    pills.innerHTML = [
      w.length ? `<span class="badge good">Winners: ${escapeHtml(w.join(", "))}</span>` : "",
      l.length ? `<span class="badge bad">Losers: ${escapeHtml(l.join(", "))}</span>` : "",
      dur ? `<span class="badge warn">Duration: ${escapeHtml(dur)}</span>` : ""
    ].filter(Boolean).join(" ");
  }

  const rurl = replayUrlFromMatch(match);
  if (replay) {
    replay.innerHTML = rurl
      ? `<a class="btn" href="${rurl}" download>Download replay</a>`
      : `<span class="muted">No replay link available.</span>`;
  }

  // Players table
  if (pbody) {
    const wset = new Set(w.map(x => x.toLowerCase()));
    const lset = new Set(l.map(x => x.toLowerCase()));
    const plist = players(match);
    const seen = new Set();
    const rows = [];

    plist.forEach((p) => {
      const nm = nameOf(p);
      if (!nm) return;
      const key = nm.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      let outcome = "—";
      if (wset.has(key)) outcome = "Won";
      else if (lset.has(key)) outcome = "Lost";

      const badge = outcome === "Won"
        ? `<span class="badge good">Won</span>`
        : outcome === "Lost"
        ? `<span class="badge bad">Lost</span>`
        : `<span class="badge warn">—</span>`;

      const team = (p?.team ?? p?.position ?? p?.index);
      rows.push(`<tr><td>${escapeHtml(nm)}</td><td><code>${escapeHtml(team ?? "")}</code></td><td>${badge}</td></tr>`);
    });

    if (rows.length === 0) {
      w.forEach(nm => rows.push(`<tr><td>${escapeHtml(nm)}</td><td><code></code></td><td><span class="badge good">Won</span></td></tr>`));
      l.forEach(nm => rows.push(`<tr><td>${escapeHtml(nm)}</td><td><code></code></td><td><span class="badge bad">Lost</span></td></tr>`));
    }

    pbody.innerHTML = rows.join("");
  }

  // Research section
  if (!researchSummary || !researchBody) return;

  const nameMap = posNameMap(match);
  const totals = totalsByPos(match);
  if (totals) {
    const keys = [...totals.keys()].sort((a,b) => Number(a)-Number(b));
    const s = keys.map(k => `${nameMap.get(k) || `P${k}`}: ${totals.get(k)}`).join(" | ");
    researchSummary.innerHTML = `Totals: <code>${escapeHtml(s)}</code>`;
  } else {
    researchSummary.textContent = "No research totals available for this match.";
  }

  const rc = researchList(match);
  if (!rc.length) {
    researchBody.innerHTML = `<tr><td class="muted" colspan="3">No per-tech research list for this match.</td></tr>`;
    return;
  }

  researchBody.innerHTML = `<tr><td class="muted" colspan="3">Loading tech names…</td></tr>`;

  (async () => {
    const techNames = await getResearchNames();
    const sorted = [...rc].sort((a,b) => (a?.time ?? 0) - (b?.time ?? 0));

    const out = sorted.map((e) => {
      const rid = e?.name ?? "";
      const pos = e?.position ?? e?.player ?? e?.index;
      const pname = (pos === 0 || pos) ? (nameMap.get(String(pos)) || `Player ${pos}`) : "—";

      const pretty = (rid && techNames && techNames[rid]) ? techNames[rid] : rid || "(unknown)";
      const techCell = (rid && techNames && techNames[rid])
        ? `${escapeHtml(pretty)} <span class="muted">(<code>${escapeHtml(rid)}</code>)</span>`
        : `<code>${escapeHtml(pretty)}</code>`;

      return `<tr>
        <td><code>${escapeHtml(fmtOffsetMs(e?.time))}</code></td>
        <td>${escapeHtml(pname)}</td>
        <td>${techCell}</td>
      </tr>`;
    });

    researchBody.innerHTML = out.join("");
  })();
}
