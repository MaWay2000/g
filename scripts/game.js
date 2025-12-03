import { logout } from "./auth.js";
import { initScene } from "./scene.js";
import {
  DEFAULT_PLAYER_HEIGHT,
  clearStoredPlayerState,
} from "./player-state-storage.js";
import { FpsMeter } from "./fps-meter.js";
import {
  clearStoredDroneState,
  loadStoredDroneState,
  persistDroneCargoState,
} from "./drone-state-storage.js";
import {
  clearStoredSettings,
  loadStoredSettings,
  persistSettings,
} from "./settings-storage.js";
import { PERIODIC_ELEMENTS } from "./data/periodic-elements.js";
import {
  MAX_ACTIVE_MISSIONS,
  completeMission,
  getActiveMissions,
  getMissions,
  getPendingMissions,
  subscribeToMissionState,
} from "./missions.js";
import {
  addMarsMoney,
  getCurrencyBalance,
  isCurrencyStorageAvailable,
  subscribeToCurrency,
} from "./currency.js";
import { loadMarketState, persistMarketState } from "./market-state-storage.js";
import { loadStoredTodos, persistTodos } from "./todo-storage.js";

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
const settingsMenu = document.querySelector("[data-settings-menu]");
const settingsTrigger = settingsMenu?.querySelector("[data-settings-trigger]");
const settingsPanel = settingsMenu?.querySelector("[data-settings-panel]");
const fpsToggle = document.querySelector("[data-fps-toggle]");
const fpsMeterElement = document.querySelector("[data-fps-meter]");
const missionIndicator = document.querySelector("[data-mission-indicator]");
const missionIndicatorActiveLabel = missionIndicator?.querySelector(
  "[data-mission-indicator-active]"
);
const missionIndicatorList = missionIndicator?.querySelector(
  "[data-mission-indicator-list]"
);
const missionIndicatorNextLabel = missionIndicator?.querySelector(
  "[data-mission-indicator-next]"
);
const currencyIndicator = document.querySelector("[data-currency-indicator]");
const currencyIndicatorValue = currencyIndicator?.querySelector(
  "[data-currency-balance]"
);
const quickSlotBar = document.querySelector("[data-quick-slot-bar]");
const resourceToolLabel = document.querySelector("[data-resource-tool-label]");
const resourceToolDescription = document.querySelector(
  "[data-resource-tool-description]"
);
const droneStatusPanels = Array.from(
  document.querySelectorAll("[data-drone-status-panel]") ?? []
);
const droneStatusLabels = Array.from(
  document.querySelectorAll("[data-drone-status-label]") ?? []
);
const droneStatusDetails = Array.from(
  document.querySelectorAll("[data-drone-status-detail]") ?? []
);
const dronePayloadLabels = Array.from(
  document.querySelectorAll("[data-drone-payload]") ?? []
);
const droneFuelLabels = Array.from(document.querySelectorAll("[data-drone-fuel]") ?? []);
const dronePayloadMeters = Array.from(
  document.querySelectorAll("[data-drone-payload-bar]") ?? []
);
const droneFuelMeters = Array.from(document.querySelectorAll("[data-drone-fuel-bar]") ?? []);
const searchParams = new URL(window.location.href).searchParams;
const inventoryViewingMode =
  searchParams.get("inventoryView") === "watch" ? "watch" : "manage";
const periodicElementLookup = new Map(
  (Array.isArray(PERIODIC_ELEMENTS) ? PERIODIC_ELEMENTS : []).map((element) => [
    (element?.symbol ?? "").toUpperCase(),
    element,
  ])
);
let currentSettings = loadStoredSettings();
const fpsMeter = new FpsMeter(fpsMeterElement);
const droneRefuelButtons = Array.from(
  document.querySelectorAll("[data-drone-refuel]") ?? []
);
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

const setSettingsMenuOpen = (isOpen) => {
  if (
    !(settingsMenu instanceof HTMLElement) ||
    !(settingsPanel instanceof HTMLElement) ||
    !(settingsTrigger instanceof HTMLElement)
  ) {
    return;
  }

  const nextState = Boolean(isOpen);
  settingsMenu.dataset.open = nextState ? "true" : "false";
  settingsPanel.hidden = !nextState;
  settingsTrigger.setAttribute("aria-expanded", String(nextState));
};

setSettingsMenuOpen(false);

if (settingsTrigger instanceof HTMLElement && settingsPanel instanceof HTMLElement) {
  settingsTrigger.addEventListener("click", () => {
    const isOpen = settingsMenu instanceof HTMLElement && settingsMenu.dataset.open === "true";
    setSettingsMenuOpen(!isOpen);
  });

  document.addEventListener("pointerdown", (event) => {
    if (settingsMenu?.dataset.open !== "true") {
      return;
    }

    if (!(event.target instanceof Node)) {
      return;
    }

    if (!(settingsMenu instanceof HTMLElement) || settingsMenu.contains(event.target)) {
      return;
    }

    setSettingsMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (settingsMenu?.dataset.open !== "true") {
      return;
    }

    setSettingsMenuOpen(false);
    settingsTrigger.focus({ preventScroll: true });
  });
}

const applyFpsUiState = () => {
  const shouldShowFps = Boolean(currentSettings?.showFpsCounter);

  if (fpsToggle instanceof HTMLInputElement) {
    fpsToggle.checked = shouldShowFps;
    fpsToggle.setAttribute("aria-pressed", String(shouldShowFps));
  }

  fpsMeter.setEnabled(shouldShowFps);
};

