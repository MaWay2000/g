const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : true;

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;
const WORLD_WIDTH = 8000;
const WORLD_HEIGHT = 6000;
const TILE_SIZE = 40;
const WORLD_BORDER = TILE_SIZE;
const PLAYER_SPEED = 200; // units per second
const PLAYER_SIZE = TILE_SIZE;
const CIRCLE_MOVE_SPEED = PLAYER_SPEED / 5;
const CIRCLE_RADIUS = 12;
const CIRCLE_INTERVAL_MS = 1000;
const PLAYER_COLLISION_PADDING = 1;
const CIRCLE_COLLISION_PADDING = 0.5;
const MAX_COLLISION_ITERATIONS = 6;
const PLAYER_NAME_MAX_LENGTH = 20;
const DEFAULT_PLAYER_NAME = 'Player';

const HALF_PLAYER_SIZE = PLAYER_SIZE / 2;

function clampPlayerPosition(x, y) {
  const minX = WORLD_BORDER + HALF_PLAYER_SIZE;
  const maxX = WORLD_WIDTH - WORLD_BORDER - HALF_PLAYER_SIZE;
  const minY = WORLD_BORDER + HALF_PLAYER_SIZE;
  const maxY = WORLD_HEIGHT - WORLD_BORDER - HALF_PLAYER_SIZE;

  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY),
  };
}

app.use(express.static('public'));

const players = new Map();
const circles = new Map();
const circleMovements = new Map();
const circleIntervals = new Map();
let circleIdCounter = 0;
let lastMovementUpdate = Date.now();

function sanitizePlayerNameInput(name) {
  if (typeof name !== 'string') {
    return null;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, PLAYER_NAME_MAX_LENGTH);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampCirclePosition(x, y, radius) {
  const minX = WORLD_BORDER + radius;
  const maxX = WORLD_WIDTH - WORLD_BORDER - radius;
  const minY = WORLD_BORDER + radius;
  const maxY = WORLD_HEIGHT - WORLD_BORDER - radius;

  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY),
  };
}

function pushCircleAwayFromPlayer(circle, player) {
  const radius = circle.radius ?? CIRCLE_RADIUS;
  const halfSize = PLAYER_SIZE / 2;
  const minX = player.x - halfSize;
  const maxX = player.x + halfSize;
  const minY = player.y - halfSize;
  const maxY = player.y + halfSize;

  const closestX = clamp(circle.x, minX, maxX);
  const closestY = clamp(circle.y, minY, maxY);
  let dx = circle.x - closestX;
  let dy = circle.y - closestY;
  let distance = Math.hypot(dx, dy);

  if (distance >= radius) {
    return false;
  }

  if (distance === 0) {
    const distancesToEdges = [
      { axis: 'left', value: circle.x - minX },
      { axis: 'right', value: maxX - circle.x },
      { axis: 'top', value: circle.y - minY },
      { axis: 'bottom', value: maxY - circle.y },
    ];

    let minValue = distancesToEdges[0].value;
    for (let index = 1; index < distancesToEdges.length; index += 1) {
      if (distancesToEdges[index].value < minValue) {
        minValue = distancesToEdges[index].value;
      }
    }

    const candidates = distancesToEdges.filter((entry) => entry.value === minValue);
    const nearest = candidates[Math.floor(Math.random() * candidates.length)];

    switch (nearest.axis) {
      case 'left':
        circle.x = minX - radius - PLAYER_COLLISION_PADDING;
        break;
      case 'right':
        circle.x = maxX + radius + PLAYER_COLLISION_PADDING;
        break;
      case 'top':
        circle.y = minY - radius - PLAYER_COLLISION_PADDING;
        break;
      case 'bottom':
        circle.y = maxY + radius + PLAYER_COLLISION_PADDING;
        break;
      default:
        break;
    }
  } else {
    const overlap = radius - distance + PLAYER_COLLISION_PADDING;
    const nx = dx / distance;
    const ny = dy / distance;
    circle.x += nx * overlap;
    circle.y += ny * overlap;
  }

  const clamped = clampCirclePosition(circle.x, circle.y, radius);
  circle.x = clamped.x;
  circle.y = clamped.y;
  return true;
}

function resolveCirclePlayerCollisions(circle) {
  players.forEach((player) => {
    let iterations = 0;
    while (iterations < MAX_COLLISION_ITERATIONS && pushCircleAwayFromPlayer(circle, player)) {
      iterations += 1;
    }
  });
}

