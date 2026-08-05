import {
  clamp,
  elements,
  setCameraStatus,
  setControlStatus,
  setRunningControls,
  state,
  toFiniteNumber,
} from "./core.js";
import {
  clearOverlay,
  clearProcessingState,
  drawEmptyPlot,
  initialiseCaptureSurface,
  initialiseDefaultRoi,
  observePreviewSize,
  startProcessingLoop,
  stopProcessing,
} from "./spectrum.js";

const TARGET_CAMERA_LABEL = /USB 2\.0 Camera: USB-ZH/i;
const SAVED_DEVICE_KEY = "spectrometer.cameraDeviceId";

const CAPTURE_PROFILES = [
  {
    id: "optimal",
    label: "Optimální",
    constraints: {
      width: { exact: 1920 },
      height: { exact: 1080 },
      frameRate: { exact: 5 },
    },
  },
  {
    id: "full-hd-fallback",
    label: "Fallback Full HD",
    constraints: {
      width: { exact: 1920 },
      height: { exact: 1080 },
      frameRate: { ideal: 5 },
    },
  },
  {
    id: "1280x960-fallback",
    label: "Fallback 1280 × 960",
    constraints: {
      width: { exact: 1280 },
      height: { exact: 960 },
      frameRate: { ideal: 6 },
    },
  },
  {
    id: "1280x720-fallback",
    label: "Fallback 1280 × 720",
    constraints: {
      width: { exact: 1280 },
      height: { exact: 720 },
      frameRate: { ideal: 9 },
    },
  },
  {
    id: "automatic-fallback",
    label: "Automatický fallback",
    constraints: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 5 },
    },
  },
];

const MODE_CONTROLS = [
  ["exposureMode", "Režim expozice"],
  ["whiteBalanceMode", "White balance"],
];

const NUMERIC_CONTROLS = [
  ["exposureTime", "Expozice"],
  ["colorTemperature", "Teplota bílé"],
  ["brightness", "Jas"],
  ["contrast", "Kontrast"],
  ["saturation", "Saturace"],
  ["sharpness", "Ostrost"],
];

function getCapabilities(track) {
  try {
    return track.getCapabilities?.() ?? {};
  } catch (error) {
    console.warn("Camera capabilities are unavailable.", error);
    return {};
  }
}

async function waitForMetadata() {
  if (elements.video.videoWidth && elements.video.videoHeight) return;
  await new Promise((resolve) => elements.video.addEventListener("loadedmetadata", resolve, { once: true }));
}

async function requestCameraStream() {
  const savedDeviceId = localStorage.getItem(SAVED_DEVICE_KEY);
  if (savedDeviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: savedDeviceId } },
      });
    } catch (error) {
      console.warn("Saved camera is unavailable; falling back to the browser chooser.", error);
      localStorage.removeItem(SAVED_DEVICE_KEY);
    }
  }

  return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
}

async function selectBestCaptureProfile(track) {
  for (const profile of CAPTURE_PROFILES) {
    try {
      await track.applyConstraints(profile.constraints);
      return profile;
    } catch (error) {
      console.warn(`Capture profile ${profile.id} is unavailable.`, error);
    }
  }

  return {
    id: "browser-default",
    label: "Výchozí režim prohlížeče",
    constraints: {},
  };
}

function isOptimalCapture(profile, settings, label) {
  const frameRate = Number(settings.frameRate);
  return profile.id === "optimal"
    && TARGET_CAMERA_LABEL.test(label)
    && settings.width === 1920
    && settings.height === 1080
    && Number.isFinite(frameRate)
    && Math.abs(frameRate - 5) < 0.15;
}

