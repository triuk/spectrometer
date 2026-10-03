export const CHANNELS = ['red', 'green', 'blue', 'luminance'];
export const rawToSpectralPixel = (pixel, width, flipX) => flipX ? width - 1 - pixel : pixel;
export function transformRoi(roi, width, flipX) {
  return {...roi, x: flipX ? width - roi.x - roi.width : roi.x};
}
export function linearCalibration(points) {
  if (!Array.isArray(points) || points.length !== 2) return null;
  const [a, b] = points;
  if (![a.pixel, b.pixel, a.wavelengthNm, b.wavelengthNm].every(Number.isFinite)
      || a.pixel === b.pixel || a.wavelengthNm === b.wavelengthNm
      || a.wavelengthNm <= 0 || b.wavelengthNm <= 0) return null;
  const slope = (b.wavelengthNm - a.wavelengthNm) / (b.pixel - a.pixel);
  return {slope, intercept: a.wavelengthNm - slope * a.pixel};
}
export function extractSpectrum(data, width, height) {
  const result = Object.fromEntries(CHANNELS.map(name => [name, new Float32Array(width)]));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const r = data[offset], g = data[offset + 1], b = data[offset + 2];
      result.red[x] += r;
      result.green[x] += g;
      result.blue[x] += b;
      result.luminance[x] += 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  for (const values of Object.values(result)) for (let x = 0; x < width; x++) values[x] /= height;
  return result;
}
export function averageSpectra(history) {
  if (!history.length) return null;
  const width = history[0].luminance.length;
  const result = Object.fromEntries(CHANNELS.map(name => [name, new Float32Array(width)]));
  for (const spectrum of history) {
    for (const name of CHANNELS) {
      if (spectrum[name].length !== width) throw new Error('Nelze průměrovat spektra různé šířky.');
      for (let x = 0; x < width; x++) result[name][x] += spectrum[name][x];
    }
  }
  for (const values of Object.values(result)) for (let x = 0; x < width; x++) values[x] /= history.length;
  return result;
}
export function subtractSpectrum(spectrum, dark) {
  if (!spectrum || !dark || CHANNELS.some(name => dark[name]?.length !== spectrum[name]?.length)) return spectrum;
  return Object.fromEntries(CHANNELS.map(name => [name,
    Float32Array.from(spectrum[name], (value, index) => Math.max(0, value - dark[name][index])),
  ]));
}
export function calibrationMatchesMode(calibration, width, height) {
  return calibration?.valid !== false && calibration?.captureMode?.width === width
    && calibration?.captureMode?.height === height;
}
export function spectrumCsv(spectrum, metadata) {
  const {roi, captureMode, sensorOrientation, calibration} = metadata;
  const flip = sensorOrientation.flipX;
  const count = spectrum.luminance.length;
  const lines = [`# metadata=${JSON.stringify(metadata)}`, 'roi_pixel,sensor_pixel,raw_sensor_pixel,wavelength_nm,red,green,blue,luminance'];
  for (let outputIndex = 0; outputIndex < count; outputIndex++) {
    const index = flip ? count - 1 - outputIndex : outputIndex;
    const raw = roi.x + index;
    const pixel = rawToSpectralPixel(raw, captureMode.width, flip);
    const nm = calibration ? calibration.slope * pixel + calibration.intercept : null;
    lines.push([outputIndex, pixel, raw, nm === null ? '' : nm.toFixed(6),
      ...CHANNELS.map(name => spectrum[name][index].toFixed(6))].join(','));
  }
  return lines.join('\n');
}
