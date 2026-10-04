import {cameraOperations} from "./camera-operations.js";
import {configureMeasurementCamera} from "./camera-constraints.js";
import {startCamera,stopCamera} from "./camera.js";
import {events,publish} from "./events.js";
import { clamp, elements, setControlStatus, state, toFiniteNumber } from "./core.js";
import { drawPlot, setRoi, calibration, resizeOverlay, invalidateMeasurement } from "./spectrum.js";

import { normaliseProfile, validateProfile } from "./profile-schema.js";

const SCHEMA_VERSION = 1;
const LOCAL_PROFILES_KEY = "spectrometer.instrumentProfiles";
const SELECTED_PROFILE_KEY = "spectrometer.selectedInstrumentProfile";
const INDEX_URL = new URL("./configs/index.json", import.meta.url);

const builtInProfiles = new Map();
const localProfiles = new Map();
let activeSource = null;
let ui = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadLocalProfiles() {
  localProfiles.clear();
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || "[]");
    if (!Array.isArray(stored)) return;
    for (const profile of stored) {
      try {
        const normalised = validateProfile(normaliseProfile(profile));
        localProfiles.set(normalised.id, normalised);
      } catch (error) {
        console.warn("Ignoring invalid local instrument profile.", error, profile);
      }
    }
    persistLocalProfiles();
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
    const profile = validateProfile(normaliseProfile(await profileResponse.json()));
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
      if (localProfiles.has(profile.id)) continue;
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
  state.calibrationCaptureMode = {...(profile.calibration.captureMode ?? profile.camera)};
  state.calibrationEnabled = profile.calibration.valid !== false;
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
  const spectralX = clamp(Math.round(Number(source.x) * scaleX), 0, width - 1);
  const y = clamp(Math.round(Number(source.y) * scaleY), 0, height - 1);
  const roiWidth = clamp(Math.round(Number(source.width) * scaleX), 1, width - spectralX);
  const roiHeight = clamp(Math.round(Number(source.height) * scaleY), 1, height - y);
  const rawX = profile.sensorOrientation?.flipX !== false
    ? width - spectralX - roiWidth
    : spectralX;

  setRoi({ x: clamp(rawX, 0, width - roiWidth), y, width: roiWidth, height: roiHeight });
  elements.roiOutput.textContent = `ROI: x ${spectralX}, y ${y}, ${roiWidth} × ${roiHeight}`;
}

