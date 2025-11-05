import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { Reflector } from "https://unpkg.com/three@0.161.0/examples/jsm/objects/Reflector.js";
import { GLTFLoader } from "https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "https://unpkg.com/three@0.161.0/examples/jsm/loaders/OBJLoader.js";
import { PointerLockControls } from "./pointer-lock-controls.js";

export const PLAYER_STATE_STORAGE_KEY = "dustyNova.playerState";
export const DEFAULT_PLAYER_HEIGHT = 1.8;
const PLAYER_HEIGHT_STORAGE_KEY = `${PLAYER_STATE_STORAGE_KEY}.height`;
const PLAYER_STATE_SAVE_INTERVAL = 1; // seconds
const DEFAULT_CAMERA_PITCH = 0;
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

export const clearStoredPlayerState = () => {
  const storage = getPlayerStateStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(PLAYER_STATE_STORAGE_KEY);
    storage.removeItem(PLAYER_HEIGHT_STORAGE_KEY);
    lastSerializedPlayerHeight = null;
    return true;
  } catch (error) {
    console.warn("Unable to clear stored player state", error);
  }

  return false;
};

let lastSerializedPlayerHeight = null;

const loadStoredPlayerHeight = () => {
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

const persistPlayerHeight = (height) => {
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

const loadStoredPlayerState = () => {
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
    return {
      position: new THREE.Vector3(position.x, position.y, position.z),
      quaternion: new THREE.Quaternion(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w
      ),
      pitch: hasPitch ? pitch : null,
      serialized,
    };
  } catch (error) {
    console.warn("Unable to parse stored player state", error);
  }

  return null;
};

export const initScene = (
  canvas,
  {
    onControlsLocked,
    onControlsUnlocked,
    onTerminalOptionSelected,
    onTerminalInteractableChange,
    onLiftControlInteract,
    onLiftInteractableChange,
    onLiftTravel,
    onManifestPlacementHoverChange,
    onManifestEditModeChange,
    onManifestPlacementRemoved,
  } = {}
) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  const MIN_PLAYER_HEIGHT = 0.1;
  const ROOM_SCALE_FACTOR = 0.25;
  camera.position.set(0, 0, 8 * ROOM_SCALE_FACTOR);

  const textureLoader = new THREE.TextureLoader();

  const gltfCache = new Map();
  const objCache = new Map();

  const liftInteractables = [];
  const liftUiControllers = new Set();
  const registeredLiftDoors = [];
  const environmentHeightAdjusters = [];

  const registerEnvironmentHeightAdjuster = (adjuster) => {
    if (typeof adjuster !== "function") {
      return () => {};
    }

    environmentHeightAdjusters.push(adjuster);

    return () => {
      const index = environmentHeightAdjusters.indexOf(adjuster);
      if (index >= 0) {
        environmentHeightAdjusters.splice(index, 1);
      }
    };
  };

  const registerLiftDoor = (door) => {
    if (!door || registeredLiftDoors.includes(door)) {
      return () => {};
    }

    registeredLiftDoors.push(door);

    const controller = door.userData?.liftUi ?? null;
    let registeredControl = null;

    if (controller) {
      liftUiControllers.add(controller);
      const control = controller.control ?? null;
      if (control && !liftInteractables.includes(control)) {
        liftInteractables.push(control);
        registeredControl = control;
      } else if (control) {
        registeredControl = control;
      }
    }

    return () => {
      const doorIndex = registeredLiftDoors.indexOf(door);
      if (doorIndex >= 0) {
        registeredLiftDoors.splice(doorIndex, 1);
      }

      if (controller) {
        liftUiControllers.delete(controller);
      }

      if (registeredControl) {
        const controlIndex = liftInteractables.indexOf(registeredControl);
        if (controlIndex >= 0) {
          liftInteractables.splice(controlIndex, 1);
        }
      }
    };
  };

  const createFloorBounds = (
    width,
    depth,
    { paddingX = 1, paddingZ = 1 } = {}
  ) => {
    const safePaddingX = Number.isFinite(paddingX) ? paddingX : 0;
    const safePaddingZ = Number.isFinite(paddingZ) ? paddingZ : 0;
    const halfWidth = Math.max(0, width / 2 - safePaddingX);
    const halfDepth = Math.max(0, depth / 2 - safePaddingZ);

    return {
      minX: -halfWidth,
      maxX: halfWidth,
      minZ: -halfDepth,
      maxZ: halfDepth,
    };
  };

  const translateBoundsToWorld = (bounds, origin) => {
    if (!bounds) {
      return null;
    }

    const offsetX = Number.isFinite(origin?.x) ? origin.x : 0;
    const offsetZ = Number.isFinite(origin?.z) ? origin.z : 0;

    const minX = Number.isFinite(bounds.minX) ? bounds.minX + offsetX : null;
    const maxX = Number.isFinite(bounds.maxX) ? bounds.maxX + offsetX : null;
    const minZ = Number.isFinite(bounds.minZ) ? bounds.minZ + offsetZ : null;
    const maxZ = Number.isFinite(bounds.maxZ) ? bounds.maxZ + offsetZ : null;

    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(minZ) ||
      !Number.isFinite(maxZ)
    ) {
      return null;
    }

    return { minX, maxX, minZ, maxZ };
  };

  const defaultImportedMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1f2937),
    roughness: 0.64,
    metalness: 0.18,
  });

  const cloneImportedMaterial = (material) => {
    if (!material) {
      return defaultImportedMaterial.clone();
    }

    if (Array.isArray(material)) {
      return material.map((entry) => cloneImportedMaterial(entry));
    }

    const cloned = material.clone();

    if (cloned.color?.isColor) {
      cloned.color = cloned.color.clone();
    }

    return cloned;
  };

  const prepareImportedObject = (object) => {
    if (!object) {
      return object;
    }

    object.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      child.castShadow = true;
      child.receiveShadow = true;
      child.layers.enable(0);
      child.material = cloneImportedMaterial(child.material);
    });

    return object;
  };

  const resolveAssetUrl = (path) => {
    if (typeof path !== "string") {
      return null;
    }

    const trimmed = path.trim();

    if (!trimmed) {
      return null;
    }

    const windowHref = typeof window !== "undefined" ? window.location?.href : null;

    if (windowHref) {
      try {
        return new URL(trimmed, windowHref).href;
      } catch (error) {
        // Ignore and fall back to resolving relative to the module URL.
      }
    }

    try {
      return new URL(trimmed, import.meta.url).href;
    } catch (error) {
      return trimmed;
    }
  };

  const loadGLTFModel = async (path) => {
    const resolvedUrl = resolveAssetUrl(path);

    if (!resolvedUrl) {
      throw new Error("Unable to resolve GLTF model path");
    }

    if (!gltfCache.has(resolvedUrl)) {
      const loader = new GLTFLoader();
      gltfCache.set(
        resolvedUrl,
        loader.loadAsync(resolvedUrl).catch((error) => {
          console.error(`Failed to load GLTF model from ${resolvedUrl}`, error);
          gltfCache.delete(resolvedUrl);
          throw error;
        })
      );
    }

    const gltf = await gltfCache.get(resolvedUrl);
    const root = gltf?.scene ? gltf.scene.clone(true) : new THREE.Group();

    return prepareImportedObject(root);
  };

  const loadOBJModel = async (path) => {
    const resolvedUrl = resolveAssetUrl(path);

    if (!resolvedUrl) {
      throw new Error("Unable to resolve OBJ model path");
    }

    if (!objCache.has(resolvedUrl)) {
      const loader = new OBJLoader();
      objCache.set(
        resolvedUrl,
        loader.loadAsync(resolvedUrl).catch((error) => {
          console.error(`Failed to load OBJ model from ${resolvedUrl}`, error);
          objCache.delete(resolvedUrl);
          throw error;
        })
      );
    }

    const object = (await objCache.get(resolvedUrl)).clone(true);

    return prepareImportedObject(object);
  };

  const resolveManifestModelPath = (rawPath) => {
    if (typeof rawPath !== "string") {
      return null;
    }

    const trimmed = rawPath.trim();

    if (trimmed === "") {
      return null;
    }

    if (/^(https?:)?\/\//i.test(trimmed)) {
      return trimmed;
    }

    if (trimmed.startsWith("./") || trimmed.startsWith("../")) {
      return trimmed;
    }

    if (trimmed.startsWith("/")) {
      return trimmed;
    }

    return `./models/${trimmed}`;
  };

  const loadModelFromManifestEntry = async (entry) => {
    const resolvedPath = resolveManifestModelPath(entry?.path);

    if (!resolvedPath) {
      throw new Error("Invalid model manifest entry path");
    }

    const extensionMatch = resolvedPath.match(/\.([a-z0-9]+)$/i);
    const extension = extensionMatch?.[1]?.toLowerCase() ?? "";

    if (extension === "gltf" || extension === "glb") {
      return loadGLTFModel(resolvedPath);
    }

    if (extension === "obj") {
      return loadOBJModel(resolvedPath);
    }

    throw new Error(`Unsupported model format for path: ${resolvedPath}`);
  };

  const registerCollidersForImportedRoot = (root, { padding } = {}) => {
    if (!root) {
      return [];
    }

    const paddingVector =
      padding instanceof THREE.Vector3 && padding.lengthSq() > 0
        ? padding.clone()
        : null;

    root.updateMatrixWorld(true);

    const descriptors = [];

    root.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      const bounds = new THREE.Box3().setFromObject(child);

      if (bounds.isEmpty()) {
        return;
      }

      const descriptor = { object: child, root };

      if (paddingVector) {
        descriptor.padding = paddingVector.clone();
      }

      descriptors.push(descriptor);
    });

    if (descriptors.length === 0) {
      return [];
    }

    return registerColliderDescriptors(descriptors);
  };

  const colliderDescriptors = [];

  const registerColliderDescriptors = (descriptors) => {
    if (!Array.isArray(descriptors) || descriptors.length === 0) {
      return [];
    }

    const registeredDescriptors = [];

    descriptors.forEach((descriptor) => {
      if (!descriptor || !descriptor.object) {
        return;
      }

      const padding = descriptor.padding
        ? descriptor.padding.clone()
        : undefined;

      const providedBox =
        descriptor.box instanceof THREE.Box3 ? descriptor.box.clone() : null;

      const autoUpdate = !providedBox;
      const box = providedBox ?? new THREE.Box3();

      if (providedBox && padding) {
        box.min.sub(padding);
        box.max.add(padding);
      }

      const registeredDescriptor = {
        object: descriptor.object,
        padding: autoUpdate ? padding : undefined,
        box,
        autoUpdate,
      };

      if (descriptor.root) {
        registeredDescriptor.root = descriptor.root;
      }

      colliderDescriptors.push(registeredDescriptor);
      registeredDescriptors.push(registeredDescriptor);
    });

    return registeredDescriptors;
  };

  const unregisterColliderDescriptors = (descriptors) => {
    if (!Array.isArray(descriptors) || descriptors.length === 0) {
      return;
    }

    const descriptorSet = new Set(descriptors);

    for (let index = colliderDescriptors.length - 1; index >= 0; index -= 1) {
      const descriptor = colliderDescriptors[index];

      if (!descriptorSet.has(descriptor)) {
        continue;
      }

      colliderDescriptors.splice(index, 1);
    }
  };

  const rebuildStaticColliders = () => {
    colliderDescriptors.forEach((descriptor) => {
      const { object, padding, box, autoUpdate } = descriptor;

      if (!object || !box) {
        return;
      }

      if (autoUpdate) {
        object.updateWorldMatrix(true, false);
        box.setFromObject(object);

        if (padding) {
          box.min.sub(padding);
          box.max.add(padding);
        }
      }
    });
  };

  const disposeObject3D = (object) => {
    if (!object) {
      return;
    }

    const disposedMaterials = new Set();

    object.traverse((child) => {
      if (!child) {
        return;
      }

      if (typeof child.userData?.dispose === "function") {
        try {
          child.userData.dispose();
        } catch (error) {
          console.warn("Failed to dispose object userData", error);
        }
      }

      const { geometry, material } = child;

      if (geometry && typeof geometry.dispose === "function") {
        geometry.dispose();
      }

      if (Array.isArray(material)) {
        material.forEach((entry) => {
          if (
            entry &&
            typeof entry.dispose === "function" &&
            !disposedMaterials.has(entry)
          ) {
            entry.dispose();
            disposedMaterials.add(entry);
          }
        });
      } else if (
        material &&
        typeof material.dispose === "function" &&
        !disposedMaterials.has(material)
      ) {
        material.dispose();
        disposedMaterials.add(material);
      }
    });
  };

  const isObjectDescendantOf = (object, ancestor) => {
    if (!object || !ancestor) {
      return false;
    }

    let current = object;

    while (current) {
      if (current === ancestor) {
        return true;
      }

      current = current.parent;
    }

    return false;
  };

  const createQuickAccessFallbackTexture = () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768">
  <defs>
    <linearGradient id="screen-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#051120" />
      <stop offset="100%" stop-color="#020a16" />
    </linearGradient>
    <radialGradient id="screen-vignette" cx="50%" cy="45%" r="75%">
      <stop offset="0%" stop-color="#1f2937" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#020610" stop-opacity="0.98" />
    </radialGradient>
    <linearGradient id="option-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f76d2" stop-opacity="0.42" />
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.18" />
    </linearGradient>
  </defs>
  <rect width="1024" height="768" fill="url(#screen-bg)" />
  <rect width="1024" height="768" fill="url(#screen-vignette)" />
  <g fill="none" stroke="#60a5fa" stroke-width="3" opacity="0.28">
    <rect x="40" y="40" width="944" height="688" rx="36" ry="36" />
  </g>
  <g>
    <text x="96" y="116" fill="#94a3b8" fill-opacity="0.82" font-size="44" font-family="'Segoe UI', 'Inter', sans-serif" font-weight="600" letter-spacing="6">TERMINAL</text>
    <text x="96" y="220" fill="#38bdf8" font-size="102" font-family="'Segoe UI', 'Inter', sans-serif" font-weight="700">Quick Access</text>
  </g>
  <line x1="84" y1="256" x2="940" y2="256" stroke="#334155" stroke-opacity="0.55" stroke-width="3" />
  <g font-family="'Segoe UI', 'Inter', sans-serif">
    <g transform="translate(96 292)">
      <rect width="832" height="156" rx="28" fill="url(#option-gradient)" stroke="#94a3b8" stroke-opacity="0.35" stroke-width="4" />
      <text x="60" y="68" fill="#e2e8f0" font-size="88" font-weight="700">NEWS</text>
      <text x="60" y="120" fill="#94a3b8" fill-opacity="0.85" font-size="48" font-weight="500">Latest mission intelligence</text>
    </g>
    <g transform="translate(96 472)">
      <rect width="832" height="156" rx="28" fill="url(#option-gradient)" stroke="#94a3b8" stroke-opacity="0.35" stroke-width="4" />
      <text x="60" y="68" fill="#e2e8f0" font-size="88" font-weight="700">WEATHER</text>
      <text x="60" y="120" fill="#94a3b8" fill-opacity="0.85" font-size="48" font-weight="500">Atmospheric reports</text>
    </g>
    <g transform="translate(96 652)">
      <rect width="832" height="156" rx="28" fill="url(#option-gradient)" stroke="#94a3b8" stroke-opacity="0.35" stroke-width="4" />
      <text x="60" y="68" fill="#e2e8f0" font-size="88" font-weight="700">MISSIONS</text>
      <text x="60" y="120" fill="#94a3b8" fill-opacity="0.85" font-size="48" font-weight="500">Active assignments</text>
    </g>
  </g>
