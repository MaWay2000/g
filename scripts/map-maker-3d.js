import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import {
  OUTSIDE_TERRAIN_TILES,
  getOutsideTerrainById,
  getOutsideTerrainDefaultTileId,
  getOutsideTerrainTilePath,
} from "./outside-map.js";

const HEIGHT_FLOOR = 0.05;
const HEIGHT_SCALE = 6;
const HEIGHT_MIN = 0;
const HEIGHT_MAX = 255;
const TERRAIN_MARKER_SIZE = 0.22;
const TERRAIN_MARKER_MARGIN = 0.08;
const TERRAIN_MARKER_OFFSET =
  -0.5 + TERRAIN_MARKER_MARGIN + TERRAIN_MARKER_SIZE / 2;
const NEUTRAL_TERRAIN_COLOR = "#f8fafc";
const TRANSPARENT_COLOR_KEYWORD = "transparent";
const TERRAIN_TILE_NUMBERS = new Map(
  OUTSIDE_TERRAIN_TILES.map((tile, index) => [tile.id, String(index + 1)])
);

const getWebglSupport = () => {
  const canvas = document.createElement("canvas");
  const contexts = ["webgl2", "webgl", "experimental-webgl"];
  return contexts.some((name) => Boolean(canvas.getContext(name)));
};

const clampHeight = (value) => {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return HEIGHT_MIN;
  }
  return Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, numeric));
};

const getTerrainHeight = (value = HEIGHT_MIN) =>
  HEIGHT_FLOOR + (HEIGHT_SCALE * clampHeight(value)) / HEIGHT_MAX;
const TERRAIN_HEIGHT = getTerrainHeight();
const getTerrainTileNumber = (tileId) =>
  TERRAIN_TILE_NUMBERS.get(tileId) ?? "—";

const resolveTerrainColor = (terrain, showColors) => {
  if (!showColors) {
    return NEUTRAL_TERRAIN_COLOR;
  }

  const terrainColor = terrain?.color;
  if (typeof terrainColor !== "string") {
    return NEUTRAL_TERRAIN_COLOR;
  }

  if (terrainColor.trim().toLowerCase() === TRANSPARENT_COLOR_KEYWORD) {
    return NEUTRAL_TERRAIN_COLOR;
  }

  return terrainColor;
};

