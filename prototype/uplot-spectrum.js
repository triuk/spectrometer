import { elements, state, toFiniteNumber } from "./core.js";

const UPLOT_VERSION = "1.6.32";
const UPLOT_JS = `https://cdn.jsdelivr.net/npm/uplot@${UPLOT_VERSION}/dist/uPlot.iife.min.js`;
const UPLOT_CSS = `https://cdn.jsdelivr.net/npm/uplot@${UPLOT_VERSION}/dist/uPlot.min.css`;
const LOCAL_CSS = new URL("./uplot-spectrum.css", import.meta.url).href;
const CHANNELS = ["luminance", "red", "green", "blue"];
const SERIES = [
  { key: "luminance", label: "Jas", stroke: "#f4f7fb" },
  { key: "red", label: "R", stroke: "#ff6969" },
  { key: "green", label: "G", stroke: "#65dc8f" },
  { key: "blue", label: "B", stroke: "#629cff" },
];
const PEAK_PRESETS = {
  low: { label: "Nízká", prominenceFraction: 0.055, absoluteProminence: 7, heightFraction: 0.12 },
  medium: { label: "Střední", prominenceFraction: 0.035, absoluteProminence: 4, heightFraction: 0.08 },
  high: { label: "Vysoká", prominenceFraction: 0.02, absoluteProminence: 2.5, heightFraction: 0.05 },
};

let libraryPromise = null;
let host = null;
let fallbackCanvas = null;
let emptyState = null;
let resetButton = null;
let peakToggle = null;
let peakSensitivity = null;
let calibration1Button = null;
let calibration2Button = null;
let peakStatus = null;
let chart = null;
let resizeObserver = null;
let refreshTimer = null;
let lastSpectrum = null;
let lastDarkSpectrum = null;
let lastSignature = "";
let chartCalibrated = false;
let fullDomain = null;
let tooltip = null;
let background = null;
let colorStrip = null;
let peakLayer = null;
let panning = null;
let currentPeaks = [];
let currentSensorPixels = [];
let activeCalibrationTarget = null;

function addStylesheet(href, id) {
  if (document.querySelector(`#${id}`)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

function loadUPlot() {
  if (window.uPlot) return Promise.resolve(window.uPlot);
  if (libraryPromise) return libraryPromise;

  addStylesheet(UPLOT_CSS, "uPlotStylesheet");
  addStylesheet(LOCAL_CSS, "uPlotSpectrumStylesheet");

  libraryPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("#uPlotScript");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.uPlot), { once: true });
      existing.addEventListener("error", () => reject(new Error("uPlot se nepodařilo načíst.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "uPlotScript";
    script.src = UPLOT_JS;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => {
      if (window.uPlot) resolve(window.uPlot);
      else reject(new Error("uPlot po načtení není dostupný."));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("uPlot se nepodařilo načíst z CDN.")), { once: true });
    document.head.append(script);
  });

  return libraryPromise;
}

