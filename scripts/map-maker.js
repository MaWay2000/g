import {
  OUTSIDE_TERRAIN_TYPES as TERRAIN_TYPES,
  OUTSIDE_MAP_LOCAL_STORAGE_KEY as LOCAL_STORAGE_KEY,
  clampOutsideMapDimension,
  getOutsideTerrainById as getTerrainById,
  getOutsideTerrainTexturePath,
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
  terrain: TERRAIN_TYPES[1],
  map: createDefaultOutsideMap(),
  isPointerDown: false,
  pointerTerrain: null,
};

const UNKNOWN_HP_LABEL = "Unknown";

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

function getTerrainTextureCssValue(terrainId, variantSeed = 0) {
  const texturePath = getOutsideTerrainTexturePath(terrainId, variantSeed);
  if (!texturePath) {
    return "none";
  }
  return `url("${texturePath}")`;
}

const VOID_TERRAIN_ID = TERRAIN_TYPES[0]?.id ?? "void";
const RANDOM_TERRAIN_POOL = TERRAIN_TYPES.filter(
  (terrain) => terrain.id !== VOID_TERRAIN_ID
);

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
  landscapeWireframeButton: document.getElementById("landscapeWireframeButton"),
  landscapeResetButton: document.getElementById("landscapeResetButton"),
  landscapeTypeToggle: document.getElementById("landscapeTypeToggle"),
  landscapeTextureToggle: document.getElementById("landscapeTextureToggle"),
};

let landscapeViewer = null;

function updateLandscapeViewer() {
  if (!landscapeViewer) {
    return;
  }
  landscapeViewer.updateMap(state.map);
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
  state.terrain = terrain;
  renderPalette();
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
  elements.mapNameDisplay.textContent = state.map.name || "Untitled";
  elements.mapRegionDisplay.textContent = state.map.region || "—";
  elements.mapSizeDisplay.textContent = `${state.map.width} × ${state.map.height}`;
  elements.mapNameInput.value = state.map.name;
  elements.regionInput.value = state.map.region;
  elements.notesInput.value = state.map.notes;
  elements.widthInput.value = state.map.width;
  elements.heightInput.value = state.map.height;
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
        return state.map.cells[y * state.map.width + x];
      }
      return TERRAIN_TYPES[0].id;
    }
  );

  state.map.width = clampedWidth;
  state.map.height = clampedHeight;
  state.map.cells = newCells;
  updateMetadataDisplays();
  renderGrid();
  updateJsonPreview();
}

function renderPalette() {
  elements.palette.innerHTML = "";
  for (const terrain of TERRAIN_TYPES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "terrain-button";
    button.dataset.active = String(state.terrain.id === terrain.id);
    const textureCss = getTerrainTextureCssValue(terrain.id);
    const elementLabel = formatTerrainElement(terrain);
    const hpLabel = formatTerrainHp(terrain);
    const details = [terrain.description];
    if (hpLabel !== UNKNOWN_HP_LABEL) {
      details.push(`HP: ${hpLabel}`);
    }
    if (elementLabel) {
      details.push(`Element: ${elementLabel}`);
    }
    button.innerHTML = `
      <span class="terrain-swatch" style="background:${terrain.color};background-image:${textureCss}"></span>
      <span>
        <strong>${terrain.label}</strong><br />
        <small>${details.join(" · ")}</small>
      </span>
    `;
    button.addEventListener("click", () => setTerrain(terrain));
    elements.palette.appendChild(button);
  }
}

function renderGrid() {
  elements.mapGrid.style.setProperty("--width", state.map.width);
  elements.mapGrid.style.setProperty("--height", state.map.height);
  elements.mapGrid.innerHTML = "";

  for (let index = 0; index < state.map.cells.length; index += 1) {
    const terrainId = state.map.cells[index];
    const terrain = getTerrainById(terrainId);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "map-cell";
    cell.dataset.index = index;
    cell.dataset.terrain = terrain.id;
    cell.style.setProperty("--cell-color", terrain.color ?? "transparent");
    cell.style.setProperty(
      "--cell-texture",
      getTerrainTextureCssValue(terrain.id, index)
    );
    const ariaParts = [`Cell ${index + 1}`, terrain.label];
    const hpLabel = formatTerrainHp(terrain);
    if (hpLabel !== UNKNOWN_HP_LABEL) {
      ariaParts.push(`HP ${hpLabel}`);
    }
    const elementLabel = formatTerrainElement(terrain);
    if (elementLabel) {
      ariaParts.push(`Element ${elementLabel}`);
    }
    cell.setAttribute("aria-label", ariaParts.join(", "));
    cell.addEventListener("pointerdown", handleCellPointerDown);
    cell.addEventListener("pointerenter", handleCellPointerEnter);
    cell.addEventListener("click", (event) => event.preventDefault());
    elements.mapGrid.appendChild(cell);
  }

  updateLandscapeViewer();
}

