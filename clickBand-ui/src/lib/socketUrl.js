function getBrowserSocketUrl() {
  if (typeof window === "undefined") {
    return "https://127.0.0.1:5173";
  }

  return window.location.origin;
}

export function resolveSocketUrl() {
  return import.meta.env.VITE_SOCKET_URL || getBrowserSocketUrl();
}
