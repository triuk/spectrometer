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

const CHANNELS = ["red", "green", "blue", "luminance"];

function sensorWidth() {
  return elements.video.videoWidth
    || Number(state.instrumentProfile?.camera?.width)
    || elements.captureCanvas.width
    || 0;
}

function sensorHeight() {
  return elements.video.videoHeight
    || Number(state.instrumentProfile?.camera?.height)
    || elements.captureCanvas.height
    || 0;
}

function sensorXFlipped() {
  return state.instrumentProfile?.sensorOrientation?.flipX !== false;
}

function updatePreviewOrientation() {
  elements.video.classList.toggle("spectrum-flip-x", sensorXFlipped());
}

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
  state.roi = { x: 0, y: Math.round((height - roiHeight) / 2), width, height: roiHeight };
  state.spectrumHistory = [];
  state.averagedSpectrum = null;
  if (state.darkSpectrum) clearDarkSpectrum();
  if (!state.instrumentProfile) {
    elements.pixel1.value = "0";
    elements.pixel2.value = String(width - 1);
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
  if (!state.roi || !elements.video.videoWidth) return;
  const shown = displayedVideoRect();
  const scaleX = shown.width / elements.video.videoWidth;
  const scaleY = shown.height / elements.video.videoHeight;
  const x = shown.x + state.roi.x * scaleX;
  const y = shown.y + state.roi.y * scaleY;
  const width = state.roi.width * scaleX;
  const height = state.roi.height * scaleY;
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
  return {
    // Náhled je orientovaný stejně jako spektrum, proto je X přímo kanonický
    // spektrální pixel. Převod na raw X kamery se děje až při čtení obrazu.
    x: clamp(Math.round(((canvasX - shown.x) / shown.width) * elements.video.videoWidth), 0, elements.video.videoWidth - 1),
    y: clamp(Math.round(((canvasY - shown.y) / shown.height) * elements.video.videoHeight), 0, elements.video.videoHeight - 1),
  };
}

export function beginRoiDrag(event) {
  if (!state.track) return;
  elements.overlayCanvas.setPointerCapture(event.pointerId);
  state.dragStart = pointerToVideo(event);
}

