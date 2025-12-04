const SETTINGS_STORAGE_KEY = "dustyNova.settings";

const DEFAULT_SETTINGS = {
  maxPixelRatio: 1.25,
  showFpsCounter: false,
  showStars: true,
  starSize: 1,
  starDensity: 1,
  starOpacity: 1,
  skyExtent: 1,
};

const clampNumber = (value, min, max, fallback) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
};

const normalizeSettings = (settings = {}) => {
  const pixelRatioCap = Number.isFinite(settings.maxPixelRatio)
    ? Math.max(0.5, settings.maxPixelRatio)
    : DEFAULT_SETTINGS.maxPixelRatio;

  return {
    ...DEFAULT_SETTINGS,
    maxPixelRatio: pixelRatioCap,
    showFpsCounter: Boolean(settings.showFpsCounter),
    showStars: settings.showStars !== false,
    starSize: clampNumber(settings.starSize, 0.5, 1.5, DEFAULT_SETTINGS.starSize),
    starDensity: clampNumber(
      settings.starDensity,
      0.5,
      1.5,
      DEFAULT_SETTINGS.starDensity
    ),
    starOpacity: clampNumber(
      settings.starOpacity,
      0.4,
      1.4,
      DEFAULT_SETTINGS.starOpacity
    ),
    skyExtent: clampNumber(settings.skyExtent, 0.65, 1.45, DEFAULT_SETTINGS.skyExtent),
  };
};

const getSettingsStorage = (() => {
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
        const probeKey = `${SETTINGS_STORAGE_KEY}.probe`;
        storage.setItem(probeKey, "1");
        storage.removeItem(probeKey);
      }
    } catch (error) {
      console.warn("Unable to access localStorage for settings", error);
      storage = null;
    }

    return storage;
  };
})();

const serializeSettings = (settings) => {
  try {
    return JSON.stringify(normalizeSettings(settings));
  } catch (error) {
    console.warn("Unable to serialize settings", error);
  }

  return null;
};

const parseStoredSettings = (serialized) => {
  if (typeof serialized !== "string" || serialized.trim() === "") {
    return null;
  }

  try {
    return normalizeSettings(JSON.parse(serialized));
  } catch (error) {
    console.warn("Unable to parse stored settings", error);
  }

  return null;
};

export const loadStoredSettings = () => {
  const storage = getSettingsStorage();

  if (!storage) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const serialized = storage.getItem(SETTINGS_STORAGE_KEY);
    return parseStoredSettings(serialized) ?? { ...DEFAULT_SETTINGS };
  } catch (error) {
    console.warn("Unable to read stored settings", error);
  }

  return { ...DEFAULT_SETTINGS };
};

export const persistSettings = (settings) => {
  const storage = getSettingsStorage();

  if (!storage) {
    return;
  }

  const serialized = serializeSettings(settings);

  if (!serialized) {
    return;
  }

  try {
    storage.setItem(SETTINGS_STORAGE_KEY, serialized);
  } catch (error) {
    console.warn("Unable to persist settings", error);
  }
};

export const clearStoredSettings = () => {
  const storage = getSettingsStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(SETTINGS_STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn("Unable to clear stored settings", error);
  }

  return false;
};

export { DEFAULT_SETTINGS };
