import { PERIODIC_ELEMENTS } from "./data/periodic-elements.js";

const STRUCTURED_CLONE_SUPPORTED = typeof globalThis.structuredClone === "function";

const cloneValue = (value) => {
  if (STRUCTURED_CLONE_SUPPORTED) {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export const OUTSIDE_MAP_LOCAL_STORAGE_KEY = "dustyNova.mapMaker.savedMap";

const ELEMENT_CATEGORY_TO_TERRAIN_ID = new Map([
  ["diatomic nonmetal", "nonmetal"],
  ["polyatomic nonmetal", "nonmetal"],
  ["metalloid", "metalloid"],
  ["alkali metal", "alkali"],
  ["alkaline earth metal", "alkaline-earth"],
  ["transition metal", "transition-metal"],
  ["unknown, probably transition metal", "transition-metal"],
  ["post-transition metal", "post-transition"],
  ["unknown, probably post-transition metal", "post-transition"],
  ["lanthanide", "lanthanide"],
  ["actinide", "actinide"],
  ["halogen", "halogen"],
  ["noble gas", "noble-gas"],
  ["unknown, predicted to be noble gas", "noble-gas"],
  ["unknown, probably metalloid", "metalloid"],
]);

const OUTSIDE_TERRAIN_BASE_TYPES = [
  {
    id: "void",
    label: "Void",
    description: "Unusable space. Treated as off-map.",
    color: "#ffffff",
    hp: 0,
  },
  {
    id: "nonmetal",
    label: "Nonmetals",
    description: "Common reactive nonmetals that form the base landscape.",
    color: "#22c55e",
    hp: 60,
    element: { symbol: "C", name: "Carbon" },
  },
  {
    id: "metalloid",
    label: "Metalloids",
    description: "Semiconductive surfaces bridging metal and nonmetal traits.",
    color: "#a3e635",
    hp: 95,
    element: { symbol: "Si", name: "Silicon" },
  },
  {
    id: "alkali",
    label: "Alkali Metals",
    description: "Soft, highly reactive metals that mark volatile pathways.",
    color: "#f97316",
    hp: 110,
    element: { symbol: "Na", name: "Sodium" },
  },
  {
    id: "alkaline-earth",
    label: "Alkaline Earth Metals",
    description: "Sturdy reactive metals forming supportive ground layers.",
    color: "#eab308",
    hp: 140,
    element: { symbol: "Mg", name: "Magnesium" },
  },
  {
    id: "transition-metal",
    label: "Transition Metals",
    description: "Dense metallic zones ideal for infrastructure and traffic.",
    color: "#60a5fa",
    hp: 240,
    element: { symbol: "Fe", name: "Iron" },
  },
  {
    id: "post-transition",
    label: "Post-transition Metals",
    description: "Softer metals that still offer workable structure.",
    color: "#0ea5e9",
    hp: 170,
    element: { symbol: "Sn", name: "Tin" },
  },
  {
    id: "lanthanide",
    label: "Lanthanides",
    description: "Rare-earth fields powering specialty tech or lore points.",
    color: "#14b8a6",
    hp: 280,
    element: { symbol: "Ce", name: "Cerium" },
  },
  {
    id: "actinide",
    label: "Actinides",
    description: "Radiant, high-energy zones with serious traversal risks.",
    color: "#a855f7",
    hp: 360,
    element: { symbol: "U", name: "Uranium" },
  },
  {
    id: "halogen",
    label: "Halogens",
    description: "Corrosive regions signaling caution and controlled access.",
    color: "#f472b6",
    hp: 200,
    element: { symbol: "Cl", name: "Chlorine" },
  },
  {
    id: "noble-gas",
    label: "Noble Gases",
    description: "Inert pockets that buffer or insulate nearby terrain.",
    color: "#67e8f9",
    hp: 80,
    element: { symbol: "Ne", name: "Neon" },
  },
];

const OUTSIDE_TERRAIN_IDS = new Set(
  OUTSIDE_TERRAIN_BASE_TYPES.map((terrain) => terrain.id)
);

const OUTSIDE_TERRAIN_ID_ALIASES = new Map([
  ["nonmetals", "nonmetal"],
  ["non metals", "nonmetal"],
  ["non-metal", "nonmetal"],
  ["metalloids", "metalloid"],
  ["alkaline earth", "alkaline-earth"],
  ["alkaline earth metal", "alkaline-earth"],
  ["alkalineearth", "alkaline-earth"],
  ["transition metal", "transition-metal"],
  ["transitionmetal", "transition-metal"],
  ["post transition", "post-transition"],
  ["post transition metal", "post-transition"],
  ["post-transition metal", "post-transition"],
  ["lanthanides", "lanthanide"],
  ["actinides", "actinide"],
  ["halogens", "halogen"],
  ["noble gas", "noble-gas"],
  ["noble gases", "noble-gas"],
]);

const normalizeOutsideTerrainId = (terrainId) => {
  const key =
    typeof terrainId === "string" ? terrainId.trim().toLowerCase() : "";
  if (!key) {
    return null;
  }

  if (OUTSIDE_TERRAIN_IDS.has(key)) {
    return key;
  }

  const alias = OUTSIDE_TERRAIN_ID_ALIASES.get(key);
  if (alias && OUTSIDE_TERRAIN_IDS.has(alias)) {
    return alias;
  }

  const hyphenated = key.replace(/[_\s]+/g, "-");
  if (OUTSIDE_TERRAIN_IDS.has(hyphenated)) {
    return hyphenated;
  }

  return null;
};

const TERRAIN_ELEMENTS = PERIODIC_ELEMENTS.reduce((acc, element) => {
  if (!element || !Number.isFinite(element.number) || element.number <= 0) {
    return acc;
  }

  const category =
    typeof element.category === "string"
      ? element.category.trim().toLowerCase()
      : "";
  const terrainId = ELEMENT_CATEGORY_TO_TERRAIN_ID.get(category);

  if (!terrainId) {
    return acc;
  }

  const terrainElements = acc.get(terrainId) ?? [];
  terrainElements.push({
    number: element.number,
    symbol: element.symbol,
    name: element.name,
    category: element.category,
  });
  acc.set(terrainId, terrainElements);
  return acc;
}, new Map());

const TERRAIN_ELEMENTS_BY_ID = new Map(
  OUTSIDE_TERRAIN_BASE_TYPES.map((terrain) => {
    const uniqueElements = TERRAIN_ELEMENTS.get(terrain.id) ?? [];
    const sortedElements = [...uniqueElements].sort((first, second) =>
      first.number === second.number
        ? 0
        : first.number < second.number
          ? -1
          : 1
    );
    return [terrain.id, sortedElements];
  })
);

export const OUTSIDE_TERRAIN_TYPES = OUTSIDE_TERRAIN_BASE_TYPES.map((terrain) => {
  const elements = TERRAIN_ELEMENTS_BY_ID.get(terrain.id) ?? [];
  return {
    ...terrain,
    elements,
    element: terrain.element ?? elements[0] ?? null,
  };
});

export const OUTSIDE_TERRAIN_ELEMENTS_BY_ID = new Map(
  OUTSIDE_TERRAIN_TYPES.map((terrain) => [terrain.id, terrain.elements])
);

const OUTSIDE_TERRAIN_TEXTURE_BASE = "./images/tiles/floor";

export const OUTSIDE_TERRAIN_TILES = Array.from({ length: 11 }, (_, index) => ({
  id: `floor-${index + 1}`,
  texturePaths: [`${OUTSIDE_TERRAIN_TEXTURE_BASE}/${index + 1}.png`],
}));

const OUTSIDE_TERRAIN_TILE_BY_ID = new Map(
  OUTSIDE_TERRAIN_TILES.map((tile) => [tile.id, tile])
);

const TERRAIN_BY_ID = new Map(
  OUTSIDE_TERRAIN_TYPES.map((terrain) => [terrain.id, terrain])
);

const OUTSIDE_TERRAIN_DEFAULT_TILE_MAP = new Map([
  ["void", OUTSIDE_TERRAIN_TILES[10]?.id],
  ["nonmetal", OUTSIDE_TERRAIN_TILES[0]?.id],
  ["metalloid", OUTSIDE_TERRAIN_TILES[1]?.id],
  ["alkali", OUTSIDE_TERRAIN_TILES[2]?.id],
  ["alkaline-earth", OUTSIDE_TERRAIN_TILES[3]?.id],
  ["transition-metal", OUTSIDE_TERRAIN_TILES[4]?.id],
  ["post-transition", OUTSIDE_TERRAIN_TILES[5]?.id],
  ["lanthanide", OUTSIDE_TERRAIN_TILES[6]?.id],
  ["actinide", OUTSIDE_TERRAIN_TILES[7]?.id],
  ["halogen", OUTSIDE_TERRAIN_TILES[8]?.id],
  ["noble-gas", OUTSIDE_TERRAIN_TILES[9]?.id],
  // Void and unknown terrain IDs share a dedicated tile instead of transparency.
  ["fallback", OUTSIDE_TERRAIN_TILES[10]?.id],
]);

const ensureTerrainTileCoverage = () => {
  const fallbackTileId =
    OUTSIDE_TERRAIN_DEFAULT_TILE_MAP.get("fallback") ??
    OUTSIDE_TERRAIN_TILES.at(-1)?.id ??
    null;
  const tileIterator = OUTSIDE_TERRAIN_TILES.values();

  OUTSIDE_TERRAIN_TYPES.forEach((terrain) => {
    if (OUTSIDE_TERRAIN_DEFAULT_TILE_MAP.has(terrain.id)) {
      return;
    }

    const nextTileId = tileIterator.next().value?.id ?? fallbackTileId;
    if (nextTileId) {
      OUTSIDE_TERRAIN_DEFAULT_TILE_MAP.set(terrain.id, nextTileId);
    }
  });

  if (!OUTSIDE_TERRAIN_DEFAULT_TILE_MAP.has("fallback") && fallbackTileId) {
    OUTSIDE_TERRAIN_DEFAULT_TILE_MAP.set("fallback", fallbackTileId);
  }
};

ensureTerrainTileCoverage();

const normalizeOutsideTileId = (tileId) => {
  const key = typeof tileId === "string" ? tileId.trim().toLowerCase() : "";
  if (!key) {
    return null;
  }

  if (OUTSIDE_TERRAIN_TILE_BY_ID.has(key)) {
    return key;
  }

  return null;
};

export const getOutsideTerrainById = (id) => {
  const key = normalizeOutsideTerrainId(id);
  return TERRAIN_BY_ID.get(key) ?? OUTSIDE_TERRAIN_TYPES[0];
};

export const getOutsideTerrainDefaultTileId = (terrainId) => {
  const resolvedTerrain = getOutsideTerrainById(terrainId);
  const defaultTileId =
    OUTSIDE_TERRAIN_DEFAULT_TILE_MAP.get(resolvedTerrain.id) ??
    OUTSIDE_TERRAIN_DEFAULT_TILE_MAP.get("fallback") ??
    OUTSIDE_TERRAIN_TILES.at(-1)?.id ??
    null;
  return defaultTileId;
};

export const getOutsideTerrainTilePath = (tileId, variantSeed = 0) => {
  const normalizedTileId = normalizeOutsideTileId(tileId);
  const tile = normalizedTileId ? OUTSIDE_TERRAIN_TILE_BY_ID.get(normalizedTileId) : null;
  const texturePaths = tile?.texturePaths ?? [];

  if (texturePaths.length > 0) {
    return texturePaths[variantSeed % texturePaths.length];
  }

  const fallbackTileId =
    OUTSIDE_TERRAIN_DEFAULT_TILE_MAP.get("fallback") ??
    OUTSIDE_TERRAIN_TILES.at(-1)?.id ??
    null;
  if (fallbackTileId && fallbackTileId !== normalizedTileId) {
    return getOutsideTerrainTilePath(fallbackTileId, variantSeed);
  }

  return null;
};

export const getOutsideTerrainTexturePath = (terrainId, variantSeed = 0) => {
  const tileId = getOutsideTerrainDefaultTileId(terrainId);
  return getOutsideTerrainTilePath(tileId, variantSeed);
};

const MIN_MAP_DIMENSION = 1;
const MAX_MAP_DIMENSION = 200;

const DEFAULT_OUTSIDE_MAP_TEMPLATE = {
  name: "outside-yard",
  region: "perimeter",
  notes: "",
  width: 16,
  height: 12,
  cells: Array.from({ length: 16 * 12 }, () => ({
    terrainId: "nonmetal",
    tileId: getOutsideTerrainDefaultTileId("nonmetal"),
  })),
};

export const clampOutsideMapDimension = (value) => {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return MIN_MAP_DIMENSION;
  }
  return Math.min(
    MAX_MAP_DIMENSION,
    Math.max(MIN_MAP_DIMENSION, Math.floor(numeric))
  );
};

export const createDefaultOutsideMap = () =>
  normalizeOutsideMap(DEFAULT_OUTSIDE_MAP_TEMPLATE);

export function normalizeOutsideMap(definition) {
  if (!definition || typeof definition !== "object") {
    throw new Error("Invalid outside map definition");
  }

  const width = clampOutsideMapDimension(definition.width);
  const height = clampOutsideMapDimension(definition.height);
  const totalCells = width * height;
  const sourceCells = Array.isArray(definition.cells) ? definition.cells : [];
  const sourceTerrainIds = Array.isArray(definition.terrainIds)
    ? definition.terrainIds
    : null;
  const sourceTileIds = Array.isArray(definition.tileIds)
    ? definition.tileIds
    : null;

  const normalized = {
    name: typeof definition.name === "string" ? definition.name : "",
    region: typeof definition.region === "string" ? definition.region : "",
    notes: typeof definition.notes === "string" ? definition.notes : "",
    width,
    height,
    cells: [],
  };

  for (let index = 0; index < totalCells; index += 1) {
    const entry =
      sourceCells.length > 0
        ? sourceCells[index]
        : sourceTerrainIds || sourceTileIds
          ? {
              terrainId: sourceTerrainIds?.[index] ?? null,
              tileId: sourceTileIds?.[index] ?? null,
            }
          : null;
    const terrainId =
      entry && typeof entry === "object" && "terrainId" in entry
        ? entry.terrainId
        : entry;
    const tileId =
      entry && typeof entry === "object" && "tileId" in entry
        ? entry.tileId
        : null;
    const terrain = getOutsideTerrainById(terrainId);
    const resolvedTileId =
      normalizeOutsideTileId(tileId) ??
      getOutsideTerrainDefaultTileId(terrain.id);
    normalized.cells.push({
      terrainId: terrain.id,
      tileId: resolvedTileId,
    });
  }

  return normalized;
}

export const tryGetOutsideMapStorage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch (error) {
    console.warn("Local storage is unavailable", error);
    return null;
  }
};

export const loadOutsideMapFromStorage = (storage = tryGetOutsideMapStorage()) => {
  if (!storage) {
    return null;
  }

  let serialized = null;
  try {
    serialized = storage.getItem(OUTSIDE_MAP_LOCAL_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read outside map from storage", error);
    return null;
  }

  if (!serialized) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized);
    return normalizeOutsideMap(parsed);
  } catch (error) {
    console.warn("Stored outside map is invalid", error);
    return null;
  }
};

export const saveOutsideMapToStorage = (
  map,
  storage = tryGetOutsideMapStorage()
) => {
  if (!storage) {
    throw new Error("Local storage is unavailable");
  }

  const normalized = normalizeOutsideMap(map);

  storage.setItem(
    OUTSIDE_MAP_LOCAL_STORAGE_KEY,
    JSON.stringify(normalized)
  );

  return normalized;
};

export const cloneOutsideMap = (map) => cloneValue(map);
