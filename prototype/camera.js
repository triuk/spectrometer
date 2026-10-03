import {cameraOperations, abortable, abortError} from "./camera-operations.js";
import {applyImageConstraints, measurementExposureRange, quantize, settleCamera} from "./camera-constraints.js";
import {applyInstrumentProfile} from "./instrument-profiles.js";
import {publish} from "./events.js";
import {
  clamp,
  elements,
  setCameraStatus,
  setControlStatus,
  setRunningControls,
  state,
  toFiniteNumber,
} from "./core.js";
import {
  clearOverlay,
  clearProcessingState,
  drawEmptyPlot,
  invalidateMeasurement,
  drawPlot,
  initialiseCaptureSurface,
  initialiseDefaultRoi,
  observePreviewSize,
  startProcessingLoop,
  stopProcessing,
} from "./spectrum.js";

const SAVED_DEVICE_KEY = "spectrometer.cameraDeviceId";
const PROFILE_DEVICE_MAP_KEY = "spectrometer.cameraDeviceByProfile";
const DEFAULT_CAMERA = {
  labelContains: "USB-ZH",
  width: 1920,
  height: 1080,
  frameRate: 5,
};

const NUMERIC_CONTROLS = [["exposureTime","Expozice"],["colorTemperature","Teplota bílé"]];

function desiredCamera() {
  const camera = state.instrumentProfile?.camera ?? {};
  return {
    labelContains: String(camera.labelContains ?? DEFAULT_CAMERA.labelContains),
    width: Number(camera.width) || DEFAULT_CAMERA.width,
    height: Number(camera.height) || DEFAULT_CAMERA.height,
    frameRate: Number(camera.frameRate) || DEFAULT_CAMERA.frameRate,
  };
}

function captureProfiles() {
  const desired = desiredCamera();
  return [
    {
      id: "profile-exact",
      label: "Profil spektrometru",
      constraints: {
        width: { exact: desired.width },
        height: { exact: desired.height },
        frameRate: { exact: desired.frameRate },
      },
    },
    {
      id: "profile-ideal",
      label: "Profil spektrometru – fallback",
      constraints: {
        width: { exact: desired.width },
        height: { exact: desired.height },
        frameRate: { ideal: desired.frameRate },
      },
    },
    {
      id: "1280x960-fallback",
      label: "Fallback 1280 × 960",
      constraints: {
        width: { exact: 1280 },
        height: { exact: 960 },
        frameRate: { ideal: 6 },
      },
    },
    {
      id: "1280x720-fallback",
      label: "Fallback 1280 × 720",
      constraints: {
        width: { exact: 1280 },
        height: { exact: 720 },
        frameRate: { ideal: 9 },
      },
    },
    {
      id: "automatic-fallback",
      label: "Automatický fallback",
      constraints: {
        width: { ideal: desired.width },
        height: { ideal: desired.height },
        frameRate: { ideal: desired.frameRate },
      },
    },
  ];
}

function readProfileDeviceMap() {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_DEVICE_MAP_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function savedDeviceId() {
  const profileId = state.instrumentProfile?.id;
  if (profileId) return readProfileDeviceMap()[profileId] ?? null;
  return localStorage.getItem(SAVED_DEVICE_KEY);
}

function rememberDeviceId(deviceId) {
  if (!deviceId) return;
  const profileId = state.instrumentProfile?.id;
  if (!profileId) {
    localStorage.setItem(SAVED_DEVICE_KEY, deviceId);
    return;
  }
  const map = readProfileDeviceMap();
  map[profileId] = deviceId;
  localStorage.setItem(PROFILE_DEVICE_MAP_KEY, JSON.stringify(map));
}

function forgetSavedDevice() {
  const profileId = state.instrumentProfile?.id;
  if (!profileId) {
    localStorage.removeItem(SAVED_DEVICE_KEY);
    return;
  }
  const map = readProfileDeviceMap();
  delete map[profileId];
  localStorage.setItem(PROFILE_DEVICE_MAP_KEY, JSON.stringify(map));
}

function getCapabilities(track) {
  try {
    return track.getCapabilities?.() ?? {};
  } catch (error) {
    console.warn("Camera capabilities are unavailable.", error);
    return {};
  }
}

async function waitForMetadata(signal) {
  if (elements.video.videoWidth && elements.video.videoHeight) return;
  let listener;
  try {
    await abortable(new Promise(resolve => {
      listener = resolve; elements.video.addEventListener("loadedmetadata",listener,{once:true});
    }),signal);
  } finally { elements.video.removeEventListener("loadedmetadata",listener); }
}
async function openMediaStream(constraints,signal) {
  const request = navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    if (signal?.aborted) {stopStream(stream); throw abortError();}
    return stream;
  });
  return abortable(request,signal,30000);
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function openCameraDevice(deviceId,signal) {
  return openMediaStream({
    audio: false,
    video: { deviceId: { exact: deviceId } },
  },signal);
}

