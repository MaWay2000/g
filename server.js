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
const PLAYER_SPEED = 200; // units per second
const CIRCLE_MOVE_SPEED = PLAYER_SPEED;
const CIRCLE_RADIUS = 12;
const CIRCLE_INTERVAL_MS = 1000;

app.use(express.static('public'));

const players = new Map();
const circles = new Map();
const circleMovements = new Map();
const circleIntervals = new Map();
let circleIdCounter = 0;
let lastMovementUpdate = Date.now();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function spawnCircleForPlayer(playerId) {
  const player = players.get(playerId);
  if (!player) {
    return;
  }

  const radius = CIRCLE_RADIUS;
  const circle = {
    id: `circle-${++circleIdCounter}`,
    ownerId: playerId,
    color: player.color,
    radius,
    markedBy: null,
    x: clamp(player.x, radius, WORLD_WIDTH - radius),
    y: clamp(player.y, radius, WORLD_HEIGHT - radius),
  };

  circles.set(circle.id, circle);
  io.emit('circleSpawned', circle);
}

function clampCirclePosition(x, y, radius) {
  return {
    x: clamp(x, radius, WORLD_WIDTH - radius),
    y: clamp(y, radius, WORLD_HEIGHT - radius),
  };
}

function randomColor() {
  const colors = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'];
  return colors[Math.floor(Math.random() * colors.length)];
}

io.on('connection', (socket) => {
  const spawn = {
    id: socket.id,
    x: Math.random() * (WORLD_WIDTH - 50) + 25,
    y: Math.random() * (WORLD_HEIGHT - 50) + 25,
    color: randomColor(),
  };
  players.set(socket.id, spawn);

  socket.emit('init', {
    selfId: socket.id,
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
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

    player.x = Math.max(20, Math.min(WORLD_WIDTH - 20, nextX));
    player.y = Math.max(20, Math.min(WORLD_HEIGHT - 20, nextY));

    players.set(socket.id, player);
    io.emit('playerMoved', player);
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
    const clampedX = clamp(x, radius, WORLD_WIDTH - radius);
    const clampedY = clamp(y, radius, WORLD_HEIGHT - radius);

    if (circle.x === clampedX && circle.y === clampedY) {
      return;
    }

    circle.x = clampedX;
    circle.y = clampedY;
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
