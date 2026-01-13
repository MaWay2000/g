import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import { getOutsideTerrainById } from "./outside-map.js";

const HEIGHT_FLOOR = 0.05;
const HEIGHT_SCALE = 6;
const TERRAIN_HEIGHT = HEIGHT_FLOOR + HEIGHT_SCALE * 0.5;
const NEUTRAL_TERRAIN_COLOR = "#475569";

const getWebglSupport = () => {
  const canvas = document.createElement("canvas");
  const contexts = ["webgl2", "webgl", "experimental-webgl"];
  return contexts.some((name) => Boolean(canvas.getContext(name)));
};

const getTerrainHeight = (terrain) => {
  if (!terrain || terrain.id === "void") {
    return 0;
  }
  return TERRAIN_HEIGHT;
};

const buildTerrainGeometry = (map, { showTerrainTypes } = {}) => {
  const positions = [];
  const colors = [];
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
        z0,
        x1,
        elevation,
        z1,
        x0,
        elevation,
        z0,
        x1,
        elevation,
        z1,
        x0,
        elevation,
        z1
      );

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
  geometry.computeVertexNormals();

  return geometry;
};

export const initMapMaker3d = ({
  canvas,
  errorElement,
  wireframeButton,
  resetButton,
  terrainTypeToggle,
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

  const ambientLight = new THREE.AmbientLight("#cbd5f5", 0.65);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight("#ffffff", 0.85);
  keyLight.position.set(10, 20, 15);
  scene.add(keyLight);

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

  let frameId = null;
  let mapSize = 10;
  let lastMap = null;
  let showTerrainTypes = terrainTypeToggle?.checked ?? true;
  const moveVector = new THREE.Vector3();
  const forwardVector = new THREE.Vector3();
  const rightVector = new THREE.Vector3();

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

  const resizeRenderer = () => {
    const { clientWidth, clientHeight } = canvas;
    if (!clientWidth || !clientHeight) {
      return;
    }
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
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

  const updateMap = (map) => {
    if (!map || !Number.isFinite(map.width) || !Number.isFinite(map.height)) {
      return;
    }
    lastMap = map;
    const geometry = buildTerrainGeometry(map, { showTerrainTypes });
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    setCameraForMap(map.width, map.height);
    resizeRenderer();
  };

  const updateTerrainTypeDisplay = (nextValue) => {
    showTerrainTypes = nextValue;
    if (lastMap) {
      updateMap(lastMap);
    }
  };

  const toggleWireframe = () => {
    material.wireframe = !material.wireframe;
    if (wireframeButton) {
      wireframeButton.textContent = material.wireframe
        ? "Wireframe: On"
        : "Wireframe: Off";
    }
  };

  if (wireframeButton) {
    wireframeButton.addEventListener("click", toggleWireframe);
  }

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      setCameraForMap(mapSize, mapSize);
    });
  }

  let terrainToggleHandler = null;
  if (terrainTypeToggle) {
    terrainToggleHandler = (event) => {
      updateTerrainTypeDisplay(event.target.checked);
    };
    terrainTypeToggle.addEventListener("change", terrainToggleHandler);
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
      terrainTypeToggle.removeEventListener("change", terrainToggleHandler);
    }
  };

  return {
    updateMap,
    dispose,
  };
};
