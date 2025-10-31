import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/MTLLoader.js";
import { FBXLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/FBXLoader.js";
import { STLLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/STLLoader.js";
import { GLTFExporter } from "https://unpkg.com/three@0.160.0/examples/jsm/exporters/GLTFExporter.js";

const canvas = document.getElementById("editorCanvas");
const dropZone = document.querySelector("[data-dropzone]");
const fileInput = document.querySelector("[data-file-input]");
const sampleSelect = document.querySelector("[data-sample-select]");
const resetButton = document.querySelector("[data-reset-scene]");
const transformButtonsContainer = document.querySelector("[data-transform-buttons]");
const primitiveContainer = document.querySelector("[data-create-primitive-container]");
const colorPicker = document.querySelector("[data-color-picker]");
const colorInput = document.querySelector("[data-color-input]");
const metalnessInput = document.querySelector("[data-metalness-input]");
const roughnessInput = document.querySelector("[data-roughness-input]");
const texturePackSelect = document.querySelector("[data-texture-pack-select]");
const textureGrid = document.querySelector("[data-texture-grid]");
const saveSessionButton = document.querySelector("[data-save-session]");
const restoreSessionButton = document.querySelector("[data-restore-session]");
const clearSessionButton = document.querySelector("[data-clear-session]");
const exportButton = document.querySelector("[data-export-gltf]");
const statusBadge = document.querySelector("[data-status-badge]");
const hudModel = document.querySelector("[data-hud-model]");
const hudInfo = document.querySelector("[data-hud-info]");
const panelButtons = Array.from(
  document.querySelectorAll("[data-panel-target]")
);
const panelSections = Array.from(document.querySelectorAll("[data-panel]"));
const figureIdInput = document.querySelector("[data-figure-id-input]");
const centerInputs = {
  x: document.querySelector('[data-center-input="x"]'),
  y: document.querySelector('[data-center-input="y"]'),
  z: document.querySelector('[data-center-input="z"]'),
};
const sizeInputs = {
  x: document.querySelector('[data-size-input="x"]'),
  y: document.querySelector('[data-size-input="y"]'),
  z: document.querySelector('[data-size-input="z"]'),
};
const motionToggle = document.querySelector("[data-motion-enabled]");
const motionSpeedInput = document.querySelector("[data-motion-speed]");
const motionSpeedValueLabel = document.querySelector("[data-motion-speed-value]");
const motionAxisInputs = {
  x: document.querySelector('[data-motion-axis="x"]'),
  y: document.querySelector('[data-motion-axis="y"]'),
  z: document.querySelector('[data-motion-axis="z"]'),
};
const motionStatusLabel = document.querySelector("[data-motion-status]");
const motionControlGroups = Array.from(
  document.querySelectorAll("[data-motion-controls]")
);
const clockDisplay = document.querySelector("[data-clock-display]");
const hudEditor = document.querySelector("[data-hud-editor]");
const hudFigureIdInput = hudEditor?.querySelector("[data-hud-figure-id]");
const hudCenterInputs = {
  x: hudEditor?.querySelector('[data-hud-center-input="x"]'),
  y: hudEditor?.querySelector('[data-hud-center-input="y"]'),
  z: hudEditor?.querySelector('[data-hud-center-input="z"]'),
};
const hudSizeInputs = {
  x: hudEditor?.querySelector('[data-hud-size-input="x"]'),
  y: hudEditor?.querySelector('[data-hud-size-input="y"]'),
  z: hudEditor?.querySelector('[data-hud-size-input="z"]'),
};

const partsPanel = document.querySelector("[data-parts-panel]");
const partsListElement = document.querySelector("[data-parts-list]");
const partsEmptyState = document.querySelector("[data-parts-empty]");
const partsCountLabel = document.querySelector("[data-parts-count]");

const inspectorControlSet = {
  figureIdInput,
  centerInputs,
  sizeInputs,
};

const hudControlSet = {
  figureIdInput: hudFigureIdInput,
  centerInputs: hudCenterInputs,
  sizeInputs: hudSizeInputs,
  container: hudEditor,
  hideWhenDisabled: true,
};

const MOTION_DEFAULT_SPEED = 45;
const MOTION_DEFAULT_AXES = { x: false, y: true, z: false };

if (clockDisplay) {
  const clockFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const updateClockReadout = () => {
    clockDisplay.textContent = clockFormatter.format(new Date());
  };
  updateClockReadout();
  setInterval(updateClockReadout, 1000);
}

const SAMPLE_MODELS_ENDPOINT = "models/manifest.json";

const PLAYER_HEIGHT_REFERENCE_MARKS = [
  { height: 1.6, label: "1.60 m" },
  { height: 1.8, label: "Player 1.80 m", accent: true },
  { height: 2.0, label: "2.00 m" },
];

const defaultSampleModels = sampleSelect
  ? Array.from(sampleSelect.querySelectorAll("option"))
      .filter((option) => option.value)
      .map((option) => ({
        value: option.value,
        label: option.textContent?.trim() ?? option.value,
      }))
  : [];

let activePanelId =
  panelButtons.find((button) => button.dataset.active === "true")?.dataset
    .panelTarget ?? panelButtons[0]?.dataset.panelTarget ?? null;

if (!activePanelId && panelSections[0]) {
  activePanelId = panelSections[0].id;
}

function updatePanelVisibility({ focusActive = false } = {}) {
  panelButtons.forEach((button) => {
    const isActive = button.dataset.panelTarget === activePanelId;
    button.dataset.active = String(isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.setAttribute("tabindex", isActive ? "0" : "-1");
    if (isActive && focusActive) {
      button.focus();
    }
  });

  panelSections.forEach((section) => {
    const isActive = section.id === activePanelId;
    section.dataset.active = String(isActive);
    section.setAttribute("aria-hidden", isActive ? "false" : "true");
  });
}

function setActivePanel(panelId, options = {}) {
  if (!panelId || panelId === activePanelId) {
    return;
  }

  activePanelId = panelId;
  updatePanelVisibility(options);
}

function focusAdjacentPanel(offset) {
  if (!panelButtons.length) {
    return;
  }

  const currentIndex = panelButtons.findIndex(
    (button) => button.dataset.panelTarget === activePanelId
  );
  const fallbackIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex =
    (fallbackIndex + offset + panelButtons.length) % panelButtons.length;
  const nextButton = panelButtons[nextIndex];
  if (nextButton) {
    setActivePanel(nextButton.dataset.panelTarget, { focusActive: true });
  }
}

panelButtons.forEach((button) => {
  button.setAttribute(
    "aria-selected",
    button.dataset.active === "true" ? "true" : "false"
  );
  button.setAttribute("tabindex", button.dataset.active === "true" ? "0" : "-1");
  button.addEventListener("click", () => {
    setActivePanel(button.dataset.panelTarget, { focusActive: false });
  });

  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusAdjacentPanel(-1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusAdjacentPanel(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const firstButton = panelButtons[0];
      if (firstButton) {
        setActivePanel(firstButton.dataset.panelTarget, { focusActive: true });
      }
    } else if (event.key === "End") {
      event.preventDefault();
      const lastButton = panelButtons[panelButtons.length - 1];
      if (lastButton) {
        setActivePanel(lastButton.dataset.panelTarget, { focusActive: true });
      }
    } else if (
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "Spacebar" ||
      event.key === "Space"
    ) {
      event.preventDefault();
      setActivePanel(button.dataset.panelTarget, { focusActive: false });
    }
  });
});

updatePanelVisibility();

function resolveSampleModelPath(path) {
  if (!path) {
    return "";
  }

  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return trimmed;
  }

  if (trimmed.startsWith("models/")) {
    return trimmed;
  }

  return `models/${trimmed}`;
}

function deriveSampleModelLabel(path, providedLabel) {
  if (providedLabel && providedLabel.trim()) {
    return providedLabel.trim();
  }

  const fileName = path.split("/").pop() ?? path;
  const extensionIndex = fileName.lastIndexOf(".");
  const baseName =
    extensionIndex >= 0 ? fileName.slice(0, extensionIndex) : fileName;
  const extension =
    extensionIndex >= 0 ? fileName.slice(extensionIndex + 1) : "";

  const formattedBase = baseName
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const labelBase = formattedBase || baseName || "Model";
  const extensionLabel = extension ? ` (${extension.toUpperCase()})` : "";
  return `${labelBase}${extensionLabel}`;
}

function normalizeSampleManifestEntry(entry) {
  if (typeof entry === "string") {
    return { path: entry, label: null };
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const path =
    typeof entry.path === "string"
      ? entry.path
      : typeof entry.value === "string"
      ? entry.value
      : typeof entry.url === "string"
      ? entry.url
      : "";
  const label =
    typeof entry.label === "string"
      ? entry.label
      : typeof entry.name === "string"
      ? entry.name
      : null;

  return { path, label };
}

async function initializeSampleModels() {
  if (!sampleSelect) {
    return;
  }

  const placeholderTemplate =
    sampleSelect.querySelector('option[value=""]') ?? null;
  const placeholderLabel =
    placeholderTemplate?.textContent?.trim() ?? "Load a sample model…";

  sampleSelect.innerHTML = "";
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.selected = true;
  placeholderOption.textContent = placeholderLabel;
  sampleSelect.append(placeholderOption);

  const appendOptions = (options) => {
    const seenValues = new Set();
    options.forEach((option) => {
      const value = option?.value;
      if (!value || seenValues.has(value)) {
        return;
      }

      seenValues.add(value);
      const label = option.label ?? value;
      const optionElement = document.createElement("option");
      optionElement.value = value;
      optionElement.textContent = label;
      sampleSelect.append(optionElement);
    });
  };

  try {
    const response = await fetch(SAMPLE_MODELS_ENDPOINT, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const manifest = await response.json();
    if (!Array.isArray(manifest)) {
      throw new Error("Manifest is not an array");
    }

    const parsedOptions = manifest
      .map((entry) => normalizeSampleManifestEntry(entry))
      .filter((entry) => entry && entry.path)
      .map((entry) => {
        const resolvedPath = resolveSampleModelPath(entry.path);
        if (!resolvedPath) {
          return null;
        }

        return {
          value: resolvedPath,
          label: deriveSampleModelLabel(resolvedPath, entry.label ?? null),
        };
      })
      .filter((entry) => entry);

    if (!parsedOptions.length) {
      throw new Error("Manifest did not contain any valid models");
    }

    appendOptions(parsedOptions);
  } catch (error) {
    console.error("Failed to load sample models manifest", error);
    appendOptions(defaultSampleModels);
  }
}

initializeSampleModels();

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const clock = new THREE.Clock();

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1120");

const sceneRoot = new THREE.Group();
sceneRoot.name = "EditableScene";
scene.add(sceneRoot);

const animatedObjects = new Map();

const helperRoot = new THREE.Group();
helperRoot.name = "SceneHelpers";
scene.add(helperRoot);

const playerHeightMarkers = createPlayerHeightMarkers();
playerHeightMarkers.position.set(-2.6, 0, -0.6);
playerHeightMarkers.userData.isHelper = true;
helperRoot.add(playerHeightMarkers);

const figureIdRegistry = new Map();
let nextFigureId = 1;

const textureLoader = new THREE.TextureLoader();
THREE.Cache.enabled = true;
const texturePackRegistry = new Map();
let texturePackList = [];
let textureControlsInitialized = false;
let texturesInitializationPromise = null;
let textureGridRenderToken = 0;
let activeTextureApplicationToken = 0;
const textureCache = new Map();

const TEXTURE_PACKS_ENDPOINT = "images/textures/packs.json";
const TEXTURE_MANIFEST_FILENAME = "textures.txt";
const DEFAULT_TEXTURE_EXTENSION = ".png";
const TEXTURE_PREVIEW_PRIORITY = [
  "baseColor",
  "ORM",
  "metallicRoughness",
  "normal",
  "occlusion",
  "displacement",
  "emissive",
];

const MAP_TYPE_CONFIG = {
  baseColor: {
    properties: ["map"],
    colorSpace: THREE.SRGBColorSpace,
  },
  metallicRoughness: {
    properties: ["metalnessMap", "roughnessMap"],
    colorSpace: THREE.LinearSRGBColorSpace,
  },
  normal: {
    properties: ["normalMap"],
    colorSpace: THREE.LinearSRGBColorSpace,
  },
  occlusion: {
    properties: ["aoMap"],
    colorSpace: THREE.LinearSRGBColorSpace,
  },
  displacement: {
    properties: ["displacementMap"],
    colorSpace: THREE.LinearSRGBColorSpace,
    defaults: {
      displacementScale: 0.05,
      displacementBias: 0,
    },
  },
  emissive: {
    properties: ["emissiveMap"],
    colorSpace: THREE.SRGBColorSpace,
  },
  ORM: {
    properties: ["aoMap", "roughnessMap", "metalnessMap"],
    colorSpace: THREE.LinearSRGBColorSpace,
  },
};

const textureState = {
  activePackId: null,
  activeTextureId: null,
};

function createTextSprite(
  text,
  {
    background = "rgba(15, 23, 42, 0.82)",
    color = "#e2e8f0",
    borderColor = "rgba(148, 163, 184, 0.5)",
    fontSize = 36,
    padding = 8,
    scale = 0.18,
  } = {}
) {
  const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
  const fontFamily = '"Inter", "Segoe UI", sans-serif';
  const fontWeight = 600;
  const fontDeclaration = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const tempCanvas = document.createElement("canvas");
  const tempContext = tempCanvas.getContext("2d");
  if (!tempContext) {
    return null;
  }

  tempContext.font = fontDeclaration;
  const textMetrics = tempContext.measureText(text);
  const textWidth = textMetrics.width;
  const baseWidth = Math.ceil(textWidth + padding * 2);
  const baseHeight = Math.ceil(fontSize + padding * 2);

  const canvas = document.createElement("canvas");
  canvas.width = baseWidth * ratio;
  canvas.height = baseHeight * ratio;

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.scale(ratio, ratio);
  context.font = fontDeclaration;
  context.textBaseline = "middle";
  context.textAlign = "center";

  const drawWidth = baseWidth;
  const drawHeight = baseHeight;
  const radius = Math.min(padding * 1.5, 12);

  context.fillStyle = background;
  if (typeof context.roundRect === "function") {
    context.beginPath();
    context.roundRect(0, 0, drawWidth, drawHeight, radius);
    context.fill();
    if (borderColor) {
      context.strokeStyle = borderColor;
      context.lineWidth = 1;
      context.stroke();
    }
  } else {
    context.fillRect(0, 0, drawWidth, drawHeight);
    if (borderColor) {
      context.strokeStyle = borderColor;
      context.lineWidth = 1;
      context.strokeRect(0.5, 0.5, drawWidth - 1, drawHeight - 1);
    }
  }

  context.fillStyle = color;
  context.fillText(text, drawWidth / 2, drawHeight / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  const aspect = drawWidth / drawHeight;
  sprite.scale.set(scale * aspect, scale, 1);
  sprite.renderOrder = 5;
  return sprite;
}

function createPlayerHeightMarkers({
  totalHeight = 2.2,
  tickSpacing = 0.1,
  majorTickSpacing = 0.5,
  referenceMarks = PLAYER_HEIGHT_REFERENCE_MARKS,
} = {}) {
  const group = new THREE.Group();
  group.name = "PlayerHeightMarkers";

  const mainMaterial = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.75,
    depthTest: false,
    depthWrite: false,
  });

  const minorMaterial = new THREE.LineBasicMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.45,
    depthTest: false,
    depthWrite: false,
  });

  const highlightMaterial = new THREE.LineBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false,
  });

  const verticalGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, totalHeight, 0),
  ]);
  const verticalLine = new THREE.Line(verticalGeometry, mainMaterial);
  verticalLine.renderOrder = 3;
  group.add(verticalLine);

  const baseGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.25, 0, 0),
    new THREE.Vector3(0.4, 0, 0),
  ]);
  const baseLine = new THREE.Line(baseGeometry, mainMaterial);
  baseLine.renderOrder = 3;
  group.add(baseLine);

  const normalizedReferenceMap = new Map();
  referenceMarks
    .filter((mark) => Number.isFinite(mark?.height))
    .forEach((mark) => {
      const key = Number(mark.height.toFixed(2));
      normalizedReferenceMap.set(key, mark);
    });

  const minorTickLength = 0.15;
  const majorTickLength = 0.3;

  const zeroLabel = createTextSprite("0.00 m", {
    fontSize: 30,
    padding: 6,
    scale: 0.16,
  });
  if (zeroLabel) {
    zeroLabel.position.set(majorTickLength + 0.18, 0, 0);
    group.add(zeroLabel);
  }

  for (
    let current = tickSpacing;
    current <= totalHeight + 1e-4;
    current = Number((current + tickSpacing).toFixed(10))
  ) {
    const normalizedHeight = Number(current.toFixed(2));
    const isMajor = Math.abs(normalizedHeight % majorTickSpacing) < 1e-6;
    const material = isMajor ? mainMaterial : minorMaterial;
    const tickLength = isMajor ? majorTickLength : minorTickLength;
    const tickGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, normalizedHeight, 0),
      new THREE.Vector3(tickLength, normalizedHeight, 0),
    ]);
    const tickLine = new THREE.Line(tickGeometry, material);
    tickLine.renderOrder = 3;
    group.add(tickLine);

    if (isMajor && !normalizedReferenceMap.has(normalizedHeight)) {
      const label = createTextSprite(`${normalizedHeight.toFixed(2)} m`, {
        scale: 0.16,
        fontSize: 30,
        padding: 6,
      });
      if (label) {
        label.position.set(tickLength + 0.18, normalizedHeight, 0);
        group.add(label);
      }
    }
  }

  normalizedReferenceMap.forEach((mark, height) => {
    if (height < 0 || height > totalHeight) {
      return;
    }
    const highlightLength = majorTickLength + 0.1;
    const highlightGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.05, height, 0),
      new THREE.Vector3(highlightLength, height, 0),
    ]);
    const highlightLine = new THREE.Line(highlightGeometry, highlightMaterial);
    highlightLine.renderOrder = 4;
    group.add(highlightLine);

    const sprite = createTextSprite(mark.label ?? `${height.toFixed(2)} m`, {
      background: mark.accent
        ? "rgba(56, 189, 248, 0.2)"
        : "rgba(15, 23, 42, 0.82)",
      borderColor: mark.accent
        ? "rgba(56, 189, 248, 0.7)"
        : "rgba(148, 163, 184, 0.5)",
      color: mark.accent ? "#f0f9ff" : "#e2e8f0",
      fontSize: mark.accent ? 38 : 32,
      scale: mark.accent ? 0.22 : 0.18,
      padding: mark.accent ? 10 : 8,
    });
    if (sprite) {
      sprite.position.set(highlightLength + 0.22, height, 0);
      group.add(sprite);
    }
  });

  const titleSprite = createTextSprite("Player height reference", {
    fontSize: 30,
    scale: 0.18,
    color: "#cbd5f5",
  });
  if (titleSprite) {
    titleSprite.position.set(0.32, totalHeight + 0.18, 0);
    group.add(titleSprite);
  }

  return group;
}

