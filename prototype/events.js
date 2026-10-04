export const events = new EventTarget();
export function publish(type, detail) {
  events.dispatchEvent(new CustomEvent(type, {detail}));
}
