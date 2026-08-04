"use strict";

const elements = {
  cameraSelect: document.querySelector("#cameraSelect"),
  refreshDevicesButton: document.querySelector("#refreshDevicesButton"),
  requestedWidth: document.querySelector("#requestedWidth"),
  requestedHeight: document.querySelector("#requestedHeight"),
  requestedFps: document.querySelector("#requestedFps"),
  processingInterval: document.querySelector("#processingInterval"),
  startButton: document.querySelector("#startButton"),
  stopButton: document.querySelector("#stopButton"),
  cameraStatus: document.querySelector("#cameraStatus"),
  frameStatus: document.querySelector("#frameStatus"),
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

const overlayContext = elements.overlayCanvas.getContext("2d");
const captureContext = elements.captureCanvas.getContext("2d", { willReadFrequently: true });
const plotContext = elements.plotCanvas.getContext("2d");

const state = {
  stream: null,
  track: null,
  processingTimer: null,
  resizeObserver: null,
  roi: null,
  dragStart: null,
  spectrumHistory: [],
  averagedSpectrum: null,
  darkSpectrum: null,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function setCameraStatus(text, kind = "idle") {
  elements.cameraStatus.textContent = text;
  elements.cameraStatus.className = `status status-${kind}`;
}

function setRunningControls(running) {
  elements.startButton.disabled = running;
  elements.stopButton.disabled = !running;
  elements.captureDarkButton.disabled = !running || !state.averagedSpectrum;
  elements.exportCsvButton.disabled = !running || !state.averagedSpectrum;
  elements.saveFrameButton.disabled = !running;
}

async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    throw new Error("Prohlížeč nepodporuje MediaDevices API.");
  }

  const currentValue = elements.cameraSelect.value;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");
  elements.cameraSelect.replaceChildren();

  cameras.forEach((camera, index) => {
    const option = document.createElement("option");
    option.value = camera.deviceId;
    option.textContent = camera.label || `Kamera ${index + 1}`;
    elements.cameraSelect.append(option);
  });

  if (currentValue && cameras.some((camera) => camera.deviceId === currentValue)) {
    elements.cameraSelect.value = currentValue;
  } else {
    const preferred = cameras.find((camera) => /USB 2\.0 Camera|USB-ZH/i.test(camera.label));
    if (preferred) {
      elements.cameraSelect.value = preferred.deviceId;
    }
  }

  if (cameras.length === 0) {
    const option = document.createElement("option");
    option.textContent = "Žádná kamera nenalezena";
    option.value = "";
    elements.cameraSelect.append(option);
  }
}

function buildVideoConstraints() {
  const width = Math.max(160, toFiniteNumber(elements.requestedWidth.value, 1920));
  const height = Math.max(120, toFiniteNumber(elements.requestedHeight.value, 1080));
  const frameRate = clamp(toFiniteNumber(elements.requestedFps.value, 5), 1, 60);
  const deviceId = elements.cameraSelect.value;

  return {
    audio: false,
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: frameRate },
    },
  };
}

async function startCamera() {
  stopCamera();
  setCameraStatus("Žádám o přístup ke kameře…", "idle");

  try {
    state.stream = await navigator.mediaDevices.getUserMedia(buildVideoConstraints());
    state.track = state.stream.getVideoTracks()[0];
    elements.video.srcObject = state.stream;
    await elements.video.play();
    await waitForVideoMetadata();

    initialiseCaptureSurface();
    elements.videoStage.style.aspectRatio = `${elements.video.videoWidth} / ${elements.video.videoHeight}`;
    initialiseDefaultRoi();
    updateDiagnostics();
    clearProcessingState();
    startProcessingLoop();
    observePreviewSize();
    await listCameras();

    elements.videoPlaceholder.hidden = true;
    setCameraStatus("Kamera běží", "running");
    setRunningControls(true);
  } catch (error) {
    console.error(error);
    stopCamera();
    setCameraStatus(`Chyba: ${error.message}`, "error");
  }
}

