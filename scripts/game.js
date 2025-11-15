import { logout } from "./auth.js";
import { initScene } from "./scene.js";
import {
  DEFAULT_PLAYER_HEIGHT,
  clearStoredPlayerState,
} from "./player-state-storage.js";

const canvas = document.getElementById("gameCanvas");
const instructions = document.querySelector("[data-instructions]");
const logoutButton = document.querySelector("[data-logout-button]");
const resetButton = document.querySelector("[data-reset-button]");
const errorMessage = document.getElementById("logoutError");
const terminalToast = document.getElementById("terminalToast");
const resourceToast = document.getElementById("resourceToast");
const resourceToolIndicator = document.querySelector(
  "[data-resource-tool-indicator]"
);
const crosshair = document.querySelector(".crosshair");
const quickSlotBar = document.querySelector("[data-quick-slot-bar]");
const resourceToolLabel = document.querySelector("[data-resource-tool-label]");
const resourceToolDescription = document.querySelector(
  "[data-resource-tool-description]"
);
const crosshairStates = {
  terminal: false,
  edit: false,
  lift: false,
};
let previousCrosshairInteractableState =
  crosshair instanceof HTMLElement && crosshair.dataset.interactable === "true";

if (previousCrosshairInteractableState) {
  crosshairStates.terminal = true;
}

const applyCrosshairInteractableState = () => {
  const nextState = Object.values(crosshairStates).some(Boolean);

  if (!(crosshair instanceof HTMLElement)) {
    previousCrosshairInteractableState = nextState;
    return;
  }

  if (!previousCrosshairInteractableState && nextState) {
    playTerminalInteractionSound();
  }

  if (nextState) {
    crosshair.dataset.interactable = "true";
  } else {
    delete crosshair.dataset.interactable;
  }

  previousCrosshairInteractableState = nextState;
};

const setCrosshairSourceState = (source, canInteract) => {
  if (!(source in crosshairStates)) {
    return;
  }

  const nextValue = Boolean(canInteract);

  if (crosshairStates[source] === nextValue) {
    return;
  }

  crosshairStates[source] = nextValue;
  applyCrosshairInteractableState();
};

const resetCrosshairInteractableState = () => {
  let changed = false;

  Object.keys(crosshairStates).forEach((key) => {
    if (!crosshairStates[key]) {
      return;
    }

    crosshairStates[key] = false;
    changed = true;
  });

  if (changed) {
    applyCrosshairInteractableState();
  }
};
const quickAccessModal = document.querySelector(".quick-access-modal");
const quickAccessModalDialog = quickAccessModal?.querySelector(
  ".quick-access-modal__dialog"
);
const quickAccessModalContent = quickAccessModal?.querySelector(
  ".quick-access-modal__content"
);
const quickAccessModalMatrix = quickAccessModal?.querySelector(
  ".quick-access-modal__matrix"
);

const inventoryPanel = document.querySelector("[data-inventory-panel]");
const inventoryDialog = inventoryPanel?.querySelector("[data-inventory-dialog]");
const inventoryList = inventoryPanel?.querySelector("[data-inventory-list]");
const inventoryEmptyState = inventoryPanel?.querySelector("[data-inventory-empty]");
const inventorySummary = inventoryPanel?.querySelector("[data-inventory-summary]");
const inventoryCloseButton = inventoryPanel?.querySelector(
  "[data-inventory-close-button]"
);

const modelPalette = document.querySelector("[data-model-palette]");
const modelPaletteDialog = modelPalette?.querySelector(
  "[data-model-palette-dialog]"
);
const modelPaletteList = modelPalette?.querySelector(
  "[data-model-palette-list]"
);
const modelPaletteStatus = modelPalette?.querySelector(
  "[data-model-palette-status]"
);
const modelPaletteClose = modelPalette?.querySelector(
  "[data-model-palette-close]"
);

const quickAccessModalTemplates = {
  default: document.getElementById("quick-access-modal-default"),
  lift: document.getElementById("quick-access-modal-lift"),
  news: document.getElementById("quick-access-modal-news"),
  weather: document.getElementById("quick-access-modal-weather"),
  missions: document.getElementById("quick-access-modal-missions"),
  map: document.getElementById("quick-access-modal-map"),
};

const quickSlotDefinitions = [
  {
    id: "digger",
    label: "Digger",
    description: "Standard issue excavation module.",
  },
  {
    id: "photon-cutter",
    label: "Photon Cutter",
    description: "Equipped for custom map harvesting.",
  },
  {
    id: "arc-welder",
    label: "Arc Welder",
    description: "Fuses structural panels in the field.",
  },
  {
    id: "geo-scanner",
    label: "Geo Scanner",
    description: "Reveals hidden mineral signatures nearby.",
  },
  {
    id: "pulse-barrier",
    label: "Pulse Barrier",
    description: "Deploys a short-lived kinetic shield.",
  },
  {
    id: "gravity-well",
    label: "Gravity Well",
    description: "Pins unstable debris for safe recovery.",
  },
  {
    id: "terraform-spike",
    label: "Terraform Spike",
    description: "Reshapes local terrain on impact.",
  },
  {
    id: "chrono-anchor",
    label: "Chrono Anchor",
    description: "Stabilizes temporal distortions briefly.",
  },
  {
    id: "seismic-charge",
    label: "Seismic Charge",
    description: "Breaks dense rock formations cleanly.",
  },
  {
    id: "aurora-lance",
    label: "Aurora Lance",
    description: "Channels a focused burst of plasma energy.",
  },
];

const quickSlotState = {
  slots: quickSlotDefinitions,
  selectedIndex: 0,
};

const RESOURCE_TOOL_INDICATOR_TOTAL_VISIBLE_DURATION = 7000;
const RESOURCE_TOOL_INDICATOR_FADE_OUT_DURATION = 3000;
const RESOURCE_TOOL_INDICATOR_FADE_DELAY = Math.max(
  RESOURCE_TOOL_INDICATOR_TOTAL_VISIBLE_DURATION -
    RESOURCE_TOOL_INDICATOR_FADE_OUT_DURATION,
  0
);

let resourceToolIndicatorHideTimeoutId = 0;
let resourceToolIndicatorFinalizeTimeoutId = 0;

const quickSlotKeyMap = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Digit7: 6,
  Digit8: 7,
  Digit9: 8,
  Digit0: 9,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
  Numpad5: 4,
  Numpad6: 5,
  Numpad7: 6,
  Numpad8: 7,
  Numpad9: 8,
  Numpad0: 9,
};

const getQuickSlotNumber = (index) => (index === 9 ? "10" : String(index + 1));

const finalizeResourceToolIndicatorHide = () => {
  if (!(resourceToolIndicator instanceof HTMLElement)) {
    return;
  }

  resourceToolIndicator.hidden = true;
  delete resourceToolIndicator.dataset.fading;
  delete resourceToolIndicator.dataset.visible;
  resourceToolIndicator.style.removeProperty(
    "--resource-tool-indicator-transition-duration"
  );
  resourceToolIndicatorHideTimeoutId = 0;
  resourceToolIndicatorFinalizeTimeoutId = 0;
};

const startResourceToolIndicatorFade = () => {
  if (!(resourceToolIndicator instanceof HTMLElement)) {
    return;
  }

  window.clearTimeout(resourceToolIndicatorFinalizeTimeoutId);
  resourceToolIndicatorHideTimeoutId = 0;

  resourceToolIndicator.dataset.visible = "false";
  resourceToolIndicator.dataset.fading = "true";

  resourceToolIndicatorFinalizeTimeoutId = window.setTimeout(() => {
    finalizeResourceToolIndicatorHide();
  }, RESOURCE_TOOL_INDICATOR_FADE_OUT_DURATION);
};

const showResourceToolIndicator = () => {
  if (!(resourceToolIndicator instanceof HTMLElement)) {
    return;
  }

  window.clearTimeout(resourceToolIndicatorHideTimeoutId);
  window.clearTimeout(resourceToolIndicatorFinalizeTimeoutId);
  resourceToolIndicatorHideTimeoutId = 0;
  resourceToolIndicatorFinalizeTimeoutId = 0;

  resourceToolIndicator.hidden = false;
  delete resourceToolIndicator.dataset.fading;
  resourceToolIndicator.dataset.visible = "true";
  resourceToolIndicator.style.removeProperty(
    "--resource-tool-indicator-transition-duration"
  );

  resourceToolIndicatorHideTimeoutId = window.setTimeout(() => {
    startResourceToolIndicatorFade();
  }, RESOURCE_TOOL_INDICATOR_FADE_DELAY);
};

