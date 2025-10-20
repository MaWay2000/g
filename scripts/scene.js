import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { Reflector } from "https://unpkg.com/three@0.161.0/examples/jsm/objects/Reflector.js";
import { GLTFLoader } from "https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js";
import { PointerLockControls } from "./pointer-lock-controls.js";

export const PLAYER_STATE_STORAGE_KEY = "dustyNova.playerState";
export const DEFAULT_PLAYER_HEIGHT = 8;
const PLAYER_HEIGHT_STORAGE_KEY = `${PLAYER_STATE_STORAGE_KEY}.height`;
const PLAYER_STATE_SAVE_INTERVAL = 1; // seconds
const DEFAULT_THIRD_PERSON_PITCH = 0;
const MAX_RESTORABLE_PITCH =
  Math.PI / 2 - THREE.MathUtils.degToRad(1);
const PLAYER_MODEL_LAYER = 1;
const ENABLE_PLAYER_MODEL_HEIGHT_SCALING = true;
const PLAYER_MODEL_FORWARD_CLEARANCE_RATIO = 0.1;
const PLAYER_MODEL_FORWARD_CLEARANCE_MIN = 0.05;
const PLAYER_MODEL_FORWARD_CLEARANCE_MAX = 0.35;
const PLAYER_EYE_LEVEL_OVERRIDE = 8;
const PLAYER_MODEL_DEFAULT_ROTATION = new THREE.Euler(0, Math.PI, 0, "YXZ");

