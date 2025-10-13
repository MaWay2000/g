import { logout } from "./auth.js";
import { initScene } from "./scene.js";

const canvas = document.getElementById("gameCanvas");
const instructions = document.querySelector("[data-instructions]");
const logoutButton = document.querySelector("[data-logout-button]");
const errorMessage = document.getElementById("logoutError");
const terminalToast = document.getElementById("terminalToast");
const crosshair = document.querySelector(".crosshair");
let previousCrosshairInteractableState =
  crosshair instanceof HTMLElement && crosshair.dataset.interactable === "true";
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

const quickAccessModalTemplates = {
  default: document.getElementById("quick-access-modal-default"),
  news: document.getElementById("quick-access-modal-news"),
  weather: document.getElementById("quick-access-modal-weather"),
  missions: document.getElementById("quick-access-modal-missions"),
};

const modalFocusableSelectors =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  if (option?.title) {
    return `${option.title} terminal briefing`;
  }

  return "Terminal information panel";
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

const setCrosshairInteractableState = (canInteract) => {
  if (!(crosshair instanceof HTMLElement)) {
    return;
  }

  const nextCrosshairInteractableState = Boolean(canInteract);
  if (
    previousCrosshairInteractableState === false &&
    nextCrosshairInteractableState === true
  ) {
    playTerminalInteractionSound();
  }

  if (nextCrosshairInteractableState) {
    crosshair.dataset.interactable = "true";
  } else {
    delete crosshair.dataset.interactable;
  }

  previousCrosshairInteractableState = nextCrosshairInteractableState;
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
      setCrosshairInteractableState(false);
      hideTerminalToast();
    },
    onTerminalOptionSelected(option) {
      playTerminalInteractionSound();
      openQuickAccessModal(option);
      showTerminalToast(option);
    },
    onTerminalInteractableChange: setCrosshairInteractableState,
  });
};

if (document.readyState === "complete") {
  window.requestAnimationFrame(bootstrapScene);
} else {
  const handleLoad = () => {
    window.requestAnimationFrame(bootstrapScene);
  };
  window.addEventListener("load", handleLoad, { once: true });
}

const setErrorMessage = (message) => {
  if (errorMessage instanceof HTMLElement) {
    errorMessage.textContent = message;
    errorMessage.hidden = !message;
  }
};

const setButtonBusyState = (isBusy) => {
  if (!(logoutButton instanceof HTMLButtonElement)) {
    return;
  }

  logoutButton.disabled = isBusy;
  logoutButton.setAttribute("aria-busy", String(isBusy));
};

async function handleLogout(event) {
  if (event) {
    event.preventDefault();
  }

  setErrorMessage("");
  setButtonBusyState(true);

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
    setButtonBusyState(false);
  }
}

if (logoutButton instanceof HTMLButtonElement) {
  logoutButton.addEventListener("click", handleLogout);
}
