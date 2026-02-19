import {
  OUTSIDE_TERRAIN_TYPES as TERRAIN_TYPES,
  OUTSIDE_TERRAIN_TILES,
  OUTSIDE_MAP_LOCAL_STORAGE_KEY as LOCAL_STORAGE_KEY,
  clampOutsideMapDimension,
  getOutsideTerrainById as getTerrainById,
  getOutsideTerrainDefaultTileId,
  getOutsideTerrainTilePath,
  createDefaultOutsideMap,
  normalizeOutsideMap,
  tryGetOutsideMapStorage,
} from "./outside-map.js";
import { initMapMaker3d } from "./map-maker-3d.js";

let cachedLocalStorage;
const localSaveFeedbackTimers = {
  save: null,
  restore: null,
};
let autoSaveTimerId = null;

const MAP_AREAS = [
  {
    id: "hangar-deck",
    label: "Command Center",
    description: "Primary command deck and staging area.",
  },
  {
    id: "operations-concourse",
    label: "Outside Exit",
    description: "Transfer concourse between command and the surface.",
  },
  {
    id: "operations-exterior",
    label: "Surface Area",
    description: "Open outside terrain used for mining and traversal.",
  },
  {
    id: "engineering-bay",
    label: "Engineering Bay",
    description: "Workshop bay for construction and object placement.",
  },
  {
    id: "exterior-outpost",
    label: "Exterior Outpost",
    description: "Forward outpost zone beyond the main decks.",
  },
];
const DEFAULT_MAP_AREA_ID = "operations-exterior";
const MAP_AREA_BY_ID = new Map(MAP_AREAS.map((area) => [area.id, area]));
const MAP_AREA_TEMPLATE_PROFILES = new Map([
  [
    "hangar-deck",
    { width: 5, height: 15, terrainId: "transition-metal", heightValue: 0 },
  ],
  [
    "operations-concourse",
    { width: 7, height: 13, terrainId: "transition-metal", heightValue: 0 },
  ],
  ["operations-exterior", { useOutsideDefault: true }],
  [
    "engineering-bay",
    { width: 11, height: 18, terrainId: "transition-metal", heightValue: 0 },
  ],
  [
    "exterior-outpost",
    { width: 9, height: 17, terrainId: "transition-metal", heightValue: 0 },
  ],
]);

function createDefaultMapForArea(areaId = DEFAULT_MAP_AREA_ID) {
  const area =
    MAP_AREA_BY_ID.get(areaId) ?? MAP_AREA_BY_ID.get(DEFAULT_MAP_AREA_ID) ?? null;
  const profile =
    MAP_AREA_TEMPLATE_PROFILES.get(area?.id ?? "") ??
    MAP_AREA_TEMPLATE_PROFILES.get(DEFAULT_MAP_AREA_ID) ??
    { useOutsideDefault: true };
  const outsideDefaultMap = createDefaultOutsideMap();
  let mapDefinition = {
    ...outsideDefaultMap,
    objects: [],
  };

  if (profile.useOutsideDefault !== true) {
    const width = clampOutsideMapDimension(profile.width ?? outsideDefaultMap.width);
    const height = clampOutsideMapDimension(
      profile.height ?? outsideDefaultMap.height
    );
    const resolvedTerrain = getTerrainById(profile.terrainId);
    const terrainId = resolvedTerrain.id;
    const tileId = getOutsideTerrainDefaultTileId(terrainId);
    const nextCells = Array.from({ length: width * height }, () => ({
      terrainId,
      tileId,
    }));
    const defaultHeight = clampHeightValue(profile.heightValue ?? 0);
    const nextHeights = Array.from({ length: width * height }, () => defaultHeight);

    mapDefinition = {
      ...mapDefinition,
      width,
      height,
      cells: nextCells,
      heights: nextHeights,
      objects: [],
    };
  }

  const normalized = normalizeMapDefinition(mapDefinition);

  if (!area) {
    return normalized;
  }

  normalized.name = area.label;
  normalized.region = area.id;
  normalized.notes =
    typeof area.description === "string"
      ? area.description
      : normalized.notes ?? "";
  return normalized;
}

const state = {
  selectedTerrainTypeId: TERRAIN_TYPES[1]?.id ?? TERRAIN_TYPES[0]?.id ?? "void",
  selectedTerrainTileId: getOutsideTerrainDefaultTileId(
    TERRAIN_TYPES[1]?.id ?? TERRAIN_TYPES[0]?.id ?? "void"
  ),
  map: createDefaultMapForArea(DEFAULT_MAP_AREA_ID),
  selectedAreaId: DEFAULT_MAP_AREA_ID,
  areaMapCache: new Map(),
  objectManifest: [],
  selectedObject: null,
  activeTab: "terrain",
  isPointerDown: false,
  isHeightPointerDown: false,
  pointerTerrainTypeId: null,
  pointerTerrainTileId: null,
  terrainMenu: null,
  terrainMode: null,
  terrainRotation: 0,
  terrainBrushSize: 1,
  heightMode: null,
  heightBrushSize: 1,
  heightValue: 0,
  doorMode: null,
  showHeights: false,
  showTextures: true,
  showTileNumbers: true,
  selectionStart: null,
  selectionEnd: null,
  selectionFixed: false,
  isSelectionPointerDown: false,
};

const HISTORY_LIMIT = 50;
const historyState = {
  undoStack: [],
  redoStack: [],
  pendingSnapshot: null,
  isDirty: false,
};

const UNKNOWN_HP_LABEL = "Unknown";
const HEIGHT_MIN = 0;
const HEIGHT_MAX = 255;
const DEFAULT_GENERATE_HEIGHT_MIN = 0;
const DEFAULT_GENERATE_HEIGHT_MAX = 64;
const DEFAULT_GENERATE_HILLS = 8;
const OBJECT_MANIFEST_URL = "models/manifest.json";
const DOOR_MARKER_PATH = "door-marker";
const LOCAL_AUTO_SAVE_DELAY_MS = 350;

const DOOR_DESTINATION_AREAS = MAP_AREAS.map(({ id, label }) => ({ id, label }));
const DOOR_POSITION_EPSILON = 0.01;
const TERRAIN_TILE_BY_ID = new Map(
  OUTSIDE_TERRAIN_TILES.map((tile, index) => [tile.id, { tile, index }])
);

function formatTerrainHp(terrain) {
  if (!terrain || typeof terrain.hp !== "number" || terrain.hp < 0) {
    return UNKNOWN_HP_LABEL;
  }

  return `${terrain.hp}s`;
}

function formatTerrainElement(terrain) {
  const element = terrain?.element;
  if (!element) {
    return null;
  }

  const { symbol, name } = element;
  if (symbol && name) {
    return `${symbol} (${name})`;
  }
  if (symbol) {
    return symbol;
  }
  if (name) {
    return name;
  }
  return null;
}

function getTerrainTextureCssValue(tileId, variantSeed = 0) {
  const texturePath = getOutsideTerrainTilePath(tileId, variantSeed);
  if (!texturePath) {
    return "none";
  }
  return `url("${texturePath}")`;
}

function formatTerrainTileLabel(tileId) {
  const tileMeta = TERRAIN_TILE_BY_ID.get(tileId);
  if (!tileMeta) {
    return "Tile —";
  }
  return `Tile ${tileMeta.index + 1}`;
}

function getTerrainTileNumber(tileId) {
  const tileMeta = TERRAIN_TILE_BY_ID.get(tileId);
  if (!tileMeta) {
    return "—";
  }
  return String(tileMeta.index + 1);
}

function clampHeightValue(value) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return HEIGHT_MIN;
  }
  return Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, numeric));
}

function clampHillsCount(value, maxCells) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const clamped = Math.max(0, Math.floor(numeric));
  if (Number.isFinite(maxCells)) {
    return Math.min(clamped, Math.max(0, maxCells));
  }
  return clamped;
}

function getRandomIntInclusive(minValue, maxValue) {
  const min = Math.min(minValue, maxValue);
  const max = Math.max(minValue, maxValue);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function resolveGenerationSettings() {
  const minInput = elements.generateHeightMinInput?.value ?? DEFAULT_GENERATE_HEIGHT_MIN;
  const maxInput = elements.generateHeightMaxInput?.value ?? DEFAULT_GENERATE_HEIGHT_MAX;
  const minHeight = clampHeightValue(minInput);
  const maxHeight = clampHeightValue(maxInput);
  const normalizedMin = Math.min(minHeight, maxHeight);
  const normalizedMax = Math.max(minHeight, maxHeight);
  const totalCells = state.map.width * state.map.height;
  const hillsCount = clampHillsCount(
    elements.generateHillsCountInput?.value ?? DEFAULT_GENERATE_HILLS,
    totalCells
  );

  if (elements.generateHeightMinInput) {
    elements.generateHeightMinInput.value = String(normalizedMin);
  }
  if (elements.generateHeightMaxInput) {
    elements.generateHeightMaxInput.value = String(normalizedMax);
  }
  if (elements.generateHillsCountInput) {
    elements.generateHillsCountInput.value = String(hillsCount);
  }

  return {
    minHeight: normalizedMin,
    maxHeight: normalizedMax,
    hillsCount,
  };
}

function resolveTerrainTileId(tileId, terrainId) {
  if (tileId && TERRAIN_TILE_BY_ID.has(tileId)) {
    return tileId;
  }
  return getOutsideTerrainDefaultTileId(terrainId);
}

function getSelectedTerrain() {
  return getTerrainById(state.selectedTerrainTypeId);
}

function getSelectedTerrainTileId() {
  return resolveTerrainTileId(
    state.selectedTerrainTileId,
    state.selectedTerrainTypeId
  );
}

function getActiveTerrainSelection({ erase = false } = {}) {
  const terrainId = erase
    ? TERRAIN_TYPES[0]?.id ?? "void"
    : state.selectedTerrainTypeId;
  const terrain = getTerrainById(terrainId);
  const tileId = erase
    ? getOutsideTerrainDefaultTileId(terrain.id)
    : getSelectedTerrainTileId();
  return {
    terrain,
    terrainId: terrain.id,
    tileId: resolveTerrainTileId(tileId, terrain.id),
  };
}

const VOID_TERRAIN_ID = TERRAIN_TYPES[0]?.id ?? "void";
const RANDOM_TERRAIN_POOL = TERRAIN_TYPES.filter(
  (terrain) => terrain.id !== VOID_TERRAIN_ID
);

const getCellTerrainId = (cell) => {
  const terrainId = cell?.terrainId;
  return getTerrainById(terrainId).id;
};

const getCellTileId = (cell) =>
  cell?.tileId ?? getOutsideTerrainDefaultTileId(getCellTerrainId(cell));

const createCell = (terrainId) => {
  const terrain = getTerrainById(terrainId);
  return {
    terrainId: terrain.id,
    tileId: getOutsideTerrainDefaultTileId(terrain.id),
  };
};

const getCellHeightValue = (index) =>
  Number.isFinite(state.map.heights?.[index])
    ? state.map.heights[index]
    : HEIGHT_MIN;

const DEFAULT_OBJECT_TRANSFORM = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

const elements = {
  palette: document.getElementById("terrainPalette"),
  objectsPalette: document.getElementById("objectsPalette"),
  objectsPaletteStatus: document.getElementById("objectsPaletteStatus"),
  clearSelectedObjectButton: document.getElementById("clearSelectedObjectButton"),
  mapGrid: document.getElementById("mapGrid"),
  jsonPreview: document.getElementById("jsonPreview"),
  mapNameInput: document.getElementById("mapNameInput"),
  regionInput: document.getElementById("regionInput"),
  notesInput: document.getElementById("mapNotesInput"),
  areaList: document.getElementById("areaList"),
  selectedAreaName: document.getElementById("selectedAreaName"),
  selectedAreaId: document.getElementById("selectedAreaId"),
  selectedAreaDescription: document.getElementById("selectedAreaDescription"),
  widthInput: document.getElementById("widthInput"),
  heightInput: document.getElementById("heightInput"),
  resizeButton: document.getElementById("resizeButton"),
  gridToggle: document.getElementById("gridToggle"),
  colorToggle: document.getElementById("colorToggle"),
  textureToggle: document.getElementById("textureToggle"),
  cellSizeRange: document.getElementById("cellSizeRange"),
  mapNameDisplay: document.getElementById("mapNameDisplay"),
  mapRegionDisplay: document.getElementById("mapRegionDisplay"),
  mapSizeDisplay: document.getElementById("mapSizeDisplay"),
  importTextarea: document.getElementById("importTextarea"),
  importButton: document.getElementById("importButton"),
  generateHeightMinInput: document.getElementById("generateHeightMin"),
  generateHeightMaxInput: document.getElementById("generateHeightMax"),
  generateHillsCountInput: document.getElementById("generateHillsCount"),
  generateButton: document.getElementById("generateButton"),
  resetButton: document.getElementById("resetButton"),
  copyButton: document.getElementById("copyButton"),
  downloadButton: document.getElementById("downloadButton"),
  saveLocalButton: document.getElementById("saveLocalButton"),
  restoreLocalButton: document.getElementById("restoreLocalButton"),
  fileInput: document.getElementById("fileInput"),
  loadFileButton: document.getElementById("loadFileButton"),
  tabButtons: Array.from(document.querySelectorAll("[data-map-maker-tab]")),
  tabPanels: Array.from(document.querySelectorAll("[data-map-maker-panel]")),
  mainPanels: Array.from(document.querySelectorAll("[data-map-maker-main]")),
  landscapeViewport: document.getElementById("landscapeViewport"),
  landscapeError: document.getElementById("landscapeError"),
  landscapeResetButton: document.getElementById("landscapeResetButton"),
  landscapeTypeToggle: document.getElementById("landscapeTypeToggle"),
  landscapeTextureToggle: document.getElementById("landscapeTextureToggle"),
  landscapeTileNumberToggle: document.getElementById(
    "landscapeTileNumberToggle"
  ),
  terrainRotationDisplay: document.getElementById("terrainRotationDisplay"),
  terrainTypeSelect: document.getElementById("terrainTypeSelect"),
  terrainTileSelect: document.getElementById("terrainTileSelect"),
  terrainBrushRow: document.getElementById("terrainBrushRow"),
  terrainBrushSize: document.getElementById("terrainBrushSize"),
  terrainBrushSizeValue: document.getElementById("terrainBrushSizeValue"),
  terrainDrawRow: document.getElementById("terrainDrawRow"),
  terrainApplyButton: document.getElementById("terrainApplyButton"),
  terrainCancelButton: document.getElementById("terrainCancelButton"),
  terrainModeButtons: Array.from(document.querySelectorAll("[data-terrain-mode]")),
  terrainRotationButtons: Array.from(
    document.querySelectorAll("[data-rotation]")
  ),
  heightModeButtons: Array.from(document.querySelectorAll("[data-height-mode]")),
  heightBrushRow: document.getElementById("heightBrushRow"),
  heightBrushSize: document.getElementById("heightBrushSize"),
  heightBrushSizeValue: document.getElementById("heightBrushSizeValue"),
  heightValueInput: document.getElementById("heightValueInput"),
  heightValueSlider: document.getElementById("heightValueSlider"),
  heightPresetButtons: Array.from(document.querySelectorAll("[data-height-preset]")),
  heightDrawRow: document.getElementById("heightDrawRow"),
  heightApplyButton: document.getElementById("heightApplyButton"),
  heightCancelButton: document.getElementById("heightCancelButton"),
  showHeightButton: document.getElementById("showHeightButton"),
  doorModeButtons: Array.from(document.querySelectorAll("[data-door-mode]")),
  doorList: document.getElementById("doorList"),
  doorListEmpty: document.getElementById("doorListEmpty"),
  doorListCount: document.getElementById("doorListCount"),
  objectList: document.getElementById("objectList"),
  objectListEmpty: document.getElementById("objectListEmpty"),
  objectListCount: document.getElementById("objectListCount"),
  undoButton: document.getElementById("undoBtn"),
  redoButton: document.getElementById("redoBtn"),
};

let landscapeViewer = null;

function cloneMapDefinition(map) {
  if (typeof structuredClone === "function") {
    return structuredClone(map);
  }
  return JSON.parse(JSON.stringify(map));
}

function updateUndoRedoButtons() {
  if (elements.undoButton) {
    elements.undoButton.disabled = historyState.undoStack.length === 0;
  }
  if (elements.redoButton) {
    elements.redoButton.disabled = historyState.redoStack.length === 0;
  }
}

function pushUndoSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }
  historyState.undoStack.push(snapshot);
  if (historyState.undoStack.length > HISTORY_LIMIT) {
    historyState.undoStack.shift();
  }
  historyState.redoStack.length = 0;
  updateUndoRedoButtons();
}

