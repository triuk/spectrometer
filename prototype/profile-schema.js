const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const integer = value => Number.isSafeInteger(value);
const fail = message => { throw new Error(message); };

export function validateProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) fail('Profil není JSON objekt.');
  if (profile.schemaVersion !== 1) fail(`Nepodporovaná verze profilu: ${profile.schemaVersion ?? '?'}.`);
  for (const key of ['id', 'name']) {
    if (typeof profile[key] !== 'string' || !profile[key].trim()) fail(`Profil nemá platné ${key}.`);
  }
  const camera = profile.camera;
  if (!camera || ![camera.width, camera.height].every(value => integer(value) && value > 0)
      || !positive(camera.frameRate) || typeof camera.labelContains !== 'string') fail('Profil nemá platný režim kamery.');
  if (typeof profile.sensorOrientation?.flipX !== 'boolean') fail('Profil nemá platnou orientaci senzoru.');
  const roi = profile.roi;
  if (!roi || ![roi.x, roi.y, roi.width, roi.height].every(integer)
      || roi.x < 0 || roi.y < 0 || roi.width < 1 || roi.height < 1
      || roi.x + roi.width > camera.width || roi.y + roi.height > camera.height
      || roi.coordinateSystem !== 'spectral') fail('ROI musí ležet uvnitř senzoru a používat spektrální souřadnice.');
  const calibration = profile.calibration;
  if (calibration?.model !== 'linear' || !Array.isArray(calibration.points) || calibration.points.length !== 2) {
    fail('Lineární kalibrace musí obsahovat právě dva body.');
  }
  const mode = calibration.captureMode ?? camera;
  if (![mode.width, mode.height].every(value => integer(value) && value > 0)) fail('Neplatný režim kalibrace.');
  for (const point of calibration.points) {
    if (!point || !finite(point.pixel) || point.pixel < 0 || point.pixel > mode.width - 1
        || !positive(point.wavelengthNm)) fail('Kalibrační bod nemá platný pixel nebo vlnovou délku.');
  }
  const [first, second] = calibration.points;
  if (first.pixel === second.pixel || first.wavelengthNm === second.wavelengthNm) fail('Kalibrační body musí mít odlišné pixely i vlnové délky.');
  if (calibration.valid !== undefined && typeof calibration.valid !== 'boolean') fail('Neplatný stav kalibrace.');
  const settings = profile.cameraSettings ?? {};
  for (const key of ['whiteBalance', 'exposureMax']) {
    if (settings[key] !== undefined && !positive(settings[key])) fail(`Neplatná hodnota ${key}.`);
  }
  for (const key of ['brightness', 'contrast', 'saturation', 'sharpness']) {
    if (settings[key] !== undefined && !finite(settings[key])) fail(`Neplatná hodnota ${key}.`);
  }
  const optimizer = profile.exposureOptimization;
  if (optimizer) {
    if (!['generic', 'piecewise-monotonic'].includes(optimizer.model)) fail('Nepodporovaný expoziční model.');
    if (optimizer.model === 'piecewise-monotonic' && !positive(optimizer.discontinuityPeriod)) fail('Neplatná perioda expozičních úseků.');
    if (optimizer.discontinuityOrigin !== undefined && !finite(optimizer.discontinuityOrigin)) fail('Neplatný počátek expozičních úseků.');
    const fresh = optimizer.freshFrames ?? 5;
    const sample = optimizer.sampleFrames ?? 3;
    if (!integer(fresh) || fresh < 3 || fresh > 60 || !integer(sample) || sample < 1 || sample > fresh) fail('Neplatný počet snímků optimalizace.');
  }
  return profile;
}

export function normaliseProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) || profile.schemaVersion !== 1) return validateProfile(profile);
  const result = structuredClone(profile);
  const width = result.camera?.width;
  if (result.sensorOrientation === undefined) {
    if (!Number.isSafeInteger(width) || width < 1) fail('Migrace starého profilu vyžaduje platnou šířku senzoru.');
    result.sensorOrientation = { flipX: true };
    if (Array.isArray(result.calibration?.points)) {
      result.calibration.points = result.calibration.points.map(point => ({...point, pixel: width - 1 - point.pixel}));
    }
  }
  if (result.roi && result.roi.coordinateSystem === undefined) {
    if (result.sensorOrientation.flipX) result.roi.x = width - result.roi.x - result.roi.width;
    result.roi.coordinateSystem = 'spectral';
  }
  if (result.display && Object.hasOwn(result.display, 'reverseSpectrum')) {
    delete result.display.reverseSpectrum;
    if (!Object.keys(result.display).length) delete result.display;
  }
  if (result.calibration && !result.calibration.captureMode) {
    result.calibration.captureMode = {width: result.camera?.width, height: result.camera?.height};
  }
  return validateProfile(result);
}