const updateResourceToolIndicator = (slot) => {
  const labelText =
    typeof slot?.label === "string" && slot.label.trim() !== ""
      ? slot.label.trim()
      : "Unassigned slot";
  const descriptionText =
    typeof slot?.description === "string" && slot.description.trim() !== ""
      ? slot.description.trim()
      : "Assign an item or ability to this slot.";

  if (resourceToolLabel instanceof HTMLElement) {
    resourceToolLabel.textContent = labelText;
  }

  if (resourceToolDescription instanceof HTMLElement) {
    resourceToolDescription.textContent = descriptionText;
  }

  showResourceToolIndicator();
};

const updateQuickSlotUi = () => {
  if (quickSlotBar instanceof HTMLElement) {
    const buttons = quickSlotBar.querySelectorAll(".quick-slot-bar__slot");

    buttons.forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }

      const index = Number.parseInt(button.dataset.quickSlotIndex ?? "", 10);
      const isSelected = index === quickSlotState.selectedIndex;

      if (isSelected) {
        button.dataset.selected = "true";
        button.setAttribute("aria-current", "true");
      } else {
        delete button.dataset.selected;
        button.removeAttribute("aria-current");
      }
    });
  }

  updateResourceToolIndicator(
    quickSlotState.slots[quickSlotState.selectedIndex] ?? null
  );
};

const renderQuickSlotBar = () => {
  if (!(quickSlotBar instanceof HTMLElement)) {
    updateResourceToolIndicator(
      quickSlotState.slots[quickSlotState.selectedIndex] ?? null
    );
    return;
  }

  quickSlotBar.innerHTML = "";

  const fragment = document.createDocumentFragment();

  quickSlotState.slots.forEach((slot, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-slot-bar__slot";
    button.dataset.quickSlotIndex = String(index);
    button.setAttribute("role", "listitem");

    const key = document.createElement("span");
    key.className = "quick-slot-bar__slot-key";
    key.textContent = getQuickSlotNumber(index);
    button.appendChild(key);

    const label = document.createElement("span");
    label.className = "quick-slot-bar__slot-label";
    label.textContent =
      typeof slot?.label === "string" && slot.label.trim() !== ""
        ? slot.label.trim()
        : "Empty";
    button.appendChild(label);

    const ariaLabel =
      typeof slot?.label === "string" && slot.label.trim() !== ""
        ? `${slot.label.trim()} — slot ${getQuickSlotNumber(index)}`
        : `Empty slot ${getQuickSlotNumber(index)}`;
    button.setAttribute("aria-label", ariaLabel);
    button.title =
      typeof slot?.label === "string" && slot.label.trim() !== ""
        ? slot.label.trim()
        : `Slot ${getQuickSlotNumber(index)}`;

    fragment.appendChild(button);
  });

  quickSlotBar.appendChild(fragment);
  updateQuickSlotUi();
};

const dispatchQuickSlotChangeEvent = (index) => {
  if (!(canvas instanceof HTMLElement)) {
    return;
  }

  const slot = quickSlotState.slots[index] ?? null;

  try {
    const event = new CustomEvent("quick-slot:change", {
      detail: {
        index,
        slot,
      },
    });

    canvas.dispatchEvent(event);
  } catch (error) {
    console.warn("Unable to dispatch quick slot change event", error);
  }
};

const selectQuickSlot = (index, { userInitiated = false } = {}) => {
  if (!Number.isInteger(index) || index < 0 || index >= quickSlotState.slots.length) {
    return;
  }

  if (quickSlotState.selectedIndex === index) {
    if (userInitiated) {
      dispatchQuickSlotChangeEvent(index);
    }

    return;
  }

  quickSlotState.selectedIndex = index;
  updateQuickSlotUi();
  dispatchQuickSlotChangeEvent(index);
};

const shouldIgnoreQuickSlotHotkey = (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;

  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  return target.isContentEditable;
};

const handleQuickSlotBarClick = (event) => {
  const button =
    event.target instanceof HTMLElement
      ? event.target.closest("[data-quick-slot-index]")
      : null;

  if (!(button instanceof HTMLElement)) {
    return;
  }

  const index = Number.parseInt(button.dataset.quickSlotIndex ?? "", 10);

  if (Number.isNaN(index)) {
    return;
  }

  event.preventDefault();
  selectQuickSlot(index, { userInitiated: true });
};

const handleQuickSlotHotkey = (event) => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  let index = quickSlotKeyMap[event.code];

  if (typeof index !== "number") {
    const key = event.key;

    if (key === "0") {
      index = 9;
    } else if (/^[1-9]$/.test(key)) {
      index = Number.parseInt(key, 10) - 1;
    }
  }

  if (typeof index !== "number") {
    return;
  }

  if (shouldIgnoreQuickSlotHotkey(event)) {
    return;
  }

  event.preventDefault();
  selectQuickSlot(index, { userInitiated: true });
};

if (quickSlotBar instanceof HTMLElement) {
  quickSlotBar.addEventListener("click", handleQuickSlotBarClick);
}

renderQuickSlotBar();
dispatchQuickSlotChangeEvent(quickSlotState.selectedIndex);

const LIFT_MODAL_OPTION = {
  id: "lift",
  title: "Lift control",
  description: "Select your destination deck.",
};

const modalFocusableSelectors =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MODEL_MANIFEST_URL = "models/manifest.json";
let cachedModelManifest = null;
let modelManifestPromise = null;
let modelPaletteOpening = false;
let modelPalettePlacementInProgress = false;
let lastModelPaletteFocusedElement = null;
let modelPaletteWasPointerLocked = false;
let editModeActive = false;

const terminalInteractionSoundSource = "images/index/button_hower.mp3";
const terminalInteractionSound = new Audio();
terminalInteractionSound.preload = "auto";
terminalInteractionSound.src = terminalInteractionSoundSource;
terminalInteractionSound.load();

const playTerminalInteractionSound = () => {
  try {
    terminalInteractionSound.currentTime = 0;
    const playPromise = terminalInteractionSound.play();
    if (playPromise instanceof Promise) {
      playPromise.catch(() => {});
    }
  } catch (error) {
    console.error("Unable to play terminal interaction sound", error);
  }
};

let terminalInteractionSoundUnlockTriggered = false;
const terminalInteractionUnlockEvents = [
  "pointerdown",
  "keydown",
  "touchstart",
  "click",
];

const handleTerminalSoundUnlock = () => {
  if (terminalInteractionSoundUnlockTriggered) {
    return;
  }

  terminalInteractionSoundUnlockTriggered = true;

  terminalInteractionUnlockEvents.forEach((eventName) => {
    document.removeEventListener(eventName, handleTerminalSoundUnlock);
  });

  const previousMutedState = terminalInteractionSound.muted;
  terminalInteractionSound.muted = true;

  const resetSound = () => {
    terminalInteractionSound.pause();
    terminalInteractionSound.currentTime = 0;
    terminalInteractionSound.muted = previousMutedState;
  };

  try {
    const unlockPromise = terminalInteractionSound.play();
    if (unlockPromise instanceof Promise) {
      unlockPromise.then(resetSound).catch(() => {
        terminalInteractionSound.muted = previousMutedState;
      });
    } else {
      resetSound();
    }
  } catch (error) {
    console.error("Unable to unlock terminal interaction sound", error);
    terminalInteractionSound.muted = previousMutedState;
  }
};

terminalInteractionUnlockEvents.forEach((eventName) => {
  document.addEventListener(eventName, handleTerminalSoundUnlock, {
    once: false,
    passive: true,
  });
});
let quickAccessModalClose = null;
let quickAccessModalCloseFallbackId = 0;
let lastFocusedElement = null;
let sceneController = null;
let liftModalActive = false;

const inventoryState = {
  entries: [],
  entryMap: new Map(),
};
const INVENTORY_STORAGE_KEY = "dustyNova.inventory";
const getInventoryStorage = (() => {
  let resolved = false;
  let storage = null;

  return () => {
    if (resolved) {
      return storage;
    }

    resolved = true;

    if (typeof window === "undefined") {
      return null;
    }

    try {
      storage = window.localStorage;

      if (storage) {
        const probeKey = `${INVENTORY_STORAGE_KEY}.probe`;
        storage.setItem(probeKey, "1");
        storage.removeItem(probeKey);
      }
    } catch (error) {
      console.warn("Unable to access localStorage for inventory", error);
      storage = null;
    }

    return storage;
  };
})();
let persistInventoryStateTimeoutId = 0;
let lastSerializedInventoryState = null;
let inventoryWasPointerLocked = false;
let lastInventoryFocusedElement = null;
let inventoryCloseFallbackId = 0;

const attemptToRestorePointerLock = () => {
  const controls = sceneController?.controls;

  if (!controls || controls.isLocked) {
    return;
  }

  if (canvas instanceof HTMLCanvasElement) {
    canvas.focus({ preventScroll: true });
  }

  controls.lock();
};

