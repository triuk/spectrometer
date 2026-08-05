import {
  captureContext,
  elements,
  setControlStatus,
  state,
} from "./core.js";
import { clearDarkSpectrum } from "./spectrum.js";

const TARGET_PEAK = 220;
const TARGET_LOW = 205;
const TARGET_HIGH = 232;
const SETTLE_MS = 500;
const MAX_ITERATIONS = 14;
const FIXED_WHITE_BALANCE = 4600;

let selected = true;
let optimizing = false;
let activeTrack = null;
let runToken = 0;
let monitorTimer = null;
let uiTimer = null;
let lastPeak = null;
let lastExposure = null;
let fixedWhiteBalance = null;

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function capabilityRange(name) {
  const capability = state.capabilities[name];
  if (!capability || typeof capability.min !== "number" || typeof capability.max !== "number") return null;
  return {
    min: capability.min,
    max: capability.max,
    step: Number(capability.step) || 1,
  };
}

function quantize(value, range) {
  const stepped = range.min + Math.round((value - range.min) / range.step) * range.step;
  return clamp(stepped, range.min, range.max);
}

function supportsMode(name, value) {
  return Array.isArray(state.capabilities[name]) && state.capabilities[name].includes(value);
}

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function maintainSoftwareUi() {
  elements.autoModeButton.textContent = "Automaticky (SW)";
  if (!selected || !state.track) return;

  document.documentElement.dataset.softwareAutoExposure = "active";
  elements.autoModeButton.classList.add("active");
  elements.autoModeButton.setAttribute("aria-pressed", "true");
  elements.manualModeButton.classList.remove("active");
  elements.manualModeButton.setAttribute("aria-pressed", "false");

  const automaticPanel = document.querySelector(".automatic-image-readout");
  const manualPanel = document.querySelector(".manual-image-section");
  if (automaticPanel) automaticPanel.hidden = false;
  if (manualPanel) manualPanel.hidden = true;

  if (automaticPanel) {
    const heading = automaticPanel.querySelector("strong");
    const note = automaticPanel.querySelector(".automatic-image-note");
    const exposureOutput = automaticPanel.querySelector('[data-auto-readout="exposureTime"]');
    const temperatureOutput = automaticPanel.querySelector('[data-auto-readout="colorTemperature"]');

    setText(heading, optimizing ? "Probíhá SW optimalizace" : "SW expozice uzamčena");
    setText(
      note,
      "Kamera běží fyzicky v ručním režimu. Software jednorázově nastaví expozici podle maxima ve vybrané ROI; bílá a obrazové korekce zůstávají pevné.",
    );
    setText(
      exposureOutput,
      lastExposure === null
        ? "Čeká na optimalizaci"
        : `${lastExposure}${lastPeak === null ? "" : ` · maximum ${lastPeak}/255`}`,
    );
    setText(
      temperatureOutput,
      fixedWhiteBalance === null ? "Pevná ruční hodnota" : `${fixedWhiteBalance} K · pevně`,
    );
  }
}

function stopSoftwareSelection() {
  selected = false;
  optimizing = false;
  runToken += 1;
  document.documentElement.dataset.softwareAutoExposure = "inactive";
}

function chooseFixedWhiteBalance(settings) {
  const range = capabilityRange("colorTemperature");
  if (!range) return null;

  const current = Number(settings.colorTemperature);
  const preferred = settings.whiteBalanceMode === "manual" && Number.isFinite(current)
    ? current
    : FIXED_WHITE_BALANCE;
  return quantize(preferred, range);
}

