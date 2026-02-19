import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js";
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
const DOOR_MARKER_PATH = "door-marker";
const DOOR_MARKER_COLOR = "#f97316";
const DOOR_MARKER_FRAME_COLOR = "#0f172a";
const DEFAULT_MAP_AREA_ID = "operations-exterior";
const DEFAULT_PLAYER_HEIGHT = 1.8;
const OUTSIDE_HEIGHT_UNITS_PER_PLAYER = 3;
const ROOM_SCALE_FACTOR = 0.25;
const BASE_ROOM_WIDTH = 20 * ROOM_SCALE_FACTOR;
const BASE_ROOM_DEPTH = 60 * ROOM_SCALE_FACTOR;
const ENGINEERING_BAY_WIDTH_FACTOR = 2.1;
const ENGINEERING_BAY_DEPTH_FACTOR = 1.2;
const OUTSIDE_CELL_SIZE = ROOM_SCALE_FACTOR * 60;
const OUTSIDE_HEIGHT_SCALE =
  ((DEFAULT_PLAYER_HEIGHT - HEIGHT_FLOOR) * HEIGHT_MAX) /
  OUTSIDE_HEIGHT_UNITS_PER_PLAYER;

const clampPositiveNumber = (value, fallback = 1) => {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
};

const getFloorSpan = (size, padding) =>
  Math.max(0, clampPositiveNumber(size, 0) - clampPositiveNumber(padding, 0) * 2);

const resolveAreaCellSizes = (areaId, mapWidth, mapHeight) => {
  const safeWidth = clampPositiveNumber(mapWidth, 1);
  const safeHeight = clampPositiveNumber(mapHeight, 1);

  if (areaId === "operations-exterior") {
    return {
      cellSizeX: OUTSIDE_CELL_SIZE,
      cellSizeZ: OUTSIDE_CELL_SIZE,
    };
  }

  let floorWidth = safeWidth;
  let floorDepth = safeHeight;

  if (areaId === "hangar-deck") {
    floorWidth = getFloorSpan(BASE_ROOM_WIDTH, 1);
    floorDepth = getFloorSpan(BASE_ROOM_DEPTH, 1);
  } else if (areaId === "operations-concourse") {
    floorWidth = getFloorSpan(BASE_ROOM_WIDTH * 1.35, 0.75);
    floorDepth = getFloorSpan(BASE_ROOM_DEPTH * 0.85, 0.75);
  } else if (areaId === "engineering-bay") {
    floorWidth = getFloorSpan(
      BASE_ROOM_WIDTH * ENGINEERING_BAY_WIDTH_FACTOR,
      0.75
    );
    floorDepth = getFloorSpan(
      BASE_ROOM_DEPTH * ENGINEERING_BAY_DEPTH_FACTOR,
      0.75
    );
  } else if (areaId === "exterior-outpost") {
    floorWidth = getFloorSpan(BASE_ROOM_WIDTH * 1.8, 1.1);
    floorDepth = getFloorSpan(BASE_ROOM_DEPTH * 1.15, 1.6);
  }

  return {
    cellSizeX: clampPositiveNumber(floorWidth / safeWidth, 1),
    cellSizeZ: clampPositiveNumber(floorDepth / safeHeight, 1),
  };
};

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

