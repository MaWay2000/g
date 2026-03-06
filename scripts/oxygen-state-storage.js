const OXYGEN_STATE_STORAGE_KEY = "dustyNova.oxygenState";
const PLAYER_OXYGEN_MAX_PERCENT = 100;

const clampOxygenPercent = (value, fallback = PLAYER_OXYGEN_MAX_PERCENT) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(PLAYER_OXYGEN_MAX_PERCENT, numericValue));
};

const normalizeUpdatedAt = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return Math.floor(numericValue);
};

const getOxygenStateStorage = (() => {
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
        const probeKey = `${OXYGEN_STATE_STORAGE_KEY}.probe`;
        storage.setItem(probeKey, "1");
        storage.removeItem(probeKey);
      }
    } catch (error) {
      console.warn("Unable to access localStorage for oxygen state", error);
      storage = null;
    }

    return storage;
  };
})();

let lastSerializedOxygenState = null;

export const clearStoredPlayerOxygenState = () => {
  const storage = getOxygenStateStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(OXYGEN_STATE_STORAGE_KEY);
    lastSerializedOxygenState = null;
    return true;
  } catch (error) {
    console.warn("Unable to clear stored oxygen state", error);
  }

  return false;
};

export const loadStoredPlayerOxygenState = () => {
  const storage = getOxygenStateStorage();

  if (!storage) {
    return null;
  }

  let serialized = null;

  try {
    serialized = storage.getItem(OXYGEN_STATE_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read stored oxygen state", error);
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

    const percent = clampOxygenPercent(
      parsed.percent,
      PLAYER_OXYGEN_MAX_PERCENT
    );
    const updatedAt = normalizeUpdatedAt(parsed.updatedAt);
    lastSerializedOxygenState = serialized;

    return { percent, updatedAt };
  } catch (error) {
    console.warn("Unable to parse stored oxygen state", error);
  }

  return null;
};

export const persistPlayerOxygenState = (state, { force = false } = {}) => {
  const storage = getOxygenStateStorage();

  if (!storage || !state || typeof state !== "object") {
    return false;
  }

  const payload = {
    percent: clampOxygenPercent(state.percent, PLAYER_OXYGEN_MAX_PERCENT),
    updatedAt: normalizeUpdatedAt(state.updatedAt) ?? Date.now(),
  };
  const serialized = JSON.stringify(payload);

  if (!force && serialized === lastSerializedOxygenState) {
    return true;
  }

  try {
    storage.setItem(OXYGEN_STATE_STORAGE_KEY, serialized);
    lastSerializedOxygenState = serialized;
    return true;
  } catch (error) {
    console.warn("Unable to persist oxygen state", error);
  }

  return false;
};