function applyDisplacementSettings(material, mapConfig, manifestEntry) {
  if (!material) {
    return;
  }
  const defaults = mapConfig?.defaults ?? MAP_TYPE_CONFIG.displacement?.defaults ?? {};
  const manifestSettings = manifestEntry?.mapSettings?.displacement ?? {};
  const displacementScale = Number.isFinite(manifestSettings.displacementScale)
    ? manifestSettings.displacementScale
    : defaults.displacementScale;
  const displacementBias = Number.isFinite(manifestSettings.displacementBias)
    ? manifestSettings.displacementBias
    : defaults.displacementBias;
  if (Number.isFinite(displacementScale)) {
    material.displacementScale = displacementScale;
  }
  if (Number.isFinite(displacementBias)) {
    material.displacementBias = displacementBias;
  }
}

function normalizeFigureId(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function updateNextFigureIdFromValue(value) {
  const match = /^figure-(\d+)$/i.exec(value);
  if (!match) {
    return;
  }
  const numeric = Number.parseInt(match[1], 10);
  if (Number.isFinite(numeric)) {
    nextFigureId = Math.max(nextFigureId, numeric + 1);
  }
}

function generateFigureId(object3D) {
  let candidate = `figure-${nextFigureId++}`;
  while (figureIdRegistry.has(candidate)) {
    candidate = `figure-${nextFigureId++}`;
  }
  figureIdRegistry.set(candidate, object3D ?? null);
  return candidate;
}

function ensureFigureId(object3D) {
  if (!object3D) {
    return null;
  }
  const current = normalizeFigureId(object3D.userData?.figureId);
  if (current) {
    const owner = figureIdRegistry.get(current);
    if (!owner || owner === object3D) {
      figureIdRegistry.set(current, object3D);
      updateNextFigureIdFromValue(current);
      object3D.userData.figureId = current;
      return current;
    }
  }

  const generated = generateFigureId(object3D);
  updateNextFigureIdFromValue(generated);
  object3D.userData.figureId = generated;
  return generated;
}

function rebuildFigureIdRegistry() {
  figureIdRegistry.clear();
  nextFigureId = 1;
  sceneRoot.children.forEach((child) => {
    ensureFigureId(child);
  });
  renderPartsList();
  rebuildAnimationRegistry();
}

function getObjectDisplayName(object3D) {
  if (!object3D) {
    return "Scene object";
  }
  const sourceName = object3D.userData?.sourceName;
  if (sourceName && typeof sourceName === "string") {
    return sourceName;
  }
  if (object3D.name) {
    return object3D.name;
  }
  if (object3D.type) {
    return object3D.type;
  }
  return "Scene object";
}

function updatePartsPanelState({ count }) {
  if (partsCountLabel) {
    const label = count === 1 ? "1 part" : `${count} parts`;
    partsCountLabel.textContent = label;
  }
  if (partsEmptyState) {
    partsEmptyState.hidden = count > 0;
  }
  if (partsPanel) {
    partsPanel.dataset.count = count.toString();
  }
}

function getPartsListLabel(object3D) {
  if (!object3D) {
    return {
      figureId: "",
      displayName: "Scene object",
      label: "Scene object",
    };
  }
  const figureId = normalizeFigureId(object3D.userData?.figureId);
  const displayName = getObjectDisplayName(object3D);
  const label = figureId || displayName || "Scene object";
  return { figureId, displayName, label };
}

function updateVisibilityToggleButton(button, object3D) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  const { label } = getPartsListLabel(object3D);
  const isVisible = object3D?.visible !== false;
  const action = isVisible ? "Hide" : "Show";
  button.dataset.visible = isVisible ? "true" : "false";
  button.setAttribute("aria-pressed", isVisible ? "false" : "true");
  button.setAttribute("aria-label", `${action} ${label}`);
  button.title = `${action} ${label}`;
  button.textContent = action;
}

function createPartsListItem(object3D) {
  const item = document.createElement("li");
  item.className = "parts-panel__list-item";
  const container = document.createElement("div");
  container.className = "parts-panel__item";
  container.dataset.objectUuid = object3D.uuid;

  const selectButton = document.createElement("button");
  selectButton.type = "button";
  selectButton.className = "parts-panel__item-main";
  selectButton.dataset.partItem = "true";
  selectButton.dataset.objectUuid = object3D.uuid;

  ensureFigureId(object3D);
  const { figureId, displayName } = getPartsListLabel(object3D);
  if (figureId) {
    selectButton.dataset.figureId = figureId;
  }

  const isSelected = selectedObjects.has(object3D);
  container.dataset.active = String(isSelected);
  selectButton.dataset.active = String(isSelected);
  selectButton.setAttribute("aria-pressed", isSelected ? "true" : "false");
  selectButton.setAttribute(
    "aria-label",
    figureId ? `Select ${figureId}` : `Select ${displayName}`
  );

  const title = document.createElement("span");
  title.className = "parts-panel__item-title";
  title.textContent = figureId ?? displayName;

  const subtitle = document.createElement("span");
  subtitle.className = "parts-panel__item-subtitle";
  const shouldShowSubtitle = Boolean(
    figureId && displayName && displayName !== figureId
  );
  if (shouldShowSubtitle) {
    subtitle.textContent = displayName;
    selectButton.append(title, subtitle);
  } else {
    selectButton.append(title);
  }

  const tooltipParts = [];
  if (figureId) {
    tooltipParts.push(figureId);
  }
  if (displayName && (!figureId || displayName !== figureId)) {
    tooltipParts.push(displayName);
  }
  if (tooltipParts.length) {
    selectButton.title = tooltipParts.join(" • ");
  }

  const visibilityButton = document.createElement("button");
  visibilityButton.type = "button";
  visibilityButton.className = "parts-panel__visibility-toggle";
  visibilityButton.dataset.visibilityToggle = "true";
  visibilityButton.dataset.objectUuid = object3D.uuid;
  updateVisibilityToggleButton(visibilityButton, object3D);

  container.append(selectButton, visibilityButton);
  item.append(container);
  return item;
}

function renderPartsList() {
  if (!partsListElement) {
    return;
  }
  const children = Array.from(sceneRoot.children);
  partsListElement.innerHTML = "";
  updatePartsPanelState({ count: children.length });
  if (!children.length) {
    return;
  }
  const fragment = document.createDocumentFragment();
  children.forEach((child) => {
    fragment.append(createPartsListItem(child));
  });
  partsListElement.append(fragment);
  syncPartsListSelection();
}

function syncPartsListSelection() {
  if (!partsListElement) {
    return;
  }
  updatePartsPanelState({ count: sceneRoot.children.length });
  const buttons = partsListElement.querySelectorAll("[data-part-item]");
  buttons.forEach((button) => {
    const uuid = button.dataset.objectUuid;
    const object3D = uuid
      ? sceneRoot.getObjectByProperty("uuid", uuid)
      : null;
    const isSelected = object3D ? selectedObjects.has(object3D) : false;
    button.dataset.active = String(isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    const container = button.closest(".parts-panel__item");
    if (container) {
      container.dataset.active = String(isSelected);
    }
  });
  syncPartsListVisibility();
}

function syncPartsListVisibility() {
  if (!partsListElement) {
    return;
  }
  const toggles = partsListElement.querySelectorAll("[data-visibility-toggle]");
  toggles.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const uuid = button.dataset.objectUuid;
    if (!uuid) {
      button.disabled = true;
      button.dataset.visible = "false";
      button.textContent = "Show";
      button.removeAttribute("aria-label");
      button.removeAttribute("title");
      button.setAttribute("aria-pressed", "false");
      return;
    }
    const object3D = sceneRoot.getObjectByProperty("uuid", uuid);
    if (!object3D) {
      button.disabled = true;
      button.dataset.visible = "false";
      button.textContent = "Show";
      button.removeAttribute("aria-label");
      button.removeAttribute("title");
      button.setAttribute("aria-pressed", "false");
      return;
    }
    button.disabled = false;
    updateVisibilityToggleButton(button, object3D);
  });
}

function formatTextureLabel(textureId) {
  if (!textureId) {
    return "None";
  }
  return textureId
    .replace(/[_-]+/g, " ")
    .replace(/\b([a-zA-Z])/g, (match, char) => char.toUpperCase());
}

function getTexturePreviewMap(maps) {
  if (!Array.isArray(maps) || !maps.length) {
    return null;
  }
  return (
    TEXTURE_PREVIEW_PRIORITY.find((type) => maps.includes(type)) ?? maps[0]
  );
}

