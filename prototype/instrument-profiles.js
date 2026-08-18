import { clamp, elements, setControlStatus, state, toFiniteNumber } from "./core.js";
import { clearDarkSpectrum, drawPlot } from "./spectrum.js";

const SCHEMA_VERSION = 1;
const LOCAL_PROFILES_KEY = "spectrometer.instrumentProfiles";
const SELECTED_PROFILE_KEY = "spectrometer.selectedInstrumentProfile";
const INDEX_URL = new URL("./configs/index.json", import.meta.url);

const builtInProfiles = new Map();
const localProfiles = new Map();
let activeSource = null;
let ui = null;
let observedTrack = null;
let applyTimer = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function validateProfile(profile) {
  if (!profile || typeof profile !== "object") throw new Error("Profil není JSON objekt.");
  if (profile.schemaVersion !== SCHEMA_VERSION) throw new Error(`Nepodporovaná verze profilu: ${profile.schemaVersion ?? "?"}.`);
  if (!profile.id || typeof profile.id !== "string") throw new Error("Profil nemá platné id.");
  if (!profile.name || typeof profile.name !== "string") throw new Error("Profil nemá název.");

  const roi = profile.roi;
  if (!roi || ![roi.x, roi.y, roi.width, roi.height].every(finite) || Number(roi.width) <= 0 || Number(roi.height) <= 0) {
    throw new Error("Profil nemá platnou ROI.");
  }

  const calibration = profile.calibration;
  if (!calibration || calibration.model !== "linear" || !Array.isArray(calibration.points) || calibration.points.length < 2) {
    throw new Error("Profil musí obsahovat lineární kalibraci alespoň ze dvou bodů.");
  }
  for (const point of calibration.points) {
    if (!finite(point.pixel) || !finite(point.wavelengthNm)) throw new Error("Kalibrační bod nemá platný pixel nebo vlnovou délku.");
  }

  return profile;
}

function loadLocalProfiles() {
  localProfiles.clear();
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || "[]");
    if (!Array.isArray(stored)) return;
    for (const profile of stored) {
      try {
        validateProfile(profile);
        localProfiles.set(profile.id, profile);
      } catch (error) {
        console.warn("Ignoring invalid local instrument profile.", error, profile);
      }
    }
  } catch (error) {
    console.warn("Local instrument profiles could not be read.", error);
  }
}

function persistLocalProfiles() {
  localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify([...localProfiles.values()]));
}

