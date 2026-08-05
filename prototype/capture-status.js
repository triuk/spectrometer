const TARGET_CAMERA_LABEL = /USB-ZH/i;

function readFrameRate(text) {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

function formatFramePeriod(frameRate) {
  if (!Number.isFinite(frameRate) || frameRate <= 0) return null;
  const milliseconds = 1000 / frameRate;
  return Number.isInteger(milliseconds)
    ? String(milliseconds)
    : milliseconds.toFixed(milliseconds < 100 ? 1 : 0);
}

function isOptimalMode(cameraName, resolution, frameRate) {
  return TARGET_CAMERA_LABEL.test(cameraName)
    && resolution.replaceAll(" ", "") === "1920×1080"
    && frameRate !== null
    && Math.abs(frameRate - 5) < 0.15;
}

export function installCaptureStatusCorrection() {
  const panel = document.querySelector("#captureModeStatus");
  const badge = document.querySelector("#captureModeBadge");
  const cameraName = document.querySelector("#captureCameraName");
  const resolution = document.querySelector("#captureResolution");
  const frameRate = document.querySelector("#captureFrameRate");

  if (!panel || !badge || !cameraName || !resolution || !frameRate) return;

  let scheduled = false;
  let updating = false;

  const update = () => {
    scheduled = false;
    if (updating || cameraName.textContent === "–") return;

    const fps = readFrameRate(frameRate.textContent);
    const period = formatFramePeriod(fps);
    const optimal = isOptimalMode(cameraName.textContent, resolution.textContent, fps);
    const nextClass = `capture-mode capture-mode-${optimal ? "optimal" : "fallback"}`;
    const nextBadge = optimal ? "Optimální" : "Fallback";
    const nextFrameText = fps === null
      ? "Nezjištěno"
      : `${fps.toFixed(fps % 1 ? 2 : 0)} fps${period ? ` · ${period} ms/snímek` : ""}`;
    const nextAriaLabel = optimal
      ? "Optimální režim snímání. Podrobnosti zobrazíte najetím myší nebo zaměřením klávesnicí."
      : "Náhradní režim snímání. Podrobnosti zobrazíte najetím myší nebo zaměřením klávesnicí.";

    updating = true;
    if (panel.className !== nextClass) panel.className = nextClass;
    if (badge.textContent !== nextBadge) badge.textContent = nextBadge;
    if (frameRate.textContent !== nextFrameText) frameRate.textContent = nextFrameText;
    if (panel.hasAttribute("title")) panel.removeAttribute("title");
    if (panel.getAttribute("aria-label") !== nextAriaLabel) {
      panel.setAttribute("aria-label", nextAriaLabel);
    }
    updating = false;
  };

  const scheduleUpdate = () => {
    if (scheduled || updating) return;
    scheduled = true;
    queueMicrotask(update);
  };

  new MutationObserver(scheduleUpdate).observe(panel, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });

  update();
}
