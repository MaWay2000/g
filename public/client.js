const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const serverUrl =
  (typeof window !== 'undefined' && window.GAME_CONFIG && window.GAME_CONFIG.serverUrl) ||
  undefined;
const socket = io(serverUrl, {
  transports: ['websocket', 'polling'],
});

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;

const state = {
  selfId: null,
  world: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
  view: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
  players: new Map(),
  pressed: new Set(),
  lastFrame: performance.now(),
};

function resizeCanvas() {
  canvas.width = state.view.width;
  canvas.height = state.view.height;
}

function getCamera() {
  const self = state.players.get(state.selfId);
  if (!self) {
    return { x: 0, y: 0 };
  }

  const halfWidth = canvas.width / 2;
  const halfHeight = canvas.height / 2;

  return {
    x: self.x - halfWidth,
    y: self.y - halfHeight,
  };
}

function drawGround(camera) {
  const gridSize = 40;
  ctx.fillStyle = '#6bd4a8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  const offsetX = ((camera.x % gridSize) + gridSize) % gridSize;
  for (let x = -offsetX; x <= canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  const offsetY = ((camera.y % gridSize) + gridSize) % gridSize;
  for (let y = -offsetY; y <= canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-camera.x, -camera.y, state.world.width, state.world.height);
}

function drawPlayers(camera) {
  state.players.forEach((player) => {
    const size = 40;
    const screenX = player.x - camera.x;
    const screenY = player.y - camera.y;

    if (
      screenX < -size ||
      screenX > canvas.width + size ||
      screenY < -size ||
      screenY > canvas.height + size
    ) {
      return;
    }

    ctx.fillStyle = player.color;
    ctx.fillRect(screenX - size / 2, screenY - size / 2, size, size);

    if (player.id === state.selfId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(
        screenX - size / 2 - 2,
        screenY - size / 2 - 2,
        size + 4,
        size + 4
      );
    }

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.id.slice(0, 5), screenX, screenY - size / 2 - 8);
  });
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const camera = getCamera();
  drawGround(camera);
  drawPlayers(camera);
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
