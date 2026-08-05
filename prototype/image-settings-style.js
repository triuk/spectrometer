import { installExposureLimit } from "./exposure-limit.js";
import { installExposureOptimizer } from "./exposure-optimizer.js";
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

// Nejdřív omezíme měřicí rozsah expozice na 1800 (180 ms). Optimalizátor
// i ruční ovladače pak pracují se stejným bezpečným horním limitem.
installExposureLimit();

// Optimalizátor se instaluje před starší obsluhou tlačítka, aby jeho capture
// listener nahradil monotónní algoritmus z measurement-camera-mode.js.
installExposureOptimizer();
installMeasurementCameraMode();
