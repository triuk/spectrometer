const SETTING_KEYS = ['deviceId','width','height','frameRate','resizeMode','exposureMode','exposureTime','whiteBalanceMode','colorTemperature','brightness','contrast','saturation','sharpness'];
export function measurementKey(context) {
  return JSON.stringify({session:context.session,profile:context.instrumentProfile?.id,
    camera:context.cameraLabel,captureMode:context.captureMode,roi:context.roi,
    flipX:context.sensorOrientation.flipX,
    settings:SETTING_KEYS.map(key=>[key,context.cameraSettings[key] ?? null]),
  });
}
