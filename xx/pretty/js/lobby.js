// /pretty/js/lobby.js
// Reads /jsons/remote_lobby.json (generated server-side) and renders the Lobby table.

(function () {
  "use strict";

  let all = [];

  function $(id) { return document.getElementById(id); }

  function jsonBasePath(){
    const pathname = window.location?.pathname || "/";
    if (pathname.endsWith("/")) return `${pathname}jsons/`;
    const lastSlash = pathname.lastIndexOf("/");
    const base = lastSlash >= 0 ? pathname.slice(0, lastSlash + 1) : "/";
    return `${base}jsons/`;
  }

  function setStatus(msg){
    const el = $("meta");
    if (el) el.textContent = msg;
  }

  function norm(s){ return (s ?? "").toString().toLowerCase(); }

  function render(){
    const q = norm($("q")?.value).trim();
    const pageSize = parseInt(($("pageSize")?.value || "50"), 10) || 50;

    let rows = all;
    if (q) {
      rows = rows.filter(r => {
        const hay = [
          r.gid, r.players, r.spectators,
          r.game, r.map, r.host, r.version, r.extra
        ].map(norm).join(" ");
        return hay.includes(q);
      });
    }

    setStatus(`Loaded ${rows.length} games`);

    const tbody = $("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const slice = rows.slice(0, pageSize);
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="small">No games found.</td></tr>`;
      return;
    }

    for (const r of slice) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.gid ?? ""}</td>
        <td>${r.players ?? ""}</td>
        <td>${r.spectators ?? ""}</td>
        <td>${r.game ?? ""}</td>
        <td>${r.map ?? ""}</td>
        <td>${r.host ?? ""}</td>
        <td>${r.version ?? ""}</td>
        <td>${r.extra ?? ""}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  async function load(){
    const ts = Date.now();
    const res = await fetch(`${jsonBasePath()}remote_lobby.json?ts=${ts}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`remote_lobby.json fetch failed: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("remote_lobby.json is not an array");
    all = data;
    render();
  }

  function hook(){
    $("refresh")?.addEventListener("click", () => load().catch(e => alert(e)));
    $("q")?.addEventListener("input", render);
    $("pageSize")?.addEventListener("change", render);
  }

  hook();
  load().catch(e => {
    const tbody = $("tbody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="small">Error: ${e}</td></tr>`;
    setStatus("Error loading lobby");
  });

  // Optional auto-refresh every 30s (matches timer cadence)
  setInterval(() => { load().catch(() => {}); }, 30000);
})();