function waitForVideoMetadata() {
  if (elements.video.videoWidth > 0 && elements.video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    elements.video.addEventListener("loadedmetadata", resolve, { once: true });
  });
}

function stopCamera() {
  if (state.processingTimer !== null) {
    window.clearTimeout(state.processingTimer);
    state.processingTimer = null;
  }

  state.resizeObserver?.disconnect();
  state.resizeObserver = null;
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  state.track = null;
  elements.video.srcObject = null;
  elements.videoPlaceholder.hidden = false;
  elements.frameStatus.textContent = "–";
  elements.settingsOutput.textContent = "–";
  elements.capabilitiesOutput.textContent = "–";
  setCameraStatus("Kamera není spuštěna", "idle");
  setRunningControls(false);
  clearOverlay();
}

function initialiseCaptureSurface() {
  elements.captureCanvas.width = elements.video.videoWidth;
  elements.captureCanvas.height = elements.video.videoHeight;
}

function initialiseDefaultRoi() {
  const width = elements.video.videoWidth;
  const height = elements.video.videoHeight;
  const roiHeight = Math.max(8, Math.round(height * 0.08));

  state.spectrumHistory = [];
  state.averagedSpectrum = null;
  if (state.darkSpectrum) {
    clearDarkSpectrum();
  }

  state.roi = {
    x: 0,
    y: Math.round((height - roiHeight) / 2),
    width,
    height: roiHeight,
  };

  elements.pixel1.value = "0";
  elements.pixel2.value = String(Math.max(1, width - 1));
  updateRoiOutput();
  drawOverlay();
}

function observePreviewSize() {
  state.resizeObserver = new ResizeObserver(() => resizeOverlay());
  state.resizeObserver.observe(elements.videoStage);
  resizeOverlay();
}

function resizeOverlay() {
  const rect = elements.video.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  elements.overlayCanvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
  elements.overlayCanvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
  drawOverlay();
}

function clearOverlay() {
  overlayContext.clearRect(0, 0, elements.overlayCanvas.width, elements.overlayCanvas.height);
}

