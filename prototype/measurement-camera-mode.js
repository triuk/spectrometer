import { captureContext, elements, setControlStatus, state } from "./core.js";
import { clearDarkSpectrum } from "./spectrum.js";

const TARGET = 220;
const TARGET_MIN = 205;
const TARGET_MAX = 232;
const MAX_STEPS = 14;
const SETTLE_MS = 500;
const DEFAULT_FIXED = {
  colorTemperature: 4600,
  brightness: 0,
  contrast: 32,
  saturation: 50,
  sharpness: 1,
};

let currentTrack = null;
let runId = 0;
let optimizing = false;
let timer = null;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function rangeFor(name) {
  const range = state.capabilities[name];
  return range && Number.isFinite(range.min) && Number.isFinite(range.max)
    ? { min: range.min, max: range.max, step: Number(range.step) || 1 }
    : null;
}

function quantize(value, range) {
  return clamp(
    range.min + Math.round((value - range.min) / range.step) * range.step,
    range.min,
    range.max,
  );
}

function supports(name, value) {
  return Array.isArray(state.capabilities[name]) && state.capabilities[name].includes(value);
}

function configureUi() {
  document.documentElement.classList.add("measurement-camera-mode");
  elements.manualModeButton.hidden = true;
  elements.autoModeButton.textContent = optimizing
    ? "Optimalizuji expozici…"
    : "Optimalizovat expozici (SW)";
  elements.autoModeButton.classList.remove("active");
  elements.autoModeButton.setAttribute("aria-pressed", "false");
  elements.autoModeButton.setAttribute("aria-busy", String(optimizing));

  const group = elements.autoModeButton.parentElement;
  group?.removeAttribute("role");
  group?.setAttribute("aria-label", "Softwarová optimalizace expozice");

  const manualPanel = document.querySelector(".manual-image-section");
  if (manualPanel) manualPanel.hidden = false;
}

function installStyles() {
  if (document.querySelector("#measurementCameraModeStyle")) return;
  const style = document.createElement("style");
  style.id = "measurementCameraModeStyle";
  style.textContent = `
    .measurement-camera-mode #manualModeButton,
    .measurement-camera-mode .automatic-image-readout,
    .measurement-camera-mode .image-corrections {
      display: none !important;
    }
    .measurement-camera-mode .manual-image-section {
      display: block !important;
    }
  `;
  document.head.append(style);
}

function profileFixedSettings() {
  const settings = state.instrumentProfile?.cameraSettings ?? {};
  return {
    colorTemperature: Number.isFinite(Number(settings.whiteBalance)) ? Number(settings.whiteBalance) : DEFAULT_FIXED.colorTemperature,
    brightness: Number.isFinite(Number(settings.brightness)) ? Number(settings.brightness) : DEFAULT_FIXED.brightness,
    contrast: Number.isFinite(Number(settings.contrast)) ? Number(settings.contrast) : DEFAULT_FIXED.contrast,
    saturation: Number.isFinite(Number(settings.saturation)) ? Number(settings.saturation) : DEFAULT_FIXED.saturation,
    sharpness: Number.isFinite(Number(settings.sharpness)) ? Number(settings.sharpness) : DEFAULT_FIXED.sharpness,
  };
}

function fixedConstraints() {
  const values = {};
  if (supports("exposureMode", "manual")) values.exposureMode = "manual";
  if (supports("whiteBalanceMode", "manual")) values.whiteBalanceMode = "manual";

  for (const [name, requested] of Object.entries(profileFixedSettings())) {
    const range = rangeFor(name);
    if (range) values[name] = quantize(requested, range);
  }
  return values;
}

async function forceMeasurementMode(track, quiet = false) {
  if (!track || track !== state.track) return;
  const values = fixedConstraints();
  if (!Object.keys(values).length) throw new Error("Kamera neposkytuje ruční nastavení obrazu.");

  if (!quiet) setControlStatus("Nastavuji pevný ruční režim pro měření…");
  await track.applyConstraints({ advanced: [values] });
  await sleep(250);

  const settings = track.getSettings();
  if (supports("exposureMode", "manual") && settings.exposureMode !== "manual") {
    throw new Error(`kamera hlásí exposureMode=${settings.exposureMode ?? "?"}`);
  }
  if (supports("whiteBalanceMode", "manual") && settings.whiteBalanceMode !== "manual") {
    throw new Error(`kamera hlásí whiteBalanceMode=${settings.whiteBalanceMode ?? "?"}`);
  }

  configureUi();
  if (!quiet) {
    setControlStatus("Pevný ruční režim z profilu je aktivní. Expozici lze nastavit ručně nebo jednorázově optimalizovat.");
  }
}

function roi() {
  const width = elements.video.videoWidth;
  const height = elements.video.videoHeight;
  if (!width || !height) return null;
  const source = state.roi ?? { x: 0, y: 0, width, height };
  const x = clamp(Math.round(source.x), 0, width - 1);
  const y = clamp(Math.round(source.y), 0, height - 1);
  return {
    x,
    y,
    width: clamp(Math.round(source.width), 1, width - x),
    height: clamp(Math.round(source.height), 1, height - y),
  };
}

