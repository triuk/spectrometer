import { installSoftwareAutoExposure } from "./software-auto-exposure.js";
import { installSoftwareAutoStart } from "./software-auto-start.js";

const href = new URL("./image-settings-layout.css", import.meta.url).href;

if (!document.querySelector(`link[href="${href}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

installSoftwareAutoExposure();
installSoftwareAutoStart();
