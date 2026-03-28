import fs from "fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const httpsEnabled = env.VITE_ENABLE_HTTPS === "true";
  const keyPath =
    env.VITE_SSL_KEY_PATH || path.resolve(process.cwd(), "../certs/localhost-key.pem");
  const certPath =
    env.VITE_SSL_CERT_PATH || path.resolve(process.cwd(), "../certs/localhost.pem");
  const proxyTarget =
    env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:3000";
  const hasHttpsCerts =
    httpsEnabled &&
    Boolean(keyPath) &&
    Boolean(certPath) &&
    fs.existsSync(keyPath) &&
    fs.existsSync(certPath);

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      https: hasHttpsCerts
        ? {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
          }
        : false,
      proxy: {
        "/socket.io": {
          target: proxyTarget,
          ws: true,
          secure: proxyTarget.startsWith("https://") ? false : undefined,
          changeOrigin: true,
        },
      },
    },
  };
});