function resolveCircleCircleCollisions(circle) {
  const radius = circle.radius ?? CIRCLE_RADIUS;

  for (let iteration = 0; iteration < MAX_COLLISION_ITERATIONS; iteration += 1) {
    let collided = false;

    for (const otherCircle of circles.values()) {
      if (!otherCircle || otherCircle.id === circle.id) {
        continue;
      }

      const otherRadius = otherCircle.radius ?? CIRCLE_RADIUS;
      const minDistance = radius + otherRadius;
      let dx = circle.x - otherCircle.x;
      let dy = circle.y - otherCircle.y;
      let distance = Math.hypot(dx, dy);

      if (distance >= minDistance) {
        continue;
      }

      collided = true;

      if (distance === 0) {
        const angle = Math.random() * Math.PI * 2;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }

      const overlap = minDistance - distance + CIRCLE_COLLISION_PADDING;
      const nx = dx / distance;
      const ny = dy / distance;
      circle.x += nx * overlap;
      circle.y += ny * overlap;

      const clamped = clampCirclePosition(circle.x, circle.y, radius);
      circle.x = clamped.x;
      circle.y = clamped.y;
    }

    if (!collided) {
      break;
    }
  }
}

function applyCirclePhysics(circle) {
  const radius = circle.radius ?? CIRCLE_RADIUS;
  const clamped = clampCirclePosition(circle.x, circle.y, radius);
  circle.x = clamped.x;
  circle.y = clamped.y;

  resolveCirclePlayerCollisions(circle);
  resolveCircleCircleCollisions(circle);
  resolveCirclePlayerCollisions(circle);

  const finalClamp = clampCirclePosition(circle.x, circle.y, radius);
  circle.x = finalClamp.x;
  circle.y = finalClamp.y;
}

function spawnCircleForPlayer(playerId) {
  const player = players.get(playerId);
  if (!player) {
    return;
  }

  const radius = CIRCLE_RADIUS;
  const spawnPosition = clampCirclePosition(player.x, player.y, radius);

  const circle = {
    id: `circle-${++circleIdCounter}`,
    ownerId: playerId,
    color: player.color,
    radius,
    markedBy: null,
    x: spawnPosition.x,
    y: spawnPosition.y,
  };

  applyCirclePhysics(circle);
  circles.set(circle.id, circle);
  io.emit('circleSpawned', circle);
}

function randomColor() {
  const colors = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'];
  return colors[Math.floor(Math.random() * colors.length)];
}

