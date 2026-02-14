const GEO_VISOR_STORAGE_KEY = "dustyNova.geoVisor";

const clampBatteryLevel = (value, fallback = 1) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numericValue));
};

const normalizeUpdatedAt = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return Math.floor(numericValue);
};

const getGeoVisorStorage = (() => {
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
        const probeKey = `${GEO_VISOR_STORAGE_KEY}.probe`;
        storage.setItem(probeKey, "1");
        storage.removeItem(probeKey);
      }
    } catch (error) {
      console.warn("Unable to access localStorage for Geo Visor", error);
      storage = null;
    }

    return storage;
  };
})();

let lastSerializedGeoVisorState = null;

export const clearStoredGeoVisorState = () => {
  const storage = getGeoVisorStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(GEO_VISOR_STORAGE_KEY);
    lastSerializedGeoVisorState = null;
    return true;
  } catch (error) {
    console.warn("Unable to clear stored Geo Visor state", error);
  }

  return false;
};

export const loadStoredGeoVisorState = () => {
  const storage = getGeoVisorStorage();

  if (!storage) {
    return null;
  }

  let serialized = null;

  try {
    serialized = storage.getItem(GEO_VISOR_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read stored Geo Visor state", error);
    return null;
  }

  if (typeof serialized !== "string" || serialized.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const level = clampBatteryLevel(parsed.level, 1);
    const updatedAt = normalizeUpdatedAt(parsed.updatedAt);
    lastSerializedGeoVisorState = serialized;

    return { level, updatedAt };
  } catch (error) {
    console.warn("Unable to parse stored Geo Visor state", error);
  }

  return null;
};

export const persistGeoVisorState = (state, { force = false } = {}) => {
  const storage = getGeoVisorStorage();

  if (!storage || !state || typeof state !== "object") {
    return false;
  }

  const payload = {
    level: clampBatteryLevel(state.level, 1),
    updatedAt: normalizeUpdatedAt(state.updatedAt) ?? Date.now(),
  };
  const serialized = JSON.stringify(payload);

  if (!force && serialized === lastSerializedGeoVisorState) {
    return true;
  }

  try {
    storage.setItem(GEO_VISOR_STORAGE_KEY, serialized);
    lastSerializedGeoVisorState = serialized;
    return true;
  } catch (error) {
    console.warn("Unable to persist Geo Visor state", error);
  }

  return false;
};
