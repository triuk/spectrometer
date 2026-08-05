import { captureContext, elements, setControlStatus, state } from "./core.js";
import { clearDarkSpectrum } from "./spectrum.js";

const TARGET = 220;
const TARGET_MIN = 205;
const TARGET_MAX = 232;
const INITIAL_PROBES = 8;
const MAX_PROBES = 14;
const SETTLE_MS = 650;

let optimizing = false;
let runId = 0;
let busyTimer = null;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function exposureRange() {
  const range = state.capabilities.exposureTime;
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return null;
  return {
    min: Number(range.min),
    max: Number(range.max),
    step: Number(range.step) || 1,
  };
}

function quantize(value, range) {
  return clamp(
    range.min + Math.round((value - range.min) / range.step) * range.step,
    range.min,
    range.max,
  );
}

function syncExposureControls(value) {
  if (!Number.isFinite(Number(value))) return;
  for (const slider of document.querySelectorAll('[data-camera-control="exposureTime"]')) {
    slider.value = String(value);
    const numberInput = slider.type === "range" ? slider.nextElementSibling : null;
    if (numberInput?.type === "number") numberInput.value = String(value);
  }
}

function installUiAdjustments() {
  if (document.querySelector("#exposureOptimizerStyle")) return;
  const style = document.createElement("style");
  style.id = "exposureOptimizerStyle";
  style.textContent = `
    .measurement-camera-mode .manual-image-section > .image-subheading {
      display: none !important;
    }
  `;
  document.head.append(style);
}

function setBusy(busy) {
  elements.autoModeButton.textContent = busy
    ? "Optimalizuji expozici…"
    : "Optimalizovat expozici (SW)";
  elements.autoModeButton.setAttribute("aria-busy", String(busy));
  elements.autoModeButton.classList.toggle("optimizing", busy);
}

