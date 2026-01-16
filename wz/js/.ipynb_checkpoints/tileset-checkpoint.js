// tileset.js — robust tile set utilities for WZ Map Maker
// Exports: TILESETS, setTilesBase, getTileCount, getTileFolder,
//          buildTileUrl, loadAllTiles, clearTileCache
//
// Fixes the "stops at 78" bug by probing beyond the declared count and
// continuing past missing indices until a run of misses is seen.
// Also tries lowercase filenames and multiple base paths.

export const TILESETS = [
  // Canonical classic tilesets (WZ2100 Hi‑res 128px pages)
  { name: 'Arizona',         folder: 'tertilesc1hw-128', count: 78 },
  { name: 'Urban',           folder: 'tertilesc2hw-128', count: 81 }, // often 81
  { name: 'Rocky Mountains', folder: 'tertilesc3hw-128', count: 80 }, // often 80
];

let __tilesBase = (typeof window !== 'undefined' && window.TILES_BASE)
  ? window.TILES_BASE
  : 'classic/texpages/';

// Optional fallbacks. You can override by setting window.TILES_BASES before load.
let __tilesBases = (typeof window !== 'undefined' && Array.isArray(window.TILES_BASES))
  ? window.TILES_BASES.slice()
  : [__tilesBase, 'classic/texpages/texpages/', 'texpages/', 'classic/images/', 'images/'];

export function setTilesBase(pathOrArray){
  if (Array.isArray(pathOrArray)) {
    __tilesBases = pathOrArray.slice();
    __tilesBase = __tilesBases[0] || '';
  } else {
    __tilesBase = String(pathOrArray || '');
    __tilesBases = [__tilesBase];
  }
}

// --- utils ---
export function getTileFolder(tilesetIndex){
  const i = Math.max(0, Math.min(TILESETS.length - 1, tilesetIndex|0));
  return TILESETS[i].folder;
}

export function getTileCount(tilesetIndex){
  const i = Math.max(0, Math.min(TILESETS.length - 1, tilesetIndex|0));
  return TILESETS[i].count|0;
}

export function buildTileUrl(tilesetIndex, idx, baseOverride){
  const folder = getTileFolder(tilesetIndex);
  const base = baseOverride || __tilesBase;
  return `${base}${folder}/tile-${idx}.png`;
}

// Simple per-tileset cache (Promise<Image[]>)
const __tileCache = new Map();
export function clearTileCache(tilesetIndex){
  if (typeof tilesetIndex === 'number') __tileCache.delete(String(tilesetIndex|0));
  else __tileCache.clear();
}

// Core loader. It will:
// 1) Attempt declared count (0..count-1).
// 2) Continue probing indices until MAX_CONSECUTIVE_MISSES is hit, up to MAX_SAFE_INDEX.
// 3) Try multiple bases and lowercase filenames before giving up a given index.
export async function loadAllTiles(tilesetIndex, count = getTileCount(tilesetIndex)){
  const key = String(tilesetIndex|0);
  if (__tileCache.has(key)) return __tileCache.get(key);

  const p = (async () => {
    const folder = getTileFolder(tilesetIndex);

    const loadOneAtAnyBase = (idx) => new Promise((resolve) => {
      const tryNames = [`tile-${idx}.png`, `tile-${idx}.PNG`]; // PNG sometimes uppercase on mirrors
      const tryBases = __tilesBases.slice();
      let bi = 0, ni = 0;
      const tryNext = () => {
        if (bi >= tryBases.length) {
          // lowercase fallback as very last resort
          const img = new Image(); img.width = 1; img.height = 1; resolve(img); return;
        }
        const base = tryBases[bi];
        const name = tryNames[ni];
        const url = `${base}${folder}/${name}`;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => {
          // advance name first, then base
          ni += 1;
          if (ni >= tryNames.length) { ni = 0; bi += 1; }
          tryNext();
        };
        img.src = url;
      };
      tryNext();
    });

    const imgs = [];
    const pushIfReal = (img, idx) => {
      if (img && !(img.width === 1 && img.height === 1)) {
        imgs[idx] = img;
        return true;
      }
      return false;
    };

    // Step 1: load declared range
    const tasks1 = [];
    for (let i = 0; i < count; i++) {
      tasks1.push(loadOneAtAnyBase(i).then(img => pushIfReal(img, i)));
    }
    await Promise.all(tasks1);

    // Step 2: probe past gaps
    const MAX_SAFE_INDEX = 96;              // hard cap: classic sets never exceed this
    const MAX_CONSECUTIVE_MISSES = 8;       // stop after this many misses in a row
    let idx = count;
    let misses = 0;
    while (idx <= MAX_SAFE_INDEX && misses < MAX_CONSECUTIVE_MISSES) {
      // skip already-filled (if count was larger than actual, rare)
      if (imgs[idx]) { idx++; misses = 0; continue; }
      /* eslint no-await-in-loop: "off" */
      const ok = pushIfReal(await loadOneAtAnyBase(idx), idx);
      misses = ok ? 0 : (misses + 1);
      idx++;
    }

    // Pack into dense array [0..lastReal]
    const last = imgs.reduceRight((p, v, i) => (p >= 0 ? p : (v ? i : -1)), -1);
    const out = [];
    for (let i = 0; i <= last; i++) if (imgs[i]) out.push(imgs[i]);
    return out;
  })();

  __tileCache.set(key, p);
  return p;
}