async function loadBuiltInProfiles() {
  builtInProfiles.clear();
  const response = await fetch(INDEX_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Nelze načíst seznam profilů (${response.status}).`);
  const files = await response.json();
  if (!Array.isArray(files)) throw new Error("Seznam profilů nemá platný formát.");

  for (const filename of files) {
    const url = new URL(`./configs/${filename}`, import.meta.url);
    const profileResponse = await fetch(url, { cache: "no-store" });
    if (!profileResponse.ok) throw new Error(`Nelze načíst profil ${filename}.`);
    const profile = validateProfile(await profileResponse.json());
    builtInProfiles.set(profile.id, profile);
  }
}

function makeUi() {
  if (ui) return ui;
  const panel = document.createElement("section");
  panel.className = "instrument-profile-panel";
  panel.setAttribute("aria-labelledby", "instrumentProfileHeading");
  panel.innerHTML = `
    <div class="heading-with-help">
      <h2 id="instrumentProfileHeading">Profil spektrometru</h2>
      <span class="help-popover">
        <button type="button" class="help-button" aria-label="Nápověda k profilu spektrometru" aria-describedby="instrumentProfileHelp">?</button>
        <span id="instrumentProfileHelp" class="help-tooltip" role="tooltip">Profil obsahuje kameru, ROI, kalibraci a pevné parametry konkrétního spektrometru. Device ID kamery se ukládá jen lokálně v prohlížeči.</span>
      </span>
    </div>
    <label>
      Přístroj
      <select id="instrumentProfileSelect"></select>
    </label>
    <div class="button-row wrap instrument-profile-actions">
      <button id="instrumentProfileSave" type="button" class="button secondary">Uložit aktuální</button>
      <button id="instrumentProfileImport" type="button" class="button ghost">Import JSON</button>
      <button id="instrumentProfileExport" type="button" class="button ghost">Export JSON</button>
    </div>
    <input id="instrumentProfileFile" type="file" accept="application/json,.json" hidden>
    <p id="instrumentProfileStatus" class="hint">Načítám profily…</p>
  `;

  const firstDivider = document.querySelector(".controls-panel > hr");
  firstDivider?.before(panel);

  const style = document.createElement("style");
  style.textContent = `
    .instrument-profile-panel { display: grid; gap: .7rem; }
    .instrument-profile-panel label { display: grid; gap: .35rem; }
    .instrument-profile-panel select { width: 100%; }
    .instrument-profile-actions { margin-top: 0; }
  `;
  document.head.append(style);

  ui = {
    panel,
    select: panel.querySelector("#instrumentProfileSelect"),
    save: panel.querySelector("#instrumentProfileSave"),
    importButton: panel.querySelector("#instrumentProfileImport"),
    exportButton: panel.querySelector("#instrumentProfileExport"),
    file: panel.querySelector("#instrumentProfileFile"),
    status: panel.querySelector("#instrumentProfileStatus"),
  };
  return ui;
}

function profileById(id) {
  if (localProfiles.has(id)) return { profile: localProfiles.get(id), source: "local" };
  if (builtInProfiles.has(id)) return { profile: builtInProfiles.get(id), source: "built-in" };
  return null;
}

function refreshSelect() {
  makeUi();
  const selected = state.instrumentProfile?.id ?? "";
  ui.select.replaceChildren();

  if (builtInProfiles.size) {
    const group = document.createElement("optgroup");
    group.label = "Vestavěné";
    for (const profile of builtInProfiles.values()) {
      const option = new Option(profile.name, profile.id);
      group.append(option);
    }
    ui.select.append(group);
  }

  if (localProfiles.size) {
    const group = document.createElement("optgroup");
    group.label = "Lokální";
    for (const profile of localProfiles.values()) {
      const option = new Option(profile.name, profile.id);
      group.append(option);
    }
    ui.select.append(group);
  }

  if (selected && profileById(selected)) ui.select.value = selected;
}

function applyCalibration(profile) {
  const points = profile.calibration.points;
  const first = points[0];
  const second = points[1];
  elements.pixel1.value = String(first.pixel);
  elements.wavelength1.value = String(first.wavelengthNm);
  elements.pixel2.value = String(second.pixel);
  elements.wavelength2.value = String(second.wavelengthNm);
}

function applyRoi(profile) {
  if (!state.track || !elements.video.videoWidth || !elements.video.videoHeight) return;
  const source = profile.roi;
  const width = elements.video.videoWidth;
  const height = elements.video.videoHeight;
  const referenceWidth = Number(profile.camera?.width) || width;
  const referenceHeight = Number(profile.camera?.height) || height;
  const scaleX = width / referenceWidth;
  const scaleY = height / referenceHeight;
  const x = clamp(Math.round(Number(source.x) * scaleX), 0, width - 1);
  const y = clamp(Math.round(Number(source.y) * scaleY), 0, height - 1);
  const roiWidth = clamp(Math.round(Number(source.width) * scaleX), 1, width - x);
  const roiHeight = clamp(Math.round(Number(source.height) * scaleY), 1, height - y);

  state.roi = { x, y, width: roiWidth, height: roiHeight };
  state.spectrumHistory = [];
  state.averagedSpectrum = null;
  elements.roiOutput.textContent = `ROI: x ${x}, y ${y}, ${roiWidth} × ${roiHeight}`;
}

async function applyCameraSettings(profile) {
  const track = state.track;
  if (!track) return;
  const capabilities = state.capabilities;
  const settings = profile.cameraSettings ?? {};
  const values = {};

  if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes("manual")) values.exposureMode = "manual";
  if (Array.isArray(capabilities.whiteBalanceMode) && capabilities.whiteBalanceMode.includes("manual")) values.whiteBalanceMode = "manual";

  const mapping = {
    whiteBalance: "colorTemperature",
    brightness: "brightness",
    contrast: "contrast",
    saturation: "saturation",
    sharpness: "sharpness",
  };
  for (const [profileKey, controlName] of Object.entries(mapping)) {
    const requested = Number(settings[profileKey]);
    const range = capabilities[controlName];
    if (!Number.isFinite(requested) || !range || !finite(range.min) || !finite(range.max)) continue;
    values[controlName] = clamp(requested, Number(range.min), Number(range.max));
  }

  if (Object.keys(values).length) await track.applyConstraints({ advanced: [values] });
}

export async function applyInstrumentProfile(profile = state.instrumentProfile) {
  if (!profile) return;
  validateProfile(profile);
  applyCalibration(profile);

  if (state.track) {
    applyRoi(profile);
    if (state.darkSpectrum) clearDarkSpectrum();
    await applyCameraSettings(profile);
    window.dispatchEvent(new Event("resize"));
    drawPlot();
  }

  if (ui) ui.status.textContent = `Aktivní profil: ${profile.name}`;
}

function activate(profile, source, applyNow = true) {
  validateProfile(profile);
  state.instrumentProfile = clone(profile);
  state.reverseSpectrum = Boolean(profile.display?.reverseSpectrum);
  activeSource = source;
  localStorage.setItem(SELECTED_PROFILE_KEY, profile.id);
  refreshSelect();
  ui.select.value = profile.id;
  ui.status.textContent = `Aktivní profil: ${profile.name}`;
  window.dispatchEvent(new CustomEvent("spectrometer:spectrum-orientation", {
    detail: { reverseSpectrum: state.reverseSpectrum },
  }));
  if (applyNow) void applyInstrumentProfile(state.instrumentProfile);
}

function slug(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "spectrometer";
}

function currentCalibrationPoints(base) {
  const previous = base?.calibration?.points ?? [];
  return [
    {
      pixel: toFiniteNumber(elements.pixel1.value, 0),
      wavelengthNm: toFiniteNumber(elements.wavelength1.value, 400),
      label: previous[0]?.label ?? "Kalibrační bod 1",
    },
    {
      pixel: toFiniteNumber(elements.pixel2.value, 1),
      wavelengthNm: toFiniteNumber(elements.wavelength2.value, 700),
      label: previous[1]?.label ?? "Kalibrační bod 2",
    },
  ];
}

function buildCurrentProfile({ id, name }) {
  const base = state.instrumentProfile ?? {};
  const cameraSettings = state.track?.getSettings() ?? {};
  const camera = base.camera ?? {};
  const roi = state.roi ?? base.roi ?? { x: 0, y: 0, width: camera.width ?? 1920, height: 1 };

  return validateProfile({
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    camera: {
      labelContains: base.camera?.labelContains ?? state.track?.label ?? "",
      width: Number(cameraSettings.width) || Number(camera.width) || elements.video.videoWidth || 1920,
      height: Number(cameraSettings.height) || Number(camera.height) || elements.video.videoHeight || 1080,
      frameRate: Number(cameraSettings.frameRate) || Number(camera.frameRate) || 5,
    },
    roi: {
      x: Number(roi.x),
      y: Number(roi.y),
      width: Number(roi.width),
      height: Number(roi.height),
    },
    calibration: {
      model: "linear",
      points: currentCalibrationPoints(base),
    },
    cameraSettings: {
      whiteBalance: Number(cameraSettings.colorTemperature) || Number(base.cameraSettings?.whiteBalance) || 4600,
      exposureMax: Number(base.cameraSettings?.exposureMax) || 1800,
      brightness: Number.isFinite(Number(cameraSettings.brightness)) ? Number(cameraSettings.brightness) : Number(base.cameraSettings?.brightness) || 0,
      contrast: Number.isFinite(Number(cameraSettings.contrast)) ? Number(cameraSettings.contrast) : Number(base.cameraSettings?.contrast) || 32,
      saturation: Number.isFinite(Number(cameraSettings.saturation)) ? Number(cameraSettings.saturation) : Number(base.cameraSettings?.saturation) || 50,
      sharpness: Number.isFinite(Number(cameraSettings.sharpness)) ? Number(cameraSettings.sharpness) : Number(base.cameraSettings?.sharpness) || 1,
    },
    exposureOptimization: base.exposureOptimization ? clone(base.exposureOptimization) : undefined,
    display: {
      ...(base.display ?? {}),
      reverseSpectrum: Boolean(state.reverseSpectrum),
    },
  });
}

function downloadProfile(profile) {
  const blob = new Blob([`${JSON.stringify(profile, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement("a"), { href: url, download: `${profile.id}.json` });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveCurrentLocally() {
  const current = state.instrumentProfile;
  let id = current?.id;
  let name = current?.name;

  if (!current || activeSource !== "local") {
    const proposed = current?.name ? `${current.name} – kopie` : "Můj spektrometr";
    name = window.prompt("Název profilu", proposed)?.trim();
    if (!name) return;
    id = `${slug(name)}-${Date.now().toString(36)}`;
  }

  const profile = buildCurrentProfile({ id, name });
  localProfiles.set(profile.id, profile);
  persistLocalProfiles();
  activate(profile, "local", false);
  ui.status.textContent = `Profil ${profile.name} byl uložen lokálně.`;
}

async function importProfile(file) {
  const profile = validateProfile(JSON.parse(await file.text()));
  localProfiles.set(profile.id, profile);
  persistLocalProfiles();
  activate(profile, "local", true);
  ui.status.textContent = `Importován profil: ${profile.name}`;
}

function bindUi() {
  ui.select.addEventListener("change", () => {
    const found = profileById(ui.select.value);
    if (found) activate(found.profile, found.source, true);
  });

  ui.save.addEventListener("click", saveCurrentLocally);
  ui.exportButton.addEventListener("click", () => {
    const current = state.instrumentProfile;
    const profile = buildCurrentProfile({
      id: current?.id ?? `spectrometer-${Date.now().toString(36)}`,
      name: current?.name ?? "Spektrometr",
    });
    downloadProfile(profile);
    ui.status.textContent = `Exportován profil: ${profile.name}`;
  });

  ui.importButton.addEventListener("click", () => ui.file.click());
  ui.file.addEventListener("change", async () => {
    const file = ui.file.files?.[0];
    ui.file.value = "";
    if (!file) return;
    try {
      await importProfile(file);
    } catch (error) {
      console.error(error);
      ui.status.textContent = `Import selhal: ${error.message}`;
    }
  });
}

function watchCamera() {
  if (state.track === observedTrack) return;
  observedTrack = state.track;
  window.clearTimeout(applyTimer);
  if (!state.track || !state.instrumentProfile) return;
  const track = state.track;
  applyTimer = window.setTimeout(() => {
    if (track === state.track) void applyInstrumentProfile(state.instrumentProfile).catch((error) => {
      console.error(error);
      setControlStatus(`Profil spektrometru nelze použít: ${error.message}`, true);
    });
  }, 1000);
}

export async function installInstrumentProfiles() {
  makeUi();
  loadLocalProfiles();
  bindUi();

  try {
    await loadBuiltInProfiles();
  } catch (error) {
    console.error(error);
    ui.status.textContent = `Vestavěné profily nelze načíst: ${error.message}`;
  }

  refreshSelect();
  const requested = localStorage.getItem(SELECTED_PROFILE_KEY);
  const selected = profileById(requested) ?? profileById("lgs-default") ?? (builtInProfiles.size ? { profile: builtInProfiles.values().next().value, source: "built-in" } : null);
  if (selected) activate(selected.profile, selected.source, false);
  else ui.status.textContent = "Není dostupný žádný profil.";

  window.setInterval(watchCamera, 250);
}
