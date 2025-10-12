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
