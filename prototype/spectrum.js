import {
  captureContext,
  clamp,
  elements,
  overlayContext,
  plotContext,
  setRunningControls,
  state,
  toFiniteNumber,
} from "./core.js";

import {CHANNELS, rawToSpectralPixel, linearCalibration, extractSpectrum as extractPixels, averageSpectra, subtractSpectrum, calibrationMatchesMode, spectrumCsv} from "./spectrum-model.js";
import {measurementKey} from "./measurement-context.js";
import {cameraOperations} from "./camera-operations.js";
import {waitForVideoFrame} from "./video-frames.js";
import {publish} from "./events.js";
let processingController = null;

export function initialiseCaptureSurface() {
  elements.captureCanvas.width = elements.video.videoWidth;
  elements.captureCanvas.height = elements.video.videoHeight;
  updatePreviewOrientation();
}

export function initialiseDefaultRoi() {
  if (!elements.video.videoWidth) return;
  const width = elements.video.videoWidth;
  const height = elements.video.videoHeight;
  const roiHeight = Math.max(8, Math.round(height * 0.08));
  setRoi({x:0, y:Math.round((height-roiHeight)/2), width, height:roiHeight});
  if (!state.instrumentProfile) {
    const first = spectralSensorPixel(0);
    const last = spectralSensorPixel(width - 1);
    elements.pixel1.value = String(Math.min(first, last));
    elements.pixel2.value = String(Math.max(first, last));
  }
  updateRoiOutput();
  drawOverlay();
}

export function observePreviewSize() {
  state.resizeObserver = new ResizeObserver(resizeOverlay);
  state.resizeObserver.observe(elements.videoStage);
  resizeOverlay();
}

export function resizeOverlay() {
  updatePreviewOrientation();
  const rect = elements.videoStage.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  elements.overlayCanvas.width = Math.max(1, Math.round(rect.width * ratio));
  elements.overlayCanvas.height = Math.max(1, Math.round(rect.height * ratio));
  updateRoiOutput();
  drawOverlay();
}

