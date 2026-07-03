/// <reference types="vitest" />
import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    // Bygger bara bundle-rapporten när man uttryckligen ber om den (ANALYZE=true npm run build).
    // Körde tidigare på varje bygge — lade dist/bundle-report.html i dist/, som Lighthouse CI:s
    // static-dist-dir-autodiscovery av misstag testade som en riktig app-sida (fick 0 i poäng
    // på LCP/animations-mätningar som inte är meningsfulla för en treemap-visualisering).
    process.env.ANALYZE === "true" &&
      visualizer({
        filename: "dist/bundle-report.html",
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
        open: false,
      }),
  ],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    host: true,
    proxy: {
      "/api": process.env.BACKEND_URL ?? "http://localhost:3000"
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "vendor";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "icons";
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  }
});