function parseTextureManifest(text) {
  if (!text) {
    return [];
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [idPart, mapsPart] = line.split(":");
      const id = idPart?.trim();
      if (!id) {
        return null;
      }
      let maps = [];
      const mapSettings = {};
      if (mapsPart) {
        const segments = mapsPart
          .split(";")
          .map((segment) => segment.trim())
          .filter(Boolean);
        if (segments.length) {
          const mapsSegment = segments.shift();
          if (mapsSegment) {
            maps = mapsSegment
              .split(",")
              .map((segment) => segment.trim())
              .filter(Boolean);
          }
        }
        segments.forEach((segment) => {
          const [rawKey, rawValue] = segment.split("=");
          const key = rawKey?.trim();
          if (!key) {
            return;
          }
          const value = rawValue?.trim();
          if (value == null || value === "") {
            return;
          }
          const numericValue = Number.parseFloat(value);
          if (!Number.isFinite(numericValue)) {
            return;
          }
          if (key === "displacementScale" || key === "displacementBias") {
            if (!mapSettings.displacement) {
              mapSettings.displacement = {};
            }
            mapSettings.displacement[key] = numericValue;
          }
        });
      }
      const previewMap = getTexturePreviewMap(maps);
      const result = {
        id,
        maps,
        label: formatTextureLabel(id),
        previewMap,
      };
      if (Object.keys(mapSettings).length) {
        result.mapSettings = mapSettings;
      }
      return result;
    })
    .filter(Boolean);
}

function normalizePackBasePath(path, packId) {
  const fallback = `images/textures/${packId}`;
  const base = (path || fallback).replace(/\\+/g, "/").trim();
  return base.replace(/\/?$/, "/");
}

async function ensureTexturePackLoaded(packId) {
  if (!packId) {
    return [];
  }
  const pack = texturePackRegistry.get(packId);
  if (!pack) {
    return [];
  }
  if (pack.textures) {
    return pack.textures;
  }
  if (!pack.texturesPromise) {
    const manifestUrl = `${pack.basePath}${TEXTURE_MANIFEST_FILENAME}`;
    pack.texturesPromise = fetch(manifestUrl, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Unable to load textures for pack "${pack.label ?? pack.id}" (HTTP ${response.status})`
          );
        }
        return response.text();
      })
      .then((text) => {
        const textures = parseTextureManifest(text);
        pack.textures = textures;
        return textures;
      })
      .catch((error) => {
        pack.error =
          error instanceof Error
            ? error
            : new Error("Failed to load texture list");
        pack.textures = [];
        return [];
      });
  }
  return pack.texturesPromise;
}

function buildTextureUrl(pack, textureId, mapType) {
  const extension = pack.extension || DEFAULT_TEXTURE_EXTENSION;
  const normalizedType = mapType || "baseColor";
  return `${pack.basePath}${textureId}_${normalizedType}${extension}`;
}

function loadPackTexture(packId, textureId, mapType, colorSpace) {
  const pack = texturePackRegistry.get(packId);
  if (!pack) {
    throw new Error(`Unknown texture pack: ${packId}`);
  }
  const cacheKey = `${packId}/${textureId}/${mapType}`;
  if (!textureCache.has(cacheKey)) {
    const url = buildTextureUrl(pack, textureId, mapType);
    const promise = new Promise((resolve, reject) => {
      textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = colorSpace ?? THREE.LinearSRGBColorSpace;
          const maxAnisotropy = renderer.capabilities?.getMaxAnisotropy?.();
          if (Number.isFinite(maxAnisotropy) && maxAnisotropy > 0) {
            texture.anisotropy = Math.min(8, maxAnisotropy);
          } else {
            texture.anisotropy = 4;
          }
          resolve(texture);
        },
        undefined,
        (error) => {
          const message =
            error?.message ?? `Failed to load texture map "${mapType}".`;
          reject(new Error(message));
        }
      );
    }).catch((error) => {
      textureCache.delete(cacheKey);
      throw error;
    });
    textureCache.set(cacheKey, promise);
  }
  return textureCache.get(cacheKey);
}

function clearAppliedTexture(material) {
  if (!material) {
    return;
  }
  const applied = material.userData?.appliedTexture;
  if (applied && Array.isArray(applied.properties)) {
    applied.properties.forEach((property) => {
      if (property && property in material) {
        material[property] = null;
      }
    });
  }
  if (material.userData) {
    delete material.userData.appliedTexture;
  }
  material.needsUpdate = true;
}

function getAppliedTextureReference(material) {
  if (!material || !material.userData) {
    return null;
  }
  const applied = material.userData.appliedTexture;
  if (!applied || !applied.packId || !applied.textureId) {
    return null;
  }
  return {
    packId: applied.packId,
    textureId: applied.textureId,
  };
}

function getPrimaryEditableMaterial() {
  if (!editableMeshes.length) {
    return null;
  }
  const firstMesh = editableMeshes[0];
  if (!firstMesh) {
    return null;
  }
  return Array.isArray(firstMesh.material)
    ? firstMesh.material[0]
    : firstMesh.material;
}

function getCurrentMaterialTextureRef() {
  const material = getPrimaryEditableMaterial();
  const applied = getAppliedTextureReference(material);
  if (!applied) {
    return null;
  }
  return { ...applied };
}

function selectionHasTrackedTexture() {
  return Boolean(getAppliedTextureReference(getPrimaryEditableMaterial()));
}

function setTextureGridBusy(isBusy) {
  if (!textureGrid) {
    return;
  }
  textureGrid.dataset.applying = isBusy ? "true" : "false";
  if (!textureControlsInitialized) {
    return;
  }
  Array.from(textureGrid.querySelectorAll("button[data-texture-id]")).forEach(
    (button) => {
      button.disabled = isBusy || !editableMeshes.length;
    }
  );
}

function setTextureControlsEnabled(enabled) {
  if (textureGrid) {
    textureGrid.dataset.disabled = enabled ? "false" : "true";
  }
  if (!textureControlsInitialized) {
    return;
  }
  if (texturePackSelect) {
    const hasPacks = texturePackRegistry.size > 0;
    texturePackSelect.disabled = !enabled || !hasPacks;
  }
  if (textureGrid) {
    Array.from(textureGrid.querySelectorAll("button[data-texture-id]")).forEach(
      (button) => {
        button.disabled = !enabled;
      }
    );
  }
}

function highlightTextureSelection(textureId) {
  if (!textureGrid) {
    return;
  }
  const normalizedId = textureId ?? "";
  Array.from(textureGrid.querySelectorAll("button[data-texture-id]")).forEach(
    (button) => {
      const isSelected = button.dataset.textureId === normalizedId;
      button.dataset.selected = String(isSelected);
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    }
  );
}

async function renderTextureGrid(packId, { selectedTextureId = null } = {}) {
  if (!textureGrid) {
    return;
  }
  const renderToken = ++textureGridRenderToken;
  textureGrid.dataset.loading = "true";
  textureGrid.dataset.packId = packId ?? "";
  textureGrid.innerHTML =
    '<p class="texture-grid__message">Loading textures…</p>';

  if (!packId || !texturePackRegistry.has(packId)) {
    textureGrid.dataset.loading = "false";
    textureGrid.innerHTML =
      '<p class="texture-grid__message">Select a texture pack to view textures.</p>';
    return;
  }

  const pack = texturePackRegistry.get(packId);
  const textures = await ensureTexturePackLoaded(packId);
  if (renderToken !== textureGridRenderToken) {
    return;
  }

  textureGrid.dataset.loading = "false";
  textureGrid.innerHTML = "";

  if (pack?.error) {
    textureGrid.innerHTML = `<p class="texture-grid__message">${
      pack.error?.message ?? "Unable to load textures for this pack."
    }</p>`;
    return;
  }

  if (!textures.length) {
    textureGrid.innerHTML =
      '<p class="texture-grid__message">No textures found in this pack.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  fragment.append(
    createTextureButton({
      packId,
      textureId: "",
      label: "None",
      previewUrl: null,
    })
  );

  textures.forEach((entry) => {
    const previewMap = entry.previewMap ?? getTexturePreviewMap(entry.maps);
    const previewUrl = previewMap ? buildTextureUrl(pack, entry.id, previewMap) : null;
    fragment.append(
      createTextureButton({
        packId,
        textureId: entry.id,
        label: entry.label,
        previewUrl,
      })
    );
  });

  textureGrid.append(fragment);
  highlightTextureSelection(selectedTextureId);
}

function createTextureButton({ packId, textureId, label, previewUrl }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "texture-grid__item";
  button.dataset.packId = packId ?? "";
  button.dataset.textureId = textureId ?? "";
  button.setAttribute(
    "aria-label",
    textureId ? `${label} texture` : "Remove applied texture"
  );
  button.setAttribute("aria-pressed", "false");

  const preview = document.createElement("div");
  preview.className = "texture-grid__preview";
  if (previewUrl) {
    preview.classList.add("texture-grid__preview--image");
    preview.style.backgroundImage = `url(${previewUrl})`;
  } else {
    preview.textContent = "×";
  }

  const caption = document.createElement("span");
  caption.className = "texture-grid__label";
  caption.textContent = textureId ? label : "None";

  button.append(preview, caption);
  if (!editableMeshes.length) {
    button.disabled = true;
  }
  return button;
}

function syncTextureControls() {
  if (!texturePackSelect || !textureGrid || !textureControlsInitialized) {
    return;
  }

  const hasSelection = editableMeshes.length > 0;
  const hasPacks = texturePackRegistry.size > 0;

  textureGrid.dataset.disabled = hasSelection ? "false" : "true";

  if (texturePackSelect) {
    texturePackSelect.disabled = !hasSelection || !hasPacks;
  }

  Array.from(textureGrid.querySelectorAll("button[data-texture-id]")).forEach(
    (button) => {
      button.disabled = !hasSelection;
    }
  );

  if (!hasSelection || !hasPacks) {
    highlightTextureSelection(null);
    return;
  }

  const material = getPrimaryEditableMaterial();
  const applied = getAppliedTextureReference(material);
  if (applied) {
    textureState.activeTextureId = applied.textureId;
    if (!textureState.activePackId || textureState.activePackId === applied.packId) {
      textureState.activePackId = applied.packId;
    }
  } else if (
    textureState.activePackId &&
    !texturePackRegistry.has(textureState.activePackId)
  ) {
    textureState.activePackId = null;
  }

  const desiredPackId =
    (textureState.activePackId && texturePackRegistry.has(textureState.activePackId)
      ? textureState.activePackId
      : null) ??
    applied?.packId ??
    (texturePackRegistry.has(texturePackSelect.value)
      ? texturePackSelect.value
      : texturePackList[0]?.id ?? null);

  if (desiredPackId && textureGrid.dataset.packId !== desiredPackId) {
    texturePackSelect.value = desiredPackId;
    void renderTextureGrid(desiredPackId, {
      selectedTextureId: applied?.textureId ?? null,
    });
    return;
  }

  highlightTextureSelection(applied?.textureId ?? null);
}

function initializeTextureControls() {
  if (!texturePackSelect || !textureGrid) {
    if (!texturesInitializationPromise) {
      texturesInitializationPromise = Promise.resolve(false);
    }
    return texturesInitializationPromise;
  }

  if (texturesInitializationPromise) {
    return texturesInitializationPromise;
  }

  texturesInitializationPromise = (async () => {
    try {
      texturePackSelect.innerHTML =
        '<option value="">Loading texture packs…</option>';
      texturePackSelect.disabled = true;
      textureGrid.dataset.loading = "true";

      const response = await fetch(TEXTURE_PACKS_ENDPOINT, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Unable to load texture packs (HTTP ${response.status})`);
      }

      const data = await response.json();
      const packs = Array.isArray(data?.packs) ? data.packs : [];
      texturePackSelect.innerHTML = "";
      texturePackList = packs;
      texturePackRegistry.clear();

      packs.forEach((pack, index) => {
        if (!pack?.id) {
          return;
        }
        const label = pack.label ?? pack.name ?? formatTextureLabel(pack.id);
        const option = document.createElement("option");
        option.value = pack.id;
        option.textContent = label;
        texturePackSelect.append(option);
        texturePackRegistry.set(pack.id, {
          ...pack,
          id: pack.id,
          label,
          basePath: normalizePackBasePath(pack.path, pack.id),
          extension: pack.extension || DEFAULT_TEXTURE_EXTENSION,
          textures: null,
          texturesPromise: null,
          error: null,
        });
        if (index === 0 && !texturePackSelect.value) {
          texturePackSelect.value = pack.id;
        }
      });

      textureControlsInitialized = true;

      if (!packs.length) {
        texturePackSelect.innerHTML =
          '<option value="">No texture packs found</option>';
        texturePackSelect.disabled = true;
        textureGrid.dataset.loading = "false";
        textureGrid.innerHTML =
          '<p class="texture-grid__message">Add texture packs to enable previews.</p>';
        return false;
      }

      const initialPackId = texturePackSelect.value || packs[0].id;
      textureState.activePackId = initialPackId;
      await renderTextureGrid(initialPackId, { selectedTextureId: null });
      syncTextureControls();
      return true;
    } catch (error) {
      console.error("Failed to load texture packs", error);
      if (texturePackSelect) {
        texturePackSelect.innerHTML =
          '<option value="">Unable to load texture packs</option>';
        texturePackSelect.disabled = true;
      }
      if (textureGrid) {
        textureGrid.dataset.loading = "false";
        textureGrid.innerHTML =
          '<p class="texture-grid__message">Unable to load texture packs.</p>';
      }
      textureControlsInitialized = true;
      syncTextureControls();
      return false;
    }
  })();

  return texturesInitializationPromise;
}