function renderCaptureMode(profile) {
  const settings = state.track?.getSettings() ?? {};
  const label = state.track?.label || "Neznámá kamera";
  const optimal = isOptimalCapture(profile, settings, label);
  const frameRate = Number(settings.frameRate);

  elements.captureModeStatus.className = `capture-mode capture-mode-${optimal ? "optimal" : "fallback"}`;
  elements.captureModeBadge.textContent = optimal ? "Optimální" : "Fallback";
  elements.captureCameraName.textContent = label;
  elements.captureResolution.textContent = settings.width && settings.height
    ? `${settings.width} × ${settings.height}`
    : "Nezjištěno";
  elements.captureFrameRate.textContent = Number.isFinite(frameRate)
    ? `${frameRate.toFixed(frameRate % 1 ? 2 : 0)} fps`
    : "Nezjištěno";
  elements.captureFormat.textContent = "Nezjištěno – Chromium údaj neposkytuje";
  elements.captureModeStatus.title = optimal
    ? "Kamera běží v cílovém režimu 1920 × 1080 při 5 fps."
    : `Použit náhradní režim: ${profile.label}.`;
}

function resetCaptureMode() {
  elements.captureModeStatus.className = "capture-mode capture-mode-idle";
  elements.captureModeBadge.textContent = "Čeká";
  elements.captureCameraName.textContent = "–";
  elements.captureResolution.textContent = "–";
  elements.captureFrameRate.textContent = "–";
  elements.captureFormat.textContent = "–";
  elements.captureModeStatus.removeAttribute("title");
}

export async function startCamera() {
  stopCamera();
  setCameraStatus("Čekám na kameru…");

  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("MediaDevices API není dostupné.");

    state.stream = await requestCameraStream();
    state.track = state.stream.getVideoTracks()[0];
    state.captureProfile = await selectBestCaptureProfile(state.track);
    state.capabilities = getCapabilities(state.track);

    const settings = state.track.getSettings();
    if (settings.deviceId) localStorage.setItem(SAVED_DEVICE_KEY, settings.deviceId);

    elements.video.srcObject = state.stream;
    await elements.video.play();
    await waitForMetadata();

    initialiseCaptureSurface();
    elements.videoStage.style.aspectRatio = `${elements.video.videoWidth} / ${elements.video.videoHeight}`;
    initialiseDefaultRoi();
    clearProcessingState();
    renderCaptureMode(state.captureProfile);
    renderCameraControls();
    updateDiagnostics();
    startProcessingLoop();
    observePreviewSize();

    elements.videoPlaceholder.hidden = true;
    setCameraStatus(state.track.label || "Kamera běží", "running");
    setRunningControls(true);
  } catch (error) {
    console.error(error);
    stopCamera();
    setCameraStatus(
      error?.name === "NotAllowedError" ? "Přístup ke kameře byl zamítnut." : `Chyba: ${error.message}`,
      "error",
    );
  }
}

export function stopCamera() {
  stopProcessing();
  state.resizeObserver?.disconnect();
  state.resizeObserver = null;
  state.stream?.getTracks().forEach((track) => track.stop());
  Object.assign(state, {
    stream: null,
    track: null,
    capabilities: {},
    captureProfile: null,
    roi: null,
    dragStart: null,
    spectrumHistory: [],
    averagedSpectrum: null,
  });

  elements.video.srcObject = null;
  elements.videoPlaceholder.hidden = false;
  elements.frameStatus.textContent = "–";
  elements.settingsOutput.textContent = "–";
  elements.capabilitiesOutput.textContent = "–";
  elements.cameraControls.innerHTML = '<p class="hint">Nastavení se načte po spuštění kamery.</p>';
  elements.controlStatus.textContent = "";
  elements.roiOutput.textContent = "ROI: –";
  elements.peakOutput.textContent = "Maximum: –";
  resetCaptureMode();
  setCameraStatus("Kamera není spuštěna");
  setRunningControls(false);
  clearOverlay();
  drawEmptyPlot();
}

function renderCameraControls() {
  elements.cameraControls.replaceChildren();
  const settings = state.track.getSettings();
  let count = 0;

  for (const [name, label] of MODE_CONTROLS) {
    const options = state.capabilities[name];
    if (!Array.isArray(options) || !options.length) continue;
    elements.cameraControls.append(createModeControl(name, label, options, settings[name]));
    count += 1;
  }

  for (const [name, label] of NUMERIC_CONTROLS) {
    const capability = state.capabilities[name];
    if (!capability || typeof capability.min !== "number" || typeof capability.max !== "number") continue;
    elements.cameraControls.append(createNumericControl(name, label, capability, settings[name]));
    count += 1;
  }

  if (!count) {
    elements.cameraControls.innerHTML = '<p class="hint">Prohlížeč nezpřístupnil žádné nastavitelné parametry.</p>';
  }
  setRunningControls(true);
}

