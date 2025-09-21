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

app.use(express.static('public'));

const players = new Map();

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
  });

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

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('playerLeft', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
