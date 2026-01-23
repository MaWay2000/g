/* research-rename.js
 * Drops clean human-friendly research names onto the timeline cards.
 * Keeps the original raw ID in the element's title attribute.
 */
(() => {
  const NAME_URLS = [
    "./research_names.json",
    "./jsons/research_names.json",
    "/pretty/research_names.json",
    "/jsons/research_names.json"
  ];

  async function fetchFirst(urls){
    let lastErr;
    for (const u of urls){
      try{
        const r = await fetch(u, { cache: "force-cache" });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return await r.json();
      }catch(e){ lastErr = e; }
    }
    throw lastErr || new Error("No research_names.json found");
  }

  function applyMap(map){
    const titles = document.querySelectorAll(".evTitle");
    titles.forEach(el => {
      const raw = (el.dataset.rawId || el.getAttribute("title") || el.textContent || "").trim();
      // If title attribute is already raw id, prefer it. Otherwise use textContent.
      const key = raw.startsWith("R-") ? raw : (el.textContent || "").trim();
      if (!key || !key.startsWith("R-")) return;

      const pretty = map[key];
      if (!pretty) return;

      // store raw once and keep it accessible
      el.dataset.rawId = key;
      el.setAttribute("title", key);
      // Replace visible text
      el.textContent = pretty;
    });
  }

  async function main(){
    try{
      const map = await fetchFirst(NAME_URLS);
      if (!map || typeof map !== "object") return;

      // initial pass
      applyMap(map);

      // keep applying as UI renders new cells
      const obs = new MutationObserver(() => applyMap(map));
      obs.observe(document.body, { childList: true, subtree: true });
    }catch(e){
      // silent fail (page still works without names)
      console.debug("[research-rename] names not loaded:", e?.message || e);
    }
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", main);
  }else{
    main();
  }
})();