async function forcePhysicalManualMode(track) {
  const settings = track.getSettings();
  const values = {};

  if (supportsMode("exposureMode", "manual")) values.exposureMode = "manual";
  if (supportsMode("whiteBalanceMode", "manual")) values.whiteBalanceMode = "manual";

  fixedWhiteBalance = chooseFixedWhiteBalance(settings);
  if (fixedWhiteBalance !== null) values.colorTemperature = fixedWhiteBalance;

  if (!Object.keys(values).length) throw new Error("Kamera neposkytuje ruční režim expozice.");

  await track.applyConstraints({ advanced: [values] });
  await delay(250);

  const actual = track.getSettings();
  if (supportsMode("exposureMode", "manual") && actual.exposureMode !== "manual") {
    throw new Error(`kamera stále hlásí exposureMode=${actual.exposureMode ?? "?"}`);
  }
}

function normalisedRoi() {
  const width = elements.video.videoWidth;
  const height = elements.video.videoHeight;
  if (!width || !height) return null;

  const roi = state.roi ?? { x: 0, y: 0, width, height };
  const x = clamp(Math.round(roi.x), 0, width - 1);
  const y = clamp(Math.round(roi.y), 0, height - 1);
  return {
    x,
    y,
    width: clamp(Math.round(roi.width), 1, width - x),
    height: clamp(Math.round(roi.height), 1, height - y),
  };
}

function measureSpectralPeak() {
  if (!state.track || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  const roi = normalisedRoi();
  if (!roi) return null;

  if (elements.captureCanvas.width !== elements.video.videoWidth
      || elements.captureCanvas.height !== elements.video.videoHeight) {
    elements.captureCanvas.width = elements.video.videoWidth;
    elements.captureCanvas.height = elements.video.videoHeight;
  }

  captureContext.drawImage(
    elements.video,
    0,
    0,
    elements.captureCanvas.width,
    elements.captureCanvas.height,
  );

  const image = captureContext.getImageData(roi.x, roi.y, roi.width, roi.height);
  const data = image.data;
  const verticalStep = Math.max(1, Math.floor(roi.height / 48));
  let peak = 0;

  // Pro každý sloupec zprůměrujeme výšku ROI a hledáme nejvyšší barevný
  // kanál. To zachová i úzké spektrální čáry a potlačí jednotlivé vadné pixely.
  for (let x = 0; x < roi.width; x += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let samples = 0;

    for (let y = 0; y < roi.height; y += verticalStep) {
      const offset = (y * roi.width + x) * 4;
      red += data[offset];
      green += data[offset + 1];
      blue += data[offset + 2];
      samples += 1;
    }

    if (!samples) continue;
    peak = Math.max(peak, red / samples, green / samples, blue / samples);
  }

  return Math.round(peak);
}

function nextExposure(current, peak, range) {
  let factor;
  if (peak <= 1) factor = 4;
  else factor = TARGET_PEAK / peak;

  if (peak >= 248) factor = Math.min(factor, 0.45);
  factor = clamp(factor, 0.25, 4);

  let next = quantize(current * factor, range);
  if (next === current && peak < TARGET_LOW && current < range.max) {
    next = quantize(current + range.step, range);
  } else if (next === current && peak > TARGET_HIGH && current > range.min) {
    next = quantize(current - range.step, range);
  }
  return next;
}

async function applyExposure(track, value) {
  await track.applyConstraints({
    advanced: [{ exposureMode: "manual", exposureTime: value }],
  });
  await delay(SETTLE_MS);
  const actual = Number(track.getSettings().exposureTime);
  return Number.isFinite(actual) ? actual : value;
}

async function optimiseExposure({ automaticStart = false } = {}) {
  if (!state.track || optimizing) return;

  selected = true;
  optimizing = true;
  const token = ++runToken;
  const track = state.track;
  const range = capabilityRange("exposureTime");
  lastPeak = null;
  lastExposure = null;
  maintainSoftwareUi();

  if (!range) {
    optimizing = false;
    setControlStatus("SW optimalizace není dostupná: kamera nezpřístupnila ruční expoziční čas.", true);
    maintainSoftwareUi();
    return;
  }

  if (state.darkSpectrum) clearDarkSpectrum();
  setControlStatus(automaticStart
    ? "Inicializuji SW automatickou expozici…"
    : "Optimalizuji expozici podle vybrané ROI…");

  try {
    await forcePhysicalManualMode(track);
    let stableMeasurements = 0;

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
      if (token !== runToken || track !== state.track || !selected) return;

      await delay(iteration === 1 ? SETTLE_MS : 100);
      const peak = measureSpectralPeak();
      if (peak === null) continue;

      const settings = track.getSettings();
      const current = clamp(Number(settings.exposureTime) || range.min, range.min, range.max);
      lastPeak = peak;
      lastExposure = current;
      maintainSoftwareUi();

      if (peak >= TARGET_LOW && peak <= TARGET_HIGH) {
        stableMeasurements += 1;
        setControlStatus(`SW optimalizace: maximum ${peak}/255, expozice ${current} · ověřuji stabilitu…`);
        if (stableMeasurements >= 2) break;
        await delay(SETTLE_MS);
        continue;
      }

      stableMeasurements = 0;
      const next = nextExposure(current, peak, range);
      if (next === current) break;

      setControlStatus(`SW optimalizace ${iteration}/${MAX_ITERATIONS}: maximum ${peak}/255, expozice ${current} → ${next}`);
      lastExposure = await applyExposure(track, next);
      maintainSoftwareUi();
    }

    if (token !== runToken || track !== state.track || !selected) return;

    await delay(SETTLE_MS);
    lastPeak = measureSpectralPeak();
    lastExposure = Number(track.getSettings().exposureTime) || lastExposure;

    if (lastPeak !== null && lastPeak > 245) {
      setControlStatus(`SW expozice uzamčena na ${lastExposure}, ale maximum ${lastPeak}/255 je blízko přepalu.`, true);
    } else if (lastPeak !== null && lastPeak < 160 && lastExposure >= range.max) {
      setControlStatus(`SW expozice dosáhla maxima ${lastExposure}, ale signál zůstává slabý (${lastPeak}/255).`, true);
    } else {
      setControlStatus(`SW optimalizace dokončena: expozice ${lastExposure}, maximum ${lastPeak ?? "?"}/255. Parametry jsou nyní pevné.`);
    }
  } catch (error) {
    console.error(error);
    setControlStatus(`SW optimalizace selhala: ${error.message}`, true);
  } finally {
    if (token === runToken) optimizing = false;
    maintainSoftwareUi();
  }
}