async function videoInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput");
}

async function findProfileVideoInput() {
  const expected = desiredCamera().labelContains.trim();
  if (!expected) return null;
  const devices = await videoInputs();
  return devices.find((device) => device.deviceId && labelMatchesProfile(device.label)) ?? null;
}

async function requestCameraStream(signal) {
  const expected = desiredCamera().labelContains.trim();
  const deviceId = savedDeviceId();

  // deviceId je pouze lokální browserový identifikátor. U UVC kamer bez
  // sériového čísla se po přesunutí za USB hub může změnit, proto ověřujeme
  // i label a při neúspěchu zařízení znovu hledáme podle profilu.
  if (deviceId) {
    try {
      const stream = await openCameraDevice(deviceId,signal);
      const track = stream.getVideoTracks()[0];
      if (!expected || labelMatchesProfile(track?.label ?? "")) return stream;
      console.warn(`Saved camera no longer matches profile: ${track?.label ?? "unknown"}.`);
      stopStream(stream);
      forgetSavedDevice();
    } catch (error) {
      if (error.name === "AbortError" || signal.aborted) throw error;
      console.warn("Saved camera is unavailable; rediscovering the profile camera.", error);
      forgetSavedDevice();
    }
  }

  // Pokud už má origin oprávnění, enumerateDevices() obvykle vrátí i názvy
  // zařízení a můžeme spektrometr otevřít rovnou podle labelContains.
  let matchingDevice = await findProfileVideoInput();
  if (matchingDevice) return openCameraDevice(matchingDevice.deviceId,signal);

  // Před prvním povolením kamery jsou labely z privacy důvodů prázdné.
  // Otevřeme tedy dočasně výchozí kameru, čímž uživatel udělí oprávnění,
  // a následně zařízení znovu enumerujeme. Pokud je výchozí kamera rovnou
  // spektrometr, není potřeba stream otevírat podruhé.
  const probeStream = await openMediaStream({audio:false,video:true},signal);
  const probeTrack = probeStream.getVideoTracks()[0];
  if (!expected || labelMatchesProfile(probeTrack?.label ?? "")) return probeStream;

  try {
    matchingDevice = await findProfileVideoInput();
    if (matchingDevice) {
      stopStream(probeStream);
      return await openCameraDevice(matchingDevice.deviceId,signal);
    }

    const devices = await videoInputs();
    const available = devices
      .map((device) => device.label || "nepojmenovaná kamera")
      .join(", ");
    throw new Error(
      `Kamera profilu „${expected}“ nebyla nalezena${available ? `. Dostupné kamery: ${available}` : "."}`,
    );
  } catch (error) {
    stopStream(probeStream);
    throw error;
  }
}

async function selectBestCaptureProfile(track,signal) {
  for (const profile of captureProfiles()) {
    try {
      await abortable(track.applyConstraints(profile.constraints),signal);
      if (track !== state.track || signal.aborted) throw abortError();
      return profile;
    } catch (error) {
      if (error.name === "AbortError" || signal.aborted) throw error;
      console.warn(`Capture profile ${profile.id} is unavailable.`, error);
    }
  }

  return {
    id: "browser-default",
    label: "Výchozí režim prohlížeče",
    constraints: {},
  };
}

function labelMatchesProfile(label) {
  const expected = desiredCamera().labelContains.trim().toLowerCase();
  return !expected || label.toLowerCase().includes(expected);
}

function isOptimalCapture(profile, settings, label) {
  const desired = desiredCamera();
  const frameRate = Number(settings.frameRate);
  return labelMatchesProfile(label)
    && settings.width === desired.width
    && settings.height === desired.height
    && Number.isFinite(frameRate)
    && Math.abs(frameRate - desired.frameRate) < 0.15;
}