export function updateRoiDrag(event) {
  if (!state.dragStart) return;
  const point = pointerToVideo(event);
  const x = Math.min(state.dragStart.x, point.x);
  const y = Math.min(state.dragStart.y, point.y);
  state.roi = normaliseRoi({
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
  state.dragStart = null;
  state.spectrumHistory = [];
  state.averagedSpectrum = null;
  if (state.darkSpectrum) clearDarkSpectrum();
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

export function rawRoiFromSpectral(source = state.roi) {
  const width = sensorWidth();
  const height = sensorHeight();
  if (!source || !width || !height) return null;

  const spectralX = clamp(Math.round(Number(source.x)), 0, width - 1);
  const y = clamp(Math.round(Number(source.y)), 0, height - 1);
  const roiWidth = clamp(Math.round(Number(source.width)), 1, width - spectralX);
  const roiHeight = clamp(Math.round(Number(source.height)), 1, height - y);
  const rawX = sensorXFlipped() ? width - spectralX - roiWidth : spectralX;

  return {
    x: clamp(rawX, 0, width - roiWidth),
    y,
    width: roiWidth,
    height: roiHeight,
  };
}

function updateRoiOutput() {
  if (!state.roi) return;
  const { x, y, width, height } = state.roi;
  elements.roiOutput.textContent = `ROI: x ${x}, y ${y}, ${width} × ${height}`;
}

export function stopProcessing() {
  if (state.processingTimer !== null) window.clearTimeout(state.processingTimer);
  state.processingTimer = null;
}

export function clearProcessingState() {
  state.spectrumHistory = [];
  state.averagedSpectrum = null;
  elements.peakOutput.textContent = "Maximum: –";
  drawEmptyPlot();
}

export function startProcessingLoop() {
  const run = () => {
    processFrame();
    const delay = clamp(toFiniteNumber(elements.processingInterval.value, 200), 50, 5000);
    state.processingTimer = window.setTimeout(run, delay);
  };
  run();
}

function processFrame() {
  if (!state.track || !state.roi || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const started = performance.now();
  captureContext.drawImage(elements.video, 0, 0, elements.captureCanvas.width, elements.captureCanvas.height);
  state.spectrumHistory.push(extractSpectrum(state.roi));
  trimSpectrumHistory();
  state.averagedSpectrum = averageHistory();
  drawPlot();
  const settings = state.track.getSettings();
  elements.frameStatus.textContent = `${settings.width ?? elements.video.videoWidth} × ${settings.height ?? elements.video.videoHeight} · ${settings.frameRate ?? "?"} fps · výpočet ${(performance.now() - started).toFixed(1)} ms`;
  setRunningControls(true);
}

function extractSpectrum(roi) {
  const rawRoi = rawRoiFromSpectral(roi);
  if (!rawRoi) return Object.fromEntries(CHANNELS.map((name) => [name, new Float32Array(0)]));

  const image = captureContext.getImageData(rawRoi.x, rawRoi.y, rawRoi.width, rawRoi.height);
  const result = Object.fromEntries(CHANNELS.map((name) => [name, new Float32Array(rawRoi.width)]));
  const flip = sensorXFlipped();

  for (let y = 0; y < rawRoi.height; y += 1) {
    for (let rawX = 0; rawX < rawRoi.width; rawX += 1) {
      const offset = (y * rawRoi.width + rawX) * 4;
      const outputX = flip ? rawRoi.width - 1 - rawX : rawX;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      result.red[outputX] += r;
      result.green[outputX] += g;
      result.blue[outputX] += b;
      result.luminance[outputX] += 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  for (const values of Object.values(result)) {
    for (let x = 0; x < values.length; x += 1) values[x] /= rawRoi.height;
  }
  return result;
}

export function trimSpectrumHistory() {
  const target = clamp(Math.round(toFiniteNumber(elements.averageFrames.value, 8)), 1, 64);
  elements.averageFrames.value = String(target);
  while (state.spectrumHistory.length > target) state.spectrumHistory.shift();
}

function averageHistory() {
  if (!state.spectrumHistory.length) return null;
  const width = state.spectrumHistory[0].luminance.length;
  const result = Object.fromEntries(CHANNELS.map((name) => [name, new Float32Array(width)]));
  for (const spectrum of state.spectrumHistory) {
    for (const name of CHANNELS) {
      for (let x = 0; x < width; x += 1) result[name][x] += spectrum[name][x];
    }
  }
  for (const values of Object.values(result)) {
    for (let x = 0; x < width; x += 1) values[x] /= state.spectrumHistory.length;
  }
  return result;
}

function processedSpectrum() {
  if (!state.averagedSpectrum) return null;
  const subtract = elements.subtractDark.checked
    && state.darkSpectrum
    && state.darkSpectrum.luminance.length === state.averagedSpectrum.luminance.length;
  if (!subtract) return state.averagedSpectrum;
  const result = {};
  for (const name of CHANNELS) {
    result[name] = Float32Array.from(state.averagedSpectrum[name], (value, index) => Math.max(0, value - state.darkSpectrum[name][index]));
  }
  return result;
}

export function captureDarkSpectrum() {
  if (!state.averagedSpectrum) return;
  state.darkSpectrum = Object.fromEntries(CHANNELS.map((name) => [name, new Float32Array(state.averagedSpectrum[name])]));
  elements.clearDarkButton.disabled = false;
  elements.darkStatus.textContent = `Tmavé spektrum zachyceno z ${state.spectrumHistory.length} snímků.`;
  drawPlot();
}

export function clearDarkSpectrum() {
  state.darkSpectrum = null;
  elements.clearDarkButton.disabled = true;
  elements.darkStatus.textContent = "Tmavé spektrum není zachyceno.";
  drawPlot();
}

export function spectralSensorPixel(roiPixel) {
  return (state.roi?.x ?? 0) + roiPixel;
}

export function rawSensorPixel(roiPixel) {
  const spectral = spectralSensorPixel(roiPixel);
  const width = sensorWidth();
  return sensorXFlipped() && width > 0 ? width - 1 - spectral : spectral;
}

function calibration() {
  const p1 = toFiniteNumber(elements.pixel1.value, 0);
  const p2 = toFiniteNumber(elements.pixel2.value, 1);
  const w1 = toFiniteNumber(elements.wavelength1.value, 400);
  const w2 = toFiniteNumber(elements.wavelength2.value, 700);
  if (p1 === p2) return null;
  const slope = (w2 - w1) / (p2 - p1);
  return {
    coordinateSystem: "spectral-sensor",
    pixel1: p1,
    pixel2: p2,
    wavelength1: w1,
    wavelength2: w2,
    slope,
    intercept: w1 - slope * p1,
  };
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
  elements.pixel1.value = String(state.roi.x);
  elements.pixel2.value = String(state.roi.x + state.roi.width - 1);
  drawPlot();
}

export function exportCsv() {
  const spectrum = processedSpectrum();
  if (!spectrum || !state.roi) return;
  const metadata = {
    exportedAt: new Date().toISOString(),
    instrumentProfile: state.instrumentProfile ? { id: state.instrumentProfile.id, name: state.instrumentProfile.name } : null,
    cameraLabel: state.track?.label ?? "",
    cameraSettings: state.track?.getSettings() ?? {},
    roi: { ...state.roi, coordinateSystem: "spectral" },
    sensorOrientation: { flipX: sensorXFlipped() },
    averagedFrames: state.spectrumHistory.length,
    darkSubtraction: Boolean(elements.subtractDark.checked && state.darkSpectrum),
    calibration: calibration(),
  };
  const lines = [`# metadata=${JSON.stringify(metadata)}`, "roi_pixel,sensor_pixel,raw_sensor_pixel,wavelength_nm,red,green,blue,luminance"];
  for (let i = 0; i < spectrum.luminance.length; i += 1) {
    const nm = wavelength(i);
    lines.push([
      i,
      spectralSensorPixel(i),
      rawSensorPixel(i),
      nm === null ? "" : nm.toFixed(6),
      ...CHANNELS.map((name) => spectrum[name][i].toFixed(6)),
    ].join(","));
  }
  download(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), `spectrum-${timestamp()}.csv`);
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