const QUICK_ACCESS_MATRIX_ENABLED = false;
const MATRIX_CHARACTER_SET = "01010";

const quickAccessMatrixState = {
  container:
    quickAccessModalMatrix instanceof HTMLElement ? quickAccessModalMatrix : null,
  canvas: null,
  context: null,
  animationFrameId: 0,
  pendingStartFrameId: 0,
  width: 0,
  height: 0,
  fontSize: 16,
  columns: 0,
  drops: [],
  running: false,
  dpr: window.devicePixelRatio || 1,
};

const ensureQuickAccessMatrixCanvas = () => {
  if (!QUICK_ACCESS_MATRIX_ENABLED) {
    return false;
  }

  if (!(quickAccessMatrixState.container instanceof HTMLElement)) {
    const container = quickAccessModal?.querySelector(
      ".quick-access-modal__matrix"
    );

    if (container instanceof HTMLElement) {
      quickAccessMatrixState.container = container;
    }
  }

  if (!(quickAccessMatrixState.container instanceof HTMLElement)) {
    return false;
  }

  if (!(quickAccessMatrixState.canvas instanceof HTMLCanvasElement)) {
    const canvas = document.createElement("canvas");
    canvas.className = "quick-access-modal__matrix-canvas";
    canvas.setAttribute("aria-hidden", "true");
    quickAccessMatrixState.container.appendChild(canvas);
    quickAccessMatrixState.canvas = canvas;
  }

  const context = quickAccessMatrixState.canvas.getContext("2d");
  if (!context) {
    return false;
  }

  quickAccessMatrixState.context = context;
  return true;
};

const updateQuickAccessMatrixMetrics = () => {
  if (!ensureQuickAccessMatrixCanvas()) {
    return false;
  }

  const { container, canvas, context } = quickAccessMatrixState;
  if (
    !(container instanceof HTMLElement) ||
    !(canvas instanceof HTMLCanvasElement) ||
    !context
  ) {
    return false;
  }

  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  if (width === 0 || height === 0) {
    return false;
  }

  const devicePixelRatio = window.devicePixelRatio || 1;
  quickAccessMatrixState.dpr = devicePixelRatio;
  quickAccessMatrixState.width = width;
  quickAccessMatrixState.height = height;

  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.textBaseline = "top";
  context.textAlign = "left";

  const fontSize = Math.max(14, Math.floor(width / 48));
  quickAccessMatrixState.fontSize = fontSize;
  quickAccessMatrixState.columns = Math.max(1, Math.floor(width / fontSize));
  quickAccessMatrixState.drops = Array.from(
    { length: quickAccessMatrixState.columns },
    () => Math.random() * (-height / fontSize)
  );

  return true;
};

const drawQuickAccessMatrixFrame = () => {
  if (!quickAccessMatrixState.running) {
    return;
  }

  const { context, width, height, fontSize, drops } = quickAccessMatrixState;
  if (!context) {
    return;
  }

  context.fillStyle = "rgba(2, 6, 23, 0.28)";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(56, 189, 248, 0.85)";
  context.shadowColor = "rgba(56, 189, 248, 0.35)";
  context.shadowBlur = fontSize * 0.45;
  context.font = `${fontSize}px 'Share Tech Mono', 'IBM Plex Mono', 'Courier New', monospace`;

  for (let columnIndex = 0; columnIndex < drops.length; columnIndex += 1) {
    const dropValue = drops[columnIndex];
    const glyphIndex = Math.floor(Math.random() * MATRIX_CHARACTER_SET.length);
    const glyph = MATRIX_CHARACTER_SET.charAt(glyphIndex);
    const x = columnIndex * fontSize;
    const y = dropValue * fontSize;

    context.fillText(glyph, x, y);

    if (y > height && Math.random() > 0.975) {
      drops[columnIndex] = Math.random() * (-height / fontSize);
    } else {
      drops[columnIndex] = dropValue + 1;
    }
  }

  context.shadowBlur = 0;
  context.shadowColor = "transparent";

  quickAccessMatrixState.animationFrameId = window.requestAnimationFrame(
    drawQuickAccessMatrixFrame
  );
};

const handleQuickAccessMatrixResize = () => {
  if (!QUICK_ACCESS_MATRIX_ENABLED) {
    return;
  }

  if (!quickAccessMatrixState.running) {
    return;
  }

  if (updateQuickAccessMatrixMetrics() && quickAccessMatrixState.context) {
    quickAccessMatrixState.context.fillStyle = "rgba(2, 6, 23, 0.3)";
    quickAccessMatrixState.context.fillRect(
      0,
      0,
      quickAccessMatrixState.width,
      quickAccessMatrixState.height
    );
  }
};

const startQuickAccessMatrix = () => {
  if (!QUICK_ACCESS_MATRIX_ENABLED) {
    return;
  }

  if (
    quickAccessMatrixState.running ||
    quickAccessMatrixState.pendingStartFrameId ||
    !quickAccessMatrixState.container ||
    quickAccessModal?.hidden
  ) {
    return;
  }

  if (!updateQuickAccessMatrixMetrics()) {
    quickAccessMatrixState.pendingStartFrameId = window.requestAnimationFrame(() => {
      quickAccessMatrixState.pendingStartFrameId = 0;
      startQuickAccessMatrix();
    });
    return;
  }

  quickAccessMatrixState.running = true;
  window.addEventListener("resize", handleQuickAccessMatrixResize);
  drawQuickAccessMatrixFrame();
};

const stopQuickAccessMatrix = () => {
  if (quickAccessMatrixState.pendingStartFrameId) {
    window.cancelAnimationFrame(quickAccessMatrixState.pendingStartFrameId);
    quickAccessMatrixState.pendingStartFrameId = 0;
  }

  if (!quickAccessMatrixState.running) {
    return;
  }

  quickAccessMatrixState.running = false;
  window.cancelAnimationFrame(quickAccessMatrixState.animationFrameId);
  quickAccessMatrixState.animationFrameId = 0;
  window.removeEventListener("resize", handleQuickAccessMatrixResize);

  const { context, canvas } = quickAccessMatrixState;
  if (context && canvas instanceof HTMLCanvasElement) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  quickAccessMatrixState.drops = [];
  quickAccessMatrixState.columns = 0;
};

let terminalToastHideTimeoutId;
let terminalToastFinalizeTimeoutId;
let resourceToastHideTimeoutId;
let resourceToastFinalizeTimeoutId;

const isTemplateElement = (template) => template instanceof HTMLTemplateElement;

const updateBodyModalState = (isOpen) => {
  document.body.classList.toggle("has-modal-open", Boolean(isOpen));
};

const getModalTemplateForOption = (optionId) => {
  const template = quickAccessModalTemplates[optionId];
  if (isTemplateElement(template)) {
    return template;
  }

  const fallbackTemplate = quickAccessModalTemplates.default;
  return isTemplateElement(fallbackTemplate) ? fallbackTemplate : null;
};

const getModalLabelForOption = (option) => {
  if (option?.id === LIFT_MODAL_OPTION.id) {
    return "Lift navigation panel";
  }

  if (option?.title) {
    return `${option.title} terminal briefing`;
  }

  return "Terminal information panel";
};

const getLiftModalElements = () => {
  if (!quickAccessModalContent) {
    return { list: null, empty: null };
  }

  return {
    list: quickAccessModalContent.querySelector("[data-lift-modal-floor-list]"),
    empty: quickAccessModalContent.querySelector("[data-lift-modal-empty]"),
  };
};

const handleLiftModalFloorButtonClick = (event) => {
  if (!(event?.currentTarget instanceof HTMLButtonElement)) {
    return;
  }

  event.preventDefault();

  const button = event.currentTarget;
  const floorId = button.dataset.floorId;

  if (!floorId || !sceneController?.setActiveLiftFloorById) {
    return;
  }

  if (!sceneController.setActiveLiftFloorById(floorId)) {
    return;
  }

  closeQuickAccessModal();
};

const updateLiftModalActiveState = () => {
  if (!liftModalActive || !quickAccessModalContent) {
    return;
  }

  const activeFloorId = sceneController?.getActiveLiftFloor?.()?.id ?? null;
  const buttons = quickAccessModalContent.querySelectorAll(
    "[data-lift-modal-floor-option]"
  );

  buttons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const isActive = button.dataset.floorId === activeFloorId;
    button.setAttribute("aria-current", isActive ? "true" : "false");
    button.disabled = isActive;
    const status = button.querySelector(".lift-selector__status");
    if (status instanceof HTMLElement) {
      status.hidden = !isActive;
    }
  });
};

