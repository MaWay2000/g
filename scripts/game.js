import { logout } from "./auth.js";
import { initScene } from "./scene.js";
import {
  DEFAULT_PLAYER_HEIGHT,
  clearStoredPlayerState,
} from "./player-state-storage.js";
import {
  clearStoredDroneState,
  loadStoredDroneState,
  persistDroneCargoState,
} from "./drone-state-storage.js";

const canvas = document.getElementById("gameCanvas");
const instructions = document.querySelector("[data-instructions]");
const logoutButton = document.querySelector("[data-logout-button]");
const resetButton = document.querySelector("[data-reset-button]");
const errorMessage = document.getElementById("logoutError");
const bodyElement = document.body instanceof HTMLBodyElement ? document.body : null;
const terminalToast = document.getElementById("terminalToast");
const resourceToast = document.getElementById("resourceToast");
const resourceToolIndicator = document.querySelector(
  "[data-resource-tool-indicator]"
);
const crosshair = document.querySelector(".crosshair");
const topBar = document.querySelector(".top-bar");
const quickSlotBar = document.querySelector("[data-quick-slot-bar]");
const resourceToolLabel = document.querySelector("[data-resource-tool-label]");
const resourceToolDescription = document.querySelector(
  "[data-resource-tool-description]"
);
const droneStatusPanel = document.querySelector("[data-drone-status-panel]");
const droneStatusLabel = document.querySelector("[data-drone-status-label]");
const droneStatusDetail = document.querySelector("[data-drone-status-detail]");
const dronePayloadLabel = document.querySelector("[data-drone-payload]");
const crosshairStates = {
  terminal: false,
  edit: false,
  lift: false,
};
let previousCrosshairInteractableState =
  crosshair instanceof HTMLElement && crosshair.dataset.interactable === "true";
let pointerLockImmersiveModeEnabled = false;

const getIsFullscreen = () => {
  const hasFullscreenElement = Boolean(
    document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
  );

  if (hasFullscreenElement) {
    return true;
  }

  const viewportHeight =
    typeof window.innerHeight === "number" ? window.innerHeight : null;
  const viewportWidth = typeof window.innerWidth === "number" ? window.innerWidth : null;
  const screenHeight =
    window.screen && typeof window.screen.height === "number"
      ? window.screen.height
      : null;
  const screenWidth =
    window.screen && typeof window.screen.width === "number" ? window.screen.width : null;

  if (
    viewportHeight === null ||
    viewportWidth === null ||
    screenHeight === null ||
    screenWidth === null
  ) {
    return false;
  }

  const heightMatches = Math.abs(screenHeight - viewportHeight) <= 1;
  const widthMatches = Math.abs(screenWidth - viewportWidth) <= 1;

  return heightMatches && widthMatches;
};

const applyFullscreenClass = () => {
  if (!(bodyElement instanceof HTMLBodyElement)) {
    return;
  }

  const shouldEnableFullscreenClass =
    pointerLockImmersiveModeEnabled || getIsFullscreen();

  bodyElement.classList.toggle("is-fullscreen", shouldEnableFullscreenClass);
};

const setPointerLockImmersiveModeEnabled = (enabled) => {
  const nextState = Boolean(enabled);

  if (pointerLockImmersiveModeEnabled === nextState) {
    return;
  }

  pointerLockImmersiveModeEnabled = nextState;
  applyFullscreenClass();
};

