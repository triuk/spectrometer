const TARGET_CAMERA_LABEL = /USB-ZH/i;

function readFrameRate(text) {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : null;
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

  const update = () => {
    scheduled = false;
    if (cameraName.textContent === "–") return;

    const optimal = isOptimalMode(
      cameraName.textContent,
      resolution.textContent,
      readFrameRate(frameRate.textContent),
    );
    const nextClass = `capture-mode capture-mode-${optimal ? "optimal" : "fallback"}`;
    const nextBadge = optimal ? "Optimální" : "Fallback";
    const nextTitle = optimal
      ? "Kamera běží v cílovém režimu 1920 × 1080 při 5 fps."
      : "Skutečný režim neodpovídá cílové kameře, rozlišení nebo FPS.";

    if (panel.className !== nextClass) panel.className = nextClass;
    if (badge.textContent !== nextBadge) badge.textContent = nextBadge;
    if (panel.title !== nextTitle) panel.title = nextTitle;
  };

  const scheduleUpdate = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(update);
  };

  new MutationObserver(scheduleUpdate).observe(panel, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    characterData: true,
    subtree: true,
  });

  update();
}
