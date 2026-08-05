import { elements, state } from "./core.js";

let observedTrack = null;
let startedForTrack = false;
let timer = null;

function cameraReadyForOptimisation() {
  return Boolean(
    state.track
    && state.roi
    && state.capabilities.exposureTime
    && elements.video.videoWidth
    && elements.video.videoHeight
    && !elements.autoModeButton.disabled,
  );
}

function poll() {
  if (state.track !== observedTrack) {
    observedTrack = state.track;
    startedForTrack = false;
  }

  if (!startedForTrack && cameraReadyForOptimisation()) {
    startedForTrack = true;
    window.setTimeout(() => {
      if (state.track === observedTrack) elements.autoModeButton.click();
    }, 250);
  }
}

export function installSoftwareAutoStart() {
  timer = window.setInterval(poll, 150);
  window.addEventListener("beforeunload", () => window.clearInterval(timer));
}
