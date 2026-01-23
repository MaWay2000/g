import os
import sys
import re
import json
import time
import shutil
import urllib.parse
import subprocess
from pathlib import Path

import requests


APP_NAME = "WZ Replay Handler"
STEAM_APPID = "1241950"  # Warzone 2100 Steam appid


def log_path() -> Path:
    return Path(os.environ.get("TEMP", ".")) / "wzreplay_handler.log"


def log(msg: str) -> None:
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    lp = log_path()
    with lp.open("a", encoding="utf-8") as f:
        f.write(f"[{ts}] {msg}\n")


def die(msg: str, code: int = 1) -> None:
    log("ERROR: " + msg)
    # Try to open the log so user can see what happened (not always desired, but helpful for testing)
    try:
        subprocess.Popen(["notepad.exe", str(log_path())], close_fds=True)
    except Exception:
        pass
    raise SystemExit(code)


def parse_protocol_arg(raw: str) -> str:
    """
    Accept:
      wzreplay://open?url=<urlencoded https url>
      wzreplay:<anything>
    Return the https replay URL.
    """
    raw = raw.strip()
    if not raw.lower().startswith("wzreplay:"):
        die(f"Not a wzreplay: URL. Got: {raw}")

    # Remove scheme
    rest = raw[len("wzreplay:"):]
    # Remove leading slashes commonly present in custom protocols
    rest = rest.lstrip("/")

    # If it's open?url=... (some browsers normalize to open/?url=...)
    if rest.lower().startswith("open?") or rest.lower().startswith("open/?"):
        parsed = urllib.parse.urlparse("wzreplay://" + rest)  # fake scheme to reuse parser
        qs = urllib.parse.parse_qs(parsed.query)
        url = (qs.get("url") or [""])[0]
        url = urllib.parse.unquote(url)
    else:
        # Might be directly: wzreplay://https://...
        url = urllib.parse.unquote(rest)

    url = url.strip()

    if not url.lower().startswith("http"):
        die(f"Parsed URL doesn't look like http(s): {url}")

    return url


def is_allowed_url(url: str) -> bool:
    """
    Safety: Only allow HTTPS and .wzrp.
    Optionally restrict to your domain.
    """
    try:
        p = urllib.parse.urlparse(url)
    except Exception:
        return False

    if p.scheme.lower() != "https":
        return False

    if not p.path.lower().endswith(".wzrp"):
        return False

    # Restrict to your host (you can relax this later if you want)
    if p.netloc.lower() not in {"www.wz-2100.com", "wz-2100.com"}:
        return False

    return True


def find_config_dirs() -> list[Path]:
    """
    Warzone config dir on Windows is under:
      %APPDATA%\Warzone 2100 Project\Warzone 2100 <version>\
    Sometimes people also have:
      %APPDATA%\Warzone 2100 Project\Warzone 2100\
    We'll pick the most recently modified matching directory.
    """
    appdata = os.environ.get("APPDATA")
    if not appdata:
        die("APPDATA env var not found. Are you on Windows?")

    base = Path(appdata) / "Warzone 2100 Project"
    if not base.exists():
        # Create base, but Warzone might not be installed/launched yet
        base.mkdir(parents=True, exist_ok=True)

    candidates = []
    for child in base.iterdir():
        if child.is_dir() and child.name.lower().startswith("warzone 2100"):
            candidates.append(child)

    # If no candidates, create a default folder name
    if not candidates:
        default_dir = base / "Warzone 2100"
        default_dir.mkdir(parents=True, exist_ok=True)
        candidates = [default_dir]

    # Sort by mtime descending
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates


def choose_replay_target_dir() -> Path:
    config_dirs = find_config_dirs()

    # Choose most recently used config dir
    config_dir = config_dirs[0]

    # Ensure replay/multiplay exists
    target = config_dir / "replay" / "multiplay"
    target.mkdir(parents=True, exist_ok=True)
    return target


