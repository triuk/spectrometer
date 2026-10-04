import {elements,state,setRunningControls} from './core.js';
import {events} from './events.js';
import {cameraOperations} from './camera-operations.js';
import {updateDiagnostics} from './camera.js';
export function installImageSettingsControls() {
  elements.manualModeButton.hidden = true;
  elements.autoModeButton.textContent = 'Optimalizovat expozici (SW)';
  elements.autoModeButton.parentElement.removeAttribute('role');
  elements.autoModeButton.parentElement.setAttribute('aria-label','Softwarová optimalizace expozice');
  const help = document.querySelector('#imageSettingsHelp');
  help.textContent = 'Kamera měří v pevném ručním režimu podle profilu. Jednorázová optimalizace mění pouze expozici. Změna expozice nebo vyvážení bílé zruší zachycené pozadí a dosavadní průměr.';
  const sync = () => {
    setRunningControls();
    elements.imageSettingsState.textContent = state.starting ? 'Spouštím…'
      : state.measurementReady ? cameraOperations.active ? 'Probíhá operace…' : 'Ruční měření'
        : 'Kamera není spuštěna';
    const settings = state.track?.getSettings() ?? {};
    for (const input of elements.cameraControls.querySelectorAll('[data-camera-control]')) {
      if (document.activeElement === input || document.activeElement === input.nextElementSibling) continue;
      const value = settings[input.dataset.cameraControl];
      if (value === undefined) continue;
      input.value = String(value);
      if (input.nextElementSibling?.type === 'number') input.nextElementSibling.value = String(value);
    }
    updateDiagnostics();
  };
  for (const type of ['camera-state','camera-settings','camera-operation']) events.addEventListener(type,sync);
  sync();
}
