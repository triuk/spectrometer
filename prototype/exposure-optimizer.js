import { captureContext, elements, setControlStatus, state } from "./core.js";
import { clearDarkSpectrum } from "./spectrum.js";

const TARGET = 220;
const TARGET_MIN = 205;
const TARGET_MAX = 232;
const INITIAL_PROBES = 8;
const MAX_PROBES = 14;
const DEFAULT_FRESH_FRAMES = 5;
const DEFAULT_SAMPLE_FRAMES = 3;
const MAX_SEGMENT_REFINEMENTS = 6;

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

  return peak;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function optimizerProfile() {
  const source = state.instrumentProfile?.exposureOptimization;
  const period = Number(source?.discontinuityPeriod);
  const origin = Number(source?.discontinuityOrigin ?? 0);
  const freshFrames = Math.max(3, Math.round(Number(source?.freshFrames) || DEFAULT_FRESH_FRAMES));
  const sampleFrames = clamp(
    Math.round(Number(source?.sampleFrames) || DEFAULT_SAMPLE_FRAMES),
    1,
    freshFrames,
  );

  return {
    model: source?.model ?? "generic",
    period: Number.isFinite(period) && period > 0 ? period : null,
    origin: Number.isFinite(origin) ? origin : 0,
    freshFrames,
    sampleFrames,
  };
}

function nextVideoFrame() {
  if (typeof elements.video.requestVideoFrameCallback === "function") {
    return new Promise((resolve) => {
      elements.video.requestVideoFrameCallback((_now, metadata) => resolve(metadata));
    });
  }

  const fps = Number(state.track?.getSettings().frameRate) || 5;
  return sleep(Math.max(40, 1000 / fps)).then(() => null);
}

async function measureFreshFrames(track, profile, id) {
  const peaks = [];
  for (let index = 0; index < profile.freshFrames; index += 1) {
    await nextVideoFrame();
    if (id !== runId || track !== state.track) return null;
    const peak = measurePeak();
    if (Number.isFinite(peak)) peaks.push(peak);
  }

  const usable = peaks.slice(-profile.sampleFrames);
  const peak = median(usable);
  return peak === null ? null : { peak, framePeaks: peaks };
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

async function evaluate(track, requested, range, profile, samples, id, { force = false } = {}) {
  if (id !== runId || track !== state.track) return null;
  const targetExposure = quantize(requested, range);
  const existing = samples.find((sample) => sample.exposure === targetExposure);
  if (existing && !force) return existing;

  await track.applyConstraints({
    advanced: [{ exposureMode: "manual", exposureTime: targetExposure }],
  });
  if (id !== runId || track !== state.track) return null;

  const actualSetting = Number(track.getSettings().exposureTime);
  const exposure = Number.isFinite(actualSetting) ? actualSetting : targetExposure;
  syncExposureControls(exposure);

  const measurement = await measureFreshFrames(track, profile, id);
  if (!measurement) return null;

  const sample = {
    exposure,
    peak: measurement.peak,
    framePeaks: measurement.framePeaks,
  };

  const previousIndex = samples.findIndex((item) => item.exposure === exposure);
  if (previousIndex >= 0) samples[previousIndex] = sample;
  else samples.push(sample);
  return sample;
}

function piecewiseSegments(range, profile) {
  if (!profile.period || profile.period <= range.step) return [];
  const segments = [];
  let index = Math.floor((range.min - profile.origin) / profile.period);
  let guard = 0;

  while (guard++ < 10000) {
    const rawStart = profile.origin + index * profile.period;
    const rawEnd = profile.origin + (index + 1) * profile.period - range.step;
    const start = quantize(Math.max(range.min, rawStart), range);
    const end = quantize(Math.min(range.max, rawEnd), range);
    if (end >= start) segments.push({ index, start, end });
    if (rawEnd >= range.max) break;
    index += 1;
  }

  if (segments.length) {
    const last = segments[segments.length - 1];
    if (last.end < range.max) {
      const nextStart = quantize(Math.max(range.min, profile.origin + (last.index + 1) * profile.period), range);
      if (nextStart <= range.max) segments.push({ index: last.index + 1, start: nextStart, end: range.max });
    }
  }
  return segments;
}

async function optimizePiecewise(track, range, profile, samples, id) {
  const segments = piecewiseSegments(range, profile);
  if (!segments.length) return null;

  let targetSegment = null;
  let highestBelow = null;

  for (let index = 0; index < segments.length; index += 1) {
    if (id !== runId || track !== state.track) return null;
    const segment = segments[index];
    const sample = await evaluate(track, segment.end, range, profile, samples, id);
    if (!sample) continue;

    setControlStatus(
      `Hledám monotónní úsek ${index + 1}/${segments.length}: expozice ${sample.exposure}, maximum ${sample.peak.toFixed(1)}/255.`,
    );

    if (!highestBelow || sample.peak > highestBelow.peak) highestBelow = sample;
    if (sample.peak >= TARGET) {
      targetSegment = segment;
      break;
    }
  }

  if (!targetSegment) return bestSample(samples) ?? highestBelow;

  let low = targetSegment.start;
  let high = targetSegment.end;
  let highSample = samples.find((sample) => sample.exposure === high) ?? null;

  for (let refinement = 0; refinement < MAX_SEGMENT_REFINEMENTS && high - low > range.step; refinement += 1) {
    const midpoint = quantize((low + high) / 2, range);
    if (midpoint <= low || midpoint >= high) break;
    const sample = await evaluate(track, midpoint, range, profile, samples, id);
    if (!sample) break;

    setControlStatus(
      `Dolaďuji úsek ${targetSegment.start}–${targetSegment.end}: expozice ${sample.exposure}, maximum ${sample.peak.toFixed(1)}/255.`,
    );

    if (sample.peak >= TARGET) {
      high = sample.exposure;
      highSample = sample;
    } else {
      low = sample.exposure;
    }
  }

  const segmentSamples = samples.filter(
    (sample) => sample.exposure >= targetSegment.start && sample.exposure <= targetSegment.end,
  );
  return bestSample(segmentSamples) ?? highSample ?? bestSample(samples);
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
    const midpoint = low > 0 ? Math.sqrt(low * high) : (low + high) / 2;
    const candidate = quantize(midpoint, range);
    if (!samples.some((sample) => sample.exposure === candidate)) return candidate;
  }

  return null;
}