def download_file(url: str, dest: Path) -> None:
    log(f"Downloading: {url}")
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        tmp = dest.with_suffix(dest.suffix + ".part")
        with tmp.open("wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                if chunk:
                    f.write(chunk)
        tmp.replace(dest)
    log(f"Saved to: {dest}")


def find_warzone_exe() -> Path | None:
    """
    Try a few common locations.
    1) Common standalone install dirs
    2) Steam libraries
    """
    # 1) Common standalone locations
    pf = os.environ.get("ProgramFiles", r"C:\Program Files")
    pfx86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    common = [
        Path(pf) / "Warzone 2100" / "warzone2100.exe",
        Path(pfx86) / "Warzone 2100" / "warzone2100.exe",
    ]
    for p in common:
        if p.exists():
            return p

    # 2) Steam detection
    steam_path = None
    try:
        # Query Steam install path from registry via `reg` command (no extra deps)
        out = subprocess.check_output(
            ["reg", "query", r"HKCU\Software\Valve\Steam", "/v", "SteamPath"],
            stderr=subprocess.STDOUT,
            text=True,
        )
        m = re.search(r"SteamPath\s+REG_SZ\s+(.+)", out)
        if m:
            steam_path = m.group(1).strip()
    except Exception:
        steam_path = None

    if steam_path:
        steam = Path(steam_path)
        libvdf = steam / "steamapps" / "libraryfolders.vdf"
        libraries = [steam]

        # Parse libraryfolders.vdf in a very forgiving way (regex "path" "X")
        if libvdf.exists():
            try:
                txt = libvdf.read_text(encoding="utf-8", errors="ignore")
                paths = re.findall(r'"path"\s*"([^"]+)"', txt)
                for p in paths:
                    libraries.append(Path(p))
            except Exception:
                pass

        # Check typical Steam common path
        for lib in libraries:
            candidate = lib / "steamapps" / "common" / "Warzone 2100" / "warzone2100.exe"
            if candidate.exists():
                return candidate

    return None


def launch_warzone_with_replay(wzrp_path: Path) -> None:
    exe = find_warzone_exe()
    if exe and exe.exists():
        # Use --loadreplay if available in your Warzone version
        # Note: modern WZ expects --option=value syntax in many cases.
        args = [str(exe), f'--loadreplay={str(wzrp_path)}']
        log("Launching Warzone: " + " ".join(args))
        subprocess.Popen(args, close_fds=True)
        return

    # Fallback: launch via Steam (no args), replay will still be in folder for manual playback
    log("Could not find warzone2100.exe. Falling back to Steam launch.")
    try:
        subprocess.Popen(["cmd", "/c", "start", "", f"steam://rungameid/{STEAM_APPID}"], close_fds=True)
    except Exception as e:
        log(f"Steam launch failed: {e}")

    # Open the replay folder so user can confirm the file is in the right place
    try:
        subprocess.Popen(["explorer.exe", str(wzrp_path.parent)], close_fds=True)
    except Exception:
        pass


def main() -> int:
    # Clear log each run for easier testing
    try:
        lp = log_path()
        if lp.exists():
            lp.unlink()
    except Exception:
        pass

    if len(sys.argv) < 2:
        die("No protocol URL passed. This app is meant to be launched by clicking wzreplay:// links.")

    raw = sys.argv[1]
    log(f"Received argv[1]: {raw}")

    replay_url = parse_protocol_arg(raw)
    log(f"Parsed replay URL: {replay_url}")

    if not is_allowed_url(replay_url):
        die(f"URL not allowed (must be https, .wzrp, and host wz-2100.com). Got: {replay_url}")

    target_dir = choose_replay_target_dir()
    filename = os.path.basename(urllib.parse.urlparse(replay_url).path)
    dest = target_dir / filename

    download_file(replay_url, dest)
    launch_warzone_with_replay(dest)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
