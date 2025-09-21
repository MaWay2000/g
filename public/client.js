const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const NAME_MAX_LENGTH = 20;
const startScreen = document.getElementById('start-screen');
const startForm = document.getElementById('start-form');
const nameInput = document.getElementById('player-name');
const startError = document.getElementById('start-error');

const serverUrl =
  (typeof window !== 'undefined' && window.GAME_CONFIG && window.GAME_CONFIG.serverUrl) ||
  undefined;

let socket = null;
let gameStarted = false;
let interactionHandlersAttached = false;
let lastSentPlayerName = null;

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;

const state = {
  selfId: null,
  world: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
  view: {
    width: typeof window !== 'undefined' ? window.innerWidth : VIEW_WIDTH,
    height: typeof window !== 'undefined' ? window.innerHeight : VIEW_HEIGHT,
  },
  camera: {
    angle: 0,
    pitch: 0,
    verticalScale: 0.55,
    horizon: 0.6,
    scale: 1,
    zoom: 1,
  },
  players: new Map(),
  circles: new Map(),
  pressed: new Set(),
  lastFrame: performance.now(),
  selectedCircleIds: new Set(),
  playerName: '',
  isReady: false,
  pendingPlayerName: null,
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

const cameraControl = {
  active: false,
  rotating: false,
  adjustingTilt: false,
  startX: 0,
  startY: 0,
  startAngle: 0,
  startPitch: 0,
  startWorldX: 0,
  startWorldY: 0,
  button: 0,
  allowRotation: false,
};

const CAMERA_ROTATION_SPEED = 0.0045;
const CAMERA_TILT_SPEED = 0.0025;
const CAMERA_MIN_PITCH = 0;
const CAMERA_MAX_PITCH = 1;
const CAMERA_VERTICAL_SCALE_AT_MIN_PITCH = 0.55;
const CAMERA_VERTICAL_SCALE_AT_MAX_PITCH = 1;
const CAMERA_HORIZON_AT_MIN_PITCH = 0.6;
const CAMERA_HORIZON_AT_MAX_PITCH = 0.5;
const CAMERA_MIN_SCALE = 0.2;
const CAMERA_ZOOM_SENSITIVITY = 0.0015;
const CAMERA_MIN_ZOOM = 0.5;
const CAMERA_MAX_ZOOM = Number.POSITIVE_INFINITY;
const SELECTION_DRAG_THRESHOLD = 8;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setCameraPitch(pitch) {
  const clamped = clamp(pitch, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
  state.camera.pitch = clamped;
  const t = clamped;
  state.camera.verticalScale =
    CAMERA_VERTICAL_SCALE_AT_MIN_PITCH +
    (CAMERA_VERTICAL_SCALE_AT_MAX_PITCH - CAMERA_VERTICAL_SCALE_AT_MIN_PITCH) * t;
  state.camera.horizon =
    CAMERA_HORIZON_AT_MIN_PITCH +
    (CAMERA_HORIZON_AT_MAX_PITCH - CAMERA_HORIZON_AT_MIN_PITCH) * t;
}

setCameraPitch(state.camera.pitch);

function resizeCanvas() {
  canvas.width = state.view.width;
  canvas.height = state.view.height;
  updateCameraScale();
}

function updateViewSize() {
  if (typeof window === 'undefined') {
    return;
  }

  state.view.width = window.innerWidth;
  state.view.height = window.innerHeight;
  resizeCanvas();
}

function updateCameraScale() {
  const base = Math.min(canvas.width, canvas.height);
  const reference = Math.max(state.world.width, state.world.height) || 1;
  const baseScale = (base / reference) * 0.9;
  const zoomedScale = baseScale * state.camera.zoom;
  state.camera.scale = Math.max(zoomedScale, CAMERA_MIN_SCALE);
}

function setCameraZoom(zoom) {
  const clamped = clamp(zoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM);
  if (clamped === state.camera.zoom) {
    return false;
  }

  state.camera.zoom = clamped;
  updateCameraScale();
  return true;
}

function sanitizePlayerName(name) {
  if (typeof name !== 'string') {
    return '';
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.slice(0, NAME_MAX_LENGTH);
}

function hideStartScreen() {
  if (!startScreen) {
    return;
  }

  startScreen.classList.add('hidden');
}

function updateLocalPlayerName(name) {
  state.playerName = name;
  if (!state.selfId) {
    state.pendingPlayerName = name;
    return;
  }

  const selfPlayer = state.players.get(state.selfId);
  if (!selfPlayer) {
    state.pendingPlayerName = name;
    return;
  }

  selfPlayer.name = name;
  state.players.set(state.selfId, selfPlayer);
  state.pendingPlayerName = null;
}

function sendNameToServer(name) {
  const sanitized = sanitizePlayerName(name);
  if (!sanitized || !socket) {
    return false;
  }

  if (lastSentPlayerName === sanitized) {
    return false;
  }

  socket.emit('setName', { name: sanitized });
  lastSentPlayerName = sanitized;
  return true;
}

function emitStoredPlayerName() {
  const storedName = state.pendingPlayerName || state.playerName;
  return sendNameToServer(storedName);
}

function setupSocket() {
  if (socket) {
    return socket;
  }

  const handshakeName = sanitizePlayerName(state.pendingPlayerName || state.playerName);
  const options = {
    transports: ['websocket', 'polling'],
  };

  if (handshakeName) {
    options.auth = { name: handshakeName };
    lastSentPlayerName = handshakeName;
  }

  socket = io(serverUrl, options);

  socket.on('init', handleSocketInit);
  socket.on('playerJoined', handleSocketPlayerJoined);
  socket.on('connect', handleSocketConnect);
  socket.on('playerMoved', handleSocketPlayerMoved);
  socket.on('playerLeft', handleSocketPlayerLeft);
  socket.on('playerUpdated', handleSocketPlayerUpdated);
  socket.on('circleSpawned', handleSocketCircleSpawned);
  socket.on('circleUpdated', handleSocketCircleUpdated);
  socket.on('circlesRemoved', handleSocketCirclesRemoved);

  return socket;
}

function handleStartFormSubmit(event) {
  event.preventDefault();

  if (!startForm) {
    startGame();
    return;
  }

  const sanitized = sanitizePlayerName(nameInput ? nameInput.value : '');
  if (!sanitized) {
    if (startError) {
      startError.textContent = 'Please enter a name to get started.';
    }
    if (nameInput) {
      nameInput.focus();
    }
    return;
  }

  if (startError) {
    startError.textContent = '';
  }

  if (nameInput) {
    nameInput.value = sanitized;
  }

  updateLocalPlayerName(sanitized);
  hideStartScreen();
  startGame();
}

function getCameraTarget() {
  const self = state.players.get(state.selfId);
  if (!self) {
    return {
      x: state.world.width / 2,
      y: state.world.height / 2,
    };
  }

  return { x: self.x, y: self.y };
}

function projectWorldPoint(worldX, worldY) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    return null;
  }

  const target = getCameraTarget();
  const dx = worldX - target.x;
  const dy = worldY - target.y;
  const cos = Math.cos(state.camera.angle);
  const sin = Math.sin(state.camera.angle);
  const rotatedX = dx * cos - dy * sin;
  const rotatedY = dx * sin + dy * cos;

  const scale = state.camera.scale;
  const baseY = canvas.height * state.camera.horizon;

  const screenX = canvas.width / 2 + rotatedX * scale;
  const screenY = baseY + rotatedY * scale * state.camera.verticalScale;

  return {
    x: screenX,
    y: screenY,
    depth: rotatedY,
    rotatedX,
    rotatedY,
  };
}

function screenToWorld(screenX, screenY) {
  const scale = state.camera.scale;
  const baseY = canvas.height * state.camera.horizon;
  const cos = Math.cos(state.camera.angle);
  const sin = Math.sin(state.camera.angle);
  const relX = (screenX - canvas.width / 2) / scale;
  const relY = (screenY - baseY) / (scale * state.camera.verticalScale);

  const dx = relX * cos + relY * sin;
  const dy = -relX * sin + relY * cos;
  const target = getCameraTarget();

  return {
    x: target.x + dx,
    y: target.y + dy,
  };
}

function drawGround() {
  ctx.fillStyle = '#0b1f1b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const corners = [
    projectWorldPoint(0, 0),
    projectWorldPoint(state.world.width, 0),
    projectWorldPoint(state.world.width, state.world.height),
    projectWorldPoint(0, state.world.height),
  ];

  if (corners.some((corner) => !corner)) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let index = 1; index < corners.length; index += 1) {
    ctx.lineTo(corners[index].x, corners[index].y);
  }
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#2c6950');
  gradient.addColorStop(1, '#1e4e3a');
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.clip();

  const gridSize = 40;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';

  for (let x = 0; x <= state.world.width; x += gridSize) {
    const start = projectWorldPoint(x, 0);
    const end = projectWorldPoint(x, state.world.height);
    if (!start || !end) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  for (let y = 0; y <= state.world.height; y += gridSize) {
    const start = projectWorldPoint(0, y);
    const end = projectWorldPoint(state.world.width, y);
    if (!start || !end) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let index = 1; index < corners.length; index += 1) {
    ctx.lineTo(corners[index].x, corners[index].y);
  }
  ctx.closePath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.stroke();
}