function drawOverlay() {
  clearOverlay();
  if (!state.roi || elements.video.videoWidth === 0) {
    return;
  }

  const scaleX = elements.overlayCanvas.width / elements.video.videoWidth;
  const scaleY = elements.overlayCanvas.height / elements.video.videoHeight;
  const x = state.roi.x * scaleX;
  const y = state.roi.y * scaleY;
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

function pointToVideoCoordinates(event) {
  const rect = elements.overlayCanvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * elements.video.videoWidth;
  const y = ((event.clientY - rect.top) / rect.height) * elements.video.videoHeight;

  return {
    x: clamp(Math.round(x), 0, Math.max(0, elements.video.videoWidth - 1)),
    y: clamp(Math.round(y), 0, Math.max(0, elements.video.videoHeight - 1)),
  };
}

function beginRoiDrag(event) {
  if (!state.track) {
    return;
  }
  elements.overlayCanvas.setPointerCapture(event.pointerId);
  state.dragStart = pointToVideoCoordinates(event);
}

function updateRoiDrag(event) {
  if (!state.dragStart) {
    return;
  }

  const point = pointToVideoCoordinates(event);
  const x = Math.min(state.dragStart.x, point.x);
  const y = Math.min(state.dragStart.y, point.y);
  const width = Math.max(1, Math.abs(point.x - state.dragStart.x) + 1);
  const height = Math.max(1, Math.abs(point.y - state.dragStart.y) + 1);
  state.roi = normaliseRoi({ x, y, width, height });
  updateRoiOutput();
  drawOverlay();
}

function endRoiDrag(event) {
  if (!state.dragStart) {
    return;
  }
  updateRoiDrag(event);
  state.dragStart = null;
  state.spectrumHistory = [];
  state.averagedSpectrum = null;
  if (state.darkSpectrum) {
    clearDarkSpectrum();
  }
}

function normaliseRoi(roi) {
  const maxWidth = elements.video.videoWidth;
  const maxHeight = elements.video.videoHeight;
  const x = clamp(Math.round(roi.x), 0, Math.max(0, maxWidth - 1));
  const y = clamp(Math.round(roi.y), 0, Math.max(0, maxHeight - 1));
  const width = clamp(Math.round(roi.width), 1, maxWidth - x);
  const height = clamp(Math.round(roi.height), 1, maxHeight - y);
  return { x, y, width, height };
}

function updateRoiOutput() {
  if (!state.roi) {
    elements.roiOutput.textContent = "ROI: –";
    return;
  }
  const { x, y, width, height } = state.roi;
  elements.roiOutput.textContent = `ROI: x ${x}, y ${y}, ${width} × ${height}`;
}

function clearProcessingState() {
  state.spectrumHistory = [];
  state.averagedSpectrum = null;
  elements.peakOutput.textContent = "Maximum: –";
  drawEmptyPlot();
}

function startProcessingLoop() {
  const run = () => {
    processFrame();
    const delay = clamp(toFiniteNumber(elements.processingInterval.value, 200), 50, 5000);
    state.processingTimer = window.setTimeout(run, delay);
  };
  run();
}

function processFrame() {
  if (!state.track || !state.roi || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  const startedAt = performance.now();
  captureContext.drawImage(elements.video, 0, 0, elements.captureCanvas.width, elements.captureCanvas.height);
  const rawSpectrum = extractSpectrum(state.roi);
  addSpectrumToHistory(rawSpectrum);
  state.averagedSpectrum = averageSpectrumHistory();
  drawPlot();

  const elapsed = performance.now() - startedAt;
  const settings = state.track.getSettings();
  elements.frameStatus.textContent = `${settings.width ?? elements.video.videoWidth} × ${settings.height ?? elements.video.videoHeight} · výpočet ${elapsed.toFixed(1)} ms`;
  setRunningControls(true);
}

function extractSpectrum(roi) {
  const image = captureContext.getImageData(roi.x, roi.y, roi.width, roi.height);
  const red = new Float32Array(roi.width);
  const green = new Float32Array(roi.width);
  const blue = new Float32Array(roi.width);
  const luminance = new Float32Array(roi.width);

  for (let y = 0; y < roi.height; y += 1) {
    for (let x = 0; x < roi.width; x += 1) {
      const offset = (y * roi.width + x) * 4;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      red[x] += r;
      green[x] += g;
      blue[x] += b;
      luminance[x] += 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }

  const scale = 1 / roi.height;
  for (let x = 0; x < roi.width; x += 1) {
    red[x] *= scale;
    green[x] *= scale;
    blue[x] *= scale;
    luminance[x] *= scale;
  }

  return { red, green, blue, luminance };
}

function addSpectrumToHistory(spectrum) {
  const targetLength = clamp(Math.round(toFiniteNumber(elements.averageFrames.value, 8)), 1, 64);
  state.spectrumHistory.push(spectrum);
  while (state.spectrumHistory.length > targetLength) {
    state.spectrumHistory.shift();
  }
}

function averageSpectrumHistory() {
  if (state.spectrumHistory.length === 0) {
    return null;
  }

  const width = state.spectrumHistory[0].luminance.length;
  const averaged = {
    red: new Float32Array(width),
    green: new Float32Array(width),
    blue: new Float32Array(width),
    luminance: new Float32Array(width),
  };

  for (const spectrum of state.spectrumHistory) {
    for (let x = 0; x < width; x += 1) {
      averaged.red[x] += spectrum.red[x];
      averaged.green[x] += spectrum.green[x];
      averaged.blue[x] += spectrum.blue[x];
      averaged.luminance[x] += spectrum.luminance[x];
    }
  }

  const scale = 1 / state.spectrumHistory.length;
  for (const channel of Object.values(averaged)) {
    for (let x = 0; x < width; x += 1) {
      channel[x] *= scale;
    }
  }
  return averaged;
}

function correctedChannel(channelName) {
  const source = state.averagedSpectrum?.[channelName];
  if (!source) {
    return null;
  }

  if (!elements.subtractDark.checked || !state.darkSpectrum || state.darkSpectrum[channelName].length !== source.length) {
    return source;
  }

  const corrected = new Float32Array(source.length);
  const dark = state.darkSpectrum[channelName];
  for (let index = 0; index < source.length; index += 1) {
    corrected[index] = Math.max(0, source[index] - dark[index]);
  }
  return corrected;
}

function captureDarkSpectrum() {
  if (!state.averagedSpectrum) {
    return;
  }

  state.darkSpectrum = {
    red: state.averagedSpectrum.red.slice(),
    green: state.averagedSpectrum.green.slice(),
    blue: state.averagedSpectrum.blue.slice(),
    luminance: state.averagedSpectrum.luminance.slice(),
  };
  elements.darkStatus.textContent = `Tmavé spektrum zachyceno (${state.darkSpectrum.luminance.length} bodů).`;
  elements.clearDarkButton.disabled = false;
  drawPlot();
}

function clearDarkSpectrum() {
  state.darkSpectrum = null;
  elements.darkStatus.textContent = "Tmavé spektrum není zachyceno.";
  elements.clearDarkButton.disabled = true;
  drawPlot();
}

function getCalibration() {
  const pixel1 = toFiniteNumber(elements.pixel1.value, 0);
  const pixel2 = toFiniteNumber(elements.pixel2.value, 1);
  const wavelength1 = toFiniteNumber(elements.wavelength1.value, 400);
  const wavelength2 = toFiniteNumber(elements.wavelength2.value, 700);

  if (pixel1 === pixel2) {
    return null;
  }

  const slope = (wavelength2 - wavelength1) / (pixel2 - pixel1);
  const intercept = wavelength1 - slope * pixel1;
  return { pixel1, pixel2, wavelength1, wavelength2, slope, intercept };
}

function pixelToWavelength(pixel) {
  const calibration = getCalibration();
  return calibration ? calibration.intercept + calibration.slope * pixel : pixel;
}

function resizeCanvasToDisplaySize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

function drawEmptyPlot(message = "Čekám na data z kamery…") {
  resizeCanvasToDisplaySize(elements.plotCanvas);
  const width = elements.plotCanvas.width;
  const height = elements.plotCanvas.height;
  plotContext.clearRect(0, 0, width, height);
  plotContext.fillStyle = "#080b11";
  plotContext.fillRect(0, 0, width, height);
  plotContext.fillStyle = "#8e9bad";
  plotContext.font = `${14 * (window.devicePixelRatio || 1)}px sans-serif`;
  plotContext.textAlign = "center";
  plotContext.fillText(message, width / 2, height / 2);
}

function getSelectedChannels() {
  return [
    { name: "luminance", label: "Jas", enabled: elements.showLuminance.checked, color: "#f2f5fb" },
    { name: "red", label: "R", enabled: elements.showRed.checked, color: "#ff6572" },
    { name: "green", label: "G", enabled: elements.showGreen.checked, color: "#52d08c" },
    { name: "blue", label: "B", enabled: elements.showBlue.checked, color: "#59a7ff" },
  ].filter((channel) => channel.enabled);
}

function drawPlot() {
  if (!state.averagedSpectrum) {
    drawEmptyPlot();
    return;
  }

  resizeCanvasToDisplaySize(elements.plotCanvas);
  const canvas = elements.plotCanvas;
  const width = canvas.width;
  const height = canvas.height;
  const ratio = window.devicePixelRatio || 1;
  const padding = { left: 58 * ratio, right: 18 * ratio, top: 18 * ratio, bottom: 42 * ratio };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const selectedChannels = getSelectedChannels();

  if (selectedChannels.length === 0) {
    drawEmptyPlot("Vyber alespoň jeden kanál.");
    return;
  }

  const data = selectedChannels.map((channel) => ({ ...channel, values: correctedChannel(channel.name) }));
  let maximum = 1;
  for (const channel of data) {
    for (const value of channel.values) {
      maximum = Math.max(maximum, value);
    }
  }
  maximum *= 1.05;

  plotContext.clearRect(0, 0, width, height);
  plotContext.fillStyle = "#080b11";
  plotContext.fillRect(0, 0, width, height);
  drawGrid(padding, chartWidth, chartHeight, maximum, state.averagedSpectrum.luminance.length, ratio);

  for (const channel of data) {
    plotContext.beginPath();
    plotContext.strokeStyle = channel.color;
    plotContext.lineWidth = 1.5 * ratio;
    const values = channel.values;
    const denominator = Math.max(1, values.length - 1);

    for (let index = 0; index < values.length; index += 1) {
      const x = padding.left + (index / denominator) * chartWidth;
      const y = padding.top + chartHeight - (values[index] / maximum) * chartHeight;
      if (index === 0) {
        plotContext.moveTo(x, y);
      } else {
        plotContext.lineTo(x, y);
      }
    }
    plotContext.stroke();
  }

  drawLegend(data, padding, ratio);
  updatePeakOutput(correctedChannel("luminance"));
}

function drawGrid(padding, chartWidth, chartHeight, maximum, pointCount, ratio) {
  const horizontalLines = 5;
  const verticalLines = 6;
  plotContext.font = `${11 * ratio}px sans-serif`;
  plotContext.fillStyle = "#8491a3";
  plotContext.strokeStyle = "#263043";
  plotContext.lineWidth = ratio;

  for (let index = 0; index <= horizontalLines; index += 1) {
    const fraction = index / horizontalLines;
    const y = padding.top + chartHeight - fraction * chartHeight;
    plotContext.beginPath();
    plotContext.moveTo(padding.left, y);
    plotContext.lineTo(padding.left + chartWidth, y);
    plotContext.stroke();
    plotContext.textAlign = "right";
    plotContext.textBaseline = "middle";
    plotContext.fillText((maximum * fraction).toFixed(0), padding.left - 8 * ratio, y);
  }

  for (let index = 0; index <= verticalLines; index += 1) {
    const fraction = index / verticalLines;
    const x = padding.left + fraction * chartWidth;
    plotContext.beginPath();
    plotContext.moveTo(x, padding.top);
    plotContext.lineTo(x, padding.top + chartHeight);
    plotContext.stroke();

    const pixel = Math.round(fraction * Math.max(0, pointCount - 1));
    const wavelength = pixelToWavelength(pixel);
    plotContext.textAlign = "center";
    plotContext.textBaseline = "top";
    plotContext.fillText(`${wavelength.toFixed(1)}`, x, padding.top + chartHeight + 9 * ratio);
  }

  plotContext.textAlign = "center";
  plotContext.fillText(getCalibration() ? "Vlnová délka [nm]" : "Pixel", padding.left + chartWidth / 2, padding.top + chartHeight + 27 * ratio);
}

function drawLegend(channels, padding, ratio) {
  let x = padding.left + 8 * ratio;
  const y = padding.top + 12 * ratio;
  plotContext.font = `${11 * ratio}px sans-serif`;
  plotContext.textBaseline = "middle";

  for (const channel of channels) {
    plotContext.fillStyle = channel.color;
    plotContext.fillRect(x, y - 4 * ratio, 13 * ratio, 3 * ratio);
    x += 18 * ratio;
    plotContext.fillText(channel.label, x, y - 2 * ratio);
    x += (channel.label.length * 8 + 16) * ratio;
  }
}

function updatePeakOutput(values) {
  if (!values?.length) {
    elements.peakOutput.textContent = "Maximum: –";
    return;
  }

  let peakIndex = 0;
  let peakValue = values[0];
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > peakValue) {
      peakValue = values[index];
      peakIndex = index;
    }
  }

  const wavelength = pixelToWavelength(peakIndex);
  const xLabel = getCalibration() ? `${wavelength.toFixed(2)} nm` : `pixel ${peakIndex}`;
  elements.peakOutput.textContent = `Maximum: ${xLabel} · ${peakValue.toFixed(1)}`;
}

function updateDiagnostics() {
  if (!state.track) {
    return;
  }

  elements.settingsOutput.textContent = JSON.stringify(state.track.getSettings(), null, 2);
  try {
    elements.capabilitiesOutput.textContent = JSON.stringify(state.track.getCapabilities(), null, 2);
  } catch (error) {
    elements.capabilitiesOutput.textContent = `Schopnosti nelze načíst: ${error.message}`;
  }
}

function useRoiWidthForCalibration() {
  if (!state.roi) {
    return;
  }
  elements.pixel1.value = "0";
  elements.pixel2.value = String(Math.max(1, state.roi.width - 1));
  drawPlot();
}

function formatCsvNumber(value) {
  return Number.isFinite(value) ? value.toFixed(6) : "";
}

function exportCsv() {
  if (!state.averagedSpectrum) {
    return;
  }

  const red = correctedChannel("red");
  const green = correctedChannel("green");
  const blue = correctedChannel("blue");
  const luminance = correctedChannel("luminance");
  const settings = state.track?.getSettings() ?? {};
  const metadata = {
    exportedAt: new Date().toISOString(),
    cameraLabel: state.track?.label ?? "",
    cameraSettings: settings,
    roi: state.roi,
    averagedFrames: state.spectrumHistory.length,
    darkSubtraction: Boolean(elements.subtractDark.checked && state.darkSpectrum),
    calibration: getCalibration(),
  };

  const lines = [
    `# metadata=${JSON.stringify(metadata)}`,
    "pixel,wavelength_nm,red,green,blue,luminance",
  ];

  for (let index = 0; index < luminance.length; index += 1) {
    lines.push([
      index,
      formatCsvNumber(pixelToWavelength(index)),
      formatCsvNumber(red[index]),
      formatCsvNumber(green[index]),
      formatCsvNumber(blue[index]),
      formatCsvNumber(luminance[index]),
    ].join(","));
  }

  downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), timestampedFilename("spectrum", "csv"));
}