function monitorCamera() {
  if (state.track === activeTrack) return;
  activeTrack = state.track;
  lastPeak = null;
  lastExposure = null;
  fixedWhiteBalance = null;
  optimizing = false;
  runToken += 1;

  if (!state.track) {
    document.documentElement.dataset.softwareAutoExposure = "inactive";
    return;
  }

  selected = true;
  const track = state.track;
  window.setTimeout(() => {
    if (track === state.track && selected && state.roi) optimiseExposure({ automaticStart: true });
  }, 700);
}

export function installSoftwareAutoExposure() {
  const help = document.querySelector("#imageSettingsHelp");
  if (help) {
    help.textContent = "Automaticky (SW) jednorázově nastaví ruční expozici podle maxima ve vybrané ROI a potom ji uzamkne. Vyvážení bílé a korekce obrazu zůstávají pevné, aby se neměnil tvar spektra.";
  }

  elements.autoModeButton.textContent = "Automaticky (SW)";

  elements.autoModeButton.addEventListener("click", (event) => {
    if (!state.track) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    optimiseExposure();
  }, { capture: true });

  elements.manualModeButton.addEventListener("click", () => {
    stopSoftwareSelection();
  }, { capture: true });

  monitorTimer = window.setInterval(monitorCamera, 150);
  uiTimer = window.setInterval(maintainSoftwareUi, 250);
  window.addEventListener("beforeunload", () => {
    window.clearInterval(monitorTimer);
    window.clearInterval(uiTimer);
  });

  maintainSoftwareUi();
}
