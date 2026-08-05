import {
  elements,
  setControlStatus,
  state,
} from "./core.js";
import { updateDiagnostics } from "./camera.js";

const MANUAL_VALUES_KEY = "spectrometer.manualImageValues";
const AUTO_VALUE = "continuous";
const MANUAL_VALUE = "manual";
const MODE_CONTROL_NAMES = new Set(["exposureMode", "whiteBalanceMode"]);
const AUTO_CONTROLLED_NAMES = new Set(["exposureTime", "colorTemperature"]);

let manualValues = loadManualValues();
let applyingMode = false;

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

function modeIsSupported(controlName, modeValue) {
  return state.capabilities[controlName]?.includes(modeValue) ?? false;
}

function availableModeControls() {
  return ["exposureMode", "whiteBalanceMode"].filter((name) => Array.isArray(state.capabilities[name]));
}

function currentMode(settings = state.track?.getSettings() ?? {}) {
  const controls = availableModeControls();
  if (!controls.length) return "unavailable";
  if (controls.every((name) => settings[name] === MANUAL_VALUE)) return "manual";
  if (controls.every((name) => settings[name] === AUTO_VALUE)) return "automatic";
  return "mixed";
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

function generatedControlRows() {
  return elements.cameraControls.querySelectorAll(".camera-control");
}

function syncGeneratedControls(settings, mode) {
  for (const row of generatedControlRows()) {
    const namedInput = row.querySelector("[data-camera-control]");
    const name = namedInput?.dataset.cameraControl;
    if (!name) continue;

    row.hidden = MODE_CONTROL_NAMES.has(name);
    const autoControlled = AUTO_CONTROLLED_NAMES.has(name);
    const disabled = autoControlled && mode !== "manual";
    row.classList.toggle("camera-control-auto", disabled);

    for (const input of row.querySelectorAll("input, select")) {
      input.disabled = disabled;
    }

    const value = settings[name];
    if (value === undefined) continue;
    namedInput.value = String(value);
    const numberInput = namedInput.type === "range" ? namedInput.nextElementSibling : null;
    if (numberInput?.type === "number") numberInput.value = String(value);
  }
}

function modeLabel(mode) {
  return {
    automatic: "Automaticky",
    manual: "Ručně",
    mixed: "Smíšený režim",
    unavailable: "Režim není dostupný",
  }[mode];
}

export function syncImageSettingsUi({ openManual = false, closeAutomatic = false } = {}) {
  const running = Boolean(state.track);
  const settings = state.track?.getSettings() ?? {};
  const mode = running ? currentMode(settings) : "unavailable";

  const canAutomatic = availableModeControls().some((name) => modeIsSupported(name, AUTO_VALUE));
  const canManual = availableModeControls().some((name) => modeIsSupported(name, MANUAL_VALUE));

  elements.autoModeButton.disabled = !running || !canAutomatic || applyingMode;
  elements.manualModeButton.disabled = !running || !canManual || applyingMode;
  setPressed(elements.autoModeButton, mode === "automatic");
  setPressed(elements.manualModeButton, mode === "manual");
  elements.imageSettingsState.textContent = running ? modeLabel(mode) : "Kamera není spuštěna";

  syncGeneratedControls(settings, mode);

  if (openManual && mode === "manual") elements.cameraControlsDetails.open = true;
  if (closeAutomatic && mode === "automatic") elements.cameraControlsDetails.open = false;
}

function rememberManualValues() {
  if (!state.track || currentMode() !== "manual") return;
  const settings = state.track.getSettings();
  for (const name of AUTO_CONTROLLED_NAMES) {
    if (Number.isFinite(Number(settings[name]))) manualValues[name] = Number(settings[name]);
  }
  saveManualValues();
}

function manualValueConstraints() {
  const constraints = {};
  const settings = state.track?.getSettings() ?? {};

  for (const name of AUTO_CONTROLLED_NAMES) {
    const capability = state.capabilities[name];
    if (!capability || typeof capability.min !== "number" || typeof capability.max !== "number") continue;
    const remembered = Number(manualValues[name]);
    const fallback = Number(settings[name]);
    const value = Number.isFinite(remembered) ? remembered : fallback;
    if (!Number.isFinite(value)) continue;
    constraints[name] = Math.min(capability.max, Math.max(capability.min, value));
  }

  return constraints;
}

function refreshAutomaticValues() {
  for (const delay of [150, 500, 1000]) {
    window.setTimeout(() => {
      if (!state.track || currentMode() !== "automatic") return;
      updateDiagnostics();
      syncImageSettingsUi();
    }, delay);
  }
}

async function applyImageMode(mode) {
  if (!state.track || applyingMode) return;

  const targetValue = mode === "manual" ? MANUAL_VALUE : AUTO_VALUE;
  const modeConstraints = {};
  for (const name of availableModeControls()) {
    if (modeIsSupported(name, targetValue)) modeConstraints[name] = targetValue;
  }
  if (!Object.keys(modeConstraints).length) {
    setControlStatus(`Režim ${modeLabel(mode)} kamera nepodporuje.`, true);
    return;
  }

  if (mode === "automatic") rememberManualValues();

  applyingMode = true;
  syncImageSettingsUi();
  setControlStatus(mode === "manual" ? "Přepínám na ruční řízení…" : "Zapínám automatické řízení…");

  try {
    await state.track.applyConstraints({ advanced: [modeConstraints] });

    if (mode === "manual") {
      const values = manualValueConstraints();
      if (Object.keys(values).length) {
        await state.track.applyConstraints({ advanced: [values] });
      }
      rememberManualValues();
    }

    updateDiagnostics();
    setControlStatus(mode === "manual"
      ? "Ruční režim je aktivní; poslední ruční hodnoty byly obnoveny."
      : "Automatický režim je aktivní.");
  } catch (error) {
    console.error(error);
    setControlStatus(`Režim nelze nastavit: ${error.message}`, true);
  } finally {
    applyingMode = false;
    syncImageSettingsUi({ openManual: mode === "manual", closeAutomatic: mode === "automatic" });
    if (mode === "automatic") refreshAutomaticValues();
  }
}

export function installImageSettingsControls() {
  elements.autoModeButton.addEventListener("click", () => applyImageMode("automatic"));
  elements.manualModeButton.addEventListener("click", () => applyImageMode("manual"));
  elements.cameraControlsDetails.addEventListener("toggle", () => syncImageSettingsUi());

  elements.cameraControls.addEventListener("change", (event) => {
    const name = controlNameForInput(event.target);
    if (!AUTO_CONTROLLED_NAMES.has(name)) return;
    window.setTimeout(() => {
      rememberManualValues();
      syncImageSettingsUi();
    }, 100);
  });

  new MutationObserver(() => syncImageSettingsUi()).observe(elements.cameraControls, {
    childList: true,
  });

  syncImageSettingsUi();
}
