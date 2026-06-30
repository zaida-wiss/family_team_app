import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
/// <reference types="vitest" />

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000"
    }
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  }
});
