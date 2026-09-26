import { captureContext, elements, setControlStatus, state } from "./core.js";

const DEFAULT_STEP = 25;
const DEFAULT_MAX_FRAMES = 12;
const MIN_FRAMES = 4;
const STABLE_WINDOW = 3;
const PEAK_TOLERANCE = 2.5;
const MEAN_TOLERANCE = 1.5;

let running = false;
let stopRequested = false;
let lastResult = null;
let ui = null;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function exposureRange() {
  const range = state.capabilities.exposureTime;
  if (!range || !Number.isFinite(Number(range.min)) || !Number.isFinite(Number(range.max))) return null;
  return {
    min: Number(range.min),
    max: Number(range.max),
    step: Number(range.step) || 1,
  };
}

function quantize(value, range) {
  return clamp(
    range.min + Math.round((Number(value) - range.min) / range.step) * range.step,
    range.min,
    range.max,
  );
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

function frameMetrics() {
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
  let redPeak = 0;
  let greenPeak = 0;
  let bluePeak = 0;
  let luminanceSum = 0;
  let columns = 0;
  let saturatedColumns = 0;

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

    if (!count) continue;
    red /= count;
    green /= count;
    blue /= count;
    const columnPeak = Math.max(red, green, blue);
    peak = Math.max(peak, columnPeak);
    redPeak = Math.max(redPeak, red);
    greenPeak = Math.max(greenPeak, green);
    bluePeak = Math.max(bluePeak, blue);
    luminanceSum += 0.299 * red + 0.587 * green + 0.114 * blue;
    if (columnPeak >= 250) saturatedColumns += 1;
    columns += 1;
  }

  return {
    peak,
    redPeak,
    greenPeak,
    bluePeak,
    meanLuminance: columns ? luminanceSum / columns : 0,
    saturationPercent: columns ? saturatedColumns / columns * 100 : 0,
  };
}

function stableFrames(frames) {
  if (frames.length < MIN_FRAMES) return false;
  const window = frames.slice(-STABLE_WINDOW);
  const peakValues = window.map((frame) => frame.peak);
  const meanValues = window.map((frame) => frame.meanLuminance);
  const exposures = window.map((frame) => frame.actualExposure).filter(Number.isFinite);
  const peakSpan = Math.max(...peakValues) - Math.min(...peakValues);
  const meanSpan = Math.max(...meanValues) - Math.min(...meanValues);
  const exposureStable = !exposures.length || Math.max(...exposures) === Math.min(...exposures);
  return peakSpan <= PEAK_TOLERANCE && meanSpan <= MEAN_TOLERANCE && exposureStable;
}

function nextVideoFrame() {
  return new Promise((resolve) => {
    if (typeof elements.video.requestVideoFrameCallback === "function") {
      elements.video.requestVideoFrameCallback((now, metadata) => resolve({ now, metadata }));
      return;
    }
    window.setTimeout(() => resolve({ now: performance.now(), metadata: {} }), 210);
  });
}

async function collectSettlingFrames(maxFrames, changedAt) {
  const frames = [];
  let settled = false;

  for (let index = 0; index < maxFrames; index += 1) {
    if (stopRequested || !state.track) break;
    const { now, metadata } = await nextVideoFrame();
    if (stopRequested || !state.track) break;
    const metrics = frameMetrics();
    if (!metrics) continue;
    const settings = state.track.getSettings();
    frames.push({
      frameIndex: frames.length + 1,
      elapsedMs: now - changedAt,
      mediaTime: Number.isFinite(Number(metadata.mediaTime)) ? Number(metadata.mediaTime) : null,
      presentedFrames: Number.isFinite(Number(metadata.presentedFrames)) ? Number(metadata.presentedFrames) : null,
      actualExposure: Number.isFinite(Number(settings.exposureTime)) ? Number(settings.exposureTime) : null,
      ...metrics,
    });

    if (stableFrames(frames)) {
      settled = true;
      break;
    }
  }

  return { frames, settled };
}

function finalMetrics(frames) {
  if (!frames.length) return null;
  const window = frames.slice(-Math.min(STABLE_WINDOW, frames.length));
  const average = (key) => window.reduce((sum, frame) => sum + Number(frame[key] || 0), 0) / window.length;
  const last = frames[frames.length - 1];
  return {
    peak: average("peak"),
    redPeak: average("redPeak"),
    greenPeak: average("greenPeak"),
    bluePeak: average("bluePeak"),
    meanLuminance: average("meanLuminance"),
    saturationPercent: average("saturationPercent"),
    actualExposure: Number.isFinite(Number(last.actualExposure)) ? Number(last.actualExposure) : null,
    settleMs: Number(last.elapsedMs),
  };
}

