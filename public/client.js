const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const serverUrl =
  (typeof window !== 'undefined' && window.GAME_CONFIG && window.GAME_CONFIG.serverUrl) ||
  undefined;
const socket = io(serverUrl, {
  transports: ['websocket', 'polling'],
});

const state = {
  selfId: null,
  world: { width: 800, height: 600 },
  players: new Map(),
  pressed: new Set(),
  lastFrame: performance.now(),
};

function resizeCanvas() {
  canvas.width = state.world.width;
  canvas.height = state.world.height;
}

function drawGround() {
  const gridSize = 40;
  ctx.fillStyle = '#6bd4a8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  for (let x = gridSize; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = gridSize; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawPlayers() {
  state.players.forEach((player) => {
    const size = 40;
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x - size / 2, player.y - size / 2, size, size);

    if (player.id === state.selfId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(player.x - size / 2 - 2, player.y - size / 2 - 2, size + 4, size + 4);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.id.slice(0, 5), player.x, player.y - size / 2 - 8);
  });
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGround();
  drawPlayers();
}

function directionFromInput() {
  let x = 0;
  let y = 0;
  if (state.pressed.has('ArrowLeft') || state.pressed.has('KeyA')) x -= 1;
  if (state.pressed.has('ArrowRight') || state.pressed.has('KeyD')) x += 1;
  if (state.pressed.has('ArrowUp') || state.pressed.has('KeyW')) y -= 1;
  if (state.pressed.has('ArrowDown') || state.pressed.has('KeyS')) y += 1;

  if (x === 0 && y === 0) {
    return null;
  }

  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}

function gameLoop(timestamp) {
  const delta = (timestamp - state.lastFrame) / 1000;
  state.lastFrame = timestamp;

  const direction = directionFromInput();
  if (direction) {
    socket.emit('move', { direction, delta });
  }

  render();
  window.requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', (event) => {
  state.pressed.add(event.code);
});

window.addEventListener('keyup', (event) => {
  state.pressed.delete(event.code);
});

socket.on('init', ({ selfId, world, players }) => {
  state.selfId = selfId;
  state.world = world;
  state.players = new Map(players.map((p) => [p.id, p]));
  resizeCanvas();
  render();
});

socket.on('playerJoined', (player) => {
  state.players.set(player.id, player);
});

socket.on('playerMoved', (player) => {
  state.players.set(player.id, player);
});

socket.on('playerLeft', (playerId) => {
  state.players.delete(playerId);
});

window.requestAnimationFrame(gameLoop);