const renderLiftModalFloors = () => {
  if (!liftModalActive) {
    return;
  }

  const { list, empty } = getLiftModalElements();

  if (!(list instanceof HTMLElement)) {
    return;
  }

  list.innerHTML = "";
  const floors = sceneController?.getLiftFloors?.() ?? [];
  const hasFloors = Array.isArray(floors) && floors.length > 0;

  if (empty instanceof HTMLElement) {
    empty.hidden = hasFloors;
  }

  if (!hasFloors) {
    return;
  }

  floors.forEach((floor) => {
    if (!floor) {
      return;
    }

    const item = document.createElement("li");
    item.className = "lift-selector__item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "lift-selector__button";
    button.setAttribute("data-lift-modal-floor-option", "");

    if (typeof floor.id === "string" && floor.id.trim() !== "") {
      button.dataset.floorId = floor.id.trim();
    }

    const title = document.createElement("span");
    title.className = "lift-selector__title";
    title.textContent =
      typeof floor.title === "string" && floor.title.trim() !== ""
        ? floor.title.trim()
        : "Unlabeled deck";
    button.appendChild(title);

    if (typeof floor.description === "string" && floor.description.trim() !== "") {
      const description = document.createElement("span");
      description.className = "lift-selector__description";
      description.textContent = floor.description.trim();
      button.appendChild(description);
    }

    const status = document.createElement("span");
    status.className = "lift-selector__status";
    status.textContent = "Current deck";
    status.hidden = true;
    button.appendChild(status);

    button.addEventListener("click", handleLiftModalFloorButtonClick);
    item.appendChild(button);
    list.appendChild(item);
  });

  updateLiftModalActiveState();
};

const initializeQuickAccessModalContent = (option) => {
  liftModalActive = option?.id === LIFT_MODAL_OPTION.id;

  if (liftModalActive) {
    renderLiftModalFloors();
  }
};

const isFocusableElementVisible = (element) => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.hidden || element.getAttribute("aria-hidden") === "true") {
    return false;
  }

  const hiddenAncestor = element.closest('[hidden], [aria-hidden="true"]');
  return hiddenAncestor === null;
};

const isModelPaletteOpen = () =>
  modelPalette instanceof HTMLElement &&
  modelPalette.dataset.open === "true" &&
  modelPalette.hidden !== true;

const isInventoryOpen = () =>
  inventoryPanel instanceof HTMLElement &&
  inventoryPanel.dataset.open === "true" &&
  inventoryPanel.hidden !== true;

const sanitizeInventoryElement = (element = {}) => {
  const symbol =
    typeof element.symbol === "string" ? element.symbol.trim() : "";
  const name = typeof element.name === "string" ? element.name.trim() : "";
  const number = Number.isFinite(element.number) ? element.number : null;

  return { symbol, name, number };
};

const getInventoryEntryKey = (element) => {
  const symbolKey = element.symbol ? element.symbol.toUpperCase() : "";
  const nameKey = element.name ? element.name.toLowerCase() : "";
  const numberKey = element.number !== null ? element.number : "";
  return `${symbolKey}|${nameKey}|${numberKey}`;
};

const updateInventorySummary = () => {
  if (!(inventorySummary instanceof HTMLElement)) {
    return;
  }

  const total = inventoryState.entries.reduce(
    (sum, entry) => sum + entry.count,
    0
  );

  if (total === 0) {
    inventorySummary.textContent = "Inventory empty";
  } else if (total === 1) {
    inventorySummary.textContent = "1 resource collected";
  } else {
    inventorySummary.textContent = `${total} resources collected`;
  }
};

const renderInventoryEntries = () => {
  if (!(inventoryList instanceof HTMLElement)) {
    return;
  }

  inventoryList.innerHTML = "";

  const entries = inventoryState.entries
    .slice()
    .sort((a, b) => b.lastCollectedAt - a.lastCollectedAt);

  if (entries.length === 0) {
    inventoryList.hidden = true;

    if (inventoryEmptyState instanceof HTMLElement) {
      inventoryEmptyState.hidden = false;
    }

    return;
  }

  inventoryList.hidden = false;

  if (inventoryEmptyState instanceof HTMLElement) {
    inventoryEmptyState.hidden = true;
  }

  const fragment = document.createDocumentFragment();

  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "inventory-panel__item";
    item.tabIndex = 0;

    const symbolElement = document.createElement("span");
    symbolElement.className = "inventory-panel__symbol";
    symbolElement.textContent = entry.element.symbol || "???";
    item.appendChild(symbolElement);

    const countElement = document.createElement("span");
    countElement.className = "inventory-panel__count";
    countElement.textContent = `×${entry.count}`;
    item.appendChild(countElement);

    const infoElement = document.createElement("div");
    infoElement.className = "inventory-panel__info";

    const nameElement = document.createElement("p");
    nameElement.className = "inventory-panel__name";
    nameElement.textContent =
      entry.element.name || entry.element.symbol || "Unknown resource";
    infoElement.appendChild(nameElement);

    const metaElement = document.createElement("p");
    metaElement.className = "inventory-panel__meta";

    const metaSegments = [];

    if (entry.element.number !== null) {
      metaSegments.push(`Atomic #${entry.element.number}`);
    }

    if (entry.lastTerrain) {
      metaSegments.push(entry.lastTerrain);
    } else if (entry.terrains.size > 1) {
      metaSegments.push("Multiple sites");
    }

    if (metaSegments.length > 0) {
      metaElement.textContent = metaSegments.join(" • ");
    } else {
      metaElement.hidden = true;
    }

    infoElement.appendChild(metaElement);
    item.appendChild(infoElement);

    const resourceLabelSegments = [];
    const resourceName = nameElement.textContent;
    if (resourceName) {
      resourceLabelSegments.push(resourceName);
    }

    if (entry.count === 1) {
      resourceLabelSegments.push("1 collected");
    } else if (entry.count > 1) {
      resourceLabelSegments.push(`${entry.count} collected`);
    }

    if (metaSegments.length > 0) {
      resourceLabelSegments.push(metaSegments.join(", "));
    }

    if (resourceLabelSegments.length > 0) {
      item.setAttribute("aria-label", resourceLabelSegments.join(", "));
    }

    fragment.appendChild(item);
  });

  inventoryList.appendChild(fragment);
};

const refreshInventoryUi = () => {
  renderInventoryEntries();
  updateInventorySummary();
};

const normalizeTerrainLabel = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
};

const normalizeStoredInventoryEntry = (rawEntry) => {
  if (!rawEntry || typeof rawEntry !== "object") {
    return null;
  }

  const element = sanitizeInventoryElement(rawEntry.element);
  const count = Number.isFinite(rawEntry.count)
    ? Math.max(0, Math.floor(rawEntry.count))
    : 0;

  if (count <= 0) {
    return null;
  }

  const terrains = new Set();

  if (Array.isArray(rawEntry.terrains)) {
    rawEntry.terrains.forEach((terrain) => {
      const normalized = normalizeTerrainLabel(terrain);

      if (normalized) {
        terrains.add(normalized);
      }
    });
  }

  let lastTerrain = normalizeTerrainLabel(rawEntry.lastTerrain);

  if (lastTerrain) {
    terrains.add(lastTerrain);
  } else {
    lastTerrain = null;
  }

  const lastCollectedAt = Number.isFinite(rawEntry.lastCollectedAt)
    ? rawEntry.lastCollectedAt
    : 0;

  const key = getInventoryEntryKey(element);

  return {
    key,
    element: { ...element },
    count,
    terrains,
    lastTerrain,
    lastCollectedAt,
  };
};

const serializeInventoryStateForPersistence = () => ({
  entries: inventoryState.entries.map((entry) => ({
    key: entry.key,
    element: { ...entry.element },
    count: entry.count,
    terrains: Array.from(entry.terrains),
    lastTerrain: entry.lastTerrain,
    lastCollectedAt: entry.lastCollectedAt,
  })),
});

const persistInventoryState = () => {
  const storage = getInventoryStorage();

  if (!storage) {
    return;
  }

  const serialized = JSON.stringify(serializeInventoryStateForPersistence());

  if (serialized === lastSerializedInventoryState) {
    return;
  }

  try {
    storage.setItem(INVENTORY_STORAGE_KEY, serialized);
    lastSerializedInventoryState = serialized;
  } catch (error) {
    console.warn("Unable to persist inventory state", error);
  }
};

const schedulePersistInventoryState = () => {
  if (persistInventoryStateTimeoutId) {
    window.clearTimeout(persistInventoryStateTimeoutId);
  }

  persistInventoryStateTimeoutId = window.setTimeout(() => {
    persistInventoryStateTimeoutId = 0;
    persistInventoryState();
  }, 100);
};