const getPlayerCamouflageTexture = (() => {
  let cachedTexture = null;
  let attemptedCreation = false;

  return () => {
    if (cachedTexture || attemptedCreation) {
      return cachedTexture;
    }

    attemptedCreation = true;

    if (typeof document === "undefined") {
      return null;
    }

    const canvas = document.createElement("canvas");
    const size = 256;

    if (!canvas) {
      return null;
    }

    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.imageSmoothingEnabled = false;

    const palette = [
      "#111827",
      "#1f2937",
      "#374151",
      "#4b5563",
      "#6b7280",
      "#9ca3af",
    ];

    context.fillStyle = palette[2];
    context.fillRect(0, 0, size, size);

    const blockSizes = [4, 8, 12, 16, 20];
    const blockCount = 450;

    for (let index = 0; index < blockCount; index += 1) {
      const blockSize = blockSizes[Math.floor(Math.random() * blockSizes.length)];
      const color = palette[Math.floor(Math.random() * palette.length)];
      const x = Math.floor(Math.random() * (size - blockSize));
      const y = Math.floor(Math.random() * (size - blockSize));

      context.fillStyle = color;
      context.fillRect(x, y, blockSize, blockSize);

      if (Math.random() > 0.6) {
        const offsetX = Math.floor((Math.random() - 0.5) * blockSize * 0.6);
        const offsetY = Math.floor((Math.random() - 0.5) * blockSize * 0.6);
        context.fillRect(
          Math.max(0, x + offsetX),
          Math.max(0, y + offsetY),
          blockSize,
          blockSize
        );
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;

    cachedTexture = texture;

    return cachedTexture;
  };
})();

const applyCamouflageToPlayerModel = (root) => {
  const camouflageTexture = getPlayerCamouflageTexture();

  if (!root || !camouflageTexture) {
    return;
  }

  const materialCache = new Map();

  const getMaterialForMesh = (mesh) => {
    const originalMaterial = mesh.material;
    const isSkinned = Boolean(mesh.isSkinnedMesh);
    const side = originalMaterial?.side ?? THREE.FrontSide;
    const transparent = Boolean(originalMaterial?.transparent);
    const opacity =
      typeof originalMaterial?.opacity === "number"
        ? originalMaterial.opacity
        : 1;
    const alphaTest =
      typeof originalMaterial?.alphaTest === "number"
        ? originalMaterial.alphaTest
        : 0;
    const depthWrite =
      typeof originalMaterial?.depthWrite === "boolean"
        ? originalMaterial.depthWrite
        : true;

    const cacheKey = [
      isSkinned ? "skinned" : "static",
      side,
      transparent ? "transparent" : "opaque",
      opacity,
      alphaTest,
      depthWrite,
    ].join(":");

    if (materialCache.has(cacheKey)) {
      return materialCache.get(cacheKey);
    }

    const material = new THREE.MeshStandardMaterial({
      map: camouflageTexture,
      color: new THREE.Color(0xffffff),
      emissive: new THREE.Color(0x111827),
      metalness: 0.08,
      roughness: 0.85,
      skinning: isSkinned,
      transparent,
      opacity,
      alphaTest,
      depthWrite,
      side,
    });

    material.needsUpdate = true;
    materialCache.set(cacheKey, material);

    return material;
  };

  const disposeMaterial = (material) => {
    if (!material) {
      return;
    }

    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
      return;
    }

    if (typeof material.dispose === "function") {
      material.dispose();
    }
  };

  root.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const camouflageMaterial = getMaterialForMesh(child);

    if (!camouflageMaterial) {
      return;
    }

    disposeMaterial(child.material);
    child.material = camouflageMaterial;
  });
};

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
  camera.position.set(0, 0, 8);

  const textureLoader = new THREE.TextureLoader();
  const gltfLoader = new GLTFLoader();

  const colliderDescriptors = [];

  const registerColliderDescriptors = (descriptors) => {
    if (!Array.isArray(descriptors)) {
      return;
    }

    descriptors.forEach((descriptor) => {
      if (!descriptor || !descriptor.object) {
        return;
      }

      const padding = descriptor.padding
        ? descriptor.padding.clone()
        : undefined;

      colliderDescriptors.push({
        object: descriptor.object,
        padding,
        box: new THREE.Box3(),
      });
    });
  };

  const rebuildStaticColliders = () => {
    colliderDescriptors.forEach((descriptor) => {
      const { object, padding, box } = descriptor;

      if (!object || !box) {
        return;
      }

      object.updateWorldMatrix(true, false);
      box.setFromObject(object);

      if (padding) {
        box.min.sub(padding);
        box.max.add(padding);
      }
    });
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
    const texture = textureLoader.load(
      new URL(path, import.meta.url).href,
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
  keyLight.position.set(5, 8, 4);
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0x7dd3fc, 0.4, 50, 2);
  fillLight.position.set(-6, 4, -5);
  scene.add(fillLight);

  const roomWidth = 20;
  const roomHeight = 10;
  const roomDepth = 60;
  const terminalBackOffset = 4;
  const roomFloorY = -roomHeight / 2;

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

  const roomGeometry = new THREE.BoxGeometry(roomWidth, roomHeight, roomDepth);

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
  scene.add(roomMesh);

  const createHangarDoor = () => {
    const group = new THREE.Group();

    const doorWidth = 8.5;
    const doorHeight = 9.0;
    const panelDepth = 0.2;
    const frameDepth = 0.42;
    const frameWidth = 0.48;
    const lintelHeight = 0.42;
    const thresholdHeight = 0.28;
    const seamGap = 0.22;

    const createHazardStripeTexture = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0f1010";
      ctx.fillRect(0, 0, size, size);
      const stripeWidth = size / 3.2;
      ctx.fillStyle = "#facc15";
      for (let offset = -size; offset < size * 2; offset += stripeWidth * 2) {
        ctx.beginPath();
        ctx.moveTo(offset, 0);
        ctx.lineTo(offset + stripeWidth, 0);
        ctx.lineTo(offset, size);
        ctx.lineTo(offset - stripeWidth, size);
        ctx.closePath();
        ctx.fill();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2.5, 1.2);
      texture.rotation = -Math.PI / 5;
      texture.center.set(0.5, 0.5);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
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

    const hazardTexture = createHazardStripeTexture();
    const hazardMaterial = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.35,
      roughness: 0.55,
      map: hazardTexture,
    });

    const hazardPlateThickness = 0.08;
    const hazardTop = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth + frameWidth * 2.8, lintelHeight * 0.72, hazardPlateThickness),
      hazardMaterial
    );
    hazardTop.position.set(0, doorHeight / 2 + lintelHeight * 0.75, frameDepth / 2 + hazardPlateThickness / 2);
    group.add(hazardTop);

    const hazardSideGeometry = new THREE.BoxGeometry(frameWidth * 0.9, doorHeight * 0.95, hazardPlateThickness);
    const hazardLeft = new THREE.Mesh(hazardSideGeometry, hazardMaterial);
    hazardLeft.position.set(-doorWidth / 2 - frameWidth * 0.85, 0, frameDepth / 2 + hazardPlateThickness / 2);
    group.add(hazardLeft);

    const hazardRight = hazardLeft.clone();
    hazardRight.position.x *= -1;
    group.add(hazardRight);

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
      color: new THREE.Color(0x991b1b),
      metalness: 0.4,
      roughness: 0.38,
      emissive: new THREE.Color(0x240303),
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
      color: 0xf87171,
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

    const doorLight = new THREE.PointLight(0xf97316, 0.55, 9, 2);
    doorLight.position.set(0, doorHeight / 2 - 0.2, 0.32);
    group.add(doorLight);

    const overheadBeacon = new THREE.PointLight(0xf97316, 0.4, 8, 2);
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
      color: new THREE.Color(0x991b1b),
      metalness: 0.45,
      roughness: 0.35,
      emissive: new THREE.Color(0x250404),
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

    const controlPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.4, 0.18),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x0a1213),
        roughness: 0.48,
        metalness: 0.4,
        emissive: new THREE.Color(0x040d0d),
        emissiveIntensity: 0.25,
      })
    );
    controlPanel.position.set(doorWidth / 2 + frameWidth * 0.95, 0.1, 0.12);
    group.add(controlPanel);

    const controlScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.48),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      })
    );
    controlScreen.position.set(0, 0.28, 0.11);
    controlPanel.add(controlScreen);

    const controlButton = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 32),
      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        side: THREE.DoubleSide,
      })
    );
    controlButton.position.set(0, -0.3, 0.1);
    controlPanel.add(controlButton);

    const panelLight = new THREE.PointLight(0xf97316, 0.35, 4.5, 2);
    panelLight.position.set(controlPanel.position.x, controlPanel.position.y + 0.3, 0.4);
    group.add(panelLight);

    group.userData.height = doorHeight;
    group.userData.width = doorWidth;

    return group;
  };

  const hangarDoor = createHangarDoor();
  hangarDoor.position.set(
    0,
    -roomHeight / 2 + (hangarDoor.userData.height ?? 0) / 2,
    roomDepth / 2 - 0.32
  );
  scene.add(hangarDoor);

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

      const getDevicePixelRatio = () => {
        if (typeof window === "undefined") {
          return 1;
        }

        const ratio = Number(window.devicePixelRatio);
        return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
      };

      const snapToDevicePixel = (value, pixelRatio = getDevicePixelRatio()) =>
        Math.round(value * pixelRatio) / pixelRatio;

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
    group.scale.setScalar(2.5);

    return group;
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
    3,
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

  scene.add(computerSetup);
  computerSetup.updateMatrixWorld(true);
  rebuildStaticColliders();
  if (typeof computerSetup.userData?.notifyCollidersChanged === "function") {
    computerSetup.userData.notifyCollidersChanged();
  }

  const lastUpdatedDisplay = createLastUpdatedDisplay();
  lastUpdatedDisplay.position.set(-roomWidth / 2 + 0.12, 3.2, 0);
  lastUpdatedDisplay.rotation.y = Math.PI / 2;
  scene.add(lastUpdatedDisplay);

  const createWallMirror = () => {
    const group = new THREE.Group();

    const mirrorWidth = 12;
    const mirrorHeight = 9;
    const frameInset = 0.18;
    const pixelRatio = window.devicePixelRatio ?? 1;

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

    const reflector = new Reflector(
      new THREE.PlaneGeometry(mirrorWidth, mirrorHeight),
      {
        clipBias: 0.0025,
        color: new THREE.Color(0x9fb7cf),
        textureWidth: window.innerWidth * pixelRatio,
        textureHeight: window.innerHeight * pixelRatio,
      }
    );
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
    group.userData.reflector = reflector;

    return group;
  };

  const reflectiveSurfaces = [];
  let attachPlayerModelVisibilityToReflector = null;

  const registerReflectiveSurface = (reflector) => {
    if (!reflector) {
      return;
    }

    reflectiveSurfaces.push(reflector);

    if (typeof attachPlayerModelVisibilityToReflector === "function") {
      attachPlayerModelVisibilityToReflector(reflector);
    }
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
  scene.add(floorGrid);

  const backWallGrid = createGridLines(roomWidth, roomHeight, 20, 10, gridColor, gridOpacity);
  backWallGrid.position.z = -roomDepth / 2 + 0.02;
  scene.add(backWallGrid);

  const frontWallGrid = createGridLines(roomWidth, roomHeight, 20, 10, gridColor, gridOpacity);
  frontWallGrid.rotation.y = Math.PI;
  frontWallGrid.position.z = roomDepth / 2 - 0.02;
  scene.add(frontWallGrid);

  const leftWallGrid = createGridLines(roomDepth, roomHeight, 20, 10, gridColor, gridOpacity);
  leftWallGrid.rotation.y = Math.PI / 2;
  leftWallGrid.position.x = -roomWidth / 2 + 0.02;
  scene.add(leftWallGrid);

  const rightWallGrid = createGridLines(roomDepth, roomHeight, 20, 10, gridColor, gridOpacity);
  rightWallGrid.rotation.y = -Math.PI / 2;
  rightWallGrid.position.x = roomWidth / 2 - 0.02;
  scene.add(rightWallGrid);

  const wallMirror = createWallMirror();
  const mirrorDimensions = wallMirror.userData?.dimensions;
  const mirrorHeight = mirrorDimensions?.height ?? 9;
  wallMirror.position.set(
    roomWidth / 2 - 0.16,
    roomFloorY + 0.5 + mirrorHeight / 2,
    6
  );
  wallMirror.rotation.y = -Math.PI / 2;
  scene.add(wallMirror);

  const wallMirrorReflector = wallMirror.userData?.reflector;
  if (wallMirrorReflector) {
    registerReflectiveSurface(wallMirrorReflector);
  }

  const raycaster = new THREE.Raycaster();
  const quickAccessInteractables = [];
  const MAX_TERMINAL_INTERACTION_DISTANCE = 6.8;

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

  const playerModelGroup = new THREE.Group();
  playerModelGroup.visible = false;
  playerModelGroup.layers.set(PLAYER_MODEL_LAYER);
  playerObject.add(playerModelGroup);

  const playerModelState = {
    mixer: null,
    actions: {
      idle: null,
      walk: null,
    },
    currentAction: null,
    recalculateBounds: null,
    manualAnimator: null,
  };
  let currentPlayerAnimationName = null;

  const playerModelBounds = {
    size: new THREE.Vector3(),
    depth: 0,
    radius: 0,
    minY: 0,
    maxY: 0,
    eyeLevel: 0,
  };
  const playerModelForwardOffsetState = {
    value: 0,
  };

  const updateStoredPlayerModelBounds = (boundingBox, sizeTarget) => {
    if (!boundingBox || typeof boundingBox.isEmpty !== "function") {
      playerModelBounds.size.set(0, 0, 0);
      playerModelBounds.depth = 0;
      playerModelBounds.radius = 0;
      playerModelBounds.minY = 0;
      playerModelBounds.maxY = 0;
      playerModelBounds.eyeLevel = 0;
      playerModelForwardOffsetState.value = 0;
      return;
    }

    if (boundingBox.isEmpty()) {
      playerModelBounds.size.set(0, 0, 0);
      playerModelBounds.depth = 0;
      playerModelBounds.radius = 0;
      playerModelBounds.minY = 0;
      playerModelBounds.maxY = 0;
      playerModelBounds.eyeLevel = 0;
      playerModelForwardOffsetState.value = 0;
      return;
    }

    const targetVector =
      sizeTarget instanceof THREE.Vector3 ? sizeTarget : new THREE.Vector3();
    boundingBox.getSize(targetVector);

    playerModelBounds.size.copy(targetVector);
    playerModelBounds.depth = targetVector.z;
    playerModelBounds.radius = targetVector.length() * 0.5;
    const minY = Number.isFinite(boundingBox.min?.y) ? boundingBox.min.y : 0;
    const maxY = Number.isFinite(boundingBox.max?.y)
      ? boundingBox.max.y
      : minY;
    playerModelBounds.minY = minY;
    playerModelBounds.maxY = maxY;
    const height = Number.isFinite(targetVector.y)
      ? targetVector.y
      : Math.max(maxY - minY, 0);
    const positiveMaxY = Number.isFinite(maxY) ? Math.max(0, maxY) : 0;
    const positiveHeight = height > 0 ? height : Math.max(maxY - minY, 0);

    const computedEyeLevel = positiveMaxY > 0 ? positiveMaxY : positiveHeight;

    if (
      Number.isFinite(PLAYER_EYE_LEVEL_OVERRIDE) &&
      PLAYER_EYE_LEVEL_OVERRIDE > 0
    ) {
      playerModelBounds.eyeLevel = PLAYER_EYE_LEVEL_OVERRIDE;
    } else {
      playerModelBounds.eyeLevel = computedEyeLevel;
    }
    const clearanceFromDepth =
      playerModelBounds.depth * PLAYER_MODEL_FORWARD_CLEARANCE_RATIO;
    const forwardClearance = THREE.MathUtils.clamp(
      clearanceFromDepth,
      PLAYER_MODEL_FORWARD_CLEARANCE_MIN,
      PLAYER_MODEL_FORWARD_CLEARANCE_MAX
    );
    if (playerModelBounds.depth > 0) {
      playerModelForwardOffsetState.value =
        playerModelBounds.depth * 0.5 + forwardClearance;
    } else {
      playerModelForwardOffsetState.value = 0;
    }
  };

  const transitionPlayerModelToAction = (action) => {
    if (!playerModelState.mixer || !action) {
      return;
    }

    if (playerModelState.currentAction === action) {
      return;
    }

    action.reset();
    action.fadeIn(0.2);
    action.play();

    if (playerModelState.currentAction) {
      playerModelState.currentAction.fadeOut(0.2);
    }

    playerModelState.currentAction = action;
  };

  const updatePlayerModelAnimationState = (shouldWalk) => {
    const desiredName = shouldWalk ? "walk" : "idle";
    const fallbackName = shouldWalk ? "idle" : "walk";
    const desiredAction = playerModelState.actions[desiredName];
    const fallbackAction = playerModelState.actions[fallbackName];
    const actionToPlay = desiredAction || fallbackAction;

    if (!actionToPlay) {
      return;
    }

    const resolvedName = desiredAction ? desiredName : fallbackName;

    if (currentPlayerAnimationName === resolvedName) {
      return;
    }

    transitionPlayerModelToAction(actionToPlay);
    currentPlayerAnimationName = resolvedName;
  };

  const defaultPlayerPosition = new THREE.Vector3(0, roomFloorY, 8);
  playerObject.position.copy(defaultPlayerPosition);

  let playerHeight = DEFAULT_PLAYER_HEIGHT;
  let playerEyeLevel = DEFAULT_PLAYER_HEIGHT;
  let initialPitch = DEFAULT_THIRD_PERSON_PITCH;

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

  const firstPersonCameraOffset = new THREE.Vector3(0, playerEyeLevel, 0);
  const updateFirstPersonCameraOffset = () => {
    const offsetY = Number.isFinite(playerEyeLevel)
      ? playerEyeLevel
      : playerHeight;
    const maxEyeLevel = Math.max(playerHeight, MIN_PLAYER_HEIGHT);
    const clampedEyeLevel = THREE.MathUtils.clamp(
      offsetY,
      MIN_PLAYER_HEIGHT,
      maxEyeLevel
    );
    firstPersonCameraOffset.set(0, clampedEyeLevel, 0);
  };
  const thirdPersonCameraOffset = new THREE.Vector3();
  const VIEW_MODES = {
    FIRST_PERSON: "first-person",
    THIRD_PERSON: "third-person",
  };
  let cameraViewMode = VIEW_MODES.FIRST_PERSON;

  attachPlayerModelVisibilityToReflector = (reflector) => {
    if (!reflector || typeof reflector !== "object") {
      return;
    }

    reflector.userData = reflector.userData || {};

    if (reflector.userData.__playerModelVisibilityHookAttached) {
      return;
    }

    reflector.userData.__playerModelVisibilityHookAttached = true;

    const visibilityState = {
      depth: 0,
      previousLayerMask: null,
      previousPlayerLayerMask: null,
    };

    const originalOnBeforeRender = reflector.onBeforeRender;
    const originalOnAfterRender = reflector.onAfterRender;

    reflector.onBeforeRender = function onBeforeRender(...args) {
      if (cameraViewMode !== VIEW_MODES.THIRD_PERSON) {
        if (visibilityState.depth === 0) {
          const renderCamera = this._virtualCamera ?? this.camera ?? null;
          const layers = renderCamera?.layers;

          if (layers && typeof layers.enable === "function") {
            visibilityState.previousLayerMask = layers.mask;
            layers.enable(PLAYER_MODEL_LAYER);
          } else {
            visibilityState.previousLayerMask = null;
          }

          const playerLayers = playerModelGroup?.layers;
          if (playerLayers) {
            visibilityState.previousPlayerLayerMask = playerLayers.mask;
            playerLayers.enable(0);
          } else {
            visibilityState.previousPlayerLayerMask = null;
          }
        }

        visibilityState.depth += 1;
      }

      if (typeof originalOnBeforeRender === "function") {
        originalOnBeforeRender.apply(this, args);
      }
    };

    reflector.onAfterRender = function onAfterRender(...args) {
      if (cameraViewMode !== VIEW_MODES.THIRD_PERSON) {
        visibilityState.depth = Math.max(visibilityState.depth - 1, 0);

        if (visibilityState.depth === 0) {
          if (visibilityState.previousLayerMask !== null) {
            const renderCamera = this._virtualCamera ?? this.camera ?? null;
            const layers = renderCamera?.layers;

            if (layers && typeof layers.enable === "function") {
              layers.mask = visibilityState.previousLayerMask;
            }

            visibilityState.previousLayerMask = null;
          }

          if (visibilityState.previousPlayerLayerMask !== null) {
            const playerLayers = playerModelGroup?.layers;

            if (playerLayers) {
              playerLayers.mask = visibilityState.previousPlayerLayerMask;
            }

            visibilityState.previousPlayerLayerMask = null;
          }
        }
      }

      if (typeof originalOnAfterRender === "function") {
        originalOnAfterRender.apply(this, args);
      }
    };
  };

  reflectiveSurfaces.forEach((reflector) =>
    attachPlayerModelVisibilityToReflector(reflector)
  );
  const THIRD_PERSON_CAMERA_BACK_OFFSET = 2;
  const THIRD_PERSON_CAMERA_HEAD_CLEARANCE = 0.2;

  const updateThirdPersonCameraOffset = () => {
    const backOffset = Math.max(
      THIRD_PERSON_CAMERA_BACK_OFFSET,
      playerModelBounds.radius > 0 ? playerModelBounds.radius * 0.9 : 0
    );
    const headClearance = Math.max(
      THIRD_PERSON_CAMERA_HEAD_CLEARANCE,
      playerHeight > 0 ? playerHeight * 0.15 : 0
    );
    const verticalOffset = playerHeight + headClearance;

    thirdPersonCameraOffset.set(0, verticalOffset, backOffset);
  };

  const applyPlayerModelLayerVisibilityForCamera = () => {
    if (!camera?.layers) {
      return;
    }

    camera.layers.enable(PLAYER_MODEL_LAYER);
  };

  applyPlayerModelLayerVisibilityForCamera();

  const refreshCameraViewMode = () => {
    if (cameraViewMode === VIEW_MODES.THIRD_PERSON) {
      updateThirdPersonCameraOffset();
      controls.setCameraOffset(thirdPersonCameraOffset);
    } else {
      controls.setCameraOffset(firstPersonCameraOffset);
    }

    applyPlayerModelLayerVisibilityForCamera();
  };

  const setCameraViewModeInternal = (mode) => {
    const nextMode =
      mode === VIEW_MODES.THIRD_PERSON
        ? VIEW_MODES.THIRD_PERSON
        : VIEW_MODES.FIRST_PERSON;

    if (nextMode === cameraViewMode) {
      return cameraViewMode;
    }

    cameraViewMode = nextMode;
    refreshCameraViewMode();
    updatePlayerModelTransform();
    return cameraViewMode;
  };

  const toggleCameraViewModeInternal = () =>
    setCameraViewModeInternal(
      cameraViewMode === VIEW_MODES.THIRD_PERSON
        ? VIEW_MODES.FIRST_PERSON
        : VIEW_MODES.THIRD_PERSON
    );

  const updatePlayerModelTransform = () => {
    playerModelGroup.position.set(0, 0, 0);
    playerModelGroup.rotation.copy(PLAYER_MODEL_DEFAULT_ROTATION);
    playerModelGroup.updateMatrixWorld(true);
  };

  const applyPlayerHeight = (newHeight, options = {}) => {
    if (!Number.isFinite(newHeight) || newHeight <= 0) {
      return playerHeight;
    }

    const { persist = true } = options;
    const clampedHeight = Math.max(newHeight, MIN_PLAYER_HEIGHT);

    if (Math.abs(clampedHeight - playerHeight) < 0.0001) {
      if (persist) {
        persistPlayerHeight(playerHeight);
      }

      return playerHeight;
    }

    playerHeight = clampedHeight;

    const hasPlayerModelRecalculation =
      typeof playerModelState.recalculateBounds === "function";

    if (!hasPlayerModelRecalculation) {
      if (!Number.isFinite(playerEyeLevel)) {
        playerEyeLevel = playerHeight;
      } else {
        playerEyeLevel = THREE.MathUtils.clamp(
          playerEyeLevel,
          MIN_PLAYER_HEIGHT,
          Math.max(playerHeight, MIN_PLAYER_HEIGHT)
        );
      }

      updateFirstPersonCameraOffset();
    }

    defaultPlayerPosition.y = roomFloorY;
    playerObject.position.y = Math.max(playerObject.position.y, roomFloorY);
    refreshCameraViewMode();

    if (hasPlayerModelRecalculation) {
      playerModelState.recalculateBounds();
    } else {
      updatePlayerModelTransform();
    }

    if (persist) {
      persistPlayerHeight(playerHeight);
    }

    return playerHeight;
  };

  const storedPlayerHeight = loadStoredPlayerHeight();
  const initialHeight = Number.isFinite(storedPlayerHeight)
    ? storedPlayerHeight
    : DEFAULT_PLAYER_HEIGHT;
  applyPlayerHeight(initialHeight, { persist: false });

  const initializePlayerModel = (model, animations = [], options = {}) => {
    const scaleMultiplier =
      Number.isFinite(options.scaleMultiplier) && options.scaleMultiplier > 0
        ? options.scaleMultiplier
        : 1;
    const manualAnimatorFactory =
      typeof options.manualAnimatorFactory === "function"
        ? options.manualAnimatorFactory
        : null;
    const manualAnimatorFromOptions =
      options.manualAnimator &&
      typeof options.manualAnimator.update === "function"
        ? options.manualAnimator
        : null;
    if (!model) {
      return;
    }

    if (playerModelState.mixer) {
      playerModelState.mixer.stopAllAction();
    }

    playerModelState.mixer = null;
    playerModelState.actions.idle = null;
    playerModelState.actions.walk = null;
    playerModelState.currentAction = null;
    currentPlayerAnimationName = null;
    playerModelState.recalculateBounds = null;
    playerModelState.manualAnimator = null;

    playerModelGroup.clear();
    playerModelGroup.add(model);

    const originalModelScale = model.scale.clone();
    const originalModelPosition = model.position.clone();
    const originalModelQuaternion = model.quaternion.clone();
    const playerModelBoundingBox = new THREE.Box3();
    const playerModelBoundingBoxFallback = new THREE.Box3();
    const playerModelBoundsSize = new THREE.Vector3();
    const localVertex = new THREE.Vector3();
    const worldVertex = new THREE.Vector3();

    const updatePlayerModelBoundingBox = () => {
      let expandedFromVertices = false;
      playerModelBoundingBox.makeEmpty();
      playerModelGroup.updateWorldMatrix(true, false);
      model.updateWorldMatrix(true, false);

      model.traverse((child) => {
        if (!child.isMesh) {
          return;
        }

        const geometry = child.geometry;
        const positionAttribute = geometry?.getAttribute("position");

        if (!positionAttribute || positionAttribute.itemSize < 3) {
          return;
        }

        const isSkinnedMesh = child.isSkinnedMesh && child.skeleton;
        const canApplyBoneTransform =
          isSkinnedMesh && typeof child.boneTransform === "function";

        if (isSkinnedMesh) {
          child.skeleton.update();
        }

        for (let index = 0; index < positionAttribute.count; index += 1) {
          localVertex.fromBufferAttribute(positionAttribute, index);

          let transformedWithBones = false;

          if (canApplyBoneTransform) {
            child.boneTransform(index, localVertex);
            transformedWithBones = true;
          }

          if (transformedWithBones) {
            worldVertex.copy(localVertex);
          } else {
            worldVertex.copy(localVertex).applyMatrix4(child.matrixWorld);
          }

          playerModelBoundingBox.expandByPoint(worldVertex);
          expandedFromVertices = true;
        }
      });

      if (!expandedFromVertices || playerModelBoundingBox.isEmpty()) {
        playerModelBoundingBoxFallback.makeEmpty();
        playerModelBoundingBoxFallback.setFromObject(model);

        if (!playerModelBoundingBoxFallback.isEmpty()) {
          playerModelBoundingBox.copy(playerModelBoundingBoxFallback);
        }
      }
    };

    const fitPlayerModelToHeight = () => {
      const savedGroupPosition = playerModelGroup.position.clone();
      const savedGroupQuaternion = playerModelGroup.quaternion.clone();
      const savedGroupScale = playerModelGroup.scale.clone();

      playerModelGroup.position.set(0, 0, 0);
      playerModelGroup.quaternion.identity();
      playerModelGroup.scale.set(1, 1, 1);
      playerModelGroup.updateMatrixWorld(true);

      const restorePlayerModelGroupTransform = () => {
        playerModelGroup.position.copy(savedGroupPosition);
        playerModelGroup.quaternion.copy(savedGroupQuaternion);
        playerModelGroup.scale.copy(savedGroupScale);
        playerModelGroup.updateMatrixWorld(true);
      };

      model.position.copy(originalModelPosition);
      model.quaternion.copy(originalModelQuaternion);
      model.scale.copy(originalModelScale);

      updatePlayerModelBoundingBox();

      if (playerModelBoundingBox.isEmpty()) {
        model.updateWorldMatrix(true, false);
        restorePlayerModelGroupTransform();
        return;
      }

      playerModelBoundingBox.getSize(playerModelBoundsSize);

      const shouldScalePlayerModel =
        ENABLE_PLAYER_MODEL_HEIGHT_SCALING &&
        playerModelBoundsSize.y > 0 &&
        playerHeight > 0;

      let targetModelHeight = null;

      if (shouldScalePlayerModel) {
        targetModelHeight = playerHeight;

        const scale = targetModelHeight / playerModelBoundsSize.y;
        model.scale.multiplyScalar(scale);
      }

      model.updateWorldMatrix(true, false);

      updatePlayerModelBoundingBox();

      if (
        shouldScalePlayerModel &&
        targetModelHeight !== null &&
        targetModelHeight > 0 &&
        !playerModelBoundingBox.isEmpty()
      ) {
        playerModelBoundingBox.getSize(playerModelBoundsSize);

        const currentModelHeight = playerModelBoundsSize.y;

        if (
          Number.isFinite(currentModelHeight) &&
          currentModelHeight > targetModelHeight
        ) {
          const correctionScale = targetModelHeight / currentModelHeight;
          model.scale.multiplyScalar(correctionScale);
          model.updateWorldMatrix(true, false);
          updatePlayerModelBoundingBox();
        }
      }

      if (!playerModelBoundingBox.isEmpty()) {
        playerModelBoundingBox.getSize(playerModelBoundsSize);
      }

      if (playerModelBoundingBox.isEmpty()) {
        restorePlayerModelGroupTransform();
        return;
      }

      model.position.copy(originalModelPosition);
      model.quaternion.copy(originalModelQuaternion);
      model.updateWorldMatrix(true, false);
      restorePlayerModelGroupTransform();
    };

    const recomputePlayerModelScaleAndBounds = () => {
      playerModelGroup.updateWorldMatrix(true, false);
      model.updateWorldMatrix(true, false);
      playerModelBoundingBoxFallback.makeEmpty();
      playerModelBoundingBoxFallback.setFromObject(model);

      fitPlayerModelToHeight();

      if (scaleMultiplier !== 1) {
        model.scale.multiplyScalar(scaleMultiplier);
        model.updateWorldMatrix(true, false);
      }

      updatePlayerModelBoundingBox();
      updateStoredPlayerModelBounds(
        playerModelBoundingBox,
        playerModelBoundsSize
      );

      if (
        Number.isFinite(playerModelBounds.eyeLevel) &&
        playerModelBounds.eyeLevel > 0
      ) {
        playerEyeLevel = playerModelBounds.eyeLevel;
      } else if (
        Number.isFinite(playerModelBounds.size?.y) &&
        playerModelBounds.size.y > 0
      ) {
        playerEyeLevel = playerModelBounds.size.y;
      } else {
        playerEyeLevel = playerHeight;
      }

      updateFirstPersonCameraOffset();
      updatePlayerModelTransform();
    };

    recomputePlayerModelScaleAndBounds();
    playerModelState.recalculateBounds = recomputePlayerModelScaleAndBounds;

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        child.frustumCulled = false;
      }
    });

    playerModelGroup.visible = true;

    if (Array.isArray(animations) && animations.length > 0) {
      playerModelState.mixer = new THREE.AnimationMixer(model);

      animations.forEach((clip) => {
        if (!clip) {
          return;
        }

        const clipName = String(clip.name || "").toLowerCase();
        const action = playerModelState.mixer.clipAction(clip);

        if (!playerModelState.actions.walk && (clipName.includes("walk") || clipName.includes("run"))) {
          playerModelState.actions.walk = action;
        } else if (!playerModelState.actions.idle && (clipName.includes("idle") || clipName.includes("stand"))) {
          playerModelState.actions.idle = action;
        }
      });

      if (!playerModelState.actions.idle) {
        playerModelState.actions.idle = playerModelState.mixer.clipAction(
          animations[0]
        );
      }

      updatePlayerModelAnimationState(false);
    }

    updatePlayerModelTransform();
    updatePlayerModelBoundingBox();

    let manualAnimator = null;

    if (manualAnimatorFactory) {
      try {
        manualAnimator = manualAnimatorFactory({
          model,
          group: playerModelGroup,
        });
      } catch (error) {
        console.warn(
          "Failed to create manual player model animator",
          error
        );
      }
    } else if (manualAnimatorFromOptions) {
      manualAnimator = manualAnimatorFromOptions;
    }

    if (manualAnimator && typeof manualAnimator.update === "function") {
      playerModelState.manualAnimator = manualAnimator;

      if (typeof manualAnimator.reset === "function") {
        manualAnimator.reset();
      }
    }

    refreshCameraViewMode();
  };

  const createSimplePlayerModel = () => {
    const cubeSize = 1;
    const simpleModel = new THREE.Group();
    simpleModel.name = "SimplePlayerModel";

    const camouflageTexture = getPlayerCamouflageTexture();
    const bodyMaterialOptions = {
      emissive: new THREE.Color(0x0f172a),
      metalness: 0.05,
      roughness: 0.8,
    };

    if (camouflageTexture) {
      bodyMaterialOptions.map = camouflageTexture;
      bodyMaterialOptions.color = new THREE.Color(0xffffff);
    } else {
      bodyMaterialOptions.color = new THREE.Color(0x38bdf8);
    }

    const bodyMaterial = new THREE.MeshStandardMaterial(bodyMaterialOptions);

    let headMesh = null;
    let neckMesh = null;
    let torsoMesh = null;
    let leftArmGroup = null;
    let rightArmGroup = null;
    let leftLegGroup = null;
    let rightLegGroup = null;

    const headSize = cubeSize * 0.8;
    const neckHeight = cubeSize * 0.2;
    const neckWidth = cubeSize * 0.35;
    const neckDepth = cubeSize * 0.35;
    const bodyWidth = cubeSize * 0.7;
    const bodyDepth = cubeSize * 0.5;
    const bodyHeight = cubeSize * 1.4;
    const legWidth = cubeSize * 0.35;
    const legDepth = cubeSize * 0.35;
    const legHeight = cubeSize * 1.2;
    const armWidth = cubeSize * 0.28;
    const armDepth = cubeSize * 0.28;
    const armHeight = cubeSize * 1.15;

    const headGeometry = new THREE.BoxGeometry(headSize, headSize, headSize);
    headMesh = new THREE.Mesh(headGeometry, bodyMaterial);
    headMesh.name = "PlayerHead";
    headMesh.position.y = legHeight + bodyHeight + neckHeight + headSize * 0.5;
    simpleModel.add(headMesh);

    const neckGeometry = new THREE.BoxGeometry(neckWidth, neckHeight, neckDepth);
    neckMesh = new THREE.Mesh(neckGeometry, bodyMaterial);
    neckMesh.name = "PlayerNeck";
    neckMesh.position.y = legHeight + bodyHeight + neckHeight * 0.5;
    simpleModel.add(neckMesh);

    const torsoGeometry = new THREE.BoxGeometry(
      bodyWidth,
      bodyHeight,
      bodyDepth
    );
    torsoMesh = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torsoMesh.name = "PlayerTorso";
    torsoMesh.position.y = legHeight + bodyHeight * 0.5;
    simpleModel.add(torsoMesh);

    const createLeg = (name, xOffset) => {
      const thighHeight = legHeight * 0.5;
      const shinHeight = legHeight * 0.38;
      const footHeight = legHeight - thighHeight - shinHeight;
      const legGroup = new THREE.Group();
      legGroup.name = name;
      legGroup.position.set(xOffset, legHeight, 0);

      const thighGeometry = new THREE.BoxGeometry(
        legWidth * 0.95,
        thighHeight,
        legDepth * 0.9
      );
      const thighMesh = new THREE.Mesh(thighGeometry, bodyMaterial);
      thighMesh.name = `${name}Upper`;
      thighMesh.position.set(0, -thighHeight * 0.5, 0);
      legGroup.add(thighMesh);

      const shinGeometry = new THREE.BoxGeometry(
        legWidth * 0.85,
        shinHeight,
        legDepth * 0.85
      );
      const shinMesh = new THREE.Mesh(shinGeometry, bodyMaterial);
      shinMesh.name = `${name}Lower`;
      shinMesh.position.set(0, -(thighHeight + shinHeight * 0.5), 0);
      legGroup.add(shinMesh);

      const footGeometry = new THREE.BoxGeometry(
        legWidth,
        footHeight,
        legDepth * 1.5
      );
      const footMesh = new THREE.Mesh(footGeometry, bodyMaterial);
      footMesh.name = `${name}Foot`;
      footMesh.position.set(
        0,
        -(thighHeight + shinHeight + footHeight * 0.5),
        legDepth * 0.4
      );
      legGroup.add(footMesh);

      simpleModel.add(legGroup);
      return legGroup;
    };

    leftLegGroup = createLeg("PlayerLegLeft", -bodyWidth * 0.25);
    rightLegGroup = createLeg("PlayerLegRight", bodyWidth * 0.25);

    const createArm = (name, xOffset) => {
      const upperArmLength = armHeight * 0.5;
      const forearmLength = armHeight * 0.35;
      const handLength = armHeight - upperArmLength - forearmLength;
      const shoulderHeight = legHeight + bodyHeight - cubeSize * 0.1;
      const armGroup = new THREE.Group();
      armGroup.name = name;
      armGroup.position.set(xOffset, shoulderHeight, 0);

      const upperArmGeometry = new THREE.BoxGeometry(
        armWidth,
        upperArmLength,
        armDepth * 0.9
      );
      const upperArmMesh = new THREE.Mesh(upperArmGeometry, bodyMaterial);
      upperArmMesh.name = `${name}Upper`;
      upperArmMesh.position.set(0, -upperArmLength * 0.5, 0);
      armGroup.add(upperArmMesh);

      const forearmGeometry = new THREE.BoxGeometry(
        armWidth * 0.9,
        forearmLength,
        armDepth * 0.85
      );
      const forearmMesh = new THREE.Mesh(forearmGeometry, bodyMaterial);
      forearmMesh.name = `${name}Lower`;
      forearmMesh.position.set(0, -upperArmLength - forearmLength * 0.5, 0);
      armGroup.add(forearmMesh);

      const handGeometry = new THREE.BoxGeometry(
        armWidth * 0.8,
        handLength,
        armDepth
      );
      const handMesh = new THREE.Mesh(handGeometry, bodyMaterial);
      handMesh.name = `${name}Hand`;
      handMesh.position.set(0, -upperArmLength - forearmLength - handLength * 0.5, 0);
      armGroup.add(handMesh);

      simpleModel.add(armGroup);
      return armGroup;
    };

    const armOffset = bodyWidth * 0.5 + armWidth * 0.75;
    leftArmGroup = createArm("PlayerArmLeft", -armOffset);
    rightArmGroup = createArm("PlayerArmRight", armOffset);

    const createSimplePlayerModelAnimator = () => {
      const trackedNodes = [
        leftArmGroup,
        rightArmGroup,
        leftLegGroup,
        rightLegGroup,
        torsoMesh,
        neckMesh,
        headMesh,
      ].filter((node) => node instanceof THREE.Object3D);

      if (trackedNodes.length === 0) {
        return null;
      }

      const baseTransforms = new Map();

      trackedNodes.forEach((node) => {
        baseTransforms.set(node, {
          rotation: node.rotation.clone(),
          position: node.position.clone(),
        });
      });

      let swingPhase = 0;
      let swingStrength = 0;

      const reset = () => {
        swingPhase = 0;
        swingStrength = 0;

        trackedNodes.forEach((node) => {
          const base = baseTransforms.get(node);

          if (!base) {
            return;
          }

          node.rotation.copy(base.rotation);
          node.position.copy(base.position);
        });
      };

      const withBase = (node, callback, options = {}) => {
        if (!node) {
          return;
        }

        const base = baseTransforms.get(node);

        if (!base) {
          return;
        }

        node.rotation.copy(base.rotation);

        if (options.copyPosition) {
          node.position.copy(base.position);
        }

        callback(node, base);
      };

      const update = ({
        delta = 0,
        isWalking = false,
        speed = 0,
      } = {}) => {
        const clampedDelta = Math.max(delta, 0);
        const clampedSpeed = Math.max(speed, 0);
        const normalizedSpeed = THREE.MathUtils.clamp(clampedSpeed / 8, 0, 1);
        const targetSwing = isWalking
          ? THREE.MathUtils.lerp(0.35, 1, normalizedSpeed)
          : 0;

        swingStrength = THREE.MathUtils.damp(
          swingStrength,
          targetSwing,
          6,
          clampedDelta
        );

        const swingFrequency = THREE.MathUtils.lerp(4.2, 7.5, normalizedSpeed);
        swingPhase += clampedDelta * swingFrequency;

        if (!Number.isFinite(swingPhase)) {
          swingPhase = 0;
        } else if (swingPhase > Math.PI * 2) {
          swingPhase %= Math.PI * 2;
        }

        const forwardSwing = Math.sin(swingPhase) * swingStrength;
        const crossSwing = Math.cos(swingPhase) * swingStrength;
        const halfSwing = Math.sin(swingPhase * 0.5) * swingStrength;
        const liftSwing = Math.abs(Math.sin(swingPhase)) * swingStrength;

        withBase(leftArmGroup, (node) => {
          node.rotation.x += forwardSwing * 0.85;
          node.rotation.z += crossSwing * 0.12;
        });

        withBase(rightArmGroup, (node) => {
          node.rotation.x -= forwardSwing * 0.85;
          node.rotation.z -= crossSwing * 0.12;
        });

        withBase(leftLegGroup, (node) => {
          node.rotation.x -= forwardSwing * 1.2;
          node.rotation.z -= crossSwing * 0.05;
        });

        withBase(rightLegGroup, (node) => {
          node.rotation.x += forwardSwing * 1.2;
          node.rotation.z += crossSwing * 0.05;
        });

        withBase(torsoMesh, (node) => {
          node.rotation.y += forwardSwing * 0.08;
          node.rotation.x += crossSwing * 0.04;
          node.rotation.z += halfSwing * 0.05;
        });

        withBase(neckMesh, (node) => {
          node.rotation.x += crossSwing * 0.05;
          node.rotation.y += forwardSwing * 0.04;
        });

        withBase(
          headMesh,
          (node) => {
            node.rotation.x += crossSwing * 0.09;
            node.rotation.y += forwardSwing * 0.05;
            node.rotation.z += halfSwing * 0.03;
            node.position.y += liftSwing * 0.08;
          },
          { copyPosition: true }
        );
      };

      return {
        update,
        reset,
      };
    };

    initializePlayerModel(simpleModel, [], {
      scaleMultiplier: 1,
      manualAnimatorFactory: createSimplePlayerModelAnimator,
    });
  };

  const loadCustomPlayerModel = () => {
    const PLAYER_MODEL_URL = "images/models/suit.gltf";
    const PLAYER_MODEL_SCALE_MULTIPLIER = 0.1;

    gltfLoader.load(
      PLAYER_MODEL_URL,
      (gltf) => {
        const model = gltf?.scene;

        if (!model) {
          console.warn(
            "Loaded player model is missing a scene graph",
            gltf
          );
          createSimplePlayerModel();
          return;
        }

        applyCamouflageToPlayerModel(model);

        const animations = Array.isArray(gltf.animations)
          ? gltf.animations
          : [];

        initializePlayerModel(model, animations, {
          scaleMultiplier: PLAYER_MODEL_SCALE_MULTIPLIER,
        });
      },
      undefined,
      (error) => {
        console.warn("Failed to load player model glTF", error);
        createSimplePlayerModel();
      }
    );
  };

  loadCustomPlayerModel();

  const playerColliderRadius = 0.35;
  const previousPlayerPosition = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  let verticalVelocity = 0;
  let isGrounded = true;
  let jumpRequested = false;
  const GRAVITY = -48;
  const JUMP_VELOCITY = 13;
  const CEILING_CLEARANCE = 0.5;

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
        pitch !== null ? pitch : DEFAULT_THIRD_PERSON_PITCH
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
  });

  const attemptPointerLock = () => {
    if (!controls.isLocked) {
      canvas.focus();
      controls.lock();
    }
  };

  canvas.addEventListener("click", attemptPointerLock);
  canvas.addEventListener("pointerdown", attemptPointerLock);

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
    if (!controls.isLocked || quickAccessInteractables.length === 0) {
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
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
    }
  };

  const onKeyUp = (event) => {
    updateMovementState(event.code, false);
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  const clampWithinRoom = () => {
    const player = controls.getObject().position;
    const halfWidth = roomWidth / 2 - 1;
    const halfDepth = roomDepth / 2 - 1;
    player.x = THREE.MathUtils.clamp(player.x, -halfWidth, halfWidth);
    player.z = THREE.MathUtils.clamp(player.z, -halfDepth, halfDepth);
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
  };

  clampWithinRoom();

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
        velocity.z -= direction.z * 80 * delta;
      }

      if (movementState.left || movementState.right) {
        velocity.x -= direction.x * 80 * delta;
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

    clampWithinRoom();

    if (shouldResolveCollisions) {
      resolvePlayerCollisions(previousPlayerPosition);
    }

    const hasMovementInput =
      movementState.forward ||
      movementState.backward ||
      movementState.left ||
      movementState.right;

    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);

    const isWalking =
      movementEnabled &&
      controls.isLocked &&
      hasMovementInput &&
      horizontalSpeed > 0.0001;

    if (playerModelState.mixer) {
      playerModelState.mixer.update(delta);
      updatePlayerModelAnimationState(isWalking);
    }

    if (
      playerModelState.manualAnimator &&
      typeof playerModelState.manualAnimator.update === "function"
    ) {
      playerModelState.manualAnimator.update({
        delta,
        isWalking,
        speed: horizontalSpeed,
      });
    }

    let matchedZone = null;

    if (controls.isLocked) {
      matchedZone = getTargetedTerminalZone();
      updateTerminalInteractableState(Boolean(matchedZone));
    } else {
      updateTerminalInteractableState(false);
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

    updatePlayerModelTransform();

    renderer.render(scene, camera);
  };

  animate();

  const handleResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const pixelRatio = renderer.getPixelRatio();
    reflectiveSurfaces.forEach((reflector) => {
      if (reflector?.renderTarget && typeof reflector.renderTarget.setSize === "function") {
        reflector.renderTarget.setSize(width * pixelRatio, height * pixelRatio);
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
    getCameraViewMode: () => cameraViewMode,
    setCameraViewMode: setCameraViewModeInternal,
    toggleCameraViewMode: toggleCameraViewModeInternal,
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
    dispose: () => {
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("click", attemptPointerLock);
      canvas.removeEventListener("click", handleCanvasClick);
      canvas.removeEventListener("pointerdown", attemptPointerLock);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      updateTerminalInteractableState(false);
      if (typeof lastUpdatedDisplay.userData?.dispose === "function") {
        lastUpdatedDisplay.userData.dispose();
      }
      savePlayerState(true);
      colliderDescriptors.length = 0;
    },
  };
};
