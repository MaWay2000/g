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
  saveOutsideMapToStorage,
} from "./outside-map.js";
import { initMapMaker3d } from "./map-maker-3d.js";

let cachedLocalStorage;
const localSaveFeedbackTimers = {
  save: null,
  restore: null,
};

const state = {
  selectedTerrainTypeId: TERRAIN_TYPES[1]?.id ?? TERRAIN_TYPES[0]?.id ?? "void",
  selectedTerrainTileId: getOutsideTerrainDefaultTileId(
    TERRAIN_TYPES[1]?.id ?? TERRAIN_TYPES[0]?.id ?? "void"
  ),
  map: createDefaultOutsideMap(),
  isPointerDown: false,
  pointerTerrainTypeId: null,
  pointerTerrainTileId: null,
  terrainMenu: null,
  terrainMode: null,
  terrainRotation: 0,
  terrainBrushSize: 1,
  showTextures: true,
  selectionStart: null,
  selectionEnd: null,
  selectionFixed: false,
  isSelectionPointerDown: false,
};

const UNKNOWN_HP_LABEL = "Unknown";
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

const elements = {
  palette: document.getElementById("terrainPalette"),
  mapGrid: document.getElementById("mapGrid"),
  jsonPreview: document.getElementById("jsonPreview"),
  mapNameInput: document.getElementById("mapNameInput"),
  regionInput: document.getElementById("regionInput"),
  notesInput: document.getElementById("mapNotesInput"),
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
};

let landscapeViewer = null;

