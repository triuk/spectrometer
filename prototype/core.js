export const elements = {
  processingInterval: document.querySelector("#processingInterval"),
  startButton: document.querySelector("#startButton"),
  stopButton: document.querySelector("#stopButton"),
  cameraStatus: document.querySelector("#cameraStatus"),
  frameStatus: document.querySelector("#frameStatus"),
  captureModeStatus: document.querySelector("#captureModeStatus"),
  captureModeBadge: document.querySelector("#captureModeBadge"),
  captureCameraName: document.querySelector("#captureCameraName"),
  captureResolution: document.querySelector("#captureResolution"),
  captureFrameRate: document.querySelector("#captureFrameRate"),
  captureFormat: document.querySelector("#captureFormat"),
  autoModeButton: document.querySelector("#autoModeButton"),
  manualModeButton: document.querySelector("#manualModeButton"),
  cameraControlsDetails: document.querySelector("#cameraControlsDetails"),
  imageSettingsState: document.querySelector("#imageSettingsState"),
  cameraControls: document.querySelector("#cameraControls"),
  controlStatus: document.querySelector("#controlStatus"),
  averageFrames: document.querySelector("#averageFrames"),
  showLuminance: document.querySelector("#showLuminance"),
  showRed: document.querySelector("#showRed"),
  showGreen: document.querySelector("#showGreen"),
  showBlue: document.querySelector("#showBlue"),
  subtractDark: document.querySelector("#subtractDark"),
  captureDarkButton: document.querySelector("#captureDarkButton"),
  clearDarkButton: document.querySelector("#clearDarkButton"),
  darkStatus: document.querySelector("#darkStatus"),
  pixel1: document.querySelector("#pixel1"),
  wavelength1: document.querySelector("#wavelength1"),
  pixel2: document.querySelector("#pixel2"),
  wavelength2: document.querySelector("#wavelength2"),
  useRoiWidthButton: document.querySelector("#useRoiWidthButton"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  saveFrameButton: document.querySelector("#saveFrameButton"),
  video: document.querySelector("#video"),
  videoStage: document.querySelector("#videoStage"),
  videoPlaceholder: document.querySelector("#videoPlaceholder"),
  overlayCanvas: document.querySelector("#overlayCanvas"),
  captureCanvas: document.querySelector("#captureCanvas"),
  plotCanvas: document.querySelector("#plotCanvas"),
  roiOutput: document.querySelector("#roiOutput"),
  peakOutput: document.querySelector("#peakOutput"),
  settingsOutput: document.querySelector("#settingsOutput"),
  capabilitiesOutput: document.querySelector("#capabilitiesOutput"),
};

export const state = {
  stream: null,
  track: null,
  capabilities: {},
  captureProfile: null,
  instrumentProfile: null,
  processingTimer: null,
  resizeObserver: null,
  roi: null,
  dragStart: null,
  spectrumHistory: [],
  averagedSpectrum: null,
  darkSpectrum: null,
  controlApplySequence: 0,
};

export const overlayContext = elements.overlayCanvas.getContext("2d");
export const captureContext = elements.captureCanvas.getContext("2d", { willReadFrequently: true });
export const plotContext = elements.plotCanvas.getContext("2d");

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function setCameraStatus(text, kind = "idle") {
  elements.cameraStatus.textContent = text;

  if (kind === "error") {
    elements.captureModeStatus.className = "capture-mode capture-mode-error";
    elements.captureModeBadge.textContent = "Chyba";
    elements.captureModeStatus.setAttribute("aria-label", text);
    return;
  }

  if (!state.track && kind === "idle") {
    const starting = text !== "Kamera není spuštěna";
    elements.captureModeStatus.className = "capture-mode capture-mode-idle";
    elements.captureModeBadge.textContent = starting ? "Spouštím…" : "Čeká";
    elements.captureModeStatus.setAttribute("aria-label", text);
  }
}

export function setControlStatus(text, isError = false) {
  elements.controlStatus.textContent = text;
  elements.controlStatus.classList.toggle("control-error", isError);
}

export function setRunningControls(running) {
  elements.startButton.disabled = running;
  elements.stopButton.disabled = !running;
  elements.autoModeButton.disabled = !running;
  elements.manualModeButton.disabled = !running;
  elements.captureDarkButton.disabled = !running || !state.averagedSpectrum;
  elements.exportCsvButton.disabled = !running || !state.averagedSpectrum;
  elements.saveFrameButton.disabled = !running;
}
