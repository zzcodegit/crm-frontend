import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["mosoptika-study.ru", "www.mosoptika-study.ru"],
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
});
