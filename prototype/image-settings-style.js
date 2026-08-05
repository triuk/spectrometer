import { installMeasurementCameraMode } from "./measurement-camera-mode.js";

const href = new URL("./image-settings-layout.css", import.meta.url).href;

if (!document.querySelector(`link[href="${href}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

// Kamera zůstává vždy v ručním měřicím režimu. Neexistuje přepínač
// Auto/Ručně; samostatné tlačítko pouze jednorázově optimalizuje expozici.
document.documentElement.dataset.softwareAutoExposure = "manual-measurement";

installMeasurementCameraMode();