function peakInRoi() {
  if (!state.track || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  const selected = roi();
  if (!selected) return null;

  if (elements.captureCanvas.width !== elements.video.videoWidth
      || elements.captureCanvas.height !== elements.video.videoHeight) {
    elements.captureCanvas.width = elements.video.videoWidth;
    elements.captureCanvas.height = elements.video.videoHeight;
  }

  captureContext.drawImage(elements.video, 0, 0, elements.captureCanvas.width, elements.captureCanvas.height);
  const data = captureContext.getImageData(
    selected.x,
    selected.y,
    selected.width,
    selected.height,
  ).data;

  const yStep = Math.max(1, Math.floor(selected.height / 48));
  let peak = 0;
  for (let x = 0; x < selected.width; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let y = 0; y < selected.height; y += yStep) {
      const offset = (y * selected.width + x) * 4;
      r += data[offset];
      g += data[offset + 1];
      b += data[offset + 2];
      count += 1;
    }
    peak = Math.max(peak, r / count, g / count, b / count);
  }
  return Math.round(peak);
}

function nextExposure(current, peak, range) {
  let factor = peak <= 1 ? 4 : TARGET / peak;
  if (peak >= 248) factor = Math.min(factor, 0.45);
  factor = clamp(factor, 0.25, 4);
  let next = quantize(current * factor, range);
  if (next === current && peak < TARGET_MIN) next = quantize(current + range.step, range);
  if (next === current && peak > TARGET_MAX) next = quantize(current - range.step, range);
  return next;
}

async function setExposure(track, value) {
  await track.applyConstraints({ advanced: [{ exposureMode: "manual", exposureTime: value }] });
  await sleep(SETTLE_MS);
  const actual = Number(track.getSettings().exposureTime);
  return Number.isFinite(actual) ? actual : value;
}

async function optimizeExposure() {
  if (!state.track || optimizing) return;
  const exposureRange = rangeFor("exposureTime");
  if (!exposureRange) {
    setControlStatus("Kamera nezpřístupnila ruční expoziční čas.", true);
    return;
  }

  optimizing = true;
  const id = ++runId;
  const track = state.track;
  configureUi();
  if (state.darkSpectrum) clearDarkSpectrum();

  try {
    await forceMeasurementMode(track, true);
    let stable = 0;
    let peak = null;
    let exposure = Number(track.getSettings().exposureTime) || exposureRange.min;

    for (let step = 1; step <= MAX_STEPS; step += 1) {
      if (id !== runId || track !== state.track) return;
      await sleep(SETTLE_MS);
      peak = peakInRoi();
      if (peak === null) continue;
      exposure = Number(track.getSettings().exposureTime) || exposure;

      if (peak >= TARGET_MIN && peak <= TARGET_MAX) {
        stable += 1;
        setControlStatus(`Maximum ${peak}/255 při expozici ${exposure}; ověřuji stabilitu…`);
        if (stable >= 2) break;
        continue;
      }

      stable = 0;
      const next = nextExposure(exposure, peak, exposureRange);
      if (next === exposure) break;
      setControlStatus(`Optimalizace ${step}/${MAX_STEPS}: maximum ${peak}/255, expozice ${exposure} → ${next}`);
      exposure = await setExposure(track, next);
    }

    if (id !== runId || track !== state.track) return;
    await sleep(SETTLE_MS);
    peak = peakInRoi();
    exposure = Number(track.getSettings().exposureTime) || exposure;
    setControlStatus(`Expozice ${exposure} je uzamčena; maximum ${peak ?? "?"}/255.`);
  } catch (error) {
    console.error(error);
    setControlStatus(`Optimalizace expozice selhala: ${error.message}`, true);
  } finally {
    if (id === runId) optimizing = false;
    configureUi();
  }
}

function watchTrack() {
  configureUi();
  if (state.track === currentTrack) return;
  currentTrack = state.track;
  runId += 1;
  optimizing = false;
  configureUi();
  if (!state.track) return;

  const track = state.track;
  window.setTimeout(async () => {
    if (track !== state.track) return;
    try {
      await forceMeasurementMode(track);
    } catch (error) {
      console.error(error);
      setControlStatus(`Ruční měřicí režim nelze nastavit: ${error.message}`, true);
    }
  }, 700);
}

export function installMeasurementCameraMode() {
  installStyles();
  configureUi();

  const help = document.querySelector("#imageSettingsHelp");
  if (help) {
    help.textContent = "Kamera pracuje vždy v pevném ručním režimu. Pevné hodnoty obrazu a horní limit expozice jsou součástí profilu spektrometru; tlačítko Optimalizovat expozici (SW) mění jen expoziční čas.";
  }

  elements.autoModeButton.addEventListener("click", (event) => {
    if (!state.track) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    optimizeExposure();
  }, { capture: true });

  timer = window.setInterval(watchTrack, 250);
  window.addEventListener("beforeunload", () => window.clearInterval(timer));
}