if (topBar instanceof HTMLElement) {
  [
    "fullscreenchange",
    "webkitfullscreenchange",
    "mozfullscreenchange",
    "MSFullscreenChange",
  ].forEach((eventName) => {
    document.addEventListener(eventName, applyFullscreenClass);
  });

  window.addEventListener("resize", applyFullscreenClass);
  window.addEventListener("orientationchange", applyFullscreenClass);

  applyFullscreenClass();
}

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
const inventoryDragHandle = inventoryPanel?.querySelector(
  "[data-inventory-drag-handle]"
);
const inventoryBody = inventoryPanel?.querySelector(".inventory-panel__body");
const inventoryList = inventoryPanel?.querySelector("[data-inventory-list]");
const inventoryEmptyState = inventoryPanel?.querySelector("[data-inventory-empty]");
const inventorySummary = inventoryPanel?.querySelector("[data-inventory-summary]");
const inventorySummaryFill = inventoryPanel?.querySelector(
  "[data-inventory-summary-fill]"
);
const inventorySummaryLabel = inventoryPanel?.querySelector(
  "[data-inventory-summary-label]"
);
const inventorySummaryTooltip = inventoryPanel?.querySelector(
  "[data-inventory-summary-tooltip]"
);
const inventoryCloseButton = inventoryPanel?.querySelector(
  "[data-inventory-close-button]"
);
const inventoryTooltip = inventoryPanel?.querySelector("[data-inventory-tooltip]");
const inventoryTooltipName = inventoryTooltip?.querySelector(
  "[data-inventory-tooltip-name]"
);
const inventoryTooltipMeta = inventoryTooltip?.querySelector(
  "[data-inventory-tooltip-meta]"
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

const DRONE_QUICK_SLOT_ID = "drone-miner";

const quickSlotDefinitions = [
  {
    id: "digger",
    label: "Digger",
    description: "Standard issue excavation module.",
    icon: "🪓",
  },
  {
    id: DRONE_QUICK_SLOT_ID,
    label: "Drone Miner",
    description: "Deploy or recover the autonomous support drone.",
    activateOnly: true,
    icon: "🤖",
  },
  {
    id: "photon-cutter",
    label: "Photon Cutter",
    description: "Equipped for custom map harvesting.",
    icon: "🔦",
  },
  {
    id: "arc-welder",
    label: "Arc Welder",
    description: "Fuses structural panels in the field.",
    icon: "⚡",
  },
  {
    id: "geo-scanner",
    label: "Geo Scanner",
    description: "Reveals hidden mineral signatures nearby.",
    icon: "📡",
  },
  {
    id: "pulse-barrier",
    label: "Pulse Barrier",
    description: "Deploys a short-lived kinetic shield.",
    icon: "🛡️",
  },
  {
    id: "gravity-well",
    label: "Gravity Well",
    description: "Pins unstable debris for safe recovery.",
    icon: "🌌",
  },
  {
    id: "terraform-spike",
    label: "Terraform Spike",
    description: "Reshapes local terrain on impact.",
    icon: "🛰️",
  },
  {
    id: "chrono-anchor",
    label: "Chrono Anchor",
    description: "Stabilizes temporal distortions briefly.",
    icon: "⏳",
  },
  {
    id: "seismic-charge",
    label: "Seismic Charge",
    description: "Breaks dense rock formations cleanly.",
    icon: "💥",
  },
];

const quickSlotState = {
  slots: quickSlotDefinitions,
  selectedIndex: 0,
};

const quickSlotActivationTimeouts = new Map();
const QUICK_SLOT_ACTIVATION_EFFECT_DURATION = 900;

const droneState = {
  status: "inactive",
  payloadGrams: 0,
  inFlight: false,
  awaitingReturn: false,
  lastResult: null,
  active: false,
  pendingShutdown: false,
  cargo: [],
  notifiedUnavailable: false,
};

const applyStoredDroneState = () => {
  const stored = loadStoredDroneState();

  if (!stored || typeof stored !== "object") {
    return;
  }

  if (stored.cargo) {
    const samples = Array.isArray(stored.cargo.samples)
      ? stored.cargo.samples.slice()
      : [];
    droneState.cargo = samples;
    droneState.payloadGrams = Number.isFinite(stored.cargo.payloadGrams)
      ? Math.max(0, stored.cargo.payloadGrams)
      : 0;
  }

  const sceneState = stored.scene;
  if (sceneState?.active) {
    droneState.active = true;

    // After a refresh we can only restore whether automation was enabled, not
    // the previous sortie. Force the automation into an idle state so the
    // controls remain responsive instead of getting stuck in a
    // "collecting"/"returning" state with no live drone in the scene.
    droneState.status = "idle";
    droneState.inFlight = false;
    droneState.awaitingReturn = false;
  }
};

applyStoredDroneState();

const persistDroneCargoSnapshot = () => {
  persistDroneCargoState({
    samples: droneState.cargo,
    payloadGrams: droneState.payloadGrams,
  });
};

const DRONE_AUTOMATION_RETRY_DELAY_MS = 2000;
let droneAutomationRetryTimeoutId = 0;

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

const updateDroneQuickSlotState = () => {
  if (!(quickSlotBar instanceof HTMLElement)) {
    return;
  }

  const droneSlotButton = quickSlotBar.querySelector(
    `[data-quick-slot-id="${DRONE_QUICK_SLOT_ID}"]`
  );

  if (!(droneSlotButton instanceof HTMLElement)) {
    return;
  }

  if (droneState.active) {
    droneSlotButton.dataset.droneActive = "true";
  } else {
    delete droneSlotButton.dataset.droneActive;
  }
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
  updateDroneQuickSlotState();
};

const clearQuickSlotActivationEffects = () => {
  quickSlotActivationTimeouts.forEach((timeoutId) => {
    window.clearTimeout(timeoutId);
  });

  quickSlotActivationTimeouts.clear();

  if (!(quickSlotBar instanceof HTMLElement)) {
    return;
  }

  const activatedButtons = quickSlotBar.querySelectorAll(
    ".quick-slot-bar__slot[data-activated]"
  );

  activatedButtons.forEach((button) => {
    if (button instanceof HTMLElement) {
      delete button.dataset.activated;
    }
  });
};

const triggerQuickSlotActivationEffect = (index) => {
  if (!(quickSlotBar instanceof HTMLElement)) {
    return;
  }

  const button = quickSlotBar.querySelector(
    `[data-quick-slot-index="${index}"]`
  );

  if (!(button instanceof HTMLElement)) {
    return;
  }

  if (button.dataset.activated === "true") {
    delete button.dataset.activated;
    // Force reflow so the animation restarts consistently.
    void button.offsetWidth;
  }

  button.dataset.activated = "true";

  const existingTimeoutId = quickSlotActivationTimeouts.get(index);

  if (typeof existingTimeoutId === "number") {
    window.clearTimeout(existingTimeoutId);
  }

  const timeoutId = window.setTimeout(() => {
    delete button.dataset.activated;
    quickSlotActivationTimeouts.delete(index);
  }, QUICK_SLOT_ACTIVATION_EFFECT_DURATION);

  quickSlotActivationTimeouts.set(index, timeoutId);
};

const renderQuickSlotBar = () => {
  if (!(quickSlotBar instanceof HTMLElement)) {
    updateResourceToolIndicator(
      quickSlotState.slots[quickSlotState.selectedIndex] ?? null
    );
    return;
  }

  clearQuickSlotActivationEffects();
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

    const hasIcon = typeof slot?.icon === "string" && slot.icon.trim() !== "";

    if (hasIcon) {
      const iconValue = slot.icon.trim();
      const isImageIcon = /\/|\.(svg|png|jpe?g|gif|webp)$/i.test(iconValue);

      const icon = document.createElement(isImageIcon ? "img" : "span");
      icon.className = "quick-slot-bar__slot-icon";
      icon.setAttribute("aria-hidden", "true");

      if (icon instanceof HTMLImageElement) {
        icon.src = iconValue;
        icon.alt = "";
        icon.loading = "lazy";
      } else {
        icon.textContent = iconValue;
      }

      button.appendChild(icon);
    }

    const label = document.createElement("span");
    label.className = "quick-slot-bar__slot-label";
    label.textContent =
      typeof slot?.label === "string" && slot.label.trim() !== ""
        ? slot.label.trim()
        : "Empty";
    button.appendChild(label);

    if (slot?.activateOnly) {
      button.dataset.activateOnly = "true";
    }

    if (typeof slot?.id === "string" && slot.id.trim() !== "") {
      button.dataset.quickSlotId = slot.id.trim();
    }

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

const dispatchQuickSlotChangeEvent = (index, { userInitiated = false } = {}) => {
  if (!(canvas instanceof HTMLElement)) {
    return;
  }

  const slot = quickSlotState.slots[index] ?? null;

  try {
    const event = new CustomEvent("quick-slot:change", {
      detail: {
        index,
        slot,
        userInitiated,
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

  const isAlreadySelected = quickSlotState.selectedIndex === index;

  if (isAlreadySelected) {
    if (userInitiated) {
      dispatchQuickSlotChangeEvent(index, { userInitiated: true });
      triggerQuickSlotActivationEffect(index);
    }

    return;
  }

  quickSlotState.selectedIndex = index;
  updateQuickSlotUi();
  dispatchQuickSlotChangeEvent(index, { userInitiated });

  if (userInitiated) {
    triggerQuickSlotActivationEffect(index);
  }
};

const activateQuickSlot = (index, { userInitiated = false } = {}) => {
  if (!Number.isInteger(index) || index < 0 || index >= quickSlotState.slots.length) {
    return;
  }

  const slot = quickSlotState.slots[index] ?? null;

  if (slot?.activateOnly) {
    triggerQuickSlotActivationEffect(index);
    dispatchQuickSlotChangeEvent(index, { userInitiated });
    return;
  }

  selectQuickSlot(index, { userInitiated });
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
  activateQuickSlot(index, { userInitiated: true });
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
  activateQuickSlot(index, { userInitiated: true });
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

const INVENTORY_SLOT_COUNT = 100;
const DEFAULT_INVENTORY_CAPACITY_KG = 10;

const createEmptyInventorySlotOrder = () =>
  new Array(INVENTORY_SLOT_COUNT).fill(null);

const inventoryState = {
  entries: [],
  entryMap: new Map(),
  customOrder: createEmptyInventorySlotOrder(),
  capacityKg: DEFAULT_INVENTORY_CAPACITY_KG,
};

const NEW_GAME_STARTER_RESOURCES = [
  {
    count: 1,
    element: { number: 76, symbol: "Os", name: "Osmium" },
  },
  {
    count: 2,
    element: { number: 1, symbol: "H", name: "Hydrogen" },
  },
  {
    count: 1,
    element: { number: 73, symbol: "Ta", name: "Tantalum" },
  },
];

const inventoryTooltipState = {
  activeItem: null,
};
const INVENTORY_PANEL_MARGIN = 24;
const inventoryLayoutState = {
  position: null,
  dragging: false,
  pointerId: null,
  offsetX: 0,
  offsetY: 0,
  dimensions: {
    width: 0,
    height: 0,
  },
};
const inventoryReorderState = {
  draggingKey: null,
  sourceSlotIndex: -1,
  dropTargetSlotIndex: -1,
};
const inventoryPointerReorderState = {
  active: false,
  pointerId: null,
  previewElement: null,
  previewOffsetX: 0,
  previewOffsetY: 0,
};
let inventoryResizeAnimationFrameId = 0;
const INVENTORY_TOOLTIP_MARGIN = 16;
const INVENTORY_STORAGE_KEY = "dustyNova.inventory";

const normalizeInventoryCustomOrder = () => {
  if (!Array.isArray(inventoryState.customOrder)) {
    inventoryState.customOrder = createEmptyInventorySlotOrder();
  }

  if (inventoryState.customOrder.length !== INVENTORY_SLOT_COUNT) {
    const nextOrder = createEmptyInventorySlotOrder();
    const limit = Math.min(
      inventoryState.customOrder.length,
      INVENTORY_SLOT_COUNT
    );

    for (let index = 0; index < limit; index += 1) {
      nextOrder[index] = inventoryState.customOrder[index];
    }

    inventoryState.customOrder = nextOrder;
  }

  const seenKeys = new Set();

  for (let index = 0; index < inventoryState.customOrder.length; index += 1) {
    const key = inventoryState.customOrder[index];

    if (
      typeof key === "string" &&
      key.trim() !== "" &&
      !seenKeys.has(key)
    ) {
      seenKeys.add(key);
      continue;
    }

    inventoryState.customOrder[index] = null;
  }
};

const getInventoryItemElement = (element) => {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const item = element.closest(".inventory-panel__item");

  if (
    !(item instanceof HTMLElement) ||
    item.classList.contains("inventory-panel__item--empty")
  ) {
    return null;
  }

  return item;
};

const getInventorySlotElement = (element) => {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const slot = element.closest(".inventory-panel__item");
  return slot instanceof HTMLElement ? slot : null;
};

const getInventorySlotIndex = (slot) => {
  if (!(slot instanceof HTMLElement)) {
    return -1;
  }

  const value = Number(slot.dataset.inventorySlot ?? "");
  return Number.isFinite(value) ? value : -1;
};

const hideInventoryTooltip = () => {
  inventoryTooltipState.activeItem = null;

  if (!(inventoryTooltip instanceof HTMLElement)) {
    return;
  }

  inventoryTooltip.dataset.visible = "false";
  inventoryTooltip.setAttribute("aria-hidden", "true");
};

const positionInventoryTooltipForItem = (item) => {
  if (
    !(inventoryTooltip instanceof HTMLElement) ||
    !(inventoryDialog instanceof HTMLElement) ||
    !(item instanceof HTMLElement)
  ) {
    return;
  }

  const itemRect = item.getBoundingClientRect();
  const dialogRect = inventoryDialog.getBoundingClientRect();
  const centerX = itemRect.left + itemRect.width / 2 - dialogRect.left;
  const top = itemRect.top - dialogRect.top;
  const maxX = Math.max(
    INVENTORY_TOOLTIP_MARGIN,
    dialogRect.width - INVENTORY_TOOLTIP_MARGIN
  );
  const clampedX = Math.min(
    Math.max(centerX, INVENTORY_TOOLTIP_MARGIN),
    maxX
  );
  const clampedTop = Math.min(
    Math.max(top, INVENTORY_TOOLTIP_MARGIN),
    dialogRect.height - INVENTORY_TOOLTIP_MARGIN
  );

  inventoryTooltip.style.setProperty(
    "--inventory-tooltip-left",
    `${clampedX}px`
  );
  inventoryTooltip.style.setProperty(
    "--inventory-tooltip-top",
    `${clampedTop}px`
  );
};

const showInventoryTooltipForItem = (item) => {
  if (!(item instanceof HTMLElement)) {
    hideInventoryTooltip();
    return;
  }

  const name = typeof item.dataset.inventoryName === "string"
    ? item.dataset.inventoryName.trim()
    : "";
  const meta = typeof item.dataset.inventoryMeta === "string"
    ? item.dataset.inventoryMeta.trim()
    : "";

  if (!name && !meta) {
    hideInventoryTooltip();
    return;
  }

  if (inventoryTooltipName instanceof HTMLElement) {
    inventoryTooltipName.textContent = name;
    inventoryTooltipName.hidden = !name;
  }

  if (inventoryTooltipMeta instanceof HTMLElement) {
    if (meta) {
      inventoryTooltipMeta.textContent = meta;
      inventoryTooltipMeta.hidden = false;
    } else {
      inventoryTooltipMeta.textContent = "";
      inventoryTooltipMeta.hidden = true;
    }
  }

  positionInventoryTooltipForItem(item);

  if (inventoryTooltip instanceof HTMLElement) {
    inventoryTooltip.dataset.visible = "true";
    inventoryTooltip.removeAttribute("aria-hidden");
  }

  inventoryTooltipState.activeItem = item;
};

const handleInventoryItemPointerOver = (event) => {
  const item = getInventoryItemElement(event.target);

  if (!item) {
    return;
  }

  showInventoryTooltipForItem(item);
};

const handleInventoryItemPointerOut = (event) => {
  const activeItem = inventoryTooltipState.activeItem;

  if (!(activeItem instanceof HTMLElement)) {
    return;
  }

  const currentItem = getInventoryItemElement(event.target);

  if (currentItem !== activeItem) {
    return;
  }

  const nextItem = getInventoryItemElement(event.relatedTarget);

  if (nextItem === activeItem) {
    return;
  }

  hideInventoryTooltip();
};

const handleInventoryItemFocusIn = (event) => {
  const item = getInventoryItemElement(event.target);

  if (!item) {
    return;
  }

  showInventoryTooltipForItem(item);
};

const handleInventoryItemFocusOut = (event) => {
  const activeItem = inventoryTooltipState.activeItem;

  if (!(activeItem instanceof HTMLElement)) {
    return;
  }

  const nextItem = getInventoryItemElement(event.relatedTarget);

  if (nextItem === activeItem) {
    return;
  }

  hideInventoryTooltip();
};

const clearInventoryDropTarget = () => {
  if (!(inventoryList instanceof HTMLElement)) {
    return;
  }

  inventoryList
    .querySelectorAll(".inventory-panel__item.is-drop-target")
    .forEach((element) => element.classList.remove("is-drop-target"));

  inventoryReorderState.dropTargetSlotIndex = -1;
};

const clearInventoryDragSourceHighlight = () => {
  if (!(inventoryList instanceof HTMLElement)) {
    return;
  }

  inventoryList
    .querySelectorAll(".inventory-panel__item.is-drag-source")
    .forEach((element) => element.classList.remove("is-drag-source"));
};

const ensureInventoryDragPreviewElement = () => {
  if (
    typeof document === "undefined" ||
    !(document.body instanceof HTMLElement)
  ) {
    return null;
  }

  if (!(inventoryPointerReorderState.previewElement instanceof HTMLElement)) {
    const element = document.createElement("div");
    element.className = "inventory-panel__drag-preview";
    element.setAttribute("aria-hidden", "true");
    document.body.appendChild(element);
    inventoryPointerReorderState.previewElement = element;
  }

  return inventoryPointerReorderState.previewElement;
};

const setInventoryDragPreviewContent = (item) => {
  const preview = ensureInventoryDragPreviewElement();

  if (!(preview instanceof HTMLElement) || !(item instanceof HTMLElement)) {
    return null;
  }

  const clone = item.cloneNode(true);
  if (clone.hasAttribute && clone.hasAttribute("id")) {
    clone.removeAttribute("id");
  }
  clone.classList.remove("is-drag-source", "is-drop-target");
  clone.setAttribute("aria-hidden", "true");
  clone.tabIndex = -1;

  preview.innerHTML = "";
  preview.appendChild(clone);

  const rect = item.getBoundingClientRect();
  preview.style.setProperty("--inventory-drag-preview-width", `${rect.width}px`);
  preview.style.setProperty("--inventory-drag-preview-height", `${rect.height}px`);

  return { preview, rect };
};

const updateInventoryDragPreviewPosition = (clientX, clientY) => {
  const preview = inventoryPointerReorderState.previewElement;

  if (!(preview instanceof HTMLElement)) {
    return;
  }

  const left = clientX - inventoryPointerReorderState.previewOffsetX;
  const top = clientY - inventoryPointerReorderState.previewOffsetY;

  preview.style.setProperty("--inventory-drag-preview-left", `${left}px`);
  preview.style.setProperty("--inventory-drag-preview-top", `${top}px`);
};

const showInventoryDragPreview = (item, pointerEvent) => {
  if (
    !pointerEvent ||
    typeof pointerEvent.clientX !== "number" ||
    typeof pointerEvent.clientY !== "number"
  ) {
    return;
  }

  const result = setInventoryDragPreviewContent(item);

  if (!result) {
    return;
  }

  const { preview, rect } = result;
  inventoryPointerReorderState.previewOffsetX = pointerEvent.clientX - rect.left;
  inventoryPointerReorderState.previewOffsetY = pointerEvent.clientY - rect.top;
  updateInventoryDragPreviewPosition(pointerEvent.clientX, pointerEvent.clientY);
  preview.dataset.visible = "true";
};

const hideInventoryDragPreview = () => {
  const preview = inventoryPointerReorderState.previewElement;

  if (preview instanceof HTMLElement) {
    preview.dataset.visible = "false";
    preview.innerHTML = "";
    preview.style.removeProperty("--inventory-drag-preview-width");
    preview.style.removeProperty("--inventory-drag-preview-height");
    preview.style.removeProperty("--inventory-drag-preview-left");
    preview.style.removeProperty("--inventory-drag-preview-top");
  }

  inventoryPointerReorderState.previewOffsetX = 0;
  inventoryPointerReorderState.previewOffsetY = 0;
};

const resetInventoryReorderState = ({ preserveReorderClass = false } = {}) => {
  clearInventoryDropTarget();
  clearInventoryDragSourceHighlight();
  inventoryReorderState.draggingKey = null;
  inventoryReorderState.sourceSlotIndex = -1;
  inventoryReorderState.dropTargetSlotIndex = -1;
  removeInventoryPointerReorderListeners();
  hideInventoryDragPreview();

  if (inventoryPanel instanceof HTMLElement && !preserveReorderClass) {
    inventoryPanel.classList.remove("is-reordering");
  }
};

const startInventoryReorderForItem = (item) => {
  if (!(item instanceof HTMLElement)) {
    return false;
  }

  const key = item.dataset.inventoryKey;

  if (!key) {
    return false;
  }

  hideInventoryTooltip();
  inventoryReorderState.draggingKey = key;
  inventoryReorderState.sourceSlotIndex = getInventorySlotIndex(item);

  if (inventoryReorderState.sourceSlotIndex < 0) {
    inventoryReorderState.draggingKey = null;
    return false;
  }

  clearInventoryDropTarget();
  clearInventoryDragSourceHighlight();
  item.classList.add("is-drag-source");

  if (inventoryPanel instanceof HTMLElement) {
    inventoryPanel.classList.add("is-reordering");
  }

  return true;
};

function addInventoryPointerReorderListeners(pointerId) {
  if (
    typeof window === "undefined" ||
    inventoryPointerReorderState.active ||
    !Number.isFinite(pointerId)
  ) {
    return;
  }

  inventoryPointerReorderState.active = true;
  inventoryPointerReorderState.pointerId = pointerId;

  window.addEventListener("pointermove", handleInventoryPointerReorderMove, {
    passive: false,
  });
  window.addEventListener("pointerup", handleInventoryPointerReorderEnd, {
    passive: false,
  });
  window.addEventListener(
    "pointercancel",
    handleInventoryPointerReorderEnd,
    { passive: false }
  );
}

function removeInventoryPointerReorderListeners() {
  if (typeof window === "undefined") {
    inventoryPointerReorderState.active = false;
    inventoryPointerReorderState.pointerId = null;
    return;
  }

  if (!inventoryPointerReorderState.active) {
    inventoryPointerReorderState.pointerId = null;
    return;
  }

  inventoryPointerReorderState.active = false;
  inventoryPointerReorderState.pointerId = null;
  window.removeEventListener("pointermove", handleInventoryPointerReorderMove);
  window.removeEventListener("pointerup", handleInventoryPointerReorderEnd);
  window.removeEventListener("pointercancel", handleInventoryPointerReorderEnd);
}

function updateInventoryPointerReorderTarget(clientX, clientY) {
  const element =
    typeof document !== "undefined"
      ? document.elementFromPoint(clientX, clientY)
      : null;
  const slot = getInventorySlotElement(element);

  if (slot) {
    setInventoryDropTargetSlot(slot);
  } else {
    setInventoryDropTargetSlot(null);
  }
}

function finishInventoryPointerReorder(clientX, clientY) {
  const sourceIndex = inventoryReorderState.sourceSlotIndex;
  let targetIndex = -1;
  const element =
    typeof document !== "undefined"
      ? document.elementFromPoint(clientX, clientY)
      : null;
  const slot = getInventorySlotElement(element);

  if (slot) {
    targetIndex = getInventorySlotIndex(slot);
  }

  if (targetIndex < 0) {
    targetIndex = inventoryReorderState.dropTargetSlotIndex;
  }

  const shouldReorder = sourceIndex >= 0 && targetIndex >= 0;
  resetInventoryReorderState({ preserveReorderClass: shouldReorder });

  if (!shouldReorder) {
    return;
  }

  reorderInventoryEntriesBySlot(sourceIndex, targetIndex);

  if (inventoryPanel instanceof HTMLElement) {
    inventoryPanel.classList.remove("is-reordering");
  }
}

function handleInventoryPointerReorderMove(event) {
  if (
    !inventoryPointerReorderState.active ||
    event.pointerId !== inventoryPointerReorderState.pointerId
  ) {
    return;
  }

  event.preventDefault();
  updateInventoryPointerReorderTarget(event.clientX, event.clientY);
  updateInventoryDragPreviewPosition(event.clientX, event.clientY);
}

function handleInventoryPointerReorderEnd(event) {
  if (
    !inventoryPointerReorderState.active ||
    event.pointerId !== inventoryPointerReorderState.pointerId
  ) {
    return;
  }

  event.preventDefault();
  updateInventoryDragPreviewPosition(event.clientX, event.clientY);
  finishInventoryPointerReorder(event.clientX, event.clientY);
}

const setInventoryDropTargetSlot = (slot) => {
  if (!(slot instanceof HTMLElement)) {
    clearInventoryDropTarget();
    return;
  }

  const slotIndex = getInventorySlotIndex(slot);

  if (slotIndex < 0) {
    clearInventoryDropTarget();
    return;
  }

  if (inventoryReorderState.dropTargetSlotIndex === slotIndex) {
    return;
  }

  clearInventoryDropTarget();
  slot.classList.add("is-drop-target");
  inventoryReorderState.dropTargetSlotIndex = slotIndex;
};

const reorderInventoryEntriesBySlot = (sourceSlotIndex, targetSlotIndex) => {
  if (sourceSlotIndex === targetSlotIndex) {
    return;
  }

  normalizeInventoryCustomOrder();

  if (
    sourceSlotIndex < 0 ||
    sourceSlotIndex >= INVENTORY_SLOT_COUNT ||
    targetSlotIndex < 0 ||
    targetSlotIndex >= INVENTORY_SLOT_COUNT
  ) {
    return;
  }

  const slots = inventoryState.customOrder.slice();
  const movedKey = slots[sourceSlotIndex];

  if (typeof movedKey !== "string") {
    return;
  }

  const targetKey = slots[targetSlotIndex];

  slots[sourceSlotIndex] = targetKey ?? null;
  slots[targetSlotIndex] = movedKey;

  inventoryState.customOrder = slots;
  refreshInventoryUi();
  schedulePersistInventoryState();
};

const handleInventoryItemPointerDownForReorder = (event) => {
  const pointerType =
    typeof event.pointerType === "string"
      ? event.pointerType.toLowerCase()
      : "";

  if (
    inventoryReorderState.draggingKey ||
    event.isPrimary === false ||
    (typeof event.button === "number" && event.button > 0) ||
    !Number.isFinite(event.pointerId)
  ) {
    return;
  }

  if (
    pointerType !== "touch" &&
    pointerType !== "pen" &&
    typeof event.buttons === "number"
  ) {
    const isPrimaryButtonPressed = (event.buttons & 1) === 1;

    if (!isPrimaryButtonPressed) {
      return;
    }
  }

  const item = getInventoryItemElement(event.target);

  if (!startInventoryReorderForItem(item)) {
    return;
  }

  event.preventDefault();
  showInventoryDragPreview(item, event);
  addInventoryPointerReorderListeners(event.pointerId);
  updateInventoryPointerReorderTarget(event.clientX, event.clientY);
};
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

const GRAMS_PER_KILOGRAM = 1000;
const DEFAULT_ELEMENT_WEIGHT_GRAMS = 1;
const INVENTORY_CAPACITY_GRAMS = 10 * GRAMS_PER_KILOGRAM;
const DRONE_MINER_MAX_PAYLOAD_KG = 1;
const DRONE_MINER_MAX_PAYLOAD_GRAMS = DRONE_MINER_MAX_PAYLOAD_KG * GRAMS_PER_KILOGRAM;

const getElementWeightFromAtomicNumber = (number) => {
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_ELEMENT_WEIGHT_GRAMS;
  }

  return number;
};

const getInventoryElementWeight = (element) => {
  if (!element || typeof element !== "object") {
    return DEFAULT_ELEMENT_WEIGHT_GRAMS;
  }

  if (Number.isFinite(element.weight) && element.weight > 0) {
    return element.weight;
  }

  if (Number.isFinite(element.number) && element.number > 0) {
    return getElementWeightFromAtomicNumber(element.number);
  }

  return DEFAULT_ELEMENT_WEIGHT_GRAMS;
};

const getInventoryEntryWeight = (entry) => {
  if (!entry || !Number.isFinite(entry.count) || entry.count <= 0) {
    return 0;
  }

  return entry.count * getInventoryElementWeight(entry.element);
};

const formatWeightWithUnit = (value, unit) => {
  if (!Number.isFinite(value) || value <= 0) {
    return `0 ${unit}`;
  }

  const hasFraction = Math.abs(value - Math.round(value)) > 0.001;
  const fractionDigits = hasFraction ? 1 : 0;

  if (typeof value.toLocaleString === "function") {
    return `${value.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })} ${unit}`;
  }

  const rounded = hasFraction ? value.toFixed(1) : String(Math.round(value));
  return `${rounded} ${unit}`;
};

const formatGrams = (grams) => formatWeightWithUnit(grams, "g");

const formatKilograms = (kilograms) => formatWeightWithUnit(kilograms, "kg");

const sanitizeInventoryElement = (element = {}) => {
  const symbol =
    typeof element.symbol === "string" ? element.symbol.trim() : "";
  const name = typeof element.name === "string" ? element.name.trim() : "";
  const number = Number.isFinite(element.number) ? element.number : null;

  let weight =
    Number.isFinite(element.weight) && element.weight > 0
      ? element.weight
      : null;

  if (weight === null && number !== null) {
    weight = getElementWeightFromAtomicNumber(number);
  }

  return { symbol, name, number, weight };
};

const getInventoryEntryKey = (element) => {
  const symbolKey = element.symbol ? element.symbol.toUpperCase() : "";
  const nameKey = element.name ? element.name.toLowerCase() : "";
  const numberKey = element.number !== null ? element.number : "";
  return `${symbolKey}|${nameKey}|${numberKey}`;
};

const getInventoryCapacityKg = () => {
  const capacity = inventoryState.capacityKg;
  if (Number.isFinite(capacity) && capacity > 0) {
    return capacity;
  }

  return DEFAULT_INVENTORY_CAPACITY_KG;
};

const updateInventorySummary = () => {
  const summaryElement =
    inventorySummary instanceof HTMLElement ? inventorySummary : null;
  const summaryFillElement =
    inventorySummaryFill instanceof HTMLElement ? inventorySummaryFill : null;
  const summaryLabelElement =
    inventorySummaryLabel instanceof HTMLElement ? inventorySummaryLabel : null;
  const summaryTooltipElement =
    inventorySummaryTooltip instanceof HTMLElement
      ? inventorySummaryTooltip
      : null;

  const totalWeight = inventoryState.entries.reduce(
    (sum, entry) => sum + getInventoryEntryWeight(entry),
    0
  );

  const capacityKg = getInventoryCapacityKg();

  if (!summaryElement) {
    return;
  }

  const formattedWeight = formatGrams(totalWeight);
  const formattedCapacity = formatKilograms(capacityKg);
  const summaryText = `${formattedWeight} / ${formattedCapacity} max`;

  const capacityGrams = Math.max(0, capacityKg * 1000);
  const fillPercentage = capacityGrams
    ? Math.min(totalWeight / capacityGrams, 1) * 100
    : 0;

  if (summaryFillElement) {
    summaryFillElement.style.width = `${fillPercentage}%`;
  }

  summaryElement.setAttribute("title", summaryText);
  summaryElement.setAttribute("aria-label", summaryText);

  if (summaryLabelElement) {
    summaryLabelElement.textContent = summaryText;
  }

  if (summaryTooltipElement) {
    summaryTooltipElement.textContent = summaryText;
  }
};

const getOrderedInventoryEntries = () => {
  if (inventoryState.entries.length === 0) {
    inventoryState.customOrder = createEmptyInventorySlotOrder();
    return createEmptyInventorySlotOrder();
  }

  const entryMap = new Map(
    inventoryState.entries.map((entry) => [entry.key, entry])
  );

  normalizeInventoryCustomOrder();

  const slotEntries = createEmptyInventorySlotOrder();

  for (let slotIndex = 0; slotIndex < inventoryState.customOrder.length; slotIndex += 1) {
    const key = inventoryState.customOrder[slotIndex];

    if (typeof key !== "string") {
      continue;
    }

    const entry = entryMap.get(key);

    if (!entry) {
      inventoryState.customOrder[slotIndex] = null;
      continue;
    }

    slotEntries[slotIndex] = entry;
    entryMap.delete(key);
  }

  const remainingEntries = Array.from(entryMap.values()).sort(
    (a, b) => b.lastCollectedAt - a.lastCollectedAt
  );

  for (let slotIndex = 0; slotIndex < slotEntries.length; slotIndex += 1) {
    if (slotEntries[slotIndex] || remainingEntries.length === 0) {
      continue;
    }

    const entry = remainingEntries.shift();

    if (!entry) {
      break;
    }

    slotEntries[slotIndex] = entry;
    inventoryState.customOrder[slotIndex] = entry.key;
  }

  return slotEntries;
};

const renderInventoryEntries = () => {
  if (!(inventoryList instanceof HTMLElement)) {
    return;
  }

  hideInventoryTooltip();
  inventoryList.innerHTML = "";

  const slotEntries = getOrderedInventoryEntries();
  const hasEntries = inventoryState.entries.length > 0;

  inventoryList.hidden = false;

  if (inventoryEmptyState instanceof HTMLElement) {
    inventoryEmptyState.hidden = hasEntries;
  }

  const fragment = document.createDocumentFragment();

  for (let slotIndex = 0; slotIndex < INVENTORY_SLOT_COUNT; slotIndex += 1) {
    const entry = slotEntries[slotIndex] ?? null;
    const item = document.createElement("li");

    item.dataset.inventorySlot = String(slotIndex);

    if (entry) {
      item.className = "inventory-panel__item";
      item.tabIndex = 0;
      item.dataset.inventoryKey = entry.key;
      item.dataset.inventoryDraggable = "true";

      const resourceName =
        entry.element.name || entry.element.symbol || "Unknown resource";
      item.dataset.inventoryName = resourceName;

      const symbolElement = document.createElement("span");
      symbolElement.className = "inventory-panel__symbol";
      symbolElement.textContent = entry.element.symbol || "???";
      item.appendChild(symbolElement);

      const detailsElement = document.createElement("div");
      detailsElement.className = "inventory-panel__details";

      if (resourceName) {
        const nameElement = document.createElement("p");
        nameElement.className = "inventory-panel__resource-name";
        nameElement.textContent = resourceName;
        detailsElement.appendChild(nameElement);
      }

      if (entry.element.number !== null) {
        const numberElement = document.createElement("p");
        numberElement.className = "inventory-panel__resource-number";
        numberElement.textContent = `Atomic #${entry.element.number}`;
        detailsElement.appendChild(numberElement);
      }

      if (detailsElement.childElementCount > 0) {
        item.appendChild(detailsElement);
      }

      const countElement = document.createElement("span");
      countElement.className = "inventory-panel__count";
      countElement.textContent = `×${entry.count}`;
      item.appendChild(countElement);

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
        item.dataset.inventoryMeta = metaSegments.join(" • ");
      } else {
        delete item.dataset.inventoryMeta;
      }

      const resourceLabelSegments = [];
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
        const label = resourceLabelSegments.join(", ");
        item.setAttribute("aria-label", label);
        item.title = resourceLabelSegments.join(" • ");
      }
    } else {
      item.className = "inventory-panel__item inventory-panel__item--empty";
      item.tabIndex = -1;
      item.setAttribute("aria-hidden", "true");
      delete item.dataset.inventoryName;
      delete item.dataset.inventoryMeta;
      delete item.dataset.inventoryKey;
      delete item.dataset.inventoryDraggable;

      const placeholder = document.createElement("span");
      placeholder.className = "inventory-panel__empty-slot";
      placeholder.textContent = "Empty";
      item.appendChild(placeholder);
    }

    fragment.appendChild(item);
  }

  inventoryList.appendChild(fragment);
};

const getInventoryPanelDimensions = () => {
  let { width, height } = inventoryLayoutState.dimensions;

  if (inventoryDialog instanceof HTMLElement) {
    const rect = inventoryDialog.getBoundingClientRect();

    if (rect.width > 0 && rect.height > 0) {
      width = rect.width;
      height = rect.height;
      inventoryLayoutState.dimensions.width = rect.width;
      inventoryLayoutState.dimensions.height = rect.height;
    }
  }

  return {
    width,
    height,
  };
};

const clampInventoryPanelPosition = (left, top, width, height) => {
  const docElement =
    typeof document !== "undefined" ? document.documentElement : null;
  const viewportWidth = Math.max(
    0,
    typeof window !== "undefined" && Number.isFinite(window.innerWidth)
      ? window.innerWidth
      : 0,
    docElement && Number.isFinite(docElement.clientWidth)
      ? docElement.clientWidth
      : 0
  );
  const viewportHeight = Math.max(
    0,
    typeof window !== "undefined" && Number.isFinite(window.innerHeight)
      ? window.innerHeight
      : 0,
    docElement && Number.isFinite(docElement.clientHeight)
      ? docElement.clientHeight
      : 0
  );

  const margin = Math.max(
    0,
    Math.min(
      INVENTORY_PANEL_MARGIN,
      Math.min(viewportWidth, viewportHeight) / 2
    )
  );
  let nextLeft = Math.round(Number.isFinite(left) ? left : 0);
  let nextTop = Math.round(Number.isFinite(top) ? top : 0);

  if (width > 0 && viewportWidth > 0) {
    const maxLeft = Math.max(margin, viewportWidth - width - margin);
    nextLeft = Math.min(Math.max(nextLeft, margin), maxLeft);
  }

  if (height > 0 && viewportHeight > 0) {
    const maxTop = Math.max(margin, viewportHeight - height - margin);
    nextTop = Math.min(Math.max(nextTop, margin), maxTop);
  }

  return {
    left: nextLeft,
    top: nextTop,
  };
};

const setInventoryPanelPosition = (
  left,
  top,
  { clamp = true, updateState = true } = {}
) => {
  if (!(inventoryPanel instanceof HTMLElement)) {
    return;
  }

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return;
  }

  const dimensions = getInventoryPanelDimensions();
  let nextLeft = Math.round(left);
  let nextTop = Math.round(top);

  if (clamp && dimensions.width > 0 && dimensions.height > 0) {
    const clamped = clampInventoryPanelPosition(
      nextLeft,
      nextTop,
      dimensions.width,
      dimensions.height
    );
    nextLeft = clamped.left;
    nextTop = clamped.top;
  }

  inventoryPanel.style.setProperty("--inventory-panel-left", `${nextLeft}px`);
  inventoryPanel.style.setProperty("--inventory-panel-top", `${nextTop}px`);
  inventoryPanel.style.setProperty("--inventory-panel-translate-x", "0px");
  inventoryPanel.style.setProperty("--inventory-panel-translate-y", "0px");
  inventoryPanel.classList.add("has-custom-position");

  if (updateState) {
    inventoryLayoutState.position = {
      left: nextLeft,
      top: nextTop,
    };
  }
};

const clearInventoryPanelPositionStyles = () => {
  if (!(inventoryPanel instanceof HTMLElement)) {
    return;
  }

  inventoryPanel.style.removeProperty("--inventory-panel-left");
  inventoryPanel.style.removeProperty("--inventory-panel-top");
  inventoryPanel.style.removeProperty("--inventory-panel-translate-x");
  inventoryPanel.style.removeProperty("--inventory-panel-translate-y");
  inventoryPanel.classList.remove("has-custom-position");
  inventoryLayoutState.position = null;
};

const ensureInventoryPanelPosition = ({ clamp = true } = {}) => {
  if (!inventoryLayoutState.position) {
    clearInventoryPanelPositionStyles();
    return;
  }

  setInventoryPanelPosition(
    inventoryLayoutState.position.left,
    inventoryLayoutState.position.top,
    {
      clamp,
      updateState: true,
    }
  );
};

const removeInventoryDragListeners = () => {
  window.removeEventListener("pointermove", handleInventoryDragPointerMove);
  window.removeEventListener("pointerup", handleInventoryDragPointerUp);
  window.removeEventListener("pointercancel", handleInventoryDragPointerUp);
};

const handleInventoryDragPointerMove = (event) => {
  if (
    !inventoryLayoutState.dragging ||
    event.pointerId !== inventoryLayoutState.pointerId
  ) {
    return;
  }

  const nextLeft = event.clientX - inventoryLayoutState.offsetX;
  const nextTop = event.clientY - inventoryLayoutState.offsetY;

  setInventoryPanelPosition(nextLeft, nextTop, {
    clamp: true,
    updateState: true,
  });
};

const handleInventoryDragPointerUp = (event) => {
  if (
    !inventoryLayoutState.dragging ||
    event.pointerId !== inventoryLayoutState.pointerId
  ) {
    return;
  }

  removeInventoryDragListeners();
  inventoryLayoutState.dragging = false;
  inventoryLayoutState.pointerId = null;

  if (inventoryDialog instanceof HTMLElement) {
    inventoryDialog.classList.remove("is-dragging");
  }

  if (inventoryDragHandle instanceof HTMLElement) {
    inventoryDragHandle.classList.remove("is-dragging");
  }

  if (inventoryPanel instanceof HTMLElement) {
    inventoryPanel.classList.remove("is-dragging");
  }

  if (inventoryLayoutState.position) {
    setInventoryPanelPosition(
      inventoryLayoutState.position.left,
      inventoryLayoutState.position.top,
      { clamp: true, updateState: true }
    );
    schedulePersistInventoryState();
  }
};

const handleInventoryDragPointerDown = (event) => {
  if (!(inventoryDragHandle instanceof HTMLElement)) {
    return;
  }

  if (!(inventoryDialog instanceof HTMLElement)) {
    return;
  }

  if (typeof event.button === "number" && event.button !== 0) {
    return;
  }

  if (inventoryLayoutState.dragging) {
    return;
  }

  const panelIsOpen =
    inventoryPanel instanceof HTMLElement &&
    inventoryPanel.dataset.open === "true" &&
    inventoryPanel.hidden !== true;

  if (!panelIsOpen) {
    return;
  }

  const rect = inventoryDialog.getBoundingClientRect();

  inventoryLayoutState.dragging = true;
  inventoryLayoutState.pointerId = event.pointerId;
  inventoryLayoutState.offsetX = event.clientX - rect.left;
  inventoryLayoutState.offsetY = event.clientY - rect.top;
  inventoryLayoutState.dimensions.width = rect.width;
  inventoryLayoutState.dimensions.height = rect.height;

  if (inventoryDialog instanceof HTMLElement) {
    inventoryDialog.classList.add("is-dragging");
  }

  if (inventoryDragHandle instanceof HTMLElement) {
    inventoryDragHandle.classList.add("is-dragging");
  }

  if (inventoryPanel instanceof HTMLElement) {
    inventoryPanel.classList.add("is-dragging");
  }

  removeInventoryDragListeners();
  window.addEventListener("pointermove", handleInventoryDragPointerMove);
  window.addEventListener("pointerup", handleInventoryDragPointerUp);
  window.addEventListener("pointercancel", handleInventoryDragPointerUp);

  event.preventDefault();
};

const handleInventoryWindowResize = () => {
  hideInventoryTooltip();

  if (!inventoryLayoutState.position) {
    return;
  }

  if (inventoryResizeAnimationFrameId) {
    return;
  }

  inventoryResizeAnimationFrameId = window.requestAnimationFrame(() => {
    inventoryResizeAnimationFrameId = 0;
    ensureInventoryPanelPosition({ clamp: true });
  });
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

const serializeInventoryStateForPersistence = () => {
  normalizeInventoryCustomOrder();

  const order = inventoryState.customOrder.slice();

  for (let index = 0; index < order.length; index += 1) {
    const key = order[index];

    if (
      typeof key === "string" &&
      inventoryState.entryMap.has(key)
    ) {
      continue;
    }

    order[index] = null;
  }

  while (order.length > 0 && order[order.length - 1] === null) {
    order.pop();
  }

  return {
    entries: inventoryState.entries.map((entry) => ({
      key: entry.key,
      element: { ...entry.element },
      count: entry.count,
      terrains: Array.from(entry.terrains),
      lastTerrain: entry.lastTerrain,
      lastCollectedAt: entry.lastCollectedAt,
    })),
    order,
    layout: inventoryLayoutState.position
      ? {
          left: Math.round(inventoryLayoutState.position.left),
          top: Math.round(inventoryLayoutState.position.top),
        }
      : null,
  };
};

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

    if (data && typeof data === "object" && "layout" in data) {
      if (
        data.layout &&
        Number.isFinite(data.layout.left) &&
        Number.isFinite(data.layout.top)
      ) {
        const left = Math.round(data.layout.left);
        const top = Math.round(data.layout.top);
        setInventoryPanelPosition(left, top, {
          clamp: false,
          updateState: true,
        });
      } else if (data.layout === null) {
        clearInventoryPanelPositionStyles();
      }
    }

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

        if (Array.isArray(data.order)) {
          const restoredOrder = createEmptyInventorySlotOrder();
          const seenOrderKeys = new Set();
          const limit = Math.min(data.order.length, INVENTORY_SLOT_COUNT);

          for (let index = 0; index < limit; index += 1) {
            const key = data.order[index];

            if (
              typeof key !== "string" ||
              !inventoryState.entryMap.has(key) ||
              seenOrderKeys.has(key)
            ) {
              continue;
            }

            restoredOrder[index] = key;
            seenOrderKeys.add(key);
          }

          inventoryState.customOrder = restoredOrder;
        } else {
          inventoryState.customOrder = createEmptyInventorySlotOrder();
        }

        normalizeInventoryCustomOrder();

        restored = true;
      }
    } else {
      inventoryState.customOrder = createEmptyInventorySlotOrder();
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

const recordInventoryResource = (detail, { allowDroneSource = false } = {}) => {
  if (!detail?.element) {
    return;
  }

  const resourceSource =
    typeof detail?.source === "string" ? detail.source.trim() : "";

  if (!allowDroneSource && resourceSource === DRONE_QUICK_SLOT_ID) {
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

    if (
      (!Number.isFinite(entry.element.weight) || entry.element.weight <= 0) &&
      Number.isFinite(elementDetails.weight) &&
      elementDetails.weight > 0
    ) {
      entry.element.weight = elementDetails.weight;
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

const grantNewGameStarterResources = () => {
  let granted = false;

  NEW_GAME_STARTER_RESOURCES.forEach((resource) => {
    const count = Number.isFinite(resource?.count)
      ? Math.max(0, Math.floor(resource.count))
      : 0;

    if (!resource?.element || count <= 0) {
      return;
    }

    for (let iteration = 0; iteration < count; iteration += 1) {
      recordInventoryResource({ element: resource.element });
    }

    granted = true;
  });

  return granted;
};

const restoredInventoryFromStorage = restoreInventoryStateFromStorage();

if (!restoredInventoryFromStorage) {
  grantNewGameStarterResources();
}

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

  hideInventoryTooltip();
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
  inventoryLayoutState.dragging = false;
  inventoryLayoutState.pointerId = null;
  removeInventoryDragListeners();

  if (inventoryDialog instanceof HTMLElement) {
    inventoryDialog.classList.remove("is-dragging");
  }

  if (inventoryDragHandle instanceof HTMLElement) {
    inventoryDragHandle.classList.remove("is-dragging");
  }

  resetInventoryReorderState();
  inventoryPanel.classList.remove("is-dragging");
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
    ensureInventoryPanelPosition({ clamp: true });
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

if (inventoryDragHandle instanceof HTMLElement) {
  inventoryDragHandle.addEventListener(
    "pointerdown",
    handleInventoryDragPointerDown,
    { passive: false }
  );
}

if (inventoryList instanceof HTMLElement) {
  inventoryList.addEventListener(
    "pointerdown",
    handleInventoryItemPointerDownForReorder,
    { passive: false }
  );
  inventoryList.addEventListener(
    "pointerover",
    handleInventoryItemPointerOver
  );
  inventoryList.addEventListener("pointerout", handleInventoryItemPointerOut);
  inventoryList.addEventListener("focusin", handleInventoryItemFocusIn);
  inventoryList.addEventListener("focusout", handleInventoryItemFocusOut);
}

if (inventoryBody instanceof HTMLElement) {
  inventoryBody.addEventListener("scroll", hideInventoryTooltip, {
    passive: true,
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("resize", handleInventoryWindowResize);
  window.addEventListener("orientationchange", handleInventoryWindowResize);
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

const droneNotificationsEnabled = false;

const showDroneTerminalToast = (payload) => {
  if (!droneNotificationsEnabled) {
    return;
  }

  showTerminalToast(payload);
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

const showDroneResourceToast = (payload) => {
  if (!droneNotificationsEnabled) {
    return;
  }

  showResourceToast(payload);
};

const getDronePayloadText = () => {
  const payload = Math.max(
    0,
    Math.min(droneState.payloadGrams, DRONE_MINER_MAX_PAYLOAD_GRAMS)
  );
  const payloadText = formatGrams(payload);
  const capacityText = formatKilograms(DRONE_MINER_MAX_PAYLOAD_KG);
  return `${payloadText} / ${capacityText}`;
};

const getDroneMissionSummary = () => {
  const detail = droneState.lastResult;

  if (!detail) {
    if (droneState.status === "collecting") {
      return "Autonomous drone is en route to the target.";
    }

    if (droneState.status === "returning") {
      return "Autonomous drone is returning with collected materials.";
    }

    if (droneState.status === "idle") {
      return "Scanning for the next viable mining site.";
    }

    return droneState.active
      ? "Automation standing by."
      : "Automation offline.";
  }

  if (detail.found && detail.element) {
    const { symbol, name } = detail.element;
    const label = symbol && name ? `${symbol} (${name})` : symbol || name || "Sample";
    const terrainLabel =
      typeof detail?.terrain?.label === "string" && detail.terrain.label.trim() !== ""
        ? detail.terrain.label.trim()
        : "";
    return terrainLabel ? `${label} • ${terrainLabel}` : `${label} secured.`;
  }

  return "Drone returned without a sample.";
};

function updateDroneStatusUi() {
  updateDroneQuickSlotState();

  if (!(droneStatusPanel instanceof HTMLElement)) {
    return;
  }

  const statusLabelElement =
    droneStatusLabel instanceof HTMLElement ? droneStatusLabel : null;
  const detailElement =
    droneStatusDetail instanceof HTMLElement ? droneStatusDetail : null;
  const payloadElement =
    dronePayloadLabel instanceof HTMLElement ? dronePayloadLabel : null;

  if (!droneState.active) {
    droneStatusPanel.hidden = true;
    delete droneStatusPanel.dataset.state;
    return;
  }

  let statusText = "Scanning";
  let detailText = getDroneMissionSummary();

  if (!sceneController?.launchDroneMiner) {
    detailText = "Drone controls unavailable.";
  }

  switch (droneState.status) {
    case "collecting":
      statusText = "Collecting";
      detailText = getDroneMissionSummary();
      break;
    case "returning":
      statusText = "Returning";
      detailText = "Drone is en route to your position.";
      break;
    case "idle":
    default:
      statusText = "Scanning";
      detailText = getDroneMissionSummary();
      break;
  }

  if (statusLabelElement) {
    statusLabelElement.textContent = statusText;
  }

  if (detailElement) {
    detailElement.textContent = detailText;
  }

  if (payloadElement) {
    payloadElement.textContent = `Payload ${getDronePayloadText()}`;
  }

  droneStatusPanel.hidden = false;
  droneStatusPanel.dataset.state = droneState.status;
}

updateDroneStatusUi();

const cancelDroneAutomationRetry = () => {
  if (droneAutomationRetryTimeoutId) {
    window.clearTimeout(droneAutomationRetryTimeoutId);
    droneAutomationRetryTimeoutId = 0;
  }
};

const scheduleDroneAutomationRetry = () => {
  cancelDroneAutomationRetry();

  if (!droneState.active) {
    return;
  }

  droneAutomationRetryTimeoutId = window.setTimeout(() => {
    droneAutomationRetryTimeoutId = 0;

    if (!droneState.active || droneState.inFlight) {
      return;
    }

    attemptDroneLaunch();
  }, DRONE_AUTOMATION_RETRY_DELAY_MS);
};

const storeDroneSample = (detail) => {
  if (!detail?.found || !detail.element) {
    return false;
  }

  const storedSample = { ...detail, source: DRONE_QUICK_SLOT_ID };
  droneState.cargo.push(storedSample);
  const weight = getInventoryElementWeight(detail.element);
  const numericWeight = Number.isFinite(weight) ? weight : 0;
  droneState.payloadGrams = Math.max(0, droneState.payloadGrams + numericWeight);
  persistDroneCargoSnapshot();
  return true;
};

const deliverDroneCargo = () => {
  const deliveries = droneState.cargo.splice(0);
  let deliveredCount = 0;
  let deliveredWeight = 0;

  deliveries.forEach((sample) => {
    if (!sample?.found || !sample.element) {
      return;
    }

    recordInventoryResource(sample, { allowDroneSource: true });
    deliveredCount += 1;
    deliveredWeight += getInventoryElementWeight(sample.element);
  });

  droneState.payloadGrams = 0;
  persistDroneCargoSnapshot();

  return { deliveredCount, deliveredWeight };
};

const finalizeDroneAutomationShutdown = () => {
  const { deliveredCount, deliveredWeight } = deliverDroneCargo();
  droneState.pendingShutdown = false;
  droneState.status = "inactive";
  droneState.lastResult = null;
  droneState.inFlight = false;
  droneState.awaitingReturn = false;
  updateDroneStatusUi();

  const hasSamples = deliveredCount > 0;
  const description = hasSamples
    ? `${deliveredCount} sample${deliveredCount === 1 ? "" : "s"} • ${formatGrams(deliveredWeight)}`
    : "No resources recovered.";
  showDroneResourceToast({ title: "Drone delivery", description });
  showDroneTerminalToast({
    title: hasSamples ? "Materials transferred" : "Drone returned",
    description: hasSamples
      ? "All stored materials moved to inventory."
      : "Automation complete with no samples recovered.",
  });
};

const attemptDroneLaunch = () => {
  cancelDroneAutomationRetry();

  if (!droneState.active || droneState.inFlight || droneState.awaitingReturn) {
    return;
  }

  if (!sceneController?.launchDroneMiner) {
    showDroneResourceToast({
      title: "Drone controls offline",
      description: "Flight systems are unavailable right now.",
    });
    droneState.active = false;
    finalizeDroneAutomationShutdown();
    return;
  }

  const launchResult = sceneController.launchDroneMiner();

  if (!launchResult?.started) {
    droneState.status = "idle";
    updateDroneStatusUi();

    if (launchResult?.reason === "no-target" && !droneState.notifiedUnavailable) {
      droneState.notifiedUnavailable = true;
      showDroneResourceToast({
        title: "No mining target",
        description: "Drone will continue scanning for resources.",
      });
    }

    scheduleDroneAutomationRetry();
    return;
  }

  droneState.status = "collecting";
  droneState.inFlight = true;
  droneState.lastResult = null;
  droneState.notifiedUnavailable = false;
  updateDroneStatusUi();
};

const activateDroneAutomation = () => {
  if (droneState.active) {
    return;
  }

  droneState.active = true;
  droneState.pendingShutdown = false;
  droneState.awaitingReturn = false;
  droneState.cargo = [];
  droneState.payloadGrams = 0;
  droneState.status = "idle";
  droneState.lastResult = null;
  droneState.notifiedUnavailable = false;
  persistDroneCargoSnapshot();
  updateDroneStatusUi();
  showDroneTerminalToast({
    title: "Drone automation engaged",
    description: "Press 2 again to recall the drone and unload cargo.",
  });
  attemptDroneLaunch();
};

const resumeDroneAutomation = () => {
  if (!droneState.pendingShutdown) {
    return;
  }

  droneState.pendingShutdown = false;
  droneState.active = true;
  droneState.status = droneState.awaitingReturn
    ? "returning"
    : droneState.inFlight
    ? "collecting"
    : "idle";
  updateDroneStatusUi();
  showDroneTerminalToast({
    title: "Drone automation resumed",
    description: "Continuing mining operations.",
  });

  if (!droneState.inFlight && !droneState.awaitingReturn) {
    attemptDroneLaunch();
  }
};

const deactivateDroneAutomation = () => {
  if (!droneState.active) {
    return;
  }

  droneState.active = false;
  cancelDroneAutomationRetry();
  updateDroneStatusUi();

  if (droneState.inFlight) {
    droneState.pendingShutdown = true;

    const cancelled = typeof sceneController?.cancelDroneMinerSession === "function"
      ? sceneController.cancelDroneMinerSession({ reason: "manual" })
      : false;

    if (!cancelled) {
      showDroneTerminalToast({
        title: "Drone recall scheduled",
        description: "Drone will return after the current run.",
      });
    }

    return;
  }

  finalizeDroneAutomationShutdown();
};

const handleDroneToggleRequest = () => {
  if (droneState.active) {
    deactivateDroneAutomation();
    return;
  }

  if (droneState.pendingShutdown) {
    resumeDroneAutomation();
    return;
  }

  activateDroneAutomation();
};

const handleDroneResourceCollected = (detail) => {
  droneState.inFlight = false;
  droneState.status = "returning";
  droneState.awaitingReturn = true;
  droneState.lastResult = detail ?? null;

  const storedSample = storeDroneSample(detail);

  if (storedSample && detail?.element) {
    const { symbol, name } = detail.element;
    const label = symbol && name ? `${symbol} (${name})` : symbol || name || "Sample";
    const title = `Drone stored ${label}`;
    const description = `Payload ${getDronePayloadText()} secured aboard.`;

    showDroneResourceToast({ title, description });
    showDroneTerminalToast({ title: "Drone miner", description });
  }

  updateDroneStatusUi();
};

const handleDroneSessionCancelled = (reason) => {
  droneState.inFlight = false;
  droneState.lastResult = null;
  droneState.awaitingReturn = false;

  if (droneState.pendingShutdown) {
    finalizeDroneAutomationShutdown();
    return;
  }

  if (droneState.active) {
    droneState.status = "idle";
    updateDroneStatusUi();
    scheduleDroneAutomationRetry();
    return;
  }

  let description = "Drone recall complete.";

  if (reason === "movement") {
    description = "Drone deployment interrupted.";
  } else if (reason === "controls-unlocked") {
    description = "Drone control link lost.";
  }

  showDroneResourceToast({ title: "Drone recalled", description });
};

const handleDroneReturnComplete = () => {
  droneState.awaitingReturn = false;

  if (droneState.pendingShutdown) {
    finalizeDroneAutomationShutdown();
    return;
  }

  if (!droneState.active) {
    updateDroneStatusUi();
    return;
  }

  droneState.status = "idle";
  updateDroneStatusUi();
  attemptDroneLaunch();
};

const handleDroneQuickSlotActivation = (event) => {
  if (!(event instanceof CustomEvent)) {
    return;
  }

  const { slot, userInitiated } = event.detail ?? {};

  if (!userInitiated || slot?.id !== DRONE_QUICK_SLOT_ID) {
    return;
  }

  handleDroneToggleRequest();
};

if (canvas instanceof HTMLElement) {
  canvas.addEventListener("quick-slot:change", handleDroneQuickSlotActivation);
}

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
  sceneController?.setLiftInteractionsEnabled?.(!nextState);

  if (!nextState) {
    setCrosshairSourceState("edit", false);
  }

  const description = nextState
    ? "Hover placed models to highlight them. Left click to pick them up and place them again, or press Delete to remove. Press Esc to exit. Lift controls are locked while editing."
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
      setPointerLockImmersiveModeEnabled(true);
    },
    onControlsUnlocked() {
      instructions?.removeAttribute("hidden");
      resetCrosshairInteractableState();
      hideTerminalToast();
      hideResourceToast();
      setPointerLockImmersiveModeEnabled(false);
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
      if (editModeActive) {
        showTerminalToast({
          title: "Lift locked",
          description: "Finish editing placed models before changing decks.",
        });
        return false;
      }

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
      if (detail?.source === "drone-miner") {
        handleDroneResourceCollected(detail);
        return;
      }

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
    onResourceSessionCancelled({ reason, source } = {}) {
      if (source === "drone-miner") {
        handleDroneSessionCancelled(reason);
        return;
      }

      if (reason === "movement") {
        showResourceToast({ title: "Digging interrupted" });
      }
    },
    onDroneReturnComplete: handleDroneReturnComplete,
  });

  updateDroneStatusUi();

  sceneController?.setPlayerHeight?.(DEFAULT_PLAYER_HEIGHT, { persist: true });
  sceneController?.setLiftInteractionsEnabled?.(!editModeActive);

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

    clearStoredDroneState();

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