async function measureExposure(track, requestedExposure, range, direction, sequenceIndex, maxFrames) {
  const requested = quantize(requestedExposure, range);
  const applyStarted = performance.now();
  await track.applyConstraints({ advanced: [{ exposureMode: "manual", exposureTime: requested }] });
  const applyFinished = performance.now();
  const actualImmediately = Number(track.getSettings().exposureTime);
  const settling = await collectSettlingFrames(maxFrames, applyFinished);
  const final = finalMetrics(settling.frames);

  return {
    direction,
    sequenceIndex,
    requestedExposure: requested,
    actualImmediately: Number.isFinite(actualImmediately) ? actualImmediately : null,
    applyDurationMs: applyFinished - applyStarted,
    settled: settling.settled,
    frames: settling.frames,
    final,
  };
}

function buildExposureValues(range, requestedStep) {
  const step = Math.max(range.step, quantize(requestedStep, { min: 0, max: range.max, step: range.step }));
  const values = [];
  for (let value = range.min; value <= range.max; value += step) values.push(quantize(value, range));
  if (values[values.length - 1] !== range.max) values.push(range.max);
  return [...new Set(values)];
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function analyzeDirection(points, direction) {
  const usable = points
    .filter((point) => point.direction === direction && point.final)
    .sort((a, b) => a.requestedExposure - b.requestedExposure);
  const drops = [];
  const monotonicViolations = [];

  for (let index = 1; index < usable.length; index += 1) {
    const lower = usable[index - 1];
    const higher = usable[index];
    const lowerPeak = lower.final.peak;
    const higherPeak = higher.final.peak;
    const difference = higherPeak - lowerPeak;
    if (difference < -Math.max(8, lowerPeak * 0.08)) {
      const item = {
        lowerExposure: lower.requestedExposure,
        higherExposure: higher.requestedExposure,
        lowerPeak,
        higherPeak,
        drop: lowerPeak - higherPeak,
        ratio: lowerPeak > 0 ? higherPeak / lowerPeak : null,
      };
      monotonicViolations.push(item);
      if (difference < -Math.max(18, lowerPeak * 0.20)) drops.push(item);
    }
  }

  const settleTimes = usable.map((point) => point.final.settleMs).filter(Number.isFinite);
  return {
    direction,
    points: usable.length,
    unsettledPoints: usable.filter((point) => !point.settled).length,
    medianSettleMs: median(settleTimes),
    maxSettleMs: settleTimes.length ? Math.max(...settleTimes) : null,
    monotonicViolations,
    majorDrops: drops,
  };
}

function analyzeHysteresis(points) {
  const forward = new Map(points.filter((point) => point.direction === "forward" && point.final)
    .map((point) => [point.requestedExposure, point]));
  const reverse = new Map(points.filter((point) => point.direction === "reverse" && point.final)
    .map((point) => [point.requestedExposure, point]));
  const differences = [];

  for (const [exposure, up] of forward) {
    const down = reverse.get(exposure);
    if (!down) continue;
    const upPeak = up.final.peak;
    const downPeak = down.final.peak;
    const absolute = Math.abs(upPeak - downPeak);
    const relative = Math.max(upPeak, downPeak) > 0 ? absolute / Math.max(upPeak, downPeak) : 0;
    if (absolute >= 8 || relative >= 0.08) {
      differences.push({ exposure, forwardPeak: upPeak, reversePeak: downPeak, absolute, relative });
    }
  }

  return differences.sort((a, b) => b.relative - a.relative);
}

function analyze(points) {
  return {
    forward: analyzeDirection(points, "forward"),
    reverse: analyzeDirection(points, "reverse"),
    hysteresis: analyzeHysteresis(points),
  };
}

function summaryText(result) {
  if (!result?.analysis) return "";
  const { forward, reverse, hysteresis } = result.analysis;
  const lines = [];
  const describe = (item, label) => {
    if (!item?.points) return;
    lines.push(`${label}: ${item.points} bodů; neustálené ${item.unsettledPoints}; medián ustálení ${item.medianSettleMs?.toFixed(0) ?? "–"} ms; velké skoky ${item.majorDrops.length}.`);
    for (const drop of item.majorDrops.slice(0, 6)) {
      lines.push(`  ${drop.lowerExposure}→${drop.higherExposure}: ${drop.lowerPeak.toFixed(1)}→${drop.higherPeak.toFixed(1)} (−${drop.drop.toFixed(1)}).`);
    }
  };
  describe(forward, "Nahoru");
  describe(reverse, "Dolů");
  lines.push(`Hysteréze: ${hysteresis.length} bodů s významným rozdílem mezi směry.`);
  for (const item of hysteresis.slice(0, 6)) {
    lines.push(`  ${item.exposure}: nahoru ${item.forwardPeak.toFixed(1)}, dolů ${item.reversePeak.toFixed(1)} (${(item.relative * 100).toFixed(1)} %).`);
  }
  return lines.join("\n");
}

function syncUiRunning() {
  if (!ui) return;
  ui.start.disabled = running || !state.track;
  ui.stop.disabled = !running;
  ui.step.disabled = running;
  ui.maxFrames.disabled = running;
  ui.mode.disabled = running;
  ui.exportJson.disabled = !lastResult;
  ui.exportCsv.disabled = !lastResult;
}

function setExposureInputsDisabled(disabled) {
  for (const input of document.querySelectorAll('[data-camera-control="exposureTime"]')) {
    input.disabled = disabled;
    const number = input.type === "range" ? input.nextElementSibling : null;
    if (number?.type === "number") number.disabled = disabled;
  }
}

async function restoreExposure(track, exposure, range) {
  if (!track || track !== state.track || !Number.isFinite(exposure)) return;
  try {
    await track.applyConstraints({ advanced: [{ exposureMode: "manual", exposureTime: quantize(exposure, range) }] });
  } catch (error) {
    console.warn("Exposure could not be restored after diagnostics.", error);
  }
}

async function runDiagnostics() {
  if (running || !state.track) return;
  const range = exposureRange();
  if (!range) {
    ui.status.textContent = "Kamera nezpřístupnila ruční expoziční čas.";
    return;
  }

  const roi = selectedRoi();
  if (!roi) {
    ui.status.textContent = "Není dostupná ROI.";
    return;
  }

  const step = Math.max(range.step, Number(ui.step.value) || DEFAULT_STEP);
  const maxFrames = clamp(Math.round(Number(ui.maxFrames.value) || DEFAULT_MAX_FRAMES), MIN_FRAMES, 30);
  const values = buildExposureValues(range, step);
  const mode = ui.mode.value;
  const directions = mode === "forward" ? [{ id: "forward", values }]
    : mode === "reverse" ? [{ id: "reverse", values: [...values].reverse() }]
      : [{ id: "forward", values }, { id: "reverse", values: [...values].reverse() }];

  const track = state.track;
  const originalExposure = Number(track.getSettings().exposureTime);
  const startedAt = new Date().toISOString();
  const points = [];
  running = true;
  stopRequested = false;
  state.exposureDiagnosticRunning = true;
  setExposureInputsDisabled(true);
  syncUiRunning();
  if (elements.autoModeButton) elements.autoModeButton.disabled = true;

  try {
    let completed = 0;
    const total = directions.reduce((sum, direction) => sum + direction.values.length, 0);
    for (const direction of directions) {
      for (let index = 0; index < direction.values.length; index += 1) {
        if (stopRequested || track !== state.track) break;
        const requested = direction.values[index];
        ui.status.textContent = `${direction.id === "forward" ? "Nahoru" : "Dolů"}: expozice ${requested} · bod ${completed + 1}/${total}`;
        const point = await measureExposure(track, requested, range, direction.id, index, maxFrames);
        points.push(point);
        completed += 1;
      }
      if (stopRequested || track !== state.track) break;
    }

    const result = {
      schemaVersion: 1,
      kind: "spectrometer-exposure-diagnostic",
      startedAt,
      completedAt: new Date().toISOString(),
      stopped: stopRequested,
      profile: state.instrumentProfile ? { id: state.instrumentProfile.id, name: state.instrumentProfile.name } : null,
      camera: {
        label: track.label,
        settings: track.getSettings(),
        capabilities: state.capabilities,
      },
      roi,
      config: {
        range,
        requestedStep: step,
        maxFramesPerPoint: maxFrames,
        minFrames: MIN_FRAMES,
        stableWindow: STABLE_WINDOW,
        peakTolerance: PEAK_TOLERANCE,
        meanTolerance: MEAN_TOLERANCE,
        mode,
      },
      points,
      analysis: analyze(points),
    };
    lastResult = result;
    ui.summary.textContent = summaryText(result);
    ui.status.textContent = stopRequested
      ? `Diagnostika zastavena; uloženo ${points.length} bodů.`
      : `Diagnostika dokončena; uloženo ${points.length} bodů.`;
  } catch (error) {
    console.error(error);
    ui.status.textContent = `Diagnostika selhala: ${error.message}`;
  } finally {
    await restoreExposure(track, originalExposure, range);
    running = false;
    state.exposureDiagnosticRunning = false;
    setExposureInputsDisabled(false);
    if (elements.autoModeButton) elements.autoModeButton.disabled = !state.track;
    syncUiRunning();
  }
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

function exportJson() {
  if (!lastResult) return;
  download(
    new Blob([`${JSON.stringify(lastResult, null, 2)}\n`], { type: "application/json;charset=utf-8" }),
    `exposure-diagnostic-${timestamp()}.json`,
  );
}

function exportCsv() {
  if (!lastResult) return;
  const header = [
    "direction", "sequence_index", "requested_exposure", "actual_immediately", "settled", "frame_index",
    "elapsed_ms", "media_time", "presented_frames", "actual_exposure", "peak", "red_peak", "green_peak",
    "blue_peak", "mean_luminance", "saturation_percent",
  ];
  const rows = [header.join(",")];
  for (const point of lastResult.points) {
    for (const frame of point.frames) {
      rows.push([
        point.direction,
        point.sequenceIndex,
        point.requestedExposure,
        point.actualImmediately ?? "",
        point.settled ? 1 : 0,
        frame.frameIndex,
        frame.elapsedMs.toFixed(3),
        frame.mediaTime ?? "",
        frame.presentedFrames ?? "",
        frame.actualExposure ?? "",
        frame.peak.toFixed(6),
        frame.redPeak.toFixed(6),
        frame.greenPeak.toFixed(6),
        frame.bluePeak.toFixed(6),
        frame.meanLuminance.toFixed(6),
        frame.saturationPercent.toFixed(6),
      ].join(","));
    }
  }
  download(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }), `exposure-diagnostic-${timestamp()}.csv`);
}