export async function applyInstrumentProfile(profile = state.instrumentProfile,{signal} = {}) {
  if (!profile) return;
  validateProfile(profile);
  if (cameraOperations.active && !signal) throw new Error("Probíhá jiná operace kamery.");
  applyCalibration(profile);
  if (state.track) {
    applyRoi(profile);
    await configureMeasurementCamera(profile,signal);
    resizeOverlay();
  }
  drawPlot();
  if (ui) ui.status.textContent = `Aktivní profil: ${profile.name}`;
}
async function activate(profile,source,applyNow = true) {
  validateProfile(profile);
  if (cameraOperations.active || state.dragStart) throw new Error("Profil nelze změnit během operace kamery nebo výběru ROI.");
  const restart = applyNow && Boolean(state.track);
  if (restart) stopCamera();
  state.instrumentProfile = clone(profile);
  activeSource = source;
  try {localStorage.setItem(SELECTED_PROFILE_KEY,profile.id);} catch (error) {console.warn("Výběr profilu nelze uložit.",error);}
  refreshSelect(); ui.select.value = profile.id;
  ui.status.textContent = `Aktivní profil: ${profile.name}`;
  if (restart) await startCamera();
  else if (applyNow) await applyInstrumentProfile(state.instrumentProfile);
  else invalidateMeasurement("Profil byl uložen.");
  publish("profile-change");
}
function syncProfileUi() {
  if (!ui) return;
  const busy = Boolean(cameraOperations.active) || Boolean(state.dragStart);
  for (const control of [ui.select,ui.save,ui.importButton,ui.exportButton,ui.file]) control.disabled = busy;
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
  const cameraWidth = Number(cameraSettings.width) || Number(camera.width) || elements.video.videoWidth || 1920;
  const cameraHeight = Number(cameraSettings.height) || Number(camera.height) || elements.video.videoHeight || 1080;
  const runtimeRoi = state.roi;
  const roi = runtimeRoi ?? base.roi ?? { x: 0, y: 0, width: cameraWidth, height: 1 };
  const flipX = base.sensorOrientation?.flipX !== false;
  const spectralRoiX = runtimeRoi && flipX
    ? cameraWidth - Number(runtimeRoi.x) - Number(runtimeRoi.width)
    : Number(roi.x);

  return validateProfile({
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    camera: {
      labelContains: base.camera?.labelContains ?? state.track?.label ?? "",
      width: cameraWidth,
      height: cameraHeight,
      frameRate: Number(cameraSettings.frameRate) || Number(camera.frameRate) || 5,
    },
    sensorOrientation: {
      flipX,
    },
    roi: {
      x: spectralRoiX,
      y: Number(roi.y),
      width: Number(roi.width),
      height: Number(roi.height),
      coordinateSystem: "spectral",
    },
    calibration: {
      model: "linear",
      points: currentCalibrationPoints(base),
      captureMode: state.calibrationCaptureMode ?? {width:cameraWidth,height:cameraHeight},
      valid: state.track ? Boolean(calibration()) : state.calibrationEnabled,
    },
    cameraSettings: {
      whiteBalance: Number(cameraSettings.colorTemperature) || Number(base.cameraSettings?.whiteBalance) || 4600,
      exposureMax: Number(base.cameraSettings?.exposureMax) || 1800,
      brightness: Number.isFinite(cameraSettings.brightness) ? cameraSettings.brightness : base.cameraSettings?.brightness ?? 0,
      contrast: Number.isFinite(cameraSettings.contrast) ? cameraSettings.contrast : base.cameraSettings?.contrast ?? 32,
      saturation: Number.isFinite(cameraSettings.saturation) ? cameraSettings.saturation : base.cameraSettings?.saturation ?? 50,
      sharpness: Number.isFinite(cameraSettings.sharpness) ? cameraSettings.sharpness : base.cameraSettings?.sharpness ?? 1,
    },
    exposureOptimization: base.exposureOptimization ? clone(base.exposureOptimization) : undefined,
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

async function saveCurrentLocally() {
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
  await activate(profile, "local", false);
  ui.status.textContent = `Profil ${profile.name} byl uložen lokálně.`;
}

async function importProfile(file) {
  if (cameraOperations.active || state.dragStart) throw new Error("Dokončete operaci kamery nebo ROI před importem.");
  const profile = validateProfile(normaliseProfile(JSON.parse(await file.text())));
  if (cameraOperations.active || state.dragStart) throw new Error("Dokončete operaci kamery nebo ROI před importem.");
  localProfiles.set(profile.id, profile);
  persistLocalProfiles();
  await activate(profile, "local", true);
  ui.status.textContent = `Importován profil: ${profile.name}`;
}

function bindUi() {
  ui.select.addEventListener("change", async () => {
    const found = profileById(ui.select.value);
    try {if (found) await activate(found.profile,found.source,true);}
    catch (error) {ui.status.textContent = error.message; refreshSelect();}
  });

  ui.save.addEventListener("click", () => {void saveCurrentLocally().catch(error=>{ui.status.textContent=error.message;});});
  ui.exportButton.addEventListener("click", () => {
    try {
    const current = state.instrumentProfile;
    const profile = buildCurrentProfile({
      id: current?.id ?? `spectrometer-${Date.now().toString(36)}`,
      name: current?.name ?? "Spektrometr",
    });
    downloadProfile(profile);
    ui.status.textContent = `Exportován profil: ${profile.name}`;
    } catch (error) {ui.status.textContent=error.message;}
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
  let requested;
  try {requested=localStorage.getItem(SELECTED_PROFILE_KEY);} catch {}
  const selected = profileById(requested) ?? profileById("lgs-default") ?? (builtInProfiles.size ? { profile: builtInProfiles.values().next().value, source: "built-in" } : null);
  if (selected) await activate(selected.profile, selected.source, true);
  else ui.status.textContent = "Není dostupný žádný profil.";

  for (const type of ["camera-operation","camera-state","spectrum-change","profile-change"]) events.addEventListener(type,syncProfileUi);
  syncProfileUi();
}