const buildTerrainGeometry = (
  map,
  { cellSizeX = 1, cellSizeZ = 1, resolveHeight = getTerrainHeight } = {}
) => {
  const positions = [];
  const colors = [];
  const uvs = [];

  const width = map.width;
  const height = map.height;
  const xOffset = width / 2;
  const zOffset = height / 2;

  const baseColor = new THREE.Color(NEUTRAL_TERRAIN_COLOR);

  const addQuad = (quadPositions, quadUvs) => {
    positions.push(...quadPositions[0], ...quadPositions[1], ...quadPositions[2]);
    positions.push(...quadPositions[0], ...quadPositions[2], ...quadPositions[3]);
    uvs.push(...quadUvs[0], ...quadUvs[1], ...quadUvs[2]);
    uvs.push(...quadUvs[0], ...quadUvs[2], ...quadUvs[3]);
    for (let i = 0; i < 6; i += 1) {
      colors.push(baseColor.r, baseColor.g, baseColor.b);
    }
  };

  const getCellHeight = (index) => resolveHeight(map.heights?.[index]);
  const isVoidCell = (index) => map.cells?.[index]?.terrainId === "void";
  const isHeightDrop = (fromHeight, toHeight) => fromHeight - toHeight > 0.001;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (isVoidCell(index)) {
        continue;
      }
      const elevation = getCellHeight(index);

      const x0 = (x - xOffset) * cellSizeX;
      const x1 = (x + 1 - xOffset) * cellSizeX;
      const z0 = (y - zOffset) * cellSizeZ;
      const z1 = (y + 1 - zOffset) * cellSizeZ;

      const u0 = x / width;
      const u1 = (x + 1) / width;
      const v0 = y / height;
      const v1 = (y + 1) / height;

      addQuad(
        [
          [x0, elevation, z0],
          [x0, elevation, z1],
          [x1, elevation, z1],
          [x1, elevation, z0],
        ],
        [
          [u0, v0],
          [u0, v1],
          [u1, v1],
          [u1, v0],
        ]
      );

      const westIndex = x > 0 ? index - 1 : null;
      const eastIndex = x < width - 1 ? index + 1 : null;
      const northIndex = y > 0 ? index - width : null;
      const southIndex = y < height - 1 ? index + width : null;

      const westHeight =
        westIndex !== null && !isVoidCell(westIndex) ? getCellHeight(westIndex) : 0;
      const eastHeight =
        eastIndex !== null && !isVoidCell(eastIndex) ? getCellHeight(eastIndex) : 0;
      const northHeight =
        northIndex !== null && !isVoidCell(northIndex)
          ? getCellHeight(northIndex)
          : 0;
      const southHeight =
        southIndex !== null && !isVoidCell(southIndex)
          ? getCellHeight(southIndex)
          : 0;

      if (isHeightDrop(elevation, westHeight)) {
        addQuad(
          [
            [x0, elevation, z0],
            [x0, westHeight, z0],
            [x0, westHeight, z1],
            [x0, elevation, z1],
          ],
          [
            [u0, v0],
            [u0, v1],
            [u1, v1],
            [u1, v0],
          ]
        );
      }

      if (isHeightDrop(elevation, eastHeight)) {
        addQuad(
          [
            [x1, elevation, z1],
            [x1, eastHeight, z1],
            [x1, eastHeight, z0],
            [x1, elevation, z0],
          ],
          [
            [u0, v0],
            [u0, v1],
            [u1, v1],
            [u1, v0],
          ]
        );
      }

      if (isHeightDrop(elevation, northHeight)) {
        addQuad(
          [
            [x1, elevation, z0],
            [x1, northHeight, z0],
            [x0, northHeight, z0],
            [x0, elevation, z0],
          ],
          [
            [u0, v0],
            [u0, v1],
            [u1, v1],
            [u1, v0],
          ]
        );
      }

      if (isHeightDrop(elevation, southHeight)) {
        addQuad(
          [
            [x0, elevation, z1],
            [x0, southHeight, z1],
            [x1, southHeight, z1],
            [x1, elevation, z1],
          ],
          [
            [u0, v0],
            [u0, v1],
            [u1, v1],
            [u1, v0],
          ]
        );
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
  getSelectedAreaId,
  initialHeightVisibility = false,
  initialTextureVisibility = true,
  initialTileNumberVisibility = true,
  getBrushSize,
  getTerrainMode,
  getActiveTab,
  getSelectedObject,
  getDoorMode,
  onPlaceObject,
  onMoveObject,
  onRemoveObject,
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

  const objectGroup = new THREE.Group();
  scene.add(objectGroup);
  const areaReferenceGroup = new THREE.Group();
  areaReferenceGroup.name = "Area Reference";
  scene.add(areaReferenceGroup);
  const objectPreviewGroup = new THREE.Group();
  objectPreviewGroup.visible = false;
  objectPreviewGroup.name = "Object Preview";
  scene.add(objectPreviewGroup);

  const gltfLoader = new GLTFLoader();
  const modelCache = new Map();
  const modelPromiseCache = new Map();

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
    side: THREE.DoubleSide,
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
  const objectHighlightGeometry = new THREE.PlaneGeometry(1.15, 1.15);
  objectHighlightGeometry.rotateX(-Math.PI / 2);
  const objectHighlightMaterial = new THREE.MeshBasicMaterial({
    color: "#fbbf24",
    transparent: true,
    opacity: 0.4,
    depthTest: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const objectHighlightMesh = new THREE.Mesh(
    objectHighlightGeometry,
    objectHighlightMaterial
  );
  objectHighlightMesh.visible = false;
  objectHighlightMesh.renderOrder = 3;
  scene.add(objectHighlightMesh);
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
  const interactionPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    -HEIGHT_FLOOR
  );
  const interactionPoint = new THREE.Vector3();
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
  let mapCellSizeX = 1;
  let mapCellSizeZ = 1;
  let mapWorldWidth = 0;
  let mapWorldDepth = 0;
  let selectedAreaId = DEFAULT_MAP_AREA_ID;
  let objectPlacementToken = 0;
  let objectPlacements = [];
  let objectMoveSelectionIndex = null;
  let previewObject = null;
  let previewPath = null;
  let previewToken = 0;
  let previewIndex = null;
  let objectHighlightStart = null;
  let areaReferenceGeometries = [];
  let areaReferenceMaterials = [];
  const OBJECT_HIGHLIGHT_DURATION = 1.8;

  const resolveActiveAreaId = (map) => {
    const areaIdRaw =
      typeof getSelectedAreaId === "function"
        ? getSelectedAreaId()
        : map?.region;
    if (typeof areaIdRaw === "string" && areaIdRaw.trim().length > 0) {
      return areaIdRaw.trim();
    }
    return DEFAULT_MAP_AREA_ID;
  };

  const updateMapScaleMetrics = (map) => {
    if (!map || !Number.isFinite(map.width) || !Number.isFinite(map.height)) {
      mapCellSizeX = 1;
      mapCellSizeZ = 1;
      mapWorldWidth = 0;
      mapWorldDepth = 0;
      selectedAreaId = DEFAULT_MAP_AREA_ID;
      return;
    }
    selectedAreaId = resolveActiveAreaId(map);
    const cellSizes = resolveAreaCellSizes(selectedAreaId, map.width, map.height);
    mapCellSizeX = clampPositiveNumber(cellSizes.cellSizeX, 1);
    mapCellSizeZ = clampPositiveNumber(cellSizes.cellSizeZ, 1);
    mapWorldWidth = map.width * mapCellSizeX;
    mapWorldDepth = map.height * mapCellSizeZ;
  };

  const getCellCenterWorldX = (column) =>
    (column - mapWidth / 2 + 0.5) * mapCellSizeX;
  const getCellCenterWorldZ = (row) =>
    (row - mapHeight / 2 + 0.5) * mapCellSizeZ;
  const getMapLocalToWorldX = (localX) => localX * mapCellSizeX;
  const getMapLocalToWorldZ = (localZ) => localZ * mapCellSizeZ;
  const getWorldToMapLocalX = (worldX) => worldX / mapCellSizeX;
  const getWorldToMapLocalZ = (worldZ) => worldZ / mapCellSizeZ;
  const getDisplayHeightFromMapLocal = (localValue) => {
    const normalizedLocalValue = Number(localValue);
    if (!Number.isFinite(normalizedLocalValue)) {
      return HEIGHT_FLOOR;
    }
    if (selectedAreaId !== "operations-exterior") {
      return normalizedLocalValue;
    }
    const localElevation = Math.max(0, normalizedLocalValue - HEIGHT_FLOOR);
    return HEIGHT_FLOOR + (OUTSIDE_HEIGHT_SCALE * localElevation) / HEIGHT_SCALE;
  };
  const getDisplayTerrainHeight = (heightValue = HEIGHT_MIN) =>
    getDisplayHeightFromMapLocal(getTerrainHeight(heightValue));
  const getCellHighlightScaleX = () => Math.max(0.2, mapCellSizeX * 0.98);
  const getCellHighlightScaleZ = () => Math.max(0.2, mapCellSizeZ * 0.98);
  const getObjectHighlightBaseScale = () =>
    Math.max(0.25, Math.min(mapCellSizeX, mapCellSizeZ) * 1.15);
  const identityQuaternion = new THREE.Quaternion();
  const createAreaReferenceMaterial = (params = {}) => {
    const material = new THREE.MeshStandardMaterial(params);
    areaReferenceMaterials.push(material);
    return material;
  };

  const createAreaReferenceMesh = (
    geometry,
    material,
    { castShadow = false, receiveShadow = false } = {}
  ) => {
    areaReferenceGeometries.push(geometry);
    const meshInstance = new THREE.Mesh(geometry, material);
    meshInstance.castShadow = castShadow;
    meshInstance.receiveShadow = receiveShadow;
    return meshInstance;
  };

  const clearAreaReferenceEnvironment = () => {
    areaReferenceGroup.clear();
    areaReferenceGeometries.forEach((geometry) => {
      geometry.dispose();
    });
    areaReferenceMaterials.forEach((material) => {
      material.dispose();
    });
    areaReferenceGeometries = [];
    areaReferenceMaterials = [];
  };

  const addPerimeterWalls = (
    {
      halfWidth,
      halfDepth,
      wallHeight,
      wallThickness,
      wallInset = 0,
      pillarOffset = 0.4,
    },
    wallMaterial,
    trimMaterial
  ) => {
    const adjustedHalfWidth = Math.max(0.4, halfWidth - wallInset);
    const adjustedHalfDepth = Math.max(0.4, halfDepth - wallInset);

    const northWall = createAreaReferenceMesh(
      new THREE.BoxGeometry(adjustedHalfWidth * 2, wallHeight, wallThickness),
      wallMaterial
    );
    northWall.position.set(0, wallHeight / 2, -adjustedHalfDepth);
    areaReferenceGroup.add(northWall);

    const southWall = createAreaReferenceMesh(
      new THREE.BoxGeometry(adjustedHalfWidth * 2, wallHeight, wallThickness),
      wallMaterial
    );
    southWall.position.set(0, wallHeight / 2, adjustedHalfDepth);
    areaReferenceGroup.add(southWall);

    const westWall = createAreaReferenceMesh(
      new THREE.BoxGeometry(wallThickness, wallHeight, adjustedHalfDepth * 2),
      wallMaterial
    );
    westWall.position.set(-adjustedHalfWidth, wallHeight / 2, 0);
    areaReferenceGroup.add(westWall);

    const eastWall = createAreaReferenceMesh(
      new THREE.BoxGeometry(wallThickness, wallHeight, adjustedHalfDepth * 2),
      wallMaterial
    );
    eastWall.position.set(adjustedHalfWidth, wallHeight / 2, 0);
    areaReferenceGroup.add(eastWall);

    const pillarHeight = wallHeight + 0.35;
    const pillarSize = wallThickness + 0.08;
    const pillarOffsetX = Math.max(0.2, adjustedHalfWidth - pillarOffset);
    const pillarOffsetZ = Math.max(0.2, adjustedHalfDepth - pillarOffset);
    const pillarPositions = [
      [pillarOffsetX, pillarOffsetZ],
      [pillarOffsetX, -pillarOffsetZ],
      [-pillarOffsetX, pillarOffsetZ],
      [-pillarOffsetX, -pillarOffsetZ],
    ];
    pillarPositions.forEach(([x, z]) => {
      const pillar = createAreaReferenceMesh(
        new THREE.BoxGeometry(pillarSize, pillarHeight, pillarSize),
        trimMaterial
      );
      pillar.position.set(x, pillarHeight / 2, z);
      areaReferenceGroup.add(pillar);
    });
  };

  const addDoorFrame = (
    { centerX = 0, centerZ = 0, width = 1.25, height = 1.9, depth = 0.12 },
    frameMaterial,
    panelMaterial
  ) => {
    const frameThickness = 0.11;
    const frame = createAreaReferenceMesh(
      new THREE.BoxGeometry(
        width + frameThickness * 2,
        height + frameThickness * 2,
        depth + frameThickness
      ),
      frameMaterial
    );
    frame.position.set(centerX, height / 2, centerZ);
    areaReferenceGroup.add(frame);

    const panel = createAreaReferenceMesh(
      new THREE.BoxGeometry(width, height, depth),
      panelMaterial
    );
    panel.position.set(centerX, height / 2, centerZ + frameThickness * 0.1);
    areaReferenceGroup.add(panel);
  };

  const rebuildAreaReferenceEnvironment = (map) => {
    clearAreaReferenceEnvironment();

    if (!map || !Number.isFinite(map.width) || !Number.isFinite(map.height)) {
      return;
    }

    const areaId = selectedAreaId;
    const scaledWidth = map.width * mapCellSizeX;
    const scaledDepth = map.height * mapCellSizeZ;
    const referenceWidth =
      areaId === "operations-exterior" ? map.width : scaledWidth;
    const referenceDepth =
      areaId === "operations-exterior" ? map.height : scaledDepth;
    const halfWidth = referenceWidth / 2;
    const halfDepth = referenceDepth / 2;
    const wallHeight = areaId === "exterior-outpost" ? 1.1 : 1.9;
    const wallThickness = 0.18;

    const wallMaterial = createAreaReferenceMaterial({
      color: 0x1f2937,
      roughness: 0.64,
      metalness: 0.28,
    });
    const trimMaterial = createAreaReferenceMaterial({
      color: 0x475569,
      roughness: 0.42,
      metalness: 0.55,
    });
    const panelMaterial = createAreaReferenceMaterial({
      color: 0x0f172a,
      emissive: 0x1e3a8a,
      emissiveIntensity: 0.22,
      roughness: 0.3,
      metalness: 0.35,
    });
    const platformMaterial = createAreaReferenceMaterial({
      color: 0x111827,
      roughness: 0.68,
      metalness: 0.24,
    });
    const glowMaterial = createAreaReferenceMaterial({
      color: 0x22d3ee,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.75,
      roughness: 0.24,
      metalness: 0.35,
    });

    const AREA_IDS_WITH_PERIMETER_WALLS = new Set([
      "hangar-deck",
      "operations-concourse",
    ]);

    if (AREA_IDS_WITH_PERIMETER_WALLS.has(areaId)) {
      addPerimeterWalls(
        {
          halfWidth,
          halfDepth,
          wallHeight,
          wallThickness,
          wallInset: areaId === "exterior-outpost" ? 0.2 : 0,
        },
        wallMaterial,
        trimMaterial
      );
    }

    if (areaId === "hangar-deck") {
      const runway = createAreaReferenceMesh(
        new THREE.BoxGeometry(
          Math.max(1.6, referenceWidth * 0.5),
          0.06,
          Math.max(2.5, referenceDepth * 0.72)
        ),
        platformMaterial
      );
      runway.position.set(0, 0.03, 0);
      areaReferenceGroup.add(runway);

      const console = createAreaReferenceMesh(
        new THREE.BoxGeometry(1.4, 0.9, 0.5),
        trimMaterial
      );
      console.position.set(0, 0.45, -halfDepth + 1.1);
      areaReferenceGroup.add(console);

      [-1, 1].forEach((side) => {
        const crate = createAreaReferenceMesh(
          new THREE.BoxGeometry(0.55, 0.55, 0.55),
          wallMaterial
        );
        crate.position.set(side * (halfWidth * 0.55), 0.275, 0.35);
        areaReferenceGroup.add(crate);
      });

      addDoorFrame(
        {
          centerX: 0,
          centerZ: -halfDepth + 0.18,
          width: 1.35,
          height: 1.9,
          depth: 0.1,
        },
        trimMaterial,
        panelMaterial
      );
    } else if (areaId === "operations-concourse") {
      const catwalk = createAreaReferenceMesh(
        new THREE.BoxGeometry(
          Math.max(2, referenceWidth * 0.68),
          0.08,
          Math.max(1.8, referenceDepth * 0.3)
        ),
        platformMaterial
      );
      catwalk.position.set(0, 0.04, 0);
      areaReferenceGroup.add(catwalk);

      const railLength = Math.max(3, referenceDepth * 0.72);
      [-1, 1].forEach((side) => {
        const rail = createAreaReferenceMesh(
          new THREE.BoxGeometry(0.1, 0.8, railLength),
          trimMaterial
        );
        rail.position.set(side * (referenceWidth * 0.24), 0.4, 0);
        areaReferenceGroup.add(rail);
      });

      addDoorFrame(
        {
          centerX: 0,
          centerZ: -halfDepth + 0.2,
          width: 1.2,
          height: 1.85,
          depth: 0.1,
        },
        trimMaterial,
        glowMaterial
      );
    } else if (areaId === "engineering-bay") {
      const gantry = createAreaReferenceMesh(
        new THREE.BoxGeometry(Math.max(2.4, referenceWidth * 0.7), 0.12, 0.6),
        trimMaterial
      );
      gantry.position.set(0, 0.18, 0);
      areaReferenceGroup.add(gantry);

      const beamHeight = 2.6;
      const beamOffsetX = Math.max(0.6, halfWidth - 0.5);
      const beamOffsetZ = Math.max(0.6, halfDepth - 0.5);
      [
        [beamOffsetX, beamOffsetZ],
        [beamOffsetX, -beamOffsetZ],
        [-beamOffsetX, beamOffsetZ],
        [-beamOffsetX, -beamOffsetZ],
      ].forEach(([x, z]) => {
        const beam = createAreaReferenceMesh(
          new THREE.BoxGeometry(0.18, beamHeight, 0.18),
          trimMaterial
        );
        beam.position.set(x, beamHeight / 2, z);
        areaReferenceGroup.add(beam);
      });

      const generatorHousing = createAreaReferenceMesh(
        new THREE.CylinderGeometry(0.58, 0.75, 1.1, 20),
        wallMaterial
      );
      generatorHousing.position.set(0, 0.55, -halfDepth * 0.18);
      areaReferenceGroup.add(generatorHousing);

      const generatorCore = createAreaReferenceMesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.9, 20),
        glowMaterial
      );
      generatorCore.position.set(0, 0.55, -halfDepth * 0.18);
      areaReferenceGroup.add(generatorCore);

      const console = createAreaReferenceMesh(
        new THREE.BoxGeometry(1.2, 0.75, 0.4),
        trimMaterial
      );
      console.position.set(0, 0.55, halfDepth - 0.8);
      areaReferenceGroup.add(console);

      const pipeGeometryA = new THREE.CylinderGeometry(
        0.12,
        0.12,
        Math.max(2, referenceWidth * 0.9),
        16
      );
      const upperPipeA = createAreaReferenceMesh(pipeGeometryA, wallMaterial);
      upperPipeA.rotation.z = Math.PI / 2;
      upperPipeA.position.set(0, 1.15, -halfDepth + 0.65);
      areaReferenceGroup.add(upperPipeA);
      const upperPipeB = createAreaReferenceMesh(
        new THREE.CylinderGeometry(
          0.12,
          0.12,
          Math.max(2, referenceWidth * 0.9),
          16
        ),
        wallMaterial
      );
      upperPipeB.rotation.z = Math.PI / 2;
      upperPipeB.position.set(0, 1.15, halfDepth - 0.65);
      areaReferenceGroup.add(upperPipeB);

      addDoorFrame(
        {
          centerX: 0,
          centerZ: -halfDepth + 0.18,
          width: 1.2,
          height: 1.85,
          depth: 0.1,
        },
        trimMaterial,
        panelMaterial
      );
    } else if (areaId === "exterior-outpost") {
      const overlook = createAreaReferenceMesh(
        new THREE.BoxGeometry(
          Math.max(2, referenceWidth * 0.58),
          0.08,
          Math.max(2.2, referenceDepth * 0.35)
        ),
        platformMaterial
      );
      overlook.position.set(-referenceWidth * 0.17, 0.06, referenceDepth * 0.08);
      areaReferenceGroup.add(overlook);

      const rail = createAreaReferenceMesh(
        new THREE.BoxGeometry(Math.max(2, referenceWidth * 0.6), 0.12, 0.12),
        trimMaterial
      );
      rail.position.set(-referenceWidth * 0.17, 1.02, halfDepth - 0.55);
      areaReferenceGroup.add(rail);

      [-1, 1].forEach((side) => {
        const planter = createAreaReferenceMesh(
          new THREE.CylinderGeometry(0.22, 0.3, 0.28, 14),
          wallMaterial
        );
        planter.position.set(-referenceWidth * 0.17 + side * 0.95, 0.14, -0.2);
        areaReferenceGroup.add(planter);
      });

      addDoorFrame(
        {
          centerX: -referenceWidth * 0.18,
          centerZ: -halfDepth + 0.2,
          width: 1.15,
          height: 1.8,
          depth: 0.1,
        },
        trimMaterial,
        panelMaterial
      );
    } else {
      const landingPad = createAreaReferenceMesh(
        new THREE.BoxGeometry(
          Math.max(2, referenceWidth * 0.48),
          0.06,
          Math.max(1.2, referenceDepth * 0.24)
        ),
        trimMaterial
      );
      landingPad.position.set(0, 0.03, -referenceDepth * 0.15);
      areaReferenceGroup.add(landingPad);

      const tunnelFrame = createAreaReferenceMesh(
        new THREE.BoxGeometry(1.5, 1.8, 0.12),
        wallMaterial
      );
      tunnelFrame.position.set(0, 0.9, -halfDepth + 0.2);
      areaReferenceGroup.add(tunnelFrame);
    }
  };

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

  const resolveModelPath = (path) => {
    if (typeof path !== "string") {
      return null;
    }
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    if (path.startsWith("models/")) {
      return path;
    }
    return `models/${path}`;
  };

  const cloneModel = (source) => {
    const clone = source.clone(true);
    clone.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
      }
    });
    return clone;
  };

  const applyPreviewMaterial = (object) => {
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        const material = child.material;
        material.transparent = true;
        material.opacity = 0.55;
        material.depthWrite = false;
      }
    });
  };

  const createDoorMarkerModel = () => {
    const group = new THREE.Group();
    group.name = "Door Marker";

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: DOOR_MARKER_FRAME_COLOR,
      roughness: 0.5,
      metalness: 0.3,
    });
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: DOOR_MARKER_COLOR,
      emissive: DOOR_MARKER_COLOR,
      emissiveIntensity: 0.25,
      roughness: 0.4,
      metalness: 0.2,
    });

    const doorWidth = 0.9;
    const doorHeight = 1.6;
    const doorDepth = 0.08;
    const frameThickness = 0.08;

    const frameGeometry = new THREE.BoxGeometry(
      doorWidth + frameThickness * 2,
      doorHeight + frameThickness * 2,
      doorDepth + frameThickness
    );
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.y = doorHeight / 2;

    const panelGeometry = new THREE.BoxGeometry(
      doorWidth,
      doorHeight,
      doorDepth
    );
    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panel.position.y = doorHeight / 2;
    panel.position.z = frameThickness * 0.1;

    const thresholdGeometry = new THREE.BoxGeometry(
      doorWidth + frameThickness * 2.4,
      frameThickness * 0.4,
      doorDepth + frameThickness * 0.6
    );
    const threshold = new THREE.Mesh(thresholdGeometry, frameMaterial);
    threshold.position.y = frameThickness * 0.2;

    group.add(frame, panel, threshold);
    return group;
  };

  const loadModel = (path) => {
    if (path === DOOR_MARKER_PATH) {
      if (modelCache.has(path)) {
        return Promise.resolve(modelCache.get(path));
      }
      const doorMarker = createDoorMarkerModel();
      modelCache.set(path, doorMarker);
      return Promise.resolve(doorMarker);
    }
    const resolvedPath = resolveModelPath(path);
    if (!resolvedPath) {
      return Promise.resolve(null);
    }
    if (modelCache.has(resolvedPath)) {
      return Promise.resolve(modelCache.get(resolvedPath));
    }
    if (modelPromiseCache.has(resolvedPath)) {
      return modelPromiseCache.get(resolvedPath);
    }
    const promise = new Promise((resolve) => {
      gltfLoader.load(
        resolvedPath,
        (gltf) => {
          const sceneAsset = gltf?.scene ?? null;
          modelCache.set(resolvedPath, sceneAsset);
          modelPromiseCache.delete(resolvedPath);
          resolve(sceneAsset);
        },
        undefined,
        (error) => {
          console.error("Failed to load model", resolvedPath, error);
          modelCache.set(resolvedPath, null);
          modelPromiseCache.delete(resolvedPath);
          resolve(null);
        }
      );
    });
    modelPromiseCache.set(resolvedPath, promise);
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
        material.map.dispose();
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
    const nextCanvasWidth = width * TEXTURE_TILE_SIZE;
    const nextCanvasHeight = height * TEXTURE_TILE_SIZE;
    const didCanvasSizeChange =
      textureCanvas.width !== nextCanvasWidth ||
      textureCanvas.height !== nextCanvasHeight;
    textureCanvas.width = nextCanvasWidth;
    textureCanvas.height = nextCanvasHeight;

    if (didCanvasSizeChange && material.map) {
      material.map.dispose();
      material.map = null;
      material.needsUpdate = true;
    }

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
          textureContext.textAlign = "right";
          const textWidth = textureContext.measureText(heightLabel).width;
          const textX = drawX + TEXTURE_TILE_SIZE - labelPadding;
          const textY = drawY + labelPadding;
          textureContext.fillStyle = "rgba(2, 6, 23, 0.45)";
          textureContext.fillRect(
            textX - textWidth - labelPadding * 0.6,
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
    const tempPosition = new THREE.Vector3();
    const tempScale = new THREE.Vector3(
      clampPositiveNumber(mapCellSizeX, 1),
      1,
      clampPositiveNumber(mapCellSizeZ, 1)
    );
    const markerOffsetX = TERRAIN_MARKER_OFFSET * tempScale.x;
    const markerOffsetZ = TERRAIN_MARKER_OFFSET * tempScale.z;
    map.cells.forEach((cellData, index) => {
      const terrainId = cellData?.terrainId;
      const markerElevation =
        getDisplayTerrainHeight(map.heights?.[index]) + 0.04;
      const x = index % map.width;
      const y = Math.floor(index / map.width);
      const worldX = getCellCenterWorldX(x);
      const worldZ = getCellCenterWorldZ(y);
      tempPosition.set(
        worldX + markerOffsetX,
        markerElevation,
        worldZ + markerOffsetZ
      );
      tempMatrix.compose(tempPosition, identityQuaternion, tempScale);
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

  const buildObjectPlacement = (index, path) => {
    if (!lastMap || !Number.isFinite(mapWidth) || !Number.isFinite(mapHeight)) {
      return null;
    }
    if (!Number.isFinite(index)) {
      return null;
    }
    const x = index % mapWidth;
    const y = Math.floor(index / mapWidth);
    const mapLocalX = x - mapWidth / 2 + 0.5;
    const mapLocalZ =
      y -
      mapHeight / 2 +
      0.5 +
      (path === DOOR_MARKER_PATH ? -0.5 : 0);
    const heightValue = lastMap.heights?.[index];
    const mapLocalY = getTerrainHeight(heightValue);
    return {
      path,
      position: { x: mapLocalX, y: mapLocalY, z: mapLocalZ },
      heightReference: "map-local",
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };
  };

  const alignObjectToSurface = (object, surfaceY) => {
    if (!object || !Number.isFinite(surfaceY)) {
      return;
    }
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    if (!Number.isFinite(bounds.min.y)) {
      return;
    }
    const offset = surfaceY - bounds.min.y;
    if (!Number.isFinite(offset) || Math.abs(offset) < 0.0001) {
      return;
    }
    object.position.y += offset;
    object.updateMatrixWorld(true);
  };

  const applyObjectTransform = (object, placement) => {
    const position = placement?.position ?? { x: 0, y: 0, z: 0 };
    const rotation = placement?.rotation ?? { x: 0, y: 0, z: 0 };
    const scale = placement?.scale ?? { x: 1, y: 1, z: 1 };
    const worldX = getMapLocalToWorldX(position.x);
    const worldZ = getMapLocalToWorldZ(position.z);
    const worldY = getDisplayHeightFromMapLocal(position.y);
    object.position.set(worldX, worldY, worldZ);
    object.rotation.set(rotation.x, rotation.y, rotation.z);
    object.scale.set(scale.x, scale.y, scale.z);
    alignObjectToSurface(object, worldY);
  };

  const updateMoveSelectionVisibility = () => {
    const activeTab =
      typeof getActiveTab === "function" ? getActiveTab() : null;
    const selectedIndex = Number.parseInt(objectMoveSelectionIndex, 10);
    const hasSelectedIndex =
      activeTab === "objects" &&
      Number.isFinite(selectedIndex) &&
      selectedIndex >= 0 &&
      selectedIndex < objectPlacements.length &&
      objectPlacements[selectedIndex]?.path !== DOOR_MARKER_PATH;
    objectGroup.children.forEach((entry) => {
      const placementIndex = Number.parseInt(
        entry.userData?.objectPlacementIndex,
        10
      );
      entry.visible = !(
        hasSelectedIndex &&
        Number.isFinite(placementIndex) &&
        placementIndex === selectedIndex
      );
    });
  };

  const updateObjectPlacements = (placements) => {
    objectPlacementToken += 1;
    const token = objectPlacementToken;
    objectPlacements = Array.isArray(placements) ? placements : [];
    if (
      Number.isFinite(objectMoveSelectionIndex) &&
      objectMoveSelectionIndex >= 0 &&
      objectMoveSelectionIndex < objectPlacements.length &&
      objectPlacements[objectMoveSelectionIndex]?.path !== DOOR_MARKER_PATH
    ) {
      // keep current move selection
    } else {
      objectMoveSelectionIndex = null;
    }
    objectGroup.clear();
    if (!objectPlacements.length) {
      return;
    }
    objectPlacements.forEach(async (placement, placementIndex) => {
      const model = await loadModel(placement.path);
      if (token !== objectPlacementToken || !model) {
        return;
      }
      const instance = cloneModel(model);
      applyObjectTransform(instance, placement);
      const instanceUserData = instance.userData || (instance.userData = {});
      instanceUserData.objectPlacementIndex = placementIndex;
      objectGroup.add(instance);
      updateMoveSelectionVisibility();
    });
  };

  const clearPreviewObject = () => {
    previewPath = null;
    previewObject = null;
    objectPreviewGroup.clear();
    objectPreviewGroup.visible = false;
  };

  const setCameraForMap = (worldWidth, worldDepth) => {
    const size = Math.max(worldWidth, worldDepth, 8);
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
    if (objectHighlightStart !== null) {
      const elapsed = clock.getElapsedTime() - objectHighlightStart;
      if (elapsed > OBJECT_HIGHLIGHT_DURATION) {
        objectHighlightStart = null;
        objectHighlightMesh.visible = false;
      } else {
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * Math.PI * 4);
        objectHighlightMaterial.opacity = 0.18 + 0.5 * pulse;
        const pulseScale =
          getObjectHighlightBaseScale() * (1 + 0.06 * Math.sin(elapsed * Math.PI * 2));
        objectHighlightMesh.scale.set(pulseScale, 1, pulseScale);
        objectHighlightMesh.visible = true;
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
    const previousAreaId = selectedAreaId;
    const previousCellSizeX = mapCellSizeX;
    const previousCellSizeZ = mapCellSizeZ;
    const didMapSizeChange =
      map.width !== mapWidth || map.height !== mapHeight;
    lastMap = map;
    mapWidth = map.width;
    mapHeight = map.height;
    updateMapScaleMetrics(map);
    const didScaleChange =
      selectedAreaId !== previousAreaId ||
      Math.abs(mapCellSizeX - previousCellSizeX) > 1e-6 ||
      Math.abs(mapCellSizeZ - previousCellSizeZ) > 1e-6;
    const geometry = buildTerrainGeometry(map, {
      cellSizeX: mapCellSizeX,
      cellSizeZ: mapCellSizeZ,
      resolveHeight: getDisplayTerrainHeight,
    });
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    rebuildAreaReferenceEnvironment(map);
    updateTerrainMarkers(map);
    void renderTerrainTexture(map);
    if (resetCamera || didMapSizeChange || didScaleChange) {
      setCameraForMap(mapWorldWidth, mapWorldDepth);
    }
    resizeRenderer();
  };

  const updateMap = (map) => {
    const shouldResetCamera =
      !lastMap || map.width !== mapWidth || map.height !== mapHeight;
    applyMapGeometry(map, { resetCamera: shouldResetCamera });
    updateObjectPlacements(map.objects);
    updateSelectionPreview();
    void updateObjectPreview(previewIndex);
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

  const setRaycasterFromEvent = (event) => {
    if (!event) {
      return false;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return false;
    }
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return true;
  };

  const getObjectPlacementRoot = (object) => {
    let current = object;
    while (current && current.parent && current.parent !== objectGroup) {
      current = current.parent;
    }
    if (!current || current.parent !== objectGroup) {
      return null;
    }
    return current;
  };

  const getObjectPlacementHitFromEvent = (event, { includeDoors = false } = {}) => {
    if (!setRaycasterFromEvent(event)) {
      return null;
    }
    const intersects = raycaster.intersectObjects(objectGroup.children, true);
    for (const hit of intersects) {
      const root = getObjectPlacementRoot(hit.object);
      if (!root) {
        continue;
      }
      if (root.visible === false) {
        continue;
      }
      const placementIndex = Number.parseInt(
        root.userData?.objectPlacementIndex,
        10
      );
      if (!Number.isFinite(placementIndex) || placementIndex < 0) {
        continue;
      }
      const placement = objectPlacements[placementIndex];
      if (!placement) {
        continue;
      }
      if (!includeDoors && placement.path === DOOR_MARKER_PATH) {
        continue;
      }
      return {
        index: placementIndex,
        placement,
      };
    }
    return null;
  };

  const getCellElevation = (index, offset = 0) => {
    if (!lastMap) {
      return TERRAIN_HEIGHT + offset;
    }
    const heightValue = lastMap.heights?.[index];
    return getDisplayTerrainHeight(heightValue) + offset;
  };

  const getCellIndexFromWorldPosition = (position) => {
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.z) ||
      !Number.isFinite(mapWidth) ||
      !Number.isFinite(mapHeight)
    ) {
      return null;
    }
    const localX = getWorldToMapLocalX(position.x);
    const localZ = getWorldToMapLocalZ(position.z);
    const x = Math.round(localX + mapWidth / 2 - 0.5);
    const y = Math.round(localZ + mapHeight / 2 - 0.5);
    if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) {
      return null;
    }
    return y * mapWidth + x;
  };

  const focusObject = (placement) => {
    if (!placement?.position) {
      return;
    }
    const { x, y, z } = placement.position;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return;
    }
    const worldX = getMapLocalToWorldX(x);
    const worldZ = getMapLocalToWorldZ(z);
    const target = new THREE.Vector3(worldX, 0, worldZ);
    const offset = new THREE.Vector3()
      .copy(camera.position)
      .sub(controls.target);
    controls.target.copy(target);
    camera.position.copy(target).add(offset);
    controls.update();
    const index = getCellIndexFromWorldPosition({ x: worldX, z: worldZ });
    const elevation = Number.isFinite(index)
      ? getCellElevation(index, 0.12)
      : Number.isFinite(y)
      ? getDisplayHeightFromMapLocal(y) + 0.12
      : TERRAIN_HEIGHT + 0.12;
    objectHighlightMesh.position.set(worldX, elevation, worldZ);
    objectHighlightStart = clock.getElapsedTime();
    objectHighlightMesh.visible = true;
  };

  const updateBrushPreview = (index) => {
    if (!Number.isFinite(index)) {
      highlightMesh.visible = false;
      return;
    }
    const activeTab =
      typeof getActiveTab === "function" ? getActiveTab() : null;
    if (activeTab !== "terrain" && activeTab !== "height") {
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
    const tempPosition = new THREE.Vector3();
    const tempScale = new THREE.Vector3(
      getCellHighlightScaleX(),
      1,
      getCellHighlightScaleZ()
    );
    for (let row = startY; row <= endY; row += 1) {
      for (let col = startX; col <= endX; col += 1) {
        if (col < 0 || col >= mapWidth || row < 0 || row >= mapHeight) {
          tempMatrix.makeTranslation(0, -999, 0);
        } else {
          const cellIndex = row * mapWidth + col;
          const elevation = getCellElevation(cellIndex, 0.08);
          const worldX = getCellCenterWorldX(col);
          const worldZ = getCellCenterWorldZ(row);
          tempPosition.set(worldX, elevation, worldZ);
          tempMatrix.compose(tempPosition, identityQuaternion, tempScale);
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
    const tempPosition = new THREE.Vector3();
    const tempScale = new THREE.Vector3(
      getCellHighlightScaleX(),
      1,
      getCellHighlightScaleZ()
    );
    for (let row = minY; row <= maxY; row += 1) {
      for (let col = minX; col <= maxX; col += 1) {
        const cellIndex = row * mapWidth + col;
        const elevation = getCellElevation(cellIndex, 0.06);
        const worldX = getCellCenterWorldX(col);
        const worldZ = getCellCenterWorldZ(row);
        tempPosition.set(worldX, elevation, worldZ);
        tempMatrix.compose(tempPosition, identityQuaternion, tempScale);
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
    if (!setRaycasterFromEvent(event)) {
      return null;
    }
    const intersects = raycaster.intersectObject(mesh, false);
    const topHit =
      intersects.find((hit) => (hit.face?.normal?.y ?? 0) > 0.5) ?? null;
    let point = topHit?.point ?? null;
    if (!point) {
      const planeHit = raycaster.ray.intersectPlane(
        interactionPlane,
        interactionPoint
      );
      if (planeHit) {
        point = planeHit;
      } else if (intersects.length > 0) {
        point = intersects[0].point;
      }
    }
    if (!point) {
      return null;
    }
    const localX = getWorldToMapLocalX(point.x);
    const localZ = getWorldToMapLocalZ(point.z);
    const xIndex = Math.floor(localX + mapWidth / 2);
    const yIndex = Math.floor(localZ + mapHeight / 2);
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

  const resolveSelectedObjectPath = () => {
    if (typeof getSelectedObject !== "function") {
      return null;
    }
    const entry = getSelectedObject();
    if (entry && typeof entry === "object") {
      return entry.path;
    }
    if (typeof entry === "string") {
      return entry;
    }
    return null;
  };

  const resolveDoorMode = () => {
    if (typeof getDoorMode !== "function") {
      return null;
    }
    return getDoorMode();
  };

  const applyPlacementTransformOverrides = (targetPlacement, sourcePlacement) => {
    if (!targetPlacement || !sourcePlacement) {
      return;
    }
    const sourceRotation = sourcePlacement.rotation ?? {};
    const sourceScale = sourcePlacement.scale ?? {};
    targetPlacement.rotation = {
      x: Number.isFinite(sourceRotation.x) ? sourceRotation.x : 0,
      y: Number.isFinite(sourceRotation.y) ? sourceRotation.y : 0,
      z: Number.isFinite(sourceRotation.z) ? sourceRotation.z : 0,
    };
    targetPlacement.scale = {
      x: Number.isFinite(sourceScale.x) ? sourceScale.x : 1,
      y: Number.isFinite(sourceScale.y) ? sourceScale.y : 1,
      z: Number.isFinite(sourceScale.z) ? sourceScale.z : 1,
    };
  };

  const getSelectedObjectMovePlacement = () => {
    if (!Number.isFinite(objectMoveSelectionIndex)) {
      return null;
    }
    const index = Number.parseInt(objectMoveSelectionIndex, 10);
    if (!Number.isFinite(index) || index < 0 || index >= objectPlacements.length) {
      return null;
    }
    const placement = objectPlacements[index];
    if (!placement || placement.path === DOOR_MARKER_PATH) {
      return null;
    }
    return { index, placement };
  };

  const updateObjectPreview = async (index) => {
    previewIndex = Number.isFinite(index) ? index : null;
    const activeTab =
      typeof getActiveTab === "function" ? getActiveTab() : null;
    if (activeTab !== "objects" && activeTab !== "doors") {
      objectMoveSelectionIndex = null;
      updateMoveSelectionVisibility();
      clearPreviewObject();
      return;
    }
    if (activeTab !== "objects") {
      objectMoveSelectionIndex = null;
    }

    const selectedMovePlacement =
      activeTab === "objects" ? getSelectedObjectMovePlacement() : null;
    updateMoveSelectionVisibility();
    const path =
      activeTab === "doors"
        ? resolveDoorMode() === "place"
          ? DOOR_MARKER_PATH
          : null
        : selectedMovePlacement?.placement?.path ?? resolveSelectedObjectPath();
    if (!path || !Number.isFinite(index)) {
      clearPreviewObject();
      return;
    }
    const placement = buildObjectPlacement(index, path);
    if (!placement) {
      clearPreviewObject();
      return;
    }
    if (selectedMovePlacement?.placement) {
      applyPlacementTransformOverrides(placement, selectedMovePlacement.placement);
    }
    if (!previewObject || previewPath !== path) {
      previewToken += 1;
      const token = previewToken;
      const model = await loadModel(path);
      if (token !== previewToken || !model) {
        return;
      }
      objectPreviewGroup.clear();
      const instance = cloneModel(model);
      applyPreviewMaterial(instance);
      previewObject = instance;
      previewPath = path;
      objectPreviewGroup.add(instance);
    }
    if (!previewObject) {
      return;
    }
    applyObjectTransform(previewObject, placement);
    objectPreviewGroup.visible = true;
  };

  const selectObjectForMoveFromEvent = (event) => {
    const hit = getObjectPlacementHitFromEvent(event, {
      includeDoors: false,
    });
    if (!hit) {
      return false;
    }
    objectMoveSelectionIndex = hit.index;
    focusObject(hit.placement);
    void updateObjectPreview(previewIndex);
    return true;
  };

  const moveSelectedObjectFromEvent = (event) => {
    if (typeof onMoveObject !== "function") {
      return false;
    }
    const selectedMovePlacement = getSelectedObjectMovePlacement();
    if (!selectedMovePlacement) {
      objectMoveSelectionIndex = null;
      return false;
    }
    const index = getCellIndexFromEvent(event);
    if (index === null) {
      return false;
    }
    const nextPlacement = buildObjectPlacement(
      index,
      selectedMovePlacement.placement.path
    );
    if (!nextPlacement) {
      return false;
    }
    applyPlacementTransformOverrides(
      nextPlacement,
      selectedMovePlacement.placement
    );
    onMoveObject({
      index: selectedMovePlacement.index,
      placement: nextPlacement,
    });
    objectMoveSelectionIndex = null;
    void updateObjectPreview(index);
    return true;
  };

  const placeObjectFromEvent = (event) => {
    if (typeof onPlaceObject !== "function") {
      return;
    }
    const path = resolveSelectedObjectPath();
    if (!path) {
      return;
    }
    const index = getCellIndexFromEvent(event);
    if (index === null) {
      return;
    }
    const placement = buildObjectPlacement(index, path);
    if (!placement) {
      return;
    }
    onPlaceObject(placement);
  };

  const placeDoorFromEvent = (event) => {
    if (typeof onPlaceObject !== "function") {
      return;
    }
    const index = getCellIndexFromEvent(event);
    if (index === null) {
      return;
    }
    const placement = buildObjectPlacement(index, DOOR_MARKER_PATH);
    if (!placement) {
      return;
    }
    onPlaceObject(placement);
  };

  const removeDoorFromEvent = (event) => {
    if (typeof onRemoveObject !== "function") {
      return;
    }
    const index = getCellIndexFromEvent(event);
    if (index === null) {
      return;
    }
    onRemoveObject({ index, path: DOOR_MARKER_PATH });
  };

  const paintFromEvent = (event, { isStart = false } = {}) => {
    if (typeof onPaintCell !== "function") {
      return;
    }
    const activeTab =
      typeof getActiveTab === "function" ? getActiveTab() : null;
    if (activeTab !== "terrain" && activeTab !== "height") {
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
    const activeTab =
      typeof getActiveTab === "function" ? getActiveTab() : null;
    if (activeTab === "doors") {
      const doorMode = resolveDoorMode();
      if (doorMode === "remove") {
        removeDoorFromEvent(event);
        return;
      }
      if (doorMode === "place") {
        placeDoorFromEvent(event);
      }
      return;
    }
    if (activeTab === "objects") {
      const selectedMovePlacement = getSelectedObjectMovePlacement();
      if (selectedMovePlacement) {
        const hit = getObjectPlacementHitFromEvent(event, {
          includeDoors: false,
        });
        if (hit && hit.index === selectedMovePlacement.index) {
          objectMoveSelectionIndex = null;
          void updateObjectPreview(previewIndex);
          return;
        }
        if (moveSelectedObjectFromEvent(event)) {
          return;
        }
        if (hit) {
          objectMoveSelectionIndex = hit.index;
          focusObject(hit.placement);
          void updateObjectPreview(previewIndex);
        }
        return;
      }
      if (selectObjectForMoveFromEvent(event)) {
        return;
      }
      placeObjectFromEvent(event);
      return;
    }
    if (activeTab !== "terrain" && activeTab !== "height") {
      return;
    }
    isPointerDown = true;
    lastPaintedIndex = null;
    canvas.setPointerCapture(event.pointerId);
    updateBrushPreview(getCellIndexFromEvent(event));
    paintFromEvent(event, { isStart: true });
  };

  const handlePointerMove = (event) => {
    const index = getCellIndexFromEvent(event);
    updateBrushPreview(index);
    void updateObjectPreview(index);
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
    clearPreviewObject();
  };

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("pointerleave", handlePointerLeave);

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      setCameraForMap(
        mapWorldWidth > 0 ? mapWorldWidth : mapSize,
        mapWorldDepth > 0 ? mapWorldDepth : mapSize
      );
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
    objectHighlightGeometry.dispose();
    objectHighlightMaterial.dispose();
    selectionMaterial.dispose();
    objectGroup.clear();
    clearAreaReferenceEnvironment();
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
    setObjectPlacements: updateObjectPlacements,
    focusObject,
    setSelection,
    resize: resizeRenderer,
    dispose,
  };
};
