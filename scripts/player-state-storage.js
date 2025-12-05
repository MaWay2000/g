import * as THREE from "three";

const PLAYER_STATE_STORAGE_KEY = "dustyNova.playerState";
const PLAYER_HEIGHT_STORAGE_KEY = `${PLAYER_STATE_STORAGE_KEY}.height`;

export const DEFAULT_PLAYER_HEIGHT = 1.8;
export const DEFAULT_CAMERA_PITCH = 0;

const MAX_RESTORABLE_PITCH =
  Math.PI / 2 - THREE.MathUtils.degToRad(1);

const normalizePitchForPersistence = (pitch) => {
  if (!Number.isFinite(pitch)) {
    return null;
  }

  const normalized =
    THREE.MathUtils.euclideanModulo(pitch + Math.PI, Math.PI * 2) - Math.PI;

  if (Math.abs(normalized) >= MAX_RESTORABLE_PITCH) {
    return null;
  }

  return normalized;
};

const getPlayerStateStorage = (() => {
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
        const probeKey = `${PLAYER_STATE_STORAGE_KEY}.probe`;
        storage.setItem(probeKey, "1");
        storage.removeItem(probeKey);
      }
    } catch (error) {
      console.warn("Unable to access localStorage for player state", error);
      storage = null;
    }

    return storage;
  };
})();

let lastSerializedPlayerHeight = null;
let lastPersistedPlayerState = null;

export const clearStoredPlayerState = () => {
  const storage = getPlayerStateStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(PLAYER_STATE_STORAGE_KEY);
    storage.removeItem(PLAYER_HEIGHT_STORAGE_KEY);
    lastSerializedPlayerHeight = null;
    lastPersistedPlayerState = null;
    return true;
  } catch (error) {
    console.warn("Unable to clear stored player state", error);
  }

  return false;
};

export const loadStoredPlayerHeight = () => {
  const storage = getPlayerStateStorage();

  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(PLAYER_HEIGHT_STORAGE_KEY);

    if (typeof rawValue !== "string" || rawValue.trim() === "") {
      return null;
    }

    const normalizedValue = rawValue.trim();
    const parsedValue = Number.parseFloat(normalizedValue);

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return null;
    }

    lastSerializedPlayerHeight = normalizedValue;
    return parsedValue;
  } catch (error) {
    console.warn("Unable to read stored player height", error);
  }

  return null;
};

export const persistPlayerHeight = (height) => {
  if (!Number.isFinite(height) || height <= 0) {
    return;
  }

  const storage = getPlayerStateStorage();

  if (!storage) {
    return;
  }

  const serializedHeight = (Math.round(height * 1000) / 1000).toString();

  if (serializedHeight === lastSerializedPlayerHeight) {
    return;
  }

  try {
    storage.setItem(PLAYER_HEIGHT_STORAGE_KEY, serializedHeight);
    lastSerializedPlayerHeight = serializedHeight;
  } catch (error) {
    console.warn("Unable to persist player height", error);
  }
};

export const loadStoredPlayerState = () => {
  const storage = getPlayerStateStorage();

  if (!storage) {
    return null;
  }

  let serialized = null;

  try {
    serialized = storage.getItem(PLAYER_STATE_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read stored player state", error);
    return null;
  }

  if (!serialized) {
    return null;
  }

  try {
    const data = JSON.parse(serialized);
    const position = data?.position;
    const quaternion = data?.quaternion;
    const isFiniteNumber = (value) =>
      typeof value === "number" && Number.isFinite(value);

    if (
      !position ||
      !quaternion ||
      !isFiniteNumber(position.x) ||
      !isFiniteNumber(position.y) ||
      !isFiniteNumber(position.z) ||
      !isFiniteNumber(quaternion.x) ||
      !isFiniteNumber(quaternion.y) ||
      !isFiniteNumber(quaternion.z) ||
      !isFiniteNumber(quaternion.w)
    ) {
      return null;
    }

    const pitch = normalizePitchForPersistence(data?.pitch);
    const hasPitch = pitch !== null;

    lastPersistedPlayerState = serialized;

    return {
      position: new THREE.Vector3(position.x, position.y, position.z),
      quaternion: new THREE.Quaternion(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w
      ),
      pitch: hasPitch ? pitch : null,
    };
  } catch (error) {
    console.warn("Unable to parse stored player state", error);
  }

  return null;
};

export const persistPlayerState = (serializedState, { force = false } = {}) => {
  if (typeof serializedState !== "string" || serializedState.length === 0) {
    return false;
  }

  const storage = getPlayerStateStorage();

  if (!storage) {
    return false;
  }

  if (!force && serializedState === lastPersistedPlayerState) {
    return true;
  }

  try {
    storage.setItem(PLAYER_STATE_STORAGE_KEY, serializedState);
    lastPersistedPlayerState = serializedState;
    return true;
  } catch (error) {
    console.warn("Unable to save player state", error);
  }

  return false;
};

export const resetPlayerStateCache = () => {
  lastPersistedPlayerState = null;
};

export { normalizePitchForPersistence };
