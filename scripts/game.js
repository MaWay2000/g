import { logout } from "./auth.js";
import { initScene } from "./scene.js";

const canvas = document.getElementById("gameCanvas");
const instructions = document.querySelector("[data-instructions]");
const logoutButton = document.querySelector("[data-logout-button]");
const errorMessage = document.getElementById("logoutError");

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
    },
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
