import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // base relativa: o build sai como pasta estatica que funciona em qualquer subcaminho
  // (GitHub Pages /repo/, Netlify raiz, file://). Troque para "/" se for servir da raiz de um dominio.
  base: "/aureumro-db/",
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1200,
  },
});