function createUi() {
  if (ui) return;
  const cameraSection = document.querySelector('[aria-labelledby="camera-controls-heading"]');
  if (!cameraSection) return;

  const details = document.createElement("details");
  details.className = "exposure-diagnostics";
  details.innerHTML = `
    <summary>Diagnostika expozice</summary>
    <p class="hint exposure-diagnostics-description">Proměří odezvu kamery v celém rozsahu. Po každé změně zaznamenává pouze nové video snímky až do ustálení. Pro hledání skoků je vhodný průchod nahoru i dolů.</p>
    <div class="field-grid compact">
      <label>Krok expozice<input class="exposure-diagnostic-step" type="number" min="1" max="500" step="1" value="${DEFAULT_STEP}"></label>
      <label>Max. snímků / bod<input class="exposure-diagnostic-frames" type="number" min="${MIN_FRAMES}" max="30" step="1" value="${DEFAULT_MAX_FRAMES}"></label>
      <label>Směr<select class="exposure-diagnostic-mode"><option value="both" selected>Nahoru + dolů</option><option value="forward">Jen nahoru</option><option value="reverse">Jen dolů</option></select></label>
    </div>
    <div class="button-row wrap">
      <button type="button" class="button secondary exposure-diagnostic-start">Spustit sweep</button>
      <button type="button" class="button ghost exposure-diagnostic-stop" disabled>Zastavit</button>
      <button type="button" class="button ghost exposure-diagnostic-json" disabled>Export JSON</button>
      <button type="button" class="button ghost exposure-diagnostic-csv" disabled>Export CSV</button>
    </div>
    <p class="hint exposure-diagnostic-status">Kamera není spuštěna.</p>
    <pre class="exposure-diagnostic-summary" hidden></pre>
  `;
  cameraSection.append(details);

  const style = document.createElement("style");
  style.textContent = `
    .exposure-diagnostics { margin-top: .85rem; border-top: 1px solid var(--border); padding-top: .75rem; }
    .exposure-diagnostics > summary { cursor: pointer; font-weight: 650; }
    .exposure-diagnostics-description { margin-top: .7rem; }
    .exposure-diagnostic-summary { margin: .65rem 0 0; max-height: 14rem; overflow: auto; white-space: pre-wrap; font-size: .75rem; color: var(--muted); }
  `;
  document.head.append(style);

  ui = {
    details,
    step: details.querySelector(".exposure-diagnostic-step"),
    maxFrames: details.querySelector(".exposure-diagnostic-frames"),
    mode: details.querySelector(".exposure-diagnostic-mode"),
    start: details.querySelector(".exposure-diagnostic-start"),
    stop: details.querySelector(".exposure-diagnostic-stop"),
    exportJson: details.querySelector(".exposure-diagnostic-json"),
    exportCsv: details.querySelector(".exposure-diagnostic-csv"),
    status: details.querySelector(".exposure-diagnostic-status"),
    summary: details.querySelector(".exposure-diagnostic-summary"),
  };

  ui.start.addEventListener("click", () => void runDiagnostics());
  ui.stop.addEventListener("click", () => {
    stopRequested = true;
    ui.status.textContent = "Zastavuji po aktuálním snímku…";
  });
  ui.exportJson.addEventListener("click", exportJson);
  ui.exportCsv.addEventListener("click", exportCsv);
  const observer = window.setInterval(() => {
    if (!ui) return;
    if (!running) ui.status.textContent = lastResult
      ? ui.status.textContent
      : state.track ? "Připraveno k měření." : "Kamera není spuštěna.";
    syncUiRunning();
  }, 500);
  window.addEventListener("beforeunload", () => window.clearInterval(observer));
  syncUiRunning();
}

export function installExposureDiagnostics() {
  createUi();
}