const restoreInventoryStateFromStorage = () => {
  const storage = getInventoryStorage();

  if (!storage) {
    refreshInventoryUi();
    return false;
  }

  let serialized = null;

  try {
    serialized = storage.getItem(INVENTORY_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read stored inventory state", error);
    refreshInventoryUi();
    return false;
  }

  if (typeof serialized !== "string" || serialized.trim() === "") {
    refreshInventoryUi();
    return false;
  }

  let restored = false;

  try {
    const data = JSON.parse(serialized);

    if (data && Array.isArray(data.entries)) {
      const aggregatedEntries = [];
      const aggregatedEntryMap = new Map();

      data.entries.forEach((rawEntry) => {
        const normalized = normalizeStoredInventoryEntry(rawEntry);

        if (!normalized) {
          return;
        }

        const existing = aggregatedEntryMap.get(normalized.key);

        if (!existing) {
          aggregatedEntryMap.set(normalized.key, normalized);
          aggregatedEntries.push(normalized);
          return;
        }

        existing.count += normalized.count;
        normalized.terrains.forEach((terrain) => existing.terrains.add(terrain));

        if (normalized.lastCollectedAt > existing.lastCollectedAt) {
          existing.lastCollectedAt = normalized.lastCollectedAt;
          existing.lastTerrain = normalized.lastTerrain ?? existing.lastTerrain;
        } else if (!existing.lastTerrain && normalized.lastTerrain) {
          existing.lastTerrain = normalized.lastTerrain;
        }

        if (!existing.element.symbol && normalized.element.symbol) {
          existing.element.symbol = normalized.element.symbol;
        }

        if (!existing.element.name && normalized.element.name) {
          existing.element.name = normalized.element.name;
        }

        if (
          existing.element.number === null &&
          normalized.element.number !== null
        ) {
          existing.element.number = normalized.element.number;
        }
      });

      if (aggregatedEntries.length > 0) {
        inventoryState.entries.length = 0;
        inventoryState.entries.push(...aggregatedEntries);

        inventoryState.entryMap.clear();
        aggregatedEntries.forEach((entry) => {
          inventoryState.entryMap.set(entry.key, entry);
        });

        restored = true;
      }
    }
  } catch (error) {
    console.warn("Unable to parse stored inventory state", error);
  }

  if (restored) {
    lastSerializedInventoryState = serialized;
  }

  refreshInventoryUi();
  return restored;
};

const recordInventoryResource = (detail) => {
  if (!detail?.element) {
    return;
  }

  const elementDetails = sanitizeInventoryElement(detail?.element ?? {});

  if (
    !elementDetails.symbol &&
    !elementDetails.name &&
    elementDetails.number === null
  ) {
    elementDetails.name = "Unknown resource";
  }

  const key = getInventoryEntryKey(elementDetails);
  let entry = inventoryState.entryMap.get(key);

  if (!entry) {
    entry = {
      key,
      element: { ...elementDetails },
      count: 0,
      terrains: new Set(),
      lastTerrain: null,
      lastCollectedAt: 0,
    };

    inventoryState.entryMap.set(key, entry);
    inventoryState.entries.push(entry);
  } else {
    if (!entry.element.symbol && elementDetails.symbol) {
      entry.element.symbol = elementDetails.symbol;
    }

    if (!entry.element.name && elementDetails.name) {
      entry.element.name = elementDetails.name;
    }

    if (entry.element.number === null && elementDetails.number !== null) {
      entry.element.number = elementDetails.number;
    }
  }

  entry.count += 1;

  const terrainLabel =
    typeof detail?.terrain?.label === "string"
      ? detail.terrain.label.trim()
      : "";

  if (terrainLabel) {
    entry.terrains.add(terrainLabel);
    entry.lastTerrain = terrainLabel;
  }

  const timestamp =
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  entry.lastCollectedAt = timestamp;

  refreshInventoryUi();
  schedulePersistInventoryState();
};

restoreInventoryStateFromStorage();

const trapFocusWithinInventoryPanel = (event) => {
  if (!(inventoryDialog instanceof HTMLElement)) {
    return;
  }

  const focusableElements = Array.from(
    inventoryDialog.querySelectorAll(modalFocusableSelectors)
  ).filter(
    (element) =>
      element instanceof HTMLElement &&
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex !== -1 &&
      isFocusableElementVisible(element)
  );

  if (focusableElements.length === 0) {
    event.preventDefault();
    return;
  }

  const [firstElement] = focusableElements;
  const lastElement = focusableElements[focusableElements.length - 1];
  const { activeElement } = document;

  if (event.shiftKey) {
    if (activeElement === firstElement || !inventoryDialog.contains(activeElement)) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
    }

    return;
  }

  if (activeElement === lastElement || !inventoryDialog.contains(activeElement)) {
    event.preventDefault();
    firstElement.focus({ preventScroll: true });
  }
};

function handleInventoryPanelKeydown(event) {
  if (!isInventoryOpen()) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeInventoryPanel();
  } else if (event.key === "Tab") {
    trapFocusWithinInventoryPanel(event);
  }
}

const finishClosingInventoryPanel = ({ restoreFocus = true } = {}) => {
  if (!(inventoryPanel instanceof HTMLElement)) {
    return;
  }

  inventoryPanel.hidden = true;
  inventoryPanel.dataset.open = "false";
  inventoryPanel.classList.remove("is-open");
  inventoryPanel.setAttribute("aria-hidden", "true");
  window.clearTimeout(inventoryCloseFallbackId);
  inventoryCloseFallbackId = 0;

  updateBodyModalState(false);
  document.removeEventListener("keydown", handleInventoryPanelKeydown, true);
  sceneController?.setMovementEnabled(true);

  const elementToRefocus = restoreFocus ? lastInventoryFocusedElement : null;
  lastInventoryFocusedElement = null;

  if (elementToRefocus instanceof HTMLElement) {
    elementToRefocus.focus({ preventScroll: true });
  }

  if (inventoryWasPointerLocked) {
    attemptToRestorePointerLock();
  }

  inventoryWasPointerLocked = false;
};

const openInventoryPanel = () => {
  if (
    !(inventoryPanel instanceof HTMLElement) ||
    !(inventoryDialog instanceof HTMLElement)
  ) {
    return;
  }

  if (isInventoryOpen()) {
    return;
  }

  inventoryWasPointerLocked = Boolean(sceneController?.unlockPointerLock?.());
  sceneController?.setMovementEnabled(false);
  hideTerminalToast();
  hideResourceToast();

  lastInventoryFocusedElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  inventoryPanel.hidden = false;
  inventoryPanel.dataset.open = "true";
  inventoryPanel.setAttribute("aria-hidden", "false");
  window.clearTimeout(inventoryCloseFallbackId);
  inventoryCloseFallbackId = 0;

  updateBodyModalState(true);
  document.addEventListener("keydown", handleInventoryPanelKeydown, true);

  requestAnimationFrame(() => {
    inventoryPanel.classList.add("is-open");
  });

  if (inventoryCloseButton instanceof HTMLElement) {
    inventoryCloseButton.focus({ preventScroll: true });
  }
};

const closeInventoryPanel = ({ restoreFocus = true } = {}) => {
  if (!isInventoryOpen() || !(inventoryPanel instanceof HTMLElement)) {
    return;
  }

  inventoryPanel.classList.remove("is-open");
  inventoryPanel.setAttribute("aria-hidden", "true");

  const handleTransitionEnd = (event) => {
    if (event.target !== inventoryPanel) {
      return;
    }

    inventoryPanel.removeEventListener("transitionend", handleTransitionEnd);
    finishClosingInventoryPanel({ restoreFocus });
  };

  inventoryPanel.addEventListener("transitionend", handleTransitionEnd);
  inventoryCloseFallbackId = window.setTimeout(() => {
    inventoryPanel.removeEventListener("transitionend", handleTransitionEnd);
    finishClosingInventoryPanel({ restoreFocus });
  }, 320);
};

const shouldIgnoreInventoryHotkey = (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (inventoryPanel instanceof HTMLElement && inventoryPanel.contains(target)) {
    return false;
  }

  const tagName = target.tagName;

  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  return target.isContentEditable;
};

const handleInventoryHotkey = (event) => {
  if (event.code !== "KeyI" || event.repeat) {
    return;
  }

  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  if (shouldIgnoreInventoryHotkey(event)) {
    return;
  }

  const inventoryCurrentlyOpen = isInventoryOpen();

  if (
    !inventoryCurrentlyOpen &&
    ((quickAccessModal instanceof HTMLElement && !quickAccessModal.hidden) ||
      isModelPaletteOpen())
  ) {
    return;
  }

  event.preventDefault();

  if (inventoryCurrentlyOpen) {
    closeInventoryPanel();
  } else {
    openInventoryPanel();
  }
};

