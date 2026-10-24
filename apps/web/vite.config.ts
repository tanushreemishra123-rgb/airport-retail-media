import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The built SPA is served by the Fastify backend in production (single service,
// single public URL). In dev, Vite proxies API + WebSocket to the backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
