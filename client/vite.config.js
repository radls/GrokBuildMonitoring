import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiPort = Number(process.env.PORT) || 3847;

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  define: {
    __API_PORT__: JSON.stringify(apiPort),
  },
  build: {
    outDir: path.resolve(__dirname, "../dist"),
    emptyOutDir: true,
  },
  server: {
    // 5173 is often used by other local Vite apps (e.g. Aetherion)
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