function beginHistoryEntry() {
  if (historyState.pendingSnapshot) {
    return;
  }
  historyState.pendingSnapshot = cloneMapDefinition(state.map);
  historyState.isDirty = false;
}

function markHistoryDirty() {
  if (!historyState.pendingSnapshot) {
    return;
  }
  historyState.isDirty = true;
}

function commitHistoryEntry() {
  if (!historyState.pendingSnapshot) {
    return;
  }
  if (historyState.isDirty) {
    pushUndoSnapshot(historyState.pendingSnapshot);
  }
  historyState.pendingSnapshot = null;
  historyState.isDirty = false;
}

function applyMapSnapshot(snapshot) {
  const normalized = normalizeMapDefinition(snapshot);
  state.map = normalized;
  clearSelection();
  updateMetadataDisplays();
  renderGrid();
  updateJsonPreview();
  landscapeViewer?.setObjectPlacements?.(state.map.objects);
}

function undoLastChange() {
  if (historyState.pendingSnapshot) {
    commitHistoryEntry();
  }
  const snapshot = historyState.undoStack.pop();
  if (!snapshot) {
    updateUndoRedoButtons();
    return;
  }
  historyState.redoStack.push(cloneMapDefinition(state.map));
  applyMapSnapshot(snapshot);
  updateUndoRedoButtons();
}

function redoLastChange() {
  if (historyState.pendingSnapshot) {
    commitHistoryEntry();
  }
  const snapshot = historyState.redoStack.pop();
  if (!snapshot) {
    updateUndoRedoButtons();
    return;
  }
  historyState.undoStack.push(cloneMapDefinition(state.map));
  applyMapSnapshot(snapshot);
  updateUndoRedoButtons();
}

function normalizeObjectVector(source, fallback) {
  const fallbackValue = fallback ?? { x: 0, y: 0, z: 0 };
  if (!source || typeof source !== "object") {
    return { ...fallbackValue };
  }
  return {
    x: Number.isFinite(source.x) ? source.x : fallbackValue.x,
    y: Number.isFinite(source.y) ? source.y : fallbackValue.y,
    z: Number.isFinite(source.z) ? source.z : fallbackValue.z,
  };
}

function resolvePlacementDestination(placement) {
  if (!placement || typeof placement !== "object") {
    return null;
  }
  let destinationType =
    typeof placement.destinationType === "string"
      ? placement.destinationType
      : null;
  let destinationId =
    typeof placement.destinationId === "string"
      ? placement.destinationId
      : null;

  if (!destinationType || !destinationId) {
    const legacyDestination = placement.destination;
    if (legacyDestination && typeof legacyDestination === "object") {
      destinationType =
        destinationType ??
        (typeof legacyDestination.type === "string"
          ? legacyDestination.type
          : null);
      destinationId =
        destinationId ??
        (typeof legacyDestination.id === "string"
          ? legacyDestination.id
          : null);
    } else if (typeof legacyDestination === "string") {
      const trimmed = legacyDestination.trim();
      if (trimmed) {
        const [type, ...rest] = trimmed.split(":");
        const idValue = rest.join(":");
        destinationType = destinationType ?? (type || null);
        destinationId = destinationId ?? (idValue || null);
      }
    }
  }

  if (!destinationType || !destinationId) {
    return null;
  }
  return { destinationType, destinationId };
}

function getDoorIdFromPlacement(placement, width, height) {
  if (!placement || placement.path !== DOOR_MARKER_PATH) {
    return null;
  }
  const position = placement.position ?? null;
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    return null;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  const xIndex = Math.round(position.x + width / 2 - 0.5);
  const yIndex = Math.round(position.z + height / 2 - 0.5);
  if (xIndex < 0 || yIndex < 0 || xIndex >= width || yIndex >= height) {
    return null;
  }
  const worldX = xIndex - width / 2 + 0.5;
  const worldZ = yIndex - height / 2 + 0.5;
  const matchesX = Math.abs(position.x - worldX) <= DOOR_POSITION_EPSILON;
  const matchesZ =
    Math.abs(position.z - worldZ) <= DOOR_POSITION_EPSILON ||
    Math.abs(position.z - (worldZ - 0.5)) <= DOOR_POSITION_EPSILON;
  if (!matchesX || !matchesZ) {
    return null;
  }
  return `door-${xIndex + 1}-${yIndex + 1}`;
}

function normalizeObjectPlacements(placements, { width, height } = {}) {
  if (!Array.isArray(placements)) {
    return [];
  }
  return placements
    .map((placement) => {
      if (!placement || typeof placement !== "object") {
        return null;
      }
      const path = typeof placement.path === "string" ? placement.path : "";
      if (!path) {
        return null;
      }
      const name =
        typeof placement.name === "string" ? placement.name : undefined;
      let id = typeof placement.id === "string" ? placement.id : undefined;
      if (!id && path === DOOR_MARKER_PATH) {
        const resolvedId = getDoorIdFromPlacement(placement, width, height);
        if (resolvedId) {
          id = resolvedId;
        }
      }
      const destination = resolvePlacementDestination(placement);
      return {
        path,
        position: normalizeObjectVector(
          placement.position,
          DEFAULT_OBJECT_TRANSFORM.position
        ),
        rotation: normalizeObjectVector(
          placement.rotation,
          DEFAULT_OBJECT_TRANSFORM.rotation
        ),
        scale: normalizeObjectVector(
          placement.scale,
          DEFAULT_OBJECT_TRANSFORM.scale
        ),
        ...(name ? { name } : {}),
        ...(id ? { id } : {}),
        ...(destination?.destinationType
          ? { destinationType: destination.destinationType }
          : {}),
        ...(destination?.destinationId
          ? { destinationId: destination.destinationId }
          : {}),
      };
    })
    .filter(Boolean);
}

function normalizeMapDefinition(definition) {
  const normalized = normalizeOutsideMap(definition);
  normalized.objects = normalizeObjectPlacements(definition?.objects, {
    width: normalized.width,
    height: normalized.height,
  });
  return normalized;
}