function selectedRoi() {
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

function measurePeak() {
  if (!state.track || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  const roi = selectedRoi();
  if (!roi) return null;

  if (elements.captureCanvas.width !== elements.video.videoWidth
      || elements.captureCanvas.height !== elements.video.videoHeight) {
    elements.captureCanvas.width = elements.video.videoWidth;
    elements.captureCanvas.height = elements.video.videoHeight;
  }

  captureContext.drawImage(elements.video, 0, 0, elements.captureCanvas.width, elements.captureCanvas.height);
  const data = captureContext.getImageData(roi.x, roi.y, roi.width, roi.height).data;
  const yStep = Math.max(1, Math.floor(roi.height / 48));
  let peak = 0;

  for (let x = 0; x < roi.width; x += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;

    for (let y = 0; y < roi.height; y += yStep) {
      const offset = (y * roi.width + x) * 4;
      red += data[offset];
      green += data[offset + 1];
      blue += data[offset + 2];
      count += 1;
    }

    if (count) peak = Math.max(peak, red / count, green / count, blue / count);
  }

  return Math.round(peak);
}

function scoreSample(sample) {
  if (sample.peak >= TARGET_MIN && sample.peak <= TARGET_MAX) {
    return Math.abs(sample.peak - TARGET);
  }
  if (sample.peak < TARGET_MIN) {
    return 100 + (TARGET_MIN - sample.peak);
  }
  return 300 + (sample.peak - TARGET_MAX) * 4;
}

function bestSample(samples) {
  return [...samples].sort((a, b) => scoreSample(a) - scoreSample(b))[0] ?? null;
}

function initialCandidates(range, current) {
  const values = new Set([quantize(current, range)]);
  const safeMin = Math.max(range.min, Number.EPSILON);
  const ratio = range.max / safeMin;

  for (let index = 0; index < INITIAL_PROBES; index += 1) {
    const fraction = index / (INITIAL_PROBES - 1);
    const value = ratio > 1
      ? safeMin * Math.pow(ratio, fraction)
      : range.min;
    values.add(quantize(value, range));
  }

  return [...values];
}

function refinementCandidate(samples, range) {
  const sorted = [...samples].sort((a, b) => a.exposure - b.exposure);
  const best = bestSample(sorted);
  if (!best) return null;

  const index = sorted.findIndex((sample) => sample.exposure === best.exposure);
  const intervals = [];
  if (index > 0) intervals.push([sorted[index - 1].exposure, best.exposure]);
  if (index < sorted.length - 1) intervals.push([best.exposure, sorted[index + 1].exposure]);

  intervals.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  for (const [low, high] of intervals) {
    if (high - low <= range.step) continue;
    const midpoint = low > 0
      ? Math.sqrt(low * high)
      : (low + high) / 2;
    const candidate = quantize(midpoint, range);
    if (!samples.some((sample) => sample.exposure === candidate)) return candidate;
  }

  return null;
}

function findDiscontinuity(samples) {
  const sorted = [...samples].sort((a, b) => a.exposure - b.exposure);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (current.peak < previous.peak * 0.65) {
      return { before: previous, after: current };
    }
  }
  return null;
}

async function applyExposure(track, requested, range) {
  await track.applyConstraints({
    advanced: [{ exposureMode: "manual", exposureTime: quantize(requested, range) }],
  });
  await sleep(SETTLE_MS);
  const actual = Number(track.getSettings().exposureTime);
  const value = Number.isFinite(actual) ? actual : quantize(requested, range);
  syncExposureControls(value);
  return value;
}

async function evaluate(track, requested, range, samples, id) {
  if (id !== runId || track !== state.track) return null;
  const exposure = await applyExposure(track, requested, range);
  if (id !== runId || track !== state.track) return null;
  const peak = measurePeak();
  if (peak === null) return null;

  const existing = samples.find((sample) => sample.exposure === exposure);
  if (existing) existing.peak = peak;
  else samples.push({ exposure, peak });

  return { exposure, peak };
}

async function optimizeExposure() {
  if (!state.track || optimizing) return;
  const range = exposureRange();
  if (!range) {
    setControlStatus("Kamera nezpřístupnila ruční expoziční čas.", true);
    return;
  }

  optimizing = true;
  const id = ++runId;
  const track = state.track;
  const samples = [];
  const current = Number(track.getSettings().exposureTime) || range.min;

  setBusy(true);
  busyTimer = window.setInterval(() => setBusy(true), 100);
  if (state.darkSpectrum) clearDarkSpectrum();

  try {
    const candidates = initialCandidates(range, current);
    for (const candidate of candidates) {
      if (samples.length >= MAX_PROBES || id !== runId || track !== state.track) return;
      const sample = await evaluate(track, candidate, range, samples, id);
      if (!sample) continue;
      setControlStatus(
        `Mapuji expozici ${samples.length}/${MAX_PROBES}: ${sample.exposure}, maximum ${sample.peak}/255.`,
      );
    }

    while (samples.length < MAX_PROBES) {
      const candidate = refinementCandidate(samples, range);
      if (candidate === null) break;
      const sample = await evaluate(track, candidate, range, samples, id);
      if (!sample) break;
      setControlStatus(
        `Zpřesňuji expozici ${samples.length}/${MAX_PROBES}: ${sample.exposure}, maximum ${sample.peak}/255.`,
      );
    }

    if (id !== runId || track !== state.track) return;
    const best = bestSample(samples);
    if (!best) throw new Error("nepodařilo se získat platné měření");

    const finalExposure = await applyExposure(track, best.exposure, range);
    const finalPeak = measurePeak();
    const discontinuity = findDiscontinuity(samples);
    const note = discontinuity
      ? ` Zjištěn skok jasu mezi expozicí ${discontinuity.before.exposure} a ${discontinuity.after.exposure}.`
      : "";

    setControlStatus(
      `Expozice ${finalExposure} je uzamčena; maximum ${finalPeak ?? best.peak}/255.${note}`,
      finalPeak !== null && finalPeak > 245,
    );
  } catch (error) {
    console.error(error);
    setControlStatus(`Optimalizace expozice selhala: ${error.message}`, true);
  } finally {
    if (id === runId) optimizing = false;
    window.clearInterval(busyTimer);
    busyTimer = null;
    setBusy(false);
    const actual = Number(state.track?.getSettings().exposureTime);
    if (Number.isFinite(actual)) syncExposureControls(actual);
  }
}

export function installExposureOptimizer() {
  installUiAdjustments();
  setBusy(false);

  elements.autoModeButton.addEventListener("click", (event) => {
    if (!state.track) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    optimizeExposure();
  }, { capture: true });

  window.setInterval(() => {
    const actual = Number(state.track?.getSettings().exposureTime);
    if (Number.isFinite(actual)) syncExposureControls(actual);
  }, 250);
}
