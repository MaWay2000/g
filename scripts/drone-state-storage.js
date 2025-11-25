const DRONE_STATE_STORAGE_KEY = "dustyNova.droneState";

const getDroneStateStorage = (() => {
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
        const probeKey = `${DRONE_STATE_STORAGE_KEY}.probe`;
        storage.setItem(probeKey, "1");
        storage.removeItem(probeKey);
      }
    } catch (error) {
      console.warn("Unable to access localStorage for drone state", error);
      storage = null;
    }

    return storage;
  };
})();

let lastSerializedDroneState = null;

const readStoredDroneState = () => {
  const storage = getDroneStateStorage();

  if (!storage) {
    return null;
  }

  let serialized = null;

  try {
    serialized = storage.getItem(DRONE_STATE_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read stored drone state", error);
    return null;
  }

  if (typeof serialized !== "string" || serialized.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(serialized);
  } catch (error) {
    console.warn("Unable to parse stored drone state", error);
  }

  return null;
};

const roundDroneStateValue = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 1000) / 1000;
};

const normalizeVector = (vector) => {
  if (
    !vector ||
    typeof vector.x !== "number" ||
    typeof vector.y !== "number" ||
    typeof vector.z !== "number"
  ) {
    return null;
  }

  if (
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    !Number.isFinite(vector.z)
  ) {
    return null;
  }

  return {
    x: roundDroneStateValue(vector.x),
    y: roundDroneStateValue(vector.y),
    z: roundDroneStateValue(vector.z),
  };
};

const normalizeSceneStateForPersistence = (sceneState) => {
  if (!sceneState || typeof sceneState !== "object") {
    return {
      active: false,
      returning: false,
      mode: "inactive",
      basePosition: null,
      lookDirection: null,
    };
  }

  const mode =
    typeof sceneState.mode === "string" && sceneState.mode.length > 0
      ? sceneState.mode
      : sceneState.returning
      ? "returning"
      : sceneState.active
      ? "collecting"
      : "inactive";

  return {
    active: Boolean(sceneState.active),
    returning: Boolean(sceneState.returning),
    mode,
    basePosition: normalizeVector(sceneState.basePosition),
    lookDirection: normalizeVector(sceneState.lookDirection),
  };
};

const normalizeCargoStateForPersistence = (cargoState) => {
  if (!cargoState || typeof cargoState !== "object") {
    return {
      samples: [],
      payloadGrams: 0,
      fuelCapacity: 0,
      fuelRemaining: 0,
    };
  }

  const samples = Array.isArray(cargoState.samples)
    ? cargoState.samples.slice()
    : [];
  const payload = Number.isFinite(cargoState.payloadGrams)
    ? cargoState.payloadGrams
    : 0;
  const fuelCapacity = Number.isFinite(cargoState.fuelCapacity)
    ? cargoState.fuelCapacity
    : 0;
  const fuelRemaining = Number.isFinite(cargoState.fuelRemaining)
    ? cargoState.fuelRemaining
    : 0;

  return {
    samples,
    payloadGrams: Math.max(0, roundDroneStateValue(payload)),
    fuelCapacity: Math.max(0, Math.floor(fuelCapacity)),
    fuelRemaining: Math.max(0, roundDroneStateValue(fuelRemaining)),
  };
};

const persistDroneState = (state, { force = false } = {}) => {
  const storage = getDroneStateStorage();

  if (!storage || !state || typeof state !== "object") {
    return false;
  }

  const serialized = JSON.stringify(state);

  if (!force && serialized === lastSerializedDroneState) {
    return true;
  }

  try {
    storage.setItem(DRONE_STATE_STORAGE_KEY, serialized);
    lastSerializedDroneState = serialized;
    return true;
  } catch (error) {
    console.warn("Unable to persist drone state", error);
  }

  return false;
};

const mergeAndPersistDroneState = (partialState, options) => {
  if (!partialState || typeof partialState !== "object") {
    return false;
  }

  const existing = readStoredDroneState() || {};
  const nextState = { ...existing };

  if (Object.prototype.hasOwnProperty.call(partialState, "scene")) {
    nextState.scene = partialState.scene;
  }

  if (Object.prototype.hasOwnProperty.call(partialState, "cargo")) {
    nextState.cargo = partialState.cargo;
  }

  if (!nextState.scene && !nextState.cargo) {
    return persistDroneState({}, options);
  }

  return persistDroneState(nextState, options);
};

export const persistDroneSceneState = (sceneState, options) =>
  mergeAndPersistDroneState(
    { scene: normalizeSceneStateForPersistence(sceneState) },
    options
  );

export const persistDroneCargoState = (cargoState, options) =>
  mergeAndPersistDroneState(
    { cargo: normalizeCargoStateForPersistence(cargoState) },
    options
  );

export const loadStoredDroneState = () => {
  const stored = readStoredDroneState();

  if (!stored || typeof stored !== "object") {
    return null;
  }

  const scene = stored.scene
    ? normalizeSceneStateForPersistence(stored.scene)
    : null;
  const cargo = stored.cargo
    ? normalizeCargoStateForPersistence(stored.cargo)
    : null;

  return { scene, cargo };
};

export const clearStoredDroneState = () => {
  const storage = getDroneStateStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(DRONE_STATE_STORAGE_KEY);
    lastSerializedDroneState = null;
    return true;
  } catch (error) {
    console.warn("Unable to clear stored drone state", error);
  }

  return false;
};

export const resetDroneStateCache = () => {
  lastSerializedDroneState = null;
};