</svg>`;

    const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    const texture = textureLoader.load(dataUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  };

  const loadClampedTexture = (path, onLoad) => {
    const resolvedUrl = resolveAssetUrl(path);

    if (!resolvedUrl) {
      throw new Error("Unable to resolve texture path");
    }

    const texture = textureLoader.load(
      resolvedUrl,
      (loadedTexture) => {
        if (typeof onLoad === "function") {
          onLoad(loadedTexture);
        }
      }
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  };

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
  keyLight.position.set(5 * ROOM_SCALE_FACTOR, 8 * ROOM_SCALE_FACTOR, 4 * ROOM_SCALE_FACTOR);
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(
    0x7dd3fc,
    0.4,
    50 * ROOM_SCALE_FACTOR,
    2
  );
  fillLight.position.set(
    -6 * ROOM_SCALE_FACTOR,
    4 * ROOM_SCALE_FACTOR,
    -5 * ROOM_SCALE_FACTOR
  );
  scene.add(fillLight);

  const storedPlayerHeight = loadStoredPlayerHeight();
  const initialPlayerHeight = Number.isFinite(storedPlayerHeight)
    ? storedPlayerHeight
    : DEFAULT_PLAYER_HEIGHT;
  let playerHeight = initialPlayerHeight;

  const BASE_ROOM_WIDTH = 20 * ROOM_SCALE_FACTOR;
  const BASE_ROOM_HEIGHT = 15 * ROOM_SCALE_FACTOR;
  const BASE_ROOM_DEPTH = 60 * ROOM_SCALE_FACTOR;
  const BASE_DOOR_WIDTH = 8.5 * ROOM_SCALE_FACTOR;
  const BASE_DOOR_HEIGHT = 13.5 * ROOM_SCALE_FACTOR;
  const DEFAULT_DOOR_THEME = {
    accentColor: 0x991b1b,
    accentEmissiveColor: 0x240303,
    seamGlowColor: 0xf87171,
    doorLightColor: 0xf97316,
    overheadLightColor: 0xf97316,
    emblemColor: 0x991b1b,
    emblemEmissiveColor: 0x250404,
  };
  const SHARED_ROOM_DOOR_THEME = {
    accentColor: 0x2563eb,
    accentEmissiveColor: 0x10243f,
    seamGlowColor: 0x38bdf8,
    doorLightColor: 0x38bdf8,
    overheadLightColor: 0x2563eb,
    emblemColor: 0x2563eb,
    emblemEmissiveColor: 0x10243f,
  };
  const BASE_MIRROR_WIDTH = 12 * ROOM_SCALE_FACTOR;
  const BASE_MIRROR_HEIGHT = 13.5 * ROOM_SCALE_FACTOR;

  const roomWidth = BASE_ROOM_WIDTH;
  const roomDepth = BASE_ROOM_DEPTH;
  let roomHeight = BASE_ROOM_HEIGHT * (playerHeight / DEFAULT_PLAYER_HEIGHT);
  const terminalBackOffset = 4 * ROOM_SCALE_FACTOR;
  let roomFloorY = -roomHeight / 2;

  const createWallMaterial = (hexColor) =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(hexColor),
      side: THREE.BackSide,
      roughness: 0.72,
      metalness: 0.12,
      emissive: new THREE.Color(0x0b1414),
      emissiveIntensity: 0.25,
    });

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x161f1f),
    side: THREE.BackSide,
    roughness: 0.92,
    metalness: 0.06,
  });

  const hangarDeckEnvironmentGroup = new THREE.Group();
  hangarDeckEnvironmentGroup.name = "HangarDeckEnvironment";
  scene.add(hangarDeckEnvironmentGroup);

  const roomGeometry = new THREE.BoxGeometry(
    roomWidth,
    BASE_ROOM_HEIGHT,
    roomDepth
  );

  const ceilingGroupIndex = 2;
  // Remove the ceiling faces from the room geometry so the room is open from above.
  const roomGeometryGroupsWithoutCeiling = roomGeometry.groups.filter(
    ({ materialIndex }) => materialIndex !== ceilingGroupIndex
  );

  roomGeometry.clearGroups();

  roomGeometryGroupsWithoutCeiling.forEach(
    ({ start, count, materialIndex }) => {
      const adjustedMaterialIndex =
        materialIndex > ceilingGroupIndex
          ? materialIndex - 1
          : materialIndex;

      roomGeometry.addGroup(start, count, adjustedMaterialIndex);
    }
  );

  const roomMaterials = [
    createWallMaterial(0x213331),
    createWallMaterial(0x273c39),
    floorMaterial,
    createWallMaterial(0x213331),
    createWallMaterial(0x273c39),
  ];

  const roomMesh = new THREE.Mesh(roomGeometry, roomMaterials);
  roomMesh.scale.set(1, roomHeight / BASE_ROOM_HEIGHT, 1);
  hangarDeckEnvironmentGroup.add(roomMesh);

  const createHangarDoor = (themeOverrides = {}) => {
    const theme = { ...DEFAULT_DOOR_THEME, ...themeOverrides };
    const group = new THREE.Group();

    const doorWidth = BASE_DOOR_WIDTH;
    const doorHeight = BASE_DOOR_HEIGHT;
    const panelDepth = 0.2;
    const frameDepth = 0.42;
    const frameWidth = 0.48;
    const lintelHeight = 0.42;
    const thresholdHeight = 0.28;
    const seamGap = 0.22;

    const createPanelLabelTexture = (textLines) => {
      const canvasSize = 256;
      const canvas = document.createElement("canvas");
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#0b1214";
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 12;
      ctx.strokeRect(10, 10, canvasSize - 20, canvasSize - 20);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#cbd5f5";

      const lines = Array.isArray(textLines) ? textLines : [textLines];
      const totalLines = lines.length;
      const baseFontSize = 74;

      lines.forEach((line, index) => {
        const fontSize =
          totalLines > 1 ? baseFontSize - (totalLines - 1) * 8 : baseFontSize;
        ctx.font = `700 ${fontSize}px sans-serif`;
        const yOffset =
          canvasSize / 2 + (index - (totalLines - 1) / 2) * (fontSize + 4);
        ctx.fillText(line.toUpperCase(), canvasSize / 2, yOffset);
      });

      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      return texture;
    };

    const createGrungeTexture = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const imageData = ctx.createImageData(size, size);
      for (let i = 0; i < imageData.data.length; i += 4) {
        const value = 32 + Math.random() * 180;
        imageData.data[i] = value;
        imageData.data[i + 1] = value * 0.92;
        imageData.data[i + 2] = value * 0.85;
        imageData.data[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.fillRect(0, 0, size, size);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(4, 4);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      return texture;
    };

    const grungeTexture = createGrungeTexture();

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x131a1c),
      roughness: 0.52,
      metalness: 0.58,
      map: grungeTexture,
      roughnessMap: grungeTexture,
      metalnessMap: grungeTexture,
    });

    const topFrame = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth + frameWidth * 2.2, lintelHeight, frameDepth),
      frameMaterial
    );
    topFrame.position.y = doorHeight / 2 + lintelHeight / 2;
    group.add(topFrame);

    const bottomFrame = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth + frameWidth * 2.2, thresholdHeight, frameDepth),
      frameMaterial
    );
    bottomFrame.position.y = -doorHeight / 2 - thresholdHeight / 2 + 0.12;
    group.add(bottomFrame);

    const sideFrameGeometry = new THREE.BoxGeometry(frameWidth, doorHeight + lintelHeight * 0.35, frameDepth);
    const leftFrame = new THREE.Mesh(sideFrameGeometry, frameMaterial);
    leftFrame.position.x = -doorWidth / 2 - frameWidth / 2;
    group.add(leftFrame);

    const rightFrame = leftFrame.clone();
    rightFrame.position.x = doorWidth / 2 + frameWidth / 2;
    group.add(rightFrame);

    const trimMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x7f1d1d),
      metalness: 0.42,
      roughness: 0.36,
      emissive: new THREE.Color(0x1f0303),
      emissiveIntensity: 0.32,
    });

    const trimWidth = 0.22;
    const trimDepth = 0.12;
    const verticalTrimGeometry = new THREE.BoxGeometry(trimWidth, doorHeight * 0.92, trimDepth);
    const leftTrim = new THREE.Mesh(verticalTrimGeometry, trimMaterial);
    leftTrim.position.set(-doorWidth / 2 + trimWidth / 2 + 0.08, 0, panelDepth / 2 + trimDepth / 2);
    group.add(leftTrim);

    const rightTrim = leftTrim.clone();
    rightTrim.position.x *= -1;
    group.add(rightTrim);

    const horizontalTrimGeometry = new THREE.BoxGeometry(doorWidth * 0.9, trimWidth, trimDepth);
    const topTrim = new THREE.Mesh(horizontalTrimGeometry, trimMaterial);
    topTrim.position.set(0, doorHeight / 2 - trimWidth / 2 - 0.12, panelDepth / 2 + trimDepth / 2);
    group.add(topTrim);

    const bottomTrim = topTrim.clone();
    bottomTrim.position.y = -doorHeight / 2 + trimWidth / 2 + 0.18;
    group.add(bottomTrim);

    const panelMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x202b2b),
      roughness: 0.48,
      metalness: 0.62,
      map: grungeTexture,
      roughnessMap: grungeTexture,
      metalnessMap: grungeTexture,
      normalScale: new THREE.Vector2(0.3, 0.3),
      emissive: new THREE.Color(0x050d0e),
      emissiveIntensity: 0.4,
    });

    const panelWidth = (doorWidth - seamGap) / 2;
    const windowWidth = panelWidth * 0.36;
    const windowHeight = doorHeight * 0.22;
    const windowDepth = 0.16;
    const windowY = doorHeight * 0.22;
    const windowOpeningWidth = windowWidth * 0.92;
    const windowOpeningHeight = windowHeight * 0.88;
    const windowOffsetWithinPanel = panelWidth * 0.25 + seamGap / 2;

    const createPanel = (direction = 1) => {
      const shape = new THREE.Shape();
      const halfWidth = panelWidth / 2;
      const halfHeight = doorHeight / 2;

      shape.moveTo(-halfWidth, -halfHeight);
      shape.lineTo(halfWidth, -halfHeight);
      shape.lineTo(halfWidth, halfHeight);
      shape.lineTo(-halfWidth, halfHeight);
      shape.lineTo(-halfWidth, -halfHeight);

      const windowCenterX = windowOffsetWithinPanel * direction;
      const windowHalfWidth = windowOpeningWidth / 2;
      const windowHalfHeight = windowOpeningHeight / 2;

      const windowPath = new THREE.Path();
      windowPath.moveTo(
        windowCenterX - windowHalfWidth,
        windowY - windowHalfHeight
      );
      windowPath.lineTo(
        windowCenterX - windowHalfWidth,
        windowY + windowHalfHeight
      );
      windowPath.lineTo(
        windowCenterX + windowHalfWidth,
        windowY + windowHalfHeight
      );
      windowPath.lineTo(
        windowCenterX + windowHalfWidth,
        windowY - windowHalfHeight
      );
      windowPath.lineTo(
        windowCenterX - windowHalfWidth,
        windowY - windowHalfHeight
      );

      shape.holes.push(windowPath);

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: panelDepth,
        bevelEnabled: false,
      });
      geometry.translate(0, 0, -panelDepth / 2);

      return new THREE.Mesh(geometry, panelMaterial);
    };

    const leftPanel = createPanel(1);
    leftPanel.position.x = -(panelWidth / 2 + seamGap / 2);
    group.add(leftPanel);

    const rightPanel = createPanel(-1);
    rightPanel.position.x = panelWidth / 2 + seamGap / 2;
    group.add(rightPanel);

    const seamMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x111a1b),
      roughness: 0.38,
      metalness: 0.52,
      map: grungeTexture,
      roughnessMap: grungeTexture,
      metalnessMap: grungeTexture,
    });
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(seamGap * 0.35, doorHeight, panelDepth * 0.6),
      seamMaterial
    );
    group.add(seam);

    const trimAccentMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.accentColor),
      metalness: 0.4,
      roughness: 0.38,
      emissive: new THREE.Color(theme.accentEmissiveColor),
      emissiveIntensity: 0.28,
    });

    const accentPlateGeometry = new THREE.BoxGeometry(panelWidth * 0.9, 0.24, 0.1);
    const topAccentPlate = new THREE.Mesh(accentPlateGeometry, trimAccentMaterial);
    topAccentPlate.position.set(0, doorHeight * 0.28, panelDepth / 2 + 0.05);
    group.add(topAccentPlate);

    const midAccentPlate = topAccentPlate.clone();
    midAccentPlate.position.y = 0;
    midAccentPlate.scale.set(1.04, 0.9, 1);
    group.add(midAccentPlate);

    const lowerAccentPlate = topAccentPlate.clone();
    lowerAccentPlate.position.y = -doorHeight * 0.28;
    group.add(lowerAccentPlate);

    const seamGlowMaterial = new THREE.MeshBasicMaterial({
      color: theme.seamGlowColor,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const seamGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(seamGap * 0.48, doorHeight * 0.82),
      seamGlowMaterial
    );
    seamGlow.position.z = panelDepth / 2 + 0.06;
    group.add(seamGlow);

    const indicatorGlowGeometry = new THREE.PlaneGeometry(panelWidth * 0.82, 0.16);
    const topPanelGlow = new THREE.Mesh(indicatorGlowGeometry, seamGlowMaterial);
    topPanelGlow.position.set(0, doorHeight * 0.44, panelDepth / 2 + 0.05);
    group.add(topPanelGlow);

    const bottomPanelGlow = topPanelGlow.clone();
    bottomPanelGlow.position.y = -doorHeight * 0.44;
    group.add(bottomPanelGlow);

    const doorLight = new THREE.PointLight(theme.doorLightColor, 0.55, 9, 2);
    doorLight.position.set(0, doorHeight / 2 - 0.2, 0.32);
    group.add(doorLight);

    const overheadBeacon = new THREE.PointLight(
      theme.overheadLightColor ?? theme.doorLightColor,
      0.4,
      8,
      2
    );
    overheadBeacon.position.set(0, doorHeight / 2 + lintelHeight / 2, 0.22);
    group.add(overheadBeacon);

    const windowFrameMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1c2527),
      metalness: 0.6,
      roughness: 0.32,
      map: grungeTexture,
    });

    const windowMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xb7e3ff),
      emissive: new THREE.Color(0x9bdcfb),
      emissiveIntensity: 0.95,
      transparent: true,
      opacity: 0.78,
      roughness: 0.08,
      metalness: 0.02,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const createWindowFrameGeometry = () => {
      const outerWidth = windowWidth * 1.12;
      const outerHeight = windowHeight * 1.12;
      const innerWidth = windowOpeningWidth * 1.02;
      const innerHeight = windowOpeningHeight * 1.02;

      const shape = new THREE.Shape();
      shape.moveTo(-outerWidth / 2, -outerHeight / 2);
      shape.lineTo(outerWidth / 2, -outerHeight / 2);
      shape.lineTo(outerWidth / 2, outerHeight / 2);
      shape.lineTo(-outerWidth / 2, outerHeight / 2);
      shape.lineTo(-outerWidth / 2, -outerHeight / 2);

      const hole = new THREE.Path();
      hole.moveTo(-innerWidth / 2, -innerHeight / 2);
      hole.lineTo(-innerWidth / 2, innerHeight / 2);
      hole.lineTo(innerWidth / 2, innerHeight / 2);
      hole.lineTo(innerWidth / 2, -innerHeight / 2);
      hole.lineTo(-innerWidth / 2, -innerHeight / 2);

      shape.holes.push(hole);

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: windowDepth,
        bevelEnabled: false,
      });
      geometry.translate(0, 0, -windowDepth / 2);

      return geometry;
    };

    const windowFrameGeometry = createWindowFrameGeometry();
    const windowGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const createWindow = (centerX) => {
      const frontFrame = new THREE.Mesh(
        windowFrameGeometry,
        windowFrameMaterial
      );
      frontFrame.position.set(
        centerX,
        windowY,
        panelDepth / 2 - windowDepth / 2 + 0.01
      );
      group.add(frontFrame);

      const rearFrame = frontFrame.clone();
      rearFrame.position.z = -panelDepth / 2 + windowDepth / 2 - 0.01;
      group.add(rearFrame);

      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(
          windowOpeningWidth * 0.96,
          windowOpeningHeight * 0.96
        ),
        windowMaterial
      );
      glass.position.set(centerX, windowY, 0);
      glass.renderOrder = 2;
      group.add(glass);

      const frontGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(
          windowOpeningWidth * 0.76,
          windowOpeningHeight * 0.76
        ),
        windowGlowMaterial
      );
      frontGlow.position.set(centerX, windowY, panelDepth / 2 - 0.02);
      group.add(frontGlow);

      const rearGlow = frontGlow.clone();
      rearGlow.position.z = -panelDepth / 2 + 0.02;
      group.add(rearGlow);

      const exteriorLight = new THREE.PointLight(0x9bdcfb, 0.6, 6, 2);
      exteriorLight.position.set(centerX, windowY, 0.4);
      group.add(exteriorLight);

      const interiorLight = exteriorLight.clone();
      interiorLight.position.z = -0.4;
      group.add(interiorLight);
    };

    createWindow(-panelWidth * 0.25);
    createWindow(panelWidth * 0.25);

    const ventMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x111a1a),
      metalness: 0.4,
      roughness: 0.55,
      map: grungeTexture,
    });

    const ventWidth = panelWidth * 0.42;
    const ventHeight = doorHeight * 0.22;
    const ventDepth = 0.14;

    const createVent = (centerX) => {
      const vent = new THREE.Mesh(
        new THREE.BoxGeometry(ventWidth, ventHeight, ventDepth),
        ventMaterial
      );
      vent.position.set(centerX, -doorHeight * 0.32, panelDepth / 2 + ventDepth / 2);
      group.add(vent);

      const slatMaterial = new THREE.MeshBasicMaterial({
        color: 0x2d3a3a,
        side: THREE.DoubleSide,
      });
      const slatGeometry = new THREE.PlaneGeometry(ventWidth * 0.92, 0.04);
      const slatCount = 5;
      for (let i = 0; i < slatCount; i += 1) {
        const slat = new THREE.Mesh(slatGeometry, slatMaterial);
        slat.position.set(0, ventHeight * 0.4 - (i * ventHeight) / (slatCount - 1), ventDepth / 2 + 0.01);
        vent.add(slat);
      }
    };

    createVent(-panelWidth * 0.25);
    createVent(panelWidth * 0.25);

    const emblemMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.emblemColor),
      metalness: 0.45,
      roughness: 0.35,
      emissive: new THREE.Color(theme.emblemEmissiveColor),
      emissiveIntensity: 0.25,
    });

    const emblemGeometry = new THREE.CircleGeometry(panelWidth * 0.16, 48);
    const leftEmblem = new THREE.Mesh(emblemGeometry, emblemMaterial);
    leftEmblem.position.set(-panelWidth * 0.25, -doorHeight * 0.02, panelDepth / 2 + 0.045);
    group.add(leftEmblem);

    const rightEmblem = leftEmblem.clone();
    rightEmblem.position.x *= -1;
    group.add(rightEmblem);

    const boltMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0e1516),
      metalness: 0.6,
      roughness: 0.3,
    });

    const boltGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12);
    const boltPositions = [];
    const boltOffsetX = doorWidth / 2 + frameWidth * 0.25;
    const boltOffsetY = doorHeight / 2 - 0.35;
    const boltSpacingY = doorHeight / 3;
    for (let i = -1; i <= 1; i += 1) {
      boltPositions.push([-boltOffsetX, boltOffsetY - boltSpacingY * i]);
      boltPositions.push([boltOffsetX, boltOffsetY - boltSpacingY * i]);
    }

    boltPositions.forEach(([x, y]) => {
      const bolt = new THREE.Mesh(boltGeometry, boltMaterial);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(x, y, frameDepth / 2 + 0.02);
      group.add(bolt);
    });

    const controlPanelMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x111b1f),
      roughness: 0.42,
      metalness: 0.48,
      emissive: new THREE.Color(0x0f172a),
      emissiveIntensity: 0.45,
    });

    const controlPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.4, 0.18),
      controlPanelMaterial
    );
    controlPanel.position.set(doorWidth / 2 + frameWidth * 0.95, 0.1, 0.12);
    group.add(controlPanel);

    const controlPanelEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(controlPanel.geometry),
      new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.75,
      })
    );
    controlPanelEdges.scale.setScalar(1.01);
    controlPanel.add(controlPanelEdges);

    const controlPanelGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.74, 1.62),
      new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    controlPanelGlow.position.set(0, 0, 0.1);
    controlPanelGlow.renderOrder = 2;
    controlPanel.add(controlPanelGlow);

    const createLiftDisplayTexture = () => {
      const width = 320;
      const height = 480;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;

      if (!context) {
        return {
          texture,
          update: () => {},
        };
      }

      const fitText = (
        text,
        {
          weight = "400",
          baseSize = 28,
          minSize = 18,
          maxWidth = width - 64,
        } = {}
      ) => {
        const content = typeof text === "string" ? text : String(text || "");
        let fontSize = Number.isFinite(baseSize) ? baseSize : 28;
        const minimum = Math.max(10, minSize || 10);
        const resolvedMaxWidth = Number.isFinite(maxWidth)
          ? maxWidth
          : width - 64;

        const setFont = () => {
          context.font = `${weight} ${fontSize}px sans-serif`;
        };

        setFont();

        if (!content) {
          return fontSize;
        }

        while (
          fontSize > minimum &&
          context.measureText(content).width > resolvedMaxWidth
        ) {
          fontSize -= 2;
          setFont();
        }

        return fontSize;
      };

      const drawDescription = (text) => {
        if (!text) {
          return;
        }

        const lines = [];
        const words = String(text).split(/\s+/).filter(Boolean);
        const maxWidth = width - 72;
        let currentLine = "";

        context.font = "400 28px sans-serif";

        words.forEach((word) => {
          const nextLine = currentLine ? `${currentLine} ${word}` : word;
          if (context.measureText(nextLine).width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = nextLine;
          }
        });

        if (currentLine) {
          lines.push(currentLine);
        }

        const startY = height * 0.64;
        const renderedLines = lines.slice(0, 3);
        const lineFontSizes = renderedLines.map((line) => {
          let fontSize = 26;
          context.font = `400 ${fontSize}px sans-serif`;
          while (fontSize > 18 && context.measureText(line).width > maxWidth) {
            fontSize -= 1;
            context.font = `400 ${fontSize}px sans-serif`;
          }
          return fontSize;
        });

        const lineHeight = Math.max(...lineFontSizes, 24) + 6;

        context.save();
        context.fillStyle = "rgba(148, 163, 184, 0.92)";
        context.textAlign = "center";
        context.textBaseline = "top";

        renderedLines.forEach((line, index) => {
          const fontSize = lineFontSizes[index];
          context.font = `400 ${fontSize}px sans-serif`;
          context.fillText(line, width / 2, startY + index * lineHeight);
        });

        context.restore();
      };

      const update = ({ current, next, busy }) => {
        const gradient = context.createLinearGradient(0, 0, width, height);
        if (busy) {
          gradient.addColorStop(0, "#1f2937");
          gradient.addColorStop(1, "#111827");
        } else {
          gradient.addColorStop(0, "#0e1b2b");
          gradient.addColorStop(1, "#0b1220");
        }

        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);

        context.fillStyle = busy
          ? "rgba(249, 115, 22, 0.12)"
          : "rgba(34, 197, 94, 0.12)";
        context.fillRect(12, 12, width - 24, height - 24);

        const title = (current?.title || current?.id || "Unknown Deck").toUpperCase();
        const status = busy ? "TRANSIT" : "STATIONED";
        const nextTitle = next
          ? `NEXT: ${(next.title || next.id || "...").toUpperCase()}`
          : "CYCLE COMPLETE";

        context.textAlign = "center";
        context.textBaseline = "middle";

        const statusFontSize = fitText(status, {
          weight: "600",
          baseSize: 36,
          minSize: 24,
        });
        context.fillStyle = busy ? "#f97316" : "#22c55e";
        context.font = `600 ${statusFontSize}px sans-serif`;
        context.fillText(status, width / 2, height * 0.18);

        const titleFontSize = fitText(title, {
          weight: "700",
          baseSize: 60,
          minSize: 34,
        });
        context.fillStyle = "#e2e8f0";
        context.font = `700 ${titleFontSize}px sans-serif`;
        context.fillText(title, width / 2, height * 0.36);

        const nextFontSize = fitText(nextTitle, {
          weight: "500",
          baseSize: 30,
          minSize: 20,
          maxWidth: width - 72,
        });
        context.font = `500 ${nextFontSize}px sans-serif`;
        context.fillStyle = busy ? "#fbbf24" : "#38bdf8";
        context.fillText(nextTitle, width / 2, height * 0.52);

        drawDescription(current?.description ?? "");

        texture.needsUpdate = true;
      };

      return { texture, update };
    };

    const { texture: liftDisplayTexture, update: updateLiftDisplayTexture } =
      createLiftDisplayTexture();

    const controlScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.54),
      new THREE.MeshBasicMaterial({
        map: liftDisplayTexture,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
      })
    );
    controlScreen.position.set(0, 0.3, 0.11);
    controlPanel.add(controlScreen);

    const liftControlHitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.94),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    liftControlHitArea.position.set(0, 0.1, 0.115);
    liftControlHitArea.userData.isLiftControl = true;
    controlPanel.add(liftControlHitArea);

    const panelLight = new THREE.PointLight(
      0x38bdf8,
      0.85,
      5.5 * ROOM_SCALE_FACTOR,
      1.6
    );
    panelLight.position.set(
      controlPanel.position.x,
      controlPanel.position.y + 0.3,
      0.42
    );
    group.add(panelLight);

    const liftPanelGroup = new THREE.Group();
    liftPanelGroup.position.set(
      -doorWidth / 2 - frameWidth * 0.82,
      -0.18,
      0.14
    );
    group.add(liftPanelGroup);

    const liftPanelBaseMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0f172a),
      roughness: 0.54,
      metalness: 0.46,
      emissive: new THREE.Color(0x0b1120),
      emissiveIntensity: 0.35,
    });

    const liftPanelBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 1.12, 0.16),
      liftPanelBaseMaterial
    );
    liftPanelBase.castShadow = true;
    liftPanelBase.receiveShadow = true;
    liftPanelGroup.add(liftPanelBase);

    const liftPanelEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(liftPanelBase.geometry),
      new THREE.LineBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.7,
      })
    );
    liftPanelEdges.scale.setScalar(1.01);
    liftPanelBase.add(liftPanelEdges);

    const liftPanelInset = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.94, 0.04),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x17223a),
        roughness: 0.42,
        metalness: 0.58,
        emissive: new THREE.Color(0x0e1d37),
        emissiveIntensity: 0.55,
      })
    );
    liftPanelInset.position.set(0, 0, 0.06);
    liftPanelGroup.add(liftPanelInset);

    const liftPanelLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.32),
      new THREE.MeshBasicMaterial({
        map: createPanelLabelTexture(["LIFT", "DOOR"]),
        transparent: true,
        side: THREE.DoubleSide,
      })
    );
    liftPanelLabel.position.set(0, 0.28, 0.095);
    liftPanelGroup.add(liftPanelLabel);

    const liftToggleHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.05, 24),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x1f2937),
        roughness: 0.45,
        metalness: 0.75,
      })
    );
    liftToggleHousing.rotation.x = Math.PI / 2;
    liftToggleHousing.position.set(0, -0.12, 0.08);
    liftPanelGroup.add(liftToggleHousing);

    const liftToggleSwitch = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.16, 0.02),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x38bdf8),
        emissive: new THREE.Color(0x0ea5e9),
        emissiveIntensity: 0.85,
      })
    );
    liftToggleSwitch.position.set(0, -0.08, 0.14);
    liftToggleSwitch.rotation.x = THREE.MathUtils.degToRad(-18);
    liftPanelGroup.add(liftToggleSwitch);

    const liftStatusIndicator = new THREE.Mesh(
      new THREE.CircleGeometry(0.055, 24),
      new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        opacity: 0.95,
        transparent: true,
      })
    );
    liftStatusIndicator.position.set(0.1, 0.08, 0.1);
    liftPanelGroup.add(liftStatusIndicator);

    const liftIndicatorLight = new THREE.PointLight(
      0x22c55e,
      0.6,
      3.6 * ROOM_SCALE_FACTOR,
      1.6
    );
    liftIndicatorLight.position.set(0.1, 0.08, 0.16);
    liftPanelGroup.add(liftIndicatorLight);

    const liftPanelGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 1.36),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    liftPanelGlow.position.set(0, 0, 0.1);
    liftPanelGlow.renderOrder = 2;
    liftPanelGroup.add(liftPanelGlow);

    const liftInstructionPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.12),
      new THREE.MeshBasicMaterial({
        map: createPanelLabelTexture(["ACCESS"]),
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      })
    );
    liftInstructionPlate.position.set(-0.08, -0.02, 0.094);
    liftPanelGroup.add(liftInstructionPlate);

    const applyLiftIndicatorState = (busy) => {
      const indicatorMaterial = liftStatusIndicator.material;
      const indicatorColor = busy ? 0xf97316 : 0x22c55e;
      if (indicatorMaterial?.color) {
        indicatorMaterial.color.setHex(indicatorColor);
      }

      liftIndicatorLight.color.setHex(indicatorColor);
      liftIndicatorLight.intensity = busy ? 0.5 : 0.85;
    };

    const applyLiftUiState = ({ current, next, busy } = {}) => {
      const isBusy = Boolean(busy);
      applyLiftIndicatorState(isBusy);
      updateLiftDisplayTexture({ current, next, busy: isBusy });
    };

    applyLiftUiState({ busy: false });

    group.userData.liftUi = {
      control: liftControlHitArea,
      updateState: applyLiftUiState,
    };

    group.userData.height = doorHeight;
    group.userData.width = doorWidth;
    group.userData.baseDimensions = { height: doorHeight, width: doorWidth };

    return group;
  };

  const hangarDoor = createHangarDoor(SHARED_ROOM_DOOR_THEME);
  hangarDoor.position.set(
    0,
    -roomHeight / 2 + (hangarDoor.userData.height ?? 0) / 2,
    roomDepth / 2 - 0.32 * ROOM_SCALE_FACTOR
  );
  hangarDeckEnvironmentGroup.add(hangarDoor);
  hangarDoor.userData.floorOffset = 0;
  registerLiftDoor(hangarDoor);

  const createComputerSetup = () => {
    const group = new THREE.Group();

    let collidersChangedCallback = null;

    const notifyCollidersChanged = () => {
      if (typeof collidersChangedCallback === "function") {
        collidersChangedCallback();
      }
    };

    group.userData.setCollidersChangedCallback = (callback) => {
      collidersChangedCallback = callback;
    };

    group.userData.notifyCollidersChanged = notifyCollidersChanged;

    let quickAccessTextureSize = { width: 1024, height: 768 };
    let quickAccessZones = [];

    const deskHeight = 0.78 * 1.3;
    const deskTopThickness = 0.08;
    const deskWidth = 3.2;
    const deskDepth = 1.4;

    const deskMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.7,
      metalness: 0.15,
    });

    const deskTop = new THREE.Mesh(
      new THREE.BoxGeometry(deskWidth, deskTopThickness, deskDepth),
      deskMaterial
    );
    deskTop.position.set(0, deskHeight + deskTopThickness / 2, 0);
    group.add(deskTop);

    const deskCollisionVolume = new THREE.Mesh(
      new THREE.BoxGeometry(
        deskWidth,
        deskHeight + deskTopThickness,
        deskDepth
      ),
      deskMaterial
    );
    deskCollisionVolume.visible = false;
    deskCollisionVolume.position.set(
      0,
      (deskHeight + deskTopThickness) / 2,
      0
    );
    group.add(deskCollisionVolume);

    const legGeometry = new THREE.BoxGeometry(0.14, deskHeight, 0.14);
    const legPositions = [
      [-deskWidth / 2 + 0.22, deskHeight / 2, -deskDepth / 2 + 0.22],
      [deskWidth / 2 - 0.22, deskHeight / 2, -deskDepth / 2 + 0.22],
      [-deskWidth / 2 + 0.22, deskHeight / 2, deskDepth / 2 - 0.22],
      [deskWidth / 2 - 0.22, deskHeight / 2, deskDepth / 2 - 0.22],
    ];

    legPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeometry, deskMaterial);
      leg.position.set(x, y, z);
      group.add(leg);
    });

    const monitorGroup = new THREE.Group();
    monitorGroup.position.set(0.08, deskHeight + deskTopThickness + 0.02, -0.12);

    const monitorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.35,
      roughness: 0.35,
    });

    const createMonitorDisplayTexture = () => {
      const width = 1024;
      const height = 768;

      quickAccessTextureSize = { width, height };

      const quickAccessOptionDefinitions = [
        {
          id: "news",
          title: "NEWS",
          description: "Latest mission intelligence",
        },
        {
          id: "weather",
          title: "WEATHER",
          description: "Atmospheric reports",
        },
        {
          id: "missions",
          title: "MISSIONS",
          description: "Active assignments",
        },
      ];

      const bezelInset = 48;
      const optionHeight = 132;
      const optionSpacing = 28;

      const computeQuickAccessZones = () => {
        const optionX = bezelInset + 40;
        const optionWidth = width - optionX * 2;
        let optionY = bezelInset + 184;

        return quickAccessOptionDefinitions.map((definition) => {
          const zone = {
            id: definition.id,
            title: definition.title,
            description: definition.description,
            minX: optionX,
            maxX: optionX + optionWidth,
            minY: optionY,
            maxY: optionY + optionHeight,
          };

          optionY += optionHeight + optionSpacing;
          return zone;
        });
      };

      quickAccessZones = computeQuickAccessZones();

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        const fallbackTexture = createQuickAccessFallbackTexture();
        return {
          texture: fallbackTexture,
          setHoveredZone: () => {},
          update: () => {},
        };
      }

      const drawRoundedRect = (x, y, rectWidth, rectHeight, radius) => {
        const clampedRadius = Math.min(radius, rectWidth / 2, rectHeight / 2);
        context.beginPath();
        context.moveTo(x + clampedRadius, y);
        context.lineTo(x + rectWidth - clampedRadius, y);
        context.quadraticCurveTo(
          x + rectWidth,
          y,
          x + rectWidth,
          y + clampedRadius
        );
        context.lineTo(x + rectWidth, y + rectHeight - clampedRadius);
        context.quadraticCurveTo(
          x + rectWidth,
          y + rectHeight,
          x + rectWidth - clampedRadius,
          y + rectHeight
        );
        context.lineTo(x + clampedRadius, y + rectHeight);
        context.quadraticCurveTo(
          x,
          y + rectHeight,
          x,
          y + rectHeight - clampedRadius
        );
        context.lineTo(x, y + clampedRadius);
        context.quadraticCurveTo(x, y, x + clampedRadius, y);
        context.closePath();
      };

      try {
        const baseStartColor = { r: 15, g: 118, b: 210, a: 0.28 };
        const baseEndColor = { r: 56, g: 189, b: 248, a: 0.12 };
        const highlightStartColor = { r: 34, g: 197, b: 94, a: 0.85 };
        const highlightEndColor = { r: 14, g: 184, b: 166, a: 0.78 };
        const baseTitleColor = { r: 226, g: 232, b: 240, a: 1 };
        const highlightTitleColor = { r: 2, g: 44, b: 34, a: 1 };
        const baseDescriptionColor = { r: 148, g: 163, b: 184, a: 0.85 };
        const highlightDescriptionColor = { r: 12, g: 84, b: 73, a: 0.88 };

        const lerp = (start, end, t) => start + (end - start) * t;
        const clamp01 = (value) => Math.min(Math.max(value, 0), 1);
        const mixColor = (startColor, endColor, t) => ({
          r: lerp(startColor.r, endColor.r, t),
          g: lerp(startColor.g, endColor.g, t),
          b: lerp(startColor.b, endColor.b, t),
          a: lerp(startColor.a, endColor.a, t),
        });
        const toRgba = ({ r, g, b, a }) =>
          `rgba(${Math.round(Math.min(Math.max(r, 0), 255))}, ${Math.round(
            Math.min(Math.max(g, 0), 255)
          )}, ${Math.round(Math.min(Math.max(b, 0), 255))}, ${clamp01(a).toFixed(
            3
          )})`;

        const innerInset = bezelInset + 24;
        const innerWidth = width - innerInset * 2;
        const innerHeight = height - innerInset * 2;

        const zoneStates = quickAccessZones.map((zone, index) => ({
          id: zone.id,
          progress: 0,
          target: 0,
          pulseOffset: index * 0.75,
        }));
        const zoneStateMap = new Map(zoneStates.map((state) => [state.id, state]));

        let hoveredZoneId = null;
        let needsRedraw = true;
        let lastRenderedElapsedTime = 0;

        const renderMatrixOverlay = () => {
          context.save();
          drawRoundedRect(innerInset, innerInset, innerWidth, innerHeight, 28);
          context.clip();

          const overlayGradient = context.createLinearGradient(
            innerInset,
            innerInset,
            innerInset,
            innerInset + innerHeight
          );
          overlayGradient.addColorStop(0, "rgba(45, 212, 191, 0.14)");
          overlayGradient.addColorStop(0.45, "rgba(45, 212, 191, 0.06)");
          overlayGradient.addColorStop(1, "rgba(14, 116, 144, 0.12)");

          context.fillStyle = overlayGradient;
          context.fillRect(innerInset, innerInset, innerWidth, innerHeight);

          context.fillStyle = "rgba(2, 6, 23, 0.4)";
          context.fillRect(innerInset, innerInset, innerWidth, innerHeight);
          context.restore();
        };

        const render = (elapsedTime = 0) => {
          context.clearRect(0, 0, width, height);

          const backgroundGradient = context.createLinearGradient(0, 0, width, height);
          backgroundGradient.addColorStop(0, "#071122");
          backgroundGradient.addColorStop(1, "#041320");

          context.fillStyle = backgroundGradient;
          context.fillRect(0, 0, width, height);

          const vignetteGradient = context.createRadialGradient(
            width * 0.5,
            height * 0.45,
            Math.min(width, height) * 0.15,
            width * 0.5,
            height * 0.5,
            Math.max(width, height) * 0.75
          );
          vignetteGradient.addColorStop(0, "rgba(30, 41, 59, 0.9)");
          vignetteGradient.addColorStop(1, "rgba(2, 6, 14, 0.95)");

          context.fillStyle = vignetteGradient;
          context.fillRect(0, 0, width, height);

          drawRoundedRect(
            bezelInset,
            bezelInset,
            width - bezelInset * 2,
            height - bezelInset * 2,
            36
          );
          context.fillStyle = "rgba(14, 20, 34, 0.88)";
          context.fill();
          context.lineWidth = 3;
          context.strokeStyle = "rgba(148, 163, 184, 0.35)";
          context.stroke();

          context.save();
          context.shadowColor = "rgba(56, 189, 248, 0.35)";
          context.shadowBlur = 26;
          context.shadowOffsetX = 0;
          context.shadowOffsetY = 0;
          context.fillStyle = "rgba(56, 189, 248, 0.08)";
          drawRoundedRect(innerInset, innerInset, innerWidth, innerHeight, 28);
          context.fill();
          context.restore();

          renderMatrixOverlay();

          context.save();
          context.strokeStyle = "rgba(56, 189, 248, 0.18)";
          context.lineWidth = 2;
          context.setLineDash([12, 10]);
          context.beginPath();
          context.moveTo(bezelInset + 32, bezelInset + 160);
          context.lineTo(width - (bezelInset + 32), bezelInset + 160);
          context.stroke();
          context.restore();

          context.fillStyle = "rgba(148, 163, 184, 0.7)";
          context.font = "600 28px 'Segoe UI', 'Inter', sans-serif";
          context.textBaseline = "middle";
          context.fillText("TERMINAL", bezelInset + 36, bezelInset + 48);

          context.fillStyle = "#38bdf8";
          context.font = "700 70px 'Segoe UI', 'Inter', sans-serif";
          context.fillText("Quick Access", bezelInset + 36, bezelInset + 132);

          const optionZones = quickAccessZones;

          optionZones.forEach((zone) => {
            const optionX = zone.minX;
            const optionY = zone.minY;
            const optionWidth = zone.maxX - zone.minX;
            const zoneState = zoneStateMap.get(zone.id);
            const progress = zoneState ? zoneState.progress : 0;
            const pulse = 0.6 + 0.4 * Math.sin(elapsedTime * 3 + (zoneState?.pulseOffset ?? 0));
            const highlight = progress * pulse;

            const gradientStart = mixColor(baseStartColor, highlightStartColor, progress);
            const gradientEnd = mixColor(baseEndColor, highlightEndColor, progress);

            const optionGradient = context.createLinearGradient(
              optionX,
              optionY,
              optionX + optionWidth,
              optionY + optionHeight
            );
            optionGradient.addColorStop(0, toRgba(gradientStart));
            optionGradient.addColorStop(1, toRgba(gradientEnd));

            context.save();
            context.shadowColor = `rgba(34, 197, 94, ${(0.25 + highlight * 0.45).toFixed(3)})`;
            context.shadowBlur = 24 * highlight;
            context.shadowOffsetX = 0;
            context.shadowOffsetY = 0;

            drawRoundedRect(optionX, optionY, optionWidth, optionHeight, 32);
            context.fillStyle = optionGradient;
            context.fill();

            context.shadowColor = "transparent";
            context.lineWidth = 3 + progress;
            context.strokeStyle = `rgba(148, 163, 184, ${(0.35 + progress * 0.35).toFixed(3)})`;
            context.stroke();

            if (progress > 0.01) {
              const innerGlow = context.createLinearGradient(
                optionX,
                optionY,
                optionX + optionWidth,
                optionY + optionHeight
              );
              innerGlow.addColorStop(0, `rgba(16, 185, 129, ${(0.12 + highlight * 0.2).toFixed(3)})`);
              innerGlow.addColorStop(1, `rgba(6, 182, 212, ${(0.08 + highlight * 0.15).toFixed(3)})`);
              drawRoundedRect(
                optionX + 6,
                optionY + 6,
                optionWidth - 12,
                optionHeight - 12,
                28
              );
              context.strokeStyle = `rgba(94, 234, 212, ${(0.18 + highlight * 0.22).toFixed(3)})`;
              context.lineWidth = 2;
              context.stroke();
            }

            context.restore();

            const titleColor = mixColor(baseTitleColor, highlightTitleColor, progress);
            context.fillStyle = toRgba(titleColor);
            context.font = "700 64px 'Segoe UI', 'Inter', sans-serif";
            context.fillText(zone.title, optionX + 48, optionY + 54);

            const descriptionColor = mixColor(
              baseDescriptionColor,
              highlightDescriptionColor,
              progress
            );
            context.fillStyle = toRgba(descriptionColor);
            context.font = "500 34px 'Segoe UI', 'Inter', sans-serif";
            context.fillText(zone.description, optionX + 48, optionY + 94);
          });
        };

        render();
        needsRedraw = false;

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        return {
          texture,
          setHoveredZone: (zoneId) => {
            if (hoveredZoneId === zoneId) {
              return;
            }

            hoveredZoneId = zoneId ?? null;

            zoneStates.forEach((state) => {
              state.target = state.id === hoveredZoneId ? 1 : 0;
            });
            needsRedraw = true;
          },
          update: (delta = 0, elapsedTime = 0) => {
            zoneStates.forEach((state) => {
              const previousProgress = state.progress;
              if (Math.abs(state.target - state.progress) > 0.001) {
                const step = clamp01(delta * 8);
                state.progress = lerp(state.progress, state.target, step);
              }

              if (Math.abs(previousProgress - state.progress) > 0.001) {
                needsRedraw = true;
              }
            });

            if (!needsRedraw && Math.abs(elapsedTime - lastRenderedElapsedTime) >= 1 / 30) {
              needsRedraw = true;
            }

            if (!needsRedraw) {
              return;
            }

            render(elapsedTime);
            texture.needsUpdate = true;
            needsRedraw = false;
            lastRenderedElapsedTime = elapsedTime;
          },
        };
      } catch (error) {
        console.warn("Falling back to SVG quick access texture", error);
        const fallbackTexture = createQuickAccessFallbackTexture();
        return {
          texture: fallbackTexture,
          setHoveredZone: () => {},
          update: () => {},
        };
      }
    };

    const screenSize = 0.98 * 2; // Double the diagonal of the square screen
    const screenHeight = screenSize;
    const screenWidth = screenSize;
    const screenFillScale = 1.08;
    const bezelPadding = 0.02;
    const bezelWidth = screenWidth + bezelPadding * 2;
    const bezelHeight = screenHeight + bezelPadding * 2;
    const bezelDepth = 0.04;
    const housingBorder = 0.05;
    const housingWidth = bezelWidth + housingBorder * 2;
    const housingHeight = bezelHeight + housingBorder * 2;
    const housingDepth = 0.12;
    const monitorStandNeckHeight = 0.1;
    const monitorStandNeckPositionY = 0.44;
    const monitorAttachmentHeight =
      monitorStandNeckPositionY + monitorStandNeckHeight / 2;
    const monitorCenterY = monitorAttachmentHeight + housingHeight / 2;
    const monitorHousing = new THREE.Mesh(
      new THREE.BoxGeometry(housingWidth, housingHeight, housingDepth),
      monitorMaterial
    );
    monitorHousing.position.y = monitorCenterY;
    monitorHousing.position.z = 0.12;
    monitorGroup.add(monitorHousing);

    const monitorBezel = new THREE.Mesh(
      new THREE.BoxGeometry(bezelWidth, bezelHeight, bezelDepth),
      new THREE.MeshStandardMaterial({
        color: 0x111c2b,
        metalness: 0.25,
        roughness: 0.45,
      })
    );
    monitorBezel.position.y = monitorCenterY;
    monitorBezel.position.z = 0.14;
    monitorGroup.add(monitorBezel);

    let pendingScreenAspectRatio;
    let applyMonitorAspectRatio;

    const monitorDisplay = createMonitorDisplayTexture();
    const screenTexture =
      monitorDisplay?.texture ??
      loadClampedTexture("../images/index/monitor2.png", (loadedTexture) => {
        const { image } = loadedTexture;
        if (image && image.width && image.height) {
          const aspectRatio = image.width / image.height;

          if (typeof applyMonitorAspectRatio === "function") {
            applyMonitorAspectRatio(aspectRatio);
          } else {
            pendingScreenAspectRatio = aspectRatio;
          }
        }
      });
    const monitorScreenMaterial = new THREE.MeshBasicMaterial({
      map: screenTexture,
      // Prevent tone mapping from dimming the UI colours rendered on the
      // monitor and ensure the texture isn't affected by surrounding lights.
      toneMapped: false,
    });

    const monitorScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(screenWidth, screenHeight),
      monitorScreenMaterial
    );
    monitorScreen.position.set(
      0,
      monitorCenterY,
      monitorHousing.position.z + housingDepth / 2 + 0.005
    );
    monitorScreen.scale.y = screenFillScale;
    monitorScreen.renderOrder = 1;
    monitorScreen.userData.getQuickAccessZones = () => quickAccessZones;
    monitorScreen.userData.getQuickAccessTextureSize = () =>
      quickAccessTextureSize;
    monitorScreen.userData.setHoveredZone = monitorDisplay?.setHoveredZone;
    monitorScreen.userData.updateDisplayTexture = monitorDisplay?.update;
    monitorGroup.add(monitorScreen);

    const originalScreenWidth = screenWidth;
    const originalBezelWidth = bezelWidth;
    const originalHousingWidth = housingWidth;
    const powerButtonEdgeOffset = 0.22;

    const updateMonitorLayout = (aspectRatio) => {
      if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
        return;
      }

      const adjustedScreenWidth = screenHeight * aspectRatio;
      const adjustedBezelWidth = adjustedScreenWidth + bezelPadding * 2;
      const adjustedHousingWidth = adjustedBezelWidth + housingBorder * 2;

      monitorScreen.scale.x =
        (adjustedScreenWidth / originalScreenWidth) * screenFillScale;
      monitorScreen.scale.y = screenFillScale;
      monitorBezel.scale.x = adjustedBezelWidth / originalBezelWidth;
      monitorHousing.scale.x = adjustedHousingWidth / originalHousingWidth;
      monitorPowerButton.position.x =
        adjustedHousingWidth / 2 - powerButtonEdgeOffset;

      notifyCollidersChanged();
    };

    const monitorStandColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.45, 24),
      new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        metalness: 0.4,
        roughness: 0.35,
      })
    );
    monitorStandColumn.position.set(0, 0.25, 0);
    monitorGroup.add(monitorStandColumn);

    const monitorStandNeck = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, monitorStandNeckHeight, 0.18),
      monitorMaterial
    );
    monitorStandNeck.position.set(0, monitorStandNeckPositionY, 0.09);
    monitorGroup.add(monitorStandNeck);

    const monitorBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.18, 0.02, 32),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.35,
        roughness: 0.4,
      })
    );
    monitorBase.position.set(0, 0.01, 0);
    monitorGroup.add(monitorBase);

    const monitorPowerButton = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 24),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    monitorPowerButton.position.set(
      housingWidth / 2 - powerButtonEdgeOffset,
      monitorCenterY - housingHeight / 2 + 0.2,
      monitorHousing.position.z + housingDepth / 2 - 0.02
    );
    monitorGroup.add(monitorPowerButton);

    applyMonitorAspectRatio = updateMonitorLayout;

    if (
      screenTexture.image &&
      screenTexture.image.width &&
      screenTexture.image.height
    ) {
      applyMonitorAspectRatio(
        screenTexture.image.width / screenTexture.image.height
      );
    } else if (pendingScreenAspectRatio) {
      applyMonitorAspectRatio(pendingScreenAspectRatio);
      pendingScreenAspectRatio = undefined;
    }

    group.add(monitorGroup);

    const keyboard = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.05, 0.4),
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        metalness: 0.2,
        roughness: 0.6,
      })
    );
    keyboard.position.set(-0.08, deskHeight + deskTopThickness + 0.04, 0.28);
    group.add(keyboard);

    const keyboardFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.27, 0.02, 0.42),
      new THREE.MeshStandardMaterial({
        color: 0x0b1220,
        roughness: 0.5,
        metalness: 0.25,
      })
    );
    keyboardFrame.position.set(-0.08, deskHeight + deskTopThickness + 0.05, 0.28);
    group.add(keyboardFrame);

    const mouse = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.06, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
    );
    mouse.position.set(0.95, deskHeight + deskTopThickness + 0.05, 0.3);
    mouse.rotation.y = Math.PI / 8;
    group.add(mouse);

    const mousePad = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.01, 0.38),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.75 })
    );
    mousePad.position.set(0.9, deskHeight + deskTopThickness + 0.035, 0.28);
    group.add(mousePad);

    const towerWidth = 0.5;
    const towerHeight = 0.82;
    const towerDepth = 0.56;
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(towerWidth, towerHeight, towerDepth),
      new THREE.MeshStandardMaterial({
        color: 0x0b1120,
        roughness: 0.5,
        metalness: 0.25,
      })
    );
    const towerX = -deskWidth / 2 + 0.45;
    const towerZ = 0.18;
    tower.position.set(towerX, towerHeight / 2, towerZ);
    group.add(tower);

    const frontPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(towerWidth - 0.08, towerHeight - 0.18),
      new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        emissive: new THREE.Color(0x1f2937),
        metalness: 0.1,
        roughness: 0.7,
        side: THREE.DoubleSide,
      })
    );
    frontPanel.position.set(
      towerX + 0.02,
      tower.position.y + 0.06,
      towerZ + towerDepth / 2 + 0.001
    );
    group.add(frontPanel);

    const ventGeometry = new THREE.BoxGeometry(towerWidth - 0.12, 0.02, 0.02);
    const ventMaterial = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.5,
      metalness: 0.2,
    });

    for (let i = 0; i < 5; i += 1) {
      const vent = new THREE.Mesh(ventGeometry, ventMaterial);
      vent.position.set(towerX + 0.02, 0.16 + i * 0.075, towerZ + 0.34);
      group.add(vent);
    }

    const powerLight = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    powerLight.position.set(
      towerX + 0.16,
      tower.position.y + 0.22,
      towerZ + towerDepth / 2 + 0.006
    );
    group.add(powerLight);

    const leftSpeaker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.14, 0.36, 32),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })
    );
    leftSpeaker.rotation.x = Math.PI / 2;
    leftSpeaker.position.set(-0.9, deskHeight + deskTopThickness + 0.18, -0.28);
    group.add(leftSpeaker);

    const rightSpeaker = leftSpeaker.clone();
    rightSpeaker.position.x = 1.1;
    group.add(rightSpeaker);

    const speakerGrillMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.15,
    });

    const speakerGrill = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 24),
      speakerGrillMaterial
    );
    speakerGrill.position.set(-0.9, deskHeight + deskTopThickness + 0.18, -0.1);
    group.add(speakerGrill);

    const speakerGrillRight = speakerGrill.clone();
    speakerGrillRight.position.x = 1.1;
    group.add(speakerGrillRight);

    group.userData.colliderDescriptors = [
      {
        object: deskCollisionVolume,
        padding: new THREE.Vector3(0.08, 0.05, 0.08),
      },
      {
        object: deskTop,
        padding: new THREE.Vector3(0.05, 0.3, 0.05),
      },
      {
        object: monitorGroup,
        padding: new THREE.Vector3(0.08, 0.2, 0.08),
      },
      {
        object: tower,
        padding: new THREE.Vector3(0.06, 0.1, 0.06),
      },
    ];

    group.userData.monitorScreen = monitorScreen;

    const computerSetupScale = (2.5 / 8) * 2;
    group.scale.setScalar(computerSetupScale);

    return group;
  };

  const createOperationsConcourseEnvironment = () => {
    const group = new THREE.Group();

    const deckWidth = roomWidth * 1.35;
    const deckDepth = roomDepth * 0.85;
    const deckThickness = 0.45;

    const floorBounds = createFloorBounds(deckWidth, deckDepth, {
      paddingX: 0.75,
      paddingZ: 0.75,
    });

    const deckMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0f1d33),
      roughness: 0.62,
      metalness: 0.22,
    });

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(deckWidth, deckThickness, deckDepth),
      deckMaterial
    );
    deck.position.y = roomFloorY - deckThickness / 2;
    group.add(deck);

    const catwalkWidth = deckWidth * 0.68;
    const catwalkDepth = deckDepth * 0.92;

    const catwalkMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1f3b5a),
      roughness: 0.45,
      metalness: 0.35,
    });

    const catwalk = new THREE.Mesh(
      new THREE.BoxGeometry(catwalkWidth, 0.12, catwalkDepth),
      catwalkMaterial
    );
    catwalk.position.y = roomFloorY + 0.18;
    group.add(catwalk);

    const railingMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x38bdf8),
      emissive: new THREE.Color(0x1d4ed8),
      emissiveIntensity: 0.6,
      roughness: 0.35,
      metalness: 0.25,
    });

    const railHeight = 1.1;
    const railThickness = 0.08;

    const createSideRail = (direction) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(railThickness, railHeight, catwalkDepth),
        railingMaterial
      );
      rail.position.set(
        (catwalkWidth / 2 - railThickness / 2) * direction,
        roomFloorY + 0.55,
        0
      );
      return rail;
    };

    const leftRail = createSideRail(1);
    group.add(leftRail);
    const rightRail = createSideRail(-1);
    group.add(rightRail);

    const frontRail = new THREE.Mesh(
      new THREE.BoxGeometry(catwalkWidth, railHeight, railThickness),
      railingMaterial
    );
    frontRail.position.set(
      0,
      roomFloorY + 0.55,
      catwalkDepth / 2 - railThickness / 2
    );
    group.add(frontRail);

    const rearRail = frontRail.clone();
    rearRail.position.z *= -1;
    group.add(rearRail);

    const holoBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.65, 0.4, 32),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x111f32),
        roughness: 0.35,
        metalness: 0.6,
      })
    );
    holoBase.position.set(0, roomFloorY + 0.32, -deckDepth * 0.15);
    group.add(holoBase);

    const holoEmitter = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 0.08, 32),
      new THREE.MeshBasicMaterial({
        color: 0x60a5fa,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      })
    );
    holoEmitter.position.set(0, roomFloorY + 0.58, -deckDepth * 0.15);
    group.add(holoEmitter);

    const holoColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.35, 1.4, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    holoColumn.position.set(0, roomFloorY + 1.25, -deckDepth * 0.15);
    group.add(holoColumn);

    const briefingLight = new THREE.PointLight(0x60a5fa, 1.1, deckDepth * 1.2, 2);
    briefingLight.position.set(0, roomFloorY + 2.2, -deckDepth * 0.18);
    group.add(briefingLight);

    const statusDisplay = new THREE.Mesh(
      new THREE.PlaneGeometry(catwalkWidth * 0.9, 1.8),
      new THREE.MeshBasicMaterial({
        color: 0x1d4ed8,
        transparent: true,
        opacity: 0.75,
      })
    );
    statusDisplay.position.set(0, roomFloorY + 1.6, -deckDepth / 2 + 0.05);
    group.add(statusDisplay);

    const statusGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(catwalkWidth * 0.95, 1.9),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    statusGlow.position.set(0, roomFloorY + 1.6, -deckDepth / 2 + 0.07);
    group.add(statusGlow);

    const liftDoor = createHangarDoor(SHARED_ROOM_DOOR_THEME);
    liftDoor.position.set(
      0,
      roomFloorY + (liftDoor.userData.height ?? 0) / 2,
      deckDepth / 2 - 0.32 * ROOM_SCALE_FACTOR
    );
    liftDoor.rotation.y = Math.PI;
    liftDoor.userData.floorOffset = 0;
    group.add(liftDoor);

    const exteriorExitDoor = createHangarDoor(SHARED_ROOM_DOOR_THEME);
    exteriorExitDoor.position.set(
      0,
      roomFloorY + (exteriorExitDoor.userData.height ?? 0) / 2,
      -deckDepth / 2 + 0.32 * ROOM_SCALE_FACTOR
    );
    exteriorExitDoor.userData.floorOffset = 0;
    group.add(exteriorExitDoor);

    const adjustableEntries = [
      { object: deck, offset: -deckThickness / 2 },
      { object: catwalk, offset: 0.18 },
      { object: leftRail, offset: 0.55 },
      { object: rightRail, offset: 0.55 },
      { object: frontRail, offset: 0.55 },
      { object: rearRail, offset: 0.55 },
      { object: holoBase, offset: 0.32 },
      { object: holoEmitter, offset: 0.58 },
      { object: holoColumn, offset: 1.25 },
      { object: statusDisplay, offset: 1.6 },
      { object: statusGlow, offset: 1.6 },
    ];

    const updateForRoomHeight = ({ roomFloorY }) => {
      adjustableEntries.forEach(({ object, offset }) => {
        if (object) {
          object.position.y = roomFloorY + offset;
        }
      });
      briefingLight.position.y = roomFloorY + 2.2;
    };

    const teleportOffset = new THREE.Vector3(0, 0, deckDepth / 2 - 1.8);

    return {
      group,
      liftDoor,
      liftDoors: [liftDoor, exteriorExitDoor],
      updateForRoomHeight,
      teleportOffset,
      bounds: floorBounds,
    };
  };

  const createEngineeringBayEnvironment = () => {
    const group = new THREE.Group();

    const bayWidth = roomWidth * 1.5;
    const bayDepth = roomDepth * 0.8;
    const floorThickness = 0.5;

    const floorBounds = createFloorBounds(bayWidth, bayDepth, {
      paddingX: 0.75,
      paddingZ: 0.75,
    });

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x101722),
      roughness: 0.7,
      metalness: 0.18,
    });

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(bayWidth, floorThickness, bayDepth),
      floorMaterial
    );
    floor.position.y = roomFloorY - floorThickness / 2;
    group.add(floor);

    const pitMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0f172a),
      roughness: 0.45,
      metalness: 0.55,
    });

    const pitWidth = bayWidth * 0.5;
    const pitDepth = bayDepth * 0.4;
    const maintenancePit = new THREE.Mesh(
      new THREE.BoxGeometry(pitWidth, 0.6, pitDepth),
      pitMaterial
    );
    maintenancePit.position.set(0, roomFloorY - 0.3, 0);
    group.add(maintenancePit);

    const catwalkMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1f2937),
      roughness: 0.5,
      metalness: 0.2,
    });

    const gantry = new THREE.Mesh(
      new THREE.BoxGeometry(bayWidth * 0.7, 0.12, 0.6),
      catwalkMaterial
    );
    gantry.position.set(0, roomFloorY + 0.18, 0);
    group.add(gantry);

    const beamMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x4b5563),
      roughness: 0.38,
      metalness: 0.62,
    });

    const createSupportBeam = (x, z) => {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 2.6, 0.18),
        beamMaterial
      );
      beam.position.set(x, roomFloorY + 1.3, z);
      return beam;
    };

    const beamOffsetX = bayWidth / 2 - 0.4;
    const beamOffsetZ = bayDepth / 2 - 0.4;
    const beams = [
      createSupportBeam(beamOffsetX, beamOffsetZ),
      createSupportBeam(-beamOffsetX, beamOffsetZ),
      createSupportBeam(beamOffsetX, -beamOffsetZ),
      createSupportBeam(-beamOffsetX, -beamOffsetZ),
    ];
    beams.forEach((beam) => group.add(beam));

    const pipeMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x374151),
      metalness: 0.7,
      roughness: 0.28,
    });

    const coolantPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, bayWidth * 0.9, 24),
      pipeMaterial
    );
    coolantPipe.rotation.z = Math.PI / 2;
    coolantPipe.position.set(0, roomFloorY + 1.1, -bayDepth / 2 + 0.55);
    group.add(coolantPipe);

    const returnPipe = coolantPipe.clone();
    returnPipe.position.z = bayDepth / 2 - 0.55;
    group.add(returnPipe);

    const generatorMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1f2933),
      roughness: 0.3,
      metalness: 0.65,
      emissive: new THREE.Color(0x0f172a),
      emissiveIntensity: 0.2,
    });

    const generatorHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 1.1, 24),
      generatorMaterial
    );
    generatorHousing.position.set(0, roomFloorY + 0.55, -bayDepth * 0.18);
    group.add(generatorHousing);

    const generatorCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.9, 24),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x0f172a),
        emissive: new THREE.Color(0x22d3ee),
        emissiveIntensity: 1.1,
        metalness: 0.35,
        roughness: 0.25,
      })
    );
    generatorCore.position.set(0, roomFloorY + 0.55, -bayDepth * 0.18);
    group.add(generatorCore);

    const energyPulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    energyPulse.position.copy(generatorCore.position);
    group.add(energyPulse);

    const engineeringLight = new THREE.PointLight(
      0x22d3ee,
      1.3,
      bayDepth * 1.4,
      2
    );
    engineeringLight.position.set(0, roomFloorY + 1.8, -bayDepth * 0.18);
    group.add(engineeringLight);

    const maintenanceConsole = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.75, 0.4),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x1f2a37),
        roughness: 0.4,
        metalness: 0.5,
        emissive: new THREE.Color(0x0c4a6e),
        emissiveIntensity: 0.3,
      })
    );
    maintenanceConsole.position.set(0, roomFloorY + 0.55, bayDepth / 2 - 0.6);
    group.add(maintenanceConsole);

    const consoleScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.45),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.75,
      })
    );
    consoleScreen.position.set(0, roomFloorY + 0.72, bayDepth / 2 - 0.38);
    consoleScreen.rotation.x = -THREE.MathUtils.degToRad(12);
    group.add(consoleScreen);

    const liftDoor = createHangarDoor(SHARED_ROOM_DOOR_THEME);
    liftDoor.position.set(
      0,
      roomFloorY + (liftDoor.userData.height ?? 0) / 2,
      -bayDepth / 2 + 0.32 * ROOM_SCALE_FACTOR
    );
    liftDoor.userData.floorOffset = 0;
    group.add(liftDoor);

    const adjustableEntries = [
      { object: floor, offset: -floorThickness / 2 },
      { object: maintenancePit, offset: -0.3 },
      { object: gantry, offset: 0.18 },
      { object: generatorHousing, offset: 0.55 },
      { object: generatorCore, offset: 0.55 },
      { object: energyPulse, offset: 0.55 },
      { object: maintenanceConsole, offset: 0.55 },
      { object: consoleScreen, offset: 0.72 },
      { object: coolantPipe, offset: 1.1 },
      { object: returnPipe, offset: 1.1 },
    ];

    beams.forEach((beam) => {
      adjustableEntries.push({ object: beam, offset: 1.3 });
    });

    const updateForRoomHeight = ({ roomFloorY }) => {
      adjustableEntries.forEach(({ object, offset }) => {
        if (object) {
          object.position.y = roomFloorY + offset;
        }
      });
      engineeringLight.position.y = roomFloorY + 1.8;
    };

    const teleportOffset = new THREE.Vector3(0, 0, -bayDepth / 2 + 1.8);

    return {
      group,
      liftDoor,
      updateForRoomHeight,
      teleportOffset,
      bounds: floorBounds,
    };
  };

  const createExteriorOutpostEnvironment = () => {
    const group = new THREE.Group();

    const plazaWidth = roomWidth * 1.8;
    const plazaDepth = roomDepth * 1.15;
    const terrainThickness = 0.4;

    const floorBounds = createFloorBounds(plazaWidth, plazaDepth, {
      paddingX: 1.1,
      paddingZ: 1.6,
    });

    const terrainMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0f1c24),
      roughness: 0.95,
      metalness: 0.04,
    });

    const terrain = new THREE.Mesh(
      new THREE.BoxGeometry(plazaWidth, terrainThickness, plazaDepth),
      terrainMaterial
    );
    terrain.position.y = roomFloorY - terrainThickness / 2;
    group.add(terrain);

    const walkwayMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x334155),
      roughness: 0.55,
      metalness: 0.28,
    });

    const walkway = new THREE.Mesh(
      new THREE.BoxGeometry(plazaWidth * 0.7, 0.12, plazaDepth * 0.38),
      walkwayMaterial
    );
    walkway.position.set(-roomWidth / 6, roomFloorY + 0.06, -plazaDepth * 0.15);
    group.add(walkway);

    const overlookMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1e293b),
      roughness: 0.48,
      metalness: 0.35,
      emissive: new THREE.Color(0x0f172a),
      emissiveIntensity: 0.25,
    });

    const overlook = new THREE.Mesh(
      new THREE.CylinderGeometry(plazaWidth * 0.28, plazaWidth * 0.32, 0.18, 48),
      overlookMaterial
    );
    overlook.position.set(-roomWidth / 6, roomFloorY + 0.09, plazaDepth * 0.1);
    group.add(overlook);

    const perimeterMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x94a3b8),
      roughness: 0.4,
      metalness: 0.6,
      emissive: new THREE.Color(0x1d4ed8),
      emissiveIntensity: 0.2,
    });

    const sideRailLength = plazaDepth * 0.55;
    const railHeight = 1.18;
    const starboardRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, railHeight, sideRailLength),
      perimeterMaterial
    );
    starboardRail.position.set(
      plazaWidth / 2 - 0.45,
      roomFloorY + railHeight / 2,
      sideRailLength / 2 - plazaDepth * 0.05
    );
    group.add(starboardRail);

    const portRail = starboardRail.clone();
    portRail.position.x = -plazaWidth / 2 + 0.38;
    group.add(portRail);

    const forwardRail = new THREE.Mesh(
      new THREE.BoxGeometry(plazaWidth * 0.72, 0.12, 0.12),
      perimeterMaterial
    );
    forwardRail.position.set(-roomWidth / 6, roomFloorY + 1.05, plazaDepth * 0.32);
    group.add(forwardRail);

    const accentLight = new THREE.PointLight(0x38bdf8, 0.5, plazaDepth * 1.2, 2);
    accentLight.position.set(-roomWidth / 6, roomFloorY + 2.2, plazaDepth * 0.26);
    group.add(accentLight);

    const planterMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0f172a),
      roughness: 0.4,
      metalness: 0.25,
    });

    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0ea5e9),
      emissive: new THREE.Color(0x22d3ee),
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.1,
    });

    const adjustableEntries = [];

    const createPlanter = (x, z, radius) => {
      const planter = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 1.08, 0.32, 24),
        planterMaterial
      );
      planter.position.set(x, roomFloorY + 0.16, z);
      group.add(planter);

      const foliage = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.9, 24, 16),
        foliageMaterial
      );
      foliage.position.set(x, roomFloorY + 0.65, z);
      group.add(foliage);

      adjustableEntries.push({ object: planter, offset: 0.16 });
      adjustableEntries.push({ object: foliage, offset: 0.65 });
    };

    createPlanter(-roomWidth / 6 - 1, -plazaDepth * 0.05, 0.38);
    createPlanter(-roomWidth / 6 + 1, -plazaDepth * 0.05, 0.36);
    createPlanter(-roomWidth / 6, plazaDepth * 0.22, 0.48);

    const postMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1f2937),
      roughness: 0.35,
      metalness: 0.25,
    });

    const lampMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xfacc15),
      emissive: new THREE.Color(0xfcd34d),
      emissiveIntensity: 1.25,
      roughness: 0.2,
    });

    const lightPosts = [];

    const createLightPost = (x, z) => {
      const postGroup = new THREE.Group();

      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.4, 12),
        postMaterial
      );
      post.position.y = 0.7;
      postGroup.add(post);

      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), lampMaterial);
      lamp.position.y = 1.4;
      postGroup.add(lamp);

      const light = new THREE.PointLight(0xfcd34d, 0.9, 8, 2);
      light.position.y = 1.4;
      postGroup.add(light);

      postGroup.position.set(x, roomFloorY, z);
      group.add(postGroup);

      lightPosts.push(postGroup);
    };

    const lightSpacing = plazaDepth * 0.2;
    [-1, 0, 1].forEach((offset) => {
      createLightPost(-roomWidth / 6 - 0.95, -plazaDepth * 0.05 + offset * lightSpacing);
      createLightPost(-roomWidth / 6 + 0.95, -plazaDepth * 0.05 + offset * lightSpacing);
    });

    const ridgeMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0b1220),
      roughness: 0.85,
      metalness: 0.05,
    });

    const ridge = new THREE.Mesh(
      new THREE.CylinderGeometry(plazaWidth, plazaWidth * 1.2, 1.2, 64, 1, true),
      ridgeMaterial
    );
    ridge.rotation.x = Math.PI / 2;
    ridge.position.set(0, roomFloorY + 0.2, plazaDepth / 2 - 0.8);
    group.add(ridge);

    const horizonGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(plazaWidth * 1.5, 4.5),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.12,
      })
    );
    horizonGlow.position.set(0, roomFloorY + 2.6, plazaDepth / 2 - 0.4);
    group.add(horizonGlow);

    const nebula = new THREE.Mesh(
      new THREE.RingGeometry(plazaWidth * 0.35, plazaWidth * 0.7, 48),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
      })
    );
    nebula.position.set(-roomWidth / 6, roomFloorY + 3.6, plazaDepth * 0.38);
    nebula.rotation.x = -Math.PI / 3;
    group.add(nebula);

    const skyRadius = plazaWidth * 2.8;
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(skyRadius, 48, 32),
      new THREE.MeshBasicMaterial({
        color: 0x01060c,
        transparent: true,
        opacity: 0.92,
        side: THREE.BackSide,
      })
    );
    skyDome.position.set(0, roomFloorY + skyRadius * 0.3, 0);
    group.add(skyDome);

    const ambientLight = new THREE.AmbientLight(0x0f172a, 0.6);
    group.add(ambientLight);

    const horizonLight = new THREE.DirectionalLight(0x38bdf8, 0.25);
    horizonLight.position.set(-2.5, roomFloorY + 3.2, 4.6);
    group.add(horizonLight);

    const liftDoor = createHangarDoor(SHARED_ROOM_DOOR_THEME);
    liftDoor.position.set(
      -roomWidth / 3,
      roomFloorY + (liftDoor.userData.height ?? 0) / 2,
      -plazaDepth / 2 + 0.32 * ROOM_SCALE_FACTOR
    );
    liftDoor.userData.floorOffset = 0;
    group.add(liftDoor);

    adjustableEntries.push({ object: terrain, offset: -terrainThickness / 2 });
    adjustableEntries.push({ object: walkway, offset: 0.06 });
    adjustableEntries.push({ object: overlook, offset: 0.09 });
    adjustableEntries.push({ object: starboardRail, offset: railHeight / 2 });
    adjustableEntries.push({ object: portRail, offset: railHeight / 2 });
    adjustableEntries.push({ object: forwardRail, offset: 1.05 });
    adjustableEntries.push({ object: accentLight, offset: 2.2 });
    adjustableEntries.push({ object: ridge, offset: 0.2 });
    adjustableEntries.push({ object: horizonGlow, offset: 2.6 });
    adjustableEntries.push({ object: nebula, offset: 3.6 });

    const updateForRoomHeight = ({ roomFloorY }) => {
      adjustableEntries.forEach(({ object, offset }) => {
        if (object) {
          object.position.y = roomFloorY + offset;
        }
      });

      lightPosts.forEach((postGroup) => {
        postGroup.position.y = roomFloorY;
      });

      horizonLight.position.y = roomFloorY + 3.2;
      skyDome.position.y = roomFloorY + skyRadius * 0.3;
    };

    const teleportOffset = new THREE.Vector3(
      -roomWidth / 3,
      0,
      -plazaDepth / 2 + 1.9
    );

    return {
      group,
      liftDoor,
      updateForRoomHeight,
      teleportOffset,
      bounds: floorBounds,
    };
  };

  const createLastUpdatedDisplay = () => {
    const displayGroup = new THREE.Group();

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext("2d");

    if (!context) {
      return displayGroup;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;

    const signAspect = canvas.width / canvas.height;
    const signHeight = 2.6;
    const signWidth = signHeight * signAspect;

    const signMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(signWidth, signHeight),
      signMaterial
    );
    signMesh.renderOrder = 2;
    displayGroup.add(signMesh);

    const updateTexture = () => {
      const marginX = 80;
      const marginY = 70;
      const frameInset = 36;

      context.clearRect(0, 0, canvas.width, canvas.height);
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "rgba(15, 23, 42, 0.94)");
      gradient.addColorStop(1, "rgba(30, 41, 59, 0.92)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.strokeStyle = "rgba(56, 189, 248, 0.55)";
      context.lineWidth = 12;
      context.strokeRect(
        frameInset,
        frameInset,
        canvas.width - frameInset * 2,
        canvas.height - frameInset * 2
      );

      context.textBaseline = "top";

      const rawLastModified = document.lastModified;
      const parsedTimestamp = new Date(rawLastModified);
      const lastModifiedDate = Number.isNaN(parsedTimestamp.getTime())
        ? new Date()
        : parsedTimestamp;

      const dateFormatter = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const formattedDate = dateFormatter.format(lastModifiedDate);

      const timeZonePart = new Intl.DateTimeFormat(undefined, {
        timeZoneName: "short",
      })
        .formatToParts(lastModifiedDate)
        .find((part) => part.type === "timeZoneName")?.value;

      let cursorY = marginY;

      context.fillStyle = "#38bdf8";
      context.font = "700 86px 'Segoe UI', 'Inter', sans-serif";
      context.fillText("Last Update Log", marginX, cursorY);
      cursorY += 118;

      context.fillStyle = "#e2e8f0";
      context.font = "600 72px 'Segoe UI', 'Inter', sans-serif";
      context.fillText(formattedDate, marginX, cursorY);
      cursorY += 96;

      if (timeZonePart) {
        context.fillStyle = "rgba(148, 163, 184, 0.85)";
        context.font = "500 50px 'Segoe UI', 'Inter', sans-serif";
        context.fillText(`Timezone: ${timeZonePart}`, marginX, cursorY);
        cursorY += 74;
      }

      texture.needsUpdate = true;
    };

    updateTexture();

    const intervalId = window.setInterval(updateTexture, 60_000);
    displayGroup.userData.dispose = () => {
      window.clearInterval(intervalId);
    };

    return displayGroup;
  };

  const computerSetup = createComputerSetup();
  computerSetup.position.set(
    3 * ROOM_SCALE_FACTOR,
    roomFloorY,
    -roomDepth / 2 + terminalBackOffset
  );

  registerColliderDescriptors(computerSetup.userData?.colliderDescriptors);

  if (typeof computerSetup.userData?.setCollidersChangedCallback === "function") {
    computerSetup.userData.setCollidersChangedCallback(() => {
      computerSetup.updateMatrixWorld(true);
      rebuildStaticColliders();
    });
  }

  hangarDeckEnvironmentGroup.add(computerSetup);
  computerSetup.updateMatrixWorld(true);
  rebuildStaticColliders();
  if (typeof computerSetup.userData?.notifyCollidersChanged === "function") {
    computerSetup.userData.notifyCollidersChanged();
  }

  const lastUpdatedDisplay = createLastUpdatedDisplay();
  lastUpdatedDisplay.position.set(
    -roomWidth / 2 + 0.12 * ROOM_SCALE_FACTOR,
    roomFloorY + roomHeight * 0.82,
    0
  );
  lastUpdatedDisplay.rotation.y = Math.PI / 2;
  hangarDeckEnvironmentGroup.add(lastUpdatedDisplay);

  const createLazyDeckEnvironment = ({
    id,
    title,
    description,
    yaw = 0,
    groupPosition,
    localFloorBounds,
    teleportOffset,
    createEnvironment,
  }) => {
    const origin = groupPosition.clone();
    const localBounds = localFloorBounds || null;
    const worldBounds = localBounds
      ? translateBoundsToWorld(localBounds, origin)
      : null;

    const teleport = teleportOffset instanceof THREE.Vector3
      ? teleportOffset.clone()
      : null;

    const floorPosition = new THREE.Vector3().copy(origin);
    if (teleport) {
      floorPosition.add(teleport);
    }
    floorPosition.y = roomFloorY;

    let state = null;

    const load = () => {
      if (state?.group) {
        if (!state.group.parent) {
          scene.add(state.group);
          state.group.updateMatrixWorld(true);
        }
        return state;
      }

      let environment = null;

      try {
        environment = createEnvironment();
      } catch (error) {
        console.warn(`Unable to create environment for ${id}`, error);
        return null;
      }

      const group = environment?.group;

      if (!group) {
        return null;
      }

      group.position.copy(origin);
      scene.add(group);
      group.updateMatrixWorld(true);

      let colliderSource = null;

      if (Array.isArray(environment?.colliderDescriptors)) {
        colliderSource = environment.colliderDescriptors;
      } else if (Array.isArray(group.userData?.colliderDescriptors)) {
        colliderSource = group.userData.colliderDescriptors;
      }

      let registeredColliders = null;
      if (Array.isArray(colliderSource) && colliderSource.length > 0) {
        registeredColliders = registerColliderDescriptors(colliderSource);
      }

      let unregisterHeightAdjuster = null;
      if (typeof environment?.updateForRoomHeight === "function") {
        unregisterHeightAdjuster = registerEnvironmentHeightAdjuster(
          environment.updateForRoomHeight
        );
        try {
          environment.updateForRoomHeight({
            roomFloorY,
            heightScale: playerHeight / DEFAULT_PLAYER_HEIGHT,
          });
        } catch (error) {
          console.warn(
            `Unable to update environment height for ${id}`,
            error
          );
        }
      }

      let unregisterLiftDoor = null;
      const doorsToRegister = [];

      if (environment?.liftDoor) {
        doorsToRegister.push(environment.liftDoor);
      }

      if (Array.isArray(environment?.liftDoors)) {
        environment.liftDoors.forEach((door) => {
          if (door && !doorsToRegister.includes(door)) {
            doorsToRegister.push(door);
          }
        });
      }

      if (doorsToRegister.length > 0) {
        const unregisterFns = doorsToRegister
          .map((door) => registerLiftDoor(door))
          .filter((fn) => typeof fn === "function");

        unregisterLiftDoor = () => {
          unregisterFns.forEach((fn) => {
            try {
              fn();
            } catch (error) {
              console.warn("Unable to unregister lift door", error);
            }
          });
        };
      }

      state = {
        group,
        unregisterHeightAdjuster,
        unregisterLiftDoor,
        registeredColliders,
      };

      updateEnvironmentForPlayerHeight();
      rebuildStaticColliders();

      return state;
    };

    const unload = () => {
      if (!state?.group) {
        return;
      }

      if (typeof state.unregisterHeightAdjuster === "function") {
        state.unregisterHeightAdjuster();
      }

      if (typeof state.unregisterLiftDoor === "function") {
        state.unregisterLiftDoor();
      }

      if (
        Array.isArray(state.registeredColliders) &&
        state.registeredColliders.length > 0
      ) {
        unregisterColliderDescriptors(state.registeredColliders);
      }

      scene.remove(state.group);
      disposeObject3D(state.group);

      state = null;

      rebuildStaticColliders();
    };

    return {
      id,
      title,
      description,
      yaw,
      position: floorPosition,
      bounds: worldBounds,
      load,
      unload,
      isLoaded: () => Boolean(state?.group),
    };
  };

  const operationsDeckGroupPosition = new THREE.Vector3(roomWidth * 3.2, 0, 0);
  const operationsDeckLocalBounds = createFloorBounds(
    roomWidth * 1.35,
    roomDepth * 0.85,
    {
      paddingX: 0.75,
      paddingZ: 0.75,
    }
  );
  const operationsDeckTeleportOffset = new THREE.Vector3(
    0,
    0,
    (roomDepth * 0.85) / 2 - 1.8
  );

  const engineeringDeckGroupPosition = new THREE.Vector3(
    -roomWidth * 3.4,
    0,
    0
  );
  const engineeringDeckLocalBounds = createFloorBounds(
    roomWidth * 1.5,
    roomDepth * 0.8,
    {
      paddingX: 0.75,
      paddingZ: 0.75,
    }
  );
  const engineeringDeckTeleportOffset = new THREE.Vector3(
    0,
    0,
    -(roomDepth * 0.8) / 2 + 1.8
  );

  const exteriorDeckGroupPosition = new THREE.Vector3(
    0,
    0,
    -roomDepth * 3.6
  );
  const exteriorDeckLocalBounds = createFloorBounds(
    roomWidth * 1.8,
    roomDepth * 1.15,
    {
      paddingX: 1.1,
      paddingZ: 1.6,
    }
  );
  const exteriorDeckTeleportOffset = new THREE.Vector3(
    -roomWidth / 3,
    0,
    -(roomDepth * 1.15) / 2 + 1.9
  );

  const deckEnvironments = [
    createLazyDeckEnvironment({
      id: "operations-concourse",
      title: "Outside Exit",
      description: "External Hatch",
      yaw: Math.PI,
      groupPosition: operationsDeckGroupPosition,
      localFloorBounds: operationsDeckLocalBounds,
      teleportOffset: operationsDeckTeleportOffset,
      createEnvironment: createOperationsConcourseEnvironment,
    }),
    createLazyDeckEnvironment({
      id: "engineering-bay",
      title: "Engineering Bay",
      description: "Systems maintenance hub",
      yaw: 0,
      groupPosition: engineeringDeckGroupPosition,
      localFloorBounds: engineeringDeckLocalBounds,
      teleportOffset: engineeringDeckTeleportOffset,
      createEnvironment: createEngineeringBayEnvironment,
    }),
    createLazyDeckEnvironment({
      id: "exterior-outpost",
      title: "Exterior Outpost",
      description: "Observation ridge overlook",
      yaw: 0,
      groupPosition: exteriorDeckGroupPosition,
      localFloorBounds: exteriorDeckLocalBounds,
      teleportOffset: exteriorDeckTeleportOffset,
      createEnvironment: createExteriorOutpostEnvironment,
    }),
  ];

  const deckEnvironmentMap = new Map(
    deckEnvironments.map((environment) => [environment.id, environment])
  );

  const activateDeckEnvironment = (floorId) => {
    const hangarDeckActive = !floorId || floorId === "hangar-deck";
    hangarDeckEnvironmentGroup.visible = hangarDeckActive;

    deckEnvironmentMap.forEach((environment, environmentId) => {
      if (environmentId === floorId) {
        environment.load();
      } else {
        environment.unload();
      }
    });
  };

  const operationsDeckEnvironment = deckEnvironmentMap.get(
    "operations-concourse"
  );
  const engineeringDeckEnvironment = deckEnvironmentMap.get("engineering-bay");
  const exteriorDeckEnvironment = deckEnvironmentMap.get("exterior-outpost");

  const operationsDeckFloorPosition =
    operationsDeckEnvironment?.position instanceof THREE.Vector3
      ? operationsDeckEnvironment.position
      : null;
  const engineeringDeckFloorPosition =
    engineeringDeckEnvironment?.position instanceof THREE.Vector3
      ? engineeringDeckEnvironment.position
      : null;
  const exteriorDeckFloorPosition =
    exteriorDeckEnvironment?.position instanceof THREE.Vector3
      ? exteriorDeckEnvironment.position
      : null;

  const operationsDeckFloorBounds = operationsDeckEnvironment?.bounds ?? null;
  const engineeringDeckFloorBounds =
    engineeringDeckEnvironment?.bounds ?? null;
  const exteriorDeckFloorBounds = exteriorDeckEnvironment?.bounds ?? null;


  const computeReflectorRenderTargetSize = (surfaceWidth, surfaceHeight) => {
    const pixelRatio = renderer.getPixelRatio();
    const safeSurfaceWidth =
      Number.isFinite(surfaceWidth) && surfaceWidth > 0 ? surfaceWidth : 1;
    const safeSurfaceHeight =
      Number.isFinite(surfaceHeight) && surfaceHeight > 0 ? surfaceHeight : 1;
    const aspect = safeSurfaceWidth / safeSurfaceHeight;
    const baseHeight = Math.max(1, window.innerHeight || 1);
    const baseWidth = baseHeight * aspect;

    return {
      width: Math.max(1, Math.round(baseWidth * pixelRatio)),
      height: Math.max(1, Math.round(baseHeight * pixelRatio)),
    };
  };

  const createWallMirror = () => {
    const group = new THREE.Group();

    const mirrorWidth = BASE_MIRROR_WIDTH;
    const mirrorHeight = BASE_MIRROR_HEIGHT;
    const frameInset = 0.18;

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x111827),
      metalness: 0.58,
      roughness: 0.32,
      emissive: new THREE.Color(0x0b1220),
      emissiveIntensity: 0.22,
    });

    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(
        mirrorWidth + frameInset,
        mirrorHeight + frameInset
      ),
      frameMaterial
    );
    frame.position.z = -0.015;
    group.add(frame);

    const renderTargetSize = computeReflectorRenderTargetSize(
      mirrorWidth,
      mirrorHeight
    );

    const reflector = new Reflector(
      new THREE.PlaneGeometry(mirrorWidth, mirrorHeight),
      {
        clipBias: 0.0025,
        color: new THREE.Color(0x9fb7cf),
        textureWidth: renderTargetSize.width,
        textureHeight: renderTargetSize.height,
      }
    );
    const reflectorUserData = reflector.userData || (reflector.userData = {});
    reflectorUserData.renderSurfaceDimensions = {
      width: mirrorWidth,
      height: mirrorHeight,
    };
    group.add(reflector);

    const accentMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1f2a37),
      metalness: 0.35,
      roughness: 0.55,
    });

    const accentDepth = 0.08;
    const topAccent = new THREE.Mesh(
      new THREE.BoxGeometry(mirrorWidth + frameInset, 0.08, accentDepth),
      accentMaterial
    );
    topAccent.position.set(0, mirrorHeight / 2 + 0.02, -accentDepth / 2);
    group.add(topAccent);

    const bottomAccent = topAccent.clone();
    bottomAccent.position.y = -mirrorHeight / 2 - 0.02;
    group.add(bottomAccent);

    group.userData.dimensions = { width: mirrorWidth, height: mirrorHeight };
    group.userData.baseDimensions = { width: mirrorWidth, height: mirrorHeight };
    group.userData.reflector = reflector;

    return group;
  };

  const reflectiveSurfaces = [];
  const registerReflectiveSurface = (reflector) => {
    if (!reflector) {
      return;
    }

    reflectiveSurfaces.push(reflector);
  };

  const createGridLines = (width, height, segmentsX, segmentsY, color, opacity) => {
    const vertices = [];
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    for (let i = 0; i <= segmentsX; i += 1) {
      const x = -halfWidth + (i * width) / segmentsX;
      vertices.push(x, halfHeight, 0, x, -halfHeight, 0);
    }

    for (let j = 0; j <= segmentsY; j += 1) {
      const y = -halfHeight + (j * height) / segmentsY;
      vertices.push(-halfWidth, y, 0, halfWidth, y, 0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
    });

    return new THREE.LineSegments(geometry, material);
  };

  const gridColor = 0x94a3b8;
  const gridOpacity = 0.35;

  const floorGrid = createGridLines(roomWidth, roomDepth, 20, 20, gridColor, gridOpacity);
  floorGrid.rotation.x = -Math.PI / 2;
  floorGrid.position.y = roomFloorY + 0.02;
  hangarDeckEnvironmentGroup.add(floorGrid);

  const backWallGrid = createGridLines(
    roomWidth,
    BASE_ROOM_HEIGHT,
    20,
    10,
    gridColor,
    gridOpacity
  );
  backWallGrid.position.z = -roomDepth / 2 + 0.02;
  hangarDeckEnvironmentGroup.add(backWallGrid);

  const frontWallGrid = createGridLines(
    roomWidth,
    BASE_ROOM_HEIGHT,
    20,
    10,
    gridColor,
    gridOpacity
  );
  frontWallGrid.rotation.y = Math.PI;
  frontWallGrid.position.z = roomDepth / 2 - 0.02;
  hangarDeckEnvironmentGroup.add(frontWallGrid);

  const leftWallGrid = createGridLines(
    roomDepth,
    BASE_ROOM_HEIGHT,
    20,
    10,
    gridColor,
    gridOpacity
  );
  leftWallGrid.rotation.y = Math.PI / 2;
  leftWallGrid.position.x = -roomWidth / 2 + 0.02;
  hangarDeckEnvironmentGroup.add(leftWallGrid);

  const rightWallGrid = createGridLines(
    roomDepth,
    BASE_ROOM_HEIGHT,
    20,
    10,
    gridColor,
    gridOpacity
  );
  rightWallGrid.rotation.y = -Math.PI / 2;
  rightWallGrid.position.x = roomWidth / 2 - 0.02;
  hangarDeckEnvironmentGroup.add(rightWallGrid);

  const wallMirror = createWallMirror();
  const mirrorDimensions = wallMirror.userData?.dimensions;
  const mirrorHeight = mirrorDimensions?.height ?? BASE_MIRROR_HEIGHT;
  wallMirror.position.set(
    roomWidth / 2 - 0.16 * ROOM_SCALE_FACTOR,
    roomFloorY + 0.5 + mirrorHeight / 2,
    6 * ROOM_SCALE_FACTOR
  );
  wallMirror.rotation.y = -Math.PI / 2;
  hangarDeckEnvironmentGroup.add(wallMirror);

  const wallMirrorReflector = wallMirror.userData?.reflector;
  if (wallMirrorReflector) {
    registerReflectiveSurface(wallMirrorReflector);
  }

  const liftState = {
    floors: [],
    currentIndex: 0,
  };

  const updateEnvironmentForPlayerHeight = () => {
    const heightScale = playerHeight / DEFAULT_PLAYER_HEIGHT;

    roomHeight = BASE_ROOM_HEIGHT * heightScale;
    roomFloorY = -roomHeight / 2;

    roomMesh.scale.set(1, heightScale, 1);

    liftState.floors.forEach((floor) => {
      if (floor?.position instanceof THREE.Vector3) {
        floor.position.y = roomFloorY;
      }
    });

    floorGrid.position.y = roomFloorY + 0.02;

    const verticalGridScale = heightScale;
    backWallGrid.scale.y = verticalGridScale;
    frontWallGrid.scale.y = verticalGridScale;
    leftWallGrid.scale.y = verticalGridScale;
    rightWallGrid.scale.y = verticalGridScale;

    registeredLiftDoors.forEach((door) => {
      if (!door) {
        return;
      }

      const baseDimensions = door.userData?.baseDimensions;
      const baseDoorHeight = baseDimensions?.height ?? BASE_DOOR_HEIGHT;
      const baseDoorWidth = baseDimensions?.width ?? BASE_DOOR_WIDTH;

      door.scale.setScalar(heightScale);
      const scaledDoorHeight = baseDoorHeight * heightScale;
      const scaledDoorWidth = baseDoorWidth * heightScale;
      door.userData.height = scaledDoorHeight;
      door.userData.width = scaledDoorWidth;

      const floorOffset = Number.isFinite(door.userData?.floorOffset)
        ? door.userData.floorOffset
        : 0;

      door.position.y = roomFloorY + scaledDoorHeight / 2 + floorOffset;
    });

    const mirrorBaseDimensions = wallMirror.userData?.baseDimensions;
    const baseMirrorHeight = mirrorBaseDimensions?.height ?? BASE_MIRROR_HEIGHT;
    const baseMirrorWidth = mirrorBaseDimensions?.width ?? BASE_MIRROR_WIDTH;
    wallMirror.scale.setScalar(heightScale);
    const scaledMirrorHeight = baseMirrorHeight * heightScale;
    const scaledMirrorWidth = baseMirrorWidth * heightScale;
    wallMirror.userData.dimensions = {
      width: scaledMirrorWidth,
      height: scaledMirrorHeight,
    };
    wallMirror.position.y = roomFloorY + 0.5 + scaledMirrorHeight / 2;

    const reflector = wallMirror.userData?.reflector;
    if (reflector) {
      reflector.userData = reflector.userData || {};
      reflector.userData.renderSurfaceDimensions = {
        width: scaledMirrorWidth,
        height: scaledMirrorHeight,
      };

      if (
        reflector.renderTarget &&
        typeof reflector.renderTarget.setSize === "function"
      ) {
        const renderTargetSize = computeReflectorRenderTargetSize(
          scaledMirrorWidth,
          scaledMirrorHeight
        );
        reflector.renderTarget.setSize(
          renderTargetSize.width,
          renderTargetSize.height
        );
      }
    }

    computerSetup.position.y = roomFloorY;
    if (typeof computerSetup.userData?.notifyCollidersChanged === "function") {
      computerSetup.userData.notifyCollidersChanged();
    } else {
      computerSetup.updateMatrixWorld(true);
      rebuildStaticColliders();
    }

    environmentHeightAdjusters.forEach((adjuster) => {
      try {
        adjuster({ roomFloorY, heightScale });
      } catch (error) {
        console.warn("Unable to update environment for player height", error);
      }
    });
  };

  updateEnvironmentForPlayerHeight();

  const raycaster = new THREE.Raycaster();
  const quickAccessInteractables = [];
  const MAX_TERMINAL_INTERACTION_DISTANCE = 6.8;

  const MAX_LIFT_INTERACTION_DISTANCE = 3.5;

  let liftInteractable = false;

  const updateLiftInteractableState = (canInteract) => {
    const nextState = Boolean(canInteract);

    if (liftInteractable === nextState) {
      return;
    }

    liftInteractable = nextState;

    if (typeof onLiftInteractableChange === "function") {
      onLiftInteractableChange(nextState);
    }
  };

  let terminalInteractable = false;

  const updateTerminalInteractableState = (canInteract) => {
    if (terminalInteractable === canInteract) {
      return;
    }

    terminalInteractable = canInteract;

    if (typeof onTerminalInteractableChange === "function") {
      onTerminalInteractableChange(canInteract);
    }
  };

  const monitorScreen = computerSetup.userData?.monitorScreen;
  let currentMonitorHoveredZoneId = null;
  if (monitorScreen) {
    quickAccessInteractables.push(monitorScreen);
  }

  const storedPlayerState = loadStoredPlayerState();
  let lastSerializedPlayerState = storedPlayerState?.serialized ?? null;
  let isPlayerStatePersistenceEnabled = true;
  const storedOrientationEuler = new THREE.Euler(0, 0, 0, "YXZ");

  const controls = new PointerLockControls(camera, canvas);
  const playerObject = controls.getObject();
  if (playerObject?.rotation) {
    playerObject.rotation.order = "YXZ";
  }
  scene.add(playerObject);

  let playerEyeLevel = playerHeight;

  const FIRST_PERSON_EYE_HEIGHT_OFFSET = -0.1;

  const firstPersonCameraOffset = new THREE.Vector3(
    0,
    playerEyeLevel + FIRST_PERSON_EYE_HEIGHT_OFFSET,
    0
  );

  const updateFirstPersonCameraOffset = () => {
    const baseHeight = Number.isFinite(playerHeight)
      ? Math.max(playerHeight, MIN_PLAYER_HEIGHT)
      : MIN_PLAYER_HEIGHT;
    const adjustedEyeLevel = Math.max(
      MIN_PLAYER_HEIGHT,
      baseHeight + FIRST_PERSON_EYE_HEIGHT_OFFSET
    );

    firstPersonCameraOffset.set(0, adjustedEyeLevel, 0);
  };

  const defaultPlayerPosition = new THREE.Vector3(
    0,
    roomFloorY,
    8 * ROOM_SCALE_FACTOR
  );

  let travelToLiftFloor = null;

  const liftFrontApproachZ = roomDepth / 2 - 3 * ROOM_SCALE_FACTOR;
  const liftRearApproachZ = -roomDepth / 2 + 3 * ROOM_SCALE_FACTOR;
  const liftPortApproachX = -roomWidth / 4;

  const hangarDeckFloorPosition = new THREE.Vector3(
    0,
    roomFloorY,
    liftFrontApproachZ
  );

  const operationsDeckFloorPositionFallback = new THREE.Vector3(
    liftPortApproachX,
    roomFloorY,
    0
  );

  const engineeringDeckFloorPositionFallback = new THREE.Vector3(
    0,
    roomFloorY,
    liftRearApproachZ
  );

  const exteriorDeckFloorPositionFallback = new THREE.Vector3(
    -roomWidth / 3,
    roomFloorY,
    -roomDepth * 3.6 - (roomDepth * 1.15) / 2 + 1.9
  );

  const resolvedOperationsFloorPosition =
    operationsDeckFloorPosition instanceof THREE.Vector3
      ? operationsDeckFloorPosition
      : operationsDeckFloorPositionFallback;

  const resolvedEngineeringFloorPosition =
    engineeringDeckFloorPosition instanceof THREE.Vector3
      ? engineeringDeckFloorPosition
      : engineeringDeckFloorPositionFallback;

  const resolvedExteriorFloorPosition =
    exteriorDeckFloorPosition instanceof THREE.Vector3
      ? exteriorDeckFloorPosition
      : exteriorDeckFloorPositionFallback;

  const hangarDeckFloorBounds = createFloorBounds(roomWidth, roomDepth, {
    paddingX: 1,
    paddingZ: 1,
  });
  const resolvedOperationsFloorBounds =
    operationsDeckFloorBounds ??
    translateBoundsToWorld(
      createFloorBounds(roomWidth * 1.35, roomDepth * 0.85, {
        paddingX: 0.75,
        paddingZ: 0.75,
      }),
      operationsDeckFloorPositionFallback
    ) ??
    hangarDeckFloorBounds;
  const resolvedEngineeringFloorBounds =
    engineeringDeckFloorBounds ??
    translateBoundsToWorld(
      createFloorBounds(roomWidth * 1.5, roomDepth * 0.8, {
        paddingX: 0.75,
        paddingZ: 0.75,
      }),
      engineeringDeckFloorPositionFallback
    ) ??
    hangarDeckFloorBounds;

  const resolvedExteriorFloorBounds =
    exteriorDeckFloorBounds ??
    translateBoundsToWorld(
      createFloorBounds(roomWidth * 1.8, roomDepth * 1.15, {
        paddingX: 1.1,
        paddingZ: 1.6,
      }),
      exteriorDeckFloorPositionFallback
    ) ??
    hangarDeckFloorBounds;

  liftState.floors = [
    {
      id: "hangar-deck",
      title: "Command Center",
      description: "Flight line staging",
      position: hangarDeckFloorPosition,
      bounds: hangarDeckFloorBounds,
    },
    {
      id: "operations-concourse",
      title: "Outside Exit",
      description: "External Hatch",
      position: resolvedOperationsFloorPosition,
      yaw: Math.PI,
      bounds: resolvedOperationsFloorBounds,
    },
    {
      id: "engineering-bay",
      title: "Engineering Bay",
      description: "Systems maintenance hub",
      position: resolvedEngineeringFloorPosition,
      yaw: 0,
      bounds: resolvedEngineeringFloorBounds,
    },
    {
      id: "exterior-outpost",
      title: "Exterior Outpost",
      description: "Observation ridge overlook",
      position: resolvedExteriorFloorPosition,
      yaw: 0,
      bounds: resolvedExteriorFloorBounds,
    },
  ];

  const getLiftFloorByIndex = (index) => {
    if (!Array.isArray(liftState.floors) || liftState.floors.length === 0) {
      return null;
    }

    const clampedIndex = THREE.MathUtils.euclideanModulo(
      Number.isInteger(index) ? index : 0,
      liftState.floors.length
    );

    return liftState.floors[clampedIndex] ?? null;
  };

  const getActiveLiftFloor = () => getLiftFloorByIndex(liftState.currentIndex);

  const getNextLiftFloor = () => {
    if (!Array.isArray(liftState.floors) || liftState.floors.length <= 1) {
      return null;
    }

    return getLiftFloorByIndex(liftState.currentIndex + 1);
  };

  const resolveLiftFloorIndexForPosition = (position) => {
    if (
      !position ||
      !Array.isArray(liftState.floors) ||
      liftState.floors.length === 0
    ) {
      return 0;
    }

    let bestIndex = 0;
    let bestDistance = Infinity;

    liftState.floors.forEach((floor, index) => {
      if (!floor?.position) {
        return;
      }

      const distanceSquared =
        (position.x - floor.position.x) ** 2 +
        (position.z - floor.position.z) ** 2;

      if (distanceSquared < bestDistance) {
        bestDistance = distanceSquared;
        bestIndex = index;
      }
    });

    return bestIndex;
  };

  const updateLiftUi = () => {
    if (liftUiControllers.size === 0) {
      return;
    }

    const state = {
      current: getActiveLiftFloor(),
      next: getNextLiftFloor(),
      busy: false,
    };

    liftUiControllers.forEach((controller) => {
      if (controller && typeof controller.updateState === "function") {
        controller.updateState(state);
      }
    });
  };
  playerObject.position.copy(defaultPlayerPosition);

  let initialPitch = DEFAULT_CAMERA_PITCH;

  if (storedPlayerState) {
    playerObject.position.copy(storedPlayerState.position);
    storedOrientationEuler.setFromQuaternion(storedPlayerState.quaternion);
    controls.setYaw(storedOrientationEuler.y);

    const storedPitch = normalizePitchForPersistence(
      storedPlayerState.pitch
    );
    if (storedPitch !== null) {
      initialPitch = storedPitch;
    } else {
      const fallbackPitch = normalizePitchForPersistence(
        storedOrientationEuler.x
      );
      if (fallbackPitch !== null) {
        initialPitch = fallbackPitch;
      }
    }
  } else {
    controls.setYaw(playerObject.rotation.y || 0);
  }

  controls.setPitch(initialPitch);

  liftState.currentIndex = resolveLiftFloorIndexForPosition(
    playerObject.position
  );
  updateLiftUi();

  const initialActiveFloor = getActiveLiftFloor();
  activateDeckEnvironment(initialActiveFloor?.id ?? null);

  const applyPlayerHeight = (newHeight, options = {}) => {
    if (!Number.isFinite(newHeight) || newHeight <= 0) {
      return playerHeight;
    }

    const { persist = true } = options;
    const clampedHeight = Math.max(newHeight, MIN_PLAYER_HEIGHT);
    const hasHeightChanged = Math.abs(clampedHeight - playerHeight) >= 0.0001;

    if (hasHeightChanged) {
      playerHeight = clampedHeight;
      playerEyeLevel = playerHeight;
      updateEnvironmentForPlayerHeight();
    }

    updateFirstPersonCameraOffset();
    defaultPlayerPosition.y = roomFloorY;
    playerObject.position.y = Math.max(playerObject.position.y, roomFloorY);
    controls.setCameraOffset(firstPersonCameraOffset);

    if (persist) {
      persistPlayerHeight(playerHeight);
    }

    return playerHeight;
  };

  applyPlayerHeight(initialPlayerHeight, { persist: false });

  const playerColliderRadius = 0.35;
  const previousPlayerPosition = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  let verticalVelocity = 0;
  let isGrounded = true;
  let jumpRequested = false;
  const GRAVITY = -9.81;
  const JUMP_VELOCITY = 4.5;
  const CEILING_CLEARANCE = 0.5;

  travelToLiftFloor = (targetIndex, options = {}) => {
    if (!Array.isArray(liftState.floors) || liftState.floors.length === 0) {
      return false;
    }

    if (!Number.isInteger(targetIndex)) {
      return false;
    }

    const clampedIndex = THREE.MathUtils.euclideanModulo(
      targetIndex,
      liftState.floors.length
    );

    const currentFloor = getActiveLiftFloor();
    const nextFloor = getLiftFloorByIndex(clampedIndex);

    if (!nextFloor || clampedIndex === liftState.currentIndex) {
      updateLiftUi();
      return false;
    }

    activateDeckEnvironment(nextFloor.id ?? null);

    liftState.currentIndex = clampedIndex;

    if (nextFloor.position instanceof THREE.Vector3) {
      playerObject.position.set(
        nextFloor.position.x,
        Number.isFinite(nextFloor.position.y)
          ? nextFloor.position.y
          : roomFloorY,
        nextFloor.position.z
      );
    }

    clampWithinActiveFloor();
    previousPlayerPosition.copy(playerObject.position);

    if (Number.isFinite(nextFloor.yaw)) {
      controls.setYaw(nextFloor.yaw);
    }

    velocity.set(0, 0, 0);
    verticalVelocity = 0;

    updateLiftUi();
    savePlayerState(true);

    if (typeof onLiftTravel === "function") {
      onLiftTravel({
        from: currentFloor || null,
        to: nextFloor,
        reason: options?.reason || "direct",
      });
    }

    return true;
  };

  const resolvePlayerCollisions = (previousPosition) => {
    const playerPosition = controls.getObject().position;
    const playerFeetY = playerPosition.y;
    const playerHeadY = playerFeetY + playerHeight;

    colliderDescriptors.forEach((descriptor) => {
      const box = descriptor.box;

      if (!box || box.isEmpty()) {
        return;
      }

      if (playerHeadY <= box.min.y || playerFeetY >= box.max.y) {
        return;
      }

      const minX = box.min.x - playerColliderRadius;
      const maxX = box.max.x + playerColliderRadius;
      const minZ = box.min.z - playerColliderRadius;
      const maxZ = box.max.z + playerColliderRadius;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const playerX = playerPosition.x;
        const playerZ = playerPosition.z;

        if (
          playerX < minX ||
          playerX > maxX ||
          playerZ < minZ ||
          playerZ > maxZ
        ) {
          break;
        }

        const overlapLeft = playerX - minX;
        const overlapRight = maxX - playerX;
        const overlapBack = playerZ - minZ;
        const overlapFront = maxZ - playerZ;

        const minOverlapX = Math.min(overlapLeft, overlapRight);
        const minOverlapZ = Math.min(overlapBack, overlapFront);

        if (minOverlapX < minOverlapZ) {
          if (previousPosition.x <= minX) {
            playerPosition.x = minX;
          } else if (previousPosition.x >= maxX) {
            playerPosition.x = maxX;
          } else if (overlapLeft < overlapRight) {
            playerPosition.x = minX;
          } else {
            playerPosition.x = maxX;
          }

          velocity.x = 0;
        } else {
          if (previousPosition.z <= minZ) {
            playerPosition.z = minZ;
          } else if (previousPosition.z >= maxZ) {
            playerPosition.z = maxZ;
          } else if (overlapBack < overlapFront) {
            playerPosition.z = minZ;
          } else {
            playerPosition.z = maxZ;
          }

          velocity.z = 0;
        }
      }
    });
  };

  const roundPlayerStateValue = (value) =>
    Math.round(value * 10000) / 10000;

  const serializePlayerState = () => {
    const pitch = normalizePitchForPersistence(controls.getPitch());

    return JSON.stringify({
      position: {
        x: roundPlayerStateValue(playerObject.position.x),
        y: roundPlayerStateValue(playerObject.position.y),
        z: roundPlayerStateValue(playerObject.position.z),
      },
      quaternion: {
        x: roundPlayerStateValue(playerObject.quaternion.x),
        y: roundPlayerStateValue(playerObject.quaternion.y),
        z: roundPlayerStateValue(playerObject.quaternion.z),
        w: roundPlayerStateValue(playerObject.quaternion.w),
      },
      pitch: roundPlayerStateValue(
        pitch !== null ? pitch : DEFAULT_CAMERA_PITCH
      ),
    });
  };

  const savePlayerState = (force = false) => {
    if (!isPlayerStatePersistenceEnabled) {
      return;
    }

    const storage = getPlayerStateStorage();

    if (!storage) {
      return;
    }

    const serialized = serializePlayerState();

    if (!force && serialized === lastSerializedPlayerState) {
      return;
    }

    try {
      storage.setItem(PLAYER_STATE_STORAGE_KEY, serialized);
      lastSerializedPlayerState = serialized;
    } catch (error) {
      console.warn("Unable to save player state", error);
    }
  };

  const handleVisibilityChange = () => {
    if (!isPlayerStatePersistenceEnabled) {
      return;
    }

    if (document.visibilityState === "hidden") {
      savePlayerState(true);
    }
  };

  const handleBeforeUnload = () => {
    if (!isPlayerStatePersistenceEnabled) {
      return;
    }

    savePlayerState(true);
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("beforeunload", handleBeforeUnload);

  let playerStateSaveAccumulator = 0;

  class PlacementCancelledError extends Error {
    constructor(message = "Placement cancelled") {
      super(message);
      this.name = "PlacementCancelledError";
      this.isPlacementCancellation = true;
    }
  }

  let activePlacement = null;
  const manifestPlacements = new Set();

  const EDIT_MODE_HOVER_OPACITY = 0.25;
  const EDIT_MODE_SELECTED_OPACITY = 0.45;

  const manifestEditModeState = {
    enabled: false,
    hovered: null,
    selected: null,
    pointerDownHandlerAttached: false,
    keydownHandlerAttached: false,
  };

  const getManifestPlacementRoot = (object) => {
    let current = object;

    while (current && current !== scene) {
      if (manifestPlacements.has(current)) {
        return current;
      }

      current = current.parent;
    }

    return null;
  };

  const updateManifestPlacementVisualState = (container) => {
    if (!container) {
      return;
    }

    const multiplier = !manifestEditModeState.enabled
      ? 1
      : manifestEditModeState.hovered === container
      ? EDIT_MODE_HOVER_OPACITY
      : manifestEditModeState.selected === container
      ? EDIT_MODE_SELECTED_OPACITY
      : 1;

    container.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      materials.forEach((material) => {
        if (!material) {
          return;
        }

        const userData = material.userData || (material.userData = {});
        if (!Number.isFinite(userData.baseOpacity)) {
          userData.baseOpacity = Number.isFinite(material.opacity)
            ? material.opacity
            : 1;
        }

        if (typeof userData.baseTransparent !== "boolean") {
          userData.baseTransparent = Boolean(material.transparent);
        }

        if (typeof userData.baseDepthWrite !== "boolean") {
          userData.baseDepthWrite = Boolean(material.depthWrite);
        }

        if (multiplier < 1) {
          material.transparent = true;
          material.opacity = userData.baseOpacity * multiplier;
          material.depthWrite = false;
        } else {
          material.transparent = userData.baseTransparent ?? false;
          material.opacity = userData.baseOpacity;
          material.depthWrite =
            typeof userData.baseDepthWrite === "boolean"
              ? userData.baseDepthWrite
              : true;
        }

        material.needsUpdate = true;
      });
    });
  };

  const setHoveredManifestPlacement = (container) => {
    if (manifestEditModeState.hovered === container) {
      return;
    }

    const previous = manifestEditModeState.hovered;
    manifestEditModeState.hovered = container;

    if (previous) {
      updateManifestPlacementVisualState(previous);
    }

    if (container) {
      updateManifestPlacementVisualState(container);
    }

    if (typeof onManifestPlacementHoverChange === "function") {
      onManifestPlacementHoverChange(Boolean(container));
    }
  };

  const setSelectedManifestPlacement = (container) => {
    if (manifestEditModeState.selected === container) {
      return;
    }

    const previous = manifestEditModeState.selected;
    manifestEditModeState.selected = container;

    if (previous) {
      updateManifestPlacementVisualState(previous);
    }

    if (container) {
      updateManifestPlacementVisualState(container);
    }
  };

  const beginManifestPlacementReposition = (container) => {
    if (!container || activePlacement) {
      return;
    }

    if (!manifestPlacements.has(container)) {
      return;
    }

    setHoveredManifestPlacement(null);

    let collidersWereRemoved = clearManifestPlacementColliders(container);

    const containerBounds = computeManifestPlacementBounds(container);

    const playerPosition = controls.getObject().position;
    const distanceToPlayer = playerPosition.distanceTo(container.position);
    const placementDistance = Number.isFinite(distanceToPlayer)
      ? Math.max(MIN_MANIFEST_PLACEMENT_DISTANCE, distanceToPlayer)
      : MIN_MANIFEST_PLACEMENT_DISTANCE;

    const stackedDependents = collectStackedManifestPlacements(container).map(
      (dependent) => {
        const dependentContainer = dependent?.container ?? null;
        const collidersCleared = clearManifestPlacementColliders(
          dependentContainer
        );

        if (collidersCleared) {
          collidersWereRemoved = true;
        }

        if (!dependentContainer) {
          return {
            ...dependent,
            collidersCleared,
            containerBounds: null,
            previewPlacement: null,
            previewPosition: null,
            lastResolvedPosition: null,
          };
        }

        const containerBounds = computeManifestPlacementBounds(
          dependentContainer
        );
        const previewPlacement = containerBounds?.isEmpty()
          ? null
          : {
              container: dependentContainer,
              containerBounds,
              dependents: [],
            };

        return {
          ...dependent,
          collidersCleared,
          containerBounds,
          previewPlacement,
          previewPosition: dependentContainer.position.clone(),
          lastResolvedPosition: dependentContainer.position.clone(),
        };
      }
    );

    const userData = container.userData || (container.userData = {});

    const placement = {
      entry: userData.manifestEntry ?? null,
      container,
      containerBounds,
      resolve: () => {},
      reject: () => {},
      distance: placementDistance,
      previewDirection: new THREE.Vector3(),
      previewPosition: container.position.clone(),
      pointerHandler: null,
      keydownHandler: null,
      isReposition: true,
      previousState: {
        position: container.position.clone(),
        quaternion: container.quaternion.clone(),
        scale: container.scale.clone(),
      },
      skipEventTypes: new Set(placementPointerEvents),
      dependents: stackedDependents,
      collidersWereRemoved,
    };

    placement.pointerHandler = (event) => {
      if (event.button !== 0) {
        return;
      }

      if (placement.isReposition) {
        const skipEvents = placement.skipEventTypes;

        if (skipEvents instanceof Set && skipEvents.has(event.type)) {
          skipEvents.delete(event.type);
          return;
        }
      }

      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      finalizeActivePlacement();
    };

    placement.keydownHandler = (event) => {
      if (event.code === "Escape") {
        cancelActivePlacement(
          new PlacementCancelledError("Placement cancelled"),
          { restoreOnCancel: true }
        );
      }
    };

    activePlacement = placement;

    placementPointerEvents.forEach((eventName) => {
      canvas.addEventListener(eventName, placement.pointerHandler);
    });
    document.addEventListener("keydown", placement.keydownHandler, true);

    if (collidersWereRemoved) {
      rebuildStaticColliders();
    }

    updateActivePlacementPreview();
  };

  const registerManifestPlacement = (container, colliderEntries = []) => {
    if (!container) {
      return;
    }

    manifestPlacements.add(container);

    const userData = container.userData || (container.userData = {});
    userData.manifestPlacementColliders = Array.isArray(colliderEntries)
      ? colliderEntries
      : [];
    userData.isManifestPlacement = true;

    updateManifestPlacementVisualState(container);
  };

  const removeManifestPlacement = (container) => {
    if (!container || !manifestPlacements.has(container)) {
      return null;
    }

    if (manifestEditModeState.hovered === container) {
      setHoveredManifestPlacement(null);
    }

    if (manifestEditModeState.selected === container) {
      setSelectedManifestPlacement(null);
    }

    manifestPlacements.delete(container);

    const colliders = Array.isArray(
      container.userData?.manifestPlacementColliders
    )
      ? container.userData.manifestPlacementColliders
      : [];

    if (colliders.length > 0) {
      unregisterColliderDescriptors(colliders);
      container.userData.manifestPlacementColliders = [];
    }

    scene.remove(container);
    rebuildStaticColliders();

    const placementsRealigned = realignManifestPlacements();

    if (placementsRealigned) {
      rebuildStaticColliders();
    }

    const manifestEntry = container.userData?.manifestEntry ?? null;

    if (typeof onManifestPlacementRemoved === "function") {
      onManifestPlacementRemoved(manifestEntry);
    }

    return manifestEntry;
  };

  const handleManifestEditModePointerDown = (event) => {
    if (
      event.type === "mousedown" &&
      typeof window !== "undefined" &&
      typeof window.PointerEvent === "function"
    ) {
      return;
    }

    if (!manifestEditModeState.enabled) {
      return;
    }

    if (activePlacement) {
      return;
    }

    if (event.button === 0) {
      if (!controls.isLocked) {
        return;
      }

      const hovered = manifestEditModeState.hovered;
      if (hovered) {
        setSelectedManifestPlacement(hovered);
        beginManifestPlacementReposition(hovered);
      }
    } else if (event.button === 2) {
      setSelectedManifestPlacement(null);
    }
  };

  const handleManifestEditModeKeydown = (event) => {
    if (!manifestEditModeState.enabled) {
      return;
    }

    const target = event.target;

    if (target instanceof HTMLElement) {
      const tagName = target.tagName;

      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
        return;
      }

      if (target.isContentEditable) {
        return;
      }
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setManifestEditModeEnabled(false);
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      const selected = manifestEditModeState.selected;

      if (!selected) {
        return;
      }

      event.preventDefault();
      if (activePlacement && activePlacement.container === selected) {
        cancelActivePlacement(
          new PlacementCancelledError("Placement removed"),
          { restoreOnCancel: false }
        );
      }

      removeManifestPlacement(selected);
    }
  };

  const updateManifestEditModeHover = () => {
    if (!manifestEditModeState.enabled) {
      if (manifestEditModeState.hovered) {
        setHoveredManifestPlacement(null);
      }
      return;
    }

    if (activePlacement && activePlacement.isReposition) {
      if (manifestEditModeState.hovered) {
        setHoveredManifestPlacement(null);
      }
      return;
    }

    if (!controls.isLocked || manifestPlacements.size === 0) {
      if (manifestEditModeState.hovered) {
        setHoveredManifestPlacement(null);
      }
      return;
    }

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersections = raycaster.intersectObjects(
      Array.from(manifestPlacements),
      true
    );

    if (intersections.length === 0) {
      if (manifestEditModeState.hovered) {
        setHoveredManifestPlacement(null);
      }
      return;
    }

    const intersection = intersections[0];
    const placement = getManifestPlacementRoot(intersection.object);
    setHoveredManifestPlacement(placement);
  };

  const setManifestEditModeEnabled = (enabled) => {
    const nextEnabled = Boolean(enabled);

    if (nextEnabled === manifestEditModeState.enabled) {
      return manifestEditModeState.enabled;
    }

    manifestEditModeState.enabled = nextEnabled;

    if (manifestEditModeState.pointerDownHandlerAttached) {
      canvas.removeEventListener(
        "pointerdown",
        handleManifestEditModePointerDown
      );
      canvas.removeEventListener(
        "mousedown",
        handleManifestEditModePointerDown
      );
      manifestEditModeState.pointerDownHandlerAttached = false;
    }

    if (manifestEditModeState.keydownHandlerAttached) {
      document.removeEventListener(
        "keydown",
        handleManifestEditModeKeydown,
        true
      );
      manifestEditModeState.keydownHandlerAttached = false;
    }

    if (nextEnabled) {
      canvas.addEventListener("pointerdown", handleManifestEditModePointerDown);
      canvas.addEventListener("mousedown", handleManifestEditModePointerDown);
      document.addEventListener("keydown", handleManifestEditModeKeydown, true);
      manifestEditModeState.pointerDownHandlerAttached = true;
      manifestEditModeState.keydownHandlerAttached = true;
      updateManifestEditModeHover();
    } else {
      setHoveredManifestPlacement(null);
      setSelectedManifestPlacement(null);
    }

    manifestPlacements.forEach(updateManifestPlacementVisualState);

    if (typeof onManifestEditModeChange === "function") {
      onManifestEditModeChange(manifestEditModeState.enabled);
    }

    return manifestEditModeState.enabled;
  };

  controls.addEventListener("lock", () => {
    if (typeof onControlsLocked === "function") {
      onControlsLocked();
    }
  });

  controls.addEventListener("unlock", () => {
    if (typeof onControlsUnlocked === "function") {
      onControlsUnlocked();
    }

    updateTerminalInteractableState(false);
    updateLiftInteractableState(false);
    setManifestEditModeEnabled(false);
    if (activePlacement) {
      cancelActivePlacement(
        new PlacementCancelledError("Pointer lock released")
      );
    }
  });

  const attemptPointerLock = () => {
    if (!controls.isLocked) {
      canvas.focus();
      controls.lock();
    }
  };

  canvas.addEventListener("click", attemptPointerLock);
  canvas.addEventListener("pointerdown", attemptPointerLock);

  const getTargetedLiftControl = () => {
    if (liftInteractables.length === 0) {
      return null;
    }

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersections = raycaster.intersectObjects(
      liftInteractables,
      false
    );

    if (intersections.length === 0) {
      return null;
    }

    const intersection = intersections.find((candidate) =>
      candidate.object?.userData?.isLiftControl
    );

    if (
      !intersection ||
      intersection.distance > MAX_LIFT_INTERACTION_DISTANCE
    ) {
      return null;
    }

    return intersection.object;
  };

  const travelToNextLiftFloor = () => {
    if (typeof travelToLiftFloor !== "function") {
      return false;
    }

    if (!Array.isArray(liftState.floors) || liftState.floors.length <= 1) {
      return false;
    }

    const nextIndex = THREE.MathUtils.euclideanModulo(
      liftState.currentIndex + 1,
      liftState.floors.length
    );

    if (nextIndex === liftState.currentIndex) {
      return false;
    }

    return travelToLiftFloor(nextIndex, { reason: "cycle" });
  };

  const getTargetedTerminalZone = () => {
    if (quickAccessInteractables.length === 0) {
      return null;
    }

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersections = raycaster.intersectObjects(
      quickAccessInteractables,
      false
    );

    if (intersections.length === 0) {
      return null;
    }

    const intersection = intersections.find((candidate) => {
      const zonesProviderCandidate =
        candidate.object.userData?.getQuickAccessZones;
      const sizeProviderCandidate =
        candidate.object.userData?.getQuickAccessTextureSize;

      return (
        typeof zonesProviderCandidate === "function" &&
        typeof sizeProviderCandidate === "function"
      );
    });

    if (
      !intersection ||
      intersection.distance > MAX_TERMINAL_INTERACTION_DISTANCE ||
      !intersection.uv
    ) {
      return null;
    }

    const zones = intersection.object.userData.getQuickAccessZones();
    const textureSize =
      intersection.object.userData.getQuickAccessTextureSize();

    if (
      !Array.isArray(zones) ||
      !textureSize ||
      !Number.isFinite(textureSize.width) ||
      !Number.isFinite(textureSize.height)
    ) {
      return null;
    }

    const pixelX = intersection.uv.x * textureSize.width;
    const pixelY = (1 - intersection.uv.y) * textureSize.height;

    const matchedZone = zones.find(
      (zone) =>
        pixelX >= zone.minX &&
        pixelX <= zone.maxX &&
        pixelY >= zone.minY &&
        pixelY <= zone.maxY
    );

    if (!matchedZone) {
      return null;
    }

    return matchedZone;
  };

  const handleCanvasClick = () => {
    if (!controls.isLocked) {
      return;
    }

    const targetedLiftControl = getTargetedLiftControl();
    if (targetedLiftControl) {
      if (typeof onLiftControlInteract === "function") {
        if (controls.isLocked) {
          controls.unlock();
        }
        onLiftControlInteract({ control: targetedLiftControl });
      }
      return;
    }

    if (quickAccessInteractables.length === 0) {
      return;
    }

    const matchedZone = getTargetedTerminalZone();

    if (!matchedZone) {
      return;
    }

    if (typeof onTerminalOptionSelected === "function") {
      if (controls.isLocked) {
        controls.unlock();
      }
      onTerminalOptionSelected({
        id: matchedZone.id,
        title: matchedZone.title,
        description: matchedZone.description,
      });
    }
  };

  canvas.addEventListener("click", handleCanvasClick);

  const movementState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };

  let movementEnabled = true;

  const direction = new THREE.Vector3();
  const clock = new THREE.Clock();
  const manifestPlacementPadding = new THREE.Vector3(0.05, 0.05, 0.05);
  const clearManifestPlacementColliders = (container) => {
    if (!container) {
      return false;
    }

    const userData = container.userData || (container.userData = {});
    const colliders = Array.isArray(userData.manifestPlacementColliders)
      ? userData.manifestPlacementColliders
      : [];

    if (colliders.length === 0) {
      userData.manifestPlacementColliders = [];
      return false;
    }

    unregisterColliderDescriptors(colliders);
    userData.manifestPlacementColliders = [];

    return true;
  };

  const refreshManifestPlacementColliders = (container) => {
    if (!container) {
      return [];
    }

    const colliderEntries = registerCollidersForImportedRoot(container, {
      padding: manifestPlacementPadding,
    });

    const userData = container.userData || (container.userData = {});
    userData.manifestPlacementColliders = Array.isArray(colliderEntries)
      ? colliderEntries
      : [];

    return userData.manifestPlacementColliders;
  };
  const PLACEMENT_VERTICAL_TOLERANCE = 1e-3;
  const ROOM_BOUNDARY_PADDING = 1e-3;
  const placementPointerEvents = ["pointerdown", "mousedown"];
  const MIN_MANIFEST_PLACEMENT_DISTANCE = 2;
  const MAX_MANIFEST_PLACEMENT_DISTANCE = Math.max(
    MIN_MANIFEST_PLACEMENT_DISTANCE,
    roomDepth / 2 - 0.5
  );
  const MANIFEST_PLACEMENT_DISTANCE_STEP = 0.5;
  const placementPreviewBasePosition = new THREE.Vector3();
  const placementComputedPosition = new THREE.Vector3();
  const placementBoundsWorldPosition = new THREE.Vector3();
  const placementDependentOffset = new THREE.Vector3();
  const placementDependentPreviousPosition = new THREE.Vector3();
  const placementPreviousPreviewPosition = new THREE.Vector3();
  const placementCollisionBox = new THREE.Box3();
  const placementPreviousCollisionBox = new THREE.Box3();
  const stackingBoundsBase = new THREE.Box3();
  const stackingBoundsCandidate = new THREE.Box3();
  const STACKING_VERTICAL_TOLERANCE = 0.02;
  const STACKING_HORIZONTAL_TOLERANCE = 1e-3;

  const collectStackedManifestPlacements = (rootContainer) => {
    if (!rootContainer) {
      return [];
    }

    const dependents = [];
    const visited = new Set([rootContainer]);
    const toProcess = [rootContainer];

    while (toProcess.length > 0) {
      const current = toProcess.pop();

      if (!current) {
        continue;
      }

      current.updateMatrixWorld(true);
      stackingBoundsBase.setFromObject(current);

      manifestPlacements.forEach((candidate) => {
        if (!candidate || visited.has(candidate) || candidate === current) {
          return;
        }

        candidate.updateMatrixWorld(true);
        stackingBoundsCandidate.setFromObject(candidate);

        if (stackingBoundsCandidate.isEmpty()) {
          return;
        }

        const verticalGap =
          stackingBoundsCandidate.min.y - stackingBoundsBase.max.y;

        if (Math.abs(verticalGap) > STACKING_VERTICAL_TOLERANCE) {
          return;
        }

        const overlapsHorizontally =
          stackingBoundsCandidate.max.x >
            stackingBoundsBase.min.x - STACKING_HORIZONTAL_TOLERANCE &&
          stackingBoundsCandidate.min.x <
            stackingBoundsBase.max.x + STACKING_HORIZONTAL_TOLERANCE &&
          stackingBoundsCandidate.max.z >
            stackingBoundsBase.min.z - STACKING_HORIZONTAL_TOLERANCE &&
          stackingBoundsCandidate.min.z <
            stackingBoundsBase.max.z + STACKING_HORIZONTAL_TOLERANCE;

        if (!overlapsHorizontally) {
          return;
        }

        visited.add(candidate);
        dependents.push({
          container: candidate,
          initialPosition: candidate.position.clone(),
        });
        toProcess.push(candidate);
      });
    }

    return dependents;
  };

  const computePlacementPosition = (placement, basePosition) => {
    placementComputedPosition.copy(basePosition);

    let supportingColliders = null;

    if (placement) {
      if (Array.isArray(placement.supportColliders)) {
        supportingColliders = placement.supportColliders;
        supportingColliders.length = 0;
      } else {
        supportingColliders = [];
        placement.supportColliders = supportingColliders;
      }
    }

    if (!placement || !placement.containerBounds) {
      if (supportingColliders) {
        supportingColliders.length = 0;
      }

      if (!Number.isFinite(placementComputedPosition.y)) {
        placementComputedPosition.y = roomFloorY;
      }
      return placementComputedPosition;
    }

    const container = placement.container ?? null;
    const bounds = placement.containerBounds;

    if (bounds.isEmpty()) {
      placementComputedPosition.y = roomFloorY;
      return placementComputedPosition;
    }

    if (!Number.isFinite(placementComputedPosition.x)) {
      placementComputedPosition.x = Number.isFinite(basePosition.x)
        ? basePosition.x
        : 0;
    }

    if (!Number.isFinite(placementComputedPosition.z)) {
      placementComputedPosition.z = Number.isFinite(basePosition.z)
        ? basePosition.z
        : 0;
    }

    const roomMinX = -roomWidth / 2 + ROOM_BOUNDARY_PADDING;
    const roomMaxX = roomWidth / 2 - ROOM_BOUNDARY_PADDING;
    const roomMinZ = -roomDepth / 2 + ROOM_BOUNDARY_PADDING;
    const roomMaxZ = roomDepth / 2 - ROOM_BOUNDARY_PADDING;

    let footprintMinX = placementComputedPosition.x + bounds.min.x;
    let footprintMaxX = placementComputedPosition.x + bounds.max.x;
    let footprintMinZ = placementComputedPosition.z + bounds.min.z;
    let footprintMaxZ = placementComputedPosition.z + bounds.max.z;

    if (footprintMinX < roomMinX) {
      placementComputedPosition.x += roomMinX - footprintMinX;
      footprintMinX = roomMinX;
      footprintMaxX = placementComputedPosition.x + bounds.max.x;
    } else if (footprintMaxX > roomMaxX) {
      placementComputedPosition.x += roomMaxX - footprintMaxX;
      footprintMaxX = roomMaxX;
      footprintMinX = placementComputedPosition.x + bounds.min.x;
    }

    if (footprintMinZ < roomMinZ) {
      placementComputedPosition.z += roomMinZ - footprintMinZ;
      footprintMinZ = roomMinZ;
      footprintMaxZ = placementComputedPosition.z + bounds.max.z;
    } else if (footprintMaxZ > roomMaxZ) {
      placementComputedPosition.z += roomMaxZ - footprintMaxZ;
      footprintMaxZ = roomMaxZ;
      footprintMinZ = placementComputedPosition.z + bounds.min.z;
    }

    const baseY = Number.isFinite(basePosition.y)
      ? basePosition.y
      : roomFloorY;

    if (!Number.isFinite(placementComputedPosition.y)) {
      placementComputedPosition.y = baseY;
    }

    const boundsHeight = bounds.max.y - bounds.min.y;

    let supportHeight = roomFloorY;
    let currentTop = supportHeight + boundsHeight;

    colliderDescriptors.forEach((descriptor) => {
      const box = descriptor.box;

      if (!box || box.isEmpty()) {
        return;
      }

      if (
        container &&
        (descriptor.root === container ||
          isObjectDescendantOf(descriptor.object, container))
      ) {
        return;
      }

      if (
        footprintMaxX <= box.min.x ||
        footprintMinX >= box.max.x ||
        footprintMaxZ <= box.min.z ||
        footprintMinZ >= box.max.z
      ) {
        return;
      }

      const paddingY =
        descriptor.padding instanceof THREE.Vector3
          ? descriptor.padding.y
          : 0;

      const supportBottom = box.min.y + paddingY;

      if (supportBottom >= currentTop - PLACEMENT_VERTICAL_TOLERANCE) {
        return;
      }

      const effectiveTop = box.max.y - paddingY;

      if (effectiveTop > supportHeight) {
        supportHeight = effectiveTop;
        currentTop = supportHeight + boundsHeight;

        if (supportingColliders) {
          supportingColliders.length = 0;
          supportingColliders.push(descriptor);
        }
        return;
      }

      if (
        supportingColliders &&
        Math.abs(effectiveTop - supportHeight) <= STACKING_VERTICAL_TOLERANCE
      ) {
        supportingColliders.push(descriptor);
      }
    });

    placementComputedPosition.y = supportHeight - bounds.min.y;
    return placementComputedPosition;
  };

  const resolvePlacementPreviewCollisions = (placement, previousPosition) => {
    if (!placement || !placement.container) {
      return false;
    }

    const bounds = placement.containerBounds;

    if (!bounds || bounds.isEmpty()) {
      return false;
    }

    const container = placement.container;
    const position = container.position;
    const dependents = Array.isArray(placement.dependents)
      ? placement.dependents
      : [];
    const supportingColliders = Array.isArray(placement.supportColliders)
      ? placement.supportColliders
      : null;

    placementCollisionBox.min.copy(bounds.min).add(position);
    placementCollisionBox.max.copy(bounds.max).add(position);

    let previousBox = null;

    if (previousPosition) {
      placementPreviousCollisionBox.min.copy(bounds.min).add(previousPosition);
      placementPreviousCollisionBox.max.copy(bounds.max).add(previousPosition);
      previousBox = placementPreviousCollisionBox;
    }

    const roomMinX = -roomWidth / 2 + ROOM_BOUNDARY_PADDING;
    const roomMaxX = roomWidth / 2 - ROOM_BOUNDARY_PADDING;
    const roomMinZ = -roomDepth / 2 + ROOM_BOUNDARY_PADDING;
    const roomMaxZ = roomDepth / 2 - ROOM_BOUNDARY_PADDING;

    const applyOffset = (offsetX, offsetZ) => {
      if (offsetX) {
        position.x += offsetX;
        placementCollisionBox.min.x += offsetX;
        placementCollisionBox.max.x += offsetX;
      }

      if (offsetZ) {
        position.z += offsetZ;
        placementCollisionBox.min.z += offsetZ;
        placementCollisionBox.max.z += offsetZ;
      }
    };

    const clampToRoomBounds = () => {
      let adjusted = false;

      if (placementCollisionBox.min.x < roomMinX) {
        applyOffset(roomMinX - placementCollisionBox.min.x, 0);
        adjusted = true;
      } else if (placementCollisionBox.max.x > roomMaxX) {
        applyOffset(roomMaxX - placementCollisionBox.max.x, 0);
        adjusted = true;
      }

      if (placementCollisionBox.min.z < roomMinZ) {
        applyOffset(0, roomMinZ - placementCollisionBox.min.z);
        adjusted = true;
      } else if (placementCollisionBox.max.z > roomMaxZ) {
        applyOffset(0, roomMaxZ - placementCollisionBox.max.z);
        adjusted = true;
      }

      return adjusted;
    };

    const isPlacementObject = (object) => {
      if (!object) {
        return false;
      }

      if (object === container || isObjectDescendantOf(object, container)) {
        return true;
      }

      return dependents.some((dependent) => {
        const dependentContainer = dependent?.container ?? null;
        return (
          dependentContainer &&
          (object === dependentContainer ||
            isObjectDescendantOf(object, dependentContainer))
        );
      });
    };

    let collisionResolved = clampToRoomBounds();
    const maxIterations = 10;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      let iterationAdjusted = false;

      for (let i = 0; i < colliderDescriptors.length; i += 1) {
        const descriptor = colliderDescriptors[i];

        if (!descriptor) {
          continue;
        }

        if (isPlacementObject(descriptor.object) || isPlacementObject(descriptor.root)) {
          continue;
        }

        const box = descriptor.box;

        if (!box || box.isEmpty()) {
          continue;
        }

        if (
          placementCollisionBox.max.y <= box.min.y ||
          placementCollisionBox.min.y >= box.max.y
        ) {
          continue;
        }

        const overlapX =
          Math.min(placementCollisionBox.max.x, box.max.x) -
          Math.max(placementCollisionBox.min.x, box.min.x);
        const overlapZ =
          Math.min(placementCollisionBox.max.z, box.max.z) -
          Math.max(placementCollisionBox.min.z, box.min.z);
        const overlapY =
          Math.min(placementCollisionBox.max.y, box.max.y) -
          Math.max(placementCollisionBox.min.y, box.min.y);

        if (
          supportingColliders &&
          supportingColliders.includes(descriptor)
        ) {
          const allowedOverlap =
            (descriptor.padding instanceof THREE.Vector3
              ? descriptor.padding.y
              : 0) + STACKING_VERTICAL_TOLERANCE;

          if (overlapY <= allowedOverlap) {
            continue;
          }
        }

        if (
          overlapX <= 0 ||
          overlapZ <= 0 ||
          overlapY <= STACKING_VERTICAL_TOLERANCE
        ) {
          continue;
        }

        if (overlapX < overlapZ) {
          const overlapLeft = placementCollisionBox.max.x - box.min.x;
          const overlapRight = box.max.x - placementCollisionBox.min.x;
          let shiftX = 0;

          if (previousBox && previousBox.max.x <= box.min.x) {
            shiftX = box.min.x - placementCollisionBox.max.x;
          } else if (previousBox && previousBox.min.x >= box.max.x) {
            shiftX = box.max.x - placementCollisionBox.min.x;
          } else if (overlapLeft < overlapRight) {
            shiftX = box.min.x - placementCollisionBox.max.x;
          } else {
            shiftX = box.max.x - placementCollisionBox.min.x;
          }

          if (shiftX !== 0) {
            applyOffset(shiftX, 0);
            iterationAdjusted = true;
          }
        } else {
          const overlapBack = placementCollisionBox.max.z - box.min.z;
          const overlapFront = box.max.z - placementCollisionBox.min.z;
          let shiftZ = 0;

          if (previousBox && previousBox.max.z <= box.min.z) {
            shiftZ = box.min.z - placementCollisionBox.max.z;
          } else if (previousBox && previousBox.min.z >= box.max.z) {
            shiftZ = box.max.z - placementCollisionBox.min.z;
          } else if (overlapBack < overlapFront) {
            shiftZ = box.min.z - placementCollisionBox.max.z;
          } else {
            shiftZ = box.max.z - placementCollisionBox.min.z;
          }

          if (shiftZ !== 0) {
            applyOffset(0, shiftZ);
            iterationAdjusted = true;
          }
        }

        if (iterationAdjusted) {
          collisionResolved = true;
          clampToRoomBounds();
          break;
        }
      }

      if (!iterationAdjusted) {
        break;
      }
    }

    if (collisionResolved) {
      container.position.x = position.x;
      container.position.z = position.z;
    }

    return collisionResolved;
  };

  const computeManifestPlacementBounds = (container) => {
    const bounds = new THREE.Box3();

    if (!container) {
      return bounds;
    }

    container.updateMatrixWorld(true);
    bounds.setFromObject(container);

    if (bounds.isEmpty()) {
      return bounds;
    }

    container.getWorldPosition(placementBoundsWorldPosition);
    bounds.min.sub(placementBoundsWorldPosition);
    bounds.max.sub(placementBoundsWorldPosition);

    return bounds;
  };

  const realignManifestPlacements = ({ exclude } = {}) => {
    let anyChanged = false;

    manifestPlacements.forEach((container) => {
      if (!container || container === exclude) {
        return;
      }

      const bounds = computeManifestPlacementBounds(container);

      if (bounds.isEmpty()) {
        return;
      }

      const computedPosition = computePlacementPosition(
        { container, containerBounds: bounds },
        container.position
      );

      if (!container.position.equals(computedPosition)) {
        container.position.copy(computedPosition);
        container.updateMatrixWorld(true);
        anyChanged = true;
      }
    });

    return anyChanged;
  };

  function clearPlacementEventListeners(placement) {
    if (!placement) {
      return;
    }

    placementPointerEvents.forEach((eventName) => {
      if (placement.pointerHandler) {
        canvas.removeEventListener(eventName, placement.pointerHandler);
      }
    });

    if (placement.pointerHandler) {
      placement.pointerHandler = null;
    }

    if (placement.wheelHandler) {
      canvas.removeEventListener("wheel", placement.wheelHandler);
      placement.wheelHandler = null;
    }

    if (placement.keydownHandler) {
      document.removeEventListener("keydown", placement.keydownHandler, true);
      placement.keydownHandler = null;
    }
  }

  function cancelActivePlacement(reason, options = {}) {
    if (!activePlacement) {
      return;
    }

    const placement = activePlacement;
    clearPlacementEventListeners(placement);
    activePlacement = null;

    const restoreOnCancel =
      options.restoreOnCancel ?? (placement.isReposition ? true : false);

    if (placement.isReposition && restoreOnCancel) {
      const container = placement.container;
      const previousState = placement.previousState;

      if (previousState) {
        container.position.copy(previousState.position);
        container.quaternion.copy(previousState.quaternion);
        container.scale.copy(previousState.scale);
        container.updateMatrixWorld(true);
      }

      if (Array.isArray(placement.dependents)) {
        placement.dependents.forEach((dependent) => {
          if (!dependent?.container || !dependent.initialPosition) {
            return;
          }

          dependent.container.position.copy(dependent.initialPosition);
          dependent.container.updateMatrixWorld(true);
        });
      }

      const colliderEntries = registerCollidersForImportedRoot(container, {
        padding: manifestPlacementPadding,
      });
      registerManifestPlacement(container, colliderEntries);

      let shouldRebuildColliders = Boolean(placement.collidersWereRemoved);

      if (Array.isArray(colliderEntries) && colliderEntries.length > 0) {
        shouldRebuildColliders = true;
      }

      if (Array.isArray(placement.dependents) && placement.dependents.length > 0) {
        placement.dependents.forEach((dependent) => {
          if (!dependent?.container || !dependent.collidersCleared) {
            return;
          }

          const dependentEntries = refreshManifestPlacementColliders(
            dependent.container
          );

          if (Array.isArray(dependentEntries) && dependentEntries.length > 0) {
            shouldRebuildColliders = true;
          }
        });
      }

      if (shouldRebuildColliders) {
        rebuildStaticColliders();
      }
    } else {
      scene.remove(placement.container);
    }

    let error;

    if (reason instanceof PlacementCancelledError) {
      error = reason;
    } else if (reason instanceof Error) {
      error = new PlacementCancelledError(reason.message);
      error.cause = reason;
    } else {
      error = new PlacementCancelledError();
    }

    if (typeof placement.reject === "function") {
      placement.reject(error);
    }
  }

  function finalizeActivePlacement() {
    if (!activePlacement) {
      return;
    }

    const placement = activePlacement;
    clearPlacementEventListeners(placement);
    activePlacement = null;

    const finalPosition = computePlacementPosition(
      placement,
      placement.previewPosition
    );

    placement.previewPosition.copy(finalPosition);
    placement.container.position.copy(placement.previewPosition);
    placement.container.updateMatrixWorld(true);

    const colliderEntries = registerCollidersForImportedRoot(placement.container, {
      padding: manifestPlacementPadding,
    });
    registerManifestPlacement(placement.container, colliderEntries);

    let shouldRebuildColliders = Boolean(placement.collidersWereRemoved);

    if (Array.isArray(colliderEntries) && colliderEntries.length > 0) {
      shouldRebuildColliders = true;
    }

    if (Array.isArray(placement.dependents) && placement.dependents.length > 0) {
      placement.dependents.forEach((dependent) => {
        if (!dependent?.container || !dependent.collidersCleared) {
          return;
        }

        const dependentEntries = refreshManifestPlacementColliders(
          dependent.container
        );

        if (Array.isArray(dependentEntries) && dependentEntries.length > 0) {
          shouldRebuildColliders = true;
        }
      });
    }

    if (shouldRebuildColliders) {
      rebuildStaticColliders();
    }

    if (placement.isReposition) {
      const placementsRealigned = realignManifestPlacements({
        exclude: placement.container,
      });

      if (placementsRealigned) {
        rebuildStaticColliders();
      }
    }

    if (placement.isReposition) {
      setSelectedManifestPlacement(null);
      setHoveredManifestPlacement(null);
      updateManifestEditModeHover();
    }

    if (typeof placement.resolve === "function") {
      placement.resolve(placement.container);
    }
  }

  function updateActivePlacementPreview() {
    if (!activePlacement) {
      return;
    }

    const placement = activePlacement;
    const playerPosition = controls.getObject().position;
    const directionVector = placement.previewDirection;

    placementPreviousPreviewPosition.copy(placement.previewPosition);

    camera.getWorldDirection(directionVector);
    directionVector.y = 0;

    if (directionVector.lengthSq() < 1e-6) {
      directionVector.set(0, 0, -1);
    } else {
      directionVector.normalize();
    }

    placementPreviewBasePosition
      .copy(playerPosition)
      .addScaledVector(directionVector, placement.distance);

    const halfWidth = roomWidth / 2 - 1;
    const halfDepth = roomDepth / 2 - 1;

    placementPreviewBasePosition.x = THREE.MathUtils.clamp(
      placementPreviewBasePosition.x,
      -halfWidth,
      halfWidth
    );
    placementPreviewBasePosition.z = THREE.MathUtils.clamp(
      placementPreviewBasePosition.z,
      -halfDepth,
      halfDepth
    );

    const computedPosition = computePlacementPosition(
      placement,
      placementPreviewBasePosition
    );

    placement.previewPosition.copy(computedPosition);
    placement.container.position.copy(placement.previewPosition);

    const collisionsResolved = resolvePlacementPreviewCollisions(
      placement,
      placementPreviousPreviewPosition
    );

    if (collisionsResolved) {
      placement.previewPosition.copy(placement.container.position);
    }

    placement.container.updateMatrixWorld(true);

    if (Array.isArray(placement.dependents) && placement.dependents.length > 0) {
      placementDependentOffset
        .copy(placement.container.position)
        .sub(placement.previousState?.position ?? placement.container.position);

      placement.dependents.forEach((dependent) => {
        if (!dependent?.container || !dependent.initialPosition) {
          return;
        }

        const previewPosition =
          dependent.previewPosition ??
          (dependent.previewPosition = new THREE.Vector3());
        previewPosition
          .copy(dependent.initialPosition)
          .add(placementDependentOffset);

        const previousResolvedPosition = dependent.lastResolvedPosition
          ? placementDependentPreviousPosition.copy(
              dependent.lastResolvedPosition
            )
          : placementDependentPreviousPosition
              .copy(dependent.initialPosition)
              .add(placementDependentOffset);

        dependent.container.position.copy(previewPosition);

        let dependentCollisionsResolved = false;

        const previewPlacement = dependent.previewPlacement ?? null;

        if (previewPlacement?.dependents) {
          const previewDependents = previewPlacement.dependents;
          previewDependents.length = 0;

          if (placement.container) {
            previewDependents.push({ container: placement.container });
          }

          placement.dependents.forEach((other) => {
            if (!other?.container || other === dependent) {
              return;
            }

            previewDependents.push({ container: other.container });
          });

          dependentCollisionsResolved = resolvePlacementPreviewCollisions(
            previewPlacement,
            previousResolvedPosition
          );
        }

        if (dependentCollisionsResolved && previewPlacement) {
          previewPosition.copy(dependent.container.position);
        }

        if (!dependent.lastResolvedPosition) {
          dependent.lastResolvedPosition = new THREE.Vector3();
        }

        dependent.lastResolvedPosition.copy(dependent.container.position);
        dependent.container.updateMatrixWorld(true);
      });
    }
  }

  const createManifestPlacementContainer = (object, manifestEntry) => {
    const container = new THREE.Group();
    container.name = manifestEntry?.label
      ? `ManifestModel:${manifestEntry.label}`
      : "ManifestModel";
    const userData = container.userData || (container.userData = {});
    userData.manifestEntry = manifestEntry ?? null;
    container.add(object);

    const boundingBox = new THREE.Box3().setFromObject(container);

    if (!boundingBox.isEmpty()) {
      const center = boundingBox.getCenter(new THREE.Vector3());
      object.position.sub(center);
      container.updateMatrixWorld(true);
    }

    return container;
  };

  const placeModelFromManifestEntry = async (entry, options = {}) => {
    try {
      setManifestEditModeEnabled(false);
      const loadedObject = await loadModelFromManifestEntry(entry);

      if (!loadedObject) {
        throw new Error("Unable to load the requested model");
      }

      const container = createManifestPlacementContainer(loadedObject, entry);
      const containerBounds = computeManifestPlacementBounds(container);

      const requestedDistance = Number.isFinite(options?.distance)
        ? options.distance
        : 6;
      const placementDistance = THREE.MathUtils.clamp(
        requestedDistance,
        MIN_MANIFEST_PLACEMENT_DISTANCE,
        MAX_MANIFEST_PLACEMENT_DISTANCE
      );

      cancelActivePlacement(
        new PlacementCancelledError("Placement superseded")
      );

      const placementPromise = new Promise((resolve, reject) => {
        const placement = {
          entry,
          container,
          containerBounds,
          resolve,
          reject,
          distance: placementDistance,
          previewDirection: new THREE.Vector3(),
          previewPosition: new THREE.Vector3(),
          pointerHandler: null,
          wheelHandler: null,
          keydownHandler: null,
        };

        placement.pointerHandler = (event) => {
          if (event.button !== 0) {
            return;
          }

          finalizeActivePlacement();
        };

        placement.wheelHandler = (event) => {
          if (event.cancelable) {
            event.preventDefault();
          }

          if (!event.deltaY) {
            return;
          }

          const delta =
            Math.sign(event.deltaY) * MANIFEST_PLACEMENT_DISTANCE_STEP;
          const nextDistance = THREE.MathUtils.clamp(
            placement.distance + delta,
            MIN_MANIFEST_PLACEMENT_DISTANCE,
            MAX_MANIFEST_PLACEMENT_DISTANCE
          );

          if (nextDistance === placement.distance) {
            return;
          }

          placement.distance = nextDistance;
          updateActivePlacementPreview();
        };

        placement.keydownHandler = (event) => {
          if (event.code === "Escape") {
            cancelActivePlacement(
              new PlacementCancelledError("Placement cancelled")
            );
          }
        };

        activePlacement = placement;

        placementPointerEvents.forEach((eventName) => {
          canvas.addEventListener(eventName, placement.pointerHandler);
        });
        canvas.addEventListener("wheel", placement.wheelHandler, {
          passive: false,
        });
        document.addEventListener("keydown", placement.keydownHandler, true);

        scene.add(container);
        container.updateMatrixWorld(true);
        updateActivePlacementPreview();
      });

      return placementPromise;
    } catch (error) {
      console.error("Unable to place model from manifest", error);
      throw error;
    }
  };

  const setMovementEnabled = (enabled) => {
    movementEnabled = Boolean(enabled);

    if (!movementEnabled) {
      movementState.forward = false;
      movementState.backward = false;
      movementState.left = false;
      movementState.right = false;
      velocity.set(0, 0, 0);
      verticalVelocity = 0;
      jumpRequested = false;
      const groundY = roomFloorY;
      if (playerObject.position.y <= groundY) {
        playerObject.position.y = groundY;
        isGrounded = true;
      }
    }
  };

  const updateMovementState = (code, value) => {
    if (!movementEnabled && value) {
      return;
    }

    switch (code) {
      case "ArrowUp":
      case "KeyW":
        movementState.forward = value;
        break;
      case "ArrowDown":
      case "KeyS":
        movementState.backward = value;
        break;
      case "ArrowLeft":
      case "KeyA":
        movementState.left = value;
        break;
      case "ArrowRight":
      case "KeyD":
        movementState.right = value;
        break;
      default:
        break;
    }
  };

  const onKeyDown = (event) => {
    if (!movementEnabled) {
      return;
    }

    updateMovementState(event.code, true);

    if (event.code === "Space" && !event.repeat && controls.isLocked) {
      jumpRequested = true;
    }

    if (
      !controls.isLocked &&
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "Space",
        "Enter",
      ].includes(event.code)
    ) {
      attemptPointerLock();
    }

    if (
      controls.isLocked &&
      !event.repeat &&
      ["KeyF", "Enter"].includes(event.code)
    ) {
      const targetedLiftControl = getTargetedLiftControl();
      if (targetedLiftControl && travelToNextLiftFloor()) {
        event.preventDefault();
        return;
      }
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
    }
  };

  const onKeyUp = (event) => {
    updateMovementState(event.code, false);
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  function clampWithinActiveFloor() {
    const player = controls.getObject().position;
    const activeFloor = getLiftFloorByIndex(liftState.currentIndex);
    const bounds = activeFloor?.bounds ?? hangarDeckFloorBounds;

    const resolveAxisBounds = (minKey, maxKey) => {
      const fallbackBounds = hangarDeckFloorBounds;
      const minValue = Number.isFinite(bounds?.[minKey])
        ? bounds[minKey]
        : Number.isFinite(fallbackBounds?.[minKey])
        ? fallbackBounds[minKey]
        : null;
      const maxValue = Number.isFinite(bounds?.[maxKey])
        ? bounds[maxKey]
        : Number.isFinite(fallbackBounds?.[maxKey])
        ? fallbackBounds[maxKey]
        : null;

      if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
        return null;
      }

      const min = Math.min(minValue, maxValue);
      const max = Math.max(minValue, maxValue);

      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return null;
      }

      return { min, max };
    };

    const xBounds = resolveAxisBounds("minX", "maxX");
    if (xBounds) {
      player.x = THREE.MathUtils.clamp(player.x, xBounds.min, xBounds.max);
    }

    const zBounds = resolveAxisBounds("minZ", "maxZ");
    if (zBounds) {
      player.z = THREE.MathUtils.clamp(player.z, zBounds.min, zBounds.max);
    }

    const minY = roomFloorY;
    const maxHeadY = roomFloorY + roomHeight - CEILING_CLEARANCE;
    const maxY = Math.max(minY, maxHeadY - playerHeight);

    if (player.y < minY) {
      player.y = minY;
      if (verticalVelocity < 0) {
        verticalVelocity = 0;
      }
      isGrounded = true;
    } else if (player.y > maxY) {
      player.y = maxY;
      if (verticalVelocity > 0) {
        verticalVelocity = 0;
      }
    }
  }

  clampWithinActiveFloor();

  const animate = () => {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    let shouldResolveCollisions = false;

    if (movementEnabled) {
      velocity.x -= velocity.x * 8 * delta;
      velocity.z -= velocity.z * 8 * delta;

      direction.z =
        Number(movementState.forward) - Number(movementState.backward);
      direction.x = Number(movementState.right) - Number(movementState.left);

      if (direction.lengthSq() > 0) {
        direction.normalize();
      }

      if (movementState.forward || movementState.backward) {
        velocity.z -= direction.z * 20 * delta;
      }

      if (movementState.left || movementState.right) {
        velocity.x -= direction.x * 20 * delta;
      }

      if (controls.isLocked) {
        previousPlayerPosition.copy(playerObject.position);
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        shouldResolveCollisions = true;
      }
    } else {
      velocity.set(0, 0, 0);
    }

    if (
      movementEnabled &&
      controls.isLocked &&
      jumpRequested &&
      isGrounded
    ) {
      verticalVelocity = JUMP_VELOCITY;
      isGrounded = false;
    }

    jumpRequested = false;
    isGrounded = false;

    verticalVelocity += GRAVITY * delta;
    playerObject.position.y += verticalVelocity * delta;

    clampWithinActiveFloor();

    if (shouldResolveCollisions) {
      resolvePlayerCollisions(previousPlayerPosition);
    }


    let matchedZone = null;
    let matchedLiftControl = null;

    if (controls.isLocked) {
      matchedLiftControl = getTargetedLiftControl();
      updateLiftInteractableState(Boolean(matchedLiftControl));

      matchedZone = getTargetedTerminalZone();
      updateTerminalInteractableState(Boolean(matchedZone));
    } else {
      updateTerminalInteractableState(false);
      updateLiftInteractableState(false);
    }

    const hoveredZoneId = matchedZone?.id ?? null;
    if (hoveredZoneId !== currentMonitorHoveredZoneId) {
      currentMonitorHoveredZoneId = hoveredZoneId;
      const setHoveredZone = monitorScreen?.userData?.setHoveredZone;
      if (typeof setHoveredZone === "function") {
        setHoveredZone(currentMonitorHoveredZoneId);
      }
    }

    const updateDisplayTexture = monitorScreen?.userData?.updateDisplayTexture;
    if (typeof updateDisplayTexture === "function") {
      updateDisplayTexture(delta, clock.elapsedTime);
    }

    playerStateSaveAccumulator += delta;

    if (playerStateSaveAccumulator >= PLAYER_STATE_SAVE_INTERVAL) {
      playerStateSaveAccumulator = 0;
      savePlayerState();
    }

    updateManifestEditModeHover();
    updateActivePlacementPreview();

    renderer.render(scene, camera);
  };

  animate();

  const handleResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const safeHeight = height > 0 ? height : 1;
    renderer.setSize(width, safeHeight, false);
    camera.aspect = width / safeHeight;
    camera.updateProjectionMatrix();

    reflectiveSurfaces.forEach((reflector) => {
      const renderTarget = reflector?.renderTarget;
      if (!renderTarget || typeof renderTarget.setSize !== "function") {
        return;
      }

      const dimensions =
        reflector?.userData?.renderSurfaceDimensions ?? undefined;
      const surfaceWidth = dimensions?.width;
      const surfaceHeight = dimensions?.height;
      const { width: targetWidth, height: targetHeight } =
        computeReflectorRenderTargetSize(surfaceWidth, surfaceHeight);

      if (
        renderTarget.width !== targetWidth ||
        renderTarget.height !== targetHeight
      ) {
        renderTarget.setSize(targetWidth, targetHeight);
      }
    });
  };

  window.addEventListener("resize", handleResize);

  return {
    scene,
    camera,
    renderer,
    controls,
    setMovementEnabled,
    getPlayerHeight: () => playerHeight,
    setPlayerHeight: (nextHeight, options = {}) =>
      applyPlayerHeight(nextHeight, options),
    setPlayerStatePersistenceEnabled: (enabled = true) => {
      const nextEnabled = Boolean(enabled);
      const previousEnabled = isPlayerStatePersistenceEnabled;

      if (nextEnabled === isPlayerStatePersistenceEnabled) {
        return previousEnabled;
      }

      isPlayerStatePersistenceEnabled = nextEnabled;
      lastSerializedPlayerState = null;
      return previousEnabled;
    },
    placeModelFromManifestEntry,
    setManifestEditModeEnabled,
    isManifestEditModeEnabled: () => manifestEditModeState.enabled,
    hasManifestPlacements: () => manifestPlacements.size > 0,
    unlockPointerLock: () => {
      if (controls.isLocked) {
        controls.unlock();
        return true;
      }

      return false;
    },
    requestPointerLock: () => {
      attemptPointerLock();
    },
    getLiftFloors: () =>
      liftState.floors.map((floor) => ({
        id: floor.id,
        title: floor.title,
        description: floor.description,
      })),
    getActiveLiftFloor: () => {
      const current = getActiveLiftFloor();
      if (!current) {
        return null;
      }

      return {
        id: current.id,
        title: current.title,
        description: current.description,
      };
    },
    cycleLiftFloor: () => travelToNextLiftFloor(),
    setActiveLiftFloorById: (floorId) => {
      if (!floorId) {
        return false;
      }

      const index = liftState.floors.findIndex(
        (floor) => floor?.id === floorId
      );

      if (index < 0) {
        return false;
      }

      return typeof travelToLiftFloor === "function"
        ? travelToLiftFloor(index, { reason: "external" })
        : false;
    },
    dispose: () => {
      if (activePlacement) {
        cancelActivePlacement(
          new PlacementCancelledError("Scene disposed")
        );
      }
      setManifestEditModeEnabled(false);
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("click", attemptPointerLock);
      canvas.removeEventListener("click", handleCanvasClick);
      canvas.removeEventListener("pointerdown", attemptPointerLock);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      updateTerminalInteractableState(false);
      updateLiftInteractableState(false);
      if (typeof lastUpdatedDisplay.userData?.dispose === "function") {
        lastUpdatedDisplay.userData.dispose();
      }
      savePlayerState(true);
      activateDeckEnvironment(null);
      colliderDescriptors.length = 0;
    },
  };
};
