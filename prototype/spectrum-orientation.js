import { elements, state } from "./core.js";

let toggle = null;
let status = null;

function finite(value) {
  return Number.isFinite(Number(value));
}

function calibrationIsReversed() {
  if (![elements.pixel1.value, elements.pixel2.value, elements.wavelength1.value, elements.wavelength2.value].every(finite)) {
    return false;
  }
  const pixelDelta = Number(elements.pixel2.value) - Number(elements.pixel1.value);
  const wavelengthDelta = Number(elements.wavelength2.value) - Number(elements.wavelength1.value);
  return pixelDelta !== 0 && wavelengthDelta !== 0 && pixelDelta * wavelengthDelta < 0;
}

function storeOrientation(reverse) {
  state.reverseSpectrum = Boolean(reverse);
  if (state.instrumentProfile) {
    state.instrumentProfile.display ??= {};
    state.instrumentProfile.display.reverseSpectrum = state.reverseSpectrum;
  }
}

function setStatus() {
  if (!status) return;
  status.textContent = toggle?.checked
    ? "Osa λ je vůči pixelům obrácená."
    : "Osa λ má stejný směr jako pixely.";
}

function syncFromCalibration() {
  if (!toggle) return;
  const reverse = calibrationIsReversed();
  toggle.checked = reverse;
  storeOrientation(reverse);
  setStatus();
}

function swapCalibrationDirection() {
  const wavelength1 = elements.wavelength1.value;
  const wavelength2 = elements.wavelength2.value;
  elements.wavelength1.value = wavelength2;
  elements.wavelength2.value = wavelength1;

  storeOrientation(toggle.checked);
  elements.wavelength1.dispatchEvent(new Event("input", { bubbles: true }));
  elements.wavelength2.dispatchEvent(new Event("input", { bubbles: true }));
  setStatus();
}

function makeControl() {
  if (toggle) return;
  const toolbar = document.querySelector(".spectrum-peak-toolbar");
  if (!toolbar) return;

  const label = document.createElement("label");
  label.className = "spectrum-inline-control spectrum-orientation-control";
  label.title = "Prohodí vlnové délky mezi kalibračními body 1 a 2. Pixely senzoru zůstanou beze změny.";

  toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.id = "reverseSpectrum";

  status = document.createElement("span");
  status.className = "spectrum-orientation-status";
  status.hidden = true;

  label.append(toggle, document.createTextNode(" Obrátit spektrum"), status);
  toolbar.prepend(label);

  const profilePreference = state.instrumentProfile?.display?.reverseSpectrum;
  toggle.checked = typeof profilePreference === "boolean" ? profilePreference : calibrationIsReversed();
  storeOrientation(toggle.checked);
  setStatus();

  toggle.addEventListener("change", swapCalibrationDirection);

  for (const input of [elements.pixel1, elements.pixel2, elements.wavelength1, elements.wavelength2]) {
    input.addEventListener("input", syncFromCalibration);
  }

  window.addEventListener("spectrometer:spectrum-orientation", event => {
    const reverse = Boolean(event.detail?.reverseSpectrum);
    toggle.checked = reverse;
    storeOrientation(reverse);
    setStatus();
  });
}

export function installSpectrumOrientation() {
  makeControl();
}
