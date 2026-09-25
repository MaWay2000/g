# 3D Mars Game

[**Play the live game**](https://maway2000.github.io/g/game.html) · [Source code](https://github.com/MaWay2000/g) · [Report an issue](https://github.com/MaWay2000/g/issues)

A browser-based 3D sci-fi game set on Mars, built with HTML, CSS, JavaScript, and Three.js/WebGL. Explore the environment, interact with mining and resource tools, manage inventory, and use the mission and terminal panels.

The game runs as static files on GitHub Pages. No installation or account is required to open the hosted game.

## Features

- A real-time 3D scene with player movement.
- Settings for performance/FPS and sky/stars.
- Inventory and resource-related tools.
- Drone and mining systems.
- Mission and terminal panels.
- Local browser save/progress systems.
- Companion map and model editing pages.

This is an evolving project. Features and controls can change; use the in-game interface for the current options.

## Live pages

| Page | Link |
| --- | --- |
| Game | [Play now](https://maway2000.github.io/g/game.html) |
| Map maker | [Open map maker](https://maway2000.github.io/g/map_maker.html) |
| Model editor | [Open model editor](https://maway2000.github.io/g/model_editor.html) |

The main game entry point is `game.html`, not the repository's root URL.

## Run locally

Requirements: Python 3 and a browser with JavaScript and working WebGL support.

```bash
git clone https://github.com/MaWay2000/g.git
cd g
python -m http.server 8000
```

Open [http://localhost:8000/game.html](http://localhost:8000/game.html). Keep the terminal running, and stop it with Ctrl+C when finished.

Serve the project over HTTP rather than opening the HTML file directly. Models, textures, and map files may not load correctly from `file://` URLs. Preserve file and folder casing when adding assets, because GitHub Pages is case-sensitive.

## Saves and browser storage

Progress is stored locally in the browser. Treat that data as important: clearing site data or browser storage can remove it. A different browser, device, or site address has separate storage; the GitHub Pages game and a local development server do not share the same save.

Do not rename existing storage keys or reset progress as part of unrelated changes.

## Project layout

- `game.html`: main game entry point.
- `scripts/`: game scripts and supporting systems.
- `maps/`: map data.
- `models/`, `images/`, and `sounds/`: game assets.
- `map_maker.html` and `model_editor.html`: companion tools.
- `tests/`: automated checks and the manual regression checklist.
- `tools/`: supporting development utilities.
- [AGENTS.md](AGENTS.md): project change and safety guidelines.

## Development and checks

Playing the static game does not require npm. To run the repository's JavaScript tests, install Node.js and npm, then run:

```bash
npm install
npm test
```

Also follow the [manual regression checklist](tests/regression-checklist.md): verify loading, console errors, WebGL, movement, settings, inventory, mission/terminal panels, and existing progress. Automated tests do not replace these browser checks.

Keep changes focused. Avoid rewriting the game, replacing connected systems, or changing unrelated controls and save behavior.

## Reporting problems

[Open an issue](https://github.com/MaWay2000/g/issues) with your browser, operating system, affected live page, reproduction steps, and any console errors. For rendering problems, include whether WebGL works and a screenshot when possible.