function renderCaptureMode(profile) {
  const settings = state.track?.getSettings() ?? {};
  const label = state.track?.label || "Neznámá kamera";
  const desired = desiredCamera();
  const optimal = isOptimalCapture(profile, settings, label);
  const frameRate = Number(settings.frameRate);

  elements.captureModeStatus.className = `capture-mode capture-mode-${optimal ? "optimal" : "fallback"}`;
  elements.captureModeBadge.textContent = optimal ? "Profil OK" : "Fallback";
  elements.captureCameraName.textContent = label;
  elements.captureResolution.textContent = settings.width && settings.height
    ? `${settings.width} × ${settings.height}`
    : "Nezjištěno";
  elements.captureFrameRate.textContent = Number.isFinite(frameRate)
    ? `${frameRate.toFixed(frameRate % 1 ? 2 : 0)} fps · ${(1000/frameRate).toFixed(0)} ms/snímek`
    : "Nezjištěno";
  elements.captureFormat.textContent = "Nezjištěno – Chromium údaj neposkytuje";
  elements.captureModeStatus.title = optimal
    ? `Kamera odpovídá profilu: ${desired.width} × ${desired.height} při ${desired.frameRate} fps.`
    : `Použit náhradní režim: ${profile.label}.`;
}

function resetCaptureMode() {
  elements.captureModeStatus.className = "capture-mode capture-mode-idle";
  elements.captureModeBadge.textContent = "Čeká";
  elements.captureCameraName.textContent = "–";
  elements.captureResolution.textContent = "–";
  elements.captureFrameRate.textContent = "–";
  elements.captureFormat.textContent = "–";
  elements.captureModeStatus.removeAttribute("title");
}

export async function startCamera() {
  if (state.track || state.starting) return;
  try {
    await cameraOperations.run("start", async ({signal}) => {
      state.starting = true;
      state.session += 1;
      setCameraStatus("Čekám na kameru…"); setRunningControls(); publish("camera-state");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("MediaDevices API není dostupné.");
      if (!state.instrumentProfile) throw new Error("Vyberte platný profil spektrometru.");
      state.stream = await requestCameraStream(signal);
      if (signal.aborted) {stopStream(state.stream); throw abortError();}
      const track = state.stream.getVideoTracks()[0];
      state.track = track;
      track.addEventListener("ended", () => {
        if (track === state.track) {stopCamera(); setCameraStatus("Kamera byla odpojena.","error");}
      }, {once:true});
      state.captureProfile = await selectBestCaptureProfile(track,signal);
      state.capabilities = getCapabilities(track);
      const settings = track.getSettings();
      if (settings.deviceId) rememberDeviceId(settings.deviceId);
      elements.video.srcObject = state.stream;
      await abortable(elements.video.play(),signal);
      await waitForMetadata(signal);
      initialiseCaptureSurface();
      elements.videoStage.style.aspectRatio = `${elements.video.videoWidth} / ${elements.video.videoHeight}`;
      initialiseDefaultRoi();
      await applyInstrumentProfile(state.instrumentProfile,{signal});
      await settleCamera(track,signal);
      if (signal.aborted || track !== state.track) throw abortError();
      state.measurementReady = true;
      state.starting = false;
      renderCaptureMode(state.captureProfile);
      renderCameraControls(); updateDiagnostics();
      observePreviewSize(); startProcessingLoop();
      elements.videoPlaceholder.hidden = true;
      setCameraStatus(track.label || "Kamera běží","running");
      publish("camera-state");
    });
  } catch (error) {
    if (error.name === "CameraBusyError") {setControlStatus(error.message,true); return;}
    stopCamera();
    if (error.name !== "AbortError") setCameraStatus(error.name === "NotAllowedError"
      ? "Přístup ke kameře byl zamítnut." : `Chyba: ${error.message}`,"error");
  } finally {setRunningControls();}
}

