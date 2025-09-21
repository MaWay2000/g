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
  view: {
    width: typeof window !== 'undefined' ? window.innerWidth : VIEW_WIDTH,
    height: typeof window !== 'undefined' ? window.innerHeight : VIEW_HEIGHT,
  },
  players: new Map(),
  circles: new Map(),
  pressed: new Set(),
  lastFrame: performance.now(),
  selectedCircleIds: new Set(),
};

const dragState = {
  circleId: null,
  dragging: false,
  offsetX: 0,
  offsetY: 0,
  startMouseX: 0,
  startMouseY: 0,
  lastSent: 0,
};

const selectionState = {
  active: false,
  dragging: false,
  startWorldX: 0,
  startWorldY: 0,
  currentWorldX: 0,
  currentWorldY: 0,
  startScreenX: 0,
  startScreenY: 0,
};

let suppressContextMenu = false;

function resizeCanvas() {
  canvas.width = state.view.width;
  canvas.height = state.view.height;
}

function updateViewSize() {
  if (typeof window === 'undefined') {
    return;
  }

  state.view.width = window.innerWidth;
  state.view.height = window.innerHeight;
  resizeCanvas();
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

function drawCircles(camera) {
  state.circles.forEach((circle) => {
    const screenX = circle.x - camera.x;
    const screenY = circle.y - camera.y;
    const radius = circle.radius || 12;

    if (
      screenX < -radius ||
      screenX > canvas.width + radius ||
      screenY < -radius ||
      screenY > canvas.height + radius
    ) {
      return;
    }

    ctx.beginPath();
    ctx.fillStyle = circle.color || '#ffffff';
    ctx.globalAlpha = 0.8;
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (circle.markedBy) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = circle.markedBy === state.selfId ? '#ffbf69' : 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (state.selectedCircleIds.has(circle.id)) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });
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

function drawSelectionBox(camera) {
  if (!selectionState.active || !selectionState.dragging) {
    return;
  }

  const startX = selectionState.startWorldX - camera.x;
  const startY = selectionState.startWorldY - camera.y;
  const endX = selectionState.currentWorldX - camera.x;
  const endY = selectionState.currentWorldY - camera.y;

  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function getCanvasRelativePosition(event) {
  const rect = canvas.getBoundingClientRect();
  const clientX = event.clientX ?? 0;
  const clientY = event.clientY ?? 0;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function screenToWorld(screenX, screenY) {
  const camera = getCamera();
  return {
    x: screenX + camera.x,
    y: screenY + camera.y,
  };
}

function circleAtWorldPosition(worldX, worldY) {
  const circles = Array.from(state.circles.values());
  for (let index = circles.length - 1; index >= 0; index -= 1) {
    const circle = circles[index];
    const radius = circle.radius || 12;
    const dx = worldX - circle.x;
    const dy = worldY - circle.y;
    if (Math.hypot(dx, dy) <= radius) {
      return circle;
    }
  }
  return null;
}

function clampCirclePosition(x, y, radius) {
  const { width, height } = state.world;
  return {
    x: Math.max(radius, Math.min(width - radius, x)),
    y: Math.max(radius, Math.min(height - radius, y)),
  };
}

function updateCircleLocally(circleId, updates) {
  const existing = state.circles.get(circleId);
  if (!existing) {
    return null;
  }
  const updated = { ...existing, ...updates };
  state.circles.set(circleId, updated);
  return updated;
}

function setCursorForWorldPosition(worldX, worldY) {
  if (selectionState.active) {
    canvas.style.cursor = 'crosshair';
    return;
  }

  if (dragState.dragging) {
    canvas.style.cursor = 'grabbing';
    return;
  }

  if (dragState.circleId) {
    canvas.style.cursor = 'grab';
    return;
  }

  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    canvas.style.cursor = 'default';
    return;
  }

  const hoveredCircle = circleAtWorldPosition(worldX, worldY);
  if (hoveredCircle && hoveredCircle.ownerId === state.selfId) {
    canvas.style.cursor = 'pointer';
    return;
  }

  canvas.style.cursor = 'default';
}

function resetDragState() {
  dragState.circleId = null;
  dragState.dragging = false;
  dragState.offsetX = 0;
  dragState.offsetY = 0;
  dragState.startMouseX = 0;
  dragState.startMouseY = 0;
  dragState.lastSent = 0;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const camera = getCamera();
  drawGround(camera);
  drawCircles(camera);
  drawPlayers(camera);
  drawSelectionBox(camera);
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

socket.on('init', ({ selfId, world, players, circles }) => {
  state.selfId = selfId;
  state.world = world;
  state.players = new Map(players.map((p) => [p.id, p]));
  state.circles = new Map((circles || []).map((circle) => [circle.id, circle]));
  state.selectedCircleIds = new Set();
  updateViewSize();
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

socket.on('circleSpawned', (circle) => {
  state.circles.set(circle.id, circle);
});

socket.on('circleUpdated', (circle) => {
  state.circles.set(circle.id, circle);
  if (dragState.circleId === circle.id && circle.markedBy !== state.selfId) {
    resetDragState();
    setCursorForWorldPosition(NaN, NaN);
  }
});

socket.on('circlesRemoved', ({ circleIds }) => {
  circleIds.forEach((circleId) => {
    state.circles.delete(circleId);
    if (dragState.circleId === circleId) {
      resetDragState();
    }
    if (state.selectedCircleIds.has(circleId)) {
      state.selectedCircleIds.delete(circleId);
    }
  });
  setCursorForWorldPosition(NaN, NaN);
});

function handleMouseDown(event) {
  const isPrimaryButton = event.button === 0;
  const isSecondaryButton = event.button === 2;

  if (!isPrimaryButton && !isSecondaryButton) {
    return;
  }

  const local = getCanvasRelativePosition(event);
  const world = screenToWorld(local.x, local.y);
  const circle = circleAtWorldPosition(world.x, world.y);

  if (isSecondaryButton) {
    if (circle && circle.ownerId === state.selfId) {
      state.selectedCircleIds = new Set([circle.id]);
      dragState.circleId = circle.id;
      dragState.offsetX = circle.x - world.x;
      dragState.offsetY = circle.y - world.y;
      dragState.startMouseX = local.x;
      dragState.startMouseY = local.y;
      dragState.dragging = false;
      dragState.lastSent = 0;
      suppressContextMenu = true;

      setCursorForWorldPosition(world.x, world.y);
      event.preventDefault();
      return;
    }

    setCursorForWorldPosition(world.x, world.y);
    return;
  }

  if (circle && circle.ownerId === state.selfId) {
    state.selectedCircleIds = new Set([circle.id]);
    setCursorForWorldPosition(world.x, world.y);
    event.preventDefault();
    return;
  }

  selectionState.active = true;
  selectionState.dragging = false;
  selectionState.startWorldX = world.x;
  selectionState.startWorldY = world.y;
  selectionState.currentWorldX = world.x;
  selectionState.currentWorldY = world.y;
  selectionState.startScreenX = local.x;
  selectionState.startScreenY = local.y;
  state.selectedCircleIds = new Set();

  setCursorForWorldPosition(world.x, world.y);
  event.preventDefault();
}

function handleMouseMove(event) {
  const local = getCanvasRelativePosition(event);
  const world = screenToWorld(local.x, local.y);

  if (dragState.circleId) {
    const circle = state.circles.get(dragState.circleId);
    if (!circle || circle.ownerId !== state.selfId) {
      resetDragState();
      setCursorForWorldPosition(world.x, world.y);
      return;
    }

    const movedDistance = Math.hypot(local.x - dragState.startMouseX, local.y - dragState.startMouseY);
    if (!dragState.dragging && movedDistance > 2) {
      dragState.dragging = true;
      if (circle.markedBy !== state.selfId) {
        socket.emit('markCircle', { circleId: circle.id, marked: true });
        updateCircleLocally(circle.id, { markedBy: state.selfId });
      }
    }

    if (dragState.dragging) {
      const targetX = world.x + dragState.offsetX;
      const targetY = world.y + dragState.offsetY;
      const radius = circle.radius || 12;
      const { x, y } = clampCirclePosition(targetX, targetY, radius);
      updateCircleLocally(circle.id, { x, y });

      const now = performance.now();
      if (now - dragState.lastSent > 50) {
        dragState.lastSent = now;
        socket.emit('moveCircle', { circleId: circle.id, x, y });
      }
    }

    setCursorForWorldPosition(world.x, world.y);
    return;
  }

  if (selectionState.active) {
    selectionState.currentWorldX = world.x;
    selectionState.currentWorldY = world.y;
    const movedDistance = Math.hypot(
      local.x - selectionState.startScreenX,
      local.y - selectionState.startScreenY
    );
    if (!selectionState.dragging && movedDistance > 3) {
      selectionState.dragging = true;
    }
    setCursorForWorldPosition(world.x, world.y);
    return;
  }

  setCursorForWorldPosition(world.x, world.y);
}

function handleMouseUp(event) {
  if (
    event &&
    event.type !== 'mouseleave' &&
    event.button !== undefined &&
    event.button !== 0 &&
    event.button !== 2
  ) {
    return;
  }

  const local = event ? getCanvasRelativePosition(event) : null;
  const world = local ? screenToWorld(local.x, local.y) : null;

  if (selectionState.active) {
    const endWorldX = world ? world.x : selectionState.currentWorldX;
    const endWorldY = world ? world.y : selectionState.currentWorldY;

    selectionState.active = false;
    const wasDragging = selectionState.dragging;
    selectionState.dragging = false;
    selectionState.currentWorldX = endWorldX;
    selectionState.currentWorldY = endWorldY;

    if (!wasDragging) {
      state.selectedCircleIds = new Set();
      setCursorForWorldPosition(world ? world.x : NaN, world ? world.y : NaN);
      return;
    }

    const minX = Math.min(selectionState.startWorldX, endWorldX);
    const maxX = Math.max(selectionState.startWorldX, endWorldX);
    const minY = Math.min(selectionState.startWorldY, endWorldY);
    const maxY = Math.max(selectionState.startWorldY, endWorldY);

    const selectedIds = [];
    state.circles.forEach((circle) => {
      if (circle.ownerId !== state.selfId) {
        return;
      }
      if (circle.x >= minX && circle.x <= maxX && circle.y >= minY && circle.y <= maxY) {
        selectedIds.push(circle.id);
      }
    });

    state.selectedCircleIds = new Set(selectedIds);
    setCursorForWorldPosition(world ? world.x : NaN, world ? world.y : NaN);
    return;
  }

  if (!dragState.circleId) {
    setCursorForWorldPosition(world ? world.x : NaN, world ? world.y : NaN);
    return;
  }

  const circle = state.circles.get(dragState.circleId);
  if (circle && circle.ownerId === state.selfId) {
    if (dragState.dragging) {
      socket.emit('moveCircle', { circleId: circle.id, x: circle.x, y: circle.y });
      socket.emit('markCircle', { circleId: circle.id, marked: false });
      updateCircleLocally(circle.id, { markedBy: null });
    } else {
      const shouldMark = circle.markedBy !== state.selfId;
      socket.emit('markCircle', { circleId: circle.id, marked: shouldMark });
      updateCircleLocally(circle.id, { markedBy: shouldMark ? state.selfId : null });
    }
  }

  resetDragState();
  if (suppressContextMenu) {
    setTimeout(() => {
      suppressContextMenu = false;
    }, 0);
  }
  setCursorForWorldPosition(world ? world.x : NaN, world ? world.y : NaN);
}

function handleWindowBlur() {
  if (selectionState.active) {
    selectionState.active = false;
    selectionState.dragging = false;
  }
  if (dragState.circleId) {
    handleMouseUp();
  }
}

function handleContextMenu(event) {
  if (suppressContextMenu) {
    event.preventDefault();
    return;
  }

  if (state.selectedCircleIds.size === 0) {
    return;
  }

  const local = getCanvasRelativePosition(event);
  const world = screenToWorld(local.x, local.y);

  if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) {
    return;
  }

  const selectedCircles = Array.from(state.selectedCircleIds)
    .map((circleId) => state.circles.get(circleId))
    .filter((circle) => circle && circle.ownerId === state.selfId);

  if (selectedCircles.length === 0) {
    state.selectedCircleIds = new Set();
    return;
  }

  event.preventDefault();

  const center = selectedCircles.reduce(
    (acc, circle) => {
      acc.x += circle.x;
      acc.y += circle.y;
      return acc;
    },
    { x: 0, y: 0 }
  );
  center.x /= selectedCircles.length;
  center.y /= selectedCircles.length;

  const deltaX = world.x - center.x;
  const deltaY = world.y - center.y;

  const moves = selectedCircles.map((circle) => {
    const radius = circle.radius || 12;
    const targetX = circle.x + deltaX;
    const targetY = circle.y + deltaY;
    const { x, y } = clampCirclePosition(targetX, targetY, radius);
    return { circleId: circle.id, targetX: x, targetY: y };
  });

  socket.emit('commandCirclesMove', { moves });
}

canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseleave', handleMouseUp);
canvas.addEventListener('contextmenu', handleContextMenu);
window.addEventListener('mouseup', handleMouseUp);
window.addEventListener('blur', handleWindowBlur);

window.addEventListener('resize', () => {
  updateViewSize();
  render();
});

updateViewSize();

window.requestAnimationFrame(gameLoop);