io.on('connection', (socket) => {
  const initialName = sanitizePlayerNameInput(socket.handshake?.auth?.name);

  const minSpawnX = WORLD_BORDER + HALF_PLAYER_SIZE;
  const maxSpawnX = WORLD_WIDTH - WORLD_BORDER - HALF_PLAYER_SIZE;
  const minSpawnY = WORLD_BORDER + HALF_PLAYER_SIZE;
  const maxSpawnY = WORLD_HEIGHT - WORLD_BORDER - HALF_PLAYER_SIZE;

  const spawnRangeX = Math.max(0, maxSpawnX - minSpawnX);
  const spawnRangeY = Math.max(0, maxSpawnY - minSpawnY);

  const spawn = {
    id: socket.id,
    x: minSpawnX + Math.random() * spawnRangeX,
    y: minSpawnY + Math.random() * spawnRangeY,
    color: randomColor(),
    name: initialName ?? DEFAULT_PLAYER_NAME,
  };

  const clampedSpawn = clampPlayerPosition(spawn.x, spawn.y);
  spawn.x = clampedSpawn.x;
  spawn.y = clampedSpawn.y;
  players.set(socket.id, spawn);

  socket.emit('init', {
    selfId: socket.id,
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT, border: WORLD_BORDER },
    players: Array.from(players.values()),
    circles: Array.from(circles.values()),
  });

  const circleInterval = setInterval(() => {
    spawnCircleForPlayer(socket.id);
  }, CIRCLE_INTERVAL_MS);
  circleIntervals.set(socket.id, circleInterval);

  socket.broadcast.emit('playerJoined', spawn);

  socket.on('move', ({ direction, delta }) => {
    const player = players.get(socket.id);
    if (!player || !direction || typeof delta !== 'number') {
      return;
    }

    const clampedDelta = Math.max(0, Math.min(delta, 0.1));
    const distance = PLAYER_SPEED * clampedDelta;
    const nextX = player.x + direction.x * distance;
    const nextY = player.y + direction.y * distance;

    const clampedPosition = clampPlayerPosition(nextX, nextY);
    player.x = clampedPosition.x;
    player.y = clampedPosition.y;

    players.set(socket.id, player);
    io.emit('playerMoved', player);
  });

  socket.on('setName', ({ name }) => {
    const player = players.get(socket.id);
    if (!player) {
      return;
    }

    const sanitized = sanitizePlayerNameInput(name);
    if (!sanitized || player.name === sanitized) {
      return;
    }

    player.name = sanitized;
    players.set(socket.id, player);

    if (!socket.handshake.auth || typeof socket.handshake.auth !== 'object') {
      socket.handshake.auth = {};
    }
    socket.handshake.auth.name = sanitized;

    io.emit('playerUpdated', player);
  });

  socket.on('markCircle', ({ circleId, marked }) => {
    const circle = circles.get(circleId);
    if (!circle || circle.ownerId !== socket.id) {
      return;
    }

    const shouldMark = typeof marked === 'boolean' ? marked : circle.markedBy !== socket.id;
    if (!shouldMark && circle.markedBy !== socket.id) {
      return;
    }

    if (shouldMark) {
      circleMovements.delete(circleId);
    }

    circle.markedBy = shouldMark ? socket.id : null;
    circles.set(circleId, circle);
    io.emit('circleUpdated', circle);
  });

  socket.on('moveCircle', ({ circleId, x, y }) => {
    const circle = circles.get(circleId);
    if (
      !circle ||
      circle.ownerId !== socket.id ||
      circle.markedBy !== socket.id ||
      typeof x !== 'number' ||
      typeof y !== 'number'
    ) {
      return;
    }

    circleMovements.delete(circleId);

    const radius = circle.radius ?? CIRCLE_RADIUS;
    const clampedPosition = clampCirclePosition(x, y, radius);

    circle.x = clampedPosition.x;
    circle.y = clampedPosition.y;
    applyCirclePhysics(circle);
    circles.set(circleId, circle);
    io.emit('circleUpdated', circle);
  });

  socket.on('commandCirclesMove', ({ moves }) => {
    if (!Array.isArray(moves) || moves.length === 0) {
      return;
    }

    const updates = [];

    moves.forEach((move) => {
      if (
        !move ||
        typeof move.circleId !== 'string' ||
        typeof move.targetX !== 'number' ||
        typeof move.targetY !== 'number'
      ) {
        return;
      }

      const circle = circles.get(move.circleId);
      if (!circle || circle.ownerId !== socket.id) {
        return;
      }

      const radius = circle.radius ?? CIRCLE_RADIUS;
      const target = clampCirclePosition(move.targetX, move.targetY, radius);
      circle.markedBy = null;

      if (circle.x === target.x && circle.y === target.y) {
        circleMovements.delete(circle.id);
      } else {
        circleMovements.set(circle.id, {
          targetX: target.x,
          targetY: target.y,
        });
      }
      applyCirclePhysics(circle);
      circles.set(circle.id, circle);
      updates.push(circle);
    });

    updates.forEach((circle) => {
      io.emit('circleUpdated', circle);
    });
  });

  socket.on('disconnect', () => {
    const interval = circleIntervals.get(socket.id);
    if (interval) {
      clearInterval(interval);
      circleIntervals.delete(socket.id);
    }

    const removedCircleIds = [];
    for (const [circleId, circle] of circles) {
      if (circle.ownerId === socket.id) {
        circles.delete(circleId);
        removedCircleIds.push(circleId);
        circleMovements.delete(circleId);
      }
    }

    if (removedCircleIds.length > 0) {
      io.emit('circlesRemoved', { circleIds: removedCircleIds });
    }

    players.delete(socket.id);
    io.emit('playerLeft', socket.id);
  });
});

setInterval(() => {
  const now = Date.now();
  const deltaSeconds = (now - lastMovementUpdate) / 1000;
  lastMovementUpdate = now;

  if (deltaSeconds <= 0 || circleMovements.size === 0) {
    return;
  }

  const movedCircles = [];

  for (const [circleId, movement] of circleMovements) {
    const circle = circles.get(circleId);
    if (!circle) {
      circleMovements.delete(circleId);
      continue;
    }

    if (circle.markedBy === circle.ownerId) {
      circleMovements.delete(circleId);
      continue;
    }

    const { targetX, targetY } = movement;
    const dx = targetX - circle.x;
    const dy = targetY - circle.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= 0.5) {
      circle.x = targetX;
      circle.y = targetY;
      circleMovements.delete(circleId);
    } else {
      const maxDistance = CIRCLE_MOVE_SPEED * deltaSeconds;

      if (maxDistance >= distance) {
        circle.x = targetX;
        circle.y = targetY;
        circleMovements.delete(circleId);
      } else {
        const ratio = maxDistance / distance;
        circle.x += dx * ratio;
        circle.y += dy * ratio;
      }
    }

    applyCirclePhysics(circle);
    circles.set(circle.id, circle);
    movedCircles.push(circle);
  }

  movedCircles.forEach((circle) => {
    io.emit('circleUpdated', circle);
  });
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