function updateLandscapeViewer() {
  if (!landscapeViewer) {
    return;
  }
  const normalized = normalizeOutsideMap(state.map);
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
  return true;
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

function getLocalStorage() {
  if (cachedLocalStorage !== undefined) {
    return cachedLocalStorage;
  }
  cachedLocalStorage = tryGetOutsideMapStorage();
  return cachedLocalStorage;
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

  if (hasStorage) {
    try {
      hasSavedMap = Boolean(storage.getItem(LOCAL_STORAGE_KEY));
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

function saveMapToLocalStorage() {
  const storage = getLocalStorage();
  if (!storage) {
    alert(
      "Local saving is unavailable in this browser. Try a different browser or enable storage permissions."
    );
    return false;
  }
  try {
    saveOutsideMapToStorage(state.map, storage);
  } catch (error) {
    console.error("Failed to save map locally", error);
    alert("Unable to save the map locally. Check storage permissions or space.");
    updateLocalSaveButtonsState();
    return false;
  }

  setTemporaryButtonLabel(elements.saveLocalButton, "Saved", "save");
  updateLocalSaveButtonsState();
  return true;
}

function restoreMapFromLocalStorage({
  showAlertOnMissing = true,
  showFeedback = true,
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

  let serialized = null;
  try {
    serialized = storage.getItem(LOCAL_STORAGE_KEY);
  } catch (error) {
    console.error("Unable to read saved map", error);
    if (showAlertOnMissing) {
      alert("Unable to access the saved map. Storage may be restricted.");
    }
    updateLocalSaveButtonsState();
    return false;
  }

  if (!serialized) {
    if (showAlertOnMissing) {
      alert("No saved map found. Save a map locally first.");
    }
    updateLocalSaveButtonsState();
    return false;
  }

  try {
    const parsed = JSON.parse(serialized);
    applyImportedMap(parsed);
  } catch (error) {
    console.error("Saved map is invalid", error);
    storage.removeItem(LOCAL_STORAGE_KEY);
    if (showAlertOnMissing) {
      alert("Unable to load the saved map. The data may be corrupted.");
    }
    updateLocalSaveButtonsState();
    return false;
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
  if (elements.terrainApplyButton) {
    elements.terrainApplyButton.disabled = !hasSelection;
  }
  if (elements.terrainCancelButton) {
    elements.terrainCancelButton.disabled = !hasSelection;
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

  state.map.width = clampedWidth;
  state.map.height = clampedHeight;
  state.map.cells = newCells;
  clearSelection();
  updateMetadataDisplays();
  renderGrid();
  updateJsonPreview();
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
    button.innerHTML = `
      <span class="terrain-swatch" style="background:${terrain.color};background-image:${textureCss}"></span>
      <span>
        <strong>${terrain.label}</strong><br />
        <small>${details.join(" · ")} · ${tileLabel}</small>
      </span>
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
  return ariaParts.join(", ");
}

function renderGrid() {
  if (!elements.mapGrid) {
    updateLandscapeViewer();
    return;
  }

  elements.mapGrid.style.setProperty("--width", state.map.width);
  elements.mapGrid.style.setProperty("--height", state.map.height);
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
  cell.setAttribute("aria-label", buildCellAriaLabel(index, terrain, tileId));
}

function applyTerrainSelection({ erase = false } = {}) {
  if (
    !Number.isFinite(state.selectionStart) ||
    !Number.isFinite(state.selectionEnd)
  ) {
    return;
  }

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

function endPointerPaint() {
  state.isPointerDown = false;
  state.pointerTerrainTypeId = null;
  state.pointerTerrainTileId = null;
}

function handleCellPointerDown(event) {
  event.preventDefault();
  if (event.button !== 0) {
    return;
  }
  const cell = event.currentTarget;
  const index = Number.parseInt(cell.dataset.index, 10);
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
  const cell = event.currentTarget;
  const index = Number.parseInt(cell.dataset.index, 10);
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
}

function setActivePaletteTab(tabId) {
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

  if (tabId === "landshaft" || tabId === "terrain" || tabId === "objects") {
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
        getBrushSize: () => state.terrainBrushSize,
        getTerrainMode: () => state.terrainMode,
        onPaintCell: ({ index, isStart, shiftKey }) => {
          if (!Number.isFinite(index)) {
            return;
          }
          if (isStart) {
            if (state.terrainMode === "draw") {
              updateSelection(index, { isStart: true });
            } else {
              beginPointerPaint(Boolean(shiftKey));
            }
          }
          if (state.terrainMode === "draw") {
            updateSelection(index);
          } else {
            applyPointerPaint(index);
          }
        },
        onPaintEnd: () => {
          if (state.terrainMode === "draw") {
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

function applyImportedMap(mapDefinition) {
  const normalized = normalizeOutsideMap(mapDefinition);

  state.map = normalized;
  clearSelection();

  updateMetadataDisplays();
  renderGrid();
  updateJsonPreview();
}

function resetMap() {
  state.map = createDefaultOutsideMap();
  setTerrain(TERRAIN_TYPES[1]);
  clearSelection();
  updateMetadataDisplays();
  renderGrid();
  updateJsonPreview();
}

function generateRandomMap() {
  const pool = RANDOM_TERRAIN_POOL.length > 0 ? RANDOM_TERRAIN_POOL : TERRAIN_TYPES;
  if (pool.length === 0) {
    return;
  }

  state.map.cells = state.map.cells.map(() => {
    const randomIndex = Math.floor(Math.random() * pool.length);
    const terrainId = pool[randomIndex].id;
    return {
      terrainId,
      tileId: getOutsideTerrainDefaultTileId(terrainId),
    };
  });

  clearSelection();
  renderGrid();
  updateJsonPreview();
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(state.map, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const fileName = `${state.map.name || "outside-map"}.json`;
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
  populateTerrainTypeSelect();
  populateTerrainTileSelect();
  updateTerrainMenu();
  syncTerrainMenuButtons();
  syncTerrainRotationDisplay();
  syncTerrainBrushSizeDisplay();
  syncTerrainDrawVisibility();
  updateDrawButtonsState();
  initPaletteTabs();

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

  elements.importButton.addEventListener("click", () => {
    try {
      const map = JSON.parse(elements.importTextarea.value);
      applyImportedMap(map);
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

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.terrainMode === "draw") {
        clearSelection();
        return;
      }
      endPointerPaint();
    }
    if (event.code === "Space") {
      if (state.terrainMode === "draw") {
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
}

initControls();
