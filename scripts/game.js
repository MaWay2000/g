import { logout } from "./auth.js";
import * as THREE from "three";
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
import {
  clearStoredGeoVisorState,
  loadStoredGeoVisorState,
  persistGeoVisorState,
} from "./geo-visor-storage.js";
import { PERIODIC_ELEMENTS } from "./data/periodic-elements.js";
import { OUTSIDE_TERRAIN_TYPES, getOutsideTerrainById } from "./outside-map.js";
import {
  MAX_ACTIVE_MISSIONS,
  completeMission,
  getActiveMissions,
  getMissions,
  getPendingMissions,
  resetMissions,
  subscribeToMissionState,
} from "./missions.js";
import {
  addMarsMoney,
  getCurrencyBalance,
  isCurrencyStorageAvailable,
  resetCurrency,
  subscribeToCurrency,
} from "./currency.js";
import {
  getDefaultMarketState,
  loadMarketState,
  persistMarketState,
} from "./market-state-storage.js";
import { loadStoredTodos, persistTodos } from "./todo-storage.js";
import {
  clearStoredTerrainLife,
  getTerrainLifeKey,
  loadStoredTerrainLife,
  persistTerrainLifeState,
} from "./terrain-life-storage.js";
import { clearStoredManifestPlacements } from "./manifest-placement-storage.js";
import {
  clearStoredPlayerOxygenState,
  loadStoredPlayerOxygenState,
  persistPlayerOxygenState,
} from "./oxygen-state-storage.js";

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
const geoScanPanel = document.querySelector("[data-geo-scan-panel]");
const geoScanTerrainLabel = geoScanPanel?.querySelector(
  "[data-geo-scan-terrain]"
);
const geoScanElementsLabel = geoScanPanel?.querySelector(
  "[data-geo-scan-elements]"
);
const geoScanLifeValue = geoScanPanel?.querySelector(
  "[data-geo-scan-life-value]"
);
const geoScanLifeFill = geoScanPanel?.querySelector(
  "[data-geo-scan-life-fill]"
);
const geoScanLifeBar = geoScanPanel?.querySelector(
  ".geo-scan-panel__life-bar"
);
const crosshair = document.querySelector(".crosshair");
const renderingErrorBanner = document.querySelector("[data-rendering-error]");
const renderingErrorDetail = renderingErrorBanner?.querySelector(
  "[data-rendering-error-detail]"
);
const areaLoadingOverlay = document.querySelector("[data-area-loading-overlay]");
const areaLoadingTitle = areaLoadingOverlay?.querySelector(
  "[data-area-loading-title]"
);
const areaLoadingDescription = areaLoadingOverlay?.querySelector(
  "[data-area-loading-description]"
);
const topBar = document.querySelector(".top-bar");
const settingsMenu = document.querySelector("[data-settings-menu]");
const settingsTrigger = settingsMenu?.querySelector("[data-settings-trigger]");
const settingsPanelsContainer = settingsMenu?.querySelector("[data-settings-panels]");
const settingsPanel = settingsMenu?.querySelector("[data-settings-panel]");
const fpsToggle = document.querySelector("[data-fps-toggle]");
const starsToggle = document.querySelector("[data-stars-toggle]");
const reflectionsToggle = document.querySelector("[data-reflections-toggle]");
const starFollowToggle = document.querySelector("[data-stars-follow-toggle]");
const godModeToggle = document.querySelector("[data-god-mode-toggle]");
const liftDoorFilterToggle = document.querySelector("[data-lift-door-filter-toggle]");
const thirdPersonToggle = document.querySelector("[data-third-person-toggle]");
const playerSpeedRange = document.querySelector("[data-player-speed-range]");
const playerSpeedInput = document.querySelector("[data-player-speed-input]");
const playerJumpRange = document.querySelector("[data-player-jump-range]");
const playerJumpInput = document.querySelector("[data-player-jump-input]");
const jumpApexSmoothingRange = document.querySelector(
  "[data-jump-apex-smoothing-range]"
);
const jumpApexSmoothingInput = document.querySelector(
  "[data-jump-apex-smoothing-input]"
);
const jumpApexVelocityRange = document.querySelector(
  "[data-jump-apex-velocity-range]"
);
const jumpApexVelocityInput = document.querySelector(
  "[data-jump-apex-velocity-input]"
);
const viewDistanceRange = document.querySelector("[data-view-distance-range]");
const viewDistanceInput = document.querySelector("[data-view-distance-input]");
const starSizeRange = document.querySelector("[data-star-size-range]");
const starDensityRange = document.querySelector("[data-star-density-range]");
const starOpacityRange = document.querySelector("[data-star-opacity-range]");
const reflectionScaleRange = document.querySelector(
  "[data-reflection-scale-range]"
);
const timeOffsetRange = document.querySelector("[data-time-offset-range]");
const skyExtentRange = document.querySelector("[data-sky-extent-range]");
const playerSpeedValue = document.querySelector("[data-player-speed-value]");
const playerJumpValue = document.querySelector("[data-player-jump-value]");
const jumpApexSmoothingValue = document.querySelector(
  "[data-jump-apex-smoothing-value]"
);
const jumpApexVelocityValue = document.querySelector(
  "[data-jump-apex-velocity-value]"
);
const viewDistanceValue = document.querySelector("[data-view-distance-value]");
const starSizeInput = document.querySelector("[data-star-size-input]");
const starDensityInput = document.querySelector("[data-star-density-input]");
const starOpacityInput = document.querySelector("[data-star-opacity-input]");
const reflectionScaleInput = document.querySelector("[data-reflection-scale-input]");
const timeOffsetInput = document.querySelector("[data-time-offset-input]");
const skyExtentInput = document.querySelector("[data-sky-extent-input]");
const skyHeightRange = document.querySelector("[data-sky-height-range]");
const skyHeightInput = document.querySelector("[data-sky-height-input]");
const starSizeValue = document.querySelector("[data-star-size-value]");
const starDensityValue = document.querySelector("[data-star-density-value]");
const starOpacityValue = document.querySelector("[data-star-opacity-value]");
const reflectionScaleValue = document.querySelector(
  "[data-reflection-scale-value]"
);
const timeOffsetValue = document.querySelector("[data-time-offset-value]");
const skyExtentValue = document.querySelector("[data-sky-extent-value]");
const skyHeightValue = document.querySelector("[data-sky-height-value]");
const speedSummaryValue = document.querySelector("[data-speed-summary-value]");
const jumpSummaryValue = document.querySelector("[data-jump-summary-value]");
const viewSummaryValue = document.querySelector("[data-view-summary-value]");
const starSettingsSubmenu = document.querySelector("[data-stars-settings-submenu]");
const reflectionSettingsSubmenu = document.querySelector(
  "[data-reflection-settings-submenu]"
);
const speedSettingsSubmenu = document.querySelector("[data-speed-settings-submenu]");
const jumpSettingsSubmenu = document.querySelector("[data-jump-settings-submenu]");
const viewSettingsSubmenu = document.querySelector("[data-view-settings-submenu]");
const liftSettingsSubmenu = document.querySelector("[data-lift-settings-submenu]");
const godModeSettingsSubmenu = document.querySelector("[data-god-mode-settings-submenu]");
const starSettingsToggleButton = settingsMenu?.querySelector(
  "[data-star-settings-toggle]"
);
const reflectionSettingsToggleButton = settingsMenu?.querySelector(
  "[data-reflection-settings-toggle]"
);
const speedSettingsToggleButton = settingsMenu?.querySelector(
  "[data-speed-settings-toggle]"
);
const jumpSettingsToggleButton = settingsMenu?.querySelector(
  "[data-jump-settings-toggle]"
);
const viewSettingsToggleButton = settingsMenu?.querySelector(
  "[data-view-settings-toggle]"
);
const liftSettingsToggleButton = settingsMenu?.querySelector(
  "[data-lift-settings-toggle]"
);
const godModeSettingsToggleButton = settingsMenu?.querySelector(
  "[data-god-mode-settings-toggle]"
);
const starSettingsToggleLabel = starSettingsToggleButton?.querySelector(
  "[data-star-settings-label]"
);
const godModeElementSelect = document.querySelector("[data-god-mode-element-select]");
const godModeAddElementButton = document.querySelector("[data-god-mode-add-element]");
const godModeAddAllElementsButton = document.querySelector("[data-god-mode-add-all]");
const liftAreaSettingsList = document.querySelector("[data-lift-area-settings-list]");
const starSettingsInputs = [
  starFollowToggle,
  starSizeRange,
  starDensityRange,
  starOpacityRange,
  skyExtentRange,
  skyHeightRange,
  starSizeInput,
  starDensityInput,
  starOpacityInput,
  skyExtentInput,
  skyHeightInput,
];
const reflectionSettingInputs = [reflectionScaleRange, reflectionScaleInput];
const speedSettingInputs = [playerSpeedRange, playerSpeedInput];
const jumpSettingInputs = [playerJumpRange, playerJumpInput];
const viewSettingInputs = [viewDistanceRange, viewDistanceInput];
const jumpApexSmoothingInputs = [
  jumpApexSmoothingRange,
  jumpApexSmoothingInput,
];
const jumpApexVelocityInputs = [jumpApexVelocityRange, jumpApexVelocityInput];
const timeSettingInputs = [timeOffsetRange, timeOffsetInput];
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
const playerOxygenPanel = document.querySelector("[data-player-oxygen-panel]");
const playerOxygenValueLabel = playerOxygenPanel?.querySelector(
  "[data-player-oxygen-value]"
);
const playerOxygenBarFill = playerOxygenPanel?.querySelector(
  "[data-player-oxygen-bar]"
);
const playerOxygenDrainValueLabel = playerOxygenPanel?.querySelector(
  "[data-player-oxygen-drain-value]"
);
const playerOxygenDrainBarFill = playerOxygenPanel?.querySelector(
  "[data-player-oxygen-drain-bar]"
);
const playerOxygenHintLabel = playerOxygenPanel?.querySelector(
  "[data-player-oxygen-hint]"
);
const playerOxygenVignette = document.querySelector("[data-player-oxygen-vignette]");
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
  oxygen: false,
  storage: false,
  crafting: false,
};
let sceneController = null;
let previousCrosshairInteractableState =
  crosshair instanceof HTMLElement && crosshair.dataset.interactable === "true";
let pointerLockImmersiveModeEnabled = false;
let liftModalActive = false;
let areaLoadingOverlayHideTimeoutId = 0;
const PLAYER_OXYGEN_BASE_MAX_PERCENT = 100;
const PLAYER_OXYGEN_FULL_DURATION_SECONDS = 600;
const PLAYER_OXYGEN_BASE_DRAIN_PER_SECOND =
  PLAYER_OXYGEN_BASE_MAX_PERCENT / PLAYER_OXYGEN_FULL_DURATION_SECONDS;
const PLAYER_OXYGEN_REGEN_FULL_DURATION_SECONDS = 300;
const PLAYER_OXYGEN_TICK_INTERVAL_MS = 250;
const PLAYER_OXYGEN_STILL_DRAIN_MULTIPLIER = 0.2;
const PLAYER_OXYGEN_MOVING_DRAIN_MULTIPLIER = 0.8;
const PLAYER_OXYGEN_SHIFT_MOVING_DRAIN_MULTIPLIER = 1;
const PLAYER_OXYGEN_DIGGING_DRAIN_MULTIPLIER = 0.5;
const PLAYER_OXYGEN_STILL_SPEED_THRESHOLD = 0.12;
const PLAYER_OXYGEN_DIGGING_ACTIVITY_WINDOW_MS = 1200;
const PLAYER_OXYGEN_DIGGING_ACTIVITY_BUFFER_MS = 200;
const PLAYER_OXYGEN_PERSIST_INTERVAL_MS = 1000;
const PLAYER_OXYGEN_CRITICAL_PERCENT = 10;
const PLAYER_OXYGEN_EMERGENCY_PERCENT = 5;
const PLAYER_OXYGEN_WARNING_SOUND_INTERVAL_MS = 2000;
const PLAYER_OXYGEN_WARNING_TOAST_INTERVAL_MS = 6000;
const PLAYER_OXYGEN_EMERGENCY_DIG_DURATION_MULTIPLIER = 1.3;
const PLAYER_OXYGEN_SAFE_DIG_DURATION_MULTIPLIER = 1;
const PLAYER_OXYGEN_SAFE_FLOOR_ID = "operations-concourse";
const PLAYER_OXYGEN_CHAMBER_PENALTY_MS = 60 * 1000;
const PLAYER_OXYGEN_CHAMBER_RECOVERY_PERCENT = 10;
const PLAYER_OXYGEN_SURFACE_FLOOR_IDS = new Set([
  "operations-exterior",
  "exterior-outpost",
]);
const PLAYER_OXYGEN_REFILL_COOLDOWN_MS = 800;
const storedPlayerOxygenState = loadStoredPlayerOxygenState();
let playerOxygenPercent = Number.isFinite(storedPlayerOxygenState?.percent)
  ? Math.max(0, storedPlayerOxygenState.percent)
  : PLAYER_OXYGEN_BASE_MAX_PERCENT;
let lastPlayerOxygenRefillAt = 0;
let playerOxygenTickLastTimestamp = 0;
let playerOxygenDepletionNotified = false;
let playerOxygenMovementLastPosition = null;
let playerOxygenMovementLastTimestamp = 0;
let playerOxygenLastDiggingActivityAt = 0;
let playerOxygenDiggingActiveUntil = 0;
let playerOxygenCurrentDrainMultiplier = 0;
let playerOxygenShiftHeld = false;
let playerOxygenPressureLevel = "safe";
let playerOxygenGuidanceText = "";
let persistPlayerOxygenTimeoutId = 0;
let playerOxygenPersistenceEnabled = true;
let playerOxygenEmergencyRespawnPending = false;
let playerOxygenChamberPenaltyActive = false;
let playerOxygenChamberPenaltyRemainingMs = 0;
let lastPlayerOxygenWarningSoundAt = 0;
let lastPlayerOxygenWarningToastAt = 0;

const clampPlayerOxygenPercent = (value) => {
  const numericValue = Number(value);
  const maxPercent = getPlayerOxygenMaxPercent();
  if (!Number.isFinite(numericValue)) {
    return maxPercent;
  }

  return Math.max(0, Math.min(maxPercent, numericValue));
};

const resolvePlayerOxygenState = (value) => {
  if (value <= getPlayerOxygenThresholdPercent(20)) {
    return "critical";
  }
  if (value <= getPlayerOxygenThresholdPercent(45)) {
    return "low";
  }
  return "safe";
};

const formatPlayerOxygenGuidanceDistance = (distance) => {
  if (!Number.isFinite(distance) || distance < 0) {
    return null;
  }

  if (distance < 10) {
    return `${distance.toFixed(1)}m`;
  }

  return `${Math.round(distance)}m`;
};

const resolvePlayerOxygenPressureLevel = () => {
  if (!isPlayerOnSurfaceForOxygenDrain()) {
    return "safe";
  }

  if (playerOxygenPercent <= 0) {
    return "depleted";
  }

  if (playerOxygenPercent <= getPlayerOxygenThresholdPercent(PLAYER_OXYGEN_EMERGENCY_PERCENT)) {
    return "emergency";
  }

  if (playerOxygenPercent <= getPlayerOxygenThresholdPercent(PLAYER_OXYGEN_CRITICAL_PERCENT)) {
    return "critical";
  }

  return "safe";
};

const isPlayerOxygenSprintLocked = () =>
  playerOxygenPressureLevel === "critical" ||
  playerOxygenPressureLevel === "emergency" ||
  playerOxygenPressureLevel === "depleted";

const resolvePlayerOxygenGuidanceText = (pressureLevel) => {
  if (playerOxygenChamberPenaltyActive) {
    const remainingSeconds = Math.max(
      1,
      Math.ceil(playerOxygenChamberPenaltyRemainingMs / 1000)
    );
    return `Oxygen chamber recovery ${remainingSeconds}s`;
  }

  if (pressureLevel !== "critical" && pressureLevel !== "emergency") {
    return "";
  }

  const nearestDistance = Number(
    sceneController?.getNearestOxygenRefillDistance?.()
  );
  const formattedDistance = formatPlayerOxygenGuidanceDistance(nearestDistance);
  if (!formattedDistance) {
    return "Nearest O2 station unavailable";
  }

  return `Nearest O2 station ${formattedDistance}`;
};

const updatePlayerOxygenUi = () => {
  playerOxygenPercent = clampPlayerOxygenPercent(playerOxygenPercent);
  const maxPercent = getPlayerOxygenMaxPercent();
  const oxygenDisplayValue = Math.max(0, Math.round(playerOxygenPercent));
  const oxygenText =
    maxPercent > PLAYER_OXYGEN_BASE_MAX_PERCENT
      ? `${oxygenDisplayValue}% / ${Math.round(maxPercent)}%`
      : `${oxygenDisplayValue}%`;
  const drainPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        playerOxygenCurrentDrainMultiplier * getCostumeOxygenConsumptionMultiplier() * 100
      )
    )
  );
  const drainText = `${drainPercent}%`;

  if (playerOxygenValueLabel instanceof HTMLElement) {
    playerOxygenValueLabel.textContent = oxygenText;
  }

  if (playerOxygenBarFill instanceof HTMLElement) {
    playerOxygenBarFill.style.width = `${Math.max(
      0,
      Math.min(100, (playerOxygenPercent / maxPercent) * 100)
    )}%`;
  }

  if (playerOxygenDrainValueLabel instanceof HTMLElement) {
    playerOxygenDrainValueLabel.textContent = drainText;
  }

  if (playerOxygenDrainBarFill instanceof HTMLElement) {
    playerOxygenDrainBarFill.style.width = `${drainPercent}%`;
  }

  if (playerOxygenPanel instanceof HTMLElement) {
    const oxygenState = resolvePlayerOxygenState(playerOxygenPercent);
    playerOxygenPanel.dataset.state = oxygenState;
    playerOxygenPanel.dataset.pressure = playerOxygenPressureLevel;
    const drainState =
      drainPercent <= 0
        ? "idle"
        : drainPercent < 100
        ? "slow"
        : "normal";
    playerOxygenPanel.dataset.drainState = drainState;
    const guidanceAria =
      typeof playerOxygenGuidanceText === "string" && playerOxygenGuidanceText
        ? `, ${playerOxygenGuidanceText}`
        : "";
    playerOxygenPanel.setAttribute(
      "aria-label",
      `Player oxygen reserves ${oxygenText}, consumption ${drainText}${guidanceAria}`
    );
  }

  if (playerOxygenHintLabel instanceof HTMLElement) {
    if (typeof playerOxygenGuidanceText === "string" && playerOxygenGuidanceText) {
      playerOxygenHintLabel.textContent = playerOxygenGuidanceText;
      playerOxygenHintLabel.hidden = false;
    } else {
      playerOxygenHintLabel.textContent = "";
      playerOxygenHintLabel.hidden = true;
    }
  }

  if (playerOxygenVignette instanceof HTMLElement) {
    const vignetteLevel =
      playerOxygenPressureLevel === "critical" || playerOxygenPressureLevel === "emergency"
        ? playerOxygenPressureLevel
        : "safe";
    playerOxygenVignette.dataset.level = vignetteLevel;
  }
};

const persistPlayerOxygenSnapshot = ({ force = false } = {}) => {
  if (!playerOxygenPersistenceEnabled) {
    return false;
  }

  return persistPlayerOxygenState(
    {
      percent: playerOxygenPercent,
      updatedAt: Date.now(),
    },
    { force }
  );
};

const schedulePersistPlayerOxygen = ({ force = false } = {}) => {
  if (!playerOxygenPersistenceEnabled) {
    return;
  }

  if (force) {
    if (persistPlayerOxygenTimeoutId) {
      window.clearTimeout(persistPlayerOxygenTimeoutId);
      persistPlayerOxygenTimeoutId = 0;
    }
    persistPlayerOxygenSnapshot({ force: true });
    return;
  }

  if (persistPlayerOxygenTimeoutId) {
    return;
  }

  persistPlayerOxygenTimeoutId = window.setTimeout(() => {
    persistPlayerOxygenTimeoutId = 0;
    persistPlayerOxygenSnapshot();
  }, PLAYER_OXYGEN_PERSIST_INTERVAL_MS);
};

const syncPlayerOxygenChamberPenaltyState = ({ now = Date.now(), silent = false } = {}) => {
  if (!playerOxygenChamberPenaltyActive) {
    playerOxygenChamberPenaltyRemainingMs = 0;
    return false;
  }

  const remainingMs = Number(
    sceneController?.getOxygenChamberPenaltyRemainingMs?.()
  );
  if (Number.isFinite(remainingMs) && remainingMs > 0) {
    playerOxygenChamberPenaltyRemainingMs = Math.ceil(remainingMs);
    const recoveryProgress = Math.max(
      0,
      Math.min(1, 1 - remainingMs / PLAYER_OXYGEN_CHAMBER_PENALTY_MS)
    );
    const targetPercent = Math.max(
      0,
      Math.min(getPlayerOxygenChamberRecoveryTarget(), getPlayerOxygenChamberRecoveryTarget() * recoveryProgress)
    );
    if (Math.abs(playerOxygenPercent - targetPercent) > 1e-6) {
      playerOxygenPercent = targetPercent;
      updatePlayerOxygenUi();
      schedulePersistPlayerOxygen();
    }
    return true;
  }

  playerOxygenChamberPenaltyActive = false;
  playerOxygenChamberPenaltyRemainingMs = 0;
  playerOxygenPercent = getPlayerOxygenChamberRecoveryTarget();
  playerOxygenCurrentDrainMultiplier = 0;
  playerOxygenDepletionNotified = false;
  lastPlayerOxygenWarningSoundAt = 0;
  lastPlayerOxygenWarningToastAt = 0;
  applyPlayerOxygenPressureEffects({
    now,
    silent: true,
    forceUi: true,
  });
  schedulePersistPlayerOxygen({ force: true });

  if (!silent) {
    showTerminalToast({
      title: "Oxygen chamber cycle complete",
      description: "Oxygen restored to 10%. You can move now.",
    });
  }

  return false;
};

const showPlayerOxygenGuidanceToast = (pressureLevel) => {
  const guidanceText =
    typeof playerOxygenGuidanceText === "string" && playerOxygenGuidanceText
      ? playerOxygenGuidanceText
      : "Nearest O2 station unavailable";
  const title =
    pressureLevel === "emergency" ? "Oxygen emergency" : "Oxygen critical";
  showTerminalToast({
    title,
    description: `${guidanceText}.`,
  });
};

const applyPlayerOxygenPressureEffects = ({
  now = Date.now(),
  silent = false,
  forceUi = false,
} = {}) => {
  const previousLevel = playerOxygenPressureLevel;
  const nextLevel = resolvePlayerOxygenPressureLevel();
  const nextGuidanceText = resolvePlayerOxygenGuidanceText(nextLevel);
  const levelChanged = previousLevel !== nextLevel;
  const guidanceChanged = playerOxygenGuidanceText !== nextGuidanceText;

  playerOxygenPressureLevel = nextLevel;
  playerOxygenGuidanceText = nextGuidanceText;

  const sprintEnabled =
    nextLevel !== "critical" &&
    nextLevel !== "emergency" &&
    nextLevel !== "depleted";
  sceneController?.setPlayerSprintEnabled?.(sprintEnabled);
  sceneController?.setResourceToolActionDurationMultiplier?.(
    nextLevel === "emergency"
      ? PLAYER_OXYGEN_EMERGENCY_DIG_DURATION_MULTIPLIER
      : PLAYER_OXYGEN_SAFE_DIG_DURATION_MULTIPLIER
  );

  if (levelChanged || guidanceChanged || forceUi) {
    updatePlayerOxygenUi();
  }

  if (silent) {
    return;
  }

  if (nextLevel === "critical" || nextLevel === "emergency") {
    if (
      !Number.isFinite(lastPlayerOxygenWarningSoundAt) ||
      now - lastPlayerOxygenWarningSoundAt >= PLAYER_OXYGEN_WARNING_SOUND_INTERVAL_MS
    ) {
      playGeoVisorOutOfBatterySound();
      lastPlayerOxygenWarningSoundAt = now;
    }

    if (levelChanged) {
      showPlayerOxygenGuidanceToast(nextLevel);
      lastPlayerOxygenWarningToastAt = now;
      return;
    }

    if (
      !Number.isFinite(lastPlayerOxygenWarningToastAt) ||
      now - lastPlayerOxygenWarningToastAt >= PLAYER_OXYGEN_WARNING_TOAST_INTERVAL_MS
    ) {
      showPlayerOxygenGuidanceToast(nextLevel);
      lastPlayerOxygenWarningToastAt = now;
    }
    return;
  }

  if (
    levelChanged &&
    (previousLevel === "critical" || previousLevel === "emergency")
  ) {
    showTerminalToast({
      title: "Oxygen stabilized",
      description: "Suit reserves above critical threshold.",
    });
  }
};

const triggerPlayerOxygenEmergencyRespawn = (now) => {
  if (playerOxygenEmergencyRespawnPending || playerOxygenChamberPenaltyActive) {
    return true;
  }

  playerOxygenEmergencyRespawnPending = true;

  const chamberResult = sceneController?.enterOxygenChamberPenalty?.({
    durationMs: PLAYER_OXYGEN_CHAMBER_PENALTY_MS,
  });
  const chamberEntered = chamberResult?.entered === true;
  const chamberRemainingMs = Number(chamberResult?.remainingMs);
  playerOxygenChamberPenaltyActive = chamberEntered;
  playerOxygenChamberPenaltyRemainingMs =
    chamberEntered && Number.isFinite(chamberRemainingMs) && chamberRemainingMs > 0
      ? Math.ceil(chamberRemainingMs)
      : chamberEntered
      ? PLAYER_OXYGEN_CHAMBER_PENALTY_MS
      : 0;

  if (!chamberEntered) {
    sceneController?.setActiveLiftFloorById?.(PLAYER_OXYGEN_SAFE_FLOOR_ID);
  }

  playerOxygenPercent = 0;
  playerOxygenDepletionNotified = false;
  playerOxygenCurrentDrainMultiplier = 0;
  clearPlayerOxygenDiggingActivity();
  playerOxygenShiftHeld = false;
  playerOxygenTickLastTimestamp = now;
  playerOxygenMovementLastTimestamp = now;
  playerOxygenMovementLastPosition = sceneController?.getPlayerPosition?.() ?? null;

  applyPlayerOxygenPressureEffects({
    now,
    silent: true,
    forceUi: true,
  });
  schedulePersistPlayerOxygen({ force: true });

  showTerminalToast({
    title: "Emergency oxygen protocol active",
    description: chamberEntered
      ? "Remain still in oxygen chamber for 60s. Oxygen recovering to 10%."
      : "Returned to outside exit for emergency recovery.",
  });

  playerOxygenEmergencyRespawnPending = false;
  return true;
};

const handlePlayerOxygenShiftKeyDown = (event) => {
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    playerOxygenShiftHeld = true;
  }
};

const handlePlayerOxygenShiftKeyUp = (event) => {
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    playerOxygenShiftHeld = false;
  }
};

document.addEventListener("keydown", handlePlayerOxygenShiftKeyDown);
document.addEventListener("keyup", handlePlayerOxygenShiftKeyUp);
window.addEventListener("blur", () => {
  playerOxygenShiftHeld = false;
});

const isPlayerOnSurfaceForOxygenDrain = () => {
  const activeFloorId = sceneController?.getActiveLiftFloor?.()?.id ?? null;
  if (typeof activeFloorId !== "string" || activeFloorId.trim() === "") {
    return false;
  }

  return PLAYER_OXYGEN_SURFACE_FLOOR_IDS.has(activeFloorId);
};

const samplePlayerOxygenMovementSpeed = (now) => {
  const playerPosition = sceneController?.getPlayerPosition?.() ?? null;
  if (!playerPosition) {
    playerOxygenMovementLastPosition = null;
    playerOxygenMovementLastTimestamp = 0;
    return null;
  }

  if (
    !playerOxygenMovementLastPosition ||
    !Number.isFinite(playerOxygenMovementLastTimestamp) ||
    playerOxygenMovementLastTimestamp <= 0
  ) {
    playerOxygenMovementLastPosition = playerPosition;
    playerOxygenMovementLastTimestamp = now;
    return null;
  }

  const elapsedSeconds = Math.max(
    0,
    (now - playerOxygenMovementLastTimestamp) / 1000
  );
  playerOxygenMovementLastTimestamp = now;

  if (elapsedSeconds <= 0) {
    playerOxygenMovementLastPosition = playerPosition;
    return null;
  }

  const deltaX = playerPosition.x - playerOxygenMovementLastPosition.x;
  const deltaZ = playerPosition.z - playerOxygenMovementLastPosition.z;
  const horizontalDistance = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
  playerOxygenMovementLastPosition = playerPosition;

  if (!Number.isFinite(horizontalDistance)) {
    return null;
  }

  return horizontalDistance / elapsedSeconds;
};

const resolvePlayerOxygenDrainMultiplier = (now) => {
  const diggingRecently =
    Number.isFinite(playerOxygenDiggingActiveUntil) &&
    playerOxygenDiggingActiveUntil > 0 &&
    now <= playerOxygenDiggingActiveUntil;

  if (diggingRecently) {
    return PLAYER_OXYGEN_DIGGING_DRAIN_MULTIPLIER;
  }

  const movementSpeed = samplePlayerOxygenMovementSpeed(now);
  const isStill =
    Number.isFinite(movementSpeed) &&
    movementSpeed <= PLAYER_OXYGEN_STILL_SPEED_THRESHOLD;

  if (isStill) {
    return PLAYER_OXYGEN_STILL_DRAIN_MULTIPLIER;
  }

  return playerOxygenShiftHeld && !isPlayerOxygenSprintLocked()
    ? PLAYER_OXYGEN_SHIFT_MOVING_DRAIN_MULTIPLIER
    : PLAYER_OXYGEN_MOVING_DRAIN_MULTIPLIER;
};

const tickPlayerOxygen = () => {
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  if (!Number.isFinite(playerOxygenTickLastTimestamp) || playerOxygenTickLastTimestamp <= 0) {
    playerOxygenTickLastTimestamp = now;
    return;
  }

  const elapsedSeconds = Math.max(
    0,
    (now - playerOxygenTickLastTimestamp) / 1000
  );
  playerOxygenTickLastTimestamp = now;

  if (elapsedSeconds <= 0) {
    return;
  }

  const nowDate = Date.now();
  const chamberPenaltyActive = syncPlayerOxygenChamberPenaltyState({
    now: nowDate,
  });
  if (chamberPenaltyActive) {
    applyPlayerOxygenPressureEffects({ now: nowDate, silent: true });
    return;
  }

  if (!isPlayerOnSurfaceForOxygenDrain()) {
    samplePlayerOxygenMovementSpeed(now);
    if (playerOxygenCurrentDrainMultiplier !== 0) {
      playerOxygenCurrentDrainMultiplier = 0;
      updatePlayerOxygenUi();
    }
    if (playerOxygenPercent < getPlayerOxygenMaxPercent()) {
      const regenAmount = elapsedSeconds * getPlayerOxygenRegenPerSecond();
      const nextPercent = Math.min(
        getPlayerOxygenMaxPercent(),
        playerOxygenPercent + regenAmount
      );
      if (Math.abs(nextPercent - playerOxygenPercent) > 1e-6) {
        playerOxygenPercent = nextPercent;
        updatePlayerOxygenUi();
        schedulePersistPlayerOxygen();
      }
    }
    applyPlayerOxygenPressureEffects({ now, silent: true });
    return;
  }

  applyPlayerOxygenPressureEffects({ now });

  if (playerOxygenPercent <= 0) {
    if (playerOxygenCurrentDrainMultiplier !== 0) {
      playerOxygenCurrentDrainMultiplier = 0;
      updatePlayerOxygenUi();
    }
    triggerPlayerOxygenEmergencyRespawn(now);
    return;
  }

  const drainMultiplier = resolvePlayerOxygenDrainMultiplier(now);
  if (Math.abs(playerOxygenCurrentDrainMultiplier - drainMultiplier) > 1e-6) {
    playerOxygenCurrentDrainMultiplier = drainMultiplier;
    updatePlayerOxygenUi();
  }
  const drainAmount =
    elapsedSeconds * getPlayerOxygenDrainPerSecond() * drainMultiplier;
  const nextPercent = Math.max(0, playerOxygenPercent - drainAmount);
  if (Math.abs(nextPercent - playerOxygenPercent) > 1e-6) {
    playerOxygenPercent = nextPercent;
    updatePlayerOxygenUi();
    schedulePersistPlayerOxygen();
    applyPlayerOxygenPressureEffects({ now });
  }

  if (playerOxygenPercent <= 0) {
    triggerPlayerOxygenEmergencyRespawn(now);
  }
};

function handlePlayerOxygenDiggingActivity(event) {
  if (!(event instanceof CustomEvent)) {
    return;
  }

  if (event.detail?.success !== true) {
    return;
  }

  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  playerOxygenLastDiggingActivityAt = now;
  const actionDurationSeconds = Number(event.detail?.actionDuration);
  const holdDurationMs =
    Number.isFinite(actionDurationSeconds) && actionDurationSeconds > 0
      ? actionDurationSeconds * 1000 + PLAYER_OXYGEN_DIGGING_ACTIVITY_BUFFER_MS
      : PLAYER_OXYGEN_DIGGING_ACTIVITY_WINDOW_MS;
  playerOxygenDiggingActiveUntil = Math.max(
    playerOxygenDiggingActiveUntil,
    now + holdDurationMs
  );
}

function clearPlayerOxygenDiggingActivity() {
  playerOxygenLastDiggingActivityAt = 0;
  playerOxygenDiggingActiveUntil = 0;
}

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

const hideRenderingErrorMessage = () => {
  if (!renderingErrorBanner) {
    return;
  }

  renderingErrorBanner.setAttribute("hidden", "");

  if (renderingErrorDetail) {
    renderingErrorDetail.textContent = "";
  }
};

const showRenderingErrorMessage = (message) => {
  const defaultMessage =
    "WebGL is unavailable. Enable hardware acceleration or try another browser.";

  if (renderingErrorBanner) {
    renderingErrorBanner.removeAttribute("hidden");

    if (renderingErrorDetail) {
      renderingErrorDetail.textContent = message || defaultMessage;
    }
  } else {
    window.alert(message || defaultMessage);
  }
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
    !(settingsPanelsContainer instanceof HTMLElement) ||
    !(settingsTrigger instanceof HTMLElement)
  ) {
    return;
  }

  const nextState = Boolean(isOpen);
  settingsMenu.dataset.open = nextState ? "true" : "false";
  settingsPanelsContainer.hidden = !nextState;
  settingsPanel.hidden = !nextState;
  settingsTrigger.setAttribute("aria-expanded", String(nextState));

  if (!nextState) {
    setStarSettingsExpanded(false);
    setReflectionSettingsExpanded(false);
    setSpeedSettingsExpanded(false);
    setJumpSettingsExpanded(false);
    setViewSettingsExpanded(false);
    setLiftSettingsExpanded(false);
    setGodModeSettingsExpanded(false);
  }
};

const setStarSettingsExpanded = (isExpanded) => {
  const nextState = Boolean(isExpanded);
  const labelText = nextState ? "Hide options" : "Options";

  if (starSettingsSubmenu instanceof HTMLElement) {
    starSettingsSubmenu.hidden = !nextState;
    starSettingsSubmenu.dataset.expanded = nextState ? "true" : "false";
  }

  if (settingsMenu instanceof HTMLElement) {
    settingsMenu.classList.toggle("settings-menu--stars-open", nextState);
  }

  if (starSettingsToggleButton instanceof HTMLButtonElement) {
    starSettingsToggleButton.setAttribute("aria-expanded", String(nextState));
    starSettingsToggleButton.setAttribute("aria-label", labelText);
  }

  if (starSettingsToggleLabel instanceof HTMLElement) {
    starSettingsToggleLabel.textContent = labelText;
  }
};

const setSpeedSettingsExpanded = (isExpanded) => {
  const nextState = Boolean(isExpanded);

  if (speedSettingsSubmenu instanceof HTMLElement) {
    speedSettingsSubmenu.hidden = !nextState;
    speedSettingsSubmenu.dataset.expanded = nextState ? "true" : "false";
  }

  if (speedSettingsToggleButton instanceof HTMLButtonElement) {
    speedSettingsToggleButton.setAttribute("aria-expanded", String(nextState));
  }
};

const setReflectionSettingsExpanded = (isExpanded) => {
  const nextState = Boolean(isExpanded);

  if (reflectionSettingsSubmenu instanceof HTMLElement) {
    reflectionSettingsSubmenu.hidden = !nextState;
    reflectionSettingsSubmenu.dataset.expanded = nextState ? "true" : "false";
  }

  if (reflectionSettingsToggleButton instanceof HTMLButtonElement) {
    reflectionSettingsToggleButton.setAttribute("aria-expanded", String(nextState));
  }
};

const setJumpSettingsExpanded = (isExpanded) => {
  const nextState = Boolean(isExpanded);

  if (jumpSettingsSubmenu instanceof HTMLElement) {
    jumpSettingsSubmenu.hidden = !nextState;
    jumpSettingsSubmenu.dataset.expanded = nextState ? "true" : "false";
  }

  if (jumpSettingsToggleButton instanceof HTMLButtonElement) {
    jumpSettingsToggleButton.setAttribute("aria-expanded", String(nextState));
  }
};

const setViewSettingsExpanded = (isExpanded) => {
  const nextState = Boolean(isExpanded);

  if (viewSettingsSubmenu instanceof HTMLElement) {
    viewSettingsSubmenu.hidden = !nextState;
    viewSettingsSubmenu.dataset.expanded = nextState ? "true" : "false";
  }

  if (viewSettingsToggleButton instanceof HTMLButtonElement) {
    viewSettingsToggleButton.setAttribute("aria-expanded", String(nextState));
  }
};

const setLiftSettingsExpanded = (isExpanded) => {
  const nextState = Boolean(isExpanded);

  if (liftSettingsSubmenu instanceof HTMLElement) {
    liftSettingsSubmenu.hidden = !nextState;
    liftSettingsSubmenu.dataset.expanded = nextState ? "true" : "false";
  }

  if (liftSettingsToggleButton instanceof HTMLButtonElement) {
    liftSettingsToggleButton.setAttribute("aria-expanded", String(nextState));
  }
};

const setGodModeSettingsExpanded = (isExpanded) => {
  const nextState = Boolean(isExpanded);

  if (godModeSettingsSubmenu instanceof HTMLElement) {
    godModeSettingsSubmenu.hidden = !nextState;
    godModeSettingsSubmenu.dataset.expanded = nextState ? "true" : "false";
  }

  if (godModeSettingsToggleButton instanceof HTMLButtonElement) {
    godModeSettingsToggleButton.setAttribute("aria-expanded", String(nextState));
  }
};

const populateGodModeElementSelect = () => {
  if (!(godModeElementSelect instanceof HTMLSelectElement)) {
    return;
  }

  if (godModeElementSelect.options.length > 0) {
    return;
  }

  const elements = PERIODIC_ELEMENTS.filter((element) => {
    const symbol = typeof element?.symbol === "string" ? element.symbol.trim() : "";
    const name = typeof element?.name === "string" ? element.name.trim() : "";
    return symbol !== "" && name !== "";
  }).sort((a, b) => {
    const leftNumber = Number.isFinite(a?.number) ? a.number : Number.MAX_SAFE_INTEGER;
    const rightNumber = Number.isFinite(b?.number) ? b.number : Number.MAX_SAFE_INTEGER;
    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    return String(a.symbol).localeCompare(String(b.symbol));
  });

  const fragment = document.createDocumentFragment();
  elements.forEach((element) => {
    const option = document.createElement("option");
    const symbol = element.symbol.trim();
    const name = element.name.trim();
    option.value = symbol;
    option.textContent = Number.isFinite(element?.number)
      ? `${symbol} (${name}) • #${element.number}`
      : `${symbol} (${name})`;
    fragment.appendChild(option);
  });

  godModeElementSelect.appendChild(fragment);
  if (godModeElementSelect.options.length > 0) {
    godModeElementSelect.selectedIndex = 0;
  }
};

setSettingsMenuOpen(false);
setStarSettingsExpanded(false);
setReflectionSettingsExpanded(false);
setSpeedSettingsExpanded(false);
setJumpSettingsExpanded(false);
setViewSettingsExpanded(false);
setLiftSettingsExpanded(false);
setGodModeSettingsExpanded(false);
populateGodModeElementSelect();

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

if (starSettingsToggleButton instanceof HTMLButtonElement) {
  starSettingsToggleButton.addEventListener("click", () => {
    const isExpanded =
      starSettingsSubmenu instanceof HTMLElement && starSettingsSubmenu.hidden !== true;

    if (!isExpanded) {
      setReflectionSettingsExpanded(false);
      setSpeedSettingsExpanded(false);
      setJumpSettingsExpanded(false);
      setViewSettingsExpanded(false);
      setLiftSettingsExpanded(false);
      setGodModeSettingsExpanded(false);
    }

    setStarSettingsExpanded(!isExpanded);
  });
}

if (reflectionSettingsToggleButton instanceof HTMLButtonElement) {
  reflectionSettingsToggleButton.addEventListener("click", () => {
    const isExpanded =
      reflectionSettingsSubmenu instanceof HTMLElement &&
      reflectionSettingsSubmenu.hidden !== true;

    if (!isExpanded) {
      setStarSettingsExpanded(false);
      setSpeedSettingsExpanded(false);
      setJumpSettingsExpanded(false);
      setViewSettingsExpanded(false);
      setLiftSettingsExpanded(false);
      setGodModeSettingsExpanded(false);
    }

    setReflectionSettingsExpanded(!isExpanded);
  });
}

if (speedSettingsToggleButton instanceof HTMLButtonElement) {
  speedSettingsToggleButton.addEventListener("click", () => {
    const isExpanded =
      speedSettingsSubmenu instanceof HTMLElement &&
      speedSettingsSubmenu.hidden !== true;

    if (!isExpanded) {
      setStarSettingsExpanded(false);
      setReflectionSettingsExpanded(false);
      setJumpSettingsExpanded(false);
      setViewSettingsExpanded(false);
      setLiftSettingsExpanded(false);
      setGodModeSettingsExpanded(false);
    }

    setSpeedSettingsExpanded(!isExpanded);
  });
}

if (jumpSettingsToggleButton instanceof HTMLButtonElement) {
  jumpSettingsToggleButton.addEventListener("click", () => {
    const isExpanded =
      jumpSettingsSubmenu instanceof HTMLElement &&
      jumpSettingsSubmenu.hidden !== true;

    if (!isExpanded) {
      setStarSettingsExpanded(false);
      setReflectionSettingsExpanded(false);
      setSpeedSettingsExpanded(false);
      setViewSettingsExpanded(false);
      setLiftSettingsExpanded(false);
      setGodModeSettingsExpanded(false);
    }

    setJumpSettingsExpanded(!isExpanded);
  });
}

if (viewSettingsToggleButton instanceof HTMLButtonElement) {
  viewSettingsToggleButton.addEventListener("click", () => {
    const isExpanded =
      viewSettingsSubmenu instanceof HTMLElement &&
      viewSettingsSubmenu.hidden !== true;

    if (!isExpanded) {
      setStarSettingsExpanded(false);
      setReflectionSettingsExpanded(false);
      setSpeedSettingsExpanded(false);
      setJumpSettingsExpanded(false);
      setLiftSettingsExpanded(false);
      setGodModeSettingsExpanded(false);
    }

    setViewSettingsExpanded(!isExpanded);
  });
}

if (liftSettingsToggleButton instanceof HTMLButtonElement) {
  liftSettingsToggleButton.addEventListener("click", () => {
    const isExpanded =
      liftSettingsSubmenu instanceof HTMLElement &&
      liftSettingsSubmenu.hidden !== true;

    if (!isExpanded) {
      setStarSettingsExpanded(false);
      setReflectionSettingsExpanded(false);
      setSpeedSettingsExpanded(false);
      setJumpSettingsExpanded(false);
      setViewSettingsExpanded(false);
      setGodModeSettingsExpanded(false);
    }

    setLiftSettingsExpanded(!isExpanded);
  });
}

if (godModeSettingsToggleButton instanceof HTMLButtonElement) {
  godModeSettingsToggleButton.addEventListener("click", () => {
    const isExpanded =
      godModeSettingsSubmenu instanceof HTMLElement &&
      godModeSettingsSubmenu.hidden !== true;

    if (!isExpanded) {
      setStarSettingsExpanded(false);
      setReflectionSettingsExpanded(false);
      setSpeedSettingsExpanded(false);
      setJumpSettingsExpanded(false);
      setViewSettingsExpanded(false);
      setLiftSettingsExpanded(false);
    }

    setGodModeSettingsExpanded(!isExpanded);
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

const setStarSettingsAvailability = (enabled) => {
  const shouldShow = Boolean(enabled);

  starSettingsSubmenu?.classList.toggle(
    "settings-menu__submenu--disabled",
    !shouldShow
  );
  starSettingsSubmenu?.setAttribute("aria-disabled", String(!shouldShow));

  starSettingsInputs.forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.disabled = !shouldShow;
    }
  });
};

const applyStarsUiState = () => {
  const shouldShowStars = currentSettings?.showStars !== false;

  if (starsToggle instanceof HTMLInputElement) {
    starsToggle.checked = shouldShowStars;
    starsToggle.setAttribute("aria-pressed", String(shouldShowStars));
  }

  setStarSettingsAvailability(shouldShowStars);
  sceneController?.setStarsEnabled?.(shouldShowStars);
};

applyStarsUiState();

const setReflectionScaleAvailability = (enabled) => {
  const shouldEnable = Boolean(enabled);

  reflectionSettingsSubmenu?.classList.toggle(
    "settings-menu__submenu--disabled",
    !shouldEnable
  );
  reflectionSettingsSubmenu?.setAttribute("aria-disabled", String(!shouldEnable));

  reflectionSettingInputs.forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.disabled = !shouldEnable;
    }
  });
};

const setRangeInputValue = (input, value) => {
  if (input instanceof HTMLInputElement && Number.isFinite(value)) {
    const numericValue = Number(value);
    const currentMin = Number.parseFloat(input.min);
    const currentMax = Number.parseFloat(input.max);

    if (Number.isFinite(currentMin) && numericValue < currentMin) {
      input.min = String(numericValue);
    }

    if (Number.isFinite(currentMax) && numericValue > currentMax) {
      input.max = String(numericValue);
    }

    input.value = String(numericValue);
  }
};

const setNumberInputValue = (input, value) => {
  if (input instanceof HTMLInputElement && Number.isFinite(value)) {
    input.value = String(value);
  }
};

const setValueLabel = (element, value) => {
  if (element instanceof HTMLElement) {
    element.textContent = value;
  }
};

const formatPercentage = (value) => `${Math.round(Number(value ?? 0) * 100)}%`;
const formatGmtOffset = (value) => {
  const numericValue = Number.isFinite(value) ? value : 0;
  const clamped = Math.max(-12, Math.min(14, numericValue));
  const displayValue = Number.isInteger(clamped)
    ? clamped.toFixed(0)
    : clamped.toFixed(1);

  return `${clamped >= 0 ? "+" : ""}${displayValue}h`;
};

const formatSpeedMultiplier = (value) => {
  const numericValue = Number.isFinite(value) ? value : 1;
  const clamped = Math.max(1, Math.min(10, numericValue));
  const displayValue = Number.isInteger(clamped)
    ? clamped.toFixed(0)
    : clamped.toFixed(1);

  return `${displayValue}x`;
};

const formatJumpMultiplier = (value) => {
  const numericValue = Number.isFinite(value) ? value : 1;
  const displayValue = Number.isInteger(numericValue)
    ? numericValue.toFixed(0)
    : numericValue.toFixed(1);

  return `${displayValue}x`;
};

const formatJumpApexValue = (value) => {
  const numericValue = Number.isFinite(value) ? value : 0;
  const displayValue = numericValue.toFixed(2);
  return displayValue.replace(/\.?0+$/, "");
};

const formatViewDistance = (value) => {
  const numericValue = Number.isFinite(value) ? value : 0;
  const displayValue = numericValue.toFixed(2);
  return `${displayValue.replace(/\.?0+$/, "")}x`;
};

const applyReflectionSettingsUiState = () => {
  const reflectionsEnabled = currentSettings?.reflectionsEnabled !== false;
  const reflectorResolutionScale = Number(
    currentSettings?.reflectorResolutionScale ?? 1
  );

  if (reflectionsToggle instanceof HTMLInputElement) {
    reflectionsToggle.checked = reflectionsEnabled;
    reflectionsToggle.setAttribute("aria-pressed", String(reflectionsEnabled));
  }

  setReflectionScaleAvailability(reflectionsEnabled);
  setRangeInputValue(reflectionScaleRange, reflectorResolutionScale);
  setNumberInputValue(reflectionScaleInput, reflectorResolutionScale);
  setValueLabel(
    reflectionScaleValue,
    formatPercentage(reflectorResolutionScale)
  );

  sceneController?.setReflectionSettings?.({
    reflectionsEnabled,
    reflectorResolutionScale,
  });
};

applyReflectionSettingsUiState();

const getSelectedGodModeElement = () => {
  if (!(godModeElementSelect instanceof HTMLSelectElement)) {
    return null;
  }

  const selectedSymbol = String(godModeElementSelect.value ?? "").trim().toLowerCase();
  if (!selectedSymbol) {
    return null;
  }

  return (
    PERIODIC_ELEMENTS.find((element) => {
      const symbol = typeof element?.symbol === "string" ? element.symbol.trim() : "";
      return symbol.toLowerCase() === selectedSymbol;
    }) ?? null
  );
};

const setGodModeElementGrantAvailability = (enabled) => {
  const shouldEnable = Boolean(enabled);

  godModeSettingsSubmenu?.classList.toggle("settings-menu__submenu--disabled", !shouldEnable);
  godModeSettingsSubmenu?.setAttribute("aria-disabled", String(!shouldEnable));

  if (godModeElementSelect instanceof HTMLSelectElement) {
    godModeElementSelect.disabled = !shouldEnable;
  }

  if (godModeAddElementButton instanceof HTMLButtonElement) {
    godModeAddElementButton.disabled = !shouldEnable;
  }

  if (godModeAddAllElementsButton instanceof HTMLButtonElement) {
    godModeAddAllElementsButton.disabled = !shouldEnable;
  }
};

const grantGodModeElementToInventory = () => {
  if (!Boolean(currentSettings?.godMode)) {
    showTerminalToast({
      title: "Enable God mode",
      description: "Turn on God mode first to use this option.",
    });
    return false;
  }

  const selectedElement = getSelectedGodModeElement();
  if (!selectedElement) {
    showTerminalToast({
      title: "No element selected",
      description: "Choose an element type in God mode options.",
    });
    return false;
  }

  const added = recordInventoryResource({
    source: "god-mode",
    element: selectedElement,
  });
  const elementLabel = `${selectedElement.symbol} (${selectedElement.name})`;

  if (!added) {
    showTerminalToast({
      title: "Inventory full",
      description: `${elementLabel} could not be added.`,
    });
    return false;
  }

  showTerminalToast({
    title: "God mode grant",
    description: `${elementLabel} added to inventory.`,
  });
  return true;
};

const grantAllGodModeElementsToInventory = () => {
  if (!Boolean(currentSettings?.godMode)) {
    showTerminalToast({
      title: "Enable God mode",
      description: "Turn on God mode first to use this option.",
    });
    return false;
  }

  const uniqueElements = new Map();
  PERIODIC_ELEMENTS.forEach((element) => {
    const symbol = typeof element?.symbol === "string" ? element.symbol.trim() : "";
    if (!symbol) {
      return;
    }
    const key = symbol.toLowerCase();
    if (uniqueElements.has(key)) {
      return;
    }
    uniqueElements.set(key, element);
  });

  const elements = Array.from(uniqueElements.values());
  if (elements.length <= 0) {
    showTerminalToast({
      title: "No element data",
      description: "Unable to grant elements right now.",
    });
    return false;
  }

  let addedCount = 0;
  let blockedCount = 0;
  elements.forEach((element) => {
    const added = recordInventoryResource({
      source: "god-mode",
      element,
    });
    if (added) {
      addedCount += 1;
    } else {
      blockedCount += 1;
    }
  });

  if (addedCount <= 0) {
    showTerminalToast({
      title: "Inventory full",
      description: "No additional elements could be added.",
    });
    return false;
  }

  showTerminalToast({
    title: "God mode grant",
    description:
      blockedCount > 0
        ? `Added ${addedCount} element types. ${blockedCount} could not be added.`
        : `Added all ${addedCount} element types to inventory.`,
  });
  return true;
};

const applyGodModeUiState = () => {
  const godModeEnabled = Boolean(currentSettings?.godMode);

  if (godModeToggle instanceof HTMLInputElement) {
    godModeToggle.checked = godModeEnabled;
    godModeToggle.setAttribute("aria-pressed", String(godModeEnabled));
  }

  setGodModeElementGrantAvailability(godModeEnabled);
  sceneController?.setGodMode?.(godModeEnabled);
};

applyGodModeUiState();

const applyLiftDoorFilterUiState = () => {
  const liftDoorFiltering = currentSettings?.liftDoorFiltering !== false;

  if (liftDoorFilterToggle instanceof HTMLInputElement) {
    liftDoorFilterToggle.checked = liftDoorFiltering;
    liftDoorFilterToggle.setAttribute("aria-pressed", String(liftDoorFiltering));
  }

  renderLiftAreaSettings();

  if (liftModalActive) {
    renderLiftModalFloors();
  }
};

const applyStarVisualUiState = () => {
  const starSize = Number(currentSettings?.starSize ?? 1);
  const starDensity = Number(currentSettings?.starDensity ?? 1);
  const starOpacity = Number(currentSettings?.starOpacity ?? 1);
  const skyExtent = Number(currentSettings?.skyExtent ?? 1);
  const skyHeight = Number(currentSettings?.skyDomeHeight ?? 1);
  const starsFollowPlayer = currentSettings?.starFollowPlayer !== false;

  if (starFollowToggle instanceof HTMLInputElement) {
    starFollowToggle.checked = starsFollowPlayer;
    starFollowToggle.setAttribute("aria-pressed", String(starsFollowPlayer));
  }
  setRangeInputValue(starSizeRange, starSize);
  setRangeInputValue(starDensityRange, starDensity);
  setRangeInputValue(starOpacityRange, starOpacity);
  setRangeInputValue(skyExtentRange, skyExtent);
  setRangeInputValue(skyHeightRange, skyHeight);
  setNumberInputValue(starSizeInput, starSize);
  setNumberInputValue(starDensityInput, starDensity);
  setNumberInputValue(starOpacityInput, starOpacity);
  setNumberInputValue(skyExtentInput, skyExtent);
  setNumberInputValue(skyHeightInput, skyHeight);

  setValueLabel(starSizeValue, formatPercentage(starSize));
  setValueLabel(starDensityValue, formatPercentage(starDensity));
  setValueLabel(starOpacityValue, formatPercentage(starOpacity));
  setValueLabel(skyExtentValue, formatPercentage(skyExtent));
  setValueLabel(skyHeightValue, formatPercentage(skyHeight));

  sceneController?.setStarVisualSettings?.({
    starSize,
    starDensity,
    starOpacity,
    skyExtent,
    skyDomeHeight: skyHeight,
    starFollowPlayer: starsFollowPlayer,
  });
};

applyStarVisualUiState();

const applyTimeSettingsUiState = () => {
  const timeZoneOffsetHours = Number(currentSettings?.timeZoneOffsetHours ?? 0);

  setRangeInputValue(timeOffsetRange, timeZoneOffsetHours);
  setNumberInputValue(timeOffsetInput, timeZoneOffsetHours);
  setValueLabel(timeOffsetValue, formatGmtOffset(timeZoneOffsetHours));

  sceneController?.setTimeSettings?.({ timeZoneOffsetHours });
};

applyTimeSettingsUiState();

const applySpeedSettingsUiState = () => {
  const speedMultiplier = Number(currentSettings?.playerSpeedMultiplier ?? 1);
  const totalSpeedMultiplier = speedMultiplier * getCostumeMoveSpeedMultiplier();
  const speedLabel =
    Math.abs(totalSpeedMultiplier - speedMultiplier) > 1e-6
      ? `${formatSpeedMultiplier(totalSpeedMultiplier)} total`
      : formatSpeedMultiplier(speedMultiplier);

  setRangeInputValue(playerSpeedRange, speedMultiplier);
  setNumberInputValue(playerSpeedInput, speedMultiplier);
  setValueLabel(playerSpeedValue, speedLabel);
  setValueLabel(speedSummaryValue, speedLabel);

  sceneController?.setSpeedSettings?.({
    playerSpeedMultiplier: totalSpeedMultiplier,
  });
};

const applyJumpSettingsUiState = () => {
  const jumpMultiplier = Number(currentSettings?.playerJumpMultiplier ?? 1);
  const jumpApexSmoothing = Number(currentSettings?.jumpApexSmoothing ?? 6);
  const jumpApexVelocity = Number(currentSettings?.jumpApexVelocity ?? 1.4);
  const totalJumpMultiplier = jumpMultiplier * getCostumeJumpMultiplier();
  const jumpLabel =
    Math.abs(totalJumpMultiplier - jumpMultiplier) > 1e-6
      ? `${formatJumpMultiplier(totalJumpMultiplier)} total`
      : formatJumpMultiplier(jumpMultiplier);

  setRangeInputValue(playerJumpRange, jumpMultiplier);
  setNumberInputValue(playerJumpInput, jumpMultiplier);
  setRangeInputValue(jumpApexSmoothingRange, jumpApexSmoothing);
  setNumberInputValue(jumpApexSmoothingInput, jumpApexSmoothing);
  setRangeInputValue(jumpApexVelocityRange, jumpApexVelocity);
  setNumberInputValue(jumpApexVelocityInput, jumpApexVelocity);
  setValueLabel(playerJumpValue, jumpLabel);
  setValueLabel(jumpSummaryValue, jumpLabel);
  setValueLabel(jumpApexSmoothingValue, formatJumpApexValue(jumpApexSmoothing));
  setValueLabel(jumpApexVelocityValue, formatJumpApexValue(jumpApexVelocity));

  sceneController?.setJumpSettings?.({
    playerJumpMultiplier: totalJumpMultiplier,
    jumpApexSmoothing,
    jumpApexVelocity,
  });
};

const applyCostumeResearchBonuses = ({
  refreshResearch = true,
  persistOxygen = true,
  silentPressure = true,
} = {}) => {
  playerOxygenPercent = clampPlayerOxygenPercent(playerOxygenPercent);
  updatePlayerOxygenUi();
  applyPlayerOxygenPressureEffects({
    now: Date.now(),
    silent: silentPressure,
    forceUi: true,
  });
  applySpeedSettingsUiState();
  applyJumpSettingsUiState();
  if (persistOxygen) {
    schedulePersistPlayerOxygen({ force: true });
  }
  if (refreshResearch) {
    refreshResearchModalIfOpen();
  }
};

const applyViewSettingsUiState = () => {
  const viewDistance = Number(currentSettings?.viewDistance ?? 0.2);

  setRangeInputValue(viewDistanceRange, viewDistance);
  setNumberInputValue(viewDistanceInput, viewDistance);
  setValueLabel(viewDistanceValue, formatViewDistance(viewDistance));
  setValueLabel(viewSummaryValue, formatViewDistance(viewDistance));

  sceneController?.setViewSettings?.({
    viewDistance,
    force: true,
  });
};

const applyThirdPersonUiState = () => {
  const thirdPersonEnabled = currentSettings?.thirdPersonCamera === true;

  if (thirdPersonToggle instanceof HTMLInputElement) {
    thirdPersonToggle.checked = thirdPersonEnabled;
    thirdPersonToggle.setAttribute("aria-pressed", String(thirdPersonEnabled));
  }

  sceneController?.setCameraViewMode?.({
    thirdPersonEnabled,
  });
};

applyViewSettingsUiState();
applyThirdPersonUiState();

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
const inventoryItemsList = inventoryPanel?.querySelector(
  "[data-inventory-items-list]"
);
const inventoryItemsEmptyState = inventoryPanel?.querySelector(
  "[data-inventory-items-empty]"
);
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
const inventoryDropConfirm = document.querySelector(
  "[data-inventory-drop-confirm]"
);
const inventoryDropConfirmTitle = inventoryDropConfirm?.querySelector(
  "[data-inventory-drop-title]"
);
const inventoryDropConfirmMessage = inventoryDropConfirm?.querySelector(
  "[data-inventory-drop-message]"
);
const inventoryDropConfirmDetail = inventoryDropConfirm?.querySelector(
  "[data-inventory-drop-detail]"
);
const inventoryDropConfirmConfirmButton = inventoryDropConfirm?.querySelector(
  "[data-inventory-drop-confirm-button]"
);
const inventoryDropConfirmCancelButton = inventoryDropConfirm?.querySelector(
  "[data-inventory-drop-cancel-button]"
);
const inventoryDropConfirmCloseButton = inventoryDropConfirm?.querySelector(
  "[data-inventory-drop-close]"
);
const inventoryDropConfirmBackdrop = inventoryDropConfirm?.querySelector(
  "[data-inventory-drop-backdrop]"
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
const droneCargoList = inventoryPanel?.querySelector("[data-drone-cargo-list]");
const droneCargoEmptyState = inventoryPanel?.querySelector(
  "[data-drone-cargo-empty]"
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
  "drone-customization": document.getElementById(
    "quick-access-modal-drone-customization"
  ),
  "costume-customization": document.getElementById(
    "quick-access-modal-costume-customization"
  ),
  "storage-box": document.getElementById("quick-access-modal-storage-box"),
  "crafting-table": document.getElementById("quick-access-modal-crafting-table"),
  news: document.getElementById("quick-access-modal-news"),
  weather: document.getElementById("quick-access-modal-weather"),
  missions: document.getElementById("quick-access-modal-missions"),
  research: document.getElementById("quick-access-modal-research"),
  market: document.getElementById("quick-access-modal-market"),
  map: document.getElementById("quick-access-modal-map"),
};

const DIGGER_QUICK_SLOT_ID = "digger";
const DRONE_QUICK_SLOT_ID = "drone-miner";
const DRONE_ALLOWED_LIFT_FLOOR_IDS = new Set(["operations-exterior"]);
const STATION_BUILDER_QUICK_SLOT_ID = "arc-welder";
const INVENTORY_QUICK_SLOT_ID = "inventory";

const quickSlotDefinitions = [
  {
    id: DIGGER_QUICK_SLOT_ID,
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
    label: "Geo Visor",
    description: "Visor tuned for precision terrain analysis.",
    activateOnly: true,
    icon: "🥽",
  },
  {
    id: STATION_BUILDER_QUICK_SLOT_ID,
    label: "Station Builder",
    description: "Fuses structural panels in the field.",
  },
  {
    id: INVENTORY_QUICK_SLOT_ID,
    label: "Inventory",
    description: "Open or close the inventory panel.",
    activateOnly: true,
    icon: "🎒",
  },
];

const GEO_VISOR_SLOT_IDS = new Set(["photon-cutter"]);
const GEO_VISOR_PANEL_SLOT_ID = "photon-cutter";
const GEO_VISOR_BATTERY_RECHARGE_MS = 2 * 60 * 1000;
const GEO_VISOR_BATTERY_UPDATE_INTERVAL_MS = 200;
const GEO_VISOR_BATTERY_PERSIST_INTERVAL_MS = 1000;
const GEO_SCAN_MAX_HP = Math.max(
  1,
  ...(Array.isArray(OUTSIDE_TERRAIN_TYPES)
    ? OUTSIDE_TERRAIN_TYPES.map((terrain) =>
        Number.isFinite(terrain?.hp) ? terrain.hp : 0
      )
    : [1])
);
const terrainLifeByCell = new Map();
let progressResetInProgress = false;
const applyStoredTerrainLife = () => {
  const storedTerrainLife = loadStoredTerrainLife();

  if (!(storedTerrainLife instanceof Map)) {
    return;
  }

  storedTerrainLife.forEach((value, cellKey) => {
    if (typeof cellKey !== "string" || !cellKey.startsWith("cell:")) {
      return;
    }

    if (Number.isFinite(value) && value >= 0) {
      terrainLifeByCell.set(cellKey, value);
    }
  });
};
let persistTerrainLifeTimeoutId = 0;
const schedulePersistTerrainLife = () => {
  if (progressResetInProgress) {
    return;
  }

  if (persistTerrainLifeTimeoutId) {
    window.clearTimeout(persistTerrainLifeTimeoutId);
  }

  persistTerrainLifeTimeoutId = window.setTimeout(() => {
    persistTerrainLifeTimeoutId = 0;
    persistTerrainLifeState(terrainLifeByCell);
  }, 100);
};
applyStoredTerrainLife();
const getTerrainLifeValue = (terrain, tileIndex) => {
  if (!terrain?.id) {
    return 0;
  }

  const maxLife = Number.isFinite(terrain?.hp) ? terrain.hp : 0;
  const cellKey = getTerrainLifeKey(tileIndex);
  if (!cellKey) {
    return maxLife;
  }

  const storedLife = terrainLifeByCell.get(cellKey);
  if (Number.isFinite(storedLife)) {
    const normalizedLife = Math.max(0, Math.min(maxLife, storedLife));
    if (normalizedLife !== storedLife) {
      terrainLifeByCell.set(cellKey, normalizedLife);
    }
    return normalizedLife;
  }

  terrainLifeByCell.set(cellKey, maxLife);
  return maxLife;
};
const decreaseTerrainLife = (terrainId, tileIndex, amount = 1) => {
  if (!terrainId) {
    return 0;
  }

  const cellKey = getTerrainLifeKey(tileIndex);
  if (!cellKey) {
    return 0;
  }

  const terrain = getOutsideTerrainById(terrainId);
  const currentLife = getTerrainLifeValue(terrain, tileIndex);
  const drain = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const nextLife = Math.max(0, currentLife - drain);

  terrainLifeByCell.set(cellKey, nextLife);
  schedulePersistTerrainLife();
  return nextLife;
};

const quickSlotState = {
  slots: quickSlotDefinitions,
  selectedIndex: 0,
  diggerActive: true,
};

const getQuickSlotByIndex = (index) => quickSlotState.slots[index] ?? null;
const getSelectedQuickSlot = () => getQuickSlotByIndex(quickSlotState.selectedIndex);
const isDiggerQuickSlot = (slot) => slot?.id === DIGGER_QUICK_SLOT_ID;
const isDiggerToolEnabled = () =>
  isDiggerQuickSlot(getSelectedQuickSlot()) && quickSlotState.diggerActive;

const geoVisorState = {
  activeSlotId: null,
};
const clampGeoVisorBatteryLevel = (value, fallback = 1) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numericValue));
};
const initialGeoVisorTimestamp = Date.now();
const storedGeoVisorState = loadStoredGeoVisorState();
const storedGeoVisorLevel = clampGeoVisorBatteryLevel(
  storedGeoVisorState?.level,
  1
);
const storedGeoVisorUpdatedAt = Number.isFinite(storedGeoVisorState?.updatedAt)
  ? storedGeoVisorState.updatedAt
  : null;
const geoVisorElapsedSinceStored =
  Number.isFinite(storedGeoVisorUpdatedAt) &&
  storedGeoVisorUpdatedAt <= initialGeoVisorTimestamp
    ? initialGeoVisorTimestamp - storedGeoVisorUpdatedAt
    : 0;
const initialGeoVisorBatteryLevel = clampGeoVisorBatteryLevel(
  storedGeoVisorLevel + geoVisorElapsedSinceStored / GEO_VISOR_BATTERY_RECHARGE_MS,
  1
);
const geoVisorBatteryState = {
  level: initialGeoVisorBatteryLevel,
  lastUpdate: initialGeoVisorTimestamp,
};

const quickSlotActivationTimeouts = new Map();
let persistGeoVisorBatteryTimeoutId = 0;
let geoVisorBatteryPersistenceEnabled = true;
const QUICK_SLOT_ACTIVATION_EFFECT_DURATION = 900;

  const GRAMS_PER_KILOGRAM = 1000;
  const DEFAULT_ELEMENT_WEIGHT_GRAMS = 1;
  const INVENTORY_CAPACITY_GRAMS = 200 * GRAMS_PER_KILOGRAM;
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
  const DRONE_RETURN_STALL_TIMEOUT_MS = 30000;
  const DRONE_STALL_CHECK_INTERVAL_MS = 2000;
  const DRONE_MINING_SOUND_UPDATE_INTERVAL_MS = 150;
  const DRONE_STATUS_UI_UPDATE_INTERVAL_MS = 1000;
  const DRONE_MINING_SOUND_MAX_DISTANCE_TILES = 3;
  const DRONE_MINING_SOUND_FALLBACK_TILE_SIZE = 15;
  const DRONE_MINING_SOUND_MAX_VOLUME = 1;
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
  returnSessionStartMs: 0,
  autoRefillEnabled: false,
};

let droneRelaunchPendingAfterRestore = false;
let guaranteedDroneFirstSamplePending = false;

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
  guaranteedDroneFirstSamplePending = !stored;

  if (!stored || typeof stored !== "object") {
    return;
  }

  droneState.miningSessionStartMs = 0;
  droneState.returnSessionStartMs = 0;
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
    droneState.returnSessionStartMs = 0;
    droneRelaunchPendingAfterRestore = true;
  }
};

applyStoredDroneState();

const resolveDroneTerrainSampleDetail = (detail) => {
  const terrainId =
    typeof detail?.terrain?.id === "string" ? detail.terrain.id.trim() : "";
  if (!terrainId) {
    return null;
  }

  const terrain = getOutsideTerrainById(terrainId);
  const terrainElements = Array.isArray(terrain?.elements)
    ? terrain.elements.filter((entry) => entry && typeof entry === "object")
    : [];
  if (terrainElements.length === 0) {
    return null;
  }

  const selectedElement =
    terrainElements[Math.floor(Math.random() * terrainElements.length)] ?? null;
  if (!selectedElement) {
    return null;
  }

  const normalizedElement = sanitizeInventoryElement(selectedElement);
  if (!normalizedElement?.symbol && !normalizedElement?.name) {
    return null;
  }

  const resolvedWeight = getInventoryElementWeight(normalizedElement);
  return {
    ...(detail && typeof detail === "object" ? detail : {}),
    source: DRONE_QUICK_SLOT_ID,
    found: true,
    element: {
      ...normalizedElement,
      weight:
        Number.isFinite(resolvedWeight) && resolvedWeight > 0
          ? resolvedWeight
          : 1,
    },
  };
};

const resolveGuaranteedDroneCollectionDetail = (detail) => {
  if (detail?.source !== DRONE_QUICK_SLOT_ID) {
    return detail;
  }

  if (detail?.found && detail?.element) {
    guaranteedDroneFirstSamplePending = false;
    return detail;
  }

  if (guaranteedDroneFirstSamplePending) {
    const guaranteedDetail = resolveDroneTerrainSampleDetail(detail);
    if (guaranteedDetail) {
      guaranteedDroneFirstSamplePending = false;
      return guaranteedDetail;
    }

    return detail;
  }

  const successBonusChance = getDroneCraftingMiningSuccessChanceBonus();
  if (
    !Number.isFinite(successBonusChance) ||
    successBonusChance <= 0 ||
    Math.random() > successBonusChance
  ) {
    return detail;
  }

  const bonusSuccessDetail = resolveDroneTerrainSampleDetail(detail);
  return bonusSuccessDetail ?? detail;
};

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

const isDronePickupRequired = () => {
  if (droneState.active || droneState.inFlight || droneState.awaitingReturn) {
    dronePickupState.location = null;
    return false;
  }

  dronePickupState.location = getDroneBasePosition();

  if (!dronePickupState.required) {
    return false;
  }

  return !isPlayerNearDroneForPickup();
};

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
  if (droneState.awaitingReturn && droneState.status === "returning") {
    const returnStartMs = droneState.returnSessionStartMs;

    if (!Number.isFinite(returnStartMs) || returnStartMs <= 0) {
      return false;
    }

    const returnElapsedMs = performance.now() - returnStartMs;

    if (returnElapsedMs <= DRONE_RETURN_STALL_TIMEOUT_MS) {
      return false;
    }

    const cancelled = typeof sceneController?.cancelDroneMinerSession === "function"
      ? sceneController.cancelDroneMinerSession({ reason: "timeout" })
      : false;

    if (!cancelled) {
      if (droneState.pendingShutdown || droneState.fuelRemaining <= 0) {
        finalizeDroneAutomationShutdown();
      } else {
        droneState.awaitingReturn = false;
        droneState.returnSessionStartMs = 0;
        droneState.status = droneState.active ? "idle" : "inactive";
        updateDroneStatusUi();

        if (droneState.active) {
          scheduleDroneAutomationRetry();
        }
      }
    }

    showDroneTerminalToast({
      title: "Drone return timeout",
      description: "Return path stalled. Recovering drone control.",
    });

    return true;
  }

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
  droneState.returnSessionStartMs = 0;
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
const GEO_SCAN_PANEL_UPDATE_INTERVAL_MS = 200;

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
  let descriptionText =
    typeof slot?.description === "string" && slot.description.trim() !== ""
      ? slot.description.trim()
      : "Assign an item or ability to this slot.";

  if (isDiggerQuickSlot(slot) && !isDiggerToolEnabled()) {
    descriptionText = "Digger offline. Press 1 to reactivate.";
  }

  if (resourceToolLabel instanceof HTMLElement) {
    resourceToolLabel.textContent = labelText;
  }

  if (resourceToolDescription instanceof HTMLElement) {
    resourceToolDescription.textContent = descriptionText;
  }

  showResourceToolIndicator();
};

const geoScanPanelState = {
  terrainId: null,
  tileIndex: null,
};

const formatGeoScanElementList = (elements) => {
  if (!Array.isArray(elements) || elements.length === 0) {
    return "No extractable elements detected.";
  }

  const labels = elements
    .map((element) => {
      if (!element || typeof element !== "object") {
        return null;
      }

      const symbol =
        typeof element.symbol === "string" ? element.symbol.trim() : "";
      const name = typeof element.name === "string" ? element.name.trim() : "";

      if (name) {
        return name;
      }

      if (symbol) {
        return symbol;
      }

      return null;
    })
    .filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : "No extractable elements detected.";
};

const hideGeoScanPanel = () => {
  if (geoScanPanel instanceof HTMLElement) {
    geoScanPanel.hidden = true;
  }
  geoScanPanelState.terrainId = null;
  geoScanPanelState.tileIndex = null;
};

const updateGeoScanPanel = () => {
  if (!(geoScanPanel instanceof HTMLElement)) {
    return;
  }

  const activeGeoSlotId = getActiveGeoVisorSlotId();
  const isGeoScanActive = activeGeoSlotId === GEO_VISOR_PANEL_SLOT_ID;
  const terrainDetail = sceneController?.getTerrainScanTarget?.() ?? null;
  const canShowRevealedTerrainInfo = Boolean(terrainDetail?.geoVisorRevealed);

  if (!isGeoScanActive && !canShowRevealedTerrainInfo) {
    hideGeoScanPanel();
    return;
  }

  if (!terrainDetail?.terrainId) {
    hideGeoScanPanel();
    return;
  }

  if (terrainDetail.terrainId === "void") {
    geoScanPanel.hidden = false;
    geoScanPanelState.terrainId = "void";
    geoScanPanelState.tileIndex = null;
    if (geoScanTerrainLabel instanceof HTMLElement) {
      geoScanTerrainLabel.textContent = "Terrain: Void";
    }
    if (geoScanElementsLabel instanceof HTMLElement) {
      geoScanElementsLabel.textContent = "Area is empty.";
    }
    if (geoScanLifeFill instanceof HTMLElement) {
      geoScanLifeFill.style.width = "0%";
    }
    if (geoScanLifeValue instanceof HTMLElement) {
      geoScanLifeValue.textContent = `0 / ${GEO_SCAN_MAX_HP}`;
    }
    if (geoScanLifeBar instanceof HTMLElement) {
      geoScanLifeBar.setAttribute("aria-valuenow", "0");
      geoScanLifeBar.setAttribute("aria-valuemax", String(GEO_SCAN_MAX_HP));
    }
    return;
  }

  const terrain = getOutsideTerrainById(terrainDetail.terrainId);
  if (!terrain || terrain.id === "void") {
    hideGeoScanPanel();
    return;
  }

  geoScanPanel.hidden = false;

  if (geoScanPanelState.terrainId !== terrain.id) {
    geoScanPanelState.terrainId = terrain.id;

    const terrainLabelText =
      typeof terrainDetail.terrainLabel === "string" && terrainDetail.terrainLabel.trim() !== ""
        ? terrainDetail.terrainLabel.trim()
        : terrain.label ?? terrain.id ?? "Unknown terrain";

    if (geoScanTerrainLabel instanceof HTMLElement) {
      geoScanTerrainLabel.textContent = `Terrain: ${terrainLabelText}`;
    }

    if (geoScanElementsLabel instanceof HTMLElement) {
      geoScanElementsLabel.textContent = formatGeoScanElementList(terrain.elements);
    }
  }

  geoScanPanelState.tileIndex = terrainDetail.tileIndex ?? null;

  const terrainHp = getTerrainLifeValue(terrain, terrainDetail.tileIndex);
  const clampedPercent = Math.max(
    0,
    Math.min(100, Math.round((terrainHp / GEO_SCAN_MAX_HP) * 100))
  );

  if (geoScanLifeFill instanceof HTMLElement) {
    geoScanLifeFill.style.width = `${clampedPercent}%`;
  }

  if (geoScanLifeValue instanceof HTMLElement) {
    geoScanLifeValue.textContent = `${terrainHp} / ${GEO_SCAN_MAX_HP}`;
  }

  if (geoScanLifeBar instanceof HTMLElement) {
    geoScanLifeBar.setAttribute("aria-valuenow", String(terrainHp));
    geoScanLifeBar.setAttribute("aria-valuemax", String(GEO_SCAN_MAX_HP));
  }
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

const getActiveGeoVisorSlotId = () => {
  if (GEO_VISOR_SLOT_IDS.has(geoVisorState.activeSlotId)) {
    return geoVisorState.activeSlotId;
  }

  const selectedSlot = quickSlotState.slots[quickSlotState.selectedIndex] ?? null;
  if (GEO_VISOR_SLOT_IDS.has(selectedSlot?.id) && !selectedSlot?.activateOnly) {
    return selectedSlot.id;
  }

  return null;
};

const updateGeoVisorQuickSlotState = () => {
  if (!(quickSlotBar instanceof HTMLElement)) {
    return;
  }

  const activeSlotId = getActiveGeoVisorSlotId();
  const geoSlotButtons = quickSlotBar.querySelectorAll("[data-quick-slot-id]");

  geoSlotButtons.forEach((button) => {
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const slotId = button.dataset.quickSlotId;

    if (!GEO_VISOR_SLOT_IDS.has(slotId)) {
      return;
    }

    if (slotId === activeSlotId) {
      button.dataset.geoActive = "true";
    } else {
      delete button.dataset.geoActive;
    }
  });
};

const updateGeoVisorBatteryIndicator = () => {
  if (!(quickSlotBar instanceof HTMLElement)) {
    return;
  }

  const drainPercent = Math.max(
    0,
    Math.min(100, Math.round((1 - geoVisorBatteryState.level) * 100))
  );

  const geoSlotButtons = quickSlotBar.querySelectorAll("[data-geo-visor]");
  geoSlotButtons.forEach((button) => {
    if (!(button instanceof HTMLElement)) {
      return;
    }

    button.style.setProperty(
      "--geo-visor-battery-drain",
      `${drainPercent}%`
    );
  });
};

const persistGeoVisorBatterySnapshot = ({ force = false } = {}) =>
  geoVisorBatteryPersistenceEnabled
    ? persistGeoVisorState(
        {
          level: geoVisorBatteryState.level,
          updatedAt: Date.now(),
        },
        { force }
      )
    : false;

const schedulePersistGeoVisorBatteryState = ({ force = false } = {}) => {
  if (!geoVisorBatteryPersistenceEnabled) {
    return;
  }

  if (force) {
    if (persistGeoVisorBatteryTimeoutId) {
      window.clearTimeout(persistGeoVisorBatteryTimeoutId);
      persistGeoVisorBatteryTimeoutId = 0;
    }
    persistGeoVisorBatterySnapshot({ force: true });
    return;
  }

  if (persistGeoVisorBatteryTimeoutId) {
    return;
  }

  persistGeoVisorBatteryTimeoutId = window.setTimeout(() => {
    persistGeoVisorBatteryTimeoutId = 0;
    persistGeoVisorBatterySnapshot();
  }, GEO_VISOR_BATTERY_PERSIST_INTERVAL_MS);
};

const updateGeoVisorBatteryState = () => {
  const now = Date.now();
  const delta = now - geoVisorBatteryState.lastUpdate;

  if (!Number.isFinite(delta) || delta <= 0) {
    geoVisorBatteryState.lastUpdate = now;
    return;
  }

  geoVisorBatteryState.lastUpdate = now;

  const isGeoVisorActive = Boolean(getActiveGeoVisorSlotId());
  const duration = GEO_VISOR_BATTERY_RECHARGE_MS;
  const deltaFraction = delta / duration;
  const nextLevel = Math.max(
    0,
    Math.min(
      1,
      geoVisorBatteryState.level + deltaFraction
    )
  );

  if (isGeoVisorActive && nextLevel === 0) {
    setGeoVisorActiveSlotId(null);
  }

  if (Math.abs(nextLevel - geoVisorBatteryState.level) >= 0.001) {
    geoVisorBatteryState.level = nextLevel;
    updateGeoVisorBatteryIndicator();
    schedulePersistGeoVisorBatteryState();
  }
};

const setGeoVisorActiveSlotId = (slotId) => {
  const normalizedId = GEO_VISOR_SLOT_IDS.has(slotId) ? slotId : null;

  if (geoVisorState.activeSlotId === normalizedId) {
    return;
  }

  geoVisorState.activeSlotId = normalizedId;
  updateGeoVisorQuickSlotState();
  updateGeoScanPanel();
  sceneController?.setGeoVisorEnabled?.(Boolean(getActiveGeoVisorSlotId()));
};

const isGeoVisorBatteryFullyCharged = () => geoVisorBatteryState.level >= 0.999;

const activateGeoVisorPulse = (slotId) => {
  if (!GEO_VISOR_SLOT_IDS.has(slotId) || !isGeoVisorBatteryFullyCharged()) {
    return false;
  }

  geoVisorBatteryState.level = 0;
  geoVisorBatteryState.lastUpdate = Date.now();
  updateGeoVisorBatteryIndicator();
  schedulePersistGeoVisorBatteryState({ force: true });

  setGeoVisorActiveSlotId(slotId);
  setGeoVisorActiveSlotId(null);
  playGeoVisorScanSuccessSound();
  return true;
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

  updateResourceToolIndicator(getSelectedQuickSlot());
  updateDiggerQuickSlotState();
  updateDroneQuickSlotState();
  updateGeoVisorQuickSlotState();
  updateGeoVisorBatteryIndicator();
  sceneController?.setResourceToolEnabled?.(isDiggerToolEnabled());
  sceneController?.setGeoVisorEnabled?.(Boolean(getActiveGeoVisorSlotId()));
  updateGeoScanPanel();
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
    const isGeoVisorSlot = GEO_VISOR_SLOT_IDS.has(slot?.id);

    if (hasIcon) {
      const iconValue = slot.icon.trim();
      const isImageIcon = /\/|\.(svg|png|jpe?g|gif|webp)$/i.test(iconValue);

      const icon = document.createElement("span");
      icon.className = "quick-slot-bar__slot-icon";
      icon.setAttribute("aria-hidden", "true");

      const iconContent = document.createElement(
        isImageIcon ? "img" : "span"
      );
      iconContent.className = "quick-slot-bar__slot-icon-content";

      if (iconContent instanceof HTMLImageElement) {
        iconContent.src = iconValue;
        iconContent.alt = "";
        iconContent.loading = "lazy";
      } else {
        iconContent.textContent = iconValue;
      }

      icon.appendChild(iconContent);

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

    if (isGeoVisorSlot) {
      button.dataset.geoVisor = "true";
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

  const slot = getQuickSlotByIndex(index);
  const diggerEnabled = isDiggerQuickSlot(slot) && quickSlotState.diggerActive;

  try {
    const event = new CustomEvent("quick-slot:change", {
      detail: {
        index,
        slot,
        userInitiated,
        diggerActive: diggerEnabled,
        resourceToolEnabled: diggerEnabled,
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

  const slot = getQuickSlotByIndex(index);
  const isAlreadySelected = quickSlotState.selectedIndex === index;

  if (isAlreadySelected) {
    if (userInitiated) {
      if (isDiggerQuickSlot(slot)) {
        quickSlotState.diggerActive = !quickSlotState.diggerActive;
        updateQuickSlotUi();
      }
      dispatchQuickSlotChangeEvent(index, { userInitiated: true });
      triggerQuickSlotActivationEffect(index);
    }

    return;
  }

  quickSlotState.selectedIndex = index;
  if (isDiggerQuickSlot(slot)) {
    quickSlotState.diggerActive = true;
  }
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

const STORAGE_BOX_MODAL_OPTION = {
  id: "storage-box",
  title: "Storage box",
  description: "Store and retrieve outside resources.",
};
const CRAFTING_TABLE_MODAL_OPTION = {
  id: "crafting-table",
  title: "Crafting table",
  description: "Assemble drone parts to improve mining performance.",
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
const droneLaunchSoundSource = "sounds/robot_drone_lounch.mp3";
const droneLaunchSound = new Audio();
droneLaunchSound.preload = "auto";
droneLaunchSound.src = droneLaunchSoundSource;
droneLaunchSound.load();
const droneMiningSoundSource = "sounds/drone_minning.mp3";
const droneMiningSound = new Audio();
droneMiningSound.preload = "auto";
droneMiningSound.loop = true;
droneMiningSound.volume = 0;
droneMiningSound.src = droneMiningSoundSource;
droneMiningSound.load();
const geoVisorScanSuccessSoundSource = "sounds/terrain scan.mp3";
const geoVisorScanSuccessSound = new Audio();
geoVisorScanSuccessSound.preload = "auto";
geoVisorScanSuccessSound.src = geoVisorScanSuccessSoundSource;
geoVisorScanSuccessSound.load();
const geoVisorOutOfBatterySoundSource = "sounds/out_of_battery.mp3";
const geoVisorOutOfBatterySound = new Audio();
geoVisorOutOfBatterySound.preload = "auto";
geoVisorOutOfBatterySound.src = geoVisorOutOfBatterySoundSource;
geoVisorOutOfBatterySound.load();
const elevatorTravelSoundSource = "sounds/elevator.mp3";
const elevatorTravelSound = new Audio();
elevatorTravelSound.preload = "auto";
elevatorTravelSound.loop = true;
elevatorTravelSound.src = elevatorTravelSoundSource;
elevatorTravelSound.load();
let droneMiningSoundPlaying = false;
let elevatorTravelSoundPlaying = false;

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

const playDroneLaunchSound = () => {
  try {
    droneLaunchSound.pause();
    droneLaunchSound.currentTime = 0;
    const playPromise = droneLaunchSound.play();
    if (playPromise instanceof Promise) {
      playPromise.catch(() => {});
    }
  } catch (error) {
    console.error("Unable to play drone launch sound", error);
  }
};

const startDroneMiningSound = () => {
  if (droneMiningSoundPlaying) {
    return;
  }

  droneMiningSoundPlaying = true;
  try {
    droneMiningSound.currentTime = 0;
    const playPromise = droneMiningSound.play();
    if (playPromise instanceof Promise) {
      playPromise.catch(() => {
        droneMiningSoundPlaying = false;
      });
    }
  } catch (error) {
    droneMiningSoundPlaying = false;
    console.error("Unable to play drone mining sound", error);
  }
};

const stopDroneMiningSound = () => {
  if (!droneMiningSoundPlaying && droneMiningSound.paused) {
    return;
  }

  droneMiningSound.pause();
  droneMiningSound.currentTime = 0;
  droneMiningSoundPlaying = false;
};

const startElevatorTravelSound = () => {
  if (elevatorTravelSoundPlaying) {
    return;
  }

  elevatorTravelSoundPlaying = true;
  try {
    elevatorTravelSound.currentTime = 0;
    const playPromise = elevatorTravelSound.play();
    if (playPromise instanceof Promise) {
      playPromise.catch(() => {
        elevatorTravelSoundPlaying = false;
      });
    }
  } catch (error) {
    elevatorTravelSoundPlaying = false;
    console.error("Unable to play elevator travel sound", error);
  }
};

function updateDiggerQuickSlotState() {
  if (!(quickSlotBar instanceof HTMLElement)) {
    return;
  }

  const diggerSlotButton = quickSlotBar.querySelector(
    `[data-quick-slot-id="${DIGGER_QUICK_SLOT_ID}"]`
  );

  if (!(diggerSlotButton instanceof HTMLElement)) {
    return;
  }

  if (isDiggerToolEnabled()) {
    diggerSlotButton.dataset.diggerActive = "true";
  } else {
    delete diggerSlotButton.dataset.diggerActive;
  }
}

const stopElevatorTravelSound = () => {
  if (!elevatorTravelSoundPlaying && elevatorTravelSound.paused) {
    return;
  }

  elevatorTravelSound.pause();
  elevatorTravelSound.currentTime = 0;
  elevatorTravelSoundPlaying = false;
};

const getDroneMiningSoundVolumeForDistance = () => {
  const playerPosition = getPlayerPosition();
  const dronePosition = getDroneBasePosition();
  if (!playerPosition || !dronePosition) {
    return 0;
  }

  const dx = playerPosition.x - dronePosition.x;
  const dy = playerPosition.y - dronePosition.y;
  const dz = playerPosition.z - dronePosition.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const detectedTileSize = Number(sceneController?.getOutsideTerrainTileSize?.());
  const tileSize =
    Number.isFinite(detectedTileSize) && detectedTileSize > 0
      ? detectedTileSize
      : DRONE_MINING_SOUND_FALLBACK_TILE_SIZE;
  const maxDistance = tileSize * DRONE_MINING_SOUND_MAX_DISTANCE_TILES;

  if (!Number.isFinite(distance) || distance >= maxDistance) {
    return 0;
  }

  const normalized = distance / maxDistance;
  const falloff = 1 - normalized;
  return Math.max(0, Math.min(1, falloff * falloff * DRONE_MINING_SOUND_MAX_VOLUME));
};

const updateDroneMiningSoundPlayback = () => {
  const shouldPlayMiningSound =
    droneState.active &&
    droneState.inFlight &&
    droneState.status === "collecting";

  if (!shouldPlayMiningSound) {
    stopDroneMiningSound();
    return;
  }

  const volume = getDroneMiningSoundVolumeForDistance();
  if (volume <= 0.0001) {
    stopDroneMiningSound();
    return;
  }

  droneMiningSound.volume = volume;
  startDroneMiningSound();
};

const playGeoVisorScanSuccessSound = () => {
  try {
    geoVisorScanSuccessSound.pause();
    geoVisorScanSuccessSound.currentTime = 0;
    const playPromise = geoVisorScanSuccessSound.play();
    if (playPromise instanceof Promise) {
      playPromise.catch(() => {});
    }
  } catch (error) {
    console.error("Unable to play Geo Visor scan success sound", error);
  }
};

const setAreaLoadingOverlayState = ({
  active = false,
  title = "Loading area",
  description = "Preparing environment...",
} = {}) => {
  if (!(areaLoadingOverlay instanceof HTMLElement)) {
    return;
  }

  window.clearTimeout(areaLoadingOverlayHideTimeoutId);
  areaLoadingOverlayHideTimeoutId = 0;

  const nextActive = Boolean(active);
  const resolvedTitle =
    typeof title === "string" && title.trim() !== ""
      ? title.trim()
      : "Loading area";
  const resolvedDescription =
    typeof description === "string" && description.trim() !== ""
      ? description.trim()
      : "Preparing environment...";

  if (nextActive) {
    if (areaLoadingTitle instanceof HTMLElement) {
      areaLoadingTitle.textContent = resolvedTitle;
    }
    if (areaLoadingDescription instanceof HTMLElement) {
      areaLoadingDescription.textContent = resolvedDescription;
    }
    areaLoadingOverlay.hidden = false;
    areaLoadingOverlay.dataset.active = "true";
    return;
  }

  areaLoadingOverlay.dataset.active = "false";
  areaLoadingOverlayHideTimeoutId = window.setTimeout(() => {
    if (!(areaLoadingOverlay instanceof HTMLElement)) {
      return;
    }

    if (areaLoadingOverlay.dataset.active === "true") {
      return;
    }

    areaLoadingOverlay.hidden = true;
  }, 240);
};

const playGeoVisorOutOfBatterySound = () => {
  try {
    geoVisorOutOfBatterySound.pause();
    geoVisorOutOfBatterySound.currentTime = 0;
    const playPromise = geoVisorOutOfBatterySound.play();
    if (playPromise instanceof Promise) {
      playPromise.catch(() => {});
    }
  } catch (error) {
    console.error("Unable to play Geo Visor out of battery sound", error);
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
let missionModalActive = false;
let marketModalActive = false;
let researchModalActive = false;
let droneCustomizationModalActive = false;
let costumeCustomizationModalActive = false;
let storageBoxModalActive = false;
let craftingTableModalActive = false;
let teardownResearchModalActionBinding = null;
let teardownStorageBoxActionBinding = null;
let teardownCraftingTableActionBinding = null;
const QUICK_ACCESS_MODAL_MARGIN = 16;
const QUICK_ACCESS_MODAL_DRONE_SETUP_OPTION_ID = "drone-customization";
const QUICK_ACCESS_MODAL_COSTUME_SETUP_OPTION_ID = "costume-customization";
const quickAccessModalLayoutState = {
  optionId: null,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  pointerId: null,
  pointerOffsetX: 0,
  pointerOffsetY: 0,
  baseLeft: 0,
  baseTop: 0,
  width: 0,
  height: 0,
};
const RESEARCH_MODAL_TAB_IDS = Object.freeze(["costume", "drone"]);
const RESEARCH_MODAL_DEFAULT_TAB_ID = "drone";
let researchModalActiveTab = RESEARCH_MODAL_DEFAULT_TAB_ID;
const CRAFTING_TABLE_TAB_IDS = Object.freeze(["costume", "drone"]);
const CRAFTING_TABLE_DEFAULT_TAB_ID = "drone";
let craftingTableActiveTab = CRAFTING_TABLE_DEFAULT_TAB_ID;
const DRONE_CUSTOMIZATION_TAB_IDS = Object.freeze(["parts", "skins", "model"]);
const DRONE_CUSTOMIZATION_DEFAULT_TAB_ID = "skins";
let droneCustomizationActiveTab = DRONE_CUSTOMIZATION_DEFAULT_TAB_ID;
const droneSkinPreviewTextureCache = new Map();
const droneSkinPreviewState = {
  renderToken: 0,
  pendingSkinId: null,
};
const DRONE_MODEL_PREVIEW_MODEL_IDS = Object.freeze(["scout", "rover", "atltas"]);
const DRONE_MODEL_PREVIEW_ACCENT_COLORS = Object.freeze({
  scout: "#4ade80",
  rover: "#60a5fa",
  atltas: "#f59e0b",
});
const DRONE_MODEL_PREVIEW_GROUND_Y = -0.26;
const DRONE_MODEL_PREVIEW_SPIN_SPEED_RAD_PER_SEC = 0.16;
const DRONE_MODEL_PREVIEW_SPIN_MAX_FPS = 16;
const DRONE_CUSTOMIZATION_3D_PREVIEW_TABS = new Set(["skins", "model"]);
const droneSkinPreviewThreeTextureCache = new Map();
const droneModelPreviewState = {
  runtime: null,
  webglUnavailable: false,
};
const NEWS_COMMITS_API_URL =
  "https://api.github.com/repos/MaWay2000/g/commits?sha=main&per_page=6";
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;
const newsModalState = {
  renderToken: 0,
  cacheExpiresAt: 0,
  cachedItems: null,
  pendingRequest: null,
};

const INVENTORY_SLOT_COUNT = 200;
const DEFAULT_INVENTORY_CAPACITY_KG = 200;
const STORAGE_BOX_DEFAULT_ID = "operations-concourse-exit";
const STORAGE_BOX_DEFAULT_LABEL = "Outside exit room";
const STORAGE_BOX_CAPACITY_KG = 100;
const STORAGE_BOX_STORAGE_KEY = "dustyNova.storage-box";
const DRONE_CRAFTING_STORAGE_KEY = "dustyNova.drone-crafting";
const DRONE_CRAFTING_PARTS = Object.freeze([
  {
    id: "ion-cutter-head",
    label: "Ion Cutter Head",
    description: "Improves cutter penetration and reduces per-sample dig time.",
    speedBonus: 0.15,
    researchDurationMinutes: 5,
    researchRequirements: [
      { element: { symbol: "H", name: "Hydrogen" }, count: 3 },
      { element: { symbol: "C", name: "Carbon" }, count: 1 },
    ],
    requirements: [
      { element: { symbol: "H", name: "Hydrogen" }, count: 2 },
      { element: { symbol: "Ta", name: "Tantalum" }, count: 1 },
    ],
  },
  {
    id: "servo-gyro-array",
    label: "Servo Gyro Array",
    description: "Stabilizes approach vectors for quicker scan-and-cut cycles.",
    speedBonus: 0.2,
    researchDurationMinutes: 8,
    researchRequirements: [
      { element: { symbol: "Si", name: "Silicon" }, count: 1 },
      { element: { symbol: "Mg", name: "Magnesium" }, count: 1 },
      { element: { symbol: "Ca", name: "Calcium" }, count: 1 },
    ],
    requirements: [
      { element: { symbol: "Si", name: "Silicon" }, count: 2 },
      { element: { symbol: "Br", name: "Bromine" }, count: 1 },
    ],
  },
  {
    id: "quantum-routing-core",
    label: "Quantum Routing Core",
    description: "Optimizes flight paths between mining targets and base.",
    speedBonus: 0.25,
    researchDurationMinutes: 15,
    researchRequirements: [
      { element: { symbol: "P", name: "Phosphorus" }, count: 2 },
      { element: { symbol: "Si", name: "Silicon" }, count: 2 },
      { element: { symbol: "Ag", name: "Silver" }, count: 1 },
    ],
    requirements: [
      { element: { symbol: "Os", name: "Osmium" }, count: 1 },
      { element: { symbol: "F", name: "Fluorine" }, count: 1 },
      { element: { symbol: "Ho", name: "Holmium" }, count: 1 },
    ],
  },
  {
    id: "adaptive-sensor-lattice",
    label: "Adaptive Sensor Lattice",
    description: "Improves target acquisition reliability in difficult terrain.",
    successChanceBonus: 0.14,
    researchDurationMinutes: 20,
    researchRequirements: [
      { element: { symbol: "He", name: "Helium" }, count: 1 },
      { element: { symbol: "N", name: "Nitrogen" }, count: 2 },
      { element: { symbol: "Si", name: "Silicon" }, count: 1 },
    ],
    requirements: [
      { element: { symbol: "He", name: "Helium" }, count: 1 },
      { element: { symbol: "Si", name: "Silicon" }, count: 2 },
      { element: { symbol: "F", name: "Fluorine" }, count: 1 },
    ],
  },
  {
    id: "phase-lock-antenna",
    label: "Phase Lock Antenna",
    description: "Reduces scan jitter and increases lock-on consistency.",
    successChanceBonus: 0.11,
    researchDurationMinutes: 28,
    researchRequirements: [
      { element: { symbol: "H", name: "Hydrogen" }, count: 2 },
      { element: { symbol: "O", name: "Oxygen" }, count: 2 },
      { element: { symbol: "Ca", name: "Calcium" }, count: 1 },
    ],
    requirements: [
      { element: { symbol: "He", name: "Helium" }, count: 1 },
      { element: { symbol: "H", name: "Hydrogen" }, count: 2 },
      { element: { symbol: "Si", name: "Silicon" }, count: 1 },
    ],
  },
  {
    id: "predictive-pathfinder-ai",
    label: "Predictive Pathfinder AI",
    description: "Pre-computes viable veins to avoid empty extraction cycles.",
    successChanceBonus: 0.09,
    researchDurationMinutes: 35,
    researchRequirements: [
      { element: { symbol: "P", name: "Phosphorus" }, count: 2 },
      { element: { symbol: "B", name: "Boron" }, count: 1 },
      { element: { symbol: "As", name: "Arsenic" }, count: 1 },
    ],
    requirements: [
      { element: { symbol: "Ho", name: "Holmium" }, count: 1 },
      { element: { symbol: "F", name: "Fluorine" }, count: 2 },
      { element: { symbol: "Br", name: "Bromine" }, count: 1 },
    ],
  },
  {
    id: "split-core-extractor",
    label: "Split-Core Extractor",
    description: "Occasionally captures a second sample during a successful cut.",
    doubleYieldChance: 0.18,
    researchDurationMinutes: 45,
    researchRequirements: [
      { element: { symbol: "C", name: "Carbon" }, count: 2 },
      { element: { symbol: "S", name: "Sulfur" }, count: 2 },
      { element: { symbol: "Mg", name: "Magnesium" }, count: 1 },
    ],
    requirements: [
      { element: { symbol: "Br", name: "Bromine" }, count: 2 },
      { element: { symbol: "Ta", name: "Tantalum" }, count: 1 },
      { element: { symbol: "Os", name: "Osmium" }, count: 1 },
    ],
  },
  {
    id: "twin-hopper-magazine",
    label: "Twin Hopper Magazine",
    description: "Adds a secondary containment pass for duplicate samples.",
    doubleYieldChance: 0.12,
    researchDurationMinutes: 52,
    researchRequirements: [
      { element: { symbol: "Si", name: "Silicon" }, count: 2 },
      { element: { symbol: "Ca", name: "Calcium" }, count: 2 },
      { element: { symbol: "B", name: "Boron" }, count: 1 },
    ],
    requirements: [
      { element: { symbol: "Ta", name: "Tantalum" }, count: 1 },
      { element: { symbol: "Br", name: "Bromine" }, count: 2 },
      { element: { symbol: "Si", name: "Silicon" }, count: 1 },
    ],
  },
  {
    id: "resonance-fracture-lens",
    label: "Resonance Fracture Lens",
    description: "Resonant beam shaping can split one successful extraction into two.",
    doubleYieldChance: 0.1,
    researchDurationMinutes: 60,
    researchRequirements: [
      { element: { symbol: "Ag", name: "Silver" }, count: 1 },
      { element: { symbol: "Be", name: "Beryllium" }, count: 1 },
      { element: { symbol: "O", name: "Oxygen" }, count: 2 },
    ],
    requirements: [
      { element: { symbol: "Os", name: "Osmium" }, count: 1 },
      { element: { symbol: "He", name: "Helium" }, count: 1 },
      { element: { symbol: "F", name: "Fluorine" }, count: 1 },
    ],
  },
]);
const COSTUME_RESEARCH_PROJECTS = Object.freeze([
  {
    id: "reserve-cell-pack-i",
    label: "Reserve Cell Pack I",
    description: "Adds an auxiliary oxygen cell to the suit frame.",
    maxOxygenBonus: 0.1,
    researchDurationMinutes: 5,
    researchRequirements: [
      { element: { symbol: "O", name: "Oxygen" }, count: 2 },
      { element: { symbol: "H", name: "Hydrogen" }, count: 2 },
      { element: { symbol: "Al", name: "Aluminum" }, count: 1 },
    ],
  },
  {
    id: "reserve-cell-pack-ii",
    label: "Reserve Cell Pack II",
    description: "Expands tank routing with a heavier reserve cluster.",
    maxOxygenBonus: 0.3,
    requiredProjectId: "reserve-cell-pack-i",
    researchDurationMinutes: 25,
    researchRequirements: [
      { element: { symbol: "O", name: "Oxygen" }, count: 10 },
      { element: { symbol: "H", name: "Hydrogen" }, count: 10 },
      { element: { symbol: "Al", name: "Aluminum" }, count: 5 },
    ],
  },
  {
    id: "reserve-cell-pack-iii",
    label: "Reserve Cell Pack III",
    description: "Stabilizes dual-cell pressure routing for extended sorties.",
    maxOxygenBonus: 0.2,
    requiredProjectId: "reserve-cell-pack-ii",
    researchDurationMinutes: 35,
    researchRequirements: [
      { element: { symbol: "O", name: "Oxygen" }, count: 14 },
      { element: { symbol: "H", name: "Hydrogen" }, count: 14 },
      { element: { symbol: "Al", name: "Aluminum" }, count: 7 },
    ],
  },
  {
    id: "reserve-cell-pack-iv",
    label: "Reserve Cell Pack IV",
    description: "Reinforces the tank spine with marathon-grade reserve capacity.",
    maxOxygenBonus: 0.2,
    requiredProjectId: "reserve-cell-pack-iii",
    researchDurationMinutes: 45,
    researchRequirements: [
      { element: { symbol: "O", name: "Oxygen" }, count: 18 },
      { element: { symbol: "H", name: "Hydrogen" }, count: 18 },
      { element: { symbol: "Al", name: "Aluminum" }, count: 9 },
    ],
  },
  {
    id: "reserve-cell-pack-v",
    label: "Reserve Cell Pack V",
    description: "Completes the suit's maximum emergency oxygen reserve architecture.",
    maxOxygenBonus: 0.2,
    requiredProjectId: "reserve-cell-pack-iv",
    researchDurationMinutes: 60,
    researchRequirements: [
      { element: { symbol: "O", name: "Oxygen" }, count: 22 },
      { element: { symbol: "H", name: "Hydrogen" }, count: 22 },
      { element: { symbol: "Al", name: "Aluminum" }, count: 11 },
    ],
  },
  {
    id: "recycler-breather-i",
    label: "Recycler Breather I",
    description: "Improves filtration so every tank lasts longer on the surface.",
    oxygenConsumptionReduction: 0.05,
    researchDurationMinutes: 5,
    researchRequirements: [
      { element: { symbol: "C", name: "Carbon" }, count: 2 },
      { element: { symbol: "N", name: "Nitrogen" }, count: 2 },
      { element: { symbol: "F", name: "Fluorine" }, count: 1 },
    ],
  },
  {
    id: "recycler-breather-ii",
    label: "Recycler Breather II",
    description: "Adds a denser scrubber matrix to sharply cut surface oxygen waste.",
    oxygenConsumptionReduction: 0.15,
    requiredProjectId: "recycler-breather-i",
    researchDurationMinutes: 25,
    researchRequirements: [
      { element: { symbol: "C", name: "Carbon" }, count: 10 },
      { element: { symbol: "N", name: "Nitrogen" }, count: 10 },
      { element: { symbol: "F", name: "Fluorine" }, count: 5 },
    ],
  },
  {
    id: "recycler-breather-iii",
    label: "Recycler Breather III",
    description: "Refines the recycler core for steadier oxygen recovery in motion.",
    oxygenConsumptionReduction: 0.1,
    requiredProjectId: "recycler-breather-ii",
    researchDurationMinutes: 35,
    researchRequirements: [
      { element: { symbol: "C", name: "Carbon" }, count: 14 },
      { element: { symbol: "N", name: "Nitrogen" }, count: 14 },
      { element: { symbol: "F", name: "Fluorine" }, count: 7 },
    ],
  },
  {
    id: "recycler-breather-iv",
    label: "Recycler Breather IV",
    description: "Adds high-retention membranes for long-duration EVA efficiency.",
    oxygenConsumptionReduction: 0.1,
    requiredProjectId: "recycler-breather-iii",
    researchDurationMinutes: 45,
    researchRequirements: [
      { element: { symbol: "C", name: "Carbon" }, count: 18 },
      { element: { symbol: "N", name: "Nitrogen" }, count: 18 },
      { element: { symbol: "F", name: "Fluorine" }, count: 9 },
    ],
  },
  {
    id: "recycler-breather-v",
    label: "Recycler Breather V",
    description: "Finalizes the suit's highest-efficiency oxygen recycling loop.",
    oxygenConsumptionReduction: 0.1,
    requiredProjectId: "recycler-breather-iv",
    researchDurationMinutes: 60,
    researchRequirements: [
      { element: { symbol: "C", name: "Carbon" }, count: 22 },
      { element: { symbol: "N", name: "Nitrogen" }, count: 22 },
      { element: { symbol: "F", name: "Fluorine" }, count: 11 },
    ],
  },
  {
    id: "servo-weave-boots-i",
    label: "Servo Weave Boots I",
    description: "Boot servos accelerate stride recovery during movement.",
    moveSpeedBonus: 0.1,
    researchDurationMinutes: 5,
    researchRequirements: [
      { element: { symbol: "Fe", name: "Iron" }, count: 2 },
      { element: { symbol: "Si", name: "Silicon" }, count: 2 },
      { element: { symbol: "Cu", name: "Copper" }, count: 1 },
    ],
  },
  {
    id: "servo-weave-boots-ii",
    label: "Servo Weave Boots II",
    description: "Reinforced actuator mesh sharply raises suit sprint output.",
    moveSpeedBonus: 0.3,
    requiredProjectId: "servo-weave-boots-i",
    researchDurationMinutes: 25,
    researchRequirements: [
      { element: { symbol: "Fe", name: "Iron" }, count: 10 },
      { element: { symbol: "Si", name: "Silicon" }, count: 10 },
      { element: { symbol: "Cu", name: "Copper" }, count: 5 },
    ],
  },
  {
    id: "servo-weave-boots-iii",
    label: "Servo Weave Boots III",
    description: "Refits the lower-body servo matrix for smoother acceleration.",
    moveSpeedBonus: 0.2,
    requiredProjectId: "servo-weave-boots-ii",
    researchDurationMinutes: 35,
    researchRequirements: [
      { element: { symbol: "Fe", name: "Iron" }, count: 14 },
      { element: { symbol: "Si", name: "Silicon" }, count: 14 },
      { element: { symbol: "Cu", name: "Copper" }, count: 7 },
    ],
  },
  {
    id: "servo-weave-boots-iv",
    label: "Servo Weave Boots IV",
    description: "Adds high-torque stride assist for heavy-load movement.",
    moveSpeedBonus: 0.2,
    requiredProjectId: "servo-weave-boots-iii",
    researchDurationMinutes: 45,
    researchRequirements: [
      { element: { symbol: "Fe", name: "Iron" }, count: 18 },
      { element: { symbol: "Si", name: "Silicon" }, count: 18 },
      { element: { symbol: "Cu", name: "Copper" }, count: 9 },
    ],
  },
  {
    id: "servo-weave-boots-v",
    label: "Servo Weave Boots V",
    description: "Completes the fastest servo-boot weave the suit frame can support.",
    moveSpeedBonus: 0.2,
    requiredProjectId: "servo-weave-boots-iv",
    researchDurationMinutes: 60,
    researchRequirements: [
      { element: { symbol: "Fe", name: "Iron" }, count: 22 },
      { element: { symbol: "Si", name: "Silicon" }, count: 22 },
      { element: { symbol: "Cu", name: "Copper" }, count: 11 },
    ],
  },
  {
    id: "exo-spring-lattice-i",
    label: "Exo Spring Lattice I",
    description: "Leg frame springs add a measured assist to jump launches.",
    jumpBonus: 0.1,
    researchDurationMinutes: 5,
    researchRequirements: [
      { element: { symbol: "Mg", name: "Magnesium" }, count: 2 },
      { element: { symbol: "Ca", name: "Calcium" }, count: 2 },
      { element: { symbol: "Be", name: "Beryllium" }, count: 1 },
    ],
  },
  {
    id: "exo-spring-lattice-ii",
    label: "Exo Spring Lattice II",
    description: "High-tension lattice coils dramatically increase jump assist.",
    jumpBonus: 0.3,
    requiredProjectId: "exo-spring-lattice-i",
    researchDurationMinutes: 25,
    researchRequirements: [
      { element: { symbol: "Mg", name: "Magnesium" }, count: 10 },
      { element: { symbol: "Ca", name: "Calcium" }, count: 10 },
      { element: { symbol: "Be", name: "Beryllium" }, count: 5 },
    ],
  },
  {
    id: "exo-spring-lattice-iii",
    label: "Exo Spring Lattice III",
    description: "Balances the spring lattice for repeatable high-arc jumps.",
    jumpBonus: 0.2,
    requiredProjectId: "exo-spring-lattice-ii",
    researchDurationMinutes: 35,
    researchRequirements: [
      { element: { symbol: "Mg", name: "Magnesium" }, count: 14 },
      { element: { symbol: "Ca", name: "Calcium" }, count: 14 },
      { element: { symbol: "Be", name: "Beryllium" }, count: 7 },
    ],
  },
  {
    id: "exo-spring-lattice-iv",
    label: "Exo Spring Lattice IV",
    description: "Adds reinforced spring channels for elevated launch power.",
    jumpBonus: 0.2,
    requiredProjectId: "exo-spring-lattice-iii",
    researchDurationMinutes: 45,
    researchRequirements: [
      { element: { symbol: "Mg", name: "Magnesium" }, count: 18 },
      { element: { symbol: "Ca", name: "Calcium" }, count: 18 },
      { element: { symbol: "Be", name: "Beryllium" }, count: 9 },
    ],
  },
  {
    id: "exo-spring-lattice-v",
    label: "Exo Spring Lattice V",
    description: "Completes the suit's maximum jump-assist spring lattice.",
    jumpBonus: 0.2,
    requiredProjectId: "exo-spring-lattice-iv",
    researchDurationMinutes: 60,
    researchRequirements: [
      { element: { symbol: "Mg", name: "Magnesium" }, count: 22 },
      { element: { symbol: "Ca", name: "Calcium" }, count: 22 },
      { element: { symbol: "Be", name: "Beryllium" }, count: 11 },
    ],
  },
]);
const DRONE_LIGHT_MODEL_ID = "scout";
const DRONE_MEDIUM_MODEL_ID = "rover";
const DRONE_HEAVY_MODEL_ID = "atltas";
const DRONE_UNLOCKABLE_MODEL_IDS = Object.freeze([
  DRONE_LIGHT_MODEL_ID,
  DRONE_MEDIUM_MODEL_ID,
  DRONE_HEAVY_MODEL_ID,
]);
const DRONE_MEDIUM_MODEL_CRAFT_WEIGHT_KG = 100;
const DRONE_MEDIUM_MODEL_CRAFT_WEIGHT_GRAMS =
  DRONE_MEDIUM_MODEL_CRAFT_WEIGHT_KG * GRAMS_PER_KILOGRAM;
const DRONE_MEDIUM_MODEL_CRAFT_MATERIAL_TYPES = 6;

const normalizeDroneUnlockModelId = (value) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) {
    return null;
  }
  if (normalized === "atlas") {
    return DRONE_HEAVY_MODEL_ID;
  }
  return DRONE_UNLOCKABLE_MODEL_IDS.includes(normalized) ? normalized : null;
};

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
const storageBoxState = {
  boxes: new Map(),
  activeBoxId: STORAGE_BOX_DEFAULT_ID,
};
const droneCraftingState = {
  researchedPartIds: new Set(),
  inventoryResearchPartIds: new Set(),
  readyResearchPartIds: new Set(),
  craftedPartIds: new Set(),
  equippedPartIds: new Set(),
  readyPartIds: new Set(),
  activeResearchJob: null,
  activeJob: null,
  unlockedModelIds: new Set([DRONE_LIGHT_MODEL_ID]),
  mediumModelRequirements: [],
};
const costumeResearchState = {
  completedProjectIds: new Set(),
  craftedProjectIds: new Set(),
  equippedProjectIds: new Set(),
  researchedProjectIds: new Set(),
  inventoryResearchProjectIds: new Set(),
  readyResearchProjectIds: new Set(),
  readyProjectIds: new Set(),
  activeJob: null,
  activeCraftJob: null,
};
const COSTUME_RESEARCH_PROGRESS_UPDATE_MS = 1000;

const getCostumeResearchProjectById = (projectId) =>
  COSTUME_RESEARCH_PROJECTS.find((project) => project.id === projectId) ?? null;

const getCostumeResearchRequiredProject = (project) => {
  const requiredProjectId =
    typeof project?.requiredProjectId === "string"
      ? project.requiredProjectId.trim()
      : "";
  return requiredProjectId ? getCostumeResearchProjectById(requiredProjectId) : null;
};

const isCostumeResearchProjectUnlocked = (project) => {
  const requiredProject = getCostumeResearchRequiredProject(project);
  return !requiredProject || isCostumeResearchProjectCompleted(requiredProject.id);
};

const isCostumeResearchProjectCompleted = (projectId) =>
  typeof projectId === "string" && costumeResearchState.equippedProjectIds.has(projectId);

const isCostumeResearchProjectCrafted = (projectId) =>
  typeof projectId === "string" && costumeResearchState.craftedProjectIds.has(projectId);

const isCostumeResearchBlueprintLoaded = (projectId) =>
  typeof projectId === "string" && costumeResearchState.researchedProjectIds.has(projectId);

const isCostumeResearchBlueprintInInventory = (projectId) =>
  typeof projectId === "string" && costumeResearchState.inventoryResearchProjectIds.has(projectId);

const isCostumeResearchBlueprintReadyToClaim = (projectId) =>
  typeof projectId === "string" && costumeResearchState.readyResearchProjectIds.has(projectId);

const isCostumeCraftingProjectReadyToClaim = (projectId) =>
  typeof projectId === "string" && costumeResearchState.readyProjectIds.has(projectId);

const getCompletedCostumeResearchProjects = () =>
  COSTUME_RESEARCH_PROJECTS.filter((project) => isCostumeResearchProjectCompleted(project.id));

const getCostumeResearchBonusSum = (bonusKey) =>
  getCompletedCostumeResearchProjects().reduce((total, project) => {
    const bonusValue = Number(project?.[bonusKey] ?? 0);
    return total + (Number.isFinite(bonusValue) ? bonusValue : 0);
  }, 0);

const getCostumeMaxOxygenMultiplier = () =>
  Math.min(2, Math.max(1, 1 + getCostumeResearchBonusSum("maxOxygenBonus")));

const getCostumeOxygenConsumptionMultiplier = () =>
  Math.max(0.5, Math.min(1, 1 - getCostumeResearchBonusSum("oxygenConsumptionReduction")));

const getCostumeMoveSpeedMultiplier = () =>
  Math.min(2, Math.max(1, 1 + getCostumeResearchBonusSum("moveSpeedBonus")));

const getCostumeJumpMultiplier = () =>
  Math.min(2, Math.max(1, 1 + getCostumeResearchBonusSum("jumpBonus")));

const getPlayerOxygenMaxPercent = () =>
  Math.max(PLAYER_OXYGEN_BASE_MAX_PERCENT, Math.round(
    PLAYER_OXYGEN_BASE_MAX_PERCENT * getCostumeMaxOxygenMultiplier()
  ));

const getPlayerOxygenThresholdPercent = (basePercent) =>
  Math.max(
    0,
    (getPlayerOxygenMaxPercent() * Math.max(0, Number(basePercent) || 0)) /
      PLAYER_OXYGEN_BASE_MAX_PERCENT
  );

const getPlayerOxygenDrainPerSecond = () =>
  PLAYER_OXYGEN_BASE_DRAIN_PER_SECOND * getCostumeOxygenConsumptionMultiplier();

const getPlayerOxygenRegenPerSecond = () =>
  getPlayerOxygenMaxPercent() / PLAYER_OXYGEN_REGEN_FULL_DURATION_SECONDS;

const getPlayerOxygenChamberRecoveryTarget = () =>
  getPlayerOxygenThresholdPercent(PLAYER_OXYGEN_CHAMBER_RECOVERY_PERCENT);

const clearCostumeResearchState = () => {
  costumeResearchState.completedProjectIds.clear();
  costumeResearchState.craftedProjectIds.clear();
  costumeResearchState.equippedProjectIds.clear();
  costumeResearchState.researchedProjectIds.clear();
  costumeResearchState.inventoryResearchProjectIds.clear();
  costumeResearchState.readyResearchProjectIds.clear();
  costumeResearchState.readyProjectIds.clear();
  costumeResearchState.activeJob = null;
  costumeResearchState.activeCraftJob = null;
};

updatePlayerOxygenUi();
applySpeedSettingsUiState();
applyJumpSettingsUiState();

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
const inventoryDropConfirmState = {
  resolver: null,
  closeTimeoutId: 0,
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

  const shouldPreserveVisibleDialogPosition =
    inventoryPanel.classList.contains("is-open") &&
    inventoryDialog instanceof HTMLElement &&
    !inventoryLayoutState.dragging;
  const shouldPersistPosition = Boolean(inventoryLayoutState.position);
  let preservedDialogPosition = null;

  if (shouldPreserveVisibleDialogPosition) {
    const dialogRect = inventoryDialog.getBoundingClientRect();
    if (dialogRect.width > 0 && dialogRect.height > 0) {
      preservedDialogPosition = {
        left: dialogRect.left,
        top: dialogRect.top,
      };
    }
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

  if (preservedDialogPosition) {
    setInventoryPanelPosition(
      preservedDialogPosition.left,
      preservedDialogPosition.top,
      {
        clamp: true,
        updateState: shouldPersistPosition,
      }
    );
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

const getDroneCargoEntries = () => {
  if (!Array.isArray(droneState.cargo) || droneState.cargo.length === 0) {
    return [];
  }

  const entryMap = new Map();

  droneState.cargo.forEach((sample) => {
    if (!sample?.found || !sample.element) {
      return;
    }

    const normalizedElement = sanitizeInventoryElement(sample.element);
    const key = getInventoryEntryKey(normalizedElement);
    const existingEntry = entryMap.get(key);

    if (existingEntry) {
      existingEntry.count += 1;
      return;
    }

    entryMap.set(key, {
      key,
      count: 1,
      element: normalizedElement,
    });
  });

  return Array.from(entryMap.values()).sort((leftEntry, rightEntry) => {
    const leftNumber = Number.isFinite(leftEntry?.element?.number)
      ? leftEntry.element.number
      : Number.POSITIVE_INFINITY;
    const rightNumber = Number.isFinite(rightEntry?.element?.number)
      ? rightEntry.element.number
      : Number.POSITIVE_INFINITY;

    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    const leftSymbol =
      typeof leftEntry?.element?.symbol === "string" ? leftEntry.element.symbol : "";
    const rightSymbol =
      typeof rightEntry?.element?.symbol === "string"
        ? rightEntry.element.symbol
        : "";

    return leftSymbol.localeCompare(rightSymbol);
  });
};

const renderDroneCargoElements = () => {
  if (!(droneCargoList instanceof HTMLElement)) {
    return;
  }

  droneCargoList.innerHTML = "";
  const cargoEntries = getDroneCargoEntries();
  const hasCargoEntries = cargoEntries.length > 0;

  droneCargoList.hidden = !hasCargoEntries;

  if (droneCargoEmptyState instanceof HTMLElement) {
    droneCargoEmptyState.hidden = hasCargoEntries;
  }

  if (!hasCargoEntries) {
    return;
  }

  const fragment = document.createDocumentFragment();

  cargoEntries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "inventory-panel__item drone-inventory__cargo-item";
    item.tabIndex = -1;
    item.setAttribute("role", "listitem");

    const symbolElement = document.createElement("span");
    symbolElement.className = "inventory-panel__symbol";
    symbolElement.textContent =
      typeof entry?.element?.symbol === "string" && entry.element.symbol.trim() !== ""
        ? entry.element.symbol.trim()
        : "???";
    item.appendChild(symbolElement);

    const count = Number.isFinite(entry?.count) && entry.count > 0 ? entry.count : 1;
    const countElement = document.createElement("span");
    countElement.className = "inventory-panel__count";
    countElement.textContent = `×${count}`;
    countElement.setAttribute("aria-hidden", "true");
    item.appendChild(countElement);

    const itemName =
      typeof entry?.element?.name === "string" && entry.element.name.trim() !== ""
        ? entry.element.name.trim()
        : symbolElement.textContent;
    const sampleLabel = count === 1 ? "sample" : "samples";
    item.setAttribute(
      "aria-label",
      `${itemName}, ${count} ${sampleLabel} currently in drone payload`
    );

    fragment.appendChild(item);
  });

  droneCargoList.appendChild(fragment);
};

const renderDroneInventoryUi = () => {
  renderDroneFuelGrid();
  renderDroneFuelSources();
  renderDroneCargoElements();
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

const isPointWithinInventoryDialog = (clientX, clientY) => {
  if (!(inventoryDialog instanceof HTMLElement)) {
    return false;
  }

  const rect = inventoryDialog.getBoundingClientRect();

  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
};

const getInventoryEntryDisplayName = (entry) => {
  const symbol = entry?.element?.symbol ?? "";
  const name = entry?.element?.name ?? "";

  if (symbol && name) {
    return `${symbol} (${name})`;
  }

  if (symbol || name) {
    return symbol || name;
  }

  return "this item";
};
const getInventoryDropWarningCopy = (entry) => {
  const name = getInventoryEntryDisplayName(entry);
  const countLabel =
    typeof entry?.count === "number" && entry.count > 1
      ? `${entry.count} items`
      : "this item";

  return {
    name,
    countLabel,
    title: `Drop ${name}?`,
    detail: `Use Keep item to return ${name} to your inventory.`,
  };
};

const setInventoryDropConfirmMessage = (countLabel) => {
  if (!(inventoryDropConfirmMessage instanceof HTMLElement)) {
    return;
  }

  const prefix = document.createTextNode("Dropping ");
  const highlight = document.createElement("span");
  const suffix = document.createTextNode(
    " outside the inventory will permanently remove it."
  );

  highlight.className = "inventory-drop-confirm__highlight";
  highlight.textContent = countLabel;

  inventoryDropConfirmMessage.innerHTML = "";
  inventoryDropConfirmMessage.append(prefix, highlight, suffix);
};

const confirmInventoryDropFallback = (entry) => {
  if (typeof window?.confirm !== "function") {
    return false;
  }

  const { name, countLabel } = getInventoryDropWarningCopy(entry);

  return window.confirm(
    `Drop ${name} outside the inventory panel? This will remove ${countLabel} from your inventory.`
  );
};

const hideInventoryDropConfirm = (result = false) => {
  if (!(inventoryDropConfirm instanceof HTMLElement)) {
    const resolver = inventoryDropConfirmState.resolver;
    inventoryDropConfirmState.resolver = null;
    resolver?.(result);
    return;
  }

  window.clearTimeout(inventoryDropConfirmState.closeTimeoutId);
  inventoryDropConfirm.dataset.visible = "false";
  inventoryDropConfirmState.closeTimeoutId = window.setTimeout(() => {
    inventoryDropConfirm.hidden = true;
    inventoryDropConfirm.setAttribute("aria-hidden", "true");
  }, 180);

  const resolver = inventoryDropConfirmState.resolver;
  inventoryDropConfirmState.resolver = null;
  resolver?.(result);
};

const showInventoryDropConfirm = (entry) =>
  new Promise((resolve) => {
    if (
      !(
        inventoryDropConfirm instanceof HTMLElement &&
        inventoryDropConfirmTitle instanceof HTMLElement &&
        inventoryDropConfirmConfirmButton instanceof HTMLButtonElement &&
        inventoryDropConfirmCancelButton instanceof HTMLButtonElement
      )
    ) {
      resolve(confirmInventoryDropFallback(entry));
      return;
    }

    window.clearTimeout(inventoryDropConfirmState.closeTimeoutId);

    if (typeof inventoryDropConfirmState.resolver === "function") {
      inventoryDropConfirmState.resolver(false);
    }

    const { title, countLabel, detail, name } = getInventoryDropWarningCopy(entry);

    inventoryDropConfirmState.resolver = resolve;
    inventoryDropConfirmTitle.textContent = title;
    setInventoryDropConfirmMessage(countLabel);

    if (inventoryDropConfirmDetail instanceof HTMLElement) {
      inventoryDropConfirmDetail.textContent =
        detail || `Use Keep item to return ${name} to your inventory.`;
    }

    inventoryDropConfirm.hidden = false;
    inventoryDropConfirm.setAttribute("aria-hidden", "false");

    window.requestAnimationFrame(() => {
      inventoryDropConfirm.dataset.visible = "true";
      inventoryDropConfirmConfirmButton.focus({ preventScroll: true });
    });
  });

const confirmInventoryDrop = async (entry) => {
  if (!(inventoryDropConfirm instanceof HTMLElement)) {
    return confirmInventoryDropFallback(entry);
  }

  return showInventoryDropConfirm(entry);
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

async function finishInventoryPointerReorder(clientX, clientY) {
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
  const droppedOutsideInventory =
    sourceIndex >= 0 &&
    !isPointWithinInventoryDialog(clientX, clientY) &&
    !fuelSlot;

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

  if (droppedOutsideInventory) {
    resetInventoryReorderState();
    const confirmed = await confirmInventoryDrop(draggedEntry);

    if (confirmed && draggedEntry) {
      spendInventoryResource(draggedEntry.element, draggedEntry.count || 1);
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

async function handleInventoryPointerReorderEnd(event) {
  if (
    !inventoryPointerReorderState.active ||
    event.pointerId !== inventoryPointerReorderState.pointerId
  ) {
    return;
  }

  event.preventDefault();
  updateInventoryDragPreviewPosition(event.clientX, event.clientY);
  await finishInventoryPointerReorder(event.clientX, event.clientY);
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
let persistStorageBoxStateTimeoutId = 0;
let lastSerializedStorageBoxState = null;
let lastSerializedDroneCraftingState = null;
let costumeResearchProgressIntervalId = 0;
let costumeCraftingProgressIntervalId = 0;
let droneCraftingProgressIntervalId = 0;
let droneResearchProgressIntervalId = 0;
let inventoryWasPointerLocked = false;
let lastInventoryFocusedElement = null;
let inventoryCloseFallbackId = 0;
let todoItems = [];
let todoStorageAvailable = true;
let lastTodoFocusedElement = null;
let todoPanelWasPointerLocked = false;
let todoPanelCloseFallbackId = 0;
let todoPersistTimeoutId = 0;

const clearStoredInventoryState = () => {
  const storage = getInventoryStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(INVENTORY_STORAGE_KEY);
    lastSerializedInventoryState = null;
    return true;
  } catch (error) {
    console.warn("Unable to clear stored inventory state", error);
  }

  return false;
};

const clearStoredStorageBoxState = () => {
  const storage = getInventoryStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(STORAGE_BOX_STORAGE_KEY);
    lastSerializedStorageBoxState = null;
    return true;
  } catch (error) {
    console.warn("Unable to clear stored storage box state", error);
  }

  return false;
};

const clearStoredDroneCraftingState = () => {
  const storage = getInventoryStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(DRONE_CRAFTING_STORAGE_KEY);
    lastSerializedDroneCraftingState = null;
    return true;
  } catch (error) {
    console.warn("Unable to clear stored drone crafting state", error);
  }

  return false;
};

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

const clearQuickAccessModalDialogOffset = () => {
  if (!(quickAccessModalDialog instanceof HTMLElement)) {
    return;
  }

  quickAccessModalDialog.style.removeProperty("--quick-access-dialog-offset-x");
  quickAccessModalDialog.style.removeProperty("--quick-access-dialog-offset-y");
  quickAccessModalLayoutState.offsetX = 0;
  quickAccessModalLayoutState.offsetY = 0;
};

const getQuickAccessViewportDimensions = () => {
  const docElement = typeof document !== "undefined" ? document.documentElement : null;
  const width = Math.max(
    0,
    typeof window !== "undefined" && Number.isFinite(window.innerWidth)
      ? window.innerWidth
      : 0,
    docElement && Number.isFinite(docElement.clientWidth)
      ? docElement.clientWidth
      : 0
  );
  const height = Math.max(
    0,
    typeof window !== "undefined" && Number.isFinite(window.innerHeight)
      ? window.innerHeight
      : 0,
    docElement && Number.isFinite(docElement.clientHeight)
      ? docElement.clientHeight
      : 0
  );

  return { width, height };
};

const getQuickAccessDialogBaseMetrics = () => {
  if (!(quickAccessModalDialog instanceof HTMLElement)) {
    return null;
  }

  const rect = quickAccessModalDialog.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
    baseLeft: rect.left - quickAccessModalLayoutState.offsetX,
    baseTop: rect.top - quickAccessModalLayoutState.offsetY,
  };
};

const clampQuickAccessDialogOffset = (offsetX, offsetY) => {
  const numericOffsetX = Number.isFinite(offsetX) ? offsetX : 0;
  const numericOffsetY = Number.isFinite(offsetY) ? offsetY : 0;
  const viewport = getQuickAccessViewportDimensions();
  const hasDragMetrics =
    quickAccessModalLayoutState.width > 0 && quickAccessModalLayoutState.height > 0;

  const fallbackMetrics = getQuickAccessDialogBaseMetrics();
  const width = hasDragMetrics
    ? quickAccessModalLayoutState.width
    : (fallbackMetrics?.width ?? 0);
  const height = hasDragMetrics
    ? quickAccessModalLayoutState.height
    : (fallbackMetrics?.height ?? 0);
  const baseLeft = hasDragMetrics
    ? quickAccessModalLayoutState.baseLeft
    : (fallbackMetrics?.baseLeft ?? 0);
  const baseTop = hasDragMetrics
    ? quickAccessModalLayoutState.baseTop
    : (fallbackMetrics?.baseTop ?? 0);

  let nextOffsetX = Math.round(numericOffsetX);
  let nextOffsetY = Math.round(numericOffsetY);

  if (viewport.width > 0 && width > 0) {
    const minOffsetX = QUICK_ACCESS_MODAL_MARGIN - baseLeft;
    const maxOffsetX =
      viewport.width - QUICK_ACCESS_MODAL_MARGIN - width - baseLeft;
    nextOffsetX = Math.min(Math.max(nextOffsetX, minOffsetX), maxOffsetX);
  }

  if (viewport.height > 0 && height > 0) {
    const minOffsetY = QUICK_ACCESS_MODAL_MARGIN - baseTop;
    const maxOffsetY =
      viewport.height - QUICK_ACCESS_MODAL_MARGIN - height - baseTop;
    nextOffsetY = Math.min(Math.max(nextOffsetY, minOffsetY), maxOffsetY);
  }

  return { x: nextOffsetX, y: nextOffsetY };
};

const setQuickAccessModalDialogOffset = (
  offsetX,
  offsetY,
  { clamp = true } = {}
) => {
  if (!(quickAccessModalDialog instanceof HTMLElement)) {
    return;
  }

  const resolvedOffset = clamp
    ? clampQuickAccessDialogOffset(offsetX, offsetY)
    : {
        x: Math.round(Number.isFinite(offsetX) ? offsetX : 0),
        y: Math.round(Number.isFinite(offsetY) ? offsetY : 0),
      };

  quickAccessModalDialog.style.setProperty(
    "--quick-access-dialog-offset-x",
    `${resolvedOffset.x}px`
  );
  quickAccessModalDialog.style.setProperty(
    "--quick-access-dialog-offset-y",
    `${resolvedOffset.y}px`
  );

  quickAccessModalLayoutState.offsetX = resolvedOffset.x;
  quickAccessModalLayoutState.offsetY = resolvedOffset.y;
};

const removeQuickAccessModalDragListeners = () => {
  window.removeEventListener("pointermove", handleQuickAccessModalDragPointerMove);
  window.removeEventListener("pointerup", handleQuickAccessModalDragPointerUp);
  window.removeEventListener("pointercancel", handleQuickAccessModalDragPointerUp);
};

function handleQuickAccessModalDragPointerMove(event) {
  if (
    !quickAccessModalLayoutState.dragging ||
    event.pointerId !== quickAccessModalLayoutState.pointerId
  ) {
    return;
  }

  const nextLeft = event.clientX - quickAccessModalLayoutState.pointerOffsetX;
  const nextTop = event.clientY - quickAccessModalLayoutState.pointerOffsetY;
  const nextOffsetX = nextLeft - quickAccessModalLayoutState.baseLeft;
  const nextOffsetY = nextTop - quickAccessModalLayoutState.baseTop;
  setQuickAccessModalDialogOffset(nextOffsetX, nextOffsetY, { clamp: true });

  event.preventDefault();
}

function handleQuickAccessModalDragPointerUp(event) {
  if (
    !quickAccessModalLayoutState.dragging ||
    event.pointerId !== quickAccessModalLayoutState.pointerId
  ) {
    return;
  }

  removeQuickAccessModalDragListeners();
  quickAccessModalLayoutState.dragging = false;
  quickAccessModalLayoutState.pointerId = null;
  quickAccessModalLayoutState.width = 0;
  quickAccessModalLayoutState.height = 0;
  quickAccessModalLayoutState.baseLeft = 0;
  quickAccessModalLayoutState.baseTop = 0;

  if (quickAccessModalDialog instanceof HTMLElement) {
    quickAccessModalDialog.classList.remove("is-dragging");
  }

  if (quickAccessModalContent instanceof HTMLElement) {
    quickAccessModalContent
      .querySelectorAll("[data-quick-access-drag-handle].is-dragging")
      .forEach((handle) => handle.classList.remove("is-dragging"));
  }

  if (quickAccessModal instanceof HTMLElement) {
    quickAccessModal.classList.remove("is-dragging");
  }

  setQuickAccessModalDialogOffset(
    quickAccessModalLayoutState.offsetX,
    quickAccessModalLayoutState.offsetY,
    { clamp: true }
  );
}

const handleQuickAccessModalDragPointerDown = (event) => {
  if (
    quickAccessModalLayoutState.optionId !== QUICK_ACCESS_MODAL_DRONE_SETUP_OPTION_ID
  ) {
    return;
  }

  if (!(quickAccessModalDialog instanceof HTMLElement)) {
    return;
  }

  if (typeof event.button === "number" && event.button !== 0) {
    return;
  }

  if (quickAccessModalLayoutState.dragging) {
    return;
  }

  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const dragHandle = target.closest("[data-quick-access-drag-handle]");
  if (
    !(dragHandle instanceof HTMLElement) ||
    !(quickAccessModalContent instanceof HTMLElement) ||
    !quickAccessModalContent.contains(dragHandle)
  ) {
    return;
  }

  if (
    target.closest(
      "button, a, input, textarea, select, [role='button'], [role='tab']"
    )
  ) {
    return;
  }

  if (!(quickAccessModal instanceof HTMLElement) || quickAccessModal.hidden) {
    return;
  }

  const rect = quickAccessModalDialog.getBoundingClientRect();
  quickAccessModalLayoutState.dragging = true;
  quickAccessModalLayoutState.pointerId = event.pointerId;
  quickAccessModalLayoutState.pointerOffsetX = event.clientX - rect.left;
  quickAccessModalLayoutState.pointerOffsetY = event.clientY - rect.top;
  quickAccessModalLayoutState.width = rect.width;
  quickAccessModalLayoutState.height = rect.height;
  quickAccessModalLayoutState.baseLeft = rect.left - quickAccessModalLayoutState.offsetX;
  quickAccessModalLayoutState.baseTop = rect.top - quickAccessModalLayoutState.offsetY;

  quickAccessModalDialog.classList.add("is-dragging");
  dragHandle.classList.add("is-dragging");
  quickAccessModal.classList.add("is-dragging");

  removeQuickAccessModalDragListeners();
  window.addEventListener("pointermove", handleQuickAccessModalDragPointerMove, {
    passive: false,
  });
  window.addEventListener("pointerup", handleQuickAccessModalDragPointerUp);
  window.addEventListener("pointercancel", handleQuickAccessModalDragPointerUp);

  event.preventDefault();
};

const syncQuickAccessModalLayoutMode = (optionId = null) => {
  const normalizedOptionId =
    typeof optionId === "string" && optionId.trim() !== "" ? optionId.trim() : null;
  const isDroneSetup = normalizedOptionId === QUICK_ACCESS_MODAL_DRONE_SETUP_OPTION_ID;

  quickAccessModalLayoutState.optionId = normalizedOptionId;

  if (quickAccessModal instanceof HTMLElement) {
    quickAccessModal.classList.toggle("quick-access-modal--drone-setup", isDroneSetup);
    if (isDroneSetup) {
      quickAccessModal.dataset.modalId = normalizedOptionId;
    } else {
      delete quickAccessModal.dataset.modalId;
      quickAccessModal.classList.remove("is-dragging");
    }
  }

  if (!isDroneSetup) {
    clearQuickAccessModalDialogOffset();
  }
};

const resetQuickAccessModalLayoutState = () => {
  removeQuickAccessModalDragListeners();
  quickAccessModalLayoutState.dragging = false;
  quickAccessModalLayoutState.pointerId = null;
  quickAccessModalLayoutState.pointerOffsetX = 0;
  quickAccessModalLayoutState.pointerOffsetY = 0;
  quickAccessModalLayoutState.baseLeft = 0;
  quickAccessModalLayoutState.baseTop = 0;
  quickAccessModalLayoutState.width = 0;
  quickAccessModalLayoutState.height = 0;
  quickAccessModalLayoutState.optionId = null;

  if (quickAccessModalDialog instanceof HTMLElement) {
    quickAccessModalDialog.classList.remove("is-dragging");
  }

  if (quickAccessModalContent instanceof HTMLElement) {
    quickAccessModalContent
      .querySelectorAll("[data-quick-access-drag-handle].is-dragging")
      .forEach((handle) => handle.classList.remove("is-dragging"));
  }

  if (quickAccessModal instanceof HTMLElement) {
    quickAccessModal.classList.remove("quick-access-modal--drone-setup", "is-dragging");
    delete quickAccessModal.dataset.modalId;
  }

  clearQuickAccessModalDialogOffset();
};

const handleQuickAccessModalWindowResize = () => {
  if (
    !(quickAccessModal instanceof HTMLElement) ||
    quickAccessModal.hidden ||
    quickAccessModalLayoutState.optionId !== QUICK_ACCESS_MODAL_DRONE_SETUP_OPTION_ID
  ) {
    return;
  }

  if (quickAccessModalLayoutState.dragging) {
    return;
  }

  setQuickAccessModalDialogOffset(
    quickAccessModalLayoutState.offsetX,
    quickAccessModalLayoutState.offsetY,
    { clamp: true }
  );
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

  if (option?.id === STORAGE_BOX_MODAL_OPTION.id) {
    return "Storage transfer panel";
  }

  if (option?.id === CRAFTING_TABLE_MODAL_OPTION.id) {
    return "Drone crafting panel";
  }

  if (option?.title) {
    return `${option.title} terminal briefing`;
  }

  return "Terminal information panel";
};

const formatNewsCommitTimestamp = (timestamp) => {
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const commitDate = new Date(timestamp);
  if (Number.isNaN(commitDate.getTime())) {
    return "";
  }

  return commitDate.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const truncateNewsText = (text, maxLength) => {
  const normalized = typeof text === "string" ? text.trim() : "";
  if (!normalized || !Number.isFinite(maxLength) || maxLength <= 0) {
    return normalized;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
};

const normalizeNewsCommit = (commit) => {
  if (!commit || typeof commit !== "object") {
    return null;
  }

  const commitData = commit.commit && typeof commit.commit === "object" ? commit.commit : null;
  const rawMessage =
    typeof commitData?.message === "string" ? commitData.message.trim() : "";
  if (!rawMessage) {
    return null;
  }

  const messageLines = rawMessage
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const headline = truncateNewsText(messageLines[0] || "Repository update", 140);
  const details = truncateNewsText(messageLines.slice(1).join(" "), 220);
  const shortSha =
    typeof commit.sha === "string" && commit.sha.trim()
      ? commit.sha.trim().slice(0, 7)
      : "";
  const authorNameCandidates = [
    commitData?.author?.name,
    commit.author?.login,
    commit.committer?.login,
  ];
  const authorName =
    authorNameCandidates.find(
      (name) => typeof name === "string" && name.trim().length > 0
    )?.trim() || "";
  const committedAt = Date.parse(commitData?.author?.date || commitData?.committer?.date);

  return {
    headline,
    details,
    shortSha,
    authorName,
    committedAt: Number.isFinite(committedAt) ? committedAt : null,
  };
};

const fetchLatestNewsCommits = async () => {
  const response = await fetch(NEWS_COMMITS_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitHub commits API request failed (${response.status})`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.map(normalizeNewsCommit).filter(Boolean).slice(0, 6);
};

const loadLatestNewsCommits = async ({ force = false } = {}) => {
  const now = Date.now();
  if (
    !force &&
    Array.isArray(newsModalState.cachedItems) &&
    newsModalState.cacheExpiresAt > now
  ) {
    return newsModalState.cachedItems;
  }

  if (!force && newsModalState.pendingRequest instanceof Promise) {
    return newsModalState.pendingRequest;
  }

  const request = fetchLatestNewsCommits()
    .then((commits) => {
      const normalizedCommits = Array.isArray(commits) ? commits : [];
      newsModalState.cachedItems = normalizedCommits;
      newsModalState.cacheExpiresAt = Date.now() + NEWS_CACHE_TTL_MS;
      return normalizedCommits;
    })
    .finally(() => {
      newsModalState.pendingRequest = null;
    });

  newsModalState.pendingRequest = request;
  return request;
};

const createNewsCommitListItem = (commit) => {
  const listItem = document.createElement("li");
  listItem.className = "quick-access-modal__list-item";

  const metaSegments = [];
  if (commit.shortSha) {
    metaSegments.push(`#${commit.shortSha}`);
  }

  const committedAtLabel = formatNewsCommitTimestamp(commit.committedAt);
  if (committedAtLabel) {
    metaSegments.push(committedAtLabel);
  }

  listItem.textContent = metaSegments.length
    ? `${commit.headline} (${metaSegments.join(" | ")})`
    : commit.headline;
  return listItem;
};

const createNewsCommitCard = (commit, index) => {
  const card = document.createElement("article");
  card.className = "quick-access-modal__card";

  const status = document.createElement("p");
  status.className = "quick-access-modal__status-tag";
  status.textContent = index === 0 ? "Latest" : "Update";
  card.appendChild(status);

  const title = document.createElement("h3");
  title.textContent = commit.headline;
  card.appendChild(title);

  const summarySegments = [];
  if (commit.authorName) {
    summarySegments.push(commit.authorName);
  }

  if (commit.shortSha) {
    summarySegments.push(`#${commit.shortSha}`);
  }

  const committedAtLabel = formatNewsCommitTimestamp(commit.committedAt);
  if (committedAtLabel) {
    summarySegments.push(committedAtLabel);
  }

  const body = document.createElement("p");
  const details = commit.details ? ` ${commit.details}` : "";
  body.textContent = `${summarySegments.join(" | ")}${details}`.trim();
  card.appendChild(body);

  return card;
};

const renderNewsModal = async () => {
  if (!quickAccessModalContent) {
    return;
  }

  const commitList = quickAccessModalContent.querySelector("[data-news-commit-list]");
  if (!(commitList instanceof HTMLElement)) {
    return;
  }

  const subtitle = quickAccessModalContent.querySelector("[data-news-subtitle]");
  const commitCardGrid = quickAccessModalContent.querySelector(
    "[data-news-commit-card-grid]"
  );
  const renderToken = ++newsModalState.renderToken;

  if (subtitle instanceof HTMLElement) {
    subtitle.textContent = "Syncing latest game updates from GitHub main...";
  }

  try {
    const commits = await loadLatestNewsCommits();
    if (renderToken !== newsModalState.renderToken) {
      return;
    }

    if (!Array.isArray(commits) || commits.length === 0) {
      if (subtitle instanceof HTMLElement) {
        subtitle.textContent = "No recent updates found on GitHub main.";
      }
      return;
    }

    commitList.innerHTML = "";
    commits.forEach((commit) => {
      commitList.appendChild(createNewsCommitListItem(commit));
    });

    if (subtitle instanceof HTMLElement) {
      const latestLabel = formatNewsCommitTimestamp(commits[0]?.committedAt);
      subtitle.textContent = latestLabel
        ? `Latest game updates from GitHub main. Last sync: ${latestLabel}.`
        : "Latest game updates from GitHub main.";
    }

    if (commitCardGrid instanceof HTMLElement) {
      commitCardGrid.innerHTML = "";
      commits.slice(0, 2).forEach((commit, index) => {
        commitCardGrid.appendChild(createNewsCommitCard(commit, index));
      });
    }
  } catch (error) {
    if (renderToken !== newsModalState.renderToken) {
      return;
    }

    console.warn("Unable to load GitHub news commits", error);

    if (subtitle instanceof HTMLElement) {
      subtitle.textContent =
        "Latest intelligence packets pulled from the Dusty Nova relay network.";
    }
  }
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

const getLiftDoorFilteringOverrides = () => {
  const overrides = currentSettings?.liftDoorFilterByArea;
  return overrides && typeof overrides === "object" ? overrides : {};
};

const isLiftFloorDoorEnabled = (floorId) => {
  if (typeof floorId !== "string" || floorId.trim() === "") {
    return true;
  }

  const trimmedFloorId = floorId.trim();
  const overrides = getLiftDoorFilteringOverrides();

  if (Object.prototype.hasOwnProperty.call(overrides, trimmedFloorId)) {
    return overrides[trimmedFloorId] !== false;
  }

  const shouldFilterLiftDoors = currentSettings?.liftDoorFiltering !== false;
  if (!shouldFilterLiftDoors) {
    return true;
  }

  return trimmedFloorId !== "operations-concourse";
};

const renderLiftAreaSettings = () => {
  if (!(liftAreaSettingsList instanceof HTMLElement)) {
    return;
  }

  liftAreaSettingsList.innerHTML = "";
  const floors = sceneController?.getLiftFloors?.() ?? [];

  if (!Array.isArray(floors) || floors.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "performance-toggle__hint";
    emptyState.textContent = "No lift areas available.";
    liftAreaSettingsList.appendChild(emptyState);
    return;
  }

  floors.forEach((floor) => {
    if (!floor || typeof floor.id !== "string") {
      return;
    }

    const floorId = floor.id.trim();
    if (!floorId) {
      return;
    }

    const titleText =
      typeof floor.title === "string" && floor.title.trim() !== ""
        ? floor.title.trim()
        : "Unlabeled deck";
    const hintText =
      typeof floor.description === "string" && floor.description.trim() !== ""
        ? floor.description.trim()
        : "Toggle this lift area in selector listings.";

    const label = document.createElement("label");
    label.className = "performance-toggle";

    const input = document.createElement("input");
    input.className = "performance-toggle__input";
    input.type = "checkbox";
    input.role = "switch";
    input.checked = isLiftFloorDoorEnabled(floorId);
    input.setAttribute("aria-label", `Toggle ${titleText} in lift selector`);
    input.setAttribute("aria-pressed", String(input.checked));

    input.addEventListener("change", (event) => {
      const enabled = Boolean(event.target?.checked);
      const nextOverrides = { ...getLiftDoorFilteringOverrides(), [floorId]: enabled };
      currentSettings = { ...currentSettings, liftDoorFilterByArea: nextOverrides };
      persistSettings(currentSettings);
      renderLiftAreaSettings();
      if (liftModalActive) {
        renderLiftModalFloors();
      }
    });

    const track = document.createElement("span");
    track.className = "performance-toggle__track";
    track.setAttribute("aria-hidden", "true");

    const thumb = document.createElement("span");
    thumb.className = "performance-toggle__thumb";
    thumb.setAttribute("aria-hidden", "true");
    track.appendChild(thumb);

    const text = document.createElement("span");
    text.className = "performance-toggle__text";

    const title = document.createElement("span");
    title.className = "performance-toggle__title";
    title.textContent = titleText;

    const hint = document.createElement("span");
    hint.className = "performance-toggle__hint";
    hint.textContent = hintText;

    text.appendChild(title);
    text.appendChild(hint);

    label.appendChild(input);
    label.appendChild(track);
    label.appendChild(text);

    liftAreaSettingsList.appendChild(label);
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
    if (!isLiftFloorDoorEnabled(floor.id)) {
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

const getStorageEntryDisplayName = (entry) => {
  const symbol = entry?.element?.symbol ?? "";
  const name = entry?.element?.name ?? "";

  if (symbol && name) {
    return `${symbol} (${name})`;
  }

  if (symbol || name) {
    return symbol || name;
  }

  return "Unknown resource";
};

const getStorageBoxModalElements = () => {
  if (!quickAccessModalContent) {
    return {
      location: null,
      subtitle: null,
      warning: null,
      inventoryLoad: null,
      storedLoad: null,
      inventoryList: null,
      inventoryEmpty: null,
      storedList: null,
      storedEmpty: null,
    };
  }

  return {
    location: quickAccessModalContent.querySelector("[data-storage-box-location]"),
    subtitle: quickAccessModalContent.querySelector("[data-storage-box-subtitle]"),
    warning: quickAccessModalContent.querySelector("[data-storage-box-warning]"),
    inventoryLoad: quickAccessModalContent.querySelector(
      "[data-storage-box-inventory-load]"
    ),
    storedLoad: quickAccessModalContent.querySelector("[data-storage-box-stored-load]"),
    inventoryList: quickAccessModalContent.querySelector(
      "[data-storage-box-inventory-list]"
    ),
    inventoryEmpty: quickAccessModalContent.querySelector(
      "[data-storage-box-inventory-empty]"
    ),
    storedList: quickAccessModalContent.querySelector("[data-storage-box-stored-list]"),
    storedEmpty: quickAccessModalContent.querySelector("[data-storage-box-stored-empty]"),
  };
};

const getOrderedStorageBoxEntries = () =>
  Array.from(getActiveStorageBoxRecord().entries).sort(
    (left, right) => (right?.lastTransferredAt ?? 0) - (left?.lastTransferredAt ?? 0)
  );

const createStorageBoxModalEntryItem = ({
  entry,
  actionLabel,
  actionType,
  disabled = false,
}) => {
  const item = document.createElement("li");
  item.className = "storage-box-panel__item";

  const main = document.createElement("div");
  main.className = "storage-box-panel__item-main";

  const title = document.createElement("p");
  title.className = "storage-box-panel__item-title";
  title.textContent = getStorageEntryDisplayName(entry);
  main.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "storage-box-panel__item-meta";
  const count = Math.max(0, Math.floor(Number(entry?.count) || 0));
  const unitWeight = getInventoryElementWeight(entry?.element);
  const totalWeight = count * unitWeight;
  meta.textContent = `${count} item${count === 1 ? "" : "s"} • ${formatGrams(totalWeight)}`;
  main.appendChild(meta);
  item.appendChild(main);

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "storage-box-panel__button";
  actionButton.dataset.storageBoxAction = actionType;
  actionButton.dataset.storageBoxEntryKey = entry?.key ?? "";
  actionButton.textContent = actionLabel;
  actionButton.disabled = disabled;
  item.appendChild(actionButton);

  return item;
};

const renderStorageBoxModal = () => {
  if (!storageBoxModalActive) {
    return;
  }

  const {
    location,
    subtitle,
    warning,
    inventoryLoad: inventoryLoadLabel,
    storedLoad: storedLoadLabel,
    inventoryList,
    inventoryEmpty,
    storedList,
    storedEmpty,
  } = getStorageBoxModalElements();

  const activeStorageBox = getActiveStorageBoxRecord();
  const storageLoad = recalculateStorageBoxLoad(activeStorageBox.id);
  const storageFill = `${formatGrams(storageLoad)} / ${formatKilograms(
    getStorageBoxCapacityKg(activeStorageBox.id)
  )}`;
  const inventoryLoadGrams = Number.isFinite(inventoryState.currentLoadGrams)
    ? inventoryState.currentLoadGrams
    : recalculateInventoryLoad();

  if (location instanceof HTMLElement) {
    location.textContent = activeStorageBox.label;
  }

  if (subtitle instanceof HTMLElement) {
    subtitle.textContent = `Transfer collected elements between your inventory and this ${formatKilograms(
      getStorageBoxCapacityKg(activeStorageBox.id)
    )} stash.`;
  }

  if (inventoryLoadLabel instanceof HTMLElement) {
    inventoryLoadLabel.textContent = `Load: ${formatGrams(
      inventoryLoadGrams
    )} / ${formatKilograms(
      getInventoryCapacityKg()
    )}`;
  }

  if (storedLoadLabel instanceof HTMLElement) {
    storedLoadLabel.textContent = `Load: ${storageFill}`;
  }

  if (warning instanceof HTMLElement) {
    const rejection =
      typeof activeStorageBox.capacityRejection === "string"
        ? activeStorageBox.capacityRejection.trim()
        : "";
    warning.hidden = rejection === "";
    warning.textContent = rejection || "";
  }

  const inventoryEntries = getOrderedInventoryEntries().filter(
    (entry) => entry && Number.isFinite(entry.count) && entry.count > 0
  );
  const storedEntries = getOrderedStorageBoxEntries().filter(
    (entry) => entry && Number.isFinite(entry.count) && entry.count > 0
  );

  if (inventoryList instanceof HTMLElement) {
    inventoryList.innerHTML = "";
    inventoryEntries.forEach((entry) => {
      const unitWeight = getInventoryElementWeight(entry.element);
      const canStore = canStorageBoxAcceptWeight(unitWeight, activeStorageBox.id);
      inventoryList.appendChild(
        createStorageBoxModalEntryItem({
          entry,
          actionLabel: "Store",
          actionType: "store",
          disabled: !canStore,
        })
      );
    });
  }

  if (inventoryEmpty instanceof HTMLElement) {
    inventoryEmpty.hidden = inventoryEntries.length > 0;
  }

  if (storedList instanceof HTMLElement) {
    storedList.innerHTML = "";
    storedEntries.forEach((entry) => {
      const unitWeight = getInventoryElementWeight(entry.element);
      const canTake = canAcceptInventoryWeight(unitWeight);
      storedList.appendChild(
        createStorageBoxModalEntryItem({
          entry,
          actionLabel: "Take",
          actionType: "take",
          disabled: !canTake,
        })
      );
    });
  }

  if (storedEmpty instanceof HTMLElement) {
    storedEmpty.hidden = storedEntries.length > 0;
  }
};

const handleStorageBoxActionClick = (event) => {
  if (!storageBoxModalActive) {
    return;
  }

  const actionTarget =
    event.target instanceof HTMLElement
      ? event.target.closest("[data-storage-box-action]")
      : null;

  if (!(actionTarget instanceof HTMLButtonElement)) {
    return;
  }

  const entryKey = actionTarget.dataset.storageBoxEntryKey;
  const actionType = actionTarget.dataset.storageBoxAction;
  if (!entryKey || !actionType) {
    return;
  }

  event.preventDefault();

  if (actionType === "store") {
    transferInventoryToStorageBox(entryKey, 1);
    return;
  }

  if (actionType === "take") {
    transferStorageBoxToInventory(entryKey, 1);
  }
};

const teardownStorageBoxModal = () => {
  storageBoxModalActive = false;

  if (typeof teardownStorageBoxActionBinding === "function") {
    teardownStorageBoxActionBinding();
    teardownStorageBoxActionBinding = null;
  }
};

const bindStorageBoxModalEvents = () => {
  const { inventoryList, storedList } = getStorageBoxModalElements();

  if (
    !(inventoryList instanceof HTMLElement) ||
    !(storedList instanceof HTMLElement) ||
    typeof teardownStorageBoxActionBinding === "function"
  ) {
    return;
  }

  inventoryList.addEventListener("click", handleStorageBoxActionClick);
  storedList.addEventListener("click", handleStorageBoxActionClick);
  teardownStorageBoxActionBinding = () => {
    inventoryList.removeEventListener("click", handleStorageBoxActionClick);
    storedList.removeEventListener("click", handleStorageBoxActionClick);
  };
};

const refreshStorageBoxModalIfOpen = () => {
  if (!storageBoxModalActive) {
    return;
  }

  renderStorageBoxModal();
};

const getCraftingTableModalElements = () => {
  if (!quickAccessModalContent) {
    return {
      tabButtons: [],
      subtitle: null,
      speedSummary: null,
      hint: null,
      partList: null,
    };
  }

  return {
    tabButtons: Array.from(
      quickAccessModalContent.querySelectorAll("[data-crafting-tab]")
    ),
    subtitle: quickAccessModalContent.querySelector("[data-crafting-table-subtitle]"),
    speedSummary: quickAccessModalContent.querySelector(
      "[data-crafting-speed-summary]"
    ),
    hint: quickAccessModalContent.querySelector("[data-crafting-table-hint]"),
    partList: quickAccessModalContent.querySelector("[data-crafting-part-list]"),
  };
};

const getResearchModalElements = () => {
  if (!quickAccessModalContent) {
    return {
      panel: null,
      tabButtons: [],
      costumePanel: null,
      dronePanel: null,
      summary: null,
      partList: null,
    };
  }

  let panel = quickAccessModalContent.querySelector("[data-research-panel]");
  let tabButtons = Array.from(
    quickAccessModalContent.querySelectorAll("[data-research-tab]")
  ).filter((button) => button instanceof HTMLButtonElement);
  let costumePanel = quickAccessModalContent.querySelector(
    '[data-research-tab-panel="costume"]'
  );
  let dronePanel = quickAccessModalContent.querySelector(
    '[data-research-tab-panel="drone"]'
  );
  let summary = quickAccessModalContent.querySelector("[data-research-summary]");
  let partList = quickAccessModalContent.querySelector("[data-research-part-list]");

  if (
    !(panel instanceof HTMLElement) ||
    tabButtons.length !== RESEARCH_MODAL_TAB_IDS.length ||
    !(costumePanel instanceof HTMLElement) ||
    !(dronePanel instanceof HTMLElement) ||
    !(summary instanceof HTMLElement) ||
    !(partList instanceof HTMLElement)
  ) {
    const header = quickAccessModalContent.querySelector(".quick-access-modal__header");
    const subtitle = header?.querySelector(".quick-access-modal__subtitle");
    if (subtitle instanceof HTMLElement) {
      subtitle.textContent =
        "Unlock suit upgrades and drone blueprints before they can be activated in the field.";
    }

    panel = document.createElement("section");
    panel.className = "quick-access-modal__section research-panel";
    panel.dataset.researchPanel = "true";

    const tabs = document.createElement("nav");
    tabs.className = "drone-customization-tabs research-panel__tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Research tabs");
    panel.appendChild(tabs);

    const createdTabButtons = RESEARCH_MODAL_TAB_IDS.map((tabId) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "drone-customization-tabs__button";
      button.dataset.researchTab = tabId;
      button.id = `research-tab-${tabId}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", `research-panel-${tabId}`);
      button.textContent = tabId === "costume" ? "Costume" : "Drone";
      tabs.appendChild(button);
      return button;
    });
    tabButtons = createdTabButtons;

    costumePanel = document.createElement("div");
    costumePanel.className = "research-panel__tab-content crafting-panel";
    costumePanel.dataset.researchTabPanel = "costume";
    costumePanel.id = "research-panel-costume";
    costumePanel.setAttribute("role", "tabpanel");
    costumePanel.setAttribute("aria-labelledby", "research-tab-costume");

    const costumeHint = document.createElement("p");
    costumeHint.className = "crafting-panel__hint";
    costumeHint.textContent =
      "Research suit blueprints here, then move them to Inventory > Items before loading them into the Crafting Table.";
    costumePanel.appendChild(costumeHint);

    const costumeEmpty = document.createElement("p");
    costumeEmpty.className = "research-panel__empty";
    costumeEmpty.dataset.researchCostumeEmpty = "true";
    costumeEmpty.textContent = "No costume research projects available yet.";
    costumePanel.appendChild(costumeEmpty);
    panel.appendChild(costumePanel);

    dronePanel = document.createElement("div");
    dronePanel.className = "research-panel__tab-content crafting-panel";
    dronePanel.dataset.researchTabPanel = "drone";
    dronePanel.id = "research-panel-drone";
    dronePanel.setAttribute("role", "tabpanel");
    dronePanel.setAttribute("aria-labelledby", "research-tab-drone");

    summary = document.createElement("p");
    summary.className = "crafting-panel__summary";
    summary.dataset.researchSummary = "true";
    summary.textContent = "Research lab status: syncing...";
    dronePanel.appendChild(summary);

    const hint = document.createElement("p");
    hint.className = "crafting-panel__hint";
    hint.textContent =
      "Research consumes materials immediately and takes between 5 minutes and 1 hour. One blueprint can run in the lab at a time.";
    dronePanel.appendChild(hint);

    partList = document.createElement("ul");
    partList.className = "crafting-panel__grid";
    partList.dataset.researchPartList = "true";
    partList.setAttribute("role", "list");
    dronePanel.appendChild(partList);
    panel.appendChild(dronePanel);

    if (header instanceof HTMLElement) {
      header.insertAdjacentElement("afterend", panel);
    } else {
      quickAccessModalContent.prepend(panel);
    }
  }

  return {
    panel,
    tabButtons,
    costumePanel,
    dronePanel,
    summary,
    partList,
  };
};

const isDroneCraftingPartResearched = (partId) =>
  typeof partId === "string" &&
  (droneCraftingState.researchedPartIds.has(partId) ||
    droneCraftingState.craftedPartIds.has(partId) ||
    droneCraftingState.equippedPartIds.has(partId) ||
    droneCraftingState.readyPartIds.has(partId));

const isDroneResearchBlueprintInInventory = (partId) =>
  typeof partId === "string" && droneCraftingState.inventoryResearchPartIds.has(partId);

const isDroneResearchBlueprintReadyToClaim = (partId) =>
  typeof partId === "string" && droneCraftingState.readyResearchPartIds.has(partId);

const isDroneCraftingPartCrafted = (partId) =>
  typeof partId === "string" && droneCraftingState.craftedPartIds.has(partId);

const isDroneCraftingPartEquipped = (partId) =>
  typeof partId === "string" && droneCraftingState.equippedPartIds.has(partId);

const getDroneCraftingPartById = (partId) =>
  DRONE_CRAFTING_PARTS.find((part) => part.id === partId) ?? null;

const ensureDroneUnlockedModelState = () => {
  if (!(droneCraftingState.unlockedModelIds instanceof Set)) {
    droneCraftingState.unlockedModelIds = new Set([DRONE_LIGHT_MODEL_ID]);
  }
  droneCraftingState.unlockedModelIds.add(DRONE_LIGHT_MODEL_ID);
  return droneCraftingState.unlockedModelIds;
};

const isDroneModelUnlocked = (modelId) => {
  const normalizedModelId = normalizeDroneUnlockModelId(modelId);
  if (!normalizedModelId) {
    return false;
  }
  return ensureDroneUnlockedModelState().has(normalizedModelId);
};

const unlockDroneModel = (modelId) => {
  const normalizedModelId = normalizeDroneUnlockModelId(modelId);
  if (!normalizedModelId) {
    return false;
  }
  const unlockedModelIds = ensureDroneUnlockedModelState();
  if (unlockedModelIds.has(normalizedModelId)) {
    return false;
  }
  unlockedModelIds.add(normalizedModelId);
  return true;
};

const DRONE_CRAFTING_PROGRESS_UPDATE_MS = 200;
const DRONE_RESEARCH_PROGRESS_UPDATE_MS = 1000;

const isDroneCraftingPartReadyToClaim = (partId) =>
  typeof partId === "string" && droneCraftingState.readyPartIds.has(partId);

const isInstantDroneCraftingEnabled = () => Boolean(currentSettings?.godMode);
const isInstantDroneResearchEnabled = () => Boolean(currentSettings?.godMode);

const getDroneResearchDurationSeconds = (part) => {
  if (isInstantDroneResearchEnabled()) {
    return 0;
  }

  const durationMinutes = Number.isFinite(part?.researchDurationMinutes)
    ? Math.max(5, Math.min(60, Math.round(part.researchDurationMinutes)))
    : 5;
  return durationMinutes * 60;
};

const getDroneCraftingPartCraftDurationSeconds = (part) => {
  if (isInstantDroneCraftingEnabled()) {
    return 0;
  }

  const requirements = Array.isArray(part?.requirements) ? part.requirements : [];
  const totalWeightGrams = requirements.reduce((total, requirement) => {
    const needed = Number.isFinite(requirement?.count)
      ? Math.max(1, Math.floor(requirement.count))
      : 1;
    const requirementElement = sanitizeInventoryElement(requirement?.element ?? {});
    const unitWeight = getInventoryElementWeight(requirementElement);
    const normalizedWeight =
      Number.isFinite(unitWeight) && unitWeight > 0
        ? unitWeight
        : DEFAULT_ELEMENT_WEIGHT_GRAMS;
    return total + normalizedWeight * needed;
  }, 0);

  return Math.max(1, Math.ceil(totalWeightGrams));
};

const normalizeDroneCraftingActiveJob = (rawJob) => {
  if (!rawJob || typeof rawJob !== "object") {
    return null;
  }

  const partId = typeof rawJob.partId === "string" ? rawJob.partId.trim() : "";
  if (!partId || !getDroneCraftingPartById(partId)) {
    return null;
  }

  let durationMs = Number(rawJob.durationMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  durationMs = Math.max(1000, Math.floor(durationMs));

  let startedAtMs = Number(rawJob.startedAtMs);
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
    startedAtMs = Date.now();
  }
  startedAtMs = Math.floor(startedAtMs);

  let completedAtMs = Number(rawJob.completedAtMs);
  if (!Number.isFinite(completedAtMs) || completedAtMs <= startedAtMs) {
    completedAtMs = startedAtMs + durationMs;
  }
  completedAtMs = Math.floor(completedAtMs);

  return {
    partId,
    startedAtMs,
    durationMs,
    completedAtMs,
  };
};

const normalizeDroneResearchActiveJob = (rawJob) => {
  if (!rawJob || typeof rawJob !== "object") {
    return null;
  }

  const partId = typeof rawJob.partId === "string" ? rawJob.partId.trim() : "";
  if (!partId || !getDroneCraftingPartById(partId)) {
    return null;
  }

  let durationMs = Number(rawJob.durationMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  durationMs = Math.max(1000, Math.floor(durationMs));

  let startedAtMs = Number(rawJob.startedAtMs);
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
    startedAtMs = Date.now();
  }
  startedAtMs = Math.floor(startedAtMs);

  let completedAtMs = Number(rawJob.completedAtMs);
  if (!Number.isFinite(completedAtMs) || completedAtMs <= startedAtMs) {
    completedAtMs = startedAtMs + durationMs;
  }
  completedAtMs = Math.floor(completedAtMs);

  return {
    partId,
    startedAtMs,
    durationMs,
    completedAtMs,
  };
};

const getDroneResearchActiveJob = () => {
  const normalizedJob = normalizeDroneResearchActiveJob(
    droneCraftingState.activeResearchJob
  );
  if (!normalizedJob) {
    droneCraftingState.activeResearchJob = null;
    return null;
  }

  droneCraftingState.activeResearchJob = normalizedJob;
  return normalizedJob;
};

const getDroneCraftingActiveJob = () => {
  const normalizedJob = normalizeDroneCraftingActiveJob(droneCraftingState.activeJob);
  if (!normalizedJob) {
    droneCraftingState.activeJob = null;
    return null;
  }

  droneCraftingState.activeJob = normalizedJob;
  return normalizedJob;
};

const getDroneCraftingJobProgressState = (job = getDroneCraftingActiveJob()) => {
  if (!job) {
    return null;
  }

  const now = Date.now();
  const durationMs = Math.max(1, Number(job.durationMs) || 1);
  const elapsedMs = Math.max(0, now - job.startedAtMs);
  const remainingMs = Math.max(0, job.completedAtMs - now);
  const progress = Math.max(0, Math.min(1, elapsedMs / durationMs));
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const durationSeconds = Math.max(1, Math.round(durationMs / 1000));

  return {
    progress,
    remainingSeconds,
    durationSeconds,
  };
};

const getDroneResearchJobProgressState = (job = getDroneResearchActiveJob()) => {
  if (!job) {
    return null;
  }

  const now = Date.now();
  const durationMs = Math.max(1, Number(job.durationMs) || 1);
  const elapsedMs = Math.max(0, now - job.startedAtMs);
  const remainingMs = Math.max(0, job.completedAtMs - now);
  const progress = Math.max(0, Math.min(1, elapsedMs / durationMs));
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const durationSeconds = Math.max(1, Math.round(durationMs / 1000));

  return {
    progress,
    remainingSeconds,
    durationSeconds,
  };
};

const stopDroneResearchProgressInterval = () => {
  if (!droneResearchProgressIntervalId) {
    return;
  }

  window.clearInterval(droneResearchProgressIntervalId);
  droneResearchProgressIntervalId = 0;
};

const stopDroneCraftingProgressInterval = () => {
  if (!droneCraftingProgressIntervalId) {
    return;
  }

  window.clearInterval(droneCraftingProgressIntervalId);
  droneCraftingProgressIntervalId = 0;
};

const finalizeDroneCraftingActiveJob = ({
  notify = true,
  refreshUi = true,
} = {}) => {
  const activeJob = getDroneCraftingActiveJob();
  if (!activeJob || Date.now() < activeJob.completedAtMs) {
    return false;
  }

  const part = getDroneCraftingPartById(activeJob.partId);
  droneCraftingState.activeJob = null;

  if (
    part &&
    !isDroneCraftingPartCrafted(part.id) &&
    !isDroneCraftingPartReadyToClaim(part.id)
  ) {
    droneCraftingState.readyPartIds.add(part.id);
  }

  persistDroneCraftingState();
  syncDroneCraftingProgressInterval();

  if (refreshUi) {
    refreshInventoryUi();
    if (droneCustomizationModalActive) {
      renderDroneCustomizationModal();
    }
  }

  if (notify && part) {
    showTerminalToast({
      title: `${part.label} complete`,
      description: "Crafting done. Move the part to Inventory > Items.",
    });
  }

  return true;
};

const finalizeDroneResearchActiveJob = ({
  notify = true,
  refreshUi = true,
} = {}) => {
  const activeJob = getDroneResearchActiveJob();
  if (!activeJob || Date.now() < activeJob.completedAtMs) {
    return false;
  }

  const part = getDroneCraftingPartById(activeJob.partId);
  droneCraftingState.activeResearchJob = null;

  if (
    part &&
    !isDroneCraftingPartResearched(part.id) &&
    !isDroneResearchBlueprintInInventory(part.id) &&
    !isDroneResearchBlueprintReadyToClaim(part.id)
  ) {
    droneCraftingState.readyResearchPartIds.add(part.id);
  }

  persistDroneCraftingState();
  syncDroneResearchProgressInterval();

  if (refreshUi) {
    refreshResearchModalIfOpen();
    refreshCraftingTableModalIfOpen();
  }

  if (notify && part) {
    showTerminalToast({
      title: `${part.label} researched`,
      description: "Research complete. Move the blueprint to Inventory > Items.",
    });
  }

  return true;
};

const completeDroneResearchActiveJobInstantly = ({ notify = true } = {}) => {
  if (!isInstantDroneResearchEnabled()) {
    return false;
  }

  const activeJob = getDroneResearchActiveJob();
  if (!activeJob) {
    return false;
  }

  droneCraftingState.activeResearchJob = {
    ...activeJob,
    completedAtMs: Date.now() - 1,
  };

  const completed = finalizeDroneResearchActiveJob({
    notify,
    refreshUi: true,
  });
  if (completed && researchModalActive) {
    renderResearchModal();
  }
  return completed;
};

const syncDroneResearchProgressInterval = () => {
  const activeJob = getDroneResearchActiveJob();
  if (!activeJob) {
    stopDroneResearchProgressInterval();
    return;
  }

  if (droneResearchProgressIntervalId) {
    return;
  }

  droneResearchProgressIntervalId = window.setInterval(() => {
    const completed = finalizeDroneResearchActiveJob({
      notify: true,
      refreshUi: true,
    });
    if (completed) {
      return;
    }

    if (researchModalActive) {
      renderResearchModal();
    }
  }, DRONE_RESEARCH_PROGRESS_UPDATE_MS);
};

const completeDroneCraftingActiveJobInstantly = ({ notify = true } = {}) => {
  if (!isInstantDroneCraftingEnabled()) {
    return false;
  }

  const activeJob = getDroneCraftingActiveJob();
  if (!activeJob) {
    return false;
  }

  droneCraftingState.activeJob = {
    ...activeJob,
    completedAtMs: Date.now() - 1,
  };

  const completed = finalizeDroneCraftingActiveJob({
    notify,
    refreshUi: true,
  });
  if (completed && craftingTableModalActive) {
    renderCraftingTableModal();
  }
  return completed;
};

const syncDroneCraftingProgressInterval = () => {
  const activeJob = getDroneCraftingActiveJob();
  if (!activeJob) {
    stopDroneCraftingProgressInterval();
    return;
  }

  if (droneCraftingProgressIntervalId) {
    return;
  }

  droneCraftingProgressIntervalId = window.setInterval(() => {
    const completed = finalizeDroneCraftingActiveJob({
      notify: true,
      refreshUi: true,
    });
    if (completed) {
      return;
    }

    if (craftingTableModalActive) {
      renderCraftingTableModal();
    }
  }, DRONE_CRAFTING_PROGRESS_UPDATE_MS);
};

const normalizeCostumeResearchActiveJob = (rawJob) => {
  if (!rawJob || typeof rawJob !== "object") {
    return null;
  }

  const projectId =
    typeof rawJob.projectId === "string" ? rawJob.projectId.trim() : "";
  if (!projectId || !getCostumeResearchProjectById(projectId)) {
    return null;
  }

  let durationMs = Number(rawJob.durationMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  durationMs = Math.max(1000, Math.floor(durationMs));

  let startedAtMs = Number(rawJob.startedAtMs);
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
    startedAtMs = Date.now();
  }
  startedAtMs = Math.floor(startedAtMs);

  let completedAtMs = Number(rawJob.completedAtMs);
  if (!Number.isFinite(completedAtMs) || completedAtMs <= startedAtMs) {
    completedAtMs = startedAtMs + durationMs;
  }
  completedAtMs = Math.floor(completedAtMs);

  return {
    projectId,
    startedAtMs,
    durationMs,
    completedAtMs,
  };
};

const getCostumeResearchActiveJob = () => {
  const normalizedJob = normalizeCostumeResearchActiveJob(costumeResearchState.activeJob);
  if (!normalizedJob) {
    costumeResearchState.activeJob = null;
    return null;
  }

  costumeResearchState.activeJob = normalizedJob;
  return normalizedJob;
};

const getCostumeResearchJobProgressState = (job = getCostumeResearchActiveJob()) => {
  if (!job) {
    return null;
  }

  const now = Date.now();
  const durationMs = Math.max(1, Number(job.durationMs) || 1);
  const elapsedMs = Math.max(0, now - job.startedAtMs);
  const remainingMs = Math.max(0, job.completedAtMs - now);
  const progress = Math.max(0, Math.min(1, elapsedMs / durationMs));
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const durationSeconds = Math.max(1, Math.round(durationMs / 1000));

  return {
    progress,
    remainingSeconds,
    durationSeconds,
  };
};

const getResearchLabActiveJob = () => {
  const costumeJob = getCostumeResearchActiveJob();
  if (costumeJob) {
    return {
      type: "costume",
      id: costumeJob.projectId,
      job: costumeJob,
    };
  }

  const droneJob = getDroneResearchActiveJob();
  if (droneJob) {
    return {
      type: "drone",
      id: droneJob.partId,
      job: droneJob,
    };
  }

  return null;
};

const getResearchLabJobLabel = (activeResearchJob = getResearchLabActiveJob()) => {
  if (!activeResearchJob) {
    return "Research";
  }

  if (activeResearchJob.type === "costume") {
    return (
      getCostumeResearchProjectById(activeResearchJob.id)?.label ?? "Costume research"
    );
  }

  return getDroneCraftingPartById(activeResearchJob.id)?.label ?? "Drone research";
};

const getResearchLabJobProgressState = (
  activeResearchJob = getResearchLabActiveJob()
) => {
  if (!activeResearchJob) {
    return null;
  }

  return activeResearchJob.type === "costume"
    ? getCostumeResearchJobProgressState(activeResearchJob.job)
    : getDroneResearchJobProgressState(activeResearchJob.job);
};

const refundResearchRequirements = (requirements) => {
  const normalizedRequirements = Array.isArray(requirements) ? requirements : [];
  let inventoryRefundedCount = 0;
  let storageRefundedCount = 0;
  let lostCount = 0;

  normalizedRequirements.forEach((requirement) => {
    const refundCount = Number.isFinite(requirement?.count)
      ? Math.max(1, Math.floor(requirement.count))
      : 1;

    for (let iteration = 0; iteration < refundCount; iteration += 1) {
      if (recordInventoryResource({ element: requirement?.element })) {
        inventoryRefundedCount += 1;
        continue;
      }

      if (recordStorageBoxResource(requirement?.element, 1)) {
        storageRefundedCount += 1;
        continue;
      }

      lostCount += 1;
    }
  });

  return {
    inventoryRefundedCount,
    storageRefundedCount,
    lostCount,
  };
};

const ensureSingleResearchLabJob = ({ notify = false, refreshUi = true } = {}) => {
  const costumeJob = getCostumeResearchActiveJob();
  const droneJob = getDroneResearchActiveJob();

  if (!costumeJob || !droneJob) {
    return false;
  }

  const keepCostumeJob = costumeJob.startedAtMs <= droneJob.startedAtMs;
  const cancelledResearch = keepCostumeJob
    ? {
        type: "drone",
        label: getDroneCraftingPartById(droneJob.partId)?.label ?? "Drone research",
        requirements: getDroneCraftingPartById(droneJob.partId)?.researchRequirements,
      }
    : {
        type: "costume",
        label:
          getCostumeResearchProjectById(costumeJob.projectId)?.label ?? "Costume research",
        requirements:
          getCostumeResearchProjectById(costumeJob.projectId)?.researchRequirements,
      };

  if (keepCostumeJob) {
    droneCraftingState.activeResearchJob = null;
  } else {
    costumeResearchState.activeJob = null;
  }

  const refundResult = refundResearchRequirements(cancelledResearch.requirements);
  persistDroneCraftingState();
  syncCostumeResearchProgressInterval();
  syncDroneResearchProgressInterval();

  if (refreshUi) {
    refreshInventoryUi();
    refreshResearchModalIfOpen();
    refreshCraftingTableModalIfOpen();
  }

  if (notify) {
    const refundSegments = [];
    if (refundResult.inventoryRefundedCount > 0) {
      refundSegments.push(`${refundResult.inventoryRefundedCount} returned to inventory`);
    }
    if (refundResult.storageRefundedCount > 0) {
      refundSegments.push(`${refundResult.storageRefundedCount} moved to storage`);
    }
    if (refundResult.lostCount > 0) {
      refundSegments.push(`${refundResult.lostCount} could not be refunded`);
    }

    showTerminalToast({
      title: "Research lab conflict resolved",
      description: `${cancelledResearch.label} was cancelled to keep one active lab job${
        refundSegments.length > 0 ? `. ${refundSegments.join(", ")}.` : "."
      }`,
    });
  }

  return true;
};

const stopCostumeResearchProgressInterval = () => {
  if (!costumeResearchProgressIntervalId) {
    return;
  }

  window.clearInterval(costumeResearchProgressIntervalId);
  costumeResearchProgressIntervalId = 0;
};

const isInstantCostumeResearchEnabled = () => Boolean(currentSettings?.godMode);

const getCostumeResearchDurationSeconds = (project) => {
  if (isInstantCostumeResearchEnabled()) {
    return 0;
  }

  const durationMinutes = Number.isFinite(project?.researchDurationMinutes)
    ? Math.max(5, Math.min(60, Math.round(project.researchDurationMinutes)))
    : 5;
  return durationMinutes * 60;
};

const getCostumeResearchRequirementStates = (project) =>
  getElementRequirementStates(project?.researchRequirements);

const formatCostumeResearchEffectLabel = (project) => {
  if (Number.isFinite(project?.maxOxygenBonus) && project.maxOxygenBonus > 0) {
    return `Max oxygen +${Math.round(project.maxOxygenBonus * 100)}%`;
  }
  if (
    Number.isFinite(project?.oxygenConsumptionReduction) &&
    project.oxygenConsumptionReduction > 0
  ) {
    return `Oxygen consumption -${Math.round(project.oxygenConsumptionReduction * 100)}%`;
  }
  if (Number.isFinite(project?.moveSpeedBonus) && project.moveSpeedBonus > 0) {
    return `Move speed +${Math.round(project.moveSpeedBonus * 100)}%`;
  }
  if (Number.isFinite(project?.jumpBonus) && project.jumpBonus > 0) {
    return `Jump height +${Math.round(project.jumpBonus * 100)}%`;
  }
  return "Permanent suit upgrade.";
};

const getCostumeResearchSummaryText = () =>
  `O2 max ${getCostumeMaxOxygenMultiplier().toFixed(2)}x • O2 use ${getCostumeOxygenConsumptionMultiplier().toFixed(
    2
  )}x • Speed ${getCostumeMoveSpeedMultiplier().toFixed(2)}x • Jump ${getCostumeJumpMultiplier().toFixed(2)}x`;

const getCostumeCraftRequirements = (project) =>
  Array.isArray(project?.craftRequirements) && project.craftRequirements.length > 0
    ? project.craftRequirements
    : Array.isArray(project?.researchRequirements)
      ? project.researchRequirements
      : [];

const getCostumeCraftRequirementStates = (project) =>
  getElementRequirementStates(getCostumeCraftRequirements(project));

const finalizeCostumeResearchActiveJob = ({ notify = true, refreshUi = true } = {}) => {
  const activeJob = getCostumeResearchActiveJob();
  if (!activeJob || Date.now() < activeJob.completedAtMs) {
    return false;
  }

  const project = getCostumeResearchProjectById(activeJob.projectId);
  costumeResearchState.activeJob = null;

  if (
    project &&
    !isCostumeResearchProjectCompleted(project.id) &&
    !isCostumeResearchBlueprintLoaded(project.id) &&
    !isCostumeResearchBlueprintInInventory(project.id)
  ) {
    costumeResearchState.readyResearchProjectIds.add(project.id);
  }

  persistDroneCraftingState();
  syncCostumeResearchProgressInterval();
  if (refreshUi) {
    refreshInventoryUi();
    refreshResearchModalIfOpen();
    refreshCraftingTableModalIfOpen();
  }

  if (notify && project) {
    showTerminalToast({
      title: `${project.label} complete`,
      description: "Research complete. Move the blueprint to Inventory > Items.",
    });
  }

  return true;
};

const completeCostumeResearchActiveJobInstantly = ({ notify = true } = {}) => {
  if (!isInstantCostumeResearchEnabled()) {
    return false;
  }

  const activeJob = getCostumeResearchActiveJob();
  if (!activeJob) {
    return false;
  }

  costumeResearchState.activeJob = {
    ...activeJob,
    completedAtMs: Date.now() - 1,
  };

  return finalizeCostumeResearchActiveJob({
    notify,
    refreshUi: true,
  });
};

const syncCostumeResearchProgressInterval = () => {
  const activeJob = getCostumeResearchActiveJob();
  if (!activeJob) {
    stopCostumeResearchProgressInterval();
    return;
  }

  if (costumeResearchProgressIntervalId) {
    return;
  }

  costumeResearchProgressIntervalId = window.setInterval(() => {
    const completed = finalizeCostumeResearchActiveJob({
      notify: true,
      refreshUi: true,
    });
    if (completed) {
      return;
    }

    if (researchModalActive) {
      renderResearchModal();
    }
  }, COSTUME_RESEARCH_PROGRESS_UPDATE_MS);
};

const moveCostumeResearchBlueprintToInventory = (projectId) => {
  const project = getCostumeResearchProjectById(projectId);
  if (!project || !isCostumeResearchBlueprintReadyToClaim(project.id)) {
    return false;
  }

  costumeResearchState.readyResearchProjectIds.delete(project.id);
  costumeResearchState.inventoryResearchProjectIds.add(project.id);
  persistDroneCraftingState();
  refreshInventoryUi();
  refreshResearchModalIfOpen();
  refreshCraftingTableModalIfOpen();

  showTerminalToast({
    title: `${project.label} blueprint stored`,
    description: "Blueprint moved to Inventory > Items. Load it at the Crafting Table.",
  });
  return true;
};

const loadCostumeResearchBlueprintToCraftingTable = (projectId) => {
  const project = getCostumeResearchProjectById(projectId);
  if (!project || !isCostumeResearchBlueprintInInventory(project.id)) {
    return false;
  }

  costumeResearchState.inventoryResearchProjectIds.delete(project.id);
  costumeResearchState.researchedProjectIds.add(project.id);
  persistDroneCraftingState();
  refreshInventoryUi();
  refreshResearchModalIfOpen();
  refreshCraftingTableModalIfOpen();

  showTerminalToast({
    title: `${project.label} loaded`,
    description: "Blueprint loaded into the Crafting Table. You can craft this suit upgrade now.",
  });
  return true;
};

const stopCostumeCraftingProgressInterval = () => {
  if (!costumeCraftingProgressIntervalId) {
    return;
  }

  window.clearInterval(costumeCraftingProgressIntervalId);
  costumeCraftingProgressIntervalId = 0;
};

const isInstantCostumeCraftingEnabled = () => Boolean(currentSettings?.godMode);

const getCostumeCraftDurationSeconds = (project) => {
  if (isInstantCostumeCraftingEnabled()) {
    return 0;
  }

  const totalWeightGrams = getCraftingRequirementsTotalWeightGrams(
    getCostumeCraftRequirements(project)
  );
  return Math.max(1, Math.ceil(totalWeightGrams));
};

const normalizeCostumeCraftingActiveJob = (rawJob) => {
  if (!rawJob || typeof rawJob !== "object") {
    return null;
  }

  const projectId =
    typeof rawJob.projectId === "string" ? rawJob.projectId.trim() : "";
  if (!projectId || !getCostumeResearchProjectById(projectId)) {
    return null;
  }

  let durationMs = Number(rawJob.durationMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  durationMs = Math.max(1000, Math.floor(durationMs));

  let startedAtMs = Number(rawJob.startedAtMs);
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
    startedAtMs = Date.now();
  }
  startedAtMs = Math.floor(startedAtMs);

  let completedAtMs = Number(rawJob.completedAtMs);
  if (!Number.isFinite(completedAtMs) || completedAtMs <= startedAtMs) {
    completedAtMs = startedAtMs + durationMs;
  }
  completedAtMs = Math.floor(completedAtMs);

  return {
    projectId,
    startedAtMs,
    durationMs,
    completedAtMs,
  };
};

const getCostumeCraftingActiveJob = () => {
  const normalizedJob = normalizeCostumeCraftingActiveJob(costumeResearchState.activeCraftJob);
  if (!normalizedJob) {
    costumeResearchState.activeCraftJob = null;
    return null;
  }

  costumeResearchState.activeCraftJob = normalizedJob;
  return normalizedJob;
};

const getCostumeCraftingJobProgressState = (
  job = getCostumeCraftingActiveJob()
) => {
  if (!job) {
    return null;
  }

  const now = Date.now();
  const durationMs = Math.max(1, Number(job.durationMs) || 1);
  const elapsedMs = Math.max(0, now - job.startedAtMs);
  const remainingMs = Math.max(0, job.completedAtMs - now);
  const progress = Math.max(0, Math.min(1, elapsedMs / durationMs));
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const durationSeconds = Math.max(1, Math.round(durationMs / 1000));

  return {
    progress,
    remainingSeconds,
    durationSeconds,
  };
};

const getCraftingTableActiveJob = () => {
  const costumeJob = getCostumeCraftingActiveJob();
  if (costumeJob) {
    return {
      type: "costume",
      id: costumeJob.projectId,
      job: costumeJob,
    };
  }

  const droneJob = getDroneCraftingActiveJob();
  if (droneJob) {
    return {
      type: "drone",
      id: droneJob.partId,
      job: droneJob,
    };
  }

  return null;
};

const getCraftingTableJobLabel = (activeJob = getCraftingTableActiveJob()) => {
  if (!activeJob) {
    return "Crafting";
  }

  if (activeJob.type === "costume") {
    return (
      getCostumeResearchProjectById(activeJob.id)?.label ?? "Costume upgrade"
    );
  }

  return getDroneCraftingPartById(activeJob.id)?.label ?? "Drone part";
};

const getCraftingTableJobProgressState = (activeJob = getCraftingTableActiveJob()) => {
  if (!activeJob) {
    return null;
  }

  return activeJob.type === "costume"
    ? getCostumeCraftingJobProgressState(activeJob.job)
    : getDroneCraftingJobProgressState(activeJob.job);
};

const finalizeCostumeCraftingActiveJob = ({ notify = true, refreshUi = true } = {}) => {
  const activeJob = getCostumeCraftingActiveJob();
  if (!activeJob || Date.now() < activeJob.completedAtMs) {
    return false;
  }

  const project = getCostumeResearchProjectById(activeJob.projectId);
  costumeResearchState.activeCraftJob = null;

  if (project && !isCostumeResearchProjectCompleted(project.id)) {
    costumeResearchState.readyProjectIds.add(project.id);
  }

  persistDroneCraftingState();
  syncCostumeCraftingProgressInterval();
  if (refreshUi) {
    refreshInventoryUi();
    refreshResearchModalIfOpen();
    refreshCraftingTableModalIfOpen();
  }

  if (notify && project) {
    showTerminalToast({
      title: `${project.label} complete`,
      description: "Crafting done. Move the suit upgrade to Inventory > Items.",
    });
  }

  return true;
};

const completeCostumeCraftingActiveJobInstantly = ({ notify = true } = {}) => {
  if (!isInstantCostumeCraftingEnabled()) {
    return false;
  }

  const activeJob = getCostumeCraftingActiveJob();
  if (!activeJob) {
    return false;
  }

  costumeResearchState.activeCraftJob = {
    ...activeJob,
    completedAtMs: Date.now() - 1,
  };

  return finalizeCostumeCraftingActiveJob({
    notify,
    refreshUi: true,
  });
};

const syncCostumeCraftingProgressInterval = () => {
  const activeJob = getCostumeCraftingActiveJob();
  if (!activeJob) {
    stopCostumeCraftingProgressInterval();
    return;
  }

  if (costumeCraftingProgressIntervalId) {
    return;
  }

  costumeCraftingProgressIntervalId = window.setInterval(() => {
    const completed = finalizeCostumeCraftingActiveJob({
      notify: true,
      refreshUi: true,
    });
    if (completed) {
      return;
    }

    if (craftingTableModalActive) {
      renderCraftingTableModal();
    }
  }, COSTUME_RESEARCH_PROGRESS_UPDATE_MS);
};

const startCostumeResearch = (projectId) => {
  const project = getCostumeResearchProjectById(projectId);
  if (!project) {
    return false;
  }

  if (isCostumeResearchProjectCompleted(project.id)) {
    showTerminalToast({
      title: "Already installed",
      description: `${project.label} is already active on the suit.`,
    });
    return false;
  }

  if (isCostumeResearchProjectCrafted(project.id)) {
    showTerminalToast({
      title: "Already crafted",
      description: `${project.label} is already built. Install it in Costume Setup.`,
    });
    return false;
  }

  if (isCostumeResearchBlueprintLoaded(project.id)) {
    showTerminalToast({
      title: "Already researched",
      description: `${project.label} is already loaded into the Crafting Table.`,
    });
    return false;
  }

  if (isCostumeResearchBlueprintInInventory(project.id)) {
    showTerminalToast({
      title: "Blueprint in inventory",
      description: `${project.label} is already in Inventory > Items. Load it at the Crafting Table.`,
    });
    return false;
  }

  if (isCostumeResearchBlueprintReadyToClaim(project.id)) {
    showTerminalToast({
      title: "Ready to collect",
      description: `${project.label} research is complete. Move the blueprint to Inventory > Items.`,
    });
    return false;
  }

  const requiredProject = getCostumeResearchRequiredProject(project);
  if (requiredProject && !isCostumeResearchProjectUnlocked(project)) {
    showTerminalToast({
      title: "Previous tier required",
      description: `Research ${requiredProject.label} first.`,
    });
    refreshResearchModalIfOpen();
    return false;
  }

  ensureSingleResearchLabJob({ notify: false, refreshUi: false });
  finalizeCostumeResearchActiveJob({ notify: true, refreshUi: false });
  finalizeDroneResearchActiveJob({ notify: true, refreshUi: false });
  ensureSingleResearchLabJob({ notify: false, refreshUi: false });
  const activeResearchJob = getResearchLabActiveJob();
  if (activeResearchJob) {
    if (activeResearchJob.type === "costume" && activeResearchJob.id === project.id) {
      const progressState = getResearchLabJobProgressState(activeResearchJob);
      showTerminalToast({
        title: "Research in progress",
        description: `${project.label} will finish in ${formatDurationSeconds(
          progressState?.remainingSeconds ?? 0
        )}.`,
      });
      return false;
    }

    showTerminalToast({
      title: "Research lab busy",
      description: `${getResearchLabJobLabel(activeResearchJob)} is currently running.`,
    });
    return false;
  }

  const requirementStates = getCostumeResearchRequirementStates(project);
  const missingRequirement = requirementStates.find((state) => !state.ready);
  if (missingRequirement) {
    showTerminalToast({
      title: "Missing research materials",
      description: `${formatCraftingElementName(
        missingRequirement.requirement?.element
      )}: ${missingRequirement.available}/${missingRequirement.needed}.`,
    });
    refreshResearchModalIfOpen();
    return false;
  }

  for (const requirementState of requirementStates) {
    const spent = spendInventoryResource(
      requirementState.requirement?.element,
      requirementState.needed
    );
    if (!spent) {
      showTerminalToast({
        title: "Research failed",
        description: "Inventory changed while starting the experiment. Try again.",
      });
      refreshResearchModalIfOpen();
      return false;
    }
  }

  const researchDurationSeconds = getCostumeResearchDurationSeconds(project);
  if (researchDurationSeconds <= 0) {
    costumeResearchState.readyResearchProjectIds.add(project.id);
    costumeResearchState.activeJob = null;
    persistDroneCraftingState();
    refreshInventoryUi();
    refreshResearchModalIfOpen();
    refreshCraftingTableModalIfOpen();
    showTerminalToast({
      title: `${project.label} researched`,
      description: "God mode instant research. Move the blueprint to Inventory > Items.",
    });
    return true;
  }

  const startedAtMs = Date.now();
  const durationMs = Math.max(1000, researchDurationSeconds * 1000);
  costumeResearchState.activeJob = {
    projectId: project.id,
    startedAtMs,
    durationMs,
    completedAtMs: startedAtMs + durationMs,
  };
  persistDroneCraftingState();
  syncCostumeResearchProgressInterval();
  refreshResearchModalIfOpen();

  showTerminalToast({
    title: `${project.label} started`,
    description: `Research time: ${formatDurationSeconds(
      researchDurationSeconds
    )}. Materials were consumed by the lab.`,
  });
  return true;
};

const craftCostumeUpgradeProject = (projectId) => {
  const project = getCostumeResearchProjectById(projectId);
  if (!project) {
    return false;
  }

  if (!isCostumeResearchBlueprintLoaded(project.id)) {
    if (isCostumeResearchBlueprintReadyToClaim(project.id)) {
      showTerminalToast({
        title: "Research complete",
        description: `${project.label} is ready in Research Nexus. Move the blueprint to Inventory > Items first.`,
      });
    } else if (isCostumeResearchBlueprintInInventory(project.id)) {
      showTerminalToast({
        title: "Blueprint in inventory",
        description: `${project.label} is in Inventory > Items. Load it into the Crafting Table first.`,
      });
    } else {
      showTerminalToast({
        title: "Research required",
        description: `${project.label} must be researched first in Command Center > Research Nexus.`,
      });
    }
    return false;
  }

  if (isCostumeCraftingProjectReadyToClaim(project.id)) {
    showTerminalToast({
      title: "Ready to collect",
      description: `${project.label} is complete. Move it to Inventory > Items.`,
    });
    return false;
  }

  if (isCostumeResearchProjectCrafted(project.id)) {
    showTerminalToast({
      title: "Already crafted",
      description: `${project.label} is already built. Install it in Costume Setup.`,
    });
    return false;
  }

  if (isCostumeResearchProjectCompleted(project.id)) {
    showTerminalToast({
      title: "Already installed",
      description: `${project.label} is already active on the suit.`,
    });
    return false;
  }

  finalizeCostumeCraftingActiveJob({ notify: true, refreshUi: false });
  finalizeDroneCraftingActiveJob({ notify: true, refreshUi: false });
  const activeJob = getCraftingTableActiveJob();
  if (activeJob) {
    if (activeJob.type === "costume" && activeJob.id === project.id) {
      const progressState = getCraftingTableJobProgressState(activeJob);
      showTerminalToast({
        title: "Craft in progress",
        description: `${project.label} will finish in ${formatDurationSeconds(
          progressState?.remainingSeconds ?? 0
        )}.`,
      });
      return false;
    }

    showTerminalToast({
      title: "Crafting table busy",
      description: `${getCraftingTableJobLabel(activeJob)} is currently crafting.`,
    });
    return false;
  }

  const requirementStates = getCostumeCraftRequirementStates(project);
  const missingRequirement = requirementStates.find((state) => !state.ready);
  if (missingRequirement) {
    showTerminalToast({
      title: "Missing materials",
      description: `${formatCraftingElementName(
        missingRequirement.requirement?.element
      )}: ${missingRequirement.available}/${missingRequirement.needed}.`,
    });
    refreshCraftingTableModalIfOpen();
    return false;
  }

  for (const requirementState of requirementStates) {
    const spent = spendInventoryResource(
      requirementState.requirement?.element,
      requirementState.needed
    );
    if (!spent) {
      showTerminalToast({
        title: "Crafting failed",
        description: "Inventory changed while crafting. Try again.",
      });
      refreshCraftingTableModalIfOpen();
      return false;
    }
  }

  const craftDurationSeconds = getCostumeCraftDurationSeconds(project);
  if (craftDurationSeconds <= 0) {
    costumeResearchState.activeCraftJob = null;
    costumeResearchState.readyProjectIds.add(project.id);
    persistDroneCraftingState();
    syncCostumeCraftingProgressInterval();
    refreshInventoryUi();
    refreshCraftingTableModalIfOpen();
    showTerminalToast({
      title: `${project.label} complete`,
      description: "God mode instant craft. Move it to Inventory > Items.",
    });
    return true;
  }

  const startedAtMs = Date.now();
  const durationMs = Math.max(1000, craftDurationSeconds * 1000);
  costumeResearchState.activeCraftJob = {
    projectId: project.id,
    startedAtMs,
    durationMs,
    completedAtMs: startedAtMs + durationMs,
  };
  persistDroneCraftingState();
  syncCostumeCraftingProgressInterval();
  refreshInventoryUi();
  refreshCraftingTableModalIfOpen();

  showTerminalToast({
    title: `${project.label} started`,
    description: `Crafting time: ${formatDurationSeconds(
      craftDurationSeconds
    )}. Move it to Inventory after completion.`,
  });
  return true;
};

const moveCraftedCostumeProjectToInventory = (projectId) => {
  const project = getCostumeResearchProjectById(projectId);
  if (!project) {
    return false;
  }

  finalizeCostumeCraftingActiveJob({ notify: true, refreshUi: false });

  if (isCostumeResearchProjectCompleted(project.id)) {
    showTerminalToast({
      title: "Already installed",
      description: `${project.label} is already active on the suit.`,
    });
    return false;
  }

  if (isCostumeResearchProjectCrafted(project.id)) {
    showTerminalToast({
      title: "Already in inventory",
      description: `${project.label} can be installed in Costume Setup.`,
    });
    return false;
  }

  if (!isCostumeCraftingProjectReadyToClaim(project.id)) {
    const activeJob = getCostumeCraftingActiveJob();
    if (activeJob && activeJob.projectId === project.id) {
      const progressState = getCostumeCraftingJobProgressState(activeJob);
      showTerminalToast({
        title: "Still crafting",
        description: `${project.label} will be ready in ${formatDurationSeconds(
          progressState?.remainingSeconds ?? 0
        )}.`,
      });
    }
    return false;
  }

  costumeResearchState.readyProjectIds.delete(project.id);
  costumeResearchState.researchedProjectIds.add(project.id);
  costumeResearchState.craftedProjectIds.add(project.id);
  persistDroneCraftingState();
  refreshInventoryUi();
  refreshResearchModalIfOpen();
  refreshCraftingTableModalIfOpen();
  refreshCostumeCustomizationModalIfOpen();

  showTerminalToast({
    title: `${project.label} added`,
    description: "Now available in Inventory > Items and Costume Setup.",
  });
  return true;
};

const getDroneCraftingSpeedMultiplier = () =>
  DRONE_CRAFTING_PARTS.reduce((multiplier, part) => {
    if (!isDroneCraftingPartEquipped(part.id)) {
      return multiplier;
    }

    const bonus = Number.isFinite(part?.speedBonus) ? Math.max(0, part.speedBonus) : 0;
    return multiplier + bonus;
  }, 1);

const getDroneCraftingMiningSuccessChanceBonus = () => {
  const bonus = DRONE_CRAFTING_PARTS.reduce((chance, part) => {
    if (!isDroneCraftingPartEquipped(part.id)) {
      return chance;
    }

    const partBonus = Number.isFinite(part?.successChanceBonus)
      ? Math.max(0, part.successChanceBonus)
      : 0;
    return chance + partBonus;
  }, 0);

  return Math.max(0, Math.min(0.9, bonus));
};

const getDroneCraftingDoubleYieldChance = () => {
  const bonus = DRONE_CRAFTING_PARTS.reduce((chance, part) => {
    if (!isDroneCraftingPartEquipped(part.id)) {
      return chance;
    }

    const partBonus = Number.isFinite(part?.doubleYieldChance)
      ? Math.max(0, part.doubleYieldChance)
      : 0;
    return chance + partBonus;
  }, 0);

  return Math.max(0, Math.min(0.9, bonus));
};

const getDroneCraftingDurationMultiplier = () => {
  const speedMultiplier = getDroneCraftingSpeedMultiplier();
  if (!Number.isFinite(speedMultiplier) || speedMultiplier <= 0) {
    return 1;
  }

  return 1 / speedMultiplier;
};

const syncDroneMiningSpeedBonusWithScene = () => {
  const durationMultiplier = getDroneCraftingDurationMultiplier();
  sceneController?.setDroneMinerActionDurationMultiplier?.(durationMultiplier);
  return durationMultiplier;
};

const formatDronePartEffectLabel = (part) => {
  const segments = [];

  if (Number.isFinite(part?.speedBonus) && part.speedBonus > 0) {
    segments.push(`Mining speed +${Math.round(part.speedBonus * 100)}%`);
  }

  if (Number.isFinite(part?.successChanceBonus) && part.successChanceBonus > 0) {
    segments.push(`Success chance +${Math.round(part.successChanceBonus * 100)}%`);
  }

  if (Number.isFinite(part?.doubleYieldChance) && part.doubleYieldChance > 0) {
    segments.push(`Double mine chance +${Math.round(part.doubleYieldChance * 100)}%`);
  }

  return segments.join(" • ") || "No bonus effect.";
};

const getInstalledDroneBonusSummaryText = () => {
  const speedMultiplier = getDroneCraftingSpeedMultiplier();
  const speedBonusPercent = Math.round((speedMultiplier - 1) * 100);
  const successBonusPercent = Math.round(
    getDroneCraftingMiningSuccessChanceBonus() * 100
  );
  const doubleYieldPercent = Math.round(getDroneCraftingDoubleYieldChance() * 100);

  return `Speed +${speedBonusPercent}% (${speedMultiplier.toFixed(
    2
  )}x) • Success +${successBonusPercent}% • Double +${doubleYieldPercent}%`;
};

const formatCraftingElementName = (element) => {
  const symbol =
    typeof element?.symbol === "string" ? element.symbol.trim() : "";
  const name = typeof element?.name === "string" ? element.name.trim() : "";

  if (symbol && name) {
    return `${symbol} (${name})`;
  }

  if (symbol || name) {
    return symbol || name;
  }

  return "Unknown resource";
};

const getElementRequirementStates = (requirements) =>
  (Array.isArray(requirements) ? requirements : []).map((requirement) => {
    const needed = Number.isFinite(requirement?.count)
      ? Math.max(1, Math.floor(requirement.count))
      : 1;
    const available = getInventoryResourceCount(requirement?.element);
    return {
      requirement,
      needed,
      available,
      ready: available >= needed,
    };
  });

const getDroneResearchRequirementStates = (part) =>
  getElementRequirementStates(part?.researchRequirements);

const renderResearchProgressBlock = (item, progressState, labelPrefix = "Researching") => {
  if (!progressState || !(item instanceof HTMLElement)) {
    return;
  }

  const progressContainer = document.createElement("div");
  progressContainer.className = "crafting-panel__progress";

  const progressTrack = document.createElement("div");
  progressTrack.className = "crafting-panel__progress-track";
  progressTrack.setAttribute("role", "progressbar");
  progressTrack.setAttribute("aria-valuemin", "0");
  progressTrack.setAttribute("aria-valuemax", "100");
  progressTrack.setAttribute(
    "aria-valuenow",
    String(Math.round(progressState.progress * 100))
  );

  const progressBar = document.createElement("span");
  progressBar.className = "crafting-panel__progress-bar";
  progressBar.style.width = `${Math.round(progressState.progress * 100)}%`;
  progressTrack.appendChild(progressBar);
  progressContainer.appendChild(progressTrack);

  const progressMeta = document.createElement("p");
  progressMeta.className = "crafting-panel__meta";
  progressMeta.textContent = `${labelPrefix}... ${formatDurationSeconds(
    progressState.remainingSeconds
  )} remaining`;
  progressContainer.appendChild(progressMeta);

  item.appendChild(progressContainer);
};

const moveResearchedBlueprintToInventory = (partId) => {
  const part = getDroneCraftingPartById(partId);
  if (!part || !isDroneResearchBlueprintReadyToClaim(part.id)) {
    return false;
  }

  droneCraftingState.readyResearchPartIds.delete(part.id);
  droneCraftingState.inventoryResearchPartIds.add(part.id);
  persistDroneCraftingState();
  refreshInventoryUi();
  refreshResearchModalIfOpen();
  refreshCraftingTableModalIfOpen();

  showTerminalToast({
    title: `${part.label} blueprint stored`,
    description: "Blueprint moved to Inventory > Items. Load it at the Crafting Table.",
  });
  return true;
};

const loadResearchBlueprintToCraftingTable = (partId) => {
  const part = getDroneCraftingPartById(partId);
  if (!part || !isDroneResearchBlueprintInInventory(part.id)) {
    return false;
  }

  droneCraftingState.inventoryResearchPartIds.delete(part.id);
  droneCraftingState.researchedPartIds.add(part.id);
  persistDroneCraftingState();
  refreshInventoryUi();
  refreshResearchModalIfOpen();
  refreshCraftingTableModalIfOpen();

  showTerminalToast({
    title: `${part.label} loaded`,
    description: "Blueprint loaded into the Crafting Table. You can craft this part now.",
  });
  return true;
};

const createResearchNexusPartCard = (part) => {
  const item = document.createElement("li");
  item.className = "crafting-panel__card research-panel__card";
  item.dataset.researchPartId = part.id;

  const loadedToCraftingTable = isDroneCraftingPartResearched(part.id);
  const storedInInventory = isDroneResearchBlueprintInInventory(part.id);
  const readyToClaim = isDroneResearchBlueprintReadyToClaim(part.id);
  const activeResearchJob = getResearchLabActiveJob();
  const researchingThisPart = Boolean(
    activeResearchJob &&
      activeResearchJob.type === "drone" &&
      activeResearchJob.id === part.id
  );
  const otherResearchActive = Boolean(activeResearchJob && !researchingThisPart);
  const requirementStates = getDroneResearchRequirementStates(part);
  const canResearch = requirementStates.every((state) => state.ready);
  const researchDurationSeconds = getDroneResearchDurationSeconds(part);

  item.dataset.researched = loadedToCraftingTable ? "true" : "false";
  item.dataset.researching = researchingThisPart ? "true" : "false";

  const status = document.createElement("p");
  status.className = "quick-access-modal__status-tag research-panel__status";
  if (loadedToCraftingTable) {
    status.textContent = "Loaded";
  } else if (storedInInventory) {
    status.dataset.status = "busy";
    status.textContent = "Inventory";
  } else if (readyToClaim) {
    status.dataset.status = "busy";
    status.textContent = "Complete";
  } else if (researchingThisPart) {
    status.dataset.status = "busy";
    status.textContent = "Researching";
  } else if (otherResearchActive) {
    status.dataset.status = "busy";
    status.textContent = "Busy";
  } else if (canResearch) {
    status.textContent = "Available";
  } else {
    status.dataset.status = "locked";
    status.textContent = "Locked";
  }
  item.appendChild(status);

  const title = document.createElement("h3");
  title.className = "crafting-panel__title";
  title.textContent = part.label;
  item.appendChild(title);

  const description = document.createElement("p");
  description.className = "crafting-panel__description";
  description.textContent = part.description;
  item.appendChild(description);

  const effect = document.createElement("p");
  effect.className = "crafting-panel__effect";
  effect.textContent = formatDronePartEffectLabel(part);
  item.appendChild(effect);

  if (loadedToCraftingTable) {
    const researchedMeta = document.createElement("p");
    researchedMeta.className = "crafting-panel__meta";
    researchedMeta.textContent =
      "Blueprint loaded into the Crafting Table. This part can now be built here.";
    item.appendChild(researchedMeta);
  } else if (storedInInventory) {
    const inventoryMeta = document.createElement("p");
    inventoryMeta.className = "crafting-panel__meta";
    inventoryMeta.textContent =
      "Blueprint is in Inventory > Items. Open the Crafting Table to load it.";
    item.appendChild(inventoryMeta);
  } else if (readyToClaim) {
    const readyMeta = document.createElement("p");
    readyMeta.className = "crafting-panel__meta";
    readyMeta.textContent =
      "Research complete. Move the blueprint into Inventory > Items before loading it to the Crafting Table.";
    item.appendChild(readyMeta);
  } else {
    const requirements = document.createElement("ul");
    requirements.className = "crafting-panel__requirements";

    requirementStates.forEach(({ requirement, needed, available, ready }) => {
      const requirementItem = document.createElement("li");
      requirementItem.className = "crafting-panel__requirement";
      requirementItem.dataset.ready = ready ? "true" : "false";
      requirementItem.textContent = `Research cost • ${formatCraftingElementName(
        requirement?.element
      )}: ${available}/${needed}`;
      requirements.appendChild(requirementItem);
    });
    item.appendChild(requirements);

    const researchTime = document.createElement("p");
    researchTime.className = "crafting-panel__meta";
    researchTime.textContent = `Research time: ${formatDurationSeconds(
      researchDurationSeconds
    )}`;
    item.appendChild(researchTime);
  }

  if (researchingThisPart) {
    const progressState = getResearchLabJobProgressState(activeResearchJob);
    renderResearchProgressBlock(item, progressState);
  }

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "crafting-panel__button";
  actionButton.dataset.researchPartId = part.id;

  if (loadedToCraftingTable) {
    actionButton.textContent = "Loaded to table";
    actionButton.disabled = true;
  } else if (storedInInventory) {
    actionButton.textContent = "In inventory";
    actionButton.disabled = true;
  } else if (readyToClaim) {
    actionButton.dataset.researchPartAction = "claim";
    actionButton.textContent = "Move to inventory";
    actionButton.disabled = false;
  } else if (researchingThisPart) {
    actionButton.textContent = "Researching...";
    actionButton.disabled = true;
  } else {
    actionButton.dataset.researchPartAction = "start";
    actionButton.textContent = otherResearchActive
      ? "Lab busy"
      : canResearch
        ? "Start research"
        : "Need materials";
    actionButton.disabled = otherResearchActive || !canResearch;
  }

  item.appendChild(actionButton);
  return item;
};

const createCostumeResearchProjectCard = (project) => {
  const item = document.createElement("li");
  item.className = "crafting-panel__card research-panel__card";
  item.dataset.costumeResearchId = project.id;

  const completed = isCostumeResearchProjectCompleted(project.id);
  const loadedToCraftingTable = isCostumeResearchBlueprintLoaded(project.id);
  const storedInInventory = isCostumeResearchBlueprintInInventory(project.id);
  const readyToClaim = isCostumeResearchBlueprintReadyToClaim(project.id);
  const requiredProject = getCostumeResearchRequiredProject(project);
  const prerequisiteReady = isCostumeResearchProjectUnlocked(project);
  const activeResearchJob = getResearchLabActiveJob();
  const researchingThisProject = Boolean(
    activeResearchJob &&
      activeResearchJob.type === "costume" &&
      activeResearchJob.id === project.id
  );
  const otherResearchActive = Boolean(activeResearchJob && !researchingThisProject);
  const requirementStates = getCostumeResearchRequirementStates(project);
  const canResearch = prerequisiteReady && requirementStates.every((state) => state.ready);
  const researchDurationSeconds = getCostumeResearchDurationSeconds(project);

  item.dataset.researched = completed || loadedToCraftingTable ? "true" : "false";
  item.dataset.researching = researchingThisProject ? "true" : "false";

  const status = document.createElement("p");
  status.className = "quick-access-modal__status-tag research-panel__status";
  if (completed) {
    status.textContent = "Installed";
  } else if (loadedToCraftingTable) {
    status.textContent = "Loaded";
  } else if (storedInInventory) {
    status.dataset.status = "busy";
    status.textContent = "Inventory";
  } else if (readyToClaim) {
    status.dataset.status = "busy";
    status.textContent = "Complete";
  } else if (researchingThisProject) {
    status.dataset.status = "busy";
    status.textContent = "Researching";
  } else if (!prerequisiteReady) {
    status.dataset.status = "locked";
    status.textContent = "Locked";
  } else if (otherResearchActive) {
    status.dataset.status = "busy";
    status.textContent = "Busy";
  } else if (canResearch) {
    status.textContent = "Available";
  } else {
    status.dataset.status = "locked";
    status.textContent = "Locked";
  }
  item.appendChild(status);

  const title = document.createElement("h3");
  title.className = "crafting-panel__title";
  title.textContent = project.label;
  item.appendChild(title);

  const description = document.createElement("p");
  description.className = "crafting-panel__description";
  description.textContent = project.description;
  item.appendChild(description);

  const effect = document.createElement("p");
  effect.className = "crafting-panel__effect";
  effect.textContent = formatCostumeResearchEffectLabel(project);
  item.appendChild(effect);

  if (completed) {
    const installedMeta = document.createElement("p");
    installedMeta.className = "crafting-panel__meta";
    installedMeta.textContent = "Installed on the suit. Permanent bonus active.";
    item.appendChild(installedMeta);
  } else if (loadedToCraftingTable) {
    const loadedMeta = document.createElement("p");
    loadedMeta.className = "crafting-panel__meta";
    loadedMeta.textContent =
      "Blueprint loaded into the Crafting Table. This upgrade can now be built there.";
    item.appendChild(loadedMeta);
  } else if (storedInInventory) {
    const inventoryMeta = document.createElement("p");
    inventoryMeta.className = "crafting-panel__meta";
    inventoryMeta.textContent =
      "Blueprint is in Inventory > Items. Open the Crafting Table to load it.";
    item.appendChild(inventoryMeta);
  } else if (readyToClaim) {
    const readyMeta = document.createElement("p");
    readyMeta.className = "crafting-panel__meta";
    readyMeta.textContent =
      "Research complete. Move the blueprint into Inventory > Items before loading it to the Crafting Table.";
    item.appendChild(readyMeta);
  } else {
    if (requiredProject && !prerequisiteReady) {
      const prerequisiteMeta = document.createElement("p");
      prerequisiteMeta.className = "crafting-panel__meta";
      prerequisiteMeta.textContent = `Requires previous tier: ${requiredProject.label}.`;
      item.appendChild(prerequisiteMeta);
    }

    const requirements = document.createElement("ul");
    requirements.className = "crafting-panel__requirements";
    requirementStates.forEach(({ requirement, needed, available, ready }) => {
      const requirementItem = document.createElement("li");
      requirementItem.className = "crafting-panel__requirement";
      requirementItem.dataset.ready = ready ? "true" : "false";
      requirementItem.textContent = `Research cost • ${formatCraftingElementName(
        requirement?.element
      )}: ${available}/${needed}`;
      requirements.appendChild(requirementItem);
    });
    item.appendChild(requirements);

    const researchTime = document.createElement("p");
    researchTime.className = "crafting-panel__meta";
    researchTime.textContent = `Research time: ${formatDurationSeconds(
      researchDurationSeconds
    )}`;
    item.appendChild(researchTime);
  }

  if (researchingThisProject) {
    const progressState = getResearchLabJobProgressState(activeResearchJob);
    renderResearchProgressBlock(item, progressState, "Researching");
  }

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "crafting-panel__button";
  actionButton.dataset.costumeResearchId = project.id;

  if (completed) {
    actionButton.textContent = "Installed";
    actionButton.disabled = true;
  } else if (loadedToCraftingTable) {
    actionButton.textContent = "Loaded to table";
    actionButton.disabled = true;
  } else if (storedInInventory) {
    actionButton.textContent = "In inventory";
    actionButton.disabled = true;
  } else if (readyToClaim) {
    actionButton.dataset.costumeResearchAction = "claim";
    actionButton.textContent = "Move to inventory";
    actionButton.disabled = false;
  } else if (researchingThisProject) {
    actionButton.textContent = "Researching...";
    actionButton.disabled = true;
  } else {
    actionButton.dataset.costumeResearchAction = "start";
    actionButton.textContent = !prerequisiteReady
      ? "Requires previous"
      : otherResearchActive
      ? "Lab busy"
      : canResearch
        ? "Start research"
        : "Need materials";
    actionButton.disabled = !prerequisiteReady || otherResearchActive || !canResearch;
  }

  item.appendChild(actionButton);
  return item;
};

const renderCostumeResearchPanel = (panel) => {
  if (!(panel instanceof HTMLElement)) {
    return;
  }

  panel.classList.add("crafting-panel");
  panel.innerHTML = "";

  const activeResearchJob = getResearchLabActiveJob();
  const progressState = getResearchLabJobProgressState(activeResearchJob);
  const completedCount = COSTUME_RESEARCH_PROJECTS.filter((project) =>
    isCostumeResearchProjectCompleted(project.id)
  ).length;
  const loadedCount = COSTUME_RESEARCH_PROJECTS.filter((project) =>
    !isCostumeResearchProjectCompleted(project.id) &&
    isCostumeResearchBlueprintLoaded(project.id)
  ).length;
  const inventoryCount = COSTUME_RESEARCH_PROJECTS.filter((project) =>
    isCostumeResearchBlueprintInInventory(project.id)
  ).length;
  const readyCount = COSTUME_RESEARCH_PROJECTS.filter((project) =>
    isCostumeResearchBlueprintReadyToClaim(project.id)
  ).length;

  const summary = document.createElement("p");
  summary.className = "crafting-panel__summary";
  const summarySegments = [
    `Loaded ${loadedCount}/${COSTUME_RESEARCH_PROJECTS.length}`,
    `Inventory ${inventoryCount}`,
    `Ready ${readyCount}`,
    `Installed ${completedCount}/${COSTUME_RESEARCH_PROJECTS.length}`,
    getCostumeResearchSummaryText(),
  ];
  if (activeResearchJob && progressState) {
    summarySegments.push(
      `Lab busy: ${getResearchLabJobLabel(activeResearchJob)} (${formatDurationSeconds(
        progressState.remainingSeconds
      )} left)`
    );
  } else {
    summarySegments.push("Lab idle");
  }
  summary.textContent = summarySegments.join(" • ");
  panel.appendChild(summary);

  const hint = document.createElement("p");
  hint.className = "crafting-panel__hint";
  hint.textContent =
    "Research suit blueprints here, move them to Inventory > Items, then load them into the Crafting Table outside. Crafted suit upgrades become active when moved to Inventory. Each family has 5 sequential tiers.";
  panel.appendChild(hint);

  if (COSTUME_RESEARCH_PROJECTS.length === 0) {
    const empty = document.createElement("p");
    empty.className = "research-panel__empty";
    empty.textContent = "No costume research projects available yet.";
    panel.appendChild(empty);
    return;
  }

  const projectOrder = new Map(
    COSTUME_RESEARCH_PROJECTS.map((project, index) => [project.id, index])
  );
  const orderedProjects = COSTUME_RESEARCH_PROJECTS.slice().sort((left, right) => {
    const leftRank =
      left.id === activeResearchJob?.id && activeResearchJob?.type === "costume"
        ? 0
        : isCostumeResearchProjectCompleted(left.id)
          ? 2
          : 1;
    const rightRank =
      right.id === activeResearchJob?.id && activeResearchJob?.type === "costume"
        ? 0
        : isCostumeResearchProjectCompleted(right.id)
          ? 2
          : 1;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return (projectOrder.get(left.id) ?? 0) - (projectOrder.get(right.id) ?? 0);
  });

  const grid = document.createElement("ul");
  grid.className = "crafting-panel__grid";
  grid.setAttribute("role", "list");
  orderedProjects.forEach((project) => {
    grid.appendChild(createCostumeResearchProjectCard(project));
  });
  panel.appendChild(grid);
};

const syncResearchModalTabState = () => {
  const { tabButtons, costumePanel, dronePanel } = getResearchModalElements();
  const activeTab = RESEARCH_MODAL_TAB_IDS.includes(researchModalActiveTab)
    ? researchModalActiveTab
    : RESEARCH_MODAL_DEFAULT_TAB_ID;

  tabButtons.forEach((button) => {
    const isActive = button.dataset.researchTab === activeTab;
    button.dataset.active = isActive ? "true" : "false";
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
  });

  if (costumePanel instanceof HTMLElement) {
    costumePanel.hidden = activeTab !== "costume";
  }
  if (dronePanel instanceof HTMLElement) {
    dronePanel.hidden = activeTab !== "drone";
  }
};

const renderResearchModal = () => {
  if (!researchModalActive) {
    return;
  }

  finalizeCostumeResearchActiveJob({ notify: true, refreshUi: false });
  finalizeDroneResearchActiveJob({ notify: true, refreshUi: false });

  const { costumePanel, summary, partList } = getResearchModalElements();
  const activeResearchJob = getResearchLabActiveJob();
  const progressState = getResearchLabJobProgressState(activeResearchJob);
  const loadedCount = DRONE_CRAFTING_PARTS.filter((part) =>
    isDroneCraftingPartResearched(part.id)
  ).length;
  const inventoryCount = DRONE_CRAFTING_PARTS.filter((part) =>
    isDroneResearchBlueprintInInventory(part.id)
  ).length;
  const readyCount = DRONE_CRAFTING_PARTS.filter((part) =>
    isDroneResearchBlueprintReadyToClaim(part.id)
  ).length;

  syncResearchModalTabState();
  renderCostumeResearchPanel(costumePanel);

  if (summary instanceof HTMLElement) {
    const summarySegments = [
      `Loaded ${loadedCount}/${DRONE_CRAFTING_PARTS.length}`,
      `Inventory ${inventoryCount}`,
      `Ready ${readyCount}`,
    ];
    if (activeResearchJob && progressState) {
      summarySegments.push(
        `Lab busy: ${getResearchLabJobLabel(activeResearchJob)} (${formatDurationSeconds(
          progressState.remainingSeconds
        )} left)`
      );
    } else {
      summarySegments.push("Lab idle");
    }
    summary.textContent = summarySegments.join(" • ");
  }

  if (!(partList instanceof HTMLElement)) {
    return;
  }

  const orderedParts = DRONE_CRAFTING_PARTS.slice().sort((left, right) => {
    const leftRank =
      left.id === activeResearchJob?.id && activeResearchJob?.type === "drone"
        ? 0
        : isDroneCraftingPartResearched(left.id)
          ? 2
          : 1;
    const rightRank =
      right.id === activeResearchJob?.id && activeResearchJob?.type === "drone"
        ? 0
        : isDroneCraftingPartResearched(right.id)
          ? 2
          : 1;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.label.localeCompare(right.label);
  });

  partList.innerHTML = "";
  orderedParts.forEach((part) => {
    partList.appendChild(createResearchNexusPartCard(part));
  });
};

const syncCraftingTableTabState = () => {
  const { tabButtons } = getCraftingTableModalElements();
  const activeTab = CRAFTING_TABLE_TAB_IDS.includes(craftingTableActiveTab)
    ? craftingTableActiveTab
    : CRAFTING_TABLE_DEFAULT_TAB_ID;

  tabButtons.forEach((button) => {
    const isActive = button.dataset.craftingTab === activeTab;
    button.dataset.active = isActive ? "true" : "false";
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
  });
};

const startDronePartResearch = (partId) => {
  const part = getDroneCraftingPartById(partId);
  if (!part) {
    return false;
  }

  if (isDroneCraftingPartResearched(part.id)) {
    showTerminalToast({
      title: "Already researched",
      description: `${part.label} is already loaded into the Crafting Table.`,
    });
    return false;
  }

  if (isDroneResearchBlueprintInInventory(part.id)) {
    showTerminalToast({
      title: "Blueprint in inventory",
      description: `${part.label} is already in Inventory > Items. Load it at the Crafting Table.`,
    });
    return false;
  }

  if (isDroneResearchBlueprintReadyToClaim(part.id)) {
    showTerminalToast({
      title: "Ready to collect",
      description: `${part.label} research is complete. Move the blueprint to Inventory > Items.`,
    });
    return false;
  }

  const activeCraftJob = getDroneCraftingActiveJob();
  if (activeCraftJob?.partId === part.id) {
    droneCraftingState.researchedPartIds.add(part.id);
    persistDroneCraftingState();
    refreshCraftingTableModalIfOpen();
    refreshResearchModalIfOpen();
    return true;
  }

  ensureSingleResearchLabJob({ notify: false, refreshUi: false });
  finalizeCostumeResearchActiveJob({ notify: true, refreshUi: false });
  finalizeDroneResearchActiveJob({ notify: true, refreshUi: false });
  ensureSingleResearchLabJob({ notify: false, refreshUi: false });
  const activeResearchJob = getResearchLabActiveJob();
  if (activeResearchJob) {
    if (activeResearchJob.type === "drone" && activeResearchJob.id === part.id) {
      const progressState = getResearchLabJobProgressState(activeResearchJob);
      showTerminalToast({
        title: "Research in progress",
        description: `${part.label} will finish in ${formatDurationSeconds(
          progressState?.remainingSeconds ?? 0
        )}.`,
      });
      return false;
    }

    showTerminalToast({
      title: "Research lab busy",
      description: `${getResearchLabJobLabel(activeResearchJob)} is currently running.`,
    });
    return false;
  }

  const requirementStates = getDroneResearchRequirementStates(part);
  const missingRequirement = requirementStates.find((state) => !state.ready);
  if (missingRequirement) {
    showTerminalToast({
      title: "Missing research materials",
      description: `${formatCraftingElementName(
        missingRequirement.requirement?.element
      )}: ${missingRequirement.available}/${missingRequirement.needed}.`,
    });
    renderResearchModal();
    return false;
  }

  for (const requirementState of requirementStates) {
    const spent = spendInventoryResource(
      requirementState.requirement?.element,
      requirementState.needed
    );
    if (!spent) {
      showTerminalToast({
        title: "Research failed",
        description: "Inventory changed while starting the experiment. Try again.",
      });
      renderResearchModal();
      return false;
    }
  }

  const researchDurationSeconds = getDroneResearchDurationSeconds(part);
  if (researchDurationSeconds <= 0) {
    droneCraftingState.readyResearchPartIds.add(part.id);
    droneCraftingState.activeResearchJob = null;
    persistDroneCraftingState();
    refreshInventoryUi();
    refreshResearchModalIfOpen();
    refreshCraftingTableModalIfOpen();
    showTerminalToast({
      title: `${part.label} researched`,
      description: "God mode instant research. Move the blueprint to Inventory > Items.",
    });
    return true;
  }

  const startedAtMs = Date.now();
  const durationMs = Math.max(1000, researchDurationSeconds * 1000);
  droneCraftingState.activeResearchJob = {
    partId: part.id,
    startedAtMs,
    durationMs,
    completedAtMs: startedAtMs + durationMs,
  };
  persistDroneCraftingState();
  syncDroneResearchProgressInterval();
  refreshResearchModalIfOpen();
  refreshCraftingTableModalIfOpen();

  showTerminalToast({
    title: `${part.label} started`,
    description: `Research time: ${formatDurationSeconds(
      researchDurationSeconds
    )}. Materials were consumed by the lab.`,
  });
  return true;
};

const hasInstalledAllDroneUpgradeParts = () =>
  DRONE_CRAFTING_PARTS.length > 0 &&
  DRONE_CRAFTING_PARTS.every((part) => isDroneCraftingPartEquipped(part.id));

const getCraftingRequirementWeightGrams = (requirement) => {
  const needed = Number.isFinite(requirement?.count)
    ? Math.max(1, Math.floor(requirement.count))
    : 0;
  if (needed <= 0) {
    return 0;
  }

  const requirementElement = sanitizeInventoryElement(requirement?.element ?? {});
  const unitWeight = getInventoryElementWeight(requirementElement);
  const normalizedUnitWeight =
    Number.isFinite(unitWeight) && unitWeight > 0
      ? unitWeight
      : DEFAULT_ELEMENT_WEIGHT_GRAMS;
  return normalizedUnitWeight * needed;
};

const getCraftingRequirementsTotalWeightGrams = (requirements) =>
  (Array.isArray(requirements) ? requirements : []).reduce(
    (totalWeight, requirement) =>
      totalWeight + getCraftingRequirementWeightGrams(requirement),
    0
  );

const normalizeMediumDroneCraftRequirements = (rawRequirements) => {
  if (!Array.isArray(rawRequirements)) {
    return [];
  }

  return rawRequirements
    .map((requirement) => {
      const count = Number.isFinite(requirement?.count)
        ? Math.max(1, Math.floor(requirement.count))
        : 0;
      if (count <= 0) {
        return null;
      }

      const element = sanitizeInventoryElement(requirement?.element ?? {});
      const hasElementIdentity =
        (typeof element.symbol === "string" && element.symbol.trim() !== "") ||
        (typeof element.name === "string" && element.name.trim() !== "");
      if (!hasElementIdentity) {
        return null;
      }

      return {
        element: {
          number: Number.isFinite(element.number) ? element.number : null,
          symbol: element.symbol || "",
          name: element.name || "",
        },
        count,
      };
    })
    .filter(Boolean);
};

const generateRandomMediumDroneCraftRequirements = () => {
  const elementPool = (Array.isArray(PERIODIC_ELEMENTS) ? PERIODIC_ELEMENTS : [])
    .map((element) => sanitizeInventoryElement(element ?? {}))
    .filter((element) => {
      const weight = getInventoryElementWeight(element);
      const hasElementIdentity =
        (typeof element.symbol === "string" && element.symbol.trim() !== "") ||
        (typeof element.name === "string" && element.name.trim() !== "");
      return hasElementIdentity && Number.isFinite(weight) && weight > 0;
    });

  if (elementPool.length === 0) {
    return [
      {
        element: { symbol: "Fe", name: "Iron" },
        count: Math.max(1, Math.ceil(DRONE_MEDIUM_MODEL_CRAFT_WEIGHT_GRAMS / 56)),
      },
    ];
  }

  const shuffledElements = elementPool.slice();
  for (let index = shuffledElements.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffledElements[index];
    shuffledElements[index] = shuffledElements[swapIndex];
    shuffledElements[swapIndex] = current;
  }

  const requirementTypeCount = Math.max(
    3,
    Math.min(DRONE_MEDIUM_MODEL_CRAFT_MATERIAL_TYPES, shuffledElements.length)
  );
  const selectedElements = shuffledElements.slice(0, requirementTypeCount);
  const targetWeightPerType =
    DRONE_MEDIUM_MODEL_CRAFT_WEIGHT_GRAMS / selectedElements.length;

  let requirements = selectedElements.map((element) => {
    const randomFactor = 0.6 + Math.random() * 0.8;
    const unitWeight = Math.max(1, getInventoryElementWeight(element));
    const count = Math.max(
      1,
      Math.round((targetWeightPerType * randomFactor) / unitWeight)
    );

    return {
      element: {
        number: Number.isFinite(element.number) ? element.number : null,
        symbol: element.symbol || "",
        name: element.name || "",
      },
      count,
    };
  });

  const firstPassWeight = getCraftingRequirementsTotalWeightGrams(requirements);
  if (firstPassWeight > 0) {
    const scaleFactor = DRONE_MEDIUM_MODEL_CRAFT_WEIGHT_GRAMS / firstPassWeight;
    requirements = requirements.map((requirement) => ({
      ...requirement,
      count: Math.max(1, Math.round(requirement.count * scaleFactor)),
    }));
  }

  const normalizedRequirements = normalizeMediumDroneCraftRequirements(requirements);
  const normalizedWeight = getCraftingRequirementsTotalWeightGrams(
    normalizedRequirements
  );
  if (
    normalizedWeight < DRONE_MEDIUM_MODEL_CRAFT_WEIGHT_GRAMS &&
    normalizedRequirements.length > 0
  ) {
    let heaviestRequirement = normalizedRequirements[0];
    let heaviestWeight = getCraftingRequirementWeightGrams(heaviestRequirement);
    for (let index = 1; index < normalizedRequirements.length; index += 1) {
      const requirement = normalizedRequirements[index];
      const requirementWeight = getCraftingRequirementWeightGrams(requirement);
      if (requirementWeight > heaviestWeight) {
        heaviestRequirement = requirement;
        heaviestWeight = requirementWeight;
      }
    }

    const elementUnitWeight = Math.max(
      1,
      getInventoryElementWeight(heaviestRequirement.element)
    );
    const deficit = DRONE_MEDIUM_MODEL_CRAFT_WEIGHT_GRAMS - normalizedWeight;
    heaviestRequirement.count += Math.max(
      1,
      Math.ceil(deficit / elementUnitWeight)
    );
  }

  return normalizeMediumDroneCraftRequirements(normalizedRequirements);
};

const getMediumDroneCraftRequirements = () => {
  const normalizedRequirements = normalizeMediumDroneCraftRequirements(
    droneCraftingState.mediumModelRequirements
  );

  if (normalizedRequirements.length > 0) {
    droneCraftingState.mediumModelRequirements = normalizedRequirements;
    return normalizedRequirements;
  }

  const generatedRequirements = generateRandomMediumDroneCraftRequirements();
  droneCraftingState.mediumModelRequirements = generatedRequirements;
  persistDroneCraftingState();
  return generatedRequirements;
};

const getMediumDroneCraftRequirementStates = () =>
  getMediumDroneCraftRequirements().map((requirement) => {
    const needed = Number.isFinite(requirement?.count)
      ? Math.max(1, Math.floor(requirement.count))
      : 1;
    const available = getInventoryResourceCount(requirement?.element);
    return {
      requirement,
      needed,
      available,
      ready: available >= needed,
    };
  });

const formatMediumDroneCraftRequirementProgress = (
  requirementStates,
  { maxEntries = 4 } = {}
) => {
  const states = Array.isArray(requirementStates) ? requirementStates : [];
  if (states.length === 0) {
    return "No requirements.";
  }

  const limit = Math.max(1, Math.floor(maxEntries));
  const segments = states.slice(0, limit).map((state) => {
    const label = formatCraftingElementName(state?.requirement?.element);
    return `${label} ${state.available}/${state.needed}`;
  });

  if (states.length > limit) {
    segments.push(`+${states.length - limit} more`);
  }

  return segments.join(" • ");
};

const hasAllMediumDroneCraftRequirements = (requirementStates) =>
  (Array.isArray(requirementStates) ? requirementStates : []).every(
    (state) => state?.ready
  );

const getPreferredUnlockedDroneModelId = (requestedModelId = null) => {
  const unlockedModelIds = ensureDroneUnlockedModelState();
  const normalizedRequestedModelId = normalizeDroneUnlockModelId(requestedModelId);

  if (normalizedRequestedModelId && unlockedModelIds.has(normalizedRequestedModelId)) {
    return normalizedRequestedModelId;
  }

  if (unlockedModelIds.has(DRONE_LIGHT_MODEL_ID)) {
    return DRONE_LIGHT_MODEL_ID;
  }

  return (
    DRONE_UNLOCKABLE_MODEL_IDS.find((modelId) => unlockedModelIds.has(modelId)) ??
    DRONE_LIGHT_MODEL_ID
  );
};

const syncDroneModelSelectionWithUnlocks = ({
  preferredModelId = null,
  persist = false,
  applyToScene = false,
} = {}) => {
  const nextModelId = getPreferredUnlockedDroneModelId(
    preferredModelId ?? currentSettings?.droneModelId ?? null
  );
  if (!nextModelId) {
    return null;
  }

  let settingsChanged = false;
  if (currentSettings?.droneModelId !== nextModelId) {
    currentSettings = { ...currentSettings, droneModelId: nextModelId };
    settingsChanged = true;
  }

  if (applyToScene && sceneController?.setActiveDroneModelById) {
    const appliedModelId = sceneController.setActiveDroneModelById(nextModelId);
    const normalizedAppliedModelId = normalizeDroneUnlockModelId(appliedModelId);
    if (
      normalizedAppliedModelId &&
      currentSettings?.droneModelId !== normalizedAppliedModelId
    ) {
      currentSettings = {
        ...currentSettings,
        droneModelId: normalizedAppliedModelId,
      };
      settingsChanged = true;
    }
  }

  if (settingsChanged && persist) {
    persistSettings(currentSettings);
  }

  return currentSettings?.droneModelId ?? nextModelId;
};

const getDroneCraftingInventoryParts = () =>
  DRONE_CRAFTING_PARTS.filter(
    (part) => isDroneCraftingPartCrafted(part.id) && !isDroneCraftingPartEquipped(part.id)
  );

const getDroneCraftingInstalledParts = () =>
  DRONE_CRAFTING_PARTS.filter((part) => isDroneCraftingPartEquipped(part.id));

const getCostumeCraftingInventoryProjects = () =>
  COSTUME_RESEARCH_PROJECTS.filter(
    (project) =>
      isCostumeResearchProjectCrafted(project.id) &&
      !isCostumeResearchProjectCompleted(project.id)
  );

const getCostumeCraftingInstalledProjects = () =>
  COSTUME_RESEARCH_PROJECTS.filter((project) => isCostumeResearchProjectCompleted(project.id));

const createCostumeCraftingTableProjectCard = (project) => {
  const item = document.createElement("li");
  item.className = "crafting-panel__card";
  item.dataset.craftingCostumeProjectId = project.id;

  const researched = isCostumeResearchBlueprintLoaded(project.id);
  const researchInInventory = isCostumeResearchBlueprintInInventory(project.id);
  const researchReadyToClaim = isCostumeResearchBlueprintReadyToClaim(project.id);
  const crafted = isCostumeResearchProjectCrafted(project.id);
  const installed = isCostumeResearchProjectCompleted(project.id);
  const readyToClaim = isCostumeCraftingProjectReadyToClaim(project.id);
  const activeResearchJob = getCostumeResearchActiveJob();
  const researchingThisProject = Boolean(
    activeResearchJob && activeResearchJob.projectId === project.id
  );
  const activeJob = getCraftingTableActiveJob();
  const craftingThisProject = Boolean(
    activeJob && activeJob.type === "costume" && activeJob.id === project.id
  );
  const craftingOtherProject = Boolean(activeJob && !craftingThisProject);
  item.dataset.researched = researched ? "true" : "false";
  item.dataset.crafted = crafted ? "true" : "false";
  item.dataset.ready = readyToClaim ? "true" : "false";
  item.dataset.crafting = craftingThisProject ? "true" : "false";

  const title = document.createElement("h3");
  title.className = "crafting-panel__title";
  title.textContent = project.label;
  item.appendChild(title);

  const description = document.createElement("p");
  description.className = "crafting-panel__description";
  description.textContent = project.description;
  item.appendChild(description);

  const effect = document.createElement("p");
  effect.className = "crafting-panel__effect";
  effect.textContent = formatCostumeResearchEffectLabel(project);
  item.appendChild(effect);

  if (installed) {
    const installedMeta = document.createElement("p");
    installedMeta.className = "crafting-panel__meta";
    installedMeta.textContent = "Installed on the suit. Permanent bonus active.";
    item.appendChild(installedMeta);
  } else if (crafted) {
    const craftedMeta = document.createElement("p");
    craftedMeta.className = "crafting-panel__meta";
    craftedMeta.textContent = "Crafted module is in Inventory > Items. Install it in Costume Setup.";
    item.appendChild(craftedMeta);
  } else if (!researched) {
    const researchStatus = document.createElement("p");
    researchStatus.className = "crafting-panel__meta";
    researchStatus.textContent = researchReadyToClaim
      ? "Research finished. Collect the blueprint in Research Nexus first."
      : researchInInventory
        ? "Blueprint is in Inventory > Items. Load it into the Crafting Table to unlock this recipe."
        : "Research required first. Unlock this blueprint in Command Center > Research Nexus.";
    item.appendChild(researchStatus);

    if (!researchInInventory && !researchReadyToClaim) {
      const researchRequirementStates = getCostumeResearchRequirementStates(project);
      const researchRequirements = document.createElement("ul");
      researchRequirements.className = "crafting-panel__requirements";
      researchRequirementStates.forEach(({ requirement, needed, available, ready }) => {
        const requirementItem = document.createElement("li");
        requirementItem.className = "crafting-panel__requirement";
        requirementItem.dataset.ready = ready ? "true" : "false";
        requirementItem.textContent = `Research cost • ${formatCraftingElementName(
          requirement?.element
        )}: ${available}/${needed}`;
        researchRequirements.appendChild(requirementItem);
      });
      item.appendChild(researchRequirements);

      const researchTime = document.createElement("p");
      researchTime.className = "crafting-panel__meta";
      researchTime.textContent = `Research time: ${formatDurationSeconds(
        getCostumeResearchDurationSeconds(project)
      )}`;
      item.appendChild(researchTime);
    }

    if (researchingThisProject) {
      const progressState = getCostumeResearchJobProgressState(activeResearchJob);
      renderResearchProgressBlock(item, progressState);
    }
  }

  const hideCraftingMaterialDetails = crafted || installed || !researched;
  const requirementStates = getCostumeCraftRequirementStates(project);

  if (!hideCraftingMaterialDetails) {
    const requirements = document.createElement("ul");
    requirements.className = "crafting-panel__requirements";

    requirementStates.forEach(({ requirement, needed, available, ready }) => {
      const requirementItem = document.createElement("li");
      requirementItem.className = "crafting-panel__requirement";
      requirementItem.dataset.ready = ready ? "true" : "false";
      requirementItem.textContent = `${formatCraftingElementName(
        requirement?.element
      )}: ${available}/${needed}`;
      requirements.appendChild(requirementItem);
    });
    item.appendChild(requirements);

    const craftTime = document.createElement("p");
    craftTime.className = "crafting-panel__meta";
    craftTime.textContent = `Craft time: ${formatDurationSeconds(
      getCostumeCraftDurationSeconds(project)
    )}`;
    item.appendChild(craftTime);
  }

  if (craftingThisProject) {
    const progressState = getCraftingTableJobProgressState(activeJob);
    renderResearchProgressBlock(item, progressState, "Crafting");
  }

  const craftButton = document.createElement("button");
  craftButton.type = "button";
  craftButton.className = "crafting-panel__button";
  craftButton.dataset.craftingCostumeProjectId = project.id;

  if (installed) {
    craftButton.textContent = "Installed";
    craftButton.disabled = true;
  } else if (crafted) {
    craftButton.textContent = "In inventory";
    craftButton.disabled = true;
  } else if (!researched) {
    if (researchInInventory) {
      craftButton.dataset.craftingCostumeAction = "load-research";
      craftButton.textContent = "Load research";
    } else {
      craftButton.textContent = researchReadyToClaim
        ? "Collect in Research Nexus"
        : researchingThisProject
          ? "Researching in Research Nexus"
          : "Research in Command Center";
      craftButton.disabled = true;
    }
  } else if (readyToClaim) {
    craftButton.dataset.craftingCostumeAction = "claim";
    craftButton.textContent = "Move to inventory";
    craftButton.disabled = false;
  } else if (craftingThisProject) {
    craftButton.textContent = "Crafting...";
    craftButton.disabled = true;
  } else {
    const canCraft = requirementStates.every((state) => state.ready);
    craftButton.dataset.craftingCostumeAction = "craft";
    craftButton.textContent = craftingOtherProject ? "Busy" : "Craft";
    craftButton.disabled = craftingOtherProject || !canCraft;
  }
  item.appendChild(craftButton);

  return item;
};

const shouldShowCostumeCraftingTableProjectCard = (project) =>
  Boolean(
    project &&
      (
        isCostumeResearchProjectCompleted(project.id) ||
        isCostumeResearchProjectCrafted(project.id) ||
        isCostumeResearchBlueprintLoaded(project.id) ||
        isCostumeResearchBlueprintInInventory(project.id) ||
        isCostumeCraftingProjectReadyToClaim(project.id)
      )
  );

const createCostumeCraftingTableResearchHintCard = () => {
  const item = document.createElement("li");
  item.className = "crafting-panel__card";

  const title = document.createElement("h3");
  title.className = "crafting-panel__title";
  title.textContent = "No suit blueprints loaded";
  item.appendChild(title);

  const description = document.createElement("p");
  description.className = "crafting-panel__description";
  description.textContent =
    "Research and claim suit blueprints in Command Center > Research Nexus.";
  item.appendChild(description);

  const meta = document.createElement("p");
  meta.className = "crafting-panel__meta";
  meta.textContent =
    "Claimed blueprints appear in Inventory > Items. Bring them here to load and craft suit upgrades.";
  item.appendChild(meta);

  return item;
};

const createCraftingTablePartCard = (part) => {
  const item = document.createElement("li");
  item.className = "crafting-panel__card";
  item.dataset.craftingPartId = part.id;

  const researched = isDroneCraftingPartResearched(part.id);
  const researchInInventory = isDroneResearchBlueprintInInventory(part.id);
  const researchReadyToClaim = isDroneResearchBlueprintReadyToClaim(part.id);
  const crafted = isDroneCraftingPartCrafted(part.id);
  const equipped = isDroneCraftingPartEquipped(part.id);
  const readyToClaim = isDroneCraftingPartReadyToClaim(part.id);
  const activeResearchJob = getDroneResearchActiveJob();
  const researchingThisPart = Boolean(
    activeResearchJob && activeResearchJob.partId === part.id
  );
  const activeJob = getCraftingTableActiveJob();
  const craftingThisPart = Boolean(
    activeJob && activeJob.type === "drone" && activeJob.id === part.id
  );
  const craftingOtherPart = Boolean(activeJob && !craftingThisPart);
  item.dataset.researched = researched ? "true" : "false";
  item.dataset.crafted = crafted ? "true" : "false";
  item.dataset.equipped = equipped ? "true" : "false";
  item.dataset.ready = readyToClaim ? "true" : "false";
  item.dataset.crafting = craftingThisPart ? "true" : "false";

  const title = document.createElement("h3");
  title.className = "crafting-panel__title";
  title.textContent = part.label;
  item.appendChild(title);

  const description = document.createElement("p");
  description.className = "crafting-panel__description";
  description.textContent = part.description;
  item.appendChild(description);

  const effect = document.createElement("p");
  effect.className = "crafting-panel__effect";
  effect.textContent = formatDronePartEffectLabel(part);
  item.appendChild(effect);

  if (!researched) {
    const researchStatus = document.createElement("p");
    researchStatus.className = "crafting-panel__meta";
    researchStatus.textContent = researchReadyToClaim
      ? "Research finished. Collect the blueprint in Research Nexus first."
      : researchInInventory
        ? "Blueprint is in Inventory > Items. Load it into the Crafting Table to unlock this recipe."
        : "Research required first. Unlock this blueprint in Command Center > Research Nexus.";
    item.appendChild(researchStatus);

    if (!researchInInventory && !researchReadyToClaim) {
      const researchRequirementStates = getDroneResearchRequirementStates(part);
      const researchRequirements = document.createElement("ul");
      researchRequirements.className = "crafting-panel__requirements";
      researchRequirementStates.forEach(({ requirement, needed, available, ready }) => {
        const requirementItem = document.createElement("li");
        requirementItem.className = "crafting-panel__requirement";
        requirementItem.dataset.ready = ready ? "true" : "false";
        requirementItem.textContent = `Research cost • ${formatCraftingElementName(
          requirement?.element
        )}: ${available}/${needed}`;
        researchRequirements.appendChild(requirementItem);
      });
      item.appendChild(researchRequirements);

      const researchTime = document.createElement("p");
      researchTime.className = "crafting-panel__meta";
      researchTime.textContent = `Research time: ${formatDurationSeconds(
        getDroneResearchDurationSeconds(part)
      )}`;
      item.appendChild(researchTime);
    }

    if (researchingThisPart) {
      const progressState = getDroneResearchJobProgressState(activeResearchJob);
      renderResearchProgressBlock(item, progressState);
    }
  }

  const hideCraftingMaterialDetails = crafted || equipped || !researched;

  const requirementStates = (Array.isArray(part.requirements) ? part.requirements : []).map(
    (requirement) => {
      const needed = Number.isFinite(requirement?.count)
        ? Math.max(1, Math.floor(requirement.count))
        : 1;
      const available = getInventoryResourceCount(requirement?.element);
      const ready = available >= needed;
      return {
        requirement,
        needed,
        available,
        ready,
      };
    }
  );

  if (!hideCraftingMaterialDetails) {
    const requirements = document.createElement("ul");
    requirements.className = "crafting-panel__requirements";

    requirementStates.forEach(({ requirement, needed, available, ready }) => {
      const requirementItem = document.createElement("li");
      requirementItem.className = "crafting-panel__requirement";
      requirementItem.dataset.ready = ready ? "true" : "false";
      requirementItem.textContent = `${formatCraftingElementName(
        requirement?.element
      )}: ${available}/${needed}`;
      requirements.appendChild(requirementItem);
    });
    item.appendChild(requirements);

    const craftDurationSeconds = getDroneCraftingPartCraftDurationSeconds(part);
    const craftTime = document.createElement("p");
    craftTime.className = "crafting-panel__meta";
    craftTime.textContent = `Craft time: ${formatDurationSeconds(craftDurationSeconds)}`;
    item.appendChild(craftTime);
  }

  if (craftingThisPart) {
    const progressState = getCraftingTableJobProgressState(activeJob);
    if (progressState) {
      const progressContainer = document.createElement("div");
      progressContainer.className = "crafting-panel__progress";

      const progressTrack = document.createElement("div");
      progressTrack.className = "crafting-panel__progress-track";
      progressTrack.setAttribute("role", "progressbar");
      progressTrack.setAttribute("aria-valuemin", "0");
      progressTrack.setAttribute("aria-valuemax", "100");
      progressTrack.setAttribute(
        "aria-valuenow",
        String(Math.round(progressState.progress * 100))
      );

      const progressBar = document.createElement("span");
      progressBar.className = "crafting-panel__progress-bar";
      progressBar.style.width = `${Math.round(progressState.progress * 100)}%`;
      progressTrack.appendChild(progressBar);
      progressContainer.appendChild(progressTrack);

      const progressMeta = document.createElement("p");
      progressMeta.className = "crafting-panel__meta";
      progressMeta.textContent = `Crafting... ${formatDurationSeconds(
        progressState.remainingSeconds
      )} remaining`;
      progressContainer.appendChild(progressMeta);

      item.appendChild(progressContainer);
    }
  }

  const craftButton = document.createElement("button");
  craftButton.type = "button";
  craftButton.className = "crafting-panel__button";
  craftButton.dataset.craftingPartId = part.id;

  if (!researched) {
    if (researchInInventory) {
      craftButton.dataset.craftingPartAction = "load-research";
      craftButton.textContent = "Load research";
    } else {
      craftButton.textContent = researchReadyToClaim
        ? "Collect in Research Nexus"
        : researchingThisPart
          ? "Researching in Research Nexus"
          : "Research in Command Center";
      craftButton.disabled = true;
    }
  } else if (equipped) {
    craftButton.textContent = "Installed";
    craftButton.disabled = true;
  } else if (crafted) {
    craftButton.textContent = "In inventory";
    craftButton.disabled = true;
  } else if (readyToClaim) {
    craftButton.dataset.craftingPartAction = "claim";
    craftButton.textContent = "Move to inventory";
    craftButton.disabled = false;
  } else if (craftingThisPart) {
    craftButton.textContent = "Crafting...";
    craftButton.disabled = true;
  } else {
    const canCraft = requirementStates.every((state) => state.ready);
    craftButton.dataset.craftingPartAction = "craft";
    craftButton.textContent = craftingOtherPart ? "Busy" : "Craft";
    craftButton.disabled = craftingOtherPart || !canCraft;
  }
  item.appendChild(craftButton);

  return item;
};

const shouldShowCraftingTablePartCard = (part) =>
  Boolean(
    part &&
      (isDroneCraftingPartResearched(part.id) || isDroneResearchBlueprintInInventory(part.id))
  );

const createCraftingTableResearchHintCard = () => {
  const item = document.createElement("li");
  item.className = "crafting-panel__card";

  const title = document.createElement("h3");
  title.className = "crafting-panel__title";
  title.textContent = "No blueprints loaded";
  item.appendChild(title);

  const description = document.createElement("p");
  description.className = "crafting-panel__description";
  description.textContent =
    "Research and claim drone blueprints in Command Center > Research Nexus.";
  item.appendChild(description);

  const meta = document.createElement("p");
  meta.className = "crafting-panel__meta";
  meta.textContent =
    "Claimed blueprints appear in Inventory > Items. Bring them here to load and craft parts.";
  item.appendChild(meta);

  return item;
};

const openDroneSetupModelTabFromCraftingTable = () => {
  playTerminalInteractionSound();
  droneCustomizationActiveTab = "model";
  openQuickAccessModal({
    id: QUICK_ACCESS_MODAL_DRONE_SETUP_OPTION_ID,
    title: "Drone setup",
    description: "Configure drone model, parts, and skin.",
  });
};

const createCraftingTableMediumModelUpgradeCard = () => {
  const item = document.createElement("li");
  item.className = "crafting-panel__card";
  item.dataset.modelUpgrade = "true";

  const mediumUnlocked = isDroneModelUnlocked(DRONE_MEDIUM_MODEL_ID);
  const requirementStates = getMediumDroneCraftRequirementStates();
  const canCraftMedium = hasAllMediumDroneCraftRequirements(requirementStates);
  item.dataset.modelUpgradeReady = canCraftMedium ? "true" : "false";

  const layout = document.createElement("div");
  layout.className = "crafting-panel__model-upgrade-layout";

  const main = document.createElement("div");
  main.className = "crafting-panel__model-upgrade-main";
  layout.appendChild(main);

  const title = document.createElement("h3");
  title.className = "crafting-panel__title";
  title.textContent = "Rover Medium Body";
  main.appendChild(title);

  const description = document.createElement("p");
  description.className = "crafting-panel__description";
  description.textContent = mediumUnlocked
    ? "Medium drone body unlocked. Switch to Rover in Drone Setup > Model."
    : "All upgrades installed. Craft the medium drone body to unlock Rover.";
  main.appendChild(description);

  const effect = document.createElement("p");
  effect.className = "crafting-panel__effect";
  effect.textContent = "Progression unlock: Light -> Medium drone body";
  main.appendChild(effect);

  if (!mediumUnlocked) {
    const requirements = document.createElement("ul");
    requirements.className = "crafting-panel__requirements";
    requirementStates.forEach((state) => {
      const requirementItem = document.createElement("li");
      requirementItem.className = "crafting-panel__requirement";
      requirementItem.dataset.ready = state.ready ? "true" : "false";
      requirementItem.textContent = `${formatCraftingElementName(
        state.requirement?.element
      )}: ${state.available}/${state.needed}`;
      requirements.appendChild(requirementItem);
    });
    main.appendChild(requirements);

    const recipeWeight = formatGrams(
      getCraftingRequirementsTotalWeightGrams(getMediumDroneCraftRequirements())
    );
    const recipeMeta = document.createElement("p");
    recipeMeta.className = "crafting-panel__meta";
    recipeMeta.textContent = `Recipe weight: ${recipeWeight}`;
    main.appendChild(recipeMeta);
  }

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "crafting-panel__button";
  if (mediumUnlocked) {
    actionButton.dataset.craftingModelAction = "open-model";
    actionButton.textContent = "Open Drone Setup > Model";
    actionButton.disabled = false;
  } else {
    actionButton.dataset.craftingModelAction = "craft-medium";
    actionButton.textContent = canCraftMedium ? "Craft medium body" : "Need materials";
    actionButton.disabled = !canCraftMedium;
  }
  main.appendChild(actionButton);

  const preview = document.createElement("div");
  preview.className = "crafting-panel__model-upgrade-preview";

  const previewCanvas = document.createElement("canvas");
  previewCanvas.className = "crafting-panel__model-upgrade-canvas";
  previewCanvas.width = 960;
  previewCanvas.height = 540;
  previewCanvas.dataset.craftingModelPreviewCanvas = "true";
  preview.appendChild(previewCanvas);

  const previewTitle = document.createElement("p");
  previewTitle.className = "crafting-panel__model-upgrade-preview-title";
  previewTitle.dataset.craftingModelPreviewTitle = "true";
  previewTitle.textContent = "Rover";
  preview.appendChild(previewTitle);

  const previewDescription = document.createElement("p");
  previewDescription.className = "crafting-panel__model-upgrade-preview-description";
  previewDescription.dataset.craftingModelPreviewDescription = "true";
  previewDescription.textContent = "Medium all-purpose frame for regular mining operations.";
  preview.appendChild(previewDescription);

  layout.appendChild(preview);
  item.appendChild(layout);

  return item;
};

const getCraftingTableModelPreviewElements = () => {
  if (!quickAccessModalContent) {
    return {
      canvas: null,
      title: null,
      description: null,
    };
  }

  return {
    canvas: quickAccessModalContent.querySelector("[data-crafting-model-preview-canvas]"),
    title: quickAccessModalContent.querySelector("[data-crafting-model-preview-title]"),
    description: quickAccessModalContent.querySelector(
      "[data-crafting-model-preview-description]"
    ),
  };
};

const renderCraftingTableMediumModelPreview = () => {
  const { canvas, title, description } = getCraftingTableModelPreviewElements();
  if (!(canvas instanceof HTMLCanvasElement)) {
    stopDroneModelPreviewRuntimeLoop();
    return;
  }

  const modelOptions = sceneController?.getDroneModelOptions?.();
  const mediumModelOption =
    (Array.isArray(modelOptions)
      ? modelOptions.find((option) => option?.id === DRONE_MEDIUM_MODEL_ID)
      : null) ?? {
      id: DRONE_MEDIUM_MODEL_ID,
      label: "Rover",
      description: "Medium all-purpose frame for regular mining operations.",
      preview: { scale: 1 },
    };

  if (title instanceof HTMLElement) {
    title.textContent =
      typeof mediumModelOption?.label === "string" && mediumModelOption.label.trim() !== ""
        ? mediumModelOption.label.trim()
        : "Rover";
  }

  if (description instanceof HTMLElement) {
    const text =
      typeof mediumModelOption?.description === "string" &&
      mediumModelOption.description.trim() !== ""
        ? mediumModelOption.description.trim()
        : "Medium all-purpose frame for regular mining operations.";
    description.textContent = text;
  }

  const runtime = ensureDroneModelPreviewRuntime(canvas);
  if (!runtime) {
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "#071528");
      gradient.addColorStop(1, "#0f172a");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(191, 219, 254, 0.94)";
      context.font = "600 34px 'Segoe UI', 'Inter', sans-serif";
      context.textAlign = "center";
      context.fillText("Preview unavailable", canvas.width / 2, canvas.height / 2);
    }
    return;
  }

  const optionScale =
    Number.isFinite(mediumModelOption?.preview?.scale) && mediumModelOption.preview.scale > 0
      ? mediumModelOption.preview.scale
      : 1;
  const { headLightColor, cutterLightColor } = resolveActiveDroneSkinPreviewColors();
  applyDroneModelPreviewSelection(runtime, {
    modelId: DRONE_MEDIUM_MODEL_ID,
    optionScale,
    headLightColor,
    cutterLightColor,
  });
  renderDroneModelPreviewRuntimeNow(runtime);
  startDroneModelPreviewRuntimeLoop();
};

const renderCraftingTableModal = () => {
  if (!craftingTableModalActive) {
    return;
  }

  finalizeCostumeResearchActiveJob({ notify: true, refreshUi: false });
  finalizeDroneResearchActiveJob({ notify: true, refreshUi: false });
  finalizeCostumeCraftingActiveJob({ notify: true, refreshUi: false });
  finalizeDroneCraftingActiveJob({ notify: true, refreshUi: false });

  const { subtitle, speedSummary, hint, partList } = getCraftingTableModalElements();
  const activeTab = CRAFTING_TABLE_TAB_IDS.includes(craftingTableActiveTab)
    ? craftingTableActiveTab
    : CRAFTING_TABLE_DEFAULT_TAB_ID;
  const activeCraftJob = getCraftingTableActiveJob();
  const progressState = getCraftingTableJobProgressState(activeCraftJob);
  const equippedCount = droneCraftingState.equippedPartIds.size;

  syncCraftingTableTabState();

  if (subtitle instanceof HTMLElement) {
    subtitle.textContent =
      activeTab === "costume"
        ? "Assemble researched suit upgrade modules, move them into Inventory, then install them in Costume Setup."
        : "Build permanent drone upgrade parts from collected elements to mine faster.";
  }

  if (hint instanceof HTMLElement) {
    hint.textContent =
      activeTab === "costume"
        ? "Research blueprints in Command Center first. Craft time = total required material weight (1g = 1s). Finished modules must be installed in Costume Setup."
        : "Craft time = total required material weight (1g = 1s). When complete, move the part to Inventory.";
  }

  if (speedSummary instanceof HTMLElement) {
    if (activeTab === "costume") {
      const completedCount = COSTUME_RESEARCH_PROJECTS.filter((project) =>
        isCostumeResearchProjectCompleted(project.id)
      ).length;
      const summarySegments = [
        `Installed ${completedCount}/${COSTUME_RESEARCH_PROJECTS.length}`,
        getCostumeResearchSummaryText(),
      ];
      if (activeCraftJob && progressState) {
        summarySegments.push(
          `Crafting ${getCraftingTableJobLabel(activeCraftJob)} (${formatDurationSeconds(
            progressState.remainingSeconds
          )} left)`
        );
      }
      speedSummary.textContent = summarySegments.join(" • ");
    } else {
      const summarySegments = [
        `Installed ${equippedCount}/${DRONE_CRAFTING_PARTS.length}`,
        getInstalledDroneBonusSummaryText(),
      ];
      if (activeCraftJob && progressState) {
        const activeLabel = getCraftingTableJobLabel(activeCraftJob);
        summarySegments.push(
          `Crafting ${activeLabel} (${formatDurationSeconds(
            progressState.remainingSeconds
          )} left)`
        );
      }
      speedSummary.textContent = summarySegments.join(" • ");
    }
  }

  if (!(partList instanceof HTMLElement)) {
    return;
  }

  partList.innerHTML = "";

  if (activeTab === "costume") {
    stopDroneModelPreviewRuntimeLoop();
    const visibleProjects = COSTUME_RESEARCH_PROJECTS.filter((project) =>
      shouldShowCostumeCraftingTableProjectCard(project)
    );

    if (visibleProjects.length === 0) {
      partList.appendChild(createCostumeCraftingTableResearchHintCard());
      return;
    }

    visibleProjects.forEach((project) => {
      partList.appendChild(createCostumeCraftingTableProjectCard(project));
    });
    return;
  }

  if (hasInstalledAllDroneUpgradeParts()) {
    partList.appendChild(createCraftingTableMediumModelUpgradeCard());
    renderCraftingTableMediumModelPreview();
  } else {
    stopDroneModelPreviewRuntimeLoop();
    const visibleParts = DRONE_CRAFTING_PARTS.filter((part) =>
      shouldShowCraftingTablePartCard(part)
    );

    if (visibleParts.length === 0) {
      partList.appendChild(createCraftingTableResearchHintCard());
      return;
    }

    visibleParts.forEach((part) => {
      partList.appendChild(createCraftingTablePartCard(part));
    });
  }
};

const craftDroneUpgradePart = (partId) => {
  const part = getDroneCraftingPartById(partId);
  if (!part) {
    return false;
  }

  if (!isDroneCraftingPartResearched(part.id)) {
    const activeResearchJob = getDroneResearchActiveJob();
    if (activeResearchJob?.partId === part.id) {
      const progressState = getDroneResearchJobProgressState(activeResearchJob);
      showTerminalToast({
        title: "Research in progress",
        description: `${part.label} research finishes in ${formatDurationSeconds(
          progressState?.remainingSeconds ?? 0
        )}.`,
      });
    } else if (isDroneResearchBlueprintReadyToClaim(part.id)) {
      showTerminalToast({
        title: "Research complete",
        description: `${part.label} is ready in Research Nexus. Move the blueprint to Inventory > Items first.`,
      });
    } else if (isDroneResearchBlueprintInInventory(part.id)) {
      showTerminalToast({
        title: "Blueprint in inventory",
        description: `${part.label} is in Inventory > Items. Load it into the Crafting Table first.`,
      });
    } else {
      showTerminalToast({
        title: "Research required",
        description: `${part.label} must be researched first in Command Center > Research Nexus.`,
      });
    }
    return false;
  }

  if (isDroneCraftingPartReadyToClaim(part.id)) {
    showTerminalToast({
      title: "Ready to collect",
      description: `${part.label} is complete. Move it to Inventory > Items.`,
    });
    return false;
  }

  if (isDroneCraftingPartCrafted(part.id)) {
    showTerminalToast({
      title: "Already crafted",
      description: `${part.label} is already built. Install it in Drone Setup > Parts.`,
    });
    return false;
  }

  finalizeCostumeCraftingActiveJob({ notify: true, refreshUi: false });
  finalizeDroneCraftingActiveJob({ notify: true, refreshUi: false });
  const activeJob = getCraftingTableActiveJob();
  if (activeJob) {
    if (activeJob.type === "drone" && activeJob.id === part.id) {
      const progressState = getCraftingTableJobProgressState(activeJob);
      showTerminalToast({
        title: "Craft in progress",
        description: `${part.label} will finish in ${formatDurationSeconds(
          progressState?.remainingSeconds ?? 0
        )}.`,
      });
      return false;
    }

    showTerminalToast({
      title: "Crafting table busy",
      description: `${getCraftingTableJobLabel(activeJob)} is currently crafting.`,
    });
    return false;
  }

  const requirements = Array.isArray(part.requirements) ? part.requirements : [];
  const missingRequirement = requirements.find((requirement) => {
    const needed = Number.isFinite(requirement?.count)
      ? Math.max(1, Math.floor(requirement.count))
      : 1;
    const available = getInventoryResourceCount(requirement?.element);
    return available < needed;
  });

  if (missingRequirement) {
    const needed = Number.isFinite(missingRequirement?.count)
      ? Math.max(1, Math.floor(missingRequirement.count))
      : 1;
    const available = getInventoryResourceCount(missingRequirement?.element);
    showTerminalToast({
      title: "Missing materials",
      description: `${formatCraftingElementName(
        missingRequirement.element
      )}: ${available}/${needed}.`,
    });
    renderCraftingTableModal();
    return false;
  }

  for (const requirement of requirements) {
    const needed = Number.isFinite(requirement?.count)
      ? Math.max(1, Math.floor(requirement.count))
      : 1;
    const spent = spendInventoryResource(requirement?.element, needed);
    if (!spent) {
      showTerminalToast({
        title: "Crafting failed",
        description: "Inventory changed while crafting. Try again.",
      });
      renderCraftingTableModal();
      return false;
    }
  }

  const craftDurationSeconds = getDroneCraftingPartCraftDurationSeconds(part);
  if (craftDurationSeconds <= 0) {
    droneCraftingState.activeJob = null;
    droneCraftingState.readyPartIds.add(part.id);
    persistDroneCraftingState();
    syncDroneCraftingProgressInterval();
    refreshInventoryUi();
    renderCraftingTableModal();
    if (droneCustomizationModalActive) {
      renderDroneCustomizationModal();
    }

    showTerminalToast({
      title: `${part.label} complete`,
      description: "God mode instant craft. Move it to Inventory > Items.",
    });
    return true;
  }

  const startedAtMs = Date.now();
  const durationMs = Math.max(1000, craftDurationSeconds * 1000);
  droneCraftingState.activeJob = {
    partId: part.id,
    startedAtMs,
    durationMs,
    completedAtMs: startedAtMs + durationMs,
  };
  persistDroneCraftingState();
  syncDroneCraftingProgressInterval();
  refreshInventoryUi();
  renderCraftingTableModal();
  if (droneCustomizationModalActive) {
    renderDroneCustomizationModal();
  }

  showTerminalToast({
    title: `${part.label} started`,
    description: `Crafting time: ${formatDurationSeconds(
      craftDurationSeconds
    )}. Move it to Inventory after completion.`,
  });
  return true;
};

const moveCraftedPartToInventory = (partId) => {
  const part = getDroneCraftingPartById(partId);
  if (!part) {
    return false;
  }

  finalizeDroneCraftingActiveJob({ notify: true, refreshUi: false });

  if (isDroneCraftingPartCrafted(part.id)) {
    showTerminalToast({
      title: "Already in inventory",
      description: `${part.label} can be installed in Drone Setup > Parts.`,
    });
    return false;
  }

  if (!isDroneCraftingPartReadyToClaim(part.id)) {
    const activeJob = getDroneCraftingActiveJob();
    if (activeJob && activeJob.partId === part.id) {
      const progressState = getDroneCraftingJobProgressState(activeJob);
      showTerminalToast({
        title: "Still crafting",
        description: `${part.label} will be ready in ${formatDurationSeconds(
          progressState?.remainingSeconds ?? 0
        )}.`,
      });
      return false;
    }

    return false;
  }

  droneCraftingState.readyPartIds.delete(part.id);
  droneCraftingState.craftedPartIds.add(part.id);
  persistDroneCraftingState();
  refreshInventoryUi();
  renderCraftingTableModal();
  if (droneCustomizationModalActive) {
    renderDroneCustomizationModal();
  }

  showTerminalToast({
    title: `${part.label} added`,
    description: "Now available in Inventory > Items and Drone Setup > Parts.",
  });
  return true;
};

const handleCraftingTableActionClick = (event) => {
  if (!craftingTableModalActive) {
    return;
  }

  const tabButton =
    event.target instanceof HTMLElement
      ? event.target.closest("[data-crafting-tab]")
      : null;

  if (tabButton instanceof HTMLButtonElement) {
    event.preventDefault();
    const nextTab = tabButton.dataset.craftingTab;
    if (!CRAFTING_TABLE_TAB_IDS.includes(nextTab)) {
      return;
    }

    craftingTableActiveTab = nextTab;
    renderCraftingTableModal();
    return;
  }

  const modelActionTarget =
    event.target instanceof HTMLElement
      ? event.target.closest("[data-crafting-model-action]")
      : null;

  if (modelActionTarget instanceof HTMLButtonElement) {
    event.preventDefault();
    const modelActionType = modelActionTarget.dataset.craftingModelAction;
    if (modelActionType === "craft-medium") {
      craftMediumDroneModelUnlock();
      renderCraftingTableModal();
      return;
    }

    if (modelActionType === "open-model") {
      openDroneSetupModelTabFromCraftingTable();
      return;
    }
  }

  const costumeActionTarget =
    event.target instanceof HTMLElement
      ? event.target.closest("[data-crafting-costume-action]")
      : null;

  if (costumeActionTarget instanceof HTMLButtonElement) {
    event.preventDefault();

    const projectId = costumeActionTarget.dataset.craftingCostumeProjectId;
    const actionType = costumeActionTarget.dataset.craftingCostumeAction;
    if (!projectId || !actionType) {
      return;
    }

    if (actionType === "craft") {
      craftCostumeUpgradeProject(projectId);
      return;
    }

    if (actionType === "load-research") {
      loadCostumeResearchBlueprintToCraftingTable(projectId);
      return;
    }

    if (actionType === "claim") {
      moveCraftedCostumeProjectToInventory(projectId);
    }
    return;
  }

  const partActionTarget =
    event.target instanceof HTMLElement
      ? event.target.closest("[data-crafting-part-action]")
      : null;

  if (!(partActionTarget instanceof HTMLButtonElement)) {
    return;
  }

  event.preventDefault();

  const partId = partActionTarget.dataset.craftingPartId;
  const actionType = partActionTarget.dataset.craftingPartAction;
  if (!partId) {
    return;
  }

  if (actionType === "craft") {
    craftDroneUpgradePart(partId);
    return;
  }

  if (actionType === "load-research") {
    loadResearchBlueprintToCraftingTable(partId);
    return;
  }

  if (actionType === "claim") {
    moveCraftedPartToInventory(partId);
  }
};

const handleResearchModalActionClick = (event) => {
  if (!researchModalActive) {
    return;
  }

  const tabButton =
    event.target instanceof HTMLElement
      ? event.target.closest("[data-research-tab]")
      : null;

  if (tabButton instanceof HTMLButtonElement) {
    event.preventDefault();
    const nextTab = tabButton.dataset.researchTab;
    if (!RESEARCH_MODAL_TAB_IDS.includes(nextTab)) {
      return;
    }

    researchModalActiveTab = nextTab;
    renderResearchModal();
    return;
  }

  const costumeActionTarget =
    event.target instanceof HTMLElement
      ? event.target.closest("[data-costume-research-action]")
      : null;

  if (costumeActionTarget instanceof HTMLButtonElement) {
    event.preventDefault();

    const projectId = costumeActionTarget.dataset.costumeResearchId;
    const actionType = costumeActionTarget.dataset.costumeResearchAction;
    if (!projectId || !actionType) {
      return;
    }

    if (actionType === "start") {
      startCostumeResearch(projectId);
      return;
    }

    if (actionType === "claim") {
      moveCostumeResearchBlueprintToInventory(projectId);
    }
    return;
  }

  const actionTarget =
    event.target instanceof HTMLElement
      ? event.target.closest("[data-research-part-action]")
      : null;

  if (!(actionTarget instanceof HTMLButtonElement)) {
    return;
  }

  event.preventDefault();

  const partId = actionTarget.dataset.researchPartId;
  const actionType = actionTarget.dataset.researchPartAction;
  if (!partId || !actionType) {
    return;
  }

  if (actionType === "start") {
    startDronePartResearch(partId);
    return;
  }

  if (actionType === "claim") {
    moveResearchedBlueprintToInventory(partId);
  }
};

const teardownResearchModal = () => {
  researchModalActive = false;
  researchModalActiveTab = RESEARCH_MODAL_DEFAULT_TAB_ID;
  if (typeof teardownResearchModalActionBinding === "function") {
    teardownResearchModalActionBinding();
    teardownResearchModalActionBinding = null;
  }
};

const bindResearchModalEvents = () => {
  const { panel } = getResearchModalElements();

  if (
    !(panel instanceof HTMLElement) ||
    typeof teardownResearchModalActionBinding === "function"
  ) {
    return;
  }

  panel.addEventListener("click", handleResearchModalActionClick);
  teardownResearchModalActionBinding = () => {
    panel.removeEventListener("click", handleResearchModalActionClick);
  };
};

const refreshResearchModalIfOpen = () => {
  if (!researchModalActive) {
    return;
  }

  renderResearchModal();
};

const teardownCraftingTableModal = () => {
  craftingTableModalActive = false;
  if (droneModelPreviewState.runtime) {
    stopDroneModelPreviewRuntimeLoop();
  }

  if (typeof teardownCraftingTableActionBinding === "function") {
    teardownCraftingTableActionBinding();
    teardownCraftingTableActionBinding = null;
  }
};

const bindCraftingTableModalEvents = () => {
  const craftingContent = quickAccessModalContent;
  if (
    !(craftingContent instanceof HTMLElement) ||
    typeof teardownCraftingTableActionBinding === "function"
  ) {
    return;
  }

  craftingContent.addEventListener("click", handleCraftingTableActionClick);
  teardownCraftingTableActionBinding = () => {
    craftingContent.removeEventListener("click", handleCraftingTableActionClick);
  };
};

const refreshCraftingTableModalIfOpen = () => {
  if (!craftingTableModalActive) {
    return;
  }

  renderCraftingTableModal();
};

const refreshCostumeCustomizationModalIfOpen = () => {
  if (!costumeCustomizationModalActive) {
    return;
  }

  renderCostumeCustomizationModal();
};

const getCostumeCustomizationModalElements = () => {
  if (!quickAccessModalContent) {
    return {
      summary: null,
      availableList: null,
      availableEmpty: null,
      installedList: null,
      installedEmpty: null,
    };
  }

  return {
    summary: quickAccessModalContent.querySelector("[data-costume-setup-summary]"),
    availableList: quickAccessModalContent.querySelector("[data-costume-setup-available-list]"),
    availableEmpty: quickAccessModalContent.querySelector(
      "[data-costume-setup-available-empty]"
    ),
    installedList: quickAccessModalContent.querySelector("[data-costume-setup-installed-list]"),
    installedEmpty: quickAccessModalContent.querySelector(
      "[data-costume-setup-installed-empty]"
    ),
  };
};

const createCostumeSetupPanelItem = ({ project, action, actionLabel }) => {
  const item = document.createElement("li");
  item.className = "drone-parts-panel__item";

  const body = document.createElement("div");
  const title = document.createElement("p");
  title.className = "drone-parts-panel__item-title";
  title.textContent = project.label;
  body.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "drone-parts-panel__item-meta";
  meta.textContent = `${project.description} • ${formatCostumeResearchEffectLabel(project)}`;
  body.appendChild(meta);
  item.appendChild(body);

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "drone-parts-panel__action";
  actionButton.dataset.costumeProjectAction = action;
  actionButton.dataset.costumeProjectId = project.id;
  actionButton.textContent = actionLabel;
  item.appendChild(actionButton);

  return item;
};

const installCostumeProject = (projectId) => {
  const project = getCostumeResearchProjectById(projectId);
  if (!project) {
    return false;
  }

  if (
    !isCostumeResearchProjectCrafted(projectId) ||
    isCostumeResearchProjectCompleted(projectId)
  ) {
    return false;
  }

  costumeResearchState.craftedProjectIds.add(projectId);
  costumeResearchState.equippedProjectIds.add(projectId);
  costumeResearchState.completedProjectIds.add(projectId);
  persistDroneCraftingState();
  refreshInventoryUi();
  refreshCraftingTableModalIfOpen();
  renderCostumeCustomizationModal();
  applyCostumeResearchBonuses({
    refreshResearch: true,
    persistOxygen: true,
    silentPressure: true,
  });
  showTerminalToast({
    title: `${project.label} installed`,
    description: getCostumeResearchSummaryText(),
  });
  return true;
};

const removeCostumeProject = (projectId) => {
  const project = getCostumeResearchProjectById(projectId);
  if (!project || !isCostumeResearchProjectCompleted(projectId)) {
    return false;
  }

  costumeResearchState.equippedProjectIds.delete(projectId);
  costumeResearchState.completedProjectIds.delete(projectId);
  persistDroneCraftingState();
  refreshInventoryUi();
  refreshCraftingTableModalIfOpen();
  renderCostumeCustomizationModal();
  applyCostumeResearchBonuses({
    refreshResearch: true,
    persistOxygen: true,
    silentPressure: true,
  });
  showTerminalToast({
    title: `${project.label} removed`,
    description: getCostumeResearchSummaryText(),
  });
  return true;
};

const handleCostumeProjectActionClick = (event) => {
  const button =
    event.target instanceof HTMLElement
      ? event.target.closest("[data-costume-project-action]")
      : null;

  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  event.preventDefault();

  const projectId = button.dataset.costumeProjectId;
  const action = button.dataset.costumeProjectAction;
  if (!projectId || !action) {
    return;
  }

  if (action === "install") {
    installCostumeProject(projectId);
    return;
  }

  if (action === "remove") {
    removeCostumeProject(projectId);
  }
};

const renderCostumeCustomizationModal = () => {
  if (!costumeCustomizationModalActive) {
    return;
  }

  const { summary, availableList, availableEmpty, installedList, installedEmpty } =
    getCostumeCustomizationModalElements();
  if (!(availableList instanceof HTMLElement) || !(installedList instanceof HTMLElement)) {
    return;
  }

  const inventoryProjects = getCostumeCraftingInventoryProjects();
  const installedProjects = getCostumeCraftingInstalledProjects();

  if (summary instanceof HTMLElement) {
    summary.textContent = `Installed ${installedProjects.length}/${COSTUME_RESEARCH_PROJECTS.length} • ${getCostumeResearchSummaryText()}`;
  }

  availableList.innerHTML = "";
  inventoryProjects.forEach((project) => {
    availableList.appendChild(
      createCostumeSetupPanelItem({
        project,
        action: "install",
        actionLabel: "Install",
      })
    );
  });

  installedList.innerHTML = "";
  installedProjects.forEach((project) => {
    installedList.appendChild(
      createCostumeSetupPanelItem({
        project,
        action: "remove",
        actionLabel: "Remove",
      })
    );
  });

  if (availableEmpty instanceof HTMLElement) {
    availableEmpty.hidden = inventoryProjects.length > 0;
  }

  if (installedEmpty instanceof HTMLElement) {
    installedEmpty.hidden = installedProjects.length > 0;
  }

  if (!availableList.dataset.boundCostumeActions) {
    availableList.dataset.boundCostumeActions = "true";
    availableList.addEventListener("click", handleCostumeProjectActionClick);
  }

  if (!installedList.dataset.boundCostumeActions) {
    installedList.dataset.boundCostumeActions = "true";
    installedList.addEventListener("click", handleCostumeProjectActionClick);
  }
};

const getDroneCustomizationModalElements = () => {
  if (!quickAccessModalContent) {
    return {
      tabButtons: [],
      tabPanels: [],
      partsSummary: null,
      partsAvailableList: null,
      partsAvailableEmpty: null,
      partsInstalledList: null,
      partsInstalledEmpty: null,
      skinList: null,
      skinEmpty: null,
      modelList: null,
      modelEmpty: null,
      modelPreviewCanvas: null,
      modelPreviewTitle: null,
      modelPreviewDescription: null,
      previewCanvas: null,
      previewTitle: null,
      previewDescription: null,
    };
  }

  const sharedPreviewCanvas = quickAccessModalContent.querySelector(
    "[data-drone-preview-canvas]"
  );
  const sharedPreviewTitle = quickAccessModalContent.querySelector(
    "[data-drone-preview-title]"
  );
  const sharedPreviewDescription = quickAccessModalContent.querySelector(
    "[data-drone-preview-description]"
  );

  const modelPreviewCanvas =
    sharedPreviewCanvas ??
    quickAccessModalContent.querySelector("[data-drone-model-preview-canvas]");
  const modelPreviewTitle =
    sharedPreviewTitle ??
    quickAccessModalContent.querySelector("[data-drone-model-preview-title]");
  const modelPreviewDescription =
    sharedPreviewDescription ??
    quickAccessModalContent.querySelector("[data-drone-model-preview-description]");
  const skinPreviewCanvas =
    sharedPreviewCanvas ??
    quickAccessModalContent.querySelector("[data-drone-skin-preview-canvas]");
  const skinPreviewTitle =
    sharedPreviewTitle ??
    quickAccessModalContent.querySelector("[data-drone-skin-preview-title]");
  const skinPreviewDescription =
    sharedPreviewDescription ??
    quickAccessModalContent.querySelector("[data-drone-skin-preview-description]");

  return {
    tabButtons: Array.from(
      quickAccessModalContent.querySelectorAll("[data-drone-setup-tab]")
    ).filter((button) => button instanceof HTMLButtonElement),
    tabPanels: Array.from(
      quickAccessModalContent.querySelectorAll("[data-drone-setup-panel]")
    ).filter((panel) => panel instanceof HTMLElement),
    partsSummary: quickAccessModalContent.querySelector("[data-drone-parts-summary]"),
    partsAvailableList: quickAccessModalContent.querySelector(
      "[data-drone-parts-available-list]"
    ),
    partsAvailableEmpty: quickAccessModalContent.querySelector(
      "[data-drone-parts-available-empty]"
    ),
    partsInstalledList: quickAccessModalContent.querySelector(
      "[data-drone-parts-installed-list]"
    ),
    partsInstalledEmpty: quickAccessModalContent.querySelector(
      "[data-drone-parts-installed-empty]"
    ),
    skinList: quickAccessModalContent.querySelector("[data-drone-skin-list]"),
    skinEmpty: quickAccessModalContent.querySelector("[data-drone-skin-empty]"),
    modelList: quickAccessModalContent.querySelector("[data-drone-model-list]"),
    modelEmpty: quickAccessModalContent.querySelector("[data-drone-model-empty]"),
    modelPreviewCanvas,
    modelPreviewTitle,
    modelPreviewDescription,
    previewCanvas: skinPreviewCanvas,
    previewTitle: skinPreviewTitle,
    previewDescription: skinPreviewDescription,
  };
};

const normalizeDroneCustomizationTabId = (tabId) => {
  const normalized = typeof tabId === "string" ? tabId.trim().toLowerCase() : "";
  if (DRONE_CUSTOMIZATION_TAB_IDS.includes(normalized)) {
    return normalized;
  }
  return DRONE_CUSTOMIZATION_DEFAULT_TAB_ID;
};

const isDroneCustomization3dPreviewTabActive = () =>
  DRONE_CUSTOMIZATION_3D_PREVIEW_TABS.has(droneCustomizationActiveTab);

const syncDroneCustomizationTabState = (
  requestedTabId = droneCustomizationActiveTab
) => {
  const { tabButtons, tabPanels } = getDroneCustomizationModalElements();
  const nextTabId = normalizeDroneCustomizationTabId(requestedTabId);
  droneCustomizationActiveTab = nextTabId;

  tabButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const buttonTabId = normalizeDroneCustomizationTabId(button.dataset.droneSetupTab);
    const isActive = buttonTabId === nextTabId;
    button.dataset.active = isActive ? "true" : "false";
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
  });

  tabPanels.forEach((panel) => {
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    const panelTabId = normalizeDroneCustomizationTabId(panel.dataset.droneSetupPanel);
    const isActive = panelTabId === nextTabId;
    panel.hidden = !isActive;
    panel.setAttribute("aria-hidden", isActive ? "false" : "true");
  });

  if (!isDroneCustomization3dPreviewTabActive()) {
    stopDroneModelPreviewRuntimeLoop();
  } else if (droneCustomizationModalActive && droneModelPreviewState.runtime) {
    startDroneModelPreviewRuntimeLoop();
  }
};

const handleDroneCustomizationTabClick = (event) => {
  if (!(event?.currentTarget instanceof HTMLButtonElement)) {
    return;
  }

  event.preventDefault();
  const nextTabId = normalizeDroneCustomizationTabId(
    event.currentTarget.dataset.droneSetupTab
  );
  syncDroneCustomizationTabState(nextTabId);
  renderActiveDroneCustomizationPreview();
};

const bindDroneCustomizationTabEvents = () => {
  const { tabButtons } = getDroneCustomizationModalElements();
  tabButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    if (button.dataset.droneSetupTabBound === "true") {
      return;
    }

    button.dataset.droneSetupTabBound = "true";
    button.addEventListener("click", handleDroneCustomizationTabClick);
  });
};

const renderActiveDroneCustomizationPreview = () => {
  if (!droneCustomizationModalActive) {
    return;
  }

  if (droneCustomizationActiveTab === "model") {
    const activeModelOption = resolveActiveDroneModelPreviewOption();
    if (activeModelOption) {
      renderDroneModelPreview(activeModelOption);
    } else {
      stopDroneModelPreviewRuntimeLoop();
    }
    return;
  }

  if (droneCustomizationActiveTab === "skins") {
    const skinOptions = sceneController?.getDroneSkinOptions?.();
    if (!Array.isArray(skinOptions) || skinOptions.length === 0) {
      stopDroneModelPreviewRuntimeLoop();
      return;
    }

    const activeSkinId = sceneController?.getActiveDroneSkinId?.() ?? null;
    const activeSkinOption =
      skinOptions.find((option) => option?.id === activeSkinId) ?? skinOptions[0];
    if (activeSkinOption) {
      void renderDroneSkinPreview(activeSkinOption);
    }
    return;
  }

  stopDroneModelPreviewRuntimeLoop();
};

const toHexColorString = (value, fallback = "#38bdf8") => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const clamped = Math.max(0, Math.min(0xffffff, Math.round(value)));
  return `#${clamped.toString(16).padStart(6, "0")}`;
};

const loadDroneSkinPreviewTexture = (path) => {
  const normalizedPath = typeof path === "string" ? path.trim() : "";
  if (!normalizedPath) {
    return Promise.resolve(null);
  }

  if (droneSkinPreviewTextureCache.has(normalizedPath)) {
    return droneSkinPreviewTextureCache.get(normalizedPath);
  }

  const promise = new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    try {
      image.src = new URL(normalizedPath, window.location.href).href;
    } catch (error) {
      resolve(null);
    }
  });

  droneSkinPreviewTextureCache.set(normalizedPath, promise);
  return promise;
};

const loadDroneSkinPreviewThreeTexture = (path) => {
  const normalizedPath = typeof path === "string" ? path.trim() : "";
  if (!normalizedPath) {
    return Promise.resolve(null);
  }

  if (droneSkinPreviewThreeTextureCache.has(normalizedPath)) {
    return droneSkinPreviewThreeTextureCache.get(normalizedPath);
  }

  const promise = new Promise((resolve) => {
    let resolvedPath = null;
    try {
      resolvedPath = new URL(normalizedPath, window.location.href).href;
    } catch (error) {
      resolve(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.load(
      resolvedPath,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        resolve(texture);
      },
      undefined,
      () => resolve(null)
    );
  });

  droneSkinPreviewThreeTextureCache.set(normalizedPath, promise);
  return promise;
};

const drawRoundedRectPath = (context, x, y, width, height, radius = 12) => {
  const clampedRadius = Math.max(
    0,
    Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2)
  );

  context.beginPath();
  context.moveTo(x + clampedRadius, y);
  context.lineTo(x + width - clampedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  context.lineTo(x + width, y + height - clampedRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - clampedRadius,
    y + height
  );
  context.lineTo(x + clampedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  context.lineTo(x, y + clampedRadius);
  context.quadraticCurveTo(x, y, x + clampedRadius, y);
  context.closePath();
};

const fillDronePreviewShape = (
  context,
  drawPath,
  textureImage,
  fallbackColor,
  { stroke = "rgba(148, 163, 184, 0.45)", lineWidth = 2 } = {}
) => {
  drawPath();
  if (textureImage) {
    const pattern = context.createPattern(textureImage, "repeat");
    if (pattern) {
      context.fillStyle = pattern;
      context.fill();
    } else {
      context.fillStyle = fallbackColor;
      context.fill();
    }
  } else {
    context.fillStyle = fallbackColor;
    context.fill();
  }

  if (lineWidth > 0) {
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.stroke();
  }
};

const drawDroneSkinPreviewPlaceholder = (context, width, height) => {
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#071528");
  gradient.addColorStop(1, "#0f172a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(148, 163, 184, 0.85)";
  context.font = "600 34px 'Segoe UI', 'Inter', sans-serif";
  context.textAlign = "center";
  context.fillText("Loading preview...", width / 2, height / 2);
};

const renderDroneSkinPreviewFallback2d = async (skinOption) => {
  const { previewCanvas, previewTitle, previewDescription } =
    getDroneCustomizationModalElements();
  if (!(previewCanvas instanceof HTMLCanvasElement)) {
    return;
  }

  const context = previewCanvas.getContext("2d");
  if (!context) {
    return;
  }

  const label =
    typeof skinOption?.label === "string" && skinOption.label.trim() !== ""
      ? skinOption.label.trim()
      : "Drone skin preview";
  const description =
    typeof skinOption?.description === "string" && skinOption.description.trim() !== ""
      ? skinOption.description.trim()
      : "Drone appearance profile.";

  if (previewTitle instanceof HTMLElement) {
    previewTitle.textContent = label;
  }
  if (previewDescription instanceof HTMLElement) {
    previewDescription.textContent = description;
  }

  const renderToken = ++droneSkinPreviewState.renderToken;
  droneSkinPreviewState.pendingSkinId =
    typeof skinOption?.id === "string" ? skinOption.id : null;

  const width = previewCanvas.width || 960;
  const height = previewCanvas.height || 540;
  drawDroneSkinPreviewPlaceholder(context, width, height);

  const preview = skinOption?.preview ?? {};
  const [hullImage, frameImage, visorImage, cutterImage] = await Promise.all([
    loadDroneSkinPreviewTexture(preview?.hullTexturePath),
    loadDroneSkinPreviewTexture(preview?.frameTexturePath),
    loadDroneSkinPreviewTexture(preview?.visorTexturePath),
    loadDroneSkinPreviewTexture(preview?.cutterTexturePath),
  ]);

  if (renderToken !== droneSkinPreviewState.renderToken) {
    return;
  }

  context.clearRect(0, 0, width, height);

  const bgGradient = context.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, "#021224");
  bgGradient.addColorStop(1, "#0b1f34");
  context.fillStyle = bgGradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(56, 189, 248, 0.28)";
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }

  const headLightColor = toHexColorString(preview?.headLightColor, "#60a5fa");
  const cutterLightColor = toHexColorString(preview?.cutterLightColor, "#f97316");
  const centerX = width * 0.5;
  const centerY = height * 0.56;
  const bodyRadius = height * 0.16;

  context.save();
  const haloGradient = context.createRadialGradient(
    centerX,
    centerY,
    bodyRadius * 0.2,
    centerX,
    centerY,
    bodyRadius * 1.95
  );
  haloGradient.addColorStop(0, "rgba(56, 189, 248, 0.35)");
  haloGradient.addColorStop(1, "rgba(2, 6, 23, 0)");
  context.fillStyle = haloGradient;
  context.beginPath();
  context.arc(centerX, centerY, bodyRadius * 2.05, 0, Math.PI * 2);
  context.fill();
  context.restore();

  fillDronePreviewShape(
    context,
    () => {
      drawRoundedRectPath(
        context,
        centerX - bodyRadius * 1.7,
        centerY - bodyRadius * 0.22,
        bodyRadius * 1.05,
        bodyRadius * 0.45,
        18
      );
    },
    frameImage,
    "#334155"
  );
  fillDronePreviewShape(
    context,
    () => {
      drawRoundedRectPath(
        context,
        centerX + bodyRadius * 0.65,
        centerY - bodyRadius * 0.22,
        bodyRadius * 1.05,
        bodyRadius * 0.45,
        18
      );
    },
    frameImage,
    "#334155"
  );

  fillDronePreviewShape(
    context,
    () => {
      context.beginPath();
      context.arc(centerX, centerY, bodyRadius, 0, Math.PI * 2);
      context.closePath();
    },
    hullImage,
    "#64748b",
    { stroke: "rgba(148, 163, 184, 0.55)", lineWidth: 2.5 }
  );

  fillDronePreviewShape(
    context,
    () => {
      drawRoundedRectPath(
        context,
        centerX - bodyRadius * 0.22,
        centerY - bodyRadius * 0.22,
        bodyRadius * 0.44,
        bodyRadius * 0.9,
        18
      );
    },
    visorImage,
    "#fca5a5",
    { stroke: "rgba(248, 113, 113, 0.85)", lineWidth: 2.2 }
  );

  context.save();
  context.translate(centerX, centerY - bodyRadius - 46);
  context.rotate(Math.PI / 10);
  fillDronePreviewShape(
    context,
    () => {
      drawRoundedRectPath(context, -180, -9, 360, 18, 9);
    },
    frameImage,
    "#475569",
    { stroke: "rgba(148, 163, 184, 0.4)", lineWidth: 2 }
  );
  context.restore();

  context.save();
  context.translate(centerX, centerY - bodyRadius - 46);
  context.rotate(-Math.PI / 10);
  fillDronePreviewShape(
    context,
    () => {
      drawRoundedRectPath(context, -180, -9, 360, 18, 9);
    },
    frameImage,
    "#475569",
    { stroke: "rgba(148, 163, 184, 0.4)", lineWidth: 2 }
  );
  context.restore();

  fillDronePreviewShape(
    context,
    () => {
      context.beginPath();
      context.moveTo(centerX, centerY + bodyRadius * 1.1);
      context.lineTo(centerX - bodyRadius * 0.34, centerY + bodyRadius * 2.06);
      context.lineTo(centerX + bodyRadius * 0.34, centerY + bodyRadius * 2.06);
      context.closePath();
    },
    cutterImage,
    "#fb923c",
    { stroke: "rgba(251, 146, 60, 0.8)", lineWidth: 2.2 }
  );

  context.save();
  context.globalCompositeOperation = "lighter";
  const headGlow = context.createRadialGradient(
    centerX,
    centerY - bodyRadius * 0.1,
    0,
    centerX,
    centerY - bodyRadius * 0.1,
    bodyRadius * 0.75
  );
  headGlow.addColorStop(0, `${headLightColor}dd`);
  headGlow.addColorStop(1, `${headLightColor}00`);
  context.fillStyle = headGlow;
  context.beginPath();
  context.arc(centerX, centerY - bodyRadius * 0.1, bodyRadius * 0.75, 0, Math.PI * 2);
  context.fill();

  const cutterGlow = context.createRadialGradient(
    centerX,
    centerY + bodyRadius * 1.72,
    0,
    centerX,
    centerY + bodyRadius * 1.72,
    bodyRadius * 0.82
  );
  cutterGlow.addColorStop(0, `${cutterLightColor}dd`);
  cutterGlow.addColorStop(1, `${cutterLightColor}00`);
  context.fillStyle = cutterGlow;
  context.beginPath();
  context.arc(centerX, centerY + bodyRadius * 1.72, bodyRadius * 0.82, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.fillStyle = "rgba(226, 232, 240, 0.92)";
  context.font = "600 28px 'Segoe UI', 'Inter', sans-serif";
  context.textAlign = "left";
  context.fillText(label, 26, 42);

  context.fillStyle = "rgba(148, 163, 184, 0.86)";
  context.font = "500 20px 'Segoe UI', 'Inter', sans-serif";
  context.fillText("Engineering preview", 26, 72);
};

const renderDroneModelPreviewFallback2d = (modelOption) => {
  const { modelPreviewCanvas, modelPreviewTitle, modelPreviewDescription } =
    getDroneCustomizationModalElements();
  if (!(modelPreviewCanvas instanceof HTMLCanvasElement)) {
    return;
  }

  const context = modelPreviewCanvas.getContext("2d");
  if (!context) {
    return;
  }

  const label =
    typeof modelOption?.label === "string" && modelOption.label.trim() !== ""
      ? modelOption.label.trim()
      : "Drone model preview";
  const baseDescription =
    typeof modelOption?.description === "string" && modelOption.description.trim() !== ""
      ? modelOption.description.trim()
      : "Drone frame profile.";
  const sizeLabel =
    typeof modelOption?.preview?.sizeLabel === "string" &&
    modelOption.preview.sizeLabel.trim() !== ""
      ? modelOption.preview.sizeLabel.trim()
      : "";
  const description =
    sizeLabel !== "" ? `${baseDescription} Size: ${sizeLabel}.` : baseDescription;

  if (modelPreviewTitle instanceof HTMLElement) {
    modelPreviewTitle.textContent = label;
  }
  if (modelPreviewDescription instanceof HTMLElement) {
    modelPreviewDescription.textContent = description;
  }

  const width = modelPreviewCanvas.width || 960;
  const height = modelPreviewCanvas.height || 540;
  drawDroneSkinPreviewPlaceholder(context, width, height);

  context.fillStyle = "rgba(148, 163, 184, 0.92)";
  context.font = "500 22px 'Segoe UI', 'Inter', sans-serif";
  context.textAlign = "center";
  context.fillText(
    "WebGL preview unavailable. Showing fallback panel.",
    width / 2,
    height * 0.59
  );
};

const normalizeDroneModelPreviewId = (value) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "atlas") {
    return "atltas";
  }
  return DRONE_MODEL_PREVIEW_MODEL_IDS.includes(normalized) ? normalized : null;
};

const resolveDroneModelPreviewIdFromOption = (modelOption) => {
  const directId = normalizeDroneModelPreviewId(modelOption?.id);
  if (directId) {
    return directId;
  }

  const previewKind = normalizeDroneModelPreviewId(modelOption?.preview?.modelKind);
  if (previewKind) {
    return previewKind;
  }

  const sizeLabel =
    typeof modelOption?.preview?.sizeLabel === "string"
      ? modelOption.preview.sizeLabel.trim().toLowerCase()
      : "";

  if (sizeLabel === "small") {
    return "scout";
  }
  if (sizeLabel === "big" || sizeLabel === "large") {
    return "atltas";
  }

  return "rover";
};

const resolveActiveDroneSkinPreviewColors = () => {
  const fallback = { headLightColor: null, cutterLightColor: null };
  const skinOptions = sceneController?.getDroneSkinOptions?.();
  if (!Array.isArray(skinOptions) || skinOptions.length === 0) {
    return fallback;
  }

  const activeSkinId = sceneController?.getActiveDroneSkinId?.() ?? null;
  const activeSkinOption =
    skinOptions.find((option) => option?.id === activeSkinId) ?? skinOptions[0];
  const preview = activeSkinOption?.preview ?? null;
  return {
    headLightColor: Number.isFinite(preview?.headLightColor)
      ? preview.headLightColor
      : null,
    cutterLightColor: Number.isFinite(preview?.cutterLightColor)
      ? preview.cutterLightColor
      : null,
  };
};

const getUnlockedDroneModelOptions = () => {
  const modelOptions = sceneController?.getDroneModelOptions?.();
  if (!Array.isArray(modelOptions) || modelOptions.length === 0) {
    return [];
  }

  const unlockedOptions = modelOptions.filter((option) =>
    isDroneModelUnlocked(option?.id)
  );
  return unlockedOptions.length > 0 ? unlockedOptions : modelOptions;
};

const resolveActiveDroneModelPreviewOption = () => {
  const modelOptions = getUnlockedDroneModelOptions();
  if (modelOptions.length === 0) {
    return null;
  }

  const activeModelId = sceneController?.getActiveDroneModelId?.() ?? null;
  return modelOptions.find((option) => option?.id === activeModelId) ?? modelOptions[0];
};

const resolveDroneSkinPreviewColors = (skinOption) => {
  const preview = skinOption?.preview ?? {};
  return {
    headLightColor: Number.isFinite(preview?.headLightColor)
      ? preview.headLightColor
      : null,
    cutterLightColor: Number.isFinite(preview?.cutterLightColor)
      ? preview.cutterLightColor
      : null,
  };
};

const setDronePreviewMaterialMap = (material, texture, fallbackColor) => {
  if (!(material instanceof THREE.Material)) {
    return;
  }

  if ("map" in material) {
    material.map = texture || null;
  }
  if ("color" in material && material.color instanceof THREE.Color) {
    if (texture) {
      material.color.set(0xffffff);
    } else if (Number.isFinite(fallbackColor)) {
      material.color.setHex(fallbackColor);
    }
  }
  material.needsUpdate = true;
};

const resolveDroneSkinPreviewFallbackPalette = (skinOption) => {
  const id = typeof skinOption?.id === "string" ? skinOption.id.trim().toLowerCase() : "";
  if (id.includes("hazard")) {
    return {
      hull: 0xeab308,
      frame: 0x1f2937,
      visor: 0xfef3c7,
      cutter: 0xfb923c,
    };
  }

  if (id.includes("carbon")) {
    return {
      hull: 0x334155,
      frame: 0x0f172a,
      visor: 0xfca5a5,
      cutter: 0xea580c,
    };
  }

  return {
    hull: 0x64748b,
    frame: 0x334155,
    visor: 0xe2e8f0,
    cutter: 0xf97316,
  };
};

const applyDroneSkinPreviewToRuntime = async (
  runtime,
  skinOption,
  { renderToken = 0 } = {}
) => {
  if (!runtime || droneModelPreviewState.runtime !== runtime) {
    return;
  }

  const preview = skinOption?.preview ?? {};
  const [hullTexture, frameTexture, visorTexture, cutterTexture] = await Promise.all([
    loadDroneSkinPreviewThreeTexture(preview?.hullTexturePath),
    loadDroneSkinPreviewThreeTexture(preview?.frameTexturePath),
    loadDroneSkinPreviewThreeTexture(preview?.visorTexturePath),
    loadDroneSkinPreviewThreeTexture(preview?.cutterTexturePath),
  ]);

  if (
    droneSkinPreviewState.renderToken !== renderToken ||
    !droneCustomizationModalActive ||
    droneModelPreviewState.runtime !== runtime
  ) {
    return;
  }

  const fallbackPalette = resolveDroneSkinPreviewFallbackPalette(skinOption);
  setDronePreviewMaterialMap(runtime.hullMaterial, hullTexture, fallbackPalette.hull);
  setDronePreviewMaterialMap(runtime.frameMaterial, frameTexture, fallbackPalette.frame);
  setDronePreviewMaterialMap(runtime.visorMaterial, visorTexture, fallbackPalette.visor);
  setDronePreviewMaterialMap(runtime.cutterMaterial, cutterTexture, fallbackPalette.cutter);
};

const disposeDroneModelPreviewResourceSet = (resources, methodName) => {
  if (!(resources instanceof Set)) {
    return;
  }

  resources.forEach((resource) => {
    if (resource && typeof resource[methodName] === "function") {
      resource[methodName]();
    }
  });
  resources.clear();
};

const stopDroneModelPreviewRuntimeLoop = () => {
  const runtime = droneModelPreviewState.runtime;
  if (!runtime) {
    return;
  }

  runtime.running = false;
  if (Number.isFinite(runtime.frameId) && runtime.frameId > 0) {
    window.cancelAnimationFrame(runtime.frameId);
  }
  runtime.frameId = 0;
  runtime.lastFrameAt = 0;
};

const teardownDroneModelPreviewRuntime = () => {
  const runtime = droneModelPreviewState.runtime;
  if (!runtime) {
    return;
  }

  stopDroneModelPreviewRuntimeLoop();
  disposeDroneModelPreviewResourceSet(runtime.geometries, "dispose");
  disposeDroneModelPreviewResourceSet(runtime.materials, "dispose");
  runtime.renderer?.renderLists?.dispose?.();
  runtime.renderer?.dispose?.();
  if (typeof runtime.renderer?.forceContextLoss === "function") {
    runtime.renderer.forceContextLoss();
  }
  droneModelPreviewState.runtime = null;
};

const trackDroneModelPreviewGeometry = (runtime, geometry) => {
  if (geometry instanceof THREE.BufferGeometry) {
    runtime.geometries.add(geometry);
  }
};

const trackDroneModelPreviewMaterial = (runtime, material) => {
  if (material instanceof THREE.Material) {
    runtime.materials.add(material);
    return;
  }

  if (Array.isArray(material)) {
    material.forEach((entry) => {
      if (entry instanceof THREE.Material) {
        runtime.materials.add(entry);
      }
    });
  }
};

const createDroneModelPreviewMesh = (runtime, geometry, material, parent) => {
  const mesh = new THREE.Mesh(geometry, material);
  trackDroneModelPreviewGeometry(runtime, geometry);
  trackDroneModelPreviewMaterial(runtime, material);
  parent.add(mesh);
  return mesh;
};

const createScoutDroneModelPreviewGroup = (runtime, materials) => {
  const group = new THREE.Group();
  createDroneModelPreviewMesh(
    runtime,
    new THREE.SphereGeometry(0.22, 24, 18),
    materials.hull,
    group
  );

  const visor = createDroneModelPreviewMesh(
    runtime,
    new THREE.CylinderGeometry(0.05, 0.05, 0.12, 18),
    materials.visor,
    group
  );
  visor.rotation.x = Math.PI / 2;
  visor.position.set(0, 0, 0.18);

  [-0.18, 0.18].forEach((offset) => {
    const thruster = createDroneModelPreviewMesh(
      runtime,
      new THREE.CylinderGeometry(0.04, 0.04, 0.18, 12),
      materials.frame,
      group
    );
    thruster.rotation.z = Math.PI / 2;
    thruster.position.set(offset, 0.02, -0.04);
  });

  const rotor = new THREE.Group();
  rotor.position.set(0, 0.18, 0);
  group.add(rotor);
  const rotorHub = createDroneModelPreviewMesh(
    runtime,
    new THREE.CylinderGeometry(0.03, 0.03, 0.04, 16),
    materials.frame,
    rotor
  );
  rotorHub.rotation.x = Math.PI / 2;
  [0, Math.PI / 2].forEach((angle) => {
    const blade = createDroneModelPreviewMesh(
      runtime,
      new THREE.BoxGeometry(0.04, 0.01, 0.5),
      materials.frame,
      rotor
    );
    blade.rotation.y = angle;
  });

  const cutter = createDroneModelPreviewMesh(
    runtime,
    new THREE.ConeGeometry(0.05, 0.18, 16),
    materials.cutter,
    group
  );
  cutter.rotation.x = Math.PI / 2;
  cutter.position.set(0, -0.2, 0.04);

  const cutterGlow = createDroneModelPreviewMesh(
    runtime,
    new THREE.SphereGeometry(0.07, 12, 12),
    materials.cutterGlow,
    group
  );
  cutterGlow.position.set(0, -0.22, 0.05);

  return { group, rotor };
};

const createRoverDroneModelPreviewGroup = (runtime, materials) => {
  const group = new THREE.Group();
  createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.56, 0.18, 0.38),
    materials.hull,
    group
  );

  const roverCabin = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.3, 0.12, 0.24),
    materials.hull,
    group
  );
  roverCabin.position.set(0, 0.14, 0.01);

  const roverVisor = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.24, 0.08, 0.03),
    materials.visor,
    group
  );
  roverVisor.position.set(0, 0.12, 0.2);

  const roverRoofRack = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.44, 0.05, 0.3),
    materials.frame,
    group
  );
  roverRoofRack.position.set(0, 0.19, -0.02);

  const roverBumper = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.3, 0.09, 0.13),
    materials.cutter,
    group
  );
  roverBumper.position.set(0, -0.04, 0.28);
  roverBumper.rotation.x = -0.22;

  const roverAxleFront = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.45, 0.03, 0.03),
    materials.frame,
    group
  );
  roverAxleFront.position.set(0, -0.11, 0.14);

  const roverAxleRear = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.45, 0.03, 0.03),
    materials.frame,
    group
  );
  roverAxleRear.position.set(0, -0.11, -0.14);

  const createWheel = (x, z, y = -0.12) => {
    const wheel = createDroneModelPreviewMesh(
      runtime,
      new THREE.CylinderGeometry(0.082, 0.082, 0.065, 20),
      materials.frame,
      group
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
  };
  createWheel(-0.24, 0.15);
  createWheel(0.24, 0.15);
  createWheel(-0.24, -0.15);
  createWheel(0.24, -0.15);

  return { group, rotor: null };
};

const createAtltasDroneModelPreviewGroup = (runtime, materials) => {
  const group = new THREE.Group();
  createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.68, 0.24, 0.42),
    materials.hull,
    group
  );

  const cabin = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.3, 0.16, 0.26),
    materials.hull,
    group
  );
  cabin.position.set(-0.1, 0.2, 0);

  const visor = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.17, 0.08, 0.03),
    materials.visor,
    group
  );
  visor.position.set(-0.1, 0.21, 0.19);

  const trackLeft = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.16, 0.2, 0.6),
    materials.frame,
    group
  );
  trackLeft.position.set(-0.4, -0.06, 0);

  const trackRight = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.16, 0.2, 0.6),
    materials.frame,
    group
  );
  trackRight.position.set(0.4, -0.06, 0);

  [-0.22, 0, 0.22].forEach((trackZ) => {
    const leftRoller = createDroneModelPreviewMesh(
      runtime,
      new THREE.CylinderGeometry(0.055, 0.055, 0.13, 14),
      materials.frame,
      group
    );
    leftRoller.rotation.z = Math.PI / 2;
    leftRoller.position.set(-0.4, -0.15, trackZ);

    const rightRoller = createDroneModelPreviewMesh(
      runtime,
      new THREE.CylinderGeometry(0.055, 0.055, 0.13, 14),
      materials.frame,
      group
    );
    rightRoller.rotation.z = Math.PI / 2;
    rightRoller.position.set(0.4, -0.15, trackZ);
  });

  const armBase = createDroneModelPreviewMesh(
    runtime,
    new THREE.CylinderGeometry(0.09, 0.09, 0.1, 18),
    materials.hull,
    group
  );
  armBase.rotation.x = Math.PI / 2;
  armBase.position.set(0.13, 0.16, 0.14);

  const boom = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.12, 0.1, 0.32),
    materials.frame,
    group
  );
  boom.position.set(0.13, 0.27, 0.32);
  boom.rotation.x = -0.38;

  const stick = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.1, 0.08, 0.26),
    materials.frame,
    group
  );
  stick.position.set(0.14, 0.34, 0.53);
  stick.rotation.x = -0.86;

  const bucket = createDroneModelPreviewMesh(
    runtime,
    new THREE.BoxGeometry(0.16, 0.1, 0.13),
    materials.cutter,
    group
  );
  bucket.position.set(0.15, 0.17, 0.66);
  bucket.rotation.x = -1.22;

  return { group, rotor: null };
};

const computeDroneModelPreviewMetrics = (group) => {
  if (!(group instanceof THREE.Object3D)) {
    return { minY: -0.2, radius: 0.4 };
  }

  const bounds = new THREE.Box3().setFromObject(group);
  if (bounds.isEmpty()) {
    return { minY: -0.2, radius: 0.4 };
  }

  const radius = Math.max(
    Number.isFinite(bounds.min.x) ? Math.abs(bounds.min.x) : 0,
    Number.isFinite(bounds.max.x) ? Math.abs(bounds.max.x) : 0,
    Number.isFinite(bounds.min.z) ? Math.abs(bounds.min.z) : 0,
    Number.isFinite(bounds.max.z) ? Math.abs(bounds.max.z) : 0,
    0.4
  );
  return {
    minY: Number.isFinite(bounds.min.y) ? bounds.min.y : -0.2,
    radius,
  };
};

const syncDroneModelPreviewRendererSize = (runtime) => {
  if (!runtime?.canvas || !runtime.renderer || !runtime.camera) {
    return;
  }

  const width = Math.max(
    1,
    Math.round(runtime.canvas.width || runtime.canvas.clientWidth || 960)
  );
  const height = Math.max(
    1,
    Math.round(runtime.canvas.height || runtime.canvas.clientHeight || 540)
  );

  if (runtime.renderWidth === width && runtime.renderHeight === height) {
    return;
  }

  runtime.renderWidth = width;
  runtime.renderHeight = height;
  runtime.renderer.setPixelRatio(1);
  runtime.renderer.setSize(width, height, false);
  runtime.camera.aspect = width / height;
  runtime.camera.updateProjectionMatrix();
};

const ensureDroneModelPreviewRuntime = (canvas) => {
  if (!(canvas instanceof HTMLCanvasElement) || droneModelPreviewState.webglUnavailable) {
    return null;
  }

  const existingRuntime = droneModelPreviewState.runtime;
  if (existingRuntime && existingRuntime.canvas === canvas) {
    syncDroneModelPreviewRendererSize(existingRuntime);
    return existingRuntime;
  }

  teardownDroneModelPreviewRuntime();

  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.setClearColor(0x04162f, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 20);
    camera.position.set(1.55, 0.95, 2.35);
    camera.lookAt(0, 0, 0);

    const ambientLight = new THREE.HemisphereLight(0xc7e2ff, 0x0a1020, 1.45);
    const keyLight = new THREE.DirectionalLight(0xf8fdff, 1.65);
    keyLight.position.set(2.4, 2, 1.6);
    const accentLight = new THREE.DirectionalLight(0x38bdf8, 0.72);
    accentLight.position.set(-1.6, 0.8, -2.2);
    scene.add(ambientLight, keyLight, accentLight);

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a1f38,
      metalness: 0.08,
      roughness: 0.92,
      transparent: true,
      opacity: 0.94,
    });
    const floorGeometry = new THREE.CircleGeometry(2.2, 72);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = DRONE_MODEL_PREVIEW_GROUND_Y - 0.005;
    scene.add(floor);

    const grid = new THREE.GridHelper(4.3, 22, 0x2ab7f0, 0x123e5c);
    grid.position.y = DRONE_MODEL_PREVIEW_GROUND_Y;
    if (grid.material instanceof THREE.Material) {
      grid.material.transparent = true;
      grid.material.opacity = 0.36;
    }
    scene.add(grid);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringGeometry = new THREE.RingGeometry(0.75, 0.86, 72);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = DRONE_MODEL_PREVIEW_GROUND_Y + 0.002;
    scene.add(ring);

    const previewRoot = new THREE.Group();
    scene.add(previewRoot);

    const headLight = new THREE.PointLight(0x93c5fd, 0.62, 3.5, 2.2);
    const cutterLight = new THREE.PointLight(0xf97316, 0.9, 2.8, 2.5);
    previewRoot.add(headLight, cutterLight);

    const runtime = {
      canvas,
      renderer,
      scene,
      camera,
      previewRoot,
      headLight,
      cutterLight,
      accentLight,
      ring,
      ringMaterial,
      models: new Map(),
      geometries: new Set(),
      materials: new Set(),
      frameId: 0,
      running: false,
      lastFrameAt: 0,
      renderWidth: 0,
      renderHeight: 0,
      activeModelId: "rover",
      hullMaterial: null,
      frameMaterial: null,
      cutterMaterial: null,
      cutterGlowMaterial: null,
      visorMaterial: null,
      skinTextureToken: 0,
    };

    trackDroneModelPreviewGeometry(runtime, floorGeometry);
    trackDroneModelPreviewMaterial(runtime, floorMaterial);
    trackDroneModelPreviewGeometry(runtime, grid.geometry);
    trackDroneModelPreviewMaterial(runtime, grid.material);
    trackDroneModelPreviewGeometry(runtime, ringGeometry);
    trackDroneModelPreviewMaterial(runtime, ringMaterial);

    const materials = {
      hull: new THREE.MeshPhongMaterial({
        color: 0x7b8ba8,
        shininess: 52,
        specular: new THREE.Color(0x99a7c2),
      }),
      visor: new THREE.MeshPhongMaterial({
        color: 0xe5edf9,
        emissive: 0x0f172a,
        emissiveIntensity: 0.2,
        shininess: 94,
      }),
      frame: new THREE.MeshPhongMaterial({
        color: 0x334155,
        shininess: 34,
        specular: new THREE.Color(0x4d647d),
      }),
      cutter: new THREE.MeshPhongMaterial({
        color: 0xf97316,
        emissive: 0x7c2d12,
        emissiveIntensity: 0.36,
        shininess: 48,
      }),
      cutterGlow: new THREE.MeshBasicMaterial({
        color: 0xfcd34d,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    };
    Object.values(materials).forEach((material) => {
      trackDroneModelPreviewMaterial(runtime, material);
    });
    runtime.hullMaterial = materials.hull;
    runtime.frameMaterial = materials.frame;
    runtime.cutterMaterial = materials.cutter;
    runtime.cutterGlowMaterial = materials.cutterGlow;
    runtime.visorMaterial = materials.visor;

    const registerModel = (modelId, buildResult) => {
      const container = new THREE.Group();
      container.visible = false;
      previewRoot.add(container);
      container.add(buildResult.group);
      const metrics = computeDroneModelPreviewMetrics(buildResult.group);
      runtime.models.set(modelId, {
        container,
        group: buildResult.group,
        rotor: buildResult.rotor ?? null,
        metrics,
        baseY: DRONE_MODEL_PREVIEW_GROUND_Y,
      });
    };

    registerModel("scout", createScoutDroneModelPreviewGroup(runtime, materials));
    registerModel("rover", createRoverDroneModelPreviewGroup(runtime, materials));
    registerModel("atltas", createAtltasDroneModelPreviewGroup(runtime, materials));

    droneModelPreviewState.runtime = runtime;
    syncDroneModelPreviewRendererSize(runtime);
    return runtime;
  } catch (error) {
    console.warn("Unable to initialize drone model WebGL preview", error);
    droneModelPreviewState.webglUnavailable = true;
    teardownDroneModelPreviewRuntime();
    return null;
  }
};

const resolveDroneModelPreviewScaleFactor = (rawScale) => {
  if (!Number.isFinite(rawScale) || rawScale <= 0) {
    return 1;
  }

  const normalized = 0.9 + Math.log10(rawScale + 0.2) * 0.24;
  return Math.max(0.78, Math.min(1.22, normalized));
};

const DRONE_MODEL_PREVIEW_LIGHT_OFFSETS = Object.freeze({
  scout: {
    head: { x: 0, y: 0, z: 0.18 },
    cutter: { x: 0, y: -0.22, z: 0.04 },
  },
  rover: {
    head: { x: 0, y: 0.04, z: 0.29 },
    cutter: { x: 0, y: -0.1, z: 0.34 },
  },
  atltas: {
    head: { x: 0, y: 0.22, z: 0.32 },
    cutter: { x: 0.15, y: 0.16, z: 0.65 },
  },
});

const applyDroneModelPreviewSelection = (
  runtime,
  { modelId, optionScale = 1, headLightColor = null, cutterLightColor = null }
) => {
  if (!runtime || !(runtime.models instanceof Map) || runtime.models.size === 0) {
    return;
  }

  const nextModelId =
    normalizeDroneModelPreviewId(modelId) ??
    normalizeDroneModelPreviewId(runtime.activeModelId) ??
    "rover";
  runtime.activeModelId = nextModelId;

  runtime.models.forEach((entry, id) => {
    entry.container.visible = id === nextModelId;
  });

  const activeEntry = runtime.models.get(nextModelId);
  if (!activeEntry) {
    return;
  }

  const sizeScale = resolveDroneModelPreviewScaleFactor(optionScale);
  const baseScaleByModel = {
    scout: 2.1,
    rover: 1.8,
    atltas: 1.1,
  };
  const baseYByModel = {
    scout: 0.26,
    rover: 0.08,
    atltas: -0.04,
  };
  const finalScale = (baseScaleByModel[nextModelId] ?? 1.8) * sizeScale;
  activeEntry.container.scale.setScalar(finalScale);
  activeEntry.baseY = baseYByModel[nextModelId] ?? 0.08;
  activeEntry.container.position.y = activeEntry.baseY;

  runtime.previewRoot.rotation.y =
    nextModelId === "scout" ? -0.2 : nextModelId === "atltas" ? -0.34 : -0.28;
  runtime.previewRoot.rotation.x = -0.12;

  const lightOffsets = DRONE_MODEL_PREVIEW_LIGHT_OFFSETS[nextModelId];
  if (lightOffsets) {
    runtime.headLight.position.set(
      lightOffsets.head.x,
      lightOffsets.head.y,
      lightOffsets.head.z
    );
    runtime.cutterLight.position.set(
      lightOffsets.cutter.x,
      lightOffsets.cutter.y,
      lightOffsets.cutter.z
    );
  }

  const accentFallback =
    DRONE_MODEL_PREVIEW_ACCENT_COLORS[nextModelId] ??
    DRONE_MODEL_PREVIEW_ACCENT_COLORS.rover;
  const headHex = toHexColorString(headLightColor, accentFallback);
  const cutterHex = toHexColorString(cutterLightColor, "#f97316");

  runtime.headLight.color.set(headHex);
  runtime.cutterLight.color.set(cutterHex);
  runtime.accentLight.color.set(headHex);
  runtime.ringMaterial.color.set(headHex);
  if (runtime.visorMaterial) {
    runtime.visorMaterial.emissive.set(headHex);
  }
  if (runtime.cutterMaterial) {
    runtime.cutterMaterial.emissive.set(cutterHex);
  }
  if (runtime.cutterGlowMaterial) {
    runtime.cutterGlowMaterial.color.set(cutterHex);
  }
};

const renderDroneModelPreviewRuntimeNow = (runtime) => {
  if (!runtime?.renderer || !runtime.scene || !runtime.camera) {
    return;
  }
  syncDroneModelPreviewRendererSize(runtime);
  runtime.renderer.render(runtime.scene, runtime.camera);
};

const isCraftingTableModelPreviewActiveForRuntime = (runtime) => {
  if (!runtime || !craftingTableModalActive) {
    return false;
  }

  const { canvas } = getCraftingTableModelPreviewElements();
  return canvas instanceof HTMLCanvasElement && runtime.canvas === canvas;
};

const isDroneModelPreviewRuntimeLoopAllowed = (runtime) => {
  if (!runtime) {
    return false;
  }

  if (droneCustomizationModalActive && isDroneCustomization3dPreviewTabActive()) {
    return true;
  }

  return isCraftingTableModelPreviewActiveForRuntime(runtime);
};

const renderDroneModelPreviewRuntimeFrame = (timestamp) => {
  const runtime = droneModelPreviewState.runtime;
  if (!runtime || runtime.running !== true) {
    return;
  }

  if (!isDroneModelPreviewRuntimeLoopAllowed(runtime) || !runtime.canvas.isConnected) {
    stopDroneModelPreviewRuntimeLoop();
    return;
  }

  const minimumFrameDeltaMs = 1000 / DRONE_MODEL_PREVIEW_SPIN_MAX_FPS;
  const elapsedMs =
    Number.isFinite(runtime.lastFrameAt) && runtime.lastFrameAt > 0
      ? timestamp - runtime.lastFrameAt
      : minimumFrameDeltaMs;

  if (elapsedMs < minimumFrameDeltaMs) {
    runtime.frameId = window.requestAnimationFrame(renderDroneModelPreviewRuntimeFrame);
    return;
  }

  runtime.lastFrameAt = timestamp;
  runtime.previewRoot.rotation.y +=
    (elapsedMs / 1000) * DRONE_MODEL_PREVIEW_SPIN_SPEED_RAD_PER_SEC;
  renderDroneModelPreviewRuntimeNow(runtime);
  runtime.frameId = window.requestAnimationFrame(renderDroneModelPreviewRuntimeFrame);
};

const startDroneModelPreviewRuntimeLoop = () => {
  const runtime = droneModelPreviewState.runtime;
  if (!runtime || runtime.running || !isDroneModelPreviewRuntimeLoopAllowed(runtime)) {
    return;
  }

  runtime.running = true;
  runtime.lastFrameAt = 0;
  runtime.frameId = window.requestAnimationFrame(renderDroneModelPreviewRuntimeFrame);
};

const renderDroneModelPreview = (modelOption) => {
  const { modelPreviewCanvas, modelPreviewTitle, modelPreviewDescription } =
    getDroneCustomizationModalElements();
  if (!(modelPreviewCanvas instanceof HTMLCanvasElement)) {
    return;
  }

  const label =
    typeof modelOption?.label === "string" && modelOption.label.trim() !== ""
      ? modelOption.label.trim()
      : "Drone model preview";
  const baseDescription =
    typeof modelOption?.description === "string" && modelOption.description.trim() !== ""
      ? modelOption.description.trim()
      : "Drone frame profile.";
  const sizeLabel =
    typeof modelOption?.preview?.sizeLabel === "string" &&
    modelOption.preview.sizeLabel.trim() !== ""
      ? modelOption.preview.sizeLabel.trim()
      : "";
  const description =
    sizeLabel !== "" ? `${baseDescription} Size: ${sizeLabel}.` : baseDescription;

  if (modelPreviewTitle instanceof HTMLElement) {
    modelPreviewTitle.textContent = label;
  }
  if (modelPreviewDescription instanceof HTMLElement) {
    modelPreviewDescription.textContent = description;
  }

  const runtime = ensureDroneModelPreviewRuntime(modelPreviewCanvas);
  if (!runtime) {
    renderDroneModelPreviewFallback2d(modelOption);
    return;
  }

  const modelId = resolveDroneModelPreviewIdFromOption(modelOption);
  const optionScale =
    Number.isFinite(modelOption?.preview?.scale) && modelOption.preview.scale > 0
      ? modelOption.preview.scale
      : 1;
  const { headLightColor, cutterLightColor } = resolveActiveDroneSkinPreviewColors();
  applyDroneModelPreviewSelection(runtime, {
    modelId,
    optionScale,
    headLightColor,
    cutterLightColor,
  });
  renderDroneModelPreviewRuntimeNow(runtime);
  if (isDroneCustomization3dPreviewTabActive()) {
    startDroneModelPreviewRuntimeLoop();
  } else {
    stopDroneModelPreviewRuntimeLoop();
  }
};

const renderDroneSkinPreview = async (skinOption) => {
  const { previewCanvas, previewTitle, previewDescription } =
    getDroneCustomizationModalElements();
  if (!(previewCanvas instanceof HTMLCanvasElement)) {
    return;
  }

  const label =
    typeof skinOption?.label === "string" && skinOption.label.trim() !== ""
      ? skinOption.label.trim()
      : "Drone skin preview";
  const description =
    typeof skinOption?.description === "string" && skinOption.description.trim() !== ""
      ? skinOption.description.trim()
      : "Drone appearance profile.";

  if (previewTitle instanceof HTMLElement) {
    previewTitle.textContent = label;
  }
  if (previewDescription instanceof HTMLElement) {
    previewDescription.textContent = description;
  }

  const renderToken = ++droneSkinPreviewState.renderToken;
  droneSkinPreviewState.pendingSkinId =
    typeof skinOption?.id === "string" ? skinOption.id : null;

  const runtime = ensureDroneModelPreviewRuntime(previewCanvas);
  if (!runtime) {
    await renderDroneSkinPreviewFallback2d(skinOption);
    return;
  }

  const activeModelOption = resolveActiveDroneModelPreviewOption();
  const modelId = resolveDroneModelPreviewIdFromOption(activeModelOption);
  const optionScale =
    Number.isFinite(activeModelOption?.preview?.scale) &&
    activeModelOption.preview.scale > 0
      ? activeModelOption.preview.scale
      : 1;
  const { headLightColor, cutterLightColor } = resolveDroneSkinPreviewColors(skinOption);
  applyDroneModelPreviewSelection(runtime, {
    modelId,
    optionScale,
    headLightColor,
    cutterLightColor,
  });

  await applyDroneSkinPreviewToRuntime(runtime, skinOption, { renderToken });
  if (
    droneSkinPreviewState.renderToken !== renderToken ||
    droneModelPreviewState.runtime !== runtime
  ) {
    return;
  }

  renderDroneModelPreviewRuntimeNow(runtime);
  if (isDroneCustomization3dPreviewTabActive()) {
    startDroneModelPreviewRuntimeLoop();
  } else {
    stopDroneModelPreviewRuntimeLoop();
  }
};

const handleDroneSkinOptionClick = (event) => {
  if (!(event?.currentTarget instanceof HTMLButtonElement)) {
    return;
  }

  event.preventDefault();
  const requestedSkinId = event.currentTarget.dataset.droneSkinId;
  if (!requestedSkinId || !sceneController?.setActiveDroneSkinById) {
    return;
  }

  const appliedSkinId = sceneController.setActiveDroneSkinById(requestedSkinId);
  if (!appliedSkinId) {
    return;
  }

  currentSettings = { ...currentSettings, droneSkinId: appliedSkinId };
  persistSettings(currentSettings);
  renderDroneCustomizationModal();

  const label =
    typeof event.currentTarget.dataset.droneSkinLabel === "string" &&
    event.currentTarget.dataset.droneSkinLabel.trim() !== ""
      ? event.currentTarget.dataset.droneSkinLabel.trim()
      : appliedSkinId;
  showTerminalToast({
    title: "Drone skin applied",
    description: label,
  });
};

const craftMediumDroneModelUnlock = () => {
  if (isDroneModelUnlocked(DRONE_MEDIUM_MODEL_ID)) {
    showTerminalToast({
      title: "Medium model unlocked",
      description: "Rover is already available in Drone Setup > Model.",
    });
    return false;
  }

  if (!hasInstalledAllDroneUpgradeParts()) {
    showTerminalToast({
      title: "Install all upgrades first",
      description: `Install all ${DRONE_CRAFTING_PARTS.length} drone parts before crafting Rover.`,
    });
    return false;
  }

  const requirementStates = getMediumDroneCraftRequirementStates();
  const missingRequirement = requirementStates.find((state) => !state.ready);
  if (missingRequirement) {
    showTerminalToast({
      title: "Missing materials",
      description: `${formatCraftingElementName(
        missingRequirement.requirement?.element
      )}: ${missingRequirement.available}/${missingRequirement.needed}.`,
    });
    return false;
  }

  for (const requirementState of requirementStates) {
    const spent = spendInventoryResource(
      requirementState.requirement?.element,
      requirementState.needed
    );
    if (!spent) {
      showTerminalToast({
        title: "Crafting failed",
        description: "Inventory changed while crafting. Try again.",
      });
      return false;
    }
  }

  const unlocked = unlockDroneModel(DRONE_MEDIUM_MODEL_ID);
  if (!unlocked) {
    return false;
  }

  persistDroneCraftingState();
  syncDroneModelSelectionWithUnlocks({
    preferredModelId: DRONE_MEDIUM_MODEL_ID,
    persist: true,
    applyToScene: true,
  });
  renderDroneCustomizationModal();
  refreshInventoryUi();

  showTerminalToast({
    title: "Rover unlocked",
    description: `Medium drone model crafted (${formatGrams(
      getCraftingRequirementsTotalWeightGrams(getMediumDroneCraftRequirements())
    )} total materials).`,
  });
  showResourceToast({
    title: "Drone upgrade complete",
    description: "Rover frame is now available in Drone Setup > Model.",
  });
  return true;
};

const handleDroneModelOptionClick = (event) => {
  if (!(event?.currentTarget instanceof HTMLButtonElement)) {
    return;
  }

  event.preventDefault();
  const modelAction = event.currentTarget.dataset.droneModelAction;
  if (modelAction === "craft-medium") {
    craftMediumDroneModelUnlock();
    return;
  }

  const requestedModelId = event.currentTarget.dataset.droneModelId;
  if (!requestedModelId || !sceneController?.setActiveDroneModelById) {
    return;
  }

  if (!isDroneModelUnlocked(requestedModelId)) {
    showTerminalToast({
      title: "Model locked",
      description: "Complete the Rover craft objective to unlock this frame.",
    });
    return;
  }

  const appliedModelId = sceneController.setActiveDroneModelById(requestedModelId);
  if (!appliedModelId) {
    return;
  }

  currentSettings = { ...currentSettings, droneModelId: appliedModelId };
  persistSettings(currentSettings);
  renderDroneCustomizationModal();

  const label =
    typeof event.currentTarget.dataset.droneModelLabel === "string" &&
    event.currentTarget.dataset.droneModelLabel.trim() !== ""
      ? event.currentTarget.dataset.droneModelLabel.trim()
      : appliedModelId;
  showTerminalToast({
    title: "Drone model applied",
    description: label,
  });
};

const createDronePartsPanelItem = ({
  part,
  action,
  actionLabel,
}) => {
  const item = document.createElement("li");
  item.className = "drone-parts-panel__item";

  const body = document.createElement("div");
  const title = document.createElement("p");
  title.className = "drone-parts-panel__item-title";
  title.textContent = part.label;
  body.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "drone-parts-panel__item-meta";
  meta.textContent = `${part.description} • ${formatDronePartEffectLabel(part)}`;
  body.appendChild(meta);
  item.appendChild(body);

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "drone-parts-panel__action";
  actionButton.dataset.dronePartAction = action;
  actionButton.dataset.dronePartId = part.id;
  actionButton.textContent = actionLabel;
  item.appendChild(actionButton);

  return item;
};

const installDronePart = (partId) => {
  const part = getDroneCraftingPartById(partId);
  if (!part) {
    return false;
  }

  if (!isDroneCraftingPartCrafted(partId) || isDroneCraftingPartEquipped(partId)) {
    return false;
  }

  droneCraftingState.equippedPartIds.add(partId);
  persistDroneCraftingState();
  refreshInventoryUi();
  renderDroneCustomizationModal();
  syncDroneMiningSpeedBonusWithScene();
  showTerminalToast({
    title: `${part.label} installed`,
    description: getInstalledDroneBonusSummaryText(),
  });
  return true;
};

const removeDronePart = (partId) => {
  const part = getDroneCraftingPartById(partId);
  if (!part || !isDroneCraftingPartEquipped(partId)) {
    return false;
  }

  droneCraftingState.equippedPartIds.delete(partId);
  persistDroneCraftingState();
  refreshInventoryUi();
  renderDroneCustomizationModal();
  syncDroneMiningSpeedBonusWithScene();
  showTerminalToast({
    title: `${part.label} removed`,
    description: getInstalledDroneBonusSummaryText(),
  });
  return true;
};

const handleDronePartActionClick = (event) => {
  const button =
    event.target instanceof HTMLElement
      ? event.target.closest("[data-drone-part-action]")
      : null;

  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  event.preventDefault();

  const partId = button.dataset.dronePartId;
  const action = button.dataset.dronePartAction;
  if (!partId || !action) {
    return;
  }

  if (action === "install") {
    installDronePart(partId);
    return;
  }

  if (action === "remove") {
    removeDronePart(partId);
  }
};

const renderDronePartsPanel = () => {
  const {
    partsSummary,
    partsAvailableList,
    partsAvailableEmpty,
    partsInstalledList,
    partsInstalledEmpty,
  } = getDroneCustomizationModalElements();

  if (
    !(partsAvailableList instanceof HTMLElement) ||
    !(partsInstalledList instanceof HTMLElement)
  ) {
    return;
  }

  const availableParts = getDroneCraftingInventoryParts();
  const installedParts = getDroneCraftingInstalledParts();

  if (partsSummary instanceof HTMLElement) {
    partsSummary.textContent = `Installed ${installedParts.length}/${DRONE_CRAFTING_PARTS.length} • ${getInstalledDroneBonusSummaryText()}`;
  }

  partsAvailableList.innerHTML = "";
  availableParts.forEach((part) => {
    partsAvailableList.appendChild(
      createDronePartsPanelItem({
        part,
        action: "install",
        actionLabel: "Install",
      })
    );
  });

  partsInstalledList.innerHTML = "";
  installedParts.forEach((part) => {
    partsInstalledList.appendChild(
      createDronePartsPanelItem({
        part,
        action: "remove",
        actionLabel: "Remove",
      })
    );
  });

  if (partsAvailableEmpty instanceof HTMLElement) {
    partsAvailableEmpty.hidden = availableParts.length > 0;
  }
  if (partsInstalledEmpty instanceof HTMLElement) {
    partsInstalledEmpty.hidden = installedParts.length > 0;
  }

  if (!partsAvailableList.dataset.boundPartsActions) {
    partsAvailableList.dataset.boundPartsActions = "true";
    partsAvailableList.addEventListener("click", handleDronePartActionClick);
  }
  if (!partsInstalledList.dataset.boundPartsActions) {
    partsInstalledList.dataset.boundPartsActions = "true";
    partsInstalledList.addEventListener("click", handleDronePartActionClick);
  }
};

const renderDroneCustomizationModal = () => {
  if (!droneCustomizationModalActive) {
    return;
  }

  const {
    partsSummary,
    partsAvailableList,
    partsAvailableEmpty,
    partsInstalledList,
    partsInstalledEmpty,
    skinList,
    skinEmpty,
    modelList,
    modelEmpty,
    modelPreviewCanvas,
    modelPreviewTitle,
    modelPreviewDescription,
    previewCanvas,
    previewTitle,
    previewDescription,
  } =
    getDroneCustomizationModalElements();
  bindDroneCustomizationTabEvents();
  syncDroneCustomizationTabState(droneCustomizationActiveTab);
  if (
    partsSummary instanceof HTMLElement ||
    partsAvailableList instanceof HTMLElement ||
    partsAvailableEmpty instanceof HTMLElement ||
    partsInstalledList instanceof HTMLElement ||
    partsInstalledEmpty instanceof HTMLElement
  ) {
    renderDronePartsPanel();
  }
  if (!(skinList instanceof HTMLElement)) {
    return;
  }

  skinList.innerHTML = "";
  if (modelList instanceof HTMLElement) {
    modelList.innerHTML = "";
  }

  const skinOptions = sceneController?.getDroneSkinOptions?.() ?? [];
  const hasOptions = Array.isArray(skinOptions) && skinOptions.length > 0;
  const modelOptions = sceneController?.getDroneModelOptions?.() ?? [];
  const hasModelOptions = Array.isArray(modelOptions) && modelOptions.length > 0;

  if (skinEmpty instanceof HTMLElement) {
    skinEmpty.hidden = hasOptions;
  }
  if (modelEmpty instanceof HTMLElement) {
    modelEmpty.hidden = hasModelOptions;
  }

  if (!hasModelOptions) {
    if (modelPreviewTitle instanceof HTMLElement) {
      modelPreviewTitle.textContent = "Drone model preview";
    }
    if (modelPreviewDescription instanceof HTMLElement) {
      modelPreviewDescription.textContent = "No model data available.";
    }
    teardownDroneModelPreviewRuntime();
  }

  if (!hasOptions) {
    if (previewTitle instanceof HTMLElement) {
      previewTitle.textContent = "Drone skin preview";
    }
    if (previewDescription instanceof HTMLElement) {
      previewDescription.textContent = "No skin data available.";
    }
    teardownDroneModelPreviewRuntime();
    if (previewCanvas instanceof HTMLCanvasElement) {
      const context = previewCanvas.getContext("2d");
      if (context) {
        droneSkinPreviewState.renderToken += 1;
        drawDroneSkinPreviewPlaceholder(
          context,
          previewCanvas.width || 960,
          previewCanvas.height || 540
        );
      }
    }
  } else {
    const activeSkinId = sceneController?.getActiveDroneSkinId?.() ?? null;

    skinOptions.forEach((option) => {
      if (!option || typeof option.id !== "string" || option.id.trim() === "") {
        return;
      }

      const optionId = option.id.trim();
      const optionLabel =
        typeof option.label === "string" && option.label.trim() !== ""
          ? option.label.trim()
          : optionId;
      const optionDescription =
        typeof option.description === "string" && option.description.trim() !== ""
          ? option.description.trim()
          : "Available drone skin profile.";
      const isActive = optionId === activeSkinId;

      const item = document.createElement("li");
      item.className = "lift-selector__item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "lift-selector__button";
      button.dataset.droneSkinId = optionId;
      button.dataset.droneSkinLabel = optionLabel;
      button.setAttribute("aria-current", isActive ? "true" : "false");
      button.disabled = isActive;

      const title = document.createElement("span");
      title.className = "lift-selector__title";
      title.textContent = optionLabel;
      button.appendChild(title);

      const description = document.createElement("span");
      description.className = "lift-selector__description";
      description.textContent = optionDescription;
      button.appendChild(description);

      const status = document.createElement("span");
      status.className = "lift-selector__status";
      status.textContent = "Active skin";
      status.hidden = !isActive;
      button.appendChild(status);

      button.addEventListener("click", handleDroneSkinOptionClick);
      item.appendChild(button);
      skinList.appendChild(item);
    });
  }

  if (modelList instanceof HTMLElement && hasModelOptions) {
    const activeModelId = sceneController?.getActiveDroneModelId?.() ?? null;
    const mediumModelRequirementStates = getMediumDroneCraftRequirementStates();
    const mediumModelRequirementText = formatMediumDroneCraftRequirementProgress(
      mediumModelRequirementStates,
      { maxEntries: 3 }
    );
    const mediumModelRequirementsWeight = formatGrams(
      getCraftingRequirementsTotalWeightGrams(getMediumDroneCraftRequirements())
    );
    const allUpgradePartsInstalled = hasInstalledAllDroneUpgradeParts();
    const hasMediumModelMaterials = hasAllMediumDroneCraftRequirements(
      mediumModelRequirementStates
    );
    const canCraftMediumModel = allUpgradePartsInstalled && hasMediumModelMaterials;

    modelOptions.forEach((option) => {
      if (!option || typeof option.id !== "string" || option.id.trim() === "") {
        return;
      }

      const optionId = option.id.trim();
      const optionLabel =
        typeof option.label === "string" && option.label.trim() !== ""
          ? option.label.trim()
          : optionId;
      const optionDescription =
        typeof option.description === "string" && option.description.trim() !== ""
          ? option.description.trim()
          : "Available drone model profile.";
      const normalizedModelId = normalizeDroneUnlockModelId(optionId);
      const unlocked = isDroneModelUnlocked(normalizedModelId);
      const isActive = unlocked && optionId === activeModelId;

      const item = document.createElement("li");
      item.className = "lift-selector__item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "lift-selector__button";
      button.dataset.droneModelLabel = optionLabel;
      button.setAttribute("aria-current", isActive ? "true" : "false");

      const title = document.createElement("span");
      title.className = "lift-selector__title";
      title.textContent = optionLabel;
      button.appendChild(title);

      const description = document.createElement("span");
      description.className = "lift-selector__description";
      if (!unlocked && normalizedModelId === DRONE_MEDIUM_MODEL_ID) {
        const installGateText = allUpgradePartsInstalled
          ? "All upgrades installed."
          : `Install all ${DRONE_CRAFTING_PARTS.length} upgrades first.`;
        description.textContent = `${installGateText} Recipe (${mediumModelRequirementsWeight}): ${mediumModelRequirementText}.`;
      } else if (!unlocked) {
        description.textContent =
          "Locked frame. Complete medium-model progression first.";
      } else {
        description.textContent = optionDescription;
      }
      button.appendChild(description);

      const status = document.createElement("span");
      status.className = "lift-selector__status";
      if (unlocked) {
        button.dataset.droneModelId = optionId;
        button.disabled = isActive;
        status.textContent = "Active model";
        status.hidden = !isActive;
      } else if (normalizedModelId === DRONE_MEDIUM_MODEL_ID) {
        button.dataset.droneModelId = optionId;
        button.dataset.droneModelAction = "craft-medium";
        button.disabled = !canCraftMediumModel;
        status.textContent = canCraftMediumModel
          ? "Craft medium drone"
          : allUpgradePartsInstalled
            ? "Missing materials"
            : "Install all upgrades";
        status.hidden = false;
        button.setAttribute("aria-current", "false");
      } else {
        button.disabled = true;
        status.textContent = "Locked";
        status.hidden = false;
        button.setAttribute("aria-current", "false");
      }
      button.appendChild(status);

      button.addEventListener("click", handleDroneModelOptionClick);
      item.appendChild(button);
      modelList.appendChild(item);
    });
  }

  renderActiveDroneCustomizationPreview();
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
  return formatter.format(value);
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
const MARKET_SELL_RETURN_FACTOR = 0.9;

let marketState = loadMarketState();
let teardownMarketActionBinding = null;
let marketSearchQuery = "";

const getMarketModalElements = () => {
  if (!quickAccessModalContent) {
    return { list: null, balance: null, empty: null, search: null, count: null };
  }

  return {
    list: quickAccessModalContent.querySelector("[data-market-list]"),
    balance: quickAccessModalContent.querySelector("[data-market-balance]"),
    search: quickAccessModalContent.querySelector("[data-market-search]"),
    count: quickAccessModalContent.querySelector("[data-market-count]"),
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

const normalizeMarketSearchQuery = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const getMarketSalePrice = (item) =>
  Math.max(MARKET_MIN_PRICE, Math.floor((item?.price ?? 0) * MARKET_SELL_RETURN_FACTOR));

const defaultMarketItemsById = new Map(
  getDefaultMarketState()
    .items.filter((item) => typeof item?.id === "string" && item.id.trim() !== "")
    .map((item) => [item.id.trim().toLowerCase(), item])
);

const getMarketItemForElement = (element) => {
  const symbol =
    typeof element?.symbol === "string" && element.symbol.trim() !== ""
      ? element.symbol.trim().toLowerCase()
      : "";

  if (!symbol) {
    return null;
  }

  const liveItem = Array.isArray(marketState?.items)
    ? marketState.items.find((item) => item?.id === symbol)
    : null;

  return liveItem ?? defaultMarketItemsById.get(symbol) ?? null;
};

const getMissionRewardMarsMoney = (mission) => {
  const requirement = resolveMissionRequirement(mission);
  if (!requirement?.element) {
    return Number.isFinite(mission?.rewardMarsMoney) ? Math.max(0, Math.round(mission.rewardMarsMoney)) : null;
  }

  const marketItem = getMarketItemForElement(requirement.element);
  if (!marketItem) {
    return Number.isFinite(mission?.rewardMarsMoney) ? Math.max(0, Math.round(mission.rewardMarsMoney)) : null;
  }

  const salePrice = getMarketSalePrice(marketItem);
  const normalizedCount = Number.isFinite(requirement.count) ? Math.max(1, Math.floor(requirement.count)) : 1;
  return Math.max(1, Math.round(salePrice * normalizedCount * 2));
};

const getMarketInventoryLoadSummary = () => {
  const currentLoadGrams = Number.isFinite(inventoryState.currentLoadGrams)
    ? inventoryState.currentLoadGrams
    : recalculateInventoryLoad();
  return `${formatGrams(currentLoadGrams)} / ${formatKilograms(getInventoryCapacityKg())}`;
};

const getMarketSearchableText = (item) =>
  [
    item?.symbol,
    item?.name,
    item?.category,
    item?.summary,
    Number.isFinite(item?.number) ? String(item.number) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const getFilteredMarketItems = () => {
  const items = Array.isArray(marketState?.items) ? marketState.items : [];
  const normalizedQuery = normalizeMarketSearchQuery(marketSearchQuery);

  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => getMarketSearchableText(item).includes(normalizedQuery));
};

const executeMarketTrade = (itemId, action) => {
  const item = marketState?.items?.find((entry) => entry?.id === itemId);

  if (!item || (action !== "buy" && action !== "sell")) {
    return false;
  }

  if (action === "buy") {
    const balance = getCurrencyBalance();
    if (balance < item.price) {
      showTerminalToast({
        title: "Insufficient funds",
        description: `${formatCraftingElementName(item)} costs ${formatMarsMoney(item.price)}.`,
      });
      return false;
    }

    const purchased = recordInventoryResource({
      source: "market",
      element: item,
    });
    if (!purchased) {
      showTerminalToast({
        title: "Inventory full",
        description: `Free some capacity before buying ${formatCraftingElementName(item)}.`,
      });
      return false;
    }

    const purchasePrice = item.price;
    addMarsMoney(-purchasePrice);
    adjustMarketPrice(item, "buy");
    showTerminalToast({
      title: "Element purchased",
      description: `${formatCraftingElementName(item)} added to inventory for ${formatMarsMoney(
        purchasePrice
      )}.`,
    });
  } else {
    const ownedQuantity = getInventoryResourceCount(item);
    if (ownedQuantity <= 0) {
      showTerminalToast({
        title: "Nothing to sell",
        description: `${formatCraftingElementName(item)} is not in your inventory.`,
      });
      return false;
    }

    const salePrice = getMarketSalePrice(item);
    const sold = spendInventoryResource(item, 1);
    if (!sold) {
      showTerminalToast({
        title: "Trade failed",
        description: "Inventory changed before the sale completed. Try again.",
      });
      return false;
    }

    addMarsMoney(salePrice);
    adjustMarketPrice(item, "sell");
    showTerminalToast({
      title: "Element sold",
      description: `${formatCraftingElementName(item)} sold for ${formatMarsMoney(salePrice)}.`,
    });
  }

  persistCurrentMarketState();

  if (marketModalActive) {
    renderMarketModal();
  }

  return true;
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

const handleMarketSearchInput = (event) => {
  if (!marketModalActive) {
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  marketSearchQuery = normalizeMarketSearchQuery(target.value);
  renderMarketModal();
};

const teardownMarketModal = () => {
  marketModalActive = false;
  marketSearchQuery = "";

  if (typeof teardownMarketActionBinding === "function") {
    teardownMarketActionBinding();
    teardownMarketActionBinding = null;
  }
};

const bindMarketModalEvents = () => {
  const { list, search } = getMarketModalElements();

  if (typeof teardownMarketActionBinding === "function") {
    return;
  }

  if (list instanceof HTMLElement) {
    list.addEventListener("click", handleMarketActionClick);
  }

  if (search instanceof HTMLInputElement) {
    search.addEventListener("input", handleMarketSearchInput);
  }

  teardownMarketActionBinding = () => {
    if (list instanceof HTMLElement) {
      list.removeEventListener("click", handleMarketActionClick);
    }

    if (search instanceof HTMLInputElement) {
      search.removeEventListener("input", handleMarketSearchInput);
    }
  };
};

const createMarketMetric = (label, value) => {
  const metric = document.createElement("p");
  metric.className = "market-panel__metric";

  const metricLabel = document.createElement("span");
  metricLabel.className = "market-panel__metric-label";
  metricLabel.textContent = label;
  metric.appendChild(metricLabel);

  const metricValue = document.createElement("span");
  metricValue.className = "market-panel__metric-value";
  metricValue.textContent = value;
  metric.appendChild(metricValue);

  return metric;
};

const createMarketRow = (item) => {
  const row = document.createElement("article");
  row.className = "market-panel__row";

  const identity = document.createElement("div");
  identity.className = "market-panel__identity";

  const symbol = document.createElement("span");
  symbol.className = "market-panel__symbol";
  symbol.textContent = item?.symbol || "?";
  identity.appendChild(symbol);

  const copy = document.createElement("div");
  copy.className = "market-panel__identity-copy";

  const itemLabel = item?.name || item?.symbol || "Unknown element";
  const itemNumber = Number.isFinite(item?.number) ? Math.round(item.number) : null;
  const title = document.createElement("h3");
  title.className = "market-panel__name";
  title.textContent = itemNumber !== null ? `#${itemNumber} ${itemLabel}` : itemLabel;
  copy.appendChild(title);

  identity.appendChild(copy);
  row.appendChild(identity);

  const metrics = document.createElement("div");
  metrics.className = "market-panel__metrics";

  const ownedQuantity = getInventoryResourceCount(item);
  metrics.appendChild(createMarketMetric("Buy", formatMarsMoney(item.price)));
  metrics.appendChild(createMarketMetric("Sell", formatMarsMoney(getMarketSalePrice(item))));
  metrics.appendChild(createMarketMetric("In Inventory", `${ownedQuantity}`));
  row.appendChild(metrics);

  const actions = document.createElement("div");
  actions.className = "market-panel__actions";

  const balance = getCurrencyBalance();
  const hasInventorySpace = canAcceptInventoryWeight(getInventoryElementWeight(item));

  const buyButton = document.createElement("button");
  buyButton.type = "button";
  buyButton.className = "quick-access-modal__action market-panel__button";
  buyButton.dataset.marketAction = "buy";
  buyButton.dataset.marketItemId = item.id;
  buyButton.textContent = "Buy 1";
  buyButton.disabled = balance < item.price || !hasInventorySpace;
  actions.appendChild(buyButton);

  const sellButton = document.createElement("button");
  sellButton.type = "button";
  sellButton.className = "quick-access-modal__action market-panel__button";
  sellButton.dataset.marketAction = "sell";
  sellButton.dataset.marketItemId = item.id;
  sellButton.textContent = "Sell 1";
  sellButton.disabled = ownedQuantity <= 0;
  actions.appendChild(sellButton);

  row.appendChild(actions);
  return row;
};

function renderMarketModal() {
  if (!marketModalActive) {
    return;
  }

  const { list, balance, empty, search, count } = getMarketModalElements();
  const items = Array.isArray(marketState?.items) ? marketState.items : [];
  const filteredItems = getFilteredMarketItems();
  const hasItems = filteredItems.length > 0;

  if (balance instanceof HTMLElement) {
    balance.textContent = `Balance: ${formatMarsMoney(
      getCurrencyBalance()
    )} • Inventory: ${getMarketInventoryLoadSummary()}`;
  }

  if (search instanceof HTMLInputElement && search.value !== marketSearchQuery) {
    search.value = marketSearchQuery;
  }

  if (count instanceof HTMLElement) {
    count.textContent = `Showing ${filteredItems.length} of ${items.length} elements`;
  }

  if (!(list instanceof HTMLElement)) {
    return;
  }

  list.innerHTML = "";

  if (empty instanceof HTMLElement) {
    empty.hidden = hasItems;
  }

  if (!hasItems) {
    return;
  }

  filteredItems.forEach((item) => {
    if (!item) {
      return;
    }

    list.appendChild(createMarketRow(item));
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

  const rewardMarsMoney = getMissionRewardMarsMoney(mission);
  const hasReward = Number.isFinite(rewardMarsMoney);

  const reward = document.createElement("p");
  reward.className = "mission-reward";
  reward.textContent = hasReward
    ? `Reward: ${formatMarsMoney(rewardMarsMoney)}`
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
      const rewardDefined = getMissionRewardMarsMoney(mission);
      const hasRewardDefined = Number.isFinite(rewardDefined);

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

      if (!hasRewardDefined) {
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

      completeMission(mission.id, { rewardMarsMoney: rewardDefined });
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
  droneCustomizationModalActive = false;
  costumeCustomizationModalActive = false;
  droneCustomizationActiveTab = DRONE_CUSTOMIZATION_DEFAULT_TAB_ID;
  droneSkinPreviewState.renderToken += 1;
  droneSkinPreviewState.pendingSkinId = null;
  teardownDroneModelPreviewRuntime();
  newsModalState.renderToken += 1;
  teardownMarketModal();
  teardownResearchModal();
  teardownStorageBoxModal();
  teardownCraftingTableModal();
};

const initializeQuickAccessModalContent = (option) => {
  liftModalActive = option?.id === LIFT_MODAL_OPTION.id;
  missionModalActive = option?.id === "missions";
  marketModalActive = option?.id === "market";
  researchModalActive = option?.id === "research";
  droneCustomizationModalActive = option?.id === "drone-customization";
  costumeCustomizationModalActive = option?.id === QUICK_ACCESS_MODAL_COSTUME_SETUP_OPTION_ID;
  storageBoxModalActive = option?.id === STORAGE_BOX_MODAL_OPTION.id;
  craftingTableModalActive = option?.id === CRAFTING_TABLE_MODAL_OPTION.id;

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

  if (researchModalActive) {
    renderResearchModal();
    bindResearchModalEvents();
  } else {
    teardownResearchModal();
  }

  if (droneCustomizationModalActive) {
    renderDroneCustomizationModal();
  }

  if (costumeCustomizationModalActive) {
    renderCostumeCustomizationModal();
  }

  if (storageBoxModalActive) {
    renderStorageBoxModal();
    bindStorageBoxModalEvents();
  } else {
    teardownStorageBoxModal();
  }

  if (craftingTableModalActive) {
    renderCraftingTableModal();
    bindCraftingTableModalEvents();
  } else {
    teardownCraftingTableModal();
  }

  if (option?.id === "news") {
    renderNewsModal();
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

const normalizeStorageBoxId = (value) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || STORAGE_BOX_DEFAULT_ID;
};

const normalizeStorageBoxLabel = (value) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || STORAGE_BOX_DEFAULT_LABEL;
};

const normalizeStorageBoxCapacityKg = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.max(0.1, numericValue)
    : STORAGE_BOX_CAPACITY_KG;
};

const createStorageBoxRecord = (boxId, { label, capacityKg } = {}) => ({
  id: normalizeStorageBoxId(boxId),
  label: normalizeStorageBoxLabel(label),
  capacityKg: normalizeStorageBoxCapacityKg(capacityKg),
  entries: [],
  entryMap: new Map(),
  currentLoadGrams: 0,
  capacityRejection: null,
});

const updateStorageBoxRecordMetadata = (record, { label, capacityKg } = {}) => {
  if (!record || typeof record !== "object") {
    return null;
  }

  if (typeof label === "string" && label.trim()) {
    record.label = normalizeStorageBoxLabel(label);
  }

  if (Number.isFinite(Number(capacityKg)) && Number(capacityKg) > 0) {
    record.capacityKg = normalizeStorageBoxCapacityKg(capacityKg);
  }

  return record;
};

const ensureStorageBoxRecord = (boxId = STORAGE_BOX_DEFAULT_ID, options = {}) => {
  const normalizedId = normalizeStorageBoxId(boxId);
  let record = storageBoxState.boxes.get(normalizedId);

  if (!record) {
    record = createStorageBoxRecord(normalizedId, options);
    storageBoxState.boxes.set(normalizedId, record);
    return record;
  }

  return updateStorageBoxRecordMetadata(record, options);
};

const getStorageBoxRecord = (boxId = STORAGE_BOX_DEFAULT_ID, options = {}) =>
  ensureStorageBoxRecord(boxId, options);

const getActiveStorageBoxRecord = () =>
  getStorageBoxRecord(storageBoxState.activeBoxId ?? STORAGE_BOX_DEFAULT_ID);

const setActiveStorageBoxRecord = ({ id, label, capacityKg } = {}) => {
  const record = ensureStorageBoxRecord(id, { label, capacityKg });
  storageBoxState.activeBoxId = record.id;
  refreshStorageBoxModalIfOpen();
  schedulePersistStorageBoxState();
  return record;
};

const getStorageBoxCapacityKg = (boxId = STORAGE_BOX_DEFAULT_ID) =>
  getStorageBoxRecord(boxId).capacityKg;

const getStorageBoxCapacityGrams = (boxId = STORAGE_BOX_DEFAULT_ID) =>
  Math.max(
    0,
    Math.round(getStorageBoxCapacityKg(boxId) * GRAMS_PER_KILOGRAM)
  );

const recalculateStorageBoxLoad = (boxId = STORAGE_BOX_DEFAULT_ID) => {
  const record = getStorageBoxRecord(boxId);
  const totalWeight = record.entries.reduce(
    (sum, entry) => sum + getInventoryEntryWeight(entry),
    0
  );

  record.currentLoadGrams = Math.max(0, totalWeight);
  return record.currentLoadGrams;
};

const canStorageBoxAcceptWeight = (
  additionalWeight,
  boxId = STORAGE_BOX_DEFAULT_ID
) => {
  const normalizedAdditional = Math.max(0, Number(additionalWeight) || 0);
  const record = getStorageBoxRecord(boxId);
  const currentLoad = Number.isFinite(record.currentLoadGrams)
    ? record.currentLoadGrams
    : recalculateStorageBoxLoad(record.id);

  return currentLoad + normalizedAdditional <= getStorageBoxCapacityGrams(record.id);
};

const getStorageBoxEntryByKey = (
  key,
  boxId = storageBoxState.activeBoxId ?? STORAGE_BOX_DEFAULT_ID
) => {
  if (typeof key !== "string" || key.trim() === "") {
    return null;
  }

  return getStorageBoxRecord(boxId).entryMap.get(key) ?? null;
};

const getStorageBoxResourceEntry = (element, boxId = STORAGE_BOX_DEFAULT_ID) => {
  const sanitized = sanitizeInventoryElement(element ?? {});
  const key = getInventoryEntryKey(sanitized);
  return getStorageBoxRecord(boxId).entryMap.get(key) ?? null;
};

const getStorageBoxResourceCount = (element, boxId = STORAGE_BOX_DEFAULT_ID) =>
  getStorageBoxResourceEntry(element, boxId)?.count ?? 0;

const setStorageBoxCapacityRejection = (
  message,
  boxId = STORAGE_BOX_DEFAULT_ID
) => {
  const record = getStorageBoxRecord(boxId);
  const normalized = typeof message === "string" ? message.trim() : "";
  record.capacityRejection = normalized || null;
  if (record.id === (storageBoxState.activeBoxId ?? STORAGE_BOX_DEFAULT_ID)) {
    refreshStorageBoxModalIfOpen();
  }
  schedulePersistStorageBoxState();
};

const clearStorageBoxCapacityRejection = (boxId = STORAGE_BOX_DEFAULT_ID) => {
  const record = getStorageBoxRecord(boxId);
  if (!record.capacityRejection) {
    return;
  }

  record.capacityRejection = null;
  if (record.id === (storageBoxState.activeBoxId ?? STORAGE_BOX_DEFAULT_ID)) {
    refreshStorageBoxModalIfOpen();
  }
  schedulePersistStorageBoxState();
};

const recordStorageBoxResource = (
  element,
  count = 1,
  boxId = STORAGE_BOX_DEFAULT_ID
) => {
  const record = getStorageBoxRecord(boxId);
  const normalizedCount = Number.isFinite(count)
    ? Math.max(1, Math.floor(count))
    : 1;
  const normalizedElement = sanitizeInventoryElement(element ?? {});
  if (
    !normalizedElement.symbol &&
    !normalizedElement.name &&
    normalizedElement.number === null
  ) {
    normalizedElement.name = "Unknown resource";
  }

  const unitWeight = getInventoryElementWeight(normalizedElement);
  const additionalWeight = unitWeight * normalizedCount;
  if (!canStorageBoxAcceptWeight(additionalWeight, record.id)) {
    const label =
      normalizedElement.name || normalizedElement.symbol || "This resource";
    const attemptedWeight = formatGrams(additionalWeight || 0);
    setStorageBoxCapacityRejection(
      `${label} cannot be stored. Storage full (${attemptedWeight} would exceed ${formatKilograms(
        getStorageBoxCapacityKg(record.id)
      )}).`,
      record.id
    );
    return false;
  }

  const key = getInventoryEntryKey(normalizedElement);
  let entry = record.entryMap.get(key);

  if (!entry) {
    entry = {
      key,
      element: { ...normalizedElement },
      count: 0,
      lastTransferredAt: 0,
    };
    record.entryMap.set(key, entry);
    record.entries.push(entry);
  } else {
    if (!entry.element.symbol && normalizedElement.symbol) {
      entry.element.symbol = normalizedElement.symbol;
    }
    if (!entry.element.name && normalizedElement.name) {
      entry.element.name = normalizedElement.name;
    }
    if (
      (!Number.isFinite(entry.element.weight) || entry.element.weight <= 0) &&
      Number.isFinite(normalizedElement.weight) &&
      normalizedElement.weight > 0
    ) {
      entry.element.weight = normalizedElement.weight;
    }
    if (entry.element.number === null && normalizedElement.number !== null) {
      entry.element.number = normalizedElement.number;
    }
  }

  entry.count += normalizedCount;
  entry.lastTransferredAt = Date.now();
  recalculateStorageBoxLoad(record.id);
  clearStorageBoxCapacityRejection(record.id);
  if (record.id === (storageBoxState.activeBoxId ?? STORAGE_BOX_DEFAULT_ID)) {
    refreshStorageBoxModalIfOpen();
  }
  schedulePersistStorageBoxState();
  return true;
};

const spendStorageBoxResource = (
  element,
  count = 1,
  boxId = STORAGE_BOX_DEFAULT_ID
) => {
  const record = getStorageBoxRecord(boxId);
  const entry = getStorageBoxResourceEntry(element, record.id);
  const normalizedCount = Number.isFinite(count)
    ? Math.max(1, Math.floor(count))
    : 1;

  if (!entry || !Number.isFinite(entry.count) || entry.count < normalizedCount) {
    return false;
  }

  entry.count -= normalizedCount;
  entry.lastTransferredAt = Date.now();

  if (entry.count <= 0) {
    record.entryMap.delete(entry.key);
    const index = record.entries.indexOf(entry);
    if (index >= 0) {
      record.entries.splice(index, 1);
    }
  }

  recalculateStorageBoxLoad(record.id);
  if (record.currentLoadGrams <= getStorageBoxCapacityGrams(record.id)) {
    clearStorageBoxCapacityRejection(record.id);
  }
  if (record.id === (storageBoxState.activeBoxId ?? STORAGE_BOX_DEFAULT_ID)) {
    refreshStorageBoxModalIfOpen();
  }
  schedulePersistStorageBoxState();
  return true;
};

const transferInventoryToStorageBox = (entryKey, count = 1) => {
  const activeBoxId = getActiveStorageBoxRecord().id;
  const inventoryEntry = getInventoryEntryByKey(entryKey);
  const normalizedCount = Number.isFinite(count)
    ? Math.max(1, Math.floor(count))
    : 1;
  if (
    !inventoryEntry ||
    !Number.isFinite(inventoryEntry.count) ||
    inventoryEntry.count < normalizedCount
  ) {
    return false;
  }

  const unitWeight = getInventoryElementWeight(inventoryEntry.element);
  const transferWeight = unitWeight * normalizedCount;
  if (!canStorageBoxAcceptWeight(transferWeight, activeBoxId)) {
    const label = getStorageEntryDisplayName(inventoryEntry);
    setStorageBoxCapacityRejection(
      `${label} cannot be stored. ${formatGrams(transferWeight)} exceeds free storage capacity.`,
      activeBoxId
    );
    return false;
  }

  const spent = spendInventoryResource(inventoryEntry.element, normalizedCount);
  if (!spent) {
    return false;
  }

  const stored = recordStorageBoxResource(
    inventoryEntry.element,
    normalizedCount,
    activeBoxId
  );
  if (stored) {
    return true;
  }

  for (let index = 0; index < normalizedCount; index += 1) {
    recordInventoryResource({ element: inventoryEntry.element });
  }
  return false;
};

const transferStorageBoxToInventory = (entryKey, count = 1) => {
  const activeBoxId = getActiveStorageBoxRecord().id;
  const storageEntry = getStorageBoxEntryByKey(entryKey, activeBoxId);
  const normalizedCount = Number.isFinite(count)
    ? Math.max(1, Math.floor(count))
    : 1;
  if (
    !storageEntry ||
    !Number.isFinite(storageEntry.count) ||
    storageEntry.count < normalizedCount
  ) {
    return false;
  }

  const unitWeight = getInventoryElementWeight(storageEntry.element);
  const transferWeight = unitWeight * normalizedCount;
  if (!canAcceptInventoryWeight(transferWeight)) {
    const label = getStorageEntryDisplayName(storageEntry);
    setInventoryCapacityRejection(
      `${label} cannot be added. Capacity reached (${formatGrams(
        transferWeight
      )} would exceed ${formatKilograms(getInventoryCapacityKg())}).`
    );
    return false;
  }

  const removed = spendStorageBoxResource(
    storageEntry.element,
    normalizedCount,
    activeBoxId
  );
  if (!removed) {
    return false;
  }

  let addedCount = 0;
  for (let index = 0; index < normalizedCount; index += 1) {
    const added = recordInventoryResource({ element: storageEntry.element });
    if (!added) {
      break;
    }
    addedCount += 1;
  }

  if (addedCount === normalizedCount) {
    return true;
  }

  const missingCount = normalizedCount - addedCount;
  if (missingCount > 0) {
    recordStorageBoxResource(storageEntry.element, missingCount, activeBoxId);
  }
  return addedCount > 0;
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

const renderInventoryItemsEntries = () => {
  if (!(inventoryItemsList instanceof HTMLElement)) {
    return;
  }

  inventoryItemsList.innerHTML = "";
  const researchBlueprints = DRONE_CRAFTING_PARTS.filter((part) =>
    isDroneResearchBlueprintInInventory(part.id)
  );
  const costumeBlueprints = COSTUME_RESEARCH_PROJECTS.filter((project) =>
    isCostumeResearchBlueprintInInventory(project.id)
  );
  const craftedParts = DRONE_CRAFTING_PARTS.filter((part) =>
    isDroneCraftingPartCrafted(part.id)
  );
  const craftedCostumeProjects = COSTUME_RESEARCH_PROJECTS.filter((project) =>
    isCostumeResearchProjectCrafted(project.id)
  );
  const totalItems =
    researchBlueprints.length +
    costumeBlueprints.length +
    craftedParts.length +
    craftedCostumeProjects.length;

  if (inventoryItemsEmptyState instanceof HTMLElement) {
    inventoryItemsEmptyState.hidden = totalItems > 0;
  }

  if (totalItems === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();
  researchBlueprints.forEach((part) => {
    const item = document.createElement("li");
    item.className = "inventory-items-list__entry";

    const title = document.createElement("p");
    title.className = "inventory-items-list__title";
    title.textContent = `${part.label} Blueprint`;
    item.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "inventory-items-list__meta";
    meta.textContent =
      "Research blueprint in inventory. Load it into the Crafting Table to unlock production.";
    item.appendChild(meta);

    fragment.appendChild(item);
  });

  costumeBlueprints.forEach((project) => {
    const item = document.createElement("li");
    item.className = "inventory-items-list__entry";

    const title = document.createElement("p");
    title.className = "inventory-items-list__title";
    title.textContent = `${project.label} Blueprint`;
    item.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "inventory-items-list__meta";
    meta.textContent =
      "Suit upgrade blueprint in inventory. Load it into the Crafting Table to unlock production.";
    item.appendChild(meta);

    fragment.appendChild(item);
  });

  craftedParts.forEach((part) => {
    const item = document.createElement("li");
    item.className = "inventory-items-list__entry";

    const title = document.createElement("p");
    title.className = "inventory-items-list__title";
    title.textContent = part.label;
    item.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "inventory-items-list__meta";
    const effectLabel = formatDronePartEffectLabel(part);
    meta.textContent = isDroneCraftingPartEquipped(part.id)
      ? `Installed on drone. ${effectLabel}`
      : `Available to install in Drone Setup > Parts. ${effectLabel}`;
    item.appendChild(meta);

    fragment.appendChild(item);
  });

  craftedCostumeProjects.forEach((project) => {
    const item = document.createElement("li");
    item.className = "inventory-items-list__entry";

    const title = document.createElement("p");
    title.className = "inventory-items-list__title";
    title.textContent = project.label;
    item.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "inventory-items-list__meta";
    meta.textContent = isCostumeResearchProjectCompleted(project.id)
      ? `Installed on suit. ${formatCostumeResearchEffectLabel(project)}`
      : `Available to install in Costume Setup. ${formatCostumeResearchEffectLabel(project)}`;
    item.appendChild(meta);

    fragment.appendChild(item);
  });

  inventoryItemsList.appendChild(fragment);
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
  renderInventoryItemsEntries();
  updateInventorySummary();
  renderDroneInventoryUi();
  updateInventoryCapacityWarning();
  refreshStorageBoxModalIfOpen();
  refreshResearchModalIfOpen();
  refreshCraftingTableModalIfOpen();

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

const normalizeStoredStorageBoxEntry = (rawEntry) => {
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

  const key = getInventoryEntryKey(element);
  const lastTransferredAt = Number.isFinite(rawEntry.lastTransferredAt)
    ? rawEntry.lastTransferredAt
    : 0;

  return {
    key,
    element: { ...element },
    count,
    lastTransferredAt,
  };
};

const aggregateStoredStorageBoxEntries = (rawEntries) => {
  const aggregatedEntries = [];
  const aggregatedMap = new Map();

  const sourceEntries = Array.isArray(rawEntries) ? rawEntries : [];
  sourceEntries.forEach((rawEntry) => {
    const normalized = normalizeStoredStorageBoxEntry(rawEntry);
    if (!normalized) {
      return;
    }

    const existing = aggregatedMap.get(normalized.key);
    if (!existing) {
      aggregatedMap.set(normalized.key, normalized);
      aggregatedEntries.push(normalized);
      return;
    }

    existing.count += normalized.count;
    if (normalized.lastTransferredAt > existing.lastTransferredAt) {
      existing.lastTransferredAt = normalized.lastTransferredAt;
    }

    if (!existing.element.symbol && normalized.element.symbol) {
      existing.element.symbol = normalized.element.symbol;
    }
    if (!existing.element.name && normalized.element.name) {
      existing.element.name = normalized.element.name;
    }
    if (
      (!Number.isFinite(existing.element.weight) || existing.element.weight <= 0) &&
      Number.isFinite(normalized.element.weight) &&
      normalized.element.weight > 0
    ) {
      existing.element.weight = normalized.element.weight;
    }
    if (
      existing.element.number === null &&
      normalized.element.number !== null
    ) {
      existing.element.number = normalized.element.number;
    }
  });

  return {
    entries: aggregatedEntries,
    entryMap: aggregatedMap,
  };
};

const createRestoredStorageBoxRecord = ({
  id,
  label,
  capacityKg,
  entries,
  loadGrams,
  capacityRejection,
} = {}) => {
  const record = createStorageBoxRecord(id, { label, capacityKg });
  const aggregated = aggregateStoredStorageBoxEntries(entries);
  record.entries.push(...aggregated.entries);
  record.entryMap = aggregated.entryMap;
  record.currentLoadGrams = Math.max(
    0,
    aggregated.entries.reduce((sum, entry) => sum + getInventoryEntryWeight(entry), 0),
    Number.isFinite(loadGrams) ? loadGrams : 0
  );

  if (typeof capacityRejection === "string") {
    const normalizedRejection = capacityRejection.trim();
    record.capacityRejection = normalizedRejection || null;
  }

  return record;
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

const serializeStorageBoxStateForPersistence = () => ({
  activeBoxId: normalizeStorageBoxId(storageBoxState.activeBoxId),
  boxes: Array.from(storageBoxState.boxes.values())
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((record) => ({
      id: record.id,
      label: record.label,
      capacityKg: record.capacityKg,
      entries: record.entries.map((entry) => ({
        key: entry.key,
        element: { ...entry.element },
        count: entry.count,
        lastTransferredAt: entry.lastTransferredAt ?? 0,
      })),
      loadGrams: Math.max(0, Math.round(record.currentLoadGrams || 0)),
      capacityRejection: record.capacityRejection,
    })),
});

const serializeDroneCraftingStateForPersistence = () => {
  const knownPartIds = new Set(DRONE_CRAFTING_PARTS.map((part) => part.id));
  const knownModelIds = new Set(DRONE_UNLOCKABLE_MODEL_IDS);
  const knownCostumeProjectIds = new Set(
    COSTUME_RESEARCH_PROJECTS.map((project) => project.id)
  );
  const researchedPartIds = Array.from(droneCraftingState.researchedPartIds).filter(
    (partId) => typeof partId === "string" && knownPartIds.has(partId)
  );
  const researchedPartSet = new Set(researchedPartIds);
  const inventoryResearchPartIds = Array.from(droneCraftingState.inventoryResearchPartIds).filter(
    (partId) =>
      typeof partId === "string" &&
      knownPartIds.has(partId) &&
      !researchedPartSet.has(partId)
  );
  const inventoryResearchPartSet = new Set(inventoryResearchPartIds);
  const readyResearchPartIds = Array.from(droneCraftingState.readyResearchPartIds).filter(
    (partId) =>
      typeof partId === "string" &&
      knownPartIds.has(partId) &&
      !researchedPartSet.has(partId) &&
      !inventoryResearchPartSet.has(partId)
  );
  const readyResearchPartSet = new Set(readyResearchPartIds);
  const craftedPartIds = Array.from(droneCraftingState.craftedPartIds).filter(
    (partId) => typeof partId === "string" && knownPartIds.has(partId)
  );
  const craftedPartSet = new Set(craftedPartIds);

  const equippedPartIds = Array.from(droneCraftingState.equippedPartIds).filter(
    (partId) =>
      typeof partId === "string" &&
      craftedPartSet.has(partId) &&
      knownPartIds.has(partId)
  );

  const readyPartIds = Array.from(droneCraftingState.readyPartIds).filter(
    (partId) =>
      typeof partId === "string" &&
      knownPartIds.has(partId) &&
      !craftedPartSet.has(partId)
  );
  const readyPartSet = new Set(readyPartIds);

  const activeJob = getDroneCraftingActiveJob();
  const activeJobForPersistence =
    activeJob &&
    knownPartIds.has(activeJob.partId) &&
    !craftedPartSet.has(activeJob.partId) &&
    !readyPartSet.has(activeJob.partId)
      ? {
          partId: activeJob.partId,
          startedAtMs: Math.floor(activeJob.startedAtMs),
          durationMs: Math.floor(activeJob.durationMs),
          completedAtMs: Math.floor(activeJob.completedAtMs),
        }
      : null;

  const activeResearchJob = getDroneResearchActiveJob();
  const activeResearchJobForPersistence =
    activeResearchJob &&
    knownPartIds.has(activeResearchJob.partId) &&
    !researchedPartSet.has(activeResearchJob.partId) &&
    !inventoryResearchPartSet.has(activeResearchJob.partId) &&
    !readyResearchPartSet.has(activeResearchJob.partId)
      ? {
          partId: activeResearchJob.partId,
          startedAtMs: Math.floor(activeResearchJob.startedAtMs),
          durationMs: Math.floor(activeResearchJob.durationMs),
          completedAtMs: Math.floor(activeResearchJob.completedAtMs),
        }
      : null;

  const unlockedModelIds = Array.from(ensureDroneUnlockedModelState()).filter(
    (modelId) =>
      typeof modelId === "string" &&
      knownModelIds.has(modelId) &&
      normalizeDroneUnlockModelId(modelId)
  );
  if (!unlockedModelIds.includes(DRONE_LIGHT_MODEL_ID)) {
    unlockedModelIds.unshift(DRONE_LIGHT_MODEL_ID);
  }

  const mediumModelRequirements = normalizeMediumDroneCraftRequirements(
    droneCraftingState.mediumModelRequirements
  );
  const costumeCraftedProjectIds = Array.from(costumeResearchState.craftedProjectIds).filter(
    (projectId) => typeof projectId === "string" && knownCostumeProjectIds.has(projectId)
  );
  const costumeCraftedProjectSet = new Set(costumeCraftedProjectIds);
  const costumeEquippedProjectIds = Array.from(costumeResearchState.equippedProjectIds).filter(
    (projectId) =>
      typeof projectId === "string" &&
      knownCostumeProjectIds.has(projectId) &&
      costumeCraftedProjectSet.has(projectId)
  );
  const completedCostumeResearchProjectIds = costumeEquippedProjectIds.slice();
  const completedCostumeResearchProjectSet = new Set(costumeEquippedProjectIds);
  const costumeResearchedProjectIds = Array.from(
    costumeResearchState.researchedProjectIds
  ).filter(
    (projectId) =>
      typeof projectId === "string" &&
      knownCostumeProjectIds.has(projectId) &&
      !completedCostumeResearchProjectSet.has(projectId)
  );
  const costumeResearchedProjectSet = new Set(costumeResearchedProjectIds);
  const costumeInventoryResearchProjectIds = Array.from(
    costumeResearchState.inventoryResearchProjectIds
  ).filter(
    (projectId) =>
      typeof projectId === "string" &&
      knownCostumeProjectIds.has(projectId) &&
      !completedCostumeResearchProjectSet.has(projectId) &&
      !costumeResearchedProjectSet.has(projectId)
  );
  const costumeInventoryResearchProjectSet = new Set(
    costumeInventoryResearchProjectIds
  );
  const costumeReadyResearchProjectIds = Array.from(
    costumeResearchState.readyResearchProjectIds
  ).filter(
    (projectId) =>
      typeof projectId === "string" &&
      knownCostumeProjectIds.has(projectId) &&
      !completedCostumeResearchProjectSet.has(projectId) &&
      !costumeResearchedProjectSet.has(projectId) &&
      !costumeInventoryResearchProjectSet.has(projectId)
  );
  const costumeReadyResearchProjectSet = new Set(costumeReadyResearchProjectIds);
  const costumeReadyProjectIds = Array.from(costumeResearchState.readyProjectIds).filter(
    (projectId) =>
      typeof projectId === "string" &&
      knownCostumeProjectIds.has(projectId) &&
      !completedCostumeResearchProjectSet.has(projectId)
  );
  const costumeReadyProjectSet = new Set(costumeReadyProjectIds);
  const activeCostumeResearchJob = getCostumeResearchActiveJob();
  const activeCostumeResearchJobForPersistence =
    activeCostumeResearchJob &&
    knownCostumeProjectIds.has(activeCostumeResearchJob.projectId) &&
    !completedCostumeResearchProjectSet.has(activeCostumeResearchJob.projectId) &&
    !costumeResearchedProjectSet.has(activeCostumeResearchJob.projectId) &&
    !costumeInventoryResearchProjectSet.has(activeCostumeResearchJob.projectId) &&
    !costumeReadyResearchProjectSet.has(activeCostumeResearchJob.projectId)
      ? {
          projectId: activeCostumeResearchJob.projectId,
          startedAtMs: Math.floor(activeCostumeResearchJob.startedAtMs),
          durationMs: Math.floor(activeCostumeResearchJob.durationMs),
          completedAtMs: Math.floor(activeCostumeResearchJob.completedAtMs),
        }
      : null;
  const activeCostumeCraftJob = getCostumeCraftingActiveJob();
  const activeCostumeCraftJobForPersistence =
    activeCostumeCraftJob &&
    knownCostumeProjectIds.has(activeCostumeCraftJob.projectId) &&
    !completedCostumeResearchProjectSet.has(activeCostumeCraftJob.projectId) &&
    !costumeReadyProjectSet.has(activeCostumeCraftJob.projectId)
      ? {
          projectId: activeCostumeCraftJob.projectId,
          startedAtMs: Math.floor(activeCostumeCraftJob.startedAtMs),
          durationMs: Math.floor(activeCostumeCraftJob.durationMs),
          completedAtMs: Math.floor(activeCostumeCraftJob.completedAtMs),
        }
      : null;

  return {
    researchedPartIds,
    inventoryResearchPartIds,
    readyResearchPartIds,
    craftedPartIds,
    equippedPartIds,
    readyPartIds,
    activeResearchJob: activeResearchJobForPersistence,
    activeJob: activeJobForPersistence,
    unlockedModelIds,
    mediumModelRequirements,
    costumeResearchedProjectIds,
    costumeInventoryResearchProjectIds,
    costumeReadyResearchProjectIds,
    costumeCraftedProjectIds,
    costumeEquippedProjectIds,
    completedCostumeResearchProjectIds,
    costumeReadyProjectIds,
    activeCostumeResearchJob: activeCostumeResearchJobForPersistence,
    activeCostumeCraftJob: activeCostumeCraftJobForPersistence,
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
  if (progressResetInProgress) {
    return;
  }

  if (persistInventoryStateTimeoutId) {
    window.clearTimeout(persistInventoryStateTimeoutId);
  }

  persistInventoryStateTimeoutId = window.setTimeout(() => {
    persistInventoryStateTimeoutId = 0;
    persistInventoryState();
  }, 100);
};

const persistStorageBoxState = () => {
  const storage = getInventoryStorage();

  if (!storage) {
    return;
  }

  const serialized = JSON.stringify(serializeStorageBoxStateForPersistence());
  if (serialized === lastSerializedStorageBoxState) {
    return;
  }

  try {
    storage.setItem(STORAGE_BOX_STORAGE_KEY, serialized);
    lastSerializedStorageBoxState = serialized;
  } catch (error) {
    console.warn("Unable to persist storage box state", error);
  }
};

const persistDroneCraftingState = () => {
  const storage = getInventoryStorage();

  if (!storage) {
    return;
  }

  const serialized = JSON.stringify(serializeDroneCraftingStateForPersistence());
  if (serialized === lastSerializedDroneCraftingState) {
    return;
  }

  try {
    storage.setItem(DRONE_CRAFTING_STORAGE_KEY, serialized);
    lastSerializedDroneCraftingState = serialized;
  } catch (error) {
    console.warn("Unable to persist drone crafting state", error);
  }
};

const schedulePersistStorageBoxState = () => {
  if (progressResetInProgress) {
    return;
  }

  if (persistStorageBoxStateTimeoutId) {
    window.clearTimeout(persistStorageBoxStateTimeoutId);
  }

  persistStorageBoxStateTimeoutId = window.setTimeout(() => {
    persistStorageBoxStateTimeoutId = 0;
    persistStorageBoxState();
  }, 100);
};

const restoreStorageBoxStateFromStorage = () => {
  const storage = getInventoryStorage();
  storageBoxState.boxes.clear();
  storageBoxState.activeBoxId = STORAGE_BOX_DEFAULT_ID;
  if (!storage) {
    ensureStorageBoxRecord(STORAGE_BOX_DEFAULT_ID);
    recalculateStorageBoxLoad(STORAGE_BOX_DEFAULT_ID);
    refreshStorageBoxModalIfOpen();
    return false;
  }

  let serialized = null;
  try {
    serialized = storage.getItem(STORAGE_BOX_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read stored storage box state", error);
    ensureStorageBoxRecord(STORAGE_BOX_DEFAULT_ID);
    recalculateStorageBoxLoad(STORAGE_BOX_DEFAULT_ID);
    refreshStorageBoxModalIfOpen();
    return false;
  }

  if (typeof serialized !== "string" || serialized.trim() === "") {
    ensureStorageBoxRecord(STORAGE_BOX_DEFAULT_ID);
    recalculateStorageBoxLoad(STORAGE_BOX_DEFAULT_ID);
    refreshStorageBoxModalIfOpen();
    return false;
  }

  let restored = false;

  try {
    const data = JSON.parse(serialized);
    if (data && Array.isArray(data.boxes)) {
      data.boxes.forEach((rawBox) => {
        if (!rawBox || typeof rawBox !== "object") {
          return;
        }

        const restoredBox = createRestoredStorageBoxRecord({
          id: rawBox.id,
          label: rawBox.label,
          capacityKg: rawBox.capacityKg,
          entries: rawBox.entries,
          loadGrams: rawBox.loadGrams,
          capacityRejection: rawBox.capacityRejection,
        });
        storageBoxState.boxes.set(restoredBox.id, restoredBox);
      });

      storageBoxState.activeBoxId = normalizeStorageBoxId(data.activeBoxId);
      ensureStorageBoxRecord(storageBoxState.activeBoxId);
      restored = storageBoxState.boxes.size > 0;
    } else if (data && Array.isArray(data.entries)) {
      const restoredBox = createRestoredStorageBoxRecord({
        id: STORAGE_BOX_DEFAULT_ID,
        label: STORAGE_BOX_DEFAULT_LABEL,
        capacityKg: STORAGE_BOX_CAPACITY_KG,
        entries: data.entries,
        loadGrams: data.loadGrams,
        capacityRejection: data.capacityRejection,
      });
      storageBoxState.boxes.set(restoredBox.id, restoredBox);
      storageBoxState.activeBoxId = restoredBox.id;
      restored = restoredBox.entries.length > 0;
    }
  } catch (error) {
    console.warn("Unable to parse stored storage box state", error);
  }

  ensureStorageBoxRecord(storageBoxState.activeBoxId);

  if (restored) {
    lastSerializedStorageBoxState = serialized;
  }

  refreshStorageBoxModalIfOpen();
  return restored;
};

const restoreDroneCraftingStateFromStorage = () => {
  const storage = getInventoryStorage();
  if (!storage) {
    clearCostumeResearchState();
    droneCraftingState.researchedPartIds.clear();
    droneCraftingState.inventoryResearchPartIds.clear();
    droneCraftingState.readyResearchPartIds.clear();
    droneCraftingState.craftedPartIds.clear();
    droneCraftingState.equippedPartIds.clear();
    droneCraftingState.readyPartIds.clear();
    droneCraftingState.activeResearchJob = null;
    droneCraftingState.activeJob = null;
    ensureDroneUnlockedModelState().clear();
    ensureDroneUnlockedModelState().add(DRONE_LIGHT_MODEL_ID);
    const legacyModelId = normalizeDroneUnlockModelId(currentSettings?.droneModelId);
    if (legacyModelId) {
      ensureDroneUnlockedModelState().add(legacyModelId);
    }
    droneCraftingState.mediumModelRequirements = [];
    syncCostumeResearchProgressInterval();
    syncCostumeCraftingProgressInterval();
    syncDroneResearchProgressInterval();
    syncDroneCraftingProgressInterval();
    applyCostumeResearchBonuses({
      refreshResearch: false,
      persistOxygen: false,
      silentPressure: true,
    });
    syncDroneMiningSpeedBonusWithScene();
    refreshInventoryUi();
    refreshCraftingTableModalIfOpen();
    refreshResearchModalIfOpen();
    return false;
  }

  let serialized = null;
  try {
    serialized = storage.getItem(DRONE_CRAFTING_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read stored drone crafting state", error);
    clearCostumeResearchState();
    droneCraftingState.researchedPartIds.clear();
    droneCraftingState.inventoryResearchPartIds.clear();
    droneCraftingState.readyResearchPartIds.clear();
    droneCraftingState.craftedPartIds.clear();
    droneCraftingState.equippedPartIds.clear();
    droneCraftingState.readyPartIds.clear();
    droneCraftingState.activeResearchJob = null;
    droneCraftingState.activeJob = null;
    ensureDroneUnlockedModelState().clear();
    ensureDroneUnlockedModelState().add(DRONE_LIGHT_MODEL_ID);
    const legacyModelId = normalizeDroneUnlockModelId(currentSettings?.droneModelId);
    if (legacyModelId) {
      ensureDroneUnlockedModelState().add(legacyModelId);
    }
    droneCraftingState.mediumModelRequirements = [];
    syncCostumeResearchProgressInterval();
    syncCostumeCraftingProgressInterval();
    syncDroneResearchProgressInterval();
    syncDroneCraftingProgressInterval();
    applyCostumeResearchBonuses({
      refreshResearch: false,
      persistOxygen: false,
      silentPressure: true,
    });
    syncDroneMiningSpeedBonusWithScene();
    refreshInventoryUi();
    refreshCraftingTableModalIfOpen();
    refreshResearchModalIfOpen();
    return false;
  }

  clearCostumeResearchState();
  droneCraftingState.researchedPartIds.clear();
  droneCraftingState.inventoryResearchPartIds.clear();
  droneCraftingState.readyResearchPartIds.clear();
  droneCraftingState.craftedPartIds.clear();
  droneCraftingState.equippedPartIds.clear();
  droneCraftingState.readyPartIds.clear();
  droneCraftingState.activeResearchJob = null;
  droneCraftingState.activeJob = null;
  ensureDroneUnlockedModelState().clear();
  ensureDroneUnlockedModelState().add(DRONE_LIGHT_MODEL_ID);
  droneCraftingState.mediumModelRequirements = [];

  if (typeof serialized !== "string" || serialized.trim() === "") {
    ensureDroneUnlockedModelState().clear();
    ensureDroneUnlockedModelState().add(DRONE_LIGHT_MODEL_ID);
    const legacyModelId = normalizeDroneUnlockModelId(currentSettings?.droneModelId);
    if (legacyModelId) {
      ensureDroneUnlockedModelState().add(legacyModelId);
    }
    droneCraftingState.mediumModelRequirements = [];
    syncCostumeResearchProgressInterval();
    syncCostumeCraftingProgressInterval();
    syncDroneResearchProgressInterval();
    syncDroneCraftingProgressInterval();
    applyCostumeResearchBonuses({
      refreshResearch: false,
      persistOxygen: false,
      silentPressure: true,
    });
    syncDroneMiningSpeedBonusWithScene();
    refreshInventoryUi();
    refreshCraftingTableModalIfOpen();
    refreshResearchModalIfOpen();
    return false;
  }

  let restored = false;

  try {
    const data = JSON.parse(serialized);
    const knownPartIds = new Set(DRONE_CRAFTING_PARTS.map((part) => part.id));
    const knownModelIds = new Set(DRONE_UNLOCKABLE_MODEL_IDS);
    const knownCostumeProjectIds = new Set(
      COSTUME_RESEARCH_PROJECTS.map((project) => project.id)
    );
    const storedResearchedPartIds = Array.isArray(data?.researchedPartIds)
      ? data.researchedPartIds
      : [];
    storedResearchedPartIds.forEach((partId) => {
      if (typeof partId === "string" && knownPartIds.has(partId)) {
        droneCraftingState.researchedPartIds.add(partId);
      }
    });

    const storedInventoryResearchPartIds = Array.isArray(data?.inventoryResearchPartIds)
      ? data.inventoryResearchPartIds
      : [];
    storedInventoryResearchPartIds.forEach((partId) => {
      if (
        typeof partId === "string" &&
        knownPartIds.has(partId) &&
        !droneCraftingState.researchedPartIds.has(partId)
      ) {
        droneCraftingState.inventoryResearchPartIds.add(partId);
      }
    });

    const storedReadyResearchPartIds = Array.isArray(data?.readyResearchPartIds)
      ? data.readyResearchPartIds
      : [];
    storedReadyResearchPartIds.forEach((partId) => {
      if (
        typeof partId === "string" &&
        knownPartIds.has(partId) &&
        !droneCraftingState.researchedPartIds.has(partId) &&
        !droneCraftingState.inventoryResearchPartIds.has(partId)
      ) {
        droneCraftingState.readyResearchPartIds.add(partId);
      }
    });

    const storedCraftedPartIds = Array.isArray(data?.craftedPartIds)
      ? data.craftedPartIds
      : [];
    storedCraftedPartIds.forEach((partId) => {
      if (
        typeof partId === "string" &&
        knownPartIds.has(partId)
      ) {
        droneCraftingState.inventoryResearchPartIds.delete(partId);
        droneCraftingState.readyResearchPartIds.delete(partId);
        droneCraftingState.researchedPartIds.add(partId);
        droneCraftingState.craftedPartIds.add(partId);
      }
    });

    const storedEquippedPartIds = Array.isArray(data?.equippedPartIds)
      ? data.equippedPartIds
      : [];
    storedEquippedPartIds.forEach((partId) => {
      if (
        typeof partId === "string" &&
        knownPartIds.has(partId) &&
        droneCraftingState.craftedPartIds.has(partId)
      ) {
        droneCraftingState.equippedPartIds.add(partId);
      }
    });

    const storedReadyPartIds = Array.isArray(data?.readyPartIds) ? data.readyPartIds : [];
    storedReadyPartIds.forEach((partId) => {
      if (
        typeof partId === "string" &&
        knownPartIds.has(partId) &&
        !droneCraftingState.craftedPartIds.has(partId)
      ) {
        droneCraftingState.inventoryResearchPartIds.delete(partId);
        droneCraftingState.readyResearchPartIds.delete(partId);
        droneCraftingState.researchedPartIds.add(partId);
        droneCraftingState.readyPartIds.add(partId);
      }
    });

    const restoredActiveResearchJob = normalizeDroneResearchActiveJob(
      data?.activeResearchJob
    );
    if (
      restoredActiveResearchJob &&
      !droneCraftingState.researchedPartIds.has(restoredActiveResearchJob.partId) &&
      !droneCraftingState.inventoryResearchPartIds.has(restoredActiveResearchJob.partId) &&
      !droneCraftingState.readyResearchPartIds.has(restoredActiveResearchJob.partId)
    ) {
      droneCraftingState.activeResearchJob = restoredActiveResearchJob;
    }

    const restoredActiveJob = normalizeDroneCraftingActiveJob(data?.activeJob);
    if (
      restoredActiveJob &&
      !droneCraftingState.craftedPartIds.has(restoredActiveJob.partId) &&
      !droneCraftingState.readyPartIds.has(restoredActiveJob.partId)
    ) {
      droneCraftingState.inventoryResearchPartIds.delete(restoredActiveJob.partId);
      droneCraftingState.readyResearchPartIds.delete(restoredActiveJob.partId);
      droneCraftingState.researchedPartIds.add(restoredActiveJob.partId);
      droneCraftingState.activeJob = restoredActiveJob;
    }

    const hasStoredUnlockedModelIds = Array.isArray(data?.unlockedModelIds);
    if (hasStoredUnlockedModelIds) {
      data.unlockedModelIds.forEach((modelId) => {
        const normalizedModelId = normalizeDroneUnlockModelId(modelId);
        if (normalizedModelId && knownModelIds.has(normalizedModelId)) {
          ensureDroneUnlockedModelState().add(normalizedModelId);
        }
      });
    } else {
      const legacyModelId = normalizeDroneUnlockModelId(currentSettings?.droneModelId);
      if (legacyModelId && knownModelIds.has(legacyModelId)) {
        ensureDroneUnlockedModelState().add(legacyModelId);
      }
    }
    ensureDroneUnlockedModelState().add(DRONE_LIGHT_MODEL_ID);

    const storedMediumModelRequirements = normalizeMediumDroneCraftRequirements(
      data?.mediumModelRequirements
    );
    if (storedMediumModelRequirements.length > 0) {
      droneCraftingState.mediumModelRequirements = storedMediumModelRequirements;
    }

    const storedCostumeCraftedProjectIds = Array.isArray(data?.costumeCraftedProjectIds)
      ? data.costumeCraftedProjectIds
      : [];
    storedCostumeCraftedProjectIds.forEach((projectId) => {
      if (
        typeof projectId === "string" &&
        knownCostumeProjectIds.has(projectId)
      ) {
        costumeResearchState.craftedProjectIds.add(projectId);
      }
    });

    const storedCostumeEquippedProjectIds = Array.isArray(data?.costumeEquippedProjectIds)
      ? data.costumeEquippedProjectIds
      : [];
    storedCostumeEquippedProjectIds.forEach((projectId) => {
      if (
        typeof projectId === "string" &&
        knownCostumeProjectIds.has(projectId)
      ) {
        costumeResearchState.craftedProjectIds.add(projectId);
        costumeResearchState.equippedProjectIds.add(projectId);
        costumeResearchState.completedProjectIds.add(projectId);
      }
    });

    const storedCompletedCostumeResearchProjectIds = Array.isArray(
      data?.completedCostumeResearchProjectIds
    )
      ? data.completedCostumeResearchProjectIds
      : [];
    storedCompletedCostumeResearchProjectIds.forEach((projectId) => {
      if (
        typeof projectId === "string" &&
        knownCostumeProjectIds.has(projectId)
      ) {
        costumeResearchState.craftedProjectIds.add(projectId);
        costumeResearchState.equippedProjectIds.add(projectId);
        costumeResearchState.completedProjectIds.add(projectId);
      }
    });

    const storedCostumeResearchedProjectIds = Array.isArray(data?.costumeResearchedProjectIds)
      ? data.costumeResearchedProjectIds
      : [];
    storedCostumeResearchedProjectIds.forEach((projectId) => {
      if (
        typeof projectId === "string" &&
        knownCostumeProjectIds.has(projectId) &&
        !costumeResearchState.equippedProjectIds.has(projectId)
      ) {
        costumeResearchState.researchedProjectIds.add(projectId);
      }
    });

    const storedCostumeInventoryResearchProjectIds = Array.isArray(
      data?.costumeInventoryResearchProjectIds
    )
      ? data.costumeInventoryResearchProjectIds
      : [];
    storedCostumeInventoryResearchProjectIds.forEach((projectId) => {
      if (
        typeof projectId === "string" &&
        knownCostumeProjectIds.has(projectId) &&
        !costumeResearchState.equippedProjectIds.has(projectId) &&
        !costumeResearchState.researchedProjectIds.has(projectId)
      ) {
        costumeResearchState.inventoryResearchProjectIds.add(projectId);
      }
    });

    const storedCostumeReadyResearchProjectIds = Array.isArray(
      data?.costumeReadyResearchProjectIds
    )
      ? data.costumeReadyResearchProjectIds
      : [];
    storedCostumeReadyResearchProjectIds.forEach((projectId) => {
      if (
        typeof projectId === "string" &&
        knownCostumeProjectIds.has(projectId) &&
        !costumeResearchState.equippedProjectIds.has(projectId) &&
        !costumeResearchState.researchedProjectIds.has(projectId) &&
        !costumeResearchState.inventoryResearchProjectIds.has(projectId)
      ) {
        costumeResearchState.readyResearchProjectIds.add(projectId);
      }
    });

    const storedCostumeReadyProjectIds = Array.isArray(data?.costumeReadyProjectIds)
      ? data.costumeReadyProjectIds
      : [];
    storedCostumeReadyProjectIds.forEach((projectId) => {
      if (
        typeof projectId === "string" &&
        knownCostumeProjectIds.has(projectId) &&
        !costumeResearchState.equippedProjectIds.has(projectId)
      ) {
        costumeResearchState.inventoryResearchProjectIds.delete(projectId);
        costumeResearchState.readyResearchProjectIds.delete(projectId);
        costumeResearchState.researchedProjectIds.add(projectId);
        costumeResearchState.readyProjectIds.add(projectId);
      }
    });

    const restoredActiveCostumeResearchJob = normalizeCostumeResearchActiveJob(
      data?.activeCostumeResearchJob
    );
    if (
      restoredActiveCostumeResearchJob &&
      !costumeResearchState.equippedProjectIds.has(
        restoredActiveCostumeResearchJob.projectId
      ) &&
      !costumeResearchState.researchedProjectIds.has(
        restoredActiveCostumeResearchJob.projectId
      ) &&
      !costumeResearchState.inventoryResearchProjectIds.has(
        restoredActiveCostumeResearchJob.projectId
      ) &&
      !costumeResearchState.readyResearchProjectIds.has(
        restoredActiveCostumeResearchJob.projectId
      )
    ) {
      costumeResearchState.activeJob = restoredActiveCostumeResearchJob;
    }

    const restoredActiveCostumeCraftJob = normalizeCostumeCraftingActiveJob(
      data?.activeCostumeCraftJob
    );
    if (
      restoredActiveCostumeCraftJob &&
      !costumeResearchState.equippedProjectIds.has(
        restoredActiveCostumeCraftJob.projectId
      ) &&
      !costumeResearchState.readyProjectIds.has(restoredActiveCostumeCraftJob.projectId)
    ) {
      costumeResearchState.inventoryResearchProjectIds.delete(
        restoredActiveCostumeCraftJob.projectId
      );
      costumeResearchState.readyResearchProjectIds.delete(
        restoredActiveCostumeCraftJob.projectId
      );
      costumeResearchState.researchedProjectIds.add(restoredActiveCostumeCraftJob.projectId);
      costumeResearchState.activeCraftJob = restoredActiveCostumeCraftJob;
    }

    const hasExtraUnlockedModels = Array.from(ensureDroneUnlockedModelState()).some(
      (modelId) => modelId !== DRONE_LIGHT_MODEL_ID
    );

    restored =
      costumeResearchState.craftedProjectIds.size > 0 ||
      costumeResearchState.equippedProjectIds.size > 0 ||
      costumeResearchState.researchedProjectIds.size > 0 ||
      costumeResearchState.inventoryResearchProjectIds.size > 0 ||
      costumeResearchState.readyResearchProjectIds.size > 0 ||
      costumeResearchState.readyProjectIds.size > 0 ||
      droneCraftingState.researchedPartIds.size > 0 ||
      droneCraftingState.inventoryResearchPartIds.size > 0 ||
      droneCraftingState.readyResearchPartIds.size > 0 ||
      droneCraftingState.craftedPartIds.size > 0 ||
      droneCraftingState.equippedPartIds.size > 0 ||
      droneCraftingState.readyPartIds.size > 0 ||
      Boolean(costumeResearchState.activeJob) ||
      Boolean(costumeResearchState.activeCraftJob) ||
      Boolean(droneCraftingState.activeResearchJob) ||
      Boolean(droneCraftingState.activeJob) ||
      hasExtraUnlockedModels;
  } catch (error) {
    console.warn("Unable to parse stored drone crafting state", error);
  }

  if (restored) {
    lastSerializedDroneCraftingState = serialized;
  } else {
    lastSerializedDroneCraftingState = null;
  }

  finalizeCostumeResearchActiveJob({ notify: false, refreshUi: false });
  syncCostumeResearchProgressInterval();
  finalizeCostumeCraftingActiveJob({ notify: false, refreshUi: false });
  syncCostumeCraftingProgressInterval();
  finalizeDroneResearchActiveJob({ notify: false, refreshUi: false });
  syncDroneResearchProgressInterval();
  finalizeDroneCraftingActiveJob({ notify: false, refreshUi: false });
  syncDroneCraftingProgressInterval();
  applyCostumeResearchBonuses({
    refreshResearch: false,
    persistOxygen: false,
    silentPressure: true,
  });
  syncDroneMiningSpeedBonusWithScene();
  refreshInventoryUi();
  refreshCraftingTableModalIfOpen();
  refreshResearchModalIfOpen();
  return restored;
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

ensureSingleResearchLabJob({ notify: false, refreshUi: true });

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
restoreStorageBoxStateFromStorage();
restoreDroneCraftingStateFromStorage();
if (Boolean(currentSettings?.godMode)) {
  completeCostumeResearchActiveJobInstantly({ notify: false });
  completeCostumeCraftingActiveJobInstantly({ notify: false });
  completeDroneResearchActiveJobInstantly({ notify: false });
  completeDroneCraftingActiveJobInstantly({ notify: false });
}
syncDroneModelSelectionWithUnlocks({
  persist: true,
  applyToScene: false,
});

if (!restoredInventoryFromStorage) {
  grantNewGameStarterResources();
}

updateMissionIndicator();

if (missionModalActive) {
  renderMissionModalMissions();
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

const toggleInventoryPanelFromShortcut = ({ event = null } = {}) => {
  const inventoryCurrentlyOpen = isInventoryOpen();

  if (
    !inventoryCurrentlyOpen &&
    ((quickAccessModal instanceof HTMLElement && !quickAccessModal.hidden) ||
      isModelPaletteOpen())
  ) {
    return false;
  }

  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }

  if (inventoryCurrentlyOpen) {
    closeInventoryPanel();
  } else {
    openInventoryPanel();
  }

  return true;
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

  toggleInventoryPanelFromShortcut({ event });
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

const getTodoInputMinHeight = (input) => {
  if (!(input instanceof HTMLTextAreaElement)) {
    return 0;
  }

  const cachedMinHeight = Number.parseFloat(input.dataset.todoMinHeight ?? "");
  if (Number.isFinite(cachedMinHeight)) {
    return cachedMinHeight;
  }

  const computedStyles = window.getComputedStyle(input);
  const computedMinHeight = Number.parseFloat(computedStyles?.minHeight ?? "");

  if (Number.isFinite(computedMinHeight)) {
    input.dataset.todoMinHeight = String(computedMinHeight);
    return computedMinHeight;
  }

  return 0;
};

const autoSizeTodoInput = (input) => {
  if (!(input instanceof HTMLTextAreaElement)) {
    return;
  }

  const minHeight = getTodoInputMinHeight(input);

  input.style.height = "auto";
  input.style.height = `${Math.max(input.scrollHeight, minHeight)}px`;
};

const autoSizeAllTodoInputs = () => {
  const inputs = todoListElement?.querySelectorAll('[data-todo-input="true"]');

  inputs?.forEach((input) => {
    autoSizeTodoInput(input);
  });
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

    const input = document.createElement("textarea");
    input.className = "todo-panel__input";
    input.value = item.text;
    input.rows = 2;
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

    autoSizeTodoInput(input);
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
    autoSizeAllTodoInputs();
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

  const isTodoInput =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

  if (!isTodoInput || target.dataset.todoInput !== "true") {
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
    autoSizeTodoInput(target);
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

  const stationBuilderIndex = quickSlotState.slots.findIndex(
    (slot) => slot?.id === STATION_BUILDER_QUICK_SLOT_ID
  );
  if (
    stationBuilderIndex >= 0 &&
    quickSlotState.selectedIndex !== stationBuilderIndex
  ) {
    selectQuickSlot(stationBuilderIndex);
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
    const editModeEnabled = sceneController?.setManifestEditModeEnabled?.(true);
    if (editModeEnabled) {
      sceneController.requestPointerLock?.();
    }
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
  toggleModelPaletteVisibility();
};

const toggleModelPaletteVisibility = () => {
  if (!sceneController?.placeModelFromManifestEntry) {
    return false;
  }

  if (quickAccessModal instanceof HTMLElement && !quickAccessModal.hidden) {
    return false;
  }

  if (isModelPaletteOpen()) {
    closeModelPalette();
  } else {
    void openModelPalette();
  }

  return true;
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
  researchModalActive = false;
  droneCustomizationModalActive = false;
  storageBoxModalActive = false;
  craftingTableModalActive = false;
  teardownQuickAccessModalContent();
  resetQuickAccessModalLayoutState();
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
  syncQuickAccessModalLayoutMode(option?.id ?? null);
  clearQuickAccessModalDialogOffset();
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
  quickAccessModal.addEventListener(
    "pointerdown",
    handleQuickAccessModalDragPointerDown,
    { passive: false }
  );

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

if (inventoryDropConfirmConfirmButton instanceof HTMLButtonElement) {
  inventoryDropConfirmConfirmButton.addEventListener("click", () => {
    hideInventoryDropConfirm(true);
  });
}

if (inventoryDropConfirmCancelButton instanceof HTMLButtonElement) {
  inventoryDropConfirmCancelButton.addEventListener("click", () => {
    hideInventoryDropConfirm(false);
  });
}

if (inventoryDropConfirmCloseButton instanceof HTMLButtonElement) {
  inventoryDropConfirmCloseButton.addEventListener("click", () => {
    hideInventoryDropConfirm(false);
  });
}

if (inventoryDropConfirmBackdrop instanceof HTMLElement) {
  inventoryDropConfirmBackdrop.addEventListener("click", () => {
    hideInventoryDropConfirm(false);
  });
}

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    inventoryDropConfirm instanceof HTMLElement &&
    inventoryDropConfirm.dataset.visible === "true"
  ) {
    event.preventDefault();
    hideInventoryDropConfirm(false);
  }
});

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
  window.addEventListener("resize", handleQuickAccessModalWindowResize);
  window.addEventListener("orientationchange", handleQuickAccessModalWindowResize);
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

const getDroneFuelRemainingSeconds = () => {
  const capacity = ensureDroneFuelSlots();

  if (capacity <= 0 || droneState.fuelRemaining <= 0) {
    return 0;
  }

  const activeSlot = getActiveFuelSlotInfo();
  const activeElapsedSeconds = activeSlot ? getActiveFuelElapsedSeconds() : 0;
  let remainingSeconds = 0;

  for (let index = 0; index < capacity; index += 1) {
    const slot = droneState.fuelSlots[index];

    if (!slot) {
      continue;
    }

    const runtimeSeconds = getFuelRuntimeSecondsForSlot(slot);

    if (activeSlot && index === activeSlot.index) {
      remainingSeconds += Math.max(0, runtimeSeconds - activeElapsedSeconds);
    } else {
      remainingSeconds += runtimeSeconds;
    }
  }

  return Math.max(0, Math.round(remainingSeconds));
};

const getDroneFuelTotalRuntimeSeconds = () => {
  const capacity = ensureDroneFuelSlots();
  let totalRuntimeSeconds = 0;

  for (let index = 0; index < capacity; index += 1) {
    const slot = droneState.fuelSlots[index];

    if (!slot) {
      continue;
    }

    totalRuntimeSeconds += getFuelRuntimeSecondsForSlot(slot);
  }

  return Math.max(0, Math.round(totalRuntimeSeconds));
};

const getDroneFuelText = () => {
  const remainingSeconds = getDroneFuelRemainingSeconds();
  return `${formatDurationSeconds(remainingSeconds)} left`;
};

const isDronePayloadAtCapacity = () => {
  const capacity = Math.max(1, DRONE_MINER_MAX_PAYLOAD_GRAMS);
  const payload = Number.isFinite(droneState.payloadGrams)
    ? Math.max(0, droneState.payloadGrams)
    : 0;
  return payload >= capacity;
};

const getDroneMissionSummary = () => {
  if (droneState.status === "full") {
    return "Payload at capacity. Recall manually to unload cargo.";
  }

  const detail = droneState.lastResult;

  if (!detail) {
    if (isDronePickupRequired()) {
      return "Move closer to pick up the grounded drone.";
    }

    if (droneState.fuelRemaining <= 0) {
      return "Awaiting Hydrogen or Helium resupply.";
    }

    if (droneState.status === "collecting") {
      return "";
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
  updateDroneMiningSoundPlayback();

  if (droneStatusPanels.length === 0) {
    return;
  }

  const isActive = Boolean(droneState.active);
  const keepPanelVisibleDuringReturn =
    !isActive &&
    (droneState.pendingShutdown || droneState.awaitingReturn || droneState.inFlight);
  const panelActive = isActive || keepPanelVisibleDuringReturn;
  const requiresPickup = isDronePickupRequired();
  const inventoryIsOpen =
    isInventoryOpen() ||
    (inventoryPanel instanceof HTMLElement &&
      inventoryPanel.classList.contains("is-open"));
  const shouldShowAnyPanel = panelActive || requiresPickup;

  let shouldRenderDetails = false;

  droneStatusPanels.forEach((panel) => {
    if (!(panel instanceof HTMLElement)) {
      return;
    }

    const isInventoryPanel = panel.hasAttribute("data-inventory-drone-panel");
    const panelShouldShow =
      shouldShowAnyPanel && (!inventoryIsOpen || isInventoryPanel);

    panel.dataset.active = panelActive ? "true" : "false";
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
  const fuelRemainingSeconds = getDroneFuelRemainingSeconds();
  const fuelTotalRuntimeSeconds = getDroneFuelTotalRuntimeSeconds();
  const fuelRatio =
    fuelTotalRuntimeSeconds > 0
      ? Math.max(0, Math.min(1, fuelRemainingSeconds / fuelTotalRuntimeSeconds))
      : 0;

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
      case "full":
        statusText = "Drone full";
        detailText = getDroneMissionSummary();
        break;
      case "returning":
        statusText = "Returning";
        detailText = "";
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
      const hasDetailText = typeof detailText === "string" && detailText.trim() !== "";
      element.textContent = hasDetailText ? detailText : "";
      element.hidden = !hasDetailText;
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

const handlePlayerOxygenRefillInteract = () => {
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  if (now - lastPlayerOxygenRefillAt < PLAYER_OXYGEN_REFILL_COOLDOWN_MS) {
    showTerminalToast({
      title: "Oxygen station",
      description: "Station cycling. Please wait a moment.",
    });
    return true;
  }

  lastPlayerOxygenRefillAt = now;
  playerOxygenTickLastTimestamp = now;
  playerOxygenMovementLastTimestamp = now;
  playerOxygenMovementLastPosition = sceneController?.getPlayerPosition?.() ?? null;
  playerOxygenDepletionNotified = false;
  playerOxygenCurrentDrainMultiplier = isPlayerOnSurfaceForOxygenDrain()
    ? playerOxygenShiftHeld
      ? PLAYER_OXYGEN_SHIFT_MOVING_DRAIN_MULTIPLIER
      : PLAYER_OXYGEN_MOVING_DRAIN_MULTIPLIER
    : 0;
  playerOxygenPercent = getPlayerOxygenMaxPercent();
  lastPlayerOxygenWarningSoundAt = 0;
  lastPlayerOxygenWarningToastAt = 0;
  applyPlayerOxygenPressureEffects({
    now,
    silent: true,
    forceUi: true,
  });
  schedulePersistPlayerOxygen({ force: true });
  playTerminalInteractionSound();
  showTerminalToast({
    title: "Suit oxygen refilled",
    description: `O2 reserves restored to ${Math.round(getPlayerOxygenMaxPercent())}%.`,
  });
  return true;
};

const canUseDroneInFloor = (floorId) =>
  typeof floorId === "string" && DRONE_ALLOWED_LIFT_FLOOR_IDS.has(floorId);

const canUseDroneInCurrentArea = () => {
  const activeFloorId = sceneController?.getActiveLiftFloor?.()?.id ?? null;
  return canUseDroneInFloor(activeFloorId);
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
  const hasOutstandingDroneState =
    droneState.active ||
    droneState.pendingShutdown ||
    droneState.inFlight ||
    droneState.awaitingReturn ||
    (Array.isArray(droneState.cargo) && droneState.cargo.length > 0) ||
    (Number.isFinite(droneState.payloadGrams) && droneState.payloadGrams > 0);

  if (!hasOutstandingDroneState) {
    return;
  }

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
  droneState.returnSessionStartMs = 0;
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

const handleDroneSurfaceExitTransition = ({ from, to } = {}) => {
  const fromFloorId = typeof from?.id === "string" ? from.id : null;
  const toFloorId = typeof to?.id === "string" ? to.id : null;

  if (!canUseDroneInFloor(fromFloorId) || canUseDroneInFloor(toFloorId)) {
    return false;
  }

  const hasDroneStateToRecall =
    droneState.active ||
    droneState.pendingShutdown ||
    droneState.inFlight ||
    droneState.awaitingReturn ||
    (Array.isArray(droneState.cargo) && droneState.cargo.length > 0);
  if (!hasDroneStateToRecall) {
    return false;
  }

  cancelDroneAutomationRetry();
  sceneController?.cancelDroneMinerSession?.({ reason: "area-change" });

  droneState.active = false;
  droneState.pendingShutdown = true;
  droneState.inFlight = false;
  droneState.awaitingReturn = false;
  droneState.returnSessionStartMs = 0;
  finalizeDroneAutomationShutdown();
  return true;
};

const attemptDroneLaunch = ({ playLaunchSound = false } = {}) => {
  cancelDroneAutomationRetry();

  if (!droneState.active || droneState.inFlight || droneState.awaitingReturn) {
    return;
  }

  if (isDronePayloadAtCapacity()) {
    droneState.status = "full";
    updateDroneStatusUi();
    return { started: false, reason: "payload-full" };
  }

  if (!canUseDroneInCurrentArea()) {
    droneState.status = "idle";
    updateDroneStatusUi();
    return { started: false, reason: "unavailable-area" };
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
    const returnRequested = requestDroneReturnForShutdown({ reason: "fuel" });

    if (!returnRequested) {
      showDroneResourceToast({
        title: "Fuel required",
        description: "Load Hydrogen or Helium from inventory to launch.",
      });
      promptInventoryForDroneFuel();
    }
    return;
  }

  const launchResult = sceneController.launchDroneMiner();

  if (!launchResult?.started) {
    droneState.status = "idle";
    updateDroneStatusUi();

    if (launchResult?.reason === "unavailable-area") {
      return;
    }

    if (launchResult?.reason === "no-target" && !droneState.notifiedUnavailable) {
      droneState.notifiedUnavailable = true;
      showDroneResourceToast({
        title: "No mining target",
        description: "Drone will continue scanning.",
      });
    }

    scheduleDroneAutomationRetry();
    return;
  }

  droneState.status = "collecting";
  droneState.inFlight = true;
  droneState.miningSessionStartMs = performance.now();
  droneState.returnSessionStartMs = 0;
  droneState.lastResult = null;
  droneState.notifiedUnavailable = false;
  if (playLaunchSound) {
    playDroneLaunchSound();
  }
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

  if (!canUseDroneInCurrentArea()) {
    playGeoVisorOutOfBatterySound();
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
  droneState.cargo = Array.isArray(droneState.cargo) ? droneState.cargo.slice() : [];
  droneState.payloadGrams = droneState.cargo.reduce((total, sample) => {
    const weight = getInventoryElementWeight(sample?.element);
    return total + (Number.isFinite(weight) ? weight : 0);
  }, 0);
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
  droneState.returnSessionStartMs = 0;
  droneState.status = "idle";
  droneState.lastResult = null;
  droneState.notifiedUnavailable = false;
  persistDroneCargoSnapshot();
  updateDroneStatusUi();
  showDroneTerminalToast({
    title: "Drone automation engaged",
    description: "Press 2 again to recall the drone and unload cargo.",
  });
  attemptDroneLaunch({ playLaunchSound: true });
};

const resumeDroneAutomation = () => {
  if (!droneState.pendingShutdown) {
    return;
  }

  if (!canUseDroneInCurrentArea()) {
    playGeoVisorOutOfBatterySound();
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
    attemptDroneLaunch({ playLaunchSound: true });
  }
};

const requestDroneReturnForShutdown = ({ reason = "manual" } = {}) => {
  droneState.active = false;
  droneState.pendingShutdown = true;
  cancelDroneAutomationRetry();

  const cancelled = typeof sceneController?.cancelDroneMinerSession === "function"
    ? sceneController.cancelDroneMinerSession({ reason })
    : false;

  if (!cancelled) {
    finalizeDroneAutomationShutdown();
    return false;
  }

  if (!droneState.awaitingReturn) {
    droneState.awaitingReturn = true;
    droneState.status = "returning";
    if (
      !Number.isFinite(droneState.returnSessionStartMs) ||
      droneState.returnSessionStartMs <= 0
    ) {
      droneState.returnSessionStartMs = performance.now();
    }
  }
  updateDroneStatusUi();
  return true;
};

const deactivateDroneAutomation = () => {
  if (!droneState.active) {
    return;
  }

  requestDroneReturnForShutdown({ reason: "manual" });
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
  droneState.awaitingReturn = false;
  droneState.returnSessionStartMs = 0;
  droneState.status = droneState.active ? "idle" : "inactive";
  droneState.lastResult = detail ?? null;

  concludeDroneMiningSession(detail);

  const storedSample = storeDroneSample(detail);
  let storedDoubleSample = false;

  if (storedSample && detail?.element) {
    const doubleChance = getDroneCraftingDoubleYieldChance();
    const sampleWeight = getInventoryElementWeight(detail.element);
    const canStoreDuplicate =
      Number.isFinite(sampleWeight) && sampleWeight > 0
        ? droneState.payloadGrams + sampleWeight <= DRONE_MINER_MAX_PAYLOAD_GRAMS
        : true;
    if (
      canStoreDuplicate &&
      Number.isFinite(doubleChance) &&
      doubleChance > 0 &&
      Math.random() <= doubleChance
    ) {
      const duplicateDetail = {
        ...(detail && typeof detail === "object" ? detail : {}),
        source: DRONE_QUICK_SLOT_ID,
        element: { ...(detail.element ?? {}) },
      };
      storedDoubleSample = storeDroneSample(duplicateDetail);
    }
  }

  if (storedSample && detail?.element) {
    const { symbol, name } = detail.element;
    const label = symbol && name ? `${symbol} (${name})` : symbol || name || "Sample";
    const title = storedDoubleSample
      ? `Drone stored ${label} x2`
      : `Drone stored ${label}`;
    const description = storedDoubleSample
      ? `Double extraction triggered. Payload ${getDronePayloadText()} secured aboard.`
      : `Payload ${getDronePayloadText()} secured aboard.`;

    showDroneResourceToast({ title, description });
    showDroneTerminalToast({ title: "Drone miner", description });
  }

  if (!droneState.pendingShutdown && droneState.fuelRemaining <= 0) {
    tryAutomaticDroneRefill();
  }

  if (!droneState.pendingShutdown && isDronePayloadAtCapacity()) {
    droneState.status = "full";
    cancelDroneAutomationRetry();
    updateDroneStatusUi();
    showDroneResourceToast({
      title: "Drone full",
      description: "Payload maxed out. Recall manually to unload cargo.",
    });
    showDroneTerminalToast({
      title: "Drone full",
      description: "Payload reached capacity. Press 2 to recall.",
    });
    return;
  }

  if (droneState.pendingShutdown || droneState.fuelRemaining <= 0) {
    const shutdownReason = droneState.fuelRemaining <= 0 ? "fuel" : "manual";
    requestDroneReturnForShutdown({ reason: shutdownReason });
    return;
  }

  updateDroneStatusUi();

  if (droneState.active) {
    attemptDroneLaunch();
  }
};

const handleDroneSessionCancelled = (reason) => {
  const shouldAwaitVisualReturn =
    droneState.pendingShutdown &&
    (reason === "manual" || reason === "fuel");

  droneState.inFlight = false;
  droneState.lastResult = null;

  concludeDroneMiningSession();

  if (shouldAwaitVisualReturn) {
    droneState.awaitingReturn = true;
    droneState.status = "returning";
    if (
      !Number.isFinite(droneState.returnSessionStartMs) ||
      droneState.returnSessionStartMs <= 0
    ) {
      droneState.returnSessionStartMs = performance.now();
    }
    updateDroneStatusUi();
    return;
  }

  droneState.awaitingReturn = false;
  droneState.returnSessionStartMs = 0;

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
  droneState.returnSessionStartMs = 0;
  const outOfFuelOnReturn = droneState.fuelRemaining <= 0;

  if (droneState.pendingShutdown || outOfFuelOnReturn) {
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

const handleGeoVisorQuickSlotChange = (event) => {
  if (!(event instanceof CustomEvent)) {
    return;
  }

  const { slot, userInitiated } = event.detail ?? {};
  if (geoVisorState.activeSlotId) {
    setGeoVisorActiveSlotId(null);
  }

  if (!userInitiated || !GEO_VISOR_SLOT_IDS.has(slot?.id)) {
    return;
  }

  const pulseActivated = activateGeoVisorPulse(slot.id);
  if (!pulseActivated && !isGeoVisorBatteryFullyCharged()) {
    playGeoVisorOutOfBatterySound();
  }
};

const handleStationBuilderQuickSlotActivation = (event) => {
  if (!(event instanceof CustomEvent)) {
    return;
  }

  const { slot, userInitiated } = event.detail ?? {};

  if (!userInitiated || slot?.id !== STATION_BUILDER_QUICK_SLOT_ID) {
    return;
  }

  toggleModelPaletteVisibility();
};

const syncManifestEditModeWithQuickSlot = () => {
  if (!sceneController?.setManifestEditModeEnabled) {
    return;
  }

  const selectedSlot = getSelectedQuickSlot();
  const stationBuilderSelected =
    selectedSlot?.id === STATION_BUILDER_QUICK_SLOT_ID;

  if (!stationBuilderSelected) {
    sceneController.setManifestEditModeEnabled(false);
  }
};

const handleInventoryQuickSlotActivation = (event) => {
  if (!(event instanceof CustomEvent)) {
    return;
  }

  const { slot, userInitiated } = event.detail ?? {};

  if (!userInitiated || slot?.id !== INVENTORY_QUICK_SLOT_ID) {
    return;
  }

  toggleInventoryPanelFromShortcut();
};

if (canvas instanceof HTMLElement) {
  canvas.addEventListener("quick-slot:change", handleDroneQuickSlotActivation);
  canvas.addEventListener("quick-slot:change", handleGeoVisorQuickSlotChange);
  canvas.addEventListener(
    "quick-slot:change",
    handleStationBuilderQuickSlotActivation
  );
  canvas.addEventListener(
    "quick-slot:change",
    handleInventoryQuickSlotActivation
  );
  canvas.addEventListener("quick-slot:change", syncManifestEditModeWithQuickSlot);
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

const tickDroneStatusUi = () => {
  if (document.visibilityState === "hidden") {
    return;
  }

  const shouldRefreshRuntimeUi =
    droneState.inFlight ||
    droneState.awaitingReturn ||
    droneState.pendingShutdown ||
    isInventoryOpen();

  if (!shouldRefreshRuntimeUi) {
    return;
  }

  updateDroneStatusUi();
};

window.setInterval(tickDroneStatusUi, DRONE_STATUS_UI_UPDATE_INTERVAL_MS);
window.setInterval(tickPlayerOxygen, PLAYER_OXYGEN_TICK_INTERVAL_MS);
window.setInterval(cancelStalledDroneMiningSession, DRONE_STALL_CHECK_INTERVAL_MS);
window.setInterval(
  updateDroneMiningSoundPlayback,
  DRONE_MINING_SOUND_UPDATE_INTERVAL_MS
);
window.setInterval(updateGeoScanPanel, GEO_SCAN_PANEL_UPDATE_INTERVAL_MS);
window.setInterval(
  updateGeoVisorBatteryState,
  GEO_VISOR_BATTERY_UPDATE_INTERVAL_MS
);
const resyncPlayerOxygenTiming = () => {
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  playerOxygenTickLastTimestamp = now;
  playerOxygenMovementLastTimestamp = now;
  playerOxygenMovementLastPosition = sceneController?.getPlayerPosition?.() ?? null;
};

[
  "fullscreenchange",
  "webkitfullscreenchange",
  "mozfullscreenchange",
  "MSFullscreenChange",
].forEach((eventName) => {
  document.addEventListener(eventName, () => {
    resyncPlayerOxygenTiming();
    applyPlayerOxygenPressureEffects({
      now: Date.now(),
      silent: true,
      forceUi: true,
    });
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    playerOxygenShiftHeld = false;
  }

  if (geoVisorBatteryPersistenceEnabled && document.visibilityState === "hidden") {
    schedulePersistGeoVisorBatteryState({ force: true });
  }

  if (document.visibilityState === "hidden") {
    schedulePersistPlayerOxygen({ force: true });
  }

  if (document.visibilityState !== "hidden") {
    syncPlayerOxygenChamberPenaltyState({
      now: Date.now(),
      silent: true,
    });
    applyPlayerOxygenPressureEffects({
      now: Date.now(),
      silent: true,
      forceUi: true,
    });
  }
});
window.addEventListener("beforeunload", () => {
  if (geoVisorBatteryPersistenceEnabled) {
    schedulePersistGeoVisorBatteryState({ force: true });
  }
  schedulePersistPlayerOxygen({ force: true });
});

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

const applyTerrainLifeDrain = (detail) => {
  const terrainId = detail?.terrain?.id ?? null;
  const tileIndex = detail?.terrain?.tileIndex ?? null;
  if (!terrainId || !Number.isInteger(tileIndex)) {
    return;
  }

  if (detail?.found === false) {
    const nextLife = decreaseTerrainLife(terrainId, tileIndex, 1);
    if (nextLife <= 0) {
      sceneController?.setTerrainDepletedAtPosition?.(detail?.position ?? null) ??
        sceneController?.setTerrainVoidAtPosition?.(detail?.position ?? null);
    }
    return;
  }

  if (!detail?.found || !detail.element) {
    return;
  }

  const drainAmount = getInventoryElementWeight(detail.element);
  if (Number.isFinite(drainAmount) && drainAmount > 0) {
    const nextLife = decreaseTerrainLife(terrainId, tileIndex, drainAmount);
    if (nextLife <= 0) {
      sceneController?.setTerrainDepletedAtPosition?.(detail?.position ?? null) ??
        sceneController?.setTerrainVoidAtPosition?.(detail?.position ?? null);
    }
  }
};

const bootstrapScene = () => {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  hideRenderingErrorMessage();
  setAreaLoadingOverlayState({ active: false });
  stopElevatorTravelSound();
  sceneController?.dispose?.();
  syncDroneModelSelectionWithUnlocks({
    persist: true,
    applyToScene: false,
  });

  try {
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
      onOxygenRefillInteractableChange(value) {
        setCrosshairSourceState("oxygen", value);
      },
      onOxygenRefillInteract() {
        return handlePlayerOxygenRefillInteract();
      },
      onStorageBoxInteractableChange(value) {
        setCrosshairSourceState("storage", value);
      },
      onStorageBoxInteract({ control } = {}) {
        setActiveStorageBoxRecord({
          id: control?.userData?.storageBoxId,
          label: control?.userData?.storageBoxLabel,
          capacityKg: control?.userData?.storageBoxCapacityKg,
        });
        playTerminalInteractionSound();
        openQuickAccessModal(STORAGE_BOX_MODAL_OPTION);
        return true;
      },
      onCraftingTableInteractableChange(value) {
        setCrosshairSourceState("crafting", value);
      },
      onCraftingTableInteract() {
        playTerminalInteractionSound();
        openQuickAccessModal(CRAFTING_TABLE_MODAL_OPTION);
        return true;
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
        handleDroneSurfaceExitTransition(event);
        playTerminalInteractionSound();
        const destination = event?.to ?? null;
        const floorTitle = destination?.title || destination?.id || "New deck";
        const detail = destination?.description
          ? `${floorTitle} - ${destination.description}`
          : floorTitle;
        showTerminalToast({
          title: "Lift arrival",
          description: detail,
        });
        updateLiftModalActiveState();
      },
      onAreaLoadingStateChange(event) {
        const destination = event?.to ?? null;
        const floorTitle = destination?.title || destination?.id || "Area";
        const floorDescription =
          destination?.description ||
          "Synchronizing map data and placed objects...";
        setAreaLoadingOverlayState({
          active: Boolean(event?.active),
          title: `Loading ${floorTitle}`,
          description: floorDescription,
        });
        if (event?.active) {
          startElevatorTravelSound();
        } else {
          stopElevatorTravelSound();
        }
      },
      onManifestPlacementHoverChange: handleManifestPlacementHoverChange,
      onManifestEditModeChange: handleManifestEditModeChange,
      onManifestPlacementRemoved: handleManifestPlacementRemoved,
      onResourceCollected(detail) {
        const resolvedDetail = resolveGuaranteedDroneCollectionDetail(detail);
        applyTerrainLifeDrain(resolvedDetail);
        if (resolvedDetail?.source === "drone-miner") {
          handleDroneResourceCollected(resolvedDetail);
          return;
        }

        if (!resolvedDetail || resolvedDetail.found === false || !resolvedDetail.element) {
          showResourceToast({ title: "Nothing found" });
          return;
        }

        const element = resolvedDetail?.element ?? {};
        const terrainLabel = resolvedDetail?.terrain?.label ?? null;
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
        let description = segments.join(" - ");
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
      },
      onResourceUnavailable({ terrain } = {}) {
        const terrainLabel = terrain?.terrainLabel ?? null;
        const description = "Search other area.";

        showResourceToast({
          title: "No resources detected",
          description,
        });
      },
      onResourceSessionCancelled({ reason, source } = {}) {
        if (source === "drone-miner") {
          handleDroneSessionCancelled(reason);
          return;
        }

        clearPlayerOxygenDiggingActivity();

        if (reason === "movement") {
          playerOxygenCurrentDrainMultiplier =
            playerOxygenShiftHeld && !isPlayerOxygenSprintLocked()
            ? PLAYER_OXYGEN_SHIFT_MOVING_DRAIN_MULTIPLIER
            : PLAYER_OXYGEN_MOVING_DRAIN_MULTIPLIER;
          applyPlayerOxygenPressureEffects({
            now: Date.now(),
            silent: true,
            forceUi: true,
          });
          showResourceToast({ title: "Digging interrupted" });
        }
      },
      onDroneReturnComplete: handleDroneReturnComplete,
    });

  canvas.removeEventListener(
    "resource-tool:action",
    handlePlayerOxygenDiggingActivity
  );
  canvas.addEventListener(
    "resource-tool:action",
    handlePlayerOxygenDiggingActivity
  );

  sceneController?.setResourceToolEnabled?.(isDiggerToolEnabled());
  sceneController?.setGeoVisorEnabled?.(Boolean(getActiveGeoVisorSlotId()));
  syncDroneMiningSpeedBonusWithScene();
  syncDroneModelSelectionWithUnlocks({
    persist: true,
    applyToScene: true,
  });
  applyPlayerOxygenPressureEffects({
    now: Date.now(),
    silent: true,
    forceUi: true,
  });

  } catch (error) {
    console.error("Failed to initialize 3D scene", error);
    showRenderingErrorMessage(
      error?.message ||
        "We couldn't start the 3D view. Enable WebGL and try again."
    );
    sceneController = null;
    return;
  }

  applyStarVisualUiState();
  applyReflectionSettingsUiState();
  applyGodModeUiState();
  applyLiftDoorFilterUiState();
  applyJumpSettingsUiState();
  applyViewSettingsUiState();
  applyThirdPersonUiState();

  updateDroneStatusUi();
  relaunchDroneAfterRestoreIfNeeded();

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

if (starsToggle instanceof HTMLInputElement) {
  starsToggle.addEventListener("change", (event) => {
    const enabled = Boolean(event.target?.checked);
    currentSettings = { ...currentSettings, showStars: enabled };
    persistSettings(currentSettings);
    applyStarsUiState();
  });
}

if (reflectionsToggle instanceof HTMLInputElement) {
  reflectionsToggle.addEventListener("change", (event) => {
    const enabled = Boolean(event.target?.checked);
    currentSettings = { ...currentSettings, reflectionsEnabled: enabled };
    persistSettings(currentSettings);
    applyReflectionSettingsUiState();
  });
}

if (starFollowToggle instanceof HTMLInputElement) {
  starFollowToggle.addEventListener("change", (event) => {
    const enabled = Boolean(event.target?.checked);
    currentSettings = { ...currentSettings, starFollowPlayer: enabled };
    persistSettings(currentSettings);
    applyStarVisualUiState();
  });
}

if (godModeToggle instanceof HTMLInputElement) {
  godModeToggle.addEventListener("change", (event) => {
    const enabled = Boolean(event.target?.checked);
    currentSettings = { ...currentSettings, godMode: enabled };
    persistSettings(currentSettings);
    applyGodModeUiState();
    if (enabled) {
      completeCostumeResearchActiveJobInstantly({ notify: true });
      completeCostumeCraftingActiveJobInstantly({ notify: true });
      completeDroneResearchActiveJobInstantly({ notify: true });
      completeDroneCraftingActiveJobInstantly({ notify: true });
    }
  });
}

if (godModeAddElementButton instanceof HTMLButtonElement) {
  godModeAddElementButton.addEventListener("click", (event) => {
    event.preventDefault();
    grantGodModeElementToInventory();
  });
}

if (godModeAddAllElementsButton instanceof HTMLButtonElement) {
  godModeAddAllElementsButton.addEventListener("click", (event) => {
    event.preventDefault();
    grantAllGodModeElementsToInventory();
  });
}

if (liftDoorFilterToggle instanceof HTMLInputElement) {
  liftDoorFilterToggle.addEventListener("change", (event) => {
    const enabled = Boolean(event.target?.checked);
    currentSettings = { ...currentSettings, liftDoorFiltering: enabled };
    persistSettings(currentSettings);
    applyLiftDoorFilterUiState();
  });
}

if (thirdPersonToggle instanceof HTMLInputElement) {
  thirdPersonToggle.addEventListener("change", (event) => {
    const enabled = Boolean(event.target?.checked);
    currentSettings = { ...currentSettings, thirdPersonCamera: enabled };
    persistSettings(currentSettings);
    applyThirdPersonUiState();
  });
}

const bindStarSettingInput = (key, inputs) => {
  const elements = Array.isArray(inputs) ? inputs : [inputs];
  const validElements = elements.filter(
    (element) => element instanceof HTMLInputElement
  );

  if (validElements.length === 0) {
    return;
  }

  const commit = () => {
    const activeInput = validElements.find((element) => document.activeElement === element);
    const source = activeInput ?? validElements[0];
    const value = Number.parseFloat(source.value);

    if (!Number.isFinite(value)) {
      return;
    }

    currentSettings = { ...currentSettings, [key]: value };
    persistSettings(currentSettings);
    applyStarVisualUiState();
  };

  validElements.forEach((element) => {
    element.addEventListener("input", commit);
    element.addEventListener("change", commit);
  });
};

const bindTimeSettingInput = (key, inputs, onUpdate) => {
  const elements = Array.isArray(inputs) ? inputs : [inputs];
  const validElements = elements.filter(
    (element) => element instanceof HTMLInputElement
  );

  if (validElements.length === 0) {
    return;
  }

  const commit = () => {
    const activeInput = validElements.find((element) => document.activeElement === element);
    const source = activeInput ?? validElements[0];
    const value = Number.parseFloat(source.value);

    if (!Number.isFinite(value)) {
      return;
    }

    currentSettings = { ...currentSettings, [key]: value };
    persistSettings(currentSettings);
    onUpdate?.();
  };

  validElements.forEach((element) => {
    element.addEventListener("input", commit);
    element.addEventListener("change", commit);
  });
};

bindStarSettingInput("starSize", [starSizeRange, starSizeInput]);
bindStarSettingInput("starDensity", [starDensityRange, starDensityInput]);
bindStarSettingInput("starOpacity", [starOpacityRange, starOpacityInput]);
bindStarSettingInput("skyExtent", [skyExtentRange, skyExtentInput]);
bindStarSettingInput("skyDomeHeight", [skyHeightRange, skyHeightInput]);
bindTimeSettingInput(
  "reflectorResolutionScale",
  reflectionSettingInputs,
  applyReflectionSettingsUiState
);
bindTimeSettingInput(
  "timeZoneOffsetHours",
  timeSettingInputs,
  applyTimeSettingsUiState
);
bindTimeSettingInput(
  "playerSpeedMultiplier",
  speedSettingInputs,
  applySpeedSettingsUiState
);
bindTimeSettingInput(
  "playerJumpMultiplier",
  jumpSettingInputs,
  applyJumpSettingsUiState
);
bindTimeSettingInput(
  "jumpApexSmoothing",
  jumpApexSmoothingInputs,
  applyJumpSettingsUiState
);
bindTimeSettingInput(
  "jumpApexVelocity",
  jumpApexVelocityInputs,
  applyJumpSettingsUiState
);
bindTimeSettingInput(
  "viewDistance",
  viewSettingInputs,
  applyViewSettingsUiState
);

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
    "Reset all saved progress, inventory, quests, and settings? This cannot be undone."
  );

  if (!shouldReset) {
    return;
  }

  setErrorMessage("");
  setButtonBusyState(resetButton, true);
  progressResetInProgress = true;
  geoVisorBatteryPersistenceEnabled = false;
  playerOxygenPersistenceEnabled = false;
  if (persistGeoVisorBatteryTimeoutId) {
    window.clearTimeout(persistGeoVisorBatteryTimeoutId);
    persistGeoVisorBatteryTimeoutId = 0;
  }
  if (persistTerrainLifeTimeoutId) {
    window.clearTimeout(persistTerrainLifeTimeoutId);
    persistTerrainLifeTimeoutId = 0;
  }
  if (persistInventoryStateTimeoutId) {
    window.clearTimeout(persistInventoryStateTimeoutId);
    persistInventoryStateTimeoutId = 0;
  }
  if (persistStorageBoxStateTimeoutId) {
    window.clearTimeout(persistStorageBoxStateTimeoutId);
    persistStorageBoxStateTimeoutId = 0;
  }
  if (persistPlayerOxygenTimeoutId) {
    window.clearTimeout(persistPlayerOxygenTimeoutId);
    persistPlayerOxygenTimeoutId = 0;
  }

  let shouldReload = false;
  const persistenceSetter = sceneController?.setPlayerStatePersistenceEnabled;
  const previousPersistenceEnabled =
    typeof persistenceSetter === "function"
      ? persistenceSetter(false)
      : undefined;

  try {
    const clearedPlayerState = clearStoredPlayerState();
    const clearedDroneState = clearStoredDroneState();
    const clearedSettings = clearStoredSettings();
    const clearedGeoVisorState = clearStoredGeoVisorState();
    const clearedTerrainLife = clearStoredTerrainLife();
    const clearedManifestPlacements = clearStoredManifestPlacements();
    const clearedInventory = clearStoredInventoryState();
    const clearedStorageBox = clearStoredStorageBoxState();
    const clearedDroneCrafting = clearStoredDroneCraftingState();
    const clearedPlayerOxygen = clearStoredPlayerOxygenState();
    const resetMarketState = persistMarketState(getDefaultMarketState());
    storageBoxState.boxes.clear();
    storageBoxState.activeBoxId = STORAGE_BOX_DEFAULT_ID;
    ensureStorageBoxRecord(STORAGE_BOX_DEFAULT_ID);
    clearCostumeResearchState();
    droneCraftingState.researchedPartIds.clear();
    droneCraftingState.inventoryResearchPartIds.clear();
    droneCraftingState.readyResearchPartIds.clear();
    droneCraftingState.craftedPartIds.clear();
    droneCraftingState.equippedPartIds.clear();
    droneCraftingState.readyPartIds.clear();
    droneCraftingState.activeResearchJob = null;
    droneCraftingState.activeJob = null;
    ensureDroneUnlockedModelState().clear();
    ensureDroneUnlockedModelState().add(DRONE_LIGHT_MODEL_ID);
    droneCraftingState.mediumModelRequirements = [];
    syncCostumeResearchProgressInterval();
    syncCostumeCraftingProgressInterval();
    syncDroneResearchProgressInterval();
    syncDroneCraftingProgressInterval();
    lastSerializedDroneCraftingState = null;
    applyCostumeResearchBonuses({
      refreshResearch: false,
      persistOxygen: false,
      silentPressure: true,
    });
    syncDroneMiningSpeedBonusWithScene();

    resetMissions();
    resetCurrency();

    if (
      !clearedPlayerState ||
      !clearedDroneState ||
      !clearedSettings ||
      !clearedGeoVisorState ||
      !clearedTerrainLife ||
      !clearedManifestPlacements ||
      !clearedInventory ||
      !clearedStorageBox ||
      !clearedDroneCrafting ||
      !clearedPlayerOxygen ||
      !resetMarketState
    ) {
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
      progressResetInProgress = false;
      geoVisorBatteryPersistenceEnabled = true;
      playerOxygenPersistenceEnabled = true;
      setButtonBusyState(resetButton, false);
    }
  }
}

if (resetButton instanceof HTMLButtonElement) {
  resetButton.addEventListener("click", handleReset);
}