applyFpsUiState();

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
const inventoryCapacityWarning = inventoryPanel?.querySelector(
  "[data-inventory-capacity-warning]"
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
const inventoryTooltipDetails = inventoryTooltip?.querySelector(
  "[data-inventory-tooltip-details]"
);
const inventoryDroneRefuelButton = inventoryPanel?.querySelector(
  "[data-inventory-drone-refuel]"
);
const inventoryDroneStatusLabel = inventoryPanel?.querySelector(
  "[data-inventory-drone-status]"
);
const inventoryDroneAutoRefillToggle = inventoryPanel?.querySelector(
  "[data-inventory-drone-auto-refill]"
);
const todoPanel = document.querySelector("[data-todo-panel]");
const todoDialog = todoPanel?.querySelector("[data-todo-dialog]");
const todoListElement = todoPanel?.querySelector("[data-todo-list]");
const todoEmptyState = todoPanel?.querySelector("[data-todo-empty]");
const todoStatusMessage = todoPanel?.querySelector("[data-todo-status]");
const todoAddButton = todoPanel?.querySelector("[data-todo-add]");
const todoSaveButton = todoPanel?.querySelector("[data-todo-save]");
const todoCloseButtons = Array.from(
  todoPanel?.querySelectorAll("[data-todo-close]") ?? []
);
const droneFuelGrid = inventoryPanel?.querySelector("[data-drone-fuel-grid]");
const droneFuelSourceList = inventoryPanel?.querySelector(
  "[data-drone-fuel-sources]"
);
const droneInventoryTabButton = inventoryPanel?.querySelector(
  '[data-inventory-tab-target="drone"]'
);
const droneInventorySection = inventoryPanel?.querySelector(
  '[data-inventory-section="drone"]'
);

if (inventoryPanel instanceof HTMLElement) {
  inventoryPanel.dataset.inventoryViewMode = inventoryViewingMode;
}

const inventoryTabButtons = Array.from(
  inventoryPanel?.querySelectorAll("[data-inventory-tab-target]") ?? []
).filter((button) => button instanceof HTMLButtonElement);
const inventoryTabSections = new Map(
  Array.from(inventoryPanel?.querySelectorAll("[data-inventory-section]") ?? []).map(
    (section) => [section.dataset.inventorySection, section]
  )
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
  research: document.getElementById("quick-access-modal-research"),
  market: document.getElementById("quick-access-modal-market"),
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

  const GRAMS_PER_KILOGRAM = 1000;
  const DEFAULT_ELEMENT_WEIGHT_GRAMS = 1;
  const INVENTORY_CAPACITY_GRAMS = 10 * GRAMS_PER_KILOGRAM;
  const DRONE_MINER_MAX_PAYLOAD_KG = 1;
  const DRONE_MINER_MAX_PAYLOAD_GRAMS =
    DRONE_MINER_MAX_PAYLOAD_KG * GRAMS_PER_KILOGRAM;

  const getElementWeightFromAtomicNumber = (number) => {
    if (!Number.isFinite(number) || number <= 0) {
      return DEFAULT_ELEMENT_WEIGHT_GRAMS;
    }

    return number;
  };

  const PERIODIC_ELEMENT_BY_SYMBOL = new Map(
    PERIODIC_ELEMENTS.map((element) => [element.symbol.toLowerCase(), element])
  );
  const PERIODIC_ELEMENT_BY_NAME = new Map(
    PERIODIC_ELEMENTS.map((element) => [element.name.toLowerCase(), element])
  );

  const getPeriodicElementDetails = (symbol, name) => {
    const normalizedSymbol =
      typeof symbol === "string" ? symbol.trim().toLowerCase() : "";
    const normalizedName =
      typeof name === "string" ? name.trim().toLowerCase() : "";

    if (normalizedSymbol && PERIODIC_ELEMENT_BY_SYMBOL.has(normalizedSymbol)) {
      return PERIODIC_ELEMENT_BY_SYMBOL.get(normalizedSymbol);
    }

    if (normalizedName && PERIODIC_ELEMENT_BY_NAME.has(normalizedName)) {
      return PERIODIC_ELEMENT_BY_NAME.get(normalizedName);
    }

    return null;
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

  const sanitizeInventoryElement = (element = {}) => {
    let symbol = typeof element.symbol === "string" ? element.symbol.trim() : "";
    let name = typeof element.name === "string" ? element.name.trim() : "";
    let number = Number.isFinite(element.number) ? element.number : null;
    let category =
      typeof element.category === "string" ? element.category.trim() : "";
    let atomicMass =
      Number.isFinite(element.atomicMass) && element.atomicMass > 0
        ? element.atomicMass
        : null;
    let meltingPoint =
      Number.isFinite(element.meltingPoint) && element.meltingPoint > 0
        ? element.meltingPoint
        : null;
    let boilingPoint =
      Number.isFinite(element.boilingPoint) && element.boilingPoint > 0
        ? element.boilingPoint
        : null;
    let discoveryYear = Number.isFinite(element.discoveryYear)
      ? element.discoveryYear
      : null;
    let discoverer =
      typeof element.discoverer === "string" ? element.discoverer.trim() : "";
    let summary =
      typeof element.summary === "string" ? element.summary.trim() : "";

    const periodicFallback = getPeriodicElementDetails(symbol, name);

    if (periodicFallback) {
      if (!symbol && periodicFallback.symbol) {
        symbol = periodicFallback.symbol;
      }

      if (!name && periodicFallback.name) {
        name = periodicFallback.name;
      }

      if (number === null && Number.isFinite(periodicFallback.number)) {
        number = periodicFallback.number;
      }

      if (!category && periodicFallback.category) {
        category = periodicFallback.category;
      }

      if (atomicMass === null && Number.isFinite(periodicFallback.atomicMass)) {
        atomicMass = periodicFallback.atomicMass;
      }

      if (meltingPoint === null && Number.isFinite(periodicFallback.meltingPoint)) {
        meltingPoint = periodicFallback.meltingPoint;
      }

      if (boilingPoint === null && Number.isFinite(periodicFallback.boilingPoint)) {
        boilingPoint = periodicFallback.boilingPoint;
      }

      if (discoveryYear === null && Number.isFinite(periodicFallback.discoveryYear)) {
        discoveryYear = periodicFallback.discoveryYear;
      }

      if (!discoverer && periodicFallback.discoverer) {
        discoverer = periodicFallback.discoverer;
      }

      if (!summary && periodicFallback.summary) {
        summary = periodicFallback.summary.trim();
      }
    }

    let weight =
      Number.isFinite(element.weight) && element.weight > 0
        ? element.weight
        : null;

    if (weight === null && number !== null) {
      weight = getElementWeightFromAtomicNumber(number);
    }

    if (weight === null && atomicMass !== null) {
      weight = atomicMass;
    }

    if (
      weight === null &&
      periodicFallback &&
      Number.isFinite(periodicFallback.atomicMass) &&
      periodicFallback.atomicMass > 0
    ) {
      weight = periodicFallback.atomicMass;
    }

    if (weight === null && element.weight === 0) {
      weight = 0;
    }

    return {
      symbol,
      name,
      number,
      weight,
      category,
      atomicMass,
      meltingPoint,
      boilingPoint,
      discoveryYear,
      discoverer,
      summary,
    };
  };

  const getInventoryEntryKey = (element) => {
    const symbolKey = element.symbol ? element.symbol.toUpperCase() : "";
    const nameKey = element.name ? element.name.toLowerCase() : "";
    const numberKey = element.number !== null ? element.number : "";
    return `${symbolKey}|${nameKey}|${numberKey}`;
  };

  const getInventoryEntryByKey = (key) => {
    if (typeof key !== "string" || key.trim() === "") {
      return null;
    }

    return inventoryState.entries.find((entry) => entry?.key === key) ?? null;
  };

  const getFuelSourceForElement = (element) => {
    const elementKey = getInventoryEntryKey(sanitizeInventoryElement(element ?? {}));

    return (
      DRONE_FUEL_SOURCES.find((source) => {
        const sourceKey = getInventoryEntryKey(
          sanitizeInventoryElement(source?.element ?? {})
        );
        return sourceKey === elementKey;
      }) ?? null
    );
  };

  const DRONE_FUEL_SOURCES = [
    {
      element: { number: 2, symbol: "He", name: "Helium" },
      fuelValue: 1,
      runtimeMultiplier: 2,
    },
    {
      element: { number: 1, symbol: "H", name: "Hydrogen" },
      fuelValue: 1,
    },
  ];
  const DRONE_FUEL_CAPACITY = 3;
  const DRONE_FUEL_PER_LAUNCH = 1;
  const DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT = 200;
  const DRONE_MINING_STALL_TIMEOUT_MS = 15000;
  const DRONE_STALL_CHECK_INTERVAL_MS = 2000;
  const DRONE_PICKUP_DISTANCE_SQUARED = 9;

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
  fuelCapacity: DRONE_FUEL_CAPACITY,
  fuelRemaining: 0,
  fuelSlots: [],
  miningSecondsSinceFuelUse: 0,
  miningSessionStartMs: 0,
  autoRefillEnabled: false,
};

let droneRelaunchPendingAfterRestore = false;

  const dronePickupState = {
    required: false,
    location: null,
    proximityCheckId: 0,
  };

  const sanitizeFuelSlotEntry = (slot) => {
    if (!slot || typeof slot !== "object") {
      return null;
    }

    const element = sanitizeInventoryElement(slot.element ?? slot ?? {});
    const symbol =
      typeof slot.symbol === "string" && slot.symbol.trim()
        ? slot.symbol.trim()
        : typeof element.symbol === "string"
          ? element.symbol
          : "Fuel";
    const name =
      typeof slot.name === "string" && slot.name.trim()
        ? slot.name.trim()
        : typeof element.name === "string"
          ? element.name
          : "Fuel";
    const refundable = slot.refundable !== false;
    const runtimeSeconds = Number.isFinite(slot.runtimeSeconds)
      ? Math.max(1, slot.runtimeSeconds)
      : DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT;

    return {
      element,
      symbol,
      name,
      refundable,
      runtimeSeconds,
    };
  };

  const ensureDroneFuelSlots = (capacityOverride = null) => {
    const capacity = Math.max(
      1,
      Number.isFinite(capacityOverride)
        ? Math.floor(capacityOverride)
        : droneState.fuelCapacity || DRONE_FUEL_CAPACITY
    );
    const slots = Array.isArray(droneState.fuelSlots)
      ? droneState.fuelSlots.slice(0, capacity).map(sanitizeFuelSlotEntry)
      : [];

    while (slots.length < capacity) {
      slots.push(null);
    }

    const expectedFuelUnits = Math.max(
      0,
      Math.min(droneState.fuelRemaining, capacity)
    );
    let filledUnits = slots.reduce((total, slot) => total + (slot ? 1 : 0), 0);

    for (let index = 0; index < capacity && filledUnits < expectedFuelUnits; index += 1) {
      if (!slots[index]) {
        slots[index] = sanitizeFuelSlotEntry({ element: {} });
        filledUnits += 1;
      }
    }

    droneState.fuelSlots = slots;
    droneState.fuelRemaining = slots.reduce(
      (total, slot) => total + (slot ? 1 : 0),
      0
    );

    return capacity;
  };

  const getFuelValueForSource = (source) => {
    if (!source) {
      return 1;
    }

    return Number.isFinite(source?.fuelValue)
      ? Math.max(1, Math.floor(source.fuelValue))
      : 1;
  };

  const getFuelRuntimeSecondsForSource = (source) => {
    if (!source) {
      return DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT;
    }

    if (Number.isFinite(source?.runtimeSeconds)) {
      return Math.max(1, source.runtimeSeconds);
    }

    const multiplier = Number.isFinite(source?.runtimeMultiplier)
      ? Math.max(0.1, source.runtimeMultiplier)
      : 1;

    return DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT * multiplier;
  };

  const getFuelRuntimeSecondsForSlot = (slot) => {
    if (!slot) {
      return DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT;
    }

    return Number.isFinite(slot?.runtimeSeconds)
      ? Math.max(1, slot.runtimeSeconds)
      : DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT;
  };

  const getActiveFuelSlotIndex = () => {
    const capacity = ensureDroneFuelSlots();

    for (let index = capacity - 1; index >= 0; index -= 1) {
      if (droneState.fuelSlots[index]) {
        return index;
      }
    }

    return -1;
  };

  const getActiveFuelSlotInfo = () => {
    const index = getActiveFuelSlotIndex();

    if (index < 0) {
      return null;
    }

    const slot = droneState.fuelSlots[index];

    return {
      index,
      slot,
      runtimeSeconds: getFuelRuntimeSecondsForSlot(slot),
    };
  };

const applyStoredDroneState = () => {
  const stored = loadStoredDroneState();

  if (!stored || typeof stored !== "object") {
    return;
  }

  droneState.miningSessionStartMs = 0;
  let shouldRelaunchAfterRestore = false;

  if (stored.cargo) {
    const samples = Array.isArray(stored.cargo.samples)
      ? stored.cargo.samples.slice()
      : [];
    droneState.cargo = samples;
    droneState.payloadGrams = Number.isFinite(stored.cargo.payloadGrams)
      ? Math.max(0, stored.cargo.payloadGrams)
      : 0;
    droneState.fuelCapacity = Number.isFinite(stored.cargo.fuelCapacity)
      ? Math.max(1, Math.floor(stored.cargo.fuelCapacity))
      : DRONE_FUEL_CAPACITY;
    droneState.fuelSlots = Array.isArray(stored.cargo.fuelSlots)
      ? stored.cargo.fuelSlots.map(sanitizeFuelSlotEntry)
      : [];
    droneState.fuelRemaining = Number.isFinite(stored.cargo.fuelRemaining)
      ? Math.max(
          0,
          Math.min(stored.cargo.fuelRemaining, droneState.fuelCapacity)
        )
      : 0;
    droneState.miningSecondsSinceFuelUse = Number.isFinite(
      stored.cargo.miningSecondsSinceFuelUse
    )
      ? Math.max(0, stored.cargo.miningSecondsSinceFuelUse)
      : 0;
    droneState.autoRefillEnabled = stored.cargo.autoRefillEnabled === true;
  } else {
    droneState.fuelCapacity = DRONE_FUEL_CAPACITY;
    droneState.fuelRemaining = 0;
    droneState.fuelSlots = [];
    droneState.miningSecondsSinceFuelUse = 0;
  }

  ensureDroneFuelSlots(droneState.fuelCapacity);
  const activeRuntimeSeconds = getActiveFuelSlotInfo()?.runtimeSeconds ??
    DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT;
  droneState.miningSecondsSinceFuelUse = Math.max(
    0,
    Math.min(droneState.miningSecondsSinceFuelUse, activeRuntimeSeconds)
  );

  const sceneState = stored.scene;
  if (sceneState) {
    const mode = typeof sceneState.mode === "string" ? sceneState.mode : "inactive";
    droneState.active = Boolean(sceneState.active);
    droneState.inFlight = sceneState.active && mode === "collecting";
    droneState.awaitingReturn = sceneState.active && mode === "returning";
    droneState.status = droneState.active
      ? mode === "returning"
        ? "returning"
        : mode === "collecting"
          ? "collecting"
          : "idle"
      : "inactive";
    shouldRelaunchAfterRestore =
      droneState.active && (mode === "collecting" || mode === "returning");
  }

  if (shouldRelaunchAfterRestore) {
    droneState.inFlight = false;
    droneState.awaitingReturn = false;
    droneState.status = "idle";
    droneState.lastResult = null;
    droneState.miningSessionStartMs = 0;
    droneRelaunchPendingAfterRestore = true;
  }
};

applyStoredDroneState();

const getPlayerPosition = () => {
  const position = sceneController?.getPlayerPosition?.();

  if (!position) {
    return null;
  }

  const { x, y, z } = position;

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return null;
  }

  return position;
};

const getDroneBasePosition = () => {
  const position = sceneController?.getDroneBasePosition?.();

  if (!position) {
    return null;
  }

  const { x, y, z } = position;

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return null;
  }

  return position;
};

const isPlayerNearDroneForPickup = () => {
  if (droneState.active || droneState.inFlight || droneState.awaitingReturn) {
    return true;
  }

  const dronePosition = dronePickupState.location ?? getDroneBasePosition();
  const playerPosition = getPlayerPosition();

  if (!dronePosition || !playerPosition) {
    return true;
  }

  const dx = playerPosition.x - dronePosition.x;
  const dy = playerPosition.y - dronePosition.y;
  const dz = playerPosition.z - dronePosition.z;

  return dx * dx + dy * dy + dz * dz <= DRONE_PICKUP_DISTANCE_SQUARED;
};

const isDronePickupRequired = () => false;

const persistDroneCargoSnapshot = () => {
  ensureDroneFuelSlots(droneState.fuelCapacity);
  persistDroneCargoState({
    samples: droneState.cargo,
    payloadGrams: droneState.payloadGrams,
    fuelCapacity: droneState.fuelCapacity,
    fuelRemaining: droneState.fuelRemaining,
    fuelSlots: droneState.fuelSlots,
    miningSecondsSinceFuelUse: droneState.miningSecondsSinceFuelUse,
    autoRefillEnabled: droneState.autoRefillEnabled,
  });
};

const getFuelSlotFillOrder = (capacity, preferredIndex = 0) => {
  const order = [];
  const normalizedPreferred = Math.max(0, Math.min(preferredIndex, capacity - 1));

  for (let index = normalizedPreferred; index < capacity; index += 1) {
    order.push(index);
  }

  for (let index = 0; index < normalizedPreferred; index += 1) {
    order.push(index);
  }

  return order;
};

const getActiveFuelElapsedSeconds = () => {
  if (droneState.fuelRemaining <= 0) {
    return 0;
  }

  const activeSlot = getActiveFuelSlotInfo();
  const activeRuntime = activeSlot?.runtimeSeconds ?? DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT;
  const storedElapsed = Math.max(
    0,
    Math.min(droneState.miningSecondsSinceFuelUse || 0, activeRuntime),
  );

  if (!droneState.inFlight || droneState.miningSessionStartMs <= 0) {
    return storedElapsed;
  }

  const activeElapsedSeconds = Math.max(
    0,
    (performance.now() - droneState.miningSessionStartMs) / 1000,
  );

  return Math.min(activeRuntime, storedElapsed + activeElapsedSeconds);
};

const getActiveFuelLifetimeRatio = () => {
  if (droneState.fuelRemaining <= 0) {
    return 0;
  }

  const elapsed = getActiveFuelElapsedSeconds();
  const activeSlot = getActiveFuelSlotInfo();
  const runtimeSeconds = activeSlot?.runtimeSeconds ?? DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT;
  const remaining = Math.max(0, runtimeSeconds - elapsed);

  return remaining / runtimeSeconds;
};

const getActiveFuelRemainingSeconds = () => {
  if (droneState.fuelRemaining <= 0) {
    return 0;
  }

  const elapsed = getActiveFuelElapsedSeconds();

  const activeSlot = getActiveFuelSlotInfo();
  const runtimeSeconds = activeSlot?.runtimeSeconds ?? DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT;

  return Math.max(0, Math.round(runtimeSeconds - elapsed));
};

const addFuelUnitsToDrone = (
  element,
  units = 0,
  preferredIndex = 0,
  refundableUnits = units,
  slotMetadata = {}
) => {
  const capacity = ensureDroneFuelSlots();
  const availableCapacity = Math.max(0, capacity - droneState.fuelRemaining);
  const unitsToAdd = Math.min(Math.max(0, units), availableCapacity);
  const refundableUnitsToAssign = Math.max(
    0,
    Math.min(refundableUnits, unitsToAdd)
  );

  if (unitsToAdd <= 0) {
    return 0;
  }

  const slotOrder = getFuelSlotFillOrder(capacity, preferredIndex);
  let added = 0;

  for (let index = 0; index < slotOrder.length; index += 1) {
    if (added >= unitsToAdd) {
      break;
    }

    const slotIndex = slotOrder[index];

    if (droneState.fuelSlots[slotIndex]) {
      continue;
    }

    droneState.fuelSlots[slotIndex] = sanitizeFuelSlotEntry({
      element,
      refundable: added < refundableUnitsToAssign,
      ...slotMetadata,
    });
    added += 1;
  }

  droneState.fuelRemaining = Math.max(0, Math.min(capacity, droneState.fuelRemaining + added));

  return added;
};

