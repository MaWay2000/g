<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Game List with Popup</title>

<style>
body {
  margin: 0;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  background: #f6f7fb;
  color: #111;
}

/* ===== TABLE ===== */
.container {
  padding: 24px;
  max-width: 1200px;
  margin: auto;
}

h1 {
  margin-bottom: 16px;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

thead {
  background: #f0f2f7;
}

th, td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid #eee;
  font-size: 14px;
}

th {
  font-weight: 600;
}

tr:hover {
  background: #fafafa;
}

.hex {
  width: 26px;
  height: 26px;
  background: #22c55e;
  clip-path: polygon(
    25% 0%, 75% 0%, 100% 50%,
    75% 100%, 25% 100%, 0% 50%
  );
}

.replay-btn {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  cursor: pointer;
  font-weight: 600;
}

/* ===== OVERLAY ===== */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7); /* 70% fade */
  z-index: 999;
}

.hidden {
  display: none;
}

/* ===== POPUP ===== */
.popup {
  position: fixed;
  right: 40px;
  top: 50%;
  transform: translateY(-50%);
  width: 420px;
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  z-index: 1000;
  box-shadow: 0 25px 70px rgba(0,0,0,0.4);
  animation: slideIn 0.25s ease;
}

@keyframes slideIn {
  from {
    transform: translate(20px, -50%);
    opacity: 0;
  }
  to {
    transform: translate(0, -50%);
    opacity: 1;
  }
}

.popup-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.green { background: #e7f8ee; color: #0a7a3f; }
.red { background: #fdeaea; color: #b30000; }
.orange { background: #fff2df; color: #a45a00; }

.download {
  width: 100%;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 16px;
}

.popup h3 {
  margin: 10px 0;
}

.players {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
}

.players th, .players td {
  padding: 8px;
  font-size: 13px;
  border-bottom: 1px solid #eee;
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.actions button {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid #2563eb;
  background: #fff;
  cursor: pointer;
}
</style>
</head>

<body>

<div class="container">
  <h1>Loaded 122 games</h1>

  <table>
    <thead>
      <tr>
        <th></th>
        <th>Game</th>
        <th>Map</th>
        <th>When (UTC)</th>
        <th>Duration</th>
        <th>Result</th>
        <th>Replay</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><div class="hex"></div></td>
        <td>RO_1v1Full</td>
        <td>RO_1v1Full</td>
        <td>2026-01-13 15:53:23Z</td>
        <td>9m8s</td>
        <td>TheMonster[SFC] won vs General Hudson lost</td>
        <td><button class="replay-btn" onclick="openPopup()">Click</button></td>
      </tr>
      <tr>
        <td><div class="hex"></div></td>
        <td>EMAG</td>
        <td>EMAG</td>
        <td>2026-01-13 15:15:04Z</td>
        <td>40m30s</td>
        <td>ML won vs rbabbit lost</td>
        <td><button class="replay-btn" onclick="openPopup()">Click</button></td>
      </tr>
    </tbody>
  </table>
</div>

<!-- Overlay -->
<div id="overlay" class="overlay hidden"></div>

<!-- Popup -->
<div id="popup" class="popup hidden">
  <div class="popup-title">
    RO_1v1Full | 2026-01-13 15:53:23Z | 9m8s
  </div>

  <div class="badges">
    <span class="badge green">Winner: TheMonster[SFC]</span>
    <span class="badge red">Loser: General Hudson</span>
    <span class="badge orange">Duration: 9m8s</span>
  </div>

  <button class="download">Download replay</button>

  <h3>Players</h3>
  <table class="players">
    <thead>
      <tr>
        <th>Player</th>
        <th>Team</th>
        <th>Outcome</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>General Hudson</td>
        <td>0</td>
        <td><span class="badge red">Lost</span></td>
      </tr>
      <tr>
        <td>TheMonster[SFC]</td>
        <td>1</td>
        <td><span class="badge green">Won</span></td>
      </tr>
    </tbody>
  </table>

  <div class="actions">
    <button onclick="copyLink()">Copy link</button>
    <button onclick="closePopup()">Close</button>
  </div>
</div>

<script>
function openPopup() {
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("popup").classList.remove("hidden");
}

function closePopup() {
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("popup").classList.add("hidden");
}

function copyLink() {
  navigator.clipboard.writeText(location.href);
  alert("Link copied");
}

document.getElementById("overlay").addEventListener("click", closePopup);
</script>

</body>
</html>
