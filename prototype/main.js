import {installExposureOptimizer} from "./exposure-optimizer.js";
import {cameraOperations} from "./camera-operations.js";
import {events} from "./events.js";
import { elements, state, setRunningControls, setCameraStatus } from "./core.js";
import { startCamera, stopCamera } from "./camera.js";
import { installImageSettingsControls } from "./image-settings.js";
import { installInstrumentProfiles } from "./instrument-profiles.js";
import { installUPlotSpectrum } from "./uplot-spectrum.js";
import { installExposureDiagnostics } from "./exposure-diagnostics.js";
import {
  beginRoiDrag,
  cancelRoiDrag,
  confirmCalibration,
  captureDarkSpectrum,
  clearDarkSpectrum,
  drawPlot,
  endRoiDrag,
  exportCsv,
  initialiseDefaultRoi,
  resizeOverlay,
  saveFrame,
  trimSpectrumHistory,
  updateRoiDrag,
  useRoiWidthForCalibration,
} from "./spectrum.js";

function bindEvents() {
  elements.startButton.addEventListener("click", startCamera);
  elements.stopButton.addEventListener("click", stopCamera);
  elements.captureDarkButton.addEventListener("click", captureDarkSpectrum);
  elements.clearDarkButton.addEventListener("click", clearDarkSpectrum);
  elements.useRoiWidthButton.addEventListener("click", useRoiWidthForCalibration);
  elements.exportCsvButton.addEventListener("click", exportCsv);
  elements.saveFrameButton.addEventListener("click", saveFrame);
  elements.overlayCanvas.addEventListener("pointerdown", beginRoiDrag);
  elements.overlayCanvas.addEventListener("pointermove", updateRoiDrag);
  elements.overlayCanvas.addEventListener("pointerup", endRoiDrag);
  elements.overlayCanvas.addEventListener("pointercancel", cancelRoiDrag);
  elements.overlayCanvas.addEventListener("dblclick", () => {if (!cameraOperations.active) initialiseDefaultRoi();});
  elements.overlayCanvas.addEventListener("lostpointercapture", cancelRoiDrag);
  elements.applyCalibrationButton.addEventListener("click", confirmCalibration);

  for (const input of [
    elements.showLuminance,
    elements.showRed,
    elements.showGreen,
    elements.showBlue,
    elements.subtractDark,
    elements.pixel1,
    elements.pixel2,
    elements.wavelength1,
    elements.wavelength2,
  ]) {
    input.addEventListener("input", drawPlot);
  }

  elements.averageFrames.addEventListener("change", trimSpectrumHistory);
  window.addEventListener("resize", () => {
    resizeOverlay();
    drawPlot();
  });
  window.addEventListener("beforeunload", stopCamera);
  elements.video.addEventListener("resize", () => {
    if (state.measurementReady && (elements.video.videoWidth !== elements.captureCanvas.width || elements.video.videoHeight !== elements.captureCanvas.height)) {
      stopCamera(); setCameraStatus("Rozlišení kamery se změnilo. Spusťte kameru znovu.","error");
    }
  });
  events.addEventListener("capture-error",event => {stopCamera(); setCameraStatus(event.detail.message,"error");});
}

await installInstrumentProfiles();
installUPlotSpectrum();
installExposureDiagnostics();
installExposureOptimizer();
installImageSettingsControls();
bindEvents();
setRunningControls(false);
drawPlot();