const IMAGE_CAPTURE_KEYS = new Set([
  "exposureMode",
  "exposureTime",
  "whiteBalanceMode",
  "colorTemperature",
  "brightness",
  "contrast",
  "saturation",
  "sharpness",
  "focusMode",
  "focusDistance",
  "pan",
  "tilt",
  "zoom",
  "torch",
]);

const STREAM_FORMAT_KEYS = new Set([
  "width",
  "height",
  "frameRate",
  "aspectRatio",
  "resizeMode",
]);

function sanitizeConstraintSet(constraints) {
  if (!constraints || typeof constraints !== "object" || Array.isArray(constraints)) return constraints;

  const keys = Object.keys(constraints);
  const hasImageCaptureConstraint = keys.some((key) => IMAGE_CAPTURE_KEYS.has(key));
  const hasStreamFormatConstraint = keys.some((key) => STREAM_FORMAT_KEYS.has(key));

  if (!hasImageCaptureConstraint || !hasStreamFormatConstraint) return constraints;

  const sanitized = { ...constraints };
  for (const key of STREAM_FORMAT_KEYS) delete sanitized[key];
  return sanitized;
}

function manualModeValue(value) {
  if (value === "continuous") return "manual";
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const converted = { ...value };
  if (converted.exact === "continuous") converted.exact = "manual";
  if (converted.ideal === "continuous") converted.ideal = "manual";
  return converted;
}

function keepSoftwareManagedCameraManual(constraints) {
  if (!constraints || typeof constraints !== "object" || Array.isArray(constraints)) return constraints;
  if (!document.documentElement.dataset.softwareAutoExposure) return constraints;

  const converted = { ...constraints };
  if ("exposureMode" in converted) converted.exposureMode = manualModeValue(converted.exposureMode);
  if ("whiteBalanceMode" in converted) converted.whiteBalanceMode = manualModeValue(converted.whiteBalanceMode);
  return converted;
}

function prepareConstraintSet(constraints) {
  return keepSoftwareManagedCameraManual(sanitizeConstraintSet(constraints));
}

const prototype = globalThis.MediaStreamTrack?.prototype;
const originalApplyConstraints = prototype?.applyConstraints;

if (prototype && originalApplyConstraints && !originalApplyConstraints.__spectrometerCompatibilityPatch) {
  function applyCompatibleConstraints(constraints = {}) {
    let prepared = prepareConstraintSet(constraints);

    if (Array.isArray(prepared?.advanced)) {
      prepared = {
        ...prepared,
        advanced: prepared.advanced.map(prepareConstraintSet),
      };
    }

    return originalApplyConstraints.call(this, prepared);
  }

  Object.defineProperty(applyCompatibleConstraints, "__spectrometerCompatibilityPatch", {
    value: true,
  });

  prototype.applyConstraints = applyCompatibleConstraints;
}
