const AUTO_VALUE_TEXT = "Řídí kamera · skutečná hodnota není dostupná";

let scheduled = false;

function updateAutomaticReadout() {
  scheduled = false;

  const autoButton = document.querySelector("#autoModeButton");
  const panel = document.querySelector(".automatic-image-readout");
  if (!autoButton || !panel || autoButton.getAttribute("aria-pressed") !== "true") return;

  const note = panel.querySelector(".automatic-image-note");
  if (note) {
    note.textContent = "Automatický režim je aktivní. Ovladač v tomto režimu nezpřístupňuje skutečný expoziční čas ani teplotu bílé.";
  }

  for (const output of panel.querySelectorAll("[data-auto-readout]")) {
    if (output.textContent !== AUTO_VALUE_TEXT) output.textContent = AUTO_VALUE_TEXT;
  }
}

function scheduleUpdate() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(updateAutomaticReadout);
}

export function installAutoReadoutClarity() {
  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["aria-pressed"],
    childList: true,
    characterData: true,
    subtree: true,
  });

  scheduleUpdate();
}
