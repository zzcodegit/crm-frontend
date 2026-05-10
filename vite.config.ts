import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version?: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version ?? "0"),
  },
  plugins: [tailwindcss(), react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["mosoptika-study.ru", "www.mosoptika-study.ru"],
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
});