async function applyTextureToMaterial(material, packId, textureId, manifestEntry) {
  if (!material) {
    return;
  }
  clearAppliedTexture(material);
  if (!packId || !textureId || !manifestEntry) {
    return;
  }

  const supportedMapTypes = Array.isArray(manifestEntry.maps)
    ? manifestEntry.maps.filter((mapType) => MAP_TYPE_CONFIG[mapType])
    : [];
  const fallbackMap = manifestEntry.previewMap ?? getTexturePreviewMap(manifestEntry.maps);
  const mapTypesToLoad = supportedMapTypes.length
    ? supportedMapTypes
    : fallbackMap
    ? [fallbackMap]
    : [];

  const appliedProperties = [];
  const loadPromises = mapTypesToLoad.map((mapType) => {
    const config =
      MAP_TYPE_CONFIG[mapType] ||
      (mapType === "baseColor"
        ? MAP_TYPE_CONFIG.baseColor
        : {
            properties: ["map"],
            colorSpace:
              mapType === "emissive"
                ? THREE.SRGBColorSpace
                : THREE.LinearSRGBColorSpace,
          });
    return loadPackTexture(packId, textureId, mapType, config.colorSpace).then(
      (texture) => ({ mapType, config, texture })
    );
  });

  const loadedMaps = await Promise.all(loadPromises);
  loadedMaps.forEach(({ config, texture }) => {
    const properties = Array.isArray(config.properties)
      ? config.properties
      : [config.properties];
    properties.forEach((property) => {
      if (property && property in material) {
        material[property] = texture;
        if (property === "displacementMap") {
          applyDisplacementSettings(material, config, manifestEntry);
        }
        if (!appliedProperties.includes(property)) {
          appliedProperties.push(property);
        }
      }
    });
  });

  if (!appliedProperties.length && fallbackMap) {
    const fallbackConfig =
      MAP_TYPE_CONFIG[fallbackMap] || MAP_TYPE_CONFIG.baseColor;
    const texture = await loadPackTexture(
      packId,
      textureId,
      fallbackMap,
      fallbackConfig.colorSpace
    );
    material.map = texture;
    appliedProperties.push("map");
  }

  material.userData = material.userData ?? {};
  material.userData.appliedTexture = {
    packId,
    textureId,
    properties: appliedProperties,
  };
  material.needsUpdate = true;
}

async function applyTextureSelection(packId, textureId, options = {}) {
  const { skipHistory = false, announce = true } = options;
  if (!editableMeshes.length) {
    return;
  }

  const normalizedTextureId = textureId || null;
  const targetPackId = normalizedTextureId ? packId : null;

  if (targetPackId) {
    await initializeTextureControls();
    if (!texturePackRegistry.has(targetPackId)) {
      setStatus("error", "Texture pack not available");
      if (hudInfo) {
        hudInfo.textContent = "Add the texture pack to apply it.";
      }
      return;
    }
  }

  const materials = [];
  editableMeshes.forEach((mesh) => {
    if (!mesh) {
      return;
    }
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      mat.forEach((item) => {
        if (item) {
          materials.push(item);
        }
      });
    } else if (mat) {
      materials.push(mat);
    }
  });

  if (!materials.length) {
    return;
  }

  const token = ++activeTextureApplicationToken;
  setTextureGridBusy(true);

  try {
    let manifestEntry = null;
    if (targetPackId && normalizedTextureId) {
      const pack = texturePackRegistry.get(targetPackId);
      const textures = await ensureTexturePackLoaded(targetPackId);
      if (!textures.length && pack?.error) {
        throw pack.error;
      }
      manifestEntry = textures.find((entry) => entry.id === normalizedTextureId);
      if (!manifestEntry) {
        throw new Error(
          `Texture "${normalizedTextureId}" was not found in pack "${pack?.label ?? targetPackId}".`
        );
      }
      if (!manifestEntry.previewMap) {
        manifestEntry.previewMap = getTexturePreviewMap(manifestEntry.maps);
      }
    }

    await Promise.all(
      materials.map((material) =>
        applyTextureToMaterial(material, targetPackId, normalizedTextureId, manifestEntry)
      )
    );

    if (token !== activeTextureApplicationToken) {
      return;
    }

    textureState.activePackId = targetPackId;
    textureState.activeTextureId = normalizedTextureId;
    highlightTextureSelection(normalizedTextureId);

    if (!skipHistory && !isRestoringHistory) {
      scheduleHistoryCommit();
    }

    if (announce) {
      setStatus(
        "ready",
        normalizedTextureId ? "Texture applied" : "Texture maps cleared"
      );
      if (hudInfo) {
        hudInfo.textContent = "";
      }
    }
  } catch (error) {
    if (token === activeTextureApplicationToken) {
      console.error("Failed to apply texture", error);
      setStatus("error", "Failed to apply texture");
      if (hudInfo) {
        hudInfo.textContent =
          error?.message ?? "Unable to apply the selected texture.";
      }
    }
  } finally {
    if (token === activeTextureApplicationToken) {
      setTextureGridBusy(false);
      syncTextureControls();
    }
  }
}

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
camera.position.set(6, 4, 8);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.screenSpacePanning = false;
orbitControls.maxDistance = 200;
orbitControls.minDistance = 0.25;

const navigationState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};

const navigationKeyMap = new Map([
  ["w", "forward"],
  ["s", "backward"],
  ["a", "left"],
  ["d", "right"],
]);

const worldUp = new THREE.Vector3(0, 1, 0);
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const movementVector = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const POINTER_CLICK_THRESHOLD = 5;
const MIN_VERTICAL_SCALE = 0.01;
const selectionBoundingBoxHelper = new THREE.Box3();
const tempBoundingBoxHelper = new THREE.Box3();
const reusableBoundingBox = new THREE.Box3();
const reusableCenterVector = new THREE.Vector3();
const reusableDisplayCenterVector = new THREE.Vector3();
const reusableSizeVector = new THREE.Vector3();
let pointerDownInfo = null;

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setSize(1.1);
transformControls.addEventListener("dragging-changed", (event) => {
  orbitControls.enabled = !event.value;
  isTransformDragging = event.value;
  if (event.value) {
    if (currentSelection && selectedObjects.size > 1) {
      const sourceName =
        currentSelection.userData?.sourceName ?? "Scene object";
      setCurrentSelection(currentSelection, sourceName, {
        focus: false,
        addToScene: false,
      });
    }
    transformHasChanged = false;
    if (activeTransformMode === "scale") {
      const bounds = computeSelectionBoundingBox();
      activeTransformGroundTarget =
        bounds && Number.isFinite(bounds.min.y)
          ? bounds.min.y
          : 0;
    } else {
      activeTransformGroundTarget = null;
    }
  } else if (transformHasChanged) {
    transformHasChanged = false;
    pushHistorySnapshot();
    activeTransformGroundTarget = null;
  } else {
    activeTransformGroundTarget = null;
  }
});
transformControls.addEventListener("change", () => {
  updateHud(currentSelection);
  syncInspectorInputs();
});
transformControls.addEventListener("objectChange", () => {
  transformHasChanged = true;
  if (activeTransformMode === "scale") {
    enforcePositiveVerticalScale();
    keepSelectionAboveGround();
  }
});
scene.add(transformControls);

const gridHelper = new THREE.GridHelper(40, 40, 0x334155, 0x1e293b);
gridHelper.position.y = -0.001;
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(1.5);
axesHelper.position.y = 0.001;
scene.add(axesHelper);

const ambientLight = new THREE.AmbientLight(0xf8fafc, 0.55);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
keyLight.position.set(5, 10, 7);
keyLight.castShadow = true;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.3);
rimLight.position.set(-6, 8, -4);
scene.add(rimLight);

const loaders = {
  gltf: new GLTFLoader(),
  glb: new GLTFLoader(),
  obj: new OBJLoader(),
  fbx: new FBXLoader(),
  stl: new STLLoader(),
};

const mtlLoader = new MTLLoader();

const gltfExporter = new GLTFExporter();

let currentSelection = null;
const selectedObjects = new Set();
let editableMeshes = [];
let activeTransformMode = "translate";
let transformHasChanged = false;
let isTransformDragging = false;
let activeTransformGroundTarget = null;

const STORAGE_KEY = "model-editor-session-v1";

const HISTORY_LIMIT = 50;
const historyState = {
  undoStack: [],
  redoStack: [],
  lastSignature: null,
};
let historyDebounceHandle = null;
let isRestoringHistory = false;

function extractMtllibReference(objText) {
  if (!objText) {
    return null;
  }

  const pattern = /^[ \t]*mtllib[ \t]+(.+?)\s*$/gim;
  let match;
  while ((match = pattern.exec(objText))) {
    const rawValue = match[1]?.trim();
    if (!rawValue) {
      continue;
    }
    const commentIndex = rawValue.indexOf("#");
    const cleaned = (commentIndex >= 0 ? rawValue.slice(0, commentIndex) : rawValue).trim();
    if (cleaned) {
      return cleaned;
    }
  }

  return null;
}

function normalizeReferencePath(value) {
  return value.replace(/\\/g, "/");
}

function getCandidateFileMapKeys(reference) {
  const normalized = normalizeReferencePath(reference).toLowerCase();
  const candidates = new Set([normalized]);
  if (normalized.startsWith("./")) {
    candidates.add(normalized.slice(2));
  }
  const filename = normalized.split("/").pop();
  if (filename) {
    candidates.add(filename);
  }
  return Array.from(candidates);
}

async function readFileLikeAsText(fileLike) {
  if (!fileLike) {
    return null;
  }

  if (typeof fileLike.text === "function") {
    return await fileLike.text();
  }

  if (typeof FileReader === "undefined") {
    return null;
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsText(fileLike);
  });
}

async function loadMaterialsForObj({ objText, fileMap, sourceUrl }) {
  const mtllibReference = extractMtllibReference(objText);
  if (!mtllibReference) {
    return null;
  }

  const normalizedReference = normalizeReferencePath(mtllibReference);
  const candidateKeys = fileMap ? getCandidateFileMapKeys(normalizedReference) : [];
  let materialsText = null;
  let materialPath = "./";

  if (fileMap && fileMap.size) {
    for (const key of candidateKeys) {
      const fileEntry = fileMap.get(key);
      if (!fileEntry) {
        continue;
      }
      try {
        materialsText = await readFileLikeAsText(fileEntry);
      } catch (error) {
        console.warn(`Failed to read MTL file from upload: ${normalizedReference}`, error);
      }
      if (materialsText) {
        const slashIndex = normalizedReference.lastIndexOf("/");
        if (slashIndex !== -1) {
          materialPath = normalizedReference.slice(0, slashIndex + 1);
        }
        break;
      }
    }
  }

  if (!materialsText && sourceUrl) {
    try {
      const baseUrl = new URL(sourceUrl, window.location.href);
      const resolvedUrl = new URL(normalizedReference, baseUrl);
      const response = await fetch(resolvedUrl.href);
      if (response.ok) {
        materialsText = await response.text();
        materialPath = new URL("./", resolvedUrl).href;
      } else {
        console.warn(
          `Failed to fetch MTL file: ${resolvedUrl.href} (status ${response.status})`
        );
      }
    } catch (error) {
      console.warn(`Failed to fetch MTL file: ${normalizedReference}`, error);
    }
  }

  if (!materialsText) {
    return null;
  }

  try {
    const materials = mtlLoader.parse(materialsText, materialPath);
    materials.preload();
    return materials;
  } catch (error) {
    console.warn(`Failed to parse MTL file: ${normalizedReference}`, error);
    return null;
  }
}

function objectContainsRenderable(object3D) {
  if (!object3D) {
    return false;
  }

  let hasRenderable = false;
  object3D.traverse((child) => {
    if (child.isMesh || child.isLine || child.isPoints) {
      hasRenderable = true;
    }
  });

  return hasRenderable;
}

