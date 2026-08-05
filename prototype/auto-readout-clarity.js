const AUTO_VALUE_TEXT = "Řídí kamera · skutečná hodnota není dostupná";
const AUTO_NOTE_TEXT = "Automatický režim je aktivní. Ovladač v tomto režimu nezpřístupňuje skutečný expoziční čas ani teplotu bílé.";

export function installAutoReadoutClarity() {
  const autoButton = document.querySelector("#autoModeButton");
  const panel = document.querySelector(".automatic-image-readout");
  if (!autoButton || !panel) return;

  let scheduled = false;
  let updating = false;

  const update = () => {
    scheduled = false;
    if (updating
        || document.documentElement.dataset.softwareAutoExposure === "active"
        || autoButton.getAttribute("aria-pressed") !== "true") return;

    updating = true;

    const note = panel.querySelector(".automatic-image-note");
    if (note && note.textContent !== AUTO_NOTE_TEXT) {
      note.textContent = AUTO_NOTE_TEXT;
    }

    for (const output of panel.querySelectorAll("[data-auto-readout]")) {
      if (output.textContent !== AUTO_VALUE_TEXT) {
        output.textContent = AUTO_VALUE_TEXT;
      }
    }

    updating = false;
  };

  const scheduleUpdate = () => {
    if (scheduled || updating) return;
    scheduled = true;
    queueMicrotask(update);
  };

  new MutationObserver(scheduleUpdate).observe(autoButton, {
    attributes: true,
    attributeFilter: ["aria-pressed"],
  });

  new MutationObserver(scheduleUpdate).observe(panel, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  update();
}
