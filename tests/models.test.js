import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normaliseProfile, validateProfile} from '../prototype/profile-schema.js';
import {rawToSpectralPixel, transformRoi, linearCalibration, extractSpectrum, averageSpectra, subtractSpectrum, calibrationMatchesMode, spectrumCsv} from '../prototype/spectrum-model.js';
const profile = () => JSON.parse(readFileSync(new URL('../prototype/configs/lgs-default.json', import.meta.url)));
test('partial ROI and pixel coordinates round trip in both orientations', () => {
  for (const flip of [false, true]) {
    const roi = {x: 43, y: 10, width: 117, height: 4};
    assert.deepEqual(transformRoi(transformRoi(roi, 1920, flip), 1920, flip), roi);
    assert.equal(rawToSpectralPixel(rawToSpectralPixel(53, 1920, flip), 1920, flip), 53);
  }
});
test('built-in and legacy raw profiles migrate without losing orientation', () => {
  const modern = normaliseProfile(profile());
  assert.equal(modern.roi.x, 0);
  assert.deepEqual(modern.calibration.captureMode, {width: 1920, height: 1080});
  const legacy = profile(); delete legacy.sensorOrientation; delete legacy.roi.coordinateSystem;
  legacy.roi = {x: 20, y: 10, width: 100, height: 10};
  const migrated = normaliseProfile(legacy);
  assert.equal(migrated.roi.x, 1800);
  assert.equal(migrated.calibration.points[0].pixel, 1919);
  assert.deepEqual(normaliseProfile(migrated), migrated);
});
test('invalid dimensions, nulls, ROI, calibration and optimizer are rejected', () => {
  for (const mutate of [p => p.camera.width = -10, p => p.camera.frameRate = null,
    p => p.roi.x = -1, p => p.roi.width = 1921, p => p.roi.x = '0',
    p => p.calibration.points[1].pixel = 0, p => p.calibration.points[0].wavelengthNm = null,
    p => p.roi.coordinateSystem = 'unknown', p => p.exposureOptimization.freshFrames = 1000,
    p => p.exposureOptimization.sampleFrames = 10, p => p.exposureOptimization.discontinuityPeriod = 0,
    p => p.schemaVersion = 2, p => p.sensorOrientation.flipX = 'true']) {
    const candidate = profile(); mutate(candidate); assert.throws(() => normaliseProfile(candidate));
  }
  assert.equal(validateProfile(normaliseProfile(profile())).id, 'lgs-default');
});
test('RGB extraction, temporal mean and dark subtraction agree numerically', () => {
  const spectrum = extractSpectrum(Uint8ClampedArray.from([10,20,30,255,30,40,50,255,30,40,50,255,50,60,70,255]), 2, 2);
  assert.deepEqual(Array.from(spectrum.red), [20,40]);
  assert.equal(averageSpectra([spectrum, spectrum]).green[0], 30);
  assert.equal(subtractSpectrum(spectrum, spectrum).blue[1], 0);
  const narrow = extractSpectrum(Uint8ClampedArray.from([1,2,3,255]),1,1);
  assert.throws(() => averageSpectra([spectrum,narrow]), /šířky/);
});
test('calibration requires its capture dimensions; CSV preserves raw and spectral ROI', () => {
  const calibration = normaliseProfile(profile()).calibration;
  assert.ok(calibrationMatchesMode(calibration,1920,1080));
  assert.ok(!calibrationMatchesMode(calibration,1280,720));
  assert.equal(linearCalibration([{pixel:1,wavelengthNm:400},{pixel:1,wavelengthNm:700}]),null);
  const spectrum = extractSpectrum(Uint8ClampedArray.from([10,20,30,255,40,50,60,255]),2,1);
  const metadata = {roi:{x:3,y:0,width:2,height:1},captureMode:{width:10,height:1},sensorOrientation:{flipX:true},calibration:null};
  const rows = spectrumCsv(spectrum,metadata).split('\n');
  assert.equal(rows[2], '0,5,4,,40.000000,50.000000,60.000000,48.150002');
  assert.equal(rows[3].split(',')[1], '6');
});