const removeFuelUnitsFromSlots = (unitsToRemove = 0) => {
  const capacity = ensureDroneFuelSlots();
  const normalizedUnits = Math.max(0, Math.min(unitsToRemove, droneState.fuelRemaining));

  if (normalizedUnits <= 0) {
    return 0;
  }

  let removed = 0;

  for (let index = 0; index < capacity && removed < normalizedUnits; index += 1) {
    const slotIndex = capacity - 1 - index;

    if (droneState.fuelSlots[slotIndex]) {
      droneState.fuelSlots[slotIndex] = null;
      removed += 1;
    }
  }

  droneState.fuelRemaining = Math.max(
    0,
    Math.min(capacity, droneState.fuelRemaining - removed)
  );

  return removed;
};

const unloadDroneFuelSlot = (slotIndex) => {
  const capacity = ensureDroneFuelSlots();

  if (capacity <= 0) {
    return { unloaded: false, fuelLabel: "" };
  }

  const normalizedIndex = Math.max(0, Math.min(slotIndex, capacity - 1));
  const slotEntry = droneState.fuelSlots[normalizedIndex];

  if (!slotEntry) {
    return { unloaded: false, fuelLabel: "" };
  }

  const element = slotEntry.element ?? null;
  const refundable = slotEntry.refundable !== false;
  const fuelLabel = slotEntry.name || slotEntry.symbol || "Fuel";

  droneState.fuelSlots[normalizedIndex] = null;
  droneState.fuelRemaining = Math.max(0, droneState.fuelRemaining - 1);
  persistDroneCargoSnapshot();

  if (element && refundable) {
    recordInventoryResource({ element });
  }

  renderDroneInventoryUi();
  updateDroneStatusUi();

  return { unloaded: true, fuelLabel };
};

const tryRefuelDroneWithElement = (
  element,
  fuelSourceOverride = null,
  preferredSlotIndex = 0
) => {
  const capacity = Math.max(1, droneState.fuelCapacity || DRONE_FUEL_CAPACITY);

  ensureDroneFuelSlots(capacity);

  if (droneState.fuelRemaining >= capacity) {
    return { fuelAdded: 0, fuelLabel: "" };
  }

  const fuelSource = fuelSourceOverride ?? getFuelSourceForElement(element);

  if (!fuelSource) {
    return { fuelAdded: 0, fuelLabel: "" };
  }

  const spendSucceeded = spendInventoryResource(element, 1);

  if (!spendSucceeded) {
    return { fuelAdded: 0, fuelLabel: "" };
  }

  const fuelValue = getFuelValueForSource(fuelSource);
  const runtimeSeconds = getFuelRuntimeSecondsForSource(fuelSource);
  const fuelToAdd = Math.min(fuelValue, capacity - droneState.fuelRemaining);
  const added = addFuelUnitsToDrone(
    element,
    fuelToAdd,
    preferredSlotIndex,
    /* refundableUnits */ 1,
    { runtimeSeconds }
  );

  if (added > 0) {
    refreshInventoryUi();
    persistDroneCargoSnapshot();
  }

  const fuelLabel =
    typeof element?.name === "string" && element.name.trim()
      ? element.name.trim()
      : typeof element?.symbol === "string" && element.symbol.trim()
        ? element.symbol.trim()
        : "Fuel";

  return { fuelAdded: added, fuelLabel };
};

const hasDroneFuelForLaunch = () =>
  droneState.fuelRemaining >= DRONE_FUEL_PER_LAUNCH;

const consumeDroneFuelForMiningDuration = (durationSeconds = 0) => {
  const normalizedDuration = Number.isFinite(durationSeconds)
    ? Math.max(0, durationSeconds)
    : 0;

  const capacity = Math.max(1, droneState.fuelCapacity || DRONE_FUEL_CAPACITY);
  const availableFuel = Math.max(0, Math.min(droneState.fuelRemaining, capacity));

  if (normalizedDuration <= 0 || availableFuel <= 0) {
    if (availableFuel <= 0) {
      droneState.miningSecondsSinceFuelUse = 0;
    }
    return;
  }

  let activeSlot = getActiveFuelSlotInfo();
  let consumedRefundable = false;
  let elapsedRuntime = Math.max(
    0,
    Math.min(
      droneState.miningSecondsSinceFuelUse || 0,
      activeSlot?.runtimeSeconds ?? DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT,
    ),
  );
  let remainingDuration = normalizedDuration;

  while (activeSlot && remainingDuration > 0) {
    const remainingForSlot = Math.max(
      0,
      activeSlot.runtimeSeconds - elapsedRuntime,
    );

    if (droneState.fuelSlots[activeSlot.index]) {
      droneState.fuelSlots[activeSlot.index].refundable = false;
      consumedRefundable = true;
    }

    if (remainingDuration < remainingForSlot) {
      elapsedRuntime += remainingDuration;
      remainingDuration = 0;
      break;
    }

    remainingDuration -= remainingForSlot;
    removeFuelUnitsFromSlots(1);
    elapsedRuntime = 0;
    activeSlot = getActiveFuelSlotInfo();
  }

  droneState.miningSecondsSinceFuelUse = activeSlot ? elapsedRuntime : 0;

  if (droneState.fuelRemaining <= 0) {
    droneState.miningSecondsSinceFuelUse = 0;
  }

  if (consumedRefundable) {
    renderDroneInventoryUi();
  }

  persistDroneCargoSnapshot();
};

const concludeDroneMiningSession = (detail = null) => {
  const durationSeconds = Number.isFinite(detail?.actionDuration)
    ? detail.actionDuration
    : droneState.miningSessionStartMs > 0
      ? (performance.now() - droneState.miningSessionStartMs) / 1000
      : 0;

  consumeDroneFuelForMiningDuration(durationSeconds);
  droneState.miningSessionStartMs = 0;
};

const cancelStalledDroneMiningSession = () => {
  if (!droneState.inFlight || droneState.status !== "collecting") {
    return false;
  }

  const startMs = droneState.miningSessionStartMs;

  if (!Number.isFinite(startMs) || startMs <= 0) {
    return false;
  }

  const elapsedMs = performance.now() - startMs;

  if (elapsedMs <= DRONE_MINING_STALL_TIMEOUT_MS) {
    return false;
  }

  if (typeof sceneController?.cancelDroneMinerSession === "function") {
    sceneController.cancelDroneMinerSession({ reason: "timeout" });
  }

  droneState.inFlight = false;
  droneState.awaitingReturn = false;
  droneState.lastResult = { found: false, reason: "timeout" };
  droneState.status = droneState.active ? "idle" : "inactive";
  droneState.miningSessionStartMs = 0;
  updateDroneStatusUi();

  if (droneState.active) {
    scheduleDroneAutomationRetry();
  }

  showDroneTerminalToast({
    title: "Drone link lost",
    description: "No response from the drone. Retrying deployment.",
  });

  return true;
};

const tryRefuelDroneFromInventory = () => {
  const capacity = Math.max(1, droneState.fuelCapacity || DRONE_FUEL_CAPACITY);

  if (droneState.fuelRemaining >= capacity) {
    return { fuelAdded: 0, resourcesUsed: new Map() };
  }

  let fuelAdded = 0;
  const resourcesUsed = new Map();

  DRONE_FUEL_SOURCES.forEach((source) => {
    const element = source?.element;
    const fuelValue = getFuelValueForSource(source);
    const runtimeSeconds = getFuelRuntimeSecondsForSource(source);

    if (!element) {
      return;
    }

    const label = typeof element?.name === "string" && element.name.trim()
      ? element.name.trim()
      : "Fuel";

    while (droneState.fuelRemaining < capacity) {
      const success = spendInventoryResource(element, 1);

      if (!success) {
        break;
      }

      const fuelToAdd = Math.min(fuelValue, capacity - droneState.fuelRemaining);
      const addedUnits = addFuelUnitsToDrone(
        element,
        fuelToAdd,
        /* preferredIndex */ 0,
        /* refundableUnits */ 1,
        { runtimeSeconds }
      );
      fuelAdded += addedUnits;
      resourcesUsed.set(label, (resourcesUsed.get(label) ?? 0) + 1);

      if (droneState.fuelRemaining >= capacity) {
        break;
      }
    }
  });

  if (fuelAdded > 0) {
    refreshInventoryUi();
    persistDroneCargoSnapshot();
  }

  return { fuelAdded, resourcesUsed };
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
let missionModalActive = false;
let marketModalActive = false;

const INVENTORY_SLOT_COUNT = 100;
const DEFAULT_INVENTORY_CAPACITY_KG = 10;

const createEmptyInventorySlotOrder = () =>
  new Array(INVENTORY_SLOT_COUNT).fill(null);

const inventoryState = {
  entries: [],
  entryMap: new Map(),
  customOrder: createEmptyInventorySlotOrder(),
  capacityKg: DEFAULT_INVENTORY_CAPACITY_KG,
  currentLoadGrams: 0,
  capacityRejection: null,
};
let activeInventoryTab = "inventory";

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
const inventoryDroneFuelDropState = {
  slot: null,
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

const setActiveInventorySection = (sectionId = "inventory") => {
  if (!inventoryPanel?.isConnected) {
    return;
  }

  const resolvedSection = inventoryTabSections.has(sectionId)
    ? sectionId
    : "inventory";
  const targetSection = inventoryTabSections.get(resolvedSection);

  if (!targetSection) {
    return;
  }

  activeInventoryTab = resolvedSection;

  inventoryTabButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const isActive = button.dataset.inventoryTabTarget === resolvedSection;
    button.dataset.active = isActive ? "true" : "false";
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
  });

  inventoryTabSections.forEach((section, key) => {
    if (!(section instanceof HTMLElement)) {
      return;
    }

    section.hidden = key !== resolvedSection;
  });

  if (resolvedSection === "drone") {
    renderDroneInventoryUi();
    updateDroneStatusUi();
  } else {
    hideInventoryTooltip();
    updateDroneStatusUi();
  }
};

const renderDroneFuelSources = () => {
  if (!(droneFuelSourceList instanceof HTMLElement)) {
    return;
  }

  droneFuelSourceList.innerHTML = "";

  const fragment = document.createDocumentFragment();

  DRONE_FUEL_SOURCES.forEach((source) => {
    const element = source?.element;

    if (!element) {
      return;
    }

    const symbol = typeof element.symbol === "string" ? element.symbol : "?";
    const name = typeof element.name === "string" ? element.name : "Fuel";
    const availableCount = getInventoryResourceCount(element);
    const available = Number.isFinite(availableCount) && availableCount > 0;
    const entryKey = getInventoryEntryKey(
      sanitizeInventoryElement(element ?? {})
    );

    const item = document.createElement("div");
    item.className = "drone-inventory__fuel-source";
    item.dataset.available = available ? "true" : "false";
    item.dataset.droneFuelSource = "true";
    item.dataset.inventoryKey = entryKey;
    item.dataset.inventoryName = name;
    item.dataset.inventoryMeta = available
      ? `${availableCount} in inventory`
      : "Add to inventory to refuel";
    item.setAttribute(
      "aria-label",
      `${name} - ${item.dataset.inventoryMeta}`
    );

    const symbolElement = document.createElement("div");
    symbolElement.className = "drone-inventory__fuel-symbol";
    symbolElement.textContent = symbol;
    symbolElement.setAttribute("aria-hidden", "true");

    const meta = document.createElement("div");
    meta.className = "drone-inventory__fuel-meta";

    const nameElement = document.createElement("p");
    nameElement.className = "drone-inventory__fuel-name";
    nameElement.textContent = name;

    const countElement = document.createElement("p");
    countElement.className = "drone-inventory__fuel-availability";
    countElement.textContent = available
      ? `${availableCount} in inventory`
      : "Add to inventory to refuel";

    meta.appendChild(nameElement);
    meta.appendChild(countElement);

    item.appendChild(symbolElement);
    item.appendChild(meta);

    fragment.appendChild(item);
  });

  droneFuelSourceList.appendChild(fragment);
};

