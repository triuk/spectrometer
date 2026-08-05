import {
  elements,
  setControlStatus,
  state,
} from "./core.js";
import { updateDiagnostics } from "./camera.js";

const MANUAL_VALUES_KEY = "spectrometer.manualImageValues";
const AUTO_VALUE = "continuous";
const MANUAL_VALUE = "manual";
const MODE_NAMES = ["exposureMode", "whiteBalanceMode"];
const AUTO_CONTROLLED_NAMES = new Set(["exposureTime", "colorTemperature"]);
const CORRECTION_NAMES = new Set(["brightness", "contrast", "saturation", "sharpness"]);
const CAPTURE_NAMES = ["width", "height", "frameRate"];
const CONTROL_LABELS = {
  exposureTime: "Expozice",
  colorTemperature: "Teplota bílé",
  brightness: "Jas",
  contrast: "Kontrast",
  saturation: "Saturace",
  sharpness: "Ostrost",
};

let manualValues = loadManualValues();
let applying = false;
let organising = false;
let initialisedTrack = null;
let refreshTimer = null;
let ui = null;

function loadManualValues() {
  try {
    const stored = JSON.parse(localStorage.getItem(MANUAL_VALUES_KEY) ?? "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function saveManualValues() {
  localStorage.setItem(MANUAL_VALUES_KEY, JSON.stringify(manualValues));
}

function makeElement(tagName, className, text = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function buildStructuredUi() {
  if (ui) return ui;

  const legacyDetails = elements.cameraControlsDetails;
  const source = elements.cameraControls;

  const automatic = makeElement("div", "automatic-image-readout");
  automatic.innerHTML = `
    <div>
      <strong>Automatika kamery</strong>
      <span class="automatic-image-note">Expozici a vyvážení bílé řídí firmware kamery.</span>
    </div>
    <dl class="automatic-values">
      <div><dt>Expozice</dt><dd data-auto-readout="exposureTime">–</dd></div>
      <div><dt>Teplota bílé</dt><dd data-auto-readout="colorTemperature">–</dd></div>
    </dl>
  `;

  const manualSection = makeElement("section", "manual-image-section");
  manualSection.hidden = true;
  manualSection.append(makeElement("h3", "image-subheading", "Ruční expozice a vyvážení bílé"));
  const manualControls = makeElement("div", "camera-controls manual-camera-controls");
  manualSection.append(manualControls);

  const corrections = makeElement("details", "image-settings-details image-corrections");
  const correctionsSummary = document.createElement("summary");
  correctionsSummary.innerHTML = `
    <span>Korekce obrazu</span>
    <span class="details-state">Jas, kontrast, saturace, ostrost</span>
  `;
  const correctionControls = makeElement("div", "camera-controls correction-camera-controls");
  corrections.append(correctionsSummary, correctionControls);

  source.classList.add("camera-controls-source");
  source.hidden = true;
  legacyDetails.before(automatic, manualSection, corrections, source);
  legacyDetails.remove();

  ui = {
    source,
    automatic,
    manualSection,
    manualControls,
    corrections,
    correctionControls,
    exposureReadout: automatic.querySelector('[data-auto-readout="exposureTime"]'),
    temperatureReadout: automatic.querySelector('[data-auto-readout="colorTemperature"]'),
  };
  return ui;
}

function modeIsSupported(controlName, modeValue) {
  return state.capabilities[controlName]?.includes(modeValue) ?? false;
}

function availableModeControls() {
  return MODE_NAMES.filter((name) => Array.isArray(state.capabilities[name]));
}

function currentMode(settings = state.track?.getSettings() ?? {}) {
  const controls = availableModeControls();
  if (!controls.length) return "unavailable";
  if (controls.every((name) => settings[name] === MANUAL_VALUE)) return "manual";
  if (controls.every((name) => settings[name] === AUTO_VALUE)) return "automatic";
  return "mixed";
}

function modeLabel(mode) {
  return {
    automatic: "Automaticky",
    manual: "Ručně",
    mixed: "Smíšený režim",
    unavailable: "Režim není dostupný",
  }[mode];
}

function setPressed(button, pressed) {
  button.classList.toggle("active", pressed);
  button.setAttribute("aria-pressed", String(pressed));
}

function controlNameForInput(input) {
  return input?.dataset?.cameraControl
    ?? input?.previousElementSibling?.dataset?.cameraControl
    ?? null;
}

function numericValueForInput(input) {
  const range = input?.dataset?.cameraControl ? input : input?.previousElementSibling;
  const fallback = Number(range?.value);
  const candidate = Number(input?.value);
  if (!Number.isFinite(candidate)) return fallback;
  const min = Number(range?.min);
  const max = Number(range?.max);
  return Math.min(Number.isFinite(max) ? max : candidate, Math.max(Number.isFinite(min) ? min : candidate, candidate));
}

function rowsInStructuredUi() {
  if (!ui) return [];
  return [...ui.manualControls.querySelectorAll(".camera-control"), ...ui.correctionControls.querySelectorAll(".camera-control")];
}

function addHint(container, text) {
  const hint = makeElement("p", "hint", text);
  container.append(hint);
}

function organiseGeneratedRows() {
  buildStructuredUi();
  if (organising) return;
  organising = true;

  const rows = [...ui.source.querySelectorAll(".camera-control")];
  ui.manualControls.replaceChildren();
  ui.correctionControls.replaceChildren();

  for (const row of rows) {
    const control = row.querySelector("[data-camera-control]");
    const name = control?.dataset.cameraControl;
    if (!name || MODE_NAMES.includes(name)) {
      row.remove();
      continue;
    }
    if (AUTO_CONTROLLED_NAMES.has(name)) ui.manualControls.append(row);
    else ui.correctionControls.append(row);
  }

  ui.source.replaceChildren();

  if (!state.track) {
    addHint(ui.manualControls, "Nastavení se načte po spuštění kamery.");
    addHint(ui.correctionControls, "Nastavení se načte po spuštění kamery.");
  } else {
    if (!ui.manualControls.children.length) addHint(ui.manualControls, "Kamera neposkytuje ruční expozici nebo teplotu bílé.");
    if (!ui.correctionControls.children.length) addHint(ui.correctionControls, "Kamera neposkytuje žádné korekce obrazu.");
  }

  organising = false;
}

function formatReadout(name, value) {
  if (!Number.isFinite(Number(value))) return "Nezjištěno";
  if (name === "colorTemperature") return `${Number(value)} K`;
  return String(Number(value));
}

function syncControlValues(settings = state.track?.getSettings() ?? {}) {
  for (const row of rowsInStructuredUi()) {
    const namedInput = row.querySelector("[data-camera-control]");
    const name = namedInput?.dataset.cameraControl;
    const value = settings[name];
    if (value === undefined) continue;
    namedInput.value = String(value);
    const numberInput = namedInput.type === "range" ? namedInput.nextElementSibling : null;
    if (numberInput?.type === "number") numberInput.value = String(value);
  }
}

export function syncImageSettingsUi({ syncControls = false } = {}) {
  buildStructuredUi();
  const running = Boolean(state.track);
  const settings = state.track?.getSettings() ?? {};
  const mode = running ? currentMode(settings) : "unavailable";
  const canAutomatic = availableModeControls().every((name) => modeIsSupported(name, AUTO_VALUE));
  const canManual = availableModeControls().every((name) => modeIsSupported(name, MANUAL_VALUE));

  elements.autoModeButton.disabled = !running || !canAutomatic || applying;
  elements.manualModeButton.disabled = !running || !canManual || applying;
  setPressed(elements.autoModeButton, mode === "automatic");
  setPressed(elements.manualModeButton, mode === "manual");

  ui.automatic.hidden = mode === "manual";
  ui.manualSection.hidden = mode !== "manual";
  ui.exposureReadout.textContent = formatReadout("exposureTime", settings.exposureTime);
  ui.temperatureReadout.textContent = formatReadout("colorTemperature", settings.colorTemperature);
  ui.automatic.classList.toggle("automatic-image-warning", mode === "mixed");
  ui.automatic.querySelector("strong").textContent = running
    ? mode === "automatic" ? "Automatika kamery aktivní" : modeLabel(mode)
    : "Kamera není spuštěna";

  if (syncControls) syncControlValues(settings);
}

function rememberManualValues() {
  if (!state.track || currentMode() !== "manual") return;
  const settings = state.track.getSettings();
  for (const name of AUTO_CONTROLLED_NAMES) {
    if (Number.isFinite(Number(settings[name]))) manualValues[name] = Number(settings[name]);
  }
  saveManualValues();
}

function exact(value) {
  return { exact: value };
}

function captureConstraints(settings) {
  const constraints = {};
  for (const name of CAPTURE_NAMES) {
    const value = Number(settings[name]);
    if (Number.isFinite(value) && value > 0) constraints[name] = exact(value);
  }
  return constraints;
}

function requiredModeConstraints(mode, settings = state.track?.getSettings() ?? {}) {
  const targetValue = mode === "manual" ? MANUAL_VALUE : AUTO_VALUE;
  const constraints = captureConstraints(settings);

  for (const name of availableModeControls()) {
    if (modeIsSupported(name, targetValue)) constraints[name] = exact(targetValue);
  }

  if (mode === "manual") {
    for (const name of AUTO_CONTROLLED_NAMES) {
      const capability = state.capabilities[name];
      if (!capability || typeof capability.min !== "number" || typeof capability.max !== "number") continue;
      const remembered = Number(manualValues[name]);
      const fallback = Number(settings[name]);
      const value = Number.isFinite(remembered) ? remembered : fallback;
      if (!Number.isFinite(value)) continue;
      constraints[name] = exact(Math.min(capability.max, Math.max(capability.min, value)));
    }
  }

  return constraints;
}

function requiredValueConstraints(name, value, settings = state.track?.getSettings() ?? {}) {
  const mode = currentMode(settings);
  const constraints = captureConstraints(settings);

  for (const modeName of availableModeControls()) {
    const modeValue = settings[modeName];
    if (modeIsSupported(modeName, modeValue)) constraints[modeName] = exact(modeValue);
  }

  if (mode === "manual") {
    for (const autoName of AUTO_CONTROLLED_NAMES) {
      const current = autoName === name ? value : Number(settings[autoName]);
      if (Number.isFinite(current)) constraints[autoName] = exact(current);
    }
  }

  constraints[name] = exact(value);
  return constraints;
}

function verifyMode(mode) {
  const expected = mode === "manual" ? MANUAL_VALUE : AUTO_VALUE;
  const settings = state.track?.getSettings() ?? {};
  const failed = availableModeControls().filter((name) => modeIsSupported(name, expected) && settings[name] !== expected);
  if (failed.length) throw new Error(`kamera stále hlásí ${failed.map((name) => `${name}=${settings[name] ?? "?"}`).join(", ")}`);
}

async function applyImageMode(mode, { initial = false } = {}) {
  if (!state.track || applying) return;
  if (mode === "automatic") rememberManualValues();

  applying = true;
  syncImageSettingsUi();
  setControlStatus(mode === "manual" ? "Přepínám na ruční řízení…" : "Zapínám automatické řízení…");

  try {
    const constraints = requiredModeConstraints(mode);
    await state.track.applyConstraints(constraints);
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    verifyMode(mode);

    if (mode === "manual") rememberManualValues();
    updateDiagnostics();
    syncImageSettingsUi({ syncControls: true });
    setControlStatus(mode === "manual"
      ? "Ruční režim je aktivní; poslední ruční hodnoty byly obnoveny."
      : "Automatický režim je aktivní; kamera může reagovat během několika snímků.");
  } catch (error) {
    console.error(error);
    setControlStatus(`Režim nelze nastavit: ${error.message}`, true);
  } finally {
    applying = false;
    syncImageSettingsUi({ syncControls: true });
    if (initial && currentMode() !== "automatic") {
      setControlStatus("Výchozí automatický režim se nepodařilo aktivovat.", true);
    }
  }
}

async function applyControlValue(name, value) {
  if (!state.track || applying || !Number.isFinite(value)) return;
  if (AUTO_CONTROLLED_NAMES.has(name) && currentMode() !== "manual") {
    setControlStatus(`${CONTROL_LABELS[name]} lze měnit pouze v ručním režimu.`, true);
    syncImageSettingsUi({ syncControls: true });
    return;
  }

  applying = true;
  syncImageSettingsUi();
  setControlStatus(`Nastavuji ${CONTROL_LABELS[name] ?? name}…`);

  try {
    await state.track.applyConstraints(requiredValueConstraints(name, value));
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const actual = Number(state.track.getSettings()[name]);
    if (Number.isFinite(actual) && Math.abs(actual - value) > 0.51) {
      throw new Error(`kamera přijala hodnotu ${actual} místo ${value}`);
    }
    if (AUTO_CONTROLLED_NAMES.has(name)) {
      manualValues[name] = Number.isFinite(actual) ? actual : value;
      saveManualValues();
    }
    updateDiagnostics();
    setControlStatus(`${CONTROL_LABELS[name] ?? name}: ${Number.isFinite(actual) ? actual : value}`);
  } catch (error) {
    console.error(error);
    setControlStatus(`Nelze nastavit ${CONTROL_LABELS[name] ?? name}: ${error.message}`, true);
  } finally {
    applying = false;
    syncImageSettingsUi({ syncControls: true });
  }
}

function interceptGeneratedControl(event) {
  const name = controlNameForInput(event.target);
  if (!AUTO_CONTROLLED_NAMES.has(name) && !CORRECTION_NAMES.has(name)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  applyControlValue(name, numericValueForInput(event.target));
}

function startRefreshTimer() {
  window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(() => {
    if (!state.track) return;
    syncImageSettingsUi();
    if (currentMode() === "automatic") updateDiagnostics();
  }, 500);
}

async function handleTrackChange() {
  if (state.track === initialisedTrack) return;
  initialisedTrack = state.track;

  if (!state.track) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
    syncImageSettingsUi({ syncControls: true });
    return;
  }

  startRefreshTimer();
  await applyImageMode("automatic", { initial: true });
}

export function installImageSettingsControls() {
  buildStructuredUi();
  elements.autoModeButton.addEventListener("click", () => applyImageMode("automatic"));
  elements.manualModeButton.addEventListener("click", () => applyImageMode("manual"));
  ui.manualControls.addEventListener("change", interceptGeneratedControl, true);
  ui.correctionControls.addEventListener("change", interceptGeneratedControl, true);

  new MutationObserver(() => {
    if (organising) return;
    queueMicrotask(() => {
      organiseGeneratedRows();
      syncImageSettingsUi({ syncControls: true });
      handleTrackChange();
    });
  }).observe(ui.source, { childList: true });

  organiseGeneratedRows();
  syncImageSettingsUi();
  handleTrackChange();
}
