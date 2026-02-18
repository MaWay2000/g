const MANIFEST_PLACEMENT_STORAGE_KEY = "dustyNova.manifestPlacements";

const getManifestPlacementStorage = (() => {
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
        const probeKey = `${MANIFEST_PLACEMENT_STORAGE_KEY}.probe`;
        storage.setItem(probeKey, "1");
        storage.removeItem(probeKey);
      }
    } catch (error) {
      console.warn("Unable to access localStorage for manifest placements", error);
      storage = null;
    }

    return storage;
  };
})();

const normalizePlacementScalar = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const normalizePlacementScale = (value, fallback = 1) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const normalizeManifestPlacementSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const rawPath =
    typeof snapshot.path === "string" ? snapshot.path.trim() : "";

  if (!rawPath) {
    return null;
  }

  const rawLabel =
    typeof snapshot.label === "string" ? snapshot.label.trim() : "";
  const label = rawLabel || rawPath;

  return {
    path: rawPath,
    label,
    position: {
      x: normalizePlacementScalar(snapshot?.position?.x, 0),
      y: normalizePlacementScalar(snapshot?.position?.y, 0),
      z: normalizePlacementScalar(snapshot?.position?.z, 0),
    },
    rotation: {
      x: normalizePlacementScalar(snapshot?.rotation?.x, 0),
      y: normalizePlacementScalar(snapshot?.rotation?.y, 0),
      z: normalizePlacementScalar(snapshot?.rotation?.z, 0),
    },
    scale: {
      x: normalizePlacementScale(snapshot?.scale?.x, 1),
      y: normalizePlacementScale(snapshot?.scale?.y, 1),
      z: normalizePlacementScale(snapshot?.scale?.z, 1),
    },
  };
};

let lastSerializedManifestPlacements = null;

export const clearStoredManifestPlacements = () => {
  const storage = getManifestPlacementStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(MANIFEST_PLACEMENT_STORAGE_KEY);
    lastSerializedManifestPlacements = null;
    return true;
  } catch (error) {
    console.warn("Unable to clear manifest placements", error);
  }

  return false;
};

export const loadStoredManifestPlacements = () => {
  const storage = getManifestPlacementStorage();

  if (!storage) {
    return [];
  }

  let serialized = null;

  try {
    serialized = storage.getItem(MANIFEST_PLACEMENT_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read stored manifest placements", error);
    return [];
  }

  if (typeof serialized !== "string" || serialized.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(serialized);
    const entries = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.placements)
      ? parsed.placements
      : [];

    const normalized = entries
      .map((entry) => normalizeManifestPlacementSnapshot(entry))
      .filter(Boolean);

    lastSerializedManifestPlacements = serialized;
    return normalized;
  } catch (error) {
    console.warn("Unable to parse stored manifest placements", error);
  }

  return [];
};

export const persistManifestPlacementState = (
  placements,
  { force = false } = {}
) => {
  const storage = getManifestPlacementStorage();

  if (!storage || !Array.isArray(placements)) {
    return false;
  }

  const payload = placements
    .map((entry) => normalizeManifestPlacementSnapshot(entry))
    .filter(Boolean);

  const serialized = JSON.stringify(payload);

  if (!force && serialized === lastSerializedManifestPlacements) {
    return true;
  }

  try {
    storage.setItem(MANIFEST_PLACEMENT_STORAGE_KEY, serialized);
    lastSerializedManifestPlacements = serialized;
    return true;
  } catch (error) {
    console.warn("Unable to persist manifest placements", error);
  }

  return false;
};
