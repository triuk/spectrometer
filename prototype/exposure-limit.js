import { setControlStatus, state } from "./core.js";

export const MEASUREMENT_EXPOSURE_MAX = 1800;

let timer = null;
let applying = false;
let lastCapability = null;
let hardwareMaximum = null;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function effectiveMaximum() {
  const capability = state.capabilities.exposureTime;
  if (!capability || !Number.isFinite(Number(capability.max))) return null;
  return Math.min(Number(capability.max), MEASUREMENT_EXPOSURE_MAX);
}

function applyCapabilityLimit() {
  const capability = state.capabilities.exposureTime;
  if (!capability || capability === lastCapability) return;

  lastCapability = capability;
  hardwareMaximum = Number(capability.max);
  if (!Number.isFinite(hardwareMaximum) || hardwareMaximum <= MEASUREMENT_EXPOSURE_MAX) return;

  // Zachováme původní maximum pro diagnostiku, ale všechny měřicí ovladače
  // a algoritmy používají bezpečný rozsah do 180 ms při cílových 5 fps.
  state.capabilities.exposureTime = {
    ...capability,
    max: MEASUREMENT_EXPOSURE_MAX,
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
      `Expozice byla omezena na ${maximum} (180 ms); hardwarové maximum kamery je ${hardwareMaximum ?? "neznámé"}.`,
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
