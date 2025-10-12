import { logout } from "./auth.js";
import { initScene } from "./scene.js";

const canvas = document.getElementById("gameCanvas");
const gamePanel = document.querySelector("[data-game-panel]");
const screenSaver = document.querySelector("[data-game-screen-saver]");
const instructions = document.querySelector("[data-instructions]");
const logoutButton = document.querySelector("[data-logout-button]");
const enterRoomButton = document.querySelector("[data-enter-room]");
const gameMenuInteractiveElements = document.querySelectorAll(
  "[data-enter-room], [data-logout-button], [data-game-menu] a"
);
const errorMessage = document.getElementById("logoutError");

const STANDBY_TIMEOUT_MS = 60 * 1000;
let standbyTimeoutId = 0;
let controls = null;

const clearStandbyTimeout = () => {
  if (standbyTimeoutId) {
    window.clearTimeout(standbyTimeoutId);
    standbyTimeoutId = 0;
  }
};

const showScreenSaver = () => {
  if (!(gamePanel instanceof HTMLElement && screenSaver instanceof HTMLElement)) {
    return;
  }

  clearStandbyTimeout();
  screenSaver.classList.remove("is-dismissed");
  screenSaver.setAttribute("aria-hidden", "false");
  gamePanel.classList.add("is-screen-saver-active");
};

const scheduleStandbyTimeout = () => {
  if (!(screenSaver instanceof HTMLElement)) {
    return;
  }

  clearStandbyTimeout();
  if (!screenSaver.classList.contains("is-dismissed")) {
    return;
  }

  standbyTimeoutId = window.setTimeout(() => {
    showScreenSaver();
  }, STANDBY_TIMEOUT_MS);
};

const resetStandbyTimeout = () => {
  if (
    !(screenSaver instanceof HTMLElement) ||
    !screenSaver.classList.contains("is-dismissed") ||
    controls?.isLocked
  ) {
    return;
  }

  scheduleStandbyTimeout();
};

const dismissScreenSaver = () => {
  if (!(gamePanel instanceof HTMLElement && screenSaver instanceof HTMLElement)) {
    return;
  }

  if (screenSaver.classList.contains("is-dismissed")) {
    return;
  }

  screenSaver.classList.add("is-dismissed");
  screenSaver.setAttribute("aria-hidden", "true");
  gamePanel.classList.remove("is-screen-saver-active");
  scheduleStandbyTimeout();
};

const handlePanelPointerDown = (event) => {
  if (event.target instanceof HTMLElement && event.target.closest("a, button")) {
    return;
  }

  dismissScreenSaver();
};

if (gamePanel instanceof HTMLElement) {
  gamePanel.addEventListener("pointerdown", handlePanelPointerDown);
}

const handleMenuFocus = () => {
  dismissScreenSaver();
};

const handleMenuPointerDown = () => {
  dismissScreenSaver();
};

const handleMenuKeydown = (event) => {
  if (["Enter", " ", "Spacebar"].includes(event.key)) {
    dismissScreenSaver();
  }
};

gameMenuInteractiveElements.forEach((element) => {
  element.addEventListener("focus", handleMenuFocus);
  element.addEventListener("pointerdown", handleMenuPointerDown);
  element.addEventListener("keydown", handleMenuKeydown);
});

const idleInteractionEvents = [
  "pointerdown",
  "pointermove",
  "keydown",
  "touchstart",
  "wheel",
  "scroll",
];

idleInteractionEvents.forEach((eventName) => {
  document.addEventListener(eventName, resetStandbyTimeout, { passive: true });
});

const bootstrapScene = () => {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const sceneApi = initScene(canvas, {
    onControlsLocked() {
      instructions?.setAttribute("hidden", "");
      if (gamePanel instanceof HTMLElement) {
        gamePanel.classList.add("is-hidden");
      }
      clearStandbyTimeout();
    },
    onControlsUnlocked() {
      instructions?.removeAttribute("hidden");
      if (gamePanel instanceof HTMLElement) {
        gamePanel.classList.remove("is-hidden");
      }
      showScreenSaver();
    },
  });

  controls = sceneApi?.controls ?? null;
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

const handleEnterRoom = (event) => {
  if (event) {
    event.preventDefault();
  }

  dismissScreenSaver();

  if (controls && !controls.isLocked) {
    canvas?.focus({ preventScroll: true });
    controls.lock();
  }
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

if (enterRoomButton instanceof HTMLButtonElement) {
  enterRoomButton.addEventListener("click", handleEnterRoom);
}

showScreenSaver();