async function resolveExternalHeights(mapDefinition) {
  if (!mapDefinition || typeof mapDefinition !== "object") {
    return mapDefinition;
  }

  if (Array.isArray(mapDefinition.heights)) {
    return mapDefinition;
  }

  const heightsFile =
    typeof mapDefinition.heightsFile === "string"
      ? mapDefinition.heightsFile.trim()
      : "";
  if (!heightsFile) {
    return mapDefinition;
  }

  try {
    const response = await fetch(heightsFile, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Heights request failed: ${response.status}`);
    }
    const data = await response.json();
    const heights = Array.isArray(data) ? data : data?.heights;
    if (!Array.isArray(heights)) {
      throw new Error("Heights data is not an array");
    }
    return { ...mapDefinition, heights };
  } catch (error) {
    console.warn("Unable to load external heights file", error);
    return mapDefinition;
  }
}

function updateLandscapeViewer() {
  if (!landscapeViewer) {
    return;
  }
  const normalized = normalizeMapDefinition(state.map);
  state.map = normalized;
  landscapeViewer.updateMap(normalized);
}

function getTextureVisibility() {
  if (elements.mapGrid) {
    return elements.mapGrid.dataset.showTextures !== "false";
  }
  return state.showTextures;
}

function setTextureVisibility(isEnabled) {
  state.showTextures = isEnabled;
  if (elements.mapGrid) {
    elements.mapGrid.dataset.showTextures = String(isEnabled);
  }
  syncTextureToggleLabel(isEnabled);
}

function syncTextureToggleLabel(isEnabled) {
  if (elements.landscapeTextureToggle) {
    elements.landscapeTextureToggle.setAttribute(
      "aria-pressed",
      String(isEnabled)
    );
    elements.landscapeTextureToggle.textContent = `Terrain textures: ${
      isEnabled ? "On" : "Off"
    }`;
  }
  if (elements.textureToggle) {
    elements.textureToggle.checked = isEnabled;
  }
  if (landscapeViewer?.setTextureVisibility) {
    landscapeViewer.setTextureVisibility(isEnabled);
  }
}

function getTileNumberVisibility() {
  if (elements.mapGrid) {
    return elements.mapGrid.dataset.showTileNumbers !== "false";
  }
  return state.showTileNumbers;
}

function syncTileNumberToggleLabel(isEnabled) {
  if (!elements.landscapeTileNumberToggle) {
    return;
  }
  elements.landscapeTileNumberToggle.setAttribute(
    "aria-pressed",
    String(isEnabled)
  );
  elements.landscapeTileNumberToggle.textContent = `Tile numbers: ${
    isEnabled ? "On" : "Off"
  }`;
}

function setTileNumberVisibility(isEnabled) {
  state.showTileNumbers = isEnabled;
  if (elements.mapGrid) {
    elements.mapGrid.dataset.showTileNumbers = String(isEnabled);
  }
  syncTileNumberToggleLabel(isEnabled);
  if (landscapeViewer?.setTileNumberVisibility) {
    landscapeViewer.setTileNumberVisibility(isEnabled);
  }
}

function updateTerrainMenu() {
  const terrain = getSelectedTerrain();
  const tileId = getSelectedTerrainTileId();
  state.selectedTerrainTypeId = terrain.id;
  state.selectedTerrainTileId = tileId;
  if (elements.terrainTypeSelect && terrain?.id) {
    elements.terrainTypeSelect.value = terrain.id;
    if (terrain?.color) {
      elements.terrainTypeSelect.style.color = terrain.color;
      elements.terrainTypeSelect.style.setProperty(
        "--terrain-color",
        terrain.color
      );
    } else {
      elements.terrainTypeSelect.style.color = "";
      elements.terrainTypeSelect.style.removeProperty("--terrain-color");
    }
  }
  if (elements.terrainTileSelect && tileId) {
    elements.terrainTileSelect.value = tileId;
  }
}

function getCellWorldPosition(index) {
  if (!Number.isFinite(index)) {
    return null;
  }
  const width = state.map.width;
  const height = state.map.height;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  const x = index % width;
  const y = Math.floor(index / width);
  return {
    x: x - width / 2 + 0.5,
    z: y - height / 2 + 0.5,
  };
}

function getCellIndexFromWorldPosition(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    return null;
  }
  const width = state.map.width;
  const height = state.map.height;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  const x = Math.round(position.x + width / 2 - 0.5);
  const y = Math.round(position.z + height / 2 - 0.5);
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return null;
  }
  const worldX = x - width / 2 + 0.5;
  const worldZ = y - height / 2 + 0.5;
  if (
    Math.abs(position.x - worldX) > DOOR_POSITION_EPSILON ||
    (Math.abs(position.z - worldZ) > DOOR_POSITION_EPSILON &&
      Math.abs(position.z - (worldZ - 0.5)) > DOOR_POSITION_EPSILON)
  ) {
    return null;
  }
  return y * width + x;
}

function getDoorPlacements() {
  const objects = Array.isArray(state.map.objects) ? state.map.objects : [];
  return objects
    .map((placement, index) => ({ placement, index }))
    .filter(({ placement }) => placement?.path === DOOR_MARKER_PATH);
}

function getPlacedObjects() {
  const objects = Array.isArray(state.map.objects) ? state.map.objects : [];
  return objects
    .map((placement, index) => ({ placement, index }))
    .filter(({ placement }) => placement?.path && placement?.path !== DOOR_MARKER_PATH);
}

function getObjectDisplayName(placement, order) {
  if (typeof placement?.name === "string" && placement.name.trim().length > 0) {
    return placement.name.trim();
  }
  const path = typeof placement?.path === "string" ? placement.path : "";
  if (path) {
    const parts = path.split("/");
    const raw = parts[parts.length - 1] ?? "";
    const cleaned = raw.replace(/\.[^.]+$/, "");
    if (cleaned) {
      return cleaned;
    }
  }
  return `Object ${order + 1}`;
}

function getObjectDisplayId(placement, order) {
  if (typeof placement?.id === "string" && placement.id.trim().length > 0) {
    return placement.id.trim();
  }
  return `object-${order + 1}`;
}

const OBJECT_ROTATION_STEP = Math.PI / 2;

function normalizeRotationAngle(angle) {
  const fullTurn = Math.PI * 2;
  const normalized = ((angle % fullTurn) + fullTurn) % fullTurn;
  return normalized > Math.PI ? normalized - fullTurn : normalized;
}

function getObjectRotationDegrees(placement) {
  const rotationY = Number(placement?.rotation?.y);
  if (!Number.isFinite(rotationY)) {
    return 0;
  }
  return Math.round((normalizeRotationAngle(rotationY) * 180) / Math.PI);
}

function rotateObjectPlacementAtIndex(index, stepDirection) {
  const existing = Array.isArray(state.map.objects) ? state.map.objects : [];
  if (!Number.isFinite(index) || index < 0 || index >= existing.length) {
    return;
  }
  const placement = existing[index];
  if (!placement || placement.path === DOOR_MARKER_PATH) {
    return;
  }
  const direction = Number(stepDirection);
  if (!Number.isFinite(direction) || direction === 0) {
    return;
  }
  const snapshot = cloneMapDefinition(state.map);
  const currentRotationY = Number(placement.rotation?.y);
  const currentStep = Number.isFinite(currentRotationY)
    ? Math.round(currentRotationY / OBJECT_ROTATION_STEP)
    : 0;
  const nextStep = currentStep + (direction > 0 ? 1 : -1);
  const normalizedY = normalizeRotationAngle(nextStep * OBJECT_ROTATION_STEP);
  placement.rotation = {
    ...normalizeObjectVector(placement.rotation, DEFAULT_OBJECT_TRANSFORM.rotation),
    y: normalizedY,
  };
  updateJsonPreview();
  landscapeViewer?.setObjectPlacements?.(state.map.objects);
  pushUndoSnapshot(snapshot);
}

function removeObjectPlacementAtIndex(index) {
  const existing = Array.isArray(state.map.objects) ? state.map.objects : [];
  if (!Number.isFinite(index) || index < 0 || index >= existing.length) {
    return;
  }
  const snapshot = cloneMapDefinition(state.map);
  state.map.objects = existing.filter((_, entryIndex) => entryIndex !== index);
  updateJsonPreview();
  landscapeViewer?.setObjectPlacements?.(state.map.objects);
  pushUndoSnapshot(snapshot);
}

function removeDoorPlacementAtIndex(index) {
  const existing = Array.isArray(state.map.objects) ? state.map.objects : [];
  if (!Number.isFinite(index) || index < 0 || index >= existing.length) {
    return;
  }
  if (existing[index]?.path !== DOOR_MARKER_PATH) {
    return;
  }
  const snapshot = cloneMapDefinition(state.map);
  state.map.objects = existing.filter((_, entryIndex) => entryIndex !== index);
  updateJsonPreview();
  landscapeViewer?.setObjectPlacements?.(state.map.objects);
  pushUndoSnapshot(snapshot);
}

function focusPlacedObject(placement) {
  if (!placement) {
    return;
  }
  landscapeViewer?.focusObject?.(placement);
}

function formatDoorListEntry(placement, order) {
  const index = getCellIndexFromWorldPosition(placement?.position ?? null);
  const width = state.map.width;
  const nameFromPlacement =
    typeof placement?.name === "string" && placement.name.trim().length > 0
      ? placement.name.trim()
      : null;
  const idFromPlacement =
    typeof placement?.id === "string" && placement.id.trim().length > 0
      ? placement.id.trim()
      : null;
  const destinationType =
    typeof placement?.destinationType === "string"
      ? placement.destinationType
      : null;
  const destinationId =
    typeof placement?.destinationId === "string"
      ? placement.destinationId
      : null;
  if (Number.isFinite(index) && Number.isFinite(width)) {
    const x = index % width;
    const y = Math.floor(index / width);
    return {
      name: nameFromPlacement ?? `Door ${x + 1}, ${y + 1}`,
      id: idFromPlacement ?? `door-${x + 1}-${y + 1}`,
      sortIndex: index,
      destinationType,
      destinationId,
    };
  }
  const fallbackIndex = order + 1;
  return {
    name: nameFromPlacement ?? `Door ${fallbackIndex}`,
    id: idFromPlacement ?? `door-${fallbackIndex}`,
    sortIndex: Number.POSITIVE_INFINITY,
    destinationType,
    destinationId,
  };
}

function updateDoorList() {
  if (!elements.doorList || !elements.doorListEmpty || !elements.doorListCount) {
    return;
  }
  const placements = getDoorPlacements();
  const entries = placements
    .map(({ placement, index }, order) => ({
      ...formatDoorListEntry(placement, order),
      order,
      placement,
      index,
    }))
    .sort((a, b) => {
      if (a.sortIndex !== b.sortIndex) {
        return a.sortIndex - b.sortIndex;
      }
      return a.order - b.order;
    });
  elements.doorList.innerHTML = "";
  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "door-list-item";
    const header = document.createElement("div");
    header.className = "door-list-item-head";
    const focusButton = document.createElement("button");
    focusButton.type = "button";
    focusButton.className = "object-list-focus door-list-focus";
    const title = document.createElement("div");
    title.className = "door-list-item-title";
    const name = document.createElement("div");
    name.className = "door-list-name";
    name.textContent = entry.name;
    const id = document.createElement("div");
    id.className = "door-list-id";
    id.textContent = `ID: ${entry.id}`;
    title.append(name, id);
    focusButton.append(title);
    focusButton.addEventListener("click", () => {
      focusPlacedObject(entry.placement);
    });
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "object-list-remove door-list-remove";
    removeButton.setAttribute("aria-label", `Remove ${entry.name}`);
    removeButton.textContent = "x";
    removeButton.addEventListener("click", () => {
      removeDoorPlacementAtIndex(entry.index);
    });
    header.append(focusButton, removeButton);
    const destination = document.createElement("div");
    destination.className = "door-list-destination";
    const destinationLabel = document.createElement("label");
    destinationLabel.className = "door-destination-label";
    const safeId = entry.id.replace(/[^a-z0-9-_]/gi, "");
    const selectId = `door-destination-${safeId || entry.order}`;
    destinationLabel.setAttribute("for", selectId);
    destinationLabel.textContent = "Destination";
    const select = document.createElement("select");
    select.className = "door-destination-select";
    select.id = selectId;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select area or door";
    select.appendChild(placeholder);

    const areaGroup = document.createElement("optgroup");
    areaGroup.label = "Areas";
    DOOR_DESTINATION_AREAS.forEach((area) => {
      const option = document.createElement("option");
      option.value = `area:${area.id}`;
      option.textContent = area.label;
      areaGroup.appendChild(option);
    });
    select.appendChild(areaGroup);

    if (entries.length > 1) {
      const doorGroup = document.createElement("optgroup");
      doorGroup.label = "Doors on this map";
      entries.forEach((doorEntry) => {
        if (doorEntry.id === entry.id) {
          return;
        }
        const option = document.createElement("option");
        option.value = `door:${doorEntry.id}`;
        option.textContent = `${doorEntry.name} (${doorEntry.id})`;
        doorGroup.appendChild(option);
      });
      if (doorGroup.children.length > 0) {
        select.appendChild(doorGroup);
      }
    }

    if (entry.destinationType && entry.destinationId) {
      select.value = `${entry.destinationType}:${entry.destinationId}`;
    }

    select.addEventListener("change", (event) => {
      const value = event.target.value;
      const snapshot = cloneMapDefinition(state.map);
      if (!value) {
        delete entry.placement.destinationType;
        delete entry.placement.destinationId;
        delete entry.placement.destination;
      } else {
        const [type, ...rest] = value.split(":");
        const idValue = rest.join(":");
        entry.placement.destinationType = type;
        entry.placement.destinationId = idValue;
        entry.placement.destination = value;
      }
      updateJsonPreview();
      pushUndoSnapshot(snapshot);
    });

    destination.append(destinationLabel, select);
    item.append(header, destination);
    elements.doorList.appendChild(item);
  });
  const hasDoors = entries.length > 0;
  elements.doorListEmpty.hidden = hasDoors;
  elements.doorListEmpty.setAttribute("aria-hidden", String(hasDoors));
  elements.doorListCount.textContent = String(entries.length);
}

function updateObjectList() {
  if (!elements.objectList || !elements.objectListEmpty || !elements.objectListCount) {
    return;
  }
  const objects = getPlacedObjects();
  elements.objectList.innerHTML = "";
  objects.forEach(({ placement, index }, order) => {
    const item = document.createElement("li");
    item.className = "object-list-item";

    const focusButton = document.createElement("button");
    focusButton.type = "button";
    focusButton.className = "object-list-focus";

    const name = document.createElement("span");
    name.className = "object-list-name";
    name.textContent = getObjectDisplayName(placement, order);

    const id = document.createElement("span");
    id.className = "object-list-id";
    id.textContent = `ID: ${getObjectDisplayId(placement, order)}`;

    const rotation = document.createElement("span");
    rotation.className = "object-list-id object-list-rotation";
    rotation.textContent = `Rot Y: ${getObjectRotationDegrees(placement)} deg`;

    focusButton.append(name, id, rotation);
    focusButton.addEventListener("click", () => {
      focusPlacedObject(placement);
    });

    const actions = document.createElement("div");
    actions.className = "object-list-actions";

    const rotateLeftButton = document.createElement("button");
    rotateLeftButton.type = "button";
    rotateLeftButton.className = "object-list-rotate";
    rotateLeftButton.setAttribute(
      "aria-label",
      `Rotate ${getObjectDisplayName(placement, order)} left`
    );
    rotateLeftButton.title = "Rotate left";
    rotateLeftButton.textContent = "L";
    rotateLeftButton.addEventListener("click", () => {
      rotateObjectPlacementAtIndex(index, 1);
    });

    const rotateRightButton = document.createElement("button");
    rotateRightButton.type = "button";
    rotateRightButton.className = "object-list-rotate";
    rotateRightButton.setAttribute(
      "aria-label",
      `Rotate ${getObjectDisplayName(placement, order)} right`
    );
    rotateRightButton.title = "Rotate right";
    rotateRightButton.textContent = "R";
    rotateRightButton.addEventListener("click", () => {
      rotateObjectPlacementAtIndex(index, -1);
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "object-list-remove";
    removeButton.setAttribute(
      "aria-label",
      `Remove ${getObjectDisplayName(placement, order)}`
    );
    removeButton.textContent = "x";
    removeButton.addEventListener("click", () => {
      removeObjectPlacementAtIndex(index);
    });

    actions.append(rotateLeftButton, rotateRightButton, removeButton);
    item.append(focusButton, actions);
    elements.objectList.appendChild(item);
  });
  const hasObjects = objects.length > 0;
  elements.objectListEmpty.hidden = hasObjects;
  elements.objectListEmpty.setAttribute("aria-hidden", String(hasObjects));
  elements.objectListCount.textContent = String(objects.length);
}
function removeDoorMarkersAtPosition(placements, position) {
  if (!position) {
    return placements;
  }
  const targetIndex = getCellIndexFromWorldPosition(position);
  return placements.filter((placement) => {
    if (placement?.path !== DOOR_MARKER_PATH) {
      return true;
    }
    if (!Number.isFinite(targetIndex)) {
      return true;
    }
    const placementIndex = getCellIndexFromWorldPosition(
      placement?.position ?? null
    );
    if (!Number.isFinite(placementIndex)) {
      return true;
    }
    return placementIndex !== targetIndex;
  });
}

function removeDoorMarkersAtIndex(index) {
  const position = getCellWorldPosition(index);
  if (!position) {
    return;
  }
  const existing = Array.isArray(state.map.objects)
    ? state.map.objects
    : [];
  const nextObjects = removeDoorMarkersAtPosition(existing, position);
  if (nextObjects.length === existing.length) {
    return;
  }
  const snapshot = cloneMapDefinition(state.map);
  state.map.objects = nextObjects;
  updateJsonPreview();
  landscapeViewer?.setObjectPlacements?.(state.map.objects);
  pushUndoSnapshot(snapshot);
}

function syncTerrainMenuButtons() {
  const activeMenu = state.terrainMenu;
  elements.terrainModeButtons.forEach((button) => {
    const isActive = button.dataset.terrainMode === activeMenu;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function syncTerrainBrushVisibility() {
  if (!elements.terrainBrushRow) {
    return;
  }
  const isVisible = state.terrainMode === "brush";
  elements.terrainBrushRow.hidden = !isVisible;
  elements.terrainBrushRow.setAttribute("aria-hidden", String(!isVisible));
}

function syncTerrainDrawVisibility() {
  if (!elements.terrainDrawRow) {
    return;
  }
  const isVisible = state.terrainMode === "draw";
  elements.terrainDrawRow.hidden = !isVisible;
  elements.terrainDrawRow.setAttribute("aria-hidden", String(!isVisible));
}

function setTerrainMenu(menu) {
  if (menu && !["brush", "draw"].includes(menu)) {
    return;
  }
  const nextMenu = state.terrainMenu === menu ? null : menu;
  state.terrainMenu = nextMenu;
  if (nextMenu === "brush" || nextMenu === "draw") {
    state.terrainMode = nextMenu;
  } else {
    state.terrainMode = null;
  }
  syncTerrainMenuButtons();
  syncTerrainBrushVisibility();
  syncTerrainDrawVisibility();
  if (state.terrainMode !== "draw") {
    clearSelection();
  }
}

function syncTerrainRotationDisplay() {
  if (elements.terrainRotationDisplay) {
    elements.terrainRotationDisplay.textContent = `${state.terrainRotation}°`;
  }
}

function rotateTerrain(direction) {
  state.terrainRotation = (state.terrainRotation + direction + 360) % 360;
  syncTerrainRotationDisplay();
}

function syncTerrainBrushSizeDisplay() {
  const brushSize = Math.max(1, Math.floor(state.terrainBrushSize));
  if (elements.terrainBrushSize) {
    elements.terrainBrushSize.value = String(brushSize);
  }
  if (elements.terrainBrushSizeValue) {
    elements.terrainBrushSizeValue.textContent = String(brushSize);
  }
}

function setTerrainBrushSize(value) {
  const nextSize = Number.parseInt(value, 10);
  if (!Number.isFinite(nextSize)) {
    return;
  }
  state.terrainBrushSize = Math.max(1, nextSize);
  syncTerrainBrushSizeDisplay();
}

function syncHeightModeButtons() {
  elements.heightModeButtons.forEach((button) => {
    const isActive = button.dataset.heightMode === state.heightMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function syncHeightBrushVisibility() {
  if (!elements.heightBrushRow) {
    return;
  }
  const isVisible = state.heightMode === "brush";
  elements.heightBrushRow.hidden = !isVisible;
  elements.heightBrushRow.setAttribute("aria-hidden", String(!isVisible));
}

function syncHeightDrawVisibility() {
  if (!elements.heightDrawRow) {
    return;
  }
  const isVisible = state.heightMode === "draw";
  elements.heightDrawRow.hidden = !isVisible;
  elements.heightDrawRow.setAttribute("aria-hidden", String(!isVisible));
}

function setHeightMode(mode) {
  if (mode && !["brush", "draw"].includes(mode)) {
    return;
  }
  const nextMode = state.heightMode === mode ? null : mode;
  state.heightMode = nextMode;
  syncHeightModeButtons();
  syncHeightBrushVisibility();
  syncHeightDrawVisibility();
  if (state.heightMode !== "draw") {
    clearSelection();
  }
  updateDrawButtonsState();
}

function syncDoorModeButtons() {
  elements.doorModeButtons.forEach((button) => {
    const isActive = button.dataset.doorMode === state.doorMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setDoorMode(mode) {
  if (mode && !["place", "remove"].includes(mode)) {
    return;
  }
  const nextMode = state.doorMode === mode ? null : mode;
  state.doorMode = nextMode;
  syncDoorModeButtons();
}

function syncHeightBrushSizeDisplay() {
  const brushSize = Math.max(1, Math.floor(state.heightBrushSize));
  if (elements.heightBrushSize) {
    elements.heightBrushSize.value = String(brushSize);
  }
  if (elements.heightBrushSizeValue) {
    elements.heightBrushSizeValue.textContent = String(brushSize);
  }
}

function setHeightBrushSize(value) {
  const nextSize = Number.parseInt(value, 10);
  if (!Number.isFinite(nextSize)) {
    return;
  }
  state.heightBrushSize = Math.max(1, nextSize);
  syncHeightBrushSizeDisplay();
}

function syncHeightValueDisplay() {
  const clamped = clampHeightValue(state.heightValue);
  if (elements.heightValueInput) {
    elements.heightValueInput.value = String(clamped);
  }
  if (elements.heightValueSlider) {
    elements.heightValueSlider.value = String(clamped);
  }
}

function setHeightValue(value) {
  state.heightValue = clampHeightValue(value);
  syncHeightValueDisplay();
}

function setHeightVisibility(isEnabled) {
  state.showHeights = isEnabled;
  if (elements.mapGrid) {
    elements.mapGrid.dataset.showHeights = String(isEnabled);
  }
  if (elements.showHeightButton) {
    elements.showHeightButton.classList.toggle("is-active", isEnabled);
    elements.showHeightButton.setAttribute("aria-pressed", String(isEnabled));
  }
  if (landscapeViewer?.setHeightVisibility) {
    landscapeViewer.setHeightVisibility(isEnabled);
  }
}

function populateTerrainTypeSelect() {
  if (!elements.terrainTypeSelect) {
    return;
  }
  elements.terrainTypeSelect.innerHTML = "";
  TERRAIN_TYPES.forEach((terrain) => {
    const option = document.createElement("option");
    option.value = terrain.id;
    option.textContent = `■ ${terrain.label}`;
    if (terrain?.color) {
      option.style.setProperty("--terrain-color", terrain.color);
      option.style.color = terrain.color;
    }
    elements.terrainTypeSelect.appendChild(option);
  });
}

function populateTerrainTileSelect() {
  if (!elements.terrainTileSelect) {
    return;
  }
  elements.terrainTileSelect.innerHTML = "";
  OUTSIDE_TERRAIN_TILES.forEach((tile, index) => {
    const option = document.createElement("option");
    option.value = tile.id;
    option.textContent = `Tile ${index + 1}`;
    elements.terrainTileSelect.appendChild(option);
  });
}

function resolveMapArea(areaId) {
  if (typeof areaId !== "string") {
    return MAP_AREA_BY_ID.get(DEFAULT_MAP_AREA_ID) ?? MAP_AREAS[0] ?? null;
  }
  const trimmed = areaId.trim();
  if (!trimmed) {
    return MAP_AREA_BY_ID.get(DEFAULT_MAP_AREA_ID) ?? MAP_AREAS[0] ?? null;
  }
  return (
    MAP_AREA_BY_ID.get(trimmed) ??
    MAP_AREA_BY_ID.get(DEFAULT_MAP_AREA_ID) ??
    MAP_AREAS[0] ??
    null
  );
}

function getAreaStorageKey(areaId = state.selectedAreaId) {
  const resolvedArea = resolveMapArea(areaId);
  const resolvedId = resolvedArea?.id ?? DEFAULT_MAP_AREA_ID;
  return resolvedId === DEFAULT_MAP_AREA_ID
    ? LOCAL_STORAGE_KEY
    : `${LOCAL_STORAGE_KEY}.${resolvedId}`;
}

function resetHistoryState() {
  historyState.undoStack.length = 0;
  historyState.redoStack.length = 0;
  historyState.pendingSnapshot = null;
  historyState.isDirty = false;
  updateUndoRedoButtons();
}

function cacheCurrentAreaMap() {
  const resolvedArea = resolveMapArea(state.selectedAreaId);
  const areaId = resolvedArea?.id;
  if (!areaId) {
    return;
  }
  state.areaMapCache.set(areaId, cloneMapDefinition(state.map));
}

function applyAreaSummary(area = resolveMapArea(state.selectedAreaId)) {
  if (elements.selectedAreaName) {
    elements.selectedAreaName.value = area?.label ?? "";
  }
  if (elements.selectedAreaId) {
    elements.selectedAreaId.value = area?.id ?? "";
  }
  if (elements.selectedAreaDescription) {
    elements.selectedAreaDescription.value = area?.description ?? "";
  }
}

function renderAreaList() {
  if (!elements.areaList) {
    applyAreaSummary();
    return;
  }

  elements.areaList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  MAP_AREAS.forEach((area) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "object-card";
    button.dataset.active = String(area.id === state.selectedAreaId);
    button.dataset.areaId = area.id;
    button.setAttribute(
      "aria-label",
      `${area.label}. ${area.description ?? "Select area."}`
    );

    const label = document.createElement("span");
    label.className = "object-card-label";
    label.textContent = area.label;

    const description = document.createElement("span");
    description.className = "object-card-path";
    description.textContent = area.id;

    button.append(label, description);
    button.addEventListener("click", () => {
      selectArea(area.id);
    });
    fragment.appendChild(button);
  });

  elements.areaList.appendChild(fragment);
  applyAreaSummary();
}

function selectArea(areaId) {
  const area = resolveMapArea(areaId);
  if (!area) {
    return;
  }

  if (area.id === state.selectedAreaId) {
    renderAreaList();
    updateLocalSaveButtonsState();
    return;
  }

  cacheCurrentAreaMap();
  state.selectedAreaId = area.id;
  const cachedMap = state.areaMapCache.get(area.id);
  const storedMap = cachedMap ? null : loadMapFromStorageForArea(area.id);
  state.map = cachedMap
    ? cloneMapDefinition(cachedMap)
    : storedMap ?? createDefaultMapForArea(area.id);
  clearSelection();
  resetHistoryState();
  updateMetadataDisplays();
  renderGrid();
  if (landscapeViewer) {
    landscapeViewer.setTextureVisibility?.(getTextureVisibility());
    landscapeViewer.setTileNumberVisibility?.(getTileNumberVisibility());
    landscapeViewer.setHeightVisibility?.(state.showHeights);
    landscapeViewer.resize?.();
    window.requestAnimationFrame(() => {
      landscapeViewer?.resize?.();
    });
  }
  updateJsonPreview();
  landscapeViewer?.setObjectPlacements?.(state.map.objects);
  renderAreaList();
  updateLocalSaveButtonsState();
}

function getLocalStorage() {
  if (cachedLocalStorage !== undefined) {
    return cachedLocalStorage;
  }
  cachedLocalStorage = tryGetOutsideMapStorage();
  return cachedLocalStorage;
}

function loadMapFromStorageForArea(areaId, { removeInvalid = true } = {}) {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  const storageKey = getAreaStorageKey(areaId);
  let serialized = null;
  try {
    serialized = storage.getItem(storageKey);
  } catch (error) {
    console.warn("Unable to read area map from local storage", error);
    return null;
  }

  if (!serialized) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized);
    return normalizeMapDefinition(parsed);
  } catch (error) {
    console.warn("Stored area map is invalid", error);
    if (removeInvalid) {
      try {
        storage.removeItem(storageKey);
      } catch (removeError) {
        console.warn("Unable to remove invalid saved area map", removeError);
      }
    }
  }

  return null;
}

function resetButtonLabel(button, timerKey) {
  if (!button) {
    return;
  }
  const defaultLabel =
    button.dataset?.defaultLabel && button.dataset.defaultLabel.length > 0
      ? button.dataset.defaultLabel
      : button.textContent;
  button.textContent = defaultLabel;
  if (timerKey && timerKey in localSaveFeedbackTimers) {
    const timerId = localSaveFeedbackTimers[timerKey];
    if (typeof timerId === "number") {
      window.clearTimeout(timerId);
      localSaveFeedbackTimers[timerKey] = null;
    }
  }
}

function setTemporaryButtonLabel(button, label, timerKey, duration = 1500) {
  if (!button) {
    return;
  }
  if (button.dataset) {
    button.dataset.defaultLabel =
      button.dataset.defaultLabel || button.textContent || label;
  }
  button.textContent = label;
  if (!timerKey || !(timerKey in localSaveFeedbackTimers)) {
    return;
  }
  const previousTimer = localSaveFeedbackTimers[timerKey];
  if (typeof previousTimer === "number") {
    window.clearTimeout(previousTimer);
  }
  localSaveFeedbackTimers[timerKey] = window.setTimeout(() => {
    resetButtonLabel(button, timerKey);
  }, duration);
}

function updateLocalSaveButtonsState() {
  const storage = getLocalStorage();
  let hasStorage = Boolean(storage);
  let hasSavedMap = false;
  const storageKey = getAreaStorageKey();

  if (hasStorage) {
    try {
      hasSavedMap = Boolean(storage.getItem(storageKey));
    } catch (error) {
      console.warn("Unable to read saved map from local storage", error);
      hasStorage = false;
      hasSavedMap = false;
    }
  }

  if (elements.saveLocalButton) {
    elements.saveLocalButton.disabled = !hasStorage;
    if (!hasStorage) {
      resetButtonLabel(elements.saveLocalButton, "save");
    }
  }

  if (elements.restoreLocalButton) {
    elements.restoreLocalButton.disabled = !hasStorage || !hasSavedMap;
    if (!hasStorage || !hasSavedMap) {
      resetButtonLabel(elements.restoreLocalButton, "restore");
    }
  }
}

function saveMapToLocalStorage({ showAlert = true, showFeedback = true } = {}) {
  const storage = getLocalStorage();
  if (!storage) {
    if (showAlert) {
      alert(
        "Local saving is unavailable in this browser. Try a different browser or enable storage permissions."
      );
    }
    return false;
  }
  try {
    const normalized = normalizeMapDefinition(state.map);
    storage.setItem(getAreaStorageKey(), JSON.stringify(normalized));
    state.map = normalized;
    state.areaMapCache.set(state.selectedAreaId, cloneMapDefinition(state.map));
  } catch (error) {
    console.error("Failed to save map locally", error);
    if (showAlert) {
      alert("Unable to save the map locally. Check storage permissions or space.");
    }
    updateLocalSaveButtonsState();
    return false;
  }

  if (showFeedback) {
    setTemporaryButtonLabel(elements.saveLocalButton, "Saved", "save");
  }
  updateLocalSaveButtonsState();
  return true;
}

function scheduleAutoSave() {
  if (typeof window === "undefined") {
    return;
  }
  if (typeof autoSaveTimerId === "number") {
    window.clearTimeout(autoSaveTimerId);
  }
  autoSaveTimerId = window.setTimeout(() => {
    autoSaveTimerId = null;
    saveMapToLocalStorage({ showAlert: false, showFeedback: false });
  }, LOCAL_AUTO_SAVE_DELAY_MS);
}

function flushAutoSave() {
  if (typeof window === "undefined") {
    return;
  }
  if (typeof autoSaveTimerId === "number") {
    window.clearTimeout(autoSaveTimerId);
    autoSaveTimerId = null;
  }
  saveMapToLocalStorage({ showAlert: false, showFeedback: false });
}

function restoreMapFromLocalStorage({
  showAlertOnMissing = true,
  showFeedback = true,
  pushHistory = true,
} = {}) {
  const storage = getLocalStorage();
  if (!storage) {
    if (showAlertOnMissing) {
      alert(
        "Local saves are unavailable in this browser. Try a different browser or enable storage permissions."
      );
    }
    updateLocalSaveButtonsState();
    return false;
  }

  const parsedMap = loadMapFromStorageForArea(state.selectedAreaId, {
    removeInvalid: false,
  });
  if (!parsedMap) {
    if (showAlertOnMissing) {
      alert("No saved map found. Save a map locally first.");
    }
    updateLocalSaveButtonsState();
    return false;
  }

  const snapshot = cloneMapDefinition(state.map);
  state.map = parsedMap;
  clearSelection();
  updateMetadataDisplays();
  renderGrid();
  updateJsonPreview();
  landscapeViewer?.setObjectPlacements?.(state.map.objects);
  state.areaMapCache.set(state.selectedAreaId, cloneMapDefinition(state.map));
  if (pushHistory) {
    pushUndoSnapshot(snapshot);
  }

  if (showFeedback) {
    setTemporaryButtonLabel(
      elements.restoreLocalButton,
      "Loaded",
      "restore"
    );
  }

  updateLocalSaveButtonsState();
  return true;
}

function setTerrain(terrain) {
  state.selectedTerrainTypeId = terrain.id;
  state.selectedTerrainTileId = getOutsideTerrainDefaultTileId(terrain.id);
  renderPalette();
  updateTerrainMenu();
}

function updateMapMetadata({ name, region, notes }) {
  if (typeof name === "string") {
    state.map.name = name;
  }
  if (typeof region === "string") {
    state.map.region = region;
  }
  if (typeof notes === "string") {
    state.map.notes = notes;
  }
  updateMetadataDisplays();
  updateJsonPreview();
}

function updateMetadataDisplays() {
  if (elements.mapNameDisplay) {
    elements.mapNameDisplay.textContent = state.map.name || "Untitled";
  }
  if (elements.mapRegionDisplay) {
    elements.mapRegionDisplay.textContent = state.map.region || "—";
  }
  if (elements.mapSizeDisplay) {
    elements.mapSizeDisplay.textContent = `${state.map.width} × ${state.map.height}`;
  }
  if (elements.mapNameInput) {
    elements.mapNameInput.value = state.map.name;
  }
  if (elements.regionInput) {
    elements.regionInput.value = state.map.region;
  }
  if (elements.notesInput) {
    elements.notesInput.value = state.map.notes;
  }
  if (elements.widthInput) {
    elements.widthInput.value = state.map.width;
  }
  if (elements.heightInput) {
    elements.heightInput.value = state.map.height;
  }
  applyAreaSummary();
}

function updateSelectionPreview() {
  if (landscapeViewer?.setSelection) {
    landscapeViewer.setSelection({
      startIndex: state.selectionStart,
      endIndex: state.selectionEnd,
    });
  }
}

function updateDrawButtonsState() {
  const hasSelection =
    Number.isFinite(state.selectionStart) &&
    Number.isFinite(state.selectionEnd);
  const terrainDrawActive = state.activeTab === "terrain" && state.terrainMode === "draw";
  const heightDrawActive = state.activeTab === "height" && state.heightMode === "draw";
  if (elements.terrainApplyButton) {
    elements.terrainApplyButton.disabled = !hasSelection || !terrainDrawActive;
  }
  if (elements.terrainCancelButton) {
    elements.terrainCancelButton.disabled = !hasSelection || !terrainDrawActive;
  }
  if (elements.heightApplyButton) {
    elements.heightApplyButton.disabled = !hasSelection || !heightDrawActive;
  }
  if (elements.heightCancelButton) {
    elements.heightCancelButton.disabled = !hasSelection || !heightDrawActive;
  }
}

function clearSelection() {
  state.selectionStart = null;
  state.selectionEnd = null;
  state.selectionFixed = false;
  state.isSelectionPointerDown = false;
  updateSelectionPreview();
  updateDrawButtonsState();
}

function resizeMap(width, height) {
  const clampedWidth = clampOutsideMapDimension(width);
  const clampedHeight = clampOutsideMapDimension(height);
  if (
    clampedWidth === state.map.width &&
    clampedHeight === state.map.height
  ) {
    return;
  }

  const snapshot = cloneMapDefinition(state.map);
  const newCells = Array.from(
    { length: clampedWidth * clampedHeight },
    (_, index) => {
      const x = index % clampedWidth;
      const y = Math.floor(index / clampedWidth);
      if (x < state.map.width && y < state.map.height) {
        return { ...state.map.cells[y * state.map.width + x] };
      }
      return createCell(TERRAIN_TYPES[0].id);
    }
  );
  const newHeights = Array.from(
    { length: clampedWidth * clampedHeight },
    (_, index) => {
      const x = index % clampedWidth;
      const y = Math.floor(index / clampedWidth);
      if (x < state.map.width && y < state.map.height) {
        const sourceIndex = y * state.map.width + x;
        return clampHeightValue(state.map.heights?.[sourceIndex] ?? HEIGHT_MIN);
      }
      return HEIGHT_MIN;
    }
  );

  state.map.width = clampedWidth;
  state.map.height = clampedHeight;
  state.map.cells = newCells;
  state.map.heights = newHeights;
  clearSelection();
  updateMetadataDisplays();
  renderGrid();
  updateJsonPreview();
  pushUndoSnapshot(snapshot);
}

function renderPalette() {
  if (!elements.palette) {
    return;
  }
  elements.palette.innerHTML = "";
  for (const terrain of TERRAIN_TYPES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "terrain-button";
    button.dataset.active = String(state.selectedTerrainTypeId === terrain.id);
    const tileId =
      state.selectedTerrainTypeId === terrain.id
        ? getSelectedTerrainTileId()
        : getOutsideTerrainDefaultTileId(terrain.id);
    const textureCss = getTerrainTextureCssValue(tileId);
    const elementLabel = formatTerrainElement(terrain);
    const hpLabel = formatTerrainHp(terrain);
    const details = [terrain.description];
    if (hpLabel !== UNKNOWN_HP_LABEL) {
      details.push(`HP: ${hpLabel}`);
    }
    if (elementLabel) {
      details.push(`Element: ${elementLabel}`);
    }
    const tileLabel = formatTerrainTileLabel(tileId);
    const tooltipParts = [
      terrain.label,
      terrain.description,
      hpLabel !== UNKNOWN_HP_LABEL ? `HP: ${hpLabel}` : null,
      elementLabel ? `Element: ${elementLabel}` : null,
      tileLabel,
    ].filter(Boolean);
    button.style.setProperty("--terrain-texture", textureCss);
    button.title = tooltipParts.join("\n");
    button.setAttribute(
      "aria-label",
      `${terrain.label}. ${details.join(" ")} ${tileLabel}.`
    );
    button.innerHTML = `
      <span class="terrain-tile-chip" style="background:${terrain.color};"></span>
      <span class="terrain-tile-number">${getTerrainTileNumber(tileId)}</span>
    `;
    button.addEventListener("click", () => setTerrain(terrain));
    elements.palette.appendChild(button);
  }
}

function buildCellAriaLabel(index, terrain, tileId) {
  const ariaParts = [`Cell ${index + 1}`, terrain.label, formatTerrainTileLabel(tileId)];
  const hpLabel = formatTerrainHp(terrain);
  if (hpLabel !== UNKNOWN_HP_LABEL) {
    ariaParts.push(`HP ${hpLabel}`);
  }
  const elementLabel = formatTerrainElement(terrain);
  if (elementLabel) {
    ariaParts.push(`Element ${elementLabel}`);
  }
  const heightValue = getCellHeightValue(index);
  ariaParts.push(`Height ${heightValue}`);
  return ariaParts.join(", ");
}

function renderGrid() {
  if (!elements.mapGrid) {
    updateLandscapeViewer();
    return;
  }

  elements.mapGrid.style.setProperty("--width", state.map.width);
  elements.mapGrid.style.setProperty("--height", state.map.height);
  elements.mapGrid.dataset.showHeights = String(state.showHeights);
  elements.mapGrid.innerHTML = "";

  for (let index = 0; index < state.map.cells.length; index += 1) {
    const cellData = state.map.cells[index];
    const terrainId = getCellTerrainId(cellData);
    const tileId = getCellTileId(cellData);
    const terrain = getTerrainById(terrainId);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "map-cell";
    cell.dataset.index = index;
    cell.dataset.terrain = terrain.id;
    cell.style.setProperty("--cell-color", terrain.color ?? "transparent");
    cell.style.setProperty(
      "--cell-texture",
      getTerrainTextureCssValue(tileId, index)
    );
    cell.dataset.tileNumber = getTerrainTileNumber(tileId);
    cell.dataset.height = String(getCellHeightValue(index));
    cell.setAttribute("aria-label", buildCellAriaLabel(index, terrain, tileId));
    cell.addEventListener("pointerdown", handleCellPointerDown);
    cell.addEventListener("pointerenter", handleCellPointerEnter);
    cell.addEventListener("click", (event) => event.preventDefault());
    elements.mapGrid.appendChild(cell);
  }

  updateLandscapeViewer();
}

function paintCell(index, terrainId, tileId) {
  if (index < 0 || index >= state.map.cells.length) {
    return;
  }
  const terrain = getTerrainById(terrainId);
  const resolvedTileId = resolveTerrainTileId(tileId, terrain.id);
  const currentCell = state.map.cells[index];
  if (
    currentCell?.terrainId === terrain.id &&
    currentCell?.tileId === resolvedTileId
  ) {
    return;
  }

  state.map.cells[index] = {
    terrainId: terrain.id,
    tileId: resolvedTileId,
  };
  markHistoryDirty();
  if (elements.mapGrid) {
    const cell = elements.mapGrid.querySelector(
      `.map-cell[data-index="${index}"]`
    );
    if (cell) {
      cell.dataset.terrain = terrain.id;
      cell.style.setProperty("--cell-color", terrain.color ?? "transparent");
      cell.style.setProperty(
        "--cell-texture",
        getTerrainTextureCssValue(resolvedTileId, index)
      );
      cell.dataset.tileNumber = getTerrainTileNumber(resolvedTileId);
      cell.dataset.height = String(getCellHeightValue(index));
      cell.setAttribute(
        "aria-label",
        buildCellAriaLabel(index, terrain, resolvedTileId)
      );
    }
  }
  updateJsonPreview();
  updateLandscapeViewer();
}

function beginPointerPaint(erase) {
  if (state.terrainMode !== "brush") {
    return;
  }
  state.isPointerDown = true;
  beginHistoryEntry();
  const selection = getActiveTerrainSelection({ erase });
  state.pointerTerrainTypeId = selection.terrainId;
  state.pointerTerrainTileId = selection.tileId;
}

function updateCellElement(index) {
  if (!elements.mapGrid) {
    return;
  }
  const cell = elements.mapGrid.querySelector(
    `.map-cell[data-index="${index}"]`
  );
  if (!cell) {
    return;
  }
  const cellData = state.map.cells[index];
  const terrainId = getCellTerrainId(cellData);
  const tileId = getCellTileId(cellData);
  const terrain = getTerrainById(terrainId);
  cell.dataset.terrain = terrain.id;
  cell.style.setProperty("--cell-color", terrain.color ?? "transparent");
  cell.style.setProperty(
    "--cell-texture",
    getTerrainTextureCssValue(tileId, index)
  );
  cell.dataset.tileNumber = getTerrainTileNumber(tileId);
  cell.dataset.height = String(getCellHeightValue(index));
  cell.setAttribute("aria-label", buildCellAriaLabel(index, terrain, tileId));
}

function updateHeightCell(index, heightValue) {
  if (index < 0 || index >= state.map.cells.length) {
    return false;
  }
  if (!Array.isArray(state.map.heights)) {
    state.map.heights = Array.from(
      { length: state.map.cells.length },
      () => HEIGHT_MIN
    );
  }
  const clamped = clampHeightValue(heightValue);
  const currentValue = getCellHeightValue(index);
  if (currentValue === clamped) {
    return false;
  }
  state.map.heights[index] = clamped;
  markHistoryDirty();
  if (elements.mapGrid) {
    const cell = elements.mapGrid.querySelector(
      `.map-cell[data-index="${index}"]`
    );
    if (cell) {
      cell.dataset.height = String(clamped);
      const cellData = state.map.cells[index];
      const terrainId = getCellTerrainId(cellData);
      const tileId = getCellTileId(cellData);
      const terrain = getTerrainById(terrainId);
      cell.setAttribute(
        "aria-label",
        buildCellAriaLabel(index, terrain, tileId)
      );
    }
  }
  return true;
}

function applyTerrainSelection({ erase = false } = {}) {
  if (
    !Number.isFinite(state.selectionStart) ||
    !Number.isFinite(state.selectionEnd)
  ) {
    return;
  }

  const snapshot = cloneMapDefinition(state.map);
  const width = state.map.width;
  const startX = state.selectionStart % width;
  const startY = Math.floor(state.selectionStart / width);
  const endX = state.selectionEnd % width;
  const endY = Math.floor(state.selectionEnd / width);
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);
  const minY = Math.min(startY, endY);
  const maxY = Math.max(startY, endY);

  const selection = getActiveTerrainSelection({ erase });
  const terrainId = selection.terrainId;
  const tileId = selection.tileId;
  let didUpdate = false;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const index = y * width + x;
      if (
        state.map.cells[index]?.terrainId !== terrainId ||
        state.map.cells[index]?.tileId !== tileId
      ) {
        state.map.cells[index] = { terrainId, tileId };
        updateCellElement(index);
        didUpdate = true;
      }
    }
  }

  if (didUpdate) {
    updateJsonPreview();
    updateLandscapeViewer();
    pushUndoSnapshot(snapshot);
  }
  clearSelection();
}

function applyHeightSelection() {
  if (
    !Number.isFinite(state.selectionStart) ||
    !Number.isFinite(state.selectionEnd)
  ) {
    return;
  }

  const snapshot = cloneMapDefinition(state.map);
  const width = state.map.width;
  const startX = state.selectionStart % width;
  const startY = Math.floor(state.selectionStart / width);
  const endX = state.selectionEnd % width;
  const endY = Math.floor(state.selectionEnd / width);
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);
  const minY = Math.min(startY, endY);
  const maxY = Math.max(startY, endY);
  const nextHeight = clampHeightValue(state.heightValue);
  let didUpdate = false;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const index = y * width + x;
      if (updateHeightCell(index, nextHeight)) {
        didUpdate = true;
      }
    }
  }

  if (didUpdate) {
    updateJsonPreview();
    updateLandscapeViewer();
    pushUndoSnapshot(snapshot);
  }
  clearSelection();
}

function updateSelection(index, { isStart = false, isEnd = false } = {}) {
  if (!Number.isFinite(index)) {
    return;
  }

  if (isStart || !Number.isFinite(state.selectionStart)) {
    state.selectionStart = index;
    state.selectionEnd = index;
    state.selectionFixed = false;
  } else if (!state.selectionFixed) {
    state.selectionEnd = index;
  }

  if (isEnd) {
    state.selectionFixed = true;
  }
  updateSelectionPreview();
  updateDrawButtonsState();
}

function applyPointerPaint(index) {
  if (!state.isPointerDown) {
    return;
  }
  const brushSize =
    state.terrainMode === "brush" ? Math.max(1, state.terrainBrushSize) : 1;
  if (brushSize <= 1) {
    paintCell(index, state.pointerTerrainTypeId, state.pointerTerrainTileId);
    return;
  }

  const width = state.map.width;
  const height = state.map.height;
  const x = index % width;
  const y = Math.floor(index / width);
  const half = Math.floor(brushSize / 2);
  const startX = x - half;
  const startY = y - half;
  const endX = startX + brushSize - 1;
  const endY = startY + brushSize - 1;

  for (let row = startY; row <= endY; row += 1) {
    if (row < 0 || row >= height) {
      continue;
    }
    for (let col = startX; col <= endX; col += 1) {
      if (col < 0 || col >= width) {
        continue;
      }
      paintCell(
        row * width + col,
        state.pointerTerrainTypeId,
        state.pointerTerrainTileId
      );
    }
  }
}

function beginHeightPaint() {
  state.isHeightPointerDown = true;
  beginHistoryEntry();
}

function applyHeightPointerPaint(index) {
  if (!state.isHeightPointerDown) {
    return;
  }
  const brushSize =
    state.heightMode === "brush" ? Math.max(1, state.heightBrushSize) : 1;
  const nextHeight = clampHeightValue(state.heightValue);
  if (brushSize <= 1) {
    if (updateHeightCell(index, nextHeight)) {
      updateJsonPreview();
      updateLandscapeViewer();
    }
    return;
  }

  const width = state.map.width;
  const height = state.map.height;
  const x = index % width;
  const y = Math.floor(index / width);
  const half = Math.floor(brushSize / 2);
  const startX = x - half;
  const startY = y - half;
  const endX = startX + brushSize - 1;
  const endY = startY + brushSize - 1;
  let didUpdate = false;

  for (let row = startY; row <= endY; row += 1) {
    if (row < 0 || row >= height) {
      continue;
    }
    for (let col = startX; col <= endX; col += 1) {
      if (col < 0 || col >= width) {
        continue;
      }
      if (updateHeightCell(row * width + col, nextHeight)) {
        didUpdate = true;
      }
    }
  }

  if (didUpdate) {
    updateJsonPreview();
    updateLandscapeViewer();
  }
}

function endHeightPaint() {
  state.isHeightPointerDown = false;
  commitHistoryEntry();
}

function endPointerPaint() {
  state.isPointerDown = false;
  state.pointerTerrainTypeId = null;
  state.pointerTerrainTileId = null;
  commitHistoryEntry();
}

function handleCellPointerDown(event) {
  event.preventDefault();
  if (event.button !== 0) {
    return;
  }
  const isTerrainEditingTab =
    state.activeTab === "terrain" || state.activeTab === "height";
  if (!isTerrainEditingTab) {
    return;
  }
  const cell = event.currentTarget;
  const index = Number.parseInt(cell.dataset.index, 10);
  const isHeightTab = state.activeTab === "height";
  if (isHeightTab && state.heightMode === "draw") {
    state.isSelectionPointerDown = true;
    updateSelection(index, { isStart: true });
    window.addEventListener(
      "pointerup",
      () => {
        state.isSelectionPointerDown = false;
        updateSelection(state.selectionEnd ?? index, { isEnd: true });
      },
      { once: true }
    );
    return;
  }
  if (isHeightTab) {
    beginHeightPaint();
    applyHeightPointerPaint(index);
    window.addEventListener("pointerup", endHeightPaint, { once: true });
    return;
  }
  if (state.terrainMode === "draw") {
    state.isSelectionPointerDown = true;
    updateSelection(index, { isStart: true });
    window.addEventListener(
      "pointerup",
      () => {
        state.isSelectionPointerDown = false;
        updateSelection(state.selectionEnd ?? index, { isEnd: true });
      },
      { once: true }
    );
    return;
  }
  const erase = event.shiftKey;
  beginPointerPaint(erase);
  applyPointerPaint(index);
  window.addEventListener("pointerup", endPointerPaint, { once: true });
}

function handleCellPointerEnter(event) {
  const isTerrainEditingTab =
    state.activeTab === "terrain" || state.activeTab === "height";
  if (!isTerrainEditingTab) {
    return;
  }
  const cell = event.currentTarget;
  const index = Number.parseInt(cell.dataset.index, 10);
  const isHeightTab = state.activeTab === "height";
  if (isHeightTab && state.heightMode === "draw") {
    if (state.isSelectionPointerDown && !state.selectionFixed) {
      updateSelection(index);
    }
    return;
  }
  if (isHeightTab) {
    applyHeightPointerPaint(index);
    return;
  }
  if (state.terrainMode === "draw") {
    if (state.isSelectionPointerDown && !state.selectionFixed) {
      updateSelection(index);
    }
    return;
  }
  applyPointerPaint(index);
}

function updateJsonPreview() {
  const json = JSON.stringify(state.map, null, 2);
  elements.jsonPreview.textContent = json;
  updateDoorList();
  updateObjectList();
  scheduleAutoSave();
}

function setActivePaletteTab(tabId) {
  const previousTab = state.activeTab;
  state.activeTab = tabId;
  if (previousTab && previousTab !== tabId) {
    clearSelection();
  }

  if (tabId === "terrain" && state.terrainMode !== "brush") {
    setTerrainMenu("brush");
  } else if (tabId === "height" && state.heightMode !== "brush") {
    setHeightMode("brush");
  }

  let activePanelId = null;
  elements.tabButtons.forEach((button) => {
    const isActive = button.dataset.mapMakerTab === tabId;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
    const panelId = button.getAttribute("aria-controls");
    if (isActive) {
      activePanelId = panelId;
    }
  });

  elements.tabPanels.forEach((panel) => {
    const isActive = panel.id === activePanelId;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  elements.mainPanels.forEach((panel) => {
    const isActive = panel.dataset.mapMakerMain === "terrain";
    panel.classList.toggle("is-active", isActive);
  });

  if (
    tabId === "areas" ||
    tabId === "landshaft" ||
    tabId === "terrain" ||
    tabId === "doors" ||
    tabId === "objects" ||
    tabId === "height"
  ) {
    const needsInit = !landscapeViewer;
    if (!landscapeViewer) {
      landscapeViewer = initMapMaker3d({
        canvas: elements.landscapeViewport,
        errorElement: elements.landscapeError,
        resetButton: elements.landscapeResetButton,
        terrainTypeToggle: elements.landscapeTypeToggle,
        terrainTextureToggle: elements.landscapeTextureToggle,
        initialTextureVisibility: getTextureVisibility(),
        initialTileNumberVisibility: getTileNumberVisibility(),
        initialHeightVisibility: state.showHeights,
        getSelectedAreaId: () => state.selectedAreaId,
        getBrushSize: () =>
          state.activeTab === "height" ? state.heightBrushSize : state.terrainBrushSize,
        getTerrainMode: () =>
          state.activeTab === "height" ? state.heightMode : state.terrainMode,
        getActiveTab: () => state.activeTab,
        getSelectedObject: () => state.selectedObject,
        getDoorMode: () => state.doorMode,
        onPlaceObject: (placement) => {
          if (!placement) {
            return;
          }
          const snapshot = cloneMapDefinition(state.map);
          const existing = Array.isArray(state.map.objects)
            ? state.map.objects
            : [];
          const baseObjects =
            placement.path === DOOR_MARKER_PATH
              ? removeDoorMarkersAtPosition(
                  existing,
                  placement.position ?? null
                )
              : existing;
          state.map.objects = [...baseObjects, placement];
          updateJsonPreview();
          landscapeViewer?.setObjectPlacements?.(state.map.objects);
          pushUndoSnapshot(snapshot);
        },
        onRemoveObject: ({ index, path } = {}) => {
          if (path === DOOR_MARKER_PATH) {
            removeDoorMarkersAtIndex(index);
          }
        },
        onPaintCell: ({ index, isStart, shiftKey }) => {
          if (!Number.isFinite(index)) {
            return;
          }
          const isTerrainEditingTab =
            state.activeTab === "terrain" || state.activeTab === "height";
          if (!isTerrainEditingTab) {
            return;
          }
          const isHeightTab = state.activeTab === "height";
          if (isStart) {
            if (isHeightTab && state.heightMode === "draw") {
              updateSelection(index, { isStart: true });
            } else if (isHeightTab) {
              beginHeightPaint();
            } else if (state.terrainMode === "draw") {
              updateSelection(index, { isStart: true });
            } else {
              beginPointerPaint(Boolean(shiftKey));
            }
          }
          if (isHeightTab && state.heightMode === "draw") {
            updateSelection(index);
          } else if (isHeightTab) {
            applyHeightPointerPaint(index);
          } else if (state.terrainMode === "draw") {
            updateSelection(index);
          } else {
            applyPointerPaint(index);
          }
        },
        onPaintEnd: () => {
          const isTerrainEditingTab =
            state.activeTab === "terrain" || state.activeTab === "height";
          if (!isTerrainEditingTab) {
            return;
          }
          if (state.activeTab === "height" && state.heightMode === "draw") {
            if (Number.isFinite(state.selectionStart)) {
              updateSelection(state.selectionEnd ?? state.selectionStart, {
                isEnd: true,
              });
            }
          } else if (state.activeTab === "height") {
            endHeightPaint();
          } else if (state.terrainMode === "draw") {
            if (Number.isFinite(state.selectionStart)) {
              updateSelection(state.selectionEnd ?? state.selectionStart, {
                isEnd: true,
              });
            }
          } else {
            endPointerPaint();
          }
        },
      });
    }
    if (landscapeViewer?.setTextureVisibility) {
      landscapeViewer.setTextureVisibility(getTextureVisibility());
    }
    if (landscapeViewer?.setTileNumberVisibility) {
      landscapeViewer.setTileNumberVisibility(getTileNumberVisibility());
    }
    if (landscapeViewer?.setHeightVisibility) {
      landscapeViewer.setHeightVisibility(state.showHeights);
    }
    landscapeViewer?.setObjectPlacements?.(state.map.objects);
    if (needsInit) {
      updateLandscapeViewer();
      window.requestAnimationFrame(() => {
        landscapeViewer?.resize?.();
      });
    }
  }
}

function focusAdjacentTab(direction) {
  const tabs = elements.tabButtons;
  if (tabs.length === 0) {
    return;
  }
  const currentIndex = tabs.findIndex(
    (button) => button.getAttribute("aria-selected") === "true"
  );
  const normalizedIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex =
    (normalizedIndex + direction + tabs.length) % tabs.length;
  const nextTab = tabs[nextIndex];
  if (nextTab) {
    setActivePaletteTab(nextTab.dataset.mapMakerTab);
    nextTab.focus();
  }
}

function initPaletteTabs() {
  if (!elements.tabButtons.length) {
    return;
  }

  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActivePaletteTab(button.dataset.mapMakerTab);
    });

    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusAdjacentTab(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusAdjacentTab(-1);
      }
    });
  });

  const activeTab = elements.tabButtons.find(
    (button) => button.getAttribute("aria-selected") === "true"
  );
  setActivePaletteTab(activeTab?.dataset.mapMakerTab ?? "terrain");
}

async function applyImportedMap(mapDefinition, { pushHistory = true } = {}) {
  const snapshot = cloneMapDefinition(state.map);
  const resolved = await resolveExternalHeights(mapDefinition);
  const normalized = normalizeMapDefinition(resolved);

  state.map = normalized;
  clearSelection();

  updateMetadataDisplays();
  renderGrid();
  updateJsonPreview();
  landscapeViewer?.setObjectPlacements?.(state.map.objects);
  if (pushHistory) {
    pushUndoSnapshot(snapshot);
  }
}

function resetMap() {
  const snapshot = cloneMapDefinition(state.map);
  state.map = createDefaultMapForArea(state.selectedAreaId);
  setTerrain(TERRAIN_TYPES[1]);
  clearSelection();
  updateMetadataDisplays();
  renderGrid();
  updateJsonPreview();
  landscapeViewer?.setObjectPlacements?.(state.map.objects);
  pushUndoSnapshot(snapshot);
}

function generateRandomMap() {
  const pool = RANDOM_TERRAIN_POOL.length > 0 ? RANDOM_TERRAIN_POOL : TERRAIN_TYPES;
  if (pool.length === 0) {
    return;
  }

  const snapshot = cloneMapDefinition(state.map);
  const { minHeight, maxHeight, hillsCount } = resolveGenerationSettings();

  state.map.cells = state.map.cells.map(() => {
    const randomIndex = Math.floor(Math.random() * pool.length);
    const terrainId = pool[randomIndex].id;
    return {
      terrainId,
      tileId: getOutsideTerrainDefaultTileId(terrainId),
    };
  });

  const totalCells = state.map.width * state.map.height;
  const heights = Array.from({ length: totalCells }, () =>
    getRandomIntInclusive(minHeight, maxHeight)
  );

  if (hillsCount > 0 && state.map.width > 0 && state.map.height > 0) {
    const maxRadius = Math.max(
      2,
      Math.floor(Math.min(state.map.width, state.map.height) / 2)
    );
    const heightRange = Math.max(1, maxHeight - minHeight);

    for (let hillIndex = 0; hillIndex < hillsCount; hillIndex += 1) {
      const centerX = getRandomIntInclusive(0, state.map.width - 1);
      const centerY = getRandomIntInclusive(0, state.map.height - 1);
      const radius = getRandomIntInclusive(2, maxRadius);
      const amplitude = Math.max(
        1,
        Math.round(
          heightRange *
            (state.map.width + state.map.height > 6 ? 0.6 : 0.35)
        )
      );

      for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
          const distance = Math.hypot(x - centerX, y - centerY);
          if (distance > radius) {
            continue;
          }
          const falloff = 1 - distance / radius;
          const index = y * state.map.width + x;
          const nextHeight = heights[index] + Math.round(amplitude * falloff);
          heights[index] = clampHeightValue(
            Math.min(maxHeight, Math.max(minHeight, nextHeight))
          );
        }
      }
    }
  }

  state.map.heights = heights;

  clearSelection();
  renderGrid();
  updateJsonPreview();
  pushUndoSnapshot(snapshot);
}

function setObjectsPaletteStatus(message, { isError = false } = {}) {
  if (!elements.objectsPaletteStatus) {
    return;
  }
  elements.objectsPaletteStatus.textContent = message;
  elements.objectsPaletteStatus.style.color = isError
    ? "rgba(248, 113, 113, 0.9)"
    : "";
}

function setSelectedObject(entry) {
  if (entry && typeof entry === "object") {
    const nextPath = typeof entry.path === "string" ? entry.path : "";
    const isSameSelection =
      Boolean(nextPath) && state.selectedObject?.path === nextPath;
    state.selectedObject = isSameSelection ? null : entry;
  } else {
    state.selectedObject = null;
  }
  renderObjectsPalette();
  if (landscapeViewer) {
    updateLandscapeViewer();
  }
}

function renderObjectsPalette() {
  if (!elements.objectsPalette) {
    return;
  }
  elements.objectsPalette.innerHTML = "";
  const entries = Array.isArray(state.objectManifest) ? state.objectManifest : [];
  if (!entries.length) {
    setObjectsPaletteStatus("No models listed in the manifest yet.", {
      isError: true,
    });
    if (elements.clearSelectedObjectButton) {
      elements.clearSelectedObjectButton.disabled = true;
    }
    return;
  }

  if (state.selectedObject?.path) {
    const selectedLabel =
      typeof state.selectedObject.label === "string" &&
      state.selectedObject.label.trim().length > 0
        ? state.selectedObject.label.trim()
        : state.selectedObject.path;
    setObjectsPaletteStatus(`Selected: ${selectedLabel}`);
  } else {
    setObjectsPaletteStatus("No model selected. Select one to place objects.");
  }

  if (elements.clearSelectedObjectButton) {
    elements.clearSelectedObjectButton.disabled = !state.selectedObject?.path;
  }

  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "object-card";
    button.dataset.active = String(state.selectedObject?.path === entry.path);
    button.dataset.modelPath = entry.path;

    const label = document.createElement("span");
    label.className = "object-card-label";
    label.textContent = entry.label || entry.path;

    const path = document.createElement("span");
    path.className = "object-card-path";
    path.textContent = entry.path;

    button.append(label, path);
    button.addEventListener("click", () => {
      setSelectedObject(entry);
    });
    fragment.appendChild(button);
  });
  elements.objectsPalette.appendChild(fragment);
}

async function loadObjectManifest() {
  setObjectsPaletteStatus("Loading model library…");
  try {
    const response = await fetch(OBJECT_MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Manifest request failed: ${response.status}`);
    }
    const data = await response.json();
    const entries = Array.isArray(data)
      ? data
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }
            const path = typeof entry.path === "string" ? entry.path : "";
            if (!path) {
              return null;
            }
            return {
              path,
              label: typeof entry.label === "string" ? entry.label : path,
            };
          })
          .filter(Boolean)
      : [];
    state.objectManifest = entries;
    if (
      state.selectedObject?.path &&
      !entries.some((entry) => entry.path === state.selectedObject.path)
    ) {
      state.selectedObject = null;
    }
    renderObjectsPalette();
  } catch (error) {
    console.error("Failed to load model manifest", error);
    setObjectsPaletteStatus(
      "Unable to load the model manifest. Check the models/manifest.json file.",
      { isError: true }
    );
  }
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(state.map, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const area = resolveMapArea(state.selectedAreaId);
  const fileName = `${state.map.name || area?.label || "outside-map"}.json`;
  anchor.download = fileName.replace(/[^a-z0-9-_]+/gi, "-");
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function copyJsonToClipboard() {
  try {
    await navigator.clipboard.writeText(
      JSON.stringify(state.map, null, 2)
    );
    elements.copyButton.textContent = "Copied";
    setTimeout(() => {
      elements.copyButton.textContent = "Copy JSON";
    }, 1500);
  } catch (error) {
    console.error("Failed to copy", error);
    elements.copyButton.textContent = "Copy failed";
    setTimeout(() => {
      elements.copyButton.textContent = "Copy JSON";
    }, 1500);
  }
}

function handleFileSelection(event) {
  const [file] = event.target.files ?? [];
  if (!file) {
    return;
  }
  file
    .text()
    .then((text) => JSON.parse(text))
    .then((map) => applyImportedMap(map))
    .catch((error) => {
      console.error("Failed to import map", error);
      alert("Unable to import the selected file. Ensure it is valid JSON.");
    })
    .finally(() => {
      event.target.value = "";
    });
}

function initControls() {
  renderPalette();
  renderGrid();
  updateMetadataDisplays();
  updateJsonPreview();
  state.areaMapCache.set(state.selectedAreaId, cloneMapDefinition(state.map));
  renderAreaList();
  populateTerrainTypeSelect();
  populateTerrainTileSelect();
  updateTerrainMenu();
  syncTerrainMenuButtons();
  syncTerrainRotationDisplay();
  syncTerrainBrushSizeDisplay();
  syncTerrainDrawVisibility();
  syncHeightModeButtons();
  syncHeightBrushSizeDisplay();
  syncHeightDrawVisibility();
  syncDoorModeButtons();
  syncHeightValueDisplay();
  setHeightVisibility(state.showHeights);
  updateDrawButtonsState();
  initPaletteTabs();
  loadObjectManifest();
  if (elements.clearSelectedObjectButton) {
    elements.clearSelectedObjectButton.addEventListener("click", () => {
      setSelectedObject(null);
    });
  }

  if (elements.saveLocalButton?.dataset) {
    elements.saveLocalButton.dataset.defaultLabel =
      elements.saveLocalButton.dataset.defaultLabel ||
      elements.saveLocalButton.textContent ||
      "Save locally";
  }

  if (elements.restoreLocalButton?.dataset) {
    elements.restoreLocalButton.dataset.defaultLabel =
      elements.restoreLocalButton.dataset.defaultLabel ||
      elements.restoreLocalButton.textContent ||
      "Load local save";
  }

  updateLocalSaveButtonsState();
  restoreMapFromLocalStorage({
    showAlertOnMissing: false,
    showFeedback: false,
    pushHistory: false,
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushAutoSave();
    }
  });
  window.addEventListener("beforeunload", () => {
    flushAutoSave();
  });

  elements.mapNameInput.addEventListener("input", (event) => {
    updateMapMetadata({ name: event.target.value });
  });
  elements.regionInput.addEventListener("input", (event) => {
    updateMapMetadata({ region: event.target.value });
  });
  elements.notesInput.addEventListener("input", (event) => {
    updateMapMetadata({ notes: event.target.value });
  });

  elements.resizeButton.addEventListener("click", () => {
    const width = Number.parseInt(elements.widthInput.value, 10);
    const height = Number.parseInt(elements.heightInput.value, 10);
    if (Number.isFinite(width) && Number.isFinite(height)) {
      resizeMap(width, height);
    }
  });

  if (elements.cellSizeRange) {
    elements.cellSizeRange.addEventListener("input", (event) => {
      document.documentElement.style.setProperty(
        "--cell-size",
        `${event.target.value}px`
      );
    });
  }

  if (elements.gridToggle && elements.mapGrid) {
    elements.gridToggle.addEventListener("change", (event) => {
      elements.mapGrid.dataset.showGrid = String(event.target.checked);
    });
  }

  if (elements.colorToggle && elements.mapGrid) {
    elements.colorToggle.addEventListener("change", (event) => {
      elements.mapGrid.dataset.showColors = String(event.target.checked);
    });
  }

  const defaultTextureState = elements.textureToggle?.checked ?? state.showTextures;
  setTextureVisibility(defaultTextureState);
  const defaultTileNumberState =
    elements.landscapeTileNumberToggle?.getAttribute("aria-pressed") !== "false";
  setTileNumberVisibility(defaultTileNumberState);
  syncTerrainMenuButtons();
  syncTerrainBrushVisibility();
  syncTerrainDrawVisibility();
  if (elements.textureToggle) {
    elements.textureToggle.addEventListener("change", (event) => {
      setTextureVisibility(event.target.checked);
    });
  }
  if (elements.landscapeTextureToggle) {
    elements.landscapeTextureToggle.addEventListener("click", () => {
      setTextureVisibility(!getTextureVisibility());
    });
  }
  if (elements.landscapeTileNumberToggle) {
    elements.landscapeTileNumberToggle.addEventListener("click", () => {
      setTileNumberVisibility(!getTileNumberVisibility());
    });
  }

  if (elements.terrainTypeSelect) {
    elements.terrainTypeSelect.addEventListener("change", (event) => {
      const nextTerrain = getTerrainById(event.target.value);
      if (nextTerrain) {
        setTerrain(nextTerrain);
      }
    });
  }

  if (elements.terrainTileSelect) {
    elements.terrainTileSelect.addEventListener("change", (event) => {
      state.selectedTerrainTileId = resolveTerrainTileId(
        event.target.value,
        state.selectedTerrainTypeId
      );
      renderPalette();
      updateTerrainMenu();
    });
  }

  if (elements.terrainModeButtons.length) {
    elements.terrainModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setTerrainMenu(button.dataset.terrainMode);
      });
    });
  }

  if (elements.terrainRotationButtons.length) {
    elements.terrainRotationButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const direction = button.dataset.rotation === "left" ? -90 : 90;
        rotateTerrain(direction);
      });
    });
  }

  if (elements.terrainBrushSize) {
    elements.terrainBrushSize.addEventListener("input", (event) => {
      setTerrainBrushSize(event.target.value);
    });
  }

  if (elements.terrainApplyButton) {
    elements.terrainApplyButton.addEventListener("click", (event) => {
      applyTerrainSelection({ erase: event.shiftKey });
    });
  }

  if (elements.terrainCancelButton) {
    elements.terrainCancelButton.addEventListener("click", () => {
      clearSelection();
    });
  }

  if (elements.heightModeButtons.length) {
    elements.heightModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setHeightMode(button.dataset.heightMode);
      });
    });
  }

  if (elements.doorModeButtons.length) {
    elements.doorModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setDoorMode(button.dataset.doorMode);
      });
    });
  }

  if (elements.heightBrushSize) {
    elements.heightBrushSize.addEventListener("input", (event) => {
      setHeightBrushSize(event.target.value);
    });
  }

  if (elements.heightValueInput) {
    elements.heightValueInput.addEventListener("input", (event) => {
      setHeightValue(event.target.value);
    });
  }

  if (elements.heightValueSlider) {
    elements.heightValueSlider.addEventListener("input", (event) => {
      setHeightValue(event.target.value);
    });
  }

  if (elements.heightPresetButtons.length) {
    elements.heightPresetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setHeightValue(button.dataset.heightPreset);
      });
    });
  }

  if (elements.heightApplyButton) {
    elements.heightApplyButton.addEventListener("click", () => {
      applyHeightSelection();
    });
  }

  if (elements.heightCancelButton) {
    elements.heightCancelButton.addEventListener("click", () => {
      clearSelection();
    });
  }

  if (elements.showHeightButton) {
    elements.showHeightButton.addEventListener("click", () => {
      setHeightVisibility(!state.showHeights);
    });
  }

  elements.importButton.addEventListener("click", () => {
    try {
      const map = JSON.parse(elements.importTextarea.value);
      void applyImportedMap(map);
    } catch (error) {
      console.error("Invalid JSON", error);
      alert("Paste a valid JSON map definition.");
    }
  });

  if (elements.generateButton) {
    elements.generateButton.addEventListener("click", () => {
      generateRandomMap();
    });
  }

  elements.resetButton.addEventListener("click", () => {
    if (confirm("Reset map to default layout?")) {
      resetMap();
    }
  });

  elements.copyButton.addEventListener("click", () => {
    copyJsonToClipboard();
  });

  elements.downloadButton.addEventListener("click", () => {
    downloadJson();
  });

  if (elements.saveLocalButton) {
    elements.saveLocalButton.addEventListener("click", () => {
      saveMapToLocalStorage();
    });
  }

  if (elements.restoreLocalButton) {
    elements.restoreLocalButton.addEventListener("click", () => {
      restoreMapFromLocalStorage({ showAlertOnMissing: true, showFeedback: true });
    });
  }

  elements.loadFileButton.addEventListener("click", () => {
    elements.fileInput.click();
  });

  elements.fileInput.addEventListener("change", handleFileSelection);

  if (elements.undoButton) {
    elements.undoButton.addEventListener("click", () => {
      undoLastChange();
    });
  }

  if (elements.redoButton) {
    elements.redoButton.addEventListener("click", () => {
      redoLastChange();
    });
  }

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const isEditableTarget =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA");

    if (
      !isEditableTarget &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey
    ) {
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoLastChange();
        } else {
          undoLastChange();
        }
      } else if (key === "y") {
        event.preventDefault();
        redoLastChange();
      }
    }

    if (event.key === "Escape") {
      if (state.activeTab === "height" && state.heightMode === "draw") {
        clearSelection();
        return;
      }
      if (state.activeTab === "height") {
        endHeightPaint();
        return;
      }
      if (state.activeTab === "terrain" && state.terrainMode === "draw") {
        clearSelection();
        return;
      }
      if (state.activeTab === "terrain") {
        endPointerPaint();
      }
    }
    if (event.code === "Space") {
      if (state.activeTab === "height" && state.heightMode === "draw") {
        event.preventDefault();
        applyHeightSelection();
        return;
      }
      if (state.activeTab === "terrain" && state.terrainMode === "draw") {
        event.preventDefault();
        applyTerrainSelection({ erase: event.shiftKey });
      }
    }
  });

  if (elements.mapGrid) {
    elements.mapGrid.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
  }

  updateUndoRedoButtons();
}

initControls();
