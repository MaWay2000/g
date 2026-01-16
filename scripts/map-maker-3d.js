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
const TRANSPARENT_COLOR_KEYWORD = "transparent";

const getWebglSupport = () => {
  const canvas = document.createElement("canvas");
  const contexts = ["webgl2", "webgl", "experimental-webgl"];
  return contexts.some((name) => Boolean(canvas.getContext(name)));
};

const getTerrainHeight = () => TERRAIN_HEIGHT;

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
      const color = new THREE.Color(resolveTerrainColor(terrain, showColors));
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
  const highlightGeometry = new THREE.PlaneGeometry(1, 1);
  highlightGeometry.rotateX(-Math.PI / 2);
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: "#38bdf8",
    transparent: true,
    opacity: 0.35,
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
  highlightMesh.visible = false;
  highlightMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  highlightMesh.renderOrder = 2;
  scene.add(highlightMesh);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let isPointerDown = false;
  let lastPaintedIndex = null;

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
    const shouldResetCamera =
      !lastMap || map.width !== mapWidth || map.height !== mapHeight;
    applyMapGeometry(map, { resetCamera: shouldResetCamera });
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

  const updateBrushPreview = (index) => {
    if (!Number.isFinite(index)) {
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
    highlightGeometry.dispose();
    highlightMaterial.dispose();
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
    resize: resizeRenderer,
    dispose,
  };
};