const renderDroneFuelGrid = () => {
  if (!(droneFuelGrid instanceof HTMLElement)) {
    return;
  }

  const capacity = Math.max(1, droneState.fuelCapacity || DRONE_FUEL_CAPACITY);
  ensureDroneFuelSlots(capacity);
  const activeSlotIndex = getActiveFuelSlotIndex();
  const activeFuelLifetimeRatio = getActiveFuelLifetimeRatio();
  const activeFuelRemainingSeconds = getActiveFuelRemainingSeconds();

  droneFuelGrid.innerHTML = "";

  const fragment = document.createDocumentFragment();

  for (let index = 0; index < capacity; index += 1) {
    const slot = document.createElement("div");
    slot.className = "drone-inventory__fuel-slot";
    slot.dataset.droneFuelSlot = String(index);
    const slotData = droneState.fuelSlots[index];
    const filled = Boolean(slotData);
    const isActive = filled && index === activeSlotIndex;
    slot.dataset.state = filled ? "filled" : "empty";
    slot.setAttribute("role", "listitem");
    slot.setAttribute("aria-label", filled ? "Fuel loaded" : "Fuel slot empty");

    const indexLabel = document.createElement("p");
    indexLabel.className = "drone-inventory__fuel-slot-index";
    indexLabel.textContent = `Slot ${index + 1}`;

    const stateLabel = document.createElement("p");
    stateLabel.className = "drone-inventory__fuel-slot-label";
    stateLabel.textContent = filled
      ? slotData?.symbol || slotData?.name || "Fuel"
      : "Empty";

    const lifetimeContainer = document.createElement("div");
    lifetimeContainer.className = "drone-inventory__fuel-slot-lifetime";

    const lifetimeFill = document.createElement("div");
    lifetimeFill.className = "drone-inventory__fuel-slot-lifetime-fill";

    let lifetimeTooltip = "Empty fuel slot";

    if (filled) {
      const slotRuntimeSeconds = getFuelRuntimeSecondsForSlot(slotData);
      const ratio = isActive ? activeFuelLifetimeRatio : 1;
      lifetimeFill.style.width = `${(ratio * 100).toFixed(1)}%`;
      lifetimeFill.dataset.state = isActive ? "active" : "idle";

      const remainingSeconds = isActive
        ? activeFuelRemainingSeconds
        : slotRuntimeSeconds;
      const remainingLabel = formatDurationSeconds(remainingSeconds);
      lifetimeTooltip = isActive
        ? `${remainingLabel} remaining`
        : `${remainingLabel} available`;
    } else {
      lifetimeFill.style.width = "0%";
      lifetimeFill.dataset.state = "empty";
    }

    lifetimeContainer.appendChild(lifetimeFill);
    lifetimeContainer.title = lifetimeTooltip;
    lifetimeContainer.setAttribute("aria-label", lifetimeTooltip);

    const actions = document.createElement("div");
    actions.className = "drone-inventory__fuel-slot-actions";
    actions.appendChild(stateLabel);

    if (filled) {
      const unloadButton = document.createElement("button");
      unloadButton.type = "button";
      unloadButton.className = "drone-inventory__fuel-slot-action";
      unloadButton.dataset.action = "unload-fuel-slot";
      unloadButton.dataset.droneFuelSlot = String(index);
      unloadButton.textContent = "Unload";
      unloadButton.disabled = slotData?.refundable === false;

      if (unloadButton.disabled) {
        unloadButton.title = "Fuel already used";
      }
      actions.appendChild(unloadButton);
    }

    slot.appendChild(indexLabel);
    slot.appendChild(lifetimeContainer);
    slot.appendChild(actions);

    fragment.appendChild(slot);
  }

  droneFuelGrid.appendChild(fragment);
};

