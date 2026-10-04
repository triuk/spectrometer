import {waitForVideoFrame} from "./video-frames.js";
import {elements,state} from './core.js';
import {publish} from './events.js';
import {abortable, abortError} from './camera-operations.js';
import {clearDarkSpectrum, clearProcessingState} from './spectrum.js';
import {quantize} from "./exposure-model.js";
export {quantize};
export function measurementExposureRange() {
  const range = state.capabilities.exposureTime;
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return null;
  const limit = state.instrumentProfile?.cameraSettings?.exposureMax ?? 1800;
  const step = range.step || 1;
  const max = range.min + Math.floor((Math.min(range.max,limit)-range.min)/step)*step;
  return max < range.min ? null : {...range,step,max};
}
export async function applyImageConstraints(track, values, signal) {
  if (!track || track !== state.track || signal?.aborted) throw abortError();
  if (['width','height','frameRate','aspectRatio','resizeMode'].some(key => key in values)) {
    throw new Error('Formát snímání musí být nastaven odděleně od obrazových parametrů.');
  }
  if (values.exposureMode === 'continuous' || values.whiteBalanceMode === 'continuous') {
    throw new Error('Měření vyžaduje pevný ruční režim.');
  }
  const before = track.getSettings();
  if (Object.entries(values).some(([key,value]) => before[key] !== value)) {
    clearProcessingState();
    if (state.darkSpectrum) clearDarkSpectrum();
  }
  let applying = false;
  try {
    const request = track.applyConstraints({advanced:[values]});
    applying = true;
    const pending = Promise.resolve(request).finally(() => {applying = false;});
    await abortable(pending,signal);
    if (track !== state.track || signal?.aborted) throw abortError();
    const settings = track.getSettings();
    for (const [key,value] of Object.entries(values)) {
      const actual = settings[key];
      const tolerance = Math.max((state.capabilities[key]?.step ?? 1)/2,0.01);
      if (actual === undefined || (typeof value === 'number' ? !Number.isFinite(actual) || Math.abs(actual-value)>tolerance : actual !== value)) {
        throw new Error(`Kamera nepotvrdila ${key}=${value}; hlásí ${actual ?? '?'}.`);
      }
    }
    publish('camera-settings',settings);
    return settings;
  } catch (error) {
    if (track === state.track) {
      if (error.name !== 'AbortError') publish('capture-error',error);
      else if (applying) {
        // applyConstraints has no native cancellation. Closing the track
        // prevents its late completion from overwriting restored settings.
        publish('capture-error',new Error('Změna nastavení kamery byla přerušena. Spusťte kameru znovu.'));
      }
    }
    throw error;
  }
}

export async function settleCamera(track, signal) {
  const count = state.instrumentProfile?.exposureOptimization?.freshFrames ?? 5;
  try {
    for (let index=0;index<count;index++) {
      await waitForVideoFrame(elements.video,{signal,track});
      if (track !== state.track || signal?.aborted) throw abortError();
    }
  } catch (error) {
    if (error.name !== 'AbortError' && track === state.track) publish('capture-error',error);
    throw error;
  }
}
export async function configureMeasurementCamera(profile, signal) {
  const values = {};
  for (const name of ['exposureMode','whiteBalanceMode']) {
    const modes = state.capabilities[name];
    if (Array.isArray(modes)) {
      if (!modes.includes('manual')) throw new Error(`Kamera nepodporuje ruční ${name}.`);
      values[name] = 'manual';
    }
  }
  const settings = profile.cameraSettings ?? {};
  const fixed = {colorTemperature:settings.whiteBalance ?? 4600,brightness:settings.brightness ?? 0,
    contrast:settings.contrast ?? 32,saturation:settings.saturation ?? 50,sharpness:settings.sharpness ?? 1};
  for (const [name,value] of Object.entries(fixed)) {
    const range = state.capabilities[name];
    if (range && Number.isFinite(range.min) && Number.isFinite(range.max)) values[name] = quantize(value,range);
  }
  const range = measurementExposureRange();
  if (range) values.exposureTime = quantize(state.track.getSettings().exposureTime ?? range.min,range);
  if (!Object.keys(values).length) throw new Error('Kamera neposkytuje ruční nastavení obrazu.');
  const actual = await applyImageConstraints(state.track,values,signal);
  for (const name of ['exposureMode','whiteBalanceMode']) {
    if (actual[name] !== undefined && actual[name] !== 'manual') {
      throw new Error(`Kamera hlásí ${name}=${actual[name]}; měření vyžaduje ruční režim.`);
    }
  }
  return actual;
}