function ensureHost() {
  if (host) return host;
  fallbackCanvas = elements.plotCanvas;
  host = document.createElement("div");
  host.id = "uPlotSpectrum";
  host.className = "spectrum-uplot-host";
  host.setAttribute("role", "img");
  host.setAttribute("aria-label", "Interaktivní graf spektra");

  emptyState = document.createElement("div");
  emptyState.className = "spectrum-empty";
  emptyState.textContent = "Spektrum se zobrazí po spuštění kamery.";
  host.append(emptyState);
  fallbackCanvas.after(host);

  const panel = fallbackCanvas.closest(".plot-panel");
  const heading = panel?.querySelector(".panel-heading-row");
  if (heading && elements.peakOutput) {
    const actions = document.createElement("div");
    actions.className = "spectrum-chart-actions";
    resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "button ghost";
    resetButton.textContent = "Reset zoomu";
    resetButton.title = "Obnovit celý rozsah osy X";
    resetButton.disabled = true;
    actions.append(resetButton, elements.peakOutput);
    heading.append(actions);
    resetButton.addEventListener("click", resetZoom);
  }

  if (panel) {
    const toolbar = document.createElement("div");
    toolbar.className = "spectrum-peak-toolbar";

    const peakLabel = document.createElement("label");
    peakLabel.className = "spectrum-inline-control";
    peakToggle = document.createElement("input");
    peakToggle.type = "checkbox";
    peakToggle.checked = true;
    peakLabel.append(peakToggle, document.createTextNode(" Píky"));

    const sensitivityLabel = document.createElement("label");
    sensitivityLabel.className = "spectrum-inline-control spectrum-sensitivity-control";
    sensitivityLabel.append(document.createTextNode("Citlivost "));
    peakSensitivity = document.createElement("select");
    for (const [value, preset] of Object.entries(PEAK_PRESETS)) {
      peakSensitivity.append(new Option(preset.label, value, false, value === "medium"));
    }
    sensitivityLabel.append(peakSensitivity);

    calibration1Button = document.createElement("button");
    calibration1Button.type = "button";
    calibration1Button.className = "button ghost spectrum-calibration-button";
    calibration1Button.textContent = "Kal. bod 1";
    calibration1Button.title = "Vyberte a potom klikněte na pík pro nastavení Pixel 1";

    calibration2Button = document.createElement("button");
    calibration2Button.type = "button";
    calibration2Button.className = "button ghost spectrum-calibration-button";
    calibration2Button.textContent = "Kal. bod 2";
    calibration2Button.title = "Vyberte a potom klikněte na pík pro nastavení Pixel 2";

    peakStatus = document.createElement("span");
    peakStatus.className = "spectrum-peak-status";
    peakStatus.textContent = "";

    toolbar.append(peakLabel, sensitivityLabel, calibration1Button, calibration2Button, peakStatus);
    host.after(toolbar);

    const hint = document.createElement("p");
    hint.className = "spectrum-interaction-hint";
    hint.textContent = "Tažení: zoom · kolečko: zoom kolem kurzoru · Shift + tažení nebo prostřední tlačítko: posun · dvojklik: reset. Pro kalibraci zvolte Kal. bod 1/2 a klikněte na označený pík.";
    toolbar.after(hint);

    peakToggle.addEventListener("change", () => renderPeakMarkers(chart));
    peakSensitivity.addEventListener("change", () => {
      recomputePeaks();
      renderPeakMarkers(chart);
    });
    calibration1Button.addEventListener("click", () => setCalibrationTarget(1));
    calibration2Button.addEventListener("click", () => setCalibrationTarget(2));
  }

  return host;
}

function activateUPlot() {
  ensureHost();
  fallbackCanvas.style.display = "none";
  host.style.display = "block";
}

function fallbackToCanvas(error) {
  console.error(error);
  if (host) host.style.display = "none";
  if (fallbackCanvas) fallbackCanvas.style.display = "block";
}

function calibration() {
  const p1 = toFiniteNumber(elements.pixel1.value, 0);
  const p2 = toFiniteNumber(elements.pixel2.value, 1);
  const w1 = toFiniteNumber(elements.wavelength1.value, 400);
  const w2 = toFiniteNumber(elements.wavelength2.value, 700);
  if (p1 === p2) return null;
  const slope = (w2 - w1) / (p2 - p1);
  return { slope, intercept: w1 - slope * p1 };
}

function processedSpectrum() {
  if (!state.averagedSpectrum) return null;
  const subtract = elements.subtractDark.checked
    && state.darkSpectrum
    && state.darkSpectrum.luminance.length === state.averagedSpectrum.luminance.length;
  if (!subtract) return state.averagedSpectrum;

  const result = {};
  for (const name of CHANNELS) {
    result[name] = Float32Array.from(
      state.averagedSpectrum[name],
      (value, index) => Math.max(0, value - state.darkSpectrum[name][index]),
    );
  }
  return result;
}

function seriesVisibility() {
  const visibility = [
    elements.showLuminance.checked,
    elements.showRed.checked,
    elements.showGreen.checked,
    elements.showBlue.checked,
  ];
  if (!visibility.some(Boolean)) visibility[0] = true;
  return visibility;
}