async function optimizeGeneric(track, range, profile, samples, id, current) {
  const candidates = initialCandidates(range, current);
  for (const candidate of candidates) {
    if (samples.length >= MAX_PROBES || id !== runId || track !== state.track) return null;
    const sample = await evaluate(track, candidate, range, profile, samples, id);
    if (!sample) continue;
    setControlStatus(
      `Mapuji expozici ${samples.length}/${MAX_PROBES}: ${sample.exposure}, maximum ${sample.peak.toFixed(1)}/255.`,
    );
  }

  while (samples.length < MAX_PROBES) {
    const candidate = refinementCandidate(samples, range);
    if (candidate === null) break;
    const sample = await evaluate(track, candidate, range, profile, samples, id);
    if (!sample) break;
    setControlStatus(
      `Zpřesňuji expozici ${samples.length}/${MAX_PROBES}: ${sample.exposure}, maximum ${sample.peak.toFixed(1)}/255.`,
    );
  }

  return bestSample(samples);
}

async function optimizeExposure() {
  if (state.exposureDiagnosticRunning) {
    setControlStatus("Probíhá diagnostika expozice; optimalizace je dočasně vypnutá.", true);
    return;
  }
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
  const profile = optimizerProfile();

  setBusy(true);
  busyTimer = window.setInterval(() => setBusy(true), 100);
  if (state.darkSpectrum) clearDarkSpectrum();

  try {
    const piecewise = profile.model === "piecewise-monotonic" && profile.period;
    const best = piecewise
      ? await optimizePiecewise(track, range, profile, samples, id)
      : await optimizeGeneric(track, range, profile, samples, id, current);

    if (id !== runId || track !== state.track) return;
    if (!best) throw new Error("nepodařilo se získat platné měření");

    setControlStatus(`Ověřuji expozici ${best.exposure} na nových snímcích…`);
    const final = await evaluate(track, best.exposure, range, profile, samples, id, { force: true });
    if (!final) throw new Error("nepodařilo se ověřit výslednou expozici");

    const modelNote = piecewise
      ? ` Použit model monotónních úseků s periodou ${profile.period}.`
      : "";
    setControlStatus(
      `Expozice ${final.exposure} je uzamčena; maximum ${final.peak.toFixed(1)}/255.${modelNote}`,
      final.peak > 245,
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