function drawCircles() {
  const projected = [];
  state.circles.forEach((circle) => {
    const point = projectWorldPoint(circle.x, circle.y);
    if (!point) {
      return;
    }
    projected.push({ circle, point });
  });

  projected.sort((a, b) => a.point.depth - b.point.depth);

  projected.forEach(({ circle, point }) => {
    const radius = circle.radius || 12;
    const radiusX = radius * state.camera.scale;
    const radiusY = radiusX * state.camera.verticalScale;

    ctx.beginPath();
    ctx.fillStyle = circle.color || '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.ellipse(point.x, point.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (circle.markedBy) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = circle.markedBy === state.selfId ? '#ffbf69' : 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (state.selectedCircleIds.has(circle.id)) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, radiusX + 6, radiusY + 6 * state.camera.verticalScale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });
}

function drawPlayers() {
  const projected = [];
  state.players.forEach((player) => {
    const centerPoint = projectWorldPoint(player.x, player.y);
    if (!centerPoint) {
      return;
    }
    projected.push({ player, centerPoint });
  });

  projected.sort((a, b) => a.centerPoint.depth - b.centerPoint.depth);

  projected.forEach(({ player, centerPoint }) => {
    const size = 40;
    const half = size / 2;
    const corners = [
      projectWorldPoint(player.x - half, player.y - half),
      projectWorldPoint(player.x + half, player.y - half),
      projectWorldPoint(player.x + half, player.y + half),
      projectWorldPoint(player.x - half, player.y + half),
    ];

    if (corners.some((corner) => !corner)) {
      return;
    }

    const shadowRadiusX = size * 0.4 * state.camera.scale;
    const shadowRadiusY = shadowRadiusX * state.camera.verticalScale;
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.ellipse(centerPoint.x, centerPoint.y + shadowRadiusY * 0.4, shadowRadiusX, shadowRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let index = 1; index < corners.length; index += 1) {
      ctx.lineTo(corners[index].x, corners[index].y);
    }
    ctx.closePath();
    ctx.fillStyle = player.color;
    ctx.globalAlpha = 0.95;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (player.id === state.selfId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    const rawName = typeof player.name === 'string' ? player.name.trim() : '';
    if (rawName) {
      ctx.fillText(rawName, centerPoint.x, centerPoint.y - size * state.camera.verticalScale - 10);
    }
  });
}

function drawSelectionBox() {
  if (!selectionState.active || !selectionState.dragging) {
    return;
  }

  const minX = Math.min(selectionState.startWorldX, selectionState.currentWorldX);
  const maxX = Math.max(selectionState.startWorldX, selectionState.currentWorldX);
  const minY = Math.min(selectionState.startWorldY, selectionState.currentWorldY);
  const maxY = Math.max(selectionState.startWorldY, selectionState.currentWorldY);

  const corners = [
    projectWorldPoint(minX, minY),
    projectWorldPoint(maxX, minY),
    projectWorldPoint(maxX, maxY),
    projectWorldPoint(minX, maxY),
  ];

  if (corners.some((corner) => !corner)) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let index = 1; index < corners.length; index += 1) {
    ctx.lineTo(corners[index].x, corners[index].y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fill();
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
  if (cameraControl.active) {
    canvas.style.cursor = cameraControl.rotating || cameraControl.adjustingTilt ? 'grabbing' : 'grab';
    return;
  }

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
    canvas.style.cursor = 'grab';
    return;
  }

  const hoveredCircle = circleAtWorldPosition(worldX, worldY);
  if (hoveredCircle && hoveredCircle.ownerId === state.selfId) {
    canvas.style.cursor = 'pointer';
    return;
  }

  canvas.style.cursor = state.selectedCircleIds.size > 0 ? 'grab' : 'grab';
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
  drawGround();
  drawCircles();
  drawPlayers();
  drawSelectionBox();
}

function handleSocketInit({ selfId, world, players, circles }) {
  state.selfId = selfId;
  state.world = world;
  state.players = new Map(players.map((p) => [p.id, p]));
  const selfPlayer = state.players.get(selfId);
  state.playerName = selfPlayer && typeof selfPlayer.name === 'string' ? selfPlayer.name : '';
  if (state.pendingPlayerName) {
    const pendingName = state.pendingPlayerName;
    updateLocalPlayerName(pendingName);
    sendNameToServer(pendingName);
  }
  state.circles = new Map((circles || []).map((circle) => [circle.id, circle]));
  state.selectedCircleIds = new Set();
  updateViewSize();
  render();

  if (state.isReady) {
    hideStartScreen();
  }
}

function handleSocketPlayerJoined(player) {
  if (!player || typeof player.id !== 'string') {
    return;
  }

  const existingPlayer = state.players.get(player.id);
  const mergedPlayer = { ...(existingPlayer || {}), ...player };

  const incomingName =
    player && typeof player.name === 'string' ? player.name.trim() : '';
  const existingName =
    existingPlayer && typeof existingPlayer.name === 'string'
      ? existingPlayer.name.trim()
      : '';

  if (!incomingName && existingName) {
    mergedPlayer.name = existingPlayer.name;
  }

  state.players.set(player.id, mergedPlayer);
}

function handleSocketConnect() {
  emitStoredPlayerName();
}

function handleSocketPlayerMoved(player) {
  if (!player || typeof player.id !== 'string') {
    return;
  }

  const existingPlayer = state.players.get(player.id);
  const mergedPlayer = { ...(existingPlayer || {}), ...player };

  const incomingName =
    player && typeof player.name === 'string' ? player.name.trim() : '';
  const existingName =
    existingPlayer && typeof existingPlayer.name === 'string'
      ? existingPlayer.name.trim()
      : '';
  const selfName =
    typeof state.playerName === 'string' ? state.playerName.trim() : '';

  if (incomingName) {
    mergedPlayer.name = player.name;
  } else if (existingName) {
    mergedPlayer.name = existingPlayer.name;
  } else if (player.id === state.selfId && selfName) {
    mergedPlayer.name = state.playerName;
  }

  state.players.set(player.id, mergedPlayer);
}

function handleSocketPlayerLeft(playerId) {
  state.players.delete(playerId);
}

function handleSocketPlayerUpdated(player) {
  if (!player || typeof player.id !== 'string') {
    return;
  }

  state.players.set(player.id, player);
  if (player.id === state.selfId) {
    state.playerName = typeof player.name === 'string' ? player.name : '';
    state.pendingPlayerName = null;
  }
  render();
}

function handleSocketCircleSpawned(circle) {
  state.circles.set(circle.id, circle);
}

function handleSocketCircleUpdated(circle) {
  state.circles.set(circle.id, circle);
  if (dragState.circleId === circle.id && circle.markedBy !== state.selfId) {
    resetDragState();
    setCursorForWorldPosition(NaN, NaN);
  }
}

function handleSocketCirclesRemoved({ circleIds }) {
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
}

function handleKeyDown(event) {
  state.pressed.add(event.code);
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    setCursorForWorldPosition(NaN, NaN);
  }
}

function handleKeyUp(event) {
  state.pressed.delete(event.code);
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    setCursorForWorldPosition(NaN, NaN);
  }
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
  if (direction && state.isReady && socket) {
    socket.emit('move', { direction, delta });
  }

  render();
  window.requestAnimationFrame(gameLoop);
}

function handleMouseDown(event) {
  const isPrimaryButton = event.button === 0;
  const isSecondaryButton = event.button === 2;

  if (!isPrimaryButton && !isSecondaryButton) {
    return;
  }

  const local = getCanvasRelativePosition(event);
  const world = screenToWorld(local.x, local.y);
  const worldIsValid = Number.isFinite(world.x) && Number.isFinite(world.y);
  const shiftPressed = event.shiftKey || state.pressed.has('ShiftLeft') || state.pressed.has('ShiftRight');
  const circle = worldIsValid ? circleAtWorldPosition(world.x, world.y) : null;

  if (isPrimaryButton && circle && circle.ownerId === state.selfId && !shiftPressed) {
    state.selectedCircleIds = new Set([circle.id]);

    dragState.circleId = circle.id;
    dragState.dragging = false;
    dragState.offsetX = circle.x - world.x;
    dragState.offsetY = circle.y - world.y;
    dragState.startMouseX = local.x;
    dragState.startMouseY = local.y;
    dragState.lastSent = 0;

    setCursorForWorldPosition(world.x, world.y);
    event.preventDefault();
    return;
  }

  const canSelectWithDrag =
    isPrimaryButton &&
    worldIsValid &&
    (!circle || circle.ownerId !== state.selfId || shiftPressed);

  if (canSelectWithDrag) {
    selectionState.active = true;
    selectionState.dragging = false;
    selectionState.startWorldX = world.x;
    selectionState.startWorldY = world.y;
    selectionState.currentWorldX = world.x;
    selectionState.currentWorldY = world.y;
    selectionState.startScreenX = local.x;
    selectionState.startScreenY = local.y;
    setCursorForWorldPosition(world.x, world.y);
    event.preventDefault();
    return;
  }

  cameraControl.active = true;
  cameraControl.rotating = false;
  cameraControl.adjustingTilt = false;
  cameraControl.startX = local.x;
  cameraControl.startY = local.y;
  cameraControl.startAngle = state.camera.angle;
  cameraControl.startPitch = state.camera.pitch;
  cameraControl.startWorldX = world.x;
  cameraControl.startWorldY = world.y;
  cameraControl.button = event.button || 0;
  cameraControl.allowRotation = isSecondaryButton;
  setCursorForWorldPosition(NaN, NaN);
  event.preventDefault();
}

function handleMouseMove(event) {
  const local = getCanvasRelativePosition(event);
  const world = screenToWorld(local.x, local.y);

  if (cameraControl.active) {
    const deltaX = local.x - cameraControl.startX;
    const deltaY = local.y - cameraControl.startY;
    if (
      cameraControl.allowRotation &&
      !cameraControl.rotating &&
      Math.abs(deltaX) > 4
    ) {
      cameraControl.rotating = true;
    }
    if (
      cameraControl.allowRotation &&
      !cameraControl.adjustingTilt &&
      Math.abs(deltaY) > 4
    ) {
      cameraControl.adjustingTilt = true;
    }

    let cameraChanged = false;
    if (cameraControl.allowRotation && cameraControl.rotating) {
      state.camera.angle = cameraControl.startAngle + deltaX * CAMERA_ROTATION_SPEED;
      cameraChanged = true;
    }
    if (cameraControl.allowRotation && cameraControl.adjustingTilt) {
      const nextPitch = cameraControl.startPitch - deltaY * CAMERA_TILT_SPEED;
      setCameraPitch(nextPitch);
      cameraChanged = true;
    }
    if (cameraChanged) {
      setCursorForWorldPosition(NaN, NaN);
      return;
    }
  }

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
    if (!selectionState.dragging && movedDistance > SELECTION_DRAG_THRESHOLD) {
      selectionState.dragging = true;
      state.selectedCircleIds = new Set();
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

  if (cameraControl.active) {
    const wasRotating = cameraControl.rotating;
    const wasAdjustingTilt = cameraControl.adjustingTilt;
    const interactionButton = cameraControl.button;
    cameraControl.active = false;
    cameraControl.rotating = false;
    cameraControl.adjustingTilt = false;
    cameraControl.button = 0;
    cameraControl.allowRotation = false;

    if (interactionButton === 2) {
      if (!wasRotating && !wasAdjustingTilt && state.selectedCircleIds.size > 0) {
        state.selectedCircleIds = new Set();
      }
      setCursorForWorldPosition(world ? world.x : NaN, world ? world.y : NaN);
      return;
    }

    if (!wasRotating && !wasAdjustingTilt) {
      const canCommand = event && event.type !== 'mouseleave';
      const commanded = canCommand && world ? commandSelectedCirclesTo(world.x, world.y) : false;
      if (!commanded && state.selectedCircleIds.size > 0) {
        state.selectedCircleIds = new Set();
      }
    }

    setCursorForWorldPosition(world ? world.x : NaN, world ? world.y : NaN);
    if (!selectionState.active && !dragState.circleId) {
      return;
    }
  }

  if (event && event.button === 2) {
    if (state.selectedCircleIds.size > 0) {
      state.selectedCircleIds = new Set();
    }
    setCursorForWorldPosition(world ? world.x : NaN, world ? world.y : NaN);
    return;
  }

  if (selectionState.active) {
    const wasDragging = selectionState.dragging;
    const endWorldX = world ? world.x : selectionState.currentWorldX;
    const endWorldY = world ? world.y : selectionState.currentWorldY;

    const minX = Math.min(selectionState.startWorldX, endWorldX);
    const maxX = Math.max(selectionState.startWorldX, endWorldX);
    const minY = Math.min(selectionState.startWorldY, endWorldY);
    const maxY = Math.max(selectionState.startWorldY, endWorldY);

    selectionState.active = false;
    selectionState.dragging = false;

    if (wasDragging) {
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
    } else if (!commandSelectedCirclesTo(endWorldX, endWorldY)) {
      state.selectedCircleIds = new Set();
    }

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
  setCursorForWorldPosition(world ? world.x : NaN, world ? world.y : NaN);
}

function handleWheel(event) {
  event.preventDefault();

  const deltaY = event.deltaY ?? 0;
  if (!Number.isFinite(deltaY)) {
    return;
  }

  const zoomFactor = Math.exp(-deltaY * CAMERA_ZOOM_SENSITIVITY);
  if (setCameraZoom(state.camera.zoom * zoomFactor)) {
    setCursorForWorldPosition(NaN, NaN);
    render();
  }
}

function handleWindowBlur() {
  if (selectionState.active) {
    selectionState.active = false;
    selectionState.dragging = false;
  }
  if (cameraControl.active) {
    cameraControl.active = false;
    cameraControl.rotating = false;
    cameraControl.adjustingTilt = false;
    cameraControl.button = 0;
    cameraControl.allowRotation = false;
  }
  if (dragState.circleId) {
    handleMouseUp();
  }
}

function handleWindowResize() {
  updateViewSize();
  render();
}

function commandSelectedCirclesTo(worldX, worldY) {
  if (!state.isReady) {
    return false;
  }

  if (!socket) {
    return false;
  }

  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    return false;
  }

  if (state.selectedCircleIds.size === 0) {
    return false;
  }

  const selectedCircles = Array.from(state.selectedCircleIds)
    .map((circleId) => state.circles.get(circleId))
    .filter((circle) => circle && circle.ownerId === state.selfId);

  if (selectedCircles.length === 0) {
    state.selectedCircleIds = new Set();
    return false;
  }

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

  const deltaX = worldX - center.x;
  const deltaY = worldY - center.y;

  const moves = selectedCircles.map((circle) => {
    const radius = circle.radius || 12;
    const targetX = circle.x + deltaX;
    const targetY = circle.y + deltaY;
    const { x, y } = clampCirclePosition(targetX, targetY, radius);
    return { circleId: circle.id, targetX: x, targetY: y };
  });

  if (moves.length === 0) {
    return false;
  }

  socket.emit('commandCirclesMove', { moves });
  return true;
}

function attachInteractionHandlers() {
  if (interactionHandlersAttached) {
    return;
  }

  if (!canvas) {
    return;
  }

  interactionHandlersAttached = true;

  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseleave', handleMouseUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('resize', handleWindowResize);
}

function startGame() {
  if (gameStarted) {
    return;
  }

  gameStarted = true;
  state.isReady = true;
  state.pressed.clear();

  setupSocket();
  attachInteractionHandlers();
  updateViewSize();

  if (canvas) {
    canvas.style.cursor = 'grab';
  }

  state.lastFrame = performance.now();
  render();
  hideStartScreen();
  window.requestAnimationFrame(gameLoop);
}

if (startForm) {
  startForm.addEventListener('submit', handleStartFormSubmit);
} else {
  hideStartScreen();
  startGame();
}

if (nameInput) {
  nameInput.addEventListener('input', () => {
    if (startError) {
      startError.textContent = '';
    }
  });

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      nameInput.focus();
    });
  }
}
