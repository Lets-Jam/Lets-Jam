function getBrowserSocketUrl() {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:3000";
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3000`;
}

export function resolveSocketUrl() {
  return import.meta.env.VITE_SOCKET_URL || getBrowserSocketUrl();
}
