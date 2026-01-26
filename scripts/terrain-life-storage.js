const TERRAIN_LIFE_STORAGE_KEY = "dustyNova.terrainLife";

const getTerrainLifeStorage = (() => {
  let resolved = false;
  let storage = null;

  return () => {
    if (resolved) {
      return storage;
    }

    resolved = true;

    if (typeof window === "undefined") {
      return null;
    }

    try {
      storage = window.localStorage;
      if (storage) {
        const probeKey = `${TERRAIN_LIFE_STORAGE_KEY}.probe`;
        storage.setItem(probeKey, "1");
        storage.removeItem(probeKey);
      }
    } catch (error) {
      console.warn("Unable to access localStorage for terrain life", error);
      storage = null;
    }

    return storage;
  };
})();

let lastSerializedTerrainLife = null;

export const clearStoredTerrainLife = () => {
  const storage = getTerrainLifeStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(TERRAIN_LIFE_STORAGE_KEY);
    lastSerializedTerrainLife = null;
    return true;
  } catch (error) {
    console.warn("Unable to clear stored terrain life", error);
  }

  return false;
};

export const loadStoredTerrainLife = () => {
  const storage = getTerrainLifeStorage();

  if (!storage) {
    return null;
  }

  let serialized = null;

  try {
    serialized = storage.getItem(TERRAIN_LIFE_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read stored terrain life", error);
    return null;
  }

  if (typeof serialized !== "string" || serialized.trim() === "") {
    return null;
  }

  try {
    const data = JSON.parse(serialized);
    if (!data || typeof data !== "object") {
      return null;
    }

    lastSerializedTerrainLife = serialized;

    return new Map(
      Object.entries(data).filter(
        ([key, value]) =>
          typeof key === "string" &&
          key.trim() !== "" &&
          Number.isFinite(value) &&
          value >= 0
      )
    );
  } catch (error) {
    console.warn("Unable to parse stored terrain life", error);
  }

  return null;
};

export const persistTerrainLifeState = (terrainLifeById, { force = false } = {}) => {
  const storage = getTerrainLifeStorage();

  if (!storage || !(terrainLifeById instanceof Map)) {
    return false;
  }

  const payload = {};

  terrainLifeById.forEach((value, key) => {
    if (
      typeof key === "string" &&
      key.trim() !== "" &&
      Number.isFinite(value) &&
      value >= 0
    ) {
      payload[key] = value;
    }
  });

  const serialized = JSON.stringify(payload);

  if (!force && serialized === lastSerializedTerrainLife) {
    return true;
  }

  try {
    storage.setItem(TERRAIN_LIFE_STORAGE_KEY, serialized);
    lastSerializedTerrainLife = serialized;
    return true;
  } catch (error) {
    console.warn("Unable to persist terrain life", error);
  }

  return false;
};
