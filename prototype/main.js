import "./constraints-compat.js";
import "./image-settings-style.js";
import { installAutoReadoutClarity } from "./auto-readout-clarity.js";
import { elements, setRunningControls } from "./core.js";
import { startCamera, stopCamera } from "./camera.js";
import { installCaptureStatusCorrection } from "./capture-status.js";
import { installImageSettingsControls } from "./image-settings.js";
import {
  beginRoiDrag,
  captureDarkSpectrum,
  clearDarkSpectrum,
  drawEmptyPlot,
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
  elements.overlayCanvas.addEventListener("pointercancel", endRoiDrag);
  elements.overlayCanvas.addEventListener("dblclick", initialiseDefaultRoi);

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
}

installCaptureStatusCorrection();
installImageSettingsControls();
installAutoReadoutClarity();
bindEvents();
setRunningControls(false);
drawEmptyPlot();
