# Starter Game

This repository contains a minimal desktop game starter built with **Python 3** and **Pygame**. The project opens a window and keeps a basic render loop running at a fixed frame rate, providing a foundation to build upon.

## Technology choice

- **Stack:** Python 3 with the Pygame framework. Pygame offers a straightforward API for creating 2D games and prototypes while remaining easy to install and run cross-platform.

## Prerequisites

- Python 3.9 or newer
- `pip` for dependency installation

## Setup

1. (Optional) Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows use: .venv\\Scripts\\activate
   ```
2. Upgrade `pip` and install dependencies declared in `pyproject.toml`:
   ```bash
   pip install --upgrade pip
   pip install -e .
   ```

## Running the game

Launch the starter window with:

```bash
python src/main.py
```

Close the window or press the close button to exit the loop.

## Project structure

```
.
├── pyproject.toml   # Project metadata and dependency declaration
├── README.md        # Project documentation
└── src/
    └── main.py      # Entry point that opens the Pygame window
```

## Next steps

- Add sprites, input handling, and game logic to the main loop.
- Structure the code into packages/modules as the project grows.
- Extend the build configuration for packaging or distribution as needed.
