/* Auto-highlight the current section in the top nav.
   Sections: home, games, players, lobby, leaderboard */
(function () {
  function sectionFromPath(pathname) {
    const path = (pathname || "").toLowerCase();
    const file = (path.split("/").pop() || "").toLowerCase();

    // Ignore About / Rules (not in nav anymore)
    if (file === "about.html" || file === "rules.html") return null;

    // Home (/pretty/ or index.html)
    if (!file || file === "index.html" || path.endsWith("/pretty/")) return "home";

    // More specific buckets first
    if (/(^|-)players?\.html$/.test(file) || /player/.test(file)) return "players";
    if (/lobby/.test(file)) return "lobby";
    if (/top|leader|elo/.test(file)) return "leaderboard";

    // Games + match/replay/research pages
    if (/games?|match|replay|research/.test(file)) return "games";

    return null;
  }

  function applyActive() {
    const section = sectionFromPath(window.location.pathname);
    const links = document.querySelectorAll('a.navlink[data-nav]');
    if (!links.length) return;

    links.forEach((a) => {
      a.classList.remove("active");
      a.removeAttribute("aria-current");
    });

    if (!section) return;

    const target = document.querySelector(`a.navlink[data-nav="${section}"]`);
    if (target) {
      target.classList.add("active");
      target.setAttribute("aria-current", "page");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyActive);
  } else {
    applyActive();
  }
})();