function displayedVideoRect() {
  const canvasWidth = elements.overlayCanvas.width;
  const canvasHeight = elements.overlayCanvas.height;
  const videoWidth = elements.video.videoWidth;
  const videoHeight = elements.video.videoHeight;
  if (!videoWidth || !videoHeight) return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  const scale = Math.min(canvasWidth / videoWidth, canvasHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return { x: (canvasWidth - width) / 2, y: (canvasHeight - height) / 2, width, height };
}

export function clearOverlay() {
  overlayContext.clearRect(0, 0, elements.overlayCanvas.width, elements.overlayCanvas.height);
}

function drawOverlay() {
  clearOverlay();
  updatePreviewOrientation();
  const roi = state.pendingRoi ?? state.roi;
  if (!roi || !elements.video.videoWidth) return;
  const shown = displayedVideoRect();
  const scaleX = shown.width / elements.video.videoWidth;
  const scaleY = shown.height / elements.video.videoHeight;
  const displayX = sensorXFlipped()
    ? elements.video.videoWidth - roi.x - roi.width
    : roi.x;
  const x = shown.x + displayX * scaleX;
  const y = shown.y + roi.y * scaleY;
  const width = roi.width * scaleX;
  const height = roi.height * scaleY;
  overlayContext.save();
  overlayContext.fillStyle = "rgba(83, 200, 255, 0.14)";
  overlayContext.strokeStyle = "rgba(83, 200, 255, 0.95)";
  overlayContext.lineWidth = Math.max(2, window.devicePixelRatio || 1);
  overlayContext.setLineDash([8, 5]);
  overlayContext.fillRect(x, y, width, height);
  overlayContext.strokeRect(x, y, width, height);
  overlayContext.restore();
}

function pointerToVideo(event) {
  const rect = elements.overlayCanvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const shown = displayedVideoRect();
  const canvasX = (event.clientX - rect.left) * ratio;
  const canvasY = (event.clientY - rect.top) * ratio;
  const displayX = clamp(
    Math.round(((canvasX - shown.x) / shown.width) * elements.video.videoWidth),
    0,
    elements.video.videoWidth - 1,
  );
  return {
    x: sensorXFlipped() ? elements.video.videoWidth - 1 - displayX : displayX,
    y: clamp(Math.round(((canvasY - shown.y) / shown.height) * elements.video.videoHeight), 0, elements.video.videoHeight - 1),
  };
}

export function beginRoiDrag(event) {
  if (!state.measurementReady || cameraOperations.active) return;
  elements.overlayCanvas.setPointerCapture(event.pointerId);
  state.dragStart = pointerToVideo(event);
  state.pendingRoi = {...state.roi};
  setRunningControls();
}

export function updateRoiDrag(event) {
  if (!state.dragStart) return;
  const point = pointerToVideo(event);
  const x = Math.min(state.dragStart.x, point.x);
  const y = Math.min(state.dragStart.y, point.y);
  state.pendingRoi = normaliseRoi({
    x,
    y,
    width: Math.abs(point.x - state.dragStart.x) + 1,
    height: Math.abs(point.y - state.dragStart.y) + 1,
  });
  updateRoiOutput();
  drawOverlay();
}

export function endRoiDrag(event) {
  if (!state.dragStart) return;
  updateRoiDrag(event);
  const roi = state.pendingRoi;
  state.dragStart = null;
  state.pendingRoi = null;
  setRoi(roi);
}
export function cancelRoiDrag() {
  state.dragStart = null;
  state.pendingRoi = null;
  updateRoiOutput(); drawOverlay(); setRunningControls();
}
export function setRoi(roi) {
  state.roi = normaliseRoi(roi);
  invalidateMeasurement("ROI byla změněna.");
  updateRoiOutput(); drawOverlay();
}

function normaliseRoi(roi) {
  const maxWidth = elements.video.videoWidth;
  const maxHeight = elements.video.videoHeight;
  const x = clamp(Math.round(roi.x), 0, maxWidth - 1);
  const y = clamp(Math.round(roi.y), 0, maxHeight - 1);
  return {
    x,
    y,
    width: clamp(Math.round(roi.width), 1, maxWidth - x),
    height: clamp(Math.round(roi.height), 1, maxHeight - y),
  };
}

function updateRoiOutput() {
  const roi = state.pendingRoi ?? state.roi;
  if (!roi) return;
  const displayX = sensorXFlipped() && sensorWidth() > 0 ? sensorWidth()-roi.x-roi.width : roi.x;
  elements.roiOutput.textContent = `ROI: x ${displayX}, y ${roi.y}, ${roi.width} × ${roi.height}`;
}

export function stopProcessing() {
  processingController?.abort(); processingController = null;
}
export function clearProcessingState() {
  state.spectrumHistory = [];
  state.averagedSpectrum = null;
  state.measurementKey = null;
  state.measurementSnapshot = null;
  elements.peakOutput.textContent = "Maximum: –";
  drawPlot(); setRunningControls();
}
export function invalidateMeasurement(reason = "Podmínky měření byly změněny.") {
  clearProcessingState();
  if (state.darkSpectrum) clearDarkSpectrum();
  publish("measurement-invalidated",reason);
}
export function captureConditions() {
  return {
    session:state.session,
    instrumentProfile:state.instrumentProfile ? {id:state.instrumentProfile.id,name:state.instrumentProfile.name} : null,
    cameraLabel:state.track?.label ?? "",
    cameraSettings:{...state.track?.getSettings()},
    captureMode:{width:elements.video.videoWidth,height:elements.video.videoHeight},
    roi:state.roi ? {...state.roi} : null,
    sensorOrientation:{flipX:sensorXFlipped()},
  };
}
export function hasValidMeasurement() {
  if (!state.measurementReady || cameraOperations.active || state.dragStart || !state.averagedSpectrum || !state.roi) return false;
  if (measurementKey(captureConditions()) !== state.measurementKey) {
    invalidateMeasurement(); return false;
  }
  return true;
}
export function startProcessingLoop() {
  stopProcessing();
  const controller = new AbortController();
  processingController = controller;
  const track = state.track;
  const run = async () => {
    let lastComputed = -Infinity, lastMediaTime = null;
    try {
      while (!controller.signal.aborted && track === state.track) {
        const frame = await waitForVideoFrame(elements.video,{signal:controller.signal,track});
        if (controller.signal.aborted || track !== state.track) break;
        const mediaTime = frame.metadata.mediaTime;
        if (mediaTime !== undefined && mediaTime === lastMediaTime) continue;
        lastMediaTime = mediaTime;
        const delay = clamp(toFiniteNumber(elements.processingInterval.value,200),50,5000);
        if (frame.now-lastComputed < delay) continue;
        if (processFrame(frame)) lastComputed = frame.now;
      }
    } catch (error) {
      if (error.name !== "AbortError" && track === state.track) {
        state.measurementReady = false;
        invalidateMeasurement(error.message);
        publish("capture-error",error);
      }
    }
  };
  void run();
}
function processFrame(frame) {
  if (!state.measurementReady || cameraOperations.active || state.dragStart || !state.roi
      || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
  const started = performance.now();
  const context = captureConditions();
  const key = measurementKey(context);
  if (key !== state.measurementKey) invalidateMeasurement();
  captureContext.drawImage(elements.video,0,0,elements.captureCanvas.width,elements.captureCanvas.height);
  const image = captureContext.getImageData(state.roi.x,state.roi.y,state.roi.width,state.roi.height);
  state.spectrumHistory.push(extractPixels(image.data,state.roi.width,state.roi.height));
  trimSpectrumHistory(false);
  state.averagedSpectrum = averageSpectra(state.spectrumHistory);
  state.measurementKey = key;
  state.measurementSnapshot = {...context,averagedFrames:state.spectrumHistory.length,capturedAt:new Date().toISOString(),mediaTime:frame.metadata.mediaTime};
  drawPlot();
  const settings = context.cameraSettings;
  elements.frameStatus.textContent = `${context.captureMode.width} × ${context.captureMode.height} · ${settings.frameRate ?? "?"} fps · výpočet ${(performance.now()-started).toFixed(1)} ms`;
  setRunningControls();
  return true;
}
export function trimSpectrumHistory(recompute = true) {
  const target = clamp(Math.round(toFiniteNumber(elements.averageFrames.value,8)),1,64);
  elements.averageFrames.value = String(target);
  while (state.spectrumHistory.length > target) state.spectrumHistory.shift();
  if (recompute && state.spectrumHistory.length) {
    state.averagedSpectrum = averageSpectra(state.spectrumHistory);
    if (state.measurementSnapshot) state.measurementSnapshot.averagedFrames = state.spectrumHistory.length;
    drawPlot();
  }
}
export function darkSubtractionActive() {
  return Boolean(elements.subtractDark.checked && state.darkSpectrum && state.darkKey === state.measurementKey);
}
export function processedSpectrum() {
  return darkSubtractionActive() ? subtractSpectrum(state.averagedSpectrum,state.darkSpectrum) : state.averagedSpectrum;
}
export function captureDarkSpectrum() {
  if (!hasValidMeasurement()) return;
  state.darkSpectrum = Object.fromEntries(CHANNELS.map(name=>[name,new Float32Array(state.averagedSpectrum[name])]));
  state.darkKey = state.measurementKey;
  elements.clearDarkButton.disabled = false;
  elements.darkStatus.textContent = `Tmavé spektrum zachyceno z ${state.spectrumHistory.length} snímků.`;
  drawPlot();
}
export function clearDarkSpectrum() {
  state.darkSpectrum = null; state.darkKey = null;
  elements.clearDarkButton.disabled = true;
  elements.darkStatus.textContent = "Tmavé spektrum není zachyceno.";
  drawPlot();
}

function sensorWidth() {
  return elements.video.videoWidth
    || Number(state.instrumentProfile?.camera?.width)
    || elements.captureCanvas.width
    || 0;
}

function sensorXFlipped() {
  return state.instrumentProfile?.sensorOrientation?.flipX !== false;
}

function updatePreviewOrientation() {
  elements.video.classList.toggle("spectrum-flip-x", sensorXFlipped());
}

export function rawSensorPixel(roiPixel) {
  return (state.roi?.x ?? 0) + roiPixel;
}

export function spectralSensorPixel(roiPixel) {
  const raw = rawSensorPixel(roiPixel);
  const width = sensorWidth();
  return rawToSpectralPixel(raw,width,sensorXFlipped() && width>0);
}

export function calibrationPoints() {
  return [
    {pixel:Number(elements.pixel1.value),wavelengthNm:Number(elements.wavelength1.value)},
    {pixel:Number(elements.pixel2.value),wavelengthNm:Number(elements.wavelength2.value)},
  ];
}
export function calibration() {
  const points = calibrationPoints();
  const width = elements.video.videoWidth || state.calibrationCaptureMode?.width;
  const height = elements.video.videoHeight || state.calibrationCaptureMode?.height;
  if (!state.calibrationEnabled || !calibrationMatchesMode({captureMode:state.calibrationCaptureMode},width,height)
      || [elements.pixel1,elements.pixel2,elements.wavelength1,elements.wavelength2].some(input=>input.value.trim()==="")
      || points.some(point=>point.pixel<0 || point.pixel>width-1)) return null;
  const result = linearCalibration(points);
  return result ? {...result,coordinateSystem:sensorXFlipped()?"sensor-x-flipped":"sensor",
    pixel1:points[0].pixel,pixel2:points[1].pixel,wavelength1:points[0].wavelengthNm,wavelength2:points[1].wavelengthNm,
    captureMode:{width,height}} : null;
}
export function confirmCalibration() {
  const width = elements.video.videoWidth || state.instrumentProfile?.camera.width;
  const height = elements.video.videoHeight || state.instrumentProfile?.camera.height;
  const points = calibrationPoints();
  if (!linearCalibration(points) || points.some(point=>point.pixel<0 || point.pixel>width-1)) {
    elements.calibrationStatus.textContent = "Zadejte dva platné odlišné body uvnitř aktuálního senzoru.";
    return;
  }
  state.calibrationCaptureMode = {width,height}; state.calibrationEnabled = true;
  drawPlot();
}
function updateCalibrationStatus() {
  const current = calibration();
  elements.calibrationStatus.textContent = current
    ? `Kalibrace aktivní pro ${current.captureMode.width} × ${current.captureMode.height}.`
    : "Kalibrace není platná pro tento režim. Graf používá pixely; zadejte body a potvrďte kalibraci.";
}

function wavelength(roiPixel) {
  const current = calibration();
  return current ? current.slope * spectralSensorPixel(roiPixel) + current.intercept : null;
}

function displayIsReversed(count) {
  if (count < 2) return false;
  const first = wavelength(0) ?? spectralSensorPixel(0);
  const last = wavelength(count - 1) ?? spectralSensorPixel(count - 1);
  return first > last;
}

function resizePlot() {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(elements.plotCanvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(elements.plotCanvas.clientHeight * ratio));
  if (elements.plotCanvas.width !== width || elements.plotCanvas.height !== height) {
    elements.plotCanvas.width = width;
    elements.plotCanvas.height = height;
  }
}

export function drawEmptyPlot() {
  resizePlot();
  const { width, height } = elements.plotCanvas;
  plotContext.fillStyle = "#080d15";
  plotContext.fillRect(0, 0, width, height);
  plotContext.fillStyle = "#8798ac";
  plotContext.textAlign = "center";
  plotContext.textBaseline = "middle";
  plotContext.font = `${14 * (window.devicePixelRatio || 1)}px system-ui`;
  plotContext.fillText("Spektrum se zobrazí po spuštění kamery.", width / 2, height / 2);
}

export function drawPlot() {
  updateCalibrationStatus();
  const spectrum = processedSpectrum();
  if (!spectrum) return drawEmptyPlot();
  resizePlot();
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = elements.plotCanvas;
  const margin = { left: 52 * ratio, right: 14 * ratio, top: 15 * ratio, bottom: 34 * ratio };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const channels = [
    ["luminance", elements.showLuminance.checked, "#f4f7fb"],
    ["red", elements.showRed.checked, "#ff6969"],
    ["green", elements.showGreen.checked, "#65dc8f"],
    ["blue", elements.showBlue.checked, "#629cff"],
  ].filter(([, visible]) => visible);
  if (!channels.length) channels.push(["luminance", true, "#f4f7fb"]);
  let maximum = 1;
  for (const [name] of channels) for (const value of spectrum[name]) maximum = Math.max(maximum, value);

  plotContext.fillStyle = "#080d15";
  plotContext.fillRect(0, 0, width, height);
  drawGrid(margin, plotWidth, plotHeight, maximum, spectrum.luminance.length, ratio);
  for (const [name, , color] of channels) drawChannel(spectrum[name], color, margin, plotWidth, plotHeight, maximum);
  updatePeak(spectrum.luminance);
}

function drawGrid(margin, plotWidth, plotHeight, maximum, count, ratio) {
  plotContext.save();
  plotContext.strokeStyle = "rgba(151, 169, 189, 0.18)";
  plotContext.fillStyle = "#97a9bd";
  plotContext.lineWidth = ratio;
  plotContext.font = `${11 * ratio}px system-ui`;
  const reversed = displayIsReversed(count);
  for (let i = 0; i <= 5; i += 1) {
    const y = margin.top + plotHeight * (i / 5);
    plotContext.beginPath();
    plotContext.moveTo(margin.left, y);
    plotContext.lineTo(margin.left + plotWidth, y);
    plotContext.stroke();
    plotContext.textAlign = "right";
    plotContext.textBaseline = "middle";
    plotContext.fillText((maximum * (1 - i / 5)).toFixed(0), margin.left - 7 * ratio, y);

    const fraction = i / 5;
    const pixel = Math.round((count - 1) * (reversed ? 1 - fraction : fraction));
    const nm = wavelength(pixel);
    plotContext.textAlign = "center";
    plotContext.textBaseline = "top";
    plotContext.fillText(nm === null ? String(spectralSensorPixel(pixel)) : `${nm.toFixed(0)} nm`, margin.left + plotWidth * fraction, margin.top + plotHeight + 8 * ratio);
  }
  plotContext.restore();
}

function drawChannel(values, color, margin, plotWidth, plotHeight, maximum) {
  if (values.length < 2) return;
  plotContext.save();
  plotContext.strokeStyle = color;
  plotContext.lineWidth = Math.max(1.2, window.devicePixelRatio || 1);
  plotContext.beginPath();
  const reversed = displayIsReversed(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const fraction = (reversed ? values.length - 1 - i : i) / (values.length - 1);
    const x = margin.left + fraction * plotWidth;
    const y = margin.top + (1 - values[i] / maximum) * plotHeight;
    if (!i) plotContext.moveTo(x, y); else plotContext.lineTo(x, y);
  }
  plotContext.stroke();
  plotContext.restore();
}

function updatePeak(values) {
  let peak = 0;
  for (let i = 1; i < values.length; i += 1) if (values[i] > values[peak]) peak = i;
  const nm = wavelength(peak);
  const absolutePixel = spectralSensorPixel(peak);
  elements.peakOutput.textContent = `Maximum: ${nm === null ? `pixel ${absolutePixel}` : `${nm.toFixed(1)} nm`}, ${values[peak].toFixed(1)}`;
}

export function useRoiWidthForCalibration() {
  if (!state.roi) return;
  const first = spectralSensorPixel(0);
  const last = spectralSensorPixel(state.roi.width - 1);
  elements.pixel1.value = String(Math.min(first, last));
  elements.pixel2.value = String(Math.max(first, last));
  drawPlot();
}

export function exportCsv() {
  if (!hasValidMeasurement()) return;
  const spectrum = processedSpectrum();
  const metadata = {...state.measurementSnapshot,exportedAt:new Date().toISOString(),
    darkSubtraction:darkSubtractionActive(),calibration:calibration()};
  download(new Blob([spectrumCsv(spectrum,metadata)],{type:"text/csv;charset=utf-8"}),`spectrum-${timestamp()}.csv`);
}

export function saveFrame() {
  if (!state.track) return;
  const width = elements.video.videoWidth;
  const height = elements.video.videoHeight;
  if (!width || !height) return;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.save();
  if (sensorXFlipped()) {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(elements.video, 0, 0, width, height);
  context.restore();
  canvas.toBlob((blob) => { if (blob) download(blob, `spectrometer-frame-${timestamp()}.png`); }, "image/png");
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}