function saveFrame() {
  if (!state.track) {
    return;
  }

  captureContext.drawImage(elements.video, 0, 0, elements.captureCanvas.width, elements.captureCanvas.height);
  elements.captureCanvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, timestampedFilename("spectrometer-frame", "png"));
    }
  }, "image/png");
}

function timestampedFilename(prefix, extension) {
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
  return `${prefix}-${timestamp}.${extension}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function handleWindowResize() {
  drawOverlay();
  drawPlot();
}

function bindEvents() {
  elements.refreshDevicesButton.addEventListener("click", () => listCameras().catch(showDeviceError));
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

  for (const element of [
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
    element.addEventListener("input", drawPlot);
  }

  elements.averageFrames.addEventListener("input", () => {
    const target = clamp(Math.round(toFiniteNumber(elements.averageFrames.value, 8)), 1, 64);
    elements.averageFrames.value = String(target);
    while (state.spectrumHistory.length > target) {
      state.spectrumHistory.shift();
    }
  });

  window.addEventListener("resize", handleWindowResize);
  window.addEventListener("beforeunload", stopCamera);
  navigator.mediaDevices?.addEventListener("devicechange", () => listCameras().catch(showDeviceError));
}

function showDeviceError(error) {
  console.error(error);
  setCameraStatus(`Chyba zařízení: ${error.message}`, "error");
}

async function initialise() {
  bindEvents();
  drawEmptyPlot();

  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraStatus("MediaDevices API není dostupné", "error");
    elements.startButton.disabled = true;
    return;
  }

  try {
    await listCameras();
  } catch (error) {
    showDeviceError(error);
  }
}

initialise();
