import { setControlStatus, state } from "./core.js";

export const DEFAULT_MEASUREMENT_EXPOSURE_MAX = 1800;

let timer = null;
let applying = false;
let lastCapability = null;
let lastConfiguredMaximum = null;
let hardwareMaximum = null;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function configuredMaximum() {
  const profileMaximum = Number(state.instrumentProfile?.cameraSettings?.exposureMax);
  return Number.isFinite(profileMaximum) && profileMaximum > 0
    ? profileMaximum
    : DEFAULT_MEASUREMENT_EXPOSURE_MAX;
}

function effectiveMaximum() {
  const capability = state.capabilities.exposureTime;
  if (!capability) return null;
  const hardware = Number(capability.hardwareMax ?? capability.max);
  if (!Number.isFinite(hardware)) return null;
  return Math.min(hardware, configuredMaximum());
}

function applyCapabilityLimit() {
  const capability = state.capabilities.exposureTime;
  const configured = configuredMaximum();
  if (!capability) return;
  if (capability === lastCapability && configured === lastConfiguredMaximum) return;

  lastCapability = capability;
  lastConfiguredMaximum = configured;
  hardwareMaximum = Number(capability.hardwareMax ?? capability.max);
  if (!Number.isFinite(hardwareMaximum)) return;

  const maximum = Math.min(hardwareMaximum, configured);
  state.capabilities.exposureTime = {
    ...capability,
    max: maximum,
    hardwareMax: hardwareMaximum,
  };
  lastCapability = state.capabilities.exposureTime;
}

function updateInputs(value = null) {
  const maximum = effectiveMaximum();
  if (maximum === null) return;

  for (const slider of document.querySelectorAll('[data-camera-control="exposureTime"]')) {
    slider.max = String(maximum);
    const numberInput = slider.type === "range" ? slider.nextElementSibling : null;
    if (numberInput?.type === "number") numberInput.max = String(maximum);

    if (value !== null && Number.isFinite(Number(value))) {
      slider.value = String(value);
      if (numberInput?.type === "number") numberInput.value = String(value);
    }
  }
}

async function enforceLimit() {
  applyCapabilityLimit();
  updateInputs();

  const track = state.track;
  const maximum = effectiveMaximum();
  if (!track || maximum === null || applying) return;

  const current = Number(track.getSettings().exposureTime);
  if (!Number.isFinite(current) || current <= maximum) {
    if (Number.isFinite(current)) updateInputs(current);
    return;
  }

  applying = true;
  try {
    await track.applyConstraints({
      advanced: [{ exposureMode: "manual", exposureTime: maximum }],
    });
    await sleep(650);
    const actual = Number(track.getSettings().exposureTime);
    updateInputs(Number.isFinite(actual) ? actual : maximum);
    setControlStatus(
      `Expozice byla omezena profilem na ${maximum} (${(maximum / 10).toFixed(0)} ms); hardwarové maximum kamery je ${hardwareMaximum ?? "neznámé"}.`,
    );
  } catch (error) {
    console.error(error);
    setControlStatus(`Horní limit expozice nelze použít: ${error.message}`, true);
  } finally {
    applying = false;
  }
}

export function installExposureLimit() {
  timer = window.setInterval(() => {
    void enforceLimit();
  }, 250);

  window.addEventListener("beforeunload", () => window.clearInterval(timer));
}
