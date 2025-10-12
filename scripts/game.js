import { logout } from "./auth.js";
import { initScene } from "./scene.js";

const canvas = document.getElementById("gameCanvas");
const instructions = document.querySelector("[data-instructions]");
const logoutButton = document.querySelector("[data-logout-button]");
const errorMessage = document.getElementById("logoutError");
const terminalToast = document.getElementById("terminalToast");
const crosshair = document.querySelector(".crosshair");

let terminalToastHideTimeoutId;
let terminalToastFinalizeTimeoutId;

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

  if (canInteract) {
    crosshair.dataset.interactable = "true";
  } else {
    delete crosshair.dataset.interactable;
  }
};

const bootstrapScene = () => {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  initScene(canvas, {
    onControlsLocked() {
      instructions?.setAttribute("hidden", "");
    },
    onControlsUnlocked() {
      instructions?.removeAttribute("hidden");
      setCrosshairInteractableState(false);
      hideTerminalToast();
    },
    onTerminalOptionSelected(option) {
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