function makeChartData(spectrum) {
  const currentCalibration = calibration();
  const roiX = state.roi?.x ?? 0;
  const length = spectrum.luminance.length;
  const x = new Array(length);
  const sensorPixels = new Array(length);

  for (let index = 0; index < length; index += 1) {
    const sensorPixel = roiX + index;
    sensorPixels[index] = sensorPixel;
    x[index] = currentCalibration
      ? currentCalibration.slope * sensorPixel + currentCalibration.intercept
      : sensorPixel;
  }

  const data = [
    x,
    Array.from(spectrum.luminance),
    Array.from(spectrum.red),
    Array.from(spectrum.green),
    Array.from(spectrum.blue),
  ];

  if (length > 1 && x[0] > x[length - 1]) {
    for (const values of data) values.reverse();
    sensorPixels.reverse();
  }

  return {
    data,
    sensorPixels,
    calibrated: Boolean(currentCalibration),
    domain: length ? [data[0][0], data[0][length - 1]] : null,
  };
}

function wavelengthRgb(wavelength) {
  if (!Number.isFinite(wavelength)) return [90, 98, 112];
  if (wavelength < 380) return [93, 67, 145];
  if (wavelength > 780) return [135, 55, 55];

  let red = 0;
  let green = 0;
  let blue = 0;

  if (wavelength < 440) {
    red = -(wavelength - 440) / 60;
    blue = 1;
  } else if (wavelength < 490) {
    green = (wavelength - 440) / 50;
    blue = 1;
  } else if (wavelength < 510) {
    green = 1;
    blue = -(wavelength - 510) / 20;
  } else if (wavelength < 580) {
    red = (wavelength - 510) / 70;
    green = 1;
  } else if (wavelength < 645) {
    red = 1;
    green = -(wavelength - 645) / 65;
  } else {
    red = 1;
  }

  let factor = 1;
  if (wavelength < 420) factor = 0.3 + 0.7 * (wavelength - 380) / 40;
  else if (wavelength > 700) factor = 0.3 + 0.7 * (780 - wavelength) / 80;

  const gamma = 0.8;
  const channel = value => Math.round(255 * Math.pow(Math.max(0, value * factor), gamma));
  return [channel(red), channel(green), channel(blue)];
}

