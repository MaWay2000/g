const TERRAIN_TYPES = [
  {
    id: "void",
    label: "Void",
    description: "Unusable space. Treated as off-map.",
    color: "transparent",
  },
  {
    id: "path",
    label: "Packed Trail",
    description: "Primary traversal route for vehicles or foot traffic.",
    color: "#eab308",
  },
  {
    id: "grass",
    label: "Wild Grass",
    description: "Open exploration space with light vegetation.",
    color: "#4ade80",
  },
  {
    id: "rock",
    label: "Rock Plate",
    description: "Impassable rocky terrain or structures.",
    color: "#94a3b8",
  },
  {
    id: "water",
    label: "Water",
    description: "Bodies of water, rivers, or flood zones.",
    color: "#60a5fa",
  },
  {
    id: "hazard",
    label: "Hazard",
    description: "High-risk area that requires protection to traverse.",
    color: "#f87171",
  },
  {
    id: "point",
    label: "Point of Interest",
    description: "Interactive or narrative focal point.",
    color: "#f472b6",
  },
];

const DEFAULT_MAP = {
  name: "outside-yard",
  region: "perimeter",
  notes: "",
  width: 16,
  height: 12,
  cells: Array.from({ length: 16 * 12 }, () => "grass"),
};

const clone = (value) => {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const state = {
  terrain: TERRAIN_TYPES[1],
  map: clone(DEFAULT_MAP),
  isPointerDown: false,
  pointerTerrain: null,
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
  cellSizeRange: document.getElementById("cellSizeRange"),
  mapNameDisplay: document.getElementById("mapNameDisplay"),
  mapRegionDisplay: document.getElementById("mapRegionDisplay"),
  mapSizeDisplay: document.getElementById("mapSizeDisplay"),
  importTextarea: document.getElementById("importTextarea"),
  importButton: document.getElementById("importButton"),
  resetButton: document.getElementById("resetButton"),
  copyButton: document.getElementById("copyButton"),
  downloadButton: document.getElementById("downloadButton"),
  fileInput: document.getElementById("fileInput"),
  loadFileButton: document.getElementById("loadFileButton"),
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTerrainById(id) {
  return TERRAIN_TYPES.find((terrain) => terrain.id === id) ?? TERRAIN_TYPES[0];
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
  const clampedWidth = clamp(Math.floor(width), 1, 200);
  const clampedHeight = clamp(Math.floor(height), 1, 200);
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
    button.innerHTML = `
      <span class="terrain-swatch" style="background:${terrain.color}"></span>
      <span>
        <strong>${terrain.label}</strong><br />
        <small>${terrain.description}</small>
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
    cell.style.setProperty("--cell-color", terrain.color);
    cell.setAttribute("aria-label", `Cell ${index + 1}, ${terrain.label}`);
    cell.addEventListener("pointerdown", handleCellPointerDown);
    cell.addEventListener("pointerenter", handleCellPointerEnter);
    cell.addEventListener("click", (event) => event.preventDefault());
    elements.mapGrid.appendChild(cell);
  }
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
    cell.style.setProperty("--cell-color", terrain.color);
    cell.setAttribute("aria-label", `Cell ${index + 1}, ${terrain.label}`);
  }
  updateJsonPreview();
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

function applyImportedMap(mapDefinition) {
  if (!mapDefinition || typeof mapDefinition !== "object") {
    throw new Error("Invalid map definition");
  }
  const width = clamp(Number.parseInt(mapDefinition.width, 10), 1, 200);
  const height = clamp(Number.parseInt(mapDefinition.height, 10), 1, 200);
  const cells = Array.isArray(mapDefinition.cells)
    ? mapDefinition.cells.slice(0, width * height).map((value) => {
        const terrain = getTerrainById(String(value));
        return terrain.id;
      })
    : [];

  if (cells.length < width * height) {
    const missing = width * height - cells.length;
    cells.push(...Array.from({ length: missing }, () => TERRAIN_TYPES[0].id));
  }

  state.map = {
    name: String(mapDefinition.name ?? ""),
    region: String(mapDefinition.region ?? ""),
    notes: String(mapDefinition.notes ?? ""),
    width,
    height,
    cells,
  };

  updateMetadataDisplays();
  renderGrid();
  updateJsonPreview();
}

function resetMap() {
  state.map = clone(DEFAULT_MAP);
  setTerrain(TERRAIN_TYPES[1]);
  updateMetadataDisplays();
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

  elements.importButton.addEventListener("click", () => {
    try {
      const map = JSON.parse(elements.importTextarea.value);
      applyImportedMap(map);
    } catch (error) {
      console.error("Invalid JSON", error);
      alert("Paste a valid JSON map definition.");
    }
  });

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