function createModeControl(name, labelText, options, value) {
  const row = document.createElement("div");
  row.className = "camera-control";
  const label = document.createElement("label");
  label.htmlFor = `control-${name}`;
  label.textContent = labelText;
  const select = document.createElement("select");
  select.id = `control-${name}`;
  select.dataset.cameraControl = name;
  for (const optionValue of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = ({ manual: "Ruční", continuous: "Automatický", none: "Vypnuto" })[optionValue] ?? optionValue;
    select.append(option);
  }
  if (options.includes(value)) select.value = value;
  select.addEventListener("change", () => applyTrackConstraint(name, select.value));
  row.append(label, select);
  return row;
}

function createNumericControl(name, labelText, capability, value) {
  const row = document.createElement("div");
  row.className = "camera-control";
  const label = document.createElement("label");
  label.htmlFor = `control-${name}`;
  label.textContent = labelText;
  const range = document.createElement("input");
  Object.assign(range, {
    id: `control-${name}`,
    type: "range",
    min: String(capability.min),
    max: String(capability.max),
    step: String(capability.step ?? 1),
    value: String(value ?? capability.min),
  });
  range.dataset.cameraControl = name;
  const number = document.createElement("input");
  Object.assign(number, { type: "number", min: range.min, max: range.max, step: range.step, value: range.value });
  range.addEventListener("input", () => { number.value = range.value; });
  range.addEventListener("change", () => applyTrackConstraint(name, Number(range.value)));
  number.addEventListener("change", () => {
    const next = clamp(toFiniteNumber(number.value, Number(range.value)), Number(range.min), Number(range.max));
    range.value = number.value = String(next);
    applyTrackConstraint(name, next);
  });
  row.append(label, range, number);
  return row;
}

async function applyTrackConstraint(name, value) {
  const sequence = ++state.controlApplySequence;
  setControlStatus(`Nastavuji ${name}…`);
  try {
    await state.track.applyConstraints({ advanced: [{ [name]: value }] });
    if (sequence !== state.controlApplySequence) return;
    updateDiagnostics();
    syncControlValues();
    setControlStatus(`${name}: ${value}`);
  } catch (error) {
    console.error(error);
    setControlStatus(`Nelze nastavit ${name}: ${error.message}`, true);
    updateDiagnostics();
    syncControlValues();
  }
}

export async function enableManualModes() {
  if (!state.track) return;
  const constraints = {};
  if (state.capabilities.exposureMode?.includes("manual")) constraints.exposureMode = "manual";
  if (state.capabilities.whiteBalanceMode?.includes("manual")) constraints.whiteBalanceMode = "manual";
  elements.manualModeButton.disabled = true;
  setControlStatus("Přepínám na ruční režim…");
  try {
    await state.track.applyConstraints({ advanced: [constraints] });
    updateDiagnostics();
    syncControlValues();
    setControlStatus("Ruční režim je aktivní.");
  } catch (error) {
    setControlStatus(`Ruční režim nelze nastavit: ${error.message}`, true);
  } finally {
    setRunningControls(true);
  }
}

function syncControlValues() {
  const settings = state.track?.getSettings() ?? {};
  for (const input of elements.cameraControls.querySelectorAll("[data-camera-control]")) {
    const value = settings[input.dataset.cameraControl];
    if (value === undefined) continue;
    input.value = String(value);
    if (input.type === "range" && input.nextElementSibling?.type === "number") {
      input.nextElementSibling.value = String(value);
    }
  }
}

export function updateDiagnostics() {
  if (!state.track) return;
  elements.settingsOutput.textContent = JSON.stringify(state.track.getSettings(), null, 2);
  elements.capabilitiesOutput.textContent = JSON.stringify(state.capabilities, null, 2);
}