function spectralGradient(min, max, alpha) {
  if (!chartCalibrated || !Number.isFinite(min) || !Number.isFinite(max) || min === max) return "none";
  const stops = [];
  const count = 36;
  for (let index = 0; index <= count; index += 1) {
    const fraction = index / count;
    const wavelength = min + (max - min) * fraction;
    const [red, green, blue] = wavelengthRgb(wavelength);
    stops.push(`rgba(${red}, ${green}, ${blue}, ${alpha}) ${(fraction * 100).toFixed(2)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function updateSpectralLayers(u) {
  if (!background || !colorStrip) return;
  const min = Number(u.scales.x.min);
  const max = Number(u.scales.x.max);
  if (!chartCalibrated) {
    background.style.background = "none";
    colorStrip.style.background = "none";
    colorStrip.hidden = true;
    return;
  }

  background.style.background = spectralGradient(min, max, 0.095);
  colorStrip.style.background = spectralGradient(min, max, 0.9);
  colorStrip.hidden = false;
}

function smoothValues(values, radius = 2) {
  if (!values?.length) return [];
  const smoothed = new Array(values.length);
  let sum = 0;
  let left = 0;
  let right = -1;

  for (let index = 0; index < values.length; index += 1) {
    const targetLeft = Math.max(0, index - radius);
    const targetRight = Math.min(values.length - 1, index + radius);
    while (right < targetRight) sum += Number(values[++right]) || 0;
    while (left < targetLeft) sum -= Number(values[left++]) || 0;
    smoothed[index] = sum / (right - left + 1);
  }
  return smoothed;
}

function detectPeaks(xValues, values, sensorPixels) {
  if (!values?.length || values.length < 7) return [];
  const preset = PEAK_PRESETS[peakSensitivity?.value] ?? PEAK_PRESETS.medium;
  const smoothed = smoothValues(values, 2);
  const maximum = Math.max(...smoothed);
  if (!Number.isFinite(maximum) || maximum <= 0) return [];

  const minimumHeight = Math.max(5, maximum * preset.heightFraction);
  const minimumProminence = Math.max(preset.absoluteProminence, maximum * preset.prominenceFraction);
  const windowRadius = Math.max(6, Math.min(28, Math.round(values.length / 90)));
  const candidates = [];

  for (let index = 2; index < smoothed.length - 2; index += 1) {
    const value = smoothed[index];
    if (value < minimumHeight) continue;
    if (!(value >= smoothed[index - 1] && value > smoothed[index + 1])) continue;

    let leftMinimum = value;
    let rightMinimum = value;
    for (let offset = 1; offset <= windowRadius && index - offset >= 0; offset += 1) {
      leftMinimum = Math.min(leftMinimum, smoothed[index - offset]);
    }
    for (let offset = 1; offset <= windowRadius && index + offset < smoothed.length; offset += 1) {
      rightMinimum = Math.min(rightMinimum, smoothed[index + offset]);
    }

    const baseline = Math.max(leftMinimum, rightMinimum);
    const prominence = value - baseline;
    if (prominence < minimumProminence) continue;

    candidates.push({
      index,
      x: Number(xValues[index]),
      sensorPixel: Number(sensorPixels[index]),
      value: Number(values[index]),
      smoothedValue: value,
      prominence,
    });
  }

  candidates.sort((a, b) => b.prominence - a.prominence || b.value - a.value);
  const selected = [];
  const minimumIndexDistance = Math.max(4, Math.round(values.length / 220));
  for (const candidate of candidates) {
    if (selected.some(peak => Math.abs(peak.index - candidate.index) < minimumIndexDistance)) continue;
    selected.push(candidate);
    if (selected.length >= 40) break;
  }
  return selected.sort((a, b) => a.x - b.x);
}

function recomputePeaks() {
  if (!chart?.data?.[0]?.length) {
    currentPeaks = [];
    return;
  }
  currentPeaks = detectPeaks(chart.data[0], chart.data[1], currentSensorPixels);
}

function visiblePeakSelection(u) {
  if (!peakToggle?.checked || !currentPeaks.length) return [];
  const min = Number(u.scales.x.min);
  const max = Number(u.scales.x.max);
  const visible = currentPeaks.filter(peak => peak.x >= min && peak.x <= max);
  if (!visible.length) return [];

  const maximumLabels = Math.max(4, Math.min(14, Math.floor(u.over.clientWidth / 78)));
  const ranked = [...visible].sort((a, b) => b.prominence - a.prominence || b.value - a.value);
  const chosen = [];
  const occupied = [];

  for (const peak of ranked) {
    const x = u.valToPos(peak.x, "x");
    if (!Number.isFinite(x)) continue;
    if (occupied.some(position => Math.abs(position - x) < 56)) continue;
    occupied.push(x);
    chosen.push(peak);
    if (chosen.length >= maximumLabels) break;
  }
  return chosen.sort((a, b) => a.x - b.x);
}

function renderPeakMarkers(u) {
  if (!u || !peakLayer) return;
  peakLayer.replaceChildren();
  const peaks = visiblePeakSelection(u);

  for (const peak of peaks) {
    const left = u.valToPos(peak.x, "x");
    const top = u.valToPos(peak.value, "y");
    if (!Number.isFinite(left) || !Number.isFinite(top)) continue;

    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "spectrum-peak-marker";
    marker.style.left = `${left}px`;
    marker.style.top = `${Math.max(4, top)}px`;
    marker.title = `${chartCalibrated ? `${peak.x.toFixed(2)} nm` : `pixel ${peak.sensorPixel}`} · intenzita ${peak.value.toFixed(1)} · prominence ${peak.prominence.toFixed(1)}`;
    marker.innerHTML = `<span class="spectrum-peak-stem"></span><span class="spectrum-peak-dot"></span><span class="spectrum-peak-label">${chartCalibrated ? `${peak.x.toFixed(1)} nm` : `px ${Math.round(peak.sensorPixel)}`}</span>`;
    marker.addEventListener("mousedown", event => event.stopPropagation());
    marker.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      selectPeak(peak);
    });
    peakLayer.append(marker);
  }

  if (peakStatus && !activeCalibrationTarget) {
    peakStatus.textContent = currentPeaks.length ? `${currentPeaks.length} detekovaných` : "Žádné píky";
  }
}

function setCalibrationTarget(target) {
  activeCalibrationTarget = activeCalibrationTarget === target ? null : target;
  calibration1Button?.classList.toggle("active", activeCalibrationTarget === 1);
  calibration2Button?.classList.toggle("active", activeCalibrationTarget === 2);
  if (peakStatus) {
    peakStatus.textContent = activeCalibrationTarget
      ? `Klikněte na pík pro Pixel ${activeCalibrationTarget}`
      : currentPeaks.length ? `${currentPeaks.length} detekovaných` : "";
  }
}

function selectPeak(peak) {
  if (!activeCalibrationTarget) {
    if (peakStatus) {
      peakStatus.textContent = `${chartCalibrated ? `${peak.x.toFixed(2)} nm` : `pixel ${peak.sensorPixel}`}, I=${peak.value.toFixed(1)}`;
    }
    return;
  }

  const target = activeCalibrationTarget === 1 ? elements.pixel1 : elements.pixel2;
  target.value = String(Math.round(peak.sensorPixel));
  target.dispatchEvent(new Event("input", { bubbles: true }));
  if (peakStatus) peakStatus.textContent = `Pixel ${activeCalibrationTarget} = ${Math.round(peak.sensorPixel)}`;
  activeCalibrationTarget = null;
  calibration1Button?.classList.remove("active");
  calibration2Button?.classList.remove("active");
}

function spectralPlugin() {
  return {
    hooks: {
      ready: [u => {
        background = document.createElement("div");
        background.className = "spectrum-background";
        colorStrip = document.createElement("div");
        colorStrip.className = "spectrum-color-strip";
        peakLayer = document.createElement("div");
        peakLayer.className = "spectrum-peak-layer";
        u.under.prepend(background);
        u.over.append(colorStrip, peakLayer);
        updateSpectralLayers(u);
        renderPeakMarkers(u);
      }],
      draw: [u => {
        updateSpectralLayers(u);
        renderPeakMarkers(u);
      }],
      setScale: [u => {
        updateSpectralLayers(u);
        renderPeakMarkers(u);
      }],
    },
  };
}

function tooltipPlugin() {
  return {
    hooks: {
      ready: [u => {
        tooltip = document.createElement("div");
        tooltip.className = "spectrum-tooltip";
        tooltip.hidden = true;
        u.over.append(tooltip);
      }],
      setCursor: [u => updateTooltip(u)],
    },
  };
}

function updateTooltip(u) {
  if (!tooltip) return;
  const index = u.cursor.idx;
  if (index === null || index === undefined || !u.data[0]?.length) {
    tooltip.hidden = true;
    return;
  }

  const xValue = Number(u.data[0][index]);
  const sensorPixel = Number(currentSensorPixels[index]);
  const visibility = seriesVisibility();
  const rows = [];
  for (let seriesIndex = 0; seriesIndex < SERIES.length; seriesIndex += 1) {
    if (!visibility[seriesIndex]) continue;
    const value = Number(u.data[seriesIndex + 1]?.[index]);
    if (!Number.isFinite(value)) continue;
    rows.push(`<span class="spectrum-tooltip-row"><span>${SERIES[seriesIndex].label}</span><strong>${value.toFixed(1)}</strong></span>`);
  }

  const heading = chartCalibrated
    ? `${xValue.toFixed(2)} nm <small>· px ${Math.round(sensorPixel)}</small>`
    : `pixel ${Math.round(xValue)}`;
  tooltip.innerHTML = `<strong>${heading}</strong>${rows.join("")}`;
  tooltip.hidden = false;

  const left = Math.min(
    Math.max(6, Number(u.cursor.left) + 14),
    Math.max(6, u.over.clientWidth - tooltip.offsetWidth - 6),
  );
  const top = Math.min(
    Math.max(6, Number(u.cursor.top) + 14),
    Math.max(6, u.over.clientHeight - tooltip.offsetHeight - 18),
  );
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function clampDomain(min, max) {
  if (!fullDomain) return [min, max];
  const [fullMin, fullMax] = fullDomain;
  const span = max - min;
  const fullSpan = fullMax - fullMin;
  if (!Number.isFinite(span) || span <= 0 || span >= fullSpan) return [fullMin, fullMax];
  if (min < fullMin) return [fullMin, fullMin + span];
  if (max > fullMax) return [fullMax - span, fullMax];
  return [min, max];
}

function resetZoom() {
  if (!chart || !fullDomain) return;
  chart.setScale("x", { min: fullDomain[0], max: fullDomain[1] });
}

function installInteractions(u) {
  const over = u.over;

  over.addEventListener("wheel", event => {
    if (!fullDomain || !Number.isFinite(u.scales.x.min) || !Number.isFinite(u.scales.x.max)) return;
    event.preventDefault();
    const min = Number(u.scales.x.min);
    const max = Number(u.scales.x.max);
    const span = max - min;
    if (span <= 0) return;

    if (event.shiftKey) {
      const direction = Math.sign(event.deltaY || event.deltaX);
      const delta = direction * span * 0.12;
      const [nextMin, nextMax] = clampDomain(min + delta, max + delta);
      u.setScale("x", { min: nextMin, max: nextMax });
      return;
    }

    const rect = over.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
    const anchor = min + span * fraction;
    const factor = event.deltaY < 0 ? 0.8 : 1.25;
    const minimumSpan = Math.max((fullDomain[1] - fullDomain[0]) / 500, Number.EPSILON);
    let nextMin = anchor - (anchor - min) * factor;
    let nextMax = anchor + (max - anchor) * factor;
    if (nextMax - nextMin < minimumSpan) {
      nextMin = anchor - minimumSpan / 2;
      nextMax = anchor + minimumSpan / 2;
    }
    [nextMin, nextMax] = clampDomain(nextMin, nextMax);
    u.setScale("x", { min: nextMin, max: nextMax });
  }, { passive: false });

  over.addEventListener("mousedown", event => {
    if (!(event.shiftKey && event.button === 0) && event.button !== 1) return;
    if (!Number.isFinite(u.scales.x.min) || !Number.isFinite(u.scales.x.max)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    panning = {
      startX: event.clientX,
      min: Number(u.scales.x.min),
      max: Number(u.scales.x.max),
      width: Math.max(1, over.clientWidth),
    };
  }, true);

  window.addEventListener("mousemove", event => {
    if (!panning || !chart || chart !== u) return;
    event.preventDefault();
    const span = panning.max - panning.min;
    const delta = -(event.clientX - panning.startX) / panning.width * span;
    const [min, max] = clampDomain(panning.min + delta, panning.max + delta);
    u.setScale("x", { min, max });
  });

  window.addEventListener("mouseup", () => {
    if (chart === u) panning = null;
  });

  over.addEventListener("dblclick", event => {
    event.preventDefault();
    resetZoom();
  });
}

function createChart(uPlotClass, data, calibrated) {
  ensureHost();
  chartCalibrated = calibrated;
  host.replaceChildren(emptyState);
  emptyState.hidden = true;

  const visibility = seriesVisibility();
  const options = {
    width: Math.max(320, Math.round(host.clientWidth)),
    height: Math.max(240, Math.round(host.clientHeight)),
    scales: {
      x: { time: false },
      y: {
        range: (_u, _min, max) => [0, Math.min(255, Math.max(1, max * 1.06))],
      },
    },
    axes: [
      {
        label: calibrated ? "Vlnová délka [nm]" : "Pixel senzoru",
        stroke: "#97a9bd",
        grid: { stroke: "rgba(151, 169, 189, 0.18)", width: 1 },
        ticks: { stroke: "rgba(151, 169, 189, 0.35)", width: 1 },
        values: (_u, values) => values.map(value => calibrated ? `${value.toFixed(0)}` : `${Math.round(value)}`),
      },
      {
        label: "Relativní intenzita",
        stroke: "#97a9bd",
        grid: { stroke: "rgba(151, 169, 189, 0.18)", width: 1 },
        ticks: { stroke: "rgba(151, 169, 189, 0.35)", width: 1 },
      },
    ],
    series: [
      {},
      ...SERIES.map((series, index) => ({
        label: series.label,
        stroke: series.stroke,
        width: series.key === "luminance" ? 1.6 : 1.25,
        show: visibility[index],
        points: { show: false },
        value: (_u, value) => Number.isFinite(value) ? value.toFixed(1) : "–",
      })),
    ],
    legend: { show: false },
    cursor: {
      show: true,
      x: true,
      y: true,
      points: { show: false },
      drag: { x: true, y: false, setScale: true },
    },
    plugins: [spectralPlugin(), tooltipPlugin()],
    hooks: {
      ready: [u => installInteractions(u)],
    },
  };

  chart = new uPlotClass(options, data, host);
  recomputePeaks();
  renderPeakMarkers(chart);
  if (resetButton) resetButton.disabled = false;

  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(entries => {
    const entry = entries[0];
    if (!entry || !chart) return;
    const width = Math.max(320, Math.round(entry.contentRect.width));
    const height = Math.max(240, Math.round(entry.contentRect.height));
    if (chart.width !== width || chart.height !== height) chart.setSize({ width, height });
  });
  resizeObserver.observe(host);
}

function updateSeriesVisibility() {
  if (!chart) return;
  const visibility = seriesVisibility();
  for (let index = 0; index < visibility.length; index += 1) {
    if (chart.series[index + 1].show !== visibility[index]) {
      chart.setSeries(index + 1, { show: visibility[index] });
    }
  }
}

function renderCurrentSpectrum(uPlotClass) {
  ensureHost();
  const spectrum = processedSpectrum();
  if (!spectrum || !state.roi) {
    currentPeaks = [];
    if (emptyState) emptyState.hidden = false;
    if (peakLayer) peakLayer.replaceChildren();
    return;
  }

  const prepared = makeChartData(spectrum);
  if (!prepared.domain || prepared.data[0].length < 2) return;
  fullDomain = prepared.domain;
  currentSensorPixels = prepared.sensorPixels;

  const signature = [
    prepared.calibrated ? "nm" : "px",
    prepared.domain[0],
    prepared.domain[1],
    prepared.data[0].length,
  ].join(":");

  if (!chart || chartCalibrated !== prepared.calibrated) {
    chart?.destroy();
    chart = null;
    tooltip = null;
    background = null;
    colorStrip = null;
    peakLayer = null;
    createChart(uPlotClass, prepared.data, prepared.calibrated);
    lastSignature = signature;
    return;
  }

  const resetScales = signature !== lastSignature;
  chart.setData(prepared.data, resetScales);
  recomputePeaks();
  updateSeriesVisibility();
  if (resetScales) chart.setScale("x", { min: prepared.domain[0], max: prepared.domain[1] });
  else renderPeakMarkers(chart);
  lastSignature = signature;
  if (emptyState) emptyState.hidden = true;
}

function refreshNeeded() {
  const calibrationSignature = [
    elements.pixel1.value,
    elements.wavelength1.value,
    elements.pixel2.value,
    elements.wavelength2.value,
    state.roi?.x,
    state.roi?.width,
    elements.subtractDark.checked,
    elements.showLuminance.checked,
    elements.showRed.checked,
    elements.showGreen.checked,
    elements.showBlue.checked,
  ].join("|");

  const changed = state.averagedSpectrum !== lastSpectrum
    || state.darkSpectrum !== lastDarkSpectrum
    || calibrationSignature !== refreshNeeded.signature;

  lastSpectrum = state.averagedSpectrum;
  lastDarkSpectrum = state.darkSpectrum;
  refreshNeeded.signature = calibrationSignature;
  return changed;
}
refreshNeeded.signature = "";

export function installUPlotSpectrum() {
  ensureHost();

  loadUPlot()
    .then(uPlotClass => {
      activateUPlot();
      renderCurrentSpectrum(uPlotClass);
      refreshTimer = window.setInterval(() => {
        if (refreshNeeded()) renderCurrentSpectrum(uPlotClass);
      }, 100);
    })
    .catch(fallbackToCanvas);

  window.addEventListener("beforeunload", () => {
    if (refreshTimer !== null) window.clearInterval(refreshTimer);
    resizeObserver?.disconnect();
    chart?.destroy();
  });
}
