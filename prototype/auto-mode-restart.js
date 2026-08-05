import { startCamera } from "./camera.js";
import { elements, setControlStatus, state } from "./core.js";

let restarting = false;

function isManualMode() {
  const settings = state.track?.getSettings() ?? {};
  return settings.exposureMode === "manual" || settings.whiteBalanceMode === "manual";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapshotMeasurementUi() {
  return {
    roi: state.roi ? { ...state.roi } : null,
    pixel1: elements.pixel1.value,
    pixel2: elements.pixel2.value,
    wavelength1: elements.wavelength1.value,
    wavelength2: elements.wavelength2.value,
  };
}

function restoreMeasurementUi(snapshot) {
  const videoWidth = elements.video.videoWidth;
  const videoHeight = elements.video.videoHeight;

  if (snapshot.roi && videoWidth > 0 && videoHeight > 0) {
    const x = clamp(Math.round(snapshot.roi.x), 0, videoWidth - 1);
    const y = clamp(Math.round(snapshot.roi.y), 0, videoHeight - 1);
    const width = clamp(Math.round(snapshot.roi.width), 1, videoWidth - x);
    const height = clamp(Math.round(snapshot.roi.height), 1, videoHeight - y);
    state.roi = { x, y, width, height };
    elements.roiOutput.textContent = `ROI: x ${x}, y ${y}, ${width} × ${height}`;
  }

  elements.pixel1.value = snapshot.pixel1;
  elements.pixel2.value = snapshot.pixel2;
  elements.wavelength1.value = snapshot.wavelength1;
  elements.wavelength2.value = snapshot.wavelength2;

  // Překreslení overlaye a grafu přes existující globální obsluhu resize.
  window.dispatchEvent(new Event("resize"));
}

async function waitForAutomaticMode(timeoutMs = 2500) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const settings = state.track?.getSettings() ?? {};
    const exposureAutomatic = settings.exposureMode === undefined || settings.exposureMode === "continuous";
    const whiteBalanceAutomatic = settings.whiteBalanceMode === undefined || settings.whiteBalanceMode === "continuous";
    if (state.track && exposureAutomatic && whiteBalanceAutomatic) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return false;
}

async function restartIntoAutomaticMode() {
  if (restarting || !state.track) return;
  restarting = true;

  const snapshot = snapshotMeasurementUi();
  elements.autoModeButton.disabled = true;
  elements.manualModeButton.disabled = true;
  setControlStatus("Restartuji kameru pro aktivaci automatického režimu…");

  try {
    await startCamera();
    const automatic = await waitForAutomaticMode();
    restoreMeasurementUi(snapshot);

    if (!automatic) {
      setControlStatus("Kamera byla restartována, ale automatický režim nebyl potvrzen.", true);
      return;
    }

    setControlStatus("Automatický režim byl aktivován restartem kamery. Tmavé spektrum bylo zrušeno.");
  } catch (error) {
    console.error(error);
    setControlStatus(`Automatický režim nelze aktivovat: ${error.message}`, true);
  } finally {
    restarting = false;
  }
}

export function installAutomaticModeRestart() {
  elements.autoModeButton.addEventListener("click", (event) => {
    if (!state.track || !isManualMode()) return;

    // Zastaví původní obsluhu přepnutí za běhu. U této UVC kamery se změna
    // manual → continuous fyzicky projeví až po znovuotevření streamu.
    event.preventDefault();
    event.stopImmediatePropagation();
    restartIntoAutomaticMode();
  }, { capture: true });
}
