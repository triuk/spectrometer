import {state} from './core.js';
import {publish} from './events.js';
import {abortable, abortError} from './camera-operations.js';
import {clearDarkSpectrum, clearProcessingState} from './spectrum.js';
export {quantize} from "./exposure-model.js";
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
  await abortable(track.applyConstraints({advanced:[values]}),signal);
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
}