function paintCell(index, terrainId) {
  if (index < 0 || index >= state.map.cells.length) {
    return;
  }
  if (state.map.cells[index] === terrainId) {
    return;
  }

  state.map.cells[index] = terrainId;
  const cell = elements.mapGrid.querySelector(
    `.map-cell[data-index="${index}"]`
  );
  if (cell) {
    const terrain = getTerrainById(terrainId);
    cell.dataset.terrain = terrain.id;
    cell.style.setProperty("--cell-color", terrain.color ?? "transparent");
    cell.style.setProperty(
      "--cell-texture",
      getTerrainTextureCssValue(terrain.id, index)
    );
    const ariaParts = [`Cell ${index + 1}`, terrain.label];
    const hpLabel = formatTerrainHp(terrain);
    if (hpLabel !== UNKNOWN_HP_LABEL) {
      ariaParts.push(`HP ${hpLabel}`);
    }
    const elementLabel = formatTerrainElement(terrain);
    if (elementLabel) {
      ariaParts.push(`Element ${elementLabel}`);
    }
    cell.setAttribute("aria-label", ariaParts.join(", "));
  }
  updateJsonPreview();
  updateLandscapeViewer();
}

function handleCellPointerDown(event) {
  event.preventDefault();
  const cell = event.currentTarget;
  const index = Number.parseInt(cell.dataset.index, 10);
  const erase = event.shiftKey;
  const terrainId = erase ? TERRAIN_TYPES[0].id : state.terrain.id;
  state.isPointerDown = true;
  state.pointerTerrain = terrainId;
  paintCell(index, terrainId);
  window.addEventListener("pointerup", handlePointerUp, { once: true });
}

function handleCellPointerEnter(event) {
  if (!state.isPointerDown) {
    return;
  }
  const cell = event.currentTarget;
  const index = Number.parseInt(cell.dataset.index, 10);
  paintCell(index, state.pointerTerrain);
}

function handlePointerUp() {
  state.isPointerDown = false;
  state.pointerTerrain = null;
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
    const isActive =
      panel.dataset.mapMakerMain === (tabId === "landshaft" ? "landshaft" : "terrain");
    panel.classList.toggle("is-active", isActive);
  });

  if (tabId === "landshaft") {
    if (!landscapeViewer) {
      landscapeViewer = initMapMaker3d({
        canvas: elements.landscapeViewport,
        errorElement: elements.landscapeError,
        wireframeButton: elements.landscapeWireframeButton,
        resetButton: elements.landscapeResetButton,
        terrainTypeToggle: elements.landscapeTypeToggle,
      });
    }
    updateLandscapeViewer();
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

  updateMetadataDisplays();
  renderGrid();
  updateJsonPreview();
}

function resetMap() {
  state.map = createDefaultOutsideMap();
  setTerrain(TERRAIN_TYPES[1]);
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
    return pool[randomIndex].id;
  });

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

  elements.cellSizeRange.addEventListener("input", (event) => {
    document.documentElement.style.setProperty(
      "--cell-size",
      `${event.target.value}px`
    );
  });

  elements.gridToggle.addEventListener("change", (event) => {
    elements.mapGrid.dataset.showGrid = String(event.target.checked);
  });

  elements.colorToggle.addEventListener("change", (event) => {
    elements.mapGrid.dataset.showColors = String(event.target.checked);
  });

  const defaultTextureState =
    elements.textureToggle?.checked ??
    elements.mapGrid.dataset.showTextures !== "false";
  elements.mapGrid.dataset.showTextures = String(defaultTextureState);
  syncTextureToggleLabel(defaultTextureState);
  if (elements.textureToggle) {
    elements.textureToggle.addEventListener("change", (event) => {
      const nextValue = event.target.checked;
      elements.mapGrid.dataset.showTextures = String(nextValue);
      syncTextureToggleLabel(nextValue);
    });
  }
  if (elements.landscapeTextureToggle) {
    elements.landscapeTextureToggle.addEventListener("click", () => {
      const nextValue = elements.mapGrid.dataset.showTextures === "false";
      elements.mapGrid.dataset.showTextures = String(nextValue);
      syncTextureToggleLabel(nextValue);
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
      state.isPointerDown = false;
      state.pointerTerrain = null;
    }
  });

  elements.mapGrid.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
}

initControls();
