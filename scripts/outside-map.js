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
    hp: 0,
    element: { symbol: "He", name: "Helium" },
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
