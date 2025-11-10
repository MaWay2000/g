const STRUCTURED_CLONE_SUPPORTED = typeof globalThis.structuredClone === "function";

const cloneValue = (value) => {
  if (STRUCTURED_CLONE_SUPPORTED) {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export const OUTSIDE_MAP_LOCAL_STORAGE_KEY = "dustyNova.mapMaker.savedMap";

export const OUTSIDE_TERRAIN_TYPES = [
  {
    id: "void",
    label: "Void",
    description: "Unusable space. Treated as off-map.",
    color: "transparent",
  },
  {
    id: "path",
    label: "Packed Trail",
    description: "Primary traversal route for vehicles or foot traffic.",
    color: "#eab308",
  },
  {
    id: "grass",
    label: "Wild Grass",
    description: "Open exploration space with light vegetation.",
    color: "#4ade80",
  },
  {
    id: "rock",
    label: "Rock Plate",
    description: "Impassable rocky terrain or structures.",
    color: "#94a3b8",
  },
  {
    id: "water",
    label: "Water",
    description: "Bodies of water, rivers, or flood zones.",
    color: "#60a5fa",
  },
  {
    id: "hazard",
    label: "Hazard",
    description: "High-risk area that requires protection to traverse.",
    color: "#f87171",
  },
  {
    id: "tunnel",
    label: "Tunnel",
    description: "Underground access route connecting separate spaces.",
    color: "#fdba74",
  },
  {
    id: "mountain",
    label: "Mountains",
    description: "Impassable elevated range that defines map boundaries.",
    color: "#475569",
  },
  {
    id: "point",
    label: "Point of Interest",
    description: "Interactive or narrative focal point.",
    color: "#f472b6",
  },
];

const TERRAIN_BY_ID = new Map(
  OUTSIDE_TERRAIN_TYPES.map((terrain) => [terrain.id, terrain])
);

const MIN_MAP_DIMENSION = 1;
const MAX_MAP_DIMENSION = 200;

const DEFAULT_OUTSIDE_MAP_TEMPLATE = {
  name: "outside-yard",
  region: "perimeter",
  notes: "",
  width: 16,
  height: 12,
  cells: Array.from({ length: 16 * 12 }, () => "grass"),
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
