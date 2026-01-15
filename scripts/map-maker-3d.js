import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import {
  getOutsideTerrainById,
  getOutsideTerrainTexturePath,
} from "./outside-map.js";

const HEIGHT_FLOOR = 0.05;
const HEIGHT_SCALE = 6;
const TERRAIN_HEIGHT = HEIGHT_FLOOR + HEIGHT_SCALE * 0.5;
const NEUTRAL_TERRAIN_COLOR = "#f8fafc";

const getWebglSupport = () => {
  const canvas = document.createElement("canvas");
  const contexts = ["webgl2", "webgl", "experimental-webgl"];
  return contexts.some((name) => Boolean(canvas.getContext(name)));
};

const getTerrainHeight = () => TERRAIN_HEIGHT;

const buildTerrainGeometry = (map, { showTerrainTypes } = {}) => {
  const positions = [];
  const colors = [];
  const uvs = [];
  const showColors = showTerrainTypes !== false;

  const width = map.width;
  const height = map.height;
  const xOffset = width / 2;
  const zOffset = height / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const terrain = getOutsideTerrainById(map.cells[index]);
      const color = new THREE.Color(
        showColors ? terrain?.color ?? NEUTRAL_TERRAIN_COLOR : NEUTRAL_TERRAIN_COLOR
      );
      const elevation = getTerrainHeight(terrain);

      const x0 = x - xOffset;
      const x1 = x + 1 - xOffset;
      const z0 = y - zOffset;
      const z1 = y + 1 - zOffset;

      positions.push(
        x0,
        elevation,
        z0,
        x1,
        elevation,
        z1,
        x1,
        elevation,
        z0,
        x0,
        elevation,
        z0,
        x0,
        elevation,
        z1,
        x1,
        elevation,
        z1
      );

      const u0 = x / width;
      const u1 = (x + 1) / width;
      const v0 = y / height;
      const v1 = (y + 1) / height;

      uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);

      for (let i = 0; i < 6; i += 1) {
        colors.push(color.r, color.g, color.b);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  return geometry;
};

