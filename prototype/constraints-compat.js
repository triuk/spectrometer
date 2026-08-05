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

const prototype = globalThis.MediaStreamTrack?.prototype;
const originalApplyConstraints = prototype?.applyConstraints;

if (prototype && originalApplyConstraints && !originalApplyConstraints.__spectrometerCompatibilityPatch) {
  function applyCompatibleConstraints(constraints = {}) {
    let sanitized = sanitizeConstraintSet(constraints);

    if (Array.isArray(sanitized?.advanced)) {
      sanitized = {
        ...sanitized,
        advanced: sanitized.advanced.map(sanitizeConstraintSet),
      };
    }

    return originalApplyConstraints.call(this, sanitized);
  }

  Object.defineProperty(applyCompatibleConstraints, "__spectrometerCompatibilityPatch", {
    value: true,
  });

  prototype.applyConstraints = applyCompatibleConstraints;
}
