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
    color: "transparent",
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

export const OUTSIDE_TERRAIN_TEXTURE_PATHS = Array.from(
  { length: 11 },
  (_, index) => `${OUTSIDE_TERRAIN_TEXTURE_BASE}/${index + 1}.png`
);

const TERRAIN_BY_ID = new Map(
  OUTSIDE_TERRAIN_TYPES.map((terrain) => [terrain.id, terrain])
);

const OUTSIDE_TERRAIN_TEXTURE_MAP = new Map([
  ["void", OUTSIDE_TERRAIN_TEXTURE_PATHS[10]],
  ["nonmetal", OUTSIDE_TERRAIN_TEXTURE_PATHS[0]],
  ["metalloid", OUTSIDE_TERRAIN_TEXTURE_PATHS[1]],
  ["alkali", OUTSIDE_TERRAIN_TEXTURE_PATHS[2]],
  ["alkaline-earth", OUTSIDE_TERRAIN_TEXTURE_PATHS[3]],
  ["transition-metal", OUTSIDE_TERRAIN_TEXTURE_PATHS[4]],
  ["post-transition", OUTSIDE_TERRAIN_TEXTURE_PATHS[5]],
  ["lanthanide", OUTSIDE_TERRAIN_TEXTURE_PATHS[6]],
  ["actinide", OUTSIDE_TERRAIN_TEXTURE_PATHS[7]],
  ["halogen", OUTSIDE_TERRAIN_TEXTURE_PATHS[8]],
  ["noble-gas", OUTSIDE_TERRAIN_TEXTURE_PATHS[9]],
  // Void and unknown terrain IDs share a dedicated tile instead of transparency.
  ["fallback", OUTSIDE_TERRAIN_TEXTURE_PATHS[10]],
]);

const ensureTerrainTextureCoverage = () => {
  const fallbackTexture =
    OUTSIDE_TERRAIN_TEXTURE_MAP.get("fallback") ??
    OUTSIDE_TERRAIN_TEXTURE_PATHS.at(-1) ??
    null;
  const textureIterator = OUTSIDE_TERRAIN_TEXTURE_PATHS.values();

  OUTSIDE_TERRAIN_TYPES.forEach((terrain) => {
    if (OUTSIDE_TERRAIN_TEXTURE_MAP.has(terrain.id)) {
      return;
    }

    const nextTexture = textureIterator.next().value ?? fallbackTexture;
    if (nextTexture) {
      OUTSIDE_TERRAIN_TEXTURE_MAP.set(terrain.id, nextTexture);
    }
  });

  if (!OUTSIDE_TERRAIN_TEXTURE_MAP.has("fallback") && fallbackTexture) {
    OUTSIDE_TERRAIN_TEXTURE_MAP.set("fallback", fallbackTexture);
  }
};

ensureTerrainTextureCoverage();

export const getOutsideTerrainTexturePath = (terrainId, variantSeed = 0) => {
  const key = typeof terrainId === "string" ? terrainId : String(terrainId ?? "");

  if (OUTSIDE_TERRAIN_TEXTURE_MAP.has(key)) {
    const entry = OUTSIDE_TERRAIN_TEXTURE_MAP.get(key);
    if (Array.isArray(entry) && entry.length > 0) {
      return entry[variantSeed % entry.length];
    }
    return entry;
  }

  return OUTSIDE_TERRAIN_TEXTURE_MAP.get("fallback") ?? null;
};

const MIN_MAP_DIMENSION = 1;
const MAX_MAP_DIMENSION = 200;

const DEFAULT_OUTSIDE_MAP_TEMPLATE = {
  name: "outside-yard",
  region: "perimeter",
  notes: "",
  width: 16,
  height: 12,
  cells: Array.from({ length: 16 * 12 }, () => "nonmetal"),
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

export const getOutsideTerrainById = (id) => {
  const key = typeof id === "string" ? id : String(id ?? "");
  return TERRAIN_BY_ID.get(key) ?? OUTSIDE_TERRAIN_TYPES[0];
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

  const normalized = {
    name: typeof definition.name === "string" ? definition.name : "",
    region: typeof definition.region === "string" ? definition.region : "",
    notes: typeof definition.notes === "string" ? definition.notes : "",
    width,
    height,
    cells: [],
  };

  for (let index = 0; index < totalCells; index += 1) {
    const terrainId = index < sourceCells.length ? sourceCells[index] : null;
    const terrain = getOutsideTerrainById(terrainId);
    normalized.cells.push(terrain.id);
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
