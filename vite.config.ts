import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@dimforge/rapier3d-compat": fileURLToPath(
        new URL("./node_modules/@dimforge/rapier3d-compat/rapier.es.js", import.meta.url)
      )
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  }
});
