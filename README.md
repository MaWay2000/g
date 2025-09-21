# Multiplayer Cubes

A lightweight demonstration of a browser-based multiplayer game where each player controls a colorful cube moving around a shared arena. Built with Express and Socket.IO.

## Running locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open your browser at [http://localhost:3000](http://localhost:3000). Open multiple tabs or devices to see other players join in real time.

## Controls

Use the arrow keys or WASD to move your cube around the playfield. Your cube is outlined in white so you can easily spot it.

## Deploying the game online

The client can be hosted on a static hosting provider (for example GitHub Pages) while the real-time server runs on any Node-friendly platform such as Render, Railway, Fly.io, or a small VPS.

1. Deploy the server contained in `server.js` to your hosting provider. Make sure the environment variable `CORS_ORIGIN` includes the origin of the static site (for GitHub Pages it would be `https://<username>.github.io`).
2. Update `public/config.js` so that `serverUrl` points to the public URL of the deployed Socket.IO server.
3. Publish the contents of the `public` folder to your static site. When the page loads, it will connect to the remote Socket.IO backend defined in `config.js`.

Once both pieces are live, your game will be accessible online. For example, if you host the static files at `https://maway2000.github.io/g/`, visiting that page will connect to the backend defined in `public/config.js` and allow multiple players to join.