const renderDroneInventoryUi = () => {
  renderDroneFuelGrid();
  renderDroneFuelSources();
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

  const rawName = typeof item.dataset.inventoryName === "string"
    ? item.dataset.inventoryName.trim()
    : "";
  const number = typeof item.dataset.inventoryNumber === "string"
    ? item.dataset.inventoryNumber.trim()
    : "";
  const name = rawName || number
    ? rawName && number
      ? `${rawName} #${number}`
      : rawName || `#${number}`
    : "";

  if (!name) {
    hideInventoryTooltip();
    return;
  }

  if (inventoryTooltipName instanceof HTMLElement) {
    inventoryTooltipName.textContent = name;
    inventoryTooltipName.hidden = !name;
  }

  if (inventoryTooltipMeta instanceof HTMLElement) {
    inventoryTooltipMeta.textContent = "";
    inventoryTooltipMeta.hidden = true;
  }

  if (inventoryTooltipDetails instanceof HTMLElement) {
    inventoryTooltipDetails.innerHTML = "";

    const detailItems = [
      {
        label: "Category",
        value: item.dataset.inventoryCategory,
        fallback: "Unknown",
      },
      {
        label: "Atomic mass",
        value: item.dataset.inventoryMass,
        fallback: "Unknown",
      },
      {
        label: "Melting",
        value: item.dataset.inventoryMelting,
        fallback: "Not recorded",
      },
      {
        label: "Boiling",
        value: item.dataset.inventoryBoiling,
        fallback: "Not recorded",
      },
    ];

    detailItems.forEach((detail) => {
      const itemElement = document.createElement("li");
      itemElement.className = "inventory-panel__tooltip-item";

      const labelElement = document.createElement("span");
      labelElement.className = "inventory-panel__tooltip-label";
      labelElement.textContent = detail.label;

      const valueElement = document.createElement("span");
      valueElement.className = "inventory-panel__tooltip-value";
      valueElement.textContent = detail.value || detail.fallback;

      itemElement.appendChild(labelElement);
      itemElement.appendChild(valueElement);
      inventoryTooltipDetails.appendChild(itemElement);
    });

    inventoryTooltipDetails.hidden = false;
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

const handleInventoryItemClick = (event) => {
  const item = getInventoryItemElement(event.target);

  if (!item) {
    return;
  }

  showInventoryTooltipForItem(item);
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

const handleDroneFuelGridClick = (event) => {
  const actionTarget =
    event.target instanceof HTMLElement
      ? event.target.closest('[data-action="unload-fuel-slot"]')
      : null;

  if (!actionTarget) {
    return;
  }

  event.preventDefault();
  const slotIndex = getDroneFuelSlotIndex(actionTarget);

  if (slotIndex < 0) {
    return;
  }

  const { unloaded, fuelLabel } = unloadDroneFuelSlot(slotIndex);

  if (unloaded && typeof showDroneTerminalToast === "function") {
    const label = fuelLabel || "fuel";
    showDroneTerminalToast({
      title: "Fuel unloaded",
      description: `${label} returned to inventory.`,
    });
  }
};

const clearDroneFuelDropTarget = () => {
  if (!(droneFuelGrid instanceof HTMLElement)) {
    return;
  }

  droneFuelGrid
    .querySelectorAll(".drone-inventory__fuel-slot.is-drop-target")
    .forEach((slot) => slot.classList.remove("is-drop-target"));

  inventoryDroneFuelDropState.slot = null;
};

const setDroneFuelDropTargetSlot = (slot) => {
  if (!(slot instanceof HTMLElement)) {
    clearDroneFuelDropTarget();
    return;
  }

  if (inventoryDroneFuelDropState.slot === slot) {
    return;
  }

  clearDroneFuelDropTarget();
  slot.classList.add("is-drop-target");
  inventoryDroneFuelDropState.slot = slot;
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
  if (inventoryList instanceof HTMLElement) {
    inventoryList
      .querySelectorAll(".inventory-panel__item.is-drag-source")
      .forEach((element) => element.classList.remove("is-drag-source"));
  }

  if (droneFuelSourceList instanceof HTMLElement) {
    droneFuelSourceList
      .querySelectorAll(".drone-inventory__fuel-source.is-drag-source")
      .forEach((element) => element.classList.remove("is-drag-source"));
  }
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
  clearDroneFuelDropTarget();
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
  const isDroneFuelSource = item.dataset.droneFuelSource === "true";

  if (!key) {
    return false;
  }

  hideInventoryTooltip();
  inventoryReorderState.draggingKey = key;
  inventoryReorderState.sourceSlotIndex = isDroneFuelSource
    ? -1
    : getInventorySlotIndex(item);

  if (!isDroneFuelSource && inventoryReorderState.sourceSlotIndex < 0) {
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
  const fuelSlot = getDroneFuelSlotElement(element);
  const slot = getInventorySlotElement(element);
  const draggedEntry = getInventoryEntryByKey(inventoryReorderState.draggingKey);
  const fuelSource = getFuelSourceForElement(draggedEntry?.element);
  const capacity = Math.max(1, droneState.fuelCapacity || DRONE_FUEL_CAPACITY);
  const canDropFuel =
    fuelSlot && fuelSource && droneState.fuelRemaining < capacity;

  if (canDropFuel && fuelSlot) {
    setDroneFuelDropTargetSlot(fuelSlot);
    setInventoryDropTargetSlot(null);
    return;
  }

  clearDroneFuelDropTarget();

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
  const draggedEntry = getInventoryEntryByKey(inventoryReorderState.draggingKey);
  const fuelSlot = getDroneFuelSlotElement(element);
  const fuelSource = getFuelSourceForElement(draggedEntry?.element);
  const capacity = Math.max(1, droneState.fuelCapacity || DRONE_FUEL_CAPACITY);

  if (fuelSlot && fuelSource && droneState.fuelRemaining < capacity) {
    const preferredIndex = getDroneFuelSlotIndex(fuelSlot);
    const { fuelAdded, fuelLabel } = tryRefuelDroneWithElement(
      draggedEntry?.element,
      fuelSource,
      preferredIndex
    );

    resetInventoryReorderState();

    if (fuelAdded > 0) {
      updateDroneStatusUi();

      if (typeof showDroneTerminalToast === "function") {
        showDroneTerminalToast({
          title: "Fuel routed to drone",
          description: `${fuelLabel} added to fuel reserves.`,
        });
      }
    }

    return;
  }

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

const getDroneFuelSourceElement = (element) => {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const source = element.closest(".drone-inventory__fuel-source");
  return source instanceof HTMLElement ? source : null;
};

const handleDroneFuelSourcePointerDown = (event) => {
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

  const fuelSource = getDroneFuelSourceElement(event.target);

  if (
    !fuelSource ||
    fuelSource.dataset.available !== "true" ||
    !startInventoryReorderForItem(fuelSource)
  ) {
    return;
  }

  event.preventDefault();
  showInventoryDragPreview(fuelSource, event);
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
let todoItems = [];
let todoStorageAvailable = true;
let lastTodoFocusedElement = null;
let todoPanelWasPointerLocked = false;
let todoPanelCloseFallbackId = 0;
let todoPersistTimeoutId = 0;

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

const resolveMissionRequirement = (mission) => {
  const description = typeof mission?.description === "string" ? mission.description : "";
  const title = typeof mission?.title === "string" ? mission.title : "";
  const requirementMatch = description.match(/Collect\s+(\d+)\s+units?\s+of\s+([A-Za-z]{1,3})/i);

  const symbolCandidate = requirementMatch?.[2]
    ? requirementMatch[2]
    : title.split(" ")[0] ?? "";
  const symbol = symbolCandidate.trim().toUpperCase();
  const count = Number.parseInt(requirementMatch?.[1] ?? "1", 10);
  const normalizedCount = Number.isFinite(count) ? Math.max(1, count) : 1;

  if (!symbol) {
    return null;
  }

  const periodicElement = periodicElementLookup.get(symbol);
  const elementDetails = periodicElement
    ? { ...periodicElement }
    : { symbol, name: symbol, number: null };

  return { element: elementDetails, count: normalizedCount };
};

const getMissionRequirementStatus = (mission) => {
  const requirement = resolveMissionRequirement(mission);

  if (!requirement) {
    return { requirement: null, hasRequiredResources: true, availableCount: 0 };
  }

  const availableCount = getInventoryResourceCount(requirement.element);
  return {
    requirement,
    availableCount,
    hasRequiredResources: availableCount >= requirement.count,
  };
};

const formatMarsMoney = (value) => {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const formatter = Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  return `${formatter.format(value)} Mars money`;
};

const formatMissionIndicatorLabel = (mission) => {
  const requirement = resolveMissionRequirement(mission);

  if (requirement?.element) {
    const { name, symbol } = requirement.element;
    const count = requirement.count ?? 1;
    const elementName =
      typeof name === "string" && name.trim() !== ""
        ? name.trim()
        : typeof symbol === "string"
          ? symbol.trim()
          : "";
    const elementSymbol = typeof symbol === "string" ? symbol.trim() : "";

    if (elementName !== "" && elementSymbol !== "") {
      return `Collect ${count} ${elementName} (${elementSymbol}).`.trim();
    }

    if (elementName !== "") {
      return `Collect ${count} ${elementName}.`.trim();
    }

    if (elementSymbol !== "") {
      return `Collect ${count} ${elementSymbol}.`.trim();
    }
  }

  if (typeof mission?.title === "string" && mission.title.trim() !== "") {
    return mission.title.trim();
  }

  return "Active assignment";
};

const MARKET_PRICE_INCREASE_FACTOR = 1.05;
const MARKET_PRICE_DECREASE_FACTOR = 0.97;
const MARKET_MIN_PRICE = 1;

let marketState = loadMarketState();
let teardownMarketActionBinding = null;

const getMarketModalElements = () => {
  if (!quickAccessModalContent) {
    return { grid: null, balance: null, empty: null };
  }

  return {
    grid: quickAccessModalContent.querySelector("[data-market-grid]"),
    balance: quickAccessModalContent.querySelector("[data-market-balance]"),
    empty: quickAccessModalContent.querySelector("[data-market-empty]") ?? null,
  };
};

const adjustMarketPrice = (item, direction) => {
  if (!item) {
    return;
  }

  const factor = direction === "buy" ? MARKET_PRICE_INCREASE_FACTOR : MARKET_PRICE_DECREASE_FACTOR;
  const adjusted = Math.round(item.price * factor);
  const nextPrice = Math.max(MARKET_MIN_PRICE, adjusted === item.price ? adjusted + (direction === "buy" ? 1 : -1) : adjusted);
  item.price = nextPrice;
};

const persistCurrentMarketState = () => {
  const persisted = persistMarketState(marketState);

  if (persisted) {
    marketState = loadMarketState();
  }
};

const executeMarketTrade = (itemId, action) => {
  const item = marketState?.items?.find((entry) => entry?.id === itemId);

  if (!item || (action !== "buy" && action !== "sell")) {
    return;
  }

  if (action === "buy") {
    if (item.stock <= 0) {
      return;
    }

    const balance = getCurrencyBalance();
    if (balance < item.price) {
      return;
    }

    item.stock -= 1;
    addMarsMoney(-item.price);
    adjustMarketPrice(item, "buy");
  } else {
    item.stock += 1;
    addMarsMoney(item.price);
    adjustMarketPrice(item, "sell");
  }

  persistCurrentMarketState();

  if (marketModalActive) {
    renderMarketModal();
  }
};

const handleMarketActionClick = (event) => {
  if (!marketModalActive) {
    return;
  }

  const target =
    event.target instanceof HTMLElement
      ? event.target.closest("[data-market-action]")
      : null;

  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const action = target.dataset.marketAction;
  const itemId = target.dataset.marketItemId;

  if (!itemId) {
    return;
  }

  event.preventDefault();
  executeMarketTrade(itemId, action);
};

const teardownMarketModal = () => {
  marketModalActive = false;

  if (typeof teardownMarketActionBinding === "function") {
    teardownMarketActionBinding();
    teardownMarketActionBinding = null;
  }
};

const bindMarketModalEvents = () => {
  const { grid } = getMarketModalElements();

  if (!(grid instanceof HTMLElement) || typeof teardownMarketActionBinding === "function") {
    return;
  }

  grid.addEventListener("click", handleMarketActionClick);
  teardownMarketActionBinding = () => grid.removeEventListener("click", handleMarketActionClick);
};

const createMarketCard = (item) => {
  const card = document.createElement("article");
  card.className = "quick-access-modal__card";

  const status = document.createElement("p");
  status.className = "quick-access-modal__status-tag";
  status.textContent = "Live listing";
  card.appendChild(status);

  const title = document.createElement("h3");
  title.textContent = `${item.accent ? `${item.accent} ` : ""}${item.name}`;
  card.appendChild(title);

  if (item.summary) {
    const summary = document.createElement("p");
    summary.textContent = item.summary;
    card.appendChild(summary);
  }

  const price = document.createElement("p");
  price.className = "mission-reward";
  price.textContent = `Price: ${formatMarsMoney(item.price)}`;
  card.appendChild(price);

  const stock = document.createElement("p");
  stock.className = "mission-requirement";
  stock.textContent = `Available: ${item.stock}`;
  card.appendChild(stock);

  const actions = document.createElement("div");
  actions.className = "quick-access-modal__actions";

  const balance = getCurrencyBalance();

  const buyButton = document.createElement("button");
  buyButton.className = "quick-access-modal__action";
  buyButton.dataset.marketAction = "buy";
  buyButton.dataset.marketItemId = item.id;
  buyButton.textContent = "Buy";
  buyButton.disabled = item.stock <= 0 || balance < item.price;
  actions.appendChild(buyButton);

  const sellButton = document.createElement("button");
  sellButton.className = "quick-access-modal__action";
  sellButton.dataset.marketAction = "sell";
  sellButton.dataset.marketItemId = item.id;
  sellButton.textContent = "Sell";
  actions.appendChild(sellButton);

  card.appendChild(actions);

  return card;
};

function renderMarketModal() {
  if (!marketModalActive) {
    return;
  }

  const { grid, balance, empty } = getMarketModalElements();
  const items = marketState?.items ?? [];
  const hasItems = Array.isArray(items) && items.length > 0;

  if (balance instanceof HTMLElement) {
    balance.textContent = `Balance: ${formatMarsMoney(getCurrencyBalance())}`;
  }

  if (!(grid instanceof HTMLElement)) {
    return;
  }

  grid.innerHTML = "";

  if (empty instanceof HTMLElement) {
    empty.hidden = hasItems;
  }

  if (!hasItems) {
    return;
  }

  items.forEach((item) => {
    if (!item) {
      return;
    }

    grid.appendChild(createMarketCard(item));
  });
}

const createMissionCard = (mission) => {
  const card = document.createElement("article");
  card.className = "quick-access-modal__card";

  const title = document.createElement("h3");
  title.textContent = mission.title.replace(/\s+\d+$/, "");
  card.appendChild(title);

  const description = document.createElement("p");
  description.textContent = mission.description;
  card.appendChild(description);

  const hasReward = Number.isFinite(mission.rewardMarsMoney);

  const reward = document.createElement("p");
  reward.className = "mission-reward";
  reward.textContent = hasReward
    ? `Reward: ${formatMarsMoney(mission.rewardMarsMoney)}`
    : "Reward unavailable";
  card.appendChild(reward);

  const { requirement, hasRequiredResources, availableCount } =
    getMissionRequirementStatus(mission);

  if (requirement) {
    const requirementLabel = document.createElement("p");
    requirementLabel.className = "mission-requirement";
    const nameLabel = requirement.element.name || requirement.element.symbol || "resource";
    requirementLabel.innerHTML =
      `<span class="mission-requirement__label">Requires</span> ${requirement.count}× ${nameLabel}`;

    if (!hasRequiredResources) {
      requirementLabel.innerHTML += ` (have ${availableCount})`;
    }

    card.appendChild(requirementLabel);
  }

  if (mission.status === "active") {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "quick-access-modal__action quick-access-modal__action--complete";
    const isActionDisabled = !hasRequiredResources || !hasReward;
    action.textContent = !hasReward
      ? "Reward missing"
      : hasRequiredResources
        ? "Complete"
        : "Need resources";
    action.disabled = isActionDisabled;
    action.setAttribute("aria-disabled", String(isActionDisabled));

    action.addEventListener("click", () => {
      const status = getMissionRequirementStatus(mission);
      const rewardDefined = Number.isFinite(mission.rewardMarsMoney);

      if (status.requirement && !status.hasRequiredResources) {
        const nameLabel =
          status.requirement.element.name || status.requirement.element.symbol || "resources";

        showTerminalToast({
          title: "Resources needed",
          description: `Collect ${status.requirement.count}× ${nameLabel} to complete this mission.`,
        });

        renderMissionModalMissions();
        return;
      }

      if (!rewardDefined) {
        showTerminalToast({
          title: "Reward unavailable",
          description: "This mission cannot be completed until a reward is configured.",
        });
        renderMissionModalMissions();
        return;
      }

      if (status.requirement) {
        spendInventoryResource(status.requirement.element, status.requirement.count);
      }

      completeMission(mission.id);
    });

    card.appendChild(action);
  }

  return card;
};

const renderMissionModalMissions = () => {
  if (!missionModalActive || !quickAccessModalContent) {
    return;
  }

  const grid = quickAccessModalContent.querySelector("[data-mission-card-grid]");
  const empty = quickAccessModalContent.querySelector("[data-mission-empty]");
  const subtitle = quickAccessModalContent.querySelector("[data-mission-subtitle]");

  const activeMissions = getActiveMissions();

  if (grid instanceof HTMLElement) {
    grid.innerHTML = "";
    activeMissions.forEach((mission) => {
      const card = createMissionCard(mission);
      grid.appendChild(card);
    });
  }

  if (empty instanceof HTMLElement) {
    empty.hidden = activeMissions.length > 0;
  }

  if (subtitle instanceof HTMLElement) {
    subtitle.textContent = `${activeMissions.length} / ${MAX_ACTIVE_MISSIONS} active assignments`;
  }
};

const updateCurrencyIndicator = () => {
  if (!(currencyIndicator instanceof HTMLElement)) {
    return;
  }

  if (!isCurrencyStorageAvailable()) {
    currencyIndicator.hidden = true;
    currencyIndicator.setAttribute("aria-hidden", "true");
    return;
  }

  const balance = getCurrencyBalance();
  currencyIndicator.hidden = false;
  currencyIndicator.setAttribute("aria-hidden", "false");

  if (currencyIndicatorValue instanceof HTMLElement) {
    currencyIndicatorValue.textContent = formatMarsMoney(balance);
  }
};

const updateMissionIndicator = () => {
  const activeMissions = getActiveMissions();
  const pendingMissions = getPendingMissions();

  if (missionIndicator instanceof HTMLElement) {
    missionIndicator.hidden = false;
  }

  if (missionIndicatorActiveLabel instanceof HTMLElement) {
    missionIndicatorActiveLabel.textContent = "";
    missionIndicatorActiveLabel.hidden = true;
  }

  if (missionIndicatorList instanceof HTMLElement) {
    missionIndicatorList.innerHTML = "";

    if (activeMissions.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "mission-indicator__item mission-indicator__item--empty";
      emptyItem.textContent = "No active missions";
      missionIndicatorList.appendChild(emptyItem);
    } else {
      activeMissions.forEach((mission) => {
        const item = document.createElement("li");
        item.className = "mission-indicator__item";
        item.textContent = formatMissionIndicatorLabel(mission);

        const requirementStatus = getMissionRequirementStatus(mission);
        if (requirementStatus.hasRequiredResources) {
          item.classList.add("mission-indicator__item--ready");
        }

        missionIndicatorList.appendChild(item);
      });
    }
  }

  if (missionIndicatorNextLabel instanceof HTMLElement) {
    missionIndicatorNextLabel.textContent = "";
    missionIndicatorNextLabel.hidden = true;
  }
};

const handleMissionStateChanged = (detail = {}) => {
  updateMissionIndicator();
  updateCurrencyIndicator();

  if (missionModalActive) {
    renderMissionModalMissions();
  }

  if (detail?.type === "completed") {
    const mission = getMissions().find((item) => item.id === detail.missionId);
    const promotedTitle = detail.promoted?.[0]?.title;
    const rewardText = Number.isFinite(detail.rewardMarsMoney)
      ? `Earned ${formatMarsMoney(detail.rewardMarsMoney)}.`
      : null;
    const balanceText = Number.isFinite(detail.currencyBalance)
      ? `Balance: ${formatMarsMoney(detail.currencyBalance)}.`
      : null;

    if (mission) {
      const missionStateText = promotedTitle
        ? `${promotedTitle} promoted to active.`
        : "Mission slot cleared.";
      const description = [rewardText, balanceText, missionStateText]
        .filter(Boolean)
        .join(" ");

      showTerminalToast({ title: `${mission.title} completed`, description });
    }
  }
};

updateMissionIndicator();
updateCurrencyIndicator();
subscribeToCurrency(updateCurrencyIndicator);
subscribeToCurrency(() => {
  if (marketModalActive) {
    renderMarketModal();
  }
});
subscribeToMissionState(handleMissionStateChanged);

const teardownQuickAccessModalContent = () => {
  teardownMarketModal();
};

const initializeQuickAccessModalContent = (option) => {
  liftModalActive = option?.id === LIFT_MODAL_OPTION.id;
  missionModalActive = option?.id === "missions";
  marketModalActive = option?.id === "market";

  if (liftModalActive) {
    renderLiftModalFloors();
  }

  if (missionModalActive) {
    renderMissionModalMissions();
  }

  if (marketModalActive) {
    renderMarketModal();
    bindMarketModalEvents();
  } else {
    teardownMarketModal();
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

const formatDurationSeconds = (seconds) => {
  const clampedSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(clampedSeconds / 60);
  const remainingSeconds = clampedSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
  }

  return `${remainingSeconds}s`;
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

const getDroneFuelSlotElement = (element) => {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  return element.closest("[data-drone-fuel-slot]");
};

const getDroneFuelSlotIndex = (slot) => {
  if (!(slot instanceof HTMLElement)) {
    return -1;
  }

  const parsed = Number.parseInt(slot.dataset.droneFuelSlot, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : -1;
};

const getInventoryCapacityKg = () => {
  const capacity = inventoryState.capacityKg;
  if (Number.isFinite(capacity) && capacity > 0) {
    return capacity;
  }

  return DEFAULT_INVENTORY_CAPACITY_KG;
};

const getInventoryCapacityGrams = () => {
  const capacityKg = getInventoryCapacityKg();
  const normalizedGrams =
    Number.isFinite(capacityKg) && capacityKg > 0
      ? capacityKg * GRAMS_PER_KILOGRAM
      : 0;

  return normalizedGrams || INVENTORY_CAPACITY_GRAMS;
};

const recalculateInventoryLoad = () => {
  const totalWeight = inventoryState.entries.reduce(
    (sum, entry) => sum + getInventoryEntryWeight(entry),
    0
  );

  inventoryState.currentLoadGrams = Math.max(0, totalWeight);
  return inventoryState.currentLoadGrams;
};

const updateInventoryCapacityWarning = () => {
  if (!(inventoryCapacityWarning instanceof HTMLElement)) {
    return;
  }

  const message =
    typeof inventoryState.capacityRejection === "string"
      ? inventoryState.capacityRejection.trim()
      : "";

  if (message) {
    inventoryCapacityWarning.hidden = false;
    inventoryCapacityWarning.textContent = message;
    return;
  }

  inventoryCapacityWarning.hidden = true;
  inventoryCapacityWarning.textContent = "";
};

const setInventoryCapacityRejection = (message) => {
  const normalizedMessage = typeof message === "string" ? message.trim() : "";
  inventoryState.capacityRejection = normalizedMessage || null;
  updateInventoryCapacityWarning();
  schedulePersistInventoryState();
};

const clearInventoryCapacityRejection = () => {
  if (!inventoryState.capacityRejection) {
    return;
  }

  inventoryState.capacityRejection = null;
  updateInventoryCapacityWarning();
  schedulePersistInventoryState();
};

const canAcceptInventoryWeight = (additionalWeight) => {
  const normalizedAdditional = Math.max(0, Number(additionalWeight) || 0);
  const currentLoad = Number.isFinite(inventoryState.currentLoadGrams)
    ? inventoryState.currentLoadGrams
    : recalculateInventoryLoad();

  return currentLoad + normalizedAdditional <= getInventoryCapacityGrams();
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

  const totalWeight = Number.isFinite(inventoryState.currentLoadGrams)
    ? inventoryState.currentLoadGrams
    : recalculateInventoryLoad();

  const capacityGrams = Math.max(0, getInventoryCapacityGrams());
  const capacityKg =
    capacityGrams > 0
      ? capacityGrams / GRAMS_PER_KILOGRAM
      : getInventoryCapacityKg();

  if (!summaryElement) {
    return;
  }

  const formattedWeight = formatGrams(totalWeight);
  const formattedCapacity = formatKilograms(capacityKg);
  const summaryText = `${formattedWeight} / ${formattedCapacity} max`;
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

const formatAtomicMassLabel = (atomicMass) => {
  if (!Number.isFinite(atomicMass) || atomicMass <= 0) {
    return null;
  }

  return `${atomicMass.toFixed(3)} u`;
};

const formatTemperatureLabel = (kelvin) => {
  if (!Number.isFinite(kelvin) || kelvin <= 0) {
    return null;
  }

  const kelvinRounded = Math.round(kelvin * 10) / 10;
  const celsiusRounded = Math.round((kelvin - 273.15) * 10) / 10;

  return `${celsiusRounded.toFixed(1)}°C / ${kelvinRounded.toFixed(1)}K`;
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
      const formattedMass = formatAtomicMassLabel(entry.element.atomicMass);
      const formattedMelting = formatTemperatureLabel(entry.element.meltingPoint);
      const formattedBoiling = formatTemperatureLabel(entry.element.boilingPoint);

      const resourceName =
        entry.element.name || entry.element.symbol || "Unknown resource";
      item.dataset.inventoryName = resourceName;
      item.dataset.inventoryCategory = entry.element.category || "";
      item.dataset.inventoryMass = formattedMass || "";
      item.dataset.inventoryMelting = formattedMelting || "";
      item.dataset.inventoryBoiling = formattedBoiling || "";
      if (Number.isFinite(entry.element.number)) {
        item.dataset.inventoryNumber = String(entry.element.number);
      } else {
        delete item.dataset.inventoryNumber;
      }

      const symbolElement = document.createElement("span");
      symbolElement.className = "inventory-panel__symbol";
      symbolElement.textContent = entry.element.symbol || "???";
      item.appendChild(symbolElement);

      if (entry.count >= 1) {
        const countElement = document.createElement("span");
        countElement.className = "inventory-panel__count";
        countElement.textContent = `×${entry.count}`;
        countElement.setAttribute("aria-hidden", "true");
        item.appendChild(countElement);
      }

      const metaSegments = [];

      if (item.dataset.inventoryCategory) {
        metaSegments.push(item.dataset.inventoryCategory);
      }

      if (formattedMass) {
        metaSegments.push(formattedMass);
      }

      if (entry.element.number !== null) {
        metaSegments.push(`Atomic #${entry.element.number}`);
      }

      if (entry.lastTerrain) {
        metaSegments.push(entry.lastTerrain);
      } else if (entry.terrains.size > 1) {
        metaSegments.push("Multiple sites");
      }

      const resourceLabelSegments = [];
      if (resourceName) {
        resourceLabelSegments.push(resourceName);
      }

      if (item.dataset.inventoryCategory) {
        resourceLabelSegments.push(`Category: ${item.dataset.inventoryCategory}`);
      }

      if (formattedMass) {
        resourceLabelSegments.push(`Mass ${formattedMass}`);
      }

      if (entry.count === 1) {
        resourceLabelSegments.push("1 collected");
      } else if (entry.count > 1) {
        resourceLabelSegments.push(`${entry.count} collected`);
      }

      if (formattedMelting) {
        resourceLabelSegments.push(`Melting ${formattedMelting}`);
      }

      if (formattedBoiling) {
        resourceLabelSegments.push(`Boiling ${formattedBoiling}`);
      }

      if (metaSegments.length > 0) {
        const metaLabel = metaSegments.join(", ");
        resourceLabelSegments.push(metaLabel);
      }

      if (resourceLabelSegments.length > 0) {
        const label = resourceLabelSegments.join(", ");
        item.setAttribute("aria-label", label);
      }
    } else {
      item.className = "inventory-panel__item inventory-panel__item--empty";
      item.tabIndex = -1;
      item.setAttribute("aria-hidden", "true");
      delete item.dataset.inventoryName;
      delete item.dataset.inventoryMeta;
      delete item.dataset.inventoryNumber;
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
  recalculateInventoryLoad();
  renderInventoryEntries();
  updateInventorySummary();
  renderDroneInventoryUi();
  updateInventoryCapacityWarning();

  if (missionModalActive) {
    renderMissionModalMissions();
  }
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
    loadGrams: Math.max(0, Math.round(inventoryState.currentLoadGrams || 0)),
    capacityRejection: inventoryState.capacityRejection,
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

        const computedLoad = recalculateInventoryLoad();
        if (Number.isFinite(data.loadGrams) && data.loadGrams >= 0) {
          inventoryState.currentLoadGrams = Math.max(computedLoad, data.loadGrams);
        } else {
          inventoryState.currentLoadGrams = computedLoad;
        }

        if (typeof data.capacityRejection === "string") {
          const rejection = data.capacityRejection.trim();
          inventoryState.capacityRejection = rejection || null;
        } else {
          inventoryState.capacityRejection = null;
        }

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
    return false;
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

  const entryWeight = getInventoryElementWeight(elementDetails);
  const normalizedWeight = Number.isFinite(entryWeight) ? entryWeight : 0;

  if (!canAcceptInventoryWeight(normalizedWeight)) {
    const itemLabel =
      elementDetails.name || elementDetails.symbol || "This resource";
    const attemptedWeight = formatGrams(normalizedWeight || 0);
    const capacityText = formatKilograms(getInventoryCapacityKg());

    setInventoryCapacityRejection(
      `${itemLabel} cannot be added. Capacity reached (${attemptedWeight} would exceed ${capacityText}).`
    );

    return false;
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

    if (!entry.element.category && elementDetails.category) {
      entry.element.category = elementDetails.category;
    }

    if (
      (!Number.isFinite(entry.element.atomicMass) || entry.element.atomicMass <= 0) &&
      Number.isFinite(elementDetails.atomicMass) &&
      elementDetails.atomicMass > 0
    ) {
      entry.element.atomicMass = elementDetails.atomicMass;
    }

    if (
      (!Number.isFinite(entry.element.meltingPoint) || entry.element.meltingPoint <= 0) &&
      Number.isFinite(elementDetails.meltingPoint) &&
      elementDetails.meltingPoint > 0
    ) {
      entry.element.meltingPoint = elementDetails.meltingPoint;
    }

    if (
      (!Number.isFinite(entry.element.boilingPoint) || entry.element.boilingPoint <= 0) &&
      Number.isFinite(elementDetails.boilingPoint) &&
      elementDetails.boilingPoint > 0
    ) {
      entry.element.boilingPoint = elementDetails.boilingPoint;
    }

    if (
      entry.element.discoveryYear === null &&
      elementDetails.discoveryYear !== null
    ) {
      entry.element.discoveryYear = elementDetails.discoveryYear;
    }

    if (!entry.element.discoverer && elementDetails.discoverer) {
      entry.element.discoverer = elementDetails.discoverer;
    }

    if (!entry.element.summary && elementDetails.summary) {
      entry.element.summary = elementDetails.summary;
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

  recalculateInventoryLoad();
  clearInventoryCapacityRejection();
  refreshInventoryUi();
  updateMissionIndicator();

  if (missionModalActive) {
    renderMissionModalMissions();
  }

  schedulePersistInventoryState();
  return true;
};

function getInventoryResourceEntry(element) {
  const sanitized = sanitizeInventoryElement(element ?? {});
  const key = getInventoryEntryKey(sanitized);
  return inventoryState.entryMap.get(key) ?? null;
}

function getInventoryResourceCount(element) {
  const entry = getInventoryResourceEntry(element);
  return entry?.count ?? 0;
}

const spendInventoryResource = (element, count = 1) => {
  const entry = getInventoryResourceEntry(element);
  const normalizedCount = Math.max(1, Math.floor(count));

  if (!entry || !Number.isFinite(entry.count) || entry.count < normalizedCount) {
    return false;
  }

  entry.count -= normalizedCount;

  if (entry.count <= 0) {
    inventoryState.entryMap.delete(entry.key);
    const entryIndex = inventoryState.entries.indexOf(entry);

    if (entryIndex >= 0) {
      inventoryState.entries.splice(entryIndex, 1);
    }

    for (let index = 0; index < inventoryState.customOrder.length; index += 1) {
      if (inventoryState.customOrder[index] === entry.key) {
        inventoryState.customOrder[index] = null;
      }
    }
  }

  recalculateInventoryLoad();
  if (inventoryState.currentLoadGrams <= getInventoryCapacityGrams()) {
    clearInventoryCapacityRejection();
  }

  refreshInventoryUi();
  updateMissionIndicator();

  if (missionModalActive) {
    renderMissionModalMissions();
  }

  schedulePersistInventoryState();
  return true;
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

  updateDroneStatusUi();

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

  updateDroneStatusUi();
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

  updateDroneStatusUi();

  updateBodyModalState(true);
  document.addEventListener("keydown", handleInventoryPanelKeydown, true);

  setActiveInventorySection(activeInventoryTab);
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

const createTodoId = () =>
  `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const sanitizeTodoItems = (items) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      const text =
        typeof item?.text === "string" ? item.text.trim() : String(item?.text ?? "").trim();

      if (!text) {
        return null;
      }

      const id =
        typeof item?.id === "string" && item.id.trim() !== ""
          ? item.id.trim()
          : createTodoId();

      return { id, text, completed: Boolean(item?.completed) };
    })
    .filter(Boolean);
};

const setTodoStatus = (message) => {
  if (!(todoStatusMessage instanceof HTMLElement)) {
    return;
  }

  const normalizedMessage = typeof message === "string" ? message.trim() : "";

  todoStatusMessage.hidden = !normalizedMessage;
  todoStatusMessage.textContent = normalizedMessage;
};

const renderTodoList = () => {
  if (!(todoListElement instanceof HTMLElement)) {
    return;
  }

  todoListElement.innerHTML = "";

  if (!Array.isArray(todoItems) || todoItems.length === 0) {
    if (todoEmptyState instanceof HTMLElement) {
      todoEmptyState.hidden = false;
    }
    return;
  }

  if (todoEmptyState instanceof HTMLElement) {
    todoEmptyState.hidden = true;
  }

  todoItems.forEach((item, index) => {
    const listItem = document.createElement("li");
    listItem.className = "todo-panel__item";
    listItem.dataset.todoId = item.id;

    const label = document.createElement("label");
    label.className = "todo-panel__label";

    const indexLabel = document.createElement("span");
    indexLabel.className = "todo-panel__index";
    indexLabel.textContent = `${index + 1}.`;

    const input = document.createElement("input");
    input.className = "todo-panel__input";
    input.type = "text";
    input.value = item.text;
    input.dataset.todoInput = "true";
    input.setAttribute("aria-label", `Todo ${index + 1}`);

    const deleteButton = document.createElement("button");
    deleteButton.className = "todo-panel__delete";
    deleteButton.type = "button";
    deleteButton.dataset.todoDelete = "true";
    deleteButton.setAttribute("aria-label", `Delete todo ${index + 1}`);
    deleteButton.textContent = "Delete";

    label.append(indexLabel, input);
    listItem.append(label, deleteButton);
    todoListElement.appendChild(listItem);
  });
};

const focusFirstTodoControl = () => {
  if (!(todoDialog instanceof HTMLElement)) {
    return;
  }

  const firstFocusable = Array.from(
    todoDialog.querySelectorAll(modalFocusableSelectors)
  ).find(
    (element) =>
      element instanceof HTMLElement &&
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex !== -1 &&
      isFocusableElementVisible(element)
  );

  if (firstFocusable instanceof HTMLElement) {
    firstFocusable.focus({ preventScroll: true });
  }
};

const applyTodoStorageState = (storageAvailable) => {
  todoStorageAvailable = Boolean(storageAvailable);

  if (!todoStorageAvailable) {
    setTodoStatus("Saving is unavailable while local storage is blocked.");
  } else if (todoStatusMessage instanceof HTMLElement && !todoStatusMessage.hidden) {
    setTodoStatus("");
  }
};

const loadTodoItems = () => {
  const { todos, storageAvailable } = loadStoredTodos();
  applyTodoStorageState(storageAvailable);
  todoItems = sanitizeTodoItems(todos);
  renderTodoList();
};

const persistTodoItems = ({ showErrors = false } = {}) => {
  const hasEmptyTodos = Array.isArray(todoItems)
    ? todoItems.some((item) => !String(item?.text ?? "").trim())
    : false;
  const sanitizedTodos = sanitizeTodoItems(todoItems);

  if (hasEmptyTodos && sanitizedTodos.length < (todoItems?.length ?? 0)) {
    if (showErrors) {
      setTodoStatus("Add a short description to each todo before saving.");
    }

    return false;
  }

  const { success, storageAvailable } = persistTodos(sanitizedTodos);
  applyTodoStorageState(storageAvailable);

  if (!success || !storageAvailable) {
    if (showErrors || !storageAvailable) {
      setTodoStatus(
        "Unable to save todos right now. Local storage may be unavailable."
      );
    }

    return false;
  }

  if (showErrors) {
    setTodoStatus("");
  }

  todoItems = sanitizedTodos;

  return true;
};

const scheduleTodoPersist = ({ showErrors = false } = {}) => {
  window.clearTimeout(todoPersistTimeoutId);
  todoPersistTimeoutId = window.setTimeout(() => {
    persistTodoItems({ showErrors });
  }, showErrors ? 0 : 260);
};

const addTodoItem = () => {
  const newItem = { id: createTodoId(), text: "New todo", completed: false };
  todoItems.push(newItem);
  renderTodoList();

  const newInput = todoListElement?.querySelector(
    `[data-todo-id="${newItem.id}"] [data-todo-input]`
  );

  if (newInput instanceof HTMLElement) {
    newInput.focus({ preventScroll: true });
  }

  scheduleTodoPersist({ showErrors: true });
};

const isTodoPanelOpen = () => todoPanel?.dataset.open === "true";

const trapFocusWithinTodoPanel = (event) => {
  if (!isTodoPanelOpen() || !(todoDialog instanceof HTMLElement)) {
    return;
  }

  const focusableElements = Array.from(
    todoDialog.querySelectorAll(modalFocusableSelectors)
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
    if (activeElement === firstElement || !todoDialog.contains(activeElement)) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
    }

    return;
  }

  if (activeElement === lastElement || !todoDialog.contains(activeElement)) {
    event.preventDefault();
    firstElement.focus({ preventScroll: true });
  }
};

const handleTodoPanelKeydown = (event) => {
  if (!isTodoPanelOpen()) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeTodoPanel();
  } else if (event.key === "Tab") {
    trapFocusWithinTodoPanel(event);
  }
};

const finishClosingTodoPanel = ({ restoreFocus = true } = {}) => {
  if (!(todoPanel instanceof HTMLElement)) {
    return;
  }

  todoPanel.hidden = true;
  todoPanel.dataset.open = "false";
  todoPanel.setAttribute("aria-hidden", "true");
  window.clearTimeout(todoPanelCloseFallbackId);
  todoPanelCloseFallbackId = 0;

  updateBodyModalState(false);
  document.removeEventListener("keydown", handleTodoPanelKeydown, true);
  sceneController?.setMovementEnabled(true);

  const elementToRefocus = restoreFocus ? lastTodoFocusedElement : null;
  lastTodoFocusedElement = null;

  if (elementToRefocus instanceof HTMLElement) {
    elementToRefocus.focus({ preventScroll: true });
  }

  if (todoPanelWasPointerLocked) {
    attemptToRestorePointerLock();
  }

  todoPanelWasPointerLocked = false;
};

const closeTodoPanel = ({ restoreFocus = true } = {}) => {
  if (!isTodoPanelOpen() || !(todoPanel instanceof HTMLElement)) {
    return;
  }

  todoPanel.classList.remove("is-open");
  todoPanel.setAttribute("aria-hidden", "true");

  const handleTransitionEnd = (event) => {
    if (event.target !== todoPanel) {
      return;
    }

    todoPanel.removeEventListener("transitionend", handleTransitionEnd);
    finishClosingTodoPanel({ restoreFocus });
  };

  todoPanel.addEventListener("transitionend", handleTransitionEnd);
  todoPanelCloseFallbackId = window.setTimeout(() => {
    todoPanel.removeEventListener("transitionend", handleTransitionEnd);
    finishClosingTodoPanel({ restoreFocus });
  }, 240);
};

const openTodoPanel = () => {
  if (!(todoPanel instanceof HTMLElement) || !(todoDialog instanceof HTMLElement)) {
    return;
  }

  if (isTodoPanelOpen()) {
    return;
  }

  todoPanelWasPointerLocked = Boolean(sceneController?.unlockPointerLock?.());
  sceneController?.setMovementEnabled(false);
  hideTerminalToast();
  hideResourceToast();

  lastTodoFocusedElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  loadTodoItems();

  todoPanel.hidden = false;
  todoPanel.dataset.open = "true";
  todoPanel.setAttribute("aria-hidden", "false");
  window.clearTimeout(todoPanelCloseFallbackId);
  todoPanelCloseFallbackId = 0;

  updateBodyModalState(true);
  document.addEventListener("keydown", handleTodoPanelKeydown, true);

  requestAnimationFrame(() => {
    todoPanel.classList.add("is-open");
    focusFirstTodoControl();
  });
};

const shouldIgnoreTodoHotkey = (event) => {
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

const handleTodoHotkey = (event) => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const key = typeof event.key === "string" ? event.key.toLowerCase() : "";

  if (key !== "p") {
    return;
  }

  if (shouldIgnoreTodoHotkey(event)) {
    return;
  }

  const todoPanelCurrentlyOpen = isTodoPanelOpen();

  if (
    !todoPanelCurrentlyOpen &&
    ((quickAccessModal instanceof HTMLElement && !quickAccessModal.hidden) ||
      isModelPaletteOpen() ||
      isInventoryOpen())
  ) {
    return;
  }

  event.preventDefault();

  if (todoPanelCurrentlyOpen) {
    closeTodoPanel();
  } else {
    openTodoPanel();
  }
};

const handleTodoListInput = (event) => {
  const target = event.target;

  if (!(target instanceof HTMLInputElement) || target.dataset.todoInput !== "true") {
    return;
  }

  const itemElement = target.closest("[data-todo-id]");
  const todoId = itemElement instanceof HTMLElement ? itemElement.dataset.todoId : "";

  if (!todoId) {
    return;
  }

  const todo = todoItems.find((entry) => entry.id === todoId);

  if (todo) {
    todo.text = target.value;
    scheduleTodoPersist();
  }
};

const handleTodoListClick = (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;

  const deleteButton = target?.closest("[data-todo-delete]");

  if (deleteButton instanceof HTMLElement) {
    const itemElement = deleteButton.closest("[data-todo-id]");
    const todoId = itemElement instanceof HTMLElement ? itemElement.dataset.todoId : "";

    if (!todoId) {
      return;
    }

    todoItems = todoItems.filter((item) => item.id !== todoId);
    renderTodoList();
    scheduleTodoPersist({ showErrors: true });
  }
};

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
  missionModalActive = false;
  teardownQuickAccessModalContent();
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

  teardownQuickAccessModalContent();

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
  inventoryList.addEventListener("click", handleInventoryItemClick);
  inventoryList.addEventListener("focusin", handleInventoryItemFocusIn);
  inventoryList.addEventListener("focusout", handleInventoryItemFocusOut);
}

if (droneFuelSourceList instanceof HTMLElement) {
  droneFuelSourceList.addEventListener(
    "pointerdown",
    handleDroneFuelSourcePointerDown,
    { passive: false }
  );
}

if (droneFuelGrid instanceof HTMLElement) {
  droneFuelGrid.addEventListener("click", handleDroneFuelGridClick);
}

if (inventoryBody instanceof HTMLElement) {
  inventoryBody.addEventListener("scroll", hideInventoryTooltip, {
    passive: true,
  });
}

if (inventoryTabButtons.length > 0) {
  inventoryTabButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.addEventListener("click", () => {
      const target = button.dataset.inventoryTabTarget;

      if (typeof target === "string" && target.trim() !== "") {
        setActiveInventorySection(target);
      }
    });
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

if (todoListElement instanceof HTMLElement) {
  todoListElement.addEventListener("input", handleTodoListInput);
  todoListElement.addEventListener("change", handleTodoListInput);
  todoListElement.addEventListener("click", handleTodoListClick);
}

if (todoAddButton instanceof HTMLElement) {
  todoAddButton.addEventListener("click", (event) => {
    event.preventDefault();
    addTodoItem();
  });
}

if (todoSaveButton instanceof HTMLElement) {
  todoSaveButton.addEventListener("click", (event) => {
    event.preventDefault();
    persistTodoItems({ showErrors: true });
  });
}

if (todoCloseButtons.length > 0 || todoPanel instanceof HTMLElement) {
  const handleTodoCloseClick = (event) => {
    const target =
      event.target instanceof HTMLElement
        ? event.target.closest("[data-todo-close],[data-todo-dismiss]")
        : null;

    if (!target) {
      return;
    }

    event.preventDefault();
    closeTodoPanel();
  };

  todoCloseButtons.forEach((button) => {
    if (button instanceof HTMLElement) {
      button.addEventListener("click", handleTodoCloseClick);
    }
  });

  todoPanel?.addEventListener("click", handleTodoCloseClick);
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
document.addEventListener("keydown", handleTodoHotkey);

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

const getDroneFuelText = () => {
  const capacity = Math.max(1, droneState.fuelCapacity || DRONE_FUEL_CAPACITY);
  const fuel = Math.max(0, Math.min(droneState.fuelRemaining, capacity));
  return `${fuel} / ${capacity} fuel`;
};

const getDroneMissionSummary = () => {
  const detail = droneState.lastResult;

  if (!detail) {
    if (isDronePickupRequired()) {
      return "Move closer to pick up the grounded drone.";
    }

    if (droneState.fuelRemaining <= 0) {
      return "Awaiting Hydrogen or Helium resupply.";
    }

    if (droneState.status === "collecting") {
      return "Autonomous drone is on route to the target.";
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

const updateDroneInventoryTabVisibility = () => {
  const shouldShowDroneTab = inventoryViewingMode !== "watch";

  if (droneInventoryTabButton instanceof HTMLButtonElement) {
    droneInventoryTabButton.hidden = !shouldShowDroneTab;
    droneInventoryTabButton.setAttribute(
      "aria-hidden",
      shouldShowDroneTab ? "false" : "true",
    );
  }

  if (droneInventorySection instanceof HTMLElement) {
    droneInventorySection.hidden =
      !shouldShowDroneTab || activeInventoryTab !== "drone";
  }

  if (inventoryDroneRefuelButton instanceof HTMLButtonElement) {
    inventoryDroneRefuelButton.hidden = !shouldShowDroneTab;
    inventoryDroneRefuelButton.setAttribute(
      "aria-hidden",
      shouldShowDroneTab ? "false" : "true",
    );
  }

  if (inventoryDroneAutoRefillToggle instanceof HTMLElement) {
    inventoryDroneAutoRefillToggle.closest("label")?.setAttribute(
      "aria-hidden",
      shouldShowDroneTab ? "false" : "true",
    );
    inventoryDroneAutoRefillToggle.closest("label")?.toggleAttribute(
      "hidden",
      !shouldShowDroneTab,
    );
  }

  if (inventoryDroneStatusLabel instanceof HTMLElement) {
    inventoryDroneStatusLabel.hidden = !shouldShowDroneTab;
    inventoryDroneStatusLabel.setAttribute(
      "aria-hidden",
      shouldShowDroneTab ? "false" : "true",
    );
  }

  if (!shouldShowDroneTab && activeInventoryTab === "drone") {
    setActiveInventorySection("inventory");
  }
};

function updateDroneStatusUi() {
  updateDroneQuickSlotState();
  updateDroneInventoryTabVisibility();

  if (droneStatusPanels.length === 0) {
    return;
  }

  const isActive = Boolean(droneState.active);
  const requiresPickup = isDronePickupRequired();
  const inventoryIsOpen =
    isInventoryOpen() ||
    (inventoryPanel instanceof HTMLElement &&
      inventoryPanel.classList.contains("is-open"));
  const shouldShowAnyPanel = isActive || requiresPickup;

  let shouldRenderDetails = false;

  droneStatusPanels.forEach((panel) => {
    if (!(panel instanceof HTMLElement)) {
      return;
    }

    const isInventoryPanel = panel.hasAttribute("data-inventory-drone-panel");
    const panelShouldShow =
      shouldShowAnyPanel && (!inventoryIsOpen || isInventoryPanel);

    panel.dataset.active = isActive ? "true" : "false";
    panel.setAttribute("aria-hidden", panelShouldShow ? "false" : "true");

    if (!panelShouldShow) {
      panel.hidden = true;
      delete panel.dataset.state;
      return;
    }

    shouldRenderDetails = true;
    panel.hidden = false;
    panel.dataset.state = droneState.status;
    panel.setAttribute("aria-hidden", "false");
  });

  if (!shouldRenderDetails) {
    return;
  }

  let statusText = "Scanning";
  let detailText = getDroneMissionSummary();

  const payloadCapacity = Math.max(1, DRONE_MINER_MAX_PAYLOAD_GRAMS);
  const currentPayload = Math.max(0, Math.min(droneState.payloadGrams, payloadCapacity));
  const payloadRatio = payloadCapacity > 0 ? currentPayload / payloadCapacity : 0;

  const fuelCapacity = Math.max(1, droneState.fuelCapacity || DRONE_FUEL_CAPACITY);
  const fuelRemaining = Math.max(0, Math.min(droneState.fuelRemaining, fuelCapacity));
  const fuelRatio = fuelCapacity > 0 ? fuelRemaining / fuelCapacity : 0;

  if (requiresPickup) {
    statusText = "Retrieve";
    detailText = "Move close to pick up the grounded drone.";
  } else {
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
        detailText = "Drone is on route to your position.";
        break;
      case "idle":
      default:
        statusText = "Scanning";
        detailText = getDroneMissionSummary();
        break;
    }
  }

  droneStatusLabels.forEach((element) => {
    if (element instanceof HTMLElement) {
      element.textContent = statusText;
    }
  });

  droneStatusDetails.forEach((element) => {
    if (element instanceof HTMLElement) {
      element.textContent = detailText;
    }
  });

  dronePayloadLabels.forEach((element) => {
    if (element instanceof HTMLElement) {
      element.textContent = `Payload ${getDronePayloadText()}`;
    }
  });

  droneFuelLabels.forEach((element) => {
    if (element instanceof HTMLElement) {
      element.textContent = `Fuel ${getDroneFuelText()}`;
    }
  });

  dronePayloadMeters.forEach((element) => {
    if (element instanceof HTMLElement) {
      element.style.width = `${(payloadRatio * 100).toFixed(1)}%`;
    }
  });

  droneFuelMeters.forEach((element) => {
    if (element instanceof HTMLElement) {
      element.style.width = `${(fuelRatio * 100).toFixed(1)}%`;
    }
  });

  droneRefuelButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const refuelDisabled = requiresPickup || fuelRemaining >= fuelCapacity;
    button.disabled = refuelDisabled;
  });

  const inventoryRefuelButton =
    inventoryDroneRefuelButton instanceof HTMLButtonElement
      ? inventoryDroneRefuelButton
      : null;
  const inventoryRefuelHelper =
    inventoryDroneStatusLabel instanceof HTMLElement
      ? inventoryDroneStatusLabel
      : null;

  if (inventoryRefuelButton) {
    inventoryRefuelButton.disabled =
      requiresPickup || droneState.fuelRemaining >= fuelCapacity;
  }

  if (inventoryRefuelHelper) {
    let helperText = "";

    if (requiresPickup) {
      helperText = "Move close to the grounded drone to pick it up.";
    } else if (droneState.fuelRemaining >= fuelCapacity) {
      helperText = "Fuel tanks are full.";
    }

    inventoryRefuelHelper.textContent = helperText;
  }

  if (inventoryDroneAutoRefillToggle instanceof HTMLInputElement) {
    inventoryDroneAutoRefillToggle.checked = droneState.autoRefillEnabled;
  }

  renderDroneInventoryUi();
}

updateDroneStatusUi();

const cancelDroneAutomationRetry = () => {
  if (droneAutomationRetryTimeoutId) {
    window.clearTimeout(droneAutomationRetryTimeoutId);
    droneAutomationRetryTimeoutId = 0;
  }
};

const promptInventoryForDroneFuel = () => {
  activeInventoryTab = "drone";
  openInventoryPanel();
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
  const deliveries = droneState.cargo.slice();
  const remainingCargo = [];
  let deliveredCount = 0;
  let deliveredWeight = 0;

  deliveries.forEach((sample) => {
    if (!sample?.found || !sample.element) {
      return;
    }

    const sampleWeight = getInventoryElementWeight(sample.element);
    const normalizedWeight = Number.isFinite(sampleWeight) ? sampleWeight : 0;

    if (!canAcceptInventoryWeight(normalizedWeight)) {
      remainingCargo.push(sample);
      return;
    }

    const recorded = recordInventoryResource(sample, { allowDroneSource: true });

    if (!recorded) {
      remainingCargo.push(sample);
      return;
    }

    deliveredCount += 1;
    deliveredWeight += normalizedWeight;
  });

  droneState.cargo = remainingCargo;
  droneState.payloadGrams = remainingCargo.reduce((total, sample) => {
    const weight = getInventoryElementWeight(sample.element);
    return total + (Number.isFinite(weight) ? weight : 0);
  }, 0);
  persistDroneCargoSnapshot();

  return { deliveredCount, deliveredWeight };
};

const tryAutomaticDroneRefill = () => {
  if (!droneState.autoRefillEnabled || droneState.fuelRemaining > 0) {
    return 0;
  }

  const { fuelAdded } = tryRefuelDroneFromInventory();

  if (fuelAdded > 0) {
    updateDroneStatusUi();
  }

  return fuelAdded;
};

const finalizeDroneAutomationShutdown = () => {
  dronePickupState.required = false;
  dronePickupState.location = null;

  const { deliveredCount, deliveredWeight } = deliverDroneCargo();
  droneState.active = false;
  droneState.pendingShutdown = false;
  droneState.status = "inactive";
  droneState.lastResult = null;
  droneState.inFlight = false;
  droneState.awaitingReturn = false;
  droneState.fuelCapacity = Math.max(1, droneState.fuelCapacity || DRONE_FUEL_CAPACITY);
  ensureDroneFuelSlots(droneState.fuelCapacity);
  droneState.fuelRemaining = Math.max(
    0,
    Math.min(droneState.fuelRemaining, droneState.fuelCapacity)
  );
  const activeRuntimeSeconds =
    getActiveFuelSlotInfo()?.runtimeSeconds ?? DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT;
  droneState.miningSecondsSinceFuelUse = Math.max(
    0,
    Math.min(droneState.miningSecondsSinceFuelUse || 0, activeRuntimeSeconds)
  );
  droneState.miningSessionStartMs = 0;
  // Regression hook: ensures recalling the drone with unused fuel preserves remaining slots.
  document.dispatchEvent(
    new CustomEvent("drone:recall-with-remaining-fuel", {
      detail: {
        fuelRemaining: droneState.fuelRemaining,
        fuelSlots: droneState.fuelSlots.filter(Boolean).length,
      },
    })
  );
  persistDroneCargoSnapshot();
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

  if (!hasDroneFuelForLaunch()) {
    tryAutomaticDroneRefill();

    if (hasDroneFuelForLaunch()) {
      updateDroneStatusUi();
    }
  }

  if (!hasDroneFuelForLaunch()) {
    droneState.status = "idle";
    droneState.lastResult = { reason: "fuel" };
    updateDroneStatusUi();
    showDroneResourceToast({
      title: "Fuel required",
      description: "Load Hydrogen or Helium from inventory to launch.",
    });
    promptInventoryForDroneFuel();
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
  droneState.miningSessionStartMs = performance.now();
  droneState.lastResult = null;
  droneState.notifiedUnavailable = false;
  updateDroneStatusUi();
};

const relaunchDroneAfterRestoreIfNeeded = () => {
  if (!droneRelaunchPendingAfterRestore || !droneState.active) {
    return;
  }

  droneRelaunchPendingAfterRestore = false;
  attemptDroneLaunch();
};

const activateDroneAutomation = () => {
  if (droneState.active) {
    return;
  }

  if (!hasDroneFuelForLaunch()) {
    droneState.lastResult = null;
    updateDroneStatusUi();
    showDroneResourceToast({
      title: "Fuel required",
      description: "Load Hydrogen or Helium before deploying the drone.",
    });
    promptInventoryForDroneFuel();
    return;
  }

  if (isDronePickupRequired()) {
    showDroneResourceToast({
      title: "Pick up the drone",
      description: "Move closer to retrieve it before relaunching.",
    });
    return;
  }

  droneState.active = true;
  droneState.pendingShutdown = false;
  droneState.awaitingReturn = false;
  droneState.cargo = [];
  droneState.payloadGrams = 0;
  droneState.fuelCapacity = Math.max(1, droneState.fuelCapacity || DRONE_FUEL_CAPACITY);
  droneState.fuelRemaining = Math.max(
    0,
    Math.min(droneState.fuelRemaining, droneState.fuelCapacity)
  );
  ensureDroneFuelSlots(droneState.fuelCapacity);
  droneState.miningSecondsSinceFuelUse = Math.max(
    0,
    Math.min(
      droneState.miningSecondsSinceFuelUse,
      getActiveFuelSlotInfo()?.runtimeSeconds ?? DRONE_FUEL_RUNTIME_SECONDS_PER_UNIT,
    ),
  );
  droneState.miningSessionStartMs = 0;
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

const describeFuelResources = (fuelMap) => {
  if (!fuelMap?.size) {
    return "";
  }

  return Array.from(fuelMap.entries())
    .map(([name, count]) => `${name} ×${count}`)
    .join(", ");
};

const handleDroneRefuelRequest = () => {
  if (isDronePickupRequired()) {
    showDroneTerminalToast({
      title: "Pick up the drone",
      description: "Move closer to refuel and relaunch.",
    });
    return;
  }

  const { fuelAdded, resourcesUsed } = tryRefuelDroneFromInventory();
  const capacity = Math.max(1, droneState.fuelCapacity || DRONE_FUEL_CAPACITY);

  updateDroneStatusUi();

  if (fuelAdded <= 0) {
    showDroneTerminalToast({
      title: "No Hydrogen or Helium available",
      description: "Add Hydrogen or Helium to inventory to refuel the drone.",
    });
    return;
  }

  const description =
    droneState.fuelRemaining >= capacity
      ? "Fuel reserves restored."
      : "Partial refuel complete.";
  const fuelSummary = describeFuelResources(resourcesUsed);
  const detailedDescription = fuelSummary
    ? `${description} Loaded: ${fuelSummary}.`
    : description;

  showDroneTerminalToast({
    title: `Fuel loaded (${fuelAdded})`,
    description: detailedDescription,
  });

  if (!droneState.inFlight && !droneState.awaitingReturn) {
    attemptDroneLaunch();
  }
};

const handleDroneResourceCollected = (detail) => {
  droneState.inFlight = false;
  droneState.status = "returning";
  droneState.awaitingReturn = true;
  droneState.lastResult = detail ?? null;

  concludeDroneMiningSession(detail);

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

  concludeDroneMiningSession();

  if (droneState.pendingShutdown) {
    finalizeDroneAutomationShutdown();
    return;
  }

  droneState.status = droneState.active ? "idle" : "inactive";
  updateDroneStatusUi();

  if (droneState.active) {
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

  if (!droneState.pendingShutdown && droneState.fuelRemaining <= 0) {
    tryAutomaticDroneRefill();
  }

  if (droneState.pendingShutdown || droneState.fuelRemaining <= 0) {
    finalizeDroneAutomationShutdown();
    return;
  }

  if (!droneState.active) {
    updateDroneStatusUi();
    return;
  }

  droneState.status = "idle";
  persistDroneCargoSnapshot();
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

droneRefuelButtons.forEach((button) => {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    handleDroneRefuelRequest();
  });
});

if (inventoryDroneRefuelButton instanceof HTMLButtonElement) {
  inventoryDroneRefuelButton.addEventListener("click", (event) => {
    event.preventDefault();
    handleDroneRefuelRequest();
  });
}

if (inventoryDroneAutoRefillToggle instanceof HTMLInputElement) {
  inventoryDroneAutoRefillToggle.addEventListener("change", (event) => {
    const { checked } = event.target;
    droneState.autoRefillEnabled = Boolean(checked);
    persistDroneCargoSnapshot();
    tryAutomaticDroneRefill();
    updateDroneStatusUi();
  });
}

window.setInterval(cancelStalledDroneMiningSession, DRONE_STALL_CHECK_INTERVAL_MS);

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

  sceneController?.dispose?.();

  sceneController = initScene(canvas, {
    settings: currentSettings,
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
  relaunchDroneAfterRestoreIfNeeded();

  sceneController?.setPlayerHeight?.(DEFAULT_PLAYER_HEIGHT, { persist: true });
  sceneController?.setLiftInteractionsEnabled?.(!editModeActive);

};

if (fpsToggle instanceof HTMLInputElement) {
  fpsToggle.addEventListener("change", (event) => {
    const enabled = Boolean(event.target?.checked);
    currentSettings = { ...currentSettings, showFpsCounter: enabled };
    persistSettings(currentSettings);
    applyFpsUiState();
  });
}

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
    clearStoredSettings();

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