export const initMapMaker3d = ({
  canvas,
  errorElement,
  resetButton,
  terrainTypeToggle,
  terrainTextureToggle,
  initialTextureVisibility = true,
} = {}) => {
  if (!canvas) {
    return null;
  }

  if (!getWebglSupport()) {
    if (errorElement) {
      errorElement.hidden = false;
    }
    canvas.hidden = true;
    return {
      updateMap: () => {},
      dispose: () => {},
    };
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
  } catch (error) {
    console.error("Failed to initialize WebGL renderer", error);
    if (errorElement) {
      errorElement.hidden = false;
      errorElement.textContent =
        "WebGL failed to initialize. Try updating your browser or enabling hardware acceleration.";
    }
    canvas.hidden = true;
    return {
      updateMap: () => {},
      dispose: () => {},
    };
  }

  if (errorElement) {
    errorElement.hidden = true;
  }
  canvas.hidden = false;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0f172a");

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

  const ambientLight = new THREE.AmbientLight("#cbd5f5", 0.75);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight("#ffffff", 0.85);
  keyLight.position.set(10, 20, 15);
  scene.add(keyLight);

  const hemiLight = new THREE.HemisphereLight("#e2e8f0", "#334155", 0.6);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  const fillLight = new THREE.DirectionalLight("#bfdbfe", 0.35);
  fillLight.position.set(-12, 10, -6);
  scene.add(fillLight);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  const moveKeys = new Set();
  const clock = new THREE.Clock();

  const shouldIgnoreKeyEvent = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tagName = target.tagName;
    return (
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      tagName === "SELECT" ||
      target.isContentEditable
    );
  };

  const handleKeyDown = (event) => {
    if (shouldIgnoreKeyEvent(event)) {
      return;
    }
    if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
      moveKeys.add(event.code);
      event.preventDefault();
    }
  };

  const handleKeyUp = (event) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
      moveKeys.delete(event.code);
      event.preventDefault();
    }
  };

  const handleWindowBlur = () => {
    moveKeys.clear();
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleWindowBlur);

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.9,
    metalness: 0.05,
  });

  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  scene.add(mesh);

  const textureCanvas = document.createElement("canvas");
  const textureContext = textureCanvas.getContext("2d");
  const terrainTextureCache = new Map();
  const terrainTexturePromises = new Map();
  let textureToken = 0;
  const TEXTURE_TILE_SIZE = 36;

  let frameId = null;
  let mapSize = 10;
  let lastMap = null;
  const getTerrainToggleState = () => {
    if (!terrainTypeToggle) {
      return true;
    }
    const pressed = terrainTypeToggle.getAttribute("aria-pressed");
    return pressed !== "false";
  };

  const syncTerrainToggleLabel = (isEnabled) => {
    if (!terrainTypeToggle) {
      return;
    }
    terrainTypeToggle.setAttribute("aria-pressed", String(isEnabled));
    terrainTypeToggle.textContent = `Terrain types: ${isEnabled ? "On" : "Off"}`;
  };

  let showTerrainTypes = getTerrainToggleState();
  syncTerrainToggleLabel(showTerrainTypes);
  const syncTerrainTextureToggleLabel = (isEnabled) => {
    if (!terrainTextureToggle) {
      return;
    }
    terrainTextureToggle.setAttribute("aria-pressed", String(isEnabled));
    terrainTextureToggle.textContent = `Terrain textures: ${
      isEnabled ? "On" : "Off"
    }`;
  };

  let showTerrainTextures = initialTextureVisibility;
  syncTerrainTextureToggleLabel(showTerrainTextures);
  const moveVector = new THREE.Vector3();
  const forwardVector = new THREE.Vector3();
  const rightVector = new THREE.Vector3();

  const loadTerrainTexture = (texturePath) => {
    if (!texturePath) {
      return Promise.resolve(null);
    }
    if (terrainTextureCache.has(texturePath)) {
      return Promise.resolve(terrainTextureCache.get(texturePath));
    }
    if (terrainTexturePromises.has(texturePath)) {
      return terrainTexturePromises.get(texturePath);
    }
    const promise = new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.crossOrigin = "anonymous";
      image.onload = () => {
        terrainTextureCache.set(texturePath, image);
        terrainTexturePromises.delete(texturePath);
        resolve(image);
      };
      image.onerror = () => {
        terrainTextureCache.set(texturePath, null);
        terrainTexturePromises.delete(texturePath);
        resolve(null);
      };
      image.src = texturePath;
    });
    terrainTexturePromises.set(texturePath, promise);
    return promise;
  };

  const renderTerrainTexture = async (map) => {
    if (!textureContext) {
      return;
    }
    if (!showTerrainTextures) {
      if (material.map) {
        material.map = null;
        material.needsUpdate = true;
      }
      return;
    }
    if (!map || !Number.isFinite(map.width) || !Number.isFinite(map.height)) {
      return;
    }

    const nextToken = ++textureToken;
    const { width, height } = map;
    textureCanvas.width = width * TEXTURE_TILE_SIZE;
    textureCanvas.height = height * TEXTURE_TILE_SIZE;

    const texturePaths = new Set();
    map.cells.forEach((terrainId, index) => {
      const texturePath = getOutsideTerrainTexturePath(terrainId, index);
      if (texturePath) {
        texturePaths.add(texturePath);
      }
    });

    await Promise.all([...texturePaths].map((path) => loadTerrainTexture(path)));
    if (nextToken !== textureToken) {
      return;
    }

    textureContext.clearRect(0, 0, textureCanvas.width, textureCanvas.height);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const terrainId = map.cells[index];
        const texturePath = getOutsideTerrainTexturePath(terrainId, index);
        const image = texturePath
          ? terrainTextureCache.get(texturePath)
          : null;
        const drawX = x * TEXTURE_TILE_SIZE;
        const drawY = y * TEXTURE_TILE_SIZE;
        if (image) {
          textureContext.drawImage(
            image,
            drawX,
            drawY,
            TEXTURE_TILE_SIZE,
            TEXTURE_TILE_SIZE
          );
        } else {
          const terrain = getOutsideTerrainById(terrainId);
          textureContext.fillStyle = terrain?.color ?? NEUTRAL_TERRAIN_COLOR;
          textureContext.fillRect(
            drawX,
            drawY,
            TEXTURE_TILE_SIZE,
            TEXTURE_TILE_SIZE
          );
        }
      }
    }

    if (!material.map) {
      const canvasTexture = new THREE.CanvasTexture(textureCanvas);
      canvasTexture.colorSpace = THREE.SRGBColorSpace;
      canvasTexture.flipY = false;
      canvasTexture.wrapS = THREE.ClampToEdgeWrapping;
      canvasTexture.wrapT = THREE.ClampToEdgeWrapping;
      canvasTexture.minFilter = THREE.LinearFilter;
      canvasTexture.magFilter = THREE.LinearFilter;
      material.map = canvasTexture;
      material.needsUpdate = true;
    } else {
      material.map.needsUpdate = true;
    }
  };

  const setCameraForMap = (width, height) => {
    const size = Math.max(width, height, 8);
    mapSize = size;
    camera.position.set(size * 0.6, size * 0.9, size * 0.75);
    controls.target.set(0, 0, 0);
    controls.update();
    camera.near = 0.1;
    camera.far = size * 6;
    camera.updateProjectionMatrix();
  };

  const getCanvasSize = () => {
    const parent = canvas.parentElement;
    const width = canvas.clientWidth || parent?.clientWidth || 0;
    const height = canvas.clientHeight || parent?.clientHeight || 0;
    return { width, height };
  };

  const resizeRenderer = () => {
    const { width, height } = getCanvasSize();
    if (!width || !height) {
      return;
    }
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const resizeObserver = new ResizeObserver(() => {
    resizeRenderer();
  });
  resizeObserver.observe(canvas);

  const renderLoop = () => {
    frameId = window.requestAnimationFrame(renderLoop);
    const delta = clock.getDelta();
    if (moveKeys.size > 0) {
      camera.getWorldDirection(forwardVector);
      forwardVector.normalize();
      rightVector.crossVectors(forwardVector, camera.up).normalize();
      moveVector.set(0, 0, 0);
      if (moveKeys.has("KeyW")) {
        moveVector.add(forwardVector);
      }
      if (moveKeys.has("KeyS")) {
        moveVector.sub(forwardVector);
      }
      if (moveKeys.has("KeyA")) {
        moveVector.sub(rightVector);
      }
      if (moveKeys.has("KeyD")) {
        moveVector.add(rightVector);
      }
      if (moveVector.lengthSq() > 0) {
        const speed = Math.max(mapSize * 0.45, 4);
        moveVector.normalize().multiplyScalar(speed * delta);
        camera.position.add(moveVector);
        controls.target.add(moveVector);
      }
    }
    controls.update();
    renderer.render(scene, camera);
  };
  renderLoop();

  const applyMapGeometry = (map, { resetCamera = true } = {}) => {
    if (!map || !Number.isFinite(map.width) || !Number.isFinite(map.height)) {
      return;
    }
    lastMap = map;
    const geometry = buildTerrainGeometry(map, { showTerrainTypes });
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    void renderTerrainTexture(map);
    if (resetCamera) {
      setCameraForMap(map.width, map.height);
    }
    resizeRenderer();
  };

  const updateMap = (map) => {
    applyMapGeometry(map, { resetCamera: true });
  };

  const updateTerrainTypeDisplay = (nextValue) => {
    showTerrainTypes = nextValue;
    if (lastMap) {
      applyMapGeometry(lastMap, { resetCamera: false });
    }
  };

  const updateTerrainTextureDisplay = (nextValue) => {
    showTerrainTextures = nextValue;
    if (lastMap) {
      void renderTerrainTexture(lastMap);
    }
  };

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      setCameraForMap(mapSize, mapSize);
    });
  }

  let terrainToggleHandler = null;
  if (terrainTypeToggle) {
    terrainToggleHandler = () => {
      const nextValue = !showTerrainTypes;
      syncTerrainToggleLabel(nextValue);
      updateTerrainTypeDisplay(nextValue);
    };
    terrainTypeToggle.addEventListener("click", terrainToggleHandler);
  }

  let terrainTextureToggleHandler = null;
  if (terrainTextureToggle) {
    terrainTextureToggleHandler = () => {
      const nextValue = !showTerrainTextures;
      syncTerrainTextureToggleLabel(nextValue);
      updateTerrainTextureDisplay(nextValue);
    };
    terrainTextureToggle.addEventListener("click", terrainTextureToggleHandler);
  }

  const dispose = () => {
    if (frameId) {
      window.cancelAnimationFrame(frameId);
    }
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    window.removeEventListener("blur", handleWindowBlur);
    resizeObserver.disconnect();
    controls.dispose();
    renderer.dispose();
    mesh.geometry.dispose();
    material.dispose();
    if (terrainTypeToggle && terrainToggleHandler) {
      terrainTypeToggle.removeEventListener("click", terrainToggleHandler);
    }
    if (terrainTextureToggle && terrainTextureToggleHandler) {
      terrainTextureToggle.removeEventListener(
        "click",
        terrainTextureToggleHandler
      );
    }
  };

  return {
    updateMap,
    setTextureVisibility: updateTerrainTextureDisplay,
    resize: resizeRenderer,
    dispose,
  };
};