refreshInventoryUi();

const setModelPaletteStatus = (message, { isError = false } = {}) => {
  if (!(modelPaletteStatus instanceof HTMLElement)) {
    return;
  }

  const normalizedMessage =
    typeof message === "string" ? message.trim() : String(message ?? "").trim();

  if (!normalizedMessage) {
    modelPaletteStatus.hidden = true;
    modelPaletteStatus.textContent = "";
    delete modelPaletteStatus.dataset.status;
    return;
  }

  modelPaletteStatus.hidden = false;
  modelPaletteStatus.textContent = normalizedMessage;
  if (isError) {
    modelPaletteStatus.dataset.status = "error";
  } else {
    delete modelPaletteStatus.dataset.status;
  }
};

const setModelPaletteButtonsDisabled = (disabled) => {
  if (!(modelPaletteList instanceof HTMLElement)) {
    return;
  }

  const buttons = modelPaletteList.querySelectorAll("button");
  buttons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.disabled = Boolean(disabled);

    if (!disabled) {
      button.removeAttribute("data-loading");
    }
  });
};

const trapFocusWithinModelPalette = (event) => {
  if (!(modelPaletteDialog instanceof HTMLElement)) {
    return;
  }

  const focusableElements = Array.from(
    modelPaletteDialog.querySelectorAll(modalFocusableSelectors)
  ).filter(
    (element) =>
      element instanceof HTMLElement &&
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex !== -1 &&
      isFocusableElementVisible(element)
  );

  if (focusableElements.length === 0) {
    event.preventDefault();
    return;
  }

  const [firstElement] = focusableElements;
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (event.shiftKey) {
    if (activeElement === firstElement || !modelPaletteDialog.contains(activeElement)) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
    }
  } else if (activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus({ preventScroll: true });
  }
};

const handleModelPaletteKeydown = (event) => {
  if (!isModelPaletteOpen()) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeModelPalette();
  } else if (event.key === "Tab") {
    trapFocusWithinModelPalette(event);
  }
};

const loadModelManifest = async () => {
  if (Array.isArray(cachedModelManifest)) {
    return cachedModelManifest;
  }

  if (!modelManifestPromise) {
    modelManifestPromise = (async () => {
      try {
        const response = await fetch(MODEL_MANIFEST_URL, { cache: "no-store" });

        if (!response.ok) {
          throw new Error(
            `Unable to load the model manifest (${response.status}).`
          );
        }

        const manifest = await response.json();

        if (!Array.isArray(manifest)) {
          throw new Error("Unexpected model manifest format.");
        }

        const parsedEntries = manifest
          .map((entry, index) => {
            const rawPath = typeof entry?.path === "string" ? entry.path.trim() : "";

            if (!rawPath) {
              return null;
            }

            const label =
              typeof entry?.label === "string" && entry.label.trim() !== ""
                ? entry.label.trim()
                : rawPath;

            return {
              id: `${index}:${rawPath}`,
              path: rawPath,
              label,
            };
          })
          .filter(Boolean);

        cachedModelManifest = parsedEntries;
        return parsedEntries;
      } catch (error) {
        console.error("Failed to load model manifest", error);
        throw error;
      } finally {
        modelManifestPromise = null;
      }
    })();
  }

  try {
    const entries = await modelManifestPromise;
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    cachedModelManifest = null;
    throw error;
  }
};

const renderModelPaletteEntries = (entries) => {
  if (!(modelPaletteList instanceof HTMLElement)) {
    return;
  }

  modelPaletteList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const editButton = createModelPaletteEditButton();
  const canEditPlacements = Boolean(sceneController?.hasManifestPlacements?.());
  editButton.disabled = !canEditPlacements;
  fragment.appendChild(editButton);

  const hasEntries = Array.isArray(entries) && entries.length > 0;

  if (hasEntries) {
    const divider = document.createElement("div");
    divider.className = "model-palette__divider";
    fragment.appendChild(divider);

    entries.forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "model-palette__option";
      button.dataset.modelPath = entry.path;

      const labelElement = document.createElement("span");
      labelElement.className = "model-palette__option-label";
      labelElement.textContent = entry.label;

      const pathElement = document.createElement("span");
      pathElement.className = "model-palette__option-path";
      pathElement.textContent = entry.path;

      button.append(labelElement, pathElement);
      button.addEventListener("click", () => {
        handleModelPaletteSelection(entry, button);
      });

      fragment.appendChild(button);
    });
  }

  modelPaletteList.appendChild(fragment);

  if (hasEntries) {
    if (canEditPlacements) {
      setModelPaletteStatus(
        "Select a model to deploy or edit your placed models."
      );
    } else {
      setModelPaletteStatus(
        "Select a model to deploy. Edit unlocks after you place a model."
      );
    }
  } else {
    const noManifestMessage = canEditPlacements
      ? "No models are currently listed in the manifest. You can still edit placed models."
      : "No models are currently listed in the manifest yet.";

    setModelPaletteStatus(noManifestMessage, {
      isError: true,
    });
  }
};

const closeModelPalette = ({ preservePlacementState = false, restoreFocus = true } = {}) => {
  if (!isModelPaletteOpen() || !(modelPalette instanceof HTMLElement)) {
    return;
  }

  modelPalette.dataset.open = "false";
  modelPalette.setAttribute("aria-hidden", "true");
  modelPalette.hidden = true;

  updateBodyModalState(false);
  document.removeEventListener("keydown", handleModelPaletteKeydown, true);

  sceneController?.setMovementEnabled(true);
  setModelPaletteButtonsDisabled(false);
  if (!preservePlacementState) {
    modelPalettePlacementInProgress = false;
  }

  const elementToRefocus = restoreFocus ? lastModelPaletteFocusedElement : null;
  lastModelPaletteFocusedElement = null;

  if (elementToRefocus instanceof HTMLElement) {
    elementToRefocus.focus({ preventScroll: true });
  }

  if (modelPaletteWasPointerLocked) {
    attemptToRestorePointerLock();
  }

  modelPaletteWasPointerLocked = false;
};

const handleModelPaletteEditSelection = () => {
  if (!sceneController?.setManifestEditModeEnabled) {
    return;
  }

  if (!sceneController?.hasManifestPlacements?.()) {
    showTerminalToast({
      title: "Edit mode",
      description: "There are no placed models to edit yet.",
    });
    return;
  }

  playTerminalInteractionSound();
  closeModelPalette({ preservePlacementState: true, restoreFocus: false });

  const enabled = sceneController.setManifestEditModeEnabled(true);

  if (enabled) {
    sceneController.requestPointerLock?.();
  }
};

const createModelPaletteEditButton = () => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "model-palette__option model-palette__option--action";
  button.dataset.modelPaletteAction = "edit";

  const labelElement = document.createElement("span");
  labelElement.className = "model-palette__option-label";
  labelElement.textContent = "Edit placed models";

  const descriptionElement = document.createElement("span");
  descriptionElement.className = "model-palette__option-path";
  descriptionElement.textContent =
    "Select existing placements to remove them.";

  button.append(labelElement, descriptionElement);
  button.addEventListener("click", handleModelPaletteEditSelection);

  return button;
};

const openModelPalette = async () => {
  if (
    !(modelPalette instanceof HTMLElement) ||
    !(modelPaletteDialog instanceof HTMLElement) ||
    !(modelPaletteList instanceof HTMLElement)
  ) {
    return;
  }

  if (!sceneController?.placeModelFromManifestEntry) {
    return;
  }

  if (isModelPaletteOpen() || modelPaletteOpening) {
    return;
  }

  modelPaletteOpening = true;
  sceneController?.setManifestEditModeEnabled?.(false);
  modelPaletteWasPointerLocked = Boolean(
    sceneController?.unlockPointerLock?.()
  );
  sceneController?.setMovementEnabled(false);
  hideTerminalToast();
  hideResourceToast();

  lastModelPaletteFocusedElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  modelPalette.hidden = false;
  modelPalette.dataset.open = "true";
  modelPalette.setAttribute("aria-hidden", "false");

  updateBodyModalState(true);
  document.addEventListener("keydown", handleModelPaletteKeydown, true);

  setModelPaletteButtonsDisabled(false);
  setModelPaletteStatus("Loading models...");

  try {
    const entries = await loadModelManifest();
    renderModelPaletteEntries(entries);
  } catch (error) {
    renderModelPaletteEntries([]);
    setModelPaletteStatus(
      "We couldn't load the model manifest. Please try again.",
      { isError: true }
    );
  } finally {
    modelPaletteOpening = false;
  }

  requestAnimationFrame(() => {
    const focusTarget =
      modelPaletteList?.querySelector("button:not([disabled])") ||
      modelPaletteClose;

    if (focusTarget instanceof HTMLElement) {
      focusTarget.focus({ preventScroll: true });
    }
  });
};

