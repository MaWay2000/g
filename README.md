# Dusty Nova

This repository hosts a minimalist static page that showcases random wallpapers from the `images/wallpapers/` directory.

## Updating wallpapers

When adding or removing wallpapers, make sure `images/wallpapers/manifest.json` lists the exact set of image filenames (paths relative to `images/wallpapers/`). The page uses this manifest at runtime, so forgetting to update it will prevent new wallpapers from appearing when the site is deployed to a server that does not expose directory listings.

A quick way to regenerate the manifest after changing the wallpapers is to run:

```sh
python - <<'PY'
import json
from pathlib import Path
base = Path('images/wallpapers')
print(json.dumps(sorted(p.name for p in base.iterdir() if p.is_file()), indent=2))
PY
```

Copy the output into `images/wallpapers/manifest.json` and commit both the updated manifest and the wallpapers together.
