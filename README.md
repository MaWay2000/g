# Space Dodger

Space Dodger is a small arcade-style game built with [pygame](https://www.pygame.org/).
Dodge an endless wave of falling meteors, beat your high score, and then package the
project into a distributable Windows `.exe`.

## Prerequisites

* Python 3.10 or later
* `pip` for installing dependencies

> **Tip:** When building the executable, perform the process on the target platform
> (e.g. Windows) so that PyInstaller can collect the correct native libraries.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

## Running the game

```bash
python main.py
```

Use the arrow keys (`←`/`→`) or `A`/`D` to move. Avoid the orange meteors. When you
collide with one the game ends; press `R` to restart or `Esc` to quit.

## Building a standalone `.exe`

1. Ensure the virtual environment is active and dependencies are installed.
2. Run PyInstaller with the provided spec:

   ```bash
   pyinstaller --noconfirm --onefile --windowed --name SpaceDodger main.py
   ```

3. After the build completes, the executable will be at `dist/SpaceDodger.exe`.
4. Distribute the contents of the `dist/` folder to your players.

### Optional PyInstaller tweaks

* Provide a custom icon: add `--icon path/to/icon.ico` to the PyInstaller command.
* Include additional assets (images, sounds, fonts) by adding
  `--add-data "assets;assets"` (adjust path separators when running on Windows).

## Development tips

* Modify constants at the top of `main.py` to adjust difficulty.
* Use PyInstaller's `--debug` flag if you need console output in the packaged build.
* To create a macOS `.app` bundle, replace `--onefile` with `--windowed` and run
  PyInstaller on macOS instead of Windows.

## License

This project is released into the public domain. Use it as a starting point for your
own games.