const handleModelPaletteSelection = async (entry, trigger) => {
  if (!entry || !sceneController?.placeModelFromManifestEntry) {
    return;
  }

  if (modelPalettePlacementInProgress) {
    return;
  }

  modelPalettePlacementInProgress = true;
  setModelPaletteButtonsDisabled(true);

  if (trigger instanceof HTMLButtonElement) {
    trigger.dataset.loading = "true";
  }

  const label = entry.label || entry.path;

  try {
    const placementPromise = sceneController.placeModelFromManifestEntry(entry);
    showTerminalToast({ title: "Placement ready", description: "Left click to place" });
    closeModelPalette({ preservePlacementState: true, restoreFocus: false });

    await placementPromise;
    showTerminalToast({ title: "Model placed", description: label });
  } catch (error) {
    if (error?.name === "PlacementCancelledError" || error?.isPlacementCancellation) {
      showTerminalToast({ title: "Placement cancelled", description: label });
    } else {
      console.error("Unable to place model from manifest", error);
      showTerminalToast({
        title: "Model placement failed",
        description: "We couldn't place that model. Please try again.",
      });
    }
  } finally {
    modelPalettePlacementInProgress = false;

    if (trigger instanceof HTMLButtonElement) {
      delete trigger.dataset.loading;
    }

    if (isModelPaletteOpen()) {
      setModelPaletteButtonsDisabled(false);

      if (trigger instanceof HTMLButtonElement) {
        trigger.focus({ preventScroll: true });
      }
    }
  }
};

const shouldIgnoreModelPaletteHotkey = (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (modelPalette instanceof HTMLElement && modelPalette.contains(target)) {
    return false;
  }

  const tagName = target.tagName;

  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return false;
};

const handleModelPaletteHotkey = (event) => {
  if (event.code !== "KeyB" || event.repeat) {
    return;
  }

  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  if (!sceneController?.placeModelFromManifestEntry) {
    return;
  }

  if (shouldIgnoreModelPaletteHotkey(event)) {
    return;
  }

  if (quickAccessModal instanceof HTMLElement && !quickAccessModal.hidden) {
    return;
  }

  event.preventDefault();

  if (isModelPaletteOpen()) {
    closeModelPalette();
  } else {
    void openModelPalette();
  }
};

const trapFocusWithinModal = (event) => {
  if (!quickAccessModalDialog) {
    return;
  }

  const focusableElements = Array.from(
    quickAccessModalDialog.querySelectorAll(modalFocusableSelectors)
  ).filter(
    (element) =>
      element instanceof HTMLElement &&
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex !== -1 &&
      isFocusableElementVisible(element)
  );

  if (focusableElements.length === 0) {
    event.preventDefault();
    return;
  }

  const [firstElement] = focusableElements;
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (event.shiftKey) {
    if (activeElement === firstElement || !quickAccessModalDialog.contains(activeElement)) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
    }
  } else if (activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus({ preventScroll: true });
  }
};

const finishClosingQuickAccessModal = () => {
  if (!quickAccessModal || !quickAccessModalContent || quickAccessModal.hidden) {
    return;
  }

  liftModalActive = false;
  quickAccessModal.hidden = true;
  quickAccessModalContent.innerHTML = "";
  stopQuickAccessMatrix();
  quickAccessModalClose = null;
  updateBodyModalState(false);
  document.removeEventListener("keydown", handleQuickAccessModalKeydown, true);

  sceneController?.setMovementEnabled(true);

  if (quickAccessModalCloseFallbackId) {
    window.clearTimeout(quickAccessModalCloseFallbackId);
    quickAccessModalCloseFallbackId = 0;
  }

  const elementToRefocus = lastFocusedElement;
  lastFocusedElement = null;

  if (elementToRefocus instanceof HTMLElement) {
    elementToRefocus.focus({ preventScroll: true });
  }
};

const closeQuickAccessModal = () => {
  if (!quickAccessModal || !quickAccessModalContent || quickAccessModal.hidden) {
    return;
  }

  playTerminalInteractionSound();

  attemptToRestorePointerLock();

  quickAccessModal.classList.remove("is-open");
  quickAccessModal.setAttribute("aria-hidden", "true");

  const handleTransitionEnd = (event) => {
    if (event.target === quickAccessModal) {
      quickAccessModal.removeEventListener("transitionend", handleTransitionEnd);
      finishClosingQuickAccessModal();
    }
  };

  quickAccessModal.addEventListener("transitionend", handleTransitionEnd);
  quickAccessModalCloseFallbackId = window.setTimeout(() => {
    quickAccessModal.removeEventListener("transitionend", handleTransitionEnd);
    finishClosingQuickAccessModal();
  }, 380);
};

function handleQuickAccessModalKeydown(event) {
  if (!quickAccessModal || quickAccessModal.hidden) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeQuickAccessModal();
  } else if (event.key === "Tab") {
    trapFocusWithinModal(event);
  }
}

const openQuickAccessModal = (option) => {
  if (!quickAccessModal || !quickAccessModalDialog || !quickAccessModalContent) {
    return;
  }

  const template = getModalTemplateForOption(option?.id);
  if (!template) {
    return;
  }

  sceneController?.setMovementEnabled(false);

  quickAccessModalContent.innerHTML = "";
  quickAccessModalContent.appendChild(template.content.cloneNode(true));
  quickAccessModalContent.scrollTop = 0;
  initializeQuickAccessModalContent(option);

  quickAccessModalClose = quickAccessModalDialog.querySelector(
    ".quick-access-modal__close"
  );

  quickAccessModalDialog.setAttribute("aria-label", getModalLabelForOption(option));

  lastFocusedElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  quickAccessModal.hidden = false;
  quickAccessModal.setAttribute("aria-hidden", "false");
  window.clearTimeout(quickAccessModalCloseFallbackId);
  quickAccessModalCloseFallbackId = 0;

  requestAnimationFrame(() => {
    quickAccessModal.classList.add("is-open");
    requestAnimationFrame(() => {
      startQuickAccessMatrix();
    });
  });

  updateBodyModalState(true);
  document.addEventListener("keydown", handleQuickAccessModalKeydown, true);

  if (quickAccessModalClose instanceof HTMLElement) {
    quickAccessModalClose.focus({ preventScroll: true });
  }
};

const openLiftModal = () => {
  openQuickAccessModal(LIFT_MODAL_OPTION);
};

if (quickAccessModal instanceof HTMLElement) {
  quickAccessModal.addEventListener("click", (event) => {
    const target =
      event.target instanceof HTMLElement
        ? event.target.closest("[data-quick-access-modal-close]")
        : null;

    if (target) {
      event.preventDefault();
      closeQuickAccessModal();
    }
  });
}

if (inventoryPanel instanceof HTMLElement) {
  inventoryPanel.addEventListener("click", (event) => {
    const target =
      event.target instanceof HTMLElement
        ? event.target.closest("[data-inventory-close]")
        : null;

    if (!target) {
      return;
    }

    event.preventDefault();
    closeInventoryPanel();
  });
}

if (modelPalette instanceof HTMLElement) {
  modelPalette.addEventListener("click", (event) => {
    const target =
      event.target instanceof HTMLElement
        ? event.target.closest("[data-model-palette-close]")
        : null;

    if (target) {
      event.preventDefault();
      closeModelPalette();
    }
  });
}

document.addEventListener("keydown", handleQuickSlotHotkey);
document.addEventListener("keydown", handleInventoryHotkey);
document.addEventListener("keydown", handleModelPaletteHotkey);

const hideTerminalToast = () => {
  window.clearTimeout(terminalToastHideTimeoutId);
  window.clearTimeout(terminalToastFinalizeTimeoutId);

  if (!(terminalToast instanceof HTMLElement)) {
    return;
  }

  terminalToast.dataset.visible = "false";
  terminalToastFinalizeTimeoutId = window.setTimeout(() => {
    terminalToast.hidden = true;
  }, 220);
};

const showTerminalToast = ({ title, description }) => {
  if (!(terminalToast instanceof HTMLElement)) {
    return;
  }

  window.clearTimeout(terminalToastHideTimeoutId);
  window.clearTimeout(terminalToastFinalizeTimeoutId);

  terminalToast.textContent = `${title}: ${description}`;
  terminalToast.hidden = false;
  terminalToast.dataset.visible = "true";

  terminalToastHideTimeoutId = window.setTimeout(() => {
    hideTerminalToast();
  }, 4000);
};