export function stopCamera() {
  cameraOperations.cancel();
  state.session += 1;
  state.measurementReady = false; state.starting = false;
  stopProcessing();
  state.resizeObserver?.disconnect(); state.resizeObserver = null;
  stopStream(state.stream);
  Object.assign(state,{stream:null,track:null,capabilities:{},captureProfile:null,roi:null,dragStart:null,pendingRoi:null});
  invalidateMeasurement("Kamera byla zastavena.");
  elements.video.srcObject = null;
  elements.videoPlaceholder.hidden = false;
  elements.frameStatus.textContent = "–";
  elements.settingsOutput.textContent = "–"; elements.capabilitiesOutput.textContent = "–";
  elements.cameraControls.innerHTML = '<p class="hint">Nastavení se načte po spuštění kamery.</p>';
  elements.controlStatus.textContent = "";
  elements.roiOutput.textContent = "ROI: –";
  resetCaptureMode(); setCameraStatus("Kamera není spuštěna"); setRunningControls();
  clearOverlay(); drawPlot(); publish("camera-state");
}

function renderCameraControls() {
  elements.cameraControls.replaceChildren();
  const settings = state.track.getSettings();
  let count = 0;

  for (const [name, label] of NUMERIC_CONTROLS) {
    const capability = name === "exposureTime" ? measurementExposureRange() : state.capabilities[name];
    if (!capability || typeof capability.min !== "number" || typeof capability.max !== "number") continue;
    elements.cameraControls.append(createNumericControl(name, label, capability, settings[name]));
    count += 1;
  }

  if (!count) {
    elements.cameraControls.innerHTML = '<p class="hint">Prohlížeč nezpřístupnil žádné nastavitelné parametry.</p>';
  }
  setRunningControls(true);
}

function createNumericControl(name, labelText, capability, value) {
  const row = document.createElement("div");
  row.className = "camera-control";
  const label = document.createElement("label");
  label.htmlFor = `control-${name}`;
  label.textContent = labelText;
  const range = document.createElement("input");
  Object.assign(range, {
    id: `control-${name}`,
    type: "range",
    min: String(capability.min),
    max: String(capability.max),
    step: String(capability.step ?? 1),
    value: String(value ?? capability.min),
  });
  range.dataset.cameraControl = name;
  const number = document.createElement("input");
  Object.assign(number, { type: "number", min: range.min, max: range.max, step: range.step, value: range.value });
  range.addEventListener("input", () => { number.value = range.value; });
  range.addEventListener("change", () => applyTrackConstraint(name, Number(range.value)));
  number.addEventListener("change", () => {
    const next = clamp(toFiniteNumber(number.value, Number(range.value)), Number(range.min), Number(range.max));
    range.value = number.value = String(next);
    applyTrackConstraint(name, next);
  });
  row.append(label, range, number);
  return row;
}

export async function applyTrackConstraint(name,value) {
  const track = state.track;
  if (!state.measurementReady || !Number.isFinite(value) || !NUMERIC_CONTROLS.some(([key])=>key===name)) return;
  try {
    await cameraOperations.run("manual",async ({signal}) => {
      const range = name === "exposureTime" ? measurementExposureRange() : state.capabilities[name];
      if (!range) throw new Error("Parametr není dostupný.");
      const requested = quantize(value,range);
      setControlStatus(`Nastavuji ${name}…`);
      await applyImageConstraints(track,{[name]:requested},signal);
      await settleCamera(track,signal);
      if (track !== state.track || signal.aborted) throw abortError();
      updateDiagnostics(); syncControlValues(); setControlStatus(`${name}: ${requested}`);
    });
  } catch (error) {
    if (error.name !== "AbortError") setControlStatus(`Nelze nastavit ${name}: ${error.message}`,true);
  } finally {syncControlValues(); setRunningControls();}
}

function syncControlValues() {
  const settings = state.track?.getSettings() ?? {};
  for (const input of elements.cameraControls.querySelectorAll("[data-camera-control]")) {
    const value = settings[input.dataset.cameraControl];
    if (value === undefined) continue;
    input.value = String(value);
    if (input.type === "range" && input.nextElementSibling?.type === "number") {
      input.nextElementSibling.value = String(value);
    }
  }
}

export function updateDiagnostics() {
  if (!state.track) return;
  elements.settingsOutput.textContent = JSON.stringify(state.track.getSettings(), null, 2);
  elements.capabilitiesOutput.textContent = JSON.stringify(state.capabilities, null, 2);
}
