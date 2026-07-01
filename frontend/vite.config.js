var _a;
/// <reference types="vitest" />
import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
export default defineConfig({
    plugins: [
        react(),
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
            "/api": (_a = process.env.BACKEND_URL) !== null && _a !== void 0 ? _a : "http://localhost:3000"
        }
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: function (id) {
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