const setResourceToastContent = ({ title, description }) => {
  if (!(resourceToast instanceof HTMLElement)) {
    return;
  }

  resourceToast.textContent = "";

  const segments = [];

  if (typeof title === "string" && title.trim() !== "") {
    const titleElement = document.createElement("span");
    titleElement.className = "resource-toast__title";
    titleElement.textContent = title.trim();
    segments.push(titleElement);
  }

  if (typeof description === "string" && description.trim() !== "") {
    const descriptionElement = document.createElement("span");
    descriptionElement.className = "resource-toast__description";
    descriptionElement.textContent = description.trim();
    segments.push(descriptionElement);
  }

  if (segments.length > 0) {
    resourceToast.append(...segments);
  }
};

const hideResourceToast = () => {
  if (!(resourceToast instanceof HTMLElement)) {
    return;
  }

  window.clearTimeout(resourceToastHideTimeoutId);
  window.clearTimeout(resourceToastFinalizeTimeoutId);

  resourceToast.dataset.visible = "false";
  resourceToastFinalizeTimeoutId = window.setTimeout(() => {
    resourceToast.hidden = true;
  }, 220);
};

const showResourceToast = ({ title, description }) => {
  if (!(resourceToast instanceof HTMLElement)) {
    return;
  }

  window.clearTimeout(resourceToastHideTimeoutId);
  window.clearTimeout(resourceToastFinalizeTimeoutId);

  setResourceToastContent({ title, description });
  resourceToast.hidden = false;
  resourceToast.dataset.visible = "true";

  resourceToastHideTimeoutId = window.setTimeout(() => {
    hideResourceToast();
  }, 3000);
};

const describeManifestEntry = (entry) => {
  if (typeof entry?.label === "string" && entry.label.trim() !== "") {
    return entry.label.trim();
  }

  if (typeof entry?.path === "string" && entry.path.trim() !== "") {
    return entry.path.trim();
  }

  return "Placement removed";
};

const handleManifestPlacementHoverChange = (canHover) => {
  setCrosshairSourceState("edit", Boolean(canHover));
};

const handleManifestEditModeChange = (enabled) => {
  const nextState = Boolean(enabled);

  if (nextState === editModeActive) {
    return;
  }

  editModeActive = nextState;

  if (!nextState) {
    setCrosshairSourceState("edit", false);
  }

  const description = nextState
    ? "Hover placed models to highlight them. Left click to pick them up and place them again, or press Delete to remove. Press Esc to exit."
    : "Edit mode disabled.";

  showTerminalToast({ title: "Edit mode", description });
};

const handleManifestPlacementRemoved = (entry) => {
  showTerminalToast({ title: "Model removed", description: describeManifestEntry(entry) });
};

const bootstrapScene = () => {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  sceneController = initScene(canvas, {
    onControlsLocked() {
      instructions?.setAttribute("hidden", "");
    },
    onControlsUnlocked() {
      instructions?.removeAttribute("hidden");
      resetCrosshairInteractableState();
      hideTerminalToast();
      hideResourceToast();
    },
    onTerminalOptionSelected(option) {
      playTerminalInteractionSound();
      openQuickAccessModal(option);
      showTerminalToast(option);
    },
    onTerminalInteractableChange(value) {
      setCrosshairSourceState("terminal", value);
    },
    onLiftControlInteract({ control } = {}) {
      const destinationId = control?.userData?.liftFloorId ?? null;

      if (destinationId && sceneController?.setActiveLiftFloorById) {
        const traveled = sceneController.setActiveLiftFloorById(destinationId);
        if (traveled) {
          return false;
        }
      }

      playTerminalInteractionSound();
      openLiftModal();
      return true;
    },
    onLiftInteractableChange(value) {
      setCrosshairSourceState("lift", value);
    },
    onLiftTravel(event) {
      playTerminalInteractionSound();
      const destination = event?.to ?? null;
      const floorTitle = destination?.title || destination?.id || "New deck";
      const detail = destination?.description
        ? `${floorTitle} – ${destination.description}`
        : floorTitle;
      showTerminalToast({
        title: "Lift arrival",
        description: detail,
      });
      updateLiftModalActiveState();
    },
    onManifestPlacementHoverChange: handleManifestPlacementHoverChange,
    onManifestEditModeChange: handleManifestEditModeChange,
    onManifestPlacementRemoved: handleManifestPlacementRemoved,
    onResourceCollected(detail) {
      if (!detail || detail.found === false || !detail.element) {
        showResourceToast({ title: "Nothing found" });
        return;
      }

      const element = detail?.element ?? {};
      const terrainLabel = detail?.terrain?.label ?? null;
      const { symbol, name } = element;
      const atomicNumber = Number.isFinite(element.number)
        ? element.number
        : null;
      recordInventoryResource(detail);
      const label =
        symbol && name
          ? `${symbol} (${name})`
          : symbol || name || "Unknown element";
      const segments = [];
      if (label) {
        segments.push(label);
      }
      if (atomicNumber !== null) {
        segments.push(`Atomic #${atomicNumber}`);
      }
      let description = segments.join(" – ");
      if (terrainLabel) {
        description = description
          ? `${description} • ${terrainLabel}`
          : terrainLabel;
      }
      const resourceDetailSegments = [];
      if (atomicNumber !== null) {
        resourceDetailSegments.push(`Atomic #${atomicNumber}`);
      }
      if (terrainLabel) {
        resourceDetailSegments.push(terrainLabel);
      }
      const resourceToastDescription = resourceDetailSegments.join(" • ");
      showResourceToast({
        title: label || "Resource collected",
        description: resourceToastDescription || "Resource extracted.",
      });
      showTerminalToast({
        title: "Resource collected",
        description: description || "Resource extracted.",
      });
    },
    onResourceSessionCancelled({ reason } = {}) {
      if (reason === "movement") {
        showResourceToast({ title: "Digging interrupted" });
      }
    },
  });

  sceneController?.setPlayerHeight?.(DEFAULT_PLAYER_HEIGHT, { persist: true });

};

const scheduleBootstrapScene = () => {
  const start = () => window.requestAnimationFrame(bootstrapScene);

  if (typeof document.fonts?.ready?.then === "function") {
    document.fonts.ready.then(start).catch(start);
  } else {
    start();
  }
};

if (document.readyState === "complete") {
  scheduleBootstrapScene();
} else {
  window.addEventListener("load", scheduleBootstrapScene, { once: true });
}

const setErrorMessage = (message) => {
  if (errorMessage instanceof HTMLElement) {
    errorMessage.textContent = message;
    errorMessage.hidden = !message;
  }
};

const setButtonBusyState = (button, isBusy) => {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  button.disabled = isBusy;
  button.setAttribute("aria-busy", String(isBusy));
};

async function handleLogout(event) {
  if (event) {
    event.preventDefault();
  }

  setErrorMessage("");
  setButtonBusyState(logoutButton, true);

  try {
    await logout();
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout failed", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "We couldn't log you out. Please try again.";
    setErrorMessage(message);
  } finally {
    setButtonBusyState(logoutButton, false);
  }
}

if (logoutButton instanceof HTMLButtonElement) {
  logoutButton.addEventListener("click", handleLogout);
}

function handleReset(event) {
  if (event) {
    event.preventDefault();
  }

  if (!(resetButton instanceof HTMLButtonElement)) {
    return;
  }

  const shouldReset = window.confirm(
    "Reset your saved position, view settings, and custom height? This cannot be undone."
  );

  if (!shouldReset) {
    return;
  }

  setErrorMessage("");
  setButtonBusyState(resetButton, true);

  let shouldReload = false;
  const persistenceSetter = sceneController?.setPlayerStatePersistenceEnabled;
  const previousPersistenceEnabled =
    typeof persistenceSetter === "function"
      ? persistenceSetter(false)
      : undefined;

  try {
    const cleared = clearStoredPlayerState();

    if (!cleared) {
      throw new Error("Unable to access saved data");
    }

    sceneController?.setPlayerHeight?.(DEFAULT_PLAYER_HEIGHT, {
      persist: false,
    });

    shouldReload = true;
    window.location.reload();
  } catch (error) {
    console.error("Reset failed", error);
    setErrorMessage("We couldn't reset your progress. Please try again.");
  } finally {
    if (!shouldReload && typeof previousPersistenceEnabled === "boolean") {
      sceneController?.setPlayerStatePersistenceEnabled?.(
        previousPersistenceEnabled
      );
    }

    if (!shouldReload) {
      setButtonBusyState(resetButton, false);
    }
  }
}

if (resetButton instanceof HTMLButtonElement) {
  resetButton.addEventListener("click", handleReset);
}