function findSeparableChildren(object3D) {
  if (!object3D || !Array.isArray(object3D.children) || !object3D.children.length) {
    return null;
  }

  const childEntries = object3D.children.map((child) => ({
    child,
    hasRenderable: objectContainsRenderable(child),
  }));

  const renderableChildren = childEntries.filter((entry) => entry.hasRenderable);

  if (renderableChildren.length > 1) {
    return { parent: object3D, childEntries };
  }

  for (const entry of renderableChildren) {
    const nested = findSeparableChildren(entry.child);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function separateImportedObject(imported, sourceName) {
  const separation = findSeparableChildren(imported);
  if (!separation) {
    return null;
  }

  const { childEntries } = separation;

  const renderableChildren = childEntries
    .filter((entry) => entry.hasRenderable)
    .map((entry) => entry.child);

  if (renderableChildren.length <= 1) {
    return null;
  }

  imported.updateMatrixWorld(true);

  let partIndex = 1;
  childEntries.forEach(({ child, hasRenderable }) => {
    sceneRoot.attach(child);

    if (!child.userData || typeof child.userData !== "object") {
      child.userData = {};
    }

    if (hasRenderable) {
      const existingName =
        (typeof child.userData.sourceName === "string" && child.userData.sourceName.trim()) ||
        (typeof child.name === "string" && child.name.trim()) ||
        `${sourceName} part ${partIndex}`;
      child.userData.sourceName = existingName;
      partIndex += 1;
    }
  });

  return {
    pieces: renderableChildren,
    children: childEntries.map((entry) => entry.child),
  };
}

function cancelScheduledHistoryCommit() {
  if (historyDebounceHandle) {
    clearTimeout(historyDebounceHandle);
    historyDebounceHandle = null;
  }
}

function clearHistoryTracking() {
  cancelScheduledHistoryCommit();
  historyState.undoStack = [];
  historyState.redoStack = [];
  historyState.lastSignature = null;
}

function flushHistoryCommit() {
  if (isRestoringHistory) {
    cancelScheduledHistoryCommit();
    return;
  }
  if (!historyDebounceHandle) {
    return;
  }
  clearTimeout(historyDebounceHandle);
  historyDebounceHandle = null;
  pushHistorySnapshot();
}

function captureSceneSnapshot() {
  const objectJSON = sceneRoot.toJSON();
  const material = currentSelection
    ? {
        color: colorInput?.value ?? "#ffffff",
        metalness: Number.parseFloat(metalnessInput?.value ?? "0") || 0,
        roughness: Number.parseFloat(roughnessInput?.value ?? "1") || 1,
        texture: getCurrentMaterialTextureRef(),
      }
    : null;

  const selectionUUID = currentSelection?.uuid ?? null;
  const snapshot = {
    objectJSON,
    selectionUUID,
    material,
    signature: JSON.stringify({
      object: objectJSON,
      selectionUUID,
      material,
    }),
  };

  return snapshot;
}

function resetHistoryTracking() {
  if (isRestoringHistory) {
    return;
  }
  clearHistoryTracking();
  const snapshot = captureSceneSnapshot();
  if (snapshot) {
    historyState.undoStack.push(snapshot);
    historyState.lastSignature = snapshot.signature;
  }
}

function pushHistorySnapshot() {
  if (isRestoringHistory) {
    return;
  }
  const snapshot = captureSceneSnapshot();
  if (!snapshot) {
    return;
  }
  if (snapshot.signature === historyState.lastSignature) {
    return;
  }

  historyState.undoStack.push(snapshot);
  if (historyState.undoStack.length > HISTORY_LIMIT) {
    historyState.undoStack.shift();
  }
  historyState.lastSignature = snapshot.signature;
  historyState.redoStack = [];
}

function scheduleHistoryCommit() {
  if (isRestoringHistory) {
    return;
  }
  cancelScheduledHistoryCommit();
  historyDebounceHandle = setTimeout(() => {
    historyDebounceHandle = null;
    pushHistorySnapshot();
  }, 250);
}

function applySnapshot(snapshot) {
  if (!snapshot) {
    return;
  }

  isRestoringHistory = true;
  cancelScheduledHistoryCommit();
  try {
    const loader = new THREE.ObjectLoader();
    const restoredRoot = loader.parse(snapshot.objectJSON);

    sceneRoot.clear();
    sceneRoot.position.copy(restoredRoot.position);
    sceneRoot.quaternion.copy(restoredRoot.quaternion);
    sceneRoot.scale.copy(restoredRoot.scale);
    while (restoredRoot.children.length) {
      const child = restoredRoot.children[0];
      sceneRoot.add(child);
    }

    rebuildFigureIdRegistry();

    const selection = snapshot.selectionUUID
      ? sceneRoot.getObjectByProperty("uuid", snapshot.selectionUUID)
      : null;

    if (selection) {
      const sourceName = selection.userData?.sourceName ?? "Imported model";
      setCurrentSelection(selection, sourceName, { focus: false, addToScene: false });
    } else {
      setCurrentSelection(null, undefined, { focus: false });
    }

    transformControls.setTranslationSnap(null);
    transformControls.setRotationSnap(null);
    transformControls.setScaleSnap(null);

    if (snapshot.material && currentSelection) {
      const { color, metalness, roughness, texture } = snapshot.material;
      if (colorInput && color) {
        colorInput.value = color;
        updateColorPickerPreview(color);
      }
      if (metalnessInput && typeof metalness === "number") {
        metalnessInput.value = metalness.toString();
      }
      if (roughnessInput && typeof roughness === "number") {
        roughnessInput.value = roughness.toString();
      }
      if (texture && texture.packId && texture.textureId) {
        void applyTextureSelection(texture.packId, texture.textureId, {
          skipHistory: true,
          announce: false,
        });
      } else if (selectionHasTrackedTexture()) {
        void applyTextureSelection(null, null, {
          skipHistory: true,
          announce: false,
        });
      }
    } else if (currentSelection && selectionHasTrackedTexture()) {
      void applyTextureSelection(null, null, {
        skipHistory: true,
        announce: false,
      });
    }

    syncMaterialInputs();
  } finally {
    isRestoringHistory = false;
  }
}

function undoLastChange() {
  flushHistoryCommit();
  if (historyState.undoStack.length <= 1) {
    return;
  }
  const current = historyState.undoStack.pop();
  historyState.redoStack.push(current);
  const previous = historyState.undoStack[historyState.undoStack.length - 1];
  applySnapshot(previous);
  historyState.lastSignature = previous.signature;
  setStatus("ready", "Undo applied");
}

function redoLastChange() {
  flushHistoryCommit();
  if (!historyState.redoStack.length) {
    return;
  }
  const snapshot = historyState.redoStack.pop();
  historyState.undoStack.push(snapshot);
  applySnapshot(snapshot);
  historyState.lastSignature = snapshot.signature;
  setStatus("ready", "Redo applied");
}

function resizeRendererToDisplaySize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function updateCameraNavigation(delta) {
  if (!orbitControls.enabled) {
    return;
  }

  const { forward, backward, left, right } = navigationState;
  if (!forward && !backward && !left && !right) {
    return;
  }

  cameraForward.set(0, 0, 0);
  camera.getWorldDirection(cameraForward);
  cameraForward.y = 0;

  if (cameraForward.lengthSq() < 1e-6) {
    return;
  }

  cameraForward.normalize();
  cameraRight.copy(cameraForward).cross(worldUp).normalize();

  if (cameraRight.lengthSq() < 1e-6) {
    cameraRight.set(1, 0, 0);
  }

  movementVector.set(0, 0, 0);

  if (forward) {
    movementVector.add(cameraForward);
  }
  if (backward) {
    movementVector.sub(cameraForward);
  }
  if (left) {
    movementVector.sub(cameraRight);
  }
  if (right) {
    movementVector.add(cameraRight);
  }

  if (movementVector.lengthSq() < 1e-6) {
    return;
  }

  movementVector.normalize();
  const distance = camera.position.distanceTo(orbitControls.target);
  const speed = Math.max(distance * 0.6, 0.5);
  const moveDistance = speed * delta;

  movementVector.multiplyScalar(moveDistance);
  camera.position.add(movementVector);
  orbitControls.target.add(movementVector);
}

function updateAnimatedObjects(delta) {
  if (!animatedObjects.size) {
    return;
  }

  const toRemove = [];
  animatedObjects.forEach((object3D, uuid) => {
    if (!object3D || !object3D.parent) {
      toRemove.push(uuid);
      return;
    }
    const motion = normalizeMotionConfig(object3D.userData?.motion);
    if (!motion || !motion.enabled) {
      toRemove.push(uuid);
      return;
    }

    const speed = Number.isFinite(motion.speed) ? motion.speed : MOTION_DEFAULT_SPEED;
    if (!Number.isFinite(speed) || speed === 0) {
      return;
    }

    const radians = THREE.MathUtils.degToRad(speed) * delta;
    if (radians === 0) {
      return;
    }

    const axes = motion.axes ?? MOTION_DEFAULT_AXES;
    if (axes.x) {
      object3D.rotateX(radians);
    }
    if (axes.y) {
      object3D.rotateY(radians);
    }
    if (axes.z) {
      object3D.rotateZ(radians);
    }
  });

  if (toRemove.length) {
    toRemove.forEach((uuid) => {
      animatedObjects.delete(uuid);
    });
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  resizeRendererToDisplaySize();
  updateCameraNavigation(delta);
  updateAnimatedObjects(delta);
  orbitControls.update();
  renderer.render(scene, camera);
}

animate();

function setStatus(state, message) {
  const badgeState = state === "error" ? "error" : state;
  statusBadge.dataset.state = badgeState;
  if (state === "loading") {
    statusBadge.textContent = "Loading";
  } else if (state === "ready") {
    statusBadge.textContent = "Ready";
  } else if (state === "error") {
    statusBadge.textContent = "Error";
  } else {
    statusBadge.textContent = "Idle";
  }

  if (message) {
    hudModel.textContent = message;
  }
}

function resetHud() {
  hudModel.textContent = "Drop a model to begin.";
  hudInfo.textContent = "";
  setStatus("idle");
}

function ensureStandardMaterial(material) {
  if (!material) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color("#ffffff"),
      metalness: 0.2,
      roughness: 0.8,
    });
  }

  if (Array.isArray(material)) {
    return material.map((mat) => ensureStandardMaterial(mat));
  }

  if (material.isMeshStandardMaterial) {
    return material;
  }

  const params = {
    color: material.color ? material.color.clone() : new THREE.Color("#ffffff"),
    map: material.map ?? null,
    metalness:
      typeof material.metalness === "number" ? material.metalness : 0.2,
    roughness:
      typeof material.roughness === "number" ? material.roughness : 0.8,
    transparent: material.transparent ?? false,
    opacity: material.opacity ?? 1,
    side: material.side ?? THREE.FrontSide,
  };

  const standardMaterial = new THREE.MeshStandardMaterial(params);
  if (material.map) {
    standardMaterial.map = material.map;
  }

  if (material.emissive) {
    standardMaterial.emissive = material.emissive.clone();
    standardMaterial.emissiveIntensity = material.emissiveIntensity ?? 1;
  }

  if (material.userData && typeof material.userData === "object") {
    standardMaterial.userData = { ...material.userData };
  }

  material.dispose?.();
  return standardMaterial;
}

function collectEditableMeshes(object3D) {
  const meshes = [];
  object3D.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = ensureStandardMaterial(child.material);
      if (child.geometry) {
        child.geometry.computeVertexNormals();
      }
      meshes.push(child);
    }
  });
  return meshes;
}

function collectEditableMeshesForSelection(selectionSet) {
  const seen = new Set();
  const meshes = [];
  selectionSet.forEach((object3D) => {
    if (!object3D) {
      return;
    }
    const collected = collectEditableMeshes(object3D);
    collected.forEach((mesh) => {
      if (!seen.has(mesh.uuid)) {
        seen.add(mesh.uuid);
        meshes.push(mesh);
      }
    });
  });
  return meshes;
}

function computeSelectionBoundingBox() {
  if (!selectedObjects.size) {
    return null;
  }

  let hasBounds = false;
  selectionBoundingBoxHelper.makeEmpty();

  selectedObjects.forEach((object3D) => {
    if (!object3D) {
      return;
    }

    tempBoundingBoxHelper.setFromObject(object3D);

    if (
      !Number.isFinite(tempBoundingBoxHelper.min.y) ||
      !Number.isFinite(tempBoundingBoxHelper.max.y)
    ) {
      return;
    }

    if (!hasBounds) {
      selectionBoundingBoxHelper.copy(tempBoundingBoxHelper);
      hasBounds = true;
    } else {
      selectionBoundingBoxHelper.union(tempBoundingBoxHelper);
    }
  });

  return hasBounds ? selectionBoundingBoxHelper : null;
}

function getDisplayCenterFromBox(box, target = new THREE.Vector3()) {
  const result = box.getCenter(target);
  if (Number.isFinite(box.min.y)) {
    result.y = box.min.y;
  }
  return result;
}

function enforcePositiveVerticalScale() {
  if (!selectedObjects.size) {
    return;
  }

  selectedObjects.forEach((object3D) => {
    if (!object3D || !object3D.scale) {
      return;
    }

    const currentScaleY = object3D.scale.y;
    if (!Number.isFinite(currentScaleY)) {
      return;
    }

    const positiveScaleY = Math.abs(currentScaleY);
    const clampedScaleY = Math.max(positiveScaleY, MIN_VERTICAL_SCALE);

    if (clampedScaleY !== currentScaleY) {
      object3D.scale.y = clampedScaleY;
      object3D.updateMatrixWorld(true);
    }
  });
}

function keepSelectionAboveGround(targetMinY = activeTransformGroundTarget) {
  const bounds = computeSelectionBoundingBox();
  if (!bounds) {
    return;
  }

  const resolvedTarget =
    typeof targetMinY === "number" ? targetMinY : 0;

  if (!Number.isFinite(resolvedTarget) || !Number.isFinite(bounds.min.y)) {
    return;
  }

  if (bounds.min.y >= resolvedTarget) {
    return;
  }

  const offset = resolvedTarget - bounds.min.y;

  selectedObjects.forEach((object3D) => {
    if (!object3D) {
      return;
    }
    object3D.position.y += offset;
    object3D.updateMatrixWorld(true);
  });
}

const primitiveFactories = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 32, 16),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  plane: () => new THREE.PlaneGeometry(1, 1, 1, 1),
};

const primitiveDisplayNames = {
  box: "Box",
  sphere: "Sphere",
  cylinder: "Cylinder",
  plane: "Plane",
};

