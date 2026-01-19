const SETTINGS_STORAGE_KEY = "dustyNova.settings";

const getDefaultTimeZoneOffsetHours = () => {
  try {
    const minutesOffset = new Date().getTimezoneOffset();
    const hoursOffset = -minutesOffset / 60;

    if (Number.isFinite(hoursOffset)) {
      return Math.min(14, Math.max(-12, hoursOffset));
    }
  } catch (error) {
    console.warn("Unable to read timezone offset", error);
  }

  return 0;
};

const DEFAULT_SETTINGS = {
  maxPixelRatio: 1.25,
  showFpsCounter: false,
  showStars: true,
  playerSpeedMultiplier: 1,
  playerJumpMultiplier: 1,
  jumpApexSmoothing: 6,
  jumpApexVelocity: 1.4,
  starFollowPlayer: true,
  starSize: 8.63,
  starDensity: 8.61,
  starOpacity: 3.05,
  skyExtent: 13.35,
  skyDomeHeight: 0,
  timeZoneOffsetHours: 3,
};

const normalizeSettings = (settings = {}) => {
  const pixelRatioCap = Number.isFinite(settings.maxPixelRatio)
    ? Math.max(0.5, settings.maxPixelRatio)
    : DEFAULT_SETTINGS.maxPixelRatio;

  const normalizeValue = (value, fallback) =>
    Number.isFinite(value) ? value : fallback;

  const normalizeSpeedMultiplier = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return DEFAULT_SETTINGS.playerSpeedMultiplier;
    }

    return Math.max(1, Math.min(10, numericValue));
  };

  const normalizeJumpMultiplier = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return DEFAULT_SETTINGS.playerJumpMultiplier;
    }

    return Math.max(1, numericValue);
  };

  const normalizeJumpApexSmoothing = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return DEFAULT_SETTINGS.jumpApexSmoothing;
    }

    return Math.max(0, Math.min(12, numericValue));
  };

  const normalizeJumpApexVelocity = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return DEFAULT_SETTINGS.jumpApexVelocity;
    }

    return Math.max(0.1, Math.min(5, numericValue));
  };

  return {
    ...DEFAULT_SETTINGS,
    maxPixelRatio: pixelRatioCap,
    showFpsCounter: Boolean(settings.showFpsCounter),
    showStars: settings.showStars !== false,
    playerSpeedMultiplier: normalizeSpeedMultiplier(settings.playerSpeedMultiplier),
    playerJumpMultiplier: normalizeJumpMultiplier(settings.playerJumpMultiplier),
    jumpApexSmoothing: normalizeJumpApexSmoothing(settings.jumpApexSmoothing),
    jumpApexVelocity: normalizeJumpApexVelocity(settings.jumpApexVelocity),
    starFollowPlayer: settings.starFollowPlayer !== false,
    starSize: normalizeValue(settings.starSize, DEFAULT_SETTINGS.starSize),
    starDensity: normalizeValue(settings.starDensity, DEFAULT_SETTINGS.starDensity),
    starOpacity: normalizeValue(settings.starOpacity, DEFAULT_SETTINGS.starOpacity),
    skyExtent: normalizeValue(settings.skyExtent, DEFAULT_SETTINGS.skyExtent),
    skyDomeHeight: normalizeValue(
      settings.skyDomeHeight,
      DEFAULT_SETTINGS.skyDomeHeight
    ),
    timeZoneOffsetHours: normalizeValue(
      settings.timeZoneOffsetHours,
      DEFAULT_SETTINGS.timeZoneOffsetHours
    ),
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
