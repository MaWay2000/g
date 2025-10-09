const canvas = document.getElementById('game-canvas');
const context = canvas ? canvas.getContext('2d') : null;
const logoutButton = document.getElementById('logout-button');

function navigateToLobby() {
  window.location.href = 'index.html';
}

if (logoutButton) {
  logoutButton.addEventListener('click', navigateToLobby);
}

const state = {
  player: {
    x: 0,
    y: 0,
    radius: 18,
    speed: 180,
    hue: 200,
  },
  shards: [],
  score: 0,
  timer: 30,
  keys: new Set(),
  lastTime: performance.now(),
  gameOver: false,
};

function resetGame() {
  state.player.x = canvas.clientWidth / 2;
  state.player.y = canvas.clientHeight / 2;
  state.shards = [];
  state.score = 0;
  state.timer = 30;
  state.gameOver = false;
  state.keys.clear();
  state.lastTime = performance.now();
  ensureShards();
}

function resizeCanvas() {
  const { clientWidth, clientHeight } = canvas;
  if (clientWidth === 0 || clientHeight === 0) {
    return;
  }

  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(clientWidth * scale);
  canvas.height = Math.floor(clientHeight * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.imageSmoothingEnabled = true;

  state.player.x = Math.max(state.player.radius, Math.min(clientWidth - state.player.radius, state.player.x));
  state.player.y = Math.max(state.player.radius, Math.min(clientHeight - state.player.radius, state.player.y));
  state.shards.forEach((shard) => {
    shard.x = Math.max(shard.radius, Math.min(clientWidth - shard.radius, shard.x));
    shard.y = Math.max(shard.radius, Math.min(clientHeight - shard.radius, shard.y));
  });
}

function spawnShard() {
  const padding = 24;
  const width = Math.max(0, canvas.clientWidth - padding * 2);
  const height = Math.max(0, canvas.clientHeight - padding * 2);
  const x = padding + Math.random() * width;
  const y = padding + Math.random() * height;
  const hue = Math.floor(Math.random() * 60) + 180;
  state.shards.push({ x, y, radius: 10, hue });
}

function ensureShards() {
  if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) {
    return;
  }
  while (state.shards.length < 3) {
    spawnShard();
  }
}

function handleKeyDown(event) {
  const key = event.key.toLowerCase();
  if (key === 'r' && state.gameOver) {
    event.preventDefault();
    resetGame();
    return;
  }

  const relevantKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];
  if (relevantKeys.includes(key)) {
    event.preventDefault();
    state.keys.add(key);
  }
}

function handleKeyUp(event) {
  const key = event.key.toLowerCase();
  state.keys.delete(key);
}

function update(delta) {
  const { player, keys } = state;
  const velocity = { x: 0, y: 0 };

  if (state.gameOver) {
    return;
  }

  if (keys.has('arrowup') || keys.has('w')) velocity.y -= 1;
  if (keys.has('arrowdown') || keys.has('s')) velocity.y += 1;
  if (keys.has('arrowleft') || keys.has('a')) velocity.x -= 1;
  if (keys.has('arrowright') || keys.has('d')) velocity.x += 1;

  const length = Math.hypot(velocity.x, velocity.y) || 1;
  const step = (player.speed * delta) / length;
  player.x += velocity.x * step;
  player.y += velocity.y * step;

  player.x = Math.max(player.radius, Math.min(canvas.clientWidth - player.radius, player.x));
  player.y = Math.max(player.radius, Math.min(canvas.clientHeight - player.radius, player.y));

  state.timer = Math.max(0, state.timer - delta);
  if (state.timer === 0) {
    state.keys.clear();
    state.gameOver = true;
  }

  state.shards = state.shards.filter((shard) => {
    const distance = Math.hypot(player.x - shard.x, player.y - shard.y);
    if (distance < player.radius + shard.radius) {
      state.score += 1;
      state.timer = Math.min(30, state.timer + 3);
      return false;
    }
    return true;
  });

  ensureShards();
}

function drawBackground() {
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  const gradient = context.createLinearGradient(0, 0, canvas.clientWidth, canvas.clientHeight);
  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.15)');
  gradient.addColorStop(1, 'rgba(129, 140, 248, 0.25)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
}

function drawPlayer() {
  const { player } = state;
  context.save();
  context.translate(player.x, player.y);
  const glowGradient = context.createRadialGradient(0, 0, 0, 0, 0, player.radius * 1.4);
  glowGradient.addColorStop(0, `hsla(${player.hue}, 95%, 70%, 0.95)`);
  glowGradient.addColorStop(1, `hsla(${player.hue}, 95%, 45%, 0)`);
  context.fillStyle = glowGradient;
  context.beginPath();
  context.arc(0, 0, player.radius * 1.4, 0, Math.PI * 2);
  context.fill();

  const orbGradient = context.createRadialGradient(-6, -6, 4, 0, 0, player.radius);
  orbGradient.addColorStop(0, '#f8fafc');
  orbGradient.addColorStop(1, `hsl(${player.hue}, 80%, 55%)`);
  context.fillStyle = orbGradient;
  context.beginPath();
  context.arc(0, 0, player.radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawShards() {
  context.save();
  context.lineWidth = 2;
  state.shards.forEach((shard) => {
    const gradient = context.createRadialGradient(shard.x, shard.y, 0, shard.x, shard.y, shard.radius * 1.8);
    gradient.addColorStop(0, `hsla(${shard.hue}, 95%, 75%, 0.95)`);
    gradient.addColorStop(1, `hsla(${shard.hue}, 95%, 45%, 0)`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(shard.x, shard.y, shard.radius * 1.6, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = `hsla(${shard.hue}, 90%, 60%, 0.85)`;
    context.beginPath();
    context.arc(shard.x, shard.y, shard.radius, 0, Math.PI * 2);
    context.stroke();
  });
  context.restore();
}

function drawHud() {
  context.save();
  context.fillStyle = 'rgba(15, 23, 42, 0.75)';
  context.font = '600 16px "Inter", system-ui, sans-serif';
  context.textBaseline = 'top';
  context.fillText(`Score: ${state.score}`, 16, 16);
  context.fillText(`Time: ${state.timer.toFixed(1)}s`, 16, 40);
  if (state.gameOver) {
    context.fillText('Press R to restart', 16, 64);
  }
  context.restore();
}

function gameLoop(now) {
  const delta = (now - state.lastTime) / 1000;
  state.lastTime = now;

  update(delta);
  drawBackground();
  drawShards();
  drawPlayer();
  drawHud();

  requestAnimationFrame(gameLoop);
}

function initialize() {
  resizeCanvas();
  resetGame();
  window.addEventListener('keydown', handleKeyDown, { passive: false });
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('resize', resizeCanvas);
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    state.player.x = event.clientX - rect.left;
    state.player.y = event.clientY - rect.top;
  });
  requestAnimationFrame((time) => {
    state.lastTime = time;
    gameLoop(time);
  });
}

if (canvas && context) {
  initialize();
} else {
  console.warn('Game canvas failed to initialize.');
}