function createPrimitiveMesh(shape) {
  const geometryFactory = primitiveFactories[shape];
  if (!geometryFactory) {
    return null;
  }

  const geometry = geometryFactory();
  const material = new THREE.MeshStandardMaterial({
    color: colorInput?.value ?? "#ffffff",
    metalness: Number.parseFloat(metalnessInput?.value ?? "0") || 0,
    roughness: Number.parseFloat(roughnessInput?.value ?? "1") || 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  if (shape === "plane") {
    mesh.rotation.x = -Math.PI / 2;
  }

  centerObject(mesh);

  const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  const offset = new THREE.Vector3(
    (Math.random() - 0.5) * 4,
    size.y / 2,
    (Math.random() - 0.5) * 4
  );
  mesh.position.add(offset);

  return mesh;
}

function centerObject(object3D) {
  const box = new THREE.Box3().setFromObject(object3D);
  const center = box.getCenter(new THREE.Vector3());
  object3D.position.sub(center);
}

function focusObject(object3D) {
  if (!object3D) {
    return;
  }

  const box = new THREE.Box3().setFromObject(object3D);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxSize = Math.max(size.x, size.y, size.z);
  const fitHeightDistance =
    maxSize /
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.5;

  const direction = new THREE.Vector3(1, 0.75, 1).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  orbitControls.target.copy(center);
  orbitControls.update();
}

function updateHud(object3D) {
  if (!object3D) {
    resetHud();
    return;
  }

  const figureId = ensureFigureId(object3D);
  const box = reusableBoundingBox.setFromObject(object3D);
  const size = box.getSize(reusableSizeVector);
  const center = getDisplayCenterFromBox(box, reusableDisplayCenterVector);

  let vertexCount = 0;
  let drawCallCount = 0;
  object3D.traverse((child) => {
    if (child.isMesh && child.geometry) {
      drawCallCount += 1;
      const positionAttr = child.geometry.getAttribute("position");
      if (positionAttr) {
        vertexCount += positionAttr.count;
      }
    }
  });

  const sizeText = `Size: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(
    2
  )}`;
  const centerText = `Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(
    2
  )})`;
  const countsText = `Vertices: ${vertexCount.toLocaleString()} · Draw calls: ${drawCallCount}`;
  const lines = [];
  if (figureId) {
    lines.push(`ID: ${figureId}`);
  }
  lines.push(sizeText, centerText, countsText);
  hudInfo.textContent = lines.join("\n");
}

function resetControlSet(controlSet, placeholder = "No selection") {
  if (!controlSet) {
    return;
  }

  const {
    figureIdInput: controlFigureId,
    centerInputs: controlCenterInputs = {},
    sizeInputs: controlSizeInputs = {},
    container,
    hideWhenDisabled = false,
  } = controlSet;

  if (controlFigureId) {
    controlFigureId.value = "";
    if (placeholder !== undefined) {
      controlFigureId.placeholder = placeholder;
    }
    controlFigureId.disabled = true;
  }

  Object.values(controlCenterInputs).forEach((input) => {
    if (input) {
      input.value = "";
      input.placeholder = "—";
      input.disabled = true;
    }
  });

  Object.values(controlSizeInputs).forEach((input) => {
    if (input) {
      input.value = "";
      input.placeholder = "—";
      input.disabled = true;
    }
  });

  if (container && hideWhenDisabled) {
    container.hidden = true;
  }
}

function populateControlSet(controlSet, { figureId, center, size }) {
  if (!controlSet) {
    return;
  }

  const {
    figureIdInput: controlFigureId,
    centerInputs: controlCenterInputs = {},
    sizeInputs: controlSizeInputs = {},
    container,
    hideWhenDisabled = false,
  } = controlSet;

  if (controlFigureId) {
    controlFigureId.disabled = false;
    controlFigureId.placeholder = "";
    controlFigureId.value = figureId ?? "";
  }

  Object.entries(controlCenterInputs).forEach(([axis, input]) => {
    if (!input) {
      return;
    }
    input.disabled = false;
    const value = center?.[axis];
    input.value = Number.isFinite(value) ? value.toFixed(2) : "";
    input.placeholder = "—";
  });

  Object.entries(controlSizeInputs).forEach(([axis, input]) => {
    if (!input) {
      return;
    }
    input.disabled = false;
    const value = size?.[axis];
    input.value = Number.isFinite(value) ? value.toFixed(2) : "";
    input.placeholder = "—";
  });

  if (container && hideWhenDisabled) {
    container.hidden = false;
  }
}

function setMotionControlsDisabled(disabled) {
  if (motionSpeedInput) {
    motionSpeedInput.disabled = disabled;
  }
  Object.values(motionAxisInputs).forEach((input) => {
    if (input) {
      input.disabled = disabled;
    }
  });
  motionControlGroups.forEach((group) => {
    if (disabled) {
      group.dataset.disabled = "true";
    } else {
      delete group.dataset.disabled;
    }
  });
}

function disableMotionControls(message = "Select a model to configure animation.") {
  if (motionToggle) {
    motionToggle.checked = false;
    motionToggle.disabled = true;
  }
  setMotionControlsDisabled(true);
  if (motionStatusLabel) {
    motionStatusLabel.textContent = message;
  }
  if (motionSpeedInput) {
    motionSpeedInput.value = String(MOTION_DEFAULT_SPEED);
  }
  updateMotionSpeedLabel(MOTION_DEFAULT_SPEED);
  Object.entries(motionAxisInputs).forEach(([axis, input]) => {
    if (input) {
      input.checked = Boolean(MOTION_DEFAULT_AXES[axis]);
    }
  });
}

function updateMotionSpeedLabel(speed) {
  if (!motionSpeedValueLabel) {
    return;
  }
  const rounded = Math.round(speed);
  const suffix = `${rounded}°/s`;
  motionSpeedValueLabel.textContent = suffix;
}

function normalizeMotionConfig(motion) {
  if (!motion || typeof motion !== "object") {
    return null;
  }
  const axes = motion.axes && typeof motion.axes === "object" ? motion.axes : {};
  const normalizedAxes = {
    x: Boolean(axes.x),
    y: Boolean(axes.y),
    z: Boolean(axes.z),
  };
  if (!normalizedAxes.x && !normalizedAxes.y && !normalizedAxes.z) {
    normalizedAxes.x = MOTION_DEFAULT_AXES.x;
    normalizedAxes.y = MOTION_DEFAULT_AXES.y;
    normalizedAxes.z = MOTION_DEFAULT_AXES.z;
  }
  const clampedSpeed = Number.isFinite(motion.speed)
    ? THREE.MathUtils.clamp(motion.speed, -180, 180)
    : MOTION_DEFAULT_SPEED;
  motion.axes = normalizedAxes;
  motion.speed = clampedSpeed;
  motion.enabled = Boolean(motion.enabled);
  return motion;
}

function ensureMotionConfig(object3D) {
  if (!object3D) {
    return null;
  }
  if (!object3D.userData || typeof object3D.userData !== "object") {
    object3D.userData = {};
  }
  if (!object3D.userData.motion || typeof object3D.userData.motion !== "object") {
    object3D.userData.motion = {
      enabled: false,
      speed: MOTION_DEFAULT_SPEED,
      axes: { ...MOTION_DEFAULT_AXES },
    };
  }
  return normalizeMotionConfig(object3D.userData.motion);
}

function registerAnimatedObject(object3D) {
  if (!object3D) {
    return;
  }
  const motion = normalizeMotionConfig(object3D.userData?.motion);
  if (!motion || !motion.enabled) {
    animatedObjects.delete(object3D.uuid);
    return;
  }
  animatedObjects.set(object3D.uuid, object3D);
}

function unregisterAnimatedObject(object3D) {
  if (!object3D) {
    return;
  }
  animatedObjects.delete(object3D.uuid);
}

function rebuildAnimationRegistry() {
  animatedObjects.clear();
  sceneRoot.traverse((child) => {
    const motion = normalizeMotionConfig(child.userData?.motion);
    if (motion?.enabled) {
      animatedObjects.set(child.uuid, child);
    }
  });
}

function syncAnimationControls() {
  if (!motionToggle) {
    return;
  }

  if (!currentSelection) {
    disableMotionControls("Select a model to configure animation.");
    return;
  }

  if (selectedObjects.size > 1) {
    disableMotionControls("Animation editing works with one model at a time.");
    return;
  }

  const motion = ensureMotionConfig(currentSelection);
  const speed = motion?.speed ?? MOTION_DEFAULT_SPEED;
  motionToggle.disabled = false;
  motionToggle.checked = Boolean(motion?.enabled);
  setMotionControlsDisabled(!motion?.enabled);
  if (motionSpeedInput) {
    motionSpeedInput.value = String(speed);
  }
  updateMotionSpeedLabel(speed);

  Object.entries(motionAxisInputs).forEach(([axis, input]) => {
    if (input) {
      input.checked = Boolean(motion?.axes?.[axis]);
    }
  });

  if (motionStatusLabel) {
    motionStatusLabel.textContent = motion?.enabled
      ? "Animation enabled for this model."
      : "Enable animation to start rotation.";
  }
}

function disableInspectorInputs(placeholder = "No selection") {
  resetControlSet(inspectorControlSet, placeholder);
  resetControlSet(hudControlSet, placeholder);
}

function syncInspectorInputs() {
  const hasInspectorControls =
    figureIdInput ||
    Object.values(centerInputs).some(Boolean) ||
    Object.values(sizeInputs).some(Boolean);
  const hasHudControls =
    hudFigureIdInput ||
    Object.values(hudCenterInputs).some(Boolean) ||
    Object.values(hudSizeInputs).some(Boolean);

  if (!hasInspectorControls && !hasHudControls) {
    return;
  }

  if (!currentSelection) {
    disableInspectorInputs("No selection");
    return;
  }

  if (selectedObjects.size > 1) {
    disableInspectorInputs("Multiple selected");
    return;
  }

  const figureId = ensureFigureId(currentSelection);
  const box = reusableBoundingBox.setFromObject(currentSelection);
  const size = box.getSize(reusableSizeVector);
  const center = getDisplayCenterFromBox(box, reusableDisplayCenterVector);

  populateControlSet(inspectorControlSet, { figureId, center, size });
  populateControlSet(hudControlSet, { figureId, center, size });
}

disableInspectorInputs();
renderPartsList();
syncAnimationControls();

function updateColorPickerPreview(color) {
  if (!colorPicker) {
    return;
  }

  const nextColor = color ?? colorInput?.value ?? "#ffffff";
  colorPicker.style.setProperty("--preview-color", nextColor);
}

function setMaterialControlsEnabled(enabled) {
  if (colorInput) {
    colorInput.disabled = !enabled;
  }
  if (colorPicker) {
    if (!enabled) {
      colorPicker.dataset.disabled = "true";
      colorPicker.setAttribute("aria-disabled", "true");
    } else {
      delete colorPicker.dataset.disabled;
      colorPicker.setAttribute("aria-disabled", "false");
    }
  }
  if (metalnessInput) {
    metalnessInput.disabled = !enabled;
  }
  if (roughnessInput) {
    roughnessInput.disabled = !enabled;
  }
  setTextureControlsEnabled(enabled);
}

function syncMaterialInputs() {
  if (!editableMeshes.length) {
    setMaterialControlsEnabled(false);
    if (colorInput) {
      colorInput.value = "#ffffff";
    }
    updateColorPickerPreview("#ffffff");
    if (metalnessInput) {
      metalnessInput.value = "0";
    }
    if (roughnessInput) {
      roughnessInput.value = "1";
    }
    syncTextureControls();
    return;
  }

  setMaterialControlsEnabled(true);
  const firstMesh = editableMeshes[0];
  const material = Array.isArray(firstMesh.material)
    ? firstMesh.material[0]
    : firstMesh.material;
  if (material && material.color) {
    const hexColor = `#${material.color.getHexString()}`;
    if (colorInput) {
      colorInput.value = hexColor;
    }
    updateColorPickerPreview(hexColor);
  }
  if (typeof material?.metalness === "number") {
    if (metalnessInput) {
      metalnessInput.value = material.metalness.toString();
    }
  }
  if (typeof material?.roughness === "number") {
    if (roughnessInput) {
      roughnessInput.value = material.roughness.toString();
    }
  }
  syncTextureControls();
}

function applyMaterialProperty(property, value) {
  editableMeshes.forEach((mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((mat) => {
      if (!mat) {
        return;
      }
      if (property === "color") {
        mat.color.set(value);
      } else {
        mat[property] = value;
      }
      mat.needsUpdate = true;
    });
  });
  if (property === "color") {
    updateColorPickerPreview(value);
  }
  updateHud(currentSelection);
  if (!isRestoringHistory) {
    scheduleHistoryCommit();
  }
}

function findSceneObjectFromChild(child) {
  let current = child;
  while (current && current.parent && current.parent !== sceneRoot) {
    current = current.parent;
  }
  if (!current) {
    return null;
  }
  return current.parent === sceneRoot ? current : null;
}

function pickSceneObject(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const normalizedX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const normalizedY = -((clientY - rect.top) / rect.height) * 2 + 1;
  pointerNDC.set(normalizedX, normalizedY);
  raycaster.setFromCamera(pointerNDC, camera);
  const intersections = raycaster.intersectObjects(sceneRoot.children, true);
  for (const hit of intersections) {
    const candidate = findSceneObjectFromChild(hit.object);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function handlePointerDown(event) {
  if (event.button !== 0) {
    pointerDownInfo = null;
    return;
  }
  const composedPath =
    typeof event.composedPath === "function" ? event.composedPath() : null;
  let interactedWithCanvas = event.currentTarget === renderer.domElement;
  if (!interactedWithCanvas && event.target === renderer.domElement) {
    interactedWithCanvas = true;
  } else if (!interactedWithCanvas && Array.isArray(composedPath)) {
    interactedWithCanvas = composedPath.includes(renderer.domElement);
  }
  pointerDownInfo = {
    x: event.clientX,
    y: event.clientY,
    active: interactedWithCanvas,
  };
}

function handlePointerUp(event) {
  if (event.button !== 0) {
    pointerDownInfo = null;
    return;
  }
  if (!pointerDownInfo || !pointerDownInfo.active) {
    pointerDownInfo = null;
    return;
  }

  const { x, y } = pointerDownInfo;
  pointerDownInfo = null;

  if (isTransformDragging) {
    return;
  }

  const movement = Math.hypot(event.clientX - x, event.clientY - y);
  if (movement > POINTER_CLICK_THRESHOLD) {
    return;
  }

  const picked = pickSceneObject(event.clientX, event.clientY);
  if (picked) {
    const sourceName = picked.userData?.sourceName ?? "Scene object";
    const multiSelect = event.ctrlKey || event.metaKey;
    if (multiSelect) {
      toggleSelection(picked, sourceName);
    } else {
      setCurrentSelection(picked, sourceName, {
        focus: false,
        addToScene: false,
      });
    }
  } else if (!event.ctrlKey && !event.metaKey && selectedObjects.size) {
    setCurrentSelection(null, undefined, { focus: false });
  }
}

function setCurrentSelection(
  object3D,
  sourceName = "Imported model",
  { focus = true, addToScene = true, append = false } = {}
) {
  cancelScheduledHistoryCommit();
  transformHasChanged = false;

  if (!append && currentSelection && currentSelection !== object3D) {
    transformControls.detach();
  }

  if (!object3D) {
    currentSelection = null;
    selectedObjects.clear();
    editableMeshes = [];
    syncMaterialInputs();
    syncInspectorInputs();
    syncAnimationControls();
    if (sceneRoot.children.length) {
      hudModel.textContent = "No object selected.";
      hudInfo.textContent = "";
      setStatus("idle", "No selection");
    } else {
      resetHud();
      setStatus("idle", "No selection");
    }
    syncPartsListSelection();
    return;
  }

  const shouldAddToScene = addToScene && object3D.parent !== sceneRoot;
  if (shouldAddToScene) {
    sceneRoot.add(object3D);
  }

  const shouldRefreshPartsList = shouldAddToScene;

  if (!append) {
    selectedObjects.clear();
  }

  ensureFigureId(object3D);
  selectedObjects.add(object3D);

  if (append && currentSelection && currentSelection !== object3D) {
    transformControls.detach();
  }

  currentSelection = object3D;
  currentSelection.userData.sourceName = sourceName;
  editableMeshes = collectEditableMeshesForSelection(selectedObjects);
  transformControls.attach(currentSelection);
  setTransformMode(activeTransformMode);
  const selectionCount = selectedObjects.size;
  const statusMessage =
    selectionCount > 1
      ? `Selected ${selectionCount} objects (active: ${sourceName})`
      : `Selected: ${sourceName}`;
  setStatus("ready", statusMessage);
  syncMaterialInputs();
  if (focus) {
    focusObject(currentSelection);
  }
  updateHud(currentSelection);
  syncInspectorInputs();
  syncAnimationControls();
  if (shouldRefreshPartsList) {
    renderPartsList();
  } else {
    syncPartsListSelection();
  }
}

function toggleSelection(object3D, sourceName, options = {}) {
  if (!object3D) {
    return;
  }

  if (selectedObjects.has(object3D)) {
    selectedObjects.delete(object3D);
    if (!selectedObjects.size) {
      setCurrentSelection(null, undefined, { focus: false });
      return;
    }

    const nextActive = Array.from(selectedObjects).pop();
    const nextName = nextActive.userData?.sourceName ?? "Scene object";
    setCurrentSelection(nextActive, nextName, {
      focus: false,
      addToScene: false,
      append: true,
      ...options,
    });
    return;
  }

  setCurrentSelection(object3D, sourceName, {
    focus: false,
    addToScene: false,
    append: true,
    ...options,
  });
}

function deleteSelectedObjects() {
  if (!selectedObjects.size) {
    return;
  }

  const toRemove = Array.from(selectedObjects);
  toRemove.forEach((object3D) => {
    object3D?.removeFromParent?.();
  });

  rebuildFigureIdRegistry();

  const count = toRemove.length;
  setCurrentSelection(null, undefined, { focus: false });
  hudInfo.textContent = "";
  setStatus(
    "ready",
    `Deleted ${count} object${count === 1 ? "" : "s"}`
  );
  pushHistorySnapshot();
}

function clearScene() {
  flushHistoryCommit();
  transformControls.detach();
  currentSelection = null;
  selectedObjects.clear();
  editableMeshes = [];
  sceneRoot.clear();
  animatedObjects.clear();
  figureIdRegistry.clear();
  nextFigureId = 1;
  renderPartsList();
  syncMaterialInputs();
  disableInspectorInputs();
  syncAnimationControls();
  resetHud();
  transformHasChanged = false;
  setStatus("idle", "Scene cleared");
  if (!isRestoringHistory) {
    pushHistorySnapshot();
  }
}

function getExtensionFromName(name = "") {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function parseGLTF(content, name) {
  return new Promise((resolve, reject) => {
    loaders.gltf.parse(content, "", resolve, (error) => {
      console.error(`Failed to parse GLTF ${name}`, error);
      reject(error);
    });
  });
}

function configureGLTFFileMap(fileMap) {
  if (!fileMap || !fileMap.size) {
    return () => {};
  }

  const manager = loaders.gltf.manager;
  if (!manager || typeof manager.setURLModifier !== "function") {
    return () => {};
  }

  const previousModifier = manager.urlModifier ?? null;
  const objectURLCache = new Map();

  manager.setURLModifier((url) => {
    if (typeof url !== "string") {
      return previousModifier ? previousModifier(url) : url;
    }

    if (url.startsWith("data:") || url.startsWith("blob:")) {
      return url;
    }

    const decodedURL = decodeURI(url);
    const sanitized = decodedURL.split(/[?#]/)[0];
    const normalized = sanitized.replace(/^\.\//, "").replace(/^\//, "");
    const lowerFullPath = normalized.toLowerCase();
    const lowerFileName = lowerFullPath.split("/").pop();

    const matchKey = fileMap.has(lowerFullPath)
      ? lowerFullPath
      : lowerFileName && fileMap.has(lowerFileName)
      ? lowerFileName
      : null;

    if (matchKey) {
      if (!objectURLCache.has(matchKey)) {
        const file = fileMap.get(matchKey);
        objectURLCache.set(matchKey, URL.createObjectURL(file));
      }
      return objectURLCache.get(matchKey);
    }

    return previousModifier ? previousModifier(url) : url;
  });

  return () => {
    if (previousModifier) {
      manager.setURLModifier(previousModifier);
    } else {
      manager.setURLModifier(undefined);
    }
    objectURLCache.forEach((objectURL) => {
      URL.revokeObjectURL(objectURL);
    });
    objectURLCache.clear();
  };
}

function parseGLB(arrayBuffer, name) {
  return new Promise((resolve, reject) => {
    loaders.glb.parse(arrayBuffer, "", resolve, (error) => {
      console.error(`Failed to parse GLB ${name}`, error);
      reject(error);
    });
  });
}

async function loadModelFromData({ name, extension, arrayBuffer, text, url, fileMap }) {
  setStatus("loading", `Loading ${name}…`);
  try {
    let imported = null;
    if (extension === "gltf") {
      const restoreModifier = configureGLTFFileMap(fileMap);
      try {
        if (url) {
          const gltf = await loaders.gltf.loadAsync(url);
          imported = gltf.scene || gltf.scenes?.[0];
        } else if (arrayBuffer) {
          const textContent = new TextDecoder().decode(arrayBuffer);
          const gltf = await parseGLTF(textContent, name);
          imported = gltf.scene || gltf.scenes?.[0];
        } else if (text) {
          const gltf = await parseGLTF(text, name);
          imported = gltf.scene || gltf.scenes?.[0];
        }
      } finally {
        restoreModifier();
      }
    } else if (extension === "glb") {
      if (url) {
        const gltf = await loaders.glb.loadAsync(url);
        imported = gltf.scene || gltf.scenes?.[0];
      } else {
        const gltf = await parseGLB(arrayBuffer, name);
        imported = gltf.scene || gltf.scenes?.[0];
      }
    } else if (extension === "obj") {
      let data = text;
      if (!data && arrayBuffer) {
        data = new TextDecoder().decode(arrayBuffer);
      }
      if (!data && url) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch OBJ file: ${response.status}`);
        }
        data = await response.text();
      }
      if (!data) {
        throw new Error("OBJ data unavailable");
      }

      const materials = await loadMaterialsForObj({
        objText: data,
        fileMap,
        sourceUrl: url,
      });

      try {
        if (materials) {
          loaders.obj.setMaterials(materials);
        }
        imported = loaders.obj.parse(data);
      } finally {
        loaders.obj.setMaterials(null);
      }
    } else if (extension === "fbx") {
      const buffer = arrayBuffer ?? (await fetch(url).then((res) => res.arrayBuffer()));
      imported = loaders.fbx.parse(buffer, name);
    } else if (extension === "stl") {
      const buffer = arrayBuffer ?? (await fetch(url).then((res) => res.arrayBuffer()));
      const geometry = loaders.stl.parse(buffer);
      imported = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: "#ffffff", metalness: 0.1, roughness: 0.8 })
      );
    } else {
      throw new Error(`Unsupported file type: ${extension}`);
    }

    if (!imported) {
      throw new Error("Unable to import model");
    }

    const separationResult = separateImportedObject(imported, name);
    if (separationResult) {
      const { pieces: separatedPieces, children: separatedChildren } = separationResult;
      sceneRoot.updateMatrixWorld(true);
      const boundingBox = new THREE.Box3();
      separatedPieces.forEach((piece) => {
        piece.updateMatrixWorld(true);
        boundingBox.expandByObject(piece);
      });

      const centerOffset = boundingBox.getCenter(new THREE.Vector3());
      separatedChildren.forEach((child) => {
        child.position.sub(centerOffset);
      });

      separatedPieces.forEach((piece) => {
        ensureFigureId(piece);
      });

      renderPartsList();

      const activePiece = separatedPieces[0];
      const activeName =
        (typeof activePiece.userData?.sourceName === "string" &&
          activePiece.userData.sourceName.trim()) ||
        `${name} part 1`;

      setCurrentSelection(activePiece, activeName, { addToScene: false });
      pushHistorySnapshot();
      return;
    }

    centerObject(imported);
    setCurrentSelection(imported, name);
    pushHistorySnapshot();
  } catch (error) {
    console.error("Unable to load model", error);
    setStatus("error", `Failed to load ${name}`);
    hudInfo.textContent = error?.message ?? "Check the browser console for details.";
  }
}

function handleFileList(files) {
  if (!files || !files.length) {
    return;
  }

  const fileArray = Array.from(files);
  const fileMap = new Map();

  fileArray.forEach((entry) => {
    const lowerName = entry.name.toLowerCase();
    if (!fileMap.has(lowerName)) {
      fileMap.set(lowerName, entry);
    }
    if (entry.webkitRelativePath) {
      const relativePath = entry.webkitRelativePath.toLowerCase();
      if (relativePath && !fileMap.has(relativePath)) {
        fileMap.set(relativePath, entry);
      }
      const relativeName = relativePath.split("/").pop();
      if (relativeName && !fileMap.has(relativeName)) {
        fileMap.set(relativeName, entry);
      }
    }
  });

  const primaryFile =
    fileArray.find((entry) => {
      const ext = getExtensionFromName(entry.name);
      return ["gltf", "glb", "obj", "fbx", "stl"].includes(ext);
    }) ?? fileArray[0];

  if (!primaryFile) {
    return;
  }

  const extension = getExtensionFromName(primaryFile.name);
  const reader = new FileReader();

  if (extension === "gltf") {
    reader.onload = () => {
      loadModelFromData({
        name: primaryFile.name,
        extension,
        text: reader.result,
        fileMap,
      });
    };
    reader.readAsText(primaryFile);
  } else if (["glb", "fbx", "stl"].includes(extension)) {
    reader.onload = () => {
      loadModelFromData({
        name: primaryFile.name,
        extension,
        arrayBuffer: reader.result,
        fileMap,
      });
    };
    reader.readAsArrayBuffer(primaryFile);
  } else if (extension === "obj") {
    reader.onload = () => {
      loadModelFromData({
        name: primaryFile.name,
        extension,
        text: reader.result,
        fileMap,
      });
    };
    reader.readAsText(primaryFile);
  } else {
    setStatus("error", "Unsupported file type");
    hudInfo.textContent = `Supported formats: GLTF/GLB, OBJ, FBX, STL.`;
  }
}

fileInput?.addEventListener("change", (event) => {
  const files = event.target.files;
  handleFileList(files);
  fileInput.value = "";
});

dropZone?.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dropZone.dataset.state = "drag";
});

dropZone?.addEventListener("dragover", (event) => {
  event.preventDefault();
});

dropZone?.addEventListener("dragleave", () => {
  dropZone.dataset.state = "idle";
});

dropZone?.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.dataset.state = "idle";
  const files = event.dataTransfer?.files;
  handleFileList(files);
});

sampleSelect?.addEventListener("change", async (event) => {
  const value = event.target.value;
  if (!value) {
    return;
  }
  const name = value.split("/").pop();
  const extension = getExtensionFromName(name);
  await loadModelFromData({ name, extension, url: value });
  sampleSelect.value = "";
});

primitiveContainer?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const button = target.closest("[data-create-shape]");
  if (!(button instanceof HTMLElement)) {
    return;
  }

  const shape = button.dataset.createShape;
  const mesh = createPrimitiveMesh(shape);
  if (!mesh) {
    return;
  }

  const displayName = primitiveDisplayNames[shape] ?? "Primitive";
  setCurrentSelection(mesh, `${displayName} primitive`, { focus: true });
  pushHistorySnapshot();
});

partsListElement?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const visibilityButton = target.closest("button[data-visibility-toggle]");
  if (visibilityButton instanceof HTMLButtonElement) {
    event.preventDefault();
    const uuid = visibilityButton.dataset.objectUuid;
    if (!uuid) {
      return;
    }
    const object3D = sceneRoot.getObjectByProperty("uuid", uuid);
    if (!object3D) {
      renderPartsList();
      return;
    }
    object3D.visible = !object3D.visible;
    updateVisibilityToggleButton(visibilityButton, object3D);
    return;
  }
  const button = target.closest("button[data-part-item]");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  event.preventDefault();
  const uuid = button.dataset.objectUuid;
  if (!uuid) {
    return;
  }
  const object3D = sceneRoot.getObjectByProperty("uuid", uuid);
  if (!object3D) {
    renderPartsList();
    return;
  }
  const sourceName = getObjectDisplayName(object3D);
  const multiSelect = event.ctrlKey || event.metaKey || event.shiftKey;
  if (multiSelect) {
    toggleSelection(object3D, sourceName, { focus: false });
  } else {
    setCurrentSelection(object3D, sourceName, {
      focus: false,
      addToScene: false,
    });
  }
});

resetButton?.addEventListener("click", () => {
  clearScene();
});

function handleFigureIdChange(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  if (!currentSelection || selectedObjects.size > 1) {
    syncInspectorInputs();
    return;
  }

  const proposed = normalizeFigureId(input.value);
  const currentId = normalizeFigureId(currentSelection.userData?.figureId);

  if (!proposed) {
    const ensured = ensureFigureId(currentSelection);
    input.value = ensured ?? "";
    syncInspectorInputs();
    scheduleHistoryCommit();
    updateHud(currentSelection);
    renderPartsList();
    return;
  }

  const existingOwner = figureIdRegistry.get(proposed);
  if (existingOwner && existingOwner !== currentSelection) {
    input.setCustomValidity("Figure ID must be unique.");
    input.reportValidity();
    input.value = currentId ?? "";
    syncInspectorInputs();
    return;
  }

  if (proposed === currentId) {
    input.value = currentId ?? "";
    syncInspectorInputs();
    return;
  }

  if (currentId && figureIdRegistry.get(currentId) === currentSelection) {
    figureIdRegistry.delete(currentId);
  }
  figureIdRegistry.set(proposed, currentSelection);
  currentSelection.userData.figureId = proposed;
  updateNextFigureIdFromValue(proposed);
  input.value = proposed;
  updateHud(currentSelection);
  syncInspectorInputs();
  scheduleHistoryCommit();
  renderPartsList();
}

function handleCenterInputChange(axis, input) {
  if (!input) {
    return;
  }

  if (!currentSelection || selectedObjects.size > 1) {
    syncInspectorInputs();
    return;
  }

  const value = Number.parseFloat(input.value);
  if (!Number.isFinite(value)) {
    syncInspectorInputs();
    return;
  }

  const box = reusableBoundingBox.setFromObject(currentSelection);
  const actualCenter = box.getCenter(reusableCenterVector);
  const displayCenter = getDisplayCenterFromBox(box, reusableDisplayCenterVector);
  const currentValue = axis === "y" ? displayCenter.y : actualCenter[axis];
  const delta = value - currentValue;

  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-3) {
    syncInspectorInputs();
    return;
  }

  currentSelection.position[axis] += delta;
  currentSelection.updateMatrixWorld(true);
  updateHud(currentSelection);
  syncInspectorInputs();
  scheduleHistoryCommit();
}

function handleSizeInputChange(axis, input) {
  if (!input) {
    return;
  }

  if (!currentSelection || selectedObjects.size > 1) {
    syncInspectorInputs();
    return;
  }

  const desired = Number.parseFloat(input.value);
  if (!Number.isFinite(desired) || desired <= 0) {
    syncInspectorInputs();
    return;
  }

  const box = new THREE.Box3().setFromObject(currentSelection);
  const initialMinY = box.min.y;
  const size = box.getSize(new THREE.Vector3());
  const currentSize = size[axis];
  if (!Number.isFinite(currentSize) || currentSize <= 1e-6) {
    syncInspectorInputs();
    return;
  }

  const scaleFactor = desired / currentSize;
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    syncInspectorInputs();
    return;
  }

  currentSelection.scale[axis] *= scaleFactor;
  currentSelection.updateMatrixWorld(true);
  if (axis === "y") {
    enforcePositiveVerticalScale();
    keepSelectionAboveGround(initialMinY);
  }
  updateHud(currentSelection);
  syncInspectorInputs();
  scheduleHistoryCommit();
}

function attachCenterInputHandlers(inputs) {
  Object.entries(inputs).forEach(([axis, input]) => {
    input?.addEventListener("change", () => handleCenterInputChange(axis, input));
  });
}

function attachSizeInputHandlers(inputs) {
  Object.entries(inputs).forEach(([axis, input]) => {
    input?.addEventListener("change", () => handleSizeInputChange(axis, input));
  });
}

[figureIdInput, hudFigureIdInput].forEach((input) => {
  input?.addEventListener("input", () => {
    input.setCustomValidity("");
  });
  input?.addEventListener("change", handleFigureIdChange);
});

attachCenterInputHandlers(centerInputs);
attachCenterInputHandlers(hudCenterInputs);
attachSizeInputHandlers(sizeInputs);
attachSizeInputHandlers(hudSizeInputs);

motionToggle?.addEventListener("change", () => {
  if (!currentSelection || selectedObjects.size !== 1) {
    syncAnimationControls();
    return;
  }

  const motion = ensureMotionConfig(currentSelection);
  motion.enabled = motionToggle.checked;

  const axes = motion.axes ?? { ...MOTION_DEFAULT_AXES };
  if (!axes.x && !axes.y && !axes.z) {
    motion.axes = { ...MOTION_DEFAULT_AXES };
  }

  if (motion.enabled) {
    setMotionControlsDisabled(false);
    registerAnimatedObject(currentSelection);
  } else {
    setMotionControlsDisabled(true);
    unregisterAnimatedObject(currentSelection);
  }

  syncAnimationControls();
  scheduleHistoryCommit();
});

motionSpeedInput?.addEventListener("input", () => {
  const parsed = Number.parseFloat(motionSpeedInput.value);
  const clamped = Number.isFinite(parsed)
    ? THREE.MathUtils.clamp(parsed, -180, 180)
    : MOTION_DEFAULT_SPEED;
  if (motionSpeedInput.value !== String(clamped)) {
    motionSpeedInput.value = String(clamped);
  }
  updateMotionSpeedLabel(clamped);

  if (!currentSelection || selectedObjects.size !== 1) {
    return;
  }

  const motion = ensureMotionConfig(currentSelection);
  motion.speed = clamped;
  if (motion.enabled) {
    registerAnimatedObject(currentSelection);
  }
});

motionSpeedInput?.addEventListener("change", () => {
  if (!currentSelection || selectedObjects.size !== 1) {
    return;
  }
  scheduleHistoryCommit();
});

Object.entries(motionAxisInputs).forEach(([axis, input]) => {
  input?.addEventListener("change", () => {
    if (!currentSelection || selectedObjects.size !== 1) {
      syncAnimationControls();
      return;
    }

    const motion = ensureMotionConfig(currentSelection);
    motion.axes[axis] = input.checked;

    if (!motion.axes.x && !motion.axes.y && !motion.axes.z) {
      motion.axes = { ...MOTION_DEFAULT_AXES };
    }

    if (motion.enabled) {
      registerAnimatedObject(currentSelection);
    }

    syncAnimationControls();
    scheduleHistoryCommit();
  });
});

function setTransformMode(mode) {
  activeTransformMode = mode;
  transformControls.setMode(mode);
  if (!transformButtonsContainer) {
    return;
  }
  Array.from(transformButtonsContainer.querySelectorAll("button")).forEach(
    (button) => {
      button.dataset.active = button.dataset.mode === mode ? "true" : "false";
    }
  );
}

transformButtonsContainer?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) {
    return;
  }
  const mode = button.dataset.mode;
  setTransformMode(mode);
});

renderer.domElement?.addEventListener("pointerdown", handlePointerDown);
window.addEventListener("pointerup", handlePointerUp);

function isEditableTarget(target) {
  if (!target) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName;
  if (!tagName) {
    return false;
  }

  const normalized = tagName.toLowerCase();
  return normalized === "input" || normalized === "textarea" || normalized === "select";
}

window.addEventListener("keydown", (event) => {
  if (isEditableTarget(event.target)) {
    return;
  }

  const key = event.key.toLowerCase();
  const modifierActive = event.metaKey || event.ctrlKey;

  if (modifierActive && key === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoLastChange();
    } else {
      undoLastChange();
    }
    return;
  }

  if (modifierActive && key === "y") {
    event.preventDefault();
    redoLastChange();
    return;
  }

  const navigationKey = navigationKeyMap.get(key);
  if (navigationKey) {
    navigationState[navigationKey] = true;
    event.preventDefault();
  }

  if (key === "f") {
    focusObject(currentSelection);
  }

  if (key === "delete" || key === "backspace") {
    if (selectedObjects.size) {
      event.preventDefault();
      deleteSelectedObjects();
    }
    return;
  }

  if (!currentSelection) {
    return;
  }

  if (key === "g") {
    setTransformMode("translate");
  } else if (key === "r") {
    setTransformMode("rotate");
  } else if (key === "s") {
    setTransformMode("scale");
  }
});

window.addEventListener("keyup", (event) => {
  if (isEditableTarget(event.target)) {
    return;
  }

  const key = event.key.toLowerCase();
  const navigationKey = navigationKeyMap.get(key);
  if (navigationKey) {
    navigationState[navigationKey] = false;
    event.preventDefault();
  }
});

window.addEventListener("blur", () => {
  Object.keys(navigationState).forEach((stateKey) => {
    navigationState[stateKey] = false;
  });
});

colorInput?.addEventListener("input", (event) => {
  const nextColor = event.target.value;
  updateColorPickerPreview(nextColor);
  applyMaterialProperty("color", nextColor);
});

metalnessInput?.addEventListener("input", (event) => {
  const value = Number.parseFloat(event.target.value);
  applyMaterialProperty("metalness", THREE.MathUtils.clamp(value, 0, 1));
});

roughnessInput?.addEventListener("input", (event) => {
  const value = Number.parseFloat(event.target.value);
  applyMaterialProperty("roughness", THREE.MathUtils.clamp(value, 0, 1));
});

updateColorPickerPreview(colorInput?.value ?? "#ffffff");

texturePackSelect?.addEventListener("change", (event) => {
  const packId = event.target.value;
  textureState.activePackId = packId || null;
  initializeTextureControls()
    .then(() => {
      const applied = getAppliedTextureReference(getPrimaryEditableMaterial());
      const selectedTextureId =
        applied && applied.packId === packId ? applied.textureId : null;
      return renderTextureGrid(packId, { selectedTextureId });
    })
    .finally(() => {
      syncTextureControls();
    });
});

textureGrid?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-texture-id]");
  if (!button || button.disabled) {
    return;
  }
  event.preventDefault();
  button.blur();
  const packId = button.dataset.packId || texturePackSelect?.value || null;
  const textureId = button.dataset.textureId || null;
  textureState.activePackId = packId || null;
  textureState.activeTextureId = textureId || null;
  const applied = getAppliedTextureReference(getPrimaryEditableMaterial());
  if (
    (!textureId && !applied) ||
    (applied && applied.packId === packId && applied.textureId === textureId)
  ) {
    return;
  }
  void applyTextureSelection(packId, textureId, { announce: true });
});

function saveSession() {
  if (!sceneRoot.children.length) {
    setStatus("error", "No scene to save");
    hudInfo.textContent = "Add a model before saving a session.";
    return;
  }
  try {
    const snapshot = captureSceneSnapshot();
    const sessionData = {
      version: 4,
      selectionUUID: snapshot.selectionUUID,
      material: snapshot.material,
      objectJSON: snapshot.objectJSON,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
    setStatus("ready", "Session saved locally");
  } catch (error) {
    console.error("Unable to save session", error);
    setStatus("error", "Failed to save session");
    hudInfo.textContent = error?.message ?? "Local storage is unavailable.";
  }
}

function restoreSession() {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) {
      setStatus("error", "No saved session found");
      hudInfo.textContent = "Save a session before trying to restore.";
      return;
    }

    const parsed = JSON.parse(serialized);
    const loader = new THREE.ObjectLoader();
    let snapshot;

    const version = parsed.version ?? 1;

    if (version === 1) {
      const restored = loader.parse(parsed.objectJSON);
      restored.userData.sourceName = parsed.sourceName ?? "Restored model";
      const tempRoot = new THREE.Group();
      tempRoot.add(restored);
      snapshot = {
        objectJSON: tempRoot.toJSON(),
        selectionUUID: restored.uuid,
        material: parsed.material ?? null,
        signature: null,
      };
    } else {
      snapshot = {
        objectJSON: parsed.objectJSON,
        selectionUUID: parsed.selectionUUID ?? null,
        material: parsed.material ?? null,
        signature: null,
      };
    }

    applySnapshot(snapshot);
    resetHistoryTracking();
    setStatus("ready", "Session restored");
  } catch (error) {
    console.error("Unable to restore session", error);
    setStatus("error", "Failed to restore session");
    hudInfo.textContent = error?.message ?? "Corrupted session data.";
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  setStatus("idle", "Saved session cleared");
  hudInfo.textContent = "";
}

function exportScene() {
  if (!sceneRoot.children.length) {
    setStatus("error", "No scene to export");
    hudInfo.textContent = "Add a model before exporting.";
    return;
  }

  setStatus("loading", "Exporting scene…");
  gltfExporter.parse(
    sceneRoot,
    (result) => {
      const blob = new Blob([result], { type: "model/gltf-binary" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const activeName = currentSelection?.userData?.sourceName;
      const safeName = (activeName || "scene")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/gi, "")
        .toLowerCase();
      anchor.href = url;
      anchor.download = `${safeName || "scene"}.glb`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("ready", "Export complete");
    },
    (error) => {
      console.error("Failed to export GLB", error);
      setStatus("error", "Export failed");
      hudInfo.textContent = error?.message ?? "Could not export the current scene.";
    },
    { binary: true }
  );
}

saveSessionButton?.addEventListener("click", saveSession);
restoreSessionButton?.addEventListener("click", restoreSession);
clearSessionButton?.addEventListener("click", clearSession);
exportButton?.addEventListener("click", exportScene);

setTransformMode("translate");
initializeTextureControls();

resetHud();
resetHistoryTracking();

// Restore automatically on load if a session is available
try {
  const existingSession = localStorage.getItem(STORAGE_KEY);
  if (existingSession) {
    restoreSession();
  }
} catch (error) {
  console.warn("Unable to access storage", error);
}