const buildTerrainGeometry = (map) => {
  const positions = [];
  const colors = [];
  const uvs = [];

  const width = map.width;
  const height = map.height;
  const xOffset = width / 2;
  const zOffset = height / 2;

  const baseColor = new THREE.Color(NEUTRAL_TERRAIN_COLOR);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const elevation = getTerrainHeight(map.heights?.[index]);

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

      uvs.push(u0, v0, u1, v1, u1, v0, u0, v0, u0, v1, u1, v1);

      for (let i = 0; i < 6; i += 1) {
        colors.push(baseColor.r, baseColor.g, baseColor.b);
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
  initialHeightVisibility = false,
  initialTextureVisibility = true,
  initialTileNumberVisibility = true,
  getBrushSize,
  getTerrainMode,
  onPaintCell,
  onPaintEnd,
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
  renderer.outputColorSpace = THREE.SRGBColorSpace;

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
    LEFT: null,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  const moveKeys = new Set();
  const clock = new THREE.Clock();

  const handleKeyDown = (event) => {
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
  const terrainMarkerGeometry = new THREE.PlaneGeometry(
    TERRAIN_MARKER_SIZE,
    TERRAIN_MARKER_SIZE
  );
  terrainMarkerGeometry.rotateX(-Math.PI / 2);
  const markerColorAttribute = new THREE.Float32BufferAttribute(
    new Float32Array(terrainMarkerGeometry.attributes.position.count * 3).fill(
      1
    ),
    3
  );
  terrainMarkerGeometry.setAttribute("color", markerColorAttribute);
  const terrainMarkerMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const terrainMarkerMesh = new THREE.InstancedMesh(
    terrainMarkerGeometry,
    terrainMarkerMaterial,
    1
  );
  terrainMarkerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  terrainMarkerMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(3),
    3
  );
  terrainMarkerMesh.geometry.setAttribute(
    "instanceColor",
    terrainMarkerMesh.instanceColor
  );
  terrainMarkerMesh.visible = false;
  terrainMarkerMesh.renderOrder = 1;
  scene.add(terrainMarkerMesh);
  const highlightGeometry = new THREE.PlaneGeometry(1, 1);
  highlightGeometry.rotateX(-Math.PI / 2);
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: "#38bdf8",
    transparent: true,
    opacity: 0.35,
    depthTest: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const highlightMesh = new THREE.InstancedMesh(
    highlightGeometry,
    highlightMaterial,
    1
  );
  highlightMesh.frustumCulled = false;
  highlightMesh.visible = false;
  highlightMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  highlightMesh.renderOrder = 2;
  scene.add(highlightMesh);
  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: "#fbbf24",
    transparent: true,
    opacity: 0.3,
    depthTest: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const selectionMesh = new THREE.InstancedMesh(
    highlightGeometry,
    selectionMaterial,
    1
  );
  selectionMesh.frustumCulled = false;
  selectionMesh.visible = false;
  selectionMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  selectionMesh.renderOrder = 1;
  scene.add(selectionMesh);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let isPointerDown = false;
  let lastPaintedIndex = null;
  let selectionStart = null;
  let selectionEnd = null;

  const textureCanvas = document.createElement("canvas");
  const textureContext = textureCanvas.getContext("2d");
  const terrainTextureCache = new Map();
  const terrainTexturePromises = new Map();
  let textureToken = 0;
  const TEXTURE_TILE_SIZE = 36;

  let frameId = null;
  let mapSize = 10;
  let lastMap = null;
  let mapWidth = 0;
  let mapHeight = 0;
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
  let showTileNumbers = initialTileNumberVisibility;
  let showHeights = initialHeightVisibility;
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
    const shouldShowTextures = showTerrainTextures;
    const shouldShowTileNumbers = showTileNumbers;
    const shouldShowHeights = showHeights;
    if (!shouldShowTextures && !shouldShowTileNumbers && !shouldShowHeights) {
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
    if (shouldShowTextures) {
      map.cells.forEach((cell, index) => {
        const terrainId = cell?.terrainId;
        const tileId = cell?.tileId ?? getOutsideTerrainDefaultTileId(terrainId);
        const texturePath = getOutsideTerrainTilePath(tileId, index);
        if (texturePath) {
          texturePaths.add(texturePath);
        }
      });
    }

    await Promise.all([...texturePaths].map((path) => loadTerrainTexture(path)));
    if (nextToken !== textureToken) {
      return;
    }

    textureContext.clearRect(0, 0, textureCanvas.width, textureCanvas.height);

    const labelFontSize = Math.round(TEXTURE_TILE_SIZE * 0.4);
    const heightFontSize = Math.round(TEXTURE_TILE_SIZE * 0.32);
    const labelPadding = Math.round(TEXTURE_TILE_SIZE * 0.08);
    const labelFont = `700 ${labelFontSize}px "Segoe UI", "Inter", system-ui, sans-serif`;
    const heightFont = `700 ${heightFontSize}px "Segoe UI", "Inter", system-ui, sans-serif`;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const cellData = map.cells[index];
        const terrainId = cellData?.terrainId;
        const tileId =
          cellData?.tileId ?? getOutsideTerrainDefaultTileId(terrainId);
        const texturePath = getOutsideTerrainTilePath(tileId, index);
        const image =
          shouldShowTextures && texturePath
            ? terrainTextureCache.get(texturePath)
            : null;
        const drawX = x * TEXTURE_TILE_SIZE;
        const drawY = y * TEXTURE_TILE_SIZE;
        textureContext.fillStyle = NEUTRAL_TERRAIN_COLOR;
        textureContext.fillRect(
          drawX,
          drawY,
          TEXTURE_TILE_SIZE,
          TEXTURE_TILE_SIZE
        );
        if (image) {
          textureContext.save();
          textureContext.globalCompositeOperation = "multiply";
          textureContext.drawImage(
            image,
            drawX,
            drawY,
            TEXTURE_TILE_SIZE,
            TEXTURE_TILE_SIZE
          );
          textureContext.restore();
        }
        if (shouldShowHeights) {
          const heightValue = map.heights?.[index] ?? 0;
          const heightLabel = String(heightValue);
          textureContext.save();
          textureContext.font = heightFont;
          textureContext.textBaseline = "top";
          textureContext.textAlign = "left";
          const textWidth = textureContext.measureText(heightLabel).width;
          const textX = drawX + labelPadding;
          const textY = drawY + labelPadding;
          textureContext.fillStyle = "rgba(2, 6, 23, 0.45)";
          textureContext.fillRect(
            textX - labelPadding * 0.6,
            textY - labelPadding * 0.4,
            textWidth + labelPadding * 1.2,
            heightFontSize + labelPadding
          );
          textureContext.fillStyle = "#f8fafc";
          textureContext.shadowColor = "rgba(2, 6, 23, 0.7)";
          textureContext.shadowBlur = 4;
          textureContext.fillText(heightLabel, textX, textY);
          textureContext.restore();
        }
        if (shouldShowTileNumbers) {
          const label = getTerrainTileNumber(tileId);
          textureContext.save();
          textureContext.font = labelFont;
          textureContext.textBaseline = "bottom";
          textureContext.textAlign = "left";
          const textWidth = textureContext.measureText(label).width;
          const textX =
            drawX + TEXTURE_TILE_SIZE - labelPadding - textWidth;
          const textY = drawY + TEXTURE_TILE_SIZE - labelPadding;
          textureContext.fillStyle = "rgba(2, 6, 23, 0.45)";
          textureContext.fillRect(
            textX - labelPadding,
            textY - labelFontSize - labelPadding * 0.6,
            textWidth + labelPadding * 2,
            labelFontSize + labelPadding * 1.4
          );
          textureContext.fillStyle = "#f8fafc";
          textureContext.shadowColor = "rgba(2, 6, 23, 0.7)";
          textureContext.shadowBlur = 4;
          textureContext.fillText(label, textX, textY);
          textureContext.restore();
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

  const updateTerrainMarkers = (map) => {
    if (!map || !Number.isFinite(map.width) || !Number.isFinite(map.height)) {
      terrainMarkerMesh.visible = false;
      return;
    }
    if (!showTerrainTypes) {
      terrainMarkerMesh.visible = false;
      return;
    }
    const totalInstances = map.width * map.height;
    const currentCapacity = terrainMarkerMesh.instanceMatrix.count;
    if (totalInstances > currentCapacity) {
      const nextCapacity = Math.max(totalInstances, currentCapacity * 2);
      const nextMatrix = new THREE.InstancedBufferAttribute(
        new Float32Array(nextCapacity * 16),
        16
      );
      nextMatrix.setUsage(THREE.DynamicDrawUsage);
      terrainMarkerMesh.instanceMatrix = nextMatrix;
      terrainMarkerMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(nextCapacity * 3),
        3
      );
      terrainMarkerMesh.geometry.setAttribute(
        "instanceColor",
        terrainMarkerMesh.instanceColor
      );
    }
    if (terrainMarkerMesh.count !== totalInstances) {
      terrainMarkerMesh.count = totalInstances;
    }
    if (!terrainMarkerMesh.instanceColor) {
      terrainMarkerMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(currentCapacity * 3),
        3
      );
      terrainMarkerMesh.geometry.setAttribute(
        "instanceColor",
        terrainMarkerMesh.instanceColor
      );
    }

    const tempMatrix = new THREE.Matrix4();
    map.cells.forEach((cellData, index) => {
      const terrainId = cellData?.terrainId;
      const markerElevation =
        getTerrainHeight(map.heights?.[index]) + 0.04;
      const x = index % map.width;
      const y = Math.floor(index / map.width);
      const worldX = x - map.width / 2 + 0.5;
      const worldZ = y - map.height / 2 + 0.5;
      tempMatrix.makeTranslation(
        worldX + TERRAIN_MARKER_OFFSET,
        markerElevation,
        worldZ + TERRAIN_MARKER_OFFSET
      );
      terrainMarkerMesh.setMatrixAt(index, tempMatrix);
      const terrain = getOutsideTerrainById(terrainId);
      const color = new THREE.Color(resolveTerrainColor(terrain, true));
      terrainMarkerMesh.setColorAt(index, color);
    });

    if (terrainMarkerMesh.instanceColor) {
      terrainMarkerMesh.instanceColor.needsUpdate = true;
    }
    terrainMarkerMesh.instanceMatrix.needsUpdate = true;
    terrainMarkerMesh.visible = true;
  };

  const setCameraForMap = (width, height) => {
    const size = Math.max(width, height, 8);
    mapSize = size;
    const maxDistance = Math.max(size * 6, 40);
    controls.maxDistance = maxDistance;
    controls.minDistance = Math.min(controls.minDistance, maxDistance * 0.5);
    camera.position.set(size * 0.6, size * 0.9, size * 0.75);
    controls.target.set(0, 0, 0);
    controls.update();
    camera.near = Math.max(0.05, size * 0.002);
    camera.far = Math.max(maxDistance * 2, size * 10);
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
      forwardVector.copy(controls.target).sub(camera.position);
      forwardVector.y = 0;
      if (forwardVector.lengthSq() === 0) {
        forwardVector.set(0, 0, -1);
      }
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
    mapWidth = map.width;
    mapHeight = map.height;
    const geometry = buildTerrainGeometry(map);
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    updateTerrainMarkers(map);
    void renderTerrainTexture(map);
    if (resetCamera) {
      setCameraForMap(map.width, map.height);
    }
    resizeRenderer();
  };

  const updateMap = (map) => {
    const shouldResetCamera =
      !lastMap || map.width !== mapWidth || map.height !== mapHeight;
    applyMapGeometry(map, { resetCamera: shouldResetCamera });
    updateSelectionPreview();
  };

  const updateTerrainTypeDisplay = (nextValue) => {
    showTerrainTypes = nextValue;
    if (lastMap) {
      updateTerrainMarkers(lastMap);
    }
  };

  const updateTerrainTextureDisplay = (nextValue) => {
    showTerrainTextures = nextValue;
    if (lastMap) {
      void renderTerrainTexture(lastMap);
    }
  };

  const updateTileNumberDisplay = (nextValue) => {
    showTileNumbers = nextValue;
    if (lastMap) {
      void renderTerrainTexture(lastMap);
    }
  };

  const updateHeightDisplay = (nextValue) => {
    showHeights = nextValue;
    if (lastMap) {
      void renderTerrainTexture(lastMap);
    }
  };

  const setSelection = ({ startIndex = null, endIndex = null } = {}) => {
    selectionStart = Number.isFinite(startIndex) ? startIndex : null;
    selectionEnd = Number.isFinite(endIndex) ? endIndex : null;
    updateSelectionPreview();
    const mode = typeof getTerrainMode === "function" ? getTerrainMode() : "draw";
    if (mode === "draw" && hasSelection()) {
      highlightMesh.visible = false;
    }
  };

  const resolveBrushSize = () => {
    const mode = typeof getTerrainMode === "function" ? getTerrainMode() : "draw";
    const requestedSize =
      typeof getBrushSize === "function"
        ? Number.parseInt(getBrushSize(), 10)
        : 1;
    const normalizedSize = Number.isFinite(requestedSize)
      ? Math.max(1, requestedSize)
      : 1;
    return mode === "brush" ? normalizedSize : 1;
  };

  const hasSelection = () =>
    Number.isFinite(selectionStart) && Number.isFinite(selectionEnd);

  const updateBrushPreview = (index) => {
    if (!Number.isFinite(index)) {
      highlightMesh.visible = false;
      return;
    }
    const mode = typeof getTerrainMode === "function" ? getTerrainMode() : "draw";
    if (mode === "draw" && hasSelection()) {
      highlightMesh.visible = false;
      return;
    }
    const brushSize = resolveBrushSize();
    if (!Number.isFinite(mapWidth) || !Number.isFinite(mapHeight)) {
      highlightMesh.visible = false;
      return;
    }
    const x = index % mapWidth;
    const y = Math.floor(index / mapWidth);
    const half = Math.floor(brushSize / 2);
    const startX = x - half;
    const startY = y - half;
    const endX = startX + brushSize - 1;
    const endY = startY + brushSize - 1;

    const totalInstances = brushSize * brushSize;
    const currentCapacity = highlightMesh.instanceMatrix.count;
    if (totalInstances > currentCapacity) {
      const nextCapacity = Math.max(totalInstances, currentCapacity * 2);
      const nextMatrix = new THREE.InstancedBufferAttribute(
        new Float32Array(nextCapacity * 16),
        16
      );
      nextMatrix.setUsage(THREE.DynamicDrawUsage);
      highlightMesh.instanceMatrix = nextMatrix;
    }
    if (highlightMesh.count !== totalInstances) {
      highlightMesh.count = totalInstances;
    }

    let instanceIndex = 0;
    const tempMatrix = new THREE.Matrix4();
    const elevation = TERRAIN_HEIGHT + 0.08;
    for (let row = startY; row <= endY; row += 1) {
      for (let col = startX; col <= endX; col += 1) {
        if (col < 0 || col >= mapWidth || row < 0 || row >= mapHeight) {
          tempMatrix.makeTranslation(0, -999, 0);
        } else {
          const worldX = col - mapWidth / 2 + 0.5;
          const worldZ = row - mapHeight / 2 + 0.5;
          tempMatrix.makeTranslation(worldX, elevation, worldZ);
        }
        highlightMesh.setMatrixAt(instanceIndex, tempMatrix);
        instanceIndex += 1;
      }
    }
    highlightMesh.instanceMatrix.needsUpdate = true;
    highlightMesh.visible = true;
  };

  const updateSelectionPreview = () => {
    if (!hasSelection()) {
      selectionMesh.visible = false;
      return;
    }
    if (!Number.isFinite(mapWidth) || !Number.isFinite(mapHeight)) {
      selectionMesh.visible = false;
      return;
    }
    const startX = selectionStart % mapWidth;
    const startY = Math.floor(selectionStart / mapWidth);
    const endX = selectionEnd % mapWidth;
    const endY = Math.floor(selectionEnd / mapWidth);
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const totalInstances = width * height;
    const currentCapacity = selectionMesh.instanceMatrix.count;
    if (totalInstances > currentCapacity) {
      const nextCapacity = Math.max(totalInstances, currentCapacity * 2);
      const nextMatrix = new THREE.InstancedBufferAttribute(
        new Float32Array(nextCapacity * 16),
        16
      );
      nextMatrix.setUsage(THREE.DynamicDrawUsage);
      selectionMesh.instanceMatrix = nextMatrix;
    }
    if (selectionMesh.count !== totalInstances) {
      selectionMesh.count = totalInstances;
    }
    let instanceIndex = 0;
    const tempMatrix = new THREE.Matrix4();
    const elevation = TERRAIN_HEIGHT + 0.06;
    for (let row = minY; row <= maxY; row += 1) {
      for (let col = minX; col <= maxX; col += 1) {
        const worldX = col - mapWidth / 2 + 0.5;
        const worldZ = row - mapHeight / 2 + 0.5;
        tempMatrix.makeTranslation(worldX, elevation, worldZ);
        selectionMesh.setMatrixAt(instanceIndex, tempMatrix);
        instanceIndex += 1;
      }
    }
    selectionMesh.instanceMatrix.needsUpdate = true;
    selectionMesh.visible = true;
  };

  const getCellIndexFromEvent = (event) => {
    if (!lastMap) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(mesh, false);
    if (!intersects.length) {
      return null;
    }
    const point = intersects[0].point;
    const xIndex = Math.floor(point.x + mapWidth / 2);
    const yIndex = Math.floor(point.z + mapHeight / 2);
    if (
      xIndex < 0 ||
      yIndex < 0 ||
      xIndex >= mapWidth ||
      yIndex >= mapHeight
    ) {
      return null;
    }
    return yIndex * mapWidth + xIndex;
  };

  const paintFromEvent = (event, { isStart = false } = {}) => {
    if (typeof onPaintCell !== "function") {
      return;
    }
    const index = getCellIndexFromEvent(event);
    if (index === null || index === lastPaintedIndex) {
      return;
    }
    lastPaintedIndex = index;
    onPaintCell({ index, isStart, shiftKey: event.shiftKey });
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }
    isPointerDown = true;
    lastPaintedIndex = null;
    canvas.setPointerCapture(event.pointerId);
    updateBrushPreview(getCellIndexFromEvent(event));
    paintFromEvent(event, { isStart: true });
  };

  const handlePointerMove = (event) => {
    updateBrushPreview(getCellIndexFromEvent(event));
    if (isPointerDown) {
      paintFromEvent(event, { isStart: false });
    }
  };

  const handlePointerUp = (event) => {
    if (!isPointerDown) {
      return;
    }
    isPointerDown = false;
    lastPaintedIndex = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    updateBrushPreview(getCellIndexFromEvent(event));
    if (typeof onPaintEnd === "function") {
      onPaintEnd();
    }
  };

  const handlePointerLeave = () => {
    highlightMesh.visible = false;
  };

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("pointerleave", handlePointerLeave);

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
    terrainMarkerGeometry.dispose();
    terrainMarkerMaterial.dispose();
    highlightGeometry.dispose();
    highlightMaterial.dispose();
    selectionMaterial.dispose();
    canvas.removeEventListener("pointerdown", handlePointerDown);
    canvas.removeEventListener("pointermove", handlePointerMove);
    canvas.removeEventListener("pointerup", handlePointerUp);
    canvas.removeEventListener("pointercancel", handlePointerUp);
    canvas.removeEventListener("pointerleave", handlePointerLeave);
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
    setTileNumberVisibility: updateTileNumberDisplay,
    setHeightVisibility: updateHeightDisplay,
    setSelection,
    resize: resizeRenderer,
    dispose,
  };
};
