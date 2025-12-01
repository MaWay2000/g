const FPS_WINDOW = 60;
const DISPLAY_REFRESH_INTERVAL_MS = 250;

export class FpsMeter {
  constructor(displayElement) {
    this.displayElement = displayElement instanceof HTMLElement ? displayElement : null;
    this.enabled = false;
    this.lastFrameTime = null;
    this.frameTimes = [];
    this.pendingRaf = null;
    this.pendingDisplayUpdate = null;
  }

  setEnabled(enabled) {
    const nextState = Boolean(enabled);

    if (nextState === this.enabled) {
      return;
    }

    this.enabled = nextState;

    if (!this.enabled) {
      this.#stop();
      return;
    }

    if (this.displayElement) {
      this.displayElement.hidden = false;
    }

    this.lastFrameTime = performance.now();
    this.#tick();
  }

  #stop() {
    if (this.pendingRaf !== null) {
      cancelAnimationFrame(this.pendingRaf);
      this.pendingRaf = null;
    }

    if (this.pendingDisplayUpdate !== null) {
      clearTimeout(this.pendingDisplayUpdate);
      this.pendingDisplayUpdate = null;
    }

    this.lastFrameTime = null;
    this.frameTimes.length = 0;

    if (this.displayElement) {
      this.displayElement.hidden = true;
      this.displayElement.textContent = "";
    }
  }

  #tick = () => {
    if (!this.enabled) {
      return;
    }

    this.pendingRaf = requestAnimationFrame((timestamp) => {
      if (!this.enabled) {
        return;
      }

      const delta = timestamp - (this.lastFrameTime ?? timestamp);
      this.lastFrameTime = timestamp;

      if (delta > 0) {
        this.frameTimes.push(delta);

        if (this.frameTimes.length > FPS_WINDOW) {
          this.frameTimes.shift();
        }

        this.#scheduleDisplayUpdate();
      }

      this.#tick();
    });
  };

  #scheduleDisplayUpdate() {
    if (this.pendingDisplayUpdate !== null) {
      return;
    }

    this.pendingDisplayUpdate = setTimeout(() => {
      this.pendingDisplayUpdate = null;
      this.#updateDisplay();
    }, DISPLAY_REFRESH_INTERVAL_MS);
  }

  #updateDisplay() {
    if (!this.displayElement) {
      return;
    }

    if (this.frameTimes.length === 0) {
      this.displayElement.textContent = "-- FPS";
      return;
    }

    const averageDelta =
      this.frameTimes.reduce((sum, value) => sum + value, 0) / this.frameTimes.length;
    const fps = Math.round(1000 / averageDelta);

    this.displayElement.textContent = `${fps} FPS`;
  }
}
