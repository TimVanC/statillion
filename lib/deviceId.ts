/** Anonymous device id persisted in localStorage. */

const KEY = "statillion-device-id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage unavailable (private mode): session-scoped fallback.
    return "ephemeral-" + Math.random().toString(36).slice(2);
  }
}